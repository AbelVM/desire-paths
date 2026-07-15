import { logger } from '../helpers/logger.js';
import {
  computeAoiHexes,
  computeFastScanChunkSnapshot,
  computeFastScanSnapshot,
  computeGradientBatch,
  computeImpassableBlurSnapshot,
  computePathBlurSnapshot,
  computeVisibilityBearingCSRIndexed,
  buildMappingGraph,
  buildR1Adjacency,
  mergeCellsChunk,
} from '../helpers/spatialTasks.js';
import { computeAgentBatch } from '../helpers/agentTasks.js';

self.onmessage = (event) => {
  const data = event.data || {};

  try {
    logger.debug('spatial.worker: received message', {
        kind: data.kind,
        payloadSummary: data.payload ? Object.keys(data.payload || {}) : null,
      });
    let result;
    if (data.kind === 'fast-scan') {
      result = computeFastScanSnapshot(data.payload || {});
    } else if (data.kind === 'fast-scan-chunk') {
      result = computeFastScanChunkSnapshot(data.payload || {});
    } else if (data.kind === 'gradient-batch') {
      result = computeGradientBatch(data.payload || {});
    } else if (data.kind === 'agent-batch') {
      logger.debug('spatial.worker: delegating agent-batch to handler', {
          planLength: data.payload?.plan?.length ?? null,
        });
      const ret = computeAgentBatch(data.payload || {});
      logger.debug('spatial.worker: agent-batch handler returned', {
          hasTransfers: Array.isArray(ret?.transfers),
        });
      if (ret && Array.isArray(ret.transfers)) {
        self.postMessage({ ok: true, result: ret.result }, ret.transfers);
      } else {
        self.postMessage({ ok: true, result: ret && ret.result ? ret.result : ret });
      }
      return;
    } else if (data.kind === 'impassable-blur') {
      result = computeImpassableBlurSnapshot(data.payload || {});
    } else if (data.kind === 'path-blur') {
      result = computePathBlurSnapshot(data.payload || {});
    } else if (data.kind === 'visibility-bearing-indexed') {
      result = computeVisibilityBearingCSRIndexed(data.payload || {});
    } else if (data.kind === 'mapping-graph') {
      result = buildMappingGraph(data.payload || {});
    } else if (data.kind === 'r1-adjacency') {
      result = buildR1Adjacency(data.payload || {});
    } else if (data.kind === 'merge-cells') {
      result = mergeCellsChunk(data.payload || {});
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
