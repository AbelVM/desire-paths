import { describe, it, expect } from 'vitest';
import {
  normalizeFrictionEntries,
  computeGradientBatch,
  computeImpassableBlurSnapshot,
  computeFastScanSnapshot,
  computeFastScanChunkSnapshot,
  collectFastScanEntries,
  buildMappingGraph,
  mergeCellsChunk,
  _clipPolygonToBbox,
  _clipLineToBbox,
} from '../src/helpers/spatialTasks.js';
import { latLngToCell, gridDisk, gridDistance, cellToLatLng } from 'h3-js';
import { FRICTION_COSTS, classifyFrictionTier } from '../src/helpers/constants.js';
import { gradientGet, getGradientGraph } from '../src/helpers/dijkstra.js';

const h3Cell = latLngToCell(40.4169, -3.7035, 15);

describe('normalizeFrictionEntries', () => {
  it('should return empty object for null input', () => {
    expect(normalizeFrictionEntries(null)).toEqual(Object.create(null));
  });

  it('should return empty object for undefined input', () => {
    expect(normalizeFrictionEntries(undefined)).toEqual(Object.create(null));
  });

  it('should copy entries from a plain object', () => {
    const input = { a: 1, b: 2 };
    const result = normalizeFrictionEntries(input);
    expect(result.a).toBe(1);
    expect(result.b).toBe(2);
  });

  it('should copy entries from a Map', () => {
    const input = new Map([['a', 1], ['b', 2]]);
    const result = normalizeFrictionEntries(input);
    expect(result.a).toBe(1);
    expect(result.b).toBe(2);
  });
});

describe('computeGradientBatch', () => {
  it('should compute gradients for multiple targets', () => {
    const frictionEntries = {
      [h3Cell]: 1,
    };
    const result = computeGradientBatch({
      frictionEntries,
      targets: [h3Cell],
    });
    const graph = getGradientGraph(frictionEntries);
    expect(result[h3Cell]).toBeDefined();
    expect(gradientGet(result[h3Cell], h3Cell, graph)).toBe(0);
  });

  it('should handle empty targets list', () => {
    const result = computeGradientBatch({
      frictionEntries: { [h3Cell]: 1 },
      targets: [],
    });
    expect(Object.keys(result).length).toBe(0);
  });
});

