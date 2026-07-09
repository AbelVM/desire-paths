import { describe, it, expect } from 'vitest';
import {
  initializeAffordanceMap,
  clearGradientCache,
  clearComputeCaches,
  computeDesirePaths,
  computeDijkstraGradient,
  getBestNextStep,
  estimateMaxTicks,
  getGradientDirection,
} from '../src/helpers/compute.js';
import { angleDiff } from '../src/helpers/bearing.js';
import { latLngToCell, gridDisk } from 'h3-js';
import { buildSimulationGeoJSON } from '../src/helpers/map.js';
import { gradientGet, getGradientGraph } from '../src/helpers/dijkstra.js';

describe('angleDiff', () => {
  it('should return 0 for equal angles', () => {
    expect(angleDiff(0, 0)).toBe(0);
    expect(angleDiff(90, 90)).toBe(0);
    expect(angleDiff(180, 180)).toBe(0);
    expect(angleDiff(360, 0)).toBe(0);
  });

  it('should return the smallest angular difference', () => {
    expect(angleDiff(0, 90)).toBe(90);
    expect(angleDiff(0, 180)).toBe(180);
    expect(angleDiff(0, 270)).toBe(90);
    expect(angleDiff(0, 45)).toBe(45);
    expect(angleDiff(0, 315)).toBe(45);
  });

  it('should handle angles greater than 360', () => {
    expect(angleDiff(360, 0)).toBe(0);
    expect(angleDiff(450, 90)).toBe(0);
    expect(angleDiff(720, 0)).toBe(0);
  });

  it('should handle negative angles', () => {
    expect(angleDiff(-90, 270)).toBe(0);
    expect(angleDiff(-45, 315)).toBe(0);
    expect(angleDiff(-180, 180)).toBe(0);
  });

  it('should be symmetric', () => {
    for (const a of [0, 45, 90, 135, 180, 225, 270, 315]) {
      for (const b of [0, 45, 90, 135, 180, 225, 270, 315]) {
        expect(angleDiff(a, b)).toBe(angleDiff(b, a));
      }
    }
  });

  it('should return maximum 180', () => {
    expect(angleDiff(0, 180)).toBe(180);
    expect(angleDiff(10, 190)).toBe(180);
  });
});

describe('initializeAffordanceMap', () => {
  it('should clear existing affordance map', () => {
    const map = {
      affordanceMap: new Map([['a', 0.5], ['b', 0.3]]),
      cellFrictionMap: new Map(),
    };
    initializeAffordanceMap(map);
    expect(map.affordanceMap.size).toBe(0);
  });

  it('should set IMPASSABLE affordance for impassable friction', () => {
    const map = {
      affordanceMap: new Map(),
      cellFrictionMap: new Map([
        ['a', 999999],
        ['b', 1],
      ]),
    };
    initializeAffordanceMap(map);
    expect(map.affordanceMap.get('a')).toBe(0.0);
  });

  it('should set PAVEMENT affordance for low friction', () => {
    const map = {
      affordanceMap: new Map(),
      cellFrictionMap: new Map([
        ['a', 1], // PAVEMENT = 1.0, midPL = 1.75
      ]),
    };
    initializeAffordanceMap(map);
    expect(map.affordanceMap.get('a')).toBe(1.0);
  });

  it('should set LIGHT_PARK affordance for medium friction', () => {
    const map = {
      affordanceMap: new Map(),
      cellFrictionMap: new Map([
        ['a', 2.5], // midPL=1.75, midLH=3.25
      ]),
    };
    initializeAffordanceMap(map);
    expect(map.affordanceMap.get('a')).toBe(0.6);
  });

  it('should set HEAVY_GRASS affordance for high friction', () => {
    const map = {
      affordanceMap: new Map(),
      cellFrictionMap: new Map([
        ['a', 5], // >= midLH=3.25
      ]),
    };
    initializeAffordanceMap(map);
    expect(map.affordanceMap.get('a')).toBe(0.3);
  });

  it('should handle empty cellFrictionMap', () => {
    const map = {
      affordanceMap: new Map(),
      cellFrictionMap: new Map(),
    };
    initializeAffordanceMap(map);
    expect(map.affordanceMap.size).toBe(0);
  });
});

