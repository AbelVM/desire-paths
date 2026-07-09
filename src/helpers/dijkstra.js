import { MinHeap } from './minheap.js';
import { FRICTION_COSTS } from './constants.js';
import { gridDisk } from 'h3-js';

/**
 * Gradient Dijkstra — selected algorithm + tuning.
 *
 * The graph is a degree-6 H3 hex grid. Friction wears within [1, 4]
 * (PAVEMENT=1, LIGHT_PARK=2.5, HEAVY_GRASS=4) plus the impassable-blur
 * addition (≤3), so every PASSABLE cell stays in [1, ~7]. IMPASSABLE (999999)
 * is a hard barrier that is never traversed (encoded as -1 and skipped), so it
 * does not contribute to edge weights.
 *
 * Because passable edge weights are small, Dial's Algorithm is the most
 * performant priority queue: O(E + V·C) with C = max (quantized) edge weight.
 * The bucket count is always C+1, computed from the actual max weight, so it
 * always covers the full range (no overflow risk) regardless of wear. The
 * RESOLUTION is set by GRADIENT_DIAL_SCALE: distances are quantized to
 * 1/SCALE. We use SCALE=8 (step 0.125) so that the fine friction differences
 * produced by wear (friction varies continuously in [1,4]) are preserved —
 * sub-0.125 differences are below the wear step and safely rounded. With max
 * weight ~5.8 (HEAVY_GRASS 4 + blur ~1.8) ×8 ≈ 47, C≈47, so Dial's does ~47V
 * bucket ops with zero comparisons, still ~3× fewer ops than a 4-ary heap
 * (~170V), so Dial's remains the fastest choice even at this resolution.
 *
 * A 4-ary heap fallback (exact, handles any weight range) is kept as a safety
 * net for unexpectedly large weights (see DIAL_MAX_C); it should not trigger
 * for normal friction. Set GRADIENT_ALGO to '4ary' or 'binary' to force it.
 */
export const GRADIENT_ALGO = 'dial'; // 'dial' | '4ary' | 'binary'
// Quantization scale for Dial's. Distances are rounded to 1/SCALE. SCALE=8
// (step 0.125) preserves the fine friction differences produced by wear while
// keeping C small enough that Dial's stays faster than a 4-ary heap.
const GRADIENT_DIAL_SCALE = 8;
const INF_INT = 0x3fffffff;
// Dial's bucket count is C = max edge weight. For normal friction passable
// cells stay in [1, ~7] (quantized ×2 -> 14), so C is always small and Dial's
// is optimal. This guard keeps a 4-ary heap fallback for any unexpectedly large
// weight (e.g. if friction modeling changes), so Dial's never degrades.
const DIAL_MAX_C = 128;

// ---------------------------------------------------------------------------
// Gradient graph: precomputed distance-1 adjacency (CSR) + cell<->index maps.
// Topology depends only on the AOI cell set, which is stable for a mapping
// generation, so it is built once per cell-source and reused across every
// gradient Dijkstra (this is what eliminates the per-cell gridDisk calls that
// used to dominate gradient cost).
// ---------------------------------------------------------------------------
let _graphCacheKey = null;
let _graphCache = null;

/**
 * Drop the cached gradient graph. The graph is keyed by the *identity* of the
 * friction source (see getGradientGraph). The mapping stage reuses the same
 * `cellFrictionMap` instance across remaps (it calls `.clear()` then re-`.set`s
 * new friction), so the reference is stable while the *contents* change. Without
 * an explicit invalidation the next simulation run would silently reuse the
 * previous mapping's adjacency/topology. Call this whenever friction topology
 * changes (e.g. from clearComputeCaches, which runs at the start of every
 * triggerFastScan).
 */
export function invalidateGradientGraph() {
  _graphCache = null;
  _graphCacheKey = null;
}