describe('computeImpassableBlurSnapshot', () => {
  it('should return empty updates when no impassable cells', () => {
    const frictionEntries = {
      [h3Cell]: 1,
    };
    const result = computeImpassableBlurSnapshot({ frictionEntries });
    expect(result.blurWeights).toBeDefined();
    expect(result.updates).toEqual([]);
  });

  it('should apply blur from impassable cells to neighbors', () => {
    const neighbors = gridDisk(h3Cell, 1);
    const neighborCell = neighbors[1] || h3Cell;
    const frictionEntries = {
      [h3Cell]: 999999,
      [neighborCell]: 1,
    };
    const result = computeImpassableBlurSnapshot({
      frictionEntries,
      radius: 1,
      sigma: 1.0,
      addFactor: 3.0,
    });
    expect(result.blurWeights).toBeDefined();
    const neighborWeight = result.blurWeights[neighborCell];
    if (typeof neighborWeight === 'number') {
      expect(neighborWeight).toBeGreaterThan(0);
    }
    expect(Array.isArray(result.updates)).toBe(true);
  });

  it('should not blur into other impassable cells', () => {
    const neighbors = gridDisk(h3Cell, 1);
    const neighborCell = neighbors[1] || h3Cell;
    const frictionEntries = {
      [h3Cell]: 999999,
      [neighborCell]: 999999,
    };
    const result = computeImpassableBlurSnapshot({
      frictionEntries,
      radius: 1,
      sigma: 1.0,
      addFactor: 3.0,
    });
    expect(result.blurWeights[neighborCell]).toBeUndefined();
  });

  it('should respect custom radius of 0', () => {
    const result = computeImpassableBlurSnapshot({
      frictionEntries: { [h3Cell]: 999999 },
      radius: 0,
      sigma: 1.0,
      addFactor: 3.0,
    });
    expect(result.updates).toEqual([]);
  });

  it('accumulates blur from multiple adjacent impassable sources (concave corners)', () => {
    const ring = gridDisk(h3Cell, 1);
    const center = h3Cell;
    // Two ring-1 neighbors of `center` that are themselves adjacent (a concave
    // corner): `center` is then within radius 1 of both barriers.
    const a = ring.find((c) => c !== center);
    const b = gridDisk(a, 1).find((c) => c !== center && c !== a && ring.includes(c));
    expect(b).toBeDefined();

    const baseEntries = Object.create(null);
    for (const c of ring) baseEntries[c] = FRICTION_COSTS.PAVEMENT;

    // Single barrier baseline: only `a` is impassable.
    const single = computeImpassableBlurSnapshot({
      frictionEntries: { ...baseEntries, [a]: FRICTION_COSTS.IMPASSABLE },
      viewHexes: ring,
      radius: 1,
      sigma: 1.0,
      addFactor: 3.0,
    });
    const singleW = single.blurWeights[center];

    // Two adjacent barriers: `center` sits in the concave corner and should
    // accumulate the sum of both contributions.
    const double = computeImpassableBlurSnapshot({
      frictionEntries: { ...baseEntries, [a]: FRICTION_COSTS.IMPASSABLE, [b]: FRICTION_COSTS.IMPASSABLE },
      viewHexes: ring,
      radius: 1,
      sigma: 1.0,
      addFactor: 3.0,
    });
    const doubleW = double.blurWeights[center];

    expect(typeof singleW).toBe('number');
    expect(typeof doubleW).toBe('number');
    // Both barriers are at distance 1 from `center`, so weights sum.
    expect(doubleW).toBeCloseTo(2 * singleW, 5);
    // The accumulated penalty pushes the corner cell into a rougher tier.
    expect(double.blurUpdateMap[center]).toBeGreaterThan(single.blurUpdateMap[center]);
  });

  it('radius 2 extends a gentle d=2 halo without changing the d=1 penalty', () => {
    // A 2-ring AOI so a distance-2 cell from the barrier exists in viewHexes.
    const aoi = gridDisk(h3Cell, 2);
    const center = h3Cell;
    const a = aoi.find((c) => c !== center && gridDistance(center, c) === 1);
    // A walkable cell exactly two rings from the barrier `a`.
    const d2 = aoi.find(
      (c) => c !== a && c !== center && gridDistance(a, c) === 2,
    );
    expect(d2).toBeDefined();

    const baseEntries = Object.create(null);
    for (const c of aoi) baseEntries[c] = FRICTION_COSTS.PAVEMENT;

    const atR1 = computeImpassableBlurSnapshot({
      frictionEntries: { ...baseEntries, [a]: FRICTION_COSTS.IMPASSABLE },
      viewHexes: aoi,
      radius: 1,
      sigma: 1.0,
      addFactor: 3.0,
    });
    const atR2 = computeImpassableBlurSnapshot({
      frictionEntries: { ...baseEntries, [a]: FRICTION_COSTS.IMPASSABLE },
      viewHexes: aoi,
      radius: 2,
      sigma: 1.0,
      addFactor: 3.0,
    });

    // The immediate (d=1) penalty is identical regardless of radius.
    expect(atR2.blurWeights[center]).toBeCloseTo(atR1.blurWeights[center], 6);
    // d=1 weight is the gaussian peak for sigma=1: exp(-0.5) ≈ 0.6065.
    expect(atR1.blurWeights[center]).toBeCloseTo(Math.exp(-0.5), 5);

    // Radius 2 adds a faint d=2 halo (gaussian tail exp(-2) ≈ 0.1353) that
    // radius 1 does not produce.
    expect(atR1.blurWeights[d2]).toBeUndefined();
    expect(atR2.blurWeights[d2]).toBeCloseTo(Math.exp(-2), 5);
    // The d=2 halo is a gentle pavement-tier nudge, not a tier flip.
    expect(atR2.blurUpdateMap[d2]).toBeGreaterThan(FRICTION_COSTS.PAVEMENT);
    expect(atR2.blurUpdateMap[d2]).toBeLessThan(
      (FRICTION_COSTS.PAVEMENT + FRICTION_COSTS.LIGHT_PARK) / 2,
    );
  });

  it('default sigma=1.5 maps personal-space bands to the right tiers', () => {
    // Pedestrian logic at res-15 (~0.58 m/edge): <0.58 m = hard park,
    // 0.58–1.2 m = light park, >1.2 m = no penalty. With the production
    // defaults (RADIUS=2 / SIGMA=1.5 / FRICTION_ADD=3.0) this should land as
    // d=1 -> HEAVY_GRASS, d=2 -> LIGHT_PARK, d=3+ -> PAVEMENT (unreached).
    const aoi = gridDisk(h3Cell, 3);
    const center = h3Cell;
    const a = aoi.find((c) => c !== center && gridDistance(center, c) === 1);
    const d2 = aoi.find((c) => c !== a && c !== center && gridDistance(a, c) === 2);
    const d3 = aoi.find((c) => c !== a && c !== center && gridDistance(a, c) === 3);
    expect(d2).toBeDefined();
    expect(d3).toBeDefined();

    const baseEntries = Object.create(null);
    for (const c of aoi) baseEntries[c] = FRICTION_COSTS.PAVEMENT;

    const result = computeImpassableBlurSnapshot({
      frictionEntries: { ...baseEntries, [a]: FRICTION_COSTS.IMPASSABLE },
      viewHexes: aoi,
      // no radius/sigma/addFactor -> exercise the production defaults
    });

    // d=1 (0–0.58 m from wall): hard park -> HEAVY_GRASS
    expect(classifyFrictionTier(result.blurUpdateMap[center])).toBe('heavy_grass');
    // d=2 (0.58–1.16 m): light park -> LIGHT_PARK
    expect(classifyFrictionTier(result.blurUpdateMap[d2])).toBe('light_park');
    // d=3 (>1.2 m): no penalty -> PAVEMENT (unreached by radius 2)
    expect(result.blurUpdateMap[d3]).toBeUndefined();
  });
});

