import { describe, it, expect } from 'vitest';
import { computeDesirePaths } from '../src/helpers/compute.js';
import { latLngToCell, gridDistance, gridDisk } from 'h3-js';
import { FRICTION_COSTS, AFFORDANCE } from '../src/helpers/constants.js';

/**
 * Regression tests for computeDesirePaths — ensures the simulation
 * actually populates pathDesireScores and globalPeakFlow.
 *
 * Previous bug: simPath was initialised as [] and pathDesireDeltas was
 * never written to, so pathDesireScores stayed empty and the flow layer
 * never rendered.
 */
describe('computeDesirePaths regression', () => {
  /**
   * Build a linear path of adjacent H3 cells using gridDisk.
   * Start at `center`, then take cells along a bearing (0° = north).
   */
  function buildLinearPath(centerLat, centerLng, length) {
    const root = latLngToCell(centerLat, centerLng, 15);
    const disk = gridDisk(root, length - 1);
    // Pick a straight line: the center cell plus (length-1) cells
    // that are successive neighbours along one axis.
    // gridDisk returns cells in ring order; ring 0 = center, ring 1 = 6 neighbours.
    // We'll just use the first `length` cells from disk and verify they're connected.
    const path = disk.slice(0, length);

    // Verify all cells are within distance 1 of at least one other cell in the path
    for (let i = 0; i < path.length; i++) {
      let connected = false;
      for (let j = 0; j < path.length; j++) {
        if (i === j) continue;
        if (gridDistance(path[i], path[j]) === 1) {
          connected = true;
          break;
        }
      }
      if (!connected) {
        // Fallback: use gridDisk with larger radius to ensure connectivity
        return buildLinearPathFallback(centerLat, centerLng, length);
      }
    }
    return path;
  }

  function buildLinearPathFallback(centerLat, centerLng, length) {
    // If the above doesn't produce a connected path, build one manually
    // by walking from the center cell using gridDisk with increasing radius.
    const root = latLngToCell(centerLat, centerLng, 15);
    const path = [root];
    let current = root;
    for (let r = 1; r <= length && path.length < length; r++) {
      const ring = gridDisk(current, 1);
      // Pick the first neighbour not already in path
      for (const n of ring) {
        if (!path.includes(n)) {
          path.push(n);
          current = n;
          break;
        }
      }
    }
    return path;
  }

  /**
   * Build a minimal mock context that satisfies all guards inside
   * computeDesirePaths: friction map populated, at least one origin
   * and one destination in simulationNodes.
   */
  function buildContext(pathCells) {
    const originCell = pathCells[0];
    const destCell = pathCells[pathCells.length - 1];

    const frictionObj = Object.create(null);
    for (const cell of pathCells) {
      frictionObj[cell] = FRICTION_COSTS.PAVEMENT; // walkable
    }

    return {
      cellFrictionMap: new Map(Object.entries(frictionObj)),
      _frictionObj: frictionObj,
      simulationNodes: {
        [originCell]: { type: 'origin', weight: 1 },
        [destCell]: { type: 'destination', weight: 1 },
      },
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _affordanceObj: Object.create(null),
      _cellState: Object.create(null),
      _gradientCache: Object.create(null),
      globalPeakFlow: 1,
      showFrictionMesh: true,
      // Stub updateLayers so the function doesn't crash at the end
      updateLayers: () => {},
    };
  }

  it('must populate pathDesireScores with at least the origin cell', async () => {
    const pathCells = buildLinearPath(40.4169, -3.7035, 5);
    const ctx = buildContext(pathCells);

    await computeDesirePaths(ctx, ctx);

    // The core regression: pathDesireScores must NOT be empty
    expect(Object.keys(ctx.pathDesireScores).length).toBeGreaterThan(0);
  });

  it('must include the origin cell in pathDesireScores', async () => {
    const pathCells = buildLinearPath(40.4169, -3.7035, 5);
    const originCell = pathCells[0];
    const ctx = buildContext(pathCells);

    await computeDesirePaths(ctx, ctx);

    // The origin cell must have a non-zero desire score
    expect(ctx.pathDesireScores[originCell]).toBeGreaterThan(0);
  });

  it('must update globalPeakFlow to a value greater than 1 after simulation', async () => {
    const pathCells = buildLinearPath(40.4169, -3.7035, 5);
    const ctx = buildContext(pathCells);

    await computeDesirePaths(ctx, ctx);

    expect(ctx.globalPeakFlow).toBeGreaterThan(1);
  });

  it('must produce non-empty pathDesireScores on repeated runs', async () => {
    const pathCells = buildLinearPath(40.4169, -3.7035, 5);
    const originCell = pathCells[0];

    // Run multiple times to verify consistency
    for (let run = 0; run < 3; run++) {
      const ctx = buildContext(pathCells);
      await computeDesirePaths(ctx, ctx);

      expect(Object.keys(ctx.pathDesireScores).length).toBeGreaterThan(0);
      expect(ctx.pathDesireScores[originCell]).toBeGreaterThan(0);
      expect(ctx.globalPeakFlow).toBeGreaterThan(1);
    }
  });

  it('must assign desire to cells along the path, not just the origin', async () => {
    const pathCells = buildLinearPath(40.4169, -3.7035, 5);
    const ctx = buildContext(pathCells);

    await computeDesirePaths(ctx, ctx);

    // At least 2 cells must have non-zero desire scores (origin + at least one neighbour)
    let cellsWithDesire = 0;
    for (const score of Object.values(ctx.pathDesireScores)) {
      if (score > 0) cellsWithDesire++;
    }
    expect(cellsWithDesire).toBeGreaterThanOrEqual(2);
  });

  it('must handle weight > 1 origins (more agents)', async () => {
    const pathCells = buildLinearPath(40.4169, -3.7035, 5);
    const originCell = pathCells[0];
    const ctx = buildContext(pathCells);
    ctx.simulationNodes[originCell].weight = 5;

    await computeDesirePaths(ctx, ctx);

    // Higher weight → more agents → higher desire on the origin
    expect(ctx.pathDesireScores[originCell]).toBeGreaterThan(0);
    expect(ctx.globalPeakFlow).toBeGreaterThan(1);
  });

  it('must return early when cellFrictionMap is empty', async () => {
    const originCell = latLngToCell(40.4169, -3.7035, 15);
    const destCell = latLngToCell(40.417, -3.7034, 15);
    const ctx = {
      cellFrictionMap: new Map(),
      _frictionObj: Object.create(null),
      simulationNodes: {
        [originCell]: { type: 'origin', weight: 1 },
        [destCell]: { type: 'destination', weight: 1 },
      },
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _affordanceObj: Object.create(null),
      _cellState: Object.create(null),
      _gradientCache: Object.create(null),
      globalPeakFlow: 1,
      showFrictionMesh: true,
      updateLayers: () => {},
    };

    await computeDesirePaths(ctx, ctx);

    // Should return early without modifying pathDesireScores
    // pathDesireScores is reset to a new plain object; it should be empty
    expect(Object.keys(ctx.pathDesireScores).length).toBe(0);
  });

  it('must return early when cellFrictionMap is null', async () => {
    const originCell = latLngToCell(40.4169, -3.7035, 15);
    const destCell = latLngToCell(40.417, -3.7034, 15);
    const ctx = {
      cellFrictionMap: null,
      simulationNodes: {
        [originCell]: { type: 'origin', weight: 1 },
        [destCell]: { type: 'destination', weight: 1 },
      },
      pathDesireScores: new Map(),
      updateLayers: () => {},
    };

    await computeDesirePaths(ctx, ctx);

    expect(Object.keys(ctx.pathDesireScores).length).toBe(0);
  });

  it('must handle origin that is also a destination (self-targeting)', async () => {
    const h3 = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(h3, 1);
    const neighborCell = neighbors[1] || h3;
    const frictionObj = { [h3]: 1, [neighborCell]: 1 };

    // Origin and destination are the same cell (type: 'both')
    const ctx = {
      cellFrictionMap: new Map(Object.entries(frictionObj)),
      _frictionObj: frictionObj,
      simulationNodes: {
        [h3]: { type: 'both', weight: 1 },
      },
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _affordanceObj: Object.create(null),
      _cellState: Object.create(null),
      _gradientCache: Object.create(null),
      globalPeakFlow: 1,
      showFrictionMesh: true,
      updateLayers: () => {},
    };

    await computeDesirePaths(ctx, ctx);

    // Self-targeting origin should not produce paths (no reachable destinations)
    // but should not crash
    expect(ctx.globalPeakFlow).toBeDefined();
  });

  it('must handle context without _frictionObj (falls back to cellFrictionMap)', async () => {
    const pathCells = buildLinearPath(40.4169, -3.7035, 5);
    const frictionMap = new Map();
    for (const cell of pathCells) {
      frictionMap.set(cell, FRICTION_COSTS.PAVEMENT);
    }
    // Don't set _frictionObj
    const ctx = {
      cellFrictionMap: frictionMap,
      // _frictionObj is NOT set
      simulationNodes: {
        [pathCells[0]]: { type: 'origin', weight: 1 },
        [pathCells[pathCells.length - 1]]: { type: 'destination', weight: 1 },
      },
      pathDesireScores: new Map(),
      affordanceMap: new Map(),
      _affordanceObj: Object.create(null),
      _cellState: Object.create(null),
      _gradientCache: Object.create(null),
      globalPeakFlow: 1,
      showFrictionMesh: true,
      updateLayers: () => {},
    };

    await computeDesirePaths(ctx, ctx);

    expect(Object.keys(ctx.pathDesireScores).length).toBeGreaterThan(0);
  });

  it('must handle pathDesireScores as plain object', async () => {
    const pathCells = buildLinearPath(40.4169, -3.7035, 5);
    const frictionObj = Object.create(null);
    for (const cell of pathCells) {
      frictionObj[cell] = FRICTION_COSTS.PAVEMENT;
    }
    const ctx = {
      cellFrictionMap: new Map(Object.entries(frictionObj)),
      _frictionObj: frictionObj,
      simulationNodes: {
        [pathCells[0]]: { type: 'origin', weight: 1 },
        [pathCells[pathCells.length - 1]]: { type: 'destination', weight: 1 },
      },
      pathDesireScores: Object.create(null), // Plain object, not Map
      affordanceMap: new Map(),
      _affordanceObj: Object.create(null),
      _cellState: Object.create(null),
      _gradientCache: Object.create(null),
      globalPeakFlow: 1,
      showFrictionMesh: true,
      updateLayers: () => {},
    };

    await computeDesirePaths(ctx, ctx);

    // Should work with plain object pathDesireScores
    expect(Object.keys(ctx.pathDesireScores).length).toBeGreaterThan(0);
  });

  it('should increase affordance on traversed non-pavement cells', async () => {
    const pathCells = buildLinearPath(40.4169, -3.7035, 5);
    const ctx = buildContext(pathCells);
    for (const cell of pathCells) {
      ctx._frictionObj[cell] = FRICTION_COSTS.LIGHT_PARK;
      ctx.cellFrictionMap.set(cell, FRICTION_COSTS.LIGHT_PARK);
      ctx._affordanceObj[cell] = AFFORDANCE.LIGHT_PARK;
      // affordanceMap is the canonical source: computeDesirePaths seeds the live
      // `_affordanceObj` working copy from it at sim start (B).
      ctx.affordanceMap.set(cell, AFFORDANCE.LIGHT_PARK);
    }

    const originCell = pathCells[0];
    const before = ctx.affordanceMap.get(originCell);

    await computeDesirePaths(ctx, ctx);

    const after = ctx._cellState?.[originCell]?.affordance ?? ctx.affordanceMap.get(originCell);
    expect(after).toBeGreaterThan(before);
  });
});
