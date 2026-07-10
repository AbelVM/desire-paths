import { describe, it, expect, vi } from 'vitest';

// Ensure deterministic sampling in modules that import constants
await vi.mock('../src/helpers/constants.js', async () => {
  const actual = await vi.importActual('../src/helpers/constants.js');
  return { ...actual, TEMPERATURE: 0 };
});

import { computeAgentBatch, runAgentPath, estimateMaxTicks } from '../src/helpers/agentTasks.js';
import { normalizeFrictionEntries } from '../src/helpers/spatialTasks.js';
import { latLngToCell, gridDisk } from 'h3-js';

describe('agent batch parity (deterministic)', () => {
  it('computeAgentBatch matches runAgentPath baseline when TEMPERATURE=0', () => {
    const origin = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(origin, 1);
    const dest = neighbors.find((n) => n !== origin) || origin;

    const frictionEntries = {};
    frictionEntries[origin] = 1;
    frictionEntries[dest] = 1;

    const affordanceEntries = {};
    affordanceEntries[origin] = 0.1;
    affordanceEntries[dest] = 0.1;

    const gradients = {};
    const grad = {};
    grad[dest] = 0;
    grad[origin] = 1;
    gradients[dest] = grad;

    const plan = [{ originCell: origin, totalVolume: 2, destCandidates: [{ dest }], assigned: [2] }];
    const hexCount = 2;

    const { result } = computeAgentBatch({ plan, frictionEntries, gradients, affordanceEntries, hexCount });

    const workerPathDesire = Object.create(null);
    if (result.pathDesire && result.pathDesire.__flat) {
      const keys = result.pathDesire.keys;
      const vals = result.pathDesire.vals;
      for (let i = 0; i < keys.length; i++) workerPathDesire[keys[i]] = vals[i];
    } else Object.assign(workerPathDesire, result.pathDesire || {});

    const workerPerTarget = Object.create(null);
    for (const d in result.perTargetContribs) {
      // skip metadata keys added for flattening/transfer
      if (d.startsWith('__')) continue;
      const entry = result.perTargetContribs[d];
      if (entry && entry.__flat) {
        const keys = entry.keys;
        const vals = entry.vals;
        workerPerTarget[d] = Object.create(null);
        for (let i = 0; i < keys.length; i++) workerPerTarget[d][keys[i]] = vals[i];
      } else {
        workerPerTarget[d] = entry || Object.create(null);
      }
    }

    const frictionLookup = normalizeFrictionEntries(frictionEntries);
    const affordanceLookup = normalizeFrictionEntries(affordanceEntries);
    const baselinePath = Object.create(null);
    const baselinePerTarget = Object.create(null);

    for (let p = 0; p < plan.length; p++) {
      const entry = plan[p];
      const originCell = entry.originCell;
      const destCandidates = entry.destCandidates || [];
      const assigned = entry.assigned || [];

      for (let idx = 0; idx < destCandidates.length; idx++) {
        const destCell = destCandidates[idx].dest;
        const count = assigned[idx] || 0;
        if (count <= 0) continue;
        const destGradient = gradients[destCell];
        if (!destGradient) continue;
        if (!baselinePerTarget[destCell]) baselinePerTarget[destCell] = Object.create(null);
        const maxTicks = estimateMaxTicks(originCell, destCell, hexCount);
        for (let sim = 0; sim < count; sim++) {
          const simAgentId = `${originCell}:${destCell}:${sim}`;
          // G (review11 §G): drive the baseline through the same inline
          // accumulators the worker uses, so the parity assertion is unchanged.
          runAgentPath(
            originCell,
            destCell,
            destGradient,
            maxTicks,
            simAgentId,
            baselinePath,
            frictionLookup,
            affordanceLookup,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            baselinePerTarget[destCell],
            null,
            false
          );
        }
      }
    }

    const baselinePathObj = Object.create(null);
    for (const k in baselinePath) baselinePathObj[k] = baselinePath[k];

    expect(workerPathDesire).toEqual(baselinePathObj);
    expect(workerPerTarget).toEqual(baselinePerTarget);
  });
});
