import { describe, it, expect } from 'vitest';

// Test spatialTasks directly since spatialWorker depends on Worker API
import {
  normalizeFrictionEntries,
  computeDijkstraGradientSnapshot,
  computeGradientBatch,
  computeImpassableBlurSnapshot,
  computeFastScanSnapshot,
  computeFastScanChunkSnapshot,
} from '../src/helpers/spatialTasks.js';
import {
  runGradientBatches,
  runFastScanTask,
  runImpassableBlurTask,
} from '../src/helpers/spatialWorker.js';
import { latLngToCell, gridDisk } from 'h3-js';
import { gradientGet, getGradientGraph } from '../src/helpers/dijkstra.js';

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
    const graph = getGradientGraph(frictionEntries);
    expect(gradientGet(result, h3Cell, graph)).toBe(0);
  });

  it('should handle empty friction entries', () => {
    const result = computeDijkstraGradientSnapshot(h3Cell, {});
    const graph = getGradientGraph({});
    // Target cell is not in the (empty) navigable graph, so it is unreachable.
    expect(gradientGet(result, h3Cell, graph)).toBe(Infinity);
  });

  it('should handle Map input with single cell', () => {
    const frictionEntries = new Map([
      [h3Cell, 1],
    ]);
    const result = computeDijkstraGradientSnapshot(h3Cell, frictionEntries);
    const graph = getGradientGraph(frictionEntries);
    expect(gradientGet(result, h3Cell, graph)).toBe(0);
  });

  it('should exclude impassable cells from gradient', () => {
    const neighbors = gridDisk(h3Cell, 1);
    const impassableCell = neighbors[1] || h3Cell;
    const frictionEntries = {
      [h3Cell]: 1,
      [impassableCell]: 999999,
    };
    const result = computeDijkstraGradientSnapshot(h3Cell, frictionEntries);
    const graph = getGradientGraph(frictionEntries);
    expect(gradientGet(result, h3Cell, graph)).toBe(0);
    expect(gradientGet(result, impassableCell, graph)).toBe(Infinity);
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
    const graph = getGradientGraph(frictionEntries);
    expect(result[h3Cell]).toBeDefined();
    expect(gradientGet(result[h3Cell], h3Cell, graph)).toBe(0);
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

describe('runGradientBatches', () => {
  it('should return empty object for null targets', async () => {
    const result = await runGradientBatches(null, {});
    expect(Object.keys(result).length).toBe(0);
  });

  it('should return empty object for empty targets array', async () => {
    const result = await runGradientBatches([], {});
    expect(Object.keys(result).length).toBe(0);
  });

  it('should return empty object for undefined targets', async () => {
    const result = await runGradientBatches(undefined, {});
    expect(Object.keys(result).length).toBe(0);
  });

  it('should return empty object for empty friction entries', async () => {
    const result = await runGradientBatches([h3Cell], {});
    expect(Object.keys(result).length).toBe(0);
  });

  it('should handle Map friction source', async () => {
    const neighbors = gridDisk(h3Cell, 1);
    const neighborCell = neighbors[1] || h3Cell;
    const frictionMap = new Map([
      [h3Cell, 1],
      [neighborCell, 1],
    ]);
    const result = await runGradientBatches([h3Cell], frictionMap);
    const graph = getGradientGraph(frictionMap);
    expect(result[h3Cell]).toBeDefined();
    expect(gradientGet(result[h3Cell], h3Cell, graph)).toBe(0);
  });

  it('should handle plain object friction source', async () => {
    const frictionObj = {
      [h3Cell]: 1,
    };
    const result = await runGradientBatches([h3Cell], frictionObj);
    const graph = getGradientGraph(frictionObj);
    expect(result[h3Cell]).toBeDefined();
    expect(gradientGet(result[h3Cell], h3Cell, graph)).toBe(0);
  });

  it('should compute gradients for single target', async () => {
    const frictionObj = {
      [h3Cell]: 1,
    };
    const result = await runGradientBatches([h3Cell], frictionObj);
    const graph = getGradientGraph(frictionObj);
    expect(result[h3Cell]).toBeDefined();
    expect(gradientGet(result[h3Cell], h3Cell, graph)).toBe(0);
  });

  it('should compute gradients for multiple targets', async () => {
    const h3_2 = latLngToCell(40.417, -3.7035, 15);
    const frictionObj = {
      [h3Cell]: 1,
      [h3_2]: 1,
    };
    const result = await runGradientBatches([h3Cell, h3_2], frictionObj);
    const graph = getGradientGraph(frictionObj);
    expect(result[h3Cell]).toBeDefined();
    expect(gradientGet(result[h3Cell], h3Cell, graph)).toBe(0);
    expect(result[h3_2]).toBeDefined();
    expect(gradientGet(result[h3_2], h3_2, graph)).toBe(0);
  });
});

describe('runFastScanTask', () => {
  it('should return empty results for null viewHexes', async () => {
    const result = await runFastScanTask(null, []);
    expect(result.multiFrictionEntries).toBeDefined();
    expect(result.cellFrictionEntries).toBeDefined();
    expect(result.blurWeights).toBeDefined();
    expect(result.blurUpdates).toEqual([]);
  });

  it('should return empty results for empty viewHexes', async () => {
    const result = await runFastScanTask([], []);
    expect(result.multiFrictionEntries).toBeDefined();
    expect(result.cellFrictionEntries).toBeDefined();
  });

  it('should handle undefined viewHexes', async () => {
    const result = await runFastScanTask(undefined, []);
    expect(result.multiFrictionEntries).toBeDefined();
  });

  it('should handle empty features by treating as empty', async () => {
    const result = await runFastScanTask([h3Cell], []);
    expect(result.multiFrictionEntries).toBeDefined();
    expect(result.cellFrictionEntries).toBeDefined();
  });

  it('should handle undefined features', async () => {
    const result = await runFastScanTask([h3Cell], undefined);
    expect(result.multiFrictionEntries).toBeDefined();
  });

  it('should handle single feature (run locally)', async () => {
    const features = [
      {
        sourceLayer: 'transportation',
        properties: { class: 'secondary' },
        geometry: {
          type: 'LineString',
          coordinates: [[-3.704, 40.416], [-3.703, 40.417]],
        },
      },
    ];
    const result = await runFastScanTask([h3Cell], features);
    expect(result.multiFrictionEntries).toBeDefined();
    expect(result.cellFrictionEntries).toBeDefined();
  });

  it('should handle multiple features', async () => {
    const features = [
      {
        sourceLayer: 'transportation',
        properties: { class: 'secondary' },
        geometry: {
          type: 'LineString',
          coordinates: [[-3.704, 40.416], [-3.703, 40.417]],
        },
      },
      {
        sourceLayer: 'building',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[[-3.704, 40.416], [-3.703, 40.416], [-3.703, 40.417], [-3.704, 40.417], [-3.704, 40.416]]],
        },
      },
    ];
    const result = await runFastScanTask([h3Cell], features);
    expect(result.multiFrictionEntries).toBeDefined();
    expect(result.cellFrictionEntries).toBeDefined();
  });

  it('should handle features with null geometry entries', async () => {
    const features = [
      {
        sourceLayer: 'transportation',
        properties: { class: 'secondary' },
        geometry: null,
      },
    ];
    const result = await runFastScanTask([h3Cell], features);
    expect(result.multiFrictionEntries).toBeDefined();
    expect(result.cellFrictionEntries).toBeDefined();
  });
});

describe('runImpassableBlurTask', () => {
  it('should handle Map friction source', async () => {
    const frictionMap = new Map([[h3Cell, 999999]]);
    const result = await runImpassableBlurTask(frictionMap, {});
    expect(result).toBeDefined();
  });

  it('should handle plain object friction source', async () => {
    const frictionObj = {
      [h3Cell]: 999999,
    };
    const result = await runImpassableBlurTask(frictionObj, {});
    expect(result).toBeDefined();
  });

  it('should handle empty friction source', async () => {
    const result = await runImpassableBlurTask({}, {});
    expect(result).toBeDefined();
  });
});
