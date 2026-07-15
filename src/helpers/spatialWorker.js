import { logger } from './logger.js';
import {
  computeFastScanChunkSnapshot,
  computeFastScanSnapshot,
  computeGradientBatch,
  computeImpassableBlurSnapshot,
  computePathBlurSnapshot,
  computeVisibilityBearingCSRIndexed,
  buildMappingGraph,
  buildR1Adjacency,
  mergeCellsChunk,
  normalizeFrictionEntries,
  computeAoiHexes,
  deriveCellFrictionFromLayers,
  mergeLayerFriction,
} from './spatialTasks.js';
import { computeAgentBatch } from './agentTasks.js';
import { SIMULATION_PARAMS, AGENTS_PER_DESTINATION } from './constants.js';
import { gradientGet, getGradientGraph } from './dijkstra.js';
import { PowerRetry } from 'performance-helpers/powerRetry';
import { PowerHistogram } from 'performance-helpers/powerHistogram';

// AbortError for cancellation propagation
class AbortError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AbortError';
  }
}

const detectedHC =
  typeof navigator !== 'undefined' && navigator.hardwareConcurrency
    ? navigator.hardwareConcurrency
    : undefined;

const MAX_WORKERS = Math.min(4, Math.max(2, detectedHC || 4));

// fast-scan is stateless, SIGILL-safe, and embarrassingly parallel (one
// polygonToCells per geometry). It is not bound by the 4-worker cap that
// protects the shared-state agent batches, so let it scale to more cores.
export const MAX_FASTSCAN_WORKERS = Math.min(8, Math.max(2, detectedHC || 4));

// Agent-heavy tasks can be tuned separately. Default to `hardwareConcurrency - 1`
// (leave one core free) when available, otherwise fall back to `MAX_WORKERS`.
export let MAX_AGENT_WORKERS = detectedHC ? Math.max(1, detectedHC - 1) : MAX_WORKERS;

/**
 * Set the maximum number of concurrent agent workers. Accepts a positive integer.
 * Use this at runtime to tune agent-worker concurrency for profiling or fallback.
 */
export function setMaxAgentWorkers(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return;
  MAX_AGENT_WORKERS = Math.max(1, Math.floor(v));
}

export function getMaxAgentWorkers() {
  return MAX_AGENT_WORKERS;
}

// Dynamics-safe agent parallelism (P1, review10 §4/§1.1). When enabled AND the
// page is cross-origin isolated (so SharedArrayBuffer is available) AND Workers
// exist, `runAgentBatches` shards the plan across multiple agent workers that
// all accumulate wear into ONE SAB-backed footprint via `Atomics.add`. Default
// ON: there is no released/legacy behavior to preserve, and the runtime gates
// (Worker + crossOriginIsolated + valid graph + parallelizable plan) already
// prevent it from engaging unsafely — it simply falls back to single-worker
// otherwise. Mirrors `setMaxAgentWorkers` for runtime tuning.
let PARALLEL_AGENT_BATCHES = true;
export function setParallelAgentBatches(v) {
  PARALLEL_AGENT_BATCHES = !!v;
}
export function getParallelAgentBatches() {
  return PARALLEL_AGENT_BATCHES;
}

const WORKER_TASK_TIMEOUT = 45_000; // 45s timeout per worker task
const WORKER_IDLE_TIMEOUT = 300_000; // 5m — retire workers idle longer than this

// Pools keyed by task kind (e.g. 'agent-batch' -> agent workers)
const workerPoolByKind = new Map();
const idleWorkersByKind = new Map();
const waitingAcquiresByKind = new Map();

// Per-kind lock-free latency histograms (PowerHistogram) for worker-task
// duration telemetry. Range covers up to WORKER_TASK_TIMEOUT so long tasks are
// not clamped away. Read via getWorkerPoolStats(); reset on drain/terminate.
const workerLatencyHistograms = new Map();
function _getLatencyHistogram(kind) {
  let h = workerLatencyHistograms.get(kind);
  if (!h) {
    h = new PowerHistogram({ minValue: 1, maxValue: WORKER_TASK_TIMEOUT, bucketCount: 128 });
    workerLatencyHistograms.set(kind, h);
  }
  return h;
}
function _recordWorkerLatency(kind, ms) {
  if (!(ms >= 0)) return; // skip NaN/negative (e.g. no high-res clock)
  try {
    _getLatencyHistogram(kind).record(ms);
  } catch (_e) {}
}
function _latencySnapshot(kind) {
  const h = workerLatencyHistograms.get(kind);
  if (!h || h.count === 0) return { count: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  return {
    count: h.count,
    p50: Math.round(h.percentile(0.5)),
    p95: Math.round(h.percentile(0.95)),
    p99: Math.round(h.percentile(0.99)),
    max: Math.round(h.max),
  };
}

// Optional progress handler: receives {progress:true, phase, processed, total}
let _progressHandler = null;
export function setSpatialWorkerProgressHandler(fn) {
  _progressHandler = typeof fn === 'function' ? fn : null;
}
export function clearSpatialWorkerProgressHandler() {
  _progressHandler = null;
}

// Track last-used timestamp per worker slot for idle timeout cleanup
const _workerLastUsed = new WeakMap();

function _touchWorker(slot) {
  _workerLastUsed.set(slot.worker, Date.now());
}

// Periodic cleanup of idle workers — runs every 60s
let _idleCleanupInterval = null;
function _startIdleCleanup() {
  if (_idleCleanupInterval) return;
  _idleCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [kind, idle] of idleWorkersByKind) {
      const stillIdle = [];
      for (let i = 0; i < idle.length; i++) {
        const slot = idle[i];
        const lastUsed = _workerLastUsed.get(slot.worker);
        if (lastUsed && now - lastUsed > WORKER_IDLE_TIMEOUT) {
          try {
            slot.worker.terminate();
          } catch {
            // ignore termination errors
          }
          // Remove from pool as well
          const pool = workerPoolByKind.get(kind) || [];
          const poolIdx = pool.indexOf(slot);
          if (poolIdx !== -1) pool.splice(poolIdx, 1);
          workerPoolByKind.set(kind, pool);
        } else {
          stillIdle.push(slot);
        }
      }
      if (stillIdle.length === 0) {
        idleWorkersByKind.delete(kind);
      } else {
        idleWorkersByKind.set(kind, stillIdle);
      }
    }
  }, 60_000);
}

// Worker entry URLs must be STATIC string literals inside `new URL(..., import.meta.url)`
// so the bundler can statically detect and emit the worker chunks into `dist/`. A
// runtime-variable path (e.g. `new URL(script, import.meta.url)`) is invisible to
// Vite/Rollup, so the worker files are dropped from the production build → 404 on
// static servers → `createWorkerSlot` throws → fallback to main thread → "no mapping"
// toast. Keep the literal directly in `new Worker(...)` for reliable detection.
function createWorkerSlot(kind = 'spatial') {
  const script =
    kind === 'agent-batch' ? '../workers/agent.worker.js' : '../workers/spatial.worker.js';
  try {
    const worker =
      kind === 'agent-batch'
        ? new Worker(new URL('../workers/agent.worker.js', import.meta.url), { type: 'module' })
        : new Worker(new URL('../workers/spatial.worker.js', import.meta.url), { type: 'module' });
    logger.debug(`spatialWorker: createWorkerSlot kind=${kind} script=${script}`);
    const slot = { worker, kind };
    _touchWorker(slot);
    _startIdleCleanup();
    return slot;
  } catch (err) {
    try {
      console.error &&
        console.error(
          `spatialWorker: createWorkerSlot failed for kind=${kind} script=${script}`,
          err
        );
    } catch (_e) {}
    throw err;
  }
}

