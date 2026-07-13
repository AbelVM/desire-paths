# Engineering Review — `desire-paths`

> Scope: full-stack ABM pedestrian-flow simulator (maplibre-gl 5.x, deck.gl 9.x, h3-js 4.x, terra-draw 1.x).
> Method: read every core module (`main.js`, `constants.js`, `grid.js`, `compute.js`, `map.js`, `ui.js`, `dijkstra.js`, `frictionStore.js`, `bearingIndex.js`, `agentStep.js`, `agentTasks.js`, `spatialTasks.js`, `spatialWorker.js`, `surfaceEdition.js`, `bearing.js`, `rng.js`, `logger.js`, both workers), the 15 test files, `vite.config.js`, and `public/coi-serviceworker.js`.
> Prior review cycles (10–12) already applied the major perf optimizations; this pass focuses on residual design weaknesses, drift risk, dead code, and correctness edge cases.

## Findings at a glance

| ID | Area | Issue | Priority | Effort | Status |
|----|------|-------|----------|--------|--------|
| F1 | Architecture | Two parallel compute kernels (`compute.js` indexed/CSR vs `agentTasks.js` object-based) kept in sync only via shared helpers — drift risk | P1 | M | Verified — parity tests already assert numeric equality |
| F2 | Architecture | `DesireMap` Proxy is high-complexity; write-through swallows errors | P2 | L | **Implemented** (write-through now warns) |
| F3 | Code quality | Duplicated cache-size constants in `agentTasks.js` (`PATH_CACHE_MAX`/`DISK_CACHE_MAX`) instead of importing from `constants.js` | P1 | S | **Implemented** |
| F4 | Code quality | Dead defensive `try/catch` around `logger.debug` in workers (prod no-op) | P1 | S | **Implemented** |
| F5 | Robustness | `classOf()` in `surfaceEdition.js` silently falls back to `SURFACE_CLASSES[0]` for unknown classes | P2 | S | **Implemented** |
| F6 | Correctness | Dial's bucket count `C` must be derived from actual max edge weight, not assumed | P2 | S | Verified — `C` derived from `frictionMaxC`, overflow impossible |
| F7 | Code quality | `getBestNextStep` takes 11 positional args — replace with options object | P3 | M | Deferred (signature refactor; touches tests) |
| F8 | Perf | `bearingIndex.js` accessor built on nested `Proxy` — unnecessary indirection | P3 | S | Deferred (functional lazy accessor; not a bug) |
| F9 | Robustness | `coi-serviceworker.js` uses `console.log` that is never stripped (static public file) | P3 | S | Verified — logs already gated behind `!coi.quiet` |
| F10 | Testing | Parity tests exist but should diff both kernels on shared fixtures | P2 | S | Verified — numeric parity already asserted |

## Detailed findings

### A. Architecture & Design

**F1 — Dual compute kernels (drift risk).** `compute.js` (indexed/CSR path: `applyPathDesireDeltas`, S7 typed OD matrix `Float32Array(O*D)`, `getGradientGraph`/`gradientGet`/`gradientReachableCount`) and `agentTasks.js` (`computeAgentBatch`, object-based candidate gathering) implement the same agent-stepping model. They share only `agentStep.js` (`gatherCandidates`, `partitionVisibleCone`, `scoreCandidates`, `selectBestCandidate`, `resolveStepLine`), `bearing.js`, and `dijkstra.js`. Any change to scoring/visibility logic in one file that isn't mirrored in the other silently diverges the two execution paths. `tests/indexedKernelParity.test.js` and `tests/agentBatchParity.test.js` exist but should be extended to run both kernels over identical fixtures and assert numeric equality of outputs, not just shape.

**F2 — `DesireMap` Proxy complexity (`main.js:24–240`).** The Proxy consolidates ~50 previously-delegated properties into a single `_state` bag and falls back to the underlying maplibre `Map`. It is internally consistent (state keys are excluded from `ownKeys` and `getOwnPropertyDescriptor` returns `undefined` for them, so no Proxy-invariant violation). However:
- The `set` trap write-through swallows assignment errors: `try { mp[prop] = value; } catch (_e) {}` at `main.js:139–142` and `148–151`. A failed write to the underlying map is silently dropped, so state can desync from the map with no signal.
- Methods are bound to the receiver (the Proxy) in the `get` trap (`main.js:109`, `116`), which breaks private-field access — the reason `rawMap`/`getRawMap()` exists (`main.js:211–213`, `33`). This is a known footgun that future maintainers will trip on.
- A plain wrapper class with explicit getters/setters (or a single `state` object plus domain methods) would be easier to reason about and would surface write errors. The Proxy was a reasonable consolidation, but the cognitive cost is high for the benefit.

### B. Correctness & Robustness

