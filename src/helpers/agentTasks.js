import { logger } from './logger.js';
import { gridPathCells, gridDisk, cellToLatLng, gridDistance } from 'h3-js';
import { normalizeFrictionEntries } from './spatialTasks.js';
import { getGradientGraph, getGraphNeighborIndicesR1, gradientGet } from './dijkstra.js';
import { _bearingFromLatLngs, angleDiff } from './bearing.js';
import { reconstructVisibilityBearing } from './bearingIndex.js';
import {
  gatherCandidates,
  partitionVisibleCone,
  scoreCandidates,
  selectBestCandidate,
  resolveStepLine,
} from './agentStep.js';
import {
  FRICTION_COSTS,
  WEIGHTS,
  MAX_SIM_TICKS,
  SIM_TICK_BUFFER,
  CELL_LATLNG_CACHE_MAX,
  SIMULATION_PARAMS,
} from './constants.js';

// Deterministic seeded RNG (LCG)
function _lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// String hash (FNV-1a variant)
function _strHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Small local cache (keeps worker stateless w.r.t. main thread).
// Mirrors compute.js's `_cellLatLngCache` LRU: a Map whose insertion order
// == recency. On a hit we delete+re-set to move the entry to the most-recent
// end, and evict the oldest (first) key on overflow. This replaces the old
// push/shift array + periodic *full* reset, which discarded every useful entry
// once the cache drifted past 1.5× the cap and caused a recompute storm (C2).
const _cellLatLngCache = new Map();

function _getCachedLatLng(cell) {
  const c = _cellLatLngCache.get(cell);
  if (c) {
    // LRU touch: re-insert so it moves to the most-recently-used end.
    _cellLatLngCache.delete(cell);
    _cellLatLngCache.set(cell, c);
    return c;
  }
  const v = cellToLatLng(cell);
  const lat = v[0];
  const lng = v[1];
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const stored = [lat, lng, latRad, lngRad];
  _cellLatLngCache.set(cell, stored);
  if (_cellLatLngCache.size > CELL_LATLNG_CACHE_MAX) {
    const old = _cellLatLngCache.keys().next().value;
    _cellLatLngCache.delete(old);
  }
  return stored;
}

// Reusable candidate buffers for getBestNextStep. The agent worker is
// single-threaded and processes one batch at a time, so module-level reuse is
// safe and avoids allocating 5 arrays on every one of the millions of
// getBestNextStep invocations (the previous per-call allocation was a major GC
// source at city scale).
let _knCells = [];
let _knAngles = [];
let _knAffs = [];
let _knFriction = [];
let _knGNs = null;
let _knScores = null;

// Cached per-batch closures. Rebuilt only when their stable inputs change
// (identity-guarded), so getBestNextStep stops allocating closures per call.
let _knGetFriction = null;
let _knGetAffordance = null;
let _knFrictionLookup = null;
let _knCellState = null;
let _knIsVisible = null;
let _knVisibilityMap = null;
let _knIsVisibleFriction = null;
let _knComputeAngle = null;
let _knBearingMap = null;
let _knWeights = null;
let _knWeightsKey = null;

// Fast bearing lookup: uses precomputed bearing map when available,
// falls back to trig-based calculation otherwise.
function getBearingFast(a, b, bearingMap) {
  if (bearingMap) {
    const bng = bearingMap[a + '::' + b];
    if (typeof bng === 'number') return bng;
  }
  // Fallback: compute via lat/lng (expensive, called rarely for uncached pairs)
  const s = _getCachedLatLng(a);
  const e = _getCachedLatLng(b);
  return _bearingFromLatLngs(s, e);
}

// Simple path/disk caches
const _pathCache = Object.create(null);
const _pathCacheOrder = [];
const PATH_CACHE_MAX = 256;

function _getCachedPathCells(a, b) {
  // Normalize the key so bidirectional pairs (a,b) and (b,a) share one entry,
  // since gridPathCells(a, b) === gridPathCells(b, a) as an unordered cell list.
  const reversed = a > b;
  const ka = reversed ? b : a;
  const kb = reversed ? a : b;
  let inner = _pathCache[ka];
  if (inner) {
    const hit = inner[kb];
    if (hit) return reversed ? hit.slice().reverse() : hit;
  }
  const arr = gridPathCells(ka, kb);
  if (!inner) {
    inner = Object.create(null);
    _pathCache[ka] = inner;
    _pathCacheOrder.push(ka);
  }
  inner[kb] = arr;
  if (_pathCacheOrder.length > PATH_CACHE_MAX) {
    const old = _pathCacheOrder.shift();
    delete _pathCache[old];
  }
  return reversed ? arr.slice().reverse() : arr;
}