function releaseWorkerSlot(slot) {
  const kind = slot.kind || 'spatial';
  const waiting = waitingAcquiresByKind.get(kind) || [];
  const next = waiting.shift();
  if (next) {
    logger.debug(`spatialWorker: releasing slot to waiting acquirer for kind=${kind}`);
    _touchWorker(slot);
    next(slot);
  } else {
    const idle = idleWorkersByKind.get(kind) || [];
    idle.push(slot);
    idleWorkersByKind.set(kind, idle);
    _touchWorker(slot);
    logger.debug(
        `spatialWorker: released slot to idle pool for kind=${kind} idleCount=${idle.length}`
      );
  }
  waitingAcquiresByKind.set(kind, waiting);
}

function acquireWorkerSlot(kind = 'spatial') {
  logger.debug(`spatialWorker: acquireWorkerSlot requested kind=${kind}`);
  const idle = (idleWorkersByKind.get(kind) || []).pop();
  if (idle) {
    logger.debug(`spatialWorker: reusing idle worker for kind=${kind}`);
    _touchWorker(idle);
    return Promise.resolve(idle);
  }

  const pool = workerPoolByKind.get(kind) || [];
  const maxForKind =
    kind === 'agent-batch'
      ? MAX_AGENT_WORKERS
      : kind === 'fast-scan' || kind === 'fast-scan-chunk'
        ? MAX_FASTSCAN_WORKERS
        : MAX_WORKERS;
  if (pool.length < maxForKind) {
    const slot = createWorkerSlot(kind);
    pool.push(slot);
    workerPoolByKind.set(kind, pool);
    logger.debug(
        `spatialWorker: created new worker slot kind=${kind} poolSize=${pool.length}/${maxForKind}`
      );
    return Promise.resolve(slot);
  }

  logger.debug(
      `spatialWorker: no slots available, enqueuing acquirer for kind=${kind} poolSize=${pool.length}/${maxForKind}`
    );
  return new Promise((resolve) => {
    const waiting = waitingAcquiresByKind.get(kind) || [];
    waiting.push(resolve);
    waitingAcquiresByKind.set(kind, waiting);
  });
}

function retireWorkerSlot(slot) {
  const kind = slot.kind || 'spatial';
  const pool = workerPoolByKind.get(kind) || [];
  const index = pool.indexOf(slot);
  if (index !== -1) pool.splice(index, 1);
  workerPoolByKind.set(kind, pool);

  const idle = idleWorkersByKind.get(kind) || [];
  const idleIndex = idle.indexOf(slot);
  if (idleIndex !== -1) idle.splice(idleIndex, 1);
  idleWorkersByKind.set(kind, idle);

  try {
    logger.debug(`spatialWorker: retiring worker slot kind=${kind}`);
    slot.worker.terminate();
  } catch {
    // ignore termination errors
  }
}

function splitIntoChunks(items, chunkCount) {
  const chunks = [];
  const chunkSize = Math.ceil(items.length / chunkCount);
  for (let i = 0; i < items.length; i += chunkSize) chunks.push(items.slice(i, i + chunkSize));
  return chunks;
}

// Estimate the polygonToCells cost of a feature by its total vertex count.
// Buildings are many tiny polygons; landuse/landcover are few huge MultiPolygons.
// Balancing by vertex count (not feature count) keeps fast-scan workers from
// straggling on a chunk full of large polygons.
function featureVertexCost(feature) {
  const geom = feature && feature.geometry;
  if (!geom || !geom.coordinates) return 1;
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  let total = 0;
  for (let p = 0; p < polys.length; p++) {
    const poly = polys[p];
    for (let r = 0; r < poly.length; r++) total += poly[r].length;
  }
  return total || 1;
}

// Longest-processing-time scheduling: sort items by descending cost, then greedily
// assign each to the currently least-loaded chunk. Produces near-perfect balance
// across `chunkCount` workers for the polygonToCells workload.
function splitIntoBalancedChunks(items, chunkCount, costFn) {
  const n = items.length;
  if (chunkCount <= 1 || n <= 1) return [items];
  const k = Math.min(chunkCount, n);
  // Precompute costs once, then sort indices by descending cost (LPT scheduling).
  const costs = new Array(n);
  for (let i = 0; i < n; i++) costs[i] = costFn(items[i]);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => costs[b] - costs[a]);
  const chunks = Array.from({ length: k }, () => []);
  const loads = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    const idx = order[i];
    let min = 0;
    for (let c = 1; c < k; c++) if (loads[c] < loads[min]) min = c;
    chunks[min].push(items[idx]);
    loads[min] += costs[idx];
  }
  return chunks.filter((c) => c.length > 0);
}

// Flatten large payloads for cheaper structured-clone by converting plain
// friction/affordance lookup objects into transferable typed-array
// representations. `frictionEntries` was already flattened; extend the same
// treatment to `affordanceEntries` (S4) so the agent-batch worker no
// longer structured-clones a second N-entry plain object on every run.
function flattenPayloadAndTransfers(payload) {
  if (!payload || typeof payload !== 'object') return { payload, transfer: [] };
  function flattenOne(fe) {
    if (!fe || typeof fe !== 'object') return null;
    // Already flattened — nothing to do.
    if (
      fe.__flat &&
      Array.isArray(fe.keys) &&
      (ArrayBuffer.isView(fe.vals) || fe.vals instanceof ArrayBuffer)
    )
      return null;
    const keys = Object.keys(fe);
    if (keys.length === 0) return null;
    // S1-SAB (review6 §3): back the flattened buffer with a SharedArrayBuffer
    // when cross-origin isolated, so the worker reads the SAME memory (zero-copy
    // share, no memcpy). Otherwise a plain ArrayBuffer is transferred (detached).
    const vals = new Float32Array(allocTransferBuffer(keys.length * 4));
    for (let i = 0; i < keys.length; i++) vals[i] = Number(fe[keys[i]]) || 0;
    const transfer = vals.buffer instanceof SharedArrayBuffer ? [] : [vals.buffer];
    return { flat: { __flat: true, keys, vals }, transfer };
  }

  let transfer = [];
  let newPayload = payload;
  const fFlat = flattenOne(payload.frictionEntries);
  if (fFlat) {
    newPayload = Object.assign({}, newPayload, { frictionEntries: fFlat.flat });
    transfer = transfer.concat(fFlat.transfer);
  }
  const aFlat = flattenOne(payload.affordanceEntries);
  if (aFlat) {
    newPayload = Object.assign({}, newPayload, { affordanceEntries: aFlat.flat });
    transfer = transfer.concat(aFlat.transfer);
  }
  return { payload: newPayload, transfer };
}

function mergeFastScanEntries(target, source) {
  const sourceKeys = Object.keys(source);
  for (let k = 0; k < sourceKeys.length; k++) {
    const cell = sourceKeys[k];
    let targetLayerMap = target[cell];
    if (!targetLayerMap) targetLayerMap = target[cell] = Object.create(null);
    const sourceLayerMap = source[cell];
    const layerKeys = Object.keys(sourceLayerMap);
    for (let l = 0; l < layerKeys.length; l++) {
      const layer = layerKeys[l];
      const nextValue = sourceLayerMap[layer];
      targetLayerMap[layer] = mergeLayerFriction(targetLayerMap[layer], nextValue);
    }
  }
}

function runLocally(kind, payload) {
  if (kind === 'fast-scan') return computeFastScanSnapshot(payload);
  if (kind === 'fast-scan-chunk') return computeFastScanChunkSnapshot(payload);
  if (kind === 'gradient-batch') return computeGradientBatch(payload);
  if (kind === 'impassable-blur') return computeImpassableBlurSnapshot(payload);
  if (kind === 'path-blur') return computePathBlurSnapshot(payload);
  if (kind === 'visibility-bearing-indexed') return computeVisibilityBearingCSRIndexed(payload);
  if (kind === 'mapping-graph') return buildMappingGraph(payload);
  if (kind === 'r1-adjacency') return buildR1Adjacency(payload);
  if (kind === 'merge-cells') return mergeCellsChunk(payload);
  if (kind === 'aoi-hexes') return computeAoiHexes(payload?.polygon || null, payload?.resolution);
  throw new Error(`Unknown spatial task: ${kind}`);
}

