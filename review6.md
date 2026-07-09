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
| S1 | Sim | ABM loop runs on **main thread** (`runAgentBatches` `workerCount=1` → local `computeAgentBatch`) → UI freeze at city scale | Perf/UX | High | Med | **Implemented** (off-main-thread single-worker dispatch + graceful local fallback; node-verified, 387 pass) |
| S1-SAB | Sim | Large read-only inputs + result are structured-cloned/transferred per dispatch; reuse `allocTransferBuffer` (SAB when `crossOriginIsolated`) for zero-copy share | Mem/Perf | Med | Med | **Partial** (dispatch done; in-worker BearingIndex+VisibilityIndex reconstruction + SAB-aware friction inputs done & node-verified; result-buffer SAB + gradient SAB deferred — see §3 notes) |
| S2 | Sim | `getBestNextStep` (compute.js) allocates `weights` + 2 closures **per call** (millions×) | Perf/GC | High | Low | **Implemented** |
| S3 | Sim | `getBestNextStep` (agentTasks.js) allocates 5 arrays + 4 closures + `weights` **per call** | Perf/GC | High | Med | **Implemented** |
| S4 | Sim | `computeDijkstra` rebuilds `Float64Array(V)` friction per target → D×V transient alloc | Mem/Perf | High | Low | **Implemented** |
| M1 | Map | Gradients stored as `destCell → {cellId: distance}` string-keyed objects → D×V string entries | Mem/Perf | High | High | **Implemented** (typed-array `Float32Array(V)` via `gradientGet`; node-verified, 387 pass) |
| M2 | Map | Visibility BFS recomputed per-origin though visibility is symmetric | Perf | High | Med | Planned (§5) |
| M3 | Map | `getGradientGraph` CSR built on main thread during gradient batch | Perf | Med | Med | Planned (§6) |
| M5 | Map | `state._cellState` = N per-cell objects `{friction,affordance,desire,multi}` | Mem | High | High | Planned (§7) |
| S5 | Sim | `precomputeOriginDestDistances` O×D string-keyed object + `gridDistance` | Perf | Med | Low | Planned (§8) |
| C1 | X | `gradientsObj` (D×V) structured-cloned to worker, not flattened | Mem | Med | Med | Planned (ties M1; SAB-share once M1 lands, see §3) |
| C2 | X | Worker `_cellLatLngCacheObj` periodic full-reset discards useful entries | Mem | Low | Low | **Implemented** (Map LRU, mirrors compute.js) |

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

### M1 — Gradients as index-addressed typed arrays (IMPLEMENTED)

**File(s):** `src/helpers/dijkstra.js` (`computeDijkstra`, `getGradientGraph`,
new `gradientGet` / `gradientReachableCount`), `src/helpers/agentTasks.js`
(`getGradientDirection`, `getBestNextStep`, `computeAgentBatch`),
`src/helpers/compute.js` (`getGradientDirection`, `getBestNextStep`,
`getReachableDestinations`, `_computeAssignedCounts`, `addDestination`,
`computeDesirePaths` plan validation + unreachable check),
`src/helpers/spatialWorker.js` (`runAgentBatches` reachability check),
`src/helpers/spatialTasks.js` (`computeGradientBatch` now yields typed arrays).

**Evidence (before):** each destination's gradient was a plain object
`{ cellId: distance }`. With D destinations and V reachable cells this is
**D×V string-keyed entries** — gigabytes at city scale — and every hot-path
lookup (`gradientObj[curr]`, `gradientObj[n]`) was a string-keyed object
property access.

**Change:**
- `computeDijkstra` now returns a single `Float32Array(V)` indexed by the
  gradient graph's `cellToIdx` (value `Infinity` = unreachable) whenever a
  graph is supplied, instead of a `destCell → { cellId: distance }` object.
  The legacy object path is retained only for the no-graph fallback.
- `getGradientGraph` now **sorts** the passable cell list, so `cellToIdx` /
  `idxToCell` are deterministic for a given cell set. This is what lets a
  gradient typed-array be produced on the main thread and consumed in a worker
  that rebuilds the same graph from the same friction source — both arrive at
  identical indices (no per-cell `Map`/string lookup mismatch).
- A single representation-agnostic accessor `gradientGet(grad, cell, graph)`
  reads either the `Float32Array(V)` form or a legacy plain object (returns
  `Infinity` when unreachable/absent). Every consumer — main thread
  (`compute.js`) and the agent worker (`agentTasks.js`) — routes gradient
  reads through it, so the hot path is now an O(1) typed-array read and the
  two representations are interchangeable.
