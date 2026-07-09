import { describe, it, expect } from 'vitest';
import { latLngToCell, gridDisk, cellToLatLng } from 'h3-js';
import {
  buildR1Adjacency,
  buildMappingGraph,
  mergeCellsChunk,
  collectFastScanEntries,
  computeImpassableBlurSnapshot,
  computeVisibilityBearingCSRIndexed,
} from '../src/helpers/spatialTasks.js';
import { runVisibilityBearingTask } from '../src/helpers/spatialWorker.js';
import { reconstructVisibilityBearing } from '../src/helpers/bearingIndex.js';
import {
  getGradientGraph,
  invalidateGradientGraph,
  computeDijkstra,
} from '../src/helpers/dijkstra.js';
import { FRICTION_COSTS, AFFORDANCE } from '../src/helpers/constants.js';

// A small AOI: a center cell plus its 6 ring-1 neighbors.
const center = latLngToCell(40.4169, -3.7035, 15);
const ring = gridDisk(center, 1);
const viewHexes = ring; // 7 cells

describe('buildR1Adjacency', () => {
  it('returns only {N, offsets, neighbors} — never idxOf (avoids cross-worker clone)', () => {
    const adj = buildR1Adjacency({ viewHexes });
    expect(adj.N).toBe(viewHexes.length);
    expect(adj.offsets).toBeInstanceOf(Int32Array);
    expect(adj.neighbors).toBeInstanceOf(Int32Array);
    expect(adj.idxOf).toBeUndefined();
    // offsets is length N+1 and prefix-summed
    expect(adj.offsets.length).toBe(viewHexes.length + 1);
    expect(adj.offsets[0]).toBe(0);
    expect(adj.offsets[viewHexes.length]).toBe(adj.neighbors.length);
  });

  it('encodes distance-1 adjacency within the AOI, excluding the center cell', () => {
    const adj = buildR1Adjacency({ viewHexes });
    const idxOf = Object.create(null);
    for (let i = 0; i < viewHexes.length; i++) idxOf[viewHexes[i]] = i;

    for (let i = 0; i < viewHexes.length; i++) {
      const cell = viewHexes[i];
      const s = adj.offsets[i];
      const e = adj.offsets[i + 1];
      const nbrs = [];
      for (let x = s; x < e; x++) nbrs.push(viewHexes[adj.neighbors[x]]);
      // Every neighbor must be a real ring-1 neighbor that is also in the AOI.
      const expected = gridDisk(cell, 1).filter((c) => c !== cell && idxOf[c] !== undefined);
      expect(nbrs.sort()).toEqual(expected.sort());
    }
  });
});

describe('getGradientGraph M3 r1Adjacency fast path', () => {
  const frictionEntries = Object.create(null);
  for (const c of viewHexes) frictionEntries[c] = FRICTION_COSTS.PAVEMENT;
  // Make one cell impassable so the passable-filtering paths must agree.
  frictionEntries[viewHexes[2]] = FRICTION_COSTS.IMPASSABLE;

  it('builds a graph byte-identical to the gridDisk path (same indices + CSR)', () => {
    // gridDisk path (no r1Adjacency).
    invalidateGradientGraph();
    const gDisk = getGradientGraph(frictionEntries);
    const snapDisk = {
      V: gDisk.V,
      idxToCell: gDisk.idxToCell.slice(),
      adjOffsets: Array.from(gDisk.adjOffsets),
      adjNeighbors: Array.from(gDisk.adjNeighbors),
      frictionArr: Array.from(gDisk.frictionArr),
    };

    // r1Adjacency fast path.
    invalidateGradientGraph();
    const r1 = buildR1Adjacency({ viewHexes });
    const gR1 = getGradientGraph(frictionEntries, r1, viewHexes);

    expect(gR1.V).toBe(snapDisk.V);
    expect(gR1.idxToCell).toEqual(snapDisk.idxToCell);
    expect(Array.from(gR1.adjOffsets)).toEqual(snapDisk.adjOffsets);
    expect(Array.from(gR1.frictionArr)).toEqual(snapDisk.frictionArr);
    // Neighbor *order* may differ (gridDisk vs gridRingUnsafe ordering), but the
    // per-cell neighbor SET must be identical — Dijkstra is order-independent.
    const nbrSets = (g) => {
      const sets = [];
      for (let i = 0; i < g.V; i++) {
        const s = g.adjOffsets[i];
        const e = g.adjOffsets[i + 1];
        const set = [];
        for (let x = s; x < e; x++) set.push(g.adjNeighbors[x]);
        sets.push(set.sort((a, b) => a - b));
      }
      return sets;
    };
    expect(nbrSets(gR1)).toEqual(nbrSets(gDisk));
  });

  it('produces identical Dijkstra gradients from both graph paths', () => {
    const target = viewHexes[0];
    invalidateGradientGraph();
    const gDisk = getGradientGraph(frictionEntries);
    const distDisk = computeDijkstra(target, frictionEntries, null, gDisk);

    invalidateGradientGraph();
    const r1 = buildR1Adjacency({ viewHexes });
    const gR1 = getGradientGraph(frictionEntries, r1, viewHexes);
    const distR1 = computeDijkstra(target, frictionEntries, null, gR1);

    expect(Array.from(distR1)).toEqual(Array.from(distDisk));
  });

  it('ignores the r1 path when N does not match viewHexes (falls back to gridDisk)', () => {
    invalidateGradientGraph();
    const gDisk = getGradientGraph(frictionEntries);
    const diskOffsets = Array.from(gDisk.adjOffsets);
    invalidateGradientGraph();
    // Mismatched N → useR1 is false → gridDisk path, still correct.
    const bogus = { N: 999, offsets: new Int32Array(2), neighbors: new Int32Array(0) };
    const g = getGradientGraph(frictionEntries, bogus, viewHexes);
    expect(Array.from(g.adjOffsets)).toEqual(diskOffsets);
  });
});

