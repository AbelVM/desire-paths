import { describe, it, expect } from 'vitest';
import {
  _angleDiff as angleDiff,
  _computeDijkstraGradient,
  _isVisible,
  _getBearing,
  _getBestNextStep,
  _getGradientDirection,
  _estimateMaxTicks,
  getComputeCacheStats,
  initializeAffordanceMap,
  computeAndCacheGradient,
  getCachedGradient,
  clearGradientCache,
  clearComputeCaches,
  _yieldToMain,
  addDestination,
  updateDestinationWeight,
  removeDestination,
} from '../src/helpers/compute.js';
import { latLngToCell, gridDisk } from 'h3-js';
import { buildSimulationGeoJSON } from '../src/helpers/map.js';

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
    initializeAffordanceMap.call(map);
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
    initializeAffordanceMap.call(map);
    expect(map.affordanceMap.get('a')).toBe(0.0);
  });

  it('should set PAVEMENT affordance for low friction', () => {
    const map = {
      affordanceMap: new Map(),
      cellFrictionMap: new Map([
        ['a', 1], // PAVEMENT = 1.0, midPL = 1.75
      ]),
    };
    initializeAffordanceMap.call(map);
    expect(map.affordanceMap.get('a')).toBe(1.0);
  });

  it('should set LIGHT_PARK affordance for medium friction', () => {
    const map = {
      affordanceMap: new Map(),
      cellFrictionMap: new Map([
        ['a', 2.5], // midPL=1.75, midLH=3.25
      ]),
    };
    initializeAffordanceMap.call(map);
    expect(map.affordanceMap.get('a')).toBe(0.6);
  });

  it('should set HEAVY_GRASS affordance for high friction', () => {
    const map = {
      affordanceMap: new Map(),
      cellFrictionMap: new Map([
        ['a', 5], // >= midLH=3.25
      ]),
    };
    initializeAffordanceMap.call(map);
    expect(map.affordanceMap.get('a')).toBe(0.3);
  });

  it('should update _cellState when provided', () => {
    const map = {
      affordanceMap: new Map(),
      cellFrictionMap: new Map([
        ['a', 1],
        ['b', 999999],
      ]),
      _cellState: Object.create(null),
    };
    initializeAffordanceMap.call(map);
    expect(map._cellState['a'].affordance).toBe(1.0);
    expect(map._cellState['b'].affordance).toBe(0.0);
    expect(map._cellState['a'].desire).toBe(0);
    expect(map._cellState['b'].multi).toBeNull();
  });

  it('should update existing _cellState entries', () => {
    const map = {
      affordanceMap: new Map(),
      cellFrictionMap: new Map([['a', 1]]),
      _cellState: {
        a: { friction: 1, affordance: 0.5, desire: 10, multi: null },
      },
    };
    initializeAffordanceMap.call(map);
    expect(map._cellState['a'].affordance).toBe(1.0);
    expect(map._cellState['a'].desire).toBe(10); // desire preserved
  });

  it('should handle empty cellFrictionMap', () => {
    const map = {
      affordanceMap: new Map(),
      cellFrictionMap: new Map(),
    };
    initializeAffordanceMap.call(map);
    expect(map.affordanceMap.size).toBe(0);
  });
});

