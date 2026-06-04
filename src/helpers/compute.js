import { MinHeap } from './minheap.js';
import { gridPathCells, gridDisk, cellToLatLng, gridDistance } from 'h3-js';
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
} from './constants.js';

// Local cache bounds for compute-heavy H3 calls (tuned from instrumentation)
const COMPUTE_PATH_CACHE_MAX = 256;
const COMPUTE_DISK_CACHE_MAX = 256;
const COMPUTE_VISIBILITY_CACHE_MAX = 2048;
const CELL_LATLNG_CACHE_MAX = 1024;

// Module-level lat/lng cache (FIFO object-based cache to avoid Map hotspots)
const _cellLatLngCacheObj = Object.create(null);
const _cellLatLngCacheOrder = [];
// Instrumentation counters for lat/lng cache
let _cellLatLngCacheHits = 0;
let _cellLatLngCacheMisses = 0;

// Lightweight helpers reused in hotspots to avoid re-allocating on each call
function _strHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function _lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function _bearingFromLatLngs(s, e) {
  const lat1 = (s[2] !== undefined) ? s[2] : (s[0] * Math.PI) / 180;
  const lon1 = (s[3] !== undefined) ? s[3] : (s[1] * Math.PI) / 180;
  const lat2 = (e[2] !== undefined) ? e[2] : (e[0] * Math.PI) / 180;
  const lon2 = (e[3] !== undefined) ? e[3] : (e[1] * Math.PI) / 180;
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

function _getCachedVisibility(ctx, a, b) {
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
  const frictionLookup = ctx._frictionObj || ctx.cellFrictionMap;
  const frictionIsMap = typeof frictionLookup.get === 'function';
  for (let i = 0; i < path.length; i++) {
    const c = path[i];
    const f = frictionIsMap ? frictionLookup.get(c) : frictionLookup[c];
    if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) {
      visible = false;
      break;
    }
  }
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

/**
 * FULL IMPLEMENTATION: BDI Agent Decision Engine
 */
export function computeDesirePaths() {

  const destinations = Object.keys(this.simulationNodes).filter((k) =>
    ['destination', 'both'].includes(this.simulationNodes[k].type)
  );
  const agents = Object.keys(this.simulationNodes).filter((k) =>
    ['origin', 'both'].includes(this.simulationNodes[k].type)
  );

  const hexes = this.cellFrictionMap.size;
  const ticks = Math.max(5000, 2 * Math.ceil(Math.sqrt(hexes * Math.PI))); // Arbitrary large number to ensure convergence

  // Snapshot frequently-read Maps to plain objects for hot-path loops to avoid
  // repeated Map.get calls (reduces FindOrderedHashMapEntry overhead).
  this._frictionObj = Object.create(null);
  for (const [k, v] of this.cellFrictionMap) this._frictionObj[k] = v;
  this._affordanceObj = Object.create(null);
  for (const [k, v] of this.affordanceMap) this._affordanceObj[k] = v;
  // Snapshot multiFrictionMap to a plain object for hot-loop reads
  this._multiFrictionObj = Object.create(null);
  if (this.multiFrictionMap && typeof this.multiFrictionMap.entries === 'function') {
    for (const [k, v] of this.multiFrictionMap) this._multiFrictionObj[k] = v;
  } else if (this.multiFrictionMap) {
    for (const k in this.multiFrictionMap) this._multiFrictionObj[k] = this.multiFrictionMap[k];
  }

  // Consolidated per-cell state object for hot-path reads/writes.
  // Populate once per compute run to avoid repeated Map lookups inside inner loops.
  this._cellState = Object.create(null);
  for (const k in this._frictionObj) {
    const fr = this._frictionObj[k];
    // Prefer snapshot _affordanceObj populated above; default to 0.1 when missing
    const aff = (this._affordanceObj && typeof this._affordanceObj[k] !== 'undefined') ? this._affordanceObj[k] : 0.1;
    const desire = (this.pathDesireScores && this.pathDesireScores.get) ? (this.pathDesireScores.get(k) || 0) : (this.pathDesireScores ? (this.pathDesireScores[k] || 0) : 0);
    const multi = (this._multiFrictionObj && typeof this._multiFrictionObj[k] !== 'undefined') ? this._multiFrictionObj[k] : null;
    this._cellState[k] = { friction: fr, affordance: aff, desire, multi };
  }

  const goalGradients = new Map();
  destinations.forEach((d) => goalGradients.set(d, computeDijkstraGradient.call(this, d)));
  const frictionLookup = this._frictionObj || this.cellFrictionMap;
  const frictionIsMap = typeof frictionLookup.get === 'function';

  // Fast per-cell state (optional). If present, prefer this over separate Maps/objs.
  const cellState = this._cellState || null;
  const stateEnabled = !!cellState;

  // Batch affordance updates so earlier agents don't deterministically bias later agents
  const affordanceDeltas = new Map();
  const pathDesireDeltas = new Map();

  for (const o of agents) {
    const originCell = o;
    // Determine total discrete simulated agents for this origin
    const totalVolume = Math.max(1, Math.round((this.simulationNodes[o]?.weight || 1) * AGENTS_PER_DESTINATION));

    // Build list of reachable destination candidates (exclude self-targeting)
    const destCandidates = [];
    let destWeightSum = 0;
      for (let d of destinations) {
        if (d === originCell) continue; // avoid self-targeting when origin is also a destination
        const grad = goalGradients.get(d);
        if (!grad) continue;
        // support both Map and plain-object gradients
        const hasOrigin = (typeof grad.has === 'function') ? grad.has(originCell) : (typeof grad[originCell] === 'number');
        if (!hasOrigin) continue; // unreachable
        const w = (this.simulationNodes[d]?.weight) || 1;
        destCandidates.push({ dest: d, weight: w });
        destWeightSum += w;
      }

    if (destCandidates.length === 0) continue;

    if (this.debugCompute) {
      try {
        console.groupCollapsed && console.groupCollapsed(`computeDesirePaths: origin ${originCell} -> distribute ${totalVolume} sims`);
        console.log('computeDesirePaths:start', { origin: originCell, totalVolume, candidates: destCandidates.map((c) => ({ d: c.dest, w: c.weight })) });
      } catch (e) {}
    }

    // Compute float allocations then convert to integer counts deterministically
    const floats = destCandidates.map((c) => ((c.weight / destWeightSum) * totalVolume));
    const floors = floats.map((f) => Math.floor(f));
    const assigned = floors.slice();
    let allocated = floors.reduce((a, b) => a + b, 0);
    let leftover = totalVolume - allocated;

    if (leftover > 0) {
      const frac = floats.map((f, i) => ({ i, frac: f - floors[i], weight: destCandidates[i].weight }));
      frac.sort((a, b) => {
        if (b.frac !== a.frac) return b.frac - a.frac;
        return destCandidates[b.i].weight - destCandidates[a.i].weight;
      });
      for (let k = 0; k < leftover; k++) assigned[frac[k].i] += 1;
    }

    // For each destination, run its assigned simulations
    for (let idx = 0; idx < destCandidates.length; idx++) {
      const destCell = destCandidates[idx].dest;
      const count = assigned[idx] || 0;
      if (count <= 0) continue;
      const destGradient = goalGradients.get(destCell);
      if (!destGradient) continue;
      // Accept either a Map or a plain-object gradient. Prefer plain-object
      // for hot inner loops; if we have a Map, convert it once here.
      let destGradientObj;
      if (typeof destGradient.get === 'function') {
        // Map -> plain object
        destGradientObj = Object.create(null);
        for (const [k, v] of destGradient) destGradientObj[k] = v;
        if (!destGradient.has(originCell)) continue;
      } else {
        // already a plain object
        destGradientObj = destGradient;
        if (typeof destGradientObj[originCell] !== 'number') continue;
      }

      for (let sim = 0; sim < count; sim++) {
        const simAgentId = `${originCell}:${destCell}:${sim}`;
        let simCurrent = originCell;
        const simTarget = destCell;
        const simGradient = destGradient;
        let simDirection = getBearing(simCurrent, simTarget);
        let simPath = [];

        for (let tick = 0; tick < ticks; tick++) {
          // If target is adjacent, step directly to it to avoid overshoot
          if (gridDistance(simCurrent, simTarget) <= 1) {
            simPath.push(simTarget);
            simCurrent = simTarget;
            break;
          }

          // pass plain-object gradient to avoid Map.get inside sampling loop
          let nextStep = getBestNextStep.call(this, simCurrent, destGradientObj, simDirection, simAgentId);
          if (!nextStep || nextStep === simCurrent) break;

          const line = _getCachedPathCells(this, simCurrent, nextStep);
          let hitTarget = false;
          for (let i = 1; i < line.length; i++) {
            const stepCell = line[i];
            const f = frictionIsMap ? frictionLookup.get(stepCell) : frictionLookup[stepCell];
            if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) break;
            simPath.push(stepCell);
            if (stepCell === simTarget) {
              hitTarget = true;
              break;
            }
          }

          if (hitTarget) {
            simCurrent = simTarget;
            break;
          }

          simDirection = getBearing(simCurrent, nextStep);
          simCurrent = nextStep;

          if (simCurrent === simTarget) break;
        }

        if (this.debugCompute) {
          try {
            if (simPath.length <= 1) {
              console.warn('computeDesirePaths: short sim path', { origin: originCell, dest: destCell, sim, simPathLength: simPath.length });
            }
            console.log('computeDesirePaths:simPath', { origin: originCell, dest: destCell, sim, simPath });
          } catch (e) {}
        }

        const uniqueSim = new Set(simPath);
        for (let cell of uniqueSim) {
          pathDesireDeltas.set(cell, (pathDesireDeltas.get(cell) || 0) + 1);
          affordanceDeltas.set(cell, (affordanceDeltas.get(cell) || 0) + 1);
        }
      }
    }
  }

  // Apply accumulated path desire scores and affordance updates in one pass
  for (let [cell, v] of pathDesireDeltas) {
    // Prefer consolidated _cellState for hot-path updates; keep Map synced for external consumers
    let newDesire;
    if (this._cellState && this._cellState[cell]) {
      newDesire = (this._cellState[cell].desire || 0) + v;
      this._cellState[cell].desire = newDesire;
    } else {
      newDesire = (this.pathDesireScores.get ? (this.pathDesireScores.get(cell) || 0) : (this.pathDesireScores[cell] || 0)) + v;
    }
    if (this.pathDesireScores && typeof this.pathDesireScores.set === 'function') {
      this.pathDesireScores.set(cell, newDesire);
    } else {
      this.pathDesireScores[cell] = newDesire;
    }
  }
  for (let [cell, v] of affordanceDeltas) {
    updateAffordance.call(this, cell, v);
  }

  // Decay affordance using _cellState keys when available to avoid Map iteration hotspots
  if (this._cellState) {
    for (const cell in this._cellState) {
      decayAffordance.call(this, cell);
    }
  } else {
    for (let cell of this.affordanceMap.keys()) {
      decayAffordance.call(this, cell);
    }
  }

  // Compute global peak flow for consistent color normalization in the renderer.
  // Prefer Map iteration when available, otherwise iterate object keys.
  let peak = 0;
  if (this.pathDesireScores) {
    if (typeof this.pathDesireScores.values === 'function') {
      for (const v of this.pathDesireScores.values()) {
        if (typeof v === 'number' && v > peak) peak = v;
      }
    } else {
      for (const k in this.pathDesireScores) {
        const v = this.pathDesireScores[k];
        if (typeof v === 'number' && v > peak) peak = v;
      }
    }
  }
  this.globalPeakFlow = peak > 0 ? peak : 1;

  this.updateLayers();
}