describe('buildMappingGraph', () => {
  it('filters impassable origins/neighbors and encodes friction as -1 for impassable', () => {
    const frictionEntries = Object.create(null);
    for (const c of viewHexes) frictionEntries[c] = FRICTION_COSTS.PAVEMENT;
    // Make one cell impassable.
    frictionEntries[viewHexes[1]] = FRICTION_COSTS.IMPASSABLE;

    const r1 = buildR1Adjacency({ viewHexes });
    const graph = buildMappingGraph({ frictionEntries, viewHexes, r1Adjacency: r1 });

    expect(graph.N).toBe(viewHexes.length);
    expect(graph.frictionArr[1]).toBe(-1);
    expect(graph.frictionArr[0]).toBe(FRICTION_COSTS.PAVEMENT);

    // The impassable cell must have an empty adjacency row.
    const impIdx = 1;
    expect(graph.adjOffsets[impIdx + 1] - graph.adjOffsets[impIdx]).toBe(0);

    // No neighbor index may point at the impassable cell.
    for (let x = 0; x < graph.adjNeighbors.length; x++) {
      expect(graph.adjNeighbors[x]).not.toBe(impIdx);
    }
  });

  it('does not allocate an idxOf object on the common r1 path', () => {
    const frictionEntries = Object.create(null);
    for (const c of viewHexes) frictionEntries[c] = FRICTION_COSTS.PAVEMENT;
    const r1 = buildR1Adjacency({ viewHexes });
    const graph = buildMappingGraph({ frictionEntries, viewHexes, r1Adjacency: r1 });
    // graph exposes only the documented CSR + aligned arrays
    expect(graph.adjOffsets).toBeInstanceOf(Int32Array);
    expect(graph.adjNeighbors).toBeInstanceOf(Int32Array);
    expect(graph.frictionArr).toBeInstanceOf(Float32Array);
    expect(graph.latLngArr).toBeInstanceOf(Float32Array);
  });
});

describe('mergeCellsChunk', () => {
  it('reuses the layer map by reference and derives friction from cellFrictionEntries', () => {
    const cell = center;
    const layerMap = Object.create(null);
    layerMap['0'] = FRICTION_COSTS.PAVEMENT; // 1.0
    layerMap['1'] = FRICTION_COSTS.LIGHT_PARK; // 2.5
    const multiEntries = Object.create(null);
    multiEntries[cell] = layerMap;
    const cellFrictionEntries = Object.create(null);
    cellFrictionEntries[cell] = FRICTION_COSTS.PAVEMENT; // min across layers

    const out = mergeCellsChunk({
      cells: [cell],
      multiEntries,
      cellFrictionEntries,
      blurUpdateMap: null,
      blurWeights: null,
    });

    expect(out.frictionArr[0]).toBe(FRICTION_COSTS.PAVEMENT);
    expect(out.affArr[0]).toBe(AFFORDANCE.PAVEMENT);
    // The returned layer map is the SAME reference (no per-cell copy).
    expect(out.multiArr[0]).toBe(layerMap);
  });

  it('applies the impassable-blur friction override', () => {
    const cell = center;
    const multiEntries = Object.create(null);
    const cellFrictionEntries = Object.create(null);
    cellFrictionEntries[cell] = FRICTION_COSTS.PAVEMENT;
    const blurUpdateMap = Object.create(null);
    blurUpdateMap[cell] = FRICTION_COSTS.HEAVY_GRASS;

    const out = mergeCellsChunk({
      cells: [cell],
      multiEntries,
      cellFrictionEntries,
      blurUpdateMap,
      blurWeights: null,
    });

    expect(out.frictionArr[0]).toBe(FRICTION_COSTS.HEAVY_GRASS);
  });

  it('classifies impassable friction as IMPASSABLE affordance', () => {
    const cell = center;
    const multiEntries = Object.create(null);
    const cellFrictionEntries = Object.create(null);
    cellFrictionEntries[cell] = FRICTION_COSTS.IMPASSABLE;

    const out = mergeCellsChunk({
      cells: [cell],
      multiEntries,
      cellFrictionEntries,
      blurUpdateMap: null,
      blurWeights: null,
    });

    expect(out.affArr[0]).toBe(AFFORDANCE.IMPASSABLE);
  });
});

