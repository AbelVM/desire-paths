import { describe, it, expect } from 'vitest';
import { latLngToCell, gridDisk } from 'h3-js';
import {
  buildR1Adjacency,
  buildMappingGraph,
} from '../src/helpers/spatialTasks.js';
import { runVisibilityBearingTask } from '../src/helpers/spatialWorker.js';
import {
  getGradientGraph,
  computeDijkstra,
} from '../src/helpers/dijkstra.js';
import { computeAgentBatch } from '../src/helpers/agentTasks.js';
import { normalizeFrictionEntries } from '../src/helpers/spatialTasks.js';
import { FRICTION_COSTS } from '../src/helpers/constants.js';

// S1 parity: the index-space agent kernel (candidate enumeration from
// the visibility CSR, typed-array reads) must produce byte-identical
// path/per-target results to the string kernel (gridDisk + isVisible
// binary-search + bearing trig) when BOTH consume the same
// precomputed visibility CSR. The two kernels enumerate the same
// candidate set (the worker's `isVisible` already resolves to the
// CSR BFS-reachability Proxy), so only the enumeration order
// differs — which does not affect the max-score selection except
// on exact score ties. temperature=0 keeps selection deterministic.
describe('index-space agent kernel parity (S1)', () => {
  const center = latLngToCell(40.4169, -3.7035, 15);
  const viewHexes = gridDisk(center, 2); // 19 cells
  const VISION_DEPTH = 2;

  // Build a friction map with a couple of impassable "buildings" so
  // visibility (BFS reachability) is non-trivial.
  const impassable = new Set([viewHexes[3], viewHexes[10]]);

  const frictionEntries = Object.create(null);
  const affordanceEntries = Object.create(null);
  for (const c of viewHexes) {
    frictionEntries[c] = impassable.has(c)
      ? FRICTION_COSTS.IMPASSABLE
      : FRICTION_COSTS.PAVEMENT;
    affordanceEntries[c] = 0.1;
  }

  const r1 = buildR1Adjacency({ viewHexes });
  const graph = buildMappingGraph({ frictionEntries, viewHexes, r1Adjacency: r1 });

  const frictionLookup = normalizeFrictionEntries(frictionEntries);
  const gradGraph = getGradientGraph(frictionLookup, r1, viewHexes);

  // Two destinations + two origins among the passable cells.
  const passable = viewHexes.filter((c) => !impassable.has(c));
  const destA = passable[0];
  const destB = passable[passable.length - 1];
  const originA = passable[Math.floor(passable.length / 3)];
  const originB = passable[Math.floor((2 * passable.length) / 3)];

  const gradients = Object.create(null);
  gradients[destA] = computeDijkstra(destA, frictionLookup, gradGraph);
  gradients[destB] = computeDijkstra(destB, frictionLookup, gradGraph);

  const plan = [
    {
      originCell: originA,
      totalVolume: 3,
      destCandidates: [{ dest: destA }, { dest: destB }],
      assigned: [2, 1],
    },
    {
      originCell: originB,
      totalVolume: 3,
      destCandidates: [{ dest: destA }, { dest: destB }],
      assigned: [1, 2],
    },
  ];

  const baseOpts = (useIndexed) => ({
    plan,
    frictionEntries,
    gradients,
    affordanceEntries,
    hexCount: viewHexes.length,
    viewHexes,
    r1Adjacency: r1,
    options: {
      simulationParams: { useIndexedKernel: useIndexed, temperature: 0 },
    },
  });

  it('produces identical pathDesire for string vs index kernels', async () => {
    const csr = await runVisibilityBearingTask(graph, viewHexes, VISION_DEPTH);

    const stringRes = computeAgentBatch({
      ...baseOpts(false),
      visibilityBearingCSR: csr,
    });
    const indexRes = computeAgentBatch({
      ...baseOpts(true),
      visibilityBearingCSR: csr,
    });

    const decode = (res) => {
      const pd = Object.create(null);
      if (res.result.pathDesire?.__flat) {
        const { keys, vals } = res.result.pathDesire;
        for (let i = 0; i < keys.length; i++) pd[keys[i]] = vals[i];
      } else if (res.result.pathDesire) {
        Object.assign(pd, res.result.pathDesire);
      }
      return pd;
    };

    const stringDecoded = decode(stringRes);
    // Guard against a vacuous pass (empty plan / no agents → 0 === 0).
    expect(Object.keys(stringDecoded).length).toBeGreaterThan(0);
    expect(decode(indexRes)).toEqual(stringDecoded);
  });

  it('produces identical perTargetContribs for string vs index kernels', async () => {
    const csr = await runVisibilityBearingTask(graph, viewHexes, VISION_DEPTH);

    const stringRes = computeAgentBatch({
      ...baseOpts(false),
      visibilityBearingCSR: csr,
    });
    const indexRes = computeAgentBatch({
      ...baseOpts(true),
      visibilityBearingCSR: csr,
    });

    const decode = (res) => {
      const out = Object.create(null);
      for (const d in res.result.perTargetContribs) {
        if (d.startsWith('__')) continue;
        const entry = res.result.perTargetContribs[d];
        const obj = Object.create(null);
        if (entry?.__flat) {
          const { keys, vals } = entry;
          for (let i = 0; i < keys.length; i++) obj[keys[i]] = vals[i];
        } else if (entry) {
          Object.assign(obj, entry);
        }
        out[d] = obj;
      }
      return out;
    };

    const stringDecoded = decode(stringRes);
    // Guard against a vacuous pass (empty plan / no agents → {} === {}).
    expect(Object.keys(stringDecoded).length).toBeGreaterThan(0);
    expect(decode(indexRes)).toEqual(stringDecoded);
  });
});

// A larger, path-heavy scenario (bigger AOI, deeper vision, multiple
// obstacle clusters, many origin/destination pairs) that forces
// getBestNextStep — and therefore the indexed candidate gather — to run
// on long, obstacle-avoiding routes. The candidate SET is byte-identical
// between the two kernels; the shared selectBestCandidate now breaks exact
// score ties by cell id (enumeration-order-independent), so full path
// parity holds even when the string kernel enumerates in gridDisk order
// and the index kernel in CSR-neighbor order. Also runs the index kernel
// FIRST to prove parity does not depend on the string kernel priming
// shared module state.
describe('index-space agent kernel parity — large scenario (S1)', () => {
  const center = latLngToCell(40.4169, -3.7035, 15);
  const viewHexes = gridDisk(center, 5); // 91 cells
  const VISION_DEPTH = 4;

  // Two obstacle clusters (rings around two off-center cells) so the
  // straight line from most origins to most destinations is blocked and
  // the agents must detour — exercising resolveStepLine + deep candidate
  // enumeration.
  const impassable = new Set();
  for (const c of gridDisk(viewHexes[12], 1)) impassable.add(c);
  for (const c of gridDisk(viewHexes[70], 1)) impassable.add(c);

  const frictionEntries = Object.create(null);
  const affordanceEntries = Object.create(null);
  for (const c of viewHexes) {
    frictionEntries[c] = impassable.has(c)
      ? FRICTION_COSTS.IMPASSABLE
      : FRICTION_COSTS.PAVEMENT;
    affordanceEntries[c] = 0.1;
  }

  const r1 = buildR1Adjacency({ viewHexes });
  const graph = buildMappingGraph({ frictionEntries, viewHexes, r1Adjacency: r1 });
  const frictionLookup = normalizeFrictionEntries(frictionEntries);
  const gradGraph = getGradientGraph(frictionLookup, r1, viewHexes);

  const passable = viewHexes.filter((c) => !impassable.has(c));
  const destA = passable[0];
  const destB = passable[passable.length - 1];
  const destC = passable[Math.floor(passable.length / 2)];

  const gradients = Object.create(null);
  gradients[destA] = computeDijkstra(destA, frictionLookup, gradGraph);
  gradients[destB] = computeDijkstra(destB, frictionLookup, gradGraph);
  gradients[destC] = computeDijkstra(destC, frictionLookup, gradGraph);

  // Spread several origins across the AOI, each fanning out to all three
  // destinations with a few agents apiece.
  const originIdxs = [5, 20, 40, 60, 85];
  const plan = originIdxs
    .map((i) => passable[i % passable.length])
    .map((originCell) => ({
      originCell,
      totalVolume: 9,
      destCandidates: [{ dest: destA }, { dest: destB }, { dest: destC }],
      assigned: [3, 3, 3],
    }));

  const baseOpts = (useIndexed) => ({
    plan,
    frictionEntries,
    gradients,
    affordanceEntries,
    hexCount: viewHexes.length,
    viewHexes,
    r1Adjacency: r1,
    options: {
      simulationParams: {
        useIndexedKernel: useIndexed,
        temperature: 0,
        visionDepth: VISION_DEPTH,
      },
    },
  });

  const decodePathDesire = (res) => {
    const pd = Object.create(null);
    if (res.result.pathDesire?.__flat) {
      const { keys, vals } = res.result.pathDesire;
      for (let i = 0; i < keys.length; i++) pd[keys[i]] = vals[i];
    } else if (res.result.pathDesire) {
      Object.assign(pd, res.result.pathDesire);
    }
    return pd;
  };

  const decodePerTarget = (res) => {
    const out = Object.create(null);
    for (const d in res.result.perTargetContribs) {
      if (d.startsWith('__')) continue;
      const entry = res.result.perTargetContribs[d];
      const obj = Object.create(null);
      if (entry?.__flat) {
        const { keys, vals } = entry;
        for (let i = 0; i < keys.length; i++) obj[keys[i]] = vals[i];
      } else if (entry) {
        Object.assign(obj, entry);
      }
      out[d] = obj;
    }
    return out;
  };

  it('index-first vs string produce identical pathDesire and perTargetContribs', async () => {
    const csr = await runVisibilityBearingTask(graph, viewHexes, VISION_DEPTH);

    // Deliberately run the INDEX kernel first so any dependence on the
    // string kernel priming module-level buffers would surface here.
    const indexRes = computeAgentBatch({
      ...baseOpts(true),
      visibilityBearingCSR: csr,
    });
    const stringRes = computeAgentBatch({
      ...baseOpts(false),
      visibilityBearingCSR: csr,
    });

    const idxPd = decodePathDesire(indexRes);
    const strPd = decodePathDesire(stringRes);

    // Sanity: the scenario must actually produce non-trivial paths, else
    // the parity assertion would be vacuous.
    expect(Object.keys(strPd).length).toBeGreaterThan(10);

    expect(idxPd).toEqual(strPd);
    expect(decodePerTarget(indexRes)).toEqual(decodePerTarget(stringRes));
  });
});