/**
 * Tactical Decision: BDI (Belief-Desire-Intention)(Section 3.3/2.4)
 */
function getBestNextStep(curr, gradient, currentDirection, agentId = '') {
  // Local aliases to reduce Map/property churn. Prefer plain-object snapshots
  // (created in computeDesirePaths) to avoid Map.get in inner loops.
  const frictionLookup = this._frictionObj || this.cellFrictionMap;
  const affordanceLookup = this._affordanceObj || this.affordanceMap;
  const frictionIsMap = typeof frictionLookup.get === 'function';
  const affordanceIsMap = typeof affordanceLookup.get === 'function';
  const gradientIsMap = gradient && typeof gradient.get === 'function';
  const weightsObj = WEIGHTS;
  const impassableVal = FRICTION_COSTS.IMPASSABLE;
  const visualAngleHalf = VISUAL_ANGLE / 2;

  const cellState = this._cellState || null;
  const stateEnabled = !!cellState;

  // 1. Tactical BDI Logic (use cached disk + visibility checks)
  const disk = _getCachedDisk(this, curr, VISUAL_DEPTH);
  const candidatesObj = []; // objects: { cell, friction, angle, gN?, aff }
  // hoist current lat/lng to avoid repeated cache lookups and trig
  const sLatLng = _getCachedLatLng(curr);
  // Precompute whether we can use gradient comparisons. Accept either a Map
  // or a plain-object gradient (we pass plain objects from computeDesirePaths).
  const gCurr = gradient ? (gradientIsMap ? gradient.get(curr) : gradient[curr]) : undefined;
  const useGradient = typeof gCurr === 'number';
  for (let i = 0; i < disk.length; i++) {
    const n = disk[i];
    if (n === curr) continue;
    let f;
    if (stateEnabled) {
      const s = cellState[n];
      f = s ? s.friction : undefined;
    } else {
      f = frictionIsMap ? frictionLookup.get(n) : frictionLookup[n];
    }
    if (f === undefined || f >= impassableVal) continue;
    if (!_getCachedVisibility(this, curr, n)) continue;
    // compute bearing/angle once and reuse
    const eLatLng = _getCachedLatLng(n);
    const ang = angleDiff(_bearingFromLatLngs(sLatLng, eLatLng), currentDirection);
    // Prefetch gradient and affordance to avoid repeated Map lookups later
      if (useGradient) {
      const gN = gradientIsMap ? gradient.get(n) : gradient[n];
      if (typeof gN !== 'number') continue;
      const aff = stateEnabled ? (cellState[n]?.affordance ?? 0.1) : (affordanceIsMap ? (affordanceLookup.get(n) ?? 0.1) : (affordanceLookup[n] ?? 0.1));
      candidatesObj.push({ cell: n, friction: f, angle: ang, gN, aff });
    } else {
      const aff = stateEnabled ? (cellState[n]?.affordance ?? 0.1) : (affordanceIsMap ? (affordanceLookup.get(n) ?? 0.1) : (affordanceLookup[n] ?? 0.1));
      candidatesObj.push({ cell: n, friction: f, angle: ang, aff });
    }
  }

  const candidates_hard = [];
  for (let i = 0; i < candidatesObj.length; i++) {
    const c = candidatesObj[i];
    if (c.angle <= visualAngleHalf) candidates_hard.push(c);
  }
  const candidates = candidates_hard.length > 0 ? candidates_hard : candidatesObj;

  // Use parallel numeric arrays for candidates to reduce object churn
  const cellsArr = [];
  const scores = [];
  const stepCostsArr = [];
  const gNsArr = [];

  // If gradient at current cell is not available, skip candidate scoring and fall back later
  if (useGradient) {
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const n = cand.cell;
      const gN = cand.gN; // prefetched
      const aff = cand.aff; // prefetched
      const stepCost = cand.friction || 0;

      // Compute delta and score as per paper
      const delta = (stepCost + gN) - gCurr;
      let S_ij = weightsObj.w_a * aff - weightsObj.w_d * delta;

      S_ij -= (weightsObj.w_theta || 0) * (cand.angle / 180);

      // push into numeric buffers instead of creating objects
      cellsArr.push(n);
      scores.push(S_ij);
      stepCostsArr.push(stepCost);
      gNsArr.push(gN);
    }
  }

  if (this.debugCompute) {
    try {
      const dbg = [];
      for (let i = 0; i < cellsArr.length; i++) dbg.push({ cell: cellsArr[i], S_ij: scores[i] });
      dbg.sort((a, b) => b.S_ij - a.S_ij);
      console.log('getBestNextStep: candidates', { curr, topCandidates: dbg.slice(0, 12) });
    } catch (e) {}
  }

  if (cellsArr.length === 0) {
    // fallback to gradient tunneling (as before)
    for (let depth = 1; depth <= 3; depth++) {
      const neighbors = _getCachedDisk(this, curr, depth);
      let bestGrad = Infinity;
      let bestCandidate = null;

      for (let i = 0; i < neighbors.length; i++) {
          const n = neighbors[i];
          if (n === curr) continue;
          const f = frictionIsMap ? frictionLookup.get(n) : frictionLookup[n];
          if (f === undefined) continue;
          if (f >= FRICTION_COSTS.IMPASSABLE) continue;

          const g = gradientIsMap ? (gradient.get(n) ?? Infinity) : (gradient[n] ?? Infinity);
          if (g < bestGrad) {
            bestGrad = g;
            bestCandidate = n;
          }
        }
      if (bestCandidate) {
        if (this.debugCompute) {
          try {
            console.log('getBestNextStep:fallback', { curr, depth, bestCandidate, bestGrad });
          } catch (e) {}
        }
        return bestCandidate;
      }
    }

    return null; // Truly trapped
  }

  // If TEMPERATURE > 0, use seeded softmax sampling to diversify agent choices
  if (typeof TEMPERATURE === 'number' && TEMPERATURE > 0) {
    // Deterministic seeded RNG and two-pass softmax without extra arrays
    const seed = _strHash(agentId + ':' + curr);
    const rng = _lcg(seed);
    // find max S (single scan)
    let maxS = -Infinity;
    for (let i = 0; i < scores.length; i++) {
      const v = scores[i];
      if (v > maxS) maxS = v;
    }

    // compute weights and sum into a numeric array to avoid object property writes
    const weights = new Array(scores.length);
    let sum = 0;
    for (let i = 0; i < scores.length; i++) {
      const w = Math.exp((scores[i] - maxS) / TEMPERATURE);
      weights[i] = w;
      sum += w;
    }

    const r = rng() * sum;
    let acc = 0;
    for (let i = 0; i < scores.length; i++) {
      acc += weights[i];
      if (r <= acc) {
        const chosen = cellsArr[i];
        if (this.debugCompute) {
          try {
            console.log('getBestNextStep: sampled', { curr, chosen, chosenScore: scores[i] });
          } catch (e) {}
        }
        return chosen;
      }
    }
    // fallback
    return cellsArr[cellsArr.length - 1];
  }

  // Deterministic fallback: choose best using index-based tie-breaker
  let bestScore = -Infinity;
  let bestIndex = -1;
  for (let i = 0; i < cellsArr.length; i++) {
    const S_ij = scores[i];
    if (S_ij > bestScore) {
      bestScore = S_ij;
      bestIndex = i;
    } else if (Math.abs(S_ij - bestScore) < 1e-9) {
      const currentBestCost = (stepCostsArr[bestIndex] || 0) + (gNsArr[bestIndex] || Infinity);
      const candidateCost = (stepCostsArr[i] || 0) + (gNsArr[i] || Infinity);
      if (candidateCost < currentBestCost) {
        bestIndex = i;
      } else if (candidateCost === currentBestCost) {
        if (gridDistance(curr, cellsArr[i]) < gridDistance(curr, cellsArr[bestIndex])) {
          bestIndex = i;
        }
      }
    }
  }

  const chosen = bestIndex >= 0 ? cellsArr[bestIndex] : null;
  if (this.debugCompute) {
    try {
      console.log('getBestNextStep: chosen', { curr, chosen, bestScore });
    } catch (e) {}
  }

  return chosen;
}

