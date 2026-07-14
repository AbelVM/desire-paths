import { describe, it, expect, vi, beforeEach } from 'vitest';
import { latLngToCell } from 'h3-js';
import { SIMULATION_PARAMS } from '../src/helpers/constants.js';
import { PowerCache } from 'performance-helpers/powerCache';

// Minimal spatial-worker mock: only the tasks computeDesirePaths touches, made
// spyable so we can assert how often the (dominant-cost) visibility CSR rebuild
// runs. The real worker compute is irrelevant to the caching assertion.
vi.mock('../src/helpers/spatialWorker.js', () => ({
  runGradientBatches: vi.fn(async (targets) => {
    const r = Object.create(null);
    for (const t of targets) r[t] = Object.create(null);
    return r;
  }),
  runAgentBatches: vi.fn(async () => ({
    pathDesire: Object.create(null),
    perTargetContribs: Object.create(null),
    processed: 0,
    total: 0,
  })),
  runBuildMappingGraph: vi.fn(async (_frictionSource, viewHexes) => {
    const N = viewHexes ? viewHexes.length : 0;
    return {
      N,
      adjOffsets: new Int32Array(N + 1),
      adjNeighbors: new Int32Array(0),
      frictionArr: new Float32Array(N),
      latLngArr: new Float32Array(N * 4),
    };
  }),
  runVisibilityBearingTask: vi.fn(async () => ({
    buffer: new ArrayBuffer(16),
    N: 3,
    P: 0,
    offsetsBytes: 16,
    neighborsBytes: 0,
  })),
  setSpatialWorkerProgressHandler: vi.fn(),
  clearSpatialWorkerProgressHandler: vi.fn(),
}));

// compute.js imports estimateMaxTicks from agentTasks.js; avoid pulling the
// heavy agent kernel into this unit test.
vi.mock('../src/helpers/agentTasks.js', () => ({
  estimateMaxTicks: () => 100,
}));

import { computeDesirePaths } from '../src/helpers/compute.js';
import { runVisibilityBearingTask, runBuildMappingGraph } from '../src/helpers/spatialWorker.js';

const mockHexes = [
  latLngToCell(40.4169, -3.7035, 15),
  latLngToCell(40.417, -3.7034, 15),
  latLngToCell(40.4171, -3.7033, 15),
];

function makeState() {
  const origin = mockHexes[0];
  const dest = mockHexes[1];
  const state = {
    cellFrictionMap: new Map(mockHexes.map((h) => [h, 1])),
    affordanceMap: new Map(mockHexes.map((h) => [h, 0.1])),
    simulationNodes: {
      [origin]: { type: 'origin', weight: 1 },
      [dest]: { type: 'destination', weight: 1 },
    },
    _viewHexes: mockHexes,
    _mappingGeneration: 1,
    _r1Adjacency: null,
    surfaceEdits: new Map(),
    simulationParams: { visionDepth: SIMULATION_PARAMS.visionDepth, emergentWear: false },
    pathDesireScores: Object.create(null),
    globalPeakFlow: 1,
    _layerDataVersion: 0,
    showAlertCard: vi.fn(),
    updateLayers: vi.fn(),
    syncSimulationUI: vi.fn(),
  };
  // Pre-populate the gradient cache so runGradientBatches is skipped and the
  // plan validation passes (gradientGet reads the plain-object gradient).
  const cache = new PowerCache({ maxEntries: 16 });
  cache.set(dest, { [origin]: 1, [dest]: 0 });
  state._gradientCache = cache;
  return state;
}

describe('review12 #6 — visibility/bearing CSR cached across runs', () => {
  beforeEach(() => {
    runVisibilityBearingTask.mockClear();
    runBuildMappingGraph.mockClear();
  });

  it('retains the CSR after a run and reuses it on the next run (no rebuild)', async () => {
    const state = makeState();

    await computeDesirePaths(state, state);
    expect(runVisibilityBearingTask).toHaveBeenCalledTimes(1);
    expect(runBuildMappingGraph).toHaveBeenCalledTimes(1);
    const csr1 = state._visibilityBearingCSR;
    expect(csr1).not.toBeNull();
    expect(csr1.gen).toBe(1);
    expect(csr1.visionDepth).toBe(SIMULATION_PARAMS.visionDepth);

    // Second run with the same mappingGeneration + visionDepth must reuse the
    // cached CSR instead of rebuilding the mapping graph + visibility BFS.
    await computeDesirePaths(state, state);
    expect(runVisibilityBearingTask).toHaveBeenCalledTimes(1);
    expect(runBuildMappingGraph).toHaveBeenCalledTimes(1);
    expect(state._visibilityBearingCSR).toBe(csr1);
  });

  it('rebuilds the CSR when mappingGeneration changes (remap)', async () => {
    const state = makeState();

    await computeDesirePaths(state, state);
    expect(runVisibilityBearingTask).toHaveBeenCalledTimes(1);
    const csr1 = state._visibilityBearingCSR;

    // A remap bumps _mappingGeneration; the cached CSR is now stale and must be
    // rebuilt on the next run.
    state._mappingGeneration = 2;
    await computeDesirePaths(state, state);
    expect(runVisibilityBearingTask).toHaveBeenCalledTimes(2);
    expect(state._visibilityBearingCSR).not.toBe(csr1);
    expect(state._visibilityBearingCSR.gen).toBe(2);
  });

  it('rebuilds the CSR when visionDepth changes', async () => {
    const state = makeState();

    await computeDesirePaths(state, state);
    expect(runVisibilityBearingTask).toHaveBeenCalledTimes(1);
    const csr1 = state._visibilityBearingCSR;
    expect(csr1.visionDepth).toBe(SIMULATION_PARAMS.visionDepth);

    // Change the BFS radius and re-run: the cached CSR (built for the old
    // visionDepth) must be rebuilt.
    const newDepth = SIMULATION_PARAMS.visionDepth + 1;
    state.simulationParams.visionDepth = newDepth;
    try {
      await computeDesirePaths(state, state);
      expect(runVisibilityBearingTask).toHaveBeenCalledTimes(2);
      expect(state._visibilityBearingCSR).not.toBe(csr1);
      expect(state._visibilityBearingCSR.visionDepth).toBe(newDepth);
    } finally {
      state.simulationParams.visionDepth = SIMULATION_PARAMS.visionDepth; // restore
    }
  });

  it('drops the cached CSR when a surface edit changes friction topology', async () => {
    const state = makeState();
    await computeDesirePaths(state, state);
    expect(state._visibilityBearingCSR).not.toBeNull();

    // Import the real surface-edit invalidation path and confirm it clears the
    // cache so the next run rebuilds (review12 #6 correctness guard).
    const { clearSurfaceEditions } = await import('../src/helpers/grid.js');
    // Give the state a base snapshot so clearSurfaceEditions restores cleanly.
    state._baseDirty = new Map();
    for (let i = 0; i < mockHexes.length; i++) {
      state._baseDirty.set(mockHexes[i], { friction: 1, affordance: 0.1 });
    }
    state.cellToIdx = new Map(mockHexes.map((h, i) => [h, i]));
    clearSurfaceEditions(state);
    expect(state._visibilityBearingCSR).toBeNull();
  });
});
