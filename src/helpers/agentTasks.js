import { gridPathCells, gridDisk, cellToLatLng, gridDistance } from 'h3-js';
import { normalizeFrictionEntries } from './spatialTasks.js';
import { getGradientGraph, getGraphNeighborsR1 } from './dijkstra.js';
import {
  FRICTION_COSTS,
  WEIGHTS,
  VISUAL_DEPTH,
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

// Small local caches (keeps worker stateless w.r.t. main thread)
const _cellLatLngCacheObj = Object.create(null);
const _cellLatLngCacheOrder = [];

function _clearLatLngCache() {
  for (const key in _cellLatLngCacheObj) delete _cellLatLngCacheObj[key];
  _cellLatLngCacheOrder.length = 0;
}

function _getCachedLatLng(cell) {
  const c = _cellLatLngCacheObj[cell];
  if (c) return c;
  const v = cellToLatLng(cell);
  const lat = v[0];
  const lng = v[1];
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const stored = [lat, lng, latRad, lngRad];
  _cellLatLngCacheObj[cell] = stored;
  _cellLatLngCacheOrder.push(cell);
  if (_cellLatLngCacheOrder.length > CELL_LATLNG_CACHE_MAX) {
    const old = _cellLatLngCacheOrder.shift();
    delete _cellLatLngCacheObj[old];
  }
  // Periodic full GC pass to reclaim drift from repeated miss/evict cycles.
  if (_cellLatLngCacheOrder.length > CELL_LATLNG_CACHE_MAX * 1.5) {
    _clearLatLngCache();
  }
  return stored;
}

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

// Bearing between two cells, given their precomputed [lat, lng, latRad, lngRad]
// lat/lng arrays (as returned by _getCachedLatLng). Assumes radians are present.
function _bearingFromLatLngs(s, e) {
  const lat1 = s[2];
  const lon1 = s[3];
  const lat2 = e[2];
  const lon2 = e[3];
  let y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  let x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function angleDiff(a, b) {
  const diff = Math.abs(((a - b + 540) % 360) - 180);
  return diff;
}

// Simple path/disk caches
const _pathCache = Object.create(null);
const _pathCacheOrder = [];
const PATH_CACHE_MAX = 256;

function _getCachedPathCells(a, b) {
  let inner = _pathCache[a];
  if (inner) {
    const hit = inner[b];
    if (hit) return hit;
  }
  const arr = gridPathCells(a, b);
  if (!inner) {
    inner = Object.create(null);
    _pathCache[a] = inner;
    _pathCacheOrder.push(a);
  }
  inner[b] = arr;
  if (_pathCacheOrder.length > PATH_CACHE_MAX) {
    const old = _pathCacheOrder.shift();
    delete _pathCache[old];
  }
  return arr;
}

const _diskCache = Object.create(null);
const _diskCacheOrder = [];
const DISK_CACHE_MAX = 256;

function _getCachedDisk(center, r, precomputedDisks) {
  // Use precomputed neighbor disk when available (VISUAL_DEPTH only)
  if (r === VISUAL_DEPTH && precomputedDisks) {
    const disk = precomputedDisks[center];
    if (disk) return disk;
  }

  // Fall back to LRU cache
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

function getGradientDirection(curr, gradientObj, frictionLookup, cellState, neighborDisks, bearingMap, graph) {
  if (!gradientObj) return null;
  const gCurr = gradientObj[curr];
  if (typeof gCurr !== 'number') return null;

  // Reuse the canonical gradient graph's r=1 adjacency when available; fall
  // back to the disk cache otherwise (same passable, in-AOI neighbor set).
  const neighbors = graph
    ? getGraphNeighborsR1(graph, curr)
    : _getCachedDisk(curr, 1, neighborDisks);
  let bestNeighbor = null;
  let bestGrad = gCurr;

  for (let i = 0; i < neighbors.length; i++) {
    const n = neighbors[i];
    if (n === curr) continue;
    let f;
    if (cellState && cellState[n]) f = cellState[n].friction;
    else f = frictionLookup[n];
    if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) continue;
    const gN = gradientObj[n];
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
  neighborDisks,
  accumulatedFootprints,
  bearingMap,
  graph
) {
  const gradientLookup = gradient ? (n) => gradient[n] : null;
  const weights = {
    w_a: simulationParams.affordanceWeight,
    w_d: simulationParams.distancePenalty,
    w_theta: WEIGHTS.w_theta,
  };
  const impassableVal = FRICTION_COSTS.IMPASSABLE;
  const visualAngleHalf = simulationParams.fieldOfView / 2;

  const disk = _getCachedDisk(curr, simulationParams.visionDepth, neighborDisks);
  const sLatLng = _getCachedLatLng(curr);
  const gCurr = gradientLookup ? gradientLookup(curr) : undefined;
  const useGradient = typeof gCurr === 'number';

  // Inline friction/affordance lookups — direct property access is ~3× faster than function calls
  const getFriction = cellState
    ? (n) => {
      const s = cellState[n];
      return s ? s.friction : undefined;
    }
    : (n) => frictionLookup[n];
  const getAffordance = cellState
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
    if (!_getCachedVisibility(curr, n, frictionLookup, visibilityMap)) continue;

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
        // Logarithmic scaling: each doubling of visits adds diminishing bonus
        aff += Math.log1p(fp) * 0.05;
      }

      const delta = stepCost + gN - gCurr;
      let S_ij = weights.w_a * aff - weights.w_d * delta;
      S_ij -= (weights.w_theta || 0) * (anglesArr[i] / 180);
      scores[i] = S_ij;
    }
  }

  if (cellsArr.length === 0) {
    for (let depth = 1; depth <= 3; depth++) {
      // depth=1 reuses the canonical graph's r=1 adjacency; deeper rings fall
      // back to the disk cache (the graph only encodes distance-1 edges).
      const neighbors =
        depth === 1 && graph
          ? getGraphNeighborsR1(graph, curr)
          : _getCachedDisk(curr, depth, neighborDisks);
      let bestGrad = Infinity;
      let bestCandidate = null;

      for (let i = 0; i < neighbors.length; i++) {
        const n = neighbors[i];
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

  return bestIndex >= 0 ? cellsArr[bestIndex] : null;
}

// Resolve the actual cell-by-cell line the agent walks from `curr` to
// `nextStep`. Returns the straight H3 line when it is clear of impassable
// cells and does not cut a building corner. Otherwise performs a bounded BFS
// detour over the local neighborhood so the agent walks *around* the obstacle
// instead of jumping over it or stalling against the building.
function _resolveStepLine(curr, nextStep, frictionLookup, cellState, neighborDisks, graph) {
  const straight = _getCachedPathCells(curr, nextStep);
  let clear = true;
  for (let i = 1; i < straight.length; i++) {
    const c = straight[i];
    const f = cellState && cellState[c] ? cellState[c].friction : frictionLookup[c];
    if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) {
      clear = false;
      break;
    }
    // Detect a diagonal transition that would cut an impassable corner.
    if (i > 1 && gridDistance(straight[i - 1], c) > 1) {
      if (_cornersImpassable(curr, straight[i - 1], c, frictionLookup, cellState)) {
        clear = false;
        break;
      }
    }
  }
  if (clear) return straight;

  // BFS detour within the local disk (bounded by VISUAL_DEPTH for cost).
  const prev = Object.create(null);
  const seen = Object.create(null);
  const queue = [curr];
  seen[curr] = true;
  let found = false;
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === nextStep) {
      found = true;
      break;
    }
    // Reuse the canonical graph's r=1 adjacency for the BFS expansion.
    const nb = graph ? getGraphNeighborsR1(graph, node) : _getCachedDisk(node, 1, neighborDisks);
    for (let i = 0; i < nb.length; i++) {
      const m = nb[i];
      if (m === node || seen[m]) continue;
      const mf = cellState && cellState[m] ? cellState[m].friction : frictionLookup[m];
      if (typeof mf === 'undefined' || mf >= FRICTION_COSTS.IMPASSABLE) continue;
      seen[m] = true;
      prev[m] = node;
      queue.push(m);
    }
  }
  if (!found) return straight; // fall back; movement loop will stop safely

  // Reconstruct path curr -> ... -> nextStep
  const path = [];
  let node = nextStep;
  while (node !== curr) {
    path.push(node);
    node = prev[node];
    if (node === undefined) return straight; // safety
  }
  path.reverse();
  return [curr, ...path];
}

// Returns true if stepping diagonally from cell `a` to cell `b` (gridDistance 2)
// would cut across an impassable cell at their shared corner. Two diagonal H3
// cells share exactly one common neighbor; if that neighbor is impassable the
// agent must walk around the corner rather than cutting across it.
function _cornersImpassable(_curr, a, b, frictionLookup, cellState) {
  const neighborsA = _getCachedDisk(a, 1, null);
  const neighborsB = _getCachedDisk(b, 1, null);
  for (let i = 0; i < neighborsA.length; i++) {
    const c = neighborsA[i];
    if (c === a || c === b) continue;
    let isNeighbor = false;
    for (let j = 0; j < neighborsB.length; j++) {
      if (neighborsB[j] === c) {
        isNeighbor = true;
        break;
      }
    }
    if (!isNeighbor) continue;
    const f = cellState && cellState[c] ? cellState[c].friction : frictionLookup[c];
    if (typeof f !== 'undefined' && f >= FRICTION_COSTS.IMPASSABLE) return true;
  }
  return false;
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
  neighborDisks,
  accumulatedFootprints,
  bearingMap,
  originDestDistances,
  simulationParams,
  graph
) {
  const params = simulationParams || SIMULATION_PARAMS;
  let simCurrent = originCell;
  const simTarget = destCell;

  let distToTarget = 0;
  let simDirection =
    getGradientDirection(simCurrent, destGradientObj, frictionLookup, cellState, neighborDisks, bearingMap, graph) ??
    getBearingFast(simCurrent, simTarget, bearingMap);
  const simPath = [originCell];
  if (pathDesireMap) recordTraversal(pathDesireMap, originCell);

  let stuckCount = 0;
  const STUCK_THRESHOLD = 3;

  for (let tick = 0; tick < maxTicks; tick++) {
    // Update dynamic distance to target — the precomputed origin-to-destination
    // distance becomes stale if the agent takes a detour around obstacles.
    if (originDestDistances) {
      const currentDist = originDestDistances[simCurrent + '::' + destCell];
      if (typeof currentDist === 'number') distToTarget = currentDist;
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
      neighborDisks,
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
    const line = _resolveStepLine(simCurrent, nextStep, frictionLookup, cellState, neighborDisks, graph);
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
  neighborDisks = null,
  options = {},
  accumulatedFootprints = null,
  originDestDistances = null,
  bearingMap = null,
} = {}) {
  const simulationParams = {
    ...SIMULATION_PARAMS,
    ...(options?.simulationParams || {}),
  };

  const frictionLookup = normalizeFrictionEntries(frictionEntries);
  const affordanceLookup = normalizeFrictionEntries(affordanceEntries);
  const visibilityMap = visibilityEntries || null;

  // Build the canonical gradient graph (CSR r=1 adjacency) once per batch from
  // the friction source. spatialTasks.js already builds the same graph keyed by
  // this exact object, so this is a cache hit when the module instance is shared
  // and at most one gridDisk pass otherwise. The sim path reuses it for every
  // distance-1 neighbor lookup instead of calling gridDisk(cell, 1) repeatedly.
  const graph = getGradientGraph(frictionLookup);

  // Total agents for progress reporting
  let totalAgents = 0;
  for (let i = 0; i < plan.length; i++) {
    const assigned = plan[i].assigned || [];
    for (let j = 0; j < assigned.length; j++) totalAgents += assigned[j] || 0;
  }

  try {
    console.debug &&
      console.debug('computeAgentBatch: received', { planLength: plan?.length ?? 0, totalAgents });
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
      // gradients are always plain objects — the Map branch is dead code
      destGradientObj = destGradient;
      if (typeof destGradientObj[originCell] !== 'number') {
        try {
          console.debug &&
            console.debug('computeAgentBatch: skipping dest because origin missing in gradient', {
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
          neighborDisks,
          abmFootprints,
          bearingMap,
          originDestDistances,
          simulationParams,
          graph
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
    console.debug &&
      console.debug('computeAgentBatch: returning', {
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
