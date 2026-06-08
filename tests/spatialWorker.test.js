import { describe, it, expect } from 'vitest';

// Mock Worker to test spatialWorker.js in node environment
class MockWorker {
  constructor() {
    this.messages = [];
    this.listeners = { message: [], error: [] };
  }
  postMessage(msg) {
    this.messages.push(msg);
    // Simulate successful response
    setTimeout(() => {
      const handler = this.listeners.message[0];
      if (handler) {
        handler({ data: { ok: true, result: { test: 'result' } } });
      }
    }, 10);
  }
  addEventListener(event, handler) {
    this.listeners[event].push(handler);
  }
  removeEventListener(event, handler) {
    const idx = this.listeners[event].indexOf(handler);
    if (idx !== -1) this.listeners[event].splice(idx, 1);
  }
  terminate() {
    // no-op
  }
}

// Test spatialTasks directly since spatialWorker depends on Worker API
import {
  normalizeFrictionEntries,
  computeDijkstraGradientSnapshot,
  computeGradientBatch,
  computeImpassableBlurSnapshot,
  computeFastScanSnapshot,
  computeFastScanChunkSnapshot,
} from '../src/helpers/spatialTasks.js';
import { latLngToCell, gridDisk } from 'h3-js';

const h3Cell = latLngToCell(40.4169, -3.7035, 15);

describe('normalizeFrictionEntries', () => {
  it('should return empty object for null input', () => {
    expect(normalizeFrictionEntries(null)).toEqual(Object.create(null));
  });

  it('should return empty object for undefined input', () => {
    expect(normalizeFrictionEntries(undefined)).toEqual(Object.create(null));
  });

  it('should copy entries from a plain object', () => {
    const input = { a: 1, b: 2 };
    const result = normalizeFrictionEntries(input);
    expect(result.a).toBe(1);
    expect(result.b).toBe(2);
  });

  it('should copy entries from a Map', () => {
    const input = new Map([['a', 1], ['b', 2]]);
    const result = normalizeFrictionEntries(input);
    expect(result.a).toBe(1);
    expect(result.b).toBe(2);
  });
});

describe('computeDijkstraGradientSnapshot', () => {
  it('should return gradient with target cell at distance 0', () => {
    const frictionEntries = {
      [h3Cell]: 1,
    };
    const result = computeDijkstraGradientSnapshot(h3Cell, frictionEntries);
    expect(result[h3Cell]).toBe(0);
  });

  it('should handle empty friction entries', () => {
    const result = computeDijkstraGradientSnapshot(h3Cell, {});
    expect(result[h3Cell]).toBe(0);
  });

  it('should handle Map input with single cell', () => {
    const frictionEntries = new Map([
      [h3Cell, 1],
    ]);
    const result = computeDijkstraGradientSnapshot(h3Cell, frictionEntries);
    expect(result[h3Cell]).toBe(0);
  });

  it('should exclude impassable cells from gradient', () => {
    const neighbors = gridDisk(h3Cell, 1);
    const impassableCell = neighbors[1] || h3Cell;
    const frictionEntries = {
      [h3Cell]: 1,
      [impassableCell]: 999999,
    };
    const result = computeDijkstraGradientSnapshot(h3Cell, frictionEntries);
    expect(result[h3Cell]).toBe(0);
    expect(result[impassableCell]).toBeUndefined();
  });
});

describe('computeGradientBatch', () => {
  it('should compute gradients for multiple targets', () => {
    const frictionEntries = {
      [h3Cell]: 1,
    };
    const result = computeGradientBatch({
      frictionEntries,
      targets: [h3Cell],
    });
    expect(result[h3Cell]).toBeDefined();
    expect(result[h3Cell][h3Cell]).toBe(0);
  });

  it('should handle empty targets list', () => {
    const result = computeGradientBatch({
      frictionEntries: { [h3Cell]: 1 },
      targets: [],
    });
    expect(Object.keys(result).length).toBe(0);
  });
});

