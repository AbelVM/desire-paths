# Review: `performance-helpers` vs. the Desire Paths codebase

**Date:** 2026-07-13
**Status:** 3.1 and 3.2 implemented and merged into the working tree (see §8).
**Library:** [`AbelVM/performance-helpers`](https://github.com/AbelVM/performance-helpers) (npm `performance-helpers`, MIT, side‑effect‑free ESM, tree‑shakable, per‑helper subpath imports)
**Scope:** Identify helpers that could improve **performance**, **maintainability**, or **robustness** of Desire Paths, with tradeoffs. Each helper can be installed/imported individually (`performance-helpers/powerCache`) or via the whole package.

---

## 1. Executive summary

Desire Paths is already an **aggressively hand‑optimized** codebase. It ships its own worker pool, several bounded caches, Dial's‑algorithm Dijkstra, CSR adjacency, SharedArrayBuffer zero‑copy transfers, pooled scratch buffers, a tree‑shaken logger, a seeded RNG, and cooperative main‑thread yielding. For the **CPU hot paths**, most `performance-helpers` primitives would be lateral at best and a **regression at worst** (they are general‑purpose and would re‑introduce copies/allocations this code deliberately removed).

The real, low‑risk wins are concentrated in two areas:

1. **The geocoding / network path** (`src/main.js`), which today has *no* timeout, *no* retry, *no* real rate limiting (Nominatim requires ≤1 req/s), and *no* circuit breaking. This is where `PowerDeadline`, `PowerRetry`, `PowerThrottle`/`PowerSlidingWindow`, `PowerCircuit`, and `PowerTTLMap` add genuine robustness with zero hot‑path risk.
2. **The many duplicated hand‑rolled bounded caches** (gradient cache, path cache, disk cache, poly‑cells cache, geocoder cache), several of which are actually FIFO (evict oldest‑inserted) despite being commented as "LRU" and use O(n) `indexOf`/`splice`/`shift`. A single `PowerCache` gives correct O(1) LRU + TTL + inflight dedupe and removes ~5 near‑duplicate implementations.

Everything else (`PowerPool`, `PowerBuffer`, `PowerLogger`, `PowerChunker`, `PowerBatch`) is either a partial fit that conflicts with existing domain‑specific optimizations, or a strict downgrade. Recommendation for those: **do not adopt**, or adopt only in the narrow sub‑cases noted below.

A cross‑cutting caveat: the package is young (3 GitHub stars, single maintainer). For a shipped GH‑Pages app, weigh the **supply‑chain / long‑term maintenance risk** against the boilerplate saved — prefer per‑helper subpath imports so the bundle only carries what you use.

---

## 2. What the codebase already hand-rolls (the baseline to beat)

| Concern | Current implementation | File |
|---|---|---|
| Worker pool (keyed by task kind, idle reaper, per‑task timeout, progress forwarding, SAB zero‑copy transfers, local fallback) | `spatialWorker.js` (~1,166 lines) | `src/helpers/spatialWorker.js` |
| Env‑agnostic worker execution | `runWorker` + `runLocally` fallback (browser Worker or synchronous Node path) | `src/helpers/spatialWorker.js` |
| Gradient result cache | hand‑rolled LRU: `_gradientCacheOrder` array + `indexOf`/`splice`, `GRADIENT_CACHE_MAX_ENTRIES=16`, generation‑keyed, protected‑set eviction | `src/helpers/compute.js:139-166` |
| Path‑cells cache | FIFO cache: `_pathCacheOrder.push`/`.shift()`, cap 256 | `src/helpers/agentTasks.js:141-164` |
| Disk cache | FIFO cache: `_diskCacheOrder.push`/`.shift()`, cap 256 | `src/helpers/agentTasks.js:166-190` |
| Visibility / poly‑cells / neighbor‑disk / surface / lat‑lng caches | more of the same, various caps | `constants.js:463-482`, `spatialTasks.js:155` |
| Geocoder cache + debounce | `Map` with manual TTL prune + 200‑entry cap + 300ms debounce timer | `src/main.js:314-388` |
| Priority queue for Dijkstra | Dial's algorithm with pooled circular buckets (faster than a heap here) | `src/helpers/dijkstra.js` |
| Deferred promises | `new Promise((resolve)=>waiting.push(resolve))` | `spatialWorker.js:195` |
| Buffer packing / transferables | `packCSR`, `flattenPayloadAndTransfers`, SAB when cross‑origin isolated | `spatialWorker.js:273-308, 907-989` |
| Logger | 29‑line leveled logger, no‑op + tree‑shaken in prod | `src/helpers/logger.js` |
| Timing | direct `performance.now()` | `spatialWorker.js:800` |
| Seeded RNG / hashing | LCG + FNV‑1a | `src/helpers/rng.js` |
| Chunking / load balancing | `splitIntoChunks` + `splitIntoBalancedChunks` (LPT scheduling by vertex cost) | `spatialWorker.js:222-266` |

The library exists to provide exactly these primitives — so most matches are "you already built this." The analysis below is therefore about *net* value, not raw applicability.

---

## 3. Recommended (clear net win, low hot‑path risk)

### 3.1 Geocoding network resilience — the strongest case

Current code (`src/main.js:319-388`) does a bare `fetch` to Nominatim inside a 300 ms debounce, wrapped in try/catch that only `console.error`s. Problems: a hung request never resolves; a transient 5xx/network blip surfaces as "no results"; there is no enforcement of Nominatim's **1 request/second** usage policy (debounce ≠ rate limit — hold the key and it fires repeatedly); repeated failures keep hammering a down service.

Adopt a small stack here:

- **`PowerDeadline`** — per‑attempt timeout + total budget + retry policy in one wrapper, replacing the current unbounded `fetch`.
- **`PowerRetry`** — backoff + jitter for transient failures (also fits the manual two‑level retry in `spatialWorker.js:806-833`, `runFastScanTask`).
- **`PowerSlidingWindow`** (capacity 1, window 1000 ms) or **`PowerThrottle`** — enforce Nominatim's ≤1 req/s politely; combine via **`PowerRateLimit`** if you want both a burst cap and sustained cap.
- **`PowerCircuit`** — fail fast (from cache / friendly message) when Nominatim is unhealthy instead of queuing more calls.
- **`PowerTTLMap`** or **`PowerTimedCache`** — replace the manual `geocoderCache` + prune loop (the 5‑minute TTL, LRU‑by‑insertion, 200‑cap logic in `main.js:323-365` becomes one construction).

**Value:** real robustness + policy compliance + less code, on an I/O path where the extra abstraction cost is irrelevant.
**Tradeoff:** adds 4–5 small deps to the geocoder module; slightly more moving parts than a `fetch`. Mitigate by importing only the subpaths you use.
**Effort:** low. Isolated to `main.js` (and optionally the fast‑scan retry).

### 3.2 `PowerCache` / `PowerMemoizer` — unify the bounded caches

The project has at least five separate bounded caches, several of which:
- are labeled "LRU" but are actually **FIFO** (they push on insert and `shift()` the oldest, never reordering on hit — e.g. `agentTasks.js:156-162`, `181-188`), so a hot key inserted early gets evicted while cold recent keys survive;
- use **O(n)** `indexOf`+`splice` for recency (`compute.js:142`), and O(n) `shift()` for eviction.

`PowerCache` provides true O(1) LRU via an internal linked list + node pool (less GC), TTL, weighted eviction, `getOrSetAsync` inflight dedupe, and `onEvict`/`stats()`/`hitRate`. Replacing the ad‑hoc caches with one class:
- fixes the FIFO‑masquerading‑as‑LRU behavior (potential **hit‑rate improvement**),
- deletes duplicated eviction logic (**maintainability**),
- gives observability (`stats()`, `hitRate`) that the current caches lack.

`getOrSetAsync` is a particularly good fit for the **gradient cache** in `compute.js`, which already hand‑builds an inflight‑promise map (`_pendingGradientPromises`, `compute.js:365-418`) to dedupe concurrent misses — that entire mechanism is `getOrSetAsync` out of the box.

**Value:** maintainability + correctness + possible hit‑rate gains; strong fit for the geocoder and gradient caches.
**Tradeoffs:**
- The `path`/`disk` caches (`agentTasks.js`) live **inside the agent worker's hot loop**. A `PowerCache` method call per lookup has more overhead than a bare `obj[k]` read on a plain object. Keep those two as‑is unless profiling shows the FIFO eviction is actually hurting; prioritize the geocoder + gradient caches where lookups are not per‑tick.
- The gradient cache's **generation keying** and **protected‑set** eviction (never evict the current run's targets) map naturally onto PowerCache (touch current targets → they become MRU), but you must verify the semantics rather than assume them.
**Effort:** low‑medium (do it cache‑by‑cache, start with geocoder + gradient).

