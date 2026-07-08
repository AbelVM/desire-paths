import {
  computeFastScanChunkSnapshot,
  computeFastScanSnapshot,
  computeGradientBatch,
  computeImpassableBlurSnapshot,
  computeVisibilityBearingCSRIndexed,
  buildMappingGraph,
  buildR1Adjacency,
  mergeCellsChunk,
  normalizeFrictionEntries,
  computeAoiHexes,
} from './spatialTasks.js';
import { computeAgentBatch } from './agentTasks.js';
import { SIMULATION_PARAMS } from './constants.js';

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

const WORKER_TASK_TIMEOUT = 600_000; // 10m timeout per worker task
const WORKER_IDLE_TIMEOUT = 300_000; // 5m — retire workers idle longer than this

// Pools keyed by task kind (e.g. 'agent-batch' -> agent workers)
const workerPoolByKind = new Map();
const idleWorkersByKind = new Map();
const waitingAcquiresByKind = new Map();

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

function createWorkerSlot(kind = 'spatial') {
  const script =
    kind === 'agent-batch' ? '../workers/agent.worker.js' : '../workers/spatial.worker.js';
  try {
    const worker = new Worker(new URL(script, import.meta.url), { type: 'module' });
    try {
      console.debug &&
        console.debug(`spatialWorker: createWorkerSlot kind=${kind} script=${script}`);
    } catch (_e) {}
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
    try {
      console.debug &&
        console.debug(`spatialWorker: releasing slot to waiting acquirer for kind=${kind}`);
    } catch (_e) {}
    _touchWorker(slot);
    next(slot);
  } else {
    const idle = idleWorkersByKind.get(kind) || [];
    idle.push(slot);
    idleWorkersByKind.set(kind, idle);
    _touchWorker(slot);
    try {
      console.debug &&
        console.debug(
          `spatialWorker: released slot to idle pool for kind=${kind} idleCount=${idle.length}`
        );
    } catch (_e) {}
  }
  waitingAcquiresByKind.set(kind, waiting);
}

function acquireWorkerSlot(kind = 'spatial') {
  try {
    console.debug && console.debug(`spatialWorker: acquireWorkerSlot requested kind=${kind}`);
  } catch (_e) {}
  const idle = (idleWorkersByKind.get(kind) || []).pop();
  if (idle) {
    try {
      console.debug && console.debug(`spatialWorker: reusing idle worker for kind=${kind}`);
    } catch (_e) {}
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
    try {
      console.debug &&
        console.debug(
          `spatialWorker: created new worker slot kind=${kind} poolSize=${pool.length}/${maxForKind}`
        );
    } catch (_e) {}
    return Promise.resolve(slot);
  }

  try {
    console.debug &&
      console.debug(
        `spatialWorker: no slots available, enqueuing acquirer for kind=${kind} poolSize=${pool.length}/${maxForKind}`
      );
  } catch (_e) {}
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
    try {
      console.debug && console.debug(`spatialWorker: retiring worker slot kind=${kind}`);
    } catch (_e) {}
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
// friction lookup objects into a transferable typed-array representation.
function flattenPayloadAndTransfers(payload) {
  if (!payload || typeof payload !== 'object') return { payload, transfer: [] };
  const fe = payload.frictionEntries;
  if (!fe || typeof fe !== 'object') return { payload, transfer: [] };
  // If already flattened, nothing to do
  if (
    fe.__flat &&
    Array.isArray(fe.keys) &&
    (ArrayBuffer.isView(fe.vals) || fe.vals instanceof ArrayBuffer)
  )
    return { payload, transfer: [] };

  // frictionEntries is always a plain object (normalised before dispatch)
  const keys = Object.keys(fe);
  if (keys.length === 0) return { payload, transfer: [] };
  const vals = new Float32Array(keys.length);
  for (let i = 0; i < keys.length; i++) vals[i] = Number(fe[keys[i]]) || 0;

  const newPayload = Object.assign({}, payload, { frictionEntries: { __flat: true, keys, vals } });
  return { payload: newPayload, transfer: [vals.buffer] };
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
      if (targetLayerMap[layer] === undefined || nextValue > targetLayerMap[layer])
        targetLayerMap[layer] = nextValue;
    }
  }
}

function mergeScalarEntries(target, source) {
  const sourceKeys = Object.keys(source);
  for (let k = 0; k < sourceKeys.length; k++) {
    const cell = sourceKeys[k];
    const nextValue = source[cell];
    if (target[cell] === undefined || nextValue > target[cell]) target[cell] = nextValue;
  }
}