describe('collectFastScanEntries', () => {
  it('produces consistent cellFrictionEntries (min) and multiFrictionEntries (per-key)', () => {
    const features = [
      {
        sourceLayer: 'building',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-3.704, 40.416],
              [-3.703, 40.416],
              [-3.703, 40.417],
              [-3.704, 40.417],
              [-3.704, 40.416],
            ],
          ],
        },
      },
    ];
    const { multiFrictionEntries, cellFrictionEntries } = collectFastScanEntries({
      features,
      viewHexes,
    });

    // Every cell that received a layer map must also have a numeric friction.
    for (const cell in multiFrictionEntries) {
      expect(typeof cellFrictionEntries[cell]).toBe('number');
      // The min of the layer map equals the cell friction entry.
      const layer = multiFrictionEntries[cell];
      let min = Infinity;
      for (const k in layer) if (layer[k] < min) min = layer[k];
      expect(cellFrictionEntries[cell]).toBe(min);
    }
  });
});

describe('computeImpassableBlurSnapshot', () => {
  it('blurs outward from impassable sources in index space (no gridDisk per cell)', () => {
    const frictionEntries = Object.create(null);
    for (const c of viewHexes) frictionEntries[c] = FRICTION_COSTS.PAVEMENT;
    // Make the center impassable — it is the blur source.
    frictionEntries[center] = FRICTION_COSTS.IMPASSABLE;

    const r1 = buildR1Adjacency({ viewHexes });
    const { blurWeights, updates } = computeImpassableBlurSnapshot({
      frictionEntries,
      viewHexes,
      r1Adjacency: r1,
      radius: 1,
    });

    // The 6 ring-1 neighbors are at distance 1 from the center → all blurred.
    const ringNeighbors = gridDisk(center, 1).filter((c) => c !== center);
    for (const n of ringNeighbors) {
      expect(typeof blurWeights[n]).toBe('number');
      expect(blurWeights[n]).toBeGreaterThan(0);
    }
    // The impassable source itself is never blurred.
    expect(blurWeights[center]).toBeUndefined();
    // Every update is a [cell, friction] pair capped below IMPASSABLE.
    for (const [cell, fr] of updates) {
      expect(fr).toBeLessThan(FRICTION_COSTS.IMPASSABLE);
      expect(blurWeights[cell]).toBeGreaterThan(0);
    }
  });

  it('returns empty results when there are no impassable sources', () => {
    const frictionEntries = Object.create(null);
    for (const c of viewHexes) frictionEntries[c] = FRICTION_COSTS.PAVEMENT;
    const r1 = buildR1Adjacency({ viewHexes });
    const { blurWeights, updates } = computeImpassableBlurSnapshot({
      frictionEntries,
      viewHexes,
      r1Adjacency: r1,
    });
    expect(Object.keys(blurWeights).length).toBe(0);
    expect(updates.length).toBe(0);
  });
});

