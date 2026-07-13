## Goal
- Review the "desire-paths" ABM pedestrian-flow simulator and produce a thorough engineering review (optimizations, design weaknesses, alternatives, bugs, perf, memory, correctness, robustness, code quality, architecture) with planned implementations, then implement the safe/high-value changes.

## Constraints & Preferences
- Senior-level review; do not explain basic concepts.
- Free to drop legacy code, remove unnecessary fallbacks, change internal APIs, adapt tests.
- ES modules (`"type": "module"`), Vite + Vitest, prod tree-shaken logger (`drop_console`; `logger.*` no-ops when `import.meta.env.PROD`).
- Prior reviews 10–12 applied major optimizations; this pass is a later residual review + implementation.

## Progress
### Done
- Wrote consolidated `REVIEW.md` (repo root) with 10 findings (F1–F10), priority table, and P1–P3 planned implementations.
- **Implemented F3** — `agentTasks.js` now imports `COMPUTE_PATH_CACHE_MAX`/`COMPUTE_DISK_CACHE_MAX` from `constants.js` (removed local `PATH_CACHE_MAX`/`DISK_CACHE_MAX` at old lines 138/167; usages updated).
- **Implemented F4** — Removed dead `try/catch` around `logger.debug` in `src/workers/agent.worker.js` (kept `isWorkerEntrypoint` guard) and `src/workers/spatial.worker.js` (6 blocks). Script removed 14 `try { logger.debug(...) } catch (_e) {}` wrappers in `src/helpers/spatialWorker.js` (dedented calls). `console.error`/`console.warn` try/catch left intact.
- **Implemented F5** — `classOf()` in `surfaceEdition.js` now `logger.warn`s on an explicit unrecognized `surfaceClass` before defaulting to `SURFACE_CLASSES[0]` (added `logger` import).
- **Implemented F2** — `DesireMap` set trap in `main.js` no longer swallows write-through errors; failures surfaced via `logger.warn` (no-op in prod). Added `logger` import to `main.js`.
- **Verified (no change needed):** F1 (numeric kernel parity already asserted in `indexedKernelParity.test.js`), F6 (Dial `C = Math.ceil(frictionMaxC * GRADIENT_DIAL_SCALE)` derived from actual max; `q[v] ≤ C` always ⇒ no overflow), F9 (`coi-serviceworker.js` logs already gated behind `!coi.quiet`), F10 (numeric parity already asserted).
- **Verification:** `npx vitest run` → 14 files, 360 passed / 6 skipped (green). `node --check` clean on all 7 edited files.

### In Progress
- (none — implementation pass complete)

### Blocked
- (none)

## Key Decisions
- Deliverable is `REVIEW.md` at repo root; updated with a Status column and an Implementation log.
- Deferred P3 refactors (lower value, higher risk of breaking the green suite): F7 (`getBestNextStep` 11-arg → options object), F8 (`bearingIndex.js` nested Proxy — functional lazy accessor, not dead code), and the `DesireMap` Proxy replacement (explicitly "plan, don't rush").
- `logger.warn` chosen for surfacing errors because it is a no-op in prod and never throws (safe in Proxy traps / workers).

## Next Steps (deferred P3 follow-ups)
1. **F7** — Convert `getBestNextStep` (agentStep.js / agentTasks.js) to an options object; update call sites + `tests/compute.test.js` (currently calls with 11 positional args).
2. **F8** — Flatten `bearingIndex.js` nested Proxy accessor to direct CSR array access (verify all callers: `visibilityData.data[a][b]`, `bearingMap[a+'::'+b]`, `bearingMap.get(a,b)`).
3. **Proxy replacement** — Replace `DesireMap` Proxy (main.js:24–240) with explicit wrapper + single `state` object + plain domain methods; remove `rawMap`/`getRawMap()` footgun.

## Critical Context
- Stack: maplibre-gl 5.x, deck.gl 9.x, h3-js 4.x, terra-draw 1.x, lucide. H3 resolution 15 (~0.88m); `BUFFER_PX=128`.
- Friction/Affordance: PAVEMENT 1.0/1.0, LIGHT_PARK 2.5/0.6, HEAVY_GRASS 4.0/0.3, IMPASSABLE 999999/0.0. IMPASSABLE blur adds friction (≤3) + penalizes affordance.
- Routing: Dial's (`dijkstra.js`), `GRADIENT_DIAL_SCALE=8`, `dialC = Math.ceil(frictionMaxC*8)` (dynamic, overflow-impossible). Bearing/visibility CSR + binary search (`bearingIndex.js`).
- Storage: `frictionStore.js` canonical `Float32Array` + `cellToIdx` Map + `FrictionArrayMap` view.
- Workers: `MAX_WORKERS=min(4,max(2,HC))`, `MAX_FASTSCAN_WORKERS=min(8,max(2,HC))`, `MAX_AGENT_WORKERS=max(1,HC-1)`; `agent.worker.js` thin adapter (`handleAgentBatch`) imported into `spatial.worker.js` with `isWorkerEntrypoint` guard. terra-draw needs Vite ESM alias (`vite.config.js:50–51`). SharedArrayBuffer used (gated on `crossOriginIsolated`).
- `SURFACE_CLASSES` colors mirror `map.js` legend. `SURFACE_CLASS_BY_KEY` maps class key → class object.
- Tests: 15 files; suite reports 360 passed / 6 skipped. Pre-existing `vi.mock` hoisting warning in `agentBatchParity.test.js` (unrelated to changes).

## Relevant Files
- REVIEW.md — deliverable (findings F1–F10 + status + implementation log).
- src/helpers/agentTasks.js — F3 (cache constants now imported).
- src/workers/agent.worker.js, src/workers/spatial.worker.js, src/helpers/spatialWorker.js — F4 (dead try/catch removed).
- src/helpers/surfaceEdition.js — F5 (`classOf` warns on unknown class; `logger` imported).
- src/main.js — F2 (set trap warns on write-through failure; `logger` imported).
- src/helpers/dijkstra.js — F6 (verified `dialC` dynamic; no change).
- public/coi-serviceworker.js — F9 (verified logs gated by `!coi.quiet`; no change).
- tests/indexedKernelParity.test.js, tests/agentBatchParity.test.js — F1/F10 (numeric parity already asserted; no change).
- Deferred: src/helpers/agentStep.js (F7), src/helpers/bearingIndex.js (F8), src/main.js DesireMap (proxy replacement).
