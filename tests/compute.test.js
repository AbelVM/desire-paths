import { describe, it, expect } from 'vitest';
import {
  _angleDiff as angleDiff,
  getComputeCacheStats,
  initializeAffordanceMap,
  computeAndCacheGradient,
  getCachedGradient,
  clearGradientCache,
  addDestination,
  updateDestinationWeight,
  removeDestination,
} from '../src/helpers/compute.js';
import { latLngToCell } from 'h3-js';

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
    const map = {
      simulationNodes: Object.create(null),
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map(),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    addDestination.call(map, 'abc123', 2);
    expect(map.simulationNodes['abc123']).toBeDefined();
    expect(map.simulationNodes['abc123'].type).toBe('destination');
    expect(map.simulationNodes['abc123'].weight).toBe(2);
  });

  it('should upgrade origin to both when adding destination at same cell', () => {
    const map = {
      simulationNodes: { 'abc123': { type: 'origin', weight: 1 } },
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map(),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    addDestination.call(map, 'abc123', 1);
    expect(map.simulationNodes['abc123'].type).toBe('both');
  });

  it('should update weight when adding destination at existing destination cell', () => {
    const map = {
      simulationNodes: { 'abc123': { type: 'destination', weight: 1 } },
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map(),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    addDestination.call(map, 'abc123', 5);
    expect(map.simulationNodes['abc123'].weight).toBe(5);
  });
});

describe('updateDestinationWeight', () => {
  it('should update weight of existing destination', () => {
    const map = {
      simulationNodes: { 'abc123': { type: 'destination', weight: 1 } },
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map(),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    updateDestinationWeight.call(map, 'abc123', 3);
    expect(map.simulationNodes['abc123'].weight).toBe(3);
  });

  it('should create destination if it does not exist', () => {
    const map = {
      simulationNodes: Object.create(null),
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map(),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    updateDestinationWeight.call(map, 'abc123', 3);
    expect(map.simulationNodes['abc123']).toBeDefined();
    expect(map.simulationNodes['abc123'].weight).toBe(3);
  });
});

describe('removeDestination', () => {
  it('should remove a destination', () => {
    const map = {
      simulationNodes: { 'abc123': { type: 'destination', weight: 1 } },
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map(),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    const result = removeDestination.call(map, 'abc123');
    expect(result.removed).toBe(true);
    expect(map.simulationNodes['abc123']).toBeUndefined();
  });

  it('should downgrade both to origin when removing destination', () => {
    const map = {
      simulationNodes: { 'abc123': { type: 'both', weight: 1 } },
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map(),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    const result = removeDestination.call(map, 'abc123');
    expect(result.removed).toBe(true);
    expect(map.simulationNodes['abc123'].type).toBe('origin');
  });

  it('should return removed: false for non-existent destination', () => {
    const map = {
      simulationNodes: Object.create(null),
      _gradientCacheObj: Object.create(null),
      cellFrictionMap: new Map(),
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _cellState: Object.create(null),
      globalPeakFlow: 1,
    };
    const result = removeDestination.call(map, 'nonexistent');
    expect(result.removed).toBe(false);
  });
});