/**
 * Optimized Dijkstra Gradient (Production-Ready)
 */
function computeDijkstraGradient(targetCell) {
  // Dijkstra using friction as traversal cost. Use a plain-object for
  // distances to avoid Map.get overhead in hot loops. Keys are cell ids.
  const distances = Object.create(null);
  const visited = new Set();

  const heap = new MinHeap();
  distances[targetCell] = 0;
  heap.insert(targetCell, 0);

  while (heap.size() > 0) {
    const current = heap.extractMin();
    if (visited.has(current)) continue;
    visited.add(current);

    const d = distances[current];
    const neighbors = _getCachedDisk(this, current, 1);

    const frictionLookup = this._frictionObj || this.cellFrictionMap;
    const frictionIsMap = typeof frictionLookup.get === 'function';
    const cellState = this._cellState || null;
    const stateEnabled = !!cellState;
    for (let i = 0; i < neighbors.length; i++) {
      const n = neighbors[i];
      if (n === current) continue;
      let f;
      if (stateEnabled) {
        const s = cellState[n];
        f = s ? s.friction : undefined;
      } else {
        f = frictionIsMap ? frictionLookup.get(n) : frictionLookup[n];
      }
      if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) continue;

      const alt = d + f;
      if (!(n in distances) || alt < distances[n]) {
        distances[n] = alt;
        heap.insert(n, alt);
      }
    }
  }

  return distances;
}

