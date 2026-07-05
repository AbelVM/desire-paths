import { gridPathCells, gridDisk, gridRing, cellToLatLng, gridDistance } from 'h3-js';
import {
  FRICTION_COSTS,
  WEIGHTS,
  VISUAL_DEPTH,
  VISUAL_ANGLE,
  AFFORDANCE,
  DECAY_RATE,
  UPDATE_RATE,
  AGENTS_PER_DESTINATION,
  MAX_EXPECTED_VOLUME,
  SOFT_CAP,
  TEMPERATURE,
  MAX_SIM_TICKS,
  SIM_TICK_BUFFER,
  YIELD_EVERY_AGENTS,
  SIM_YIELD_MS,
  COMPUTE_PATH_CACHE_MAX,
  COMPUTE_DISK_CACHE_MAX,
  COMPUTE_VISIBILITY_CACHE_MAX,
  CELL_LATLNG_CACHE_MAX,
  GRADIENT_CACHE_MAX_ENTRIES,
} from './constants.js';
import {
  runGradientBatches,
  runAgentBatches,
  setSpatialWorkerProgressHandler,
  clearSpatialWorkerProgressHandler,
} from './spatialWorker.js';
import { computeDijkstra } from './dijkstra.js';

// --- Deterministic seeded RNG (LCG) ---
function _lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// --- String hash (FNV-1a variant) ---
function _strHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Module-level lat/lng cache (FIFO object-based cache to avoid Map hotspots)
const _cellLatLngCacheObj = Object.create(null);
const _cellLatLngCacheOrder = [];
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

