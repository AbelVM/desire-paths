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
  MAX_SIM_TICKS,
  SIM_TICK_BUFFER,
  YIELD_EVERY_AGENTS,
  SIM_YIELD_MS,
} from './constants.js';
import { runGradientBatches } from './spatialWorker.js';

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

// --- Cell state builder: creates/updates per-cell state objects ---
function buildCellStateEntry(friction, affordanceSource, pathDesireSource, multiFrictionObj, existingState, cellKey) {
  let es = existingState && existingState[cellKey];
  if (es) {
    es.friction = friction;
    es.affordance = affordanceSource !== undefined ? affordanceSource : 0.1;
    es.desire = pathDesireSource ?? 0;
    es.multi = multiFrictionObj !== undefined ? multiFrictionObj : null;
    return es;
  }
  return { friction, affordance: affordanceSource !== undefined ? affordanceSource : 0.1, desire: pathDesireSource ?? 0, multi: multiFrictionObj !== undefined ? multiFrictionObj : null };
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

function _getCachedVisibility(ctx, a, b, frictionLookup, frictionIsMap) {
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
    const f = frictionIsMap ? frictionLookup.get(c) : frictionLookup[c];
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
export function clearComputeCaches() {
  this._computePathCacheObj = undefined;
  this._computePathCacheOrder = undefined;
  this._computeDiskCacheObj = undefined;
  this._computeDiskCacheOrder = undefined;
  this._visibilityCacheObj = undefined;
  this._visibilityCacheOrder = undefined;
  this._computePathCacheHits = 0;
  this._computePathCacheMisses = 0;
  this._computeDiskCacheHits = 0;
  this._computeDiskCacheMisses = 0;
  this._visibilityCacheHits = 0;
  this._visibilityCacheMisses = 0;
  this._visibilityCacheGen = undefined;
  clearGradientCache.call(this);
  this._gradientCacheGen = undefined;
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
    clearGradientCache.call(ctx);
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
function getGradientDirection(curr, gradientObj) {
  if (!gradientObj) return null;
  const gradientIsMap = typeof gradientObj.get === 'function';
  const gCurr = gradientIsMap ? gradientObj.get(curr) : gradientObj[curr];
  if (typeof gCurr !== 'number') return null;

  const neighbors = _getCachedDisk(this, curr, 1);
  const frictionLookup = this._frictionObj || this.cellFrictionMap;
  const frictionIsMap = typeof frictionLookup.get === 'function';
  const cellState = this._cellState;
  let bestNeighbor = null;
  let bestGrad = gCurr;

  for (let i = 0; i < neighbors.length; i++) {
    const n = neighbors[i];
    if (n === curr) continue;
    let f;
    if (cellState?.[n]) f = cellState[n].friction;
    else f = frictionIsMap ? frictionLookup.get(n) : frictionLookup[n];
    if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) continue;
    const gN = gradientIsMap ? gradientObj.get(n) : gradientObj[n];
    if (typeof gN !== 'number') continue;
    if (gN < bestGrad) {
      bestGrad = gN;
      bestNeighbor = n;
    }
  }

  return bestNeighbor ? getBearing(curr, bestNeighbor) : null;
}

function recordTraversal(pathDesireDeltas, cell) {
  pathDesireDeltas.set(cell, (pathDesireDeltas.get(cell) ?? 0) + 1);
}

function applyPathDesireDeltas(ctx, pathDesireDeltas) {
  for (const [cell, v] of pathDesireDeltas) {
    let newDesire;
    const cs = ctx._cellState?.[cell];
    if (cs) {
      newDesire = (cs.desire ?? 0) + v;
      cs.desire = newDesire;
    } else {
      newDesire =
        (ctx.pathDesireScores?.get ? (ctx.pathDesireScores.get(cell) ?? 0) : (ctx.pathDesireScores?.[cell] ?? 0)) +
        v;
    }
    if (ctx.pathDesireScores?.set) ctx.pathDesireScores.set(cell, newDesire);
    else ctx.pathDesireScores[cell] = newDesire;
  }
}

/**
 * Shared agent path kernel used by batch simulation and incremental APIs.
 * Returns traversed cells in order (including origin).
 */
function runSingleAgentPath(ctx, {
  originCell,
  destCell,
  destGradientObj,
  maxTicks,
  simAgentId,
  pathDesireDeltas = null,
  applyWear = false,
}) {
  let simCurrent = originCell;
  const simTarget = destCell;
  let simDirection =
    getGradientDirection.call(ctx, simCurrent, destGradientObj) ??
    getBearing(simCurrent, simTarget);
  const simPath = [originCell];

  if (pathDesireDeltas) recordTraversal(pathDesireDeltas, originCell);
  if (applyWear) updateAffordance.call(ctx, originCell, 1);

  const frictionLookup = ctx._frictionObj || ctx.cellFrictionMap;
  const frictionIsMap = typeof frictionLookup.get === 'function';
  const cellState = ctx._cellState;

  for (let tick = 0; tick < maxTicks; tick++) {
    if (gridDistance(simCurrent, simTarget) <= 1) {
      if (simTarget !== simCurrent) {
        simPath.push(simTarget);
        if (pathDesireDeltas) recordTraversal(pathDesireDeltas, simTarget);
        if (applyWear) updateAffordance.call(ctx, simTarget, 1);
      }
      break;
    }

    const nextStep = getBestNextStep.call(ctx, simCurrent, destGradientObj, simDirection, simAgentId);
    if (!nextStep || nextStep === simCurrent) break;

    const line = _getCachedPathCells(ctx, simCurrent, nextStep);
    let hitTarget = false;
    for (let i = 1; i < line.length; i++) {
      const stepCell = line[i];
      const stepState = cellState && cellState[stepCell];
      const f = stepState
        ? stepState.friction
        : frictionIsMap
          ? frictionLookup.get(stepCell)
          : frictionLookup[stepCell];
      if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) break;
      simPath.push(stepCell);
      if (pathDesireDeltas) recordTraversal(pathDesireDeltas, stepCell);
      if (applyWear) updateAffordance.call(ctx, stepCell, 1);
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

function getReachableDestinations(ctx, originCell, destinations, goalGradients) {
  const destCandidates = [];
  let destWeightSum = 0;
  for (let d = 0; d < destinations.length; d++) {
    const destCell = destinations[d];
    if (destCell === originCell) continue;
    const grad = goalGradients.get(destCell);
    if (!grad) continue;
    const hasOrigin =
      typeof grad.has === 'function'
        ? grad.has(originCell)
        : typeof grad[originCell] === 'number';
    if (!hasOrigin) continue;
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
export async function computeDesirePaths() {
  // Guard: ensure the friction map has been built before simulating
  if (!this.cellFrictionMap || this.cellFrictionMap.size === 0) {
    this.flowsReady = false;
    if (this.showAlertCard) {
      this.showAlertCard(
        'Build the mapping first by clicking "Build Mapping". ' +
          'The simulation requires a friction map generated from the map tiles.',
        { title: 'Mapping not built', tone: 'warning' }
      );
    }
    return;
  }

  const destinations = Object.keys(this.simulationNodes).filter((k) =>
    ['destination', 'both'].includes(this.simulationNodes[k].type)
  );
  const agents = Object.keys(this.simulationNodes).filter((k) =>
    ['origin', 'both'].includes(this.simulationNodes[k].type)
  );

  const hexes = this.cellFrictionMap.size;
  ensureGradientCacheFresh(this);
  ensureVisibilityCacheFresh(this);

  const mappingGen = this._mappingGeneration ?? 0;
  if (!this._frictionObj || this._frictionSnapshotGen !== mappingGen) {
    this._frictionObj = Object.create(null);
    for (const [k, v] of this.cellFrictionMap) this._frictionObj[k] = v;
    this._frictionSnapshotGen = mappingGen;
  }
  if (!this._multiFrictionObj || this._multiFrictionSnapshotGen !== mappingGen) {
    this._multiFrictionObj = Object.create(null);
    if (this.multiFrictionMap && typeof this.multiFrictionMap.entries === 'function') {
      for (const [k, v] of this.multiFrictionMap) this._multiFrictionObj[k] = v;
    } else if (this.multiFrictionMap) {
      for (const k in this.multiFrictionMap) this._multiFrictionObj[k] = this.multiFrictionMap[k];
    }
    this._multiFrictionSnapshotGen = mappingGen;
  }

  // Consolidated per-cell state object for hot-path reads/writes.
  // Populate once per compute run to avoid repeated Map lookups inside inner loops.
  // Reuse existing _cellState structure when possible to avoid object churn.
  const existingState = this._cellState;
  this._cellState = Object.create(null);
  const frictionObj = this._frictionObj;
  const affordanceObj = this._affordanceObj;
  const desireScores = this.pathDesireScores;
  const multiFrictionObj = this._multiFrictionObj;

  for (const k in frictionObj) {
    const fr = frictionObj[k];
    const aff = affordanceObj?.[k] ?? 0.1;
    const desire = desireScores?.get ? (desireScores.get(k) ?? 0) : (desireScores?.[k] ?? 0);
    const multi = multiFrictionObj?.[k] ?? null;
    this._cellState[k] = buildCellStateEntry(fr, aff, desire, multi, existingState, k);
  }

  // Grass recovery between user-triggered simulation runs (not after wear in the same pass)
  if (this._cellState) {
    for (const cell in this._cellState) {
      decayAffordance.call(this, cell);
    }
  } else {
    for (const cell of this.affordanceMap.keys()) {
      decayAffordance.call(this, cell);
    }
  }

  // Reuse cached per-target gradients when possible to avoid recomputing
  // the full Dijkstra result for every run. Cache is keyed by target cell id
  // and stores the plain-object distances returned by computeDijkstraGradient.
  if (!this._gradientCacheObj) this._gradientCacheObj = Object.create(null);
  const missingDestinations = [];
  for (const d of destinations) {
    if (!this._gradientCacheObj[d]) missingDestinations.push(d);
  }
  if (missingDestinations.length > 0) {
    const gradients = await runGradientBatches(
      missingDestinations,
      this._frictionObj || this.cellFrictionMap
    );
    for (const d of missingDestinations) {
      this._gradientCacheObj[d] = gradients[d] || Object.create(null);
    }
  }

  const goalGradients = new Map();
  for (const d of destinations) {
    goalGradients.set(d, this._gradientCacheObj[d]);
  }

  const pathDesireDeltas = new Map();
  const perTargetContribs = Object.create(null);
  const { plan, assignedCounts, totalAgents } = buildSimulationPlan(
    this,
    agents,
    destinations,
    goalGradients
  );
  let agentsProcessed = 0;
  let nextYieldAt = resetYieldDeadline();
  updateSimulationProgress(this, 0, totalAgents);

  for (let planIndex = 0; planIndex < plan.length; planIndex++) {
    const { originCell, destCandidates, assigned } = plan[planIndex];

    if (this.debugCompute) {
      try {
        console.groupCollapsed &&
          console.groupCollapsed(
            `computeDesirePaths: origin ${originCell} -> distribute ${totalAgents} sims`
          );
        console.log('computeDesirePaths:start', {
          origin: originCell,
          totalAgents,
          candidates: destCandidates.map((c) => ({ d: c.dest, w: c.weight })),
        });
      } catch (_e) {
        // debug logging is non-critical
      }
    }

    for (let idx = 0; idx < destCandidates.length; idx++) {
      const destCell = destCandidates[idx].dest;
      const count = assigned[idx] || 0;
      if (count <= 0) continue;
      const destGradient = goalGradients.get(destCell);
      if (!destGradient) continue;
      let destGradientObj;
      if (typeof destGradient.get === 'function') {
        destGradientObj = Object.create(null);
        for (const [k, v] of destGradient) destGradientObj[k] = v;
        if (!destGradient.has(originCell)) continue;
      } else {
        destGradientObj = destGradient;
        if (typeof destGradientObj[originCell] !== 'number') continue;
      }

      if (!perTargetContribs[destCell]) perTargetContribs[destCell] = Object.create(null);
      const maxTicks = estimateMaxTicks(originCell, destCell, hexes);

      for (let sim = 0; sim < count; sim++) {
        const simAgentId = `${originCell}:${destCell}:${sim}`;
        const simPath = runSingleAgentPath(this, {
          originCell,
          destCell,
          destGradientObj,
          maxTicks,
          simAgentId,
          pathDesireDeltas,
          applyWear: true,
        });

        for (let p = 0; p < simPath.length; p++) {
          const cell = simPath[p];
          perTargetContribs[destCell][cell] = (perTargetContribs[destCell][cell] || 0) + 1;
        }

        agentsProcessed++;
        if (agentsProcessed % YIELD_EVERY_AGENTS === 0 && nowMs() >= nextYieldAt) {
          await yieldToMain();
          nextYieldAt = resetYieldDeadline();
          updateSimulationProgress(this, agentsProcessed, totalAgents);
        }

        if (this.debugCompute) {
          try {
            if (simPath.length <= 1) {
              console.warn('computeDesirePaths: short sim path', {
                origin: originCell,
                dest: destCell,
                sim,
                simPathLength: simPath.length,
              });
            }
            console.log('computeDesirePaths:simPath', {
              origin: originCell,
              dest: destCell,
              sim,
              simPath,
            });
          } catch (_e) {
            // debug logging is non-critical
          }
        }
      }
    }
  }

  applyPathDesireDeltas(this, pathDesireDeltas);

  // Persist per-target contribution and assignment snapshots for incremental APIs
  this._perTargetContribs = perTargetContribs;
  this._assignedCounts = assignedCounts;
  this._targetWeights = Object.create(null);
  for (const d of destinations) this._targetWeights[d] = this.simulationNodes[d]?.weight || 1;

  // Compute global peak flow for consistent color normalization in the renderer.
  let peak = 0;
  const scores = this.pathDesireScores;
  if (scores) {
    if (scores.values) {
      for (const v of scores.values()) {
        if (typeof v === 'number' && v > peak) peak = v;
      }
    } else {
      for (const k in scores) {
        const v = scores[k];
        if (typeof v === 'number' && v > peak) peak = v;
      }
    }
  }
  this.globalPeakFlow = peak > 0 ? peak : 1;

  updateSimulationProgress(this, totalAgents, totalAgents, 'Complete');
  this.updateLayers();
  this.flowsReady = true;
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
  // hoist current lat/lng to avoid repeated cache lookups and trig
  const sLatLng = _getCachedLatLng(curr);
  // Precompute whether we can use gradient comparisons. Accept either a Map
  // or a plain-object gradient (we pass plain objects from computeDesirePaths).
  const gCurr = gradient ? (gradientIsMap ? gradient.get(curr) : gradient[curr]) : undefined;
  const useGradient = typeof gCurr === 'number';

  // Use parallel numeric arrays from the start to avoid intermediate object allocation
  const cellsArr = [];
  const anglesArr = [];
  const affsArr = [];
  const frictionArr = [];
  const gNsArr = []; // only populated when useGradient

  for (let i = 0; i < disk.length; i++) {
    const n = disk[i];
    if (n === curr) continue;
    // Inline friction lookup via _cellState for hot-path speed
    let f;
    if (stateEnabled) {
      const s = cellState[n];
      f = s ? s.friction : undefined;
    } else {
      f = frictionIsMap ? frictionLookup.get(n) : frictionLookup[n];
    }
    if (f === undefined || f >= impassableVal) continue;
    if (!_getCachedVisibility(this, curr, n, frictionLookup, frictionIsMap)) continue;
    // compute bearing/angle once and reuse
    const eLatLng = _getCachedLatLng(n);
    const ang = angleDiff(_bearingFromLatLngs(sLatLng, eLatLng), currentDirection);
    // Inline affordance lookup
    const aff = stateEnabled
      ? (cellState[n]?.affordance ?? 0.1)
      : affordanceIsMap
        ? (affordanceLookup.get(n) ?? 0.1)
        : (affordanceLookup[n] ?? 0.1);

    if (useGradient) {
      const gN = gradientIsMap ? gradient.get(n) : gradient[n];
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

  // Filter by visual angle in-place: move hard candidates to front
  let hardCount = 0;
  for (let i = 0; i < cellsArr.length; i++) {
    if (anglesArr[i] <= visualAngleHalf) {
      if (hardCount !== i) {
        const swap = (arr) => { const t = arr[i]; arr[i] = arr[hardCount]; arr[hardCount] = t; };
        swap(cellsArr);
        swap(anglesArr);
        swap(affsArr);
        swap(frictionArr);
        if (useGradient) swap(gNsArr);
      }
      hardCount++;
    }
  }
  const origLen = cellsArr.length;

  // Fall back to all candidates if none within visual angle
  const cLen = hardCount > 0 ? hardCount : origLen;

  const scores = new Array(cLen);

  // If gradient at current cell is not available, skip candidate scoring and fall back later
  if (useGradient) {
    for (let i = 0; i < cLen; i++) {
      const gN = gNsArr[i];
      const aff = affsArr[i];
      const stepCost = frictionArr[i] || 0;

      // Compute delta and score as per paper
      const delta = stepCost + gN - gCurr;
      let S_ij = weightsObj.w_a * aff - weightsObj.w_d * delta;

      S_ij -= (weightsObj.w_theta || 0) * (anglesArr[i] / 180);

      scores[i] = S_ij;
    }
  }

  if (this.debugCompute) {
    try {
      const dbg = [];
      for (let i = 0; i < cLen; i++) {
        const s = scores[i];
        if (typeof s === 'number') dbg.push({ cell: cellsArr[i], S_ij: s });
      }
      dbg.sort((a, b) => b.S_ij - a.S_ij);
      console.log('getBestNextStep: candidates', { curr, topCandidates: dbg.slice(0, 12) });
    } catch (_e) {
        // debug logging is non-critical
      }
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
          } catch (_e) {
        // debug logging is non-critical
      }
        }
        return bestCandidate;
      }
    }

    return null; // Truly trapped
  }

  // If TEMPERATURE > 0 and we have valid scores, use seeded softmax sampling
  // to diversify agent choices. Skip when useGradient is false (scores are undefined).
  const hasValidScores = useGradient && scores.length > 0 && typeof scores[0] === 'number';
  if (hasValidScores && typeof TEMPERATURE === 'number' && TEMPERATURE > 0) {
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
          } catch (_e) {
        // debug logging is non-critical
      }
        }
        return chosen;
      }
    }
    // fallback
    return cellsArr[cellsArr.length - 1];
  }

 // Deterministic fallback: choose best using index-based tie-breaker
  // When useGradient is false, fall back to affordance-based selection
  // (highest affordance = most worn path = most attractive)
  let bestScore = -Infinity;
  let bestIndex = -1;
  for (let i = 0; i < cLen; i++) {
    const S_ij = scores[i];
    const isScoreValid = typeof S_ij === 'number';
    if (isScoreValid && S_ij > bestScore) {
      bestScore = S_ij;
      bestIndex = i;
    } else if (!isScoreValid && affsArr[i] > bestScore) {
      // No gradient: pick highest-affordance cell
      bestScore = affsArr[i];
      bestIndex = i;
    } else if (isScoreValid && Math.abs(S_ij - bestScore) < 1e-9) {
      const currentBestCost = (frictionArr[bestIndex] || 0) + (useGradient ? (gNsArr[bestIndex] ?? Infinity) : 0);
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

  const chosen = bestIndex >= 0 ? cellsArr[bestIndex] : null;
  if (this.debugCompute) {
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
  const frictionLookup = this._frictionObj || this.cellFrictionMap;
  const frictionIsMap = typeof frictionLookup.get === 'function';
  return _getCachedVisibility(this, start, end, frictionLookup, frictionIsMap);
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
  const diff = Math.abs(((a - b + 540) % 360) - 180);
  return diff;
}

/**
 * Terrain-Aware Update
 * HEAVY_GRASS takes more effort (less wear) to start a path
 * LIGHT_PARK is easily worn (more wear)
 */
function updateAffordance(cell, volume = 1) {
  const cs = this._cellState?.[cell];
  const friction = cs?.friction ?? this._frictionObj?.[cell];

  // Skip update for permanent infrastructure
  if (friction === FRICTION_COSTS.PAVEMENT || friction === FRICTION_COSTS.IMPASSABLE) return;

  const resistanceFactor = friction === FRICTION_COSTS.HEAVY_GRASS ? 1.5 : 0.8;
  const current = cs?.affordance ?? this._affordanceObj?.[cell] ?? 0.1;
  const newVal = Math.min(SOFT_CAP, current + (volume * UPDATE_RATE) / (MAX_EXPECTED_VOLUME * resistanceFactor));

  if (cs) {
    cs.affordance = newVal;
  }
  if (this._affordanceObj) {
    this._affordanceObj[cell] = newVal;
  } else if (this.affordanceMap) {
    if (this.affordanceMap.set) this.affordanceMap.set(cell, newVal);
    else this.affordanceMap[cell] = newVal;
  }
}

/**
 * Terrain-Aware Decay
 * HEAVY_GRASS recovers slower (more persistent path)
 * LIGHT_PARK recovers faster (path fades quickly)
 */
function decayAffordance(cell) {
  const cs = this._cellState?.[cell];
  const friction = cs?.friction ?? this._frictionObj?.[cell];

  if (friction === FRICTION_COSTS.PAVEMENT || friction === FRICTION_COSTS.IMPASSABLE) return;

  const recoveryFactor = friction === FRICTION_COSTS.HEAVY_GRASS ? 0.5 : 1.5;
  const current = cs?.affordance ?? this._affordanceObj?.[cell] ?? 0.1;
  const newVal = Math.max(0.1, current - DECAY_RATE * recoveryFactor);

  if (cs) {
    cs.affordance = newVal;
  }
  if (this._affordanceObj) {
    this._affordanceObj[cell] = newVal;
  } else if (this.affordanceMap) {
    if (this.affordanceMap.set) this.affordanceMap.set(cell, newVal);
    else this.affordanceMap[cell] = newVal;
  }
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

  if (friction >= FRICTION_COSTS.IMPASSABLE) return { affordance: AFFORDANCE.IMPASSABLE, tier: 'impassable' };
  if (friction < midPL) return { affordance: AFFORDANCE.PAVEMENT, tier: 'pavement' };
  if (friction < midLH) return { affordance: AFFORDANCE.LIGHT_PARK, tier: 'light_park' };
  return { affordance: AFFORDANCE.HEAVY_GRASS, tier: 'heavy_grass' };
}

/**
 * Initialize affordance based on your specific FRICTION_COSTS
 */
export function initializeAffordanceMap() {
  this.affordanceMap.clear();

  for (const [cell, friction] of this.cellFrictionMap) {
    const { affordance } = classifyAffordance(friction);
    this.affordanceMap.set(cell, affordance);

    if (this._cellState) {
      if (!this._cellState[cell]) {
        this._cellState[cell] = { friction, affordance, desire: 0, multi: null };
      } else {
        this._cellState[cell].affordance = affordance;
      }
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
export function computeAndCacheGradient(targetCell) {
  if (!this._gradientCacheObj) this._gradientCacheObj = Object.create(null);
  const g = computeDijkstraGradient.call(this, targetCell);
  this._gradientCacheObj[targetCell] = g;
  return g;
}

export function getCachedGradient(targetCell) {
  return this._gradientCacheObj ? this._gradientCacheObj[targetCell] : undefined;
}

export function clearGradientCache() {
  this._gradientCacheObj = Object.create(null);
  this._gradientCacheGen = undefined;
}

// --- Incremental assignment & contribution helpers ---
function _computeAssignedCounts() {
  const destinations = Object.keys(this.simulationNodes).filter((k) =>
    ['destination', 'both'].includes(this.simulationNodes[k].type)
  );
  const origins = Object.keys(this.simulationNodes).filter((k) =>
    ['origin', 'both'].includes(this.simulationNodes[k].type)
  );

  if (!this._gradientCacheObj) this._gradientCacheObj = Object.create(null);
  // ensure gradients exist for reachability checks
  for (const d of destinations) {
    if (!this._gradientCacheObj[d]) computeAndCacheGradient.call(this, d);
  }

  const assigned = Object.create(null);
  for (const o of origins) {
    assigned[o] = Object.create(null);
    const totalVolume = Math.max(
      1,
      Math.round((this.simulationNodes[o]?.weight || 1) * AGENTS_PER_DESTINATION)
    );

    const destCandidates = [];
    let destWeightSum = 0;
    for (const d of destinations) {
      if (d === o) continue;
      const grad = this._gradientCacheObj[d];
      if (!grad) continue;
      const hasOrigin = typeof grad.has === 'function' ? grad.has(o) : typeof grad[o] === 'number';
      if (!hasOrigin) continue;
      const w = this.simulationNodes[d]?.weight || 1;
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

function _recomputeTargetContribs(targetCell, newAssignedCounts) {
  ensureGradientCacheFresh(this);
  if (!this._gradientCacheObj) this._gradientCacheObj = Object.create(null);
  if (!this._gradientCacheObj[targetCell]) computeAndCacheGradient.call(this, targetCell);
  const destGradient = this._gradientCacheObj[targetCell];
  let destGradientObj = destGradient;
  if (typeof destGradient.get === 'function') {
    destGradientObj = Object.create(null);
    for (const [k, v] of destGradient) destGradientObj[k] = v;
  }

  // Ensure snapshot state exists for safe inner-loop reads
  if (!this._frictionObj) {
    this._frictionObj = Object.create(null);
    for (const [k, v] of this.cellFrictionMap) this._frictionObj[k] = v;
  }
  if (!this._affordanceObj) {
    this._affordanceObj = Object.create(null);
    for (const [k, v] of this.affordanceMap) this._affordanceObj[k] = v;
  }
  if (!this._cellState) {
    this._cellState = Object.create(null);
    for (const k in this._frictionObj) {
      const fr = this._frictionObj[k];
      const aff =
        this._affordanceObj && typeof this._affordanceObj[k] !== 'undefined'
          ? this._affordanceObj[k]
          : 0.1;
      const desire =
        this.pathDesireScores && this.pathDesireScores.get
          ? this.pathDesireScores.get(k) || 0
          : this.pathDesireScores
            ? this.pathDesireScores[k] || 0
            : 0;
      this._cellState[k] = { friction: fr, affordance: aff, desire, multi: null };
    }
  }

  const origins = Object.keys(this.simulationNodes).filter((k) =>
    ['origin', 'both'].includes(this.simulationNodes[k].type)
  );
  const perTarget = Object.create(null);
  const hexCount = this.cellFrictionMap?.size || 1;

  for (const o of origins) {
    const count = (newAssignedCounts[o] && newAssignedCounts[o][targetCell]) || 0;
    if (!count || count <= 0) continue;
    const maxTicks = estimateMaxTicks(o, targetCell, hexCount);

    for (let sim = 0; sim < count; sim++) {
      const simAgentId = `${o}:${targetCell}:${sim}`;
      const simPath = runSingleAgentPath(this, {
        originCell: o,
        destCell: targetCell,
        destGradientObj,
        maxTicks,
        simAgentId,
        applyWear: false,
      });

      for (let p = 0; p < simPath.length; p++) {
        const cell = simPath[p];
        perTarget[cell] = (perTarget[cell] || 0) + 1;
      }
    }
  }

  return perTarget;
}

function _applyTargetContribDelta(targetCell, newContribs) {
  const oldContribs =
    this._perTargetContribs && this._perTargetContribs[targetCell]
      ? this._perTargetContribs[targetCell]
      : Object.create(null);
  const keys = new Set([...Object.keys(newContribs || {}), ...Object.keys(oldContribs || {})]);
  const affected = new Set();

  for (const cell of keys) {
    const oldV = oldContribs[cell] || 0;
    const newV = (newContribs && newContribs[cell]) || 0;
    const delta = newV - oldV;
    if (delta === 0) continue;
    affected.add(cell);

    if (this._cellState && this._cellState[cell]) {
      this._cellState[cell].desire = (this._cellState[cell].desire || 0) + delta;
      const newDes = this._cellState[cell].desire;
      if (this.pathDesireScores && typeof this.pathDesireScores.set === 'function')
        this.pathDesireScores.set(cell, newDes);
      else this.pathDesireScores[cell] = newDes;
    } else {
      const cur =
        this.pathDesireScores && typeof this.pathDesireScores.get === 'function'
          ? this.pathDesireScores.get(cell) || 0
          : this.pathDesireScores
            ? this.pathDesireScores[cell] || 0
            : 0;
      const updated = cur + delta;
      if (this.pathDesireScores && typeof this.pathDesireScores.set === 'function')
        this.pathDesireScores.set(cell, updated);
      else this.pathDesireScores[cell] = updated;
    }
  }

  // persist new contrib snapshot (or remove if empty)
  if (newContribs && Object.keys(newContribs).length > 0)
    this._perTargetContribs[targetCell] = newContribs;
  else if (this._perTargetContribs) delete this._perTargetContribs[targetCell];

  return affected;
}

function _recomputeAffordanceForCells(cells) {
  if (!cells || cells.size === 0) return;
  const frictionLookup = this._frictionObj || this.cellFrictionMap;
  const frictionIsMap = typeof frictionLookup.get === 'function';
  const cellState = this._cellState || null;
  const stateEnabled = !!cellState;

  for (const cell of cells) {
    // aggregate totalVolume across all targets
    let totalVolume = 0;
    if (this._perTargetContribs) {
      for (const t in this._perTargetContribs) {
        if (this._perTargetContribs[t] && this._perTargetContribs[t][cell])
          totalVolume += this._perTargetContribs[t][cell];
      }
    }

    let friction;
    if (stateEnabled && cellState[cell] && typeof cellState[cell].friction !== 'undefined')
      friction = cellState[cell].friction;
    else friction = frictionIsMap ? frictionLookup.get(cell) : frictionLookup[cell];

    if (friction === FRICTION_COSTS.PAVEMENT || friction === FRICTION_COSTS.IMPASSABLE) continue;
    const resistanceFactor = friction === FRICTION_COSTS.HEAVY_GRASS ? 1.5 : 0.8;
    const wear = (totalVolume * UPDATE_RATE) / (MAX_EXPECTED_VOLUME * resistanceFactor);
    const newVal = Math.min(SOFT_CAP, 0.1 + wear);

    if (stateEnabled) {
      if (!cellState[cell])
        cellState[cell] = { friction: friction, affordance: newVal, desire: 0, multi: null };
      else cellState[cell].affordance = newVal;
    }

    if (this.affordanceMap && typeof this.affordanceMap.set === 'function')
      this.affordanceMap.set(cell, newVal);
    else this.affordanceMap[cell] = newVal;
  }
}

function _recomputeGlobalPeakFlow() {
  let peak = 0;
  if (this.pathDesireScores) {
    if (typeof this.pathDesireScores.values === 'function') {
      for (const v of this.pathDesireScores.values())
        if (typeof v === 'number' && v > peak) peak = v;
    } else {
      for (const k in this.pathDesireScores) {
        const v = this.pathDesireScores[k];
        if (typeof v === 'number' && v > peak) peak = v;
      }
    }
  }
  this.globalPeakFlow = peak > 0 ? peak : 1;
}

export function addDestination(targetCell, weight = 1) {
  if (!this.simulationNodes) this.simulationNodes = Object.create(null);
  if (!this.simulationNodes[targetCell])
    this.simulationNodes[targetCell] = { type: 'destination', weight };
  else {
    if (this.simulationNodes[targetCell].type === 'origin')
      this.simulationNodes[targetCell].type = 'both';
    else this.simulationNodes[targetCell].type = 'destination';
    this.simulationNodes[targetCell].weight = weight;
  }

  if (!this._gradientCacheObj) this._gradientCacheObj = Object.create(null);
  if (!this._gradientCacheObj[targetCell]) computeAndCacheGradient.call(this, targetCell);

  const newAssigned = _computeAssignedCounts.call(this);
  const oldAssigned = this._assignedCounts || Object.create(null);

  const destinations = Object.keys(this.simulationNodes).filter((k) =>
    ['destination', 'both'].includes(this.simulationNodes[k].type)
  );
  const origins = Object.keys(this.simulationNodes).filter((k) =>
    ['origin', 'both'].includes(this.simulationNodes[k].type)
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
    const newContribs = _recomputeTargetContribs.call(this, d, newAssigned);
    const affected = _applyTargetContribDelta.call(this, d, newContribs);
    for (const c of affected) allAffected.add(c);
  }

  _recomputeAffordanceForCells.call(this, allAffected);
  this._assignedCounts = newAssigned;
  this._targetWeights = Object.create(null);
  for (const d of destinations) this._targetWeights[d] = this.simulationNodes[d]?.weight || 1;
  _recomputeGlobalPeakFlow.call(this);
  if (this.updateLayers) this.updateLayers();
  return { changed: Array.from(changed), affectedCells: allAffected.size };
}

export function updateDestinationWeight(targetCell, newWeight) {
  if (!this.simulationNodes || !this.simulationNodes[targetCell])
    return addDestination.call(this, targetCell, newWeight);
  this.simulationNodes[targetCell].weight = newWeight;
  // delegate to addDestination path which computes diffs
  return addDestination.call(this, targetCell, newWeight);
}

export function removeDestination(targetCell) {
  if (!this.simulationNodes || !this.simulationNodes[targetCell]) return { removed: false };
  if (this.simulationNodes[targetCell].type === 'both')
    this.simulationNodes[targetCell].type = 'origin';
  else delete this.simulationNodes[targetCell];

  const newAssigned = _computeAssignedCounts.call(this);
  const oldAssigned = this._assignedCounts || Object.create(null);

  const destinations = Object.keys(this.simulationNodes).filter((k) =>
    ['destination', 'both'].includes(this.simulationNodes[k].type)
  );
  const origins = Object.keys(this.simulationNodes).filter((k) =>
    ['origin', 'both'].includes(this.simulationNodes[k].type)
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
    const newContribs = _recomputeTargetContribs.call(this, d, newAssigned);
    const affected = _applyTargetContribDelta.call(this, d, newContribs);
    for (const c of affected) allAffected.add(c);
  }

  _recomputeAffordanceForCells.call(this, allAffected);
  this._assignedCounts = newAssigned;
  this._targetWeights = Object.create(null);
  for (const d of destinations) this._targetWeights[d] = this.simulationNodes[d]?.weight || 1;
  _recomputeGlobalPeakFlow.call(this);
  if (this.updateLayers) this.updateLayers();
  return { removed: true, changed: Array.from(changed), affectedCells: allAffected.size };
}
