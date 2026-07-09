# Desire Paths Simulator — Performance & Memory Review (review6.md)

> Scope: building/mapping stage (`grid.js`, `spatialTasks.js`, `spatialWorker.js`)
> and simulation stage (`compute.js`, `agentTasks.js`, `dijkstra.js`, `agentStep.js`).
> Goal: identify and plan concrete performance + memory-footprint improvements.
> Legacy fallbacks and internal API shapes may be changed where it helps.

---

## 0. What is already well-optimized (do NOT regress)

The codebase is already heavily tuned. The following are correct and should be
preserved — several "obvious" rewrites would actually be regressions:

- **CSR gradient graph** (`dijkstra.js` `getGradientGraph`): single flat
  `gridDisk`/`gridRingUnsafe` pass, prefix-summed, cached by source identity.
- **Dial's algorithm** with circular buckets for the small integer edge weights
  produced by friction; 4-ary heap fallback (`DIAL_MAX_C` guard).
- **Lazy, generation-keyed neighbor-disk cache** (`getNeighborDisk`) — no
  upfront `N×gridDisk` block at mapping time.
- **CSR visibility/bearing** (`computeVisibilityBearingCSRIndexed` +
  `reconstructVisibilityBearing`): O(N+P) typed arrays, binary-search lookups
  via `createVisibilityIndex`/`createBearingIndex`, no per-pair `Map`. Bearings
  quantized to `Uint16`. Per-cell `sin/cos` precomputed once in
  `buildMappingGraph` so each bearing is one `atan2`.
- **Transferable flattening** of `frictionEntries` (`flattenPayloadAndTransfers`)
  and `__flat` result encoding in `computeAgentBatch`.
- **Worker pool** with per-kind caps, idle retirement, LPT chunk scheduling for
  fast-scan, single-pass BFS in the visibility shard (count+write folded).
- **Preallocated candidate buffers** in `compute.js` `getBestNextStep`
  (`ctx._candCells` etc.) and cached `getFriction`/`getAffordance` closures.

The findings below build on top of this; the highest-value items are about
**data representation** (string-keyed objects → index-addressed typed arrays)
and **off-main-thread execution of the ABM loop**.

---

## 1. Summary of findings

| ID | Area | Issue | Type | Impact | Effort | Status |
|----|------|-------|------|--------|--------|--------|
| S1 | Sim | ABM loop runs on **main thread** (`runAgentBatches` `workerCount=1` → local `computeAgentBatch`) → UI freeze at city scale | Perf/UX | High | Med | **Planned** (see §3) |
| S2 | Sim | `getBestNextStep` (compute.js) allocates `weights` + 2 closures **per call** (millions×) | Perf/GC | High | Low | **Implemented** |
| S3 | Sim | `getBestNextStep` (agentTasks.js) allocates 5 arrays + 4 closures + `weights` **per call** | Perf/GC | High | Med | **Implemented** |
| S4 | Sim | `computeDijkstra` rebuilds `Float64Array(V)` friction per target → D×V transient alloc | Mem/Perf | High | Low | **Implemented** |
| M1 | Map | Gradients stored as `destCell → {cellId: distance}` string-keyed objects → D×V string entries | Mem/Perf | High | High | Planned (§4) |
| M2 | Map | Visibility BFS recomputed per-origin though visibility is symmetric | Perf | High | Med | Planned (§5) |
| M3 | Map | `getGradientGraph` CSR built on main thread during gradient batch | Perf | Med | Med | Planned (§6) |
| M5 | Map | `state._cellState` = N per-cell objects `{friction,affordance,desire,multi}` | Mem | High | High | Planned (§7) |
| S5 | Sim | `precomputeOriginDestDistances` O×D string-keyed object + `gridDistance` | Perf | Med | Low | Planned (§8) |
| C1 | X | `gradientsObj` (D×V) structured-cloned to worker, not flattened | Mem | Med | Med | Planned (ties M1) |
| C2 | X | Worker `_cellLatLngCacheObj` periodic full-reset discards useful entries | Mem | Low | Low | Planned (§9) |

