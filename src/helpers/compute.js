import { logger } from './logger.js';
import { gridPathCells, gridDisk, cellToLatLng, gridDistance } from 'h3-js';
import {
  FRICTION_COSTS,
  WEIGHTS,
  AFFORDANCE,
  DECAY_RATE,
  UPDATE_RATE,
  MAX_EXPECTED_VOLUME,
  SOFT_CAP,
  MAX_SIM_TICKS,
  SIM_TICK_BUFFER,
  COMPUTE_PATH_CACHE_MAX,
  COMPUTE_DISK_CACHE_MAX,
  COMPUTE_VISIBILITY_CACHE_MAX,
  NEIGHBOR_DISK_CACHE_MAX,
  CELL_LATLNG_CACHE_MAX,
  GRADIENT_CACHE_MAX_ENTRIES,
  SIMULATION_PARAMS,
} from './constants.js';
import {
  runGradientBatches,
  runAgentBatches,
  setSpatialWorkerProgressHandler,
  clearSpatialWorkerProgressHandler,
} from './spatialWorker.js';
import {
  computeDijkstra,
  getGradientGraph,
  getGraphNeighborIndicesR1,
  gradientGet,
  gradientReachableCount,
  invalidateGradientGraph,
} from './dijkstra.js';
import { createLCG, strHash } from './rng.js';
import { _bearingFromLatLngs, angleDiff } from './bearing.js';
import {
  gatherCandidates,
  partitionVisibleCone,
  scoreCandidates,
  selectBestCandidate,
  resolveStepLine,
} from './agentStep.js';

// Re-export for backward compatibility with existing code references
export { createLCG as _lcg, strHash as _strHash };

// Module-level lat/lng cache. Uses a Map so its insertion order gives us an
// O(1) LRU for free: on a hit we delete+re-set the key to move it to the
// most-recently-used end, and on eviction we drop the first (oldest) key.
// This replaces the old object+order-array design whose per-hit `indexOf`
// scan was O(n) for a 1024-entry cache.
const _cellLatLngCache = new Map();
// Instrumentation counters for lat/lng cache
let _cellLatLngCacheHits = 0;
let _cellLatLngCacheMisses = 0;

function recordTraversal(pathDesireDeltas, cell) {
  pathDesireDeltas[cell] = (pathDesireDeltas[cell] || 0) + 1;
}

function applyPathDesireDeltas(ctx, pathDesireDeltas) {
  for (const cell in pathDesireDeltas) {
    const v = pathDesireDeltas[cell];
    let newDesire;
    const cs = ctx._cellState?.[cell];
    if (cs) {
      newDesire = (cs.desire ?? 0) + v;
      cs.desire = newDesire;
    } else {
      newDesire = (ctx.pathDesireScores?.[cell] ?? 0) + v;
    }
    ctx.pathDesireScores[cell] = newDesire;
  }
}

// --- Cell state builder: creates/updates per-cell state objects ---
function buildCellStateEntry(
  friction,
  affordanceSource,
  pathDesireSource,
  multiFrictionObj,
  existingState,
  cellKey
) {
  let es = existingState && existingState[cellKey];
  if (es) {
    es.friction = friction;
    es.affordance = affordanceSource !== undefined ? affordanceSource : 0.1;
    es.desire = pathDesireSource ?? 0;
    es.multi = multiFrictionObj !== undefined ? multiFrictionObj : null;
    return es;
  }
  return {
    friction,
    affordance: affordanceSource !== undefined ? affordanceSource : 0.1,
    desire: pathDesireSource ?? 0,
    multi: multiFrictionObj !== undefined ? multiFrictionObj : null,
  };
}

function _getCachedLatLng(cell) {
  const c = _cellLatLngCache.get(cell);
  if (c) {
    _cellLatLngCacheHits++;
    // LRU: re-insert the accessed cell so it moves to the most-recently-used
    // end (Map preserves insertion order). This is O(1) — no index scan.
    _cellLatLngCache.delete(cell);
    _cellLatLngCache.set(cell, c);
    return c;
  }
  const v = cellToLatLng(cell);
  // store degrees and precomputed radians to avoid repeated trig conversions
  const lat = v[0];
  const lng = v[1];
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const stored = [lat, lng, latRad, lngRad];
  _cellLatLngCache.set(cell, stored);
  _cellLatLngCacheMisses++;
  // LRU eviction: drop the least-recently-used entry (the first key in
  // insertion order) once over the cap. No periodic full reset, so useful
  // entries are retained across AOI pans.
  if (_cellLatLngCache.size > CELL_LATLNG_CACHE_MAX) {
    const old = _cellLatLngCache.keys().next().value;
    _cellLatLngCache.delete(old);
  }
  return stored;
}

// Compute-scoped cached wrappers for gridPathCells and gridDisk (attach caches to this)
function _getCachedPathCells(ctx, a, b) {
  // Use a plain-object of plain-objects for fast string-key lookup in hot paths.
  if (!ctx._computePathCacheObj) {
    ctx._computePathCacheObj = Object.create(null);
    ctx._computePathCacheOrder = [];
  }
  if (typeof ctx._computePathCacheHits !== 'number') {
    ctx._computePathCacheHits = 0;
    ctx._computePathCacheMisses = 0;
  }
  // Normalize the key so bidirectional pairs (a,b) and (b,a) share one entry,
  // since gridPathCells(a, b) === gridPathCells(b, a) as an unordered cell list.
  const reversed = a > b;
  const ka = reversed ? b : a;
  const kb = reversed ? a : b;
  let inner = ctx._computePathCacheObj[ka];
  if (inner) {
    const hit = inner[kb];
    if (hit) {
      ctx._computePathCacheHits++;
      return reversed ? hit.slice().reverse() : hit;
    }
  }
  const arr = gridPathCells(ka, kb);
  if (!inner) {
    inner = Object.create(null);
    ctx._computePathCacheObj[ka] = inner;
    ctx._computePathCacheOrder.push(ka);
  }
  inner[kb] = arr;
  ctx._computePathCacheMisses++;
  if (ctx._computePathCacheOrder.length > COMPUTE_PATH_CACHE_MAX) {
    const old = ctx._computePathCacheOrder.shift();
    delete ctx._computePathCacheObj[old];
  }
  return reversed ? arr.slice().reverse() : arr;
}

function _getCachedDisk(ctx, center, r) {
  const visualDepth = ctx?.simulationParams?.visionDepth ?? SIMULATION_PARAMS.visionDepth;
  // VISUAL_DEPTH disks are served from the lazy, generation-keyed cache. This
  // avoids the upfront N×gridDisk cost that used to block the mapping stage.
  if (r === visualDepth) {
    ctx._computeDiskCacheHits++;
    return getNeighborDisk(center, visualDepth, ctx._mappingGeneration ?? 0);
  }

  // Fall back to LRU cache for other radii
  if (!ctx._computeDiskCacheObj) {
    ctx._computeDiskCacheObj = Object.create(null);
    ctx._computeDiskCacheOrder = [];
  }
  if (typeof ctx._computeDiskCacheHits !== 'number') {
    ctx._computeDiskCacheHits = 0;
    ctx._computeDiskCacheMisses = 0;
  }
  let inner = ctx._computeDiskCacheObj[center];
  if (inner) {
    const hit = inner[r];
    if (hit) {
      ctx._computeDiskCacheHits++;
      return hit;
    }
  }
  const arr = gridDisk(center, r);
  if (!inner) {
    inner = Object.create(null);
    ctx._computeDiskCacheObj[center] = inner;
    ctx._computeDiskCacheOrder.push(center);
  }
  inner[r] = arr;
  ctx._computeDiskCacheMisses++;
  if (ctx._computeDiskCacheOrder.length > COMPUTE_DISK_CACHE_MAX) {
    const old = ctx._computeDiskCacheOrder.shift();
    delete ctx._computeDiskCacheObj[old];
  }
  return arr;
}

