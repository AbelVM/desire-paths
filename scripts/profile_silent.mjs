import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const h3 = require('h3-js');
const { latLngToCell, gridDisk } = h3;
import { computeDesirePaths, initializeAffordanceMap, getComputeCacheStats } from '../src/helpers/compute.js';
import { FRICTION_COSTS } from '../src/helpers/constants.js';

(async () => {
  const res = 9;
  const center = latLngToCell(40.4169, -3.7035, res);
  const disk = gridDisk(center, 4);

  const cellFrictionMap = new Map();
  for (const c of disk) {
    cellFrictionMap.set(c, FRICTION_COSTS.LIGHT_PARK);
  }
  // Sprinkle some impassable cells to exercise pathfinding
  for (let i = 0; i < disk.length; i += 5) {
    cellFrictionMap.set(disk[i], FRICTION_COSTS.IMPASSABLE);
  }

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
    updateLayers: () => {},
    debugCompute: false,
  };

  initializeAffordanceMap.call(sim);

  const ITER = 200;
  for (let i = 0; i < ITER; i++) {
    await computeDesirePaths.call(sim);
    // keep maps bounded between iterations
    sim.pathDesireScores.clear();
  }
  // Emit cache instrumentation for tuning
  try {
    const stats = getComputeCacheStats(sim);
    // Avoid printing during `--prof` runs to reduce profiler I/O noise
    const profiling = Array.isArray(process.execArgv) && process.execArgv.some((a) => a && a.includes('--prof'));
    if (!profiling) console.log('CACHE_STATS:' + JSON.stringify(stats));
  } catch (e) {}
})();
