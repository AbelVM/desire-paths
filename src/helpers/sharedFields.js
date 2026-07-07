// SharedArrayBuffer-backed data layer for the desire-path simulation.
//
// Motivation
// ----------
// The agent simulation used to pass its static mapping data (friction, affordance,
// gradients, visibility, bearings, neighbor disks) into Web Workers by
// *structured clone*. For a large AOI that clone is enormous (the bearing map
// alone is ~N x avg-visible-neighbors entries) and cloning it into 2+ workers
// produced the SIGILL / OOM failures observed when parallelising the ABM.
//
// This module stores every data object in a SharedArrayBuffer so the buffers are
// shared *by reference* (zero-copy) across workers. The only thing each worker
// receives by clone is a small integer-encoded plan plus the cell->index string
// table (a few MB at most, vs. tens of MB for the old bearing/visibility maps).
//
// All per-cell data is addressed by a stable integer index assigned once at
// mapping time (see CellRegistry). The agent kernel below is a faithful port of
// the plain-object kernel in agentTasks.js, operating purely on integer indices
// and typed arrays so the ABM decision logic is unchanged.
//
// Shared mutable state (flow + accumulated footprints) uses Int32Array + Atomics
// so multiple agent workers can run the true ABM concurrently and safely
// accumulate into the same memory.

import { gridDisk, cellToLatLng, gridDistance, gridPathCells } from 'h3-js';
import { FRICTION_COSTS, WEIGHTS, SIMULATION_PARAMS } from './constants.js';
import { MinHeap } from './minheap.js';

// ---------------------------------------------------------------------------
// Capability detection & allocation
// ---------------------------------------------------------------------------

/**
 * True when SharedArrayBuffers can actually be shared across workers.
 * Sharing SABs between workers requires the document to be cross-origin isolated
 * (COOP/COEP), which the bundled coi-serviceworker enables. In non-isolated
 * contexts (including Node test runners where `crossOriginIsolated` is
 * undefined) we return false so the caller falls back to the local path.
 */
export function sabSupported() {
  try {
    if (typeof crossOriginIsolated === 'boolean') {
      return crossOriginIsolated === true && typeof SharedArrayBuffer !== 'undefined';
    }
    return false;
  } catch (_e) {
    return false;
  }
}

/**
 * Allocate a buffer that can be shared across workers. Falls back to a plain
 * ArrayBuffer when SABs are unavailable so the code still runs (just cloned).
 */
export function allocBuffer(byteLength) {
  if (sabSupported()) {
    try {
      return new SharedArrayBuffer(byteLength);
    } catch (_e) {
      // Some environments throw on SAB construction despite the feature check.
    }
  }
  return new ArrayBuffer(byteLength);
}

export function allocFloat32(length) {
  return new Float32Array(allocBuffer(length * 4));
}

export function allocInt32(length) {
  return new Int32Array(allocBuffer(length * 4));
}

// ---------------------------------------------------------------------------
// Cell registry: stable integer index <-> H3 cell string
// ---------------------------------------------------------------------------

export class CellRegistry {
  constructor(cells) {
    this.cells = cells.slice();
    this.count = this.cells.length;
    this.index = new Map();
    for (let i = 0; i < this.count; i++) this.index.set(this.cells[i], i);
  }

  idx(cell) {
    return this.index.get(cell);
  }

  cell(i) {
    return this.cells[i];
  }
}

export function buildCellRegistry(cells) {
  return new CellRegistry(cells);
}

// ---------------------------------------------------------------------------
// Shared scalar field: one float32 per cell (friction, affordance, gradients)
// ---------------------------------------------------------------------------

export class SharedScalarField {
  constructor(registry, fill = 0) {
    this.registry = registry;
    this.raw = allocFloat32(registry.count).fill(fill);
    this.buffer = this.raw.buffer;
  }

  getAt(i) {
    return this.raw[i];
  }

  setAt(i, v) {
    this.raw[i] = v;
  }

  get(cell) {
    const i = this.registry.idx(cell);
    return i === undefined ? undefined : this.raw[i];
  }

  set(cell, v) {
    const i = this.registry.idx(cell);
    if (i !== undefined) this.raw[i] = v;
  }

