import { gridDistance } from 'h3-js';

// Shared agent-decision helpers used by both the main-thread kernel
// (compute.js) and the worker kernel (agentTasks.js) so the two parallel
// implementations of `getBestNextStep` cannot drift apart.

// 1) Visibility filter + candidate gather.
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
}) {
  let count = 0;
  const diskLen = disk.length;
  for (let i = 0; i < diskLen; i++) {
    const n = disk[i];
    if (n === curr) continue;
    const f = getFriction(n);
    if (f === undefined || f >= impassableVal) continue;
    if (!isVisible(curr, n)) continue;
    const ang = computeAngle(n);
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
  cellsArr,
  weights,
  gCurr,
  accumulatedFootprints,
  scores,
}) {
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
  accumulatedFootprints,
  cellsArr,
  curr,
}) {
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
  return bestIndex;
}