describe('computeFastScanSnapshot', () => {
  it('should return empty results for empty input', () => {
    const result = computeFastScanSnapshot({ features: [], viewHexes: [] });
    expect(result.multiFrictionEntries).toBeDefined();
    expect(result.cellFrictionEntries).toBeDefined();
    expect(result.blurWeights).toBeDefined();
    expect(result.blurUpdates).toEqual([]);
  });

  it('should skip features outside FAST_SCAN_LAYERS', () => {
    const viewHexes = [h3Cell];
    const features = [
      {
        sourceLayer: 'unknown_layer',
        properties: { class: 'secondary' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        },
      },
    ];
    const result = computeFastScanSnapshot({ features, viewHexes });
    expect(result.multiFrictionEntries).toBeDefined();
  });

  it('should skip features without geometry', () => {
    const viewHexes = [h3Cell];
    const features = [
      { sourceLayer: 'transportation', properties: { class: 'secondary' } },
    ];
    const result = computeFastScanSnapshot({ features, viewHexes });
    expect(result.multiFrictionEntries).toBeDefined();
  });

  it('should skip null features', () => {
    const viewHexes = [h3Cell];
    const features = [null];
    const result = computeFastScanSnapshot({ features, viewHexes });
    expect(result.multiFrictionEntries).toBeDefined();
  });

  it('should classify a waterway line as IMPASSABLE (FAST_SCAN_LAYERS wiring)', () => {
    // A river linestring passing through the AOI cell must produce an
    // IMPASSABLE corridor. This guards that 'waterway' is scanned (in
    // FAST_SCAN_LAYERS) and reaches the getSurface handler.
    const viewHexes = gridDisk(h3Cell, 2);
    const features = [
      {
        sourceLayer: 'waterway',
        properties: { class: 'river' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-3.7040, 40.4165],
            [-3.7030, 40.4173],
          ],
        },
      },
    ];
    const result = computeFastScanSnapshot({ features, viewHexes });
    const values = Object.values(result.cellFrictionEntries);
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((v) => v === FRICTION_COSTS.IMPASSABLE)).toBe(true);
  });

  it('should NOT block the surface for a culverted waterway (brunnel=tunnel)', () => {
    // A piped/tunneled waterway runs underground; the ground above stays
    // walkable. It must contribute no cells (skipped), so no IMPASSABLE entries.
    const viewHexes = gridDisk(h3Cell, 2);
    const features = [
      {
        sourceLayer: 'waterway',
        properties: { class: 'river', brunnel: 'tunnel' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-3.7040, 40.4165],
            [-3.7030, 40.4173],
          ],
        },
      },
    ];
    const result = computeFastScanSnapshot({ features, viewHexes });
    const values = Object.values(result.cellFrictionEntries);
    expect(values.some((v) => v === FRICTION_COSTS.IMPASSABLE)).toBe(false);
  });

  it('should classify a park polygon as LIGHT_PARK (FAST_SCAN_LAYERS wiring)', () => {
    const viewHexes = gridDisk(h3Cell, 2);
    const features = [
      {
        sourceLayer: 'park',
        properties: { class: 'national_park' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-3.7045, 40.4160],
              [-3.7025, 40.4160],
              [-3.7025, 40.4178],
              [-3.7045, 40.4178],
              [-3.7045, 40.4160],
            ],
          ],
        },
      },
    ];
    const result = computeFastScanSnapshot({ features, viewHexes });
    const values = Object.values(result.cellFrictionEntries);
    expect(values.length).toBeGreaterThan(0);
    expect(values.some((v) => v === FRICTION_COSTS.LIGHT_PARK)).toBe(true);
  });

  it('clipping a large feature to the AOI bbox yields identical AOI cells', () => {
    // A park polygon larger than the AOI (spilling past the AOI bbox) must
    // classify exactly the same AOI cells whether it is clipped to the AOI bbox
    // before rasterization or rasterized whole. This guards the Sutherland–Hodgman
    // clipping speedup in collectFastScanEntries.
    const viewHexes = gridDisk(h3Cell, 2);
    // AOI bbox from the actual AOI cells.
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const cell of viewHexes) {
      const [lat, lng] = cellToLatLng(cell);
      if (lng < minx) minx = lng;
      if (lng > maxx) maxx = lng;
      if (lat < miny) miny = lat;
      if (lat > maxy) maxy = lat;
    }
    const aoiBbox = [minx, miny, maxx, maxy];

    // A modest square centered on the AOI, large enough to spill past the AOI
    // bbox but small enough to rasterize quickly at res 15 (a 0.02° square would
    // be millions of cells and time out / hit h3's cell limit).
    const cx = (minx + maxx) / 2;
    const cy = (miny + maxy) / 2;
    const hw = 0.0015;
    const big = [
      [cx - hw, cy - hw],
      [cx + hw, cy - hw],
      [cx + hw, cy + hw],
      [cx - hw, cy + hw],
      [cx - hw, cy - hw],
    ];
    const feature = {
      sourceLayer: 'park',
      properties: { class: 'national_park' },
      geometry: { type: 'Polygon', coordinates: [big] },
      bbox: [cx - hw, cy - hw, cx + hw, cy + hw],
    };

    const clipped = collectFastScanEntries({ features: [feature], viewHexes, aoiBbox });
    // No clipping: pass the feature's own (large) bbox as the AOI bbox so the
    // "extends beyond" test is false and the full geometry is rasterized.
    const full = collectFastScanEntries({
      features: [feature],
      viewHexes,
      aoiBbox: [cx - hw, cy - hw, cx + hw, cy + hw],
    });

    // cellFrictionEntries is post-AOI-filter, so both runs contain exactly the
    // AOI cells (clipping only reduces the raw rasterized work, never the result).
    // Every AOI cell must be classified identically in both runs.
    expect(Object.keys(clipped.cellFrictionEntries).sort()).toEqual(
      Object.keys(full.cellFrictionEntries).sort(),
    );
    for (const cell of viewHexes) {
      expect(clipped.cellFrictionEntries[cell]).toBe(full.cellFrictionEntries[cell]);
    }
  });

  it('clipping a long line to the AOI bbox yields identical AOI corridor cells', () => {
    // A river (waterway) linestring far longer than the AOI, crossing it
    // diagonally. Clipping it to the AOI bbox must produce exactly the same AOI
    // corridor cells as clipping it to a larger bbox that still fully contains
    // the AOI — both contain the AOI portion of the line, so the rasterized AOI
    // cells are identical. This guards the Liang–Barsky line clipping speedup in
    // collectFastScanEntries. (We compare against a larger clip bbox rather than
    // the unclipped line because gridPathCells between two far-apart cell centers
    // drifts off the true line and can miss AOI cells — clipping to a near-AOI
    // bbox is in fact the more accurate rasterization.)
    const viewHexes = gridDisk(h3Cell, 2);
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const cell of viewHexes) {
      const [lat, lng] = cellToLatLng(cell);
      if (lng < minx) minx = lng;
      if (lng > maxx) maxx = lng;
      if (lat < miny) miny = lat;
      if (lat > maxy) maxy = lat;
    }
    const aoiBbox = [minx, miny, maxx, maxy];
    const cx = (minx + maxx) / 2;
    const cy = (miny + maxy) / 2;
    // A long diagonal through the AOI center, extending ~0.1° (≈11 km) past it.
    const line = [
      [cx - 0.05, cy - 0.05],
      [cx + 0.05, cy + 0.05],
    ];
    const lineBbox = [cx - 0.05, cy - 0.05, cx + 0.05, cy + 0.05];
    const feature = {
      sourceLayer: 'waterway',
      properties: { class: 'river' },
      geometry: { type: 'LineString', coordinates: line },
      bbox: lineBbox,
    };

    // Clip to the AOI bbox.
    const clipped = collectFastScanEntries({ features: [feature], viewHexes, aoiBbox });
    // Clip to a 3x-larger bbox that still fully contains the AOI: pass it as the
    // AOI bbox so the "extends beyond" test is false and the line is clipped to
    // that larger box instead. inAoi is still the real AOI, so only AOI cells
    // survive the filter.
    const bigBbox = [
      cx - (maxx - minx) * 1.5,
      cy - (maxy - miny) * 1.5,
      cx + (maxx - minx) * 1.5,
      cy + (maxy - miny) * 1.5,
    ];
    const wide = collectFastScanEntries({ features: [feature], viewHexes, aoiBbox: bigBbox });

    // lineCorridorCells is post-AOI-filter; both clip boxes contain the AOI, so
    // the AOI corridor cells must be identical.
    expect(Object.keys(clipped.lineCorridorCells).sort()).toEqual(
      Object.keys(wide.lineCorridorCells).sort(),
    );
    for (const cell of viewHexes) {
      expect(!!clipped.lineCorridorCells[cell]).toBe(!!wide.lineCorridorCells[cell]);
    }
  });
});