  /** Build a SharedScalarField from a plain {cell: value} lookup. */
  static fromLookup(registry, lookup, fill = 0) {
    const f = new SharedScalarField(registry, fill);
    if (lookup) {
      for (let i = 0; i < registry.count; i++) {
        const v = lookup[registry.cells[i]];
        if (v !== undefined) f.raw[i] = v;
      }
    }
    return f;
  }
}

// ---------------------------------------------------------------------------
// Shared counter field: one int32 per cell, atomically incremented.
// Used for the dynamic flow (pathDesire) and accumulated footprints.
// ---------------------------------------------------------------------------

export class SharedCounterField {
  constructor(registry, fill = 0) {
    this.registry = registry;
    this.raw = allocInt32(registry.count).fill(fill);
    this.buffer = this.raw.buffer;
  }

  getAt(i) {
    return Atomics.load(this.raw, i);
  }

  setAt(i, v) {
    Atomics.store(this.raw, i, v);
  }

  addAt(i, n) {
    return Atomics.add(this.raw, i, n);
  }

  get(cell) {
    const i = this.registry.idx(cell);
    return i === undefined ? 0 : this.getAt(i);
  }

  add(cell, n) {
    const i = this.registry.idx(cell);
    if (i !== undefined) return this.addAt(i, n);
    return 0;
  }

