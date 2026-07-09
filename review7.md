# Desire Paths Simulator — Deep Performance & Memory Review (review7.md)

> Scope: building/mapping stage (`grid.js`, `spatialTasks.js`, `spatialWorker.js`)
> and simulation stage (`compute.js`, `agentTasks.js`, `dijkstra.js`, `agentStep.js`,
> `map.js`). Builds on `review6.md` (which landed S1/S1‑SAB partial, S2/S3/S4, M1, M5,
> C2 and deferred M2/M3/S5). This pass finds the *remaining* wins and plans them.
>
> **Parallelization warning (carried from the brief).** The agent loop is a true ABM:
> all agents in a run share one `accumulatedFootprints` structure that boosts
> affordance for *subsequent* agents (paper §3.4). Splitting the plan across ≥2
> workers would give each worker an independent structured‑clone of the footprints
> and destroy the interaction, changing the emergent output. **Do NOT parallelize
> the agent loop.** The only safe parallelization is (a) per‑destination gradient
> Dijkstra (already done) and (b) the mapping‑stage shards (already done). M3 below
> parallelizes the *gradient‑graph build* (pure geometry, no shared state) — that is
> safe. Everything else in this document preserves single‑context ABM dynamics.

---

## 0. Already well‑optimized (do NOT regress — see review6 §0)

CSR gradient graph, Dial's buckets, lazy generation‑keyed neighbor‑disk cache,
CSR visibility/bearing with binary‑search + Uint16 bearings, transferable
flattening, worker pool with per‑kind caps + LPT fast‑scan scheduling,
preallocated candidate buffers, hoisted per‑call closures (S2/S3), shared
`frictionArr` across Dijkstra targets (S4), typed‑array gradients (M1),
eliminated `_cellState` (M5), Map‑LRU lat/lng caches (C2), off‑main‑thread
single‑worker ABM dispatch (S1). The findings below build on top of these.

---

## 1. Summary of findings

| ID | Area | Issue | Type | Impact | Effort | Status |
|----|------|-------|------|--------|--------|--------|
| **M3** | Map/Sim | Gradient graph built on **main thread** via a full `gridRingUnsafe` V‑pass during `computeDesirePaths`, and built a **second time** in the worker from a different source identity | Perf/UX + Mem | High | Med | **Planned** (§2) |
| **B** | Mem | Friction/affordance stored **2×** — `cellFrictionMap`(Map) **and** `_frictionObj`(plain obj); `affordanceMap`(Map) **and** `_affordanceObj`(plain obj) | Mem | High | Med | **IMPLEMENTED** (§3) |
| **F** | Sim | Per‑tick `originDestDistances[simCurrent+'::'+destCell]` lookup is a **miss for ~99% of ticks** (table is node‑only) → wasted string concat + object read every tick | Perf/GC | Med | Low | **Implemented** (byte‑identical, 387 pass) |
| **C** | X | Dead module `cellCache.js` (imports non‑existent `DISK_CACHE_MAX`, imported nowhere) | Mem/clean | Low | Low | **Implemented** (deleted) |
| **D** | Sim | Two ABM kernels: `runSingleAgentPath`(compute.js) duplicates `runAgentPath`(agentTasks.js); incremental API runs the main‑thread one **synchronously** (blocks UI) | Perf/maint | Med | Med | **PARTIALLY IMPLEMENTED** (§5) |
| **G** | Sim | `getGradientGraph` cached by source *identity*; main thread passes the `Map`, worker passes the plain object → **two graph builds per run** | Mem/Perf | Med | Low | **Planned** (folded into M3) |
| **H** | Sim | `precomputeOriginDestDistances` string‑keyed O×D object (S5) | Perf | Low | Low | **Deferred** (F already removes the per‑tick cost; §6) |
| **I** | Map | `updateLayers` slices `_flatPool`/`_flowPool` (O(N) alloc) on every data‑version change | Perf | Low | Low | **Planned** (§7, optional) |
| **J** | Sim | `accumulatedFootprints` plain object cloned to worker each run (S1‑SAB follow‑up) | Mem | Low | Low | **Deferred** (S1‑SAB, §8) |