/**
 * Geometric Helpers (Visibility & Bearing)
 */
function isVisible(start, end) {
  return _getCachedVisibility(this, start, end);
  // const path = gridPathCells(start, end);
  // // Count how many cells in the line are impassable
  // const blockedCount = path.filter(
  //   (c) => this.cellFrictionMap.get(c) >= FRICTION_COSTS.IMPASSABLE
  // ).length;
  // // Allow for small corner-cutting (e.g., 1 cell of thickness)
  // return blockedCount <= 1;
}

function getBearing(start, end) {
  const s = _getCachedLatLng(start);
  const e = _getCachedLatLng(end);
  return _bearingFromLatLngs(s, e);
}

// Smallest absolute angular difference between two bearings (degrees)
function angleDiff(a, b) {
  // normalize to [0,360), then compute minimal signed diff
  const diff = Math.abs((((a - b + 540) % 360) - 180));
  return diff;
}

/**
 * Terrain-Aware Update
 * HEAVY_GRASS takes more effort (less wear) to start a path
 * LIGHT_PARK is easily worn (more wear)
 */
function updateAffordance(cell, volume = 1) {
  const frictionLookup = this._frictionObj || this.cellFrictionMap;
  const frictionIsMap = typeof frictionLookup.get === 'function';
  const cellState = this._cellState || null;
  const stateEnabled = !!cellState;

  let friction;
  if (stateEnabled && cellState[cell] && typeof cellState[cell].friction !== 'undefined') {
    friction = cellState[cell].friction;
  } else {
    friction = frictionIsMap ? frictionLookup.get(cell) : frictionLookup[cell];
  }

  // Skip update for permanent infrastructure
  if (friction === FRICTION_COSTS.PAVEMENT || friction === FRICTION_COSTS.IMPASSABLE) return;

  // Define resistance factors: Higher value = more resistance (slower path formation)
  const resistanceFactor = friction === FRICTION_COSTS.HEAVY_GRASS ? 1.5 : 0.8;

  // Prefer consolidated _cellState as authoritative source for affordance
  let current = 0.1;
  if (stateEnabled && cellState[cell] && typeof cellState[cell].affordance === 'number') {
    current = cellState[cell].affordance;
  } else if (this._affordanceObj && typeof this._affordanceObj[cell] !== 'undefined') {
    // Prefer plain-object snapshot when available to avoid Map.get hotspots
    current = this._affordanceObj[cell];
  } else {
    // Fallback default when no snapshot/state available
    current = 0.1;
  }

  // Adjust wear calculation: resistanceFactor divides the impact
  let wear = (volume * UPDATE_RATE) / (MAX_EXPECTED_VOLUME * resistanceFactor);
  const newVal = Math.min(SOFT_CAP, current + wear);

  // Update consolidated state first
  if (stateEnabled) {
    if (!cellState[cell]) cellState[cell] = { friction: friction, affordance: newVal, desire: 0, multi: null };
    else cellState[cell].affordance = newVal;
  }

  // Keep Map in sync for external consumers (non-hot paths)
  if (this.affordanceMap && typeof this.affordanceMap.set === 'function') {
    this.affordanceMap.set(cell, newVal);
  } else if (this.affordanceMap) {
    this.affordanceMap[cell] = newVal;
  }
}

