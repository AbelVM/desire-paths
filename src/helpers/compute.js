import { logger } from './logger.js';
import { gridDistance } from 'h3-js';
import {
  FRICTION_COSTS,
  AFFORDANCE,
  DECAY_RATE,
  UPDATE_RATE,
  MAX_EXPECTED_VOLUME,
  SOFT_CAP,
  SIMULATION_PARAMS,
} from './constants.js';
import {
  runGradientBatches,
  runAgentBatches,
  setSpatialWorkerProgressHandler,
  clearSpatialWorkerProgressHandler,
} from './spatialWorker.js';
// The single canonical agent-path kernel lives in agentTasks.js. estimateMaxTicks
// is re-exported from there to keep a single definition.
import { estimateMaxTicks } from './agentTasks.js';
import {
  computeDijkstra,
  getGradientGraph,
  gradientGet,
  gradientReachableCount,
  invalidateGradientGraph,
} from './dijkstra.js';
import { reconstructVisibilityBearing } from './bearingIndex.js';

function applyPathDesireDeltas(ctx, pathDesireDeltas) {
  for (const cell in pathDesireDeltas) {
    const v = pathDesireDeltas[cell];
    const newDesire = (ctx.pathDesireScores?.[cell] ?? 0) + v;
    ctx.pathDesireScores[cell] = newDesire;
  }
}

// Precompute grid distances for all origin-destination pairs as a typed matrix
// (S7). Returns `{ nodeList, nodeToIdx, matrix }` where `matrix` is a
// `Float32Array(M*M)` (M = unique origin/destination cells) indexed by node
// indices, initialized to Infinity. Only origin×dest and dest×origin pairs are
// filled (symmetric), matching the old string-keyed table's node-only key set.
// This clones cheaply to the worker (one typed array + a small Map) and needs no
// per-lookup string concat. Unfilled pairs stay Infinity, so `lookupOriginDest`
// returns `undefined` for them — preserving the old "lookup only hits for node
// pairs" semantics exactly (the per-tick lookup is still gated on `nodeSet`).
function precomputeOriginDestDistances(origins, destinations) {
  const nodeSet = new Set();
  for (let i = 0; i < origins.length; i++) nodeSet.add(origins[i]);
  for (let j = 0; j < destinations.length; j++) nodeSet.add(destinations[j]);
  const nodeList = Array.from(nodeSet);
  const M = nodeList.length;
  const nodeToIdx = new Map();
  for (let i = 0; i < M; i++) nodeToIdx.set(nodeList[i], i);
  const matrix = new Float32Array(M * M).fill(Infinity);
  for (let i = 0; i < origins.length; i++) {
    const o = origins[i];
    const oi = nodeToIdx.get(o);
    for (let j = 0; j < destinations.length; j++) {
      const d = destinations[j];
      if (o === d) continue;
      const di = nodeToIdx.get(d);
      const dist = gridDistance(o, d);
      matrix[oi * M + di] = dist;
      matrix[di * M + oi] = dist; // reverse direction (table was symmetric)
    }
  }
  return { nodeList, nodeToIdx, matrix };
}