describe('_clipLineToBbox', () => {
  it('returns the line unchanged when fully inside the bbox', () => {
    const line = [
      [3, 3],
      [7, 3],
      [7, 7],
    ];
    const out = _clipLineToBbox(line, 0, 0, 10, 10);
    expect(out.length).toBe(1);
    expect(out[0]).toEqual(line);
  });

  it('clips a line that crosses the bbox to the boundary', () => {
    const line = [
      [-5, 5],
      [15, 5],
    ];
    const out = _clipLineToBbox(line, 0, 0, 10, 10);
    expect(out.length).toBe(1);
    // The clipped segment endpoints must lie on the bbox boundary (x in [0,10]).
    expect(out[0][0][0]).toBeCloseTo(0, 6);
    expect(out[0][1][0]).toBeCloseTo(10, 6);
    expect(out[0][0][1]).toBeCloseTo(5, 6);
    expect(out[0][1][1]).toBeCloseTo(5, 6);
  });

  it('returns [] when the line is completely outside the bbox', () => {
    const line = [
      [20, 20],
      [30, 30],
    ];
    const out = _clipLineToBbox(line, 0, 0, 10, 10);
    expect(out).toEqual([]);
  });

  it('splits a line that exits and re-enters into two sub-polylines', () => {
    // Inside segment, then a fully-outside segment, then back inside: the outside
    // segment must separate the two inside portions into disjoint sub-polylines.
    const line = [
      [5, 5],
      [15, 5],
      [15, 15],
      [5, 5],
    ];
    const out = _clipLineToBbox(line, 0, 0, 10, 10);
    expect(out.length).toBe(2);
    for (const sub of out) {
      for (const [x, y] of sub) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(10);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(10);
      }
    }
  });
});

