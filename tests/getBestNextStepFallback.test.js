import { describe, it, expect } from 'vitest';
import { getBestNextStep, runAgentPath } from '../src/helpers/agentTasks.js';
import { SIMULATION_PARAMS, FRICTION_COSTS } from '../src/helpers/constants.js';
import { latLngToCell, gridDisk } from 'h3-js';

// Regression tests for review12 finding #2: the getBestNextStep() depth-1..3
// fallback (triggered when the visible candidate cone is empty but gridDisk
// still finds a passable neighbor "behind a wall") must return the chosen CELL
// id, not a bearing number. The buggy code returned getBearingFast(...) (a
// number), which runAgentPath then fed into _resolveStepLine -> gridPathCells
// and crashed.

describe('getBestNextStep behind-wall fallback (review12 #2)', () => {
  it('returns the chosen cell id, not a bearing, when only passable neighbors are behind a wall', () => {
    const origin = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(origin, 1).filter((c) => c !== origin);
    // Exactly one passable neighbor; wall off the rest.
    const passableN = neighbors[0];

    const frictionLookup = { [origin]: 1 };
    for (const n of neighbors) {
      frictionLookup[n] = n === passableN ? 1 : FRICTION_COSTS.IMPASSABLE;
    }

    // Gradient: the passable neighbor is the lowest-cost step toward the goal.
    const gradient = { [origin]: 10, [passableN]: 0 };

    // Empty visible set for the origin => no visible candidates gathered =>
    // getBestNextStep falls into the depth-1..3 gridDisk fallback.
    const visibilityMap = { [origin]: {} };

    const next = getBestNextStep(
      origin,
      gradient,
      0,
      'agent-fallback',
      SIMULATION_PARAMS,
      frictionLookup,
      null,
      visibilityMap,
      null,
      null,
      null
    );

    // Regression guard: the fallback must return the chosen cell (a string),
    // NOT a bearing number. The buggy code returned getBearingFast(...) (a
    // number), which then crashed runAgentPath's _resolveStepLine/gridPathCells.
    expect(typeof next).toBe('string');
    expect(next).toBe(passableN);
  });

  it('runAgentPath does not crash when the first step is a behind-wall fallback cell', () => {
    const origin = latLngToCell(40.4169, -3.7035, 15);
    const n1 = gridDisk(origin, 1).filter((c) => c !== origin);
    const passableN = n1[0];

    const n2 = gridDisk(passableN, 1).filter((c) => c !== passableN && c !== origin);
    const destN = n2[0];

    const frictionLookup = { [origin]: 1, [passableN]: 1, [destN]: 1 };
    // Wall off every other neighbor of origin and passableN.
    for (const c of n1) if (c !== passableN) frictionLookup[c] = FRICTION_COSTS.IMPASSABLE;
    for (const c of n2) if (c !== destN) frictionLookup[c] = FRICTION_COSTS.IMPASSABLE;

    const gradient = { [origin]: 2, [passableN]: 1, [destN]: 0 };

    // Empty visible sets => getBestNextStep uses the gridDisk fallback at every step.
    const visibilityMap = { [origin]: {}, [passableN]: {} };

    const pathDesireMap = Object.create(null);

    // On the buggy code getBestNextStep returns a bearing number, which
    // _resolveStepLine -> gridPathCells rejects (throws). The fix returns the
    // cell, so the walk completes.
    expect(() =>
      runAgentPath(
        origin,
        destN,
        gradient,
        20,
        'agent-e2e',
        pathDesireMap,
        frictionLookup,
        null,
        visibilityMap,
        null,
        null,
        null,
        SIMULATION_PARAMS,
        null,
        null,
        null,
        null,
        false
      )
    ).not.toThrow();

    // The agent must have traversed origin -> passableN -> destN.
    expect(pathDesireMap[origin]).toBeGreaterThan(0);
    expect(pathDesireMap[passableN]).toBeGreaterThan(0);
    expect(pathDesireMap[destN]).toBeGreaterThan(0);
  });
});
