import { logger } from './logger.js';
import { gridPathCells, gridDisk, cellToLatLng, gridDistance } from 'h3-js';
import { normalizeFrictionEntries } from './spatialTasks.js';
import { getGradientGraph, getGradientGraphFromArray, getGraphNeighborIndicesR1, gradientGet, graphFriction } from './dijkstra.js';
import { _bearingFromLatLngs, angleDiff } from './bearing.js';
import { reconstructVisibilityBearing } from './bearingIndex.js';
import {
  gatherCandidates,
  gatherCandidatesIndexed,
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
  COMPUTE_PATH_CACHE_MAX,
  COMPUTE_DISK_CACHE_MAX,
  SIMULATION_PARAMS,
} from './constants.js';
import { createLCG, strHash } from './rng.js';

// Small local cache (keeps worker stateless w.r.t. main thread).
// LRU: a Map whose insertion order == recency. On a hit we delete+re-set to
// move the entry to the most-recent end, and evict the oldest (first) key on
// overflow. This replaces the old push/shift array + periodic *full* reset,
// which discarded every useful entry once the cache drifted past 1.5× the cap
// and caused a recompute storm (C2).
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
// Per-candidate footprint counts, captured at candidate-gather time and kept in
// lockstep with `_knCells` (swapped together in partitionVisibleCone). Lets the
// scorer read a candidate's ABM wear as a typed-array subscript (`fpArr[i]`)
// instead of a per-candidate cell-string hash into a plain object.
let _knFp = null;

// Cached per-batch closures. Rebuilt only when their stable inputs change
// (identity-guarded), so getBestNextStep stops allocating closures per call.
let _knGetFriction = null;
let _knGetAffordance = null;
let _knFrictionLookup = null;
let _knFrictionGraph = null;
let _knIsVisible = null;
let _knVisibilityMap = null;
let _knIsVisibleFriction = null;
let _knIsVisibleGraph = null;
let _knComputeAngle = null;
let _knBearingMap = null;
let _knWeights = null;
let _knWeightsKey = null;
// Cached footprint accessor for the STRING kernel (identity-guarded on the
// footprint source + graph). The indexed kernel reads footprints[gIdx] directly
// (no closure); the string kernel resolves cell→graph-index here.
let _knGetFootprint = null;
let _knFootprintSrc = undefined;
let _knFootprintGraph = undefined;
// Index-space kernel inputs (S1). Set once per batch when the visibility
// CSR + viewHexes are available and the flag is on; consumed by the
// indexed candidate-gather branch in getBestNextStep.
let _knUseIndexed = false;
let _knVisOffsets = null;
let _knVisNeighbors = null;
let _knBearings = null;
let _knViewHexes = null;
let _knViewIdxToGraphIdx = null;
let _knCellToViewIdx = null;
// Reused per-call buffer for the temperature softmax weights (S3). The
// main-thread twin pools this as `ctx._candWeights`; mirror it here so the
// worker stops allocating a fresh `new Array(scores.length)` on every one of
// the millions of getBestNextStep invocations when temperature > 0.
let _knWeightsArr = null;
// Mutable affordance snapshot (Float32Array(V), indexed by `graph.cellToIdx`),
// built once per batch from `affordanceLookup`. The worker never applies wear
// (that happens on the main thread after the batch returns), so this is
// read-only here — but it lives in a typed array so hot-path affordance reads
// are O(1) and we avoid holding a second N-entry plain object.
let _knAffordanceArr = null;

// Fast bearing lookup: uses precomputed bearing map when available,
// falls back to trig-based calculation otherwise.
function getBearingFast(a, b, bearingMap) {
  if (bearingMap) {
    // Prefer the integer-index accessor (no `a + '::' + b` string concat +
    // Proxy `indexOf`/`slice` in the hot path). The CSR-backed BearingIndex
    // Proxy exposes `getBearing`; a legacy real `Map` does not, so fall back to
    // the string-keyed read for those (tests).
    if (typeof bearingMap.getBearing === 'function') {
      const bng = bearingMap.getBearing(a, b);
      if (typeof bng === 'number') return bng;
    }
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
  if (_pathCacheOrder.length > COMPUTE_PATH_CACHE_MAX) {
    const old = _pathCacheOrder.shift();
    delete _pathCache[old];
  }
  return reversed ? arr.slice().reverse() : arr;
}

const _diskCache = Object.create(null);
const _diskCacheOrder = [];

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
  if (_diskCacheOrder.length > COMPUTE_DISK_CACHE_MAX) {
    const old = _diskCacheOrder.shift();
    delete _diskCache[old];
  }
  return arr;
}