const _diskCache = Object.create(null);
const _diskCacheOrder = [];
const DISK_CACHE_MAX = 256;

function _getCachedDisk(center, r) {
  // LRU cache of gridDisk(center, r). This is the fast path that avoids
  // recomputing gridDisk on every step; the old `neighborDisks` precompute
  // hook was never wired up, so the disk is always sourced from here.
  let inner = _diskCache[center];
  if (inner) {
    const hit = inner[r];
    if (hit) return hit;
  }
  const arr = gridDisk(center, r);
  if (!inner) {
    inner = Object.create(null);
    _diskCache[center] = inner;
    _diskCacheOrder.push(center);
  }
  inner[r] = arr;
  if (_diskCacheOrder.length > DISK_CACHE_MAX) {
    const old = _diskCacheOrder.shift();
    delete _diskCache[old];
  }
  return arr;
}

function _getCachedVisibility(a, b, frictionLookup, visibilityMap) {
  // Use precomputed visibility map when available
  if (visibilityMap) {
    const visible = visibilityMap[a];
    if (visible) {
      return !!visible[b];
    }
  }

  const path = _getCachedPathCells(a, b);
  for (let i = 0; i < path.length; i++) {
    const c = path[i];
    const f = frictionLookup[c];
    if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) return false;
  }
  return true;
}

function getGradientDirection(
  curr,
  gradientObj,
  frictionLookup,
  cellState,
  bearingMap,
  graph
) {
  if (!gradientObj) return null;
  const gCurr = gradientGet(gradientObj, curr, graph);
  if (typeof gCurr !== 'number') return null;

  // Reuse the canonical gradient graph's r=1 adjacency (CSR indices) when
  // available; fall back to the disk cache otherwise (same passable, in-AOI
  // neighbor set). Map neighbor indices back to cell ids via `graph.idxToCell`.
  const nbrIdxs = graph ? getGraphNeighborIndicesR1(graph, curr) : null;
  const disk = graph ? null : _getCachedDisk(curr, 1);
  const idxToCell = graph ? graph.idxToCell : null;
  let bestNeighbor = null;
  let bestGrad = gCurr;

  const count = nbrIdxs ? nbrIdxs.length : disk.length;
  for (let i = 0; i < count; i++) {
    const n = nbrIdxs ? idxToCell[nbrIdxs[i]] : disk[i];
    if (n === curr) continue;
    let f;
    if (cellState && cellState[n]) f = cellState[n].friction;
    else f = frictionLookup[n];
    if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) continue;
    const gN = gradientGet(gradientObj, n, graph);
    if (typeof gN !== 'number') continue;
    if (gN < bestGrad) {
      bestGrad = gN;
      bestNeighbor = n;
    }
  }

  return bestNeighbor ? getBearingFast(curr, bestNeighbor, bearingMap) : null;
}