---

## 2. M3 — Build the gradient graph off the main thread, reusing `r1Adjacency` (highest remaining main‑thread win)

**Problem.** `getGradientGraph` (`dijkstra.js`) runs a full `gridRingUnsafe(cell,1)`
V‑pass (plus a V‑string `sort`) to build the r=1 CSR. It is invoked on the **main
thread** during `computeDesirePaths` for plan validation / reachability
(`compute.js:416,556,870,1038,1186,1341,1400,1653` — all share one identity, so
one main‑thread build) **and again in the worker** from `frictionEntries` (a plain
object, different identity → a *second* build, `spatialWorker.js:565` /
`agentTasks.js:717`). At city scale V≈5e5 that is ~5e5 H3 neighbor calls blocking
the UI, plus a duplicate build.

**Key insight.** The gradient graph's adjacency is *exactly* `buildR1Adjacency`
(`spatialTasks.js`) filtered to passable cells — and `buildR1Adjacency` is
**already computed in `triggerFastScan`** (in a worker, launched in parallel with
the fast scan) but its result is **discarded** (`grid.js:126,229` await it only to
feed `buildMappingGraph`). So the gradient graph can be built with **zero
`gridRingUnsafe` calls** by filtering the already‑computed `r1Adjacency`.

**Plan.**
1. In `triggerFastScan`, keep the r1 adjacency: `state._r1Adjacency = await r1AdjacencyPromise;`
   (it is already awaited at `grid.js:229`; just store it).
2. Add `computeGradientGraphCSR({ frictionEntries, r1Adjacency, viewHexes })` to
   `spatialTasks.js`. It builds `cellToIdx`/`idxToCell` (sorted passable cells, for
   deterministic indices — same as today) and filters `r1Adjacency` (viewHexes‑
   indexed) into the gradient CSR. **No `gridRingUnsafe`/`gridDisk`.** A `viewHexes→r1`
   index map is built with a cheap O(N) loop (no H3).
3. Add `runBuildGradientGraph` worker task (`spatialWorker.js`) mirroring
   `runBuildMappingGraph`/`runBuildR1Adjacency`; `runLocally` falls back to the new
   `computeGradientGraphCSR` (so node tests stay green — they hit the local path).
4. `getGradientGraph` gains an optional prebuilt‑graph fast path: when a graph is
   supplied (or `r1Adjacency`+`viewHexes` are available) it reuses it instead of the
   `gridRingUnsafe` pass. Cache keying by source identity is unchanged.
5. `computeDesirePaths` builds the graph **in a worker** once
   (`await runBuildGradientGraph(...)`), stores `state._gradientGraph`, and passes it
   to `runGradientBatches` so the worker reuses the *same* graph (fixes **G** — no
   second build). When `Worker` is undefined (node), `runBuildGradientGraph` runs
   locally → identical to today.

