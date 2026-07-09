# Desire-Paths ABM — Performance & Memory Review

## 0. Architecture recap (so the findings are anchored)

**Mapping stage** (`triggerFastScan` → `runFastScanTask`/`runBuildR1Adjacency`/`runBuildMappingGraph`/`runVisibilityBearingTask`/`runMergeCellsTask`):
- AOI hexes (`viewHexes`, N cells) computed once.
- `buildR1Adjacency` builds a viewHexes-indexed r=1 CSR (one `gridRingUnsafe` pass).
- `runFastScanTask` shards features by vertex cost → `collectFastScanEntries` → `computeImpassableBlurSnapshot` (BFS over r1 CSR) → `runMergeCellsTask` (per-cell assembly).
- `runBuildMappingGraph` builds the index-space mapping graph (friction/lat-lng aligned).
- `runVisibilityBearingTask` shards origins → `computeVisibilityBearingCSRIndexed` → merged/packed into one CSR buffer (SAB when COI).
- Main thread `reconstructVisibilityBearing` rebuilds Proxy indices from the CSR.

**Simulation stage** (`computeDesirePaths` → `runGradientBatches` + `runAgentBatches`):
- Gradients: **parallel** across destinations (`runGradientBatches`, independent per target).
- Agent ABM: **single worker** (`runAgentBatches` → one `agent-batch` worker) to preserve shared `accumulatedFootprints` state.
- Worker kernel `getBestNextStep`/`runAgentPath` runs the true-ABM loop.