/**
 * Terrain-Aware Decay
 * HEAVY_GRASS recovers slower (more persistent path)
 * LIGHT_PARK recovers faster (path fades quickly)
 */
function decayAffordance(cell) {
  const frictionLookup = this._frictionObj || this.cellFrictionMap;
  const frictionIsMap = typeof frictionLookup.get === 'function';
  const cellState = this._cellState || null;
  const stateEnabled = !!cellState;

  let friction;
  if (stateEnabled && cellState[cell] && typeof cellState[cell].friction !== 'undefined') {
    friction = cellState[cell].friction;
  } else {
    friction = frictionIsMap ? frictionLookup.get(cell) : frictionLookup[cell];
  }

  // Only decay if it's NOT a permanent sidewalk/pavement
  if (friction !== FRICTION_COSTS.PAVEMENT && friction !== FRICTION_COSTS.IMPASSABLE) {
    // Define recovery factors: Higher value = faster regrowth (faster decay of path)
    const recoveryFactor = friction === FRICTION_COSTS.HEAVY_GRASS ? 0.5 : 1.5;

    // Prefer consolidated _cellState as authoritative source for affordance
    let current = 0.1;
    if (stateEnabled && cellState[cell] && typeof cellState[cell].affordance === 'number') {
      current = cellState[cell].affordance;
    } else if (this._affordanceObj && typeof this._affordanceObj[cell] !== 'undefined') {
      current = this._affordanceObj[cell];
    } else {
      // Fallback default when no snapshot/state available
      current = 0.1;
    }

    const actualDecay = DECAY_RATE * recoveryFactor;
    const newVal = Math.max(0.1, current - actualDecay);

    if (stateEnabled) {
      if (!cellState[cell]) cellState[cell] = { friction: friction, affordance: newVal, desire: 0, multi: null };
      else cellState[cell].affordance = newVal;
    }

    if (this.affordanceMap && typeof this.affordanceMap.set === 'function') {
      this.affordanceMap.set(cell, newVal);
    } else if (this.affordanceMap) {
      this.affordanceMap[cell] = newVal;
    }
  }
}