**Code sketch — `computeGradientGraphCSR` (no H3 neighbor calls):**
```js
export function computeGradientGraphCSR({ frictionEntries, r1Adjacency, viewHexes } = {}) {
  const frictionLookup = normalizeFrictionEntries(frictionEntries);
  const N = viewHexes ? viewHexes.length : 0;
  const impassable = FRICTION_COSTS.IMPASSABLE;

  // Passable cells, sorted → deterministic cellToIdx (matches getGradientGraph).
  const cells = [];
  for (let i = 0; i < N; i++) {
    const f = frictionLookup[viewHexes[i]];
    if (typeof f === 'number' && f < impassable) cells.push(viewHexes[i]);
  }
  cells.sort();
  const V = cells.length;
  const cellToIdx = Object.create(null);
  for (let i = 0; i < V; i++) cellToIdx[cells[i]] = i;

  // viewHexes → r1 index (cheap O(N), no H3).
  const vhIdx = Object.create(null);
  for (let i = 0; i < N; i++) vhIdx[viewHexes[i]] = i;

  // Filter r1Adjacency (viewHexes-indexed) into gradient CSR (sorted-index space).
  const r1Off = r1Adjacency.offsets, r1Nb = r1Adjacency.neighbors;
  const deg = new Int32Array(V);
  let E = 0;
  for (let i = 0; i < V; i++) {
    const gi = vhIdx[cells[i]];
    const s = r1Off[gi], e = r1Off[gi + 1];
    for (let x = s; x < e; x++) {
      const nbCell = viewHexes[r1Nb[x]];
      const j = cellToIdx[nbCell];
      if (j !== undefined) { deg[i]++; E++; }   // skip impassable/out-of-AOI
    }
  }
  const adjOffsets = new Int32Array(allocTransferBuffer((V + 1) * 4));
  for (let i = 0; i < V; i++) adjOffsets[i + 1] = adjOffsets[i] + deg[i];
  const adjNeighbors = new Int32Array(allocTransferBuffer(E * 4));
  const frictionArr = new Float64Array(V);
  let frictionMaxC = 0, w = 0;
  for (let i = 0; i < V; i++) {
    const f = frictionLookup[cells[i]];
    const fw = typeof f === 'number' && f < impassable ? f : -1;
    frictionArr[i] = fw;
    if (fw > frictionMaxC) frictionMaxC = fw;
    const gi = vhIdx[cells[i]], s = r1Off[gi], e = r1Off[gi + 1];
    for (let x = s; x < e; x++) {
      const j = cellToIdx[viewHexes[r1Nb[x]]];
      if (j !== undefined) adjNeighbors[w++] = j;
    }
  }
  return { V, cellToIdx, idxToCell: cells, adjOffsets, adjNeighbors, frictionArr, frictionMaxC };
}
```

**Why safe.** The CSR shape is identical to today's `getGradientGraph` output; only
the *construction* method changes (filter vs. `gridRingUnsafe`). `cellToIdx` is
still sorted → identical indices → M1 gradients stay aligned. `invalidateGradientGraph`
keying is unchanged (still keyed by source identity; now also invalidated when
`state._gradientGraph` is stale). **Impact:** removes the main‑thread V‑pass from
the sim path (biggest remaining UI‑block at city scale) and eliminates the duplicate
worker build (memory: one graph instead of two). **Risk:** low — pure geometry,
fallback path is byte‑identical. **Test impact:** extend `mappingBuild.test.js` /
`spatialTasks.test.js` with a `computeGradientGraphCSR` case asserting the CSR
equals the `getGradientGraph` result for a small AOI; `compute.test.js` /
`csrBearingIndex.test.js` stay green (local fallback).

---

## 3. B — Stop storing friction/affordance twice (Map + plain object) (IMPLEMENTED)

**Status.** Implemented. `grid.js` no longer pre-builds `_frictionObj`/`_affordanceObj`
at mapping time — the Maps (`cellFrictionMap`/`affordanceMap`) are the single source
of truth at mapping/render time. `_frictionObj`/`_affordanceObj` are materialized
lazily at sim start (`computeDesirePaths`, gen-gated) and on the incremental path
(`_recomputeTargetContribs`), then dropped by `clearComputeCaches` on the next remap.
`updateLayers`/`buildSimulationGeoJSON` read `cellFrictionMap` for friction and prefer
the live `_affordanceObj` (accumulated wear) else `affordanceMap` for affordance; the
`_buildFrictionObj`/`_buildAffordanceObj` on-demand rebuilders were deleted. Result:
before the first sim, only the Maps exist (1× memory for the two hottest N-fields
instead of 2×). Tests updated to the affordanceMap-canonical contract
(`_affordanceSnapshotGen` added alongside `_frictionSnapshotGen`; affordance seed
written to `affordanceMap`). Full suite: 390 passed, 6 skipped.

