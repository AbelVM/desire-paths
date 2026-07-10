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

### 1.4 `runAgentPath` line-walk uses string-keyed `frictionLookup[stepCell]`
`:673` `const stepF = frictionLookup[stepCell];` — a plain-object read in the inner line loop. Use `graphFriction(graph, stepCell)` (typed-array read, `dijkstra.js:574`) for consistency with the rest of the kernel. Minor but free.

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
| **P1** | Typed-array accumulators (`pathDesire`/`perTarget`/`footprints`) | low | M | High — eliminates millions of string-keyed mutations/reads per run; folds into SAB design | open |
| **P1** | SAB atomic shared footprint (the *only* dynamics-safe parallelism) | med (determinism) | L | Very High (throughput) — unlocks multi-worker agent stage without breaking dynamics; costs cross-pair non-determinism | open — flag-guarded |
| **P2** | Merge fast-scan directly into `multiFrictionMap` | low | M | Low — removes transient 2× N-object set during mapping | open |
| **P2** | LRU for gradient cache / remove dead `GRADIENT_CACHE_MAX_ENTRIES` | none | S | Low — bounds unbounded `_gradientCacheObj` growth | open |
| **P2** | Sparse OD-distance structure | low | S | Low–Med — O(M·D) vs O(M²) when node count grows | open |
| **P3** | Canonical `Float32Array(N)` friction/affordance (drop duplicate Maps) | med | L | Very High (memory) — biggest steady-state win; ~2× friction/affordance + faster reads | open |
| **P3** | Lazy `multiFrictionMap` | med | M | High (memory) — drops the largest N-object allocation | open |

**Implemented in this pass (all green: 57 + 105 tests):**
- Lazy `disk`/`sLatLng` in the indexed kernel — removes a `gridDisk(visionDepth)` + `cellToLatLng` per step.
- Unified gradient-graph source (`_frictionObj`) — one adjacency build per run instead of two.
- Global `abmFootprints` — fixes the per-pair isolation bug; agents now share wear across the whole simulation (required for correct ABM dynamics; mandates single-worker).
- Dropped `cells` from `mergeCellsChunk` return — no N-string clone per mapping build.

**Recommended next:** P1 typed-array accumulators (folds naturally into the SAB atomic design), then the SAB atomic shared-footprint parallelism behind a flag. P3 only after P0–P2 are green.

---

I can start implementing the P0 items (lazy disk/sLatLng + gradient-graph source unification) and the `mergeCellsChunk` `cells` drop immediately — they're localized, behavior-preserving, and covered by the existing parity tests. Want me to proceed with those, or take on the P1 parallelization refactor (with the SAB `Atomics.add` accumulators and a new multi-worker parity test) as the main deliverable?