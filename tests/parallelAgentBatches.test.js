import { describe, it, expect } from 'vitest';
import { computeAgentBatch } from '../src/helpers/agentTasks.js';
import { normalizeFrictionEntries } from '../src/helpers/spatialTasks.js';
import { getGradientGraph } from '../src/helpers/dijkstra.js';
import {
  mergeAgentResults,
  shardPlanForAgents,
  runAgentBatches,
  splitPlanIntoWaves,
  computeWaveCount,
} from '../src/helpers/spatialWorker.js';
import { latLngToCell, gridDisk, gridDistance } from 'h3-js';

// Build a small but non-trivial plan: one origin, three destinations, several
// agents each, over a radius-2 disk of walkable cells.
function buildFixture() {
  const origin = latLngToCell(40.4169, -3.7035, 15);
  const disk = gridDisk(origin, 2);
  const frictionEntries = {};
  const affordanceEntries = {};
  for (const c of disk) {
    frictionEntries[c] = 1;
    affordanceEntries[c] = 0.1;
  }
  const dests = disk.filter((c) => c !== origin).slice(0, 3);
  const gradients = {};
  for (const d of dests) {
    const grad = {};
    for (const c of disk) grad[c] = gridDistance(c, d);
    gradients[d] = grad;
  }
  const plan = [
    {
      originCell: origin,
      destCandidates: dests.map((d) => ({ dest: d })),
      assigned: dests.map(() => 3),
    },
  ];
  return { origin, dests, frictionEntries, affordanceEntries, gradients, plan, hexCount: disk.length };
}

function normalizeResult(result) {
  const pathDesire = Object.create(null);
  if (result.pathDesire && result.pathDesire.__flat) {
    const { keys, vals } = result.pathDesire;
    for (let i = 0; i < keys.length; i++) pathDesire[keys[i]] = vals[i];
  } else if (result.pathDesire) {
    Object.assign(pathDesire, result.pathDesire);
  }
  const perTargetContribs = Object.create(null);
  for (const d in result.perTargetContribs) {
    if (d.startsWith('__')) continue;
    const entry = result.perTargetContribs[d];
    if (entry && entry.__flat) {
      const { keys, vals } = entry;
      perTargetContribs[d] = Object.create(null);
      for (let i = 0; i < keys.length; i++) perTargetContribs[d][keys[i]] = vals[i];
    } else if (entry) {
      perTargetContribs[d] = entry;
    }
  }
  return { pathDesire, perTargetContribs };
}