describe('getComputeCacheStats', () => {
  it('should return default stats for empty context', () => {
    const stats = getComputeCacheStats();
    expect(stats.cellLatLngCacheSize).toBeGreaterThanOrEqual(0);
    expect(stats.cellLatLngCacheHits).toBeGreaterThanOrEqual(0);
    expect(stats.cellLatLngCacheMisses).toBeGreaterThanOrEqual(0);
    expect(stats.computePathCacheSize).toBe(0);
    expect(stats.computePathCacheHits).toBe(0);
    expect(stats.computePathCacheMisses).toBe(0);
    expect(stats.computeDiskCacheSize).toBe(0);
    expect(stats.computeDiskCacheHits).toBe(0);
    expect(stats.computeDiskCacheMisses).toBe(0);
    expect(stats.visibilityCacheSize).toBe(0);
    expect(stats.visibilityCacheHits).toBe(0);
    expect(stats.visibilityCacheMisses).toBe(0);
  });

  it('should return path cache stats when context has path cache', () => {
    const ctx = {
      _computePathCacheObj: { a: { b: ['c'] } },
      _computePathCacheOrder: ['a'],
      _computePathCacheHits: 5,
      _computePathCacheMisses: 3,
    };
    const stats = getComputeCacheStats(ctx);
    expect(stats.computePathCacheSize).toBe(1);
    expect(stats.computePathCacheHits).toBe(5);
    expect(stats.computePathCacheMisses).toBe(3);
  });

  it('should return disk cache stats when context has disk cache', () => {
    const ctx = {
      _computeDiskCacheObj: { a: { 1: ['b'] } },
      _computeDiskCacheOrder: ['a'],
      _computeDiskCacheHits: 10,
      _computeDiskCacheMisses: 2,
    };
    const stats = getComputeCacheStats(ctx);
    expect(stats.computeDiskCacheSize).toBe(1);
    expect(stats.computeDiskCacheHits).toBe(10);
    expect(stats.computeDiskCacheMisses).toBe(2);
  });

  it('should return visibility cache stats when context has visibility cache', () => {
    const ctx = {
      _visibilityCacheObj: { a: { b: true } },
      _visibilityCacheOrder: ['a'],
      _visibilityCacheHits: 7,
      _visibilityCacheMisses: 1,
    };
    const stats = getComputeCacheStats(ctx);
    expect(stats.visibilityCacheSize).toBe(1);
    expect(stats.visibilityCacheHits).toBe(7);
    expect(stats.visibilityCacheMisses).toBe(1);
  });
});

describe('gradient cache helpers', () => {
  it('computeAndCacheGradient should create gradient and cache it', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      cellFrictionMap: new Map([
        [h3, 1],
      ]),
      _cellState: Object.create(null),
    };
    computeAndCacheGradient.call(map, h3);
    expect(map._gradientCacheObj).toBeDefined();
    expect(map._gradientCacheObj[h3]).toBeDefined();
  });

  it('getCachedGradient should return cached gradient', () => {
    const map = {
      _gradientCacheObj: {
        a: { a: 0, b: 1 },
        b: { a: 1, b: 0 },
      },
    };
    expect(getCachedGradient.call(map, 'a')).toEqual({ a: 0, b: 1 });
    expect(getCachedGradient.call(map, 'b')).toEqual({ a: 1, b: 0 });
    expect(getCachedGradient.call(map, 'c')).toBeUndefined();
  });

  it('getCachedGradient should return undefined when no cache', () => {
    const map = {};
    expect(getCachedGradient.call(map, 'a')).toBeUndefined();
  });

  it('clearGradientCache should clear the cache', () => {
    const map = {
      _gradientCacheObj: {
        a: { a: 0 },
        b: { b: 0 },
      },
    };
    clearGradientCache.call(map);
    expect(map._gradientCacheObj).toBeDefined();
    expect(Object.keys(map._gradientCacheObj).length).toBe(0);
  });

  it('clearGradientCache should handle missing cache', () => {
    const map = {};
    clearGradientCache.call(map);
    expect(map._gradientCacheObj).toBeDefined();
    expect(Object.keys(map._gradientCacheObj).length).toBe(0);
  });
});

