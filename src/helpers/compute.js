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

  const goalGradients = new Map();
  destinations.forEach((d) => goalGradients.set(d, computeDijkstraGradient.call(this, d)));

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
      if (!grad.has(originCell)) continue; // unreachable
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
      if (!destGradient || !destGradient.has(originCell)) continue;

      for (let sim = 0; sim < count; sim++) {
        const simAgentId = `${originCell}:${destCell}:${sim}`;
        let simCurrent = originCell;
        const simTarget = destCell;
        const simGradient = destGradient;
        let simDirection = getBearing(simCurrent, simTarget);
        let simPath = [];

        for (let tick = 0; tick < ticks; tick++) {
          let nextStep = getBestNextStep.call(this, simCurrent, simGradient, simDirection, simAgentId);
          if (!nextStep || nextStep === simCurrent) break;

          const line = gridPathCells(simCurrent, nextStep);
          let hitTarget = false;
          for (let i = 1; i < line.length; i++) {
            const stepCell = line[i];
            if (!this.cellFrictionMap.has(stepCell)) break;
            if (this.cellFrictionMap.get(stepCell) >= FRICTION_COSTS.IMPASSABLE) break;
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
    this.pathDesireScores.set(cell, (this.pathDesireScores.get(cell) || 0) + v);
  }
  for (let [cell, v] of affordanceDeltas) {
    updateAffordance.call(this, cell, v);
  }

  for (let cell of this.affordanceMap.keys()) {
    decayAffordance.call(this, cell);
  }

  this.updateLayers();
}

/**
 * Tactical Decision: BDI (Belief-Desire-Intention)(Section 3.3/2.4)
 */
function getBestNextStep(curr, gradient, currentDirection, agentId = '') {
  // 1. Tactical BDI Logic
  let candidates_soft = gridDisk(curr, VISUAL_DEPTH).filter((n) =>
    n !== curr &&
    this.cellFrictionMap.has(n) &&
    this.cellFrictionMap.get(n) < FRICTION_COSTS.IMPASSABLE &&
    isVisible.call(this, curr, n)
  );
  let candidates_hard = candidates_soft.filter((n) => angleDiff(getBearing(curr, n), currentDirection) <= VISUAL_ANGLE / 2);
  const candidates = candidates_hard.length > 0 ? candidates_hard : candidates_soft;

  const candidateRecords = [];
  const __debugCandidates = [];

  for (let n of candidates) {
    // Skip candidates not in the gradient (unreachable towards goal)
    if (!gradient || !gradient.has(n) || !gradient.has(curr)) continue;
    const gN = gradient.get(n);
    const gCurr = gradient.get(curr);
    if (typeof gN !== 'number' || typeof gCurr !== 'number') continue;

    const aff = this.affordanceMap.get(n) ?? 0.1;
    const stepCost = this.cellFrictionMap.get(n) || 0;

    // Compute delta and score as per paper
    const delta = (stepCost + gN) - gCurr;
    let S_ij = WEIGHTS.w_a * aff - WEIGHTS.w_d * delta;

    const ang = angleDiff(getBearing(curr, n), currentDirection);
    S_ij -= (WEIGHTS.w_theta || 0) * (ang / 180);

    candidateRecords.push({ cell: n, S_ij, aff, gN, gCurr, stepCost, delta, ang });

    if (this.debugCompute) __debugCandidates.push({ cell: n, S_ij, aff, gN, gCurr, stepCost, delta, ang });
  }

  if (this.debugCompute) {
    try {
      const sorted = __debugCandidates.slice().sort((a, b) => b.S_ij - a.S_ij).slice(0, 12);
      console.log('getBestNextStep: candidates', { curr, topCandidates: sorted });
    } catch (e) {}
  }

  if (candidateRecords.length === 0) {
    // fallback to gradient tunneling (as before)
    for (let depth = 1; depth <= 3; depth++) {
      let neighbors = gridDisk(curr, depth);
      let bestGrad = Infinity;
      let bestCandidate = null;

      for (let n of neighbors) {
        if (n === curr || !this.cellFrictionMap.has(n)) continue;
        if (this.cellFrictionMap.get(n) >= FRICTION_COSTS.IMPASSABLE) continue;

        let g = gradient.get(n) ?? Infinity;
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
    // Helpers: deterministic hash -> LCG RNG
    const strHash = (s) => {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h >>> 0;
    };
    const lcg = (seed) => {
      let s = seed >>> 0;
      return () => {
        s = (Math.imul(1664525, s) + 1013904223) >>> 0;
        return s / 4294967296;
      };
    };

    const seed = strHash(`${agentId}:${curr}`);
    const rng = lcg(seed);

    const maxS = Math.max(...candidateRecords.map((c) => c.S_ij));
    const weights = candidateRecords.map((c) => Math.exp((c.S_ij - maxS) / TEMPERATURE));
    const sum = weights.reduce((a, b) => a + b, 0);
    const r = rng() * sum;
    let acc = 0;
    let chosenIndex = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (r <= acc) {
        chosenIndex = i;
        break;
      }
    }
    const chosen = candidateRecords[chosenIndex].cell;
    if (this.debugCompute) {
      try {
        console.log('getBestNextStep: sampled', { curr, chosen, chosenScore: candidateRecords[chosenIndex].S_ij });
      } catch (e) {}
    }
    return chosen;
  }

  // Deterministic fallback: choose best using previous tie-breaker logic
  let bestScore = -Infinity;
  let bestField = null;
  for (let rec of candidateRecords) {
    const S_ij = rec.S_ij;
    const n = rec.cell;
    if (S_ij > bestScore) {
      bestScore = S_ij;
      bestField = n;
    } else if (Math.abs(S_ij - bestScore) < 1e-9) {
      const currentBestCost = (this.cellFrictionMap.get(bestField) || 0) + (gradient.get(bestField) || Infinity);
      const candidateCost = rec.stepCost + rec.gN;
      if (candidateCost < currentBestCost) {
        bestField = n;
      } else if (candidateCost === currentBestCost) {
        if (gridDistance(curr, n) < gridDistance(curr, bestField)) {
          bestField = n;
        }
      }
    }
  }

  if (this.debugCompute) {
    try {
      console.log('getBestNextStep: chosen', { curr, chosen: bestField, bestScore });
    } catch (e) {}
  }

  return bestField;
}

/**
 * Optimized Dijkstra Gradient (Production-Ready)
 */
function computeDijkstraGradient(targetCell) {
  // Dijkstra using friction as traversal cost
  const distances = new Map();
  const visited = new Set();

  const heap = new MinHeap();
  distances.set(targetCell, 0);
  heap.insert(targetCell, 0);

  while (heap.size() > 0) {
    const current = heap.extractMin();
    if (visited.has(current)) continue;
    visited.add(current);

    const d = distances.get(current);
    const neighbors = gridDisk(current, 1).filter((n) => n !== current);

    for (let n of neighbors) {
      if (!this.cellFrictionMap.has(n)) continue;
      const friction = this.cellFrictionMap.get(n);
      if (friction >= FRICTION_COSTS.IMPASSABLE) continue;

      const alt = d + friction;
      if (!distances.has(n) || alt < distances.get(n)) {
        distances.set(n, alt);
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
  const path = gridPathCells(start, end);
  for (let c of path) {
    // Treat unknown cells as impassable (outside AOI)
    if (!this.cellFrictionMap.has(c)) return false;
    if (this.cellFrictionMap.get(c) >= FRICTION_COSTS.IMPASSABLE) return false;
  }
  return true;
  // const path = gridPathCells(start, end);
  // // Count how many cells in the line are impassable
  // const blockedCount = path.filter(
  //   (c) => this.cellFrictionMap.get(c) >= FRICTION_COSTS.IMPASSABLE
  // ).length;
  // // Allow for small corner-cutting (e.g., 1 cell of thickness)
  // return blockedCount <= 1;
}

function getBearing(start, end) {
  const s = cellToLatLng(start);
  const e = cellToLatLng(end);
  // cellToLatLng returns [lat, lng] in degrees; convert to radians for trig
  const lat1 = (s[0] * Math.PI) / 180;
  const lon1 = (s[1] * Math.PI) / 180;
  const lat2 = (e[0] * Math.PI) / 180;
  const lon2 = (e[1] * Math.PI) / 180;
  let y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  let x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
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
  const friction = this.cellFrictionMap.get(cell);

  // Skip update for permanent infrastructuret
  if (friction === FRICTION_COSTS.PAVEMENT || friction === FRICTION_COSTS.IMPASSABLE) return;

  // Define resistance factors: Higher value = more resistance (slower path formation)
  const resistanceFactor = friction === FRICTION_COSTS.HEAVY_GRASS ? 1.5 : 0.8;

  let current = this.affordanceMap.get(cell) || 0.1;

  // Adjust wear calculation: resistanceFactor divides the impact
  let wear = (volume * UPDATE_RATE) / (MAX_EXPECTED_VOLUME * resistanceFactor);

  this.affordanceMap.set(cell, Math.min(SOFT_CAP, current + wear));
}

/**
 * Terrain-Aware Decay
 * HEAVY_GRASS recovers slower (more persistent path)
 * LIGHT_PARK recovers faster (path fades quickly)
 */
function decayAffordance(cell) {
  const friction = this.cellFrictionMap.get(cell);

  // Only decay if it's NOT a permanent sidewalk/pavement
  if (friction !== FRICTION_COSTS.PAVEMENT && friction !== FRICTION_COSTS.IMPASSABLE) {
    // Define recovery factors: Higher value = faster regrowth (faster decay of path)
    const recoveryFactor = friction === FRICTION_COSTS.HEAVY_GRASS ? 0.5 : 1.5;

    let current = this.affordanceMap.get(cell) || 0.1;
    let actualDecay = DECAY_RATE * recoveryFactor;

    this.affordanceMap.set(cell, Math.max(0.1, current - actualDecay));
  }
}

function getNearestDest(agentCell, dests, gradients, agentId = '') {
  // Build candidate list excluding the agent's own cell (prevents 'both' nodes returning themselves)
  const candidates = [];
  for (let d of dests) {
    if (d === agentCell) continue;
    const grad = gradients.get(d);
    if (!grad) continue;
    const dist = grad.get(agentCell);
    const dVal = typeof dist === 'number' ? dist : Infinity;
    if (!isFinite(dVal)) continue;
    candidates.push({ dest: d, dist: dVal });
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].dest;

  // Use inverse-distance weighting to distribute agents across multiple destinations.
  // Deterministic per-agent via seeded LCG using agentId + agentCell.
  const strHash = (s) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  };
  const lcg = (seed) => {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };

  const seed = strHash(`${agentId}:${agentCell}`);
  const rng = lcg(seed);

  const scores = candidates.map((c) => 1 / (1 + c.dist));
  const sum = scores.reduce((a, b) => a + b, 0);
  const weights = scores.map((s) => s / sum);

  const r = rng();
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (r <= acc) return candidates[i].dest;
  }

  // Fallback
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
    } else if (friction < midPL) {
      this.affordanceMap.set(cell, AFFORDANCE.PAVEMENT);
    } else if (friction < midLH) {
      this.affordanceMap.set(cell, AFFORDANCE.LIGHT_PARK);
    } else {
      this.affordanceMap.set(cell, AFFORDANCE.HEAVY_GRASS);
    }
  }
}

// Expose some internals for debugging and testing
export { getBestNextStep as _getBestNextStep, computeDijkstraGradient as _computeDijkstraGradient, getBearing as _getBearing, angleDiff as _angleDiff, isVisible as _isVisible };