**F6 — Dial's algorithm bucket sizing (`dijkstra.js`).** `GRADIENT_DIAL_SCALE = 8` (quant step 0.125) and max edge weight ≈ 5.8 (HEAVY_GRASS 4 + blur ≈ 1.8) give `C ≈ 47` buckets. Confirm `C` is computed from the *actual* max weight in the graph (dynamic), not a hardcoded constant. If friction costs change (e.g. a new surface tier) and the real max exceeds the assumed `C`, bucket overflow produces incorrect shortest paths with no error. This is the single highest-correctness-risk item after F1.

**F5 — Silent surface misclassification (`surfaceEdition.js`, `classOf`).** `classOf()` returns `SURFACE_CLASSES[0]` (pavement) when a feature's class is unrecognized. A typo'd or version-mismatched class string is silently treated as pavement (friction 1.0, affordance 1.0) rather than flagged. At minimum log a warning; better, throw on unknown class during edit.

**F3 — Duplicated cache constants (`agentTasks.js:138,167`).** `agentTasks.js` defines local `const PATH_CACHE_MAX = 256` and `const DISK_CACHE_MAX = 256`, while `constants.js:467–468` exports `COMPUTE_PATH_CACHE_MAX = 256` and `COMPUTE_DISK_CACHE_MAX = 256` (same values, different names). The duplication invites drift: a future tuning of one set won't propagate. Import the canonical constants.

### C. Performance

**SharedArrayBuffer zero-copy path is well done.** `spatialWorker.js` (`S1-SAB`, lines 302, 584, 769–771, 928–941), `compute.js:563–572`, `agentTasks.js:926` (`useAtomics`), and `spatialTasks.js:490–499` all gate SAB allocation on `typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true` and fall back to transfer lists otherwise. This is correct and the COOP/COEP headers + `public/coi-serviceworker.js` are *necessary* (verified — SAB is genuinely used, not just transferables). No change needed; noted to close the earlier open question.

**Gradient cache (`compute.js:148–155`).** `GRADIENT_CACHE_MAX_ENTRIES = 16` with a `protectedSet` (targets never evicted) is sound, but if the number of distinct targets exceeds 16 the protected set pins the entire cache and eviction becomes a no-op — verify target count stays bounded in practice.

### D. Memory

- `_state` (`main.js`) holds large arrays (`frictionArr`, `affArr`, gradient cache, visibility CSR). Eviction exists for poly/path caches (`grid.js:310,345`) and gradient cache (`compute.js`), and `geocoderCache` is TTL-evicted (`main.js:307–323`, `CACHE_MAX_AGE_MS = 5*60*1000`). Confirm AOI switches release the prior `frictionArr`/`affArr` references (no stale retention).
- `_cellLatLngCache` LRU (1024, `agentTasks.js:48`) and `_polyCellsCache` (512, `spatialTasks.js:154`) are bounded. Good.

### E. Code Quality

**F4 — Dead defensive code in workers.** `agent.worker.js:30–40` wraps `logger.debug(...)` in `try/catch` (twice, nested) and `console.error` in another `try/catch` (`47–49`). `logger.debug` is a no-op in production (tree-shaken; `vite.config.js:58` `drop_console`). The `try/catch` around a no-op is dead weight and obscures intent. `spatial.worker.js` should be audited for the same pattern. The `isWorkerEntrypoint` guard (`agent.worker.js:17–25`) is legitimate and should stay — it prevents a duplicate `message` listener when the module is imported into `spatial.worker.js`.

**F7 — `getBestNextStep` arity.** Test call `getBestNextStep(h3, gradient, 0, '', SIMULATION_PARAMS, frictionLookup, affordanceLookup, null, null, null, undefined)` (11 positional args, `tests/compute.test.js:226,278`). An options object would be far more maintainable and self-documenting.

**F8 — `bearingIndex.js` nested Proxy accessor (`lines 50–111`).** The CSR data is wrapped in a `Proxy` whose `get` lazily builds another `Proxy` accessor. This indirection is unnecessary for a hot read path; a plain object with defined getters or direct array access would be clearer and marginally faster.

**F9 — `coi-serviceworker.js` logging.** `public/coi-serviceworker.js:126–142` uses `console.log` for COOP/COEP registration status. Because it is a static public file (copied by `copyPublicFiles`, `vite.config.js:21–43`), `drop_console` does **not** strip it. Minor, but it will log in production.

### F. Bugs investigated and cleared (no action)

- **`SIMULATION_PARAMS.h3StrideResolution`** (`ui.js:1186,1252,1292,1387,1453`, `main.js:458`, `grid.js:79,85,…`): **not a bug.** `constants.js:118` defines `SIMULATION_PARAMS = { ...DEFAULT_SIMULATION_PARAMS, … }` with `h3StrideResolution: H3_STRIDE_RESOLUTION` (`constants.js:11` = 15). The earlier suspected inconsistency vs `H3_STRIDE_RESOLUTION` is resolved — they are the same value via the spread.
- **COOP/COEP necessity**: **confirmed necessary** (SAB is used). No change.