- `gradientReachableCount(grad)` replaces the old `Object.keys(grad).length`
  "walled-off destination" check so it works for both shapes.
- `runAgentBatches` builds the gradient graph from the (normalized) friction
  source and uses `gradientGet` for the origin-reachability check; the typed
  gradients are passed straight through to the worker (which indexes them with
  its own, identically-ordered graph).

**Why safe:** `gradientGet` falls back to the legacy object read, so any
plain-object gradient (e.g. tests, incremental-API caches) still works
byte-for-byte. The graph sort is deterministic and only reorders indices, so
all existing CSR consumers are unaffected. Output values are unchanged
(Dial's quantized distances are divided back by `GRADIENT_DIAL_SCALE`, heap
distances copied as-is).

**Impact:** gradient memory drops from ~D×V×(string+number overhead) to
D×V×4 bytes (~5–10× smaller), and hot-path lookups become O(1) typed-array
reads. This also **unlocks C1** — gradients are now flat typed arrays that can
be SAB-shared / transferred zero-copy once S1-SAB lands (see §3 SAB note).

**Verified:** 387 tests pass (node uses the local fallback, `useWorker=false`);
gradient values unchanged. Affected tests adapted to `gradientGet`:
`compute.test.js` (`_computeDijkstraGradient`), `spatialWorker.test.js`
(`computeDijkstraGradientSnapshot`, `computeGradientBatch`, `runGradientBatches`),
`spatialTasks.test.js` (`computeDijkstraGradientSnapshot`).

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

### S1 + SharedArrayBuffer (zero-copy inputs & result)

The app is already **cross-origin isolated** (COOP/COEP headers installed by
`public/coi-serviceworker.js`), and the mapping stage already has a
`allocTransferBuffer(byteLength)` helper (`spatialWorker.js:817`, mirrored in
`spatialTasks.js:475`) that returns a `SharedArrayBuffer` when
`globalThis.crossOriginIsolated === true` and a plain `ArrayBuffer` otherwise.
S1 should reuse that exact helper so the large, read-only inputs and the result
are **shared** with the worker instead of structured-cloned / memcpy'd. This is
the natural complement to S1: moving the loop off the main thread removes the
*blocking*, and SAB removes the *per-dispatch copy cost* of the data the loop
reads.

**What can be SAB-backed today (no other refactor required):**

1. **`frictionEntries` / `affordanceEntries`** are already flattened to a
   `Float32Array` by `flattenPayloadAndTransfers` (`spatialWorker.js:268`).
   Allocate that `vals` buffer via `allocTransferBuffer` so the worker reads the
   *same* memory the main thread built — no memcpy, and (unlike a transfer) the
   main thread keeps its own copy for the next run. Today `runWorker` *transfers*
   the `vals.buffer` (detaching it from the main thread); switching to SAB keeps
   it attached and shared.
2. **`visibilityEntries`, `neighborDisks`, and the packed bearing CSR**
   (`state._precomputedBearings.buffer`) are already typed arrays. Back their
   buffers with `allocTransferBuffer` and pass them in the payload; the worker
   reads them in place. No change to the worker kernel — it already consumes
   typed arrays.
3. **Result buffers (`pathDesire` / `perTargetContribs`).** These are already
   `__flat`-encoded `Uint32Array`s. Allocate their `vals` backing via
   `allocTransferBuffer` and pass the (empty) SAB *into* the payload; the worker
   writes directly into shared memory and posts a lightweight `{ ok: true }`
   with an **empty transfer list** (a SAB is shared by reference, never
   transferred). The main thread reads the result SAB immediately on resolution
   — the result is never copied across the boundary.

**What needs M1 first (gradients):**

