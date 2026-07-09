import { describe, it, expect, vi } from 'vitest';

// Deterministic selection (no temperature sampling) so the two kernels are
// directly comparable step-for-step.
await vi.mock('../src/helpers/constants.js', async () => {
  const actual = await vi.importActual('../src/helpers/constants.js');
  return { ...actual, TEMPERATURE: 0 };
});

import { latLngToCell, gridDisk, gridDistance } from 'h3-js';
import { runAgentPath, estimateMaxTicks } from '../src/helpers/agentTasks.js';
import { _runSingleAgentPath } from '../src/helpers/compute.js';
import { SIMULATION_PARAMS, FRICTION_COSTS } from '../src/helpers/constants.js';

// Win D parity guard: the incremental-API kernel (`runSingleAgentPath`,
// compute.js) and the batch/worker kernel (`runAgentPath`, agentTasks.js) share
// the obstacle-avoidance geometry (`resolveStepLine`, agentStep.js) and the
// candidate-scoring core (agentStep.js). This test asserts they still produce
// byte-identical agent paths on the same deterministic scenario, so the two
// kernels cannot silently drift apart.
describe('incremental kernel parity (deterministic)', () => {
  function buildScenario(res = 15) {
    // A compact AOI with a clear origin -> dest corridor. A pure distance
    // gradient (grad[cell] = gridDistance(cell, dest)) guides the walk.
    const center = latLngToCell(40.4169, -3.7035, res);
    const aoi = gridDisk(center, 4);
    const dest = center;
    // Pick an origin a few rings away so the agent takes several steps.
    let origin = center;
    let bestDist = -1;
    for (const c of aoi) {
      const d = gridDistance(c, dest);
      if (d > bestDist) {
        bestDist = d;
        origin = c;
      }
    }

    const frictionObj = Object.create(null);
    const affordanceObj = Object.create(null);
    const cellFrictionMap = new Map();
    const grad = Object.create(null);
    for (const c of aoi) {
      frictionObj[c] = 1;
      affordanceObj[c] = 0.1;
      cellFrictionMap.set(c, 1);
      grad[c] = gridDistance(c, dest);
    }

    return { origin, dest, frictionObj, affordanceObj, cellFrictionMap, grad, hexCount: aoi.length };
  }

  it('runSingleAgentPath matches runAgentPath on an open corridor', () => {
    const { origin, dest, frictionObj, affordanceObj, cellFrictionMap, grad, hexCount } =
      buildScenario();

    const simulationParams = { ...SIMULATION_PARAMS, temperature: 0 };
    const maxTicks = estimateMaxTicks(origin, dest, hexCount);
    const simAgentId = `${origin}:${dest}:0`;

    // Incremental kernel (main-thread, ctx-based).
    const ctx = {
      cellFrictionMap,
      _frictionObj: frictionObj,
      _affordanceObj: affordanceObj,
      _cellState: null,
      simulationParams,
    };
    const incrementalPath = _runSingleAgentPath(ctx, {
      originCell: origin,
      destCell: dest,
      destGradientObj: grad,
      maxTicks,
      simAgentId,
    });

    // Batch/worker kernel (explicit params). null visibility/neighborDisks/
    // bearingMap/graph exercise the same LOS/gridDisk/trig fallbacks the ctx
    // kernel uses, so the two must agree.
    const batchPath = runAgentPath(
      origin,
      dest,
      grad,
      maxTicks,
      simAgentId,
      null, // pathDesireMap
      frictionObj,
      affordanceObj,
      null, // cellState
      null, // visibilityMap
      null, // accumulatedFootprints
      null, // bearingMap
      null, // originDestDistances
      simulationParams,
      undefined, // graph
      null // nodeSet
    );

    expect(incrementalPath.length).toBeGreaterThan(1);
    expect(incrementalPath[0]).toBe(origin);
    expect(incrementalPath[incrementalPath.length - 1]).toBe(dest);
    expect(incrementalPath).toEqual(batchPath);
  });

  it('runSingleAgentPath matches runAgentPath when an obstacle forces a detour', () => {
    const { origin, dest, frictionObj, affordanceObj, cellFrictionMap, grad, hexCount } =
      buildScenario();

    // Make the ring one step out from the destination mostly impassable,
    // leaving a single gap. The distance gradient still points straight at the
    // destination, so the agent must rely on the shared obstacle-avoidance
    // geometry (resolveStepLine BFS detour) to route through the gap.
    const ring = gridDisk(dest, 1).filter((c) => c !== dest);
    const gap = ring[0];
    for (const c of ring) {
      if (c === gap) continue;
      frictionObj[c] = FRICTION_COSTS.IMPASSABLE;
      cellFrictionMap.set(c, FRICTION_COSTS.IMPASSABLE);
    }

    const simulationParams = { ...SIMULATION_PARAMS, temperature: 0 };
    const maxTicks = estimateMaxTicks(origin, dest, hexCount);
    const simAgentId = `${origin}:${dest}:0`;

    const ctx = {
      cellFrictionMap,
      _frictionObj: frictionObj,
      _affordanceObj: affordanceObj,
      _cellState: null,
      simulationParams,
    };
    const incrementalPath = _runSingleAgentPath(ctx, {
      originCell: origin,
      destCell: dest,
      destGradientObj: grad,
      maxTicks,
      simAgentId,
    });

    const batchPath = runAgentPath(
      origin,
      dest,
      grad,
      maxTicks,
      simAgentId,
      null,
      frictionObj,
      affordanceObj,
      null,
      null,
      null,
      null,
      null,
      simulationParams,
      undefined,
      null
    );

    expect(incrementalPath).toEqual(batchPath);
  });
});