function getBestNextStep(
  curr,
  gradient,
  currentDirection,
  agentId,
  simulationParams,
  frictionLookup,
  affordanceLookup,
  cellState,
  visibilityMap,
  accumulatedFootprints,
  bearingMap,
  graph
) {
  const gradientLookup = gradient ? (n) => gradientGet(gradient, n, graph) : null;
  const impassableVal = FRICTION_COSTS.IMPASSABLE;
  const visualAngleHalf = simulationParams.fieldOfView / 2;

  const disk = _getCachedDisk(curr, simulationParams.visionDepth);
  const sLatLng = _getCachedLatLng(curr);
  const gCurr = gradientLookup ? gradientLookup(curr) : undefined;
  const useGradient = typeof gCurr === 'number';

  // `weights` depends only on simulationParams; cache it (rebuild only when the
  // relevant params change) instead of allocating a fresh object per call.
  const wKey = simulationParams.affordanceWeight + ':' + simulationParams.distancePenalty;
  if (!_knWeights || _knWeightsKey !== wKey) {
    _knWeights = {
      w_a: simulationParams.affordanceWeight,
      w_d: simulationParams.distancePenalty,
      w_theta: WEIGHTS.w_theta,
    };
    _knWeightsKey = wKey;
  }
  const weights = _knWeights;

  // Reuse module-level candidate buffers (reset in place; capacity is retained
  // across calls). The agent worker is single-threaded, so this is safe.
  const cellsArr = _knCells;
  cellsArr.length = 0;
  const anglesArr = _knAngles;
  anglesArr.length = 0;
  const affsArr = _knAffs;
  affsArr.length = 0;
  const frictionArr = _knFriction;
  frictionArr.length = 0;
  const gNsArr = useGradient ? (_knGNs || (_knGNs = [])) : null;
  if (gNsArr) gNsArr.length = 0;

  // Cache the friction/affordance closures (stable per batch) on module state.
  if (!_knGetFriction || _knFrictionLookup !== frictionLookup || _knCellState !== cellState) {
    _knGetFriction = cellState
      ? (n) => {
          const s = cellState[n];
          return s ? s.friction : undefined;
        }
      : (n) => frictionLookup[n];
    _knGetAffordance = cellState
      ? (n) => {
          const s = cellState[n];
          return s ? (s.affordance ?? 0.1) : 0.1;
        }
      : (n) => affordanceLookup?.[n] ?? 0.1;
    _knFrictionLookup = frictionLookup;
    _knCellState = cellState;
  }
  const getFriction = _knGetFriction;
  const getAffordance = _knGetAffordance;

  if (!_knIsVisible || _knVisibilityMap !== visibilityMap || _knIsVisibleFriction !== frictionLookup) {
    _knIsVisible = (a, b) => _getCachedVisibility(a, b, frictionLookup, visibilityMap);
    _knVisibilityMap = visibilityMap;
    _knIsVisibleFriction = frictionLookup;
  }
  const isVisible = _knIsVisible;

  if (!_knComputeAngle || _knBearingMap !== bearingMap) {
    _knComputeAngle = (n, sLatLng, currentDirection, curr) => {
      if (bearingMap) {
        const bng = bearingMap[curr + '::' + n];
        if (typeof bng === 'number') return angleDiff(bng, currentDirection);
      }
      const eLatLng = _getCachedLatLng(n);
      return angleDiff(_bearingFromLatLngs(sLatLng, eLatLng), currentDirection);
    };
    _knBearingMap = bearingMap;
  }
  const computeAngle = _knComputeAngle;

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
  const scores = useGradient ? (_knScores || (_knScores = [])) : null;
  if (scores) scores.length = cLen;

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

  if (cellsArr.length === 0) {
    // depth=1 reuses the canonical graph's r=1 adjacency (CSR indices); deeper
    // rings fall back to the disk cache (the graph only encodes distance-1 edges).
    const idxToCell = graph ? graph.idxToCell : null;
    for (let depth = 1; depth <= 3; depth++) {
      const nbrIdxs = depth === 1 && graph ? getGraphNeighborIndicesR1(graph, curr) : null;
      const disk = nbrIdxs ? null : _getCachedDisk(curr, depth);
      const count = nbrIdxs ? nbrIdxs.length : disk.length;
      let bestGrad = Infinity;
      let bestCandidate = null;

      for (let i = 0; i < count; i++) {
        const n = nbrIdxs ? idxToCell[nbrIdxs[i]] : disk[i];
        if (n === curr) continue;
        const f = getFriction(n);
        if (f === undefined || f >= impassableVal) continue;

        const g = gradientLookup ? (gradientLookup(n) ?? Infinity) : Infinity;
        if (g < bestGrad) {
          bestGrad = g;
          bestCandidate = n;
        }
      }
      if (bestCandidate) return getBearingFast(curr, bestCandidate, bearingMap);
    }
    return null;
  }

  const hasValidScores = useGradient && scores?.length > 0 && typeof scores[0] === 'number';
  if (
    hasValidScores &&
    typeof simulationParams.temperature === 'number' &&
    simulationParams.temperature > 0
  ) {
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
      const w = Math.exp((scores[i] - maxS) / simulationParams.temperature);
      weightsArr[i] = w;
      sum += w;
    }

    const r = rng() * sum;
    let acc = 0;
    for (let i = 0; i < scores.length; i++) {
      acc += weightsArr[i];
      if (r <= acc) return cellsArr[i];
    }
    return cellsArr[cellsArr.length - 1];
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

  return bestIndex >= 0 ? cellsArr[bestIndex] : null;
}