**Problem.** For every cell we hold the friction value in **both** `cellFrictionMap`
(a `Map`, used by `getGradientGraph` and H3) **and** `_frictionObj` (a plain object,
the sim/renderer source), and the affordance value in **both** `affordanceMap` (Map)
**and** `_affordanceObj` (plain object). At N≈5e5 that is ~2× the steady‑state
memory for the two hottest fields. `_frictionObj` is essentially
`normalizeFrictionEntries(cellFrictionMap)` cached; `_affordanceObj` is the same for
affordance.

**Low‑risk plan (recommended first step).** Make the Maps the single source of
truth and let consumers normalize on demand (they already have fallbacks):
- `updateLayers` (`map.js`): read `state.cellFrictionMap.get(h)` /
  `state.affordanceMap.get(h)` instead of `_frictionObj`/`_affordanceObj`; delete the
  `_buildFrictionObj`/`_buildAffordanceObj` on‑demand rebuilders.
- `runAgentBatches` (`spatialWorker.js`): it already does
  `state._frictionObj || state.cellFrictionMap` then `normalizeFrictionEntries` —
  just pass `state.cellFrictionMap` (the worker normalizes to a plain object anyway).
- `compute.js` `getBestNextStep`/`runSingleAgentPath`/`computeDijkstraGradient`/
  `isVisible`: they already lazily build `_frictionObj` from `cellFrictionMap` on a
  miss — keep that fallback, stop *pre‑building* it in `computeDesirePaths`
  (`compute.js:700‑704`) and `grid.js` merge (`grid.js:182,201`).
- `updateAffordance`/`decayAffordance`/`initializeAffordanceMap`/`_recomputeAffordanceForCells`:
  write `affordanceMap` (the Map) instead of `_affordanceObj`.
- `clearComputeCaches`: stop nulling `_frictionObj`/`_affordanceObj` (or keep the
  fields but never populate them).

This drops one full copy of N friction + N affordance (tens of MB at city scale)
with no behavior change — `normalizeFrictionEntries` rebuilds the plain object once
per `runAgentBatches` call (O(N), negligible vs. the sim cost).

**Architectural follow‑up (M5 §7b, optional, higher risk).** Store friction and
affordance once in `Float32Array(V)` indexed by `cellToIdx` (the gradient graph's
index), shared by the gradient graph (`frictionArr`), the renderer, and the sim.
Hot reads become `frictionArr[cellToIdx[cell]]`. This is the biggest steady‑state
win but touches every hot‑path consumer and many tests that assert on
`_frictionObj[cell]`; land it behind a thin `getCellFriction(state, cell)` accessor.

---

## 4. F — Gate the per‑tick OD‑distance lookup on node‑set membership (IMPLEMENTED)

**Problem.** `originDestDistances` (`precomputeOriginDistances`) is an O×D table
keyed only by **node** pairs. The per‑tick lookup
`originDestDistances[simCurrent + '::' + destCell]` in `runAgentPath` /
`runSingleAgentPath` therefore returns a number **only when `simCurrent` is a node**.
For the ~99% of ticks spent on intermediate cells it is always `undefined` → no
update, but the code still pays a string concatenation + object read **every tick**
(millions of times per city‑scale run).

**Fix (byte‑identical).** Build a `Set` of all plan nodes once per batch and gate
the lookup on `nodeSet.has(simCurrent)`. When `simCurrent` is not a node the lookup
is skipped — identical to today (where it would miss). When it *is* a node the
lookup runs exactly as before. Implemented in both kernels:
- `agentTasks.js`: `runAgentPath` gains a `nodeSet` param; `computeAgentBatch` builds
  it from the plan's `originCell` + `destCandidates[].dest` and passes it through.
- `compute.js`: `runSingleAgentPath` builds `nodeSet` once from the
  `originDestDistances` keys (parsing `o::d`) and gates the lookup.