---

## 4. Consider (partial fit; adopt only with eyes open)

### 4.1 `PowerPool` (+ optional `WorkerAgnostic`) — the worker pool

`spatialWorker.js` is the single largest chunk of infrastructure and `PowerPool` covers a lot of it: pooling, idle termination (`idleTimeout`), queuing with policies, `awaitResponse` + `timeout` (replacing the manual `WORKER_TASK_TIMEOUT` bookkeeping), autoscaling, `getStats()`, and graceful `drain()`/`shutdown()`. `WorkerAgnostic` could replace the browser‑only `new Worker(new URL(...))` + `runLocally` split with one API that also runs real `worker_threads` in Node.

But there are real conflicts:

- **PowerPool auto‑encodes plain‑object messages to `Uint8Array` via `o2u8`** (a JSON‑style serialize) unless you pass an explicit transfer list. This project deliberately avoids cloning by sharing **SharedArrayBuffer** memory zero‑copy and transferring typed arrays (`flattenPayloadAndTransfers`, `packCSR`, `allocTransferBuffer`). Naively moving to PowerPool could **regress** the carefully tuned zero‑copy path. You'd need to keep passing explicit transfers / `zeroCopy: true`, which claws back much of the simplification.
- **One pool per worker script.** The code keys a single pool by task *kind* across **two** scripts (`spatial.worker.js`, `agent.worker.js`) with different concurrency caps (`MAX_WORKERS`, `MAX_FASTSCAN_WORKERS`, `MAX_AGENT_WORKERS`). You'd run 2–3 `PowerPool` instances and lose the unified kind‑routing.
- **Domain invariant PowerPool can't know:** the agent batch must run as a *single* consistent shared‑state context, or be sharded across workers over *one shared SAB footprint via `Atomics.add`* (`spatialWorker.js:547-580`). That correctness constraint (and its SIGILL history with 2+ workers cloning independent state) is not something a generic pool models. The agent path is the highest‑risk to touch.