4. **Gradients cannot be SAB-backed until M1 lands.** They are still
   `destCell → { cellId: distance }` string-keyed objects, so they are cloned
   (C1), not shared. Once M1 converts each gradient to a `Float32Array(V)`,
   allocate those arrays on a `SharedArrayBuffer` and share them — this closes
   C1 at **zero copy** (today C1 is "solved" only by flattening + transfer,
   which still memcpy's D×V floats). Until M1, gradients keep the existing
   structured-clone path; SAB for gradients is a drop-in once the array shape
   exists.

**Optional: `accumulatedFootprints` as SAB (live emergent-wear viz).**

5. The run is single-worker and the main thread `await`s completion, so the
   footprints SAB is *only* mutated by the worker during the run and *only* read
   by the main thread after resolution — there is no concurrent access, so no
   `Atomics`/locking is required. Backing it with SAB lets the UI render emergent
   wear live (or at least without a second round-trip) and avoids cloning the
   footprint structure. Keep the local-fallback path on a plain `ArrayBuffer`.

**Graceful fallback (unchanged behavior).** When `crossOriginIsolated` is false
(e.g. dev server without COOP/COEP, or `Worker` undefined in Node tests),
`allocTransferBuffer` returns a plain `ArrayBuffer` and the existing
transfer / structured-clone path is used verbatim. Node tests hit the local
fallback (`Worker` undefined) → no behavior change; the SAB branch is exercised
only by a browser/worker integration test under COOP/COEP.

**SAB-aware dispatch shape:**
```js
const useWorker = typeof Worker !== 'undefined';
const isolated = globalThis.crossOriginIsolated === true;
// allocTransferBuffer → SharedArrayBuffer when isolated, else ArrayBuffer
// (mirrors spatialWorker.js:817). Reuse it for every large buffer below.
const resultPathDesire = new Uint32Array(allocTransferBuffer(nTargets * 4));
const resultPer = new Uint32Array(allocTransferBuffer(nContribs * 4));
// friction/affordance/visibility/neighborDisks/bearing CSR buffers also
// allocated via allocTransferBuffer and shared (not transferred).
if (!useWorker) {
  const ret = computeAgentBatch({ /* …local, resultBuffers… */ });
  return normalizeAgentResult(ret?.result ?? ret);
}
try {
  const ret = await runWorker('agent-batch', {
    plan, frictionEntries, gradients, affordanceEntries, hexCount,
    visibilityEntries, neighborDisks, options, accumulatedFootprints,
    originDestDistances, bearingMap,
    resultBuffers: { pathDesire: resultPathDesire, perTargetContribs: resultPer },
  });
  // ret.result is now just a lightweight descriptor; the data lives in the
  // shared resultBuffers the main thread already holds.
  return normalizeAgentResult(ret?.result ?? ret, resultBuffers);
} catch (err) {
  const ret = computeAgentBatch({ /* …local… */ });
  return normalizeAgentResult(ret?.result ?? ret);
}
```

**Note on `runWorker` transfer list.** `runWorker` currently builds its transfer
list from `flattenPayloadAndTransfers` and posts `{ kind, payload }, transfer`.
For SAB inputs the transfer list is empty (SABs are shared, not transferred), so
no change to `runWorker` is needed for the *input* side — only the worker's
*result* post must stop transferring the result buffers (post `{ ok: true }`
with no transfer list) since they are now shared. The `agent.worker.js` result
post (`agent.worker.js:41-45`) already branches on `ret.transfers`; when the
result is SAB-backed, `ret.transfers` is `[]` and the existing branch posts
without a transfer list — correct for SAB.

### S1 — implementation status (2026-07-09)

The off-main-thread dispatch is **implemented** in `spatialWorker.js`
`runAgentBatches`:
- A single `agent-batch` worker is dispatched via `runWorker` whenever
  `typeof Worker !== 'undefined'`; otherwise (Node tests / SSR) it falls back
  to a synchronous `computeAgentBatch` on the main thread — behavior is
  identical. A `try/catch` around the dispatch also falls back to local on
  worker failure.
- A shared `normalizeAgentResult` helper (extracted from the old inline
  normalization) is used by **both** paths, so the worker and local results
  are shaped identically.
- **Verified:** 387 tests pass (node uses the local fallback, `useWorker=false`).
  The browser worker path is implemented but **not yet browser-verified**; add
  the integration test from §10 (`S1` row) before relying on it in production.

### S1-SAB — implementation status (2026-07-09)

The zero-copy / in-worker-index work is **partially implemented** and
**node-verified** (387 tests pass; a standalone script confirmed the
in-worker reconstruction produces byte-identical sim output to the local path):

- **In-worker BearingIndex + VisibilityIndex reconstruction (option 1 in §3) —
  DONE.** The precomputed `bearingMap` / `visibilityMap` are `BearingIndex` /
  `VisibilityIndex` **Proxies** whose function-valued traps are dropped by
  structured-clone, so posting them to a worker silently degraded *every*
  bearing/visibility lookup to the slow trig / path-cell fallback. Fixed by
  shipping the raw packed visibility/bearing CSR buffer (`state._visibilityBearingCSR`)
  plus the exact AOI cell order (`state._viewHexes`) to the worker, which
  rebuilds **both** indices in-process via `reconstructVisibilityBearing`
  (extracted into a new `src/helpers/bearingIndex.js` so the worker kernel can
  import it without a circular dependency through `grid.js`). The local path
  still passes the reconstructed indices directly; the worker path passes the
  CSR + `viewHexes` and reconstructs.
- **SAB-aware friction flattening — DONE.** `flattenPayloadAndTransfers`
  now backs the flattened `frictionEntries`/`affordanceEntries` `vals` buffer
  with `allocTransferBuffer`, so it is a `SharedArrayBuffer` (shared zero-copy)
  when `crossOriginIsolated` and a plain `ArrayBuffer` (transferred, as before)
  otherwise. A SAB is never placed in the transfer list (that would throw).
- **Deferred (need COOP/COEP browser verification, not exercisable in node):**
  - **Result-buffer SAB** (`pathDesire` / `perTargetContribs`): the value
    arrays can be SAB-shared, but the *keys* (cell ids) still need to cross the
    boundary, so this is a partial win and is left for the browser integration
    test.
  - **Gradient SAB (closes C1):** gradients are now flat `Float32Array(V)`
    (M1), so they *can* be SAB-shared; allocating them on a SAB and sharing
    zero-copy is a drop-in follow-up once the worker path is browser-verified.
  - **`visibilityEntries` / `neighborDisks` SAB:** these are already typed
    arrays; backing their buffers with `allocTransferBuffer` is mechanical once
    the worker path is browser-verified.

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

## 9. C2 — Worker lat/lng cache eviction (IMPLEMENTED, minor)

**Problem.** `agentTasks.js` `_cellLatLngCacheObj` uses a periodic **full reset**
when `order.length > CELL_LATLNG_CACHE_MAX * 1.5` (`_clearLatLngCache`),
discarding all useful entries and causing a recompute storm. The main-thread
cache (`compute.js` `_cellLatLngCache`) already uses proper LRU (delete+re-set).

**Fix.** Ported the LRU delete+re-set pattern to the worker cache: replaced the
`Object.create(null)` + order-array + periodic full reset with a `Map` whose
insertion order == recency. On a hit we `delete`+`set` to move the entry to
the most-recently-used end, and evict the oldest (first) key on overflow. No
periodic full reset, so useful entries are retained across AOI pans. **Risk:** trivial
— the worker is single-threaded and processes one batch at a time, so the
module-level `Map` is safe to reuse. **Verified:** 387 tests pass (the cache
is exercised by every agent-batch run; no behavior change, only eviction policy).

---

## 10. Test impact summary

| Change | Tests affected | Action |
|--------|----------------|--------|
| S2/S3/S4 (done) | `compute.test.js`, `agentBatchParity.test.js`, `mappingBuild.test.js`, `spatialTasks.test.js`, `spatialWorker.test.js`, `csrBearingIndex.test.js`, `computeDesirePaths.test.js` | ✅ all green (387 pass) |
| S1 | add worker-dispatch + bearing-reconstruction integration test | new |
| S1-SAB | add COOP/COEP browser test: SAB-backed inputs/result shared zero-copy; assert `crossOriginIsolated` path + plain-`ArrayBuffer` fallback | new |
| M1 | gradient shape changes | adapt `compute.test.js` (`_computeDijkstraGradient`), `computeDesirePaths.test.js`, `csrBearingIndex.test.js` |
| M2 | visibility symmetry | extend `csrBearingIndex.test.js` with symmetry assertion |
| M3 | gradient graph in worker | extend `mappingBuild.test.js` |
| M5 | `_cellState` shape | adapt many tests asserting `_cellState[cell]` → use accessors |
| S5/S8/C2 | localized | minimal |

---

## 11. Recommended sequencing

1. **Done:** S2, S3, S4 — safe, high-value, fully tested.
2. **Done:** S1 (off-main-thread ABM) — preserves dynamics; **M1** (gradient
   typed arrays) — biggest memory win, now implemented and tested.
3. **Next:** **S1-SAB** — reuse `allocTransferBuffer` so friction/affordance/
   visibility/neighborDisks/bearing CSR and the result buffers are SAB-shared
   when `crossOriginIsolated` (zero copy), with the plain-`ArrayBuffer` transfer
   path as fallback. Requires the in-worker `BearingIndex` reconstruction
   (option 1 in §3) and a COOP/COEP browser test. M1 now makes gradients
   flat typed arrays, so **C1 closes at zero copy** once S1-SAB lands.
4. **Then:** M5 (`_cellState` typed arrays), M2 (visibility symmetry),
   M3 (gradient graph in worker), S5/C2 as follow-ups.

Each step is independently shippable and testable; M1/M5 are the architectural
refactors and should land behind thin accessors to keep the test surface stable.