function _bearingFromLatLngs(s, e) {
  const lat1 = s[2] !== undefined ? s[2] : (s[0] * Math.PI) / 180;
  const lon1 = s[3] !== undefined ? s[3] : (s[1] * Math.PI) / 180;
  const lat2 = e[2] !== undefined ? e[2] : (e[0] * Math.PI) / 180;
  const lon2 = e[3] !== undefined ? e[3] : (e[1] * Math.PI) / 180;
  let y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  let x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function _getCachedLatLng(cell) {
  const c = _cellLatLngCacheObj[cell];
  if (c) {
    _cellLatLngCacheHits++;
    return c;
  }
  const v = cellToLatLng(cell);
  // store degrees and precomputed radians to avoid repeated trig conversions
  const lat = v[0];
  const lng = v[1];
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const stored = [lat, lng, latRad, lngRad];
  _cellLatLngCacheObj[cell] = stored;
  _cellLatLngCacheMisses++;
  _cellLatLngCacheOrder.push(cell);
  if (_cellLatLngCacheOrder.length > CELL_LATLNG_CACHE_MAX) {
    const old = _cellLatLngCacheOrder.shift();
    delete _cellLatLngCacheObj[old];
  }
  // Periodic full GC: when the order array grows 1.5× past the limit,
  // dead entries have accumulated from repeated miss/evict cycles;
  // a full reset is cheaper than incremental drift.
  if (_cellLatLngCacheOrder.length > CELL_LATLNG_CACHE_MAX * 1.5) {
    clearLatLngCache();
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
  let inner = ctx._computePathCacheObj[a];
  if (inner) {
    const hit = inner[b];
    if (hit) {
      ctx._computePathCacheHits++;
      return hit;
    }
  }
  const arr = gridPathCells(a, b);
  if (!inner) {
    inner = Object.create(null);
    ctx._computePathCacheObj[a] = inner;
    ctx._computePathCacheOrder.push(a);
  }
  inner[b] = arr;
  ctx._computePathCacheMisses++;
  if (ctx._computePathCacheOrder.length > COMPUTE_PATH_CACHE_MAX) {
    const old = ctx._computePathCacheOrder.shift();
    delete ctx._computePathCacheObj[old];
  }
  return arr;
}

function _getCachedDisk(ctx, center, r) {
  // Use precomputed neighbor disk when available and fresh (VISUAL_DEPTH only)
  if (r === VISUAL_DEPTH) {
    const precomputed = ctx._precomputedNeighborDisks;
    const currentGen = ctx._mappingGeneration ?? 0;
    if (precomputed && precomputed.gen === currentGen) {
      const disk = precomputed.data[center];
      if (disk) {
        ctx._computeDiskCacheHits++;
        return disk;
      }
    }
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

// Precompute neighbor disks for all AOI cells at mapping time.
// Stores gridDisk(cell, VISUAL_DEPTH) for each cell to avoid millions of redundant calls.
// Keyed by mapping generation so it invalidates on remap.
function precomputeNeighborDisks(cells, visualDepth) {
  const result = Object.create(null);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    result[cell] = gridDisk(cell, visualDepth);
  }
  return result;
}

// Precompute visibility sets for all cells within the AOI.
// For each cell, stores a plain-object map of visible neighbor -> true.
// This eliminates O(N^2) gridPathCells lookups during simulation.
// Keyed by mapping generation so it invalidates on remap.
// OPTIMIZATION: Accepts precomputed neighbor disks to avoid redundant gridDisk calls.
// OPTIMIZATION: Uses flood-fill with gridDisk(1) for proper ring-by-ring expansion.
function precomputeVisibilitySets(frictionLookup, cells, maxDepth, precomputedDisks) {
  const result = Object.create(null);
  const impassable = FRICTION_COSTS.IMPASSABLE;

  // Pre-build a passable lookup for O(1) checks — eliminates repeated friction lookups
  const isPassable = Object.create(null);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    isPassable[cell] = (frictionLookup[cell] ?? 0) < impassable;
  }

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!isPassable[cell]) continue; // origin must be passable

    const visible = Object.create(null);
    const visited = Object.create(null); // flood-fill visited set
    const queue = [cell]; // BFS queue
    visited[cell] = true;

    // Flood-fill from origin using gridDisk(1) for proper ring-by-ring expansion.
    // This marks all cells reachable without crossing impassable terrain.
    // Each cell is visited once, and we use gridDisk(1) to get immediate neighbors.
    let currentDist = 0;
    while (currentDist < maxDepth && queue.length > 0) {
      const nextQueue = [];
      for (let q = 0; q < queue.length; q++) {
        const current = queue[q];
        // Get immediate neighbors (distance 1)
        const neighbors = gridDisk(current, 1);
        for (let n = 0; n < neighbors.length; n++) {
          const neighbor = neighbors[n];
          if (neighbor === current) continue;
          if (visited[neighbor]) continue;
          if (!isPassable[neighbor]) continue;

          visited[neighbor] = true;
          visible[neighbor] = true;
          nextQueue.push(neighbor);
        }
      }
      queue.length = 0;
      for (let q = 0; q < nextQueue.length; q++) {
        queue.push(nextQueue[q]);
      }
      currentDist++;
    }

    if (Object.keys(visible).length > 0) result[cell] = visible;
  }

  return result;
}

