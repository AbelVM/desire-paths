import {
  computeFastScanChunkSnapshot,
  computeFastScanSnapshot,
  computeGradientBatch,
  computeImpassableBlurSnapshot,
  normalizeFrictionEntries,
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

function mergeFastScanEntries(target, source) {
  for (const cell in source) {
    let targetLayerMap = target[cell];
    if (!targetLayerMap) targetLayerMap = target[cell] = Object.create(null);
    const sourceLayerMap = source[cell];
    for (const layer in sourceLayerMap) {
      const nextValue = sourceLayerMap[layer];
      if (targetLayerMap[layer] === undefined || nextValue > targetLayerMap[layer])
        targetLayerMap[layer] = nextValue;
    }
  }
}

function mergeScalarEntries(target, source) {
  for (const cell in source) {
    const nextValue = source[cell];
    if (target[cell] === undefined || nextValue > target[cell]) target[cell] = nextValue;
  }
}

function runLocally(kind, payload) {
  if (kind === 'fast-scan') return computeFastScanSnapshot(payload);
  if (kind === 'fast-scan-chunk') return computeFastScanChunkSnapshot(payload);
  if (kind === 'gradient-batch') return computeGradientBatch(payload);
  if (kind === 'impassable-blur') return computeImpassableBlurSnapshot(payload);
  throw new Error(`Unknown spatial task: ${kind}`);
}

function runWorker(kind, payload) {
  if (typeof Worker === 'undefined') return Promise.resolve(runLocally(kind, payload));

  let slotPromise;
  try {
    slotPromise = acquireWorkerSlot();
  } catch (error) {
    return Promise.resolve(runLocally(kind, payload));
  }

  return slotPromise.then(
    (slot) =>
      new Promise((resolve, reject) => {
        const { worker } = slot;

        const handleMessage = (event) => {
          const data = event.data || {};
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          releaseWorkerSlot(slot);
          if (data.ok) resolve(data.result);
          else reject(new Error(data.error || 'Spatial worker task failed'));
        };

        const handleError = (event) => {
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          retireWorkerSlot(slot);
          reject(event.error || new Error(event.message || 'Spatial worker error'));
        };

        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);

        try {
          worker.postMessage({ kind, payload });
        } catch (error) {
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          retireWorkerSlot(slot);
          reject(error);
        }
      })
  );
}

export async function runGradientBatches(targets, frictionSource) {
  if (!targets || targets.length === 0) return Object.create(null);

  const frictionEntries = normalizeFrictionEntries(frictionSource);
  const workerCount = Math.min(2, targets.length);
  if (workerCount <= 1) return runLocally('gradient-batch', { targets, frictionEntries });

  const chunks = splitIntoChunks(targets, workerCount);
  const results = await Promise.all(
    chunks.map((chunk) => runWorker('gradient-batch', { targets: chunk, frictionEntries }))
  );

  const merged = Object.create(null);
  for (let i = 0; i < results.length; i++) {
    const batch = results[i];
    for (const cell in batch) merged[cell] = batch[cell];
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

  const featureCount = features ? features.length : 0;
  if (featureCount <= 1) return runWorker('fast-scan', { viewHexes, features });

  const workerCount = Math.min(MAX_WORKERS, featureCount);
  const chunks = splitIntoChunks(features, workerCount);
  if (chunks.length <= 1) return runWorker('fast-scan', { viewHexes, features });

  const results = await Promise.all(
    chunks.map((chunk) => runWorker('fast-scan-chunk', { viewHexes, features: chunk }))
  );

  const multiFrictionEntries = Object.create(null);
  const cellFrictionEntries = Object.create(null);
  for (let i = 0; i < results.length; i++) {
    const batch = results[i] || {};
    mergeFastScanEntries(multiFrictionEntries, batch.multiFrictionEntries || Object.create(null));
    mergeScalarEntries(cellFrictionEntries, batch.cellFrictionEntries || Object.create(null));
  }

  const blur = await runImpassableBlurTask(cellFrictionEntries);
  return {
    multiFrictionEntries,
    cellFrictionEntries,
    blurWeights: blur.blurWeights,
    blurUpdates: blur.updates,
  };
}

export async function runImpassableBlurTask(frictionSource, options = {}) {
  const frictionEntries = normalizeFrictionEntries(frictionSource);
  return runWorker('impassable-blur', { frictionEntries, ...options });
}