// Lazy, generation-keyed neighbor-disk cache (uncapped).
// Replaces the upfront `precomputeNeighborDisks` pass that used to run N
// `gridDisk(cell, visionDepth)` calls synchronously during the mapping stage and
// block the main thread. Disks are now computed on first access during the
// simulation and cached, so the mapping stage pays nothing and the total number
// of `gridDisk` calls is unchanged (≤ N distinct cells are ever visited).
let _neighborDiskCache = Object.create(null);
let _neighborDiskOrder = [];
let _neighborDiskGen = -1;
let _neighborDiskDepth = -1;

function getNeighborDisk(cell, visualDepth, gen) {
  if (_neighborDiskGen !== gen || _neighborDiskDepth !== visualDepth) {
    _neighborDiskCache = Object.create(null);
    _neighborDiskOrder = [];
    _neighborDiskGen = gen;
    _neighborDiskDepth = visualDepth;
  }
  let d = _neighborDiskCache[cell];
  if (d === undefined) {
    d = gridDisk(cell, visualDepth);
    _neighborDiskCache[cell] = d;
    _neighborDiskOrder.push(cell);
    if (_neighborDiskOrder.length > NEIGHBOR_DISK_CACHE_MAX) {
      const old = _neighborDiskOrder.shift();
      delete _neighborDiskCache[old];
    }
  }
  return d;
}

// Precompute grid distances for all origin-destination pairs.
// Returns a flat string-keyed map: "origin::dest" → distance (H3 grid units).
// Eliminates per-tick gridDistance calls in runSingleAgentPath termination checks.
function precomputeOriginDestDistances(origins, destinations) {
  const result = Object.create(null);
  for (let i = 0; i < origins.length; i++) {
    const o = origins[i];
    for (let j = 0; j < destinations.length; j++) {
      const d = destinations[j];
      if (o === d) continue;
      result[o + '::' + d] = gridDistance(o, d);
      result[d + '::' + o] = gridDistance(d, o);
    }
  }
  return result;
}

function _getCachedVisibility(ctx, a, b, frictionLookup) {
  // Use precomputed visibility sets when available and fresh
  const precomputed = ctx._precomputedVisibility;
  const currentGen = ctx._mappingGeneration ?? 0;
  if (precomputed && precomputed.gen === currentGen) {
    const visible = precomputed.data[a];
    if (visible) {
      return !!visible[b];
    }
    // Cell not in precomputed set (e.g., outside AOI) — fall through to legacy cache
  }

  ensureVisibilityCacheFresh(ctx);
  // Use plain-object nested cache keyed by a then b for fast boolean lookup
  if (!ctx._visibilityCacheObj) {
    ctx._visibilityCacheObj = Object.create(null);
    ctx._visibilityCacheOrder = [];
  }
  if (typeof ctx._visibilityCacheHits !== 'number') {
    ctx._visibilityCacheHits = 0;
    ctx._visibilityCacheMisses = 0;
  }
  let outer = ctx._visibilityCacheObj[a];
  if (outer) {
    const v = outer[b];
    if (typeof v !== 'undefined') {
      ctx._visibilityCacheHits++;
      return v;
    }
  }
  const path = _getCachedPathCells(ctx, a, b);
  let visible = true;
  for (let i = 0; i < path.length; i++) {
    const c = path[i];
    const f = frictionLookup[c];
    if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) {
      visible = false;
      break;
    }
  }
  // outer may have been created above or may be new
  if (!outer) {
    outer = Object.create(null);
    ctx._visibilityCacheObj[a] = outer;
    ctx._visibilityCacheOrder.push(a);
  }
  outer[b] = visible;
  ctx._visibilityCacheMisses++;
  if (ctx._visibilityCacheOrder.length > COMPUTE_VISIBILITY_CACHE_MAX) {
    const old = ctx._visibilityCacheOrder.shift();
    delete ctx._visibilityCacheObj[old];
  }
  return visible;
}

/** Drop path/disk/visibility caches and gradient fields after friction topology changes. */
export function clearComputeCaches(ctx) {
  // Clear accumulated desire scores and per-cell desire values so they don't carry over
  // between simulation runs when the friction topology changes but _mappingGeneration does not.
  if (ctx.pathDesireScores) {
    for (const k in ctx.pathDesireScores) delete ctx.pathDesireScores[k];
  }
  // Legacy `_cellState` desire reset (kept for callers that still build it).
  if (ctx._cellState) {
    for (const cell in ctx._cellState) {
      const cs = ctx._cellState[cell];
      if (cs && typeof cs.desire === 'number') cs.desire = 0;
    }
  }

  // Drop per-compute data structures
  ctx._gradientCacheObj = null;
  ctx._cellState = null;
  ctx._frictionObj = null;
  ctx._affordanceObj = null;
  ctx._perTargetContribs = null;
  ctx._assignedCounts = null;
  ctx._targetWeights = null;
  // Drop cached hot-path closures — they capture `_frictionObj`/`_affordanceObj`
  // (or a legacy `_cellState`), which are being replaced, so stale closures would
  // read a detached snapshot on the next run.
  ctx._getFriction = null;
  ctx._getAffordance = null;

  // Reset compute cache instrumentation and LRU structures
  ctx._computePathCacheObj = undefined;
  ctx._computePathCacheOrder = undefined;
  ctx._computePathCacheHits = 0;
  ctx._computePathCacheMisses = 0;

  ctx._computeDiskCacheObj = undefined;
  ctx._computeDiskCacheOrder = undefined;
  ctx._computeDiskCacheHits = 0;
  ctx._computeDiskCacheMisses = 0;

  ctx._visibilityCacheObj = undefined;
  ctx._visibilityCacheOrder = undefined;
  ctx._visibilityCacheHits = 0;
  ctx._visibilityCacheMisses = 0;
  ctx._visibilityCacheGen = undefined;

  ctx._cellStateMappingGen = undefined;

  // Clear gradient cache and module-level lat/lng cache
  clearGradientCache(ctx);
  ctx._gradientCacheGen = undefined;
  clearLatLngCache();
  // The gradient graph is keyed by the (stable) cellFrictionMap reference, which
  // the mapping stage reuses in place across remaps. Drop it so the next run
  // rebuilds adjacency from the current friction instead of a stale topology.
  invalidateGradientGraph();
}

/** Clear the module-level lat/lng cache to prevent unbounded memory growth. */
export function clearLatLngCache() {
  _cellLatLngCache.clear();
  _cellLatLngCacheHits = 0;
  _cellLatLngCacheMisses = 0;
}

function ensureVisibilityCacheFresh(ctx) {
  const gen = ctx._mappingGeneration ?? 0;
  if (ctx._visibilityCacheGen !== gen) {
    ctx._visibilityCacheObj = undefined;
    ctx._visibilityCacheOrder = undefined;
    ctx._visibilityCacheGen = gen;
  }
}

