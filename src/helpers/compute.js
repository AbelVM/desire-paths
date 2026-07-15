import { logger } from './logger.js';
import { PowerCache } from 'performance-helpers/powerCache';
import { gridDistance } from 'h3-js';
import {
  FRICTION_COSTS,
  AFFORDANCE,
  DECAY_RATE,
  UPDATE_RATE,
  MAX_EXPECTED_VOLUME,
  SOFT_CAP,
  SIMULATION_PARAMS,
  GRADIENT_CACHE_MAX_ENTRIES,
  classifyFrictionTier,
} from './constants.js';
import {
  runGradientBatches,
  runAgentBatches,
  runBuildMappingGraph,
  runVisibilityBearingTask,
  setSpatialWorkerProgressHandler,
  clearSpatialWorkerProgressHandler,
  terminateAllWorkers,
} from './spatialWorker.js';
// The single canonical agent-path kernel lives in agentTasks.js. estimateMaxTicks
// is re-exported from there to keep a single definition.
import { estimateMaxTicks } from './agentTasks.js';
import {
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
// (S7). Returns `{ originToIdx, destToIdx, D, matrix }` where `matrix` is a
// `Float32Array(O*D)` (O = unique origins, D = unique destinations) indexed by
// origin-major order, initialized to Infinity. Only origin→dest pairs are stored
// (the per-tick lookup is always `lookupOriginDest(od, node, destCell)` where the
// second argument is always a destination), so an O×D table is exact — the old
// dense M×M (M = O∪D) table wasted O²+D² cells on pairs that were never read.
// This clones cheaply to the worker (one typed array + two small Maps) and needs
// no per-lookup string concat. Unfilled pairs stay Infinity, so `lookupOriginDest`
// returns `undefined` for them — preserving the old "lookup only hits for
// origin→dest node pairs" semantics exactly (the per-tick lookup is still gated
// on `nodeSet`).
function precomputeOriginDestDistances(origins, destinations) {
  const originToIdx = new Map();
  for (let i = 0; i < origins.length; i++) {
    if (!originToIdx.has(origins[i])) originToIdx.set(origins[i], originToIdx.size);
  }
  const destToIdx = new Map();
  for (let j = 0; j < destinations.length; j++) {
    if (!destToIdx.has(destinations[j])) destToIdx.set(destinations[j], destToIdx.size);
  }
  const O = originToIdx.size;
  const D = destToIdx.size;
  const matrix = new Float32Array(O * D).fill(Infinity);
  for (const [o, oi] of originToIdx) {
    for (const [d, di] of destToIdx) {
      if (o === d) continue;
      matrix[oi * D + di] = gridDistance(o, d);
    }
  }
  return { originToIdx, destToIdx, D, matrix };
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
  // M3/#5 (review12): the worker path rebuilds the visibility + bearing indices
  // IN-WORKER from the raw packed CSR + `viewHexes` (agentTasks.js), so the
  // eagerly-built main-thread Proxies are only consumed by the non-worker
  // fallback (Node/SSR, where `Worker` is undefined). Skipping the O(N)
  // cellToIndex Map + two Proxies here when a Worker is available avoids the
  // dominant per-run allocation the indexed kernel (S1, the default) never reads.
  // P4: the main-thread indices are intentionally omitted in the browser — if a
  // future feature adds a main-thread preview that needs these indices, it will
  // silently degrade to the slow path-cell visibility unless this guard is
  // revisited.
  if (csr && viewHexes && typeof Worker === 'undefined') {
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
  ctx._gradientCache = null;
  ctx._protectedGradientDests = undefined;
  ctx._frictionObj = null;
  ctx._affordanceObj = null;
  ctx._perTargetContribs = null;
  ctx._assignedCounts = null;
  ctx._targetWeights = null;
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

// Per-target gradient cache, backed by PowerCache (review 3.2). Replaces the old
// hand-rolled Map + recency-order array + manual eviction. PowerCache gives us a
// bounded LRU with O(1) get/set and automatic eviction at GRADIENT_CACHE_MAX_ENTRIES.
// The cached values are plain-object distance maps (NOT typed arrays / SABs), so
// storing them here does not interfere with the worker SharedArrayBuffer zero-copy
// payload path used by runGradientBatches.
//
// `weightFn` marks the current run's destinations with infinite weight so they are
// never evicted mid-run (the old code protected them via `_pruneGradientCache`'s
// protectedSet). `ctx._protectedGradientDests` is reset each run in
// clearGradientCache and repopulated with the active destinations.
function getGradientCache(ctx) {
  if (!ctx._gradientCache) {
    ctx._gradientCache = new PowerCache({
      maxEntries: GRADIENT_CACHE_MAX_ENTRIES,
      weightFn: (key) => (ctx._protectedGradientDests && ctx._protectedGradientDests.has(key) ? Infinity : 1),
    });
  }
  return ctx._gradientCache;
}

function getReachableDestinations(ctx, originCell, destinations, goalGradients) {
  // Use the same friction source the agent batch builds its graph from
  // (`_frictionObj`, materialized before this runs) so getGradientGraph's
  // identity-keyed cache is hit instead of rebuilding the adjacency a second
  // time from `cellFrictionMap` (P0).
  const graph = getGradientGraph(ctx._frictionObj || ctx.cellFrictionMap, ctx._r1Adjacency, ctx._viewHexes);
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
export async function computeDesirePaths(state, mapInstance, signal) {
  if (signal && signal.aborted) {
    throw new Error('computeDesirePaths aborted before start');
  }

  const onAbort = () => {
    try {
      terminateAllWorkers();
    } catch (_e) {}
    throw new Error('computeDesirePaths aborted');
  };
  if (signal) {
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const simParams = state.simulationParams ?? SIMULATION_PARAMS;

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

    if (signal && signal.aborted) throw new Error('computeDesirePaths aborted');

    const destinations = Object.keys(state.simulationNodes).filter((k) =>
      ['destination', 'dual'].includes(state.simulationNodes[k].type)
    );
    const agents = Object.keys(state.simulationNodes).filter((k) =>
      ['origin', 'dual'].includes(state.simulationNodes[k].type)
    );

    const hexes = state.cellFrictionMap.size;
    ensureGradientCacheFresh(state);

    // J (review11 §J, option 1): the visibility/bearing CSR is the dominant
    // steady-state memory cost at city scale (~2 GB at N=5e5, visionDepth=15).
    // It is rebuilt lazily here when needed. review12 #6: cache it ACROSS runs and
    // only rebuild when the inputs that determine it change — `mappingGeneration`
    // (the friction topology / AOI) or `visionDepth` (the BFS radius). This avoids
    // the full mapping-graph + visibility BFS rebuild on every run when neither
    // input changed. The cached CSR carries its `gen` + `visionDepth` so the check
    // is exact; a remap bumps `mappingGeneration`, and a visionDepth change is
    // detected directly. Any failure degrades gracefully to the (correct, slower)
    // path-cell visibility path.
    const wantVisionDepth = state.simulationParams?.visionDepth ?? SIMULATION_PARAMS.visionDepth;
    const csrGen = state._mappingGeneration ?? 0;
    const cachedCsr = state._visibilityBearingCSR;
    const csrValid =
      cachedCsr && cachedCsr.gen === csrGen && cachedCsr.visionDepth === wantVisionDepth;
    if (!csrValid && state.cellFrictionMap && state._viewHexes) {
      try {
        const mappingGraph = await runBuildMappingGraph(
          state.cellFrictionMap,
          state._viewHexes,
          state._r1Adjacency || null
        );
        const csr = await runVisibilityBearingTask(
          mappingGraph,
          state._viewHexes,
          wantVisionDepth
        );
        state._visibilityBearingCSR = { gen: csrGen, visionDepth: wantVisionDepth, ...csr };
      } catch (err) {
        try {
          logger.warn('computeDesirePaths: lazy visibility CSR rebuild failed', err);
        } catch (_e) {}
        state._visibilityBearingCSR = null;
        if (mapInstance?.showAlertCard) {
          try {
            mapInstance.showAlertCard(
              'Visibility data could not be computed — simulation may be slower than usual.',
              { title: 'Visibility warning', tone: 'warning' }
            );
          } catch (_e) {}
        }
      }
    }

    if (signal && signal.aborted) throw new Error('computeDesirePaths aborted');

  // I (review11 §I): `_frictionObj`/`_affordanceObj` are no longer separate
  // N-entry plain-object copies of the canonical maps — they ARE the canonical
  // FrictionArrayMap views (`cellFrictionMap`/`affordanceMap`). This removes the
  // redundant 2× steady-state memory the old comments claimed to eliminate. Both
  // are Map-like (get/set/has/size/keys/entries), so every consumer reads and
  // writes them through the Map interface. They are re-seeded from the canonical
  // views on every run (clearComputeCaches nulls them on remap), so a fresh
  // mapping always reseeds them from the rebuilt maps.
  if (state.cellFrictionMap) state._frictionObj = state.cellFrictionMap;
  if (state.affordanceMap) state._affordanceObj = state.affordanceMap;

  // Grass recovery between user-triggered simulation runs (not after wear in the
  // same pass). Iterate the canonical cell set — `cellFrictionMap` is always
  // Map-like (a FrictionArrayMap in production, a Map in tests) — so this covers
  // every cell that carries affordance state. decayAffordance reads/writes
  // `_affordanceObj` (the same view).
  if (state.cellFrictionMap) {
    for (const cell of state.cellFrictionMap.keys()) {
      decayAffordance(state, cell);
    }
  }

  // Reuse cached per-target gradients when possible to avoid recomputing
  // the full Dijkstra result for every run. Cache is keyed by target cell id
  // and stores the plain-object distances returned by computeDijkstraGradient.
  // Backed by PowerCache (review 3.2): bounded LRU, O(1) get/set, automatic
  // eviction. The current run's destinations are protected from eviction via the
  // cache's weightFn (see getGradientCache).
  const gradientCache = getGradientCache(state);
  state._protectedGradientDests = new Set(destinations);
  if (!state._pendingGradientPromises) state._pendingGradientPromises = Object.create(null);

  const missingDestinations = [];
  const pendingDestinations = [];
  for (const d of destinations) {
    if (gradientCache.get(d)) continue;
    if (state._pendingGradientPromises && state._pendingGradientPromises[d]) {
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
          {
            r1Adjacency: state._r1Adjacency || null,
            viewHexes: state._viewHexes || null,
            // review12 #7: ship the SAB-backed friction array (aligned to
            // viewHexes) so the gradient worker builds the graph from the typed
            // array with a stable cache key across batches.
            frictionArr: state.frictionArr || null,
            signal,
          }
        );
        for (const d of missingDestinations) {
          gradientCache.set(d, gradients[d] || Object.create(null));
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
    goalGradients.set(d, gradientCache.get(d));
  }

  // Cache is now bounded by PowerCache (GRADIENT_CACHE_MAX_ENTRIES) with LRU
  // eviction; current-run destinations are protected via weightFn. No manual
  // pruning needed.

  // Check for unreachable destinations (surrounded by impassable terrain)
  // A gradient with only the destination cell itself means no other cells can reach it
  const unreachableDests = [];
  for (const d of destinations) {
    const grad = gradientCache.get(d);
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
  // Reuse the SAME friction source (`_frictionObj`) that getReachableDestinations
  // already built the gradient graph from, so this hits the cached graph instead
  // of rebuilding an identical one keyed by the (different) cellFrictionMap object.
  const planGraph = getGradientGraph(state._frictionObj || state.cellFrictionMap, state._r1Adjacency, state._viewHexes);
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

    // Persistent footprint accumulator shared across waves (review10 §9 + wave
    // model): later waves see the wear earlier waves left behind, which is the
    // true ABM interaction that produces emergent desire paths. Owned by `state`
    // and reused every call; recreated only when the gradient graph grows (remap
    // to a larger AOI). Sized to the current graph; backed by a SharedArrayBuffer
    // when the page is cross-origin isolated so the multi-worker path can share
    // it atomically, otherwise a plain Uint32Array (single-worker).
    const fpV = planGraph ? planGraph.V : 0;
    if (!state._footprintBuffer || state._footprintBuffer.length < fpV) {
      state._footprintBuffer =
        typeof SharedArrayBuffer !== 'undefined' &&
        typeof globalThis !== 'undefined' &&
        globalThis.crossOriginIsolated === true
          ? new Int32Array(new SharedArrayBuffer(fpV * 4))
          : new Uint32Array(fpV);
    }

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
        // review12 #7: ship the SAB-backed friction array (aligned to viewHexes)
        // so the worker builds the gradient graph from the typed array with a
        // stable cache key across batches (built once per worker, not per batch).
        frictionArr: state.frictionArr || null,
        // P1 (review10 §4/§1.1): dynamics-safe agent parallelism. When the
        // environment supports it (Worker + cross-origin isolation + parallelizable
        // plan) the plan is sharded across workers sharing one SAB footprint
        // accumulator. Default ON; falls back to single-worker otherwise.
        parallelAgentBatches: state._parallelAgentBatches ?? true,
        // Persistent cross-wave footprint buffer (see above).
        footprintBuffer: state._footprintBuffer,
        simulationParams: simParams,
        signal,
      }
    );

    if (signal && signal.aborted) throw new Error('computeDesirePaths aborted');

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

  if (signal && signal.aborted) throw new Error('computeDesirePaths aborted');

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

  // J (review11 §J) + review12 #6: the visibility/bearing CSR is now CACHED
  // across runs (see the top of this function) and only rebuilt when
  // `mappingGeneration` or `visionDepth` changes, so we no longer release it
  // here. It is the dominant steady-state memory cost at city scale, but the
  // rebuild (mapping-graph + visibility BFS) is the dominant CPU cost too, so
  // holding it trades memory for a large per-run CPU win. It is still dropped on
  // remap via the `gen` mismatch check above, and `clearComputeCaches`/remap
  // invalidate the dependent gradient graph as before.
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}


/**


/**
 * Terrain-Aware Update
 * HEAVY_GRASS takes more effort (less wear) to start a path
 * LIGHT_PARK is easily worn (more wear)
 */
function updateAffordance(ctx, cell, volume = 1) {
  const friction = ctx._frictionObj?.get(cell);

  // Skip update for permanent infrastructure
  if (friction === FRICTION_COSTS.PAVEMENT || friction === FRICTION_COSTS.IMPASSABLE) return;

  const resistanceFactor = friction === FRICTION_COSTS.HEAVY_GRASS ? 1.5 : 0.8;
  const current = ctx._affordanceObj?.get(cell) ?? 0.1;
  const newVal = Math.min(
    SOFT_CAP,
    current + (volume * UPDATE_RATE) / (MAX_EXPECTED_VOLUME * resistanceFactor)
  );

  if (ctx._affordanceObj) ctx._affordanceObj.set(cell, newVal);
}

/**
 * Terrain-Aware Decay
 * HEAVY_GRASS recovers slower (more persistent path)
 * LIGHT_PARK recovers faster (path fades quickly)
 */
function decayAffordance(ctx, cell) {
  const friction = ctx._frictionObj?.get(cell);

  if (friction === FRICTION_COSTS.PAVEMENT || friction === FRICTION_COSTS.IMPASSABLE) return;

  const recoveryFactor = friction === FRICTION_COSTS.HEAVY_GRASS ? 0.5 : 1.5;
  const current = ctx._affordanceObj?.get(cell) ?? 0.1;
  // Exponential decay: vegetation recovers quickly at first, then slows as
  // roots reestablish — producing a realistic non-linear persistence curve.
  // Heavy grass (recoveryFactor 0.5) decays slower than light park (1.5).
  const newVal = Math.max(0.1, current * Math.exp(-DECAY_RATE * recoveryFactor));

  if (ctx._affordanceObj) ctx._affordanceObj.set(cell, newVal);
}

/**
 * Classify affordance from friction value using the single canonical tier
 * classifier (constants.classifyFrictionTier). Returns { affordance, tier }.
 */
function classifyAffordance(friction) {
  const tier = classifyFrictionTier(friction);
  return { affordance: AFFORDANCE[tier.toUpperCase()], tier };
}

/**
 * Initialize affordance based on your specific FRICTION_COSTS
 */
export function initializeAffordanceMap(ctx) {
  ctx.affordanceMap.clear();

  for (const [cell, friction] of ctx.cellFrictionMap) {
    const { affordance } = classifyAffordance(friction);
    ctx.affordanceMap.set(cell, affordance);

    if (ctx._affordanceObj) ctx._affordanceObj.set(cell, affordance);
  }
}

// Expose real internals for testing/debugging (no test-only aliases).
export {
  estimateMaxTicks,
  precomputeOriginDestDistances,
};

// Gradient cache helpers: compute, inspect, and clear per-target gradients.
export function getGradientCacheStats(ctx) {
  const cache = ctx && ctx._gradientCache;
  return cache ? cache.stats() : null;
}

export function clearGradientCache(ctx) {
  // Report cache effectiveness before dropping the instance (dev-only; logger.debug
  // is a no-op in production builds). Validates the PowerCache LRU from review 3.2
  // and confirms the gradient cache is actually being used.
  try {
    const cache = ctx && ctx._gradientCache;
    if (cache) {
      const stats = cache.stats();
      logger.debug('clearGradientCache: gradient cache stats', {
        size: stats.size,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: cache.hitRate,
        evictions: stats.evictions,
      });
    }
  } catch (_e) {}
  // PowerCache instance is dropped and lazily recreated on next use (see
  // getGradientCache). This also clears the protected-dests set and the
  // per-run pending-promise map.
  ctx._gradientCache = null;
  ctx._protectedGradientDests = undefined;
  ctx._gradientCacheGen = undefined;
  ctx._pendingGradientPromises = Object.create(null);
}