---

## 2. Implemented in this pass

### S2 — Hoist per-call allocations in `compute.js` `getBestNextStep`
**File:** `src/helpers/compute.js` (`getBestNextStep`)
**Evidence:** previously allocated `weights` (object), `isVisible` (closure),
`computeAngle` (closure) on every invocation. `getBestNextStep` is the hottest
function in production (the sim runs locally on the main thread via
`computeAgentBatch`), called once per tick per agent — millions of times.
**Change:**
- `weights` cached on `ctx._bestNextWeights`, keyed by
  `affordanceWeight:distancePenalty` (`ctx._bestNextWeightsKey`).
- `isVisible` cached on `ctx._isVisibleFn`, rebuilt only when
  `ctx._isVisibleFrictionLookup !== frictionLookup`.
- `computeAngle` cached on `ctx._computeAngleFn`, rebuilt only when
  `ctx._computeAngleBearingMap !== bearingMap`; signature changed to
  `(n, sLatLng, currentDirection, curr)` so the per-call `curr`/`currentDirection`
  are passed as args instead of closed over.
- `gatherCandidates` (`agentStep.js`) now forwards `sLatLng`/`currentDirection`.
**Why safe:** identity guards guarantee the cached closures always reflect the
current run's `frictionLookup`/`bearingMap`; output is byte-identical.
**Verified:** 387 tests pass.

### S3 — Hoist per-call allocations in `agentTasks.js` `getBestNextStep`
**File:** `src/helpers/agentTasks.js`
**Evidence:** previously allocated 5 arrays (`cellsArr/anglesArr/affsArr/
frictionArr/gNsArr`), 4 closures (`getFriction/getAffordance/isVisible/
computeAngle`), and `weights` on every call. This is the worker kernel that S1
will dispatch to, so it must be allocation-free in the hot path.
**Change:** module-level reusable buffers (`_knCells/_knAngles/_knAffs/
_knFriction/_knGNs/_knScores`) reset in place (`length = 0`); closures cached on
module state with identity guards (`_knFrictionLookup/_knCellState/
_knVisibilityMap/_knBearingMap/_knWeightsKey`). The agent worker is
single-threaded and processes one batch at a time, so module-level reuse is safe.
**Verified:** `agentBatchParity.test.js` (TEMPERATURE=0) still matches the
`runAgentPath` baseline — output unchanged.

### S4 — Reuse the friction array across Dijkstra targets
**File:** `src/helpers/dijkstra.js` (`getGradientGraph`, `computeDijkstra`)
**Evidence:** `computeDijkstra` built a fresh `Float64Array(V)` and re-ran V
friction lookups **per target**. With D destinations and V≈5e5 cells that is
D×V ≈ 5e7 lookups and ~D×4 MB transient allocation per gradient batch (across
workers, still ~100 MB/worker). Friction is constant for a given graph (the
graph is invalidated on any friction-topology change via
`invalidateGradientGraph`), so the array is computed once.
**Change:**
- `getGradientGraph` now also builds `frictionArr` (`Float64Array(V)`) and
  `frictionMaxC` alongside the CSR.
- `computeDijkstra` reads `graph.frictionArr`/`graph.frictionMaxC` instead of
  rebuilding; the Dial quantized array (`graph.frictionQuantized`) is built once
  and cached on the graph.
**Verified:** gradient tests (`spatialTasks`, `mappingBuild`, `compute`) pass;
values unchanged.

---

## 3. S1 — Run the ABM loop off the main thread (PLANNED, highest UX value)

**Problem.** `runAgentBatches` (`spatialWorker.js`) hard-codes `workerCount = 1`
and then takes the `if (workerCount <= 1)` branch, which calls
`computeAgentBatch` **synchronously on the main thread**. At city scale the
agent loop (thousands of agents × hundreds of ticks × `getBestNextStep`) blocks
the UI for seconds. This is the single biggest responsiveness problem.