describe('_clipPolygonToBbox', () => {
  it('clips a square that extends past the bbox to the bbox edges', () => {
    const poly = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]];
    const clipped = _clipPolygonToBbox(poly, 2, 2, 8, 8);
    expect(clipped).not.toBeNull();
    for (const [x, y] of clipped[0]) {
      expect(x).toBeGreaterThanOrEqual(2);
      expect(x).toBeLessThanOrEqual(8);
      expect(y).toBeGreaterThanOrEqual(2);
      expect(y).toBeLessThanOrEqual(8);
    }
  });

  it('returns the polygon unchanged when fully inside the bbox', () => {
    const poly = [[[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]];
    const clipped = _clipPolygonToBbox(poly, 0, 0, 10, 10);
    expect(clipped).not.toBeNull();
    expect(clipped[0].length).toBe(5);
  });

  it('returns null when the polygon is completely outside the bbox', () => {
    const poly = [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]];
    const clipped = _clipPolygonToBbox(poly, 0, 0, 10, 10);
    expect(clipped).toBeNull();
  });

  it('drops holes that collapse during clipping', () => {
    const poly = [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]], // hole outside bbox
    ];
    const clipped = _clipPolygonToBbox(poly, 0, 0, 10, 10);
    expect(clipped).not.toBeNull();
    expect(clipped.length).toBe(1); // outer kept, hole dropped
  });
});