// temperature>0 distributional parity (S1). At temperature>0 the two
// kernels are NOT byte-identical: the softmax cumulative sampling walks
// candidates in enumeration order, so a given seeded RNG draw maps to a
// different specific cell (gridDisk order vs CSR order). But the candidate
// SET and per-candidate scores — hence the choice PROBABILITY DISTRIBUTION
// — are identical at every step, so the emergent aggregate is statistically
// equivalent. Everything here is seeded/deterministic, so these tolerance
// checks are stable across runs (they only move if the scenario changes).
describe('index-space agent kernel — temperature>0 distributional parity (S1)', () => {
  const center = latLngToCell(40.4169, -3.7035, 15);
  const viewHexes = gridDisk(center, 5);
  const VISION_DEPTH = 4;

  const impassable = new Set();
  for (const c of gridDisk(viewHexes[12], 1)) impassable.add(c);
  for (const c of gridDisk(viewHexes[70], 1)) impassable.add(c);

  const frictionEntries = Object.create(null);
  const affordanceEntries = Object.create(null);
  for (const c of viewHexes) {
    frictionEntries[c] = impassable.has(c)
      ? FRICTION_COSTS.IMPASSABLE
      : FRICTION_COSTS.PAVEMENT;
    affordanceEntries[c] = 0.1;
  }

  const r1 = buildR1Adjacency({ viewHexes });
  const graph = buildMappingGraph({ frictionEntries, viewHexes, r1Adjacency: r1 });
  const frictionLookup = normalizeFrictionEntries(frictionEntries);
  const gradGraph = getGradientGraph(frictionLookup, r1, viewHexes);

  const passable = viewHexes.filter((c) => !impassable.has(c));
  const destA = passable[0];
  const destB = passable[passable.length - 1];
  const destC = passable[Math.floor(passable.length / 2)];

  const gradients = Object.create(null);
  gradients[destA] = computeDijkstra(destA, frictionLookup, gradGraph);
  gradients[destB] = computeDijkstra(destB, frictionLookup, gradGraph);
  gradients[destC] = computeDijkstra(destC, frictionLookup, gradGraph);

  // Many agents per pair so the aggregate distribution is well-sampled.
  const N = 40;
  const plan = [5, 20, 40, 60, 85]
    .map((i) => passable[i % passable.length])
    .map((originCell) => ({
      originCell,
      totalVolume: 3 * N,
      destCandidates: [{ dest: destA }, { dest: destB }, { dest: destC }],
      assigned: [N, N, N],
    }));

  const baseOpts = (useIndexed) => ({
    plan,
    frictionEntries,
    gradients,
    affordanceEntries,
    hexCount: viewHexes.length,
    viewHexes,
    r1Adjacency: r1,
    options: {
      simulationParams: {
        useIndexedKernel: useIndexed,
        temperature: 0.5,
        visionDepth: VISION_DEPTH,
      },
    },
  });

  const decodePathDesire = (res) => {
    const pd = Object.create(null);
    const { keys, vals } = res.result.pathDesire;
    for (let i = 0; i < keys.length; i++) pd[keys[i]] = vals[i];
    return pd;
  };

  it('emergent aggregate is statistically equivalent at temperature=0.5', async () => {
    const csr = await runVisibilityBearingTask(graph, viewHexes, VISION_DEPTH);

    const stringRes = computeAgentBatch({ ...baseOpts(false), visibilityBearingCSR: csr });
    const indexRes = computeAgentBatch({ ...baseOpts(true), visibilityBearingCSR: csr });

    const strPd = decodePathDesire(stringRes);
    const idxPd = decodePathDesire(indexRes);

    const strKeys = Object.keys(strPd);
    const idxKeys = Object.keys(idxPd);

    // Non-trivial on both sides.
    expect(strKeys.length).toBeGreaterThan(30);
    expect(idxKeys.length).toBeGreaterThan(30);

    // Total traversals close (same number of agents, similar path lengths).
    let sumS = 0;
    let sumX = 0;
    const allKeys = new Set([...strKeys, ...idxKeys]);
    let absDiff = 0;
    for (const k of allKeys) {
      const a = strPd[k] || 0;
      const b = idxPd[k] || 0;
      sumS += a;
      sumX += b;
      absDiff += Math.abs(a - b);
    }
    expect(Math.abs(sumS - sumX) / sumS).toBeLessThan(0.05);

    // Aggregate per-cell distribution deviation is small.
    expect(absDiff / sumS).toBeLessThan(0.12);

    // High overlap of the visited-cell sets (Jaccard index).
    let shared = 0;
    for (const k of strKeys) if (idxPd[k] !== undefined) shared++;
    const jaccard = shared / allKeys.size;
    expect(jaccard).toBeGreaterThan(0.75);

    // They are deliberately NOT byte-identical at temperature>0; assert the
    // divergence exists so this test can't silently degrade into the
    // temperature=0 byte-parity case.
    expect(idxPd).not.toEqual(strPd);
  });
});
