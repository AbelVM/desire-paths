I've now read the full pipeline (mapping stage: `grid.js` → `spatialTasks.js`/`spatialWorker.js` → `dijkstra.js`/`bearingIndex.js`; simulation stage: `compute.js` → `agentTasks.js`/`agentStep.js`; plus `map.js`/`ui.js` and the worker entry points + tests). The codebase is already heavily optimized (CSR adjacency, Dial's, SAB transfer, pooled buffers, index-space kernels, flat `__flat` transfer encoding). Below is a deep review of what *remains* — concrete, file/line-anchored findings and a prioritized implementation plan. I did not blindly rewrite; several items are safe local wins, others are strategic refactors that need the test suite (`agentBatchParity`, `indexedKernelParity`, `computeDesirePaths`, `mappingBuild`, `integration`) to be adapted.

---

## 1. Simulation stage — the highest-value findings

### 1.1 Footprints MUST be shared globally — single-worker is required (CORRECTED)
**Correction (review follow-up):** agents must share footprints across the *entire* simulation, not per pair. The intended semantics (and the `compute.js:417-421` comment) are a single global shared footprint: "all agents in this simulation see each other's positions." The original draft of this review misread `agentTasks.js:878` (where `abmFootprints` was allocated **inside** the `for idx` loop) as evidence that pairs are independent — that was a **latent bug**, not a design choice. With per-pair footprints, agents of different pairs do *not* share wear, contradicting the ABM premise.

**Fix applied:** `abmFootprints` is now allocated **once per `computeAgentBatch`** (before the `for p` loop), so every agent in every pair accumulates into the same structure. This is a correctness fix; it changes emergent output vs. the old per-pair behavior but is the intended dynamics.

**Consequence for parallelism:** the single-worker execution model is **correct and necessary**. Sharding the plan across workers would split the shared footprint and break dynamics. The only dynamics-safe way to parallelize the agent stage is a **shared atomic footprint accumulator** (see §4): back `abmFootprints` with a SAB `Int32Array(V)` + `Atomics.add`/`Atomics.load` shared by all pair-workers. Because the *only* cross-agent interaction is the integer footprint count (read in `scoreCandidates` as `Math.log1p(fp)`, written in `runAgentPath` as `++`), a shared atomic count preserves the global-sharing dynamics correctly. Cost: cross-pair *ordering* becomes non-deterministic, so even `temperature=0` is no longer byte-identical run-to-run (still statistically-equivalent emergent output, same tolerance the existing T>0 tests already accept). Keep behind a flag; safe default stays single-worker.

**Do NOT** shard at `(origin,dest)` pair granularity as the original draft suggested — that would re-introduce the per-pair isolation bug.

### 1.2 Indexed kernel wastes `gridDisk(curr, visionDepth)` + `cellToLatLng(curr)` every step — **IMPLEMENTED**
`getBestNextStep` (`agentTasks.js`) unconditionally computed `disk = _getCachedDisk(curr, visionDepth)` and `sLatLng = _getCachedLatLng(curr)`. In the indexed path (`_knUseIndexed === true`, the production default), `disk` is only read by the **string** fallback (`gatherCandidates`) and `sLatLng` only by `computeAngle` (string fallback). The outer `disk` is *not* used by the `cellsArr.length === 0` depth-loop (that recomputes its own per-depth disk). So at `visionDepth=15` it paid a ~720-cell `gridDisk` + a `cellToLatLng` **on every step** for no benefit.

**Done (P0):** both are now computed lazily, only inside the `if (!usedIndexed)` string-kernel branch. Removes the dominant per-step H3/trig cost in the indexed kernel. No behavior change (indexed path already ignored both). `indexedKernelParity` passes at T=0 and T>0.

### 1.3 String-keyed hot-loop accumulation → typed-array indexed
`pathDesireMap`, `perTargetContribs[destCell]`, and `abmFootprints` are plain objects keyed by H3 cell strings, mutated millions of times per run (`recordTraversal`, `scoreCandidates:291`, `:907`). Every op is a string hash + property slot. Since `graph.cellToIdx` already maps cell→integer, accumulate into `Float64Array(V)` (or `Int32Array(V)` for counts) indexed by graph index, and only materialize `{keys, vals}` from non-zero entries at the end (the transfer already expects that shape).

**Plan (P1):** replace the three plain-object accumulators with `Float64Array(V)` (pathDesire, per-target, footprints). `scoreCandidates` reads `abmFootprints[gIdx]` instead of `accumulatedFootprints[cellsArr[i]]`. The final flatten (`:928-943`) iterates the typed array for non-zero entries. Pairs naturally with §1.1 (the SAB accumulators *are* these typed arrays).