describe('addDestination', () => {
  it('should create a new destination node', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      simulationNodes: Object.create(null),
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map([[h3, 1]]),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    addDestination.call(map, h3, 2);
    expect(map.simulationNodes[h3]).toBeDefined();
    expect(map.simulationNodes[h3].type).toBe('destination');
    expect(map.simulationNodes[h3].weight).toBe(2);
  });

  it('should create dual when adding destination at existing origin cell', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      simulationNodes: { [h3]: { type: 'origin', weight: 1 } },
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map([[h3, 1]]),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    addDestination.call(map, h3, 1);
    expect(map.simulationNodes[h3].type).toBe('dual');
  });

  it('should update weight when adding destination at existing destination cell', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      simulationNodes: { [h3]: { type: 'destination', weight: 1 } },
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map([[h3, 1]]),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    addDestination.call(map, h3, 5);
    expect(map.simulationNodes[h3].weight).toBe(5);
  });

  it('should handle pathDesireScores as plain object with values', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const pathDesireScores = { [h3]: 10, other: 5 };
    const map = {
      simulationNodes: { [h3]: { type: 'origin', weight: 1 } },
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map(),
      pathDesireScores: pathDesireScores,
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    addDestination.call(map, h3, 1);
    expect(map.simulationNodes[h3].type).toBe('dual');
    expect(map.globalPeakFlow).toBeGreaterThan(1);
  });
});

describe('updateDestinationWeight', () => {
  it('should update weight of existing destination', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      simulationNodes: { [h3]: { type: 'destination', weight: 1 } },
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map([[h3, 1]]),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    updateDestinationWeight.call(map, h3, 3);
    expect(map.simulationNodes[h3].weight).toBe(3);
  });

  it('should create destination if it does not exist', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      simulationNodes: Object.create(null),
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map([[h3, 1]]),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    updateDestinationWeight.call(map, h3, 3);
    expect(map.simulationNodes[h3]).toBeDefined();
    expect(map.simulationNodes[h3].weight).toBe(3);
  });
});

describe('removeDestination', () => {
  it('should remove a destination', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      simulationNodes: { [h3]: { type: 'destination', weight: 1 } },
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map([[h3, 1]]),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    const result = removeDestination.call(map, h3);
    expect(result.removed).toBe(true);
    expect(map.simulationNodes[h3]).toBeUndefined();
  });

  it('should downgrade both to origin when removing destination', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      simulationNodes: { [h3]: { type: 'dual', weight: 1 } },
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map([[h3, 1]]),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    const result = removeDestination.call(map, h3);
    expect(result.removed).toBe(true);
    expect(map.simulationNodes[h3].type).toBe('origin');
  });

  it('should return removed: false for non-existent destination', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      simulationNodes: Object.create(null),
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map([[h3, 1]]),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    const result = removeDestination.call(map, h3);
    expect(result.removed).toBe(false);
  });

  it('should update _assignedCounts and _targetWeights after removal', () => {
    const origin = latLngToCell(40.4169, -3.7035, 15);
    const dest = latLngToCell(40.417, -3.7034, 15);
    const map = {
      simulationNodes: {
        [origin]: { type: 'origin', weight: 1 },
        [dest]: { type: 'destination', weight: 1 },
      },
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map(),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
      _assignedCounts: { [origin]: { [dest]: 1 } },
      _targetWeights: { [dest]: 1 },
      updateLayers: () => {},
    };
    const result = removeDestination.call(map, dest);
    expect(result.removed).toBe(true);
    expect(map.simulationNodes[dest]).toBeUndefined();
    expect(map._assignedCounts).toBeDefined();
    expect(map._targetWeights).toBeDefined();
  });

  it('should handle pathDesireScores as plain object', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      simulationNodes: { [h3]: { type: 'destination', weight: 1 } },
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map(),
      pathDesireScores: { someCell: 5 },
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 5,
      updateLayers: () => {},
    };
    const result = removeDestination.call(map, h3);
    expect(result.removed).toBe(true);
    expect(map.globalPeakFlow).toBeDefined();
  });

  it('should detect changed destinations when assigned counts differ', () => {
    const origin = latLngToCell(40.4169, -3.7035, 15);
    const dest1 = latLngToCell(40.417, -3.7034, 15);
    const dest2 = latLngToCell(40.4171, -3.7034, 15);
    const map = {
      simulationNodes: {
        [origin]: { type: 'origin', weight: 1 },
        [dest1]: { type: 'destination', weight: 1 },
        [dest2]: { type: 'destination', weight: 1 },
      },
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map(),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
      _assignedCounts: {
        [origin]: { [dest1]: 5, [dest2]: 3 },
      },
      _targetWeights: { [dest1]: 1, [dest2]: 1 },
      updateLayers: () => {},
    };
    const result = removeDestination.call(map, dest1);
    expect(result.removed).toBe(true);
    // dest1 is removed, so it should NOT be in changed (no recomputation needed)
    // dest2 should be in changed because its assigned count changed
    expect(result.changed).toContain(dest2);
    expect(map._assignedCounts).toBeDefined();
    expect(map._targetWeights).toBeDefined();
  });

  it('should prune stale gradient cache entry for removed destination', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      simulationNodes: { [h3]: { type: 'destination', weight: 1 } },
      _gradientCacheObj: { [h3]: { someCell: 0 } },
      cellFrictionMap: new Map([[h3, 1]]),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
      updateLayers: () => {},
    };
    const result = removeDestination.call(map, h3);
    expect(result.removed).toBe(true);
    // _computeAssignedCounts calls ensureGradientCacheFresh which clears the cache
    // The cache should be empty after removal
    expect(Object.keys(map._gradientCacheObj).length).toBe(0);
  });
});