/**
 * Build (or return the cached) gradient graph for a friction source.
 *
 * @param {Map|Object} cellSource - friction source (Map or plain object).
 * @param {Object} [r1Adjacency] - optional shared r=1 CSR from `buildR1Adjacency`
 *   ({ N, offsets, neighbors }, viewHexes-indexed). When supplied together with
 *   `viewHexes` (and `r1Adjacency.N === viewHexes.length`), the CSR adjacency is
 *   built by FILTERING this prebuilt adjacency to passable cells instead of
 *   running a per-cell `gridDisk` pass (M3). This removes the main-thread H3
 *   V-pass (the biggest remaining UI block at city scale) and the worker's
 *   duplicate H3 pass. The output is byte-identical to the `gridDisk` path: the
 *   passable cell list is sorted the same way, so `cellToIdx`/`idxToCell` — and
 *   therefore every M1 gradient index — are unchanged.
 * @param {string[]} [viewHexes] - AOI cell order matching `r1Adjacency` indices.
 */
export function getGradientGraph(cellSource, r1Adjacency, viewHexes) {
  if (_graphCache && _graphCacheKey === cellSource) return _graphCache;

  const isMap = typeof cellSource !== 'undefined' && typeof cellSource.entries === 'function';
  const cellKeys = isMap ? Array.from(cellSource.keys()) : Object.keys(cellSource || {});
  const getF = (c) => (isMap ? cellSource.get(c) : cellSource[c]);
  const IMPASSABLE = FRICTION_COSTS.IMPASSABLE;

  // Only PASSABLE cells participate in routing. Impassable cells are static
  // barriers (friction never wears into/out of IMPASSABLE) that are never
  // traversed, so they are excluded from the graph entirely. This shrinks both
  // V and E; the result is identical to the legacy path, which skipped
  // impassable neighbors during relaxation.
  const cells = [];
  for (let i = 0; i < cellKeys.length; i++) {
    const c = cellKeys[i];
    const f = getF(c);
    if (typeof f === 'number' && f < IMPASSABLE) cells.push(c);
  }
  // Sort the passable cell list so `cellToIdx` / `idxToCell` are DETERMINISTIC
  // for a given cell set, independent of the input object's key order. This is
  // what lets a gradient typed-array (indexed by this graph's `cellToIdx`) be
  // produced on the main thread and consumed in a worker that rebuilds the same
  // graph from the same friction source — both arrive at identical indices.
  cells.sort();
  const V = cells.length;

  const cellToIdx = Object.create(null);
  for (let i = 0; i < V; i++) cellToIdx[cells[i]] = i;

  // Precompute the per-cell edge-weight array ONCE per graph. Friction is
  // constant for a given cell set / mapping generation, so every Dijkstra
  // target can reuse this instead of rebuilding a fresh Float64Array(V) and
  // re-running V friction lookups. The old per-target allocation was D×V
  // transient memory (hundreds of MB at city scale) and dominated gradient
  // batch cost. The graph is rebuilt (via invalidateGradientGraph) whenever
  // friction topology changes, so this cache can never go stale.
  const frictionArr = new Float64Array(V);
  let frictionMaxC = 0;
  for (let i = 0; i < V; i++) {
    const f = getF(cells[i]);
    const w = typeof f === 'number' && f < IMPASSABLE ? f : -1;
    frictionArr[i] = w;
    if (w > frictionMaxC) frictionMaxC = w;
  }

  // CSR adjacency built into one flat temp buffer, then prefix-summed +
  // compacted. It holds only ONE contiguous `Int32Array(6V)` (not V intermediate
  // arrays) — the V-arrays shape is what previously triggered non-deterministic
  // memory corruption at city scale (V ~ 5e5), where the prefix-sum `adjOffsets`
  // came back garbage and broke every consumer (gradient Dijkstra, visibility
  // BFS). A single flat buffer is correct at any V. The temp + `deg` arrays are
  // freed once `adjNeighbors` is built (the graph is cached per source, so this
  // is a one-time cost).
  //
  // M3: when a shared `r1Adjacency` (viewHexes-indexed r=1 CSR from
  // `buildR1Adjacency`, already computed once per mapping generation) is
  // available, filter it to passable cells instead of running a per-cell
  // `gridDisk` pass. `r1Adjacency` neighbors are viewHexes indices, so map each
  // through `viewHexes[..]` back to a cell id and then to this graph's sorted
  // `cellToIdx`. The resulting adjacency is identical to the `gridDisk` path
  // (same passable, in-AOI, center-excluded neighbor set) — only the H3 calls
  // are avoided.
  const useR1 =
    r1Adjacency &&
    r1Adjacency.offsets &&
    r1Adjacency.neighbors &&
    Array.isArray(viewHexes) &&
    r1Adjacency.N === viewHexes.length;

  const temp = new Int32Array(V * 6);
  const deg = new Int32Array(V);
  let tempPos = 0;
  if (useR1) {
    // viewHexes cell -> viewHexes index (cheap O(N) loop, no H3).
    const vhIdx = Object.create(null);
    for (let i = 0; i < viewHexes.length; i++) vhIdx[viewHexes[i]] = i;
    const r1Off = r1Adjacency.offsets;
    const r1Nb = r1Adjacency.neighbors;
    for (let i = 0; i < V; i++) {
      const gi = vhIdx[cells[i]];
      if (gi === undefined) continue; // passable cell not in viewHexes (defensive)
      const s = r1Off[gi];
      const e = r1Off[gi + 1];
      for (let x = s; x < e; x++) {
        const j = cellToIdx[viewHexes[r1Nb[x]]]; // undefined for impassable / out-of-AOI
        if (j !== undefined) {
          temp[tempPos++] = j;
          deg[i]++;
        }
      }
    }
  } else {
    for (let i = 0; i < V; i++) {
      const cell = cells[i];
      const disk = gridDisk(cell, 1);
      for (let k = 0; k < disk.length; k++) {
        const nb = disk[k];
        if (nb === cell) continue; // skip the center
        const j = cellToIdx[nb]; // undefined for impassable / out-of-AOI neighbors
        if (j !== undefined) {
          temp[tempPos++] = j; // keep only passable, in-AOI neighbors
          deg[i]++;
        }
      }
    }
  }

  const adjOffsets = new Int32Array(V + 1);
  for (let i = 0; i < V; i++) adjOffsets[i + 1] = adjOffsets[i] + deg[i];

  const adjNeighbors = new Int32Array(adjOffsets[V]);
  let w = 0;
  for (let i = 0; i < V; i++) {
    const start = adjOffsets[i];
    const end = adjOffsets[i + 1];
    for (let e = start; e < end; e++) adjNeighbors[w++] = temp[e];
  }

  _graphCache = {
    V,
    cellToIdx,
    idxToCell: cells,
    adjOffsets,
    adjNeighbors,
    frictionArr,
    frictionMaxC,
  };
  _graphCacheKey = cellSource;
  return _graphCache;
}

// Return the distance-1 neighbor *indices* of `cell` from the canonical gradient
// graph (passable, in-AOI, center excluded) as a zero-copy Int32Array view into
// the CSR `adjNeighbors` buffer. Callers map an index back to its cell id via
// `graph.idxToCell[ni]`. This replaces the old `cellNeighbors` plain object
// (V arrays of ~6 neighbor *cell strings* — ~3M string refs at city scale, held
// for the whole simulation) with a reuse of the CSR adjacency that already
// exists, eliminating that memory entirely. Returns an empty Int32Array for
// impassable / out-of-AOI cells (which agents never occupy).
const EMPTY_IDX = new Int32Array(0);
export function getGraphNeighborIndicesR1(graph, cell) {
  const idx = graph && graph.cellToIdx[cell];
  if (idx === undefined) return EMPTY_IDX;
  return graph.adjNeighbors.subarray(graph.adjOffsets[idx], graph.adjOffsets[idx + 1]);
}

// ---------------------------------------------------------------------------
// d-ary min-heap (integer node ids, Float64 scores, zero-alloc typed arrays).
// arity=2 reproduces the old binary MinHeap; arity=4 is the Dijkstra optimum.
// ---------------------------------------------------------------------------
class DaryHeap {
  #d;
  #nodes;
  #scores;
  #size = 0;