function ensureGradientCacheFresh(ctx) {
  const gen = ctx._mappingGeneration ?? 0;
  if (ctx._gradientCacheGen !== gen) {
    clearGradientCache(ctx);
    ctx._gradientCacheGen = gen;
  }
}

function estimateMaxTicks(origin, dest, hexCount) {
  const dist = gridDistance(origin, dest);
  const pathBudget = Math.max(64, dist * SIM_TICK_BUFFER + 32);
  const globalBudget = 2 * Math.ceil(Math.sqrt(hexCount * Math.PI));
  return Math.min(MAX_SIM_TICKS, pathBudget, globalBudget);
}

export async function yieldToMain() {
  const scheduler = globalThis.scheduler;
  if (scheduler && typeof scheduler.yield === 'function') {
    await scheduler.yield();
  } else {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Paper §3.4: face the steepest descent neighbor on the goal gradient field. */
function getGradientDirection(ctx, curr, gradientObj, bearingMap) {
  if (!gradientObj) return null;
  // Build the gradient graph once; its cellToIdx is what indexes the typed-array
  // gradient (M1). The graph is cached per friction source, so this is cheap.
  const graph = getGradientGraph(ctx.cellFrictionMap, ctx._r1Adjacency, ctx._viewHexes);
  const gCurr = gradientGet(gradientObj, curr, graph);
  if (typeof gCurr !== 'number') return null;

  // Reuse the canonical gradient graph's r=1 adjacency (CSR) instead of a
  // separate gridDisk(cell, 1) call — same passable, in-AOI neighbor set.
  // Iterate neighbor *indices* (zero-copy CSR view) and map back to cell ids via
  // `idxToCell`; this drops the old `cellNeighbors` string-array materialization.
  const nbrIdxs = getGraphNeighborIndicesR1(graph, curr);
  const idxToCell = graph.idxToCell;
  // _frictionObj is always the canonical lookup — already built once per sim run.
  // Direct property access on plain object is faster than iterating Map.entries().
  const frictionLookup = ctx._frictionObj;
  const cellState = ctx._cellState;
  let bestNeighbor = null;
  let bestGrad = gCurr;

  for (let i = 0; i < nbrIdxs.length; i++) {
    const n = idxToCell[nbrIdxs[i]];
    if (n === curr) continue;
    // Prefer _cellState.friction (updated during sim); fall back to frictionLookup.
    let f = cellState?.[n]?.friction ?? frictionLookup?.[n];
    if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) continue;
    const gN = gradientGet(gradientObj, n, graph);
    if (typeof gN !== 'number') continue;
    if (gN < bestGrad) {
      bestGrad = gN;
      bestNeighbor = n;
    }
  }

  return bestNeighbor ? getBearingFast(ctx, curr, bestNeighbor, bearingMap) : null;
}

/**
 * Shared agent path kernel used by batch simulation and incremental APIs.
 * Returns traversed cells in order (including origin).
 */
function runSingleAgentPath(
  ctx,
  {
    originCell,
    destCell,
    destGradientObj,
    maxTicks,
    simAgentId,
    pathDesireDeltas = null,
    applyWear = false,
    accumulatedFootprints = null,
    bearingMap = null,
    originDestDistances = null,
  }
) {
  let simCurrent = originCell;
  const simTarget = destCell;

  // Precomputed distance check — eliminates per-tick gridDistance H3 call.
  // The table is keyed only by node pairs, so the per-tick
  // `simCurrent + '::' + destCell` lookup can only hit when `simCurrent` is a
  // node. Build a node set once (not per tick) and gate the lookup on it:
  // byte-identical to the old "always concat + read" path, but skips the string
  // allocation + object read for the intermediate cells (the vast majority).
  let nodeSet = null;
  if (originDestDistances) {
    nodeSet = new Set();
    for (const key in originDestDistances) {
      const sep = key.indexOf('::');
      if (sep > 0) {
        nodeSet.add(key.slice(0, sep));
        nodeSet.add(key.slice(sep + 2));
      }
    }
  }
  let distToTarget = 0;
  if (originDestDistances) {
    const d = originDestDistances[originCell + '::' + destCell];
    if (typeof d === 'number') distToTarget = d;
  }

  let simDirection =
    getGradientDirection(ctx, simCurrent, destGradientObj, bearingMap) ??
    getBearingFast(ctx, simCurrent, simTarget, bearingMap);
  const simPath = [originCell];

  if (pathDesireDeltas) recordTraversal(pathDesireDeltas, originCell);
  if (applyWear) updateAffordance(ctx, originCell, 1);

  // _frictionObj is the canonical lookup — already built once per sim run.
  const frictionLookup = ctx._frictionObj;
  const cellState = ctx._cellState;

  for (let tick = 0; tick < maxTicks; tick++) {
    // Update dynamic distance to target — the precomputed origin-to-destination
    // distance becomes stale if the agent takes a detour around obstacles.
    // Gated on `nodeSet` (byte-identical: the table is node-only, so the lookup
    // can only hit when `simCurrent` is a node) to skip the per-tick string
    // concat + object read for intermediate cells.
    if (originDestDistances) {
      if (nodeSet && nodeSet.has(simCurrent)) {
        const currentDist = originDestDistances[simCurrent + '::' + destCell];
        if (typeof currentDist === 'number') distToTarget = currentDist;
      }
    } else {
      distToTarget = gridDistance(simCurrent, simTarget);
    }

    // Use dynamic distance check — eliminates stale precomputed distance bug
    if (distToTarget <= 1) {
      if (simTarget !== simCurrent) {
        simPath.push(simTarget);
        if (pathDesireDeltas) recordTraversal(pathDesireDeltas, simTarget);
        if (applyWear) updateAffordance(ctx, simTarget, 1);
      }
      break;
    }

    const nextStep = getBestNextStep(
      ctx,
      simCurrent,
      destGradientObj,
      simDirection,
      simAgentId,
      accumulatedFootprints,
      bearingMap
    );
    if (!nextStep || nextStep === simCurrent) break;

    // Walk toward nextStep. Prefer the straight H3 line, but if it is blocked
    // by an impassable cell or would cut a building corner, route a local
    // detour around the obstacle so the agent walks *around* the corner
    // instead of jumping over it or stalling against the building.
    const line = _resolveStepLine(ctx, simCurrent, nextStep, frictionLookup, cellState);
    let hitTarget = false;
    let lastReached = simCurrent;
    for (let i = 1; i < line.length; i++) {
      const stepCell = line[i];
      const stepState = cellState && cellState[stepCell];
      const f = stepState ? stepState.friction : frictionLookup[stepCell];
      if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) break;
      simPath.push(stepCell);
      if (pathDesireDeltas) recordTraversal(pathDesireDeltas, stepCell);
      if (applyWear) updateAffordance(ctx, stepCell, 1);
      lastReached = stepCell;
      if (stepCell === simTarget) {
        hitTarget = true;
        break;
      }
    }

    if (hitTarget) break;

    // Use precomputed bearing map — eliminates trig call per direction update
    simDirection = getBearingFast(ctx, simCurrent, nextStep, bearingMap);
    simCurrent = lastReached;
    if (simCurrent === simTarget) break;
  }

  return simPath;
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
  // This fresh object is the authoritative desire reset now that `_cellState` is
  // not built (M5); the legacy `_cellState` zeroing below is a no-op in production
  // and kept only for callers/tests that still construct `_cellState`.
  state.pathDesireScores = Object.create(null);

  if (state._cellState) {
    for (const cell in state._cellState) {
      const cs = state._cellState[cell];
      if (cs && typeof cs.desire === 'number') cs.desire = 0;
    }
  }

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
  ensureVisibilityCacheFresh(state);

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

  // M5: the per-cell `_cellState` object is no longer built. friction lives in
  // `_frictionObj` (mirror of `cellFrictionMap`), affordance in `_affordanceObj`,
  // and desire in `pathDesireScores` — the exact flat lookups the batch sim path
  // already consumes (`runAgentBatches` is called with `_frictionObj`/`_affordanceObj`
  // below, and `computeAgentBatch` passes `cellState=null`). Every remaining
  // `_cellState` reader keeps its `cellState?.[cell] ?? flatObj[cell]` fallback,
  // so dropping the ~V per-cell objects is byte-identical and saves steady-state
  // memory. `_affordanceObj` is guaranteed present here (built by grid.js mapCells,
  // or from `affordanceMap` on the incremental path).

  // Grass recovery between user-triggered simulation runs (not after wear in the
  // same pass). Iterate the friction-object key set (the exact cells the old
  // `_cellState` covered). decayAffordance reads/writes `_affordanceObj` when no
  // `_cellState` is present, so the effect is identical.
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
  const accumulatedFootprints = Object.create(null);

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

    const agentResults = await runAgentBatches(
      plan,
      state._frictionObj || state.cellFrictionMap,
      goalGradients,
      state._affordanceObj || state.affordanceMap,
      hexes,
      {
        visibilityEntries: state._precomputedVisibility?.data || null,
        accumulatedFootprints,
        originDestDistances: odDistances,
        bearingMap: state._precomputedBearings?.data || null,
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
 * Tactical Decision: BDI (Belief-Desire-Intention)(Section 3.3/2.4)
 */
function getBestNextStep(
  ctx,
  curr,
  gradient,
  currentDirection,
  agentId = '',
  accumulatedFootprints = null,
  bearingMap = null
) {
  const simParams = ctx.simulationParams || SIMULATION_PARAMS;
  const affordanceLookup = ctx._affordanceObj;
  // `weights` depends only on simParams; cache it on ctx and rebuild only when
  // the relevant params change (getBestNextStep runs millions of times per sim,
  // so allocating this object every call is pure GC churn).
  const wKey = simParams.affordanceWeight + ':' + simParams.distancePenalty;
  let weights = ctx._bestNextWeights;
  if (!weights || ctx._bestNextWeightsKey !== wKey) {
    weights = {
      w_a: simParams.affordanceWeight,
      w_d: simParams.distancePenalty,
      w_theta: WEIGHTS.w_theta,
    };
    ctx._bestNextWeights = weights;
    ctx._bestNextWeightsKey = wKey;
  }
  const impassableVal = FRICTION_COSTS.IMPASSABLE;
  const visualAngleHalf = simParams.fieldOfView / 2;

  const cellState = ctx._cellState || null;
  const stateEnabled = !!cellState;

  // _frictionObj is the canonical lookup — already built once per sim run.
  // For tests/incremental paths where it may not exist, build lazily (non-IIFE).
  let frictionLookup = ctx._frictionObj;
  if (!frictionLookup && ctx.cellFrictionMap) {
    frictionLookup = Object.create(null);
    for (const [k, v] of ctx.cellFrictionMap) frictionLookup[k] = v;
    ctx._frictionObj = frictionLookup;
  }

  const disk = _getCachedDisk(ctx, curr, simParams.visionDepth);
  const sLatLng = _getCachedLatLng(curr);
  // Build the gradient graph once (cached per friction source) so the typed-array
  // gradient (M1) can be indexed by cellToIdx. Cheap after the first call.
  const graph = getGradientGraph(ctx.cellFrictionMap, ctx._r1Adjacency, ctx._viewHexes);
  const gradientLookup = gradient ? (n) => gradientGet(gradient, n, graph) : null;
  const gCurr = gradientLookup ? gradientLookup(curr) : undefined;
  const useGradient = typeof gCurr === 'number';

  // Hoist friction/affordance lookups out of the per-call hot path. They only
  // depend on cellState/frictionLookup/affordanceLookup, which are stable for
  // the lifetime of a sim run, so build them once and cache on ctx instead of
  // re-allocating two closures on every one of the millions of invocations.
  let getFriction = ctx._getFriction;
  let getAffordance = ctx._getAffordance;
  if (!getFriction || !getAffordance) {
    getFriction = stateEnabled
      ? (n) => {
          const s = cellState[n];
          return s ? s.friction : undefined;
        }
      : (n) => frictionLookup[n];
    getAffordance = stateEnabled
      ? (n) => {
          const s = cellState[n];
          return s ? (s.affordance ?? 0.1) : 0.1;
        }
      : (n) => affordanceLookup?.[n] ?? 0.1;
    ctx._getFriction = getFriction;
    ctx._getAffordance = getAffordance;
  }

  // Reuse preallocated candidate buffers across calls instead of allocating
  // fresh arrays on every invocation. cells are H3 strings (no typed-array
  // equivalent), so cellsArr stays a plain array; the numeric sets use
  // Float64Arrays. Buffers are grown only when a larger disk is encountered.
  const diskLen = disk.length;
  let cellsArr = ctx._candCells;
  let anglesArr = ctx._candAngles;
  let affsArr = ctx._candAffs;
  let frictionArr = ctx._candFriction;
  let gNsArr = ctx._candGNs;
  if (!cellsArr || cellsArr.length < diskLen) {
    cellsArr = new Array(diskLen);
    anglesArr = new Float64Array(diskLen);
    affsArr = new Float64Array(diskLen);
    frictionArr = new Float64Array(diskLen);
    gNsArr = new Float64Array(diskLen);
    ctx._candCells = cellsArr;
    ctx._candAngles = anglesArr;
    ctx._candAffs = affsArr;
    ctx._candFriction = frictionArr;
    ctx._candGNs = gNsArr;
  }
  // `isVisible` only closes over `frictionLookup` (stable per run). Cache it on
  // ctx, rebuilding only if the friction source changes (e.g. a remap that
  // swaps in a different _frictionObj). Avoids a closure allocation on every
  // one of the millions of getBestNextStep invocations.
  let isVisible = ctx._isVisibleFn;
  if (!isVisible || ctx._isVisibleFrictionLookup !== frictionLookup) {
    isVisible = (a, b) => _getCachedVisibility(ctx, a, b, frictionLookup);
    ctx._isVisibleFn = isVisible;
    ctx._isVisibleFrictionLookup = frictionLookup;
  }
  // `computeAngle` closes over `bearingMap` (stable per run); `curr` and
  // `currentDirection` vary per call, so they are passed as arguments. Cache the
  // closure on ctx, rebuilding only when the bearing map changes.
  let computeAngle = ctx._computeAngleFn;
  if (!computeAngle || ctx._computeAngleBearingMap !== bearingMap) {
    computeAngle = (n, sLatLng, currentDirection, curr) => {
      if (bearingMap) {
        const bng = bearingMap.get?.(curr + '::' + n);
        if (typeof bng === 'number') return angleDiff(bng, currentDirection);
      }
      const eLatLng = _getCachedLatLng(n);
      return angleDiff(_bearingFromLatLngs(sLatLng, eLatLng), currentDirection);
    };
    ctx._computeAngleFn = computeAngle;
    ctx._computeAngleBearingMap = bearingMap;
  }

  const candCount = gatherCandidates({
    disk,
    curr,
    getFriction,
    isVisible,
    computeAngle,
    getAffordance,
    gradientLookup,
    useGradient,
    impassableVal,
    cellsArr,
    anglesArr,
    affsArr,
    frictionArr,
    gNsArr,
    sLatLng,
    currentDirection,
  });

  const hardCount = partitionVisibleCone({
    cellsArr,
    anglesArr,
    affsArr,
    frictionArr,
    gNsArr,
    useGradient,
    cLen: candCount,
    visualAngleHalf,
  });
  const cLen = hardCount > 0 ? hardCount : candCount;
  let scores = null;
  if (useGradient) {
    scores = ctx._candScores;
    if (!scores || scores.length < cLen) {
      scores = new Float64Array(cLen);
      ctx._candScores = scores;
    }
  }

  if (useGradient) {
    scoreCandidates({
      cLen,
      gNsArr,
      affsArr,
      frictionArr,
      anglesArr,
      cellsArr,
      weights,
      gCurr,
      accumulatedFootprints,
      scores,
    });
  }

  if (ctx.debugCompute) {
    try {
      const dbg = [];
      for (let i = 0; i < cLen; i++) {
        const s = scores?.[i];
        if (typeof s === 'number') dbg.push({ cell: cellsArr[i], S_ij: s });
      }
      dbg.sort((a, b) => b.S_ij - a.S_ij);
      console.log('getBestNextStep: candidates', { curr, topCandidates: dbg.slice(0, 12) });
    } catch (_e) {
      // debug logging is non-critical
    }
  }

  if (candCount === 0) {
    // depth=1 reuses the canonical graph's r=1 adjacency (CSR indices); deeper
    // rings fall back to the disk cache (the graph only encodes distance-1 edges).
    const graph = getGradientGraph(ctx.cellFrictionMap, ctx._r1Adjacency, ctx._viewHexes);
    const idxToCell = graph.idxToCell;
    for (let depth = 1; depth <= 3; depth++) {
      const nbrIdxs = depth === 1 ? getGraphNeighborIndicesR1(graph, curr) : null;
      const disk = depth === 1 ? null : _getCachedDisk(ctx, curr, depth);
      const count = nbrIdxs ? nbrIdxs.length : disk.length;
      let bestGrad = Infinity;
      let bestCandidate = null;

      for (let i = 0; i < count; i++) {
        const n = nbrIdxs ? idxToCell[nbrIdxs[i]] : disk[i];
        if (n === curr) continue;
        const f = getFriction(n);
        if (f === undefined || f >= impassableVal) continue;
        if (!_getCachedVisibility(ctx, curr, n, frictionLookup)) continue;

        const eLatLng = _getCachedLatLng(n);
        let ang;
        if (bearingMap) {
          const bng = bearingMap.get?.(curr + '::' + n);
          if (typeof bng === 'number') {
            ang = angleDiff(bng, currentDirection);
          } else {
            ang = angleDiff(_bearingFromLatLngs(sLatLng, eLatLng), currentDirection);
          }
        } else {
          ang = angleDiff(_bearingFromLatLngs(sLatLng, eLatLng), currentDirection);
        }
        if (ang > visualAngleHalf) continue;

        const g = gradientLookup ? (gradientLookup(n) ?? Infinity) : (gradientGet(gradient, n, graph) ?? Infinity);
        if (g < bestGrad) {
          bestGrad = g;
          bestCandidate = n;
        }
      }
      if (bestCandidate) {
        if (ctx.debugCompute) {
          try {
            console.log('getBestNextStep:fallback', { curr, depth, bestCandidate, bestGrad });
          } catch (_e) {
            // debug logging is non-critical
          }
        }
        return getBearingFast(ctx, curr, bestCandidate, bearingMap);
      }
    }
    return null;
  }

  const hasValidScores = useGradient && scores?.length > 0 && typeof scores[0] === 'number';
  if (hasValidScores && typeof simParams.temperature === 'number' && simParams.temperature > 0) {
    const seed = strHash(agentId + ':' + curr);
    const rng = createLCG(seed);
    let maxS = -Infinity;
    for (let i = 0; i < scores.length; i++) {
      const v = scores[i];
      if (v > maxS) maxS = v;
    }

    let weightsArr = ctx._candWeights;
    if (!weightsArr || weightsArr.length < scores.length) {
      weightsArr = new Float64Array(scores.length);
      ctx._candWeights = weightsArr;
    }
    let sum = 0;
    for (let i = 0; i < scores.length; i++) {
      const w = Math.exp((scores[i] - maxS) / simParams.temperature);
      weightsArr[i] = w;
      sum += w;
    }

    // Guard against non-finite sum (temperature too small → overflow to Infinity)
    if (!isFinite(sum) || sum === 0) {
      // Fallback: return the cell with the highest score
      let bestIdx = 0;
      let bestVal = scores[0];
      for (let i = 1; i < scores.length; i++) {
        if (scores[i] > bestVal) {
          bestVal = scores[i];
          bestIdx = i;
        }
      }
      return cellsArr[bestIdx];
    }

    const r = rng() * sum;
    let acc = 0;
    for (let i = 0; i < scores.length; i++) {
      acc += weightsArr[i];
      if (r <= acc) {
        const chosen = cellsArr[i];
        if (ctx.debugCompute) {
          try {
            console.log('getBestNextStep: sampled', { curr, chosen, chosenScore: scores[i] });
          } catch (_e) {
            // debug logging is non-critical
          }
        }
        return chosen;
      }
    }
    return cellsArr[cLen - 1];
  }

  const bestIndex = selectBestCandidate({
    cLen,
    scores,
    affsArr,
    frictionArr,
    gNsArr,
    useGradient,
    accumulatedFootprints,
    cellsArr,
    curr,
  });

  const chosen = bestIndex >= 0 ? cellsArr[bestIndex] : null;
  if (ctx.debugCompute) {
    try {
      console.log('getBestNextStep: chosen', { curr, chosen });
    } catch (_e) {
      // debug logging is non-critical
    }
  }

  return chosen;
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

  const cellState = ctx._cellState || null;
  const stateEnabled = !!cellState;

  const getFriction = stateEnabled
    ? (n) => {
        const s = cellState[n];
        return s ? s.friction : undefined;
      }
    : (n) => frictionLookup?.[n];

  // Reuse the precomputed gradient graph (CSR adjacency) keyed by the stable
  // cellFrictionMap reference. Topology is static per mapping generation; only
  // the per-cell friction (which can change via emergent wear) is rebuilt.
  const graph = getGradientGraph(ctx.cellFrictionMap, ctx._r1Adjacency, ctx._viewHexes);
  return computeDijkstra(targetCell, getFriction, null, graph);
}

/**
 * Geometric Helpers (Visibility & Bearing)
 */
function isVisible(ctx, start, end) {
  // _frictionObj is the canonical lookup; build once from cellFrictionMap if absent.
  // Using a simple check (not IIFE) to avoid repeated overhead in hot path.
  let frictionLookup = ctx._frictionObj;
  if (!frictionLookup && ctx.cellFrictionMap) {
    frictionLookup = Object.create(null);
    for (const [k, v] of ctx.cellFrictionMap) frictionLookup[k] = v;
    ctx._frictionObj = frictionLookup;
  }
  return _getCachedVisibility(ctx, start, end, frictionLookup);
}

// Resolve the actual cell-by-cell line the agent walks from `curr` to
// `nextStep`. Thin adapter over the shared `resolveStepLine` (agentStep.js) —
// the obstacle-avoidance geometry lives there so this kernel and the worker
// kernel cannot drift. The cache-accessor closures are memoized on ctx so no
// closures are allocated on the hot per-step path.
function _resolveStepLine(ctx, curr, nextStep, frictionLookup, cellState) {
  let getPathCells = ctx._rslGetPathCells;
  let getDisk = ctx._rslGetDisk;
  if (!getPathCells || !getDisk) {
    getPathCells = (a, b) => _getCachedPathCells(ctx, a, b);
    getDisk = (center, r) => _getCachedDisk(ctx, center, r);
    ctx._rslGetPathCells = getPathCells;
    ctx._rslGetDisk = getDisk;
  }
  const graph = getGradientGraph(ctx.cellFrictionMap, ctx._r1Adjacency, ctx._viewHexes);
  return resolveStepLine({
    curr,
    nextStep,
    frictionLookup,
    cellState,
    getPathCells,
    getDisk,
    graph,
    impassableVal: FRICTION_COSTS.IMPASSABLE,
  });
}

// Returns true if the straight H3 line from `curr` to `n` would cut across an
// impassable cell at any diagonal transition. Used to reject `nextStep`
// candidates the agent cannot actually reach without jumping a building corner.
function getBearing(start, end) {
  const s = _getCachedLatLng(start);
  const e = _getCachedLatLng(end);
  return _bearingFromLatLngs(s, e);
}

// Fast bearing lookup: uses precomputed bearing map when available,
// falls back to trig-based calculation otherwise.
function getBearingFast(ctx, a, b, bearingMap) {
  if (bearingMap) {
    const bng = bearingMap.get?.(a + '::' + b);
    if (typeof bng === 'number') return bng;
  }
  // Fallback: compute via lat/lng (expensive, called rarely for uncached pairs)
  const s = _getCachedLatLng(a);
  const e = _getCachedLatLng(b);
  return _bearingFromLatLngs(s, e);
}

/**
 * Terrain-Aware Update
 * HEAVY_GRASS takes more effort (less wear) to start a path
 * LIGHT_PARK is easily worn (more wear)
 */
function updateAffordance(ctx, cell, volume = 1) {
  const cs = ctx._cellState?.[cell];
  const friction = cs?.friction ?? ctx._frictionObj?.[cell];

  // Skip update for permanent infrastructure
  if (friction === FRICTION_COSTS.PAVEMENT || friction === FRICTION_COSTS.IMPASSABLE) return;

  const resistanceFactor = friction === FRICTION_COSTS.HEAVY_GRASS ? 1.5 : 0.8;
  const current = cs?.affordance ?? ctx._affordanceObj?.[cell] ?? 0.1;
  const newVal = Math.min(
    SOFT_CAP,
    current + (volume * UPDATE_RATE) / (MAX_EXPECTED_VOLUME * resistanceFactor)
  );

  if (cs) cs.affordance = newVal;
  if (ctx._affordanceObj) ctx._affordanceObj[cell] = newVal;
}

/**
 * Terrain-Aware Decay
 * HEAVY_GRASS recovers slower (more persistent path)
 * LIGHT_PARK recovers faster (path fades quickly)
 */
function decayAffordance(ctx, cell) {
  const cs = ctx._cellState?.[cell];
  const friction = cs?.friction ?? ctx._frictionObj?.[cell];

  if (friction === FRICTION_COSTS.PAVEMENT || friction === FRICTION_COSTS.IMPASSABLE) return;

  const recoveryFactor = friction === FRICTION_COSTS.HEAVY_GRASS ? 0.5 : 1.5;
  const current = cs?.affordance ?? ctx._affordanceObj?.[cell] ?? 0.1;
  // Exponential decay: vegetation recovers quickly at first, then slows as
  // roots reestablish — producing a realistic non-linear persistence curve.
  // Heavy grass (recoveryFactor 0.5) decays slower than light park (1.5).
  const newVal = Math.max(0.1, current * Math.exp(-DECAY_RATE * recoveryFactor));

  if (cs) cs.affordance = newVal;
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

    // Keep the authoritative flat affordance snapshot in sync (M5 — this is what
    // the sim path reads now that `_cellState` is not built). Previously this
    // function only refreshed `_cellState`, leaving `_affordanceObj` stale.
    if (ctx._affordanceObj) ctx._affordanceObj[cell] = affordance;

    // Legacy `_cellState` support retained for callers/tests that still construct
    // it; production no longer builds `_cellState`, so this block is skipped.
    if (ctx._cellState) {
      const cs = ctx._cellState[cell];
      const existingDesire = cs ? cs.desire : 0;
      const existingMulti = cs ? cs.multi : null;
      ctx._cellState[cell] = buildCellStateEntry(
        friction,
        affordance,
        existingDesire,
        existingMulti,
        ctx._cellState,
        cell
      );
    }
  }
}

// Expose some internals for debugging and testing
export {
  getBestNextStep as _getBestNextStep,
  computeDijkstraGradient as _computeDijkstraGradient,
  getBearing as _getBearing,
  getGradientDirection as _getGradientDirection,
  runSingleAgentPath as _runSingleAgentPath,
  angleDiff as _angleDiff,
  isVisible as _isVisible,
  estimateMaxTicks as _estimateMaxTicks,
  yieldToMain as _yieldToMain,
  buildCellStateEntry,
  precomputeOriginDestDistances,
};

// Diagnostic helper to inspect cache instrumentation
export function getComputeCacheStats(ctx = {}) {
  return {
    cellLatLngCacheSize: _cellLatLngCache.size,
    cellLatLngCacheHits: _cellLatLngCacheHits,
    cellLatLngCacheMisses: _cellLatLngCacheMisses,
    computePathCacheSize: ctx._computePathCacheObj
      ? Object.keys(ctx._computePathCacheObj).length
      : ctx._computePathCache
        ? ctx._computePathCache.size
        : 0,
    computePathCacheHits: ctx._computePathCacheHits || 0,
    computePathCacheMisses: ctx._computePathCacheMisses || 0,
    computeDiskCacheSize: ctx._computeDiskCacheObj
      ? Object.keys(ctx._computeDiskCacheObj).length
      : ctx._computeDiskCache
        ? ctx._computeDiskCache.size
        : 0,
    computeDiskCacheHits: ctx._computeDiskCacheHits || 0,
    computeDiskCacheMisses: ctx._computeDiskCacheMisses || 0,
    visibilityCacheSize: ctx._visibilityCacheObj
      ? Object.keys(ctx._visibilityCacheObj).length
      : ctx._visibilityCache
        ? ctx._visibilityCache.size
        : 0,
    visibilityCacheHits: ctx._visibilityCacheHits || 0,
    visibilityCacheMisses: ctx._visibilityCacheMisses || 0,
  };
}

// Gradient cache helpers: compute, inspect, and clear per-target gradients.
export function computeAndCacheGradient(ctx, targetCell) {
  if (!ctx._gradientCacheObj) ctx._gradientCacheObj = Object.create(null);
  const order = ctx._gradientCacheOrder;

  // Promote to most-recently-used (remove from old position and push to end)
  if (order && order.includes(targetCell)) {
    const idx = order.indexOf(targetCell);
    order.splice(idx, 1);
  } else if (order) {
    // Evict least-recently-used when at capacity
    while (order.length >= GRADIENT_CACHE_MAX_ENTRIES) {
      const evicted = order.shift();
      delete ctx._gradientCacheObj[evicted];
    }
  }

  const g = computeDijkstraGradient(ctx, targetCell);
  ctx._gradientCacheObj[targetCell] = g;
  if (!order) ctx._gradientCacheOrder = [targetCell];
  else order.push(targetCell);
  return g;
}

export function getCachedGradient(ctx, targetCell) {
  return ctx._gradientCacheObj ? ctx._gradientCacheObj[targetCell] : undefined;
}

export function clearGradientCache(ctx) {
  ctx._gradientCacheObj = Object.create(null);
  ctx._gradientCacheOrder = undefined;
  ctx._gradientCacheGen = undefined;
  ctx._pendingGradientPromises = Object.create(null);
}

// --- Incremental assignment & contribution helpers ---
function _computeAssignedCounts(ctx) {
  const graph = getGradientGraph(ctx.cellFrictionMap, ctx._r1Adjacency, ctx._viewHexes);
  const agentsPerWeightUnit =
    ctx.simulationParams?.agentsPerWeightUnit ?? SIMULATION_PARAMS.agentsPerWeightUnit;
  const destinations = Object.keys(ctx.simulationNodes).filter((k) =>
    ['destination', 'dual'].includes(ctx.simulationNodes[k].type)
  );
  const origins = Object.keys(ctx.simulationNodes).filter((k) =>
    ['origin', 'dual'].includes(ctx.simulationNodes[k].type)
  );

  if (!ctx._gradientCacheObj) ctx._gradientCacheObj = Object.create(null);
  // ensure gradients exist for reachability checks
  for (const d of destinations) {
    if (!ctx._gradientCacheObj[d]) computeAndCacheGradient(ctx, d);
  }

  const assigned = Object.create(null);
  for (const o of origins) {
    assigned[o] = Object.create(null);
    const totalVolume = Math.max(
      1,
      Math.round((ctx.simulationNodes[o]?.weight || 1) * agentsPerWeightUnit)
    );

    const destCandidates = [];
    let destWeightSum = 0;
    for (const d of destinations) {
      if (d === o) continue;
      const grad = ctx._gradientCacheObj[d];
      if (!grad) continue;
      if (!isFinite(gradientGet(grad, o, graph))) continue;
      const w = ctx.simulationNodes[d]?.weight || 1;
      destCandidates.push({ dest: d, weight: w });
      destWeightSum += w;
    }
    if (destCandidates.length === 0) continue;

    const floats = destCandidates.map((c) => (c.weight / destWeightSum) * totalVolume);
    const floors = floats.map((f) => Math.floor(f));
    const assignedArr = floors.slice();
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
      for (let k = 0; k < leftover; k++) assignedArr[frac[k].i] += 1;
    }

    for (let i = 0; i < destCandidates.length; i++) {
      assigned[o][destCandidates[i].dest] = assignedArr[i] || 0;
    }
  }
  return assigned;
}

function _recomputeTargetContribs(ctx, targetCell, newAssignedCounts) {
  ensureGradientCacheFresh(ctx);
  if (!ctx._gradientCacheObj) ctx._gradientCacheObj = Object.create(null);
  if (!ctx._gradientCacheObj[targetCell]) computeAndCacheGradient(ctx, targetCell);
  // _gradientCacheObj always stores plain objects
  const destGradientObj = ctx._gradientCacheObj[targetCell];

  // Ensure snapshot state exists for safe inner-loop reads. `runSingleAgentPath`
  // reads friction/affordance via `cellState?.[cell] ?? _frictionObj/_affordanceObj`,
  // so the flat objects below are the authoritative source (M5 — no `_cellState`).
  if (!ctx._frictionObj) {
    ctx._frictionObj = Object.create(null);
    for (const [k, v] of ctx.cellFrictionMap) ctx._frictionObj[k] = v;
  }
  if (!ctx._affordanceObj) {
    ctx._affordanceObj = Object.create(null);
    for (const [k, v] of ctx.affordanceMap) ctx._affordanceObj[k] = v;
  }

  const origins = Object.keys(ctx.simulationNodes).filter((k) =>
    ['origin', 'dual'].includes(ctx.simulationNodes[k].type)
  );
  const perTarget = Object.create(null);
  const hexCount = ctx.cellFrictionMap?.size || 1;

  for (const o of origins) {
    const count = (newAssignedCounts[o] && newAssignedCounts[o][targetCell]) || 0;
    if (!count || count <= 0) continue;
    const maxTicks = estimateMaxTicks(o, targetCell, hexCount);

    for (let sim = 0; sim < count; sim++) {
      const simAgentId = `${o}:${targetCell}:${sim}`;
      const simPath = runSingleAgentPath(ctx, {
        originCell: o,
        destCell: targetCell,
        destGradientObj,
        maxTicks,
        simAgentId,
        applyWear: false,
        accumulatedFootprints: null, // incremental API — not part of main ABM loop
        bearingMap: ctx._precomputedBearings?.data || null,
        originDestDistances: precomputeOriginDestDistances([o], [targetCell]),
      });

      for (let p = 0; p < simPath.length; p++) {
        const cell = simPath[p];
        perTarget[cell] = (perTarget[cell] || 0) + 1;
      }
    }
  }

  return perTarget;
}

function _applyTargetContribDelta(ctx, targetCell, newContribs) {
  const oldContribs =
    ctx._perTargetContribs && ctx._perTargetContribs[targetCell]
      ? ctx._perTargetContribs[targetCell]
      : Object.create(null);
  const keys = new Set([...Object.keys(newContribs || {}), ...Object.keys(oldContribs || {})]);
  const affected = new Set();

  for (const cell of keys) {
    const oldV = oldContribs[cell] || 0;
    const newV = (newContribs && newContribs[cell]) || 0;
    const delta = newV - oldV;
    if (delta === 0) continue;
    affected.add(cell);

    if (ctx._cellState && ctx._cellState[cell]) {
      ctx._cellState[cell].desire = (ctx._cellState[cell].desire || 0) + delta;
      const newDes = ctx._cellState[cell].desire;
      if (ctx.pathDesireScores) ctx.pathDesireScores[cell] = newDes;
    } else {
      const cur = ctx.pathDesireScores?.[cell] || 0;
      if (ctx.pathDesireScores) ctx.pathDesireScores[cell] = cur + delta;
    }
  }

  // persist new contrib snapshot (or remove if empty)
  if (newContribs && Object.keys(newContribs).length > 0)
    ctx._perTargetContribs[targetCell] = newContribs;
  else if (ctx._perTargetContribs) delete ctx._perTargetContribs[targetCell];

  return affected;
}

function _recomputeAffordanceForCells(ctx, cells) {
  if (!cells || cells.size === 0) return;
  // _frictionObj is the canonical lookup; build it once from cellFrictionMap if absent
  const frictionLookup =
    ctx._frictionObj ||
    (() => {
      const obj = Object.create(null);
      for (const [k, v] of ctx.cellFrictionMap || []) obj[k] = v;
      return (ctx._frictionObj = obj);
    })();
  const cellState = ctx._cellState || null;
  const stateEnabled = !!cellState;

  for (const cell of cells) {
    // aggregate totalVolume across all targets
    let totalVolume = 0;
    if (ctx._perTargetContribs) {
      for (const t in ctx._perTargetContribs) {
        if (ctx._perTargetContribs[t] && ctx._perTargetContribs[t][cell])
          totalVolume += ctx._perTargetContribs[t][cell];
      }
    }

    let friction;
    if (stateEnabled && cellState[cell] && typeof cellState[cell].friction !== 'undefined')
      friction = cellState[cell].friction;
    else friction = frictionLookup[cell];

    if (friction === FRICTION_COSTS.PAVEMENT || friction === FRICTION_COSTS.IMPASSABLE) continue;
    const resistanceFactor = friction === FRICTION_COSTS.HEAVY_GRASS ? 1.5 : 0.8;
    const wear = (totalVolume * UPDATE_RATE) / (MAX_EXPECTED_VOLUME * resistanceFactor);
    const newVal = Math.min(SOFT_CAP, 0.1 + wear);

    if (stateEnabled) {
      const cs = cellState[cell];
      const existingFriction = cs ? cs.friction : friction;
      const existingDesire = cs ? cs.desire : 0;
      const existingMulti = cs ? cs.multi : null;
      cellState[cell] = buildCellStateEntry(
        existingFriction,
        newVal,
        existingDesire,
        existingMulti,
        cellState,
        cell
      );
    }

    if (ctx._affordanceObj) ctx._affordanceObj[cell] = newVal;
  }
}

function _recomputeGlobalPeakFlow(ctx) {
  let peak = 0;
  if (ctx.pathDesireScores) {
    for (const k in ctx.pathDesireScores) {
      const v = ctx.pathDesireScores[k];
      if (typeof v === 'number' && v > peak) peak = v;
    }
  }
  ctx.globalPeakFlow = peak > 0 ? peak : 1;
}

export function addDestination(ctx, targetCell, weight = 1) {
  if (!ctx.simulationNodes) ctx.simulationNodes = Object.create(null);
  if (!ctx.simulationNodes[targetCell])
    ctx.simulationNodes[targetCell] = { type: 'destination', weight };
  else {
    if (ctx.simulationNodes[targetCell].type === 'origin')
      ctx.simulationNodes[targetCell].type = 'dual';
    else ctx.simulationNodes[targetCell].type = 'destination';
    ctx.simulationNodes[targetCell].weight = weight;
  }

  if (!ctx._gradientCacheObj) ctx._gradientCacheObj = Object.create(null);
  if (!ctx._gradientCacheObj[targetCell]) computeAndCacheGradient(ctx, targetCell);

  // Check if the newly added destination is unreachable (surrounded by impassable terrain)
  const grad = ctx._gradientCacheObj[targetCell];
  if (gradientReachableCount(grad) <= 1) {
    const msg = '1 destination can’t be reached on foot — walled off by buildings or barriers';
    if (ctx.showAlertCard) {
      try {
        ctx.showAlertCard(msg, { title: 'No walking route', tone: 'warning' });
      } catch (_e) {}
    }
  }

  const newAssigned = _computeAssignedCounts(ctx);
  const oldAssigned = ctx._assignedCounts || Object.create(null);

  const destinations = Object.keys(ctx.simulationNodes).filter((k) =>
    ['destination', 'dual'].includes(ctx.simulationNodes[k].type)
  );
  const origins = Object.keys(ctx.simulationNodes).filter((k) =>
    ['origin', 'dual'].includes(ctx.simulationNodes[k].type)
  );

  const changed = new Set();
  changed.add(targetCell);
  for (const o of origins) {
    for (const d of destinations) {
      const oOld = (oldAssigned[o] && oldAssigned[o][d]) || 0;
      const oNew = (newAssigned[o] && newAssigned[o][d]) || 0;
      if (oOld !== oNew) changed.add(d);
    }
  }

  const allAffected = new Set();
  for (const d of changed) {
    const newContribs = _recomputeTargetContribs(ctx, d, newAssigned);
    const affected = _applyTargetContribDelta(ctx, d, newContribs);
    for (const c of affected) allAffected.add(c);
  }

  _recomputeAffordanceForCells(ctx, allAffected);
  ctx._assignedCounts = newAssigned;
  ctx._targetWeights = Object.create(null);
  for (const d of destinations) ctx._targetWeights[d] = ctx.simulationNodes[d]?.weight || 1;
  _recomputeGlobalPeakFlow(ctx);
  // Affordance / path scores changed — bump so updateLayers rebuilds.
  ctx._layerDataVersion = (ctx._layerDataVersion || 0) + 1;
  if (ctx.updateLayers) ctx.updateLayers();
  return { changed: Array.from(changed), affectedCells: allAffected.size };
}

export function updateDestinationWeight(ctx, targetCell, newWeight) {
  if (!ctx.simulationNodes || !ctx.simulationNodes[targetCell])
    return addDestination(ctx, targetCell, newWeight);
  ctx.simulationNodes[targetCell].weight = newWeight;
  // delegate to addDestination path which computes diffs
  return addDestination(ctx, targetCell, newWeight);
}

export function removeDestination(ctx, targetCell) {
  if (!ctx.simulationNodes || !ctx.simulationNodes[targetCell]) return { removed: false };
  if (ctx.simulationNodes[targetCell].type === 'dual')
    ctx.simulationNodes[targetCell].type = 'origin';
  else delete ctx.simulationNodes[targetCell];

  // Prune stale gradient cache entry for removed destination
  if (ctx._gradientCacheObj && ctx._gradientCacheObj[targetCell]) {
    delete ctx._gradientCacheObj[targetCell];
  }

  const newAssigned = _computeAssignedCounts(ctx);
  const oldAssigned = ctx._assignedCounts || Object.create(null);

  const destinations = Object.keys(ctx.simulationNodes).filter((k) =>
    ['destination', 'dual'].includes(ctx.simulationNodes[k].type)
  );
  const origins = Object.keys(ctx.simulationNodes).filter((k) =>
    ['origin', 'dual'].includes(ctx.simulationNodes[k].type)
  );

  const changed = new Set();
  // Only add to changed if it's still a destination (not removed)
  if (
    ctx.simulationNodes[targetCell] &&
    ['destination', 'dual'].includes(ctx.simulationNodes[targetCell].type)
  ) {
    changed.add(targetCell);
  }
  for (const o of origins) {
    for (const d of destinations) {
      const oOld = (oldAssigned[o] && oldAssigned[o][d]) || 0;
      const oNew = (newAssigned[o] && newAssigned[o][d]) || 0;
      if (oOld !== oNew) changed.add(d);
    }
  }

  const allAffected = new Set();
  for (const d of changed) {
    const newContribs = _recomputeTargetContribs(ctx, d, newAssigned);
    const affected = _applyTargetContribDelta(ctx, d, newContribs);
    for (const c of affected) allAffected.add(c);
  }

  _recomputeAffordanceForCells(ctx, allAffected);
  ctx._assignedCounts = newAssigned;
  ctx._targetWeights = Object.create(null);
  for (const d of destinations) ctx._targetWeights[d] = ctx.simulationNodes[d]?.weight || 1;
  _recomputeGlobalPeakFlow(ctx);
  // Affordance / path scores changed — bump so updateLayers rebuilds.
  ctx._layerDataVersion = (ctx._layerDataVersion || 0) + 1;
  if (ctx.updateLayers) ctx.updateLayers();
  return { removed: true, changed: Array.from(changed), affectedCells: allAffected.size };
}
