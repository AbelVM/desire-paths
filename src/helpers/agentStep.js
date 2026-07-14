import { gridDistance } from 'h3-js';
import { getGraphNeighborIndicesR1 } from './dijkstra.js';
import { angleDiff } from './bearing.js';

// Shared agent-decision helpers used by both the main-thread kernel
// (compute.js) and the worker kernel (agentTasks.js) so the two parallel
// implementations of `getBestNextStep` cannot drift apart.

// Obstacle-corner check. Returns true if stepping diagonally from cell `a` to
// cell `b` (gridDistance 2) would cut across an impassable cell at their shared
// corner. Two diagonal H3 cells share exactly one common neighbor; if that
// neighbor is impassable the agent must walk around the corner rather than
// cutting across it. `getDisk(center, r)` is a stable cache accessor and
// `frictionLookup` is the friction source, so this stays agnostic to each
// kernel's cache home.
export function cornersImpassable({ a, b, frictionLookup, getDisk, impassableVal }) {
  const neighborsA = getDisk(a, 1);
  const neighborsB = getDisk(b, 1);
  const neighborsBSet = new Set(neighborsB);
  for (let i = 0; i < neighborsA.length; i++) {
    const c = neighborsA[i];
    if (c === a || c === b) continue;
    if (!neighborsBSet.has(c)) continue;
    const f = frictionLookup[c];
    if (typeof f !== 'undefined' && f >= impassableVal) return true;
  }
  return false;
}

// Resolve the actual cell-by-cell line the agent walks from `curr` to
// `nextStep`. Returns the straight H3 line when it is clear of impassable cells
// and does not cut a building corner. Otherwise performs a bounded BFS detour
// over the local neighborhood so the agent walks *around* the obstacle instead
// of jumping over it or stalling against the building. The r=1 BFS expansion
// reuses the canonical gradient graph's adjacency (CSR indices) when `graph` is
// supplied, else falls back to `getDisk(node, 1)`.
export function resolveStepLine({
  curr,
  nextStep,
  frictionLookup,
  getPathCells,
  getDisk,
  graph,
  impassableVal,
}) {
  const straight = getPathCells(curr, nextStep);
  let clear = true;
  for (let i = 1; i < straight.length; i++) {
    const c = straight[i];
    const f = frictionLookup[c];
    if (typeof f === 'undefined' || f >= impassableVal) {
      clear = false;
      break;
    }
    // Detect a diagonal transition that would cut an impassable corner.
    if (i > 1 && gridDistance(straight[i - 1], c) > 1) {
      if (
        cornersImpassable({
          a: straight[i - 1],
          b: c,
          frictionLookup,
          getDisk,
          impassableVal,
        })
      ) {
        clear = false;
        break;
      }
    }
  }
  if (clear) return straight;

  // BFS detour within the local neighborhood.
  const prev = Object.create(null);
  const seen = Object.create(null);
  const queue = [curr];
  seen[curr] = true;
  let found = false;
  const idxToCell = graph ? graph.idxToCell : null;
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === nextStep) {
      found = true;
      break;
    }
    const nbrIdxs = graph ? getGraphNeighborIndicesR1(graph, node) : null;
    const disk = nbrIdxs ? null : getDisk(node, 1);
    const count = nbrIdxs ? nbrIdxs.length : disk.length;
    for (let i = 0; i < count; i++) {
      const m = nbrIdxs ? idxToCell[nbrIdxs[i]] : disk[i];
      if (m === node || seen[m]) continue;
      const mf = frictionLookup[m];
      if (typeof mf === 'undefined' || mf >= impassableVal) continue;
      seen[m] = true;
      prev[m] = node;
      queue.push(m);
    }
  }
  if (!found) return [curr]; // no detour found; agent stays in place

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