describe('P1 SAB atomic shared-footprint parallelism', () => {
  it('SAB shared-footprint path is byte-identical to the local path for one batch', () => {
    const fx = buildFixture();
    const base = normalizeResult(computeAgentBatch({ ...fx }).result);

    const graph = getGradientGraph(normalizeFrictionEntries(fx.frictionEntries), null, null);
    const shared = new Int32Array(new SharedArrayBuffer(graph.V * 4));
    const sabResult = normalizeResult(
      computeAgentBatch({ ...fx, options: { footprintBuffer: shared } }).result
    );

    expect(sabResult.pathDesire).toEqual(base.pathDesire);
    expect(sabResult.perTargetContribs).toEqual(base.perTargetContribs);
  });

  it('shared SAB footprint accumulates across batches (simulated workers)', () => {
    const fx = buildFixture();
    const graph = getGradientGraph(normalizeFrictionEntries(fx.frictionEntries), null, null);
    // affordanceWeight=0 makes the path independent of accumulated wear, so two
    // identical runs into the same buffer double every cell's footprint count.
    const opts = { simulationParams: { temperature: 0, affordanceWeight: 0 } };

    const shared = new Int32Array(new SharedArrayBuffer(graph.V * 4));
    const r1 = normalizeResult(
      computeAgentBatch({ ...fx, options: { ...opts, footprintBuffer: shared } }).result
    );
    const visits1 = Object.values(r1.pathDesire).reduce((a, b) => a + b, 0);
    let sum1 = 0;
    for (let i = 0; i < graph.V; i++) sum1 += shared[i];
    expect(sum1).toBe(visits1);

    // Second "worker" into the SAME buffer.
    computeAgentBatch({ ...fx, options: { ...opts, footprintBuffer: shared } });
    let sum2 = 0;
    for (let i = 0; i < graph.V; i++) sum2 += shared[i];
    expect(sum2).toBe(visits1 * 2);
  });

  it('mergeAgentResults sums pathDesire and perTargetContribs across shards', () => {
    const a = {
      pathDesire: { x: 1, y: 2 },
      perTargetContribs: { d1: { x: 1, y: 1 } },
      processed: 3,
      total: 3,
    };
    const b = {
      pathDesire: { y: 3, z: 4 },
      perTargetContribs: { d1: { y: 2 }, d2: { z: 4 } },
      processed: 5,
      total: 5,
    };
    const merged = mergeAgentResults([a, b]);
    expect(merged.pathDesire).toEqual({ x: 1, y: 5, z: 4 });
    expect(merged.perTargetContribs).toEqual({ d1: { x: 1, y: 3 }, d2: { z: 4 } });
    expect(merged.processed).toBe(8);
    expect(merged.total).toBe(8);
  });

  it('shardPlanForAgents splits the plan into contiguous chunks', () => {
    const plan = [1, 2, 3, 4, 5].map((n) => ({ id: n }));
    const chunks = shardPlanForAgents(plan, 2);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length + chunks[1].length).toBe(5);
    expect(chunks[0][0].id).toBe(1);
    expect(chunks[1][chunks[1].length - 1].id).toBe(5);
  });

  it('runAgentBatches with parallelAgentBatches flag is a safe no-op in Node (no Worker)', async () => {
    const fx = buildFixture();
    const result = await runAgentBatches(fx.plan, fx.frictionEntries, fx.gradients, fx.affordanceEntries, fx.hexCount, {
      parallelAgentBatches: true,
      simulationParams: { temperature: 0 },
    });
    expect(result.pathDesire).toBeTruthy();
    expect(Object.keys(result.pathDesire).length).toBeGreaterThan(0);

    const baseline = await runAgentBatches(
      fx.plan,
      fx.frictionEntries,
      fx.gradients,
      fx.affordanceEntries,
      fx.hexCount,
      { simulationParams: { temperature: 0 } }
    );
    expect(result.pathDesire).toEqual(baseline.pathDesire);
    expect(result.perTargetContribs).toEqual(baseline.perTargetContribs);
  });

  it('a persistent footprintBuffer is reused across waves (wave n+1 sees 0..n)', async () => {
    const fx = buildFixture();
    // affordanceWeight=0 so a wave's path is independent of accumulated wear,
    // letting us assert exact 2x accumulation across two waves into one buffer.
    const opts = { simulationParams: { temperature: 0, affordanceWeight: 0 } };
    const graph = getGradientGraph(normalizeFrictionEntries(fx.frictionEntries), null, null);
    const buffer = new Uint32Array(graph.V); // plain (non-SAB) buffer, as Node/SSR would use

    const wave0 = await runAgentBatches(
      fx.plan, fx.frictionEntries, fx.gradients, fx.affordanceEntries, fx.hexCount,
      { ...opts, footprintBuffer: buffer }
    );
    const visits0 = Object.values(wave0.pathDesire).reduce((a, b) => a + b, 0);
    let sum0 = 0;
    for (let i = 0; i < graph.V; i++) sum0 += buffer[i];
    expect(sum0).toBe(visits0);

    // Wave 1 reuses the SAME buffer (as state._footprintBuffer would across calls).
    const wave1 = await runAgentBatches(
      fx.plan, fx.frictionEntries, fx.gradients, fx.affordanceEntries, fx.hexCount,
      { ...opts, footprintBuffer: buffer }
    );
    let sum1 = 0;
    for (let i = 0; i < graph.V; i++) sum1 += buffer[i];
    expect(sum1).toBe(visits0 * 2);

    // And the per-wave pathDesire is identical (wear-independent at w_a=0), while
    // the shared buffer proves the cross-wave accumulation happened.
    expect(wave1.pathDesire).toEqual(wave0.pathDesire);
  });

  it('splitPlanIntoWaves puts every origin/dual node in every wave', () => {
    const origins = ['A', 'B', 'C', 'D'];
    const dests = ['x', 'y', 'z'];
    const plan = origins.map((o) => ({
      originCell: o,
      totalVolume: 12,
      destCandidates: dests.map((d) => ({ dest: d })),
      assigned: dests.map(() => 4),
    }));

    const waves = splitPlanIntoWaves(plan, 3);
    expect(waves.length).toBe(3);

    for (const wave of waves) {
      // Every wave contains every origin.
      const waveOrigins = wave.map((e) => e.originCell).sort();
      expect(waveOrigins).toEqual(origins.slice().sort());
      // Each wave entry keeps the same destination candidates.
      for (const e of wave) {
        expect(e.destCandidates.map((d) => d.dest)).toEqual(dests);
      }
    }

    // Agent counts are preserved: sum of each origin's assigned across waves
    // equals the original, and each wave's totalVolume equals its assigned sum.
    for (let oi = 0; oi < origins.length; oi++) {
      let acrossWaves = 0;
      for (const wave of waves) {
        const e = wave[oi];
        const sum = e.assigned.reduce((a, b) => a + b, 0);
        expect(e.totalVolume).toBe(sum);
        acrossWaves += sum;
      }
      expect(acrossWaves).toBe(12);
    }
  });

  it('computeWaveCount derives K from origin count and agentsPerWeightUnit', () => {
    const plan = Array.from({ length: 8 }, (_, i) => ({ originCell: `o${i}` }));
    // Default agentsPerWeightUnit (100) with 8 origins -> more than 1 wave.
    const kDefault = computeWaveCount(plan, {});
    expect(kDefault).toBeGreaterThan(1);
    expect(kDefault).toBeLessThanOrEqual(16);

    // A single origin collapses to a single wave (no ordering needed).
    expect(computeWaveCount([{ originCell: 'only' }], {})).toBe(1);

    // Higher agentsPerWeightUnit (denser) yields more (finer) waves.
    const kDense = computeWaveCount(plan, {
      simulationParams: { agentsPerWeightUnit: 400 },
    });
    expect(kDense).toBeGreaterThanOrEqual(kDefault);

    // Lower agentsPerWeightUnit (sparser) yields fewer waves.
    const kSparse = computeWaveCount(plan, {
      simulationParams: { agentsPerWeightUnit: 25 },
    });
    expect(kSparse).toBeLessThanOrEqual(kDefault);
  });
});