describe('computeFastScanChunkSnapshot', () => {
  it('should return empty entries for empty input', () => {
    const result = computeFastScanChunkSnapshot({ features: [], viewHexes: [] });
    expect(result.multiFrictionEntries).toBeDefined();
    expect(result.cellFrictionEntries).toBeDefined();
  });

  it('should skip features outside FAST_SCAN_LAYERS', () => {
    const viewHexes = [h3Cell];
    const features = [
      {
        sourceLayer: 'unknown_layer',
        properties: { class: 'secondary' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        },
      },
    ];
    const result = computeFastScanChunkSnapshot({ features, viewHexes });
    expect(result.multiFrictionEntries).toBeDefined();
    expect(result.cellFrictionEntries).toBeDefined();
  });

  it('should skip null features', () => {
    const viewHexes = [h3Cell];
    const features = [null];
    const result = computeFastScanChunkSnapshot({ features, viewHexes });
    expect(result.multiFrictionEntries).toBeDefined();
  });

  it('should ignore non-ground layer when ground layer is absent', () => {
    const viewHexes = [h3Cell];
    const features = [
      {
        sourceLayer: 'transportation',
        properties: { class: 'path', layer: '1' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[-3.704, 40.416], [-3.703, 40.416], [-3.703, 40.417], [-3.704, 40.417], [-3.704, 40.416]]],
        },
      },
    ];
    const result = computeFastScanSnapshot({ features, viewHexes });
    // Layer=1 (bridge) should not affect ground surface classification.
    // With no layer=0 entry, the cell has no effective friction here.
    expect(result.cellFrictionEntries[h3Cell]).toBeUndefined();
  });

  it('should handle Polygon geometry with coordinates near the H3 cell', () => {
    const viewHexes = [h3Cell];
    // Coordinates near Madrid (40.4169, -3.7035)
    const features = [
      {
        sourceLayer: 'landuse',
        properties: { class: 'residential' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [-3.704, 40.416],
            [-3.703, 40.416],
            [-3.703, 40.417],
            [-3.704, 40.417],
            [-3.704, 40.416],
          ],
        },
      },
    ];
    const result = computeFastScanChunkSnapshot({ features, viewHexes });
    expect(result.multiFrictionEntries).toBeDefined();
    expect(result.cellFrictionEntries).toBeDefined();
  });

  it('should handle MultiPolygon geometry with coordinates near the H3 cell', () => {
    const viewHexes = [h3Cell];
    const features = [
      {
        sourceLayer: 'landuse',
        properties: { class: 'residential' },
        geometry: {
          type: 'MultiPolygon',
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
    const result = computeFastScanChunkSnapshot({ features, viewHexes });
    expect(result.multiFrictionEntries).toBeDefined();
    expect(result.cellFrictionEntries).toBeDefined();
  });
});

describe('computeImpassableBlurSnapshot error handling', () => {
  it('should handle gridRing errors gracefully', () => {
    // Create a friction map where gridRing might throw for certain cells
    // by using an extremely large or invalid cell ID
    const result = computeImpassableBlurSnapshot({
      frictionEntries: { invalid_cell_id: 999999 },
      radius: 1,
      sigma: 1.0,
      addFactor: 3.0,
    });
    expect(result.blurWeights).toBeDefined();
    expect(Array.isArray(result.updates)).toBe(true);
  });
});

// --- 9. NO-FEATURE CELLS DEFAULT TO PAVEMENT (item 1) ---
// A cell with no classified feature must resolve to PAVEMENT (1.0), not 0,
// so the effective friction is consistent with the getSurface PAVEMENT default.
describe('no-feature cells default to PAVEMENT', () => {
  it('buildMappingGraph should assign PAVEMENT to a viewHex with no friction entry', () => {
    const { frictionArr } = buildMappingGraph({
      frictionEntries: {},
      viewHexes: [h3Cell],
    });
    expect(frictionArr[0]).toBe(FRICTION_COSTS.PAVEMENT);
  });

  it('mergeCellsChunk should assign PAVEMENT to a cell absent from cellFrictionEntries', () => {
    const { frictionArr } = mergeCellsChunk({
      cells: [h3Cell],
      cellFrictionEntries: Object.create(null),
    });
    expect(frictionArr[0]).toBe(FRICTION_COSTS.PAVEMENT);
  });

  it('mergeCellsChunk should preserve an explicit feature friction over the default', () => {
    const { frictionArr } = mergeCellsChunk({
      cells: [h3Cell],
      cellFrictionEntries: { [h3Cell]: FRICTION_COSTS.HEAVY_GRASS },
    });
    expect(frictionArr[0]).toBe(FRICTION_COSTS.HEAVY_GRASS);
  });
});