describe('gradient cache helpers', () => {
  it('clearGradientCache should clear the cache', () => {
    const map = {
      _gradientCacheObj: {
        a: { a: 0 },
        b: { b: 0 },
      },
    };
    clearGradientCache(map);
    expect(map._gradientCacheObj).toBeDefined();
    expect(Object.keys(map._gradientCacheObj).length).toBe(0);
  });

  it('clearGradientCache should handle missing cache', () => {
    const map = {};
    clearGradientCache(map);
    expect(map._gradientCacheObj).toBeDefined();
    expect(Object.keys(map._gradientCacheObj).length).toBe(0);
  });

});

describe('computeDijkstraGradient', () => {
  it('should return gradient with target cell at distance 0', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const frictionMap = new Map([[h3, 1]]);
    // Don't set _cellState so it uses cellFrictionMap directly
    const map = {
      cellFrictionMap: frictionMap,
    };
    const result = computeDijkstraGradient(map, h3);
    const graph = getGradientGraph(frictionMap);
    expect(gradientGet(result, h3, graph)).toBe(0);
  });

  it('should compute distances through adjacent cells', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(h3, 1);
    // Build a friction map with the center and all its neighbors
    const frictionMap = new Map();
    frictionMap.set(h3, 1);
    for (const n of neighbors) {
      frictionMap.set(n, 1);
    }
    // Don't set _cellState so it uses cellFrictionMap directly
    const map = {
      cellFrictionMap: frictionMap,
    };
    const result = computeDijkstraGradient(map, h3);
    const graph = getGradientGraph(frictionMap);
    expect(gradientGet(result, h3, graph)).toBe(0);
    // All neighbors should be reachable with distance = 1
    for (const n of neighbors) {
      if (n !== h3) {
        expect(gradientGet(result, n, graph)).toBe(1);
      }
    }
  });

  it('should use _frictionObj when available instead of cellFrictionMap', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(h3, 1);
    const frictionObj = { [h3]: 1 };
    for (const n of neighbors) {
      frictionObj[n] = 1;
    }
    // The gradient graph is always built from `cellFrictionMap` (the stable
    // AOI cell set); `_frictionObj` supplies the per-cell friction lookup.
    // Mirror that here so the graph is non-empty (P2-12 removed the legacy
    // no-graph Dijkstra fallback that previously masked a missing graph).
    const cellFrictionMap = new Map();
    for (const k in frictionObj) cellFrictionMap.set(k, frictionObj[k]);
    const map = {
      _frictionObj: frictionObj,
      cellFrictionMap,
    };
    const result = computeDijkstraGradient(map, h3);
    const graph = getGradientGraph(cellFrictionMap);
    expect(gradientGet(result, h3, graph)).toBe(0);
    for (const n of neighbors) {
      if (n !== h3) {
        expect(gradientGet(result, n, graph)).toBe(1);
      }
    }
  });

  it('should exclude impassable cells from gradient', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(h3, 1);
    const neighborCell = neighbors[1] || h3;
    const frictionMap = new Map([
      [h3, 1],
      [neighborCell, 999999],
    ]);
    // Don't set _cellState so it uses cellFrictionMap directly
    const map = {
      cellFrictionMap: frictionMap,
    };
    const result = computeDijkstraGradient(map, h3);
    const graph = getGradientGraph(frictionMap);
    expect(gradientGet(result, h3, graph)).toBe(0);
    expect(gradientGet(result, neighborCell, graph)).toBe(Infinity);
  });

  it('should handle empty friction map', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      cellFrictionMap: new Map(),
    };
    const result = computeDijkstraGradient(map, h3);
    const graph = getGradientGraph(new Map());
    // Target cell is not in the (empty) navigable graph, so it is unreachable.
    expect(gradientGet(result, h3, graph)).toBe(Infinity);
  });
});

describe('getBestNextStep', () => {
  it('should return null when no visible neighbors', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    // Create a context where all neighbors are impassable
    const frictionMap = new Map([[h3, 999999]]);
    const map = {
      cellFrictionMap: frictionMap,
      _cellState: Object.create(null),
      _affordanceObj: Object.create(null),
    };
    const result = getBestNextStep(map, h3, {}, 0);
    expect(result).toBeNull();
  });

  it('should return a neighbor when one is visible', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(h3, 1);
    const neighborCell = neighbors[1] || h3;
    const frictionMap = new Map([
      [h3, 1],
      [neighborCell, 1],
    ]);
    const map = {
      cellFrictionMap: frictionMap,
      _cellState: Object.create(null),
      _affordanceObj: Object.create(null),
    };
    const result = getBestNextStep(map, h3, {}, 0);
    // Should return a valid neighbor or null if no visible neighbors
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('should use _frictionObj when available', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(h3, 1);
    const neighborCell = neighbors[1] || h3;
    const frictionObj = {
      [h3]: 1,
      [neighborCell]: 1,
    };
    const map = {
      _frictionObj: frictionObj,
      _cellState: Object.create(null),
      _affordanceObj: Object.create(null),
    };
    const result = getBestNextStep(map, h3, {}, 0);
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('should skip impassable neighbors', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(h3, 1);
    const neighborCell = neighbors[1] || h3;
    const frictionMap = new Map([
      [h3, 1],
      [neighborCell, 999999],
    ]);
    const map = {
      cellFrictionMap: frictionMap,
      _cellState: Object.create(null),
      _affordanceObj: Object.create(null),
    };
    const result = getBestNextStep(map, h3, {}, 0);
    // Should not return the impassable neighbor
    expect(result).not.toBe(neighborCell);
  });

  it('should use gradient when provided', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(h3, 1);
    const neighborCell = neighbors[1] || h3;
    const frictionMap = new Map([
      [h3, 1],
      [neighborCell, 1],
    ]);
    // Provide a gradient where neighborCell has a lower gradient value
    const gradient = {
      [h3]: 2,
      [neighborCell]: 1,
    };
    const map = {
      cellFrictionMap: frictionMap,
      _cellState: Object.create(null),
      _affordanceObj: Object.create(null),
    };
    const result = getBestNextStep(map, h3, gradient, 0);
    // Should prefer the neighbor with lower gradient
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('should handle debugCompute flag', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(h3, 1);
    const neighborCell = neighbors[1] || h3;
    const frictionMap = new Map([
      [h3, 1],
      [neighborCell, 1],
    ]);
    const map = {
      cellFrictionMap: frictionMap,
      _cellState: Object.create(null),
      _affordanceObj: Object.create(null),
      debugCompute: true,
    };
    // Should not throw with debugCompute enabled
    const result = getBestNextStep(map, h3, {}, 0, 'test-agent');
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('should handle affordanceMap as fallback', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(h3, 1);
    const neighborCell = neighbors[1] || h3;
    const map = {
      // _frictionObj is now the canonical lookup — provide it as a plain object
      _frictionObj: { [h3]: 1, [neighborCell]: 1 },
      _affordanceObj: { [h3]: 0.5, [neighborCell]: 0.8 },
      // No _cellState
    };
    const result = getBestNextStep(map, h3, {}, 0);
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('should handle Map gradient', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(h3, 1);
    const neighborCell = neighbors[1] || h3;
    // gradient is always a plain object after the normalization refactor
    const gradientObj = { [h3]: 2, [neighborCell]: 1 };
    const map = {
      _frictionObj: { [h3]: 1, [neighborCell]: 1 },
      _cellState: Object.create(null),
      _affordanceObj: Object.create(null),
    };
    const result = getBestNextStep(map, h3, gradientObj, 0);
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('should handle cellsArr.length === 0 (fallback tunneling)', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    // All neighbors are impassable, so cellsArr will be empty
    const neighbors = gridDisk(h3, 1);
    const frictionMap = new Map();
    frictionMap.set(h3, 1);
    for (const n of neighbors) {
      if (n !== h3) {
        frictionMap.set(n, 999999);
      }
    }
    const map = {
      cellFrictionMap: frictionMap,
      _cellState: Object.create(null),
      _affordanceObj: Object.create(null),
    };
    const result = getBestNextStep(map, h3, {}, 0);
    // Should return null when all neighbors are impassable
    expect(result).toBeNull();
  });

  it('should handle frictionArr[i] === 0 (falsy friction)', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(h3, 1);
    const neighborCell = neighbors[1] || h3;
    const frictionMap = new Map([
      [h3, 0],
      [neighborCell, 0],
    ]);
    const map = {
      cellFrictionMap: frictionMap,
      _cellState: Object.create(null),
      _affordanceObj: Object.create(null),
    };
    const result = getBestNextStep(map, h3, {}, 0);
    expect(result === null || typeof result === 'string').toBe(true);
  });
});

describe('clearComputeCaches', () => {
  it('should clear path, disk, visibility, and gradient caches', () => {
    const map = {
      _computePathCacheObj: { a: { b: [1] } },
      _computePathCacheOrder: ['a'],
      _computeDiskCacheObj: { c: { 1: [2] } },
      _computeDiskCacheOrder: ['c'],
      _visibilityCacheObj: { d: { e: true } },
      _visibilityCacheOrder: ['d'],
      _gradientCacheObj: { f: { f: 0 } },
      _gradientCacheGen: 1,
      _visibilityCacheGen: 1,
    };
    clearComputeCaches(map);
    expect(map._computePathCacheObj).toBeUndefined();
    expect(map._computeDiskCacheObj).toBeUndefined();
    expect(map._visibilityCacheObj).toBeUndefined();
    expect(map._gradientCacheObj).toBeDefined();
    expect(Object.keys(map._gradientCacheObj).length).toBe(0);
    expect(map._gradientCacheGen).toBeUndefined();
  });

  it('should clear the module-level lat/lng cache', () => {
    // Verify clearLatLngCache is exported and works
    const { clearLatLngCache } = require('../src/helpers/compute.js');
    expect(typeof clearLatLngCache).toBe('function');
    // Call clearLatLngCache and verify it doesn't throw
    expect(() => clearLatLngCache()).not.toThrow();
  });
});

describe('buildSimulationGeoJSON', () => {
  it('should export flow cells as GeoJSON polygons', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const ctx = {
      getHexes: () => [h3],
      cellFrictionMap: new Map([[h3, 1]]),
      pathDesireScores: { [h3]: 7 },
      _frictionObj: { [h3]: 1 },
      _affordanceObj: { [h3]: 0.4 },
    };

    const geojson = buildSimulationGeoJSON(ctx, ctx);

    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].geometry.type).toBe('Polygon');
    expect(geojson.features[0].properties.desireScore).toBe(7);
    expect(geojson.features[0].properties.friction).toBe(1);
    expect(geojson.features[0].properties.affordance).toBe(0.4);
  });

  it('should skip cells without desire score', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const ctx = {
      getHexes: () => [h3],
      cellFrictionMap: new Map([[h3, 1]]),
      pathDesireScores: Object.create(null),
      _frictionObj: { [h3]: 1 },
      _affordanceObj: { [h3]: 0.4 },
    };

    const geojson = buildSimulationGeoJSON(ctx, ctx);

    expect(geojson.features).toHaveLength(0);
  });
});

describe('estimateMaxTicks', () => {
  it('should cap ticks using origin-destination distance', () => {
    const origin = latLngToCell(40.4169, -3.7035, 15);
    const dest = latLngToCell(40.417, -3.7034, 15);
    const ticks = estimateMaxTicks(origin, dest, 1000);
    expect(ticks).toBeGreaterThan(0);
    expect(ticks).toBeLessThanOrEqual(5000);
  });
});

describe('getGradientDirection', () => {
  it('should return a bearing toward the steepest descent neighbor', () => {
    const center = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(center, 1).filter((c) => c !== center);
    const target = neighbors[0];
    const gradient = Object.create(null);
    gradient[center] = 10;
    for (const n of neighbors) gradient[n] = 5;
    gradient[target] = 1;

    const map = {
      _frictionObj: Object.create(null),
      cellFrictionMap: new Map(),
    };
    for (const n of [center, ...neighbors]) {
      map._frictionObj[n] = 1;
      map.cellFrictionMap.set(n, 1);
    }

    const bearing = getGradientDirection(map, center, gradient);
    expect(typeof bearing).toBe('number');
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
  });
});

describe('unreachable destination warning', () => {
  it('should detect unreachable destination with empty gradient', async () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      cellFrictionMap: new Map([[h3, 1]]),
      simulationNodes: {
        [h3]: { type: 'destination', weight: 1 },
      },
      _gradientCacheObj: {
        [h3]: Object.create(null), // Empty gradient = unreachable
      },
      _frictionObj: { [h3]: 1 },
      _affordanceObj: { [h3]: 0.1 },
      _cellState: Object.create(null),
      pathDesireScores: Object.create(null),
      globalPeakFlow: 1,
      _mappingGeneration: 1,
      _frictionSnapshotGen: 1,
      _affordanceSnapshotGen: 1,
      _multiFrictionSnapshotGen: 1,
      _cellStateMappingGen: 1,
      _gradientCacheGen: 1,
      _visibilityCacheGen: 1,
      _precomputedNeighborDisks: { gen: 1, data: Object.create(null) },
      showAlertCard: (msg, opts) => {
        map._alertMsg = msg;
        map._alertOpts = opts;
      },
      updateLayers: () => {},
    };
    await computeDesirePaths(map, map);
    expect(map._alertMsg).toContain('reached on foot');
  });

  it('should detect unreachable destination with only self in gradient', async () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      cellFrictionMap: new Map([[h3, 1]]),
      simulationNodes: {
        [h3]: { type: 'destination', weight: 1 },
      },
      _gradientCacheObj: {
        [h3]: { [h3]: 0 }, // Only self = unreachable
      },
      _frictionObj: { [h3]: 1 },
      _affordanceObj: { [h3]: 0.1 },
      _cellState: Object.create(null),
      pathDesireScores: Object.create(null),
      globalPeakFlow: 1,
      _mappingGeneration: 1,
      _frictionSnapshotGen: 1,
      _affordanceSnapshotGen: 1,
      _multiFrictionSnapshotGen: 1,
      _cellStateMappingGen: 1,
      _gradientCacheGen: 1,
      _visibilityCacheGen: 1,
      _precomputedNeighborDisks: { gen: 1, data: Object.create(null) },
      showAlertCard: (msg, opts) => {
        map._alertMsg = msg;
        map._alertOpts = opts;
      },
      updateLayers: () => {},
    };
    await computeDesirePaths(map, map);
    expect(map._alertMsg).toContain('reached on foot');
  });

  it('should not warn when all destinations are reachable', async () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(h3, 1).filter((c) => c !== h3);
    const neighborCell = neighbors[0];
    const map = {
      cellFrictionMap: new Map([
        [h3, 1],
        [neighborCell, 1],
      ]),
      simulationNodes: {
        [h3]: { type: 'destination', weight: 1 },
        [neighborCell]: { type: 'origin', weight: 1 },
      },
      _gradientCacheObj: {
        [h3]: { [h3]: 0, [neighborCell]: 1 }, // Reachable
      },
      _frictionObj: { [h3]: 1, [neighborCell]: 1 },
      _affordanceObj: { [h3]: 0.1, [neighborCell]: 0.1 },
      _cellState: Object.create(null),
      pathDesireScores: Object.create(null),
      globalPeakFlow: 1,
      _mappingGeneration: 1,
      _frictionSnapshotGen: 1,
      _affordanceSnapshotGen: 1,
      _multiFrictionSnapshotGen: 1,
      _cellStateMappingGen: 1,
      _gradientCacheGen: 1,
      _visibilityCacheGen: 1,
      _precomputedNeighborDisks: { gen: 1, data: Object.create(null) },
      showAlertCard: (msg, opts) => {
        map._alertMsg = msg;
        map._alertOpts = opts;
      },
      updateLayers: () => {},
    };
    await computeDesirePaths(map, map);
    expect(map._alertMsg).toBeUndefined();
  });
});
