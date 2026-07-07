import { describe, it, expect } from 'vitest';
import { latLngToCell, gridDisk } from 'h3-js';
import {
  buildCellRegistry,
  SharedScalarField,
  SharedCounterField,
  buildSharedNeighborField,
  buildGradientSABs,
  computeAgentBatchSAB,
} from '../src/helpers/sharedFields.js';
import { runAgentPath, estimateMaxTicks } from '../src/helpers/agentTasks.js';
import { computeDijkstra } from '../src/helpers/dijkstra.js';
import { precomputeVisibilitySets, precomputeBearingMap } from '../src/helpers/compute.js';

// Validate the SAB-backed agent kernel produces the same ABM paths as the
// plain-object kernel (runAgentPath) when no shared footprints are used.
describe('SAB agent kernel parity', () => {
  it('computeAgentBatchSAB matches runAgentPath baseline (TEMPERATURE=0)', () => {
    const origin = latLngToCell(40.4169, -3.7035, 15);
    const neighbors = gridDisk(origin, 1);
    const dest = neighbors.find((n) => n !== origin) || origin;

    const cells = Array.from(new Set([origin, dest, ...neighbors]));

    const frictionLookup = Object.create(null);
    const affordanceLookup = Object.create(null);
    for (const c of cells) {
      frictionLookup[c] = 1;
      affordanceLookup[c] = 0.1;
    }

    const visionDepth = 1;
    const visibilityData = precomputeVisibilitySets(frictionLookup, cells, visionDepth);
    const bearingMap = precomputeBearingMap(cells, visibilityData, frictionLookup);

    const registry = buildCellRegistry(cells);
    const friction = SharedScalarField.fromLookup(registry, frictionLookup);
    const affordance = SharedScalarField.fromLookup(registry, affordanceLookup, 0.1);
    const neighborsField = buildSharedNeighborField(
      registry,
      frictionLookup,
      visibilityData,
      bearingMap,
      visionDepth
    );

    const grad = computeDijkstra(dest, frictionLookup, (c) => gridDisk(c, 1));
    const gradientSABs = buildGradientSABs({ [dest]: grad }, registry);
    const gradients = Object.create(null);
    for (const [k, v] of gradientSABs) gradients[k] = v;

    const flow = new SharedCounterField(registry);
    const simParams = {
      affordanceWeight: 1,
      distancePenalty: 4,
      visionDepth,
      fieldOfView: 360,
      temperature: 0,
      emergentWear: true,
    };

    const originIdx = registry.idx(origin);
    const destIdx = registry.idx(dest);
    const maxTicks = estimateMaxTicks(origin, dest, cells.length);

    const { result } = computeAgentBatchSAB({
      planIdx: [
        {
          originIdx,
          destCandidates: [{ destIdx, maxTicks }],
          assigned: [2],
        },
      ],
      frictionArr: friction.raw,
      affordanceArr: affordance.raw,
      neighborField: neighborsField,
      gradients,
      footprints: null, // no ABM feedback -> matches plain baseline
      flow: flow.raw,
      odDistances: null,
      simulationParams: simParams,
      idxToCell: registry.cells,
      visionDepth,
      registry: { count: registry.count },
    });

    const sabPathDesire = flow.toPlainObject();

    const sabPerTarget = Object.create(null);
    for (const d in result.perTargetContribs) {
      const destCell = registry.cell(Number(d));
      sabPerTarget[destCell] = Object.create(null);
      const entry = result.perTargetContribs[d];
      for (let i = 0; i < entry.keys.length; i++) {
        sabPerTarget[destCell][registry.cell(entry.keys[i])] = entry.vals[i];
      }
    }

    // Plain baseline
    const baselinePath = new Map();
    const baselinePerTarget = Object.create(null);
    baselinePerTarget[dest] = Object.create(null);
    for (let sim = 0; sim < 2; sim++) {
      const simAgentId = `${origin}:${dest}:${sim}`;
      const simPath = runAgentPath(
        origin,
        dest,
        grad,
        maxTicks,
        simAgentId,
        baselinePath,
        frictionLookup,
        affordanceLookup,
        null,
        undefined,
        null,
        null,
        undefined,
        null,
        simParams
      );
      for (let k = 0; k < simPath.length; k++) {
        const cell = simPath[k];
        baselinePerTarget[dest][cell] = (baselinePerTarget[dest][cell] || 0) + 1;
      }
    }

    const baselinePathObj = Object.create(null);
    for (const [k, v] of baselinePath) baselinePathObj[k] = v;

    expect(sabPathDesire).toEqual(baselinePathObj);
    expect(sabPerTarget).toEqual(baselinePerTarget);
  });
});