**Verdict:** Reasonable candidate for the **stateless** pools only — `gradient-batch` and `fast-scan`/`fast-scan-chunk` are "embarrassingly parallel" and could sit on a `PowerPool` to shed boilerplate. **Leave the `agent-batch` path alone.** Even for the stateless pools, keep explicit transfers to preserve zero‑copy.
**Value:** medium (maintainability); **risk:** medium‑high; **effort:** high. Only worth it if `spatialWorker.js` maintenance is an active pain point.

### 4.2 `PowerQueue` — O(1) waiter/queue buffer

`waitingAcquiresByKind` uses arrays with `push`/`shift()` (O(n) dequeue) for worker‑slot waiters (`spatialWorker.js:149, 195-198`). `PowerQueue` is an O(1) ring buffer. In practice the waiter list is tiny (bounded by concurrency), so this is a micro‑win. More interesting if you build the ingestion/backpressure pattern, which this app doesn't have.
**Value:** low. **Effort:** low. Nice‑to‑have, not a priority.

### 4.3 `PowerSemaphore` / `PowerPermitGate` — concurrency gate

`acquireWorkerSlot`/`releaseWorkerSlot` is effectively a per‑kind semaphore **plus** an object pool (it reuses Worker instances, not just permits). `PowerSemaphore` models the permit half cleanly but not the worker‑instance reuse, so it only replaces part of the logic. If you adopt `PowerPool` (4.1) this becomes moot.
**Value:** low as a standalone change. **Effort:** low‑medium.