function getNearestDest(agentCell, dests, gradients, agentId = '') {
  // Build candidate list excluding the agent's own cell (prevents 'both' nodes returning themselves)
  const candidates = [];
  for (let d of dests) {
    if (d === agentCell) continue;
    // gradients may be a Map of Maps or a Map of plain-objects (after migration)
    const grad = (typeof gradients.get === 'function') ? gradients.get(d) : gradients[d];
    if (!grad) continue;
    const dist = (typeof grad.get === 'function') ? grad.get(agentCell) : grad[agentCell];
    const dVal = typeof dist === 'number' ? dist : Infinity;
    if (!isFinite(dVal)) continue;
    candidates.push({ dest: d, dist: dVal });
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].dest;

  // Use inverse-distance weighting to distribute agents across multiple destinations.
  // Deterministic per-agent via seeded LCG using agentId + agentCell.
  const seed = _strHash(agentId + ':' + agentCell);
  const rng = _lcg(seed);

  // compute unnormalized scores and sum without intermediate arrays
  let sum = 0;
  const scores = new Array(candidates.length);
  for (let i = 0; i < candidates.length; i++) {
    const sVal = 1 / (1 + candidates[i].dist);
    scores[i] = sVal;
    sum += sVal;
  }

  const r = rng() * sum;
  let acc = 0;
  for (let i = 0; i < candidates.length; i++) {
    acc += scores[i];
    if (r <= acc) {
      return candidates[i].dest;
    }
  }
  return candidates[0].dest;
}