### 1.4 `runAgentPath` line-walk uses string-keyed `frictionLookup[stepCell]` — **IMPLEMENTED**
`:673` `const stepF = frictionLookup[stepCell];` — a plain-object read in the inner line loop. Use `graphFriction(graph, stepCell)` (typed-array read, `dijkstra.js:574`) for consistency with the rest of the kernel. Minor but free.

**Done (P3-pass):** now `const stepF = graph ? graphFriction(graph, stepCell) : frictionLookup[stepCell];`. `graphFriction` is byte-identical to the plain-object read for every cell the kernel queries (impassable → `undefined` → break; passable → same number), and the `graph`-absent fallback preserves the direct-`runAgentPath` (agentBatchParity) call path.

### 1.5 Redundant gradient-graph build per run — **IMPLEMENTED**
`compute.js` built the graph from `ctx.cellFrictionMap` (a `Map`); `runAgentBatches` (`spatialWorker.js:571`) builds it from `state._frictionObj` (a plain object). `getGradientGraph` is keyed by object *identity* (`dijkstra.js:82`), so the graph was built **twice** per run from two sources with identical `cellToIdx` (both iterate `viewHexes` in order).

**Done (P0):** `getReachableDestinations` now builds from `ctx._frictionObj || ctx.cellFrictionMap` — the same object identity `runAgentBatches` uses — so the identity-keyed cache is hit and the adjacency is built once per run. Halves graph-build allocation per run.

---

## 2. Mapping stage findings

### 2.1 `mergeCellsChunk` serializes `cells` (N strings) back, then it's dropped — **IMPLEMENTED**
`spatialTasks.js` returned `{ cells, frictionArr, affArr }`; `runMergeCellsTask` (`spatialWorker.js:1040`) returns only `frictionArr`/`affArr`, and `grid.js:199` iterates `viewHexes` by index. So N cell strings were structured-cloned worker→main and immediately discarded.

**Done (P1):** `mergeCellsChunk` now returns `{ frictionArr, affArr }` only. Saves an N-string clone per mapping build. `mappingBuild.test.js` (which reads `out.frictionArr`/`out.affArr`, not `out.cells`) still passes.

### 2.2 `multiFrictionEntries` double-lived on the main thread
`runFastScanTask` merges chunk `multiFrictionEntries` (N layer-maps) into a main-thread object (`spatialWorker.js:761-765`), then `grid.js:203` copies each into `state.multiFrictionMap` (another N layer-maps). Two N-object sets coexist transiently.

**Plan (P2):** merge chunk results directly into `state.multiFrictionMap` (pass it in / merge in place) instead of an intermediate `multiFrictionEntries`. Removes the transient 2× N-object set.

### 2.3 `GRADIENT_CACHE_MAX_ENTRIES` is dead
`constants.js:431` defines it; nothing reads it. `state._gradientCacheObj` grows unbounded (only cleared on remap). Either wire up LRU eviction or delete the constant.

**Plan (P2, safe):** implement a tiny LRU (cap = `GRADIENT_CACHE_MAX_ENTRIES`) in `clearGradientCache`/`computeDesirePaths`, or drop the constant. Low risk.

### 2.4 `precomputeOriginDestDistances` is an `M×M` dense `Float32Array`
`compute.js:55` allocates `Float32Array(M*M)` but only fills origin×dest (symmetric) pairs; everything else is `Infinity`. For user-placed nodes M is small, but if M grows (e.g. many auto-generated nodes) this is O(M²) memory.

**Plan (P2):** store per-origin a `Float32Array(destCount)` indexed by dest index (or `Map<origin, Map<dest, dist>>`). Only `O(M·D)` and no `Infinity` padding. Keep the `{nodeList, nodeToIdx, matrix}` external shape if tests depend on it, or adapt `lookupOriginDest` (`:562`).

---

## 3. Memory footprint — strategic

### 3.1 `cellFrictionMap` + `_frictionObj` (and `affordanceMap` + `_affordanceObj`) are duplicate N-entry containers
At steady state the sim holds friction in **both** `cellFrictionMap` (Map) and `_frictionObj` (plain object), and affordance in both `affordanceMap` and `_affordanceObj` (`compute.js:272-295`). That's ~2× the hottest fields. `multiFrictionMap` adds a third N-object set.