  constructor(arity = 4, capacityHint = 1024) {
    this.#d = arity;
    this.#nodes = new Int32Array(capacityHint);
    this.#scores = new Float64Array(capacityHint);
  }

  get size() {
    return this.#size;
  }

  #grow() {
    const cap = this.#nodes.length * 2;
    const n = new Int32Array(cap);
    n.set(this.#nodes);
    const s = new Float64Array(cap);
    s.set(this.#scores);
    this.#nodes = n;
    this.#scores = s;
  }

  insert(node, score) {
    if (this.#size >= this.#nodes.length) this.#grow();
    let i = this.#size++;
    this.#nodes[i] = node;
    this.#scores[i] = score;
    const d = this.#d;
    while (i > 0) {
      const par = ((i - 1) / d) | 0;
      if (this.#scores[i] >= this.#scores[par]) break;
      const tn = this.#nodes[i];
      const ts = this.#scores[i];
      this.#nodes[i] = this.#nodes[par];
      this.#scores[i] = this.#scores[par];
      this.#nodes[par] = tn;
      this.#scores[par] = ts;
      i = par;
    }
  }

  extractMin() {
    if (this.#size === 0) return -1;
    const minNode = this.#nodes[0];
    this.#size--;
    if (this.#size > 0) {
      this.#nodes[0] = this.#nodes[this.#size];
      this.#scores[0] = this.#scores[this.#size];
      this.#down(0);
    }
    return minNode;
  }

  #down(i) {
    const d = this.#d;
    const len = this.#size;
    const nodes = this.#nodes;
    const scores = this.#scores;
    for (;;) {
      const first = i * d + 1;
      if (first >= len) break;
      let best = first;
      const last = first + d < len ? first + d : len;
      for (let c = first + 1; c < last; c++) {
        if (scores[c] < scores[best]) best = c;
      }
      if (scores[i] <= scores[best]) break;
      const tn = nodes[i];
      const ts = scores[i];
      nodes[i] = nodes[best];
      scores[i] = scores[best];
      nodes[best] = tn;
      scores[best] = ts;
      i = best;
    }
  }
}

// ---------------------------------------------------------------------------
// Indexed Dijkstra variants (operate on integer cell indices + typed arrays).
// `frictionArr` holds per-cell edge weight (cost of ENTERING the cell).
// Impassable / missing cells are encoded as -1 and skipped.
// ---------------------------------------------------------------------------

// Dial's Algorithm with circular buckets. C = max edge weight (integer); the
// bucket count is C+1. Because every edge weight w satisfies 1 <= w <= C, a
// relaxed neighbor at distance du+w always lands in a bucket strictly ahead of
// du in the circular order, so lazy deletion (stale duplicates skipped via
// `visited`) is correct. Termination is tracked by nodeCount.
function computeDijkstraDial(targetIdx, frictionArr, graph) {
  const { V, adjOffsets, adjNeighbors } = graph;

  let C = 1;
  for (let i = 0; i < V; i++) {
    const f = frictionArr[i];
    if (f > C) C = f;
  }
  const B = C + 1;
  const buckets = new Array(B);
  for (let i = 0; i < B; i++) buckets[i] = [];

  const dist = new Int32Array(V).fill(INF_INT);
  const visited = new Uint8Array(V);
  dist[targetIdx] = 0;
  buckets[0].push(targetIdx);
  let nodeCount = 1;
  let d = 0;

  while (nodeCount > 0) {
    let guard = 0;
    while (buckets[d % B].length === 0) {
      d++;
      if (++guard > B) break; // no nodes left (nodeCount should be 0)
    }
    if (buckets[d % B].length === 0) break;

    const bucket = buckets[d % B];
    const u = bucket.pop();
    nodeCount--;
    if (visited[u]) continue;
    visited[u] = 1;

    const du = dist[u];
    const start = adjOffsets[u];
    const end = adjOffsets[u + 1];
    for (let e = start; e < end; e++) {
      const v = adjNeighbors[e];
      if (visited[v]) continue;
      const w = frictionArr[v];
      if (w < 0) continue; // impassable / missing
      const nd = du + w;
      if (nd < dist[v]) {
        dist[v] = nd;
        buckets[nd % B].push(v);
        nodeCount++;
      }
    }
  }
  return dist;
}

function computeDijkstraHeap(targetIdx, frictionArr, graph, arity) {
  const { V, adjOffsets, adjNeighbors } = graph;
  const dist = new Float64Array(V).fill(Infinity);
  const visited = new Uint8Array(V);
  const heap = new DaryHeap(arity);
  dist[targetIdx] = 0;
  heap.insert(targetIdx, 0);

  while (heap.size > 0) {
    const u = heap.extractMin();
    if (visited[u]) continue;
    visited[u] = 1;

    const du = dist[u];
    const start = adjOffsets[u];
    const end = adjOffsets[u + 1];
    for (let e = start; e < end; e++) {
      const v = adjNeighbors[e];
      if (visited[v]) continue;
      const w = frictionArr[v];
      if (w < 0) continue; // impassable / missing
      const nd = du + w;
      if (nd < dist[v]) {
        dist[v] = nd;
        heap.insert(v, nd);
      }
    }
  }
  return dist;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Core Dijkstra gradient computation.
 *
 * @param {string} targetCell - The H3 cell ID to compute distances from.
 * @param {Object|Function} frictionLookup - Plain object (cell->friction) or
 *   function (cell)->friction. Used to build the per-cell weight array.
 * @param {Function} [getNeighbors] - Optional neighbor resolver (legacy path).
 * @param {Object} [graph] - Optional precomputed gradient graph from
 *   getGradientGraph(). When provided, the indexed (CSR + typed-array) path is
 *   used, which is dramatically faster and reuses mapping-stage neighbor data.
 * @returns {Object} Plain object mapping reachable cell IDs to distance.
 */
export function computeDijkstra(targetCell, frictionLookup, getNeighbors, graph) {
  if (!graph) return computeDijkstraLegacy(targetCell, frictionLookup, getNeighbors);

  const targetIdx = graph.cellToIdx[targetCell];
  if (targetIdx === undefined) {
    // Target outside the graph's cell set — fall back to the legacy path.
    return computeDijkstraLegacy(targetCell, frictionLookup, getNeighbors);
  }

  const { V, frictionArr, frictionMaxC } = graph;
  // `frictionArr` / `frictionMaxC` are precomputed once per graph (see
  // getGradientGraph) and reused across every target — no per-target V-pass.
  const C = frictionMaxC;

  // Decide the queue. Dial's is only worthwhile when the max weight is small;
  // worn friction can reach IMPASSABLE, which would make its bucket count C huge.
  const useDial = GRADIENT_ALGO === 'dial' && C <= DIAL_MAX_C;

  let dist;
  if (useDial) {
    // Quantize once per graph and cache it (depends only on frictionArr + scale).
    let q = graph.frictionQuantized;
    if (!q) {
      q = new Int32Array(V);
      for (let i = 0; i < V; i++)
        q[i] = frictionArr[i] < 0 ? -1 : Math.round(frictionArr[i] * GRADIENT_DIAL_SCALE);
      graph.frictionQuantized = q;
    }
    dist = computeDijkstraDial(targetIdx, q, graph);
  } else {
    const arity = GRADIENT_ALGO === 'binary' ? 2 : 4;
    dist = computeDijkstraHeap(targetIdx, frictionArr, graph, arity);
  }

  // M1: store the gradient as a single `Float32Array(V)` indexed by the graph's
  // `cellToIdx` (Infinity = unreachable). This replaces the old
  // `destCell → { cellId: distance }` string-keyed object — D×V string entries
  // (gigabytes at city scale) become D×V×4 bytes, and every hot-path lookup
  // (`gradient[cell]`) becomes an O(1) typed-array read via `gradientGet`.
  const out = new Float32Array(V).fill(Infinity);
  for (let i = 0; i < V; i++) {
    const dv = dist[i];
    if (useDial) {
      if (dv !== INF_INT) out[i] = dv / GRADIENT_DIAL_SCALE;
    } else if (dv !== Infinity) {
      out[i] = dv;
    }
  }
  return out;
}

/**
 * Count how many cells a gradient reaches (finite distance). Works for both the
 * M1 `Float32Array(V)` form and the legacy plain-object form, so the
 * "destination is walled off" check (`reachable <= 1`) is representation-agnostic.
 */
export function gradientReachableCount(grad) {
  if (!grad) return 0;
  if (ArrayBuffer.isView(grad)) {
    let n = 0;
    for (let i = 0; i < grad.length; i++) if (isFinite(grad[i])) n++;
    return n;
  }
  let n = 0;
  for (const k in grad) if (typeof grad[k] === 'number') n++;
  return n;
}

/**
 * Read a gradient value for `cell` in a representation-agnostic way.
 *
 * A gradient is either:
 *  - a `Float32Array(V)` indexed by `graph.cellToIdx` (M1 typed-array form), or
 *  - a legacy plain object `{ cellId: distance }`.
 *
 * Returns the distance (number) or `Infinity` when the cell is unreachable /
 * absent. Centralizing the read here lets every consumer (main thread and the
 * agent worker) use the same indexing without caring which shape it got.
 *
 * @param {Float32Array|Object} grad
 * @param {string} cell
 * @param {Object} [graph] gradient graph (must be the SAME graph used to build `grad`)
 */
export function gradientGet(grad, cell, graph) {
  if (ArrayBuffer.isView(grad)) {
    const idx = graph ? graph.cellToIdx[cell] : undefined;
    if (idx === undefined) return Infinity;
    const v = grad[idx];
    return v === undefined ? Infinity : v;
  }
  const v = grad ? grad[cell] : undefined;
  return typeof v === 'number' ? v : Infinity;
}

/**
 * Legacy string-keyed Dijkstra (binary MinHeap, on-the-fly neighbor lookup).
 * Kept for backward compatibility and as the exact fallback when no graph is
 * supplied.
 */
export function computeDijkstraLegacy(targetCell, frictionLookup, getNeighbors) {
  const distances = Object.create(null);
  const visited = Object.create(null);
  const heap = new MinHeap();

  const resolveFriction =
    typeof frictionLookup === 'function' ? frictionLookup : (cell) => frictionLookup[cell];
  const resolveNeighbors =
    typeof getNeighbors === 'function' ? getNeighbors : (cell) => gridDisk(cell, 1);

  distances[targetCell] = 0;
  heap.insert(targetCell, 0);

  while (heap.size() > 0) {
    const current = heap.extractMin();
    if (visited[current]) continue;
    visited[current] = true;

    const currentDistance = distances[current];
    const neighbors = resolveNeighbors(current);

    for (let i = 0; i < neighbors.length; i++) {
      const neighbor = neighbors[i];
      if (neighbor === current) continue;

      const friction = resolveFriction(neighbor);
      if (typeof friction !== 'number' || friction >= FRICTION_COSTS.IMPASSABLE) continue;

      const nextDistance = currentDistance + friction;
      if (!Object.hasOwn(distances, neighbor) || nextDistance < distances[neighbor]) {
        distances[neighbor] = nextDistance;
        heap.insert(neighbor, nextDistance);
      }
    }
  }

  return distances;
}