// 1b) Index-space candidate gather (S1).
// Consumes the visibility CSR directly instead of `gridDisk(curr, visionDepth)`
// + the `isVisible` binary-search + the per-candidate bearing trig /
// `cellToLatLng` cache. The CSR neighbor slice for `curr` is EXACTLY the
// post-`isVisible`-filter candidate set the string kernel produces in
// production (the worker's `isVisible` already resolves to the CSR
// BFS-reachability Proxy, not the straight-line fallback), so the two
// kernels enumerate the same cells — only the enumeration order differs,
// which does not affect the max-score selection except on exact score
// ties. Every read below is a typed-array access indexed by the
// precomputed `viewIdxToGraphIdx` map, so the hot path does zero
// string→index lookups, zero H3 calls, and zero trig.
//
// `visOffsets/visNeighbors/bearings` are viewHexes-indexed (the same
// indexing the mapping graph uses). `viewIdxToGraphIdx[vIdx]` maps a
// viewHexes index to the gradient-graph index (or -1 for impassable /
// missing), so `frictionArr` / `affordanceArr` / `gradientObj` (all
// graph-indexed) are read with a single integer subscript.
export function gatherCandidatesIndexed({
  currVIdx,
  visOffsets,
  visNeighbors,
  bearings,
  viewHexes,
  viewIdxToGraphIdx,
  frictionArr,
  affordanceArr,
  gradientObj,
  useGradient,
  cellsArr,
  anglesArr,
  affsArr,
  frictionArrOut,
  gNsArr,
  currentDirection,
  // `footprints` (Uint32Array(V), graph-indexed) is the shared ABM wear
  // accumulator. We capture each candidate's CURRENT footprint count into the
  // parallel `fpArr` here — the graph index `gIdx` is already in hand, so this
  // is a single typed-array read (no cell-string hash in the scorer). Footprints
  // are constant across one getBestNextStep call (they only change after a path
  // completes), so capturing at gather time is exact.
  footprints,
  fpArr,
}) {
  let count = 0;
  const s = visOffsets[currVIdx];
  const e = visOffsets[currVIdx + 1];
  for (let x = s; x < e; x++) {
    const vIdx = visNeighbors[x];
    const gIdx = viewIdxToGraphIdx[vIdx];
    if (gIdx < 0) continue; // impassable / missing
    const f = frictionArr[gIdx];
    if (f < 0) continue; // impassable (redundant w/ gIdx<0, safe)
    const aff = affordanceArr[gIdx];
    if (useGradient) {
      const gN = gradientObj ? gradientObj[gIdx] : undefined;
      if (typeof gN !== 'number') continue;
      cellsArr[count] = viewHexes[vIdx];
      anglesArr[count] = angleDiff(bearings[x], currentDirection);
      affsArr[count] = aff;
      frictionArrOut[count] = f;
      gNsArr[count] = gN;
    } else {
      cellsArr[count] = viewHexes[vIdx];
      anglesArr[count] = angleDiff(bearings[x], currentDirection);
      affsArr[count] = aff;
      frictionArrOut[count] = f;
    }
    if (fpArr) fpArr[count] = footprints ? footprints[gIdx] : 0;
    count++;
  }
  return count;
}
// Walks `disk`, dropping impassable / non-visible cells, computing each
// survivor's angular offset from the current heading, and appending to the
// parallel candidate arrays. Returns the number of candidates gathered.
export function gatherCandidates({
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
  // Footprint accessor + parallel output (see gatherCandidatesIndexed). In the
  // string kernel we don't have the graph index in hand, so `getFootprint(cell)`
  // resolves it (typed-array read via graph.cellToIdx, or plain-object read when
  // no graph). Captured here so the scorer reads `fpArr[i]` with no cell hash.
  getFootprint,
  fpArr,
}) {
  let count = 0;
  const diskLen = disk.length;
  for (let i = 0; i < diskLen; i++) {
    const n = disk[i];
    if (n === curr) continue;
    const f = getFriction(n);
    if (f === undefined || f >= impassableVal) continue;
    if (!isVisible(curr, n)) continue;
    const ang = computeAngle(n, sLatLng, currentDirection, curr);
    const aff = getAffordance(n);
    if (useGradient) {
      const gN = gradientLookup(n);
      if (typeof gN !== 'number') continue;
      cellsArr[count] = n;
      anglesArr[count] = ang;
      affsArr[count] = aff;
      frictionArr[count] = f;
      gNsArr[count] = gN;
    } else {
      cellsArr[count] = n;
      anglesArr[count] = ang;
      affsArr[count] = aff;
      frictionArr[count] = f;
    }
    if (fpArr) fpArr[count] = getFootprint ? getFootprint(n) : 0;
    count++;
  }
  return count;
}

