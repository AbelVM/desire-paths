# Review 12 — desire-paths ABM Simulator

**Scope:** Full review of the existing interactive pedestrian-desire-path ABM
(friction-field mapping → gradient Dijkstra → agent walk kernel → emergent
wear). Covers optimizations, design weaknesses, alternatives, bugs, performance,
memory, correctness, robustness, code quality, and architecture.

**Method:** Read every module under `src/helpers/`, `src/workers/`, `src/main.js`,
`vite.config.js`, `package.json`, and the `tests/` suite. Findings are grounded
in the actual code, not assumptions.

**Severity legend:** 🔴 crash/incorrect result · 🟠 correctness/robustness risk ·
🟡 design/perf debt · ⚪ nit.

---

## 0. Executive summary (ranked)

| # | Severity | Area | Finding | Status |
|---|----------|------|---------|--------|
| 1 | 🔴 | Bugs | `clearSurfaceEditions()` nulls `_baseFrictionArr` *before* `applySurfaceEdits()`, which early-returns on missing base → "Clear all surfaces" leaves the painted friction on the mesh. | ✅ Fixed |
| 2 | 🔴 | Bugs | `getBestNextStep()` fallback (lines 467–493) `return getBearingFast(...)` returns a **number**, not a cell. When the only passable neighbors are behind a wall (visible-set empty but `gridDisk` finds them), `runAgentPath` feeds that number into `gridPathCells` → throws. Should return `bestCandidate`. | ✅ Fixed + regression test |
| 3 | 🟠 | Correctness | **CORRECTED.** Original claim (blur pushes `PAVEMENT` 1.0 → `4.0` → `HEAVY_GRASS`) is **wrong**. With `IMPASSABLE_BLUR_RADIUS=1` and `SIGMA=1.0`, only dist-1 neighbors are blurred at gaussian weight `exp(-0.5·(1/1)²)=0.6065`, so blurred friction = `min(IMPASSABLE-1, 1.0 + 0.6065·3.0) = 2.8196`, which `classifyFrictionTier` returns as **`light_park`** (since 2.8196 < 3.25), not `heavy_grass`. The real, smaller concern: blurred pavement (1.0→2.82) still crosses the `pavement`→`light_park` tier boundary, so affordance reclassifies (1.0→0.6) and `updateAffordance`/`decayAffordance` no longer skip it (they skip only exact `PAVEMENT`/IMPASSABLE). Blur changes *tier at all*, not the overstated heavy_grass flip. | Open |
| 4 | 🟠 | Robustness | `runVisibilityBearingTask` / `runBuildMappingGraph` / `runMergeCellsTask` had **no retry/fallback**, unlike `runFastScanTask` (PowerRetry + local fallback). One hung worker there killed the whole mapping. | ✅ Done — `runWorkerWithRetry` (PowerRetry 3 attempts + local fallback) wraps gradient-batch, mapping-graph, visibility-bearing-indexed, merge-cells |
| 5 | 🟡 | Perf | `reconstructVisibilityBearing()` built a 500k-entry `cellToIndex` Map + two Proxies **every agent batch**, even though the indexed kernel (S1, the default) ignores them. | ✅ Done — only called in the non-Worker (Node/SSR) fallback; the default worker path rebuilds indices from `visibilityBearingCSR`+`viewHexes` |
| 6 | 🟡 | Perf | Visibility/Bearing CSR was released and fully rebuilt on **every** `computeDesirePaths` run (dominant cost), even when only `visionDepth` was unchanged. | ✅ Done — cached on `state._visibilityBearingCSR` keyed by `(mappingGeneration, visionDepth)`; rebuilt only when invalidated; dropped on surface edits |
| 7 | 🟡 | Architecture | `getGradientGraph` is identity-keyed, but `normalizeFrictionEntries` turns the `cellFrictionMap` (Map) into a plain object before shipping to workers, so the graph is rebuilt in every realm that receives a normalized copy. Comments overstate "single build per run". | ✅ Done — `state.frictionArr` is now SAB-backed when cross-origin isolated (grid.js `allocFrictionArray`); shipped directly to the worker (spatialWorker.js `runAgentBatches`/`runGradientBatches` pass the SAB through, no per-batch copy); `getGradientGraphFromArray` builds the graph from the typed array and keys the cache on the **stable SAB buffer identity** (`frictionArr.buffer`), so the worker builds the graph ONCE per run and reuses it across every agent/gradient batch. Array path is gated on SAB so non-COI keeps the prior normalized-object behavior (no regression). Covered by `tests/gradientGraphCache.test.js`. |
| 8 | 🟡 | Architecture | `DesireMap` Proxy hides all state keys from `ownKeys`/`getOwnPropertyDescriptor`. Intentional, but breaks `for…in`/`Object.keys`/`JSON.stringify`/spread and any `hasOwnProperty` consumer; a footgun for future libs. | ✅ Done — domain state keys are now real, enumerable accessor properties on the `DesireMap` instance (delegating to the `_state` bag); the custom `ownKeys`/`getOwnPropertyDescriptor` Proxy traps were removed, so `Object.keys`/`for…in`/`JSON.stringify`/`hasOwnProperty` correctly see domain state and the `has`/descriptor contract is consistent. Write-through to the underlying map for known keys is preserved. Covered by `tests/integration.test.js` ("should expose domain state as enumerable own properties"). |
| 9 | 🟡 | Code quality | Large volume of comments reference opaque internal tags (`review10 §3.1`, `P1`, `S1`, `M3`…) not present in the repo — a knowledge silo. Some comments are stale/contradictory (e.g. `WEIGHTS` calibration note mentions `w_f` which doesn't exist). | ✅ Done — stale `classifyFrictionTier` header + `WEIGHTS` `w_f` calibration note rewritten to current behavior; `reviews/INDEX.md` tag glossary added so comments self-resolve |
| 10 | 🟡 | Dead code | `mapPolygonCells`/`mapLineCells`/`mapCells` (legacy obstacle drawing) and `initializeAffordanceMap` appear unused now that Surface Edition owns drawing. `getCellType()` in `map.js` duplicates `classifyFrictionTier`. | ✅ Done (partial) — genuine duplicate `getCellType` removed (callers use `classifyFrictionTier`); legacy `mapPolygonCells`/`mapLineCells`/`mapCells`/`initializeAffordanceMap` retained as public `DesireMap` API (exposed in `main.js`, covered by `gridObstacles.test.js`/`compute.test.js`/`integration.test.js`) |
| 11 | 🟠 | Memory/Leak | `surfaceEdition.js` adds `window.resize` + `rawMap.on('mousemove')` listeners with **no cleanup**; `initSurfaceEdition` re-entry (or HMR) stacks them. `state._flatPool`/`_flowPool` grow but never shrink. | ✅ Done — `initSurfaceEdition` returns `destroy()` removing all global/maplibre/terra-draw/DOM listeners; `resetSimulationState` calls `map._surfaceEdition?.destroy?.()`; layer-data builder shrinks `_flatPool`/`_flowPool` via in-place `length=` truncate when AOI shrinks |
| 12 | 🟡 | Design | "Cross-wave footprint persistence" (`state._footprintBuffer` SAB) is aspirational — `runAgentBatches` runs a **single** wave per call, so the SAB/Atomics machinery only serves intra-batch ABM (which a plain `Uint32Array` already provides). | ✅ Done — `runAgentBatches` now runs the plan in **K ordered waves** (`runParallelAgentWaves`): each wave shards across workers concurrently, but every wave `await`s the previous so later waves read earlier wear from the shared SAB `state._footprintBuffer`. `splitPlanIntoWaves` interleaves so **every wave contains agents from every origin/dual node**; `computeWaveCount` derives K from origin count + `agentsPerWeightUnit` (no new param). |

The codebase is genuinely well-engineered for its hardest problem (city-scale
H3 simulation without SIGILL): the CSR/zero-copy/SAB strategy, Dial's queue,
typed-array friction store, and worker pool are all sound. The issues below are
refinements and a few real defects, not a rewrite.

---

## 1. Optimizations

### What is already good
- **Typed-array friction store** (`frictionStore.js`): `FrictionArrayMap` view over
  `Float32Array` + `cellToIdx` collapses four parallel containers into one index
  Map + two arrays. Correct and memory-efficient.
- **Dial's algorithm** (`dijkstra.js`): right choice for degree-6, small-weight
  graphs; pooled `dialDist`/`visited`/`buckets` avoid D×V allocations.
- **CSR visibility/bearing** (`spatialTasks.js` + `bearingIndex.js`): integer-index
  BFS + binary-search lookups replace per-pair Maps; `Uint16` quantized bearings.
- **Zero-copy SAB payloads** (`flattenPayloadAndTransfers`, `packCSR`): friction/
  affordance/visibility shipped as SAB when cross-origin isolated.
- **LRU/flat caches** (`agentTasks.js` `_cellLatLngCache`, `_pathCache`,
  `_diskCache`; `constants.js` `_surfaceCache`): bounded, correct eviction.
- **Module-level reusable candidate buffers** in `getBestNextStep` — eliminates
  per-call array churn on a hot path that runs millions of times.
- **Worker pool** with idle reaping, per-kind caps, latency histograms, and
  PowerRetry on fast-scan chunks.

### Missed / partial optimizations
- **#5 / #6** (above): ✅ **Implemented.** The visibility CSR is now cached across
  runs keyed by `(mappingGeneration, visionDepth)` (rebuilt only when invalidated,
  dropped on surface edits), and `reconstructVisibilityBearing` is skipped on the
  default worker path (the indexed kernel reads the raw CSR directly; the Map/Proxy
  rebuild runs only in the non-Worker Node/SSR fallback). See §5 and §8.
- **`precomputeOriginDestDistances`** is `O(O·D)` `gridDistance` calls at sim
  start. For many nodes this is a noticeable one-time stall; it can be computed
  lazily/on-demand or memoized per `(origin,dest)` pair as actually queried.
  — 🟡 Open (not yet implemented).
- **`renderInterfacePins`** recomputes the AOI polygon and re-projects every node
  on *every* `mousemove` during a drag (`ui.js` `handleDragMove`). Throttle to
  rAF and only re-project the dragged node. — 🟡 Open (not yet implemented).
- **`map.js updateLayers`** rebuilds `flatData`/`flowData` whenever
  `_layerDataVersion` changes. The version is bumped on many operations; some
  bumps (e.g. friction-mesh toggle) are already correctly skipped, but
  `applySurfaceEdits` bumps it on *every* edit even when the edit touches a
  different cell subset — consider a targeted dirty-region update instead of a
  full rebuild. — 🟡 Open (not yet implemented).
- **`getGradientGraph` double-build (#7)**: pass the already-built graph (or its
  identity) across the worker boundary instead of re-deriving it from a
  normalized copy. At minimum, stop normalizing the `cellFrictionMap` into a
  plain object for the gradient/agent batches and instead ship the SAB-backed
  `frictionArr` + `cellToIdx` (the worker already builds the graph from
  `frictionEntries`; give it the typed array directly). — ✅ Done (#7).

---

## 2. Design weaknesses

 1. **Big-bag-of-state.** `state` (`map._state`) is a plain object holding Maps,
    typed arrays, and ~40 `_`-prefixed fields, mutated ad-hoc from `grid.js`,
    `compute.js`, `map.js`, `ui.js`, `surfaceEdition.js`. No ownership, no
    invariants. A `SimulationState` class with explicit methods would localize
    the mutation rules (e.g. "editing friction invalidates gradient graph +
    gradient cache + bumps layer version") that are currently duplicated in
    `mapCells`, `applySurfaceEdits`, `applySurfaceOverride`, and `clearComputeCaches`.
    — 🟡 Open (partial: #8 Proxy retained intentionally; #2.1 state-ownership
    centralization not yet done).

  2. **Blur crosses tier boundaries (#3) — CORRECTED.** The original review
     claimed `IMPASSABLE_BLUR_FRICTION_ADD = 3.0` makes a pavement cell next to a
     building become friction `4.0` → `classifyFrictionTier` returns `heavy_grass`.
     **That is incorrect.** The blur is applied with a gaussian weight per
     neighbor: with `IMPASSABLE_BLUR_RADIUS = 1` and `SIGMA = 1.0`, only the
     dist-1 neighbors are blurred, each at weight `exp(-0.5·(1/1)²) = 0.6065`. So
     a pavement cell (1.0) next to a building gets
     `min(IMPASSABLE-1, 1.0 + 0.6065·3.0) = 2.8196`, which `classifyFrictionTier`
     returns as **`light_park`** (threshold is `(LIGHT_PARK+HEAVY_GRASS)/2 = 3.25`,
     not 4.0). The review's `4.0`/`HEAVY_GRASS` figure treated the add factor as a
     flat `+3.0` and ignored both the gaussian weight and the tier midpoint.

     The **real, smaller** concern remains: blurred pavement (1.0 → 2.82) still
     crosses the `pavement`→`light_park` tier boundary, so the affordance tier
     reclassifies (1.0 → 0.6) and `updateAffordance`/`decayAffordance` no longer
     skip the cell (they skip only exact `FRICTION_COSTS.PAVEMENT`/IMPASSABLE), so
     a "blurred pavement" cell gets worn as if it were light park. Either cap the
     blurred friction below the `pavement`/`light_park` midpoint (1.75), or apply
     the blur as a *routing-only* penalty that does not feed `classifyFrictionTier`.
     — 🟠 Open (analysis corrected; fix not yet applied).

 3. **`DesireMap` Proxy (#8).** Clever (keeps `maplibre` methods working while
    routing domain state through one bag), but the `ownKeys`/`getOwnPropertyDescriptor`
    hiding of state keys is a latent hazard: any consumer doing
    `Object.keys(map)`, `for (const k in map)`, `JSON.stringify(map)`, or
    `hasOwnProperty` will not see domain state, and the `has`/`getOwnPropertyDescriptor`
    asymmetry (`has` returns true, descriptor undefined) is a Proxy-invariant
    smell. A plain class with explicit getters/setters (or just storing state on
    the map instance) would be simpler and safer. — ✅ Done (#8): domain state keys
    are now real enumerable accessor properties; the custom `ownKeys`/
    `getOwnPropertyDescriptor` traps were removed. Covered by
    `tests/integration.test.js`.

 4. **Cross-wave persistence (#12) — now implemented.** `runAgentBatches` runs the
    plan in **K ordered waves** (`runParallelAgentWaves`): each wave shards its
    agent subset across workers and runs concurrently, but every wave `await`s the
    previous one, so later waves read the wear earlier waves committed to the shared
    SAB `state._footprintBuffer` (via `Atomics.add` when cross-origin isolated).
    `splitPlanIntoWaves` interleaves agent counts round-robin so **every wave
    contains agents from every origin/dual node** — the ABM "later agents follow
    earlier trails" feedback is now real in the parallel path, not just intra-batch.
    `computeWaveCount` derives K from the origin count and `agentsPerWeightUnit`
    (no new user-facing param). The SAB/Atomics machinery is therefore justified by
    both the cross-wave ordering and the cross-worker shard sharing.

 5. **Two sources of truth for sim params.** `SIMULATION_PARAMS` (module, mutated
    by `updateSimulationParams`) and `state.simulationParams` (snapshot) can
    diverge; `setupUI` re-syncs them but the duplication is fragile. Make
    `state.simulationParams` the only live object and have `updateSimulationParams`
    write through to it. — 🟡 Open (not yet implemented).

 6. **Stale/misleading comments.** `WEIGHTS` block (constants.js:80–83) gives
    calibration advice referencing `w_f` (doesn't exist; the weights are `w_a`,
    `w_d`, `w_theta`). The `classifyFrictionTier` header recounts a bug that was
    already fixed. Trim comments to current behavior. — ✅ Done (#9): stale
    `classifyFrictionTier` header + `WEIGHTS` `w_f` note rewritten; `reviews/INDEX.md`
    tag glossary added.

---

## 3. Alternatives (recommended)

- **State management:** replace the `_state` bag + Proxy with a small
  `SimulationStore` (or even just a typed class). Keeps the maplibre adapter
  simple and removes the Proxy footguns. — 🟡 Open (related to #2.1/#8; #8 Proxy
  footgun removed by making state real accessor properties, but the full
  `SimulationStore` refactor / #2.1 centralization is not done).
- **Worker RPC:** the hand-rolled `{kind, payload}` + `postMessage` protocol in
  `spatialWorker.js` is fine, but a thin typed wrapper (or Comlink) would remove
  the `runLocally`/`runWorker` branching duplication and the manual
  `normalizeAgentResult` reshaping. — 🟡 Open (not yet implemented; optional).
- **Gradient speed:** Dial's is already near-optimal; if gradients become the
  bottleneck at very large N, a contraction hierarchy or precomputed
  all-pairs-to-destinations (destinations are few) would beat per-destination
  Dijkstra. Not needed today. — ⚪ Deferred (not needed at current scale).
- **Node hit-testing:** `findNodeAtScreenPoint` (`ui.js`) is O(N) per mousemove.
  N is small (handful of pins), so fine; if pins scale to hundreds, index them in
  a grid/quadtree. — ⚪ Deferred (N small today).
- **Rendering:** deck.gl `H3HexagonLayer` is appropriate. If layer rebuilds
  stutter, consider `ScatterplotLayer`/`ColumnLayer` with pre-baked geometries
  or `updateTriggers` keyed to a content hash rather than a monotonic version.
  — 🟡 Open (optional; see also §5 `updateLayers` dirty-region item).
- **Surface Edition storage:** edits store the *full cell list* per feature
  (`edit.cells`). For many large polygons this is O(total edited cells) per
  re-apply. A coverage bitmap or a per-edit `Set` with a union dirty-set is
  equivalent and cheaper to re-apply incrementally. — 🟡 Open (optional).

---

## 4. Bugs

 1. **🔴 `clearSurfaceEditions` doesn't reset friction (#1).**
    `grid.js`:
    ```js
    export function clearSurfaceEditions(state) {
      state.surfaceEdits = new Map();
      state._baseFrictionArr = undefined;   // <-- nulls base
      state._baseAffArr = undefined;
      applySurfaceEdits(state);             // <-- early-returns: !base
    }
    ```
    `applySurfaceEdits` early-returns when `!base`, so the friction/affordance
    fields keep the last painted values. The "Clear all surfaces" button (and
    `resetSimulationState`) therefore leave the mesh showing the old paint until a
    full remap. **Fix:** restore from base *before* nulling it, or have
    `applySurfaceEdits` treat "empty edits + no base" as "reset everything to the
    last known base snapshot" by keeping a separate `_lastBaseFrictionArr`.
    — ✅ Fixed.

 2. **🔴 `getBestNextStep` fallback returns a bearing, not a cell (#2).**
    `agentTasks.js:467–493`:
    ```js
    if (cellsArr.length === 0) {
      for (let depth = 1; depth <= 3; depth++) {
        …
        if (bestCandidate) return getBearingFast(curr, bestCandidate, bearingMap); // number!
      }
      return null;
    }
    ```
    `runAgentPath` then does `_resolveStepLine(simCurrent, nextStep, …)` →
    `gridPathCells(curr, <number>)` → throws. Reachable when the agent's only
    passable neighbors are behind a wall (visible-set empty, but `gridDisk`
    finds them). **Fix:** `return bestCandidate;`. (Also note the fallback ignores
    visibility, so it can pick a non-walkable cell — `resolveStepLine` already
    handles corner-cutting, so returning the cell is correct.)
    — ✅ Fixed + regression test.

  3. **🟠 Blur tier flip (#3) — CORRECTED.** See §2.2. The original claim that
     pavement next to a building becomes `HEAVY_GRASS` after blur is wrong: the
     gaussian-weighted blur yields `light_park` (2.82), not `heavy_grass`. The
     genuine issue is that blur still crosses the `pavement`→`light_park` boundary.
     — 🟠 Open (analysis corrected; fix not yet applied).

  4. **🟠 `updateAffordance`/`decayAffordance` tier check is fragile.** They skip
     cells where `friction === FRICTION_COSTS.PAVEMENT` (1.0) or `IMPASSABLE`. A
     blurred pavement cell has friction ≈2.82 (`light_park`), so it is *not* skipped
     and gets worn like light park — inconsistent with the "permanent
     infrastructure" intent. — 🟠 Open (part of #3; fix not yet applied).

 5. **🟡 `getGradientGraph` cache key ignores `r1Adjacency`/`viewHexes` (#7).**
    Two calls with the same `cellSource` but different `r1Adjacency` (null vs
    provided) return the same cached graph. Today the same source always pairs
    with the same adjacency within a run, so it's benign — but it's a latent
    correctness trap if that ever changes. — ✅ Done (#7): the worker now builds
    the graph from the SAB-backed `frictionArr` keyed on buffer identity; the
    main-thread `getGradientGraph` (Map/object path) is unchanged and still
    identity-keyed per realm.

 6. **🟡 `precomputeOriginDestDistances` includes `o===d` skip but still
    allocates `O*D` Infinity matrix.** Fine for modest O/D; at city scale with
    hundreds of nodes this is hundreds-of-thousands of floats allocated every run.
    Acceptable, but worth a sparse structure if node counts grow.
    — 🟡 Open (not yet implemented).

---

## 5. Performance

- **Visibility CSR rebuild every run (#6):** ✅ **Implemented.** `computeDesirePaths`
  now caches the packed CSR on `state._visibilityBearingCSR` (keyed by
  `mappingGeneration` + `visionDepth`) and only rebuilds when invalidated; the
  end-of-run `= null` release was removed. Surface edits (`applySurfaceEdits`,
  `clearSurfaceEditions`) null the cache to force a rebuild.
- **Unused `reconstructVisibilityBearing` per batch (#5):** ✅ **Implemented.**
  `getMainThreadVisibilityBearing` only calls `reconstructVisibilityBearing` when
  `typeof Worker === 'undefined'` (Node/SSR non-worker fallback); the default
  worker dispatch path rebuilds indices from `visibilityBearingCSR`+`viewHexes` in
  `agentTasks.js` and never reads the Proxies.
- **`getGradientGraph` re-derivation (#7):** ship the typed-array graph
  components to workers instead of a normalized plain object. — ✅ Done (#7):
  `state.frictionArr` is SAB-backed when cross-origin isolated and shipped
  directly; `getGradientGraphFromArray` keys the cache on the stable SAB buffer.
- **`renderInterfacePins` per-drag-move O(N) reproject (#1.Opt):** throttle.
  — 🟡 Open (not yet implemented).
- **`updateLayers` full flat/flow rebuild** on every version bump — consider
  dirty-region or content-hash `updateTriggers`. — 🟡 Open (not yet implemented).
- **`map.js` `getScore`/`getPathScore`** do `typeof x.get === 'function'`
  branching on every cell of every rebuild — fine, but the per-cell
  `frictionMap.get(h)` Map lookup in the hot render loop could read the
  `Float32Array` directly when `_frictionObj` is the canonical array view.
  — 🟡 Open (not yet implemented).

---

## 6. Memory leaks

 1. **🟠 `surfaceEdition.js` listener leak (#11):** `window.addEventListener('resize', positionModeBadge)`
    and `rawMap.on('mousemove', …)` are added in `initSurfaceEdition` with no
    removal. Re-entry (HMR, or re-init) stacks them. Add a teardown returned from
    `initSurfaceEdition` and call it from `resetSimulationState`/`terminateAllWorkers`.
    — ✅ Done (#11): `initSurfaceEdition` returns `destroy()`; `resetSimulationState`
    calls `map._surfaceEdition?.destroy?.()`.
 2. **🟡 `state._flatPool` / `_flowPool` never shrink.** They grow to the largest
    AOI seen and stay there after the AOI shrinks. Reallocate (or cap) on remap.
    — ✅ Done (#11): layer-data builder shrinks `_flatPool`/`_flowPool` via
    in-place `length=` truncate when the AOI shrinks.
 3. **🟡 Debug globals:** `window.__map` (`main.js`, "TEMP DEBUG"),
    `window.__td` (`surfaceEdition.js`, "TEMP DEBUG"), and the `window.__dp_*`
    hooks (`spatialWorker.js`) ship in production. Gate behind
    `import.meta.env.DEV` or remove. — 🟡 Open (not yet implemented).
 4. **🟡 Module-level caches persist for app lifetime** (`_cellLatLngCache`,
    `_pathCache`, `_diskCache`, `_polyCellsCache`, `_surfaceCache`,
    `_graphCache`). Bounded, so not leaks, but `_graphCache` holds a full CSR
    (typed arrays) — ensure `invalidateGradientGraph` is always called on remap
    (it is, via `clearComputeCaches`). — 🟡 Note (bounded; not a leak; invalidation
    verified).
 5. **🟡 `DesireMap` Proxy + `window.__map`** keep the entire simulation state
    reachable from a global for the page lifetime — acceptable for a SPA, but
    means nothing is GC'd until unload. — 🟡 Note (acceptable for SPA; #8 removed
    the Proxy footgun but `window.__map` debug global remains, see #3 above).

---

## 7. Correctness (broader)

- **Gradient graph structural parity is maintained** across realms: both the
  main-thread (Map-keyed) and worker (plain-object-keyed) graphs iterate
  `viewHexes` in order, so `cellToIdx`/`idxToCell` are identical and
  `gradientGet(grad, cell, planGraph)` is correct even though `grad` was built by
  the worker's graph. Good — this is the subtle invariant that makes the
  SAB/zero-copy split work.
- **Indexed vs string kernel parity** is well-argued: candidate *set* is
  byte-identical; at `temperature=0` selection is enumeration-order-independent
  (lexicographic cell-id tiebreak), so paths match; at `temperature>0` the
  *distribution* matches (the comment cites ~4.5% aggregate deviation / ~86%
  cell-set overlap). This is an accepted, documented divergence — fine, but it
  should be called out in user-facing docs as "stochastic runs are not
  byte-reproducible across kernel versions".
- **`applyPathDesireDeltas` / `updateAffordance`** accumulate into
  `pathDesireScores` and the affordance array correctly; the
  `emergentWear` gate is respected.
- **`deriveCellFrictionFromLayers`** (MIN across layers of per-layer MAX) is
  correct for "highest restriction per level, min across levels" and is
  sharding-independent (the old min-of-mins bug is fixed).
 - **`classifyFrictionTier`** is now the single classifier (good), but see §2.2
   for the (corrected) blur-tier side effect: blur crosses `pavement`→`light_park`
   (not `heavy_grass` as originally claimed).
- **`runAgentPath` stuck handling:** `stuckCount` increments only when
  `nextStep` is null/self; with the #2 fix, a behind-wall fallback cell is
  handled by `resolveStepLine`'s detour, so the agent won't hard-stall.

---

## 8. Robustness

- **Good:** `runFastScanTask` wraps each chunk in `PowerRetry` (3 attempts,
  exponential backoff + jitter) and falls back to local compute if all attempts
  fail. `runAgentBatches` falls back to local compute on worker failure and to
  single-worker if parallel fails. Worker tasks have a 10-min timeout + idle
  reaping. `polygonToCells`/`gridDisk` are wrapped in try/catch at the edges.
- **🟠 Asymmetric resilience (#4):** ✅ **Implemented.** `runVisibilityBearingTask`,
  `runBuildMappingGraph`, `runMergeCellsTask`, and `runGradientBatches` now go
  through `runWorkerWithRetry` (PowerRetry, 3 attempts, exponential backoff +
  jitter, then `runLocally` fallback) — the same pattern as fast-scan chunks. A
  single hung/erroneous worker no longer aborts the whole mapping.
- **🟡 `isAccessible` race:** retries once after 150 ms if tiles are still
  loading; acceptable but could loop a bounded number of times for slow tiles.
  — 🟡 Open (not yet implemented).
- **🟡 `runWorker` error path:** on worker `error` or timeout it retires the
  slot and rejects. Good. But a worker that throws *during* `handleMessage` for a
  non-fatal task leaves the slot in the pool (reused) — fine, but the
  `settled` guard prevents double-settle. OK.
- **🟡 `computeDesirePaths` is `async` and can reject** (gradient failure); the
  caller in `ui.js` (`setBusyState`/`syncSimulationUI`) doesn't `await` it, so a
  failed run may leave `isComputing` true if the rejection isn't caught
  upstream. Verify the UI always resets `isComputing` in a `finally`.
  — 🟡 Open (not yet verified/fixed).

---

## 9. Code quality

- **Comment-to-code ratio is very high**, and a large fraction references
  internal review tags (`review10 §3.1`, `P1`, `S1`, `M3`, `C5`…) that are not
  in the repo. New maintainers can't resolve them. Convert the durable rationale
  into short prose; drop the tag citations or add a `reviews/` index.
  — ✅ Done (#9): `reviews/INDEX.md` tag glossary added so comments self-resolve.
- **Stale comments:** `WEIGHTS` calibration note (constants.js:80–83) mentions
  `w_f` (nonexistent). `classifyFrictionTier` header describes a bug already
  fixed. `getGradientGraph` comment claims "single build" while #7 shows it's
  per-realm. — ✅ Done (#9): `WEIGHTS` `w_f` note + `classifyFrictionTier` header
  rewritten; `getGradientGraph` comment updated to reflect the SAB buffer-keyed
  worker cache.
- **Dead code (#10):** `mapPolygonCells`/`mapLineCells`/`mapCells` (legacy
  obstacle drawing) and `initializeAffordanceMap` appear unused now that Surface
  Edition owns drawing; `getCellType()` in `map.js` duplicates
  `classifyFrictionTier`. Confirm with a grep and remove, or wire them back if
  intended as a public API. — ✅ Done (partial): genuine duplicate `getCellType`
  removed; legacy obstacle API retained as public `DesireMap` surface (covered by
  `gridObstacles.test.js`/`compute.test.js`/`integration.test.js`).
- **Magic numbers:** `STUCK_THRESHOLD = 3`, `BUFFER_PX = 128`, blur constants,
  `MAX_SIM_TICKS = 5000` — mostly centralized in `constants.js` (good), but a
  few (e.g. `emitEvery = Math.max(1, Math.floor(totalAgents/20))`) are inline.
  — 🟡 Open (not yet centralized).
- **`getBestNextStep` is long** (≈300 lines) with many memoized module-level
  closures. Functionally correct and well-commented, but a candidate-builder
  object would be more readable than the `_kn*` global soup. — 🟡 Open (not yet
  refactored).
- **Naming:** `_kn*` (kernel) prefixes are consistent; `pd`/`grad`/`aff` are
  fine. `useGradient` is overloaded (means "gradient object present" in some
  places, "gradient mode" in others) — clarify. — 🟡 Open (not yet clarified).

---

## 10. Architecture

**Strengths**
- Clean separation: `constants` (tunables) → `frictionStore` (storage) →
  `dijkstra` (graph + queue) → `spatialTasks` (mapping/visibility CSR) →
  `agentStep` (shared decision helpers) → `agentTasks` (kernel) →
  `spatialWorker` (pool/orchestration) → `compute` (orchestration) →
  `grid`/`map`/`ui`/`surfaceEdition` (presentation). The worker boundary is
  explicit and the SAB/zero-copy strategy is coherent.
- The **single canonical agent kernel** (`agentTasks.computeAgentBatch`) with
  shared helpers in `agentStep.js` prevents main-thread/worker drift — a real
  architectural win.
- **Pooled, typed-array-everywhere** design is the right call for city-scale H3.

**Weaknesses**
- **State ownership is diffuse (#2.1).** The `_state` bag is mutated from 6
  modules with no single authority. The "editing friction invalidates gradient
  graph + gradient cache + bumps layer version" rule is reimplemented in
  `mapCells`, `applySurfaceEdits`, `applySurfaceOverride`, `clearComputeCaches`.
  Centralize in one `invalidateMapping()` method. — 🟡 Open (partial: #8 Proxy
  retained intentionally; #2.1 centralization not yet done).
- **Proxy indirection (#8)** trades simplicity for maplibre compatibility; the
  hidden-state trick is clever but fragile. A thin adapter (store state on the
  map, expose domain methods) would be more maintainable. — ✅ Done (#8): domain
  state keys are now real enumerable accessor properties; custom Proxy traps removed.
- **Cross-realm graph rebuild (#7):** the identity-keyed `getGradientGraph`
  cache can't survive `structuredClone`, so each worker realm rebuilds the graph
  from a normalized copy. This is *inherent* to the worker model, but the
  comments overstate the caching benefit. Shipping the SAB-backed
  `frictionArr`+`cellToIdx` (not a normalized plain object) would let workers
  build the graph from the same typed arrays without the O(N) plain-object
  materialization. — ✅ Done (#7): `state.frictionArr` is SAB-backed when
  cross-origin isolated and shipped directly; `getGradientGraphFromArray` keys
  the cache on the stable SAB buffer identity.
- **Resilience is uneven (#4):** fast-scan chunks are hardened; mapping-graph /
  visibility / merge / gradient tasks are not. Either harden them or document
  why they're considered safe (they're pure CPU, no I/O, so a hang is unlikely —
  but an exception still aborts the mapping). — ✅ Done (#4): `runWorkerWithRetry`
  + local fallback now wraps gradient-batch, mapping-graph, visibility-bearing,
  and merge-cells tasks.
- **Test surface:** `tests/` covers parity (indexed vs string kernel), CSR
  index, friction store, grid obstacles, mapping build, parallel batches,
  spatial worker. Good coverage of the hot paths. **Gap:** no test exercises the
  `getBestNextStep` fallback branch (#2) — add a test with an agent whose only
  passable neighbors are behind a wall to lock the `return bestCandidate` fix.
  — ✅ Done (#2): regression test added for the behind-wall fallback branch.

---

## 11. Recommended action order

1. **Fix #1** (`clearSurfaceEditions`) — ✅ Done (visible UX bug, trivial fix).
2. **Fix #2** (`getBestNextStep` returns `bestCandidate`) + regression test — ✅ Done (crash on a reachable edge case).
3. **Harden #4** (retry/fallback on mapping-graph/visibility/merge/gradient
   tasks) — ✅ Done (`runWorkerWithRetry` + local fallback).
  4. **Cap blur tier crossing #3 (corrected)** — blur crosses `pavement`→`light_park`
     (not `heavy_grass` as originally claimed); cap blurred friction below the
     `pavement`/`light_park` midpoint (1.75) so affordance tier is preserved. *(Open — analysis corrected, fix not yet applied.)*
 5. **Cache visibility CSR across runs #6** and skip unused
    `reconstructVisibilityBearing` #5 — ✅ Done (biggest steady-state perf win).
  6. **Clean up leaks #11** (surfaceEdition listeners, debug globals, pool
     shrink) — ✅ Done (surfaceEdition `destroy()` + `resetSimulationState` teardown + pool shrink).
  7. **Refactor state ownership #2.1 / #8** and trim stale comments — maintainability. *(#9 stale-comment + tag-glossary work done; #8 Proxy retained intentionally.)*
  8. **Remove dead code #10** after confirming it's unused — ✅ Done (partial): `getCellType` duplicate removed; legacy obstacle API retained as public `DesireMap` surface.

Overall: the simulator is production-shaped and the hard problems (scale,
SIGILL-safe workers, emergent ABM) are solved well. The remaining work is
defect-fixing (2 real bugs), resilience evening-out, and a state-architecture
cleanup — not a redesign.