// O(1) typed-matrix lookup for the precomputed origin-destination distances.
// Returns the finite distance, or `undefined` when the pair is not a filled
// node pair (Infinity / non-node). Safe to call with a null `od`.
// M3: lazily rebuild the main-thread visibility + bearing indices from the raw
// packed CSR buffer (`_visibilityBearingCSR`) + AOI cell order (`_viewHexes`),
// instead of holding the eagerly-built Proxy indices that grid.js used to
// construct. The agent worker already rebuilds from this same CSR (S1); the
// main-thread simulation path now does the same, on first use, and caches by
// mapping generation. This keeps the CSR as the single source of truth and avoids
// the O(N) cellToIndex + Proxy construction when only the worker path runs.
// Cached in a WeakMap keyed by state so the proxy get-trap (which returns
// undefined for unknown `_`-prefixed props) can't hide the value, and so the
// cache is collected with the state.
const _mtVisBearingCache = new WeakMap();
function getMainThreadVisibilityBearing(state) {
  const gen = state._mappingGeneration ?? 0;
  const cached = _mtVisBearingCache.get(state);
  if (cached && cached.gen === gen) return cached;
  const csr = state._visibilityBearingCSR;
  const viewHexes = state._viewHexes || null;
  let visibilityData = null;
  let bearingMap = null;
  if (csr && viewHexes) {
    const recon = reconstructVisibilityBearing(csr, viewHexes);
    visibilityData = recon.visibilityData.data;
    bearingMap = recon.bearingMap;
  }
  const result = { gen, visibilityData, bearingMap };
  _mtVisBearingCache.set(state, result);
  return result;
}

/** Drop path/disk/visibility caches and gradient fields after friction topology changes. */
export function clearComputeCaches(ctx) {
  // Clear accumulated desire scores and per-cell desire values so they don't carry over
  // between simulation runs when the friction topology changes but _mappingGeneration does not.
  if (ctx.pathDesireScores) {
    for (const k in ctx.pathDesireScores) delete ctx.pathDesireScores[k];
  }

  // Drop per-compute data structures
  ctx._gradientCacheObj = null;
  ctx._frictionObj = null;
  ctx._affordanceObj = null;
  ctx._perTargetContribs = null;
  ctx._assignedCounts = null;
  ctx._targetWeights = null;
  // Drop cached hot-path closures — they capture `_frictionObj`/`_affordanceObj`,
  // so stale closures would read a detached snapshot on the next run.
  ctx._getFriction = null;
  ctx._getAffordance = null;

  // Clear gradient cache and drop the gradient graph so the next run rebuilds
  // adjacency from the current friction instead of a stale topology.
  clearGradientCache(ctx);
  ctx._gradientCacheGen = undefined;
  invalidateGradientGraph();
}

function ensureGradientCacheFresh(ctx) {
  const gen = ctx._mappingGeneration ?? 0;
  if (ctx._gradientCacheGen !== gen) {
    clearGradientCache(ctx);
    ctx._gradientCacheGen = gen;
  }
}

function getReachableDestinations(ctx, originCell, destinations, goalGradients) {
  const graph = getGradientGraph(ctx.cellFrictionMap, ctx._r1Adjacency, ctx._viewHexes);
  const destCandidates = [];
  let destWeightSum = 0;
  for (let d = 0; d < destinations.length; d++) {
    const destCell = destinations[d];
    if (destCell === originCell) continue;
    const grad = goalGradients.get(destCell);
    if (!grad) {
      try {
        logger.debug('getReachableDestinations: missing gradient', { originCell, destCell });
      } catch (_e) {}
      continue;
    }
    if (!isFinite(gradientGet(grad, originCell, graph))) {
      try {
        logger.debug('getReachableDestinations: origin not in gradient', {
            originCell,
            destCell,
          });
      } catch (_e) {}
      continue;
    }
    const w = ctx.simulationNodes[destCell]?.weight || 1;
    destCandidates.push({ dest: destCell, weight: w });
    destWeightSum += w;
  }
  return { destCandidates, destWeightSum };
}

function allocateDestinationCounts(destCandidates, destWeightSum, totalVolume) {
  if (!destCandidates.length || destWeightSum <= 0) return [];
  const floats = destCandidates.map((c) => (c.weight / destWeightSum) * totalVolume);
  const floors = floats.map((f) => Math.floor(f));
  const assigned = floors.slice();
  let allocated = floors.reduce((a, b) => a + b, 0);
  let leftover = totalVolume - allocated;

  if (leftover > 0) {
    const frac = floats.map((f, i) => ({
      i,
      frac: f - floors[i],
      weight: destCandidates[i].weight,
    }));
    frac.sort((a, b) => {
      if (b.frac !== a.frac) return b.frac - a.frac;
      return destCandidates[b.i].weight - destCandidates[a.i].weight;
    });
    for (let k = 0; k < leftover; k++) assigned[frac[k].i] += 1;
  }
  return assigned;
}