**Plan (P3, strategic, phased):** make `Float32Array(N)` indexed by `viewHexes` order the canonical friction/affordance representation (the mapping graph already produces `frictionArr: Float32Array(N)` at `spatialTasks.js:611`). Keep a `cellToIdx` map. Drop `cellFrictionMap`/`affordanceMap` Maps (or expose them as thin `Map`-like views only where `updateLayers`/`mapCells` iterate). Lookups become `arr[cellToIdx.get(h)]` (typed-array read). This is the single biggest steady-state memory win and also speeds every read. Touches `grid.js`, `compute.js`, `dijkstra.js`, `spatialTasks.js`, `agentTasks.js`, `map.js`, `ui.js` — hence phased and test-gated.

### 3.2 `multiFrictionMap` N-object set
The biggest *object* allocation. Obstacle drawing (`mapCells`, `grid.js:330`) only ever **raises** friction (`val[layerKey] = max`), and the effective friction is the min across layers. For the common case (single layer, or drawing over pavement) a single `Math.max(existing, newFriction)` override is equivalent; the multi-layer (bridge-over-building) case is rare.

**Plan (P3):** make `multiFrictionMap` lazy — allocate a layer-map only for cells that actually have >1 layer from the fast-scan; store a plain number for single-layer cells. Or, combined with §3.1, keep only `cellFrictionMap` + a small `Set` of multi-layer cells. Document the vertical-layer caveat.

---

## 4. SAB notes
SAB is already wired for transfer buffers (`allocTransferBuffer` in both `spatialTasks.js` and `spatialWorker.js`, gated on `crossOriginIsolated`). The dynamics-safe parallelism path (§1.1) hinges on a **shared atomic footprint accumulator**: back `abmFootprints` with a SAB `Int32Array(V)` + `Atomics.add`/`Atomics.load` shared by all pair-workers. Because the *only* cross-agent interaction is the integer footprint count (read in `scoreCandidates` as `Math.log1p(fp)`, written in `runAgentPath` as `++`), a shared atomic count preserves the global-sharing dynamics correctly. `pathDesire`/`perTargetContribs` counts are also integers, so they can use the same `Atomics.add` pattern (or a main-thread sum fallback when not cross-origin isolated). The visibility CSR and gradient `frictionArr` are already SAB-shareable — pass the *same* SAB to every worker rather than re-flattening per dispatch.

---

## 5. Prioritized implementation plan

| Pri | Item | Risk | Effort | RoI | Status |
|-----|------|------|--------|-----|--------|
| **P0** | Lazy `disk`/`sLatLng` in indexed kernel | none | S | High — removes a `gridDisk(visionDepth)`+`cellToLatLng` on every step (dominant per-step H3 cost in the indexed kernel) | ✅ done |
| **P0** | Unify gradient-graph source (`_frictionObj`) | none | S | Med — halves gradient-graph build allocation per run (O(N) adjacency) | ✅ done |
| **P0** | Global shared `abmFootprints` (correctness fix) | none | S | High — fixes per-pair isolation bug; required for correct ABM dynamics | ✅ done |
| **P1** | Drop `cells` from `mergeCellsChunk` return | none | S | Low–Med — avoids cloning N cell strings worker→main per mapping build | ✅ done |
| **P1** | Typed-array accumulator — `footprints` (hot per-candidate read) | low | M | High — the hottest accumulator (read per candidate per step + written per path cell) is now a `Uint32Array(V)` indexed by `graph.cellToIdx`; scorer reads `fpArr[i]` (captured at gather) instead of a cell-string hash | ✅ done |
| **P1** | Typed-array accumulators — `pathDesire`/`perTarget` | low | M | Deferred — `runAgentPath` is exported and tested with a `Map` accumulator + no `graph` (agentBatchParity), pinning the polymorphic object/Map write; `perTargetContribs` is per-dest so full `Uint32Array(V)` rows would be *worse* on memory than the sparse objects. Kept as objects. | deferred |
| **P1** | SAB atomic shared footprint (the *only* dynamics-safe parallelism) | med (determinism) | L | Very High (throughput) — unlocks multi-worker agent stage without breaking dynamics; costs cross-pair non-determinism. Footprints are now already a `Uint32Array(V)` (SAB-ready). | open — flag-guarded |
| **P2** | Merge fast-scan directly into `multiFrictionMap` | low | M | Low — already effectively addressed: `grid.js` sets `multiFrictionMap` entries to the *same object references* as the fast-scan `multiEntries` (no 2× N-object set) | ✅ done (shared refs) |
| **P2** | LRU for gradient cache / wire `GRADIENT_CACHE_MAX_ENTRIES` | none | S | Low — `_gradientCacheOrder` LRU now bounds `_gradientCacheObj` to `GRADIENT_CACHE_MAX_ENTRIES` carried-over entries; current-run targets are protected from eviction | ✅ done |
| **P2** | Sparse OD-distance structure | low | S | Low–Med — replaced dense `Float32Array(M²)` (M = O∪D) with an origin-major `Float32Array(O*D)` + `originToIdx`/`destToIdx` maps; exact same lookup semantics (2nd arg is always a dest), ~4× smaller when O≈D | ✅ done |
| **P3** | Canonical `Float32Array(N)` friction/affordance (drop duplicate Maps) | med | L | Very High (memory) — biggest steady-state win; ~2× friction/affordance + faster reads | ✅ done (phased: thin `FrictionArrayMap` views) |
| **P3** | Lazy `multiFrictionMap` | med | M | High (memory) — drops the largest N-object allocation | ✅ done |