// Precompute bearings between all AOI cell pairs within VISUAL_DEPTH radius.
// Returns a flat string-keyed map: "center::neighbor" → bearing (degrees).
// This eliminates billions of _bearingFromLatLngs trig calls during simulation.
// OPTIMIZATION: Reuses precomputed neighbor disks to avoid redundant gridDisk calls.
function precomputeBearingMap(cells, visualDepth, precomputedDisks) {
  const result = Object.create(null);
  const disks = precomputedDisks || (cells.length > 0 ? precomputeNeighborDisks(cells, visualDepth) : null);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const sLatLng = _getCachedLatLng(cell);
    // Use precomputed disks if available, otherwise compute on-demand
    const disk = disks ? disks[cell] : gridDisk(cell, visualDepth);
    for (let j = 0; j < disk.length; j++) {
      const n = disk[j];
      if (n === cell) continue;
      const eLatLng = _getCachedLatLng(n);
      result[cell + '::' + n] = _bearingFromLatLngs(sLatLng, eLatLng);
    }
  }
  return result;
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
  // Drop per-compute data structures
  ctx._gradientCacheObj = null;
  ctx._cellState = null;
  ctx._frictionObj = null;
  ctx._affordanceObj = null;
  ctx._perTargetContribs = null;
  ctx._assignedCounts = null;
  ctx._targetWeights = null;
  ctx._pathCache = Object.create(null);

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

  // Clear accumulated desire scores and per-cell desire values so they don't carry over
  // between simulation runs when the friction topology changes but _mappingGeneration does not.
  if (ctx.pathDesireScores) {
    for (const k in ctx.pathDesireScores) delete ctx.pathDesireScores[k];
  }
  if (ctx._cellState) {
    for (const cell in ctx._cellState) {
      const cs = ctx._cellState[cell];
      if (cs && typeof cs.desire === 'number') cs.desire = 0;
    }
  }

  // Clear gradient cache and module-level lat/lng cache
  clearGradientCache(ctx);
  ctx._gradientCacheGen = undefined;
  clearLatLngCache();
}

/** Clear the module-level lat/lng cache to prevent unbounded memory growth. */
export function clearLatLngCache() {
  for (const key in _cellLatLngCacheObj) {
    delete _cellLatLngCacheObj[key];
  }
  _cellLatLngCacheOrder.length = 0;
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

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function resetYieldDeadline() {
  return nowMs() + SIM_YIELD_MS;
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
  const gCurr = gradientObj[curr];
  if (typeof gCurr !== 'number') return null;

  const neighbors = _getCachedDisk(ctx, curr, 1);
  // _frictionObj is always the canonical lookup — already built once per sim run.
  // Direct property access on plain object is faster than iterating Map.entries().
  const frictionLookup = ctx._frictionObj;
  const cellState = ctx._cellState;
  let bestNeighbor = null;
  let bestGrad = gCurr;

  for (let i = 0; i < neighbors.length; i++) {
    const n = neighbors[i];
    if (n === curr) continue;
    // Prefer _cellState.friction (updated during sim); fall back to frictionLookup.
    let f = cellState?.[n]?.friction ?? frictionLookup?.[n];
    if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) continue;
    const gN = gradientObj[n];
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

  // Precomputed distance check — eliminates per-tick gridDistance H3 call
  let distToTarget = 0;
  if (originDestDistances) {
    const d = originDestDistances[originCell + '::' + destCell];
    if (typeof d === 'number') distToTarget = d;
  }

  let simDirection =
    getGradientDirection(ctx, simCurrent, destGradientObj, bearingMap) ?? getBearingFast(ctx, simCurrent, simTarget, bearingMap);
  const simPath = [originCell];

  if (pathDesireDeltas) recordTraversal(pathDesireDeltas, originCell);
  if (applyWear) updateAffordance(ctx, originCell, 1);

  // _frictionObj is the canonical lookup — already built once per sim run.
  const frictionLookup = ctx._frictionObj;
  const cellState = ctx._cellState;

  for (let tick = 0; tick < maxTicks; tick++) {
    // Use precomputed distance when available — eliminates gridDistance H3 call per tick
    if (distToTarget <= 1) {
      if (simTarget !== simCurrent) {
        simPath.push(simTarget);
        if (pathDesireDeltas) recordTraversal(pathDesireDeltas, simTarget);
        if (applyWear) updateAffordance(ctx, simTarget, 1);
      }
      break;
    }

    const nextStep = getBestNextStep(ctx, simCurrent, destGradientObj, simDirection, simAgentId, accumulatedFootprints, bearingMap);
    if (!nextStep || nextStep === simCurrent) break;

    const line = _getCachedPathCells(ctx, simCurrent, nextStep);
    let hitTarget = false;
    for (let i = 1; i < line.length; i++) {
      const stepCell = line[i];
      const stepState = cellState && cellState[stepCell];
      const f = stepState ? stepState.friction : frictionLookup[stepCell];
      if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) break;
      simPath.push(stepCell);
      if (pathDesireDeltas) recordTraversal(pathDesireDeltas, stepCell);
      if (applyWear) updateAffordance(ctx, stepCell, 1);
      if (stepCell === simTarget) {
        hitTarget = true;
        break;
      }
    }

    if (hitTarget) break;

    // Use precomputed bearing map — eliminates trig call per direction update
    simDirection = getBearingFast(ctx, simCurrent, nextStep, bearingMap);
    simCurrent = nextStep;
    if (simCurrent === simTarget) break;
  }

  return simPath;
}