function buildSimulationPlan(ctx, origins, destinations, goalGradients) {
  const agentsPerWeightUnit =
    ctx.simulationParams?.agentsPerWeightUnit ?? SIMULATION_PARAMS.agentsPerWeightUnit;
  const plan = [];
  const assignedCounts = Object.create(null);
  let totalAgents = 0;

  for (let o = 0; o < origins.length; o++) {
    const originCell = origins[o];
    const totalVolume = Math.max(
      1,
      Math.round((ctx.simulationNodes[originCell]?.weight || 1) * agentsPerWeightUnit)
    );
    const { destCandidates, destWeightSum } = getReachableDestinations(
      ctx,
      originCell,
      destinations,
      goalGradients
    );
    if (!destCandidates.length) continue;

    const assigned = allocateDestinationCounts(destCandidates, destWeightSum, totalVolume);
    assignedCounts[originCell] = Object.create(null);
    for (let i = 0; i < destCandidates.length; i++) {
      const destCell = destCandidates[i].dest;
      assignedCounts[originCell][destCell] = assigned[i] || 0;
      totalAgents += assigned[i] || 0;
    }

    plan.push({ originCell, totalVolume, destCandidates, assigned });
  }

  return { plan, assignedCounts, totalAgents };
}

function updateSimulationProgress(ctx, processed, total, phase = 'Simulating flows...') {
  const percent = total > 0 ? Math.min(100, (processed / total) * 100) : 0;
  ctx.simulationProgress = {
    processed,
    total,
    percent,
    phase,
  };
  ctx.syncSimulationUI?.();
}

/**
 * FULL IMPLEMENTATION: BDI Agent Decision Engine
 */