function runWorker(kind, payload, signal) {
  if (typeof Worker === 'undefined') return Promise.resolve(runLocally(kind, payload));

  let slotPromise;
  try {
    slotPromise = acquireWorkerSlot(kind);
  } catch (err) {
    try {
      logger.warn(
          `spatialWorker: failed to acquire worker slot for kind=${kind}, running locally`,
          err
        );
    } catch (_e) {}
    return Promise.resolve(runLocally(kind, payload));
  }

  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const task = slotPromise.then(
    (slot) =>
      new Promise((resolve, reject) => {
        const { worker } = slot;
        let settled = false;

        const cleanup = () => {
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          if (timerId) clearTimeout(timerId);
          if (signal) signal.removeEventListener('abort', handleAbort);
        };

        const handleAbort = () => {
          if (settled) return;
          settled = true;
          cleanup();
          retireWorkerSlot(slot);
          reject(new AbortError(`Spatial worker task aborted for kind=${kind}`));
        };

        const handleMessage = (event) => {
          const data = event.data ?? {};
          // Forward progress events to registered handler and do not settle
          if (data && data.progress) {
            try {
              if (typeof _progressHandler === 'function') _progressHandler(data);
            } catch (_e) {}
            return;
          }
          if (settled) return;
          settled = true;
          cleanup();
          releaseWorkerSlot(slot);
          logger.debug(
              `spatialWorker: worker slot returned result kind=${slot.kind} ok=${Boolean(data.ok)}`
            );
          if (data.ok) resolve(data.result);
          else {
            const errMsg = data.error ?? 'Spatial worker task failed';
            const errStack = data.stack ? '\n' + data.stack : '';
            reject(new Error(errMsg + errStack));
          }
        };

        const handleError = (event) => {
          if (settled) return;
          settled = true;
          cleanup();
          retireWorkerSlot(slot);
          reject(event.error ?? new Error(event.message ?? 'Spatial worker error'));
        };

        const timerId = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          retireWorkerSlot(slot);
          reject(new Error(`Spatial worker task timed out after ${WORKER_TASK_TIMEOUT}ms`));
        }, WORKER_TASK_TIMEOUT);

        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);
        if (signal) {
          signal.addEventListener('abort', handleAbort, { once: true });
          if (signal.aborted) handleAbort();
        }

        try {
          const { payload: sendPayload, transfer } = flattenPayloadAndTransfers(payload);
          logger.debug(
              `spatialWorker: posting task to worker kind=${kind} transferCount=${transfer?.length || 0}`
            );
          if (transfer && transfer.length)
            worker.postMessage({ kind, payload: sendPayload }, transfer);
          else worker.postMessage({ kind, payload: sendPayload });
        } catch (error) {
          settled = true;
          cleanup();
          retireWorkerSlot(slot);
          reject(error);
        }
      })
  );
  return task.then(
    (r) => {
      _recordWorkerLatency(kind, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
      return r;
    },
    (e) => {
      _recordWorkerLatency(kind, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
      throw e;
    }
  );
}

/**
 * Run a spatial worker task with the same resilience as the fast-scan chunks
 * (review12 #4): retry with exponential backoff + jitter (PowerRetry), and fall
 * back to a local main-thread compute if every worker attempt fails, so a single
 * flaky/hung worker can no longer abort the whole mapping. Used by the
 * mapping-graph / visibility / merge / gradient tasks, which previously had no
 * retry/fallback (unlike fast-scan).
 *
 * On local-fallback failure we re-throw (rather than swallow) so the caller's
 * existing error handling degrades gracefully — these tasks are monolithic, so a
 * failed result is not safely mergeable like fast-scan's partial chunks.
 */
function runWorkerWithRetry(kind, payload, signal) {
  return PowerRetry.run(
    () => runWorker(kind, payload, signal),
    {
      maxAttempts: 3,
      baseDelay: 200,
      backoff: 'exponential',
      jitter: true,
      retryIf: (err) => !(err instanceof AbortError),
      onRetry: (attempt, err) => {
        try {
          logger.warn(`spatialWorker: ${kind} retry`, { attempt, err });
        } catch (_e) {}
      },
    }
  ).catch((err) => {
    try {
      logger.warn(`spatialWorker: ${kind} retries exhausted, falling back to local compute`, err);
    } catch (_e) {}
    try {
      return runLocally(kind, payload);
    } catch (localErr) {
      try {
        logger.error(`spatialWorker: ${kind} local fallback failed`, localErr);
      } catch (_e) {}
      throw localErr;
    }
  });
}

export async function runGradientBatches(targets, frictionSource, options = {}) {
  if (!targets || targets.length === 0) return Object.create(null);

  // Skip normalization when source is already a plain object (from computeDesirePaths snapshots)
  const frictionEntries =
    frictionSource && typeof frictionSource.entries !== 'function'
      ? frictionSource
      : normalizeFrictionEntries(frictionSource);

  // Guard: empty friction source means no walkable cells; return empty gradients
  if (Object.keys(frictionEntries).length === 0) return Object.create(null);
  // M3: shared r=1 CSR (+ AOI cell order) lets computeGradientBatch's
  // getGradientGraph filter it instead of running a per-cell gridDisk pass.
  const r1Adjacency = options?.r1Adjacency || null;
  const viewHexes = options?.viewHexes || null;
  // review12 #7: ship the SAB-backed friction array (aligned to viewHexes) so the
  // gradient worker builds the graph from the typed array with a stable cache key
  // across batches. Cloned per batch when not cross-origin isolated (no change).
  let shipFrictionArr = options?.frictionArr || null;
  if (shipFrictionArr && viewHexes && viewHexes.length === shipFrictionArr.length) {
    // review12 #7: the typed-array graph path only activates when the array is
    // SAB-backed (cross-origin isolated) — see computeAgentBatch /
    // computeDijkstraGradientForLookup. When that holds, ship the array directly
    // so the worker shares the SAME buffer (stable cache key across batches,
    // zero-copy). Otherwise drop it: the worker falls back to the normalized
    // plain-object path and a non-SAB array would only be a wasted O(N) copy.
    if (
      shipFrictionArr.buffer instanceof SharedArrayBuffer &&
      globalThis.crossOriginIsolated === true
    ) {
      // pass through unchanged (shared, zero-copy)
    } else {
      shipFrictionArr = null;
    }
  } else {
    shipFrictionArr = null;
  }
  const workerCount = Math.min(MAX_WORKERS, targets.length);
  if (workerCount <= 1)
    return runLocally('gradient-batch', { targets, frictionEntries, r1Adjacency, viewHexes, frictionArr: shipFrictionArr });

  const chunks = splitIntoChunks(targets, workerCount);
  const signal = options?.signal || null;
  const results = await Promise.all(
    chunks.map((chunk) =>
      runWorkerWithRetry('gradient-batch', { targets: chunk, frictionEntries, r1Adjacency, viewHexes, frictionArr: shipFrictionArr }, signal)
    )
  );

  const merged = Object.create(null);
  for (let i = 0; i < results.length; i++) {
    const batch = results[i];
    const batchKeys = Object.keys(batch);
    for (let k = 0; k < batchKeys.length; k++) {
      merged[batchKeys[k]] = batch[batchKeys[k]];
    }
  }
  return merged;
}

/**
 * Normalize a raw computeAgentBatch result (which may carry `__flat`-encoded
 * pathDesire / perTargetContribs typed arrays) into the plain-object shape
 * runAgentBatches returns. Shared by the local (main-thread) and worker
 * dispatch paths so both produce identical output (S1).
 */
function normalizeAgentResult(result) {
  const outPath = Object.create(null);
  if (result && result.pathDesire) {
    if (result.pathDesire.__flat) {
      const keys = result.pathDesire.keys || [];
      const vals = ArrayBuffer.isView(result.pathDesire.vals)
        ? result.pathDesire.vals
        : new Uint32Array(result.pathDesire.vals || []);
      for (let i = 0; i < keys.length; i++) outPath[keys[i]] = vals[i];
    } else if (typeof result.pathDesire === 'object') {
      Object.assign(outPath, result.pathDesire);
    }
  }
  const outPer = Object.create(null);
  if (result && result.perTargetContribs) {
    for (const dest in result.perTargetContribs) {
      // Skip any internal metadata keys
      if (typeof dest === 'string' && dest.startsWith('__')) continue;
      const entry = result.perTargetContribs[dest];
      if (entry && entry.__flat) {
        const keys = entry.keys || [];
        const vals = ArrayBuffer.isView(entry.vals)
          ? entry.vals
          : new Uint32Array(entry.vals || []);
        const obj = Object.create(null);
        for (let i = 0; i < keys.length; i++) obj[keys[i]] = vals[i];
        outPer[dest] = obj;
      } else if (entry && typeof entry === 'object') {
        outPer[dest] = entry;
      }
    }
  }
  return {
    pathDesire: outPath,
    perTargetContribs: outPer,
    processed: result?.processed || 0,
    total: result?.total || 0,
  };
}

// Split the agent plan into `workerCount` contiguous shards (one per worker).
// Exported for testing the sharding logic in isolation.
export function shardPlanForAgents(plan, workerCount) {
  if (!plan || plan.length === 0) return [];
  return splitIntoChunks(plan, Math.max(1, workerCount));
}

// Sum per-shard agent results into one result. `pathDesire` and
// `perTargetContribs` have no cross-shard interaction (each shard owns its
// pairs), so they merge by simple summation; `processed`/`total` are summed for
// progress reporting. Inputs are the normalized `{ pathDesire, perTargetContribs,
// processed, total }` shapes `normalizeAgentResult` produces.
export function mergeAgentResults(results) {
  const pathDesire = Object.create(null);
  const perTargetContribs = Object.create(null);
  let processed = 0;
  let total = 0;
  for (let r = 0; r < results.length; r++) {
    const res = results[r];
    if (!res) continue;
    processed += res.processed || 0;
    total += res.total || 0;
    const pd = res.pathDesire || Object.create(null);
    for (const cell in pd) pathDesire[cell] = (pathDesire[cell] || 0) + (pd[cell] || 0);
    const pt = res.perTargetContribs || Object.create(null);
    for (const dest in pt) {
      const obj = pt[dest] || Object.create(null);
      let target = perTargetContribs[dest];
      if (!target) target = perTargetContribs[dest] = Object.create(null);
      for (const cell in obj) target[cell] = (target[cell] || 0) + (obj[cell] || 0);
    }
  }
  return { pathDesire, perTargetContribs, processed, total };
}

// P1 (review10 §4/§1.1): dynamics-safe agent parallelism. The plan is sharded
// across multiple `agent-batch` workers that ALL accumulate wear into a single
// SAB-backed `Int32Array(V)` footprint via `Atomics.add`. Because the only
// cross-agent interaction is the integer footprint count, a shared atomic
// accumulator preserves the global-sharing ABM dynamics correctly across shards.
// `pathDesire`/`perTargetContribs` are per-shard, so they are merged by
// summation on the main thread. Cross-pair ordering becomes non-deterministic
// (accepted: same tolerance the T>0 tests already use); the default
// single-worker path is unchanged.
async function runParallelAgentBatches(plan, agentPayload, gradientGraph, options) {
  const V = gradientGraph.V;
  // Reuse a caller-provided SAB (enables cross-wave persistence: the same buffer
  // is shared by every wave's shards) when present and correctly sized; else
  // allocate a fresh one for this wave.
  const provided = options?.footprintBuffer;
  const sharedFootprints =
    provided instanceof Int32Array &&
    provided.buffer instanceof SharedArrayBuffer &&
    provided.length >= V
      ? provided
      : new Int32Array(new SharedArrayBuffer(V * 4));
  const workerCount = Math.min(MAX_AGENT_WORKERS, plan.length);
  const chunks = shardPlanForAgents(plan, workerCount);
  const results = await Promise.all(
    chunks.map((chunk) =>
      runWorker('agent-batch', {
        ...agentPayload,
        plan: chunk,
        options: Object.assign({}, options, { footprintBuffer: sharedFootprints }),
      }, options?.signal || null)
    )
  );
  return mergeAgentResults(results.map(normalizeAgentResult));
}

// ── Wave-ordered parallel agent batches ────────────────────────────────────
// The fully-concurrent single-pass path (runParallelAgentBatches) shards the
// whole plan across workers at once, so there is no "later agent" ordering and
// the ABM positive feedback ("later agents follow earlier trails") is lost. To
// recover it without giving up worker parallelism, we run the plan in K ordered
// WAVES: within a wave the subset is sharded across workers and runs concurrently
// (fast), but each wave awaits the previous one so later waves see the wear
// earlier waves deposited into the shared SAB footprint. K is derived from the
// simulation shape (no new tunable) — see computeWaveCount.

// Split the plan into `waveCount` ordered waves such that EVERY wave contains
// agents from EVERY origin/dual node (see splitPlanIntoWaves). Each wave is later
// sharded across workers internally by runParallelAgentBatches.
// Split a count `n` as evenly as possible into `k` non-negative integers that
// sum to `n` (round-robin remainder). Used to divide one origin's agents across
// waves so every wave keeps a share of every origin.
function distributeCount(n, k) {
  const out = new Array(k).fill(0);
  if (n <= 0 || k <= 0) return out;
  const base = Math.floor(n / k);
  for (let i = 0; i < k; i++) out[i] = base;
  let rem = n - base * k;
  for (let i = 0; rem > 0; i = (i + 1) % k, rem--) out[i]++;
  return out;
}

// Split the plan into `waveCount` ORDERED waves such that EVERY wave contains
// agents from EVERY origin/dual node. Rather than chunking origins contiguously
// (which would put disjoint origin sets in different waves), we divide each
// origin's per-destination `assigned` counts round-robin across waves. Each wave
// therefore holds the full set of origins, each with a reduced agent share, so
// the ABM feedback is interleaved: later waves see wear from every origin's
// earlier agents, not just a subset. `destCandidates`/`originCell` are preserved;
// each wave's `totalVolume` is recomputed as the sum of its split `assigned`.
export function splitPlanIntoWaves(plan, waveCount) {
  if (!plan || plan.length === 0) return [];
  waveCount = Math.max(1, waveCount);
  if (waveCount === 1) {
    return [plan.map((e) => ({ ...e, assigned: e.assigned ? e.assigned.slice() : e.assigned }))];
  }
  const waves = Array.from({ length: waveCount }, () => []);
  for (const entry of plan) {
    const destCandidates = entry.destCandidates || [];
    const assigned = entry.assigned || [];
    const perDest = destCandidates.map((_dc, i) => distributeCount(assigned[i] || 0, waveCount));
    for (let w = 0; w < waveCount; w++) {
      const waveAssigned = destCandidates.map((_dc, i) => perDest[i][w]);
      let waveVolume = 0;
      for (let i = 0; i < waveAssigned.length; i++) waveVolume += waveAssigned[i] || 0;
      waves[w].push({
        originCell: entry.originCell,
        totalVolume: waveVolume,
        destCandidates,
        assigned: waveAssigned,
      });
    }
  }
  return waves;
}

// Derive the number of agent waves from the simulation shape. More origin/dual
// nodes and a higher `agentsPerWeightUnit` both call for more (finer) waves so
// that earlier agents' trails are visible to later ones. Bounded so the
// between-wave synchronization barriers stay negligible. Pure function of the
// plan length (active origin nodes) and the existing `agentsPerWeightUnit` param
// — no new tunable is exposed.
export function computeWaveCount(plan, options) {
  const nodeCount = plan ? plan.length : 0;
  if (nodeCount <= 1) return 1;
  const apwu =
    (options && options.simulationParams && options.simulationParams.agentsPerWeightUnit) ||
    SIMULATION_PARAMS.agentsPerWeightUnit;
  const BASE_ORIGINS_PER_WAVE = 4;
  const MIN_WAVES = 1;
  const MAX_WAVES = 16;
  // Higher density (apwu) => fewer origins per wave => more waves, keeping each
  // wave's agent volume roughly constant and balanced across waves.
  const originsPerWave = Math.min(
    nodeCount,
    Math.max(1, Math.round(BASE_ORIGINS_PER_WAVE * (AGENTS_PER_DESTINATION / apwu)))
  );
  return Math.min(MAX_WAVES, Math.max(MIN_WAVES, Math.ceil(nodeCount / originsPerWave)));
}

// Run the plan in ordered waves, sharding each wave across workers concurrently
// and synchronizing between waves so the shared SAB footprint accumulates. The
// same `options.footprintBuffer` (SAB when cross-origin isolated) is reused
// across waves, so wear from earlier waves is visible to later ones. Wave results
// are summed via mergeAgentResults (pathDesire/perTargetContribs are additive).
export async function runParallelAgentWaves(plan, agentPayload, gradientGraph, options) {
  const waveCount = computeWaveCount(plan, options);
  if (waveCount <= 1) {
    return runParallelAgentBatches(plan, agentPayload, gradientGraph, options);
  }
  const waves = splitPlanIntoWaves(plan, waveCount);
  const waveResults = [];
  for (let w = 0; w < waves.length; w++) {
    waveResults.push(await runParallelAgentBatches(waves[w], agentPayload, gradientGraph, options));
  }
  return mergeAgentResults(waveResults);
}

export async function runAgentBatches(
  plan,
  frictionSource,
  gradients,
  affordanceSource,
  hexCount,
  options = {}
) {
  if (!plan || plan.length === 0)
    return {
      pathDesire: Object.create(null),
      perTargetContribs: Object.create(null),
      processed: 0,
      total: 0,
    };

  const frictionEntries =
    frictionSource && typeof frictionSource.entries !== 'function'
      ? frictionSource
      : normalizeFrictionEntries(frictionSource);

  const affordanceEntries =
    affordanceSource && typeof affordanceSource.entries !== 'function'
      ? affordanceSource
      : normalizeFrictionEntries(affordanceSource);

  // review12 #7: ship the SAB-backed friction array (aligned to viewHexes order)
  // instead of a normalized plain-object copy. The worker builds the gradient
  // graph directly from the typed array and keys its cache on the (stable SAB)
  // buffer identity, so the graph is built ONCE per worker instead of once per
  // batch. The typed-array graph path only activates when the array is
  // SAB-backed (cross-origin isolated) — see computeAgentBatch. When that holds,
  // ship the array directly so the worker shares the SAME buffer (zero-copy).
  // Otherwise drop it: the worker falls back to the normalized plain-object path
  // and a non-SAB array would only be a wasted O(N) copy.
  const viewHexesForArr = options?.viewHexes || null;
  let shipFrictionArr = options?.frictionArr || null;
  if (shipFrictionArr && viewHexesForArr && viewHexesForArr.length === shipFrictionArr.length) {
    if (
      shipFrictionArr.buffer instanceof SharedArrayBuffer &&
      globalThis.crossOriginIsolated === true
    ) {
      // pass through unchanged (shared, zero-copy)
    } else {
      shipFrictionArr = null;
    }
  } else {
    shipFrictionArr = null;
  }

  const visibilityEntries = options?.visibilityEntries || null;
  // Precomputed origin-destination grid distances — eliminates per-tick H3 calls
  const originDestDistances = options?.originDestDistances || null;
  // Precomputed bearing map — eliminates per-tick trig calls in getBestNextStep.
  // It is rebuilt in-process as a CSR-backed BearingIndex (see grid.js) to avoid
  // materializing a per-pair Map at city scale. The agent simulation kernel reads
  // it with bracket access, which a BearingIndex supports directly, so it flows
  // through untouched. A legacy real `Map` (e.g. tests) is still converted to a
  // plain object here so the bracket-access kernel can hit the cache.
  const bearingMapRaw = options?.bearingMap || null;
  const bearingMap =
    bearingMapRaw && !bearingMapRaw.isBearingIndex && typeof bearingMapRaw.get === 'function'
      ? Object.fromEntries(bearingMapRaw)
      : bearingMapRaw;

  // Normalize gradients into a plain object for structured-clone. Each gradient
  // is a Float32Array(V) indexed by the gradient graph's cellToIdx (M1).
  const gradientsObj = Object.create(null);
  if (gradients) {
    if (typeof gradients.entries === 'function') {
      for (const [k, v] of gradients) gradientsObj[k] = v;
    } else {
      for (const k in gradients) gradientsObj[k] = gradients[k];
    }
  }
  // Build the gradient graph from the SAME friction source object
  // `computeDesirePaths` used (the canonical `cellFrictionMap` /
  // `_frictionObj` view), so the identity-keyed graph cache is shared and the
  // graph is built only ONCE per run instead of a second time from the
  // normalized plain-object copy we ship to the worker. M3: pass the shared
  // r=1 CSR (+ AOI cell order) so this build filters it instead of running a
  // per-cell gridDisk pass.
  const gradientGraph = getGradientGraph(
    frictionSource,
    options?.r1Adjacency || null,
    options?.viewHexes || null
  );

  // Diagnostic: ensure gradients required by the plan are present. If some are
  // missing, compute them here as a fallback to avoid races where callers
  // haven't fully populated gradients yet.
  try {
    const missingTargets = new Set();
    for (let pi = 0; pi < plan.length; pi++) {
      const entry = plan[pi];
      const originCell = entry.originCell;
      const destCandidates = entry.destCandidates || [];
      for (let di = 0; di < destCandidates.length; di++) {
        const destCell = destCandidates[di].dest;
        const grad = gradientsObj[destCell];
        const hasOrigin = grad && isFinite(gradientGet(grad, originCell, gradientGraph));
        if (!grad || !hasOrigin) missingTargets.add(destCell);
      }
    }

    if (missingTargets.size > 0) {
      logger.debug(
          'runAgentBatches: missing gradients for targets',
          Array.from(missingTargets)
        );
      // Compute missing gradients (uses same worker pool / normalization as callers)
      const newGrads = await runGradientBatches(Array.from(missingTargets), frictionSource, {
        r1Adjacency: options?.r1Adjacency || null,
        viewHexes: options?.viewHexes || null,
      });
      for (const k in newGrads) gradientsObj[k] = newGrads[k];
      // Re-check and log any that are still missing
      const stillMissing = [];
      for (const t of missingTargets) {
        const g = gradientsObj[t];
        if (!g) stillMissing.push(t);
      }
      if (stillMissing.length > 0)
        try {
          logger.warn(
              'runAgentBatches: still missing gradients after fallback compute',
              stillMissing
            );
        } catch (_e) {}
    }
  } catch (_e) {
    try {
      logger.warn('runAgentBatches: error while computing missing gradients', _e);
    } catch (_e2) {}
  }

  // The agent simulation is a true ABM: agents accumulate footprints into a single
  // shared `accumulatedFootprints` structure that boosts affordance for subsequent
  // agents (paper §3.4 — friction/affordance updates). That shared state MUST stay
  // consistent, so the plan runs in ORDERED WAVES (runParallelAgentWaves): each wave
  // shards its agent subset across workers and runs concurrently, but every wave
  // awaits the previous one so later waves read the wear earlier waves committed to
  // the shared SAB footprint. This preserves the ABM "later agents follow earlier
  // trails" interaction while keeping worker parallelism. Gradient batches
  // (runGradientBatches) remain parallel because they are independent per destination.
  //
  // S1: run off the main thread so the UI never blocks on the ABM loop (thousands of
  // agents × hundreds of ticks × getBestNextStep). When `Worker` is unavailable (Node
  // tests, SSR) we fall back to running computeAgentBatch synchronously on the main
  // thread — behavior is identical. The worker kernel is allocation-free (S3) so the
  // hot path stays fast.
  const useWorker = typeof Worker !== 'undefined';
  logger.debug(
      `runAgentBatches: dispatching agent-batches useWorker=${useWorker} planLength=${plan.length}`
    );

  const agentPayload = {
    plan,
    frictionEntries,
    frictionArr: shipFrictionArr,
    gradients: gradientsObj,
    affordanceEntries,
    hexCount,
    // Local path uses the reconstructed indices directly. The worker path receives
    // the raw packed visibility/bearing CSR + the exact AOI cell order and rebuilds
    // BOTH indices in-worker (S1-SAB, review6 §3 option 1): structured-cloning the
    // BearingIndex/VisibilityIndex Proxies drops their function-valued traps, which
    // would silently degrade every lookup to the slow trig / path-cell fallback.
    visibilityEntries: useWorker ? null : visibilityEntries,
    options,
    // `accumulatedFootprints` is no longer shipped (S5): the worker
    // owns its own empty accumulator, so we avoid a needless
    // structured-clone of an (empty) object across the boundary.
    originDestDistances,
    bearingMap: useWorker ? null : bearingMap,
    visibilityBearingCSR: options?.visibilityBearingCSR || null,
    viewHexes: options?.viewHexes || null,
    r1Adjacency: options?.r1Adjacency || null,
  };

  // P1 (review10 §4/§1.1): dynamics-safe agent parallelism. Shard the plan
  // across multiple agent workers sharing ONE SAB footprint accumulator. Gated on
  // the opt-in flag, a real Worker environment, cross-origin isolation (SAB
  // availability), a valid gradient graph, and enough plan entries to actually
  // parallelize. Any failure falls back to the single-worker path below.
  const wantParallel =
    (options?.parallelAgentBatches ?? PARALLEL_AGENT_BATCHES) &&
    useWorker &&
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof globalThis !== 'undefined' &&
    globalThis.crossOriginIsolated === true &&
    gradientGraph &&
    gradientGraph.V > 0 &&
    plan.length > 1 &&
    Math.min(MAX_AGENT_WORKERS, plan.length) > 1;

  if (wantParallel) {
    try {
      return await runParallelAgentWaves(plan, agentPayload, gradientGraph, options);
    } catch (err) {
      try {
        logger.warn('runAgentBatches: parallel dispatch failed, falling back to single worker', err);
      } catch (_e) {}
      // fall through to the single-worker path below
    }
  }

  if (!useWorker) {
    // run locally on main thread (Node / no Worker available)
    const ret = computeAgentBatch(agentPayload);
    return normalizeAgentResult(ret?.result ?? ret);
  }

  try {
    const ret = await runWorker('agent-batch', agentPayload, options?.signal || null);
    return normalizeAgentResult(ret);
  } catch (err) {
    try {
      logger.warn('runAgentBatches: worker dispatch failed, falling back to local', err);
    } catch (_e) {}
    // graceful fallback to local execution on worker failure
    const ret = computeAgentBatch(agentPayload);
    return normalizeAgentResult(ret?.result ?? ret);
  }
}

export async function runFastScanTask(viewHexes, features, r1Adjacency, aoiBbox = null) {
  if (!viewHexes || viewHexes.length === 0) {
    return {
      multiFrictionEntries: Object.create(null),
      cellFrictionEntries: Object.create(null),
      lineCorridorCells: Object.create(null),
      blurWeights: Object.create(null),
      blurUpdates: [],
      blurUpdateMap: null,
      pathBlurWeights: Object.create(null),
      pathBlurUpdates: [],
      pathBlurUpdateMap: null,
    };
  }

  const featureCount = features?.length ?? 0;
  if (featureCount <= 1) return runWorker('fast-scan', { viewHexes, features, aoiBbox });

  const workerCount = Math.min(MAX_FASTSCAN_WORKERS, featureCount);
  const chunks = splitIntoBalancedChunks(features, workerCount, featureVertexCost);
  if (chunks.length <= 1) return runWorker('fast-scan', { viewHexes, features, aoiBbox });

  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  logger.debug(
      `spatialWorker: fast-scan-chunk dispatch workerCount=${chunks.length} featureCount=${featureCount}`
    );

  // Launch all chunk tasks in parallel. Each chunk retries with exponential
  // backoff+jitter (PowerRetry) and falls back to a local main-thread compute if
  // every worker attempt fails, so a single flaky/hung chunk worker can no longer
  // stall the whole Promise.all (the old code only retried once, with no backoff).
  // `runWorker` enforces its own per-task timeout (WORKER_TASK_TIMEOUT), so we do
  // not pass an attemptTimeout here.
  const chunkTasks = chunks.map((chunk, chunkIndex) =>
    PowerRetry.run(
      () => runWorker('fast-scan-chunk', { viewHexes, features: chunk, aoiBbox }),
      {
        maxAttempts: 3,
        baseDelay: 200,
        backoff: 'exponential',
        jitter: true,
        retryIf: () => true,
        onRetry: (attempt, err) => {
          try {
            logger.warn('spatialWorker: fast-scan-chunk retry', { chunkIndex, attempt, err });
          } catch (_e) {}
        },
      }
    ).catch((err) => {
      try {
        logger.warn(
          'spatialWorker: fast-scan-chunk retries exhausted, falling back to local compute',
          { chunkIndex, err }
        );
      } catch (_e) {}
      try {
        // Fallback: compute the chunk locally on the main thread to avoid
        // incomplete results when all worker attempts fail.
        return runLocally('fast-scan-chunk', { viewHexes, features: chunk, aoiBbox });
      } catch (localErr) {
        try {
          logger.error('spatialWorker: fast-scan-chunk local fallback failed', {
            chunkIndex,
            localErr,
          });
        } catch (_e) {}
        return {};
      }
    })
  );

  // Blur is computed once below from the fully-merged friction data (see
  // runImpassableBlurTask / runPathBlurTask). The earlier "partial blur" path
  // computed a full blur on incomplete chunk data and discarded the result, so
  // it is intentionally gone.
  const results = await Promise.all(chunkTasks);

  if (t0) {
    logger.debug(
        `spatialWorker: fast-scan-chunk done in ${(performance.now() - t0).toFixed(1)}ms`
      );
  }

  // Merge all chunk results. The per-layer map merges with `mergeLayerFriction`
  // per (cell, layer): an impassable obstacle wins, else the hardest walkable
  // surface — so a paved path through a park stays pavement across chunks.
  const multiFrictionEntries = Object.create(null);
  const lineCorridorCells = Object.create(null);
  for (let i = 0; i < results.length; i++) {
    const batch = results[i] ?? {};
    mergeFastScanEntries(multiFrictionEntries, batch.multiFrictionEntries ?? Object.create(null));
    const batchCorridor = batch.lineCorridorCells;
    if (batchCorridor) {
      const keys = Object.keys(batchCorridor);
      for (let k = 0; k < keys.length; k++) lineCorridorCells[keys[k]] = true;
    }
  }
  // Derive the effective per-cell friction from the fully-merged layer map
  // using only layer=0 (ground surface). Bridges and underground features
  // do not affect the walkable surface. This keeps the result independent
  // of how features were sharded across chunk workers — previously a flat min
  // within a chunk vs. a max-of-mins across chunks caused an intermittent
  // misclassification (e.g. a fountain inside a public space flipping between
  // pavement and impassable). We no longer merge the per-cell scalars directly.
  const cellFrictionEntries = deriveCellFrictionFromLayers(multiFrictionEntries);

  // Run both blurs with complete data (re-run if early version already started).
  // Resolve the r1 adjacency promise here (it was launched in parallel with the
  // chunk computation above) so the blur BFS reuses the shared CSR.
  const r1 = r1Adjacency instanceof Promise ? await r1Adjacency : r1Adjacency;
  const [blur, pathBlur] = await Promise.all([
    runImpassableBlurTask(cellFrictionEntries, {
      viewHexes,
      r1Adjacency: r1,
    }),
    runPathBlurTask({
      corridorCells: Object.keys(lineCorridorCells),
      multiFrictionEntries,
      cellFrictionEntries,
      viewHexes,
      r1Adjacency: r1,
    }),
  ]);
  return {
    multiFrictionEntries,
    cellFrictionEntries,
    lineCorridorCells,
    blurWeights: blur.blurWeights,
    blurUpdates: blur.updates,
    blurUpdateMap: blur.blurUpdateMap,
    pathBlurWeights: pathBlur.pathBlurWeights,
    pathBlurUpdates: pathBlur.updates,
    pathBlurUpdateMap: pathBlur.pathBlurUpdateMap,
  };
}

// Expose runtime hooks for interactive debugging in the browser console (dev only)
if (import.meta.env.DEV) {
  try {
    if (typeof window !== 'undefined' && window) {
      window.__dp_setMaxAgentWorkers = setMaxAgentWorkers;
      window.__dp_getMaxAgentWorkers = getMaxAgentWorkers;
      window.__dp_setParallelAgentBatches = setParallelAgentBatches;
      window.__dp_getParallelAgentBatches = getParallelAgentBatches;
      window.__dp_getWorkerPoolStats = getWorkerPoolStats;
      window.__dp_drainWorkerPool = drainWorkerPool;
    }
  } catch (_e) {}
}

export async function runImpassableBlurTask(frictionSource, options = {}) {
  const frictionEntries =
    frictionSource && typeof frictionSource.entries !== 'function'
      ? frictionSource
      : normalizeFrictionEntries(frictionSource);
  return runWorker('impassable-blur', { frictionEntries, ...options });
}

export async function runPathBlurTask({
  corridorCells = [],
  multiFrictionEntries = Object.create(null),
  cellFrictionEntries = Object.create(null),
  viewHexes,
  r1Adjacency,
} = {}) {
  return runWorker('path-blur', {
    corridorCells,
    multiFrictionEntries,
    cellFrictionEntries,
    viewHexes,
    r1Adjacency,
  });
}

/**
 * Allocate a buffer for cross-worker transfer of the visibility/bearing result.
 *
 * Uses a SharedArrayBuffer when the page is cross-origin isolated (COOP/COEP,
 * which this app enables via coi-serviceworker.js) so the buffer is *shared*
 * with the main thread — zero-copy, no structured clone. Falls back to a plain
 * ArrayBuffer (cloned by memcpy) when SAB is unavailable. Either way the large
 * bearing Map is NEVER structured-cloned across the boundary, which is what
 * previously triggered SIGILL in this app.
 */
function allocTransferBuffer(byteLength) {
  if (
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof globalThis !== 'undefined' &&
    globalThis.crossOriginIsolated === true
  ) {
    return new SharedArrayBuffer(byteLength);
  }
  return new ArrayBuffer(byteLength);
}

/** Pack CSR components into one transferable buffer (SAB when isolated, else AB).
 *  Bearings are quantized to Uint16 (360/65536 ≈ 0.0055° step) — far more
 *  precision than the agent's angle math needs, and halves the bearing storage
 *  (P2/D3). */
function packCSR(visOffsets, visNeighbors, bearings, N, P) {
  const offsetsBytes = (N + 1) * 4;
  const neighborsBytes = P * 4;
  const bearingsBytes = P * 2;
  const totalBytes = offsetsBytes + neighborsBytes + bearingsBytes;
  const buffer = allocTransferBuffer(totalBytes);
  new Int32Array(buffer, 0, N + 1).set(visOffsets);
  new Int32Array(buffer, offsetsBytes, P).set(visNeighbors);
  new Uint16Array(buffer, offsetsBytes + neighborsBytes, P).set(bearings);
  return { buffer, N, P, offsetsBytes, neighborsBytes };
}

/**
 * Merge per-shard CSR results into a single CSR over the full origin set.
 * Shards own disjoint origins (globalIdx), so rows never collide; we just lay
 * out global offsets via a prefix-sum of per-origin pair counts and copy each
 * shard's neighbor/bearing slices into place. O(N + P) array copies — cheap
 * next to the parallel BFS that produced the shards.
 *
 * Packs DIRECTLY into the final transferable buffer (no intermediate 2P
 * visNeighbors/bearings arrays), which removes the largest transient allocation
 * on the main thread (P2/D4). Bearings are quantized to Uint16 (P2/D3).
 */
function mergeVisibilityBearingShards(shards, N) {
  let PTotal = 0;
  for (let s = 0; s < shards.length; s++) PTotal += shards[s].P;

  const counts = new Int32Array(N);
  for (let s = 0; s < shards.length; s++) {
    const shard = shards[s];
    const M = shard.globalIdx ? shard.globalIdx.length : N;
    for (let j = 0; j < M; j++) {
      const gi = shard.globalIdx ? shard.globalIdx[j] : j;
      counts[gi] = shard.localOffsets[j + 1] - shard.localOffsets[j];
    }
  }

  const visOffsets = new Int32Array(N + 1);
  let acc = 0;
  for (let i = 0; i < N; i++) {
    visOffsets[i] = acc;
    acc += counts[i];
  }
  visOffsets[N] = acc;

  const offsetsBytes = (N + 1) * 4;
  const neighborsBytes = PTotal * 4;
  const bearingsBytes = PTotal * 2;
  const totalBytes = offsetsBytes + neighborsBytes + bearingsBytes;
  const buffer = allocTransferBuffer(totalBytes);
  const nbView = new Int32Array(buffer, offsetsBytes, PTotal);
  const brgView = new Uint16Array(buffer, offsetsBytes + neighborsBytes, PTotal);
  new Int32Array(buffer, 0, N + 1).set(visOffsets);

  for (let s = 0; s < shards.length; s++) {
    const shard = shards[s];
    const M = shard.globalIdx ? shard.globalIdx.length : N;
    for (let j = 0; j < M; j++) {
      const gi = shard.globalIdx ? shard.globalIdx[j] : j;
      const srcStart = shard.localOffsets[j];
      const srcEnd = shard.localOffsets[j + 1];
      const dstStart = visOffsets[gi];
      nbView.set(shard.visNeighbors.subarray(srcStart, srcEnd), dstStart);
      brgView.set(shard.bearings.subarray(srcStart, srcEnd), dstStart);
    }
  }
  return { buffer, N, P: PTotal, offsetsBytes, neighborsBytes };
}

/**
 * Compute visibility sets + bearing map off the main thread, sharded across the
 * worker pool by origin cell so the expensive BFS flood-fill runs in parallel.
 *
 * Each shard computes visibility/bearing for its origin subset (over the full
 * AOI for membership) and returns a CSR. Shards are merged on the main thread
 * (disjoint origins → no conflicts) and packed into one transferable buffer.
 * The heavy BFS + bearing trig never runs on the UI thread; the only main-thread
 * work is the O(N + P) merge + the in-process rebuild of the object/Map (no
 * cross-boundary Map clone → no SIGILL). The simulation's consumers are untouched.
 *
 * Returns `{ buffer, N, P, offsetsBytes, neighborsBytes }` (or an empty shape
 * when there are no cells). `buffer` is `null` for the empty case.
 */
/**
 * Build the mapping graph (CSR adjacency + index-aligned friction/lat-lng) ONCE,
 * off the main thread. This is the shared, index-space representation that the
 * visibility shards consume — it replaces the per-shard `gridDisk` + friction
 * flatten that the legacy path did (P1 + P3). The returned typed arrays are
 * posted back without a transfer list so a SharedArrayBuffer (when the page is
 * cross-origin isolated) is shared zero-copy, and an ArrayBuffer is copied once.
 */
export async function runBuildR1Adjacency(viewHexes) {
  if (!viewHexes || viewHexes.length === 0) {
    return { N: 0, offsets: new Int32Array(0), neighbors: new Int32Array(0) };
  }
  return runWorker('r1-adjacency', { viewHexes });
}

export async function runBuildMappingGraph(frictionSource, viewHexes, r1Adjacency) {
  if (!viewHexes || viewHexes.length === 0) {
    return {
      N: 0,
      adjOffsets: new Int32Array(0),
      adjNeighbors: new Int32Array(0),
      frictionArr: new Float32Array(0),
      latLngArr: new Float32Array(0),
    };
  }
  const frictionEntries =
    frictionSource && typeof frictionSource.entries !== 'function'
      ? frictionSource
      : normalizeFrictionEntries(frictionSource);
  return runWorkerWithRetry('mapping-graph', { frictionEntries, viewHexes, r1Adjacency });
}

/**
 * Compute visibility sets + bearing map off the main thread, sharded across the
 * worker pool by origin INDEX (not cell string), so `viewHexes` is never cloned
 * to the shards. Each shard runs `computeVisibilityBearingCSRIndexed` over the
 * prebuilt graph (CSR adjacency + aligned friction/lat-lng) entirely in integer
 * index space — no `gridDisk`, no cell strings, no per-shard friction flatten.
 * Shards are merged on the main thread (disjoint origins → no conflicts) and
 * packed into one transferable buffer, identical in shape to the legacy path.
 *
 * @param graph { N, adjOffsets, adjNeighbors, frictionArr, latLngArr }
 * @param viewHexes full AOI cell list (used only for the empty-check + N here)
 * @param visionDepth BFS flood-fill radius
 */
export async function runVisibilityBearingTask(graph, viewHexes, visionDepth) {
  if (!viewHexes || viewHexes.length === 0) {
    return { buffer: null, N: 0, P: 0, offsetsBytes: 0, neighborsBytes: 0 };
  }
  const N = viewHexes.length;

  const workerCount = Math.min(MAX_WORKERS, N);
  if (workerCount <= 1) {
    const shard = computeVisibilityBearingCSRIndexed({ ...graph, viewHexes, visionDepth });
    return packCSR(shard.localOffsets, shard.visNeighbors, shard.bearings, shard.N, shard.P);
  }

  // Shard by origin INDEX and run the BFS in parallel across the pool. Passing
  // indices (not cell strings) means `viewHexes` is shipped only to the graph
  // builder, never to these shards.
  const allIdx = new Int32Array(N);
  for (let i = 0; i < N; i++) allIdx[i] = i;
  const idxChunks = splitIntoChunks(allIdx, workerCount);
  const shards = await Promise.all(
    idxChunks.map((originIdx) =>
      runWorkerWithRetry('visibility-bearing-indexed', { ...graph, visionDepth, originIdx })
    )
  );

  const merged = mergeVisibilityBearingShards(shards, N);
  // mergeVisibilityBearingShards already packs into the final transferable
  // buffer (same shape packCSR returns), so return it directly.
  return merged;
}

/**
 * Assemble per-cell mapping state (friction, affordance, multi-friction layers)
 * off the main thread, in a single worker call over the full cell set.
 *
 * `mergeCellsChunk` runs the per-cell work (min-friction, affordance
 * classification, blur application) and returns flat typed arrays. The
 * orchestrator returns them; the caller only does O(N) assignments into `state`
 * (no min-reduction / classification / object construction on the UI thread).
 * The per-cell layer maps are NOT returned — the caller writes
 * `multiFrictionMap` from its local `multiEntries` (P2-9), avoiding a 2× clone
 * of N objects. Falls back to a single local compute when Workers are
 * unavailable.
 *
 * @returns { frictionArr: Float64Array, affArr: Float64Array }
 *          indexed in `viewHexes` (cell) order.
 */
export async function runMergeCellsTask({
  cells,
  cellFrictionEntries,
  blurUpdateMap,
  blurWeights,
  pathBlurUpdateMap,
  pathBlurWeights,
}) {
  if (!cells || cells.length === 0) {
    return {
      cells: [],
      frictionArr: new Float64Array(0),
      affArr: new Float64Array(0),
    };
  }

  // Run the whole merge in ONE worker with the full maps. The per-cell work is
  // O(N) and trivial (a few comparisons + typed-array writes), so sharding only
  // added a main-thread O(N) slicing loop (building per-chunk subsets) plus a
  // result-concatenation loop for no real speedup — the full maps are cloned
  // once either way. A single off-main-thread call removes all main-thread
  // per-cell work. `runWorker` falls back to inline execution when Workers are
  // unavailable.
  //
  // P2-9: the N layer-map objects (`multiEntries`) are NO LONGER shipped to the
  // worker or back. The merge kernel never reads their contents (it only needs
  // the already-reduced min friction in `cellFrictionEntries`), so the main
  // thread writes `multiFrictionMap` from its local `multiEntries` directly,
  // avoiding a 2× structured-clone of N objects. We also drop the returned
  // `cells` (N strings) — the caller iterates `viewHexes` by index instead.
  const result = await runWorkerWithRetry('merge-cells', {
    cells,
    cellFrictionEntries,
    blurUpdateMap,
    blurWeights,
    pathBlurUpdateMap,
    pathBlurWeights,
  });
  return { frictionArr: result.frictionArr, affArr: result.affArr };
}

/**
 * Compute AOI hexes in a worker — runs off the main thread.
 */
export async function runAoiHexesTask(
  aoiPolygon,
  resolution = SIMULATION_PARAMS.h3StrideResolution
) {
  if (!aoiPolygon || !aoiPolygon.length) return [];
  return runWorker('aoi-hexes', { polygon: aoiPolygon, resolution });
}

/**
 * Terminate all workers in the pool. Call on page unload or when the map is destroyed
 * to prevent memory leaks from accumulated worker threads.
 */
export function terminateAllWorkers() {
  for (const pool of workerPoolByKind.values()) {
    for (const slot of pool) {
      try {
        slot.worker.terminate();
      } catch {
        // ignore termination errors
      }
    }
  }
  workerPoolByKind.clear();
  idleWorkersByKind.clear();
  waitingAcquiresByKind.clear();
  workerLatencyHistograms.clear();
  if (_idleCleanupInterval) {
    clearInterval(_idleCleanupInterval);
    _idleCleanupInterval = null;
  }
}

// Per-kind pool statistics for operability/debugging. Borrowed from PowerPool's
// getStats() idea without adopting PowerPool — the SAB zero-copy worker path must
// stay untouched. Returns { [kind]: { poolSize, idle, waiting, max }, _total }.
export function getWorkerPoolStats() {
  const stats = {};
  let totalPool = 0;
  let totalIdle = 0;
  let totalWaiting = 0;
  for (const [kind, pool] of workerPoolByKind) {
    const idle = idleWorkersByKind.get(kind) || [];
    const waiting = waitingAcquiresByKind.get(kind) || [];
    const maxForKind =
      kind === 'agent-batch'
        ? MAX_AGENT_WORKERS
        : kind === 'fast-scan' || kind === 'fast-scan-chunk'
          ? MAX_FASTSCAN_WORKERS
          : MAX_WORKERS;
    stats[kind] = {
      poolSize: pool.length,
      idle: idle.length,
      waiting: waiting.length,
      max: maxForKind,
      latencyMs: _latencySnapshot(kind),
    };
    totalPool += pool.length;
    totalIdle += idle.length;
    totalWaiting += waiting.length;
  }
  stats._total = { poolSize: totalPool, idle: totalIdle, waiting: totalWaiting };
  return stats;
}

// Graceful teardown: terminate all workers, clear pool state, and stop the
// idle-reaper interval. `terminateAllWorkers` is the public alias used on unload.
export function drainWorkerPool() {
  terminateAllWorkers();
  if (_idleCleanupInterval) {
    clearInterval(_idleCleanupInterval);
    _idleCleanupInterval = null;
  }
}

// Auto-terminate workers on page unload to prevent memory leaks
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', terminateAllWorkers, { once: true });
}