// 2) Visibility-cone partition.
// Reorders the first `cLen` candidates so those within the visibility cone
// (angle <= visualAngleHalf) come first. Returns the in-cone count.
export function partitionVisibleCone({
  cellsArr,
  anglesArr,
  affsArr,
  frictionArr,
  gNsArr,
  fpArr,
  useGradient,
  cLen,
  visualAngleHalf,
}) {
  let hardCount = 0;
  for (let i = 0; i < cLen; i++) {
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
        if (fpArr) swap(fpArr);
      }
      hardCount++;
    }
  }
  return hardCount;
}

// 3) Scoring.
// Fills `scores` with the weighted S_ij for each of the first `cLen`
// candidates (gradient mode only).
export function scoreCandidates({
  cLen,
  gNsArr,
  affsArr,
  frictionArr,
  anglesArr,
  weights,
  gCurr,
  fpArr,
  scores,
}) {
  for (let i = 0; i < cLen; i++) {
    const gN = gNsArr[i];
    let aff = affsArr[i];
    const stepCost = frictionArr[i] || 0;

    // True ABM: boost effective affordance by accumulated footprints.
    // Cells that more agents have traversed become easier to enter,
    // creating positive feedback that produces emergent path formation.
    // `fpArr[i]` is the candidate's footprint count captured at gather time
    // (typed-array read, no cell-string hash).
    if (fpArr) {
      aff += Math.log1p(fpArr[i] || 0) * 0.05;
    }

    const delta = stepCost + gN - gCurr;
    let S_ij = weights.w_a * aff - weights.w_d * delta;
    S_ij -= (weights.w_theta || 0) * (anglesArr[i] / 180);
    scores[i] = S_ij;
  }
}

// 4) Tiebreak + selection.
// Returns the best candidate index given the scored (or affordance-only)
// candidate arrays. Applies the cost/distance tiebreak when scores tie.
export function selectBestCandidate({
  cLen,
  scores,
  affsArr,
  frictionArr,
  gNsArr,
  useGradient,
  fpArr,
  cellsArr,
  curr,
}) {
  let bestScore = -Infinity;
  let bestIndex = -1;
  for (let i = 0; i < cLen; i++) {
    const S_ij = scores?.[i];
    const isScoreValid = typeof S_ij === 'number';
    if (isScoreValid) {
      if (S_ij > bestScore) {
        bestScore = S_ij;
        bestIndex = i;
      } else if (S_ij === bestScore && bestIndex >= 0 && cellsArr[i] < cellsArr[bestIndex]) {
        // Deterministic, enumeration-order-independent tie-break: on an EXACT
        // score tie prefer the lexicographically smaller cell id. Both kernels
        // compute the same S_ij for the same candidate (same aff/gN/delta/angle
        // read from the same graph + CSR), so this makes the string kernel
        // (gridDisk enumeration order) and the index kernel (CSR-neighbor
        // enumeration order) select the SAME candidate regardless of order —
        // the byte-parity requirement for S1. It only affects exact ties, which
        // the pre-S1 string kernel resolved arbitrarily by gridDisk order.
        bestIndex = i;
      }
    } else {
      // No gradient: fall back to affordance, boosted by accumulated footprints.
      let effAff = affsArr[i];
      if (fpArr) {
        effAff += Math.log1p(fpArr[i] || 0) * 0.05;
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
          } else if (dCandidate === dBest && cellsArr[i] < cellsArr[bestIndex]) {
            // Final enumeration-order-independent tie-break by cell id so the
            // two kernels agree even when cost AND distance also tie.
            bestIndex = i;
          }
        }
      }
    }
  }
  return bestIndex;
}