The code is already heavily optimized (CSR adjacency, Dial's, typed-array gradients, SAB transfer, LRU caches, pooled Dijkstra buffers, index-space visibility). The remaining wins are real but more surgical.

---

## 1. Simulation stage — performance

### S1. Hot-path string→index lookups dominate `getBestNextStep` (HIGHEST VALUE, HIGHEST RISK)
`agentTasks.js` `getBestNextStep` (and the main-thread twin in `compute.js`) iterate `disk = _getCachedDisk(curr, visionDepth)` — **cell-id strings** — and for every candidate call `getFriction(n)` → `graphFriction(graph, n)` → `graph.cellToIdx[n]` (a **string-keyed object read**), plus `_getCachedLatLng(n)` (another string→`cellToLatLng` cache), plus `bearingMap`/`getBearing` string lookups. At `visionDepth=15` the disk is ~721 cells and `getBestNextStep` runs millions of times → **hundreds of millions of string-map reads + lat/lng cache touches per city-scale run**.

The visibility CSR (`computeVisibilityBearingCSRIndexed`) already computes, per origin, exactly the set of visible cells within `visionDepth` **and their bearings**, in index space. The candidate set after `gatherCandidates`'s `isVisible` filter is a subset of that set. **Using the visibility CSR directly as the candidate disk lets the entire kernel run in pure index space**: `frictionArr[i]`, `affordanceArr[i]`, `gradient[i]`, and `bearing` are all O(1) typed-array reads; `gridDisk`, `cellToLatLng`, and string lookups vanish from the hot path.

- **Risk:** must be byte-identical to the current `gridDisk + isVisible` candidate set. The visibility BFS expands only through *passable* cells (mapping graph filters impassable), whereas `gridDisk` includes impassable cells (later dropped by `getFriction`). End result is the same *after* `gatherCandidates` filtering, but the boundary at exactly `visionDepth` and the corner-cut handling in `resolveStepLine` must be re-validated. **Gate this behind the existing `agentBatchParity` test + a new index-space-vs-string-kernel parity test before enabling.**
- **Plan:** add an index-space candidate path in `agentStep.js`/`agentTasks.js` that consumes `(visOffsets, visNeighbors, bearings, frictionArr, affArr, gradArr)`; keep the string path as fallback. This is the single biggest CPU win available.

### S2. Dial's bucket arrays allocated per target (LOW RISK, MEDIUM VALUE)
`dijkstra.js` `computeDijkstraDial` does `const buckets = new Array(B); for(...) buckets[i] = []` **every target** (line 360-361). With D destinations that's D×(B+1) array allocations (B≈47). Dijkstra is synchronous/single-threaded per module, so a **module-level pooled `buckets`** reset each call is safe:

```js
// module scope
let _dialBuckets = null;
function acquireDialBuckets(B) {
  if (!_dialBuckets || _dialBuckets.length < B) {
    _dialBuckets = new Array(B);
    for (let i = 0; i < B; i++) _dialBuckets[i] = [];
  }
  for (let i = 0; i < B; i++) _dialBuckets[i].length = 0; // reset, keep arrays
  return _dialBuckets;
}
```
Call `acquireDialBuckets(B)` at the top of `computeDijkstraDial` and use it instead of `new Array(B)` + per-bucket `[]`. Removes the dominant gradient-batch GC churn.

### S3. Worker temperature path allocates `new Array` per call (LOW RISK, MEDIUM VALUE at `temperature>0`)
`agentTasks.js` line 424: `const weightsArr = new Array(scores.length);` inside `getBestNextStep`, executed every tick when `temperature>0`. The main-thread twin already pools this as `ctx._candWeights` (`compute.js` line 1215). Mirror it in the worker with a module-level reused buffer (grow-only, like `_knScores`):

```js
let _knWeightsArr = null;
// in the temperature branch:
if (!_knWeightsArr || _knWeightsArr.length < scores.length) _knWeightsArr = new Float64Array(scores.length);
```

### S4. `affordanceEntries` not flattened for the agent worker (LOW RISK, MEDIUM VALUE)
`spatialWorker.js` `flattenPayloadAndTransfers` only flattens `payload.frictionEntries`. The agent-batch payload also carries `affordanceEntries` (N-entry plain object) which is **structured-cloned raw** to the worker (`runAgentBatches` → `runWorker('agent-batch', …)`). Extend the flattener to also pack `affordanceEntries` → `{__flat, keys, vals}` (SAB when COI), and have `normalizeFrictionEntries` already handle `__flat` for affordance. This removes one N-string clone per simulation run.

### S5. `accumulatedFootprints` shipped as an empty N-object (LOW RISK, MEDIUM VALUE)
`runAgentBatches` posts `accumulatedFootprints` (a fresh `Object.create(null)`, always empty at dispatch) and the worker fills it. It is cloned raw and is a string-keyed object in the hot ABM loop (`abmFootprints[cell] = …`). Since it starts empty and is never read on the main thread after the run, **let the worker own it as a `Float32Array(V)` indexed by `graph.cellToIdx`** (built once from `graph` at the top of `computeAgentBatch`, exactly like `_knAffordanceArr`). Drop it from the payload entirely. This removes a clone and makes footprint accumulation a typed-array write.

### S6. `getGradientGraph` N·log N `cells.sort()` (LOW RISK, MEDIUM VALUE, once per mapping gen)
`dijkstra.js` line 106 `cells.sort()` sorts N cell-id strings to make `cellToIdx`/`idxToCell` deterministic for cross-worker agreement. But the simulation path **always supplies `viewHexes` + `r1Adjacency`**. Iterating `viewHexes` in order and keeping only passable cells yields a deterministic, identical order on main thread, gradient worker, and agent worker (all call the same `getGradientGraph` with the same `viewHexes`/`frictionEntries`) — **with no sort**:

```js
if (useR1 && Array.isArray(viewHexes)) {
  for (let gi = 0; gi < viewHexes.length; gi++) {
    const c = viewHexes[gi];
    const f = getF(c);
    if (typeof f === 'number' && f < IMPASSABLE) cells.push(c);
  }
} else {
  for (let i = 0; i < cellKeys.length; i++) { /* passable */ cells.push(c); }
  cells.sort(); // legacy fallback only
}
```
Keep the `sort()` branch for the no-`viewHexes` legacy callers (`computeDijkstraGradientForLookup` without viewHexes). This drops an O(N log N) string-sort at city scale.

### S7. `originDestDistances` string-keyed table (LOW RISK, LOW-MED VALUE)
`precomputeOriginDestDistances` builds `"o::d" → gridDistance` (O(agents×destinations) string concats + H3 calls). For modest node counts it's fine, but it's cloned raw to the worker. Consider a `Map` or a flat `Float32Array` keyed by `(originIdx*D + destIdx)`. Low priority unless node counts are large.

---

## 2. Mapping stage — performance

### P1. `runMergeCellsTask` ships `cells` (N strings) + `multiEntries` (N objects) (MEDIUM RISK, MEDIUM VALUE)
`grid.js` posts the full `viewHexes` array (N H3 strings) plus `multiEntries` (N layer-map objects) to the merge worker. This is a large structured clone on every remap. The merge is O(N) and could run in **index space** like the visibility shards: ship `viewHexes` once (or pass `r1Adjacency` + the already-computed `cellFrictionEntries`/`blurUpdateMap` as typed arrays/CSR) and have the worker iterate `viewHexes` by index. Lower priority than S1 but a real clone cost at city scale.

### P2. `buildR1Adjacency` still does N `gridRingUnsafe` calls (LOW RISK, LOW-MED VALUE)
One H3 call per cell (N≈5e5). `gridRingUnsafe` is cheap, and this replaced the old 2× `gridDisk` passes, so it's already a win. Further optimization (precomputed neighbor offsets per resolution) is possible but low ROI; note only.

### P3. `collectFastScanEntries` per-polygon `polygonToCells` (already parallelized + cached)
LPT scheduling + `_polyCellsCache` are solid. No change needed; note that the cache is module-global and unbounded-ish (capped at `POLY_CELLS_CACHE_MAX=512`) — fine.

---

## 3. Memory footprint

### M1. Duplicate friction/affordance: `cellFrictionMap`/`affordanceMap` (Maps) **and** `_frictionObj`/`_affordanceObj` (plain objects) (MEDIUM VALUE)
`compute.js` lines 663-679 build `_frictionObj` and `_affordanceObj` as **full N copies** of the Maps at every sim start, and they live for the whole run. The worker already uses its own plain-object copy (unavoidable across the boundary). On the main thread, `_frictionObj`/`_affordanceObj` are only consumed by the **incremental APIs** (`_recomputeTargetContribs` etc.) and `updateAffordance`/`decayAffordance`. **Build them lazily only when an incremental op runs**, not unconditionally at `computeDesirePaths` start. This halves main-thread steady-state friction/affordance memory (N→~N/2 for those fields).

### M2. `getGradientGraph` `cellToIdx` plain object (N string keys) + `idxToCell` (N strings) (INHERENT, LARGE)
This is the biggest single sim structure (~500k string→int + 500k strings at city scale). It's required for `gradientGet`/`graphFriction` by cell id. A `Map` is similar cost. The real fix is S1 (index-space kernel) which lets the hot path avoid `cellToIdx` entirely; the graph then only needs `frictionArr`/`adjOffsets`/`adjNeighbors` (all typed). **S1 is also the memory fix here.**

### M3. Visibility/bearing Proxy indices hold N-entry `cellToIndex` Map + N `originCache` Proxies (MEDIUM VALUE)
`bearingIndex.js` `createVisibilityIndex` lazily creates one Proxy per accessed origin (up to N Proxies in `originCache`) plus a permanent N-entry `cellToIndex` Map. The main-thread kernel (`compute.js` `_getCachedVisibility`) uses these Proxies. If S1 lands, the main-thread kernel can read the CSR directly and the Proxy indices can be dropped from the main thread (keep only the raw CSR buffer, which is already retained as `_visibilityBearingCSR`). That removes N Proxies + the `cellToIndex` Map from main-thread memory.

### M4. `multiFrictionMap` N layer-map objects (INHERENT to feature)
Each cell holds a `{layer: cost}` object. This powers the draw-obstacle feature. If memory is critical, encode the (bounded, few) layer costs as a compact bit-packed integer per cell. **Only if profiling shows it's the bottleneck** — it's a feature requirement, so low priority.

### M5. `runAgentBatches` clones `gradients` (D Float32Arrays) to the worker (LOW-MED VALUE)
Gradients are computed in gradient workers, returned to main, then re-cloned to the agent worker. When COI/SAB is active, keep the gradient arrays SAB-backed end-to-end (gradient workers allocate SAB, main thread shares to agent worker) to avoid the memcpy. Minor vs. S1.

---

## 4. Parallelization risk (explicit — you warned about this)

**The code already gets this right, and it must stay that way:**
- **Agent ABM = single worker, by design** (`runAgentBatches` comment, lines 629-643). Splitting the `plan` across workers would give each worker an independent structured-clone of `accumulatedFootprints`, destroying the true-ABM feedback loop (emergent path formation). **Do NOT shard the agent plan.** This is the one place parallelization breaks dynamics.
- **Gradient batches = parallel** (independent per destination) — safe.
- **Fast-scan = parallel** (independent per geometry) — safe.
- **Visibility shards = parallel** (disjoint origin index sets, merged via prefix-sum) — safe.

**New risk introduced by S1:** moving the agent kernel to index-space using the visibility CSR changes *how* candidates are enumerated. As long as the resulting candidate set equals the current `gridDisk + isVisible` set, dynamics are preserved — but this must be proven by parity tests, not assumed. Keep the string-kernel path as the reference implementation and the index-kernel as an opt-in behind a flag until parity is locked.

---

## 5. Legacy / API cleanup (you granted latitude)

- **`computeDijkstraLegacy` + `MinHeap`** (`dijkstra.js` 563-605, `minheap.js`): only reached when no graph is supplied. Since M3 always builds the graph, this is dead code in production. Drop both (and the `getNeighbors` plumbing) unless a test relies on the no-graph path — if so, keep `MinHeap` only for that test.
- **Main-thread duplicate kernel** (`compute.js` `getBestNextStep`/`runSingleAgentPath`): only used by incremental APIs. Consider unifying it with `agentTasks.js` `getBestNextStep`/`runAgentPath` (extract a shared kernel that both the worker and incremental path call) to eliminate drift risk and halve maintenance. This is a refactor, not a perf win.
- **`bearingMap` legacy `Map` → `Object.fromEntries`** in `runAgentBatches` (line 556): only for test-era real `Map`s. Keep, but it's the only remaining `Object.fromEntries` of a potentially-large Map — fine for tests.
- **`DesireMap` Proxy** (`main.js`): clever but every state access routes through `get`/`set` traps. It's UI-only (not in the sim hot path), so leave it; note it as complexity debt, not a perf issue.

---

## 6. Prioritized implementation plan

**P0 — safe, high-ROI, do now (no dynamics risk):**
1. **S2** Pool Dial buckets (module-level, reset per target).
2. **S3** Pool worker `weightsArr` in temperature path (mirror `compute.js`).
3. **S4** Flatten `affordanceEntries` to SAB/AB in `flattenPayloadAndTransfers`.
4. **S5** Worker-owns `accumulatedFootprints` as `Float32Array(V)`; drop from payload.
5. **S6** Drop `cells.sort()` when `viewHexes` supplied in `getGradientGraph`.

**P1 — high value, needs parity tests:**
6. **S1** Index-space agent kernel consuming the visibility CSR (flag-gated; validate against `agentBatchParity` + new kernel-parity test).
7. **M1** Lazily build `_frictionObj`/`_affordanceObj` only for incremental APIs.
8. **M3** Drop main-thread Proxy visibility/bearing indices once S1 lands (keep raw CSR).

**P2 — deeper / lower ROI:**
9. **P1** Index-space `runMergeCellsTask` (avoid shipping N strings + N objects).
10. **M5/S5-gradients** SAB-end-to-end gradient arrays.
11. **S7** Typed `originDestDistances` matrix.
12. **Legacy** Drop `computeDijkstraLegacy`/`MinHeap`; unify the two `getBestNextStep` kernels.

---

## 7. Test adaptation notes

- **`agentBatchParity.test.js`** must continue to pass after S2/S3/S4/S5/S6 (these are behavior-preserving). Add a **new test** that runs the agent kernel in both string mode and index mode (once S1 lands) and asserts identical `pathDesire`/`perTargetContribs` for a non-trivial grid with obstacles and `temperature=0`.
- **`incrementalKernelParity` / `csrBearingIndex` / `mappingBuild` / `computeDesirePaths`** tests: S6 changes graph index assignment only when `viewHexes` is present — verify gradient values still match (they will, since order is deterministic and identical across callers). If any test passes `viewHexes` to one caller but not another, align them.
- **`spatialWorker.test.js` / `spatialTasks.test.js`**: S4/S5 change payload shapes (`affordanceEntries` becomes `__flat`; `accumulatedFootprints` removed) — update the mock payloads/assertions to the new transfer format (the `__flat` decoder in `normalizeAgentResult` already handles it; extend `normalizeFrictionEntries` for affordance `__flat`).

---

**Bottom line:** the pipeline is already well-engineered. The dominant remaining cost is the **string-keyed, lat/lng-cache, `gridDisk`-driven hot path in `getBestNextStep`** (S1) — fixing it via the already-computed visibility CSR is the highest-leverage change and is safe *only* behind parity tests. The P0 items (S2–S6) are low-risk, behavior-preserving wins you can land immediately. The agent-plan parallelization must remain single-worker; everything else (gradients, fast-scan, visibility shards) is already correctly parallel.