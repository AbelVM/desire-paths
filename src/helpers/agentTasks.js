import { gridPathCells, gridDisk, cellToLatLng, gridDistance } from 'h3-js';
import { normalizeFrictionEntries } from './spatialTasks.js';
import {
  FRICTION_COSTS,
  WEIGHTS,
  VISUAL_DEPTH,
  VISUAL_ANGLE,
  TEMPERATURE,
  MAX_SIM_TICKS,
  SIM_TICK_BUFFER,
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
const CELL_LATLNG_CACHE_MAX = 1024;

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
  return stored;
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

function getGradientDirection(curr, gradientObj, frictionLookup, cellState, neighborDisks) {
  if (!gradientObj) return null;
  const gCurr = gradientObj[curr];
  if (typeof gCurr !== 'number') return null;

  const neighbors = _getCachedDisk(curr, 1, neighborDisks);
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

  return bestNeighbor ? getBearing(curr, bestNeighbor) : null;
}

function getBearing(start, end) {
  const s = _getCachedLatLng(start);
  const e = _getCachedLatLng(end);
  return _bearingFromLatLngs(s, e);
}

function getBestNextStep(
  curr,
  gradient,
  currentDirection,
  agentId,
  frictionLookup,
  affordanceLookup,
  cellState,
  visibilityMap,
  neighborDisks
) {
  const gradientLookup = gradient ? (n) => gradient[n] : null;
  const weights = WEIGHTS;
  const impassableVal = FRICTION_COSTS.IMPASSABLE;
  const visualAngleHalf = VISUAL_ANGLE / 2;

  const disk = _getCachedDisk(curr, VISUAL_DEPTH, neighborDisks);
  const sLatLng = _getCachedLatLng(curr);
  const gCurr = gradientLookup ? gradientLookup(curr) : undefined;
  const useGradient = typeof gCurr === 'number';

  const getFriction = cellState
    ? (n) => (cellState[n] ? cellState[n].friction : undefined)
    : (n) => frictionLookup[n];
  const getAffordance = cellState
    ? (n) => cellState[n]?.affordance ?? 0.1
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

    const eLatLng = _getCachedLatLng(n);
    const ang = angleDiff(_bearingFromLatLngs(sLatLng, eLatLng), currentDirection);
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
      const aff = affsArr[i];
      const stepCost = frictionArr[i] || 0;
      const delta = stepCost + gN - gCurr;
      let S_ij = weights.w_a * aff - weights.w_d * delta;
      S_ij -= (weights.w_theta || 0) * (anglesArr[i] / 180);
      scores[i] = S_ij;
    }
  }

  if (cellsArr.length === 0) {
    for (let depth = 1; depth <= 3; depth++) {
      const neighbors = _getCachedDisk(curr, depth, neighborDisks);
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
      if (bestCandidate) return getBearing(curr, bestCandidate);
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
    } else if (!isScoreValid && affsArr[i] > bestScore) {
      bestScore = affsArr[i];
      bestIndex = i;
    } else if (isScoreValid && Math.abs(S_ij - bestScore) < 1e-9) {
      const currentBestCost =
        (frictionArr[bestIndex] || 0) + (useGradient ? (gNsArr[bestIndex] ?? Infinity) : 0);
      const candidateCost = (frictionArr[i] || 0) + (useGradient ? (gNsArr[i] ?? Infinity) : 0);
      if (candidateCost < currentBestCost) {
        bestIndex = i;
      } else if (candidateCost === currentBestCost) {
        if (gridDistance(curr, cellsArr[i]) < gridDistance(curr, cellsArr[bestIndex])) {
          bestIndex = i;
        }
      }
    }
  }

  return bestIndex >= 0 ? cellsArr[bestIndex] : null;
}

function estimateMaxTicks(origin, dest, hexCount) {
  const dist = gridDistance(origin, dest);
  const pathBudget = Math.max(64, dist * SIM_TICK_BUFFER + 32);
  const globalBudget = 2 * Math.ceil(Math.sqrt(hexCount * Math.PI));
  return Math.min(MAX_SIM_TICKS, pathBudget, globalBudget);
}

function recordTraversal(map, cell) {
  map.set(cell, (map.get(cell) || 0) + 1);
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
  neighborDisks
) {
  let simCurrent = originCell;
  const simTarget = destCell;
  let simDirection =
    getGradientDirection(simCurrent, destGradientObj, frictionLookup, cellState, neighborDisks) ??
    getBearing(simCurrent, simTarget);
  const simPath = [originCell];
  if (pathDesireMap) recordTraversal(pathDesireMap, originCell);

  let stuckCount = 0;
  const STUCK_THRESHOLD = 3;

  for (let tick = 0; tick < maxTicks; tick++) {
    if (gridDistance(simCurrent, simTarget) <= 1) {
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
      frictionLookup,
      affordanceLookup,
      cellState,
      visibilityMap,
      neighborDisks
    );
    if (!nextStep || nextStep === simCurrent) {
      stuckCount++;
      if (stuckCount >= STUCK_THRESHOLD) break;
      continue;
    }

    stuckCount = 0;

    const line = _getCachedPathCells(simCurrent, nextStep);
    let hitTarget = false;
    for (let i = 1; i < line.length; i++) {
      const stepCell = line[i];
      const stepF =
        cellState && cellState[stepCell] ? cellState[stepCell].friction : frictionLookup[stepCell];
      if (typeof stepF === 'undefined' || stepF >= FRICTION_COSTS.IMPASSABLE) break;
      simPath.push(stepCell);
      if (pathDesireMap) recordTraversal(pathDesireMap, stepCell);
      if (stepCell === simTarget) {
        hitTarget = true;
        break;
      }
    }

    if (hitTarget) break;

    simDirection = getBearing(simCurrent, nextStep);
    simCurrent = nextStep;
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
} = {}) {
  const frictionLookup = normalizeFrictionEntries(frictionEntries);
  const affordanceLookup = normalizeFrictionEntries(affordanceEntries);
  const visibilityMap = visibilityEntries || null;

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
  const pathDesireMap = new Map();
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
          neighborDisks
        );

        for (let k = 0; k < simPath.length; k++) {
          const cell = simPath[k];
          perTargetContribs[destCell][cell] = (perTargetContribs[destCell][cell] || 0) + 1;
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

  // Flatten pathDesireMap
  const pdKeys = Array.from(pathDesireMap.keys());
  const pdValsArr = new Uint32Array(pdKeys.length);
  for (let i = 0; i < pdKeys.length; i++) pdValsArr[i] = pathDesireMap.get(pdKeys[i]) || 0;

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