export async function computeDesirePaths(state, mapInstance) {
  state.simulationParams = { ...SIMULATION_PARAMS };
  const simParams = state.simulationParams;

  // Reset flow map before every simulation so results don't accumulate across runs.
  // Always use a plain object for pathDesireScores — inner loops index it directly.
  state.pathDesireScores = Object.create(null);

  // Guard: ensure the friction map has been built before simulating
  if (!state.cellFrictionMap || state.cellFrictionMap.size === 0) {
    state.flowsReady = false;
    if (mapInstance.showAlertCard) {
      mapInstance.showAlertCard(
        'Build the mapping first by clicking "Build Mapping". ' +
          'The simulation requires a friction map generated from the map tiles.',
        { title: 'Mapping not built', tone: 'warning' }
      );
    }
    return;
  }

  const destinations = Object.keys(state.simulationNodes).filter((k) =>
    ['destination', 'dual'].includes(state.simulationNodes[k].type)
  );
  const agents = Object.keys(state.simulationNodes).filter((k) =>
    ['origin', 'dual'].includes(state.simulationNodes[k].type)
  );

  const hexes = state.cellFrictionMap.size;
  ensureGradientCacheFresh(state);

  const mappingGen = state._mappingGeneration ?? 0;
  if (!state._frictionObj || state._frictionSnapshotGen !== mappingGen) {
    state._frictionObj = Object.create(null);
    for (const [k, v] of state.cellFrictionMap) state._frictionObj[k] = v;
    state._frictionSnapshotGen = mappingGen;
  }
  // B: `_affordanceObj` is no longer pre-built by grid.js — materialize it lazily
  // here from `affordanceMap` (the single source of truth at mapping time), gated
  // on the mapping generation like `_frictionObj`. Once built it becomes the live
  // working copy for the run: `updateAffordance`/`decayAffordance` and the wear
  // pass below mutate it in place, so it must exist before the decay loop. It is
  // dropped by clearComputeCaches on the next remap (bumping mappingGen), so a
  // fresh remap always reseeds it from the rebuilt `affordanceMap`.
  if (!state._affordanceObj || state._affordanceSnapshotGen !== mappingGen) {
    state._affordanceObj = Object.create(null);
    for (const [k, v] of state.affordanceMap) state._affordanceObj[k] = v;
    state._affordanceSnapshotGen = mappingGen;
  }
  // `_multiFrictionObj` is a view over `multiFrictionMap` (same cell→layer-map
  // references), not a second copy — this avoids holding N object references in
  // a separate plain-object container at steady state.
  if (!state._multiFrictionObj || state._multiFrictionSnapshotGen !== mappingGen) {
    state._multiFrictionObj = state.multiFrictionMap || Object.create(null);
    state._multiFrictionSnapshotGen = mappingGen;
  }

  // Grass recovery between user-triggered simulation runs (not after wear in the
  // same pass). Iterate the friction-object key set. decayAffordance reads/writes
  // `_affordanceObj`.
  if (state._frictionObj) {
    for (const cell in state._frictionObj) {
      decayAffordance(state, cell);
    }
  } else {
    for (const cell of state.affordanceMap.keys()) {
      decayAffordance(state, cell);
    }
  }

  // Reuse cached per-target gradients when possible to avoid recomputing
  // the full Dijkstra result for every run. Cache is keyed by target cell id
  // and stores the plain-object distances returned by computeDijkstraGradient.
  if (!state._gradientCacheObj) state._gradientCacheObj = Object.create(null);
  if (!state._pendingGradientPromises) state._pendingGradientPromises = Object.create(null);

  const missingDestinations = [];
  const pendingDestinations = [];
  for (const d of destinations) {
    if (state._gradientCacheObj[d]) continue;
    if (state._pendingGradientPromises[d]) {
      pendingDestinations.push(d);
    } else {
      missingDestinations.push(d);
    }
  }

  const gradientPromises = pendingDestinations.map((d) => state._pendingGradientPromises[d]);
  if (missingDestinations.length > 0) {
    const missingPromise = (async () => {
      try {
        setSpatialWorkerProgressHandler((m) => {
          try {
            if (m && m.progress) {
              updateSimulationProgress(
                state,
                m.processed ?? 0,
                m.total ?? 0,
                m.phase ?? 'Computing gradients...'
              );
              mapInstance.syncSimulationUI?.();
            }
          } catch (_e) {
            // ignore UI sync errors
          }
        });

        const gradients = await runGradientBatches(
          missingDestinations,
          state._frictionObj || state.cellFrictionMap,
          { r1Adjacency: state._r1Adjacency || null, viewHexes: state._viewHexes || null }
        );
        for (const d of missingDestinations) {
          state._gradientCacheObj[d] = gradients[d] || Object.create(null);
        }
      } finally {
        for (const d of missingDestinations) {
          delete state._pendingGradientPromises[d];
        }
      }
    })();

    for (const d of missingDestinations) {
      state._pendingGradientPromises[d] = missingPromise;
    }
    gradientPromises.push(missingPromise);
  }

  try {
    if (gradientPromises.length > 0) {
      await Promise.all(gradientPromises);
    }
  } catch (err) {
    // Centralized error handling: surface to UI and ensure handler cleared
    try {
      clearSpatialWorkerProgressHandler();
    } catch (_e) {}
    if (typeof mapInstance?.showAlertCard === 'function') {
      try {
        mapInstance.showAlertCard(err?.message || String(err), {
          title: 'Simulation error',
          tone: 'error',
        });
      } catch (_e) {}
    } else if (typeof console !== 'undefined') {
      console.error('Gradient computation failed:', err);
    }
    throw err;
  }

  const goalGradients = new Map();
  for (const d of destinations) {
    goalGradients.set(d, state._gradientCacheObj[d]);
  }

  // Check for unreachable destinations (surrounded by impassable terrain)
  // A gradient with only the destination cell itself means no other cells can reach it
  const unreachableDests = [];
  for (const d of destinations) {
    const grad = state._gradientCacheObj[d];
    // If the gradient reaches only the destination itself (or is empty), it's unreachable
    if (gradientReachableCount(grad) <= 1) {
      unreachableDests.push(d);
    }
  }
  if (unreachableDests.length > 0) {
    const count = unreachableDests.length;
    const msg = `${count} destination${count > 1 ? 's' : ''} can’t be reached on foot — walled off by buildings or barriers`;
    if (mapInstance?.showAlertCard) {
      try {
        mapInstance.showAlertCard(msg, { title: 'No walking route', tone: 'warning' });
      } catch (_e) {}
    }
  }

  // Plain object is faster than Map for string-key → integer-value accumulation.
  const pathDesireDeltas = Object.create(null);
  // True ABM: shared footprint accumulator — all agents in this simulation
  // see each other's positions as accumulated footprints.  This is the key
  // difference from Monte-Carlo sampling where every agent plans independently.
  // The accumulator is owned by the agent worker (S5); it is no longer
  // created or shipped from the main thread.

  let perTargetContribs;
  const { plan, assignedCounts, totalAgents } = buildSimulationPlan(
    state,
    agents,
    destinations,
    goalGradients
  );
  try {
    logger.debug('computeDesirePaths: plan built', {
        agentsCount: agents.length,
        destinationsCount: destinations.length,
        planLength: plan.length,
        totalAgents,
        assignedOrigins: Object.keys(assignedCounts).length,
        planPreview: plan.map((p) => ({
          origin: p.originCell,
          totalVolume: p.totalVolume,
          assignedLen: p.assigned?.length ?? 0,
        })),
      });
  } catch (_e) {}
  // Validate plan: ensure gradients exist for every origin->destination used in the plan.
  const planGraph = getGradientGraph(state.cellFrictionMap, state._r1Adjacency, state._viewHexes);
  for (let pi = 0; pi < plan.length; pi++) {
    const originCell = plan[pi].originCell;
    const destCandidates = plan[pi].destCandidates || [];
    for (let di = 0; di < destCandidates.length; di++) {
      const destCell = destCandidates[di].dest;
      const grad = goalGradients.get(destCell);
      const hasOrigin = grad && isFinite(gradientGet(grad, originCell, planGraph));
      if (!hasOrigin) {
        try {
          logger.warn('computeDesirePaths: aborting - missing gradient for plan entry', {
              originCell,
              destCell,
            });
          if (mapInstance?.showAlertCard)
            mapInstance.showAlertCard(
              'Couldn’t finish the walk — some route data was missing. Try revealing the paths again.',
              {
                title: 'Walk incomplete',
                tone: 'warning',
              }
            );
        } catch (_e) {}
        // Do not apply an incomplete plan; abort early.
        return;
      }
    }
  }
  updateSimulationProgress(state, 0, totalAgents);

  // Precompute origin-destination grid distances to eliminate per-tick H3 calls
  const odDistances = precomputeOriginDestDistances(agents, destinations);

  // Offload per-origin agent path sims to worker pool (workers are stateless)
  try {
    setSpatialWorkerProgressHandler((m) => {
      try {
        if (m && m.progress) {
          updateSimulationProgress(
            state,
            m.processed ?? 0,
            m.total ?? 0,
            m.phase ?? 'Simulating flows...'
          );
          mapInstance?.syncSimulationUI?.();
        }
      } catch (_e) {}
    });

    const mtVis = getMainThreadVisibilityBearing(state);
    const agentResults = await runAgentBatches(
      plan,
      state._frictionObj || state.cellFrictionMap,
      goalGradients,
      state._affordanceObj || state.affordanceMap,
      hexes,
      {
        // M3: lazily-rebuilt main-thread indices (from raw CSR). The worker path
        // ignores these and rebuilds from `visibilityBearingCSR` + `viewHexes`
        // (S1); they are only used by the non-worker fallback (Node/SSR).
        visibilityEntries: mtVis.visibilityData || null,
        originDestDistances: odDistances,
        bearingMap: mtVis.bearingMap || null,
        // S1-SAB (review6 §3 option 1): ship the raw packed visibility/bearing CSR
        // buffer + the exact AOI cell order so the agent worker can REBUILD the
        // visibility + bearing indices in-worker (structured-cloning the Proxies
        // drops their function traps, silently degrading to the slow fallback).
        visibilityBearingCSR: state._visibilityBearingCSR || null,
        viewHexes: state._viewHexes || null,
        // M3: ship the shared r=1 CSR so the agent worker's getGradientGraph
        // filters it instead of running a per-cell gridDisk pass.
        r1Adjacency: state._r1Adjacency || null,
        simulationParams: simParams,
      }
    );

    // Merge returned path desire into plain object
    const mergedPath = agentResults.pathDesire || Object.create(null);
    for (const cell in mergedPath) {
      const v = Number(mergedPath[cell]) || 0;
      if (v) pathDesireDeltas[cell] = (pathDesireDeltas[cell] || 0) + v;
    }

    // Apply aggregated affordance wear on main thread
    if (simParams.emergentWear) {
      for (const cell in pathDesireDeltas) {
        const v = pathDesireDeltas[cell];
        if (v && typeof v === 'number') updateAffordance(state, cell, v);
      }
    }

    perTargetContribs = agentResults.perTargetContribs || Object.create(null);
  } finally {
    try {
      clearSpatialWorkerProgressHandler();
    } catch (_e) {}
  }

  applyPathDesireDeltas(state, pathDesireDeltas);

  // Persist per-target contribution and assignment snapshots for incremental APIs
  state._perTargetContribs = perTargetContribs;
  state._assignedCounts = assignedCounts;
  state._targetWeights = Object.create(null);
  for (const d of destinations) state._targetWeights[d] = state.simulationNodes[d]?.weight || 1;

  // Compute global peak flow for consistent color normalization in the renderer.
  let peak = 0;
  const scores = state.pathDesireScores;
  if (scores) {
    for (const k in scores) {
      const v = scores[k];
      if (typeof v === 'number' && v > peak) peak = v;
    }
  }
  state.globalPeakFlow = peak > 0 ? peak : 1;

  updateSimulationProgress(state, totalAgents, totalAgents, 'Complete');
  try {
    clearSpatialWorkerProgressHandler();
  } catch (_e) {}
  // Path scores / affordance changed — bump so updateLayers rebuilds.
  state._layerDataVersion = (state._layerDataVersion || 0) + 1;
  mapInstance?.updateLayers?.();
  state.flowsReady = true;
}


/**
 * Terrain-Aware Update
 * HEAVY_GRASS takes more effort (less wear) to start a path
 * LIGHT_PARK is easily worn (more wear)
 */
function updateAffordance(ctx, cell, volume = 1) {
  const friction = ctx._frictionObj?.[cell];

  // Skip update for permanent infrastructure
  if (friction === FRICTION_COSTS.PAVEMENT || friction === FRICTION_COSTS.IMPASSABLE) return;

  const resistanceFactor = friction === FRICTION_COSTS.HEAVY_GRASS ? 1.5 : 0.8;
  const current = ctx._affordanceObj?.[cell] ?? 0.1;
  const newVal = Math.min(
    SOFT_CAP,
    current + (volume * UPDATE_RATE) / (MAX_EXPECTED_VOLUME * resistanceFactor)
  );

  if (ctx._affordanceObj) ctx._affordanceObj[cell] = newVal;
}

/**
 * Terrain-Aware Decay
 * HEAVY_GRASS recovers slower (more persistent path)
 * LIGHT_PARK recovers faster (path fades quickly)
 */
function decayAffordance(ctx, cell) {
  const friction = ctx._frictionObj?.[cell];

  if (friction === FRICTION_COSTS.PAVEMENT || friction === FRICTION_COSTS.IMPASSABLE) return;

  const recoveryFactor = friction === FRICTION_COSTS.HEAVY_GRASS ? 0.5 : 1.5;
  const current = ctx._affordanceObj?.[cell] ?? 0.1;
  // Exponential decay: vegetation recovers quickly at first, then slows as
  // roots reestablish — producing a realistic non-linear persistence curve.
  // Heavy grass (recoveryFactor 0.5) decays slower than light park (1.5).
  const newVal = Math.max(0.1, current * Math.exp(-DECAY_RATE * recoveryFactor));

  if (ctx._affordanceObj) ctx._affordanceObj[cell] = newVal;
}