**Why parallelization is NOT the answer (per the brief).** The simulation is a
true ABM: agents share one `accumulatedFootprints` structure that boosts
affordance for *subsequent* agents in the same run (paper §3.4). Splitting the
plan across ≥2 workers would give each worker an independent structured-clone of
the footprints, destroying the interaction. The code comment in
`runAgentBatches` already states this correctly.

**The fix (preserves dynamics, fixes blocking).** Dispatch the whole plan to a
**single** `agent-batch` worker. One worker = one execution context = the ABM
shared state stays consistent. `accumulatedFootprints` is passed in, mutated
only inside that worker, and never needed back on the main thread (only
`pathDesire`/`perTargetContribs` are). The result returns via transferables.

**Required sub-step (bearing transfer).** The precomputed `bearingMap` is a
`BearingIndex` **Proxy** whose target holds *functions* (`get`/`getBearing`).
Structured-clone of a Proxy drops function-valued properties, so posting
`bearingMap` to a worker would silently degrade every bearing lookup to the
trig fallback (`_bearingFromLatLngs`), **regressing** sim speed. Two clean
options:
1. **(Preferred)** Expose the packed CSR `buffer` from `state._precomputedBearings`
   and reconstruct a `BearingIndex` *inside* the worker from that buffer
   (zero materialization of a per-pair `Map`). This keeps the O(log Pᵢ) lookup
   off-main-thread.
2. Pass `bearingMap: null` to the worker and accept the trig fallback (correct,
   ~+0.1–0.5 s at city scale). Simplest, but a real regression vs. the current
   main-thread path that uses the index.

**Recommended shape:**
```js
const useWorker = typeof Worker !== 'undefined';
if (!useWorker) {
  const ret = computeAgentBatch({ /* …local… */ });
  return normalizeAgentResult(ret?.result ?? ret);
}
try {
  const ret = await runWorker('agent-batch', { plan, frictionEntries,
    gradients: gradientsObj, affordanceEntries, hexCount, visibilityEntries,
    neighborDisks, options, accumulatedFootprints, originDestDistances,
    bearingMap /* or reconstructed BearingIndex from CSR */ });
  return normalizeAgentResult(ret?.result ?? ret);
} catch (err) {
  // graceful fallback to local execution on worker failure
  const ret = computeAgentBatch({ /* …local… */ });
  return normalizeAgentResult(ret?.result ?? ret);
}
```
Extract `normalizeAgentResult` (the existing `__flat`→plain-object logic at
`spatialWorker.js:591-619`) so both paths share it. **S3 must land first** so the
worker kernel is allocation-free. **Test impact:** node tests hit the local
fallback (`Worker` undefined) → no behavior change; add a browser/worker
integration check for the dispatch + bearing reconstruction.

---

## 4. M1 — Gradients as index-addressed typed arrays (PLANNED, biggest memory win)

**Problem.** Each destination's gradient is a plain object
`{ cellId: distance }` (see `computeDijkstra` `out`, `runGradientBatches`
merge, `goalGradients` Map in `computeDesirePaths`, `gradientsObj` in
`runAgentBatches`). With D destinations and V reachable cells this is **D×V
string-keyed entries** — gigabytes at city scale, and every hot-path lookup
(`gradientObj[curr]`, `gradientObj[n]`) is a string-keyed object property access.

**Fix.** Store each gradient as a `Float32Array(V)` indexed by the gradient
graph's `cellToIdx`, plus a `Set`/bitmask of reachable indices (or a sentinel
like `Infinity` for unreachable). Build a `gradientStore`:
```js
// gradientStore[destIdx] = Float32Array(V), Infinity = unreachable
const gradientStore = new Map(); // destCell -> Float32Array(V)
const cellIdx = graph.cellToIdx;
```
- `computeDijkstra` already returns `out` keyed by `idxToCell[i]`; write
  `arr[cellIdx[idxToCell[i]]] = dv` instead.
