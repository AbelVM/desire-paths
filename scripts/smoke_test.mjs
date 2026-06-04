import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const h3 = require('h3-js');
console.log('h3 keys:', Object.keys(h3).slice(0,50));
const { latLngToCell, gridDisk, cellToLatLng } = h3;
import { computeDesirePaths, initializeAffordanceMap, _computeDijkstraGradient, _getBestNextStep, _getBearing, _isVisible } from '../src/helpers/compute.js';
import { FRICTION_COSTS, VISUAL_DEPTH, VISUAL_ANGLE, WEIGHTS } from '../src/helpers/constants.js';

(async () => {
  const res = 9;
  const center = latLngToCell(40.4169, -3.7035, res);
  const disk = gridDisk(center, 3);
  console.log('center', center, 'cells', disk.length);

  const cellFrictionMap = new Map();
  for (const c of disk) {
    cellFrictionMap.set(c, FRICTION_COSTS.LIGHT_PARK);
  }

  // Add a simple obstacle
  const obstacle = disk[Math.floor(disk.length / 2)];
  cellFrictionMap.set(obstacle, FRICTION_COSTS.IMPASSABLE);

  const origin = disk[1];
  const dest = disk[disk.length - 2];

  const simulationNodes = {};
  simulationNodes[origin] = { type: 'origin', weight: 1 };
  simulationNodes[dest] = { type: 'destination', weight: 1 };

  const sim = {
    simulationNodes,
    cellFrictionMap,
    affordanceMap: new Map(),
    pathDesireScores: new Map(),
    updateLayers: () => {
      // noop for test
    },
  };

  initializeAffordanceMap.call(sim);
  console.log('Initial affordance sample:', Array.from(sim.affordanceMap.entries()).slice(0, 5));

  // Compute gradient and simulate a small manual run to trace decisions
  const gradient = _computeDijkstraGradient.call(sim, dest);
  const gradGet = (g, k) => (typeof g.get === 'function' ? g.get(k) : g[k]);
  console.log('Gradient distance origin:', gradGet(gradient, origin));

  let current = origin;
  let direction = _getBearing(current, dest);

  function computeCandidateScores(curr, grad, dir) {
    const candidates_soft = gridDisk(curr, VISUAL_DEPTH).filter(n =>
      n !== curr && sim.cellFrictionMap.has(n) && sim.cellFrictionMap.get(n) < FRICTION_COSTS.IMPASSABLE && _isVisible.call(sim, curr, n)
    );
    const candidates_hard = candidates_soft.filter(n => Math.abs((((_getBearing(curr, n) - dir + 540) % 360) - 180)) <= VISUAL_ANGLE / 2);
    const candidates = candidates_hard.length > 0 ? candidates_hard : candidates_soft;

    const scores = [];
    for (let n of candidates) {
      const aff = sim.affordanceMap.get(n) ?? 0.1;
      const gN = gradGet(grad, n);
      const gCurr = gradGet(grad, curr);
      const friction = sim.cellFrictionMap.get(n);
      const S_ij = WEIGHTS.w_a * aff - WEIGHTS.w_f * (friction || 0) - WEIGHTS.w_d * (gN - gCurr);
      scores.push({ n, S_ij, aff, gN, gCurr, friction });
    }
    scores.sort((a,b) => b.S_ij - a.S_ij);
    return scores;
  }

  console.log('\nTracing decision steps:');
  for (let step = 0; step < 10; step++) {
    const scores = computeCandidateScores(current, gradient, direction);
    console.log('\nStep', step, 'current:', current, 'coords:', cellToLatLng(current));
    if (scores.length === 0) {
      console.log(' No visible candidates');
      break;
    }
    console.log(' Top candidates:');
    for (let i = 0; i < Math.min(5, scores.length); i++) {
      const s = scores[i];
      console.log(`  ${i+1}) ${s.n} S=${s.S_ij.toFixed(3)} aff=${s.aff.toFixed(3)} gN=${String(s.gN)} gCurr=${String(s.gCurr)} fr=${s.friction}`);
    }
    const chosen = scores[0].n;
    console.log(' Chosen ->', chosen, 'bearing->', _getBearing(current, chosen));
    direction = _getBearing(current, chosen);
    current = chosen;
    if (current === dest) { console.log('Reached destination'); break; }
  }

  // Now run full algorithm and show resulting maps
  await computeDesirePaths.call(sim);

  console.log('\nPath Desire Scores:');
  for (const [cell, score] of sim.pathDesireScores.entries()) {
    console.log(cell, score.toFixed(3), cellToLatLng(cell));
  }

  console.log('\nAffordance (worn) cells:');
  for (const [cell, aff] of sim.affordanceMap.entries()) {
    if (aff > 0.1001) console.log(cell, aff.toFixed(3), cellToLatLng(cell));
  }
})();