**Implemented in this pass (all green: 57 + 105 tests):**
- Lazy `disk`/`sLatLng` in the indexed kernel — removes a `gridDisk(visionDepth)` + `cellToLatLng` per step.
- Unified gradient-graph source (`_frictionObj`) — one adjacency build per run instead of two.
- Global `abmFootprints` — fixes the per-pair isolation bug; agents now share wear across the whole simulation (required for correct ABM dynamics; mandates single-worker).
- Dropped `cells` from `mergeCellsChunk` return — no N-string clone per mapping build.

**Recommended next:** P1 typed-array accumulators (folds naturally into the SAB atomic design), then the SAB atomic shared-footprint parallelism behind a flag. P3 only after P0–P2 are green.

---

## 6. Second implementation pass (all green: 346 tests, 6 skipped)

- **Typed-array footprint accumulator (P1, partial).** `abmFootprints` is now a `Uint32Array(graph.V)` indexed by `graph.cellToIdx`. The candidate scorer no longer hashes cell strings: each candidate's current footprint count is captured into a parallel `fpArr` at gather time (the graph index is already in hand in the indexed kernel; the string kernel resolves it via a cached `getFootprint` closure), swapped in lockstep with the other candidate arrays in `partitionVisibleCone`, and read as `fpArr[i]` in `scoreCandidates`/`selectBestCandidate`. Footprints are constant within one `getBestNextStep` call, so gather-time capture is exact and byte-parity holds (verified by `indexedKernelParity` at T=0/T>0 and `agentBatchParity`). Writes use `graph.cellToIdx[cell]`. `pathDesire`/`perTarget` were **deferred**: `runAgentPath` is exported and tested with a plain `Map` + no `graph`, and `perTargetContribs` is per-dest (dense rows would be a memory regression).
- **LRU gradient cache (P2).** Wired the previously-dead `GRADIENT_CACHE_MAX_ENTRIES`: `_gradientCacheOrder` tracks recency, current-run targets are marked MRU and protected, and least-recently-used carried-over entries are evicted after each run so `_gradientCacheObj` no longer grows unbounded across incremental runs.
- **Sparse OD-distance (P2).** `precomputeOriginDestDistances` now returns `{ originToIdx, destToIdx, D, matrix }` with an origin-major `Float32Array(O*D)` instead of the dense symmetric `Float32Array(M²)`. Since the per-tick lookup's second argument is always a destination, this is exact and ~4× smaller when O≈D. `lookupOriginDest` (both the compute.js and agentTasks.js copies) updated in lockstep.
- **`multiFrictionMap` merge (P2).** Confirmed already addressed — `grid.js` stores the fast-scan `multiEntries[cell]` objects *by reference* into `multiFrictionMap`, so there is no transient 2× N-object set.

**Recommended next:** the SAB `Atomics.add` shared-footprint parallelism (P1) — `abmFootprints` is now a `Uint32Array(V)`, so backing it with a SAB is a small step; keep it flag-guarded (cross-pair non-determinism). Then the P3 memory refactors.

---

## 7. Third implementation pass (all green: 346 tests, 6 skipped)

- **§1.4 line-walk friction read.** `runAgentPath`'s inner line-walk now reads friction via `graphFriction(graph, stepCell)` (typed-array) when a graph is present, falling back to the plain-object `frictionLookup[stepCell]` only for the graph-less direct-call path. Byte-identical for every cell queried.
- **Lazy `multiFrictionMap` (P3.2).** The mapping build no longer pre-populates every viewHex with an empty layer-map object (the largest N-object allocation in the mapping stage). Only cells with actual fast-scan layers get an entry; the interactive obstacle drawer (`mapCells`) allocates a layer map on demand for any in-AOI cell (AOI membership via `cellFrictionMap`), so drawing behavior is unchanged. The Map *object* is still reused (cleared in place) when the AOI key is unchanged, so the identity-reuse contract (`integration.test.js`) holds. Parity is exact: layer-less cells already defaulted to `fr = cellFrictionEntries[cell] ?? 0` in the merge, and nothing reads an empty layer map (`_multiFrictionObj` is assigned but never read as data).