- Hot path `getGradientDirection` / `getBestNextStep`: replace
  `gradientObj[curr]` with `arr[cellIdx[curr]]` (typed-array read, no string
  lookup). `gradientLookup` becomes `(n) => arr[cellIdx[n]]`.
- `runGradientBatches` returns `Map<destCell, Float32Array(V)>`; the worker
  result is already `__flat`-friendly → transfer the `Float32Array` buffers
  directly (also solves **C1**).
- `goalGradients` becomes `Map<destCell, Float32Array>`; `hasOrigin` checks
  `isFinite(arr[cellIdx[origin]])`.

**Impact:** memory drops from ~D×V×(string+number overhead) to D×V×4 bytes
(~5–10× smaller), and hot-path lookups become O(1) typed-array reads. **Risk:**
large refactor touching `dijkstra.js`, `compute.js`, `agentTasks.js`,
`spatialWorker.js`, `grid.js`, and the gradient-related tests
(`compute.test.js`, `csrBearingIndex.test.js`, `computeDesirePaths.test.js`).
Keep the string-keyed shape behind a thin adapter during migration if needed.

---

## 5. M2 — Exploit visibility symmetry in the BFS (PLANNED)

**Problem.** `computeVisibilityBearingCSRIndexed` runs a ring BFS from *every*
origin to `visionDepth`, recording `bearing(A→B)` for each discovered pair.
Visibility is symmetric (line-of-sight blocked by impassable cells is symmetric),
and `bearing(B→A) = (bearing(A→B) + 180) % 360`. The current code does 2× the
necessary BFS work — the dominant mapping-stage cost (O(N·d²), d=`visionDepth`).

**Fix.** Run the BFS from only the origins in one half of the index pairs
(e.g. `globalIdx[i] <= globalIdx[j]` by index), and for each discovered pair
`(A,B)` emit both `A→B` (bearing θ) and `B→A` (bearing (θ+180)%360) into their
respective CSR slices. The merge step (`mergeVisibilityBearingShards`) already
lays out disjoint origin rows, so writing both rows is a local change.
**Impact:** ~2× faster visibility/bearing at mapping time. **Risk:** the
sort-by-index step (`sortNeighborsSlice`) must sort both emitted slices; bearing
quantization must be applied to both θ and (θ+180)%360. Add a symmetry assertion
to `csrBearingIndex.test.js`.

---

## 6. M3 — Build the gradient graph CSR in a worker (PLANNED)

**Problem.** `getGradientGraph` (dijkstra.js) does a full `gridDisk(cell,1)` /
`gridRingUnsafe` pass over V cells to build the r=1 CSR. It is invoked on the
**main thread** during `computeDesirePaths` (via `computeDijkstraGradient` and
`getGradientDirection`/`getGraphNeighborIndicesR1`). At city scale that is
~V H3 neighbor calls blocking the UI.

**Fix.** The gradient graph is pure geometry (depends only on the AOI cell set,
not friction), exactly like `buildR1Adjacency` which already runs in a worker
(`runBuildR1Adjacency`, launched in parallel with the fast-scan in
`triggerFastScan`). Mirror that: add a `runBuildGradientGraph` worker task that
returns the CSR (`adjOffsets`/`adjNeighbors`/`cellToIdx`/`idxToCell`) as
transferables, and have `getGradientGraph` accept a prebuilt graph (or build it
lazily on the main thread only as a fallback). **Impact:** removes a main-thread
V-pass from the sim path. **Risk:** low; the graph is already a clean CSR and
`invalidateGradientGraph` keying is unchanged.

---

## 7. M5 — `_cellState` as parallel typed arrays (PLANNED, big steady-state win)

**Problem.** `state._cellState` is one plain object holding N per-cell entries
`{ friction, affordance, desire, multi }` (built in `computeDesirePaths` and
`grid.js`). At N≈5e5 that is ~500k small objects — the largest steady-state
memory consumer in the sim, plus poor cache locality and property-lookup
overhead in the hot path (`cellState[n].friction`).