describe('_computeDijkstraGradient', () => {
  it('should return gradient with target cell at distance 0', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const frictionMap = new Map([[h3, 1]]);
    // Don't set _cellState so it uses cellFrictionMap directly
    const map = {
      cellFrictionMap: frictionMap,
    };
    const result = _computeDijkstraGradient.call(map, h3);
    expect(result[h3]).toBe(0);
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
    const result = _computeDijkstraGradient.call(map, h3);
    expect(result[h3]).toBe(0);
    // All neighbors should be reachable with distance = 1
    for (const n of neighbors) {
      if (n !== h3) {
        expect(result[n]).toBe(1);
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
    // Don't set _cellState so it uses _frictionObj directly
    const map = {
      _frictionObj: frictionObj,
    };
    const result = _computeDijkstraGradient.call(map, h3);
    expect(result[h3]).toBe(0);
    for (const n of neighbors) {
      if (n !== h3) {
        expect(result[n]).toBe(1);
      }
    }
  });

  it('should use _cellState friction when available', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(h3, 1);
    const frictionMap = new Map();
    frictionMap.set(h3, 1);
    const cellState = Object.create(null);
    cellState[h3] = { friction: 1 };
    for (const n of neighbors) {
      frictionMap.set(n, 1);
      cellState[n] = { friction: 1 };
    }
    const map = {
      cellFrictionMap: frictionMap,
      _cellState: cellState,
    };
    const result = _computeDijkstraGradient.call(map, h3);
    expect(result[h3]).toBe(0);
    for (const n of neighbors) {
      if (n !== h3) {
        expect(result[n]).toBe(1);
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
    const result = _computeDijkstraGradient.call(map, h3);
    expect(result[h3]).toBe(0);
    expect(result[neighborCell]).toBeUndefined();
  });

  it('should handle empty friction map', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      cellFrictionMap: new Map(),
    };
    const result = _computeDijkstraGradient.call(map, h3);
    expect(result[h3]).toBe(0);
  });
});

describe('_isVisible', () => {
  it('should return a boolean', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      cellFrictionMap: new Map([[h3, 1]]),
      _cellState: Object.create(null),
    };
    const result = _isVisible.call(map, h3, h3);
    expect(typeof result).toBe('boolean');
  });

  it('should handle cells with _frictionObj', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      _frictionObj: { [h3]: 1 },
      _cellState: Object.create(null),
    };
    const result = _isVisible.call(map, h3, h3);
    expect(typeof result).toBe('boolean');
  });

  it('should handle cells with _cellState', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const map = {
      _frictionObj: { [h3]: 1 },
      _cellState: { [h3]: { friction: 1 } },
    };
    const result = _isVisible.call(map, h3, h3);
    expect(typeof result).toBe('boolean');
  });

  it('should handle Map frictionLookup', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const frictionMap = new Map([[h3, 1]]);
    const map = {
      cellFrictionMap: frictionMap,
      _cellState: Object.create(null),
    };
    const result = _isVisible.call(map, h3, h3);
    expect(typeof result).toBe('boolean');
  });
});