**Remaining (large, strategic — deliberately not rushed):**
- **P1 SAB atomic shared-footprint parallelism** — needs multi-worker agent sharding (agent.worker.js + `runAgentBatches`), a shared SAB `Int32Array(V)` footprint with `Atomics.add`/`Atomics.load`, a cross-worker merge for `pathDesire`/`perTarget`, a flag, and a new multi-worker parity test. Introduces cross-pair non-determinism by design (accepted at the T>0 tolerance). Groundwork is in place (footprints are already a `Uint32Array(V)`).
- **P3.1 canonical `Float32Array(N)` friction/affordance** — the single biggest steady-state memory win, but it drops `cellFrictionMap`/`affordanceMap` and touches `grid.js`, `compute.js`, `dijkstra.js`, `spatialTasks.js`, `agentTasks.js`, `map.js`, `ui.js` (including render paths with thin unit coverage). Must be phased behind the integration test rather than done in a single pass.

---

## 8. Fourth implementation pass — P3.1 canonical storage wired in (all green: 352 tests, 6 skipped)

- **Canonical `Float32Array(N)` friction/affordance (P3.1, phased).** `triggerFastScan` now builds the canonical representation once per mapping: `state.cellToIdx` (`Map<cell,number>`, viewHexes order), `state.frictionArr` / `state.affArr` (`Float32Array(N)`), and reassigns `state.cellFrictionMap` / `state.affordanceMap` to thin **`FrictionArrayMap`** views over those arrays (`src/helpers/frictionStore.js`). Every existing consumer keeps working through the Map interface (`get`/`set`/`has`/`size`/`keys`/`entries`/`clear`/`forEach`/iteration), so the two hottest fields drop from **two N-entry Maps to one N-entry index Map + two compact typed arrays (~2× steady-state memory win)** — the review's stated goal. `cellToIdx` is the only remaining N-entry container and is required for cell→index lookups (the gradient graph builds its own passable-only index internally).
  - **Worker-boundary safety.** A `FrictionArrayMap` instance does not survive structured-clone (its methods are dropped), but *every* worker boundary runs `normalizeFrictionEntries` (or the inline `typeof source.entries !== 'function'` check) on the **main thread** first, which iterates the view into a plain object before posting. Verified at: `runBuildMappingGraph` → `normalizeFrictionEntries`, `runAgentBatches`/`runGradientBatches` (also via `_frictionObj`, a plain object), and `runFastScanTask` (uses `multiFrictionEntries`, never `cellFrictionMap`). So the view is never shipped across the worker boundary in instance form.
  - **Behavior parity.** `size` is the index-map size (every AOI cell is a friction cell) — identical to the old Map *after* the merge loop; consumers only read `size` post-merge. `clear()` resets the array to 0 (callers always re-set every cell immediately after); `delete()` zeroes the slot (fixed-size array cannot shrink). `entries()`/`values()`/`iterator` yield in `cellToIdx` (== viewHexes) order, which is order-independent for the gradient graph and `_frictionObj` materialization.
  - **New unit test** `tests/frictionStore.test.js` locks the `FrictionArrayMap` contract (round-trip, iteration order, `clear`/`delete`, `normalizeFrictionEntries` conversion, `forEach`).
  - `main.js` `_knownStateKeys` gained `cellToIdx` / `frictionArr` / `affArr` so the Proxy routes them to the consolidated state bag (hidden from `ownKeys`, as intended for large synthetic fields).

**Remaining (single large strategic item):**
- **P1 SAB atomic shared-footprint parallelism** — needs multi-worker agent sharding (agent.worker.js + `runAgentBatches`), a shared SAB `Int32Array(V)` footprint with `Atomics.add`/`Atomics.load`, a cross-worker merge for `pathDesire`/`perTarget`, a flag, and a new multi-worker parity test. Introduces cross-pair non-determinism by design (accepted at the T>0 tolerance). Groundwork is in place (footprints are already a `Uint32Array(V)`).

**Optional follow-up (not required for the P3.1 memory win):** convert the hottest read paths (`getGradientGraph` friction lookup, `map.js` render, `agentTasks.js` affordance snapshot) to read `state.frictionArr[state.cellToIdx.get(h)]` directly instead of through the `FrictionArrayMap` view. The view's per-`get` is already a `Map.get` + typed-array index (no slower than a real Map), and those reads happen only during graph build / layer rebuild — not per simulation tick — so the current form is already fast enough; the direct-read conversion is purely a micro-optimization.
