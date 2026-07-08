import { describe, it, expect } from 'vitest';

import { computeAgentBatch } from '../src/helpers/agentTasks.js';
import { runAgentBatches } from '../src/helpers/spatialWorker.js';
import { latLngToCell, gridDisk, gridDistance, cellToLatLng } from 'h3-js';

// --- bearing helpers -------------------------------------------------------

function bearingBetween(a, b) {
  const [lat1, lng1] = cellToLatLngFor(a);
  const [lat2, lng2] = cellToLatLngFor(b);
  const lat1r = (lat1 * Math.PI) / 180;
  const lng1r = (lng1 * Math.PI) / 180;
  const lat2r = (lat2 * Math.PI) / 180;
  const lng2r = (lng2 * Math.PI) / 180;
  const y = Math.sin(lng2r - lng1r) * Math.cos(lat2r);
  const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(lng2r - lng1r);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Local cellToLatLng cache so the lazy bearing proxy does not depend on the
// module-level cache inside agentTasks.js (which we are not testing here).
const _llCache = new Map();
function cellToLatLngFor(cell) {
  let v = _llCache.get(cell);
  if (!v) {
    v = cellToLatLng(cell);
    _llCache.set(cell, v);
  }
  return v;
}

// A bearing "map" that lazily computes and caches the bearing for ANY
// `a::b` key on first access, and records how many times it is consulted
// via bracket access (the access pattern agentTasks.js uses). This lets us
// assert the precomputed bearing cache is actually hit on the hot path.
function makeLazyBearingProxy() {
  const cache = new Map();
  const stats = { reads: 0, hits: 0 };
  const proxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'string' && prop.indexOf('::') !== -1) {
          stats.reads++;
          let v = cache.get(prop);
          if (typeof v !== 'number') {
            const idx = prop.indexOf('::');
            v = bearingBetween(prop.slice(0, idx), prop.slice(idx + 2));
            cache.set(prop, v);
          }
          stats.hits++;
          return v;
        }
        return undefined;
      },
    }
  );
  return { proxy, stats };
}

// --- scenario builder ------------------------------------------------------

function buildScenario() {
  const origin = latLngToCell(40.4169, -3.7035, 15);
  const ring = gridDisk(origin, 5);
  // Pick a destination a few cells away so the agent walks several steps.
  const dest = ring.find((c) => gridDistance(origin, c) === 5) || ring[ring.length - 1];

  const region = gridDisk(origin, 6);
  const frictionEntries = Object.create(null);
  const affordanceEntries = Object.create(null);
  for (const c of region) {
    frictionEntries[c] = 1;
    affordanceEntries[c] = 0.1;
  }

  // Gradient = grid distance to the destination (agent walks downhill).
  const grad = Object.create(null);
  for (const c of region) grad[c] = gridDistance(c, dest);
  const gradients = { [dest]: grad };

  const plan = [
    { originCell: origin, totalVolume: 5, destCandidates: [{ dest }], assigned: [5] },
  ];

  const simulationParams = {
    visionDepth: 2,
    fieldOfView: 360,
    affordanceWeight: 1,
    distancePenalty: 4,
    temperature: 0,
  };

  return { origin, dest, plan, frictionEntries, affordanceEntries, gradients, simulationParams };
}

// --- tests -----------------------------------------------------------------

describe('precomputed bearing map cache', () => {
  it('computeAgentBatch hits the bearing cache (hit rate > 0)', () => {
    const s = buildScenario();
    const { proxy, stats } = makeLazyBearingProxy();

    const { result } = computeAgentBatch({
      plan: s.plan,
      frictionEntries: s.frictionEntries,
      gradients: s.gradients,
      affordanceEntries: s.affordanceEntries,
      hexCount: Object.keys(s.frictionEntries).length,
      bearingMap: proxy,
      options: { simulationParams: s.simulationParams },
    });

    // The agent must have actually moved so bearings were consulted.
    expect(result.processed).toBeGreaterThan(0);

    // Every bracket-access read of the bearing map must resolve to a number,
    // i.e. the cache is genuinely used instead of falling back to trig.
    expect(stats.reads).toBeGreaterThan(0);
    expect(stats.hits).toBeGreaterThan(0);
    expect(stats.hits).toBe(stats.reads); // 100% hit rate on consulted keys
  });

  it('runAgentBatches uses the bearing cache on the main path (hit rate > 0)', async () => {
    const s = buildScenario();
    const { proxy, stats } = makeLazyBearingProxy();

    const res = await runAgentBatches(
      s.plan,
      s.frictionEntries,
      s.gradients,
      s.affordanceEntries,
      Object.keys(s.frictionEntries).length,
      { bearingMap: proxy, simulationParams: s.simulationParams }
    );

    expect(res.processed).toBeGreaterThan(0);
    // The proxy flows through runAgentBatches -> computeAgentBatch untouched
    // (it is not a Map, so it is not re-converted) and is consulted via
    // bracket access on the hot path.
    expect(stats.reads).toBeGreaterThan(0);
    expect(stats.hits).toBe(stats.reads);
  });

  it('runAgentBatches converts a Map bearingMap to a plain object (fix for C3)', async () => {
    const s = buildScenario();
    const region = Object.keys(s.frictionEntries);

    // Build a REAL Map bearing map, exactly like state._precomputedBearings.data.
    const map = new Map();
    for (const a of region) {
      for (const b of region) {
        if (a === b) continue;
        map.set(a + '::' + b, bearingBetween(a, b));
      }
    }

    // Object.fromEntries(map) iterates the Map via Symbol.iterator (it does NOT
    // call .get). Wrap the Map in a Proxy that counts iterator access so we can
    // prove runAgentBatches performs the Map -> plain-object conversion before
    // handing the bearing map to the bracket-access simulation kernel.
    const iterCalls = { count: 0 };
    const proxyMap = new Proxy(map, {
      get(target, prop, receiver) {
        if (prop === Symbol.iterator) {
          iterCalls.count++;
        }
        const val = Reflect.get(target, prop, receiver);
        // Bind Map methods to the original Map so Object.fromEntries' iteration
        // (Map.prototype.entries) operates on a compatible receiver.
        return typeof val === 'function' ? val.bind(target) : val;
      },
    });

    const res = await runAgentBatches(
      s.plan,
      s.frictionEntries,
      s.gradients,
      s.affordanceEntries,
      region.length,
      { bearingMap: proxyMap, simulationParams: s.simulationParams }
    );

    expect(res.processed).toBeGreaterThan(0);
    // The Map must have been iterated by Object.fromEntries — this is the
    // conversion that makes the cache usable by the bracket-access kernel.
    expect(iterCalls.count).toBeGreaterThan(0);
  });
});