**Verified:** 387 tests pass (node uses the local fallback; output unchanged).
**Impact:** removes millions of `simCurrent+'::'+destCell` string allocations +
object reads per run — a real GC‑pressure reduction in the hottest loop, with zero
behavior change.

---

## 5. D — Unify the two ABM kernels; offload the incremental API (PARTIALLY IMPLEMENTED)

**Status.** Shared-kernel de-duplication implemented; worker offload deferred (with
rationale below).

**Implemented.**
- The obstacle-avoidance geometry — `resolveStepLine` + `cornersImpassable`, the most
  correctness-sensitive duplicated logic (the local BFS detour that routes agents
  *around* buildings) — now lives once in `agentStep.js` and is imported by both
  `runAgentPath` (worker, `agentTasks.js`) and `runSingleAgentPath` (incremental,
  `compute.js`). Each kernel passes stable cache-accessor closures (`getPathCells` /
  `getDisk`) that are memoized per run, so no closures are allocated on the hot
  per-step path (preserves review6 §0). Friction is passed as data
  (`frictionLookup` + `cellState`), inlined in the shared function. This kills the
  single largest drift risk (~90 lines that had to stay byte-identical by hand).
- The candidate-scoring core (`gatherCandidates` / `partitionVisibleCone` /
  `scoreCandidates` / `selectBestCandidate`) was already shared in `agentStep.js`.
- New guard `tests/incrementalKernelParity.test.js` asserts `runSingleAgentPath`
  (now exported as `_runSingleAgentPath`) and `runAgentPath` produce **byte-identical
  agent paths** on the same deterministic scenario — both an open corridor and an
  obstacle-detour case (which exercises the shared BFS in both kernels). This locks
  the two kernels together behaviorally, complementing `agentBatchParity.test.js`.
  Full suite: 392 passed, 6 skipped.

**Deferred (with rationale).**
- *Full kernel deletion / merge of `getBestNextStep` + `getGradientDirection`:* the
  compute-side kernel has a dedicated test surface (`_getBestNextStep`,
  `_getGradientDirection`), and the remaining per-kernel differences are
  caching-infrastructure (ctx-scoped vs module-level buffers/closures, precomputed
  visibility sets, the non-finite temperature-sum guard). Merging the orchestration
  would either regress review6's no-per-call-allocation rule on the worker hot path
  or add closure-caching bookkeeping that itself can drift. The scoring + geometry
  cores — where drift actually hurts — are now shared, and the parity tests pin the
  rest, so the residual duplication is low-risk glue.
- *Worker offload of `_recomputeTargetContribs` (option b):* the incremental API
  (`addDestination` / `updateDestinationWeight` / `removeDestination`) has **no
  `src/` callers — it is exercised only by tests** and returns synchronously. Moving
  it to the agent-batch worker would force an async API + worker-in-test
  infrastructure for zero production benefit (there is currently no UI path that can
  jank). Revisit if/when the incremental API is wired into the UI.

**Problem (original).** `runSingleAgentPath` (`compute.js`) is a near‑duplicate of
`runAgentPath` (`agentTasks.js`). The incremental API
(`addDestination` / `updateDestinationWeight` / `removeDestination` →
`_recomputeTargetContribs`) calls `runSingleAgentPath` **synchronously on the main
thread**, so editing a destination while a large plan exists can jank the UI. Two
kernels also risk silent drift (they must stay byte‑identical, which the parity test
guards but does not prevent).

**Plan.**
- Extract the shared kernel into one module (`agentStep.js` or a new
  `agentKernel.js`) that both the worker batch and the incremental path import, so
  there is a single source of truth (kills the drift risk).
- For the incremental API, either (a) reuse `runAgentPath` (passing a single‑origin
  plan + the shared `nodeSet`), or (b) dispatch `_recomputeTargetContribs` to the
  same single `agent‑batch` worker used by `runAgentBatches` and `await` the result
  before updating `_perTargetContribs`/`_affordanceObj`. Option (b) keeps the ABM
  dynamics intact (single worker, shared footprints) and moves the incremental cost
  off the main thread. **Do NOT** split the incremental plan across workers (see
  the parallelization warning).