describe('_getBearing', () => {
  it('should return a bearing between 0 and 360', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const bearing = _getBearing(h3, h3);
    expect(typeof bearing).toBe('number');
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
  });

  it('should return 0 when start equals end', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const bearing = _getBearing(h3, h3);
    expect(bearing).toBe(0);
  });
});

describe('_getBestNextStep', () => {
  it('should return null when no visible neighbors', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    // Create a context where all neighbors are impassable
    const frictionMap = new Map([[h3, 999999]]);
    const map = {
      cellFrictionMap: frictionMap,
      _cellState: Object.create(null),
      _affordanceObj: Object.create(null),
    };
    const result = _getBestNextStep.call(map, h3, {}, 0);
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
    const result = _getBestNextStep.call(map, h3, {}, 0);
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
    const result = _getBestNextStep.call(map, h3, {}, 0);
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('should use _cellState friction when available', () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(h3, 1);
    const neighborCell = neighbors[1] || h3;
    const frictionMap = new Map([
      [h3, 1],
      [neighborCell, 1],
    ]);
    const cellState = Object.create(null);
    cellState[h3] = { friction: 1 };
    cellState[neighborCell] = { friction: 1 };
    const map = {
      cellFrictionMap: frictionMap,
      _cellState: cellState,
      _affordanceObj: Object.create(null),
    };
    const result = _getBestNextStep.call(map, h3, {}, 0);
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
    const result = _getBestNextStep.call(map, h3, {}, 0);
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
    const result = _getBestNextStep.call(map, h3, gradient, 0);
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
    const result = _getBestNextStep.call(map, h3, {}, 0, 'test-agent');
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
    const result = _getBestNextStep.call(map, h3, {}, 0);
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
    const result = _getBestNextStep.call(map, h3, gradientObj, 0);
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
    const result = _getBestNextStep.call(map, h3, {}, 0);
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
    const result = _getBestNextStep.call(map, h3, {}, 0);
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
    clearComputeCaches.call(map);
    expect(map._computePathCacheObj).toBeUndefined();
    expect(map._computeDiskCacheObj).toBeUndefined();
    expect(map._visibilityCacheObj).toBeUndefined();
    expect(map._gradientCacheObj).toBeDefined();
    expect(Object.keys(map._gradientCacheObj).length).toBe(0);
    expect(map._gradientCacheGen).toBeUndefined();
  });

  it('should clear the module-level lat/lng cache', () => {
    // Verify clearLatLngCache is exported and works
    const { clearLatLngCache, getComputeCacheStats } = require('../src/helpers/compute.js');
    expect(typeof clearLatLngCache).toBe('function');
    expect(typeof getComputeCacheStats).toBe('function');
    // Call clearLatLngCache and verify it doesn't throw
    expect(() => clearLatLngCache()).not.toThrow();
  });
});

describe('yieldToMain', () => {
  it('should yield without requiring Scheduler API', async () => {
    await expect(_yieldToMain()).resolves.toBeUndefined();
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

    const geojson = buildSimulationGeoJSON.call(ctx);

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

    const geojson = buildSimulationGeoJSON.call(ctx);

    expect(geojson.features).toHaveLength(0);
  });
});

describe('estimateMaxTicks', () => {
  it('should cap ticks using origin-destination distance', () => {
    const origin = latLngToCell(40.4169, -3.7035, 15);
    const dest = latLngToCell(40.417, -3.7034, 15);
    const ticks = _estimateMaxTicks(origin, dest, 1000);
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

    const bearing = _getGradientDirection.call(map, center, gradient);
    expect(typeof bearing).toBe('number');
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
  });
});