/**
 * Classify affordance from friction value using numeric thresholds.
 * Returns { affordance, tier } where tier is one of:
 * 'impassable', 'pavement', 'light_park', 'heavy_grass'
 */
function classifyAffordance(friction) {
  const p = FRICTION_COSTS.PAVEMENT;
  const l = FRICTION_COSTS.LIGHT_PARK;
  const h = FRICTION_COSTS.HEAVY_GRASS;
  const midPL = (p + l) / 2;
  const midLH = (l + h) / 2;

  if (friction >= FRICTION_COSTS.IMPASSABLE)
    return { affordance: AFFORDANCE.IMPASSABLE, tier: 'impassable' };
  if (friction < midPL) return { affordance: AFFORDANCE.PAVEMENT, tier: 'pavement' };
  if (friction < midLH) return { affordance: AFFORDANCE.LIGHT_PARK, tier: 'light_park' };
  return { affordance: AFFORDANCE.HEAVY_GRASS, tier: 'heavy_grass' };
}

/**
 * Initialize affordance based on your specific FRICTION_COSTS
 */
export function initializeAffordanceMap(ctx) {
  ctx.affordanceMap.clear();

  for (const [cell, friction] of ctx.cellFrictionMap) {
    const { affordance } = classifyAffordance(friction);
    ctx.affordanceMap.set(cell, affordance);

    if (ctx._affordanceObj) ctx._affordanceObj[cell] = affordance;
  }
}

