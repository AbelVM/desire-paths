import {
  computeFastScanChunkSnapshot,
  computeFastScanSnapshot,
  computeGradientBatch,
  computeImpassableBlurSnapshot,
} from '../helpers/spatialTasks.js';

self.onmessage = (event) => {
  const data = event.data || {};

  try {
    let result;
    if (data.kind === 'fast-scan') {
      result = computeFastScanSnapshot(data.payload || {});
    } else if (data.kind === 'fast-scan-chunk') {
      result = computeFastScanChunkSnapshot(data.payload || {});
    } else if (data.kind === 'gradient-batch') {
      result = computeGradientBatch(data.payload || {});
    } else if (data.kind === 'impassable-blur') {
      result = computeImpassableBlurSnapshot(data.payload || {});
    } else {
      throw new Error(`Unknown spatial task: ${data.kind}`);
    }

    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