function getReachableDestinations(ctx, originCell, destinations, goalGradients) {
  const destCandidates = [];
  let destWeightSum = 0;
  for (let d = 0; d < destinations.length; d++) {
    const destCell = destinations[d];
    if (destCell === originCell) continue;
    const grad = goalGradients.get(destCell);
    if (!grad) {
      try {
        console.debug &&
          console.debug('getReachableDestinations: missing gradient', { originCell, destCell });
      } catch (_e) { }
      continue;
    }
    const hasOrigin =
      typeof grad.has === 'function' ? grad.has(originCell) : typeof grad[originCell] === 'number';
    if (!hasOrigin) {
      try {
        console.debug &&
          console.debug('getReachableDestinations: origin not in gradient', {
            originCell,
            destCell,
          });
      } catch (_e) { }
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
  const plan = [];
  const assignedCounts = Object.create(null);
  let totalAgents = 0;

  for (let o = 0; o < origins.length; o++) {
    const originCell = origins[o];
    const totalVolume = Math.max(
      1,
      Math.round((ctx.simulationNodes[originCell]?.weight || 1) * AGENTS_PER_DESTINATION)
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
  // Reset flow map before every simulation so results don't accumulate across runs.
  // Always use a plain object for pathDesireScores — inner loops index it directly.
  state.pathDesireScores = Object.create(null);

  // Zero out per-cell desire values in _cellState so stale scores from prior runs don't
  // leak into the new simulation via applyPathDesireDeltas (which reads _cellState.desire
  // before falling back to pathDesireScores).
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
  if (!state._multiFrictionObj || state._multiFrictionSnapshotGen !== mappingGen) {
    state._multiFrictionObj = Object.create(null);
    if (state.multiFrictionMap && typeof state.multiFrictionMap.entries === 'function') {
      for (const [k, v] of state.multiFrictionMap) state._multiFrictionObj[k] = v;
    } else if (state.multiFrictionMap) {
      for (const k in state.multiFrictionMap)
        state._multiFrictionObj[k] = state.multiFrictionMap[k];
    }
    state._multiFrictionSnapshotGen = mappingGen;
  }

  // Consolidated per-cell state object for hot-path reads/writes.
  // Only rebuild when friction actually changed to avoid object churn.
  // Affordance is updated in-place during simulation, so no separate tracking needed.
  const lastCellStateMappingGen = state._cellStateMappingGen ?? -1;
  if (!state._cellState || lastCellStateMappingGen !== mappingGen) {
    const existingState = state._cellState;
    state._cellState = Object.create(null);
    const frictionObj = state._frictionObj;
    const affordanceObj = state._affordanceObj;
    const desireScores = state.pathDesireScores;
    const multiFrictionObj = state._multiFrictionObj;

    for (const k in frictionObj) {
      const fr = frictionObj[k];
      const aff = affordanceObj?.[k] ?? 0.1;
      const desire = desireScores?.[k] ?? 0;
      const multi = multiFrictionObj?.[k] ?? null;
      state._cellState[k] = buildCellStateEntry(fr, aff, desire, multi, existingState, k);
    }
    state._cellStateMappingGen = mappingGen;
  }

  // Grass recovery between user-triggered simulation runs (not after wear in the same pass)
  if (state._cellState) {
    for (const cell in state._cellState) {
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
          state._frictionObj || state.cellFrictionMap
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
    } catch (_e) { }
    if (typeof mapInstance?.showAlertCard === 'function') {
      try {
        mapInstance.showAlertCard(err?.message || String(err), {
          title: 'Simulation error',
          tone: 'error',
        });
      } catch (_e) { }
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
    const gradKeys = grad ? Object.keys(grad) : [];
    // If gradient only contains the destination itself (or is empty), it's unreachable
    if (gradKeys.length <= 1) {
      unreachableDests.push(d);
    }
  }
  if (unreachableDests.length > 0) {
    const count = unreachableDests.length;
    const msg = `${count} destination${count > 1 ? 's' : ''} unreachable — surrounded by impassable terrain`;
    if (mapInstance?.showAlertCard) {
      try {
        mapInstance.showAlertCard(msg, { title: 'Unreachable destination', tone: 'warning' });
      } catch (_e) { }
    }
  }

  // Plain object is faster than Map for string-key → integer-value accumulation.
  const pathDesireDeltas = Object.create(null);
  // True ABM: shared footprint accumulator — all agents in this simulation
  // see each other's positions as accumulated footprints.  This is the key
  // difference from Monte-Carlo sampling where every agent plans independently.
  const accumulatedFootprints = Object.create(null);

  let perTargetContribs = Object.create(null);
  const { plan, assignedCounts, totalAgents } = buildSimulationPlan(
    state,
    agents,
    destinations,
    goalGradients
  );
  try {
    console.debug &&
      console.debug('computeDesirePaths: plan built', {
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
  } catch (_e) { }
  // Validate plan: ensure gradients exist for every origin->destination used in the plan.
  for (let pi = 0; pi < plan.length; pi++) {
    const originCell = plan[pi].originCell;
    const destCandidates = plan[pi].destCandidates || [];
    for (let di = 0; di < destCandidates.length; di++) {
      const destCell = destCandidates[di].dest;
      const grad = goalGradients.get(destCell);
      const hasOrigin =
        grad &&
        (typeof grad.has === 'function'
          ? grad.has(originCell)
          : typeof grad[originCell] === 'number');
      if (!hasOrigin) {
        try {
          console.warn &&
            console.warn('computeDesirePaths: aborting - missing gradient for plan entry', {
              originCell,
              destCell,
            });
          if (mapInstance?.showAlertCard)
            mapInstance.showAlertCard('Simulation aborted: missing gradient data for plan.', {
              title: 'Simulation aborted',
              tone: 'warning',
            });
        } catch (_e) { }
        // Do not apply an incomplete plan; abort early.
        return;
      }
    }
  }
  let agentsProcessed = 0;
  let nextYieldAt = resetYieldDeadline();
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
      } catch (_e) { }
    });

    const agentResults = await runAgentBatches(
      plan,
      state._frictionObj || state.cellFrictionMap,
      goalGradients,
      state._affordanceObj || state.affordanceMap,
      hexes,
      { visibilityEntries: state._precomputedVisibility?.data || null, accumulatedFootprints, originDestDistances: odDistances, bearingMap: state._precomputedBearings?.data || null }
    );

    // Merge returned path desire into plain object
    const mergedPath = agentResults.pathDesire || Object.create(null);
    for (const cell in mergedPath) {
      const v = Number(mergedPath[cell]) || 0;
      if (v) pathDesireDeltas[cell] = (pathDesireDeltas[cell] || 0) + v;
    }

    // Apply aggregated affordance wear on main thread
    for (const cell in pathDesireDeltas) {
      const v = pathDesireDeltas[cell];
      if (v && typeof v === 'number') updateAffordance(state, cell, v);
    }

    perTargetContribs = agentResults.perTargetContribs || Object.create(null);
  } finally {
    try {
      clearSpatialWorkerProgressHandler();
    } catch (_e) { }
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
  } catch (_e) { }
  mapInstance?.updateLayers?.();
  state.flowsReady = true;
}

/**
  * Tactical Decision: BDI (Belief-Desire-Intention)(Section 3.3/2.4)
  */
function getBestNextStep(ctx, curr, gradient, currentDirection, agentId = '', accumulatedFootprints = null, bearingMap = null) {
  const affordanceLookup = ctx._affordanceObj;
  const weights = WEIGHTS;
  const impassableVal = FRICTION_COSTS.IMPASSABLE;
  const visualAngleHalf = VISUAL_ANGLE / 2;

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

  const disk = _getCachedDisk(ctx, curr, VISUAL_DEPTH);
  const sLatLng = _getCachedLatLng(curr);
  const gradientLookup = gradient ? (n) => gradient[n] : null;
  const gCurr = gradientLookup ? gradientLookup(curr) : undefined;
  const useGradient = typeof gCurr === 'number';

  // Inline friction/affordance lookups — direct property access is ~3× faster than function calls
  const getFriction = stateEnabled
    ? (n) => {
      const s = cellState[n];
      return s ? s.friction : undefined;
    }
    : (n) => frictionLookup[n];
  const getAffordance = stateEnabled
    ? (n) => {
      const s = cellState[n];
      return s ? (s.affordance ?? 0.1) : 0.1;
    }
    : (n) => affordanceLookup?.[n] ?? 0.1;

  const cellsArr = [];
  const anglesArr = [];
  const affsArr = [];
  const frictionArr = [];
  const gNsArr = useGradient ? [] : null;

  for (let i = 0; i < disk.length; i++) {
    const n = disk[i];
    if (n === curr) continue;

    const f = getFriction(n);
    if (f === undefined || f >= impassableVal) continue;
    if (!_getCachedVisibility(ctx, curr, n, frictionLookup)) continue;

    // Use precomputed bearing map — eliminates trig call per neighbor
    let ang;
    if (bearingMap) {
      const bng = bearingMap[curr + '::' + n];
      if (typeof bng === 'number') {
        ang = angleDiff(bng, currentDirection);
      } else {
        // Fallback: compute bearing for uncached pair
        const eLatLng = _getCachedLatLng(n);
        ang = angleDiff(_bearingFromLatLngs(sLatLng, eLatLng), currentDirection);
      }
    } else {
      const eLatLng = _getCachedLatLng(n);
      ang = angleDiff(_bearingFromLatLngs(sLatLng, eLatLng), currentDirection);
    }
    const aff = getAffordance(n);

    if (useGradient) {
      const gN = gradientLookup(n);
      if (typeof gN !== 'number') continue;
      cellsArr.push(n);
      anglesArr.push(ang);
      affsArr.push(aff);
      frictionArr.push(f);
      gNsArr.push(gN);
    } else {
      cellsArr.push(n);
      anglesArr.push(ang);
      affsArr.push(aff);
      frictionArr.push(f);
    }
  }

  let hardCount = 0;
  for (let i = 0; i < cellsArr.length; i++) {
    if (anglesArr[i] <= visualAngleHalf) {
      if (hardCount !== i) {
        const swap = (arr) => {
          const temp = arr[i];
          arr[i] = arr[hardCount];
          arr[hardCount] = temp;
        };
        swap(cellsArr);
        swap(anglesArr);
        swap(affsArr);
        swap(frictionArr);
        if (useGradient) swap(gNsArr);
      }
      hardCount++;
    }
  }
  const cLen = hardCount > 0 ? hardCount : cellsArr.length;
  const scores = useGradient ? new Array(cLen) : null;

  if (useGradient) {
    for (let i = 0; i < cLen; i++) {
      const gN = gNsArr[i];
      let aff = affsArr[i];
      const stepCost = frictionArr[i] || 0;

      // True ABM: boost effective affordance by accumulated footprints.
      // Cells that more agents have traversed become easier to enter,
      // creating positive feedback that produces emergent path formation.
      if (accumulatedFootprints) {
        const fp = accumulatedFootprints[cellsArr[i]] || 0;
        aff += Math.log1p(fp) * 0.05;
      }

      const delta = stepCost + gN - gCurr;
      let S_ij = weights.w_a * aff - weights.w_d * delta;
      S_ij -= (weights.w_theta || 0) * (anglesArr[i] / 180);
      scores[i] = S_ij;
    }
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

  if (cellsArr.length === 0) {
    for (let depth = 1; depth <= 3; depth++) {
      const neighbors = _getCachedDisk(ctx, curr, depth);
      let bestGrad = Infinity;
      let bestCandidate = null;

      for (let i = 0; i < neighbors.length; i++) {
        const n = neighbors[i];
        if (n === curr) continue;
        const f = getFriction(n);
        if (f === undefined || f >= impassableVal) continue;
        if (!_getCachedVisibility(ctx, curr, n, frictionLookup)) continue;

        const eLatLng = _getCachedLatLng(n);
        let ang;
        if (bearingMap) {
          const bng = bearingMap[curr + '::' + n];
          if (typeof bng === 'number') {
            ang = angleDiff(bng, currentDirection);
          } else {
            ang = angleDiff(_bearingFromLatLngs(sLatLng, eLatLng), currentDirection);
          }
        } else {
          ang = angleDiff(_bearingFromLatLngs(sLatLng, eLatLng), currentDirection);
        }
        if (ang > visualAngleHalf) continue;

        const g = gradientLookup ? (gradientLookup(n) ?? Infinity) : (gradient[n] ?? Infinity);
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
  if (hasValidScores && typeof TEMPERATURE === 'number' && TEMPERATURE > 0) {
    const seed = _strHash(agentId + ':' + curr);
    const rng = _lcg(seed);
    let maxS = -Infinity;
    for (let i = 0; i < scores.length; i++) {
      const v = scores[i];
      if (v > maxS) maxS = v;
    }

    const weightsArr = new Array(scores.length);
    let sum = 0;
    for (let i = 0; i < scores.length; i++) {
      const w = Math.exp((scores[i] - maxS) / TEMPERATURE);
      weightsArr[i] = w;
      sum += w;
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
    return cellsArr[cellsArr.length - 1];
  }

  let bestScore = -Infinity;
  let bestIndex = -1;
  for (let i = 0; i < cLen; i++) {
    const S_ij = scores?.[i];
    const isScoreValid = typeof S_ij === 'number';
    if (isScoreValid && S_ij > bestScore) {
      bestScore = S_ij;
      bestIndex = i;
    } else if (!isScoreValid) {
      // No gradient: fall back to affordance, boosted by accumulated footprints.
      let effAff = affsArr[i];
      if (accumulatedFootprints) {
        const fp = accumulatedFootprints[cellsArr[i]] || 0;
        effAff += Math.log1p(fp) * 0.05;
      }
      if (effAff > bestScore) {
        bestScore = effAff;
        bestIndex = i;
      } else if (Math.abs(effAff - bestScore) < 1e-9) {
        // Tiebreak: prefer lower cost when affordance is equal.
        const currentBestCost =
          (frictionArr[bestIndex] || 0) + (useGradient ? (gNsArr[bestIndex] ?? Infinity) : 0);
        const candidateCost = (frictionArr[i] || 0) + (useGradient ? (gNsArr[i] ?? Infinity) : 0);
        if (candidateCost < currentBestCost) {
          bestIndex = i;
        } else if (candidateCost === currentBestCost) {
          // Compute grid distance once per candidate instead of twice.
          const dCandidate = gridDistance(curr, cellsArr[i]);
          const dBest = gridDistance(curr, cellsArr[bestIndex]);
          if (dCandidate < dBest) {
            bestIndex = i;
          }
        }
      }
    }
  }

  const chosen = bestIndex >= 0 ? cellsArr[bestIndex] : null;
  if (ctx.debugCompute) {
    try {
      console.log('getBestNextStep: chosen', { curr, chosen, bestScore });
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

  const getNeighbors = (cell) => _getCachedDisk(ctx, cell, 1);

  return computeDijkstra(targetCell, getFriction, getNeighbors);
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

function getBearing(start, end) {
  const s = _getCachedLatLng(start);
  const e = _getCachedLatLng(end);
  return _bearingFromLatLngs(s, e);
}

// Fast bearing lookup: uses precomputed bearing map when available,
// falls back to trig-based calculation otherwise.
function getBearingFast(ctx, a, b, bearingMap) {
  if (bearingMap) {
    const bng = bearingMap[a + '::' + b];
    if (typeof bng === 'number') return bng;
  }
  // Fallback: compute via lat/lng (expensive, called rarely for uncached pairs)
  const s = _getCachedLatLng(a);
  const e = _getCachedLatLng(b);
  return _bearingFromLatLngs(s, e);
}

// Smallest absolute angular difference between two bearings (degrees)
function angleDiff(a, b) {
  // normalize to [0,360), then compute minimal signed diff
  const diff = Math.abs(((a - b + 540) % 360) - 180);
  return diff;
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
  const newVal = Math.max(0.1, current - DECAY_RATE * recoveryFactor);

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
  angleDiff as _angleDiff,
  isVisible as _isVisible,
  estimateMaxTicks as _estimateMaxTicks,
  yieldToMain as _yieldToMain,
  buildCellStateEntry,
  precomputeVisibilitySets,
  precomputeNeighborDisks,
  precomputeBearingMap,
  precomputeOriginDestDistances,
};

// Diagnostic helper to inspect cache instrumentation
export function getComputeCacheStats(ctx = {}) {
  return {
    cellLatLngCacheSize: Object.keys(_cellLatLngCacheObj).length,
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
      Math.round((ctx.simulationNodes[o]?.weight || 1) * AGENTS_PER_DESTINATION)
    );

    const destCandidates = [];
    let destWeightSum = 0;
    for (const d of destinations) {
      if (d === o) continue;
      const grad = ctx._gradientCacheObj[d];
      if (!grad) continue;
      if (typeof grad[o] !== 'number') continue;
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

  // Ensure snapshot state exists for safe inner-loop reads
  if (!ctx._frictionObj) {
    ctx._frictionObj = Object.create(null);
    for (const [k, v] of ctx.cellFrictionMap) ctx._frictionObj[k] = v;
  }
  if (!ctx._affordanceObj) {
    ctx._affordanceObj = Object.create(null);
    for (const [k, v] of ctx.affordanceMap) ctx._affordanceObj[k] = v;
  }
  if (!ctx._cellState) {
    ctx._cellState = Object.create(null);
    for (const k in ctx._frictionObj) {
      const fr = ctx._frictionObj[k];
      const aff = ctx._affordanceObj?.[k] ?? 0.1;
      const desire = ctx.pathDesireScores?.[k] || 0;
      ctx._cellState[k] = buildCellStateEntry(fr, aff, desire, null, null, k);
    }
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
  const gradKeys = grad ? Object.keys(grad) : [];
  if (gradKeys.length <= 1) {
    const msg = '1 destination unreachable — surrounded by impassable terrain';
    if (ctx.showAlertCard) {
      try {
        ctx.showAlertCard(msg, { title: 'Unreachable destination', tone: 'warning' });
      } catch (_e) { }
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
  if (ctx.updateLayers) ctx.updateLayers();
  return { removed: true, changed: Array.from(changed), affectedCells: allAffected.size };
}