/**
 * Optimized Dijkstra Gradient (Production-Ready)
 */
function computeDijkstraGradient(ctx, targetCell) {
  // _frictionObj may not be built yet during incremental gradient computation.
  // Use it when available; otherwise build once from cellFrictionMap.
  let frictionLookup = ctx._frictionObj;
  if (!frictionLookup && ctx.cellFrictionMap) {
    frictionLookup = Object.create(null);
    for (const [k, v] of ctx.cellFrictionMap) frictionLookup[k] = v;
    ctx._frictionObj = frictionLookup;
  }

  const getFriction = (n) => frictionLookup?.[n];

  // Reuse the precomputed gradient graph (CSR adjacency) keyed by the stable
  // cellFrictionMap reference. Topology is static per mapping generation; only
  // the per-cell friction (which can change via emergent wear) is rebuilt.
  const graph = getGradientGraph(ctx.cellFrictionMap, ctx._r1Adjacency, ctx._viewHexes);
  return computeDijkstra(targetCell, getFriction, graph);
}

// Expose real internals for testing/debugging (no test-only aliases).
export {
  computeDijkstraGradient,
  estimateMaxTicks,
  precomputeOriginDestDistances,
};

// Gradient cache helpers: compute, inspect, and clear per-target gradients.
export function clearGradientCache(ctx) {
  ctx._gradientCacheObj = Object.create(null);
  ctx._gradientCacheOrder = undefined;
  ctx._gradientCacheGen = undefined;
  ctx._pendingGradientPromises = Object.create(null);
}