// Resolve the actual cell-by-cell line the agent walks from `curr` to
// `nextStep`. Thin adapter over the shared `resolveStepLine` (agentStep.js) —
// the obstacle-avoidance geometry lives there so this worker kernel and the
// main-thread kernel cannot drift. The cache-accessor closures are memoized at
// module scope so no closures are allocated on the hot per-step path.
const _knRslGetPathCells = (a, b) => _getCachedPathCells(a, b);
let _knRslGetDisk = null;

function _resolveStepLine(curr, nextStep, frictionLookup, cellState, graph) {
  if (!_knRslGetDisk) {
    // A single disk accessor covers both the BFS expansion and the corner check.
    _knRslGetDisk = (center, r) => _getCachedDisk(center, r);
  }
  return resolveStepLine({
    curr,
    nextStep,
    frictionLookup,
    cellState,
    getPathCells: _knRslGetPathCells,
    getDisk: _knRslGetDisk,
    graph,
    impassableVal: FRICTION_COSTS.IMPASSABLE,
  });
}

// Returns true if the straight H3 line from `curr` to `n` would cut across an
// impassable cell at any diagonal transition. Used to reject `nextStep`
// candidates the agent cannot actually reach without jumping a building corner.
function estimateMaxTicks(origin, dest, hexCount) {
  const dist = gridDistance(origin, dest);
  const pathBudget = Math.max(64, dist * SIM_TICK_BUFFER + 32);
  const globalBudget = 2 * Math.ceil(Math.sqrt(hexCount * Math.PI));
  return Math.min(MAX_SIM_TICKS, pathBudget, globalBudget);
}

function recordTraversal(map, cell) {
  // Support both plain objects and Map for backward compatibility with tests.
  if (typeof map.set === 'function') {
    map.set(cell, (map.get(cell) || 0) + 1);
  } else {
    map[cell] = (map[cell] || 0) + 1;
  }
}

function runAgentPath(
  originCell,
  destCell,
  destGradientObj,
  maxTicks,
  simAgentId,
  pathDesireMap,
  frictionLookup,
  affordanceLookup,
  cellState,
  visibilityMap,
  accumulatedFootprints,
  bearingMap,
  originDestDistances,
  simulationParams,
  graph,
  // `nodeSet` holds every origin/destination cell in the plan. The
  // `originDestDistances` table is keyed ONLY by node pairs, so the per-tick
  // `simCurrent + '::' + destCell` lookup can only ever return a number when
  // `simCurrent` is itself a node. Gating the lookup on `nodeSet.has(simCurrent)`
  // is therefore byte-identical to the old "always concat + read" behavior but
  // skips the string allocation + object read for the ~99% of ticks spent on
  // intermediate cells (millions of saved allocations per city-scale run).
  nodeSet
) {
  const params = simulationParams || SIMULATION_PARAMS;
  let simCurrent = originCell;
  const simTarget = destCell;

  let distToTarget = 0;
  let simDirection =
    getGradientDirection(
      simCurrent,
      destGradientObj,
      frictionLookup,
      cellState,
      bearingMap,
      graph
    ) ?? getBearingFast(simCurrent, simTarget, bearingMap);
  const simPath = [originCell];
  if (pathDesireMap) recordTraversal(pathDesireMap, originCell);

  let stuckCount = 0;
  const STUCK_THRESHOLD = 3;

  for (let tick = 0; tick < maxTicks; tick++) {
    // Update dynamic distance to target — the precomputed origin-to-destination
    // distance becomes stale if the agent takes a detour around obstacles.
    // The table is keyed only by node pairs, so the lookup can only hit when
    // `simCurrent` is a node; gating on `nodeSet` skips the per-tick string
    // concat + object read for intermediate cells (byte-identical, see header).
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
        if (pathDesireMap) recordTraversal(pathDesireMap, simTarget);
      }
      break;
    }

    const nextStep = getBestNextStep(
      simCurrent,
      destGradientObj,
      simDirection,
      simAgentId,
      params,
      frictionLookup,
      affordanceLookup,
      cellState,
      visibilityMap,
      accumulatedFootprints,
      bearingMap,
      graph
    );
    if (!nextStep || nextStep === simCurrent) {
      stuckCount++;
      if (stuckCount >= STUCK_THRESHOLD) break;
      continue;
    }

    stuckCount = 0;

    // Walk toward nextStep. Prefer the straight H3 line, but if it is blocked
    // by an impassable cell or would cut a building corner, route a local
    // detour around the obstacle so the agent walks *around* the corner
    // instead of jumping over it or stalling against the building.
    const line = _resolveStepLine(
      simCurrent,
      nextStep,
      frictionLookup,
      cellState,
      graph
    );
    let hitTarget = false;
    let lastReached = simCurrent;
    for (let i = 1; i < line.length; i++) {
      const stepCell = line[i];
      const stepF =
        cellState && cellState[stepCell] ? cellState[stepCell].friction : frictionLookup[stepCell];
      if (typeof stepF === 'undefined' || stepF >= FRICTION_COSTS.IMPASSABLE) break;
      simPath.push(stepCell);
      if (pathDesireMap) recordTraversal(pathDesireMap, stepCell);
      lastReached = stepCell;
      if (stepCell === simTarget) {
        hitTarget = true;
        break;
      }
    }

    if (hitTarget) break;

    // Use precomputed bearing map — eliminates trig call per direction update
    simDirection = getBearingFast(simCurrent, nextStep, bearingMap);
    simCurrent = lastReached;
    if (simCurrent === simTarget) break;
  }

  return simPath;
}