/**
 * Initialize affordance based on your specific FRICTION_COSTS
 */
export function initializeAffordanceMap() {
  this.affordanceMap.clear();

  // Use numeric thresholds so slight friction modifications (from blur) map sensibly
  const p = FRICTION_COSTS.PAVEMENT;
  const l = FRICTION_COSTS.LIGHT_PARK;
  const h = FRICTION_COSTS.HEAVY_GRASS;
  const midPL = (p + l) / 2;
  const midLH = (l + h) / 2;

  for (let [cell, friction] of this.cellFrictionMap) {
    if (friction >= FRICTION_COSTS.IMPASSABLE) {
      this.affordanceMap.set(cell, AFFORDANCE.IMPASSABLE);
      if (this._cellState) {
        if (!this._cellState[cell]) this._cellState[cell] = { friction: friction, affordance: AFFORDANCE.IMPASSABLE, desire: 0, multi: null };
        else this._cellState[cell].affordance = AFFORDANCE.IMPASSABLE;
      }
    } else if (friction < midPL) {
      this.affordanceMap.set(cell, AFFORDANCE.PAVEMENT);
      if (this._cellState) {
        if (!this._cellState[cell]) this._cellState[cell] = { friction: friction, affordance: AFFORDANCE.PAVEMENT, desire: 0, multi: null };
        else this._cellState[cell].affordance = AFFORDANCE.PAVEMENT;
      }
    } else if (friction < midLH) {
      this.affordanceMap.set(cell, AFFORDANCE.LIGHT_PARK);
      if (this._cellState) {
        if (!this._cellState[cell]) this._cellState[cell] = { friction: friction, affordance: AFFORDANCE.LIGHT_PARK, desire: 0, multi: null };
        else this._cellState[cell].affordance = AFFORDANCE.LIGHT_PARK;
      }
    } else {
      this.affordanceMap.set(cell, AFFORDANCE.HEAVY_GRASS);
      if (this._cellState) {
        if (!this._cellState[cell]) this._cellState[cell] = { friction: friction, affordance: AFFORDANCE.HEAVY_GRASS, desire: 0, multi: null };
        else this._cellState[cell].affordance = AFFORDANCE.HEAVY_GRASS;
      }
    }
  }
}