function _getCachedVisibility(a, b, frictionLookup, visibilityMap, graph) {
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
    const f = graph ? graphFriction(graph, c) : frictionLookup[c];
    if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) return false;
  }
  return true;
}

function getGradientDirection(
  curr,
  gradientObj,
  frictionLookup,
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
    const f = graph ? graphFriction(graph, n) : frictionLookup[n];
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
  visibilityMap,
  accumulatedFootprints,
  bearingMap,
  graph
) {
  const gradientLookup = gradient ? (n) => gradientGet(gradient, n, graph) : null;
  const impassableVal = FRICTION_COSTS.IMPASSABLE;
  const visualAngleHalf = simulationParams.fieldOfView / 2;

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
  const fpArr = _knFp || (_knFp = []);
  fpArr.length = 0;

  // Cache the friction/affordance closures (stable per batch) on module state.
  // When a gradient graph is available, read friction/affordance from the
  // graph's typed arrays (indexed by `cellToIdx`) instead of the plain-object
  // lookups — faster and avoids the N-entry plain-object copies in the hot path.
  if (!_knGetFriction || _knFrictionLookup !== frictionLookup || _knFrictionGraph !== graph) {
    _knGetFriction = graph
      ? (n) => graphFriction(graph, n)
      : (n) => frictionLookup[n];
    _knGetAffordance = graph
      ? (n) => {
          const i = graph.cellToIdx[n];
          return i === undefined ? 0.1 : _knAffordanceArr[i];
        }
      : (n) => affordanceLookup?.[n] ?? 0.1;
    _knFrictionLookup = frictionLookup;
    _knFrictionGraph = graph;
  }
  const getFriction = _knGetFriction;
  const getAffordance = _knGetAffordance;

  if (
    !_knIsVisible ||
    _knVisibilityMap !== visibilityMap ||
    _knIsVisibleFriction !== frictionLookup ||
    _knIsVisibleGraph !== graph
  ) {
    _knIsVisible = (a, b) => _getCachedVisibility(a, b, frictionLookup, visibilityMap, graph);
    _knVisibilityMap = visibilityMap;
    _knIsVisibleFriction = frictionLookup;
    _knIsVisibleGraph = graph;
  }
  const isVisible = _knIsVisible;

  if (!_knComputeAngle || _knBearingMap !== bearingMap) {
    _knComputeAngle = (n, sLatLng, currentDirection, curr) => {
      if (bearingMap) {
        let bng;
        if (typeof bearingMap.getBearing === 'function') bng = bearingMap.getBearing(curr, n);
        else bng = bearingMap[curr + '::' + n];
        if (typeof bng === 'number') return angleDiff(bng, currentDirection);
      }
      const eLatLng = _getCachedLatLng(n);
      return angleDiff(_bearingFromLatLngs(sLatLng, eLatLng), currentDirection);
    };
    _knBearingMap = bearingMap;
  }
  const computeAngle = _knComputeAngle;

  // Footprint accessor for the string kernel. `accumulatedFootprints` is a
  // Uint32Array(V) indexed by graph.cellToIdx in the batch path (graph present),
  // or a plain object keyed by cell id in the (rare) no-graph path. Rebuilt only
  // when the source or graph identity changes, so getBestNextStep allocates no
  // closure on the hot path.
  if (
    _knFootprintSrc !== accumulatedFootprints ||
    _knFootprintGraph !== graph
  ) {
    const fp = accumulatedFootprints;
    if (!fp) {
      _knGetFootprint = null;
    } else if (graph) {
      const c2i = graph.cellToIdx;
      _knGetFootprint = (n) => {
        const gi = c2i[n];
        return gi === undefined ? 0 : fp[gi];
      };
    } else {
      _knGetFootprint = (n) => fp[n] || 0;
    }
    _knFootprintSrc = accumulatedFootprints;
    _knFootprintGraph = graph;
  }
  const getFootprint = _knGetFootprint;

  // Index-space candidate gather (S1). When enabled and the CSR is
  // available, enumerate `curr`'s visible neighbors directly from the
  // visibility CSR (typed-array reads, no gridDisk / isVisible
  // binary-search / bearing trig / string cellToIdx). The CSR
  // neighbor set is exactly the post-`isVisible`-filter candidate
  // set the string kernel produces in production (the worker's
  // `isVisible` already resolves to the CSR BFS-reachability
  // Proxy), so the two kernels enumerate the same cells — only
  // the order differs, which does not affect the max-score
  // selection except on exact score ties.
  let candCount = 0;
  let usedIndexed = false;
  if (_knUseIndexed && _knCellToViewIdx) {
    const currV = _knCellToViewIdx.get(curr);
    if (currV !== undefined) {
      candCount = gatherCandidatesIndexed({
        currVIdx: currV,
        visOffsets: _knVisOffsets,
        visNeighbors: _knVisNeighbors,
        bearings: _knBearings,
        viewHexes: _knViewHexes,
        viewIdxToGraphIdx: _knViewIdxToGraphIdx,
        frictionArr: graph ? graph.frictionArr : null,
        affordanceArr: _knAffordanceArr,
        gradientObj: gradient,
        useGradient,
        impassableVal,
        cellsArr,
        anglesArr,
        affsArr,
        frictionArrOut: frictionArr,
        gNsArr,
        currentDirection,
        footprints: accumulatedFootprints,
        fpArr,
      });
      usedIndexed = true;
    }
  }
  if (!usedIndexed) {
    // The string kernel is the only consumer of the vision-depth disk and the
    // current cell's lat/lng. The indexed kernel enumerates candidates directly
    // from the visibility CSR and computes angles from precomputed bearings, so
    // computing these here would be wasted H3/trig work on every step.
    const disk = _getCachedDisk(curr, simulationParams.visionDepth);
    const sLatLng = _getCachedLatLng(curr);
    const candCountFallback = gatherCandidates({
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
      getFootprint,
      fpArr,
    });
    candCount = candCountFallback;
  }

  const hardCount = partitionVisibleCone({
    cellsArr,
    anglesArr,
    affsArr,
    frictionArr,
    gNsArr,
    fpArr,
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
      weights,
      gCurr,
      fpArr,
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
      if (bestCandidate) return bestCandidate;
    }
    return null;
  }

  const hasValidScores = useGradient && scores?.length > 0 && typeof scores[0] === 'number';
  if (
    hasValidScores &&
    typeof simulationParams.temperature === 'number' &&
    simulationParams.temperature > 0
  ) {
    const seed = strHash(agentId + ':' + curr);
    const rng = createLCG(seed);
    let maxS = -Infinity;
    for (let i = 0; i < scores.length; i++) {
      const v = scores[i];
      if (v > maxS) maxS = v;
    }

    const weightsArr = _knWeightsArr && _knWeightsArr.length >= scores.length
      ? _knWeightsArr
      : (_knWeightsArr = new Float64Array(scores.length));
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
    fpArr,
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

function _resolveStepLine(curr, nextStep, frictionLookup, graph) {
  if (!_knRslGetDisk) {
    // A single disk accessor covers both the BFS expansion and the corner check.
    _knRslGetDisk = (center, r) => _getCachedDisk(center, r);
  }
  return resolveStepLine({
    curr,
    nextStep,
    frictionLookup,
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

// G (review11 §G): inline per-cell accumulation used by runAgentPath. Replaces
// the old `simPath` array + post-run re-scan. `pathDesireMap`/`destContrib` are
// plain objects (string-key → count); `accumulatedFootprints` is a Uint32Array(V)
// indexed by `fpCellToIdx` when a graph is present, or a plain object keyed by
// cell id in the (rare) no-graph path. All arguments are optional so the
// function is a no-op for any accumulator that is absent. Module-level (allocated
// once), so it adds no per-agent / per-tick closure churn.
function _recordCell(cell, pathDesireMap, destContrib, accumulatedFootprints, fpCellToIdx, useAtomics) {
  if (pathDesireMap) pathDesireMap[cell] = (pathDesireMap[cell] || 0) + 1;
  if (destContrib) destContrib[cell] = (destContrib[cell] || 0) + 1;
  if (fpCellToIdx) {
    const gi = fpCellToIdx[cell];
    if (gi !== undefined) {
      if (useAtomics) Atomics.add(accumulatedFootprints, gi, 1);
      else accumulatedFootprints[gi]++;
    }
  } else if (accumulatedFootprints) {
    accumulatedFootprints[cell] = (accumulatedFootprints[cell] || 0) + 1;
  }
}

// O(1) typed-matrix lookup for the precomputed origin-destination distances
// (S7). Mirrors the helper in compute.js so the worker kernel reads the same
// `{ originToIdx, destToIdx, D, matrix }` shape that survives structured-clone
// (the matrix is a Float32Array, the index maps are Maps — all clone; a method
// would not). The table stores only origin→dest pairs (the second argument is
// always a destination), so `a` is resolved via `originToIdx` and `b` via
// `destToIdx`. Returns the finite distance, or `undefined` for unfilled pairs.
function lookupOriginDest(od, a, b) {
  if (!od) return undefined;
  const ai = od.originToIdx.get(a);
  const bi = od.destToIdx.get(b);
  if (ai === undefined || bi === undefined) return undefined;
  const v = od.matrix[ai * od.D + bi];
  return Number.isFinite(v) ? v : undefined;
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
  nodeSet,
  // G (review11 §G): the per-target contribution accumulator and the footprint
  // index/atomic flag are passed in so each visited cell is recorded inline
  // instead of being collected into a `simPath` array and re-iterated after the
  // run. This removes the per-agent array allocation (up to `maxTicks` cell
  // refs) and the post-run re-scan — the dominant per-agent GC source at city
  // scale. The cell strings are shared `viewHexes` references, so only the array
  // itself (not the strings) was wasted.
  destContrib,
  fpCellToIdx,
  useAtomics
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
      bearingMap,
      graph
    ) ?? getBearingFast(simCurrent, simTarget, bearingMap);

  // G: record the origin cell inline into the path-desire, per-target, and
  // footprint accumulators (replaces `simPath.push(originCell)` +
  // `recordTraversal`).
  _recordCell(originCell, pathDesireMap, destContrib, accumulatedFootprints, fpCellToIdx, useAtomics);

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
        const currentDist = lookupOriginDest(originDestDistances, simCurrent, destCell);
        if (typeof currentDist === 'number') distToTarget = currentDist;
      }
    } else {
      distToTarget = gridDistance(simCurrent, simTarget);
    }

    // Use dynamic distance check — eliminates stale precomputed distance bug
    if (distToTarget <= 1) {
      if (simTarget !== simCurrent) {
        _recordCell(simTarget, pathDesireMap, destContrib, accumulatedFootprints, fpCellToIdx, useAtomics);
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
      graph
    );
    let hitTarget = false;
    let lastReached = simCurrent;
    for (let i = 1; i < line.length; i++) {
      const stepCell = line[i];
      // Typed-array friction read (graph.frictionArr) when a graph is present —
      // byte-identical to `frictionLookup[stepCell]` for every cell queried here
      // (impassable → undefined → break; passable → same number), but avoids the
      // string-keyed plain-object read in the inner line-walk loop.
      const stepF = graph ? graphFriction(graph, stepCell) : frictionLookup[stepCell];
      if (typeof stepF === 'undefined' || stepF >= FRICTION_COSTS.IMPASSABLE) break;
      _recordCell(stepCell, pathDesireMap, destContrib, accumulatedFootprints, fpCellToIdx, useAtomics);
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
}



// review12 #7: zero-copy friction lookup over the SAB-backed `frictionArr`
// (aligned to `viewHexes`). Used as the kernel's `frictionLookup` fallback when
// the gradient graph is unavailable; in production the graph is always present
// so this is never read, but it must be a valid lookup object. Cached per
// `frictionArr` so the kernel's frictionLookup-identity cache stays valid across
// batches (the SAB is shared, so the same Proxy is reused).
let _arrFrictionLookupArr = null;
let _arrFrictionLookup = null;
function getArrayFrictionLookup(frictionArr, viewHexes) {
  // review12 #7: key on the underlying buffer identity so the SAB-backed array
  // (shared across batches) reuses the same Proxy instead of rebuilding the
  // cell->index Map every batch.
  const key = frictionArr && frictionArr.buffer;
  if (key === _arrFrictionLookupArr && _arrFrictionLookup) return _arrFrictionLookup;
  const cellToIdx = new Map();
  for (let i = 0; i < viewHexes.length; i++) cellToIdx.set(viewHexes[i], i);
  const lookup = new Proxy(
    {},
    {
      get(_t, c) {
        if (typeof c !== 'string') return undefined;
        const i = cellToIdx.get(c);
        return i === undefined ? undefined : frictionArr[i];
      },
      has(_t, c) {
        return typeof c === 'string' && cellToIdx.has(c);
      },
    }
  );
  _arrFrictionLookupArr = key;
  _arrFrictionLookup = lookup;
  return lookup;
}

export function computeAgentBatch({
  plan = [],
  frictionEntries = null,
  frictionArr = null,
  gradients = {},
  affordanceEntries = null,
  hexCount = 0,
  visibilityEntries = null,
  options = {},
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

  // Build the canonical gradient graph (CSR r=1 adjacency) from the friction
  // source. review12 #7: when the SAB-backed `frictionArr` (aligned to
  // viewHexes) is shipped AND cross-origin isolated, build the graph directly
  // from the typed array and key the cache on the (stable SAB) buffer identity —
  // so the worker builds the graph ONCE per run and reuses it for every agent
  // batch instead of re-normalizing a plain-object copy (and rebuilding) every
  // batch. Otherwise fall back to the normalized plain-object path (local /
  // no-SAB fallback), which preserves the prior per-batch behavior exactly.
  let frictionLookup;
  let graph;
  const useArrayFriction =
    frictionArr &&
    Array.isArray(viewHexes) &&
    viewHexes.length > 0 &&
    frictionArr.buffer instanceof SharedArrayBuffer;
  if (useArrayFriction) {
    graph = getGradientGraphFromArray(frictionArr, r1Adjacency, viewHexes);
    frictionLookup = getArrayFrictionLookup(frictionArr, viewHexes);
  } else {
    frictionLookup = normalizeFrictionEntries(frictionEntries);
    graph = getGradientGraph(frictionLookup, r1Adjacency, viewHexes);
  }

  // Snapshot affordance into a typed array indexed by `graph.cellToIdx` so the
  // hot-path `getAffordance` reads are O(1) typed-array accesses (no N-entry
  // plain-object copy held for the whole batch). Read-only in the worker.
  if (graph) {
    const V = graph.V;
    const affArr = new Float32Array(V);
    const idxToCell = graph.idxToCell;
    for (let i = 0; i < V; i++) {
      const a = affordanceLookup[idxToCell[i]];
      affArr[i] = typeof a === 'number' ? a : 0.1;
    }
    _knAffordanceArr = affArr;
  } else {
    _knAffordanceArr = null;
  }

  // Index-space kernel setup (S1). When the flag is on and the
  // visibility CSR + viewHexes are available, extract the CSR
  // components (viewHexes-indexed, same indexing the mapping graph
  // uses) and build the one-time viewHexes→graph index map so the
  // hot path can enumerate candidates as pure typed-array reads.
  // Guarded by try/catch: any missing input falls back to the
  // string kernel (byte-identical behavior).
  //
  // Parity scope: the candidate SET is byte-identical to the string
  // kernel on every step, and the per-candidate scores (and therefore
  // the softmax probabilities) are identical too. At temperature=0
  // selection is enumeration-order-independent (selectBestCandidate
  // breaks exact score ties by cell id), so pathDesire/perTargetContribs
  // match the string kernel BYTE-for-byte. At temperature>0 the softmax
  // cumulative sampling walks candidates in enumeration order, so a given
  // seeded RNG draw maps to a different specific cell than the string
  // kernel (gridDisk order) — the CHOICE PROBABILITY DISTRIBUTION is
  // identical, only the realization differs. The emergent aggregate is
  // therefore statistically equivalent (measured ~4.5% aggregate deviation
  // at temp=0.5, ~86% cell-set overlap), which is why the indexed kernel
  // is safe to run at ALL temperatures — we intentionally do NOT pay a
  // per-step canonical sort that would only buy byte-reproducibility of
  // an already-stochastic process.
  _knUseIndexed = false;
  if (simulationParams.useIndexedKernel && visibilityBearingCSR && viewHexes && graph) {
    try {
      const csr = visibilityBearingCSR;
      const visOffsets = new Int32Array(csr.buffer, 0, csr.N + 1);
      const visNeighbors = new Int32Array(csr.buffer, csr.offsetsBytes, csr.P);
      const bearings = new Uint16Array(csr.buffer, csr.offsetsBytes + csr.neighborsBytes, csr.P);
      const N = viewHexes.length;
      const viewIdxToGraphIdx = new Int32Array(N);
      for (let i = 0; i < N; i++) {
        const g = graph.cellToIdx[viewHexes[i]];
        viewIdxToGraphIdx[i] = g === undefined ? -1 : g;
      }
      const cellToViewIdx = new Map();
      for (let i = 0; i < N; i++) cellToViewIdx.set(viewHexes[i], i);
      _knVisOffsets = visOffsets;
      _knVisNeighbors = visNeighbors;
      _knBearings = bearings;
      _knViewHexes = viewHexes;
      _knViewIdxToGraphIdx = viewIdxToGraphIdx;
      _knCellToViewIdx = cellToViewIdx;
      _knUseIndexed = true;
    } catch (_e) {
      _knUseIndexed = false;
    }
  }

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

  // Global shared footprint accumulator for the WHOLE batch. Every agent in the
  // simulation (all origin→destination pairs) accumulates into this single
  // structure, so later agents — including those of *other* pairs — see the
  // wear earlier agents left behind. This is the true ABM interaction that
  // produces emergent desire paths (paper §3.4), and it is what makes the run
  // order-dependent and therefore require a single execution context. The
  // accumulator is owned by the worker (S5): it starts empty and is never read
  // back on the main thread, so there is no reason to structured-clone an
  // (empty) object across the worker boundary.
  //
  // Backed by a Uint32Array(V) indexed by graph.cellToIdx (the same index space
  // the candidate scorer reads via `fpArr`), so both the per-candidate footprint
  // read and the per-cell write are O(1) typed-array ops instead of string-keyed
  // plain-object mutations. Falls back to a plain object only when no gradient
  // graph exists (degenerate empty-friction case).
  //
  // Persistent / shared footprint accumulator (P1, review10 §4/§1.1 + wave
  // model). `options.footprintBuffer` is a typed array (length >= graph.V) the
  // caller OWNS and REUSES across waves, so later waves see the wear earlier
  // waves left behind — the true ABM interaction. When it is SAB-backed (page is
  // cross-origin isolated) writes use `Atomics.add` so multiple agent workers
  // can share ONE global footprint; otherwise plain `++` (single-worker). When
  // absent, a private Uint32Array is allocated per call (no cross-wave
  // persistence), preserving the legacy single-call semantics.
  const footprintBuffer =
    graph &&
    options?.footprintBuffer &&
    ArrayBuffer.isView(options.footprintBuffer) &&
    options.footprintBuffer.length >= graph.V
      ? options.footprintBuffer
      : null;
  const useAtomics = !!footprintBuffer && footprintBuffer.buffer instanceof SharedArrayBuffer;
  const abmFootprints = footprintBuffer || (graph ? new Uint32Array(graph.V) : Object.create(null));
  const fpCellToIdx = graph ? graph.cellToIdx : null;

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

      for (let sim = 0; sim < count; sim++) {
        const simAgentId = `${originCell}:${destCell}:${sim}`;
        // G (review11 §G): pass the per-target contribution accumulator and the
        // footprint index/atomic flag so runAgentPath records each visited cell
        // inline — no `simPath` array is built or re-scanned afterwards.
        runAgentPath(
          originCell,
          destCell,
          destGradientObj,
          maxTicks,
          simAgentId,
          pathDesireMap,
          frictionLookup,
          affordanceLookup,
          visibilityMap,
          abmFootprints,
          bearingMap,
          originDestDistances,
          simulationParams,
          graph,
          nodeSet,
          perTargetContribs[destCell],
          fpCellToIdx,
          useAtomics
        );

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

// Single canonical agent-path kernel. The worker batch path (computeAgentBatch)
// is the only caller, so there is exactly one implementation of the pathfinding
// logic — no second kernel to drift.
export {
  runAgentPath,
  estimateMaxTicks,
  getBestNextStep,
  getGradientDirection,
  getBearingFast,
  _resolveStepLine,
};