**Fix.**
- `friction`/`affordance`/`desire` → three parallel `Float32Array(V)` indexed by
  `cellToIdx` (or a `viewHexes`-aligned index). Hot reads become
  `frictionArr[idx]` instead of `cellState[n].friction`.
- Drop `multi` from the hot state entirely: it is **never read** in the sim hot
  path (only written in `buildCellStateEntry` and read in `grid.js mapCells`,
  which uses `multiFrictionMap` directly). Keep it only in `multiFrictionMap`.
- `getFriction`/`getAffordance` closures become `idx = cellToIdx[cell];
  return frictionArr[idx]` (one `Map` lookup + one typed-array read).

**Impact:** removes ~500k objects (tens of MB) and improves hot-path locality.
**Risk:** high — touches `compute.js`, `agentTasks.js`, `grid.js`, `dijkstra.js`
hot paths and many tests that assert on `_cellState[cell]`. Migrate behind a
small accessor (`getCellFriction(state, cell)`) to keep tests stable.

---

## 8. S5 — Index-based origin–destination distances (PLANNED)

**Problem.** `precomputeOriginDestDistances` (`compute.js`) builds an
`o + '::' + d` → `gridDistance` object for all O×D pairs and is re-queried every
tick in `runSingleAgentPath`/`runAgentPath` via string concatenation +
`gridDistance` fallback.

**Fix.** Encode as a `Float32Array` (or `Int16Array`) indexed by
`originIdx * V + destIdx` using the gradient graph's `cellToIdx` for origins and
destinations. The per-tick lookup becomes `odArr[cellIdx[simCurrent] * V +
cellIdx[destCell]]` — no string concat, no `gridDistance` H3 call. **Impact:**
removes O×D string entries and per-tick `gridDistance` calls. **Risk:** low;
localized to `compute.js`/`agentTasks.js`.

---

## 9. C2 — Worker lat/lng cache eviction (PLANNED, minor)

**Problem.** `agentTasks.js` `_cellLatLngCacheObj` uses a periodic **full reset**
when `order.length > CELL_LATLNG_CACHE_MAX * 1.5` (`_clearLatLngCache`),
discarding all useful entries and causing a recompute storm. The main-thread
cache (`compute.js` `_cellLatLngCache`) already uses proper LRU (delete+re-set).

**Fix.** Port the LRU delete+re-set pattern to the worker cache (or share one
implementation). **Impact:** avoids cache thrash in the worker kernel. **Risk:**
trivial.

---

## 10. Test impact summary

| Change | Tests affected | Action |
|--------|----------------|--------|
| S2/S3/S4 (done) | `compute.test.js`, `agentBatchParity.test.js`, `mappingBuild.test.js`, `spatialTasks.test.js`, `spatialWorker.test.js`, `csrBearingIndex.test.js`, `computeDesirePaths.test.js` | ✅ all green (387 pass) |
| S1 | add worker-dispatch + bearing-reconstruction integration test | new |
| M1 | gradient shape changes | adapt `compute.test.js` (`_computeDijkstraGradient`), `computeDesirePaths.test.js`, `csrBearingIndex.test.js` |
| M2 | visibility symmetry | extend `csrBearingIndex.test.js` with symmetry assertion |
| M3 | gradient graph in worker | extend `mappingBuild.test.js` |
| M5 | `_cellState` shape | adapt many tests asserting `_cellState[cell]` → use accessors |
| S5/S8/C2 | localized | minimal |

---

## 11. Recommended sequencing

1. **Now (done):** S2, S3, S4 — safe, high-value, fully tested.
2. **Next:** S1 (off-main-thread ABM) — requires S3 + bearing CSR transfer;
   biggest UX win, preserves dynamics.
3. **Then:** M1 (gradient typed arrays) — biggest memory win; pairs with C1.
4. **Then:** M5 (`_cellState` typed arrays), M2 (visibility symmetry),
   M3 (gradient graph in worker), S5/C2 as follow-ups.

Each step is independently shippable and testable; M1/M5 are the architectural
refactors and should land behind thin accessors to keep the test surface stable.