### 4.4 `PowerDefer` — deferred promises

`new Promise((resolve) => waiting.push(resolve))` (`spatialWorker.js:195`) is a textbook deferred; `PowerDefer` makes intent explicit and slightly tidier. Cosmetic.
**Value:** very low. **Effort:** trivial.

### 4.5 `PowerEventBus` / `PowerObserver` — progress/UI fan‑out

Progress today flows through a **single** global `_progressHandler` (`spatialWorker.js:74-80`) and `syncSimulationUI`. If you ever want multiple independent subscribers (UI progress bar + telemetry + logging) an `PowerEventBus` decouples them; `PowerObserver` fits a single reactive value (e.g. `simulationProgress`). Not needed for current single‑consumer usage.
**Value:** low‑medium (only if subscriber count grows). **Effort:** low.

### 4.6 Timing utils (`nowMs`, `measureSync`, `measureAsync`) + `PowerHistogram`

The code calls `performance.now()` directly in a couple of spots. `nowMs()` standardizes the environment‑guarded timer; `measureAsync` could wrap worker dispatch for consistent instrumentation; `PowerHistogram` would give percentile latency for gradient/agent batches if you want telemetry.
**Value:** low (nice for profiling). **Effort:** low. Optional, dev‑time only.

---

## 5. Not recommended (no win or a regression)

- **`PowerBuffer` (`o2b`/`o2u8`/`b2o`/`u82o`)** — encodes **JS objects/JSON** to binary. This project's cross‑worker payloads are already **typed arrays / CSR buffers** shared via SAB. Routing them through PowerBuffer would add a serialize/deserialize step and *undo* the zero‑copy design. Keep `packCSR`/`flattenPayloadAndTransfers`.
- **`PowerLogger`** — the existing `logger.js` (29 lines) is already better tuned for this app: it's a no‑op in prod *and tree‑shakes the call sites out of the bundle* via `import.meta.env.PROD`. PowerLogger adds counters/sinks you don't need and won't tree‑shake as cleanly. No reason to switch.
- **`PowerChunker`** — replaces naive `splitIntoChunks`, but the project uses `splitIntoBalancedChunks` with **LPT scheduling by polygon vertex cost** to prevent worker stragglers on huge MultiPolygons (`spatialWorker.js:248-266`). PowerChunker's fixed `chunkSize` is a downgrade for the fast‑scan workload. Keep the balanced chunker.
- **`PowerBatch` / `PowerScheduler`** — the app already coalesces the right things (mousemove via `requestAnimationFrame` in `main.js:404-431`, layer rebuilds via `_layerDataVersion`). No batchable RPC pattern that would benefit.
- **Wholesale `spatialWorker.js` rewrite onto library primitives** — the SAB zero‑copy + agent shared‑state constraints make a full swap high‑risk for little gain. Prefer targeted extraction (4.1) if at all.

---

## 6. Cross-cutting tradeoffs

- **Install granularity:** the package is side‑effect‑free and exposes per‑helper subpaths (`performance-helpers/powerCache`, `/powerRetry`, …). Import individually so Vite/Terser only bundle what's used — important for a client‑side GH‑Pages app. Avoid the barrel `import { ... } from 'performance-helpers'` if you only need two helpers.
- **Bundle size:** every added helper is client‑shipped JS. The geocoder stack (5 small helpers) and one `PowerCache` are cheap; a full `PowerPool` adoption is heavier. Measure with `npm run build` before/after.
- **Hot‑path overhead:** class‑method dispatch and generic option handling are fine on I/O and per‑run paths, but the **agent per‑tick loop** and **per‑step caches** are where this project spent its optimization budget. Do not put library abstractions there.
- **Zero‑copy preservation:** any helper that touches worker messaging must be configured to keep transfers/SAB explicit, or it silently reintroduces structured‑clone copies (the exact thing this code engineered away, and which previously caused SIGILL).
- **Maturity / supply chain:** 3 stars, single maintainer, v‑early. For durable app code, vendoring a single helper's source (MIT) is a legitimate alternative to a runtime dependency — you get the O(1) LRU without a dependency you must track. Weigh this per helper.
- **Testing:** the repo has 341 tests; anything swapped in (especially caches with subtly different eviction, or the gradient inflight‑dedupe) must keep those green. The FIFO→true‑LRU change in particular can alter eviction order — assert behavior, don't assume parity.