// Expose some internals for debugging and testing
export { getBestNextStep as _getBestNextStep, computeDijkstraGradient as _computeDijkstraGradient, getBearing as _getBearing, angleDiff as _angleDiff, isVisible as _isVisible };

// Diagnostic helper to inspect cache instrumentation
export function getComputeCacheStats(ctx = {}) {
  return {
    cellLatLngCacheSize: Object.keys(_cellLatLngCacheObj).length,
    cellLatLngCacheHits: _cellLatLngCacheHits,
    cellLatLngCacheMisses: _cellLatLngCacheMisses,
    computePathCacheSize: ctx._computePathCacheObj ? Object.keys(ctx._computePathCacheObj).length : (ctx._computePathCache ? ctx._computePathCache.size : 0),
    computePathCacheHits: ctx._computePathCacheHits || 0,
    computePathCacheMisses: ctx._computePathCacheMisses || 0,
    computeDiskCacheSize: ctx._computeDiskCacheObj ? Object.keys(ctx._computeDiskCacheObj).length : (ctx._computeDiskCache ? ctx._computeDiskCache.size : 0),
    computeDiskCacheHits: ctx._computeDiskCacheHits || 0,
    computeDiskCacheMisses: ctx._computeDiskCacheMisses || 0,
    visibilityCacheSize: ctx._visibilityCacheObj ? Object.keys(ctx._visibilityCacheObj).length : (ctx._visibilityCache ? ctx._visibilityCache.size : 0),
    visibilityCacheHits: ctx._visibilityCacheHits || 0,
    visibilityCacheMisses: ctx._visibilityCacheMisses || 0,
  };
}
