import {
  computeFastScanChunkSnapshot,
  computeFastScanSnapshot,
  computeGradientBatch,
  computeImpassableBlurSnapshot,
  normalizeFrictionEntries,
  computeAoiHexes,
} from './spatialTasks.js';
import { computeAgentBatch } from './agentTasks.js';

const detectedHC = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : undefined;

const MAX_WORKERS = Math.min(4, Math.max(2, detectedHC || 4));

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

function createWorkerSlot(kind = 'spatial') {
  const script = kind === 'agent-batch' ? '../workers/agent.worker.js' : '../workers/spatial.worker.js';
  try {
    const worker = new Worker(new URL(script, import.meta.url), { type: 'module' });
    try { console.debug && console.debug(`spatialWorker: createWorkerSlot kind=${kind} script=${script}`); } catch (_e) {}
    return { worker, kind };
  } catch (err) {
    try { console.error && console.error(`spatialWorker: createWorkerSlot failed for kind=${kind} script=${script}`, err); } catch (_e) {}
    throw err;
  }
}

function releaseWorkerSlot(slot) {
  const kind = slot.kind || 'spatial';
  const waiting = waitingAcquiresByKind.get(kind) || [];
  const next = waiting.shift();
  if (next) {
    try { console.debug && console.debug(`spatialWorker: releasing slot to waiting acquirer for kind=${kind}`); } catch (_e) {}
    next(slot);
  } else {
    const idle = idleWorkersByKind.get(kind) || [];
    idle.push(slot);
    idleWorkersByKind.set(kind, idle);
    try { console.debug && console.debug(`spatialWorker: released slot to idle pool for kind=${kind} idleCount=${idle.length}`); } catch (_e) {}
  }
  waitingAcquiresByKind.set(kind, waiting);
}