---

## 7. Suggested adoption plan (phased, lowest risk first)

1. **Geocoder hardening (high value, isolated):** wrap the Nominatim `fetch` with `PowerDeadline` + `PowerRetry`, gate it with `PowerSlidingWindow`/`PowerThrottle` (via `PowerRateLimit`), guard with `PowerCircuit`, and replace `geocoderCache` with `PowerTTLMap`/`PowerTimedCache`. Scope: `src/main.js` only.
2. **Gradient cache → `PowerCache.getOrSetAsync`:** replaces the bespoke LRU order array *and* the `_pendingGradientPromises` inflight map in `compute.js`. Verify generation + protected‑target semantics against existing tests.
3. **(Optional) fast‑scan retry → `PowerRetry`:** simplify the manual two‑level retry in `runFastScanTask`.
4. **(Optional, only if `spatialWorker.js` is a maintenance burden):** move the **stateless** `gradient-batch` / `fast-scan` pools onto `PowerPool` with explicit transfers. Leave `agent-batch` and its SAB footprint logic untouched.
5. **Skip:** `PowerBuffer`, `PowerLogger`, `PowerChunker`, `PowerBatch`, and the per‑step `path`/`disk` caches — current implementations are equal or better for this codebase.

**Bottom line:** treat `performance-helpers` as a **robustness and de‑duplication toolkit for the I/O and caching layers**, not as a performance upgrade for the compute core. The compute core is already past what a general‑purpose library will give you; the network/geocoder path and the tangle of hand‑rolled caches are where it clearly helps.

---

## 8. Implementation log (3.1 + 3.2)

Both recommendations were implemented and verified (lint clean, 360 tests pass, production build OK). The worker/SharedArrayBuffer payload path (`spatialWorker.js`, `agentTasks.js`, `frictionStore.js`) was **not touched** — the SAB zero‑copy pattern is fully preserved. All helpers are imported via individual subpaths for treeshaking; the build emits a dedicated `vendor-performance-helpers` chunk (31.2 kB / 8.15 kB gzip) containing only the four used helpers.

### 3.1 — Geocoder network resilience (`src/main.js`)
Replaced the bare `fetch` + hand‑rolled `Map` cache with:
- **`PowerCache`** (`maxEntries: 1000`, `defaultTTL: 30d`) — bounded TTL+LRU cache, replacing the manual 5‑min/200‑entry `Map` with its O(n) prune loop.
- **`PowerSlidingWindow`** (`capacity: 1, windowMs: 1000`) — enforces Nominatim's ≤1 req/s policy (the old 300 ms debounce was not a rate limit).
- **`PowerCircuit`** (`threshold: 5, timeout: 10000`) — trips open after 5 consecutive failures and fails fast (cache/empty) instead of hammering a down service.
- **`PowerDeadline`** (`maxAttempts: 2, totalTimeout: 4000`, exponential backoff + jitter, `retryIf` on 5xx) — per‑call timeout + retry, with the abort `signal` passed through to `fetch`.

The existing 300 ms debounce is kept (it still smooths keystrokes). `encodeURIComponent` is now applied to the query. Failures degrade to an empty result set rather than throwing into the geocoder control.

### 3.2 — Gradient cache (`src/helpers/compute.js`)
Replaced the hand‑rolled `_gradientCacheObj` plain object + `_gradientCacheOrder` recency array + `_touchGradientKey`/`_pruneGradientCache` manual eviction with a single **`PowerCache`** (`maxEntries: GRADIENT_CACHE_MAX_ENTRIES`). The current run's destinations are protected from eviction via the cache's `weightFn` (returns `Infinity` for keys in `state._protectedGradientDests`), preserving the old "never evict active targets" invariant. The batching of `runGradientBatches` (a deliberate perf optimization) is **kept intact** — only the storage/eviction layer changed. Cached values are plain‑object distance maps (not typed arrays/SABs), so this does not interact with the worker zero‑copy path. `clearGradientCache` now drops the instance (`cache = null`, lazily recreated).

