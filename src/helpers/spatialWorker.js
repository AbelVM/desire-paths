import {
  computeFastScanChunkSnapshot,
  computeFastScanSnapshot,
  computeGradientBatch,
  computeImpassableBlurSnapshot,
  normalizeFrictionEntries,
  computeAoiHexes,
} from './spatialTasks.js';

const MAX_WORKERS = Math.min(
  4,
  Math.max(
    2,
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4
  )
);

const WORKER_TASK_TIMEOUT = 300_000; // 5m timeout per worker task

const workerPool = [];
const idleWorkers = [];
const waitingAcquires = [];

function createWorkerSlot() {
  const worker = new Worker(new URL('../workers/spatial.worker.js', import.meta.url), {
    type: 'module',
  });
  return { worker };
}

function releaseWorkerSlot(slot) {
  const next = waitingAcquires.shift();
  if (next) next(slot);
  else idleWorkers.push(slot);
}

function acquireWorkerSlot() {
  const idle = idleWorkers.pop();
  if (idle) return Promise.resolve(idle);

  if (workerPool.length < MAX_WORKERS) {
    const slot = createWorkerSlot();
    workerPool.push(slot);
    return Promise.resolve(slot);
  }

  return new Promise((resolve) => {
    waitingAcquires.push(resolve);
  });
}

function retireWorkerSlot(slot) {
  const index = workerPool.indexOf(slot);
  if (index !== -1) workerPool.splice(index, 1);
  const idleIndex = idleWorkers.indexOf(slot);
  if (idleIndex !== -1) idleWorkers.splice(idleIndex, 1);
  try {
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
    slotPromise = acquireWorkerSlot();
  } catch {
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
          if (settled) return;
          settled = true;
          cleanup();
          releaseWorkerSlot(slot);
          const data = event.data ?? {};
          if (data.ok) resolve(data.result);
          else reject(new Error(data.error ?? 'Spatial worker task failed'));
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
  const chunkTasks = chunks.map((chunk) =>
    runWorker('fast-scan-chunk', { viewHexes, features: chunk }).catch(() => ({}))
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