function acquireWorkerSlot(kind = 'spatial') {
  try { console.debug && console.debug(`spatialWorker: acquireWorkerSlot requested kind=${kind}`); } catch (_e) {}
  const idle = (idleWorkersByKind.get(kind) || []).pop();
  if (idle) {
    try { console.debug && console.debug(`spatialWorker: reusing idle worker for kind=${kind}`); } catch (_e) {}
    return Promise.resolve(idle);
  }

  const pool = workerPoolByKind.get(kind) || [];
  const maxForKind = kind === 'agent-batch' ? MAX_AGENT_WORKERS : MAX_WORKERS;
  if (pool.length < maxForKind) {
    const slot = createWorkerSlot(kind);
    pool.push(slot);
    workerPoolByKind.set(kind, pool);
    try { console.debug && console.debug(`spatialWorker: created new worker slot kind=${kind} poolSize=${pool.length}/${maxForKind}`); } catch (_e) {}
    return Promise.resolve(slot);
  }

  try { console.debug && console.debug(`spatialWorker: no slots available, enqueuing acquirer for kind=${kind} poolSize=${pool.length}/${maxForKind}`); } catch (_e) {}
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
    try { console.debug && console.debug(`spatialWorker: retiring worker slot kind=${kind}`); } catch (_e) {}
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

// Flatten large payloads for cheaper structured-clone by converting plain
// friction lookup objects into a transferable typed-array representation.
function flattenPayloadAndTransfers(payload) {
  if (!payload || typeof payload !== 'object') return { payload, transfer: [] };
  const fe = payload.frictionEntries;
  if (!fe || typeof fe !== 'object') return { payload, transfer: [] };
  // If already flattened, nothing to do
  if (fe.__flat && Array.isArray(fe.keys) && (ArrayBuffer.isView(fe.vals) || fe.vals instanceof ArrayBuffer))
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
    if (kind === 'aoi-hexes') return computeAoiHexes(payload || null);
    throw new Error(`Unknown spatial task: ${kind}`);
}

function runWorker(kind, payload) {
  if (typeof Worker === 'undefined') return Promise.resolve(runLocally(kind, payload));

  let slotPromise;
  try {
    slotPromise = acquireWorkerSlot(kind);
  } catch (err) {
    try {
      console.warn && console.warn(`spatialWorker: failed to acquire worker slot for kind=${kind}, running locally`, err);
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
          try { console.debug && console.debug(`spatialWorker: worker slot returned result kind=${slot.kind} ok=${Boolean(data.ok)}`); } catch (_e) {}
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
          try { console.debug && console.debug(`spatialWorker: posting task to worker kind=${kind} transferCount=${transfer?.length || 0}`); } catch (_e) {}
          if (transfer && transfer.length) worker.postMessage({ kind, payload: sendPayload }, transfer);
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

export async function runAgentBatches(plan, frictionSource, gradients, affordanceSource, hexCount, options = {}) {
  if (!plan || plan.length === 0) return { pathDesire: Object.create(null), perTargetContribs: Object.create(null), processed: 0, total: 0 };

  const frictionEntries =
    frictionSource && typeof frictionSource.entries !== 'function'
      ? frictionSource
      : normalizeFrictionEntries(frictionSource);

  const affordanceEntries =
    affordanceSource && typeof affordanceSource.entries !== 'function'
      ? affordanceSource
      : normalizeFrictionEntries(affordanceSource);

  const visibilityEntries = options?.visibilityEntries || null;

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
        const hasOrigin = grad && (typeof grad.has === 'function' ? grad.has(originCell) : typeof grad[originCell] === 'number');
        if (!grad || !hasOrigin) missingTargets.add(destCell);
      }
    }

    if (missingTargets.size > 0) {
      try { console.debug && console.debug('runAgentBatches: missing gradients for targets', Array.from(missingTargets)); } catch (_e) {}
      // Compute missing gradients (uses same worker pool / normalization as callers)
      const newGrads = await runGradientBatches(Array.from(missingTargets), frictionSource);
      for (const k in newGrads) gradientsObj[k] = newGrads[k];
      // Re-check and log any that are still missing
      const stillMissing = [];
      for (const t of missingTargets) {
        const g = gradientsObj[t];
        if (!g) stillMissing.push(t);
      }
      if (stillMissing.length > 0) try { console.warn && console.warn('runAgentBatches: still missing gradients after fallback compute', stillMissing); } catch (_e) {}
    }
  } catch (_e) {
    try { console.warn && console.warn('runAgentBatches: error while computing missing gradients', _e); } catch (_e2) {}
  }

  const workerCount = Math.min(MAX_AGENT_WORKERS, plan.length);
  try { console.debug && console.debug(`runAgentBatches: dispatching agent-batches workerCount=${workerCount} planLength=${plan.length}`); } catch (_e) {}
  if (workerCount <= 1) {
    // run locally on main thread
    const ret = computeAgentBatch({ plan, frictionEntries, gradients: gradientsObj, affordanceEntries, hexCount, visibilityEntries, options });
    // computeAgentBatch returns { result, transfers } when used in a worker; normalize
    const result = ret && ret.result ? ret.result : ret;
    // convert flattened structures into plain objects
    const outPath = Object.create(null);
    if (result && result.pathDesire && result.pathDesire.__flat) {
      const keys = result.pathDesire.keys || [];
      const vals = ArrayBuffer.isView(result.pathDesire.vals) ? result.pathDesire.vals : new Uint32Array(result.pathDesire.vals || []);
      for (let i = 0; i < keys.length; i++) outPath[keys[i]] = vals[i];
    }
    const outPer = Object.create(null);
    if (result && result.perTargetContribs) {
      for (const dest in result.perTargetContribs) {
        const entry = result.perTargetContribs[dest];
        if (entry && entry.__flat) {
          const keys = entry.keys || [];
          const vals = ArrayBuffer.isView(entry.vals) ? entry.vals : new Uint32Array(entry.vals || []);
          const obj = Object.create(null);
          for (let i = 0; i < keys.length; i++) obj[keys[i]] = vals[i];
          outPer[dest] = obj;
        }
      }
    }
    return { pathDesire: outPath, perTargetContribs: outPer, processed: result?.processed || 0, total: result?.total || 0 };
  }

  const chunks = splitIntoChunks(plan, workerCount);
  try { console.debug && console.debug('runAgentBatches: chunks', chunks.map((c) => c.length)); } catch (_e) {}
  const results = await Promise.all(
    chunks.map((chunk) => runWorker('agent-batch', { plan: chunk, frictionEntries, gradients: gradientsObj, affordanceEntries, hexCount, visibilityEntries, options }))
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
      if (pd.__flat && Array.isArray(pd.keys) && (ArrayBuffer.isView(pd.vals) || pd.vals instanceof ArrayBuffer)) {
        const keys = pd.keys;
        const vals = ArrayBuffer.isView(pd.vals) ? pd.vals : new Uint32Array(pd.vals);
        for (let k = 0; k < keys.length; k++) mergedPath[keys[k]] = (mergedPath[keys[k]] || 0) + vals[k];
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
      if (entry && entry.__flat && Array.isArray(entry.keys) && (ArrayBuffer.isView(entry.vals) || entry.vals instanceof ArrayBuffer)) {
        const keys = entry.keys;
        const vals = ArrayBuffer.isView(entry.vals) ? entry.vals : new Uint32Array(entry.vals);
        for (let k = 0; k < keys.length; k++) mergedPer[dest][keys[k]] = (mergedPer[dest][keys[k]] || 0) + vals[k];
      } else if (typeof entry === 'object') {
        for (const cell in entry) mergedPer[dest][cell] = (mergedPer[dest][cell] || 0) + (Number(entry[cell]) || 0);
      }
    }
  }

  return { pathDesire: mergedPath, perTargetContribs: mergedPer, processed, total };
}

export async function runFastScanTask(viewHexes, features) {
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

  const workerCount = Math.min(MAX_WORKERS, featureCount);
  const chunks = splitIntoChunks(features, workerCount);
  if (chunks.length <= 1) return runWorker('fast-scan', { viewHexes, features });

  // Launch all chunk tasks in parallel
  const chunkTasks = chunks.map((chunk, chunkIndex) =>
    runWorker('fast-scan-chunk', { viewHexes, features: chunk }).catch((err) => {
      try { console.warn && console.warn('spatialWorker: fast-scan-chunk failed, retrying', { chunkIndex, err }); } catch (_e) {}
      return runWorker('fast-scan-chunk', { viewHexes, features: chunk }).catch((err2) => {
        try { console.error && console.error('spatialWorker: fast-scan-chunk retry failed, falling back to local compute', { chunkIndex, err2 }); } catch (_e) {}
        try {
          // Fallback: compute the chunk locally on main thread to avoid incomplete results
          return runLocally('fast-scan-chunk', { viewHexes, features: chunk });
        } catch (localErr) {
          try { console.error && console.error('spatialWorker: fast-scan-chunk local fallback failed', { chunkIndex, localErr }); } catch (_e) {}
          return {};
        }
      });
    })
  );

  // Start blur computation as soon as we have partial results.
  // Blur only needs cellFrictionEntries and is independent of multiFrictionEntries.
  // We kick it off after the first two chunks resolve for a reasonable sample size,
  // then re-run with full merged data at the end for correctness.
  let blurPromise = null;
  const resolvedResults = [];

  // Process results as they arrive to start blur early
  const processResult = async (result) => {
    resolvedResults.push(result);
    if (!blurPromise && resolvedResults.length >= Math.min(2, chunks.length)) {
      blurPromise = _computeBlurFromPartial(resolvedResults.map((r) => r.cellFrictionEntries ?? {}));
    }
  };

  // Race: process each result as it resolves
  const racePromises = chunkTasks.map(async (task, i) => {
    const result = await task;
    await processResult(result);
    return result;
  });
  const results = await Promise.all(racePromises);

  // Merge all chunk results
  const multiFrictionEntries = Object.create(null);
  const cellFrictionEntries = Object.create(null);
  for (let i = 0; i < results.length; i++) {
    const batch = results[i] ?? {};
    mergeFastScanEntries(multiFrictionEntries, batch.multiFrictionEntries ?? Object.create(null));
    mergeScalarEntries(cellFrictionEntries, batch.cellFrictionEntries ?? Object.create(null));
  }

  // Run blur with complete data (re-run if early version already started)
  const blur = await runImpassableBlurTask(cellFrictionEntries);
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

async function _computeBlurFromPartial(partialResults) {
  // Merge partial friction entries from resolved chunks
  const merged = Object.create(null);
  for (let i = 0; i < partialResults.length; i++) {
    mergeScalarEntries(merged, partialResults[i]);
  }
  return runImpassableBlurTask(merged);
}

export async function runImpassableBlurTask(frictionSource, options = {}) {
  const frictionEntries =
    frictionSource && typeof frictionSource.entries !== 'function'
      ? frictionSource
      : normalizeFrictionEntries(frictionSource);
  return runWorker('impassable-blur', { frictionEntries, ...options });
}

/**
 * Compute AOI hexes in a worker — runs off the main thread.
 */
export async function runAoiHexesTask(aoiPolygon) {
  if (!aoiPolygon || !aoiPolygon.length) return [];
  return runWorker('aoi-hexes', aoiPolygon);
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