**Risk:** medium (signature/closure differences between the two kernels must be
reconciled); guard with `agentBatchParity.test.js` + a new incremental‑parity test.

---

## 6. H — `precomputeOriginDestDistances` (S5, deferred)

The O×D string‑keyed object is small (few nodes), and **F** already removes the
per‑tick cost of querying it. A numeric‑composite key (`cellToIdx[o]*V +
cellToIdx[d]` in a `Map<number,number>`) would be marginally faster but is not
worth the churn. **Deferred** (consistent with review6 §8).

---

## 7. I — `updateLayers` pool slicing (optional micro‑opt)

`updateLayers` does `state._flatPool.slice(0, flatCount)` / `_flowPool.slice(0,
flatCount)` on every data‑version change to hand deck.gl a stable array. At N≈5e5
that is a 500k‑element array allocation per remap/sim. It only runs on data‑version
change (not per frame), so impact is modest. Optional: keep `_flatData` as the pool
and track `flatCount`, passing a length‑aware view to deck.gl — but deck.gl iterates
the whole array, so this needs a small wrapper or accepting the slice. **Low
priority.**

---

## 8. J — `accumulatedFootprints` SAB (S1‑SAB follow‑up, deferred)

`accumulatedFootprints` is a plain object cloned to the worker each run. S1‑SAB
(review6 §3) plans to back it with `allocTransferBuffer` (SharedArrayBuffer when
`crossOriginIsolated`) so it is shared zero‑copy. The run is single‑worker and the
main thread `await`s, so there is no concurrent access (no `Atomics` needed).
**Deferred** to the browser‑verified S1‑SAB pass.

---

## 9. Test impact summary

| Change | Tests affected | Action |
|--------|----------------|--------|
| **F (done)** | `agentBatchParity.test.js`, `compute.test.js`, `integration.test.js` | ✅ green (387 pass) — byte‑identical |
| **C (done)** | none (dead code, unimported) | ✅ deleted `src/helpers/cellCache.js` |
| **M3** | `mappingBuild.test.js`, `spatialTasks.test.js` (new CSR case); `compute.test.js`, `csrBearingIndex.test.js` | adapt/extend; local fallback keeps others green |
| **B** | `map.test.js`? (renderer reads Maps), `compute.test.js`, `integration.test.js` | change `_frictionObj`/`_affordanceObj` assertions to Maps; keep fallbacks |
| **D** | `agentBatchParity.test.js` + `incrementalKernelParity.test.js` (new) | shared geometry (`resolveStepLine`/`cornersImpassable`) + kernel parity guard |
| **G** | folded into M3 | — |
| **H/I/J** | minimal / none | deferred |

---

## 10. Recommended sequencing

1. **Done (this pass):** **F** (OD‑distance node‑gating, byte‑identical, high GC
   win) and **C** (dead‑code removal). Both verified at 387 tests green.
2. **Next:** **M3** — off‑main‑thread gradient‑graph build reusing `r1Adjacency`
   (removes the last main‑thread V‑pass; also fixes **G**'s duplicate build).
   Highest remaining responsiveness win; low risk; node‑testable via local fallback.
3. **Then:** **B** — drop the `_frictionObj`/`_affordanceObj` cached copies (read
   from the Maps; normalize on demand). Solid steady‑state memory win, low risk.
4. **Then:** **D** — unify the two ABM kernels and offload the incremental API to
   the existing single agent‑batch worker (kills drift risk + main‑thread jank).
5. **Deferred:** H, I, J (marginal or blocked on the browser‑verified S1‑SAB pass).

Each step is independently shippable and testable. M3/B are the architectural
refactors and should land behind the existing fallbacks / parity tests to keep the
surface stable. **No step parallelizes the agent loop** — ABM dynamics are preserved
(single‑context execution throughout).