function runLocally(kind, payload) {
  if (kind === 'fast-scan') return computeFastScanSnapshot(payload);
  if (kind === 'fast-scan-chunk') return computeFastScanChunkSnapshot(payload);
  if (kind === 'gradient-batch') return computeGradientBatch(payload);
  if (kind === 'impassable-blur') return computeImpassableBlurSnapshot(payload);
  if (kind === 'visibility-bearing-indexed') return computeVisibilityBearingCSRIndexed(payload);
  if (kind === 'mapping-graph') return buildMappingGraph(payload);
  if (kind === 'r1-adjacency') return buildR1Adjacency(payload);
  if (kind === 'merge-cells') return mergeCellsChunk(payload);
  if (kind === 'aoi-hexes') return computeAoiHexes(payload?.polygon || null, payload?.resolution);
  throw new Error(`Unknown spatial task: ${kind}`);
}

function runWorker(kind, payload) {
  if (typeof Worker === 'undefined') return Promise.resolve(runLocally(kind, payload));

  let slotPromise;
  try {
    slotPromise = acquireWorkerSlot(kind);
  } catch (err) {
    try {
      console.warn &&
        console.warn(
          `spatialWorker: failed to acquire worker slot for kind=${kind}, running locally`,
          err
        );
    } catch (_e) {}
    return Promise.resolve(runLocally(kind, payload));
  }

  return slotPromise.then(
    (slot) =>
      new Promise((resolve, reject) => {
        const { worker } = slot;
        let settled = false;

        const cleanup = () => {
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          if (timerId) clearTimeout(timerId);
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
          try {
            console.debug &&
              console.debug(
                `spatialWorker: worker slot returned result kind=${slot.kind} ok=${Boolean(data.ok)}`
              );
          } catch (_e) {}
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

        try {
          const { payload: sendPayload, transfer } = flattenPayloadAndTransfers(payload);
          try {
            console.debug &&
              console.debug(
                `spatialWorker: posting task to worker kind=${kind} transferCount=${transfer?.length || 0}`
              );
          } catch (_e) {}
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
}

export async function runGradientBatches(targets, frictionSource) {
  if (!targets || targets.length === 0) return Object.create(null);

  // Skip normalization when source is already a plain object (from computeDesirePaths snapshots)
  const frictionEntries =
    frictionSource && typeof frictionSource.entries !== 'function'
      ? frictionSource
      : normalizeFrictionEntries(frictionSource);

  // Guard: empty friction source means no walkable cells; return empty gradients
  if (Object.keys(frictionEntries).length === 0) return Object.create(null);
  const workerCount = Math.min(MAX_WORKERS, targets.length);
  if (workerCount <= 1) return runLocally('gradient-batch', { targets, frictionEntries });

  const chunks = splitIntoChunks(targets, workerCount);
  const results = await Promise.all(
    chunks.map((chunk) => runWorker('gradient-batch', { targets: chunk, frictionEntries }))
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

  const visibilityEntries = options?.visibilityEntries || null;
  const neighborDisks = options?.neighborDisks || null;
  // True ABM footprint accumulator — shared across all agents in a simulation run.
  // When present, computeAgentBatch runs a tick-based loop where each agent's
  // positions accumulate as footprints that modify affordance for subsequent agents.
  const accumulatedFootprints = options?.accumulatedFootprints || null;
  // Precomputed origin-destination grid distances — eliminates per-tick H3 calls
  const originDestDistances = options?.originDestDistances || null;
  // Precomputed bearing map — eliminates per-tick trig calls in getBestNextStep
  const bearingMap = options?.bearingMap || null;

  // Normalize gradients into a plain object for structured-clone
  const gradientsObj = Object.create(null);
  if (gradients) {
    if (typeof gradients.entries === 'function') {
      for (const [k, v] of gradients) gradientsObj[k] = v;
    } else {
      for (const k in gradients) gradientsObj[k] = gradients[k];
    }
  }

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
        const hasOrigin =
          grad &&
          (typeof grad.has === 'function'
            ? grad.has(originCell)
            : typeof grad[originCell] === 'number');
        if (!grad || !hasOrigin) missingTargets.add(destCell);
      }
    }

    if (missingTargets.size > 0) {
      try {
        console.debug &&
          console.debug(
            'runAgentBatches: missing gradients for targets',
            Array.from(missingTargets)
          );
      } catch (_e) {}
      // Compute missing gradients (uses same worker pool / normalization as callers)
      const newGrads = await runGradientBatches(Array.from(missingTargets), frictionSource);
      for (const k in newGrads) gradientsObj[k] = newGrads[k];
      // Re-check and log any that are still missing
      const stillMissing = [];
      for (const t of missingTargets) {
        const g = gradientsObj[t];
        if (!g) stillMissing.push(t);
      }
      if (stillMissing.length > 0)
        try {
          console.warn &&
            console.warn(
              'runAgentBatches: still missing gradients after fallback compute',
              stillMissing
            );
        } catch (_e) {}
    }
  } catch (_e) {
    try {
      console.warn && console.warn('runAgentBatches: error while computing missing gradients', _e);
    } catch (_e2) {}
  }

  // The agent simulation is a true ABM: agents accumulate footprints into a single
  // shared `accumulatedFootprints` structure that boosts affordance for subsequent
  // agents (paper §3.4 — friction/affordance updates). That shared state MUST be
  // consistent across the whole run, so the plan cannot be split across multiple
  // workers (each worker would receive an independent structured-clone and the ABM
  // interaction would be lost). Running in a single execution context also removes
  // the 2+ worker trigger that produced SIGILL with 2+ origins. Gradient batches
  // (runGradientBatches) remain parallel because they are independent per destination.
  const workerCount = 1;
  try {
    console.debug &&
      console.debug(
        `runAgentBatches: dispatching agent-batches workerCount=${workerCount} planLength=${plan.length}`
      );
  } catch (_e) {}
  if (workerCount <= 1) {
    // run locally on main thread
    const ret = computeAgentBatch({
      plan,
      frictionEntries,
      gradients: gradientsObj,
      affordanceEntries,
      hexCount,
      visibilityEntries,
      neighborDisks,
      options,
      accumulatedFootprints,
      originDestDistances,
      bearingMap,
    });
    // computeAgentBatch returns { result, transfers } when used in a worker; normalize
    const result = ret && ret.result ? ret.result : ret;
    // convert flattened structures into plain objects
    const outPath = Object.create(null);
    if (result && result.pathDesire && result.pathDesire.__flat) {
      const keys = result.pathDesire.keys || [];
      const vals = ArrayBuffer.isView(result.pathDesire.vals)
        ? result.pathDesire.vals
        : new Uint32Array(result.pathDesire.vals || []);
      for (let i = 0; i < keys.length; i++) outPath[keys[i]] = vals[i];
    }
    const outPer = Object.create(null);
    if (result && result.perTargetContribs) {
      for (const dest in result.perTargetContribs) {
        const entry = result.perTargetContribs[dest];
        if (entry && entry.__flat) {
          const keys = entry.keys || [];
          const vals = ArrayBuffer.isView(entry.vals)
            ? entry.vals
            : new Uint32Array(entry.vals || []);
          const obj = Object.create(null);
          for (let i = 0; i < keys.length; i++) obj[keys[i]] = vals[i];
          outPer[dest] = obj;
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

  const chunks = splitIntoChunks(plan, workerCount);
  try {
    console.debug &&
      console.debug(
        'runAgentBatches: chunks',
        chunks.map((c) => c.length)
      );
  } catch (_e) {}
  const results = await Promise.all(
    chunks.map((chunk) =>
      runWorker('agent-batch', {
        plan: chunk,
        frictionEntries,
        gradients: gradientsObj,
        affordanceEntries,
        hexCount,
        visibilityEntries,
        neighborDisks,
        options,
        accumulatedFootprints,
        originDestDistances,
        bearingMap,
      })
    )
  );

  const mergedPath = Object.create(null);
  const mergedPer = Object.create(null);
  let processed = 0;
  let total = 0;
  for (let i = 0; i < results.length; i++) {
    const batch = results[i] || {};
    processed += batch.processed || 0;
    total = batch.total || total;
    const pd = batch.pathDesire;
    if (pd) {
      if (
        pd.__flat &&
        Array.isArray(pd.keys) &&
        (ArrayBuffer.isView(pd.vals) || pd.vals instanceof ArrayBuffer)
      ) {
        const keys = pd.keys;
        const vals = ArrayBuffer.isView(pd.vals) ? pd.vals : new Uint32Array(pd.vals);
        for (let k = 0; k < keys.length; k++)
          mergedPath[keys[k]] = (mergedPath[keys[k]] || 0) + vals[k];
      } else if (typeof pd === 'object') {
        for (const key in pd) mergedPath[key] = (mergedPath[key] || 0) + (Number(pd[key]) || 0);
      }
    }

    const per = batch.perTargetContribs || {};
    for (const dest in per) {
      // Skip any internal metadata keys
      if (typeof dest === 'string' && dest.startsWith('__')) continue;
      const entry = per[dest];
      if (!mergedPer[dest]) mergedPer[dest] = Object.create(null);
      if (
        entry &&
        entry.__flat &&
        Array.isArray(entry.keys) &&
        (ArrayBuffer.isView(entry.vals) || entry.vals instanceof ArrayBuffer)
      ) {
        const keys = entry.keys;
        const vals = ArrayBuffer.isView(entry.vals) ? entry.vals : new Uint32Array(entry.vals);
        for (let k = 0; k < keys.length; k++)
          mergedPer[dest][keys[k]] = (mergedPer[dest][keys[k]] || 0) + vals[k];
      } else if (typeof entry === 'object') {
        for (const cell in entry)
          mergedPer[dest][cell] = (mergedPer[dest][cell] || 0) + (Number(entry[cell]) || 0);
      }
    }
  }

  return { pathDesire: mergedPath, perTargetContribs: mergedPer, processed, total };
}

export async function runFastScanTask(viewHexes, features, r1Adjacency) {
  if (!viewHexes || viewHexes.length === 0) {
    return {
      multiFrictionEntries: Object.create(null),
      cellFrictionEntries: Object.create(null),
      blurWeights: Object.create(null),
      blurUpdates: [],
    };
  }

  const featureCount = features?.length ?? 0;
  if (featureCount <= 1) return runWorker('fast-scan', { viewHexes, features });

  const workerCount = Math.min(MAX_FASTSCAN_WORKERS, featureCount);
  const chunks = splitIntoBalancedChunks(features, workerCount, featureVertexCost);
  if (chunks.length <= 1) return runWorker('fast-scan', { viewHexes, features });

  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  try {
    console.debug &&
      console.debug(
        `spatialWorker: fast-scan-chunk dispatch workerCount=${chunks.length} featureCount=${featureCount}`
      );
  } catch (_e) {}

  // Launch all chunk tasks in parallel
  const chunkTasks = chunks.map((chunk, chunkIndex) =>
    runWorker('fast-scan-chunk', { viewHexes, features: chunk }).catch((err) => {
      try {
        console.warn &&
          console.warn('spatialWorker: fast-scan-chunk failed, retrying', { chunkIndex, err });
      } catch (_e) {}
      return runWorker('fast-scan-chunk', { viewHexes, features: chunk }).catch((err2) => {
        try {
          console.error &&
            console.error(
              'spatialWorker: fast-scan-chunk retry failed, falling back to local compute',
              { chunkIndex, err2 }
            );
        } catch (_e) {}
        try {
          // Fallback: compute the chunk locally on main thread to avoid incomplete results
          return runLocally('fast-scan-chunk', { viewHexes, features: chunk });
        } catch (localErr) {
          try {
            console.error &&
              console.error('spatialWorker: fast-scan-chunk local fallback failed', {
                chunkIndex,
                localErr,
              });
          } catch (_e) {}
          return {};
        }
      });
    })
  );

  // Blur is computed once below from the fully-merged friction data (see
  // runImpassableBlurTask). The earlier "partial blur" path computed a full blur
  // on incomplete chunk data and discarded the result, so it is intentionally gone.
  const results = await Promise.all(chunkTasks);

  if (t0) {
    try {
      console.debug &&
        console.debug(
          `spatialWorker: fast-scan-chunk done in ${(performance.now() - t0).toFixed(1)}ms`
        );
    } catch (_e) {}
  }

  // Merge all chunk results
  const multiFrictionEntries = Object.create(null);
  const cellFrictionEntries = Object.create(null);
  for (let i = 0; i < results.length; i++) {
    const batch = results[i] ?? {};
    mergeFastScanEntries(multiFrictionEntries, batch.multiFrictionEntries ?? Object.create(null));
    mergeScalarEntries(cellFrictionEntries, batch.cellFrictionEntries ?? Object.create(null));
  }

  // Run blur with complete data (re-run if early version already started).
  // Resolve the r1 adjacency promise here (it was launched in parallel with the
  // chunk computation above) so the blur BFS reuses the shared CSR.
  const r1 = r1Adjacency instanceof Promise ? await r1Adjacency : r1Adjacency;
  const blur = await runImpassableBlurTask(cellFrictionEntries, {
    viewHexes,
    r1Adjacency: r1,
  });
  return {
    multiFrictionEntries,
    cellFrictionEntries,
    blurWeights: blur.blurWeights,
    blurUpdates: blur.updates,
  };
}

// Expose runtime hooks for interactive debugging in the browser console
try {
  if (typeof window !== 'undefined' && window) {
    window.__dp_setMaxAgentWorkers = setMaxAgentWorkers;
    window.__dp_getMaxAgentWorkers = getMaxAgentWorkers;
  }
} catch (_e) {}

export async function runImpassableBlurTask(frictionSource, options = {}) {
  const frictionEntries =
    frictionSource && typeof frictionSource.entries !== 'function'
      ? frictionSource
      : normalizeFrictionEntries(frictionSource);
  return runWorker('impassable-blur', { frictionEntries, ...options });
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

/** Pack CSR components into one transferable buffer (SAB when isolated, else AB). */
function packCSR(visOffsets, visNeighbors, bearings, N, P) {
  const offsetsBytes = (N + 1) * 4;
  const neighborsBytes = P * 4;
  const bearingsBytes = P * 4;
  const totalBytes = offsetsBytes + neighborsBytes + bearingsBytes;
  const buffer = allocTransferBuffer(totalBytes);
  new Int32Array(buffer, 0, N + 1).set(visOffsets);
  new Int32Array(buffer, offsetsBytes, P).set(visNeighbors);
  new Float32Array(buffer, offsetsBytes + neighborsBytes, P).set(bearings);
  return { buffer, N, P, offsetsBytes, neighborsBytes };
}

/**
 * Merge per-shard CSR results into a single CSR over the full origin set.
 * Shards own disjoint origins (globalIdx), so rows never collide; we just lay
 * out global offsets via a prefix-sum of per-origin pair counts and copy each
 * shard's neighbor/bearing slices into place. O(N + P) array copies — cheap
 * next to the parallel BFS that produced the shards.
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

  const visNeighbors = new Int32Array(PTotal);
  const bearings = new Float32Array(PTotal);
  for (let s = 0; s < shards.length; s++) {
    const shard = shards[s];
    const M = shard.globalIdx ? shard.globalIdx.length : N;
    for (let j = 0; j < M; j++) {
      const gi = shard.globalIdx ? shard.globalIdx[j] : j;
      const srcStart = shard.localOffsets[j];
      const srcEnd = shard.localOffsets[j + 1];
      const dstStart = visOffsets[gi];
      visNeighbors.set(shard.visNeighbors.subarray(srcStart, srcEnd), dstStart);
      bearings.set(shard.bearings.subarray(srcStart, srcEnd), dstStart);
    }
  }
  return { visOffsets, visNeighbors, bearings, N, P: PTotal };
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
  return runWorker('mapping-graph', { frictionEntries, viewHexes, r1Adjacency });
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
      runWorker('visibility-bearing-indexed', { ...graph, visionDepth, originIdx })
    )
  );

  const merged = mergeVisibilityBearingShards(shards, N);
  return packCSR(merged.visOffsets, merged.visNeighbors, merged.bearings, merged.N, merged.P);
}

/**
 * Assemble per-cell mapping state (friction, affordance, multi-friction layers)
 * off the main thread, sharded across the worker pool by cell.
 *
 * Each shard runs `mergeCellsChunk` (layer merge, min-friction, affordance
 * classification, blur application) for its cells and returns flat typed
 * arrays + per-cell layer maps. The orchestrator merges the shards and returns
 * a single concatenated result; the caller only does O(N) assignments into
 * `state` (no min-reduction / classification / object construction on the UI
 * thread). Falls back to a single local compute when only one worker is available.
 *
 * @returns { cells, frictionArr: Float64Array, affArr: Float64Array, multiArr: Array }
 *          indexed in cell order; `multiArr[i]` is the merged layer map (or empty).
 */
export async function runMergeCellsTask({
  cells,
  multiEntries,
  cellFrictionEntries,
  blurUpdateMap,
  blurWeights,
}) {
  if (!cells || cells.length === 0) {
    return {
      cells: [],
      frictionArr: new Float64Array(0),
      affArr: new Float64Array(0),
      multiArr: [],
    };
  }

  // Run the whole merge in ONE worker with the full maps. The per-cell work is
  // O(N) and trivial (a few comparisons + typed-array writes), so sharding only
  // added a main-thread O(N) slicing loop (building per-chunk subsets) plus a
  // result-concatenation loop for no real speedup — the full maps are cloned
  // once either way. A single off-main-thread call removes all main-thread
  // per-cell work. `runWorker` falls back to inline execution when Workers are
  // unavailable.
  return runWorker('merge-cells', {
    cells,
    multiEntries,
    cellFrictionEntries,
    blurUpdateMap,
    blurWeights,
  });
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
}

// Auto-terminate workers on page unload to prevent memory leaks
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', terminateAllWorkers, { once: true });
}