  /** Snapshot into a plain {cell: count} object (main thread, post-sim). */
  toPlainObject() {
    const out = Object.create(null);
    for (let i = 0; i < this.registry.count; i++) {
      const v = this.raw[i];
      if (v) out[this.registry.cells[i]] = v;
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Shared neighbor field: CSR layout combining
//   - distance-1 ring (for gradient direction & BFS detours)
//   - visible neighbors within VISUAL_DEPTH (for candidate evaluation) + bearings
// All three are SAB-backed typed arrays shared across workers.
// ---------------------------------------------------------------------------

export class SharedNeighborField {
  constructor(registry, disk1Offsets, disk1Cells, disk1Bearings, visOffsets, visCells, visBearings) {
    this.registry = registry;
    this.disk1Offsets = disk1Offsets;
    this.disk1Cells = disk1Cells;
    this.disk1Bearings = disk1Bearings;
    this.visOffsets = visOffsets;
    this.visCells = visCells;
    this.visBearings = visBearings;
  }

  disk1Start(i) {
    return this.disk1Offsets[i];
  }
  disk1End(i) {
    return this.disk1Offsets[i + 1];
  }
  visStart(i) {
    return this.visOffsets[i];
  }
  visEnd(i) {
    return this.visOffsets[i + 1];
  }
}

/**
 * Build the shared neighbor field from the precomputed visibility + bearing maps
 * (plain objects / Map keyed by cell strings) produced during mapping.
 *
 * @param {CellRegistry} registry
 * @param {Object} frictionLookup  plain {cell: friction}
 * @param {Object} visibilityData  plain {cell: {neighbor: true}}
 * @param {Map|Object} bearingMap  "a::b" -> bearing (degrees)
 * @param {number} visionDepth
 */
export function buildSharedNeighborField(registry, frictionLookup, visibilityData, bearingMap, _visionDepth) {
  const N = registry.count;
  const impassable = FRICTION_COSTS.IMPASSABLE;

  const getBearing = (a, b) => {
    if (bearingMap && typeof bearingMap.get === 'function') return bearingMap.get(a + '::' + b);
    if (bearingMap && typeof bearingMap === 'object') return bearingMap[a + '::' + b];
    return undefined;
  };

  // --- distance-1 ring (all immediate neighbors, regardless of visibility) ---
  // SAB-backed so the whole structure can be shared zero-copy with workers.
  const disk1Offsets = allocInt32(N + 1);
  const disk1TmpCells = [];
  const disk1TmpBearings = [];
  for (let i = 0; i < N; i++) {
    const cell = registry.cells[i];
    disk1Offsets[i] = disk1TmpCells.length;
    const ring = gridDisk(cell, 1);
    const sLatLng = cellToLatLng(cell);
    for (let r = 0; r < ring.length; r++) {
      const n = ring[r];
      if (n === cell) continue;
      const ni = registry.idx(n);
      if (ni === undefined) continue; // outside AOI
      disk1TmpCells.push(ni);
      const eLatLng = cellToLatLng(n);
      disk1TmpBearings.push(_bearingFromLatLngs(sLatLng, eLatLng));
    }
  }
  disk1Offsets[N] = disk1TmpCells.length;
  const disk1Cells = allocInt32(disk1TmpCells.length);
  disk1Cells.set(disk1TmpCells);
  const disk1Bearings = allocFloat32(disk1TmpBearings.length);
  disk1Bearings.set(disk1TmpBearings);

  // --- visible neighbors within visionDepth (candidate set) + bearings ---
  const visOffsets = allocInt32(N + 1);
  const visTmpCells = [];
  const visTmpBearings = [];
  for (let i = 0; i < N; i++) {
    const cell = registry.cells[i];
    visOffsets[i] = visTmpCells.length;
    // Only passable cells have a visible set in precomputeVisibilitySets.
    const visible = visibilityData ? visibilityData[cell] : null;
    if (!visible) continue;
    for (const n in visible) {
      if (!visible[n]) continue;
      const ni = registry.idx(n);
      if (ni === undefined) continue;
      const f = frictionLookup ? frictionLookup[n] : undefined;
      if (f === undefined || f >= impassable) continue;
      const b = getBearing(cell, n);
      if (typeof b !== 'number') continue;
      visTmpCells.push(ni);
      visTmpBearings.push(b);
    }
  }
  visOffsets[N] = visTmpCells.length;
  const visCells = allocInt32(visTmpCells.length);
  visCells.set(visTmpCells);
  const visBearings = allocFloat32(visTmpBearings.length);
  visBearings.set(visTmpBearings);

  return new SharedNeighborField(
    registry,
    disk1Offsets,
    disk1Cells,
    disk1Bearings,
    visOffsets,
    visCells,
    visBearings
  );
}

// ---------------------------------------------------------------------------
// Indexed Dijkstra gradient (distance field) over integer indices
// ---------------------------------------------------------------------------

function _neighborsIdx(field, i, out) {
  const start = field.disk1Start(i);
  const end = field.disk1End(i);
  let k = 0;
  for (let p = start; p < end; p++) out[k++] = field.disk1Cells[p];
  return k;
}

/**
 * Compute the Dijkstra distance field from `targetIdx` using the integer-indexed
 * friction array and distance-1 neighbor ring. Unreachable cells are Infinity
 * (mirrors the plain-object version where they are simply absent).
 */
export function computeDijkstraIndexed(targetIdx, frictionArr, neighborField) {
  const N = frictionArr.length;
  const dist = new Float32Array(N).fill(Infinity);
  const visited = new Uint8Array(N);
  const heap = new MinHeap();
  const nb = new Int32Array(64);

  dist[targetIdx] = 0;
  heap.insert(targetIdx, 0);

  while (heap.size() > 0) {
    const current = heap.extractMin();
    if (visited[current]) continue;
    visited[current] = 1;

    const cd = dist[current];
    const nCount = _neighborsIdx(neighborField, current, nb);
    for (let i = 0; i < nCount; i++) {
      const n = nb[i];
      if (n === current) continue;
      const f = frictionArr[n];
      if (typeof f !== 'number' || f >= FRICTION_COSTS.IMPASSABLE) continue;
      const nd = cd + f;
      if (nd < dist[n]) {
        dist[n] = nd;
        heap.insert(n, nd);
      }
    }
  }
  return dist;
}

/**
 * Build SAB-backed gradient Float32Arrays for a set of destination cells from
 * already-computed plain-object gradients ({destCell: {cell: distance}}).
 * Reuses the existing gradient cache so no extra Dijkstra runs are needed.
 *
 * @returns Map<destIdx, Float32Array>  (each Float32Array over a SharedArrayBuffer)
 */
export function buildGradientSABs(gradientCacheObj, registry) {
  const out = new Map();
  for (const destCell in gradientCacheObj) {
    const di = registry.idx(destCell);
    if (di === undefined) continue;
    const plain = gradientCacheObj[destCell];
    const arr = allocFloat32(registry.count).fill(Infinity);
    for (const cell in plain) {
      const ci = registry.idx(cell);
      if (ci !== undefined) arr[ci] = plain[cell];
    }
    out.set(di, arr);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Build (and cache) the full shared mapping for a simulation run.
// Combines friction, affordance, neighbor/visibility/bearing CSR into SABs so
// they can be shared zero-copy with every agent worker. Cached per mapping
// generation so repeated runs (and the gradient + agent stages) reuse it.
// ---------------------------------------------------------------------------

export function getOrBuildSABMapping(state) {
  const gen = state._mappingGeneration ?? 0;
  if (state._sabMapping && state._sabMapping.gen === gen) {
    return state._sabMapping;
  }

  const cells = state.cellFrictionMap ? Array.from(state.cellFrictionMap.keys()) : [];
  if (cells.length === 0) return null;

  const registry = buildCellRegistry(cells);
  const friction = SharedScalarField.fromLookup(registry, state._frictionObj || null);
  // Default fill 0.1 matches the plain-object affordance lookup fallback
  // (affordanceLookup?.[n] ?? 0.1) for cells without an explicit value.
  const affordance = SharedScalarField.fromLookup(registry, state._affordanceObj || null, 0.1);
  const visionDepth = state.simulationParams?.visionDepth ?? SIMULATION_PARAMS.visionDepth;

  const neighbors = buildSharedNeighborField(
    registry,
    state._frictionObj || null,
    state._precomputedVisibility ? state._precomputedVisibility.data : null,
    state._precomputedBearings ? state._precomputedBearings.data : null,
    visionDepth
  );

  const mapping = {
    gen,
    registry,
    friction,
    affordance,
    neighbors,
    idxToCell: registry.cells,
  };
  state._sabMapping = mapping;
  return mapping;
}

// ---------------------------------------------------------------------------
// SAB-backed agent kernel (faithful port of agentTasks.js logic)
// ---------------------------------------------------------------------------

function _lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function _strHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function _bearingFromLatLngs(s, e) {
  const lat1 = s[0];
  const lon1 = s[1];
  const lat2 = e[0];
  const lon2 = e[1];
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function angleDiff(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function estimateMaxTicks(originCell, destCell, hexCount) {
  const dist = gridDistance(originCell, destCell);
  const pathBudget = Math.max(64, dist * 8 + 32);
  const globalBudget = 2 * Math.ceil(Math.sqrt(hexCount * Math.PI));
  return Math.min(5000, pathBudget, globalBudget);
}

// Local line cache (worker-scoped) keyed by "currIdx::nextStepIdx"
const _lineCache = new Map();

function _resolveStepLineSAB(ctx, currIdx, nextStepIdx) {
  const { idxToCell, cellToIdx, frictionArr, neighborField } = ctx;
  const straightCells = (() => {
    const key = currIdx + '::' + nextStepIdx;
    let line = _lineCache.get(key);
    if (line) return line;
    try {
      const cells = gridPathCells(idxToCell[currIdx], idxToCell[nextStepIdx]);
      line = cells.map((c) => cellToIdx.get(c)).filter((i) => i !== undefined);
    } catch (_e) {
      line = [currIdx, nextStepIdx];
    }
    _lineCache.set(key, line);
    return line;
  })();

  let clear = true;
  for (let i = 1; i < straightCells.length; i++) {
    const c = straightCells[i];
    const f = frictionArr[c];
    if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) {
      clear = false;
      break;
    }
    // Detect a diagonal transition that would cut an impassable corner.
    if (i > 1) {
      const a = straightCells[i - 1];
      const b = straightCells[i];
      if (gridDistance(idxToCell[a], idxToCell[b]) > 1) {
        if (_cornersImpassableSAB(ctx, a, b)) {
          clear = false;
          break;
        }
      }
    }
  }
  if (clear) return straightCells;

  // BFS detour within the local disk (bounded by visionDepth for cost).
  const prev = new Int32Array(ctx.registry.count).fill(-1);
  const seen = new Uint8Array(ctx.registry.count);
  const queue = [currIdx];
  seen[currIdx] = 1;
  let found = false;
  let head = 0;
  while (head < queue.length) {
    const node = queue[head++];
    if (node === nextStepIdx) {
      found = true;
      break;
    }
    const start = neighborField.disk1Offsets[node];
    const end = neighborField.disk1Offsets[node + 1];
    for (let p = start; p < end; p++) {
      const m = neighborField.disk1Cells[p];
      if (m === node || seen[m]) continue;
      const mf = frictionArr[m];
      if (typeof mf === 'undefined' || mf >= FRICTION_COSTS.IMPASSABLE) continue;
      seen[m] = 1;
      prev[m] = node;
      queue.push(m);
    }
  }
  if (!found) return straightCells;

  const path = [];
  let node = nextStepIdx;
  while (node !== currIdx) {
    path.push(node);
    node = prev[node];
    if (node === -1) return straightCells;
  }
  path.reverse();
  return [currIdx, ...path];
}

function _cornersImpassableSAB(ctx, a, b) {
  const { neighborField, frictionArr } = ctx;
  const aStart = neighborField.disk1Offsets[a];
  const aEnd = neighborField.disk1Offsets[a + 1];
  const bStart = neighborField.disk1Offsets[b];
  const bEnd = neighborField.disk1Offsets[b + 1];
  for (let p = aStart; p < aEnd; p++) {
    const c = neighborField.disk1Cells[p];
    if (c === a || c === b) continue;
    let isNeighbor = false;
    for (let q = bStart; q < bEnd; q++) {
      if (neighborField.disk1Cells[q] === c) {
        isNeighbor = true;
        break;
      }
    }
    if (!isNeighbor) continue;
    const f = frictionArr[c];
    if (typeof f !== 'undefined' && f >= FRICTION_COSTS.IMPASSABLE) return true;
  }
  return false;
}

function getGradientDirectionSAB(ctx, currIdx, gradientArr) {
  if (!gradientArr) return null;
  const gCurr = gradientArr[currIdx];
  if (!Number.isFinite(gCurr)) return null;

  const nf = ctx.neighborField;
  const start = nf.disk1Offsets[currIdx];
  const end = nf.disk1Offsets[currIdx + 1];
  let bestNeighbor = -1;
  let bestGrad = gCurr;
  for (let p = start; p < end; p++) {
    const n = nf.disk1Cells[p];
    if (n === currIdx) continue;
    const f = ctx.frictionArr[n];
    if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) continue;
    const gN = gradientArr[n];
    if (!Number.isFinite(gN)) continue;
    if (gN < bestGrad) {
      bestGrad = gN;
      bestNeighbor = n;
    }
  }
  if (bestNeighbor < 0) return null;
  for (let p = start; p < end; p++) {
    if (nf.disk1Cells[p] === bestNeighbor) return nf.disk1Bearings[p];
  }
  return null;
}

function getBearingBetweenSAB(ctx, a, b) {
  const nf = ctx.neighborField;
  const vStart = nf.visOffsets[a];
  const vEnd = nf.visOffsets[a + 1];
  for (let p = vStart; p < vEnd; p++) {
    if (nf.visCells[p] === b) return nf.visBearings[p];
  }
  const dStart = nf.disk1Offsets[a];
  const dEnd = nf.disk1Offsets[a + 1];
  for (let p = dStart; p < dEnd; p++) {
    if (nf.disk1Cells[p] === b) return nf.disk1Bearings[p];
  }
  const s = cellToLatLng(ctx.idxToCell[a]);
  const e = cellToLatLng(ctx.idxToCell[b]);
  return _bearingFromLatLngs(s, e);
}

function getBestNextStepSAB(ctx, currIdx, gradientArr, currentDirection, agentId) {
  const { simulationParams, frictionArr, affordanceArr, footprints, neighborField } = ctx;
  const weights = {
    w_a: simulationParams.affordanceWeight,
    w_d: simulationParams.distancePenalty,
    w_theta: WEIGHTS.w_theta,
  };
  const impassableVal = FRICTION_COSTS.IMPASSABLE;
  const visualAngleHalf = simulationParams.fieldOfView / 2;

  const gCurr = gradientArr ? gradientArr[currIdx] : undefined;
  const useGradient = Number.isFinite(gCurr);

  const cellsArr = [];
  const anglesArr = [];
  const affsArr = [];
  const frictionArr2 = [];
  const gNsArr = useGradient ? [] : null;

  const vStart = neighborField.visOffsets[currIdx];
  const vEnd = neighborField.visOffsets[currIdx + 1];
  for (let p = vStart; p < vEnd; p++) {
    const n = neighborField.visCells[p];
    if (n === currIdx) continue;
    const f = frictionArr[n];
    if (f === undefined || f >= impassableVal) continue;

    const ang = angleDiff(neighborField.visBearings[p], currentDirection);
    let aff = affordanceArr[n];
    if (aff === undefined || !Number.isFinite(aff)) aff = 0.1;

    if (useGradient) {
      const gN = gradientArr[n];
      if (!Number.isFinite(gN)) continue;
      cellsArr.push(n);
      anglesArr.push(ang);
      affsArr.push(aff);
      frictionArr2.push(f);
      gNsArr.push(gN);
    } else {
      cellsArr.push(n);
      anglesArr.push(ang);
      affsArr.push(aff);
      frictionArr2.push(f);
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
        swap(frictionArr2);
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
      const stepCost = frictionArr2[i] || 0;

      // Pavement does NOT wear — skip the footprint boost there so agents
      // don't all lock onto one paved cell (desire paths form on grass).
      if (footprints && frictionArr2[i] !== FRICTION_COSTS.PAVEMENT) {
        const fp = footprints[cellsArr[i]] || 0;
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
      const neighbors = gridDisk(ctx.idxToCell[currIdx], depth)
        .map((c) => ctx.cellToIdx.get(c))
        .filter((i) => i !== undefined && i !== currIdx);
      let bestGrad = Infinity;
      let bestCandidate = -1;
      for (let i = 0; i < neighbors.length; i++) {
        const n = neighbors[i];
        const f = frictionArr[n];
        if (f === undefined || f >= impassableVal) continue;
        const g = gradientArr ? (Number.isFinite(gradientArr[n]) ? gradientArr[n] : Infinity) : Infinity;
        if (g < bestGrad) {
          bestGrad = g;
          bestCandidate = n;
        }
      }
      if (bestCandidate >= 0) {
        return getBearingBetweenSAB(ctx, currIdx, bestCandidate);
      }
    }
    return null;
  }

  const hasValidScores = useGradient && scores?.length > 0 && typeof scores[0] === 'number';
  if (
    hasValidScores &&
    typeof simulationParams.temperature === 'number' &&
    simulationParams.temperature > 0
  ) {
    const seed = _strHash(agentId + ':' + currIdx);
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
    if (!isFinite(sum) || sum === 0) {
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
      if (r <= acc) return cellsArr[i];
    }
    return cellsArr[cellsArr.length - 1];
  }

  let bestScore = -Infinity;
  let bestIndex = -1;
  for (let i = 0; i < cLen; i++) {
    const S_ij = scores ? scores[i] : undefined;
    const isScoreValid = typeof S_ij === 'number';
    if (isScoreValid && S_ij > bestScore) {
      bestScore = S_ij;
      bestIndex = i;
    } else if (!isScoreValid) {
      let effAff = affsArr[i];
      if (footprints && frictionArr2[i] !== FRICTION_COSTS.PAVEMENT) {
        const fp = footprints[cellsArr[i]] || 0;
        effAff += Math.log1p(fp) * 0.05;
      }
      if (effAff > bestScore) {
        bestScore = effAff;
        bestIndex = i;
      } else if (Math.abs(effAff - bestScore) < 1e-9) {
        const currentBestCost =
          (frictionArr2[bestIndex] || 0) + (useGradient ? (gNsArr[bestIndex] ?? Infinity) : 0);
        const candidateCost = (frictionArr2[i] || 0) + (useGradient ? (gNsArr[i] ?? Infinity) : 0);
        if (candidateCost < currentBestCost) {
          bestIndex = i;
        } else if (candidateCost === currentBestCost) {
          const dCandidate = gridDistance(ctx.idxToCell[currIdx], ctx.idxToCell[cellsArr[i]]);
          const dBest = gridDistance(ctx.idxToCell[currIdx], ctx.idxToCell[cellsArr[bestIndex]]);
          if (dCandidate < dBest) bestIndex = i;
        }
      }
    }
  }

  return bestIndex >= 0 ? cellsArr[bestIndex] : null;
}

function runAgentPathSAB(ctx, originIdx, destIdx, destGradientArr, maxTicks, simAgentId, pathDesireMap, _perTargetMap) {
  const { frictionArr, flow, odDistances } = ctx;
  let simCurrent = originIdx;
  const simTarget = destIdx;

  let distToTarget = 0;
  let simDirection =
    getGradientDirectionSAB(ctx, simCurrent, destGradientArr) ??
    getBearingBetweenSAB(ctx, simCurrent, simTarget);
  const simPath = [originIdx];
  if (pathDesireMap) recordTraversalIdx(pathDesireMap, originIdx);
  if (flow) Atomics.add(flow, originIdx, 1);

  let stuckCount = 0;
  const STUCK_THRESHOLD = 3;

  for (let tick = 0; tick < maxTicks; tick++) {
    if (odDistances) {
      const currentDist = odDistances[simCurrent + '::' + destIdx];
      if (typeof currentDist === 'number') distToTarget = currentDist;
    } else {
      distToTarget = gridDistance(ctx.idxToCell[simCurrent], ctx.idxToCell[simTarget]);
    }

    if (distToTarget <= 1) {
      if (simTarget !== simCurrent) {
        simPath.push(simTarget);
        if (pathDesireMap) recordTraversalIdx(pathDesireMap, simTarget);
        if (flow) Atomics.add(flow, simTarget, 1);
      }
      break;
    }

    const nextStep = getBestNextStepSAB(ctx, simCurrent, destGradientArr, simDirection, simAgentId);
    if (nextStep === null || nextStep === simCurrent) {
      stuckCount++;
      if (stuckCount >= STUCK_THRESHOLD) break;
      continue;
    }
    stuckCount = 0;

    const line = _resolveStepLineSAB(ctx, simCurrent, nextStep);
    let hitTarget = false;
    let lastReached = simCurrent;
    for (let i = 1; i < line.length; i++) {
      const stepCell = line[i];
      const f = frictionArr[stepCell];
      if (typeof f === 'undefined' || f >= FRICTION_COSTS.IMPASSABLE) break;
      simPath.push(stepCell);
      if (pathDesireMap) recordTraversalIdx(pathDesireMap, stepCell);
      if (flow) Atomics.add(flow, stepCell, 1);
      lastReached = stepCell;
      if (stepCell === simTarget) {
        hitTarget = true;
        break;
      }
    }

    if (hitTarget) break;

    simDirection = getBearingBetweenSAB(ctx, simCurrent, nextStep);
    simCurrent = lastReached;
    if (simCurrent === simTarget) break;
  }

  return simPath;
}

function recordTraversalIdx(map, idx) {
  map[idx] = (map[idx] || 0) + 1;
}

/**
 * SAB-backed agent batch. Mirrors computeAgentBatch (agentTasks.js) but operates
 * on integer indices and shared typed arrays. The shared `flow` and `footprints`
 * buffers are updated with Atomics so multiple workers can run concurrently.
 *
 * @returns {{ result: object, transfers: ArrayBuffer[] }}
 *   result.perTargetContribs is keyed by destIdx -> { keys: Int32Array, vals: Int32Array }
 *   The flow buffer is shared (not returned); read it from ctx.flow afterwards.
 */
export function computeAgentBatchSAB(payload = {}) {
  const {
    planIdx = [],
    frictionArr,
    affordanceArr,
    neighborField,
    gradients = {}, // destIdx -> Float32Array
    footprints = null, // Int32Array SAB (shared ABM state)
    flow = null, // Int32Array SAB (shared flow accumulation)
    odDistances = null, // "oi::di" -> distance (small)
    simulationParams = null,
    idxToCell = [],
    cellToIdx = null,
    visionDepth = 15,
    registry = null,
  } = payload;

  const params = { ...SIMULATION_PARAMS, ...(simulationParams || {}) };
  const ctx = {
    simulationParams: params,
    frictionArr,
    affordanceArr,
    footprints,
    flow,
    neighborField,
    odDistances,
    idxToCell,
    cellToIdx: cellToIdx || buildCellToIdx(idxToCell),
    visionDepth,
    registry: registry || { count: frictionArr ? frictionArr.length : 0 },
  };

  let totalAgents = 0;
  for (let i = 0; i < planIdx.length; i++) {
    const assigned = planIdx[i].assigned || [];
    for (let j = 0; j < assigned.length; j++) totalAgents += assigned[j] || 0;
  }

  const emitEvery = Math.max(1, Math.floor(totalAgents / 20));
  const pathDesireMap = Object.create(null); // local idx -> count (also written to shared flow)
  const perTargetContribs = Object.create(null); // destIdx -> { keys:[], vals:[] }
  let processed = 0;

  for (let p = 0; p < planIdx.length; p++) {
    const entry = planIdx[p];
    const originIdx = entry.originIdx;
    const destCandidates = entry.destCandidates || [];
    const assigned = entry.assigned || [];

    for (let idx = 0; idx < destCandidates.length; idx++) {
      const destIdx = destCandidates[idx].destIdx;
      const count = assigned[idx] || 0;
      if (count <= 0) continue;
      const destGradient = gradients[destIdx];
      if (!destGradient) continue;
      if (!Number.isFinite(destGradient[originIdx])) continue;

      if (!perTargetContribs[destIdx]) perTargetContribs[destIdx] = { keys: [], vals: [] };
      const maxTicks = destCandidates[idx].maxTicks || 5000;

      for (let sim = 0; sim < count; sim++) {
        const simAgentId = `${originIdx}:${destIdx}:${sim}`;
        const simPath = runAgentPathSAB(
          ctx,
          originIdx,
          destIdx,
          destGradient,
          maxTicks,
          simAgentId,
          pathDesireMap,
          perTargetContribs[destIdx]
        );

        const pt = perTargetContribs[destIdx];
        for (let k = 0; k < simPath.length; k++) {
          const cell = simPath[k];
          // accumulate per-target contribution (local to this worker)
          let found = false;
          for (let q = 0; q < pt.keys.length; q++) {
            if (pt.keys[q] === cell) {
              pt.vals[q]++;
              found = true;
              break;
            }
          }
          if (!found) {
            pt.keys.push(cell);
            pt.vals.push(1);
          }
          // Accumulate shared footprint for the ABM feedback loop.
          // Pavement does NOT wear — skip deposition there so the paved route
          // isn't artificially super-charged (desire paths form on grass).
          if (footprints && frictionArr[cell] !== FRICTION_COSTS.PAVEMENT) {
            Atomics.add(footprints, cell, 1);
          }
        }

        processed++;
        if (processed % emitEvery === 0) {
          try {
            if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
              self.postMessage({ progress: true, phase: 'agent-batch', processed, total: totalAgents });
            }
          } catch (_e) {}
        }
      }
    }
  }

  // Flatten per-target contribs into transferable arrays.
  const perTargetFlat = Object.create(null);
  const transfers = [];
  for (const destIdx in perTargetContribs) {
    const pt = perTargetContribs[destIdx];
    const keys = Int32Array.from(pt.keys);
    const vals = Int32Array.from(pt.vals);
    perTargetFlat[destIdx] = { keys, vals };
    transfers.push(keys.buffer);
    transfers.push(vals.buffer);
  }

  const result = {
    processed,
    total: totalAgents,
    perTargetContribs: perTargetFlat,
  };

  return { result, transfers };
}

function buildCellToIdx(idxToCell) {
  const m = new Map();
  for (let i = 0; i < idxToCell.length; i++) m.set(idxToCell[i], i);
  return m;
}

// Re-export helpers used by callers / tests
export { estimateMaxTicks as _estimateMaxTicksSAB };