describe('computeVisibilityBearingCSRIndexed', () => {
  // Build the index-space inputs the function expects from the shared r=1 CSR.
  function buildInputs(frictionByCell = {}) {
    const r1 = buildR1Adjacency({ viewHexes });
    const N = viewHexes.length;
    const frictionArr = new Float64Array(N);
    const latLngArr = new Float32Array(N * 8);
    for (let i = 0; i < N; i++) {
      const cell = viewHexes[i];
      const f = frictionByCell[cell];
      // The function encodes impassable / missing cells as -1 (skipped during BFS).
      // A specified IMPASSABLE value maps to -1; otherwise use the value (default PAVEMENT).
      frictionArr[i] =
        typeof f === 'number' && f >= FRICTION_COSTS.IMPASSABLE ? -1 : typeof f === 'number' ? f : FRICTION_COSTS.PAVEMENT;
      const [lat, lng] = cellToLatLng(cell);
      const latRad = (lat * Math.PI) / 180;
      const lngRad = (lng * Math.PI) / 180;
      const b = i * 8;
      latLngArr[b + 2] = latRad;
      latLngArr[b + 3] = lngRad;
      latLngArr[b + 4] = Math.sin(latRad);
      latLngArr[b + 5] = Math.cos(latRad);
      latLngArr[b + 6] = Math.sin(lngRad);
      latLngArr[b + 7] = Math.cos(lngRad);
    }
    return { adjOffsets: r1.offsets, adjNeighbors: r1.neighbors, frictionArr, latLngArr, N };
  }

  it('produces a valid CSR with prefix-summed localOffsets and in-range bearings', () => {
    const { adjOffsets, adjNeighbors, frictionArr, latLngArr, N } = buildInputs();
    const res = computeVisibilityBearingCSRIndexed({
      adjOffsets,
      adjNeighbors,
      frictionArr,
      latLngArr,
      visionDepth: 1,
    });

    expect(res.N).toBe(N);
    expect(res.localOffsets.length).toBe(N + 1);
    expect(res.localOffsets[0]).toBe(0);
    // Prefix sum: last offset equals total pair count P.
    expect(res.localOffsets[N]).toBe(res.P);
    expect(res.visNeighbors.length).toBe(res.P);
    expect(res.bearings.length).toBe(res.P);
    // Every bearing is a valid degree in [0, 360).
    for (let i = 0; i < res.P; i++) {
      expect(res.bearings[i]).toBeGreaterThanOrEqual(0);
      expect(res.bearings[i]).toBeLessThan(360);
    }
    // globalIdx is null when origins are omitted (all cells are origins).
    expect(res.globalIdx).toBeNull();
  });

  it('enumerates exactly the ring-1 neighbors of the center at visionDepth=1', () => {
    const { adjOffsets, adjNeighbors, frictionArr, latLngArr } = buildInputs();
    const centerIdx = viewHexes.indexOf(center);
    const res = computeVisibilityBearingCSRIndexed({
      adjOffsets,
      adjNeighbors,
      frictionArr,
      latLngArr,
      visionDepth: 1,
      originIdx: [centerIdx],
    });

    const s = res.localOffsets[0];
    const e = res.localOffsets[1];
    const nbrCells = [];
    for (let x = s; x < e; x++) nbrCells.push(viewHexes[res.visNeighbors[x]]);
    const expected = gridDisk(center, 1).filter((c) => c !== center);
    expect(nbrCells.sort()).toEqual(expected.sort());
    // globalIdx echoes the requested origin.
    expect(Array.from(res.globalIdx)).toEqual([centerIdx]);
  });

  it('skips impassable origins (no pairs emitted)', () => {
    const frictionByCell = Object.create(null);
    frictionByCell[center] = FRICTION_COSTS.IMPASSABLE;
    const { adjOffsets, adjNeighbors, frictionArr, latLngArr } = buildInputs(frictionByCell);
    const centerIdx = viewHexes.indexOf(center);
    const res = computeVisibilityBearingCSRIndexed({
      adjOffsets,
      adjNeighbors,
      frictionArr,
      latLngArr,
      visionDepth: 1,
      originIdx: [centerIdx],
    });
    expect(res.localOffsets[1] - res.localOffsets[0]).toBe(0);
    expect(res.P).toBe(0);
  });
});

describe('runVisibilityBearingTask (multi-worker merge path)', () => {
  it('packs the merged CSR without throwing and reconstructs valid bearings', async () => {
    // A larger AOI (depth 2) so workerCount > 1 and the code path that calls
    // mergeVisibilityBearingShards (not the single-shard packCSR path) is taken.
    const center = latLngToCell(40.4169, -3.7035, 15);
    const viewHexes = gridDisk(center, 2);
    const frictionEntries = Object.create(null);
    for (const c of viewHexes) frictionEntries[c] = FRICTION_COSTS.PAVEMENT;

    const r1 = buildR1Adjacency({ viewHexes });
    const graph = buildMappingGraph({ frictionEntries, viewHexes, r1Adjacency: r1 });

    // In node `Worker` is undefined, so runWorker falls back to runLocally and
    // the multi-shard merge (mergeVisibilityBearingShards) is exercised.
    const csr = await runVisibilityBearingTask(graph, viewHexes, 2);
    expect(csr.buffer).toBeTruthy();
    expect(csr.N).toBe(viewHexes.length);

    const { visibilityData, bearingMap } = reconstructVisibilityBearing(csr, viewHexes);
    // Every bearing in the reconstructed index must be a valid degree in [0,360).
    for (let i = 0; i < viewHexes.length; i++) {
      const a = viewHexes[i];
      const vis = visibilityData.data[a];
      if (!vis) continue;
      for (let j = 0; j < viewHexes.length; j++) {
        const b = viewHexes[j];
        if (vis[b]) {
          const brg = bearingMap.get?.(a + '::' + b);
          expect(typeof brg === 'number' && brg >= 0 && brg < 360).toBe(true);
        }
      }
    }
  });
});