## Planned implementations

### P1 — Easy wins (do first)
1. **F3 — Unify cache constants.** In `agentTasks.js`, delete local `PATH_CACHE_MAX`/`DISK_CACHE_MAX` and import `COMPUTE_PATH_CACHE_MAX`/`COMPUTE_DISK_CACHE_MAX` from `./constants.js`; update usages at `agentTasks.js:138,158,167,185`.
2. **F4 — Remove dead defensive `try/catch` in workers.** In `agent.worker.js`, drop the `try/catch` wrappers around `logger.debug` (lines 30–34, 36–40) and `console.error` (47–49); keep the `isWorkerEntrypoint` guard. Audit `spatial.worker.js` for the same and remove.
3. **F1 (partial) — Strengthen parity tests.** Extend `indexedKernelParity.test.js` / `agentBatchParity.test.js` to run both kernels on shared fixtures and assert numeric equality of `result` arrays, not just shape.

### P2 — Medium
4. **F6 — Verify Dial bucket `C` is dynamic.** In `dijkstra.js`, confirm `C` is derived from `max(weights)` (or document why the constant bound is safe given `FRICTION_COSTS`). Add a guard/assert that no edge weight exceeds `C/GRADIENT_DIAL_SCALE`.
5. **F5 — Surface class validation.** In `surfaceEdition.js` `classOf()`, warn (or throw in edit path) on unrecognized class instead of silently returning `SURFACE_CLASSES[0]`.
6. **F2 (partial) — Surface write errors.** In `main.js` `set` trap, stop swallowing `mp[prop] = value` errors (at least `console.warn` or rethrow in dev). Consider a dev-only assertion that `_state` and `#map` stay consistent.

### P3 — Larger refactors (plan, don't rush)
7. **F2 — Replace `DesireMap` Proxy** with an explicit wrapper: keep `rawMap`/`getRawMap()`, expose a single `state` object, and move domain methods to plain class methods. Removes the receiver-binding footgun and the silent write-through.
8. **F7 — Convert `getBestNextStep`** to an options object; update call sites and tests.
9. **F8 — Flatten `bearingIndex.js` Proxy accessor** to direct CSR array access.
10. **F9 — Gate `coi-serviceworker.js` logs** behind a `quiet`/debug flag (it already has a `coi.quiet` concept at lines 114–142; apply it to the `console.log` calls).

## Test coverage notes
15 test files present: `agentBatchParity`, `bearingMapCache`, `compute`, `computeDesirePaths`, `constants`, `csrBearingIndex`, `frictionStore`, `gridObstacles`, `indexedKernelParity`, `integration`, `mappingBuild`, `parallelAgentBatches`, `spatialTasks`, `spatialWorker`. README claims 341 passing. Kernel parity is covered in principle; the highest-value addition is numeric-equality parity (P1-3) to lock F1.

## Implementation log
- **F3 (done):** `agentTasks.js` now imports `COMPUTE_PATH_CACHE_MAX` / `COMPUTE_DISK_CACHE_MAX` from `constants.js` and uses them for the path/disk LRU caps (removed the local `PATH_CACHE_MAX`/`DISK_CACHE_MAX`).
- **F4 (done):** Removed dead `try/catch` around `logger.debug` in `src/workers/agent.worker.js` (kept `isWorkerEntrypoint` guard) and `src/workers/spatial.worker.js` (6 blocks). In `src/helpers/spatialWorker.js`, a script removed 14 `try { logger.debug(...) } catch (_e) {}` wrappers (dedenting the call). `console.error`/`console.warn` try/catch blocks left intact (they wrap real error reporting).
- **F5 (done):** `classOf()` in `surfaceEdition.js` now `logger.warn`s on an explicit unrecognized `surfaceClass` before defaulting to `SURFACE_CLASSES[0]`.
- **F2 (done):** `DesireMap` set trap in `main.js` no longer swallows write-through errors — failures are surfaced via `logger.warn` (no-op in prod, active in dev). Canonical `_state` is still the source of truth.
- **F1 / F6 / F9 / F10 (verified, no change):** numeric kernel parity already asserted by `indexedKernelParity.test.js`; Dial `C` is already derived from `frictionMaxC` with `Math.ceil` margin (overflow impossible); `coi-serviceworker.js` logs already gated behind `!coi.quiet`.
- **F7 / F8 / proxy replacement (deferred):** P3 refactors — `getBestNextStep` options object, `bearingIndex.js` Proxy flatten, and `DesireMap` Proxy replacement. Left as planned follow-ups (lower value, higher risk of breaking the green suite).
- **Verification:** `npx vitest run` → 14 files, 360 passed / 6 skipped. `node --check` clean on all edited files.
