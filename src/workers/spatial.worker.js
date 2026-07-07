import {
  computeAoiHexes,
  computeFastScanChunkSnapshot,
  computeFastScanSnapshot,
  computeGradientBatch,
  computeImpassableBlurSnapshot,
} from '../helpers/spatialTasks.js';
import { handleAgentBatch } from './agent.worker.js';

self.onmessage = (event) => {
  const data = event.data || {};

  try {
    try {
      console.debug &&
        console.debug('spatial.worker: received message', {
          kind: data.kind,
          payloadSummary: data.payload ? Object.keys(data.payload || {}) : null,
        });
    } catch (_e) {}
    let result;
    if (data.kind === 'fast-scan') {
      result = computeFastScanSnapshot(data.payload || {});
    } else if (data.kind === 'fast-scan-chunk') {
      result = computeFastScanChunkSnapshot(data.payload || {});
    } else if (data.kind === 'gradient-batch') {
      result = computeGradientBatch(data.payload || {});
    } else if (data.kind === 'agent-batch') {
      try {
        console.debug &&
          console.debug('spatial.worker: delegating agent-batch to handler', {
            planLength: data.payload?.plan?.length ?? null,
          });
      } catch (_e) {}
      const ret = handleAgentBatch(data.payload || {});
      try {
        console.debug &&
          console.debug('spatial.worker: agent-batch handler returned', {
            hasTransfers: Array.isArray(ret?.transfers),
          });
      } catch (_e) {}
      if (ret && Array.isArray(ret.transfers)) {
        self.postMessage({ ok: true, result: ret.result }, ret.transfers);
      } else {
        self.postMessage({ ok: true, result: ret && ret.result ? ret.result : ret });
      }
      return;
    } else if (data.kind === 'impassable-blur') {
      result = computeImpassableBlurSnapshot(data.payload || {});
    } else if (data.kind === 'aoi-hexes') {
      result = computeAoiHexes(data.payload?.polygon || null, data.payload?.resolution);
    } else {
      throw new Error(`Unknown spatial task: ${data.kind}`);
    }

    self.postMessage({ ok: true, result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error && error.stack ? error.stack : null;
    self.postMessage({ ok: false, error: msg, stack });
  }
};