export function computeAgentBatch({
  plan = [],
  frictionEntries = null,
  gradients = {},
  affordanceEntries = null,
  hexCount = 0,
  visibilityEntries = null,
  options = {},
  accumulatedFootprints = null,
  originDestDistances = null,
  bearingMap = null,
  // S1-SAB (review6 §3 option 1): the raw packed visibility/bearing CSR buffer +
  // the exact AOI cell order. When supplied the worker REBUILDS the visibility +
  // bearing indices in-process instead of relying on the (broken, function-stripped)
  // Proxy clones it would otherwise receive via structured-clone. This restores the
  // O(log P) index off the main thread — without it every bearing/visibility lookup
  // silently falls back to the slow trig / path-cell path.
  visibilityBearingCSR = null,
  viewHexes = null,
  r1Adjacency = null,
} = {}) {
  const simulationParams = {
    ...SIMULATION_PARAMS,
    ...(options?.simulationParams || {}),
  };

  const frictionLookup = normalizeFrictionEntries(frictionEntries);
  const affordanceLookup = normalizeFrictionEntries(affordanceEntries);
  let visibilityMap = visibilityEntries || null;
  // Rebuild the CSR-backed visibility + bearing indices in-worker when the packed
  // buffer + cell order are available (worker dispatch path). This is preferred
  // over the `visibilityEntries`/`bearingMap` Proxies, which lose their function
  // traps under structured-clone and would degrade to the slow fallback.
  if (visibilityBearingCSR && viewHexes) {
    const recon = reconstructVisibilityBearing(visibilityBearingCSR, viewHexes);
    visibilityMap = recon.visibilityData.data;
    bearingMap = recon.bearingMap;
  }

  // Build the canonical gradient graph (CSR r=1 adjacency) once per batch from
  // the friction source. spatialTasks.js already builds the same graph keyed by
  // this exact object, so this is a cache hit when the module instance is shared
  // and at most one gridDisk pass otherwise. The sim path reuses it for every
  // distance-1 neighbor lookup instead of calling gridDisk(cell, 1) repeatedly.
  // M3: when the shared r=1 CSR (+ AOI cell order) is supplied, filter it instead
  // of running a per-cell gridDisk pass.
  const graph = getGradientGraph(frictionLookup, r1Adjacency, viewHexes);

  // Total agents for progress reporting
  let totalAgents = 0;
  for (let i = 0; i < plan.length; i++) {
    const assigned = plan[i].assigned || [];
    for (let j = 0; j < assigned.length; j++) totalAgents += assigned[j] || 0;
  }

  // Node set (every origin + destination in the plan) for the byte-identical
  // per-tick OD-distance lookup gate in runAgentPath (see its header).
  const nodeSet = new Set();
  for (let p = 0; p < plan.length; p++) {
    const entry = plan[p];
    if (entry.originCell) nodeSet.add(entry.originCell);
    const dcs = entry.destCandidates || [];
    for (let idx = 0; idx < dcs.length; idx++) {
      if (dcs[idx] && dcs[idx].dest) nodeSet.add(dcs[idx].dest);
    }
  }

  try {
    logger.debug('computeAgentBatch: received', { planLength: plan?.length ?? 0, totalAgents });
  } catch (_e) {}

  const emitEvery = Math.max(1, Math.floor(totalAgents / 20));
  // Plain object is faster than Map for string-key → integer-value accumulation.
  const pathDesireMap = Object.create(null);
  const perTargetContribs = Object.create(null);
  let processed = 0;

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

      let destGradientObj;
      // gradients are always typed arrays (M1) indexed by the graph's cellToIdx
      destGradientObj = destGradient;
      if (!isFinite(gradientGet(destGradientObj, originCell, graph))) {
        try {
          logger.debug('computeAgentBatch: skipping dest because origin missing in gradient', {
              originCell,
              destCell,
            });
        } catch (_e) {}
        continue;
      }

      if (!perTargetContribs[destCell]) perTargetContribs[destCell] = Object.create(null);
      const maxTicks = estimateMaxTicks(originCell, destCell, hexCount);

      // True ABM loop: agents step sequentially within shared ticks.
      // Each agent's positions accumulate as footprints that modify affordance
      // for subsequent agents in the same origin-destination batch.
      // This produces emergent path formation — the core phenomenon studied
      // in the paper, as opposed to Monte-Carlo sampling where every agent
      // plans independently against static terrain.
      const abmFootprints = accumulatedFootprints;

      for (let sim = 0; sim < count; sim++) {
        const simAgentId = `${originCell}:${destCell}:${sim}`;
        const simPath = runAgentPath(
          originCell,
          destCell,
          destGradientObj,
          maxTicks,
          simAgentId,
          pathDesireMap,
          frictionLookup,
          affordanceLookup,
          null,
          visibilityMap,
          abmFootprints,
          bearingMap,
          originDestDistances,
          simulationParams,
          graph,
          nodeSet
        );

        for (let k = 0; k < simPath.length; k++) {
          const cell = simPath[k];
          perTargetContribs[destCell][cell] = (perTargetContribs[destCell][cell] || 0) + 1;
          // Accumulate footprint: each visit increments the shared counter.
          // This is what turns independent Monte-Carlo sampling into a true
          // ABM where agents interact through accumulated terrain wear.
          if (abmFootprints) {
            abmFootprints[cell] = (abmFootprints[cell] || 0) + 1;
          }
        }

        processed++;
        if (processed % emitEvery === 0) {
          try {
            if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
              self.postMessage({
                progress: true,
                phase: 'agent-batch',
                processed,
                total: totalAgents,
              });
            }
          } catch (_e) {}
        }
      }
    }
  }

  // Flatten pathDesireMap (plain object → flat arrays for transfer)
  const pdKeys = Object.keys(pathDesireMap);
  const pdValsArr = new Uint32Array(pdKeys.length);
  for (let i = 0; i < pdKeys.length; i++) pdValsArr[i] = pathDesireMap[pdKeys[i]] || 0;

  const perTargetFlat = Object.create(null);
  const transfers = [];
  transfers.push(pdValsArr.buffer);
  for (const dest in perTargetContribs) {
    const obj = perTargetContribs[dest];
    const keys = Object.keys(obj);
    const vals = new Uint32Array(keys.length);
    for (let i = 0; i < keys.length; i++) vals[i] = obj[keys[i]] || 0;
    perTargetFlat[dest] = { __flat: true, keys, vals };
    transfers.push(vals.buffer);
  }

  const result = {
    processed,
    total: totalAgents,
    pathDesire: { __flat: true, keys: pdKeys, vals: pdValsArr },
    perTargetContribs: perTargetFlat,
  };

  try {
    logger.debug('computeAgentBatch: returning', {
        processed: result.processed,
        total: result.total,
        pathDesireKeys: pdKeys.length,
        perTargetCount: Object.keys(perTargetFlat).length,
      });
  } catch (_e) {}

  return { result, transfers };
}

// Export some internals for testing parity with single-threaded kernel
export { runAgentPath, estimateMaxTicks };