### Tests updated
`tests/compute.test.js`, `tests/integration.test.js`, `tests/gridObstacles.test.js`, `tests/computeDesirePaths.test.js` — renamed `_gradientCacheObj` → `_gradientCache` and updated assertions to the PowerCache shape (seeded via `new PowerCache(...).set(...)`, cleared state asserted as `null`). The DesireMap proxy test's generic probe was renamed to `_gradientCacheProbe` so it no longer collides with the whitelisted `_gradientCache` state key.

### Not adopted (per the report's "not recommended" section)
`PowerBuffer`, `PowerLogger`, `PowerChunker`, `PowerBatch`, and the per‑step `path`/`disk` caches were deliberately left as‑is. `PowerRetry` was folded into the fast‑scan retry (see §9). `PowerPool` was not applied to the worker pool (SAB zero‑copy + agent shared‑state constraints) — only its `getStats()`/`drain()` *operability ideas* were borrowed (§9, #3).

---

## 9. Follow-up improvements applied (observability + robustness patterns)

After 3.1/3.2, the remaining transferable value was **observability and robustness patterns**, not new dependencies. Three were implemented and verified (lint clean, 360 tests pass, build OK):

### #1 — Cache observability (`PowerCache.stats()` / `hitRate`)
- `compute.js`: added `getGradientCacheStats(ctx)` and `clearGradientCache` now logs the gradient cache's `stats()` + `hitRate` via `logger.debug` (dev‑only; no‑op in prod) before dropping the instance — confirms the 3.2 LRU is actually being used.
- `main.js`: exposed `window.__dp_getGeocoderCacheStats` (→ `geocoderCache.stats()`) and `window.__dp_getGradientCacheStats` (→ `getGradientCacheStats(desireMap)`) dev hooks, following the existing `window.__dp_*` convention.

### #2 — Fast-scan retry hardening (`PowerRetry`)
`spatialWorker.js` `runFastScanTask` previously used a manual two‑level `.catch` (one retry, no backoff, no jitter). Replaced with `PowerRetry.run(..., { maxAttempts: 3, baseDelay: 200, backoff: 'exponential', jitter: true, retryIf: () => true, onRetry })` plus the existing local main‑thread fallback on exhaustion. `runWorker` already enforces its own `WORKER_TASK_TIMEOUT`, so no `attemptTimeout` is passed (no signal needed). A single flaky/hung chunk worker can no longer stall the whole `Promise.all`.

### #3 — Pool operability (borrowed `PowerPool.getStats()`/`drain()` *ideas*, not the lib)
- Added `getWorkerPoolStats()` — per-kind `{ poolSize, idle, waiting, max, latencyMs }` + `_total`, reading the existing `workerPoolByKind`/`idleWorkersByKind`/`waitingAcquiresByKind` maps. `latencyMs` is a `PowerHistogram` snapshot (`{ count, p50, p95, p99, max }`).
- Added `drainWorkerPool()` — terminates all workers, clears pool state (incl. latency histograms), and stops the idle-reaper interval (supersedes the bare `terminateAllWorkers`, which remains the public unload alias and also clears the histograms).
- Exposed `window.__dp_getWorkerPoolStats` and `window.__dp_drainWorkerPool` dev hooks.
- **`PowerHistogram` latency telemetry:** one lock-free histogram per worker kind (`workerLatencyHistograms` map, range `1..WORKER_TASK_TIMEOUT`, 128 buckets). `runWorker` records `performance.now()` deltas (queue-wait + compute) on both success and failure settlement; `_latencySnapshot(kind)` reports p50/p95/p99/max. This is the missing half of the #3 observability pass — pool counts without latency distribution.

The worker/SAB zero‑copy payload path (`packCSR`, `flattenPayloadAndTransfers`, agent shared‑state) is **untouched** by all three.