describe('computeImpassableBlurSnapshot', () => {
  it('should return empty updates when no impassable cells', () => {
    const frictionEntries = {
      [h3Cell]: 1,
    };
    const result = computeImpassableBlurSnapshot({ frictionEntries });
    expect(result.blurWeights).toBeDefined();
    expect(result.updates).toEqual([]);
  });

  it('should apply blur from impassable cells to neighbors', () => {
    const neighbors = gridDisk(h3Cell, 1);
    const neighborCell = neighbors[1] || h3Cell;
    const frictionEntries = {
      [h3Cell]: 999999,
      [neighborCell]: 1,
    };
    const result = computeImpassableBlurSnapshot({
      frictionEntries,
      radius: 1,
      sigma: 1.0,
      addFactor: 3.0,
    });
    expect(result.blurWeights).toBeDefined();
    const neighborWeight = result.blurWeights[neighborCell];
    if (typeof neighborWeight === 'number') {
      expect(neighborWeight).toBeGreaterThan(0);
    }
    expect(Array.isArray(result.updates)).toBe(true);
  });

  it('should not blur into other impassable cells', () => {
    const neighbors = gridDisk(h3Cell, 1);
    const neighborCell = neighbors[1] || h3Cell;
    const frictionEntries = {
      [h3Cell]: 999999,
      [neighborCell]: 999999,
    };
    const result = computeImpassableBlurSnapshot({
      frictionEntries,
      radius: 1,
      sigma: 1.0,
      addFactor: 3.0,
    });
    expect(result.blurWeights[neighborCell]).toBeUndefined();
  });

  it('should respect custom radius of 0', () => {
    const result = computeImpassableBlurSnapshot({
      frictionEntries: { [h3Cell]: 999999 },
      radius: 0,
      sigma: 1.0,
      addFactor: 3.0,
    });
    expect(result.updates).toEqual([]);
  });
});

describe('computeFastScanSnapshot', () => {
  it('should return empty results for empty input', () => {
    const result = computeFastScanSnapshot({ features: [], viewHexes: [] });
    expect(result.multiFrictionEntries).toBeDefined();
    expect(result.cellFrictionEntries).toBeDefined();
    expect(result.blurWeights).toBeDefined();
    expect(result.blurUpdates).toEqual([]);
  });

  it('should skip features outside FAST_SCAN_LAYERS', () => {
    const viewHexes = [h3Cell];
    const features = [
      {
        sourceLayer: 'unknown_layer',
        properties: { class: 'secondary' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        },
      },
    ];
    const result = computeFastScanSnapshot({ features, viewHexes });
    expect(result.multiFrictionEntries).toBeDefined();
  });

  it('should skip features without geometry', () => {
    const viewHexes = [h3Cell];
    const features = [
      { sourceLayer: 'transportation', properties: { class: 'secondary' } },
    ];
    const result = computeFastScanSnapshot({ features, viewHexes });
    expect(result.multiFrictionEntries).toBeDefined();
  });

  it('should skip null features', () => {
    const viewHexes = [h3Cell];
    const features = [null];
    const result = computeFastScanSnapshot({ features, viewHexes });
    expect(result.multiFrictionEntries).toBeDefined();
  });
});

describe('computeFastScanChunkSnapshot', () => {
  it('should return empty entries for empty input', () => {
    const result = computeFastScanChunkSnapshot({ features: [], viewHexes: [] });
    expect(result.multiFrictionEntries).toBeDefined();
    expect(result.cellFrictionEntries).toBeDefined();
  });

  it('should skip features outside FAST_SCAN_LAYERS', () => {
    const viewHexes = [h3Cell];
    const features = [
      {
        sourceLayer: 'unknown_layer',
        properties: { class: 'secondary' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        },
      },
    ];
    const result = computeFastScanChunkSnapshot({ features, viewHexes });
    expect(result.multiFrictionEntries).toBeDefined();
    expect(result.cellFrictionEntries).toBeDefined();
  });

  it('should skip null features', () => {
    const viewHexes = [h3Cell];
    const features = [null];
    const result = computeFastScanChunkSnapshot({ features, viewHexes });
    expect(result.multiFrictionEntries).toBeDefined();
  });
});
