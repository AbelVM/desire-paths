I've completed a deep review and implemented the safe, high-value fixes. Here is the full review.

---

# Desire-Paths Simulator — Performance & Memory Review

The codebase is already heavily optimized (CSR adjacency, Dial's buckets, typed-array gradients, SAB-shared footprint, worker pools, structured-clone flattening). The remaining wins are in three buckets: **(1) a latent correctness bug hiding as a perf/duplication issue, (2) small but real redundant work, (3) two large architectural memory wins.** I implemented (1) and (2) directly; (3) is planned with sketches below.

## ✅ Implemented this session

### A. Unified friction→tier classification (fixes a latent bug) — `constants.js`, `map.js`, `compute.js`, `spatialTasks.js`
There were **three divergent copies** of "friction value → terrain tier":
- `map.js getCellType` used **hardcoded `1.5`/`3.25`** cutoffs,
- `compute.js classifyAffordance` used `(PAVEMENT+LIGHT_PARK)/2 = 1.75` and `(LIGHT_PARK+HEAVY_GRASS)/2 = 3.25`,
- `spatialTasks.js mergeCellsChunk` used the same `1.75`/`3.25` as `compute.js`.

The `map.js` copy is **wrong**: cells in the friction band `1.5–1.75` (e.g. worn pavement) were labeled `light_park` in the hover tooltip while the simulation treated them as `pavement`. I added one canonical `classifyFrictionTier(friction)` (+ `affordanceForFriction`) in `constants.js` and routed all three through it. Removes ~40 lines of duplication and fixes the divergence.

### B. Removed redundant O(V) `C` rescan in Dial's algorithm — `dijkstra.js`
`computeDijkstraDial` re-scanned the entire `frictionArr` (V cells) on **every gradient target** to recompute the max bucket weight, even though `getGradientGraph` already stores `frictionMaxC`. At city scale (D≈100 targets, V≈5e5) that's ~5×10⁷ wasted ops per gradient batch. `C` is now computed once in `computeDijkstra` as `Math.ceil(frictionMaxC * GRADIENT_DIAL_SCALE)` and passed in.

### C. Removed the counterproductive `cachedCellLatLng` cache — `spatialTasks.js`
`buildMappingGraph` called `cachedCellLatLng(cell)` once per AOI cell. The cache was capped at **4096** entries, so for any real AOI (N ≫ 4096) it missed 100% of the time and only added ~3 `Map` ops per cell of pure overhead (the `cellToLatLng` call is unavoidable regardless). Deleted the cache; `buildMappingGraph` now calls `cellToLatLng` directly. The radian/sin/cos values are still computed once and stored in `latLngArr`, which is what the visibility BFS actually consumes.

### D. Reused the gradient-graph cache in `computeDesirePaths` — `compute.js:492`
`computeDesirePaths` built a **second** gradient graph keyed by `state.cellFrictionMap`, while `getReachableDestinations` (called earlier in the same run) already built one keyed by `state._frictionObj`. The graph cache is keyed by object identity, so these were two identical graphs. Changed line 492 to use `state._frictionObj || state.cellFrictionMap`, so all three graph builds in a run (reachability, plan validation, agent batch) hit one cached entry.

### E. `Float32Array` instead of `Float64Array` in `mergeCellsChunk` — `spatialTasks.js`
Friction lives in `[1, ~7]` (+ blur) and affordance in `[0, 1]`; both are exact in `Float32`. The worker's per-cell arrays are written straight into `Float32Array`-backed `FrictionArrayMap`s, so there's no precision loss on the way out. Halves the merge worker's transient memory.

### F. `Uint16Array` bearings in the visibility shard — `spatialTasks.js`
`computeVisibilityBearingCSRIndexed` built `bearings` as `Float32Array` and only quantized to `Uint16` at pack time. Bearings are integer degrees in `[0,360)` (fit in `Uint16`), so I store them as `Uint16Array` directly — halving the intermediate bearing buffer (the dominant transient in the visibility BFS, which can be hundreds of MB at city scale).

All 14 test files (358 tests) pass; lint is clean.

---

## 📋 Planned (higher-risk / larger surface)

### G. Eliminate the per-agent `simPath` string array — `agentTasks.js`
`runAgentPath` builds `simPath` (up to `maxTicks` cell-string refs) and returns it; `computeAgentBatch` then re-iterates it to update `perTargetContribs[destCell]` and the shared footprint. For millions of agents that's millions of array allocations (GC churn). The cell strings are already shared references (viewHexes entries), so the win is the array itself, not the strings.

**Sketch** — pass the accumulators into `runAgentPath` and write inline:
```js
// runAgentPath(originCell, destCell, grad, maxTicks, id,
//   pathDesireMap, frictionLookup, affordanceLookup, visibilityMap,
//   accumulatedFootprints, bearingMap, graph, nodeSet,
//   destContrib /* perTargetContribs[destCell] */, fpCellToIdx, useAtomics)
// replace every `simPath.push(cell)` with:
recordTraversal(pathDesireMap, cell);
destContrib[cell] = (destContrib[cell] || 0) + 1;
if (fpCellToIdx) { const gi = fpCellToIdx[cell]; if (gi !== undefined)
  useAtomics ? Atomics.add(footprints, gi, 1) : footprints[gi]++; }
// drop the final `for (const cell of simPath)` loop in computeAgentBatch
```
The `agentBatchParity.test.js` baseline relies on the returned array — adapt it to build `baselinePerTarget` via the same inline increments (the parity assertion is unchanged).

### I. Eliminate the persistent `_frictionObj` / `_affordanceObj` plain-object copies (the real 2× win) — `compute.js`, `grid.js`
`frictionStore.js` promised a single canonical representation (typed arrays + `cellToIdx`), but `compute.js` rebuilds **two N-entry plain objects** (`_frictionObj`, `_affordanceObj`) from the `FrictionArrayMap`s and holds them on `state` for the whole run. That's the "2× steady-state memory" the comments claimed to remove.

**Sketch** — make the working copies *be* the views:
```js
// compute.js (build sites)
state._frictionObj = state.cellFrictionMap;   // FrictionArrayMap view
state._affordanceObj = state.affordanceMap;   // FrictionArrayMap view
```
Then change the read/write sites from bracket to Map semantics:
- `decayAffordance`/`updateAffordance`: `ctx._affordanceObj?.[cell]` → `ctx._affordanceObj?.get(cell)`; `ctx._affordanceObj[cell] = v` → `ctx._affordanceObj?.set(cell, v)`.
- `grid.js mapCells`: `frictionObj[cell] = fr` → `frictionObj.set(cell, fr)`; `frictionObj[cell]` → `frictionObj.get(cell)`.
- `getGradientGraph`/`runAgentBatches` already accept the `FrictionArrayMap` (it has `.entries`/`.get`), so no change there.

The only remaining plain-object copy is the one `normalizeFrictionEntries` builds **inside the worker** (transient, off main thread). To kill that too, have the worker consume `frictionArr` + `cellToIdx` directly instead of iterating into a plain object — a follow-up that removes the last N-key allocation. **Test adaptation required**: `compute.test.js`/`computeDesirePaths.test.js` set `_frictionObj` as a plain object and read it with `[]`; switch them to `FrictionArrayMap` (or a small typed-array-backed shim) so the dual representation is exercised.

### J. Visibility CSR memory at city scale — `spatialTasks.js` / `grid.js`
The visibility CSR is the dominant memory cost: `P ≈ N · 3·visionDepth·(visionDepth+1)` pairs × 6 bytes. At N=5e5, `visionDepth=15` that's **~2 GB**. It's held permanently on `state._visibilityBearingCSR` and re-shipped to the worker each run. Options, in order of effort:
1. **Release after sim** (cheap): null `state._visibilityBearingCSR` at the end of `computeDesirePaths` (rebuild on next run). Trades rebuild cost for steady-state memory.
2. **Cap `visionDepth`** to a sane max (e.g. 8) — the agent's effective look-ahead rarely needs 15 rings; this cuts P by ~3.5×.
3. **Sparse/compressed neighbor storage** (larger): since neighbor indices are bounded by N, and most origins share the same local ring topology, a delta/relative encoding could shrink the `Int32` neighbor array.

### Other findings (smaller)
- **`computeDijkstraGradient` in `compute.js` is dead in production** — only `compute.test.js` uses it; the production path is `computeGradientBatch` → `computeDijkstraGradientForLookup` in `spatialTasks.js`. Drop the export and point the test at `computeDijkstra` directly.
- **`recordTraversal`'s `Map` branch is dead** in production (only the plain-object path is hit). Keep only the plain-object path.
- **`agentTasks.js _getCachedLatLng` (cap 1024)** has the same thrash problem as C, but only on the **string-kernel fallback** path (CSR present → indexed kernel, no lat/lng cache). Lower priority; same fix as C if the fallback matters.
- **`flattenPayloadAndTransfers` in `spatialWorker.js`** is mis-indented (2-space indent at module scope) — valid JS, but re-indent for readability.
- **Gradient round-trip copy** — `runAgentBatches` re-materializes `gradientsObj` (D × `Float32Array(V)`) and structured-clones it to the agent worker(s). For the parallel path each shard gets a copy. Making gradients SAB-backed when cross-origin isolated would share them zero-copy (mirrors what `packCSR` already does for the visibility buffer).

## What I deliberately left alone
The legacy fallbacks (`gridDisk` path in `getGradientGraph` when `viewHexes` is absent, the string kernel when the visibility CSR is missing, `runLocally` when `Worker` is undefined, `Object.fromEntries(bearingMap)` in the local path) are load-bearing for **Node/SSR tests and environments without workers/cross-origin isolation**. Removing them would break the test suite and degrade gracefully-degrading paths; they're cheap when unused and correct when used.

---

Net: A–F are merged and green. G, I, J are the next increments — I and J are the ones that move the memory needle at city scale; G is the main remaining per-agent GC win.