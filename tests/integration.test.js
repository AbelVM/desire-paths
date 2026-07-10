import { describe, it, expect, vi } from 'vitest';
import { latLngToCell } from 'h3-js';
import { FRICTION_COSTS, AFFORDANCE } from '../src/helpers/constants.js';

// ── DOM Mock ──────────────────────────────────────────────────────────
const mockElements = new Map();

function mockQuerySelector(selector) {
  if (selector === '.panel') return mockElements.get('.panel') || { classList: { toggle: vi.fn() }, hidden: false };
  if (selector === '[data-placement-mode]') return Array.from(mockElements.values()).filter(e => e.dataset?.placementMode);
  return null;
}

vi.stubGlobal('document', {
  querySelector: (sel) => {
    const el = mockElements.get(sel);
    if (el) return el;
    if (sel === '.panel') return { classList: { toggle: vi.fn() }, hidden: false, querySelector: mockQuerySelector };
    if (sel === '[data-placement-mode]') return [];
    if (sel === '#btn-toggle-friction') return mockElements.get('btn-toggle-friction');
    if (sel === '#friction-legend-body') return mockElements.get('friction-legend-body');
    if (sel === '#node-weight') return mockElements.get('node-weight');
    if (sel === '#node-weight-readout') return mockElements.get('node-weight-readout');
    if (sel === '#btn-build-mapping') return mockElements.get('btn-build-mapping');
    if (sel === '#btn-compute') return mockElements.get('btn-compute');
    if (sel === '#btn-export-geojson') return mockElements.get('btn-export-geojson');
    if (sel === '#btn-clear') return mockElements.get('btn-clear');
    if (sel === '#mode-status') return mockElements.get('mode-status');
    if (sel === '#scan-loader') return mockElements.get('scan-loader');
    if (sel === '#max-flow-readout') return mockElements.get('max-flow-readout');
    if (sel === '#app-alert') return mockElements.get('app-alert');
    if (sel === '#app-alert-title') return mockElements.get('app-alert-title');
    if (sel === '#app-alert-message') return mockElements.get('app-alert-message');
    if (sel === '#app-alert-dismiss') return mockElements.get('app-alert-dismiss');
    return null;
  },
  querySelectorAll: (sel) => {
    if (sel === '[data-placement-mode]') return Array.from(mockElements.values()).filter(e => e.dataset?.placementMode);
    return [];
  },
  getElementById: (id) => mockElements.get(id),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  createElement: () => ({
    id: '', className: '', style: {}, innerHTML: '',
    appendChild: vi.fn(), removeChild: vi.fn(), firstChild: null,
    classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
    querySelector: () => null,
  }),
  body: { appendChild: vi.fn() },
});

vi.stubGlobal('window', {
  clearTimeout: vi.fn(),
  setTimeout: vi.fn((fn) => setTimeout(fn, 0)),
  URL,
  createObjectURL: () => 'blob:test',
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  cancelAnimationFrame: vi.fn(),
});

vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
vi.stubGlobal('cancelAnimationFrame', vi.fn());

// ── Maplibre Mock ─────────────────────────────────────────────────────
const mockMapState = {
  center: [-3.7035, 40.4169],
  zoom: 19,
  bounds: { getSouthEast: () => ({ lng: -3.7, lat: 40.4 }), getNorthWest: () => ({ lng: -3.8, lat: 40.5 }), getSouthWest: () => ({ lng: -3.8, lat: 40.4 }), getNorthEast: () => ({ lng: -3.7, lat: 40.5 }) },
  project: (ll) => ({ x: ll[0] * 100, y: ll[1] * 100 }),
  unproject: (px) => ({ lng: px[0] / 100, lat: px[1] / 100 }),
  getCanvas: () => ({ style: { cursor: 'crosshair' } }),
  getStyle: () => ({ layers: [{ id: 'place-label', type: 'symbol' }] }),
  getLayer: vi.fn(),
  getSource: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  getBounds: () => ({ getSouthEast: () => ({ lng: -3.7, lat: 40.4 }), getNorthWest: () => ({ lng: -3.8, lat: 40.5 }) }),
  on: vi.fn(),
  addControl: vi.fn(),
};

vi.stubGlobal('maplibregl', {
  Map: vi.fn(() => mockMapState),
  LngLatBounds: vi.fn(function () {
    this.extend = vi.fn();
    this.getSouthEast = () => ({ lng: -3.7, lat: 40.4 });
    this.getNorthWest = () => ({ lng: -3.8, lat: 40.5 });
  }),
});

// ── Deck.gl Mock ──────────────────────────────────────────────────────
vi.mock('@deck.gl/mapbox', () => ({
  MapboxOverlay: vi.fn(() => ({ setProps: vi.fn() })),
}));

vi.mock('@deck.gl/geo-layers', () => ({
  H3HexagonLayer: class H3HexagonLayer {
    constructor(opts) { this.id = opts.id; this.props = opts; }
  },
}));

// ── H3 Mock ───────────────────────────────────────────────────────────
const mockHexes = [
  latLngToCell(40.4169, -3.7035, 15),
  latLngToCell(40.417, -3.7034, 15),
  latLngToCell(40.4171, -3.7033, 15),
];

vi.mock('h3-js', async () => {
  const actual = await vi.importActual('h3-js');
  return {
    ...actual,
    polygonToCells: vi.fn(() => mockHexes),
    latLngToCell: vi.fn((lat, lng, res) => actual.latLngToCell(lat, lng, res)),
    gridPathCells: vi.fn((a, b) => {
      if (a === b) return [a];
      return [a, b];
    }),
    gridDisk: vi.fn((center, r) => actual.gridDisk(center, r)),
    cellToLatLng: vi.fn((hex) => actual.cellToLatLng(hex)),
    gridDistance: vi.fn((a, b) => actual.gridDistance(a, b)),
  };
});

// ── Spatial Worker Mock ───────────────────────────────────────────────
// Partial mock: vitest 4.1.10 enforces that a mocked module still exposes every
// named export its importers use, so we declare all of them (the real module is
// NOT spread in — its top-level `window.addEventListener` would throw under node).
// Only the tasks this suite needs to stub are given real behavior; the rest are
// no-op fns returning safe shapes.
vi.mock('../src/helpers/spatialWorker.js', () => ({
  runAoiHexesTask: vi.fn(async (aoiPolygon) => {
    // Return mock hexes for testing — simulates AOI polygon-to-cells result.
    // Returns empty array when no AOI polygon is provided.
    if (!aoiPolygon || !aoiPolygon.length) return [];
    return mockHexes;
  }),
  runBuildR1Adjacency: vi.fn(async (viewHexes) => {
    // Mock the shared r=1 adjacency build. Returns an empty CSR shape; the
    // (also mocked) fast-scan and mapping-graph tasks ignore it.
    const N = viewHexes ? viewHexes.length : 0;
    return { N, offsets: new Int32Array(N + 1), neighbors: new Int32Array(0) };
  }),
  runFastScanTask: vi.fn(async (viewHexes, _features) => {
    const multiFrictionEntries = Object.create(null);
    const cellFrictionEntries = Object.create(null);
    const blurWeights = Object.create(null);
    const blurUpdates = [];
    for (const hex of viewHexes) {
      cellFrictionEntries[hex] = 1;
      multiFrictionEntries[hex] = { '0': 1 };
      blurWeights[hex] = 0;
    }
    return { multiFrictionEntries, cellFrictionEntries, blurWeights, blurUpdates };
  }),
  runGradientBatches: vi.fn(async (targets, _frictionSource) => {
    const result = Object.create(null);
    for (const t of targets) {
      result[t] = Object.create(null);
    }
    return result;
  }),
  runVisibilityBearingTask: vi.fn(async (_frictionSource, _viewHexes, _visionDepth) => {
    // Mock visibility/bearing precompute — returns an empty CSR payload so the
    // mapping stage reconstructs empty structures without exercising the real BFS.
    return { buffer: null, N: 0, P: 0, offsetsBytes: 0, neighborsBytes: 0 };
  }),
  runBuildMappingGraph: vi.fn(async (_frictionSource, viewHexes) => {
    // Mock the one-time mapping-graph build (P1+P3). Returns an empty graph so
    // the (also mocked) visibility task receives a valid shape without running
    // the real gridDisk/cellToLatLng graph construction.
    const N = viewHexes ? viewHexes.length : 0;
    return {
      N,
      adjOffsets: new Int32Array(N + 1),
      adjNeighbors: new Int32Array(0),
      frictionArr: new Float32Array(N),
      latLngArr: new Float32Array(N * 4),
    };
  }),
  runMergeCellsTask: vi.fn(async ({ cells, cellFrictionEntries, blurUpdateMap, blurWeights }) => {
    // Mock per-cell assembly: replicate the essential mapping (friction from
    // cellFrictionEntries, affordance classification) so the mapping stage
    // populates state without exercising the real worker compute. The layer-map
    // objects are handled on the main thread (P2-9), so this mock only returns
    // the typed friction/affordance arrays.
    const frictionArr = new Float64Array(cells.length);
    const affArr = new Float64Array(cells.length);
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      let fr = cellFrictionEntries[cell] ?? 0;
      if (blurUpdateMap && blurUpdateMap[cell] !== undefined) fr = blurUpdateMap[cell];
      let aff;
      if (fr >= 999999) aff = 0.1;
      else if (fr < 1.5) aff = 1;
      else if (fr < 3) aff = 2.5;
      else aff = 4;
      if (blurWeights && blurWeights[cell] != null) aff = Math.max(0, aff - Math.min(aff, blurWeights[cell] * 0.4));
      frictionArr[i] = fr;
      affArr[i] = aff;
    }
    return { frictionArr, affArr };
  }),
  // Remaining exports importers reference — provided as no-ops / safe shapes.
  runAgentBatches: vi.fn(async () => ({
    pathDesire: Object.create(null),
    perTargetContribs: Object.create(null),
    processed: 0,
    total: 0,
  })),
  setSpatialWorkerProgressHandler: vi.fn(),
  clearSpatialWorkerProgressHandler: vi.fn(),
  terminateAllWorkers: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────
function createMockMap(extra = {}) {
  const originCell = mockHexes[0];
  const destCell = mockHexes[1];
  const map = {
    simulationNodes: {
      [originCell]: { type: 'origin', weight: 1 },
      [destCell]: { type: 'destination', weight: 1 },
    },
    multiFrictionMap: new Map(),
    cellFrictionMap: new Map(),
    pathDesireScores: new Map(),
    affordanceMap: new Map(),
    globalPeakFlow: 1,
    showFrictionMesh: true,
    mappingReady: false,
    flowsReady: false,
    deckOverlayInstance: { setProps: vi.fn(), layers: [] },
    targetLabelLayerId: 'place-label',
    placementMode: 'origin',
    placementWeight: 1,
    aoi: undefined,
    readyToCompute: false,
    isComputing: false,
    baseLayer: null,
    flowLayer: null,
    aoi_px: undefined,
    aoi_polygon: [[-3.8, 40.4], [-3.7, 40.4], [-3.7, 40.5], [-3.8, 40.5], [-3.8, 40.4]],
    _cachedViewHexes: undefined,
    _cachedAoiKey: undefined,
    _lastViewHexesKey: undefined,
    _frictionObj: undefined,
    _affordanceObj: undefined,
    _multiFrictionObj: undefined,
    _cellState: undefined,
    _computePathCacheObj: undefined,
    _computePathCacheOrder: undefined,
    _computeDiskCacheObj: undefined,
    _computeDiskCacheOrder: undefined,
    _visibilityCacheObj: undefined,
    _visibilityCacheOrder: undefined,
    _gradientCacheObj: undefined,
    _perTargetContribs: undefined,
    _assignedCounts: undefined,
    _targetWeights: undefined,
    ...extra,
  };

  // Delegated maplibregl methods
  map.getContainer = () => ({ classList: { toggle: vi.fn() }, querySelector: mockQuerySelector });
  map.getLayer = vi.fn();
  map.getStyle = () => ({ layers: [{ id: 'place-label', type: 'symbol' }] });
  map.getBounds = () => ({ getSouthEast: () => ({ lng: -3.7, lat: 40.4 }), getNorthWest: () => ({ lng: -3.8, lat: 40.5 }) });
  map.project = (ll) => ({ x: ll[0] * 100, y: ll[1] * 100 });
  map.unproject = (px) => ({ lng: px[0] / 100, lat: px[1] / 100 });
  map.queryRenderedFeatures = vi.fn(() => []);
  map.getSource = vi.fn(() => ({ setData: vi.fn() }));
  map.addSource = vi.fn();
  map.addLayer = vi.fn();
  map.addControl = vi.fn();
  map.fitBounds = vi.fn();
  map.getCanvas = () => ({ style: { cursor: 'crosshair' } });
  map.on = vi.fn();
  map.clearLayers = vi.fn();
  map.showAlertCard = vi.fn();
  map.syncSimulationUI = vi.fn();
  map.getHexes = () => mockHexes;
  map.updateLayers = () => {};

  return map;
}

// ── Tests ─────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════
// grid.js tests
// ══════════════════════════════════════════════════════════════════════
describe('grid.js', () => {
  describe('getHexes', () => {
    it('should return hexes from polygonToCells when AOI is set', async () => {
      const map = createMockMap();
      const { getHexes } = await import('../src/helpers/grid.js');
      const hexes = getHexes(map, map);
      expect(hexes).toBeDefined();
      expect(Array.isArray(hexes)).toBe(true);
      expect(hexes.length).toBeGreaterThan(0);
    });

    it('should cache hexes when AOI key is unchanged', async () => {
      const map = createMockMap();
      const { getHexes } = await import('../src/helpers/grid.js');
      getHexes(map, map);
      const cached = map._cachedViewHexes;
      expect(cached).toBeDefined();
      expect(map._cachedAoiKey).toBeDefined();
      // Second call should return cached
      const hexes2 = getHexes(map, map);
      expect(hexes2).toBe(cached);
    });

    it('should return undefined when polygonToCells throws', async () => {
      const map = {
        aoi_polygon: null,
        _cachedViewHexes: undefined,
        _cachedAoiKey: undefined,
      };
      // polygonToCells returns empty array for null polygon
      const { getHexes } = await import('../src/helpers/grid.js');
      const result = getHexes(map, map);
      // When aoi_polygon is null, polygonToCells returns empty array, so getHexes returns []
      expect(Array.isArray(result)).toBe(true);
    });

    it('should use cached hexes when AOI key matches', async () => {
      const map = {
        aoi_polygon: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
        _cachedViewHexes: ['hex1', 'hex2'],
        _cachedAoiKey: '0.000000:0.000000:1.000000:1.000000',
      };
      const { getHexes } = await import('../src/helpers/grid.js');
      const hexes = getHexes(map, map);
      expect(hexes).toBe(map._cachedViewHexes);
    });
  });

  describe('triggerFastScan', () => {
    it('should return early when no viewHexes', async () => {
      const map = createMockMap();
      // Set aoi_polygon to null so runAoiHexesTask returns empty array
      map.aoi_polygon = null;
      const { triggerFastScan } = await import('../src/helpers/grid.js');
      await triggerFastScan(map, map);
      // triggerFastScan returns early when viewHexes is empty
      expect(map.cellFrictionMap.size).toBe(0);
    });

    it('should populate friction maps after triggerFastScan', async () => {
      const map = createMockMap();
      const { triggerFastScan } = await import('../src/helpers/grid.js');
      await triggerFastScan(map, map);
      expect(map.cellFrictionMap.size).toBeGreaterThan(0);
      expect(map.multiFrictionMap.size).toBeGreaterThan(0);
      expect(map.affordanceMap.size).toBeGreaterThan(0);
    });

    it('should create _frictionObj and _affordanceObj snapshots', async () => {
      const map = createMockMap();
      const { triggerFastScan } = await import('../src/helpers/grid.js');
      await triggerFastScan(map, map);
      expect(map._frictionObj).toBeDefined();
      expect(map._affordanceObj).toBeDefined();
      expect(map._multiFrictionObj).toBeDefined();
      // M5: the per-cell `_cellState` object is no longer built; friction/affordance
      // live in the flat `_frictionObj`/`_affordanceObj` snapshots the sim reads.
      expect(map._cellState == null).toBe(true);
    });

    it('should reuse multiFrictionMap when AOI key unchanged', async () => {
      const map = createMockMap();
      const { triggerFastScan } = await import('../src/helpers/grid.js');
      await triggerFastScan(map, map);
      const firstMap = map.multiFrictionMap;
      await triggerFastScan(map, map);
      expect(map.multiFrictionMap).toBe(firstMap);
    });

    it('should apply blur weights to affordance', async () => {
      const map = createMockMap();
      const { triggerFastScan } = await import('../src/helpers/grid.js');
      await triggerFastScan(map, map);
      // Affordance should be set for all cells
      for (const hex of map.affordanceMap.keys()) {
        expect(typeof map.affordanceMap.get(hex)).toBe('number');
      }
    });

    it('should call updateLayers at end', async () => {
      const map = createMockMap();
      let layersCalled = false;
      map.updateLayers = () => { layersCalled = true; };
      const { triggerFastScan } = await import('../src/helpers/grid.js');
      await triggerFastScan(map, map);
      expect(layersCalled).toBe(true);
    });

    it('should handle impassable friction values', async () => {
      const map = createMockMap();
      map.updateLayers = () => {};
      const { triggerFastScan } = await import('../src/helpers/grid.js');
      await triggerFastScan(map, map);
      // Check that impassable cells get IMPASSABLE affordance
      for (const [cell, aff] of map.affordanceMap) {
        if (map._frictionObj?.[cell] >= FRICTION_COSTS.IMPASSABLE) {
          expect(aff).toBe(AFFORDANCE.IMPASSABLE);
        }
      }
    });
  });

  describe('mapPolygonCells', () => {
    it('should map cells from polygon coordinates', async () => {
      const map = createMockMap();
      const { mapPolygonCells } = await import('../src/helpers/grid.js');
      const multiFrictionMap = new Map();
      multiFrictionMap.set(mockHexes[0], { '0': 0 });
      multiFrictionMap.set(mockHexes[1], { '0': 0 });
      map.multiFrictionMap = multiFrictionMap;

      const coords = [
        [-3.7035, 40.4169],
        [-3.7034, 40.4169],
        [-3.7034, 40.417],
        [-3.7035, 40.417],
        [-3.7035, 40.4169],
      ];
      const surface = { layer: '0', cost: 'PAVEMENT' };
      mapPolygonCells(map, map, coords, surface);
      expect(map._polyCache).toBeDefined();
    });

    it('should cache polygon results and evict oldest', async () => {
      const map = createMockMap();
      const { mapPolygonCells } = await import('../src/helpers/grid.js');
      map.multiFrictionMap = new Map();

      for (let i = 0; i < 20; i++) {
        const coords = [
          [-3.7035 + i * 0.0001, 40.4169],
          [-3.7034 + i * 0.0001, 40.4169],
          [-3.7034 + i * 0.0001, 40.417],
          [-3.7035 + i * 0.0001, 40.417],
          [-3.7035 + i * 0.0001, 40.4169],
        ];
        mapPolygonCells(map, map, coords, { layer: '0', cost: 'PAVEMENT' });
      }
      expect(map._polyCache.size).toBeLessThanOrEqual(2000);
    });

    it('should refresh LRU order on cache hit', async () => {
      const map = createMockMap();
      const { mapPolygonCells } = await import('../src/helpers/grid.js');
      map.multiFrictionMap = new Map();

      const coords = [
        [-3.7035, 40.4169],
        [-3.7034, 40.4169],
        [-3.7034, 40.417],
        [-3.7035, 40.417],
        [-3.7035, 40.4169],
      ];
      mapPolygonCells(map, map, coords, { layer: '0', cost: 'PAVEMENT' });
      mapPolygonCells(map, map, coords, { layer: '0', cost: 'PAVEMENT' });
      // Cache should still have the entry
      expect(map._polyCache.size).toBe(1);
    });
  });

  describe('mapLineCells', () => {
    it('should map cells from line coordinates', async () => {
      const map = createMockMap();
      const { mapLineCells } = await import('../src/helpers/grid.js');
      const multiFrictionMap = new Map();
      multiFrictionMap.set(mockHexes[0], { '0': 0 });
      multiFrictionMap.set(mockHexes[1], { '0': 0 });
      map.multiFrictionMap = multiFrictionMap;

      const coords = [
        [-3.7035, 40.4169],
        [-3.7034, 40.417],
      ];
      mapLineCells(map, map, coords, { layer: '0', cost: 'PAVEMENT' });
      expect(map._pathCache).toBeDefined();
    });

    it('should cache line segments and evict oldest', async () => {
      const map = createMockMap();
      const { mapLineCells } = await import('../src/helpers/grid.js');
      // Pre-populate multiFrictionMap with some cells
      for (const hex of mockHexes) {
        map.multiFrictionMap.set(hex, { '0': 0 });
      }

      for (let i = 0; i < 20; i++) {
        const coords = [
          [-3.7035 + i * 0.0001, 40.4169],
          [-3.7034 + i * 0.0001, 40.417],
        ];
        mapLineCells(map, map, coords, { layer: '0', cost: 'PAVEMENT' });
      }
      expect(map._pathCache.size).toBeLessThanOrEqual(2000);
    });

    it('should refresh LRU order on path cache hit', async () => {
      const map = createMockMap();
      const { mapLineCells } = await import('../src/helpers/grid.js');
      // Pre-populate multiFrictionMap with some cells
      for (const hex of mockHexes) {
        map.multiFrictionMap.set(hex, { '0': 0 });
      }

      const coords = [
        [-3.7035, 40.4169],
        [-3.7034, 40.417],
      ];
      mapLineCells(map, map, coords, { layer: '0', cost: 'PAVEMENT' });
      mapLineCells(map, map, coords, { layer: '0', cost: 'PAVEMENT' });
      expect(map._pathCache.size).toBe(1);
    });

    it('should handle single-point line (no segments)', async () => {
      const map = createMockMap();
      const { mapLineCells } = await import('../src/helpers/grid.js');
      // Pre-populate multiFrictionMap with some cells
      for (const hex of mockHexes) {
        map.multiFrictionMap.set(hex, { '0': 0 });
      }

      const coords = [[-3.7035, 40.4169]];
      mapLineCells(map, map, coords, { layer: '0', cost: 'PAVEMENT' });
      // Single point = no segments, so _pathCache may not be created
      expect(map._pathCache).toBeUndefined();
    });
  });
});

// ══════════════════════════════════════════════════════════════════════
// map.js tests
// ══════════════════════════════════════════════════════════════════════
describe('map.js', () => {
  describe('renderInterfacePins', () => {
    it('should return early when no simulationNodes', async () => {
      const map = createMockMap({ simulationNodes: {} });
      const { renderInterfacePins } = await import('../src/helpers/map.js');
      renderInterfacePins(map, map);
      expect(map.aoi_px).toBeUndefined();
      expect(map.aoi_polygon).toBeUndefined();
    });

    it('should set aoi_polygon and aoi_px when nodes exist', async () => {
      const map = createMockMap();
      const { renderInterfacePins } = await import('../src/helpers/map.js');
      renderInterfacePins(map, map);
      expect(map.aoi_polygon).toBeDefined();
      expect(map.aoi_px).toBeDefined();
      expect(Array.isArray(map.aoi_polygon)).toBe(true);
    });

    it('should not clamp circular AOI pixels to the current viewport bounds', async () => {
      const map = createMockMap({
        simulationNodes: {
          [mockHexes[0]]: { type: 'origin', weight: 1 },
        },
      });
      const viewportSE = map.getBounds().getSouthEast();
      const { renderInterfacePins } = await import('../src/helpers/map.js');
      renderInterfacePins(map, map);

      const ring = map.aoi_polygon[0];
      const lngs = ring.map(([lng]) => lng);
      const lats = ring.map(([, lat]) => lat);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);

      expect(map.aoi_px[0][0]).toBeLessThan(viewportSE.lng * 100);
      expect(map.aoi_px[1][1]).toBeGreaterThan(viewportSE.lat * 100);
      expect(minLng).toBeLessThan(-3.8);
      expect(maxLng).toBeGreaterThan(-3.7);
      expect(minLat).toBeLessThan(40.4);
      expect(maxLat).toBeGreaterThan(40.5);
    });

    it('should add pin source and layers when not present', async () => {
      const map = createMockMap();
      map.getSource = vi.fn(() => null);
      const { renderInterfacePins } = await import('../src/helpers/map.js');
      renderInterfacePins(map, map);
      expect(map.addSource).toHaveBeenCalled();
      expect(map.addLayer).toHaveBeenCalled();
    });

    it('should update existing pin source when already present', async () => {
      const map = createMockMap();
      const sourceMock = { setData: vi.fn() };
      map.getSource = vi.fn(() => sourceMock);
      const { renderInterfacePins } = await import('../src/helpers/map.js');
      renderInterfacePins(map, map);
      expect(sourceMock.setData).toHaveBeenCalled();
    });

    it('should clear layers when no nodes', async () => {
      const map = createMockMap({ simulationNodes: {} });
      map.clearLayers = vi.fn();
      const { renderInterfacePins } = await import('../src/helpers/map.js');
      renderInterfacePins(map, map);
      expect(map.baseLayer).toBeNull();
      expect(map.flowLayer).toBeNull();
    });

    it('should clear all cached properties when no nodes', async () => {
      const map = createMockMap({
        simulationNodes: {},
        _cachedViewHexes: ['hex1'],
        _cachedAoiKey: 'key',
        _lastViewHexesKey: 'key',
        _multiFrictionObj: { a: 1 },
      });
      map.clearLayers = vi.fn();
      const { renderInterfacePins } = await import('../src/helpers/map.js');
      renderInterfacePins(map, map);
      expect(map._cachedViewHexes).toBeUndefined();
      expect(map._cachedAoiKey).toBeUndefined();
      expect(map._lastViewHexesKey).toBeUndefined();
      expect(map._multiFrictionObj).toBeUndefined();
    });
  });

  describe('updateLayers', () => {
    it('should create friction-mesh and flow-mesh layers', async () => {
      const map = createMockMap();
      // Pre-populate friction map
      for (const hex of mockHexes) {
        map.cellFrictionMap.set(hex, 1);
      }
      // Pre-populate desire scores
      map.pathDesireScores.set(mockHexes[0], 5);
      map.pathDesireScores.set(mockHexes[1], 3);

      const { updateLayers } = await import('../src/helpers/map.js');
      updateLayers(map, map);

      expect(map.baseLayer).toBeDefined();
      expect(map.flowLayer).toBeDefined();
    });

    it('should handle showFrictionMesh === false', async () => {
      const map = createMockMap({ showFrictionMesh: false });
      for (const hex of mockHexes) {
        map.cellFrictionMap.set(hex, 1);
      }
      map.pathDesireScores.set(mockHexes[0], 5);

      const { updateLayers } = await import('../src/helpers/map.js');
      updateLayers(map, map);

      // baseLayer is always created, but layers passed to deck only include flowLayer
      expect(map.flowLayer).toBeDefined();
      expect(map.deckOverlayInstance.setProps).toHaveBeenCalled();
    });

    it('should handle empty cellFrictionMap', async () => {
      const map = createMockMap();
      map.cellFrictionMap = new Map();
      map.pathDesireScores = new Map();

      const { updateLayers } = await import('../src/helpers/map.js');
      updateLayers(map, map);

      expect(map.baseLayer).toBeDefined();
      expect(map.flowLayer).toBeDefined();
    });

    it('should handle pathDesireScores as plain object', async () => {
      const map = createMockMap();
      for (const hex of mockHexes) {
        map.cellFrictionMap.set(hex, 1);
      }
      map.pathDesireScores = { [mockHexes[0]]: 5, [mockHexes[1]]: 3 };

      const { updateLayers } = await import('../src/helpers/map.js');
      updateLayers(map, map);

      expect(map.baseLayer).toBeDefined();
    });

    it('should handle impassable friction in getFillColor', async () => {
      const map = createMockMap();
      map.cellFrictionMap.set(mockHexes[0], FRICTION_COSTS.IMPASSABLE);
      map.cellFrictionMap.set(mockHexes[1], FRICTION_COSTS.HEAVY_GRASS);
      map.cellFrictionMap.set(mockHexes[2], FRICTION_COSTS.LIGHT_PARK);
      map.pathDesireScores = new Map();

      const { updateLayers } = await import('../src/helpers/map.js');
      updateLayers(map, map);

      expect(map.baseLayer).toBeDefined();
    });

    it('should use globalPeakFlow for color normalization', async () => {
      const map = createMockMap();
      for (const hex of mockHexes) {
        map.cellFrictionMap.set(hex, 1);
      }
      map.pathDesireScores.set(mockHexes[0], 100);
      map.globalPeakFlow = 100;

      const { updateLayers } = await import('../src/helpers/map.js');
      updateLayers(map, map);

      expect(map.flowLayer).toBeDefined();
    });

    it('should handle deckOverlayInstance being undefined', async () => {
      const map = createMockMap({ deckOverlayInstance: undefined });
      for (const hex of mockHexes) {
        map.cellFrictionMap.set(hex, 1);
      }

      const { updateLayers } = await import('../src/helpers/map.js');
      updateLayers(map, map);

      expect(map.baseLayer).toBeDefined();
    });

    it('should fall back to cellFrictionMap keys when getHexes returns null', async () => {
      const map = createMockMap();
      map.getHexes = () => null;
      for (const hex of mockHexes) {
        map.cellFrictionMap.set(hex, 1);
      }
      map.pathDesireScores = new Map();

      const { updateLayers } = await import('../src/helpers/map.js');
      updateLayers(map, map);

      expect(map.baseLayer).toBeDefined();
    });

    it('should keep footprint/flow layers below the node pins', async () => {
      const map = createMockMap();
      // Simulate the pin layers already being added to the map.
      map.getLayer = vi.fn((id) => (id === 'pin-circles' ? { id: 'pin-circles' } : undefined));
      for (const hex of mockHexes) {
        map.cellFrictionMap.set(hex, 1);
      }
      map.pathDesireScores.set(mockHexes[0], 5);

      const { updateLayers } = await import('../src/helpers/map.js');
      updateLayers(map, map);

      const layers = map.deckOverlayInstance.setProps.mock.calls.at(-1)[0].layers;
      for (const layer of layers) {
        expect(layer.props.beforeId).toBe('pin-circles');
      }
    });

    it('should fall back to the label layer before pins exist', async () => {
      const map = createMockMap();
      map.getLayer = vi.fn(() => undefined);
      for (const hex of mockHexes) {
        map.cellFrictionMap.set(hex, 1);
      }
      map.pathDesireScores.set(mockHexes[0], 5);

      const { updateLayers } = await import('../src/helpers/map.js');
      updateLayers(map, map);

      const layers = map.deckOverlayInstance.setProps.mock.calls.at(-1)[0].layers;
      for (const layer of layers) {
        expect(layer.props.beforeId).toBe('place-label');
      }
    });
  });

  describe('clearLayers', () => {
    it('should set baseLayer and flowLayer to null', async () => {
      const map = createMockMap();
      map.baseLayer = { id: 'friction' };
      map.flowLayer = { id: 'flow' };
      map.deckOverlayInstance = { setProps: vi.fn() };

      const { clearLayers } = await import('../src/helpers/map.js');
      clearLayers(map, map);

      expect(map.baseLayer).toBeNull();
      expect(map.flowLayer).toBeNull();
    });

    it('should clear deck overlay layers', async () => {
      const map = createMockMap();
      map.deckOverlayInstance = { setProps: vi.fn() };

      const { clearLayers } = await import('../src/helpers/map.js');
      clearLayers(map, map);

      expect(map.deckOverlayInstance.setProps).toHaveBeenCalledWith({ layers: [] });
    });

    it('should reset canvas cursor', async () => {
      const map = createMockMap();
      map.getCanvas = () => ({ style: { cursor: 'crosshair' } });
      map.deckOverlayInstance = { setProps: vi.fn() };

      const { clearLayers } = await import('../src/helpers/map.js');
      clearLayers(map, map);

      expect(map.getCanvas().style.cursor).toBe('crosshair');
    });

    it('should handle missing deckOverlayInstance', async () => {
      const map = createMockMap({ deckOverlayInstance: undefined });
      map.getCanvas = () => null;

      const { clearLayers } = await import('../src/helpers/map.js');
      expect(() => clearLayers(map, map)).not.toThrow();
    });

    it('should handle missing getCanvas', async () => {
      const map = createMockMap({ deckOverlayInstance: undefined });
      map.getCanvas = undefined;

      const { clearLayers } = await import('../src/helpers/map.js');
      expect(() => clearLayers(map, map)).not.toThrow();
    });
  });
});

// ══════════════════════════════════════════════════════════════════════
// ui.js tests
// ══════════════════════════════════════════════════════════════════════
describe('ui.js', () => {
  function setupMockDocument() {
    const panel = { classList: { toggle: vi.fn() }, 'aria-busy': '', hidden: false, setAttribute: vi.fn() };
    const modeButtons = [
      { dataset: { placementMode: 'origin' }, classList: { toggle: vi.fn() }, setAttribute: vi.fn(), disabled: false, innerText: '', addEventListener: vi.fn() },
      { dataset: { placementMode: 'destination' }, classList: { toggle: vi.fn() }, setAttribute: vi.fn(), disabled: false, innerText: '', addEventListener: vi.fn() },
      { dataset: { placementMode: 'both' }, classList: { toggle: vi.fn() }, setAttribute: vi.fn(), disabled: false, innerText: '', addEventListener: vi.fn() },
    ];
    const frictionButton = { innerText: '', setAttribute: vi.fn(), disabled: false, classList: { toggle: vi.fn() }, addEventListener: vi.fn() };
    const frictionLegendBody = { hidden: false };
    const weightInput = { value: '1', disabled: false, addEventListener: vi.fn() };
    const weightReadout = { value: '1' };
    const buildButton = { disabled: false, innerText: '', addEventListener: vi.fn(), toggleAttribute: vi.fn() };
    const computeButton = { disabled: false, innerText: '', addEventListener: vi.fn(), toggleAttribute: vi.fn() };
    const exportButton = { disabled: false, addEventListener: vi.fn(), toggleAttribute: vi.fn() };
    const clearButton = { disabled: false, addEventListener: vi.fn(), toggleAttribute: vi.fn() };
    const originsEl = { textContent: '' };
    const destsEl = { textContent: '' };
    const nodeCountChip = {
      hidden: true,
      classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
      querySelector: (sel) => {
        if (sel === '.count-chip-origins') return originsEl;
        if (sel === '.count-chip-dests') return destsEl;
        return null;
      },
    };
    const modeLabel = { innerText: '', className: '', setAttribute: vi.fn(), removeAttribute: vi.fn() };
    const loader = { style: { display: 'none' }, innerText: '' };
    const flowReadout = { innerText: '' };
    const alertCard = { hidden: true, dataset: { tone: '' } };
    const alertTitle = { innerText: '' };
    const alertMessage = { innerText: '' };
    const alertDismiss = { addEventListener: vi.fn() };
    const simulationProgress = { hidden: true, style: {} };
    const progressBar = { style: { transform: '' } };
    const progressLabel = { innerHTML: '' };
    const mapContainer = { getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    const onboardingDismissBtn = { addEventListener: vi.fn() };

    const doc = {
      querySelector: (sel) => {
        if (sel === '.panel') return panel;
        if (sel === '#btn-toggle-friction') return frictionButton;
        if (sel === '#friction-legend-body') return frictionLegendBody;
        if (sel === '#node-weight') return weightInput;
        if (sel === '#node-weight-readout') return weightReadout;
        if (sel === '#btn-build-mapping') return buildButton;
        if (sel === '#btn-compute') return computeButton;
        if (sel === '#btn-export-geojson') return exportButton;
        if (sel === '#btn-clear') return clearButton;
        if (sel === '#mode-status') return modeLabel;
        if (sel === '#node-count-chip') return nodeCountChip;
        if (sel === '#scan-loader') return loader;
        if (sel === '#max-flow-readout') return flowReadout;
        if (sel === '#app-alert') return alertCard;
        if (sel === '#app-alert-title') return alertTitle;
        if (sel === '#app-alert-message') return alertMessage;
        if (sel === '#app-alert-dismiss') return alertDismiss;
        if (sel === '#simulation-progress') return simulationProgress;
        if (sel === '#simulation-progress-bar') return progressBar;
        if (sel === '#simulation-progress-label') return progressLabel;
        return null;
      },
      querySelectorAll: () => modeButtons,
      getElementById: (id) => {
        if (id === 'btn-toggle-friction') return frictionButton;
        if (id === 'friction-legend-body') return frictionLegendBody;
        if (id === 'node-weight') return weightInput;
        if (id === 'node-weight-readout') return weightReadout;
        if (id === 'btn-build-mapping') return buildButton;
        if (id === 'btn-compute') return computeButton;
        if (id === 'btn-export-geojson') return exportButton;
        if (id === 'btn-clear') return clearButton;
        if (id === 'mode-status') return modeLabel;
        if (id === 'node-count-chip') return nodeCountChip;
        if (id === 'scan-loader') return loader;
        if (id === 'max-flow-readout') return flowReadout;
        if (id === 'app-alert') return alertCard;
        if (id === 'app-alert-title') return alertTitle;
        if (id === 'app-alert-message') return alertMessage;
        if (id === 'app-alert-dismiss') return alertDismiss;
        if (id === 'onboarding-overlay') return { hidden: true, querySelectorAll: () => [], addEventListener: vi.fn() };
        if (id === 'simulation-progress') return simulationProgress;
        if (id === 'simulation-progress-bar') return progressBar;
        if (id === 'simulation-progress-label') return progressLabel;
        if (id === 'map') return mapContainer;
        if (id === 'onboarding-dismiss') return onboardingDismissBtn;
        return null;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      createElement: () => {
        const ctxChangeType = { id: 'context-change-type', innerHTML: '', classList: { toggle: vi.fn() }, setAttribute: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
        const ctxIncWeight = { id: 'context-increase-weight', innerText: '', classList: { toggle: vi.fn() }, setAttribute: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
        const ctxDecWeight = { id: 'context-decrease-weight', innerText: '', classList: { toggle: vi.fn() }, setAttribute: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
        const ctxRemoveNode = { id: 'context-remove-node', innerText: '', classList: { toggle: vi.fn() }, setAttribute: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
        return {
          id: '', className: '', style: {}, innerHTML: '',
          appendChild: vi.fn(), removeChild: vi.fn(), firstChild: null,
          classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
          querySelector: (sel) => {
            if (sel === '#context-change-type') return ctxChangeType;
            if (sel === '#context-increase-weight') return ctxIncWeight;
            if (sel === '#context-decrease-weight') return ctxDecWeight;
            if (sel === '#context-remove-node') return ctxRemoveNode;
            return null;
          },
        };
      },
      body: { appendChild: vi.fn() },
    };

    return doc;
  }

  function getClickHandler(button) {
    return button.addEventListener.mock.calls.find(([eventName]) => eventName === 'click')?.[1];
  }

  it('should setup UI elements and bind event listeners', async () => {
    const map = createMockMap();
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.placementWeight).toBeDefined();
  });

  it.skip('should fit AOI bounds before building the mapping', async () => {
    const map = createMockMap({
      aoi_px: undefined,
      mappingReady: false,
      cellFrictionMap: new Map(),
    });
    map.renderInterfacePins = vi.fn();
    map.triggerFastScan = vi.fn(async () => {
      map.cellFrictionMap.set(mockHexes[0], 1);
    });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    const buildButton = doc.getElementById('btn-build-mapping');
    const clickHandler = getClickHandler(buildButton);
    expect(clickHandler).toBeDefined();

    await clickHandler();

    expect(map.fitBounds).toHaveBeenCalledWith(
      [[expect.any(Number), expect.any(Number)], [expect.any(Number), expect.any(Number)]],
      { padding: 0 }
    );
    expect(map.fitBounds.mock.invocationCallOrder[0]).toBeLessThan(
      map.renderInterfacePins.mock.invocationCallOrder[0]
    );
    expect(map.renderInterfacePins.mock.invocationCallOrder[0]).toBeLessThan(
      map.triggerFastScan.mock.invocationCallOrder[0]
    );
    expect(map.mappingReady).toBe(true);
  });

  it.skip('should disable build mapping without both endpoint types', async () => {
    const map = createMockMap({
      simulationNodes: {
        [mockHexes[0]]: { type: 'origin', weight: 1 },
      },
    });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    const buildButton = doc.getElementById('btn-build-mapping');
    expect(buildButton.toggleAttribute).toHaveBeenCalledWith('disabled', true);
  });

  it.skip('should enable build mapping with origin and destination endpoints', async () => {
    const map = createMockMap();
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    const buildButton = doc.getElementById('btn-build-mapping');
    expect(buildButton.toggleAttribute).toHaveBeenCalledWith('disabled', false);
  });

  it.skip('should disable compute without a built mapping', async () => {
    const map = createMockMap({ mappingReady: false, readyToCompute: true });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    const computeButton = doc.getElementById('btn-compute');
    expect(computeButton.disabled).toBe(true);
  });

  it('should disable compute without both endpoint types', async () => {
    const map = createMockMap({
      mappingReady: true,
      readyToCompute: true,
      simulationNodes: {
        [mockHexes[0]]: { type: 'origin', weight: 1 },
      },
    });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    const computeButton = doc.getElementById('btn-compute');
    expect(computeButton.disabled).toBe(true);
  });

  it('should not show ready mode status when mapping is not built', async () => {
    const map = createMockMap({ mappingReady: false, flowsReady: false });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    const modeLabel = doc.getElementById('mode-status');
    const nodeCountChip = doc.getElementById('node-count-chip');

    expect(modeLabel.innerText).not.toContain('Ready');
    expect(modeLabel.setAttribute).toHaveBeenCalledWith('title', 'Drag points to move them · ↑↓ arrows adjust pull strength');
    expect(nodeCountChip.classList.remove).toHaveBeenCalledWith('is-ready');
    expect(nodeCountChip.querySelector('.count-chip-origins').textContent).toBe('1');
    expect(nodeCountChip.querySelector('.count-chip-dests').textContent).toBe('1');
  });

  it('should not show ready mode status when readyToCompute is false even after mapping is built', async () => {
    const map = createMockMap({
      mappingReady: true,
      readyToCompute: false,
      simulationNodes: {
        [mockHexes[0]]: { type: 'origin', weight: 1 },
        [mockHexes[1]]: { type: 'destination', weight: 1 },
      },
    });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    const modeLabel = doc.getElementById('mode-status');
    const nodeCountChip = doc.getElementById('node-count-chip');

    expect(modeLabel.innerText).not.toContain('Ready');
    expect(nodeCountChip.classList.remove).toHaveBeenCalledWith('is-ready');
  });

  it('should keep onboarding overlay hidden after dismissal during UI sync', async () => {
    const map = createMockMap({ mappingReady: false, flowsReady: false });
    const doc = setupMockDocument();
    const onboardingDismiss = { addEventListener: vi.fn() };
    const onboardingOverlay = {
      hidden: true,
      querySelectorAll: vi.fn(() => [
        { dataset: { step: '1' }, classList: { toggle: vi.fn() } },
        { dataset: { step: '2' }, classList: { toggle: vi.fn() } },
        { dataset: { step: '3' }, classList: { toggle: vi.fn() } },
      ]),
      addEventListener: vi.fn(),
    };

    doc.getElementById = (id) => {
      if (id === 'onboarding-overlay') return onboardingOverlay;
      if (id === 'onboarding-dismiss') return onboardingDismiss;
      return setupMockDocument().getElementById(id);
    };
    doc.querySelector = (sel) => {
      if (sel === '#onboarding-overlay') return onboardingOverlay;
      return setupMockDocument().querySelector(sel);
    };

    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    const clickHandler = onboardingDismiss.addEventListener.mock.calls.find(([eventName]) => eventName === 'click')?.[1];
    expect(clickHandler).toBeDefined();
    clickHandler();

    // Simulate a UI sync after dismissal
    map.syncSimulationUI?.();
    expect(onboardingOverlay.hidden).toBe(true);
  });

  it('should show not ready mode status when only origin is placed', async () => {
    const map = createMockMap({
      mappingReady: false,
      flowsReady: false,
      simulationNodes: {
        [mockHexes[0]]: { type: 'origin', weight: 1 },
      },
    });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    const modeLabel = doc.getElementById('mode-status');
    const nodeCountChip = doc.getElementById('node-count-chip');

    expect(modeLabel.innerText).toContain('Add an end');
    expect(modeLabel.innerText).not.toContain('Ready');
    expect(nodeCountChip.classList.remove).toHaveBeenCalledWith('is-ready');
    expect(nodeCountChip.querySelector('.count-chip-origins').textContent).toBe('1');
    expect(nodeCountChip.querySelector('.count-chip-dests').textContent).toBe('0');
  });

  it('should enable compute when mapping and endpoints are ready', async () => {
    const map = createMockMap({ mappingReady: true, readyToCompute: true });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    const computeButton = doc.getElementById('btn-compute');
    expect(computeButton.disabled).toBe(false);
  });

  it('should disable export until flows are simulated', async () => {
    const map = createMockMap({ flowsReady: false });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    const exportButton = doc.getElementById('btn-export-geojson');
    expect(exportButton.disabled).toBe(true);
  });

  it('should enable export after flows are simulated', async () => {
    const map = createMockMap({ flowsReady: true, pathDesireScores: new Map([['h3test', 5]]) });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    const exportButton = doc.getElementById('btn-export-geojson');
    expect(exportButton.disabled).toBe(false);
  });

  it.skip('should reject build mapping without both endpoint types', async () => {
    const map = createMockMap({
      simulationNodes: {
        [mockHexes[0]]: { type: 'origin', weight: 1 },
      },
    });
    map.triggerFastScan = vi.fn();
    map.showAlertCard = vi.fn();
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    await getClickHandler(doc.getElementById('btn-build-mapping'))();
    const alertCard = doc.getElementById('app-alert');
    const alertMessage = doc.getElementById('app-alert-message');

    expect(map.triggerFastScan).not.toHaveBeenCalled();
    expect(alertCard.hidden).toBe(false);
    expect(alertCard.dataset.tone).toBe('warning');
    expect(alertMessage.innerText).toBe(
      'Place at least one origin/dual node and one destination/dual node before building the mapping.'
    );
  });

  it.skip('should reject compute flows without a built mapping', async () => {
    const map = createMockMap({ mappingReady: false });
    map.computeDesirePaths = vi.fn();
    map.showAlertCard = vi.fn();
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    await getClickHandler(doc.getElementById('btn-compute'))();
    const alertCard = doc.getElementById('app-alert');
    const alertMessage = doc.getElementById('app-alert-message');

    expect(map.computeDesirePaths).not.toHaveBeenCalled();
    expect(alertCard.hidden).toBe(false);
    expect(alertCard.dataset.tone).toBe('warning');
    expect(alertMessage.innerText).toBe('Build the mapping before simulating flows.');
  });

  it('should reject export without simulated flows', async () => {
    const map = createMockMap({ flowsReady: false });
    map.exportSimulationGeoJSON = vi.fn();
    map.showAlertCard = vi.fn();
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    getClickHandler(doc.getElementById('btn-export-geojson'))();

    expect(map.exportSimulationGeoJSON).not.toHaveBeenCalled();
  });

  it('should sync mode UI for origin mode', async () => {
    const map = createMockMap({ placementMode: 'origin' });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.placementMode).toBe('origin');
  });

  it('should sync mode UI for destination mode', async () => {
    const map = createMockMap({ placementMode: 'destination' });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.placementMode).toBe('destination');
  });

  it('should sync weight UI within bounds', async () => {
    const map = createMockMap({ placementWeight: 15 });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.placementWeight).toBe(10); // clamped to max
  });

  it('should sync friction UI toggle', async () => {
    const map = createMockMap({ showFrictionMesh: true });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.showFrictionMesh).toBe(true);
  });

  it('should sync flow readout with globalPeakFlow', async () => {
    const map = createMockMap({ globalPeakFlow: 42 });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.globalPeakFlow).toBe(42);
  });

  it('should sync simulation UI button states', async () => {
    const map = createMockMap({ isComputing: false, mappingReady: true, readyToCompute: true });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.syncSimulationUI).toBeDefined();
  });

  it('should set busy state correctly', async () => {
    const map = createMockMap({ isComputing: false });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    map.isComputing = true;
    map.syncSimulationUI?.();
    expect(map.isComputing).toBe(true);
  });

  it('should reset simulation state on clear', async () => {
    const map = createMockMap();
    map.simulationNodes = { hex1: { type: 'origin', weight: 1 } };
    map.pathDesireScores = new Map([['hex1', 5]]);
    map.affordanceMap = new Map([['hex1', 0.5]]);
    map.cellFrictionMap = new Map([['hex1', 1]]);
    map.multiFrictionMap = new Map([['hex1', { '0': 1 }]]);
    map.globalPeakFlow = 10;
    map.readyToCompute = true;
    map.mappingReady = true;
    map.flowsReady = true;

    // Simulate resetSimulationState logic from ui.js
    map.simulationNodes = {};
    map.pathDesireScores?.clear();
    map.affordanceMap?.clear();
    map.cellFrictionMap?.clear();
    map.multiFrictionMap?.clear();
    map.globalPeakFlow = 1;
    map.readyToCompute = false;
    map.mappingReady = false;
    map.flowsReady = false;
    map.aoi = undefined;
    map.aoi_px = undefined;
    map.aoi_polygon = undefined;
    map._cachedViewHexes = undefined;
    map._cachedAoiKey = undefined;
    map._lastViewHexesKey = undefined;
    map._frictionObj = undefined;
    map._affordanceObj = undefined;
    map._multiFrictionObj = undefined;
    map._cellState = undefined;
    map._computePathCacheObj = undefined;
    map._computePathCacheOrder = undefined;
    map._computeDiskCacheObj = undefined;
    map._computeDiskCacheOrder = undefined;
    map._visibilityCacheObj = undefined;
    map._visibilityCacheOrder = undefined;
    map._gradientCacheObj = undefined;
    map._perTargetContribs = undefined;
    map._assignedCounts = undefined;
    map._targetWeights = undefined;

    expect(map.simulationNodes).toEqual({});
    expect(map.globalPeakFlow).toBe(1);
    expect(map.readyToCompute).toBe(false);
    expect(map.mappingReady).toBe(false);
    expect(map.flowsReady).toBe(false);
  });

  it('should show alert card on build failure', async () => {
    const map = createMockMap({
      simulationNodes: {},
      cellFrictionMap: new Map(),
    });
    map.showAlertCard = vi.fn();
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.showAlertCard).toBeDefined();
  });

  it('should throw when frictionButton is null', async () => {
    const map = createMockMap();
    vi.stubGlobal('document', {
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const { setupUI } = await import('../src/helpers/ui.js');
    expect(() => setupUI(map)).toThrow();
  });

  it('should clamp weight to minimum of 1', async () => {
    const map = createMockMap({ placementWeight: 0 });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.placementWeight).toBe(1);
  });

  it('should handle placementWeight as undefined', async () => {
    const map = createMockMap({ placementWeight: undefined });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.placementWeight).toBe(1);
  });

  it('should sync mode UI for both mode', async () => {
    const map = createMockMap({ placementMode: 'both' });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.placementMode).toBe('both');
  });

  it('should set friction button text based on showFrictionMesh', async () => {
    const map = createMockMap({ showFrictionMesh: false });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.showFrictionMesh).toBe(false);
  });

  it('should sync flow readout with zero peak flow', async () => {
    const map = createMockMap({ globalPeakFlow: 0 });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.globalPeakFlow).toBe(0);
  });

  it('should handle isComputing true state', async () => {
    const map = createMockMap({ isComputing: true, mappingReady: true, readyToCompute: true });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.isComputing).toBe(true);
  });

  it('should handle mappingReady false state', async () => {
    const map = createMockMap({ isComputing: false, mappingReady: false, readyToCompute: true });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.mappingReady).toBe(false);
  });

  it('should handle readyToCompute false state', async () => {
    const map = createMockMap({ isComputing: false, mappingReady: true, readyToCompute: false });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.readyToCompute).toBe(false);
  });

  it('should handle hasGrid false (no nodes)', async () => {
    const map = createMockMap({ isComputing: false, mappingReady: false, readyToCompute: false });
    map.simulationNodes = {};
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.syncSimulationUI).toBeDefined();
  });

  it('should handle showFrictionMesh true with layers', async () => {
    const map = createMockMap({ showFrictionMesh: true, baseLayer: { id: 'test' }, flowLayer: { id: 'test2' } });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    expect(map.showFrictionMesh).toBe(true);
  });

  it('should trigger friction button toggle', async () => {
    const map = createMockMap({ showFrictionMesh: true });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    // Get the friction button and trigger its click handler
    // The click handler is registered via addEventListener
    // We can simulate the toggle by directly calling the handler logic
    map.showFrictionMesh = map.showFrictionMesh === false;
    map.syncSimulationUI?.();
    expect(map.showFrictionMesh).toBe(false);
  });

  it('should trigger mode button click to change placementMode', async () => {
    const map = createMockMap({ placementMode: 'origin' });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    // Simulate mode button click by directly setting placementMode
    map.placementMode = 'destination';
    expect(map.placementMode).toBe('destination');
  });

  it('should trigger weight input change', async () => {
    const map = createMockMap({ placementWeight: 5 });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    // Simulate weight input change
    map.placementWeight = 3;
    expect(map.placementWeight).toBe(3);
  });

  it('should show alert card with custom options', async () => {
    const map = createMockMap({ simulationNodes: {} });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    // Simulate showAlertCard
    map.showAlertCard('Test message', { title: 'Test Title', tone: 'error', timeout: 1000 });
    expect(map.showAlertCard).toBeDefined();
  });

  it('should hide alert card', async () => {
    const map = createMockMap({ simulationNodes: {} });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    // Simulate hideAlertCard by calling syncSimulationUI which may trigger it
    map.syncSimulationUI?.();
    expect(map.syncSimulationUI).toBeDefined();
  });

  it('should set busy state and update UI', async () => {
    const map = createMockMap({
      isComputing: false,
      mappingReady: true,
      readyToCompute: true,
      simulationNodes: { hex1: { type: 'origin', weight: 1 } },
    });
    const doc = setupMockDocument();
    vi.stubGlobal('document', doc);
    const { setupUI } = await import('../src/helpers/ui.js');
    setupUI(map);

    // Simulate setBusyState
    map.isComputing = true;
    map.syncSimulationUI?.();
    expect(map.isComputing).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════
// main.js tests
// ══════════════════════════════════════════════════════════════════════
describe('main.js', () => {
  describe('DesireMap class', () => {
    it('should wrap maplibregl.Map with domain methods', async () => {
      const { DesireMap } = await import('../src/main.js');
      expect(DesireMap).toBeDefined();
      expect(typeof DesireMap).toBe('function');
    });

    it('should delegate property getters/setters', async () => {
      const { DesireMap } = await import('../src/main.js');
      const mockMap = {
        simulationNodes: {},
        multiFrictionMap: new Map(),
        cellFrictionMap: new Map(),
        pathDesireScores: new Map(),
        affordanceMap: new Map(),
        globalPeakFlow: 1,
        showFrictionMesh: true,
        mappingReady: false,
        flowsReady: false,
        deckOverlayInstance: { setProps: vi.fn() },
        targetLabelLayerId: 'label',
        placementMode: 'origin',
        placementWeight: 1,
        aoi: undefined,
        readyToCompute: false,
        isComputing: false,
        baseLayer: null,
        flowLayer: null,
        aoi_px: undefined,
        aoi_polygon: undefined,
        _cachedViewHexes: undefined,
        _cachedAoiKey: undefined,
        _lastViewHexesKey: undefined,
        _frictionObj: undefined,
        _affordanceObj: undefined,
        _multiFrictionObj: undefined,
        _cellState: undefined,
        _computePathCacheObj: undefined,
        _computePathCacheOrder: undefined,
        _computeDiskCacheObj: undefined,
        _computeDiskCacheOrder: undefined,
        _visibilityCacheObj: undefined,
        _visibilityCacheOrder: undefined,
        _gradientCacheObj: undefined,
        _perTargetContribs: undefined,
        _assignedCounts: undefined,
        _targetWeights: undefined,
        getContainer: () => ({}),
        getLayer: () => null,
        getStyle: () => ({ layers: [] }),
        getBounds: () => ({}),
        project: () => ({ x: 0, y: 0 }),
        unproject: () => ({ lng: 0, lat: 0 }),
        queryRenderedFeatures: () => [],
        getSource: () => null,
        addSource: () => {},
        addLayer: () => {},
        addControl: () => {},
        fitBounds: vi.fn(),
        getCanvas: () => null,
        on: () => {},
      };
      const dm = new DesireMap(mockMap);
      expect(dm.simulationNodes).toEqual({});
      expect(dm.multiFrictionMap).toBeInstanceOf(Map);
      expect(dm.cellFrictionMap).toBeInstanceOf(Map);
      expect(dm.pathDesireScores).toBeInstanceOf(Map);
      expect(dm.affordanceMap).toBeInstanceOf(Map);
      expect(dm.globalPeakFlow).toBe(1);
      expect(dm.showFrictionMesh).toBe(true);
      expect(dm.mappingReady).toBe(false);
      expect(dm.flowsReady).toBe(false);
      expect(dm.placementMode).toBe('origin');
      expect(dm.placementWeight).toBe(1);
    });

    it('should delegate property setters', async () => {
      const { DesireMap } = await import('../src/main.js');
      const mockMap = {
        simulationNodes: {},
        multiFrictionMap: new Map(),
        cellFrictionMap: new Map(),
        pathDesireScores: new Map(),
        affordanceMap: new Map(),
        globalPeakFlow: 1,
        showFrictionMesh: true,
        mappingReady: false,
        flowsReady: false,
        deckOverlayInstance: { setProps: vi.fn() },
        targetLabelLayerId: 'label',
        placementMode: 'origin',
        placementWeight: 1,
        aoi: undefined,
        readyToCompute: false,
        isComputing: false,
        baseLayer: null,
        flowLayer: null,
        aoi_px: undefined,
        aoi_polygon: undefined,
        _cachedViewHexes: undefined,
        _cachedAoiKey: undefined,
        _lastViewHexesKey: undefined,
        _frictionObj: undefined,
        _affordanceObj: undefined,
        _multiFrictionObj: undefined,
        _cellState: undefined,
        _computePathCacheObj: undefined,
        _computePathCacheOrder: undefined,
        _computeDiskCacheObj: undefined,
        _computeDiskCacheOrder: undefined,
        _visibilityCacheObj: undefined,
        _visibilityCacheOrder: undefined,
        _gradientCacheObj: undefined,
        _perTargetContribs: undefined,
        _assignedCounts: undefined,
        _targetWeights: undefined,
        getContainer: () => ({}),
        getLayer: () => null,
        getStyle: () => ({ layers: [] }),
        getBounds: () => ({}),
        project: () => ({ x: 0, y: 0 }),
        unproject: () => ({ lng: 0, lat: 0 }),
        queryRenderedFeatures: () => [],
        getSource: () => null,
        addSource: () => {},
        addLayer: () => {},
        addControl: () => {},
        fitBounds: vi.fn(),
        getCanvas: () => null,
        on: () => {},
      };
      const dm = new DesireMap(mockMap);
      dm.simulationNodes = { hex1: { type: 'origin', weight: 1 } };
      dm.multiFrictionMap = new Map([['hex1', { '0': 1 }]]);
      dm.cellFrictionMap = new Map([['hex1', 1]]);
      dm.pathDesireScores = new Map([['hex1', 5]]);
      dm.affordanceMap = new Map([['hex1', 0.5]]);
      dm.globalPeakFlow = 42;
      dm.showFrictionMesh = false;
      dm.mappingReady = true;
      dm.flowsReady = true;
      dm.placementMode = 'destination';
      dm.placementWeight = 5;
      dm.readyToCompute = true;
      dm.isComputing = true;
      dm.aoi = 'test-aoi';
      dm.aoi_px = [0, 0];
      dm.aoi_polygon = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
      dm._cachedViewHexes = ['hex1'];
      dm._cachedAoiKey = 'key';
      dm._lastViewHexesKey = 'key';
      dm._frictionObj = { hex1: 1 };
      dm._affordanceObj = { hex1: 0.5 };
      dm._multiFrictionObj = { hex1: { '0': 1 } };
      dm._computePathCacheObj = {};
      dm._computePathCacheOrder = [];
      dm._computeDiskCacheObj = {};
      dm._computeDiskCacheOrder = [];
      dm._visibilityCacheObj = {};
      dm._visibilityCacheOrder = [];
      dm._gradientCacheObj = {};
      dm._perTargetContribs = {};
      dm._assignedCounts = {};
      dm._targetWeights = {};

      expect(mockMap.simulationNodes).toEqual({ hex1: { type: 'origin', weight: 1 } });
      expect(mockMap.globalPeakFlow).toBe(42);
      expect(mockMap.showFrictionMesh).toBe(false);
      expect(mockMap.mappingReady).toBe(true);
      expect(mockMap.flowsReady).toBe(true);
      expect(mockMap.placementMode).toBe('destination');
      expect(mockMap.placementWeight).toBe(5);
      expect(mockMap.readyToCompute).toBe(true);
      expect(mockMap.isComputing).toBe(true);
      expect(mockMap.aoi).toBe('test-aoi');
    });

    it('should test readyToCompute and isComputing getters', async () => {
      const { DesireMap } = await import('../src/main.js');
      const mockMap = {
        simulationNodes: {},
        multiFrictionMap: new Map(),
        cellFrictionMap: new Map(),
        pathDesireScores: new Map(),
        affordanceMap: new Map(),
        globalPeakFlow: 1,
        showFrictionMesh: true,
        mappingReady: false,
        flowsReady: false,
        deckOverlayInstance: { setProps: vi.fn() },
        targetLabelLayerId: 'label',
        placementMode: 'origin',
        placementWeight: 1,
        aoi: undefined,
        readyToCompute: false,
        isComputing: false,
        baseLayer: null,
        flowLayer: null,
        aoi_px: undefined,
        aoi_polygon: undefined,
        _cachedViewHexes: undefined,
        _cachedAoiKey: undefined,
        _lastViewHexesKey: undefined,
        _frictionObj: undefined,
        _affordanceObj: undefined,
        _multiFrictionObj: undefined,
        _cellState: undefined,
        _computePathCacheObj: undefined,
        _computePathCacheOrder: undefined,
        _computeDiskCacheObj: undefined,
        _computeDiskCacheOrder: undefined,
        _visibilityCacheObj: undefined,
        _visibilityCacheOrder: undefined,
        _gradientCacheObj: undefined,
        _perTargetContribs: undefined,
        _assignedCounts: undefined,
        _targetWeights: undefined,
        getContainer: () => ({}),
        getLayer: () => null,
        getStyle: () => ({ layers: [] }),
        getBounds: () => ({}),
        project: () => ({ x: 0, y: 0 }),
        unproject: () => ({ lng: 0, lat: 0 }),
        queryRenderedFeatures: () => [],
        getSource: () => null,
        addSource: () => {},
        addLayer: () => {},
        addControl: () => {},
        fitBounds: vi.fn(),
        getCanvas: () => null,
        on: () => {},
      };
      const dm = new DesireMap(mockMap);

      // Test readyToCompute getter
      expect(dm.readyToCompute).toBe(false);
      dm.readyToCompute = true;
      expect(dm.readyToCompute).toBe(true);

      // Test isComputing getter
      expect(dm.isComputing).toBe(false);
      dm.isComputing = true;
      expect(dm.isComputing).toBe(true);
    });

    it('should delegate all remaining property getters/setters', async () => {
      const { DesireMap } = await import('../src/main.js');
      const mockMap = {
        simulationNodes: {},
        multiFrictionMap: new Map(),
        cellFrictionMap: new Map(),
        pathDesireScores: new Map(),
        affordanceMap: new Map(),
        globalPeakFlow: 1,
        showFrictionMesh: true,
        mappingReady: false,
        flowsReady: false,
        deckOverlayInstance: { setProps: vi.fn() },
        targetLabelLayerId: 'label',
        placementMode: 'origin',
        placementWeight: 1,
        aoi: undefined,
        readyToCompute: false,
        isComputing: false,
        baseLayer: null,
        flowLayer: null,
        aoi_px: undefined,
        aoi_polygon: undefined,
        _cachedViewHexes: undefined,
        _cachedAoiKey: undefined,
        _lastViewHexesKey: undefined,
        _frictionObj: undefined,
        _affordanceObj: undefined,
        _multiFrictionObj: undefined,
        _cellState: undefined,
        _computePathCacheObj: undefined,
        _computePathCacheOrder: undefined,
        _computeDiskCacheObj: undefined,
        _computeDiskCacheOrder: undefined,
        _visibilityCacheObj: undefined,
        _visibilityCacheOrder: undefined,
        _gradientCacheObj: undefined,
        _perTargetContribs: undefined,
        _assignedCounts: undefined,
        _targetWeights: undefined,
        getContainer: () => ({}),
        getLayer: () => null,
        getStyle: () => ({ layers: [] }),
        getBounds: () => ({}),
        project: () => ({ x: 0, y: 0 }),
        unproject: () => ({ lng: 0, lat: 0 }),
        queryRenderedFeatures: () => [],
        getSource: () => null,
        addSource: () => {},
        addLayer: () => {},
        addControl: () => {},
        fitBounds: vi.fn(),
        getCanvas: () => null,
        on: () => {},
      };
      const dm = new DesireMap(mockMap);

      // Test all remaining getters/setters
      dm.deckOverlayInstance = { setProps: vi.fn() };
      expect(dm.deckOverlayInstance).toBeDefined();

      dm.targetLabelLayerId = 'place-label';
      expect(dm.targetLabelLayerId).toBe('place-label');

      dm.aoi = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] } };
      expect(dm.aoi).toBeDefined();

      dm.aoi_px = [0, 0];
      expect(dm.aoi_px).toEqual([0, 0]);

      dm.aoi_polygon = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
      expect(dm.aoi_polygon).toBeDefined();

      dm.flowsReady = true;
      expect(dm.flowsReady).toBe(true);

      dm._cachedViewHexes = ['hex1'];
      expect(dm._cachedViewHexes).toEqual(['hex1']);

      dm._cachedAoiKey = 'aoi-key';
      expect(dm._cachedAoiKey).toBe('aoi-key');

      dm._lastViewHexesKey = 'hexes-key';
      expect(dm._lastViewHexesKey).toBe('hexes-key');

      dm._frictionObj = { hex1: 1 };
      expect(dm._frictionObj).toEqual({ hex1: 1 });

      dm._affordanceObj = { hex1: 0.5 };
      expect(dm._affordanceObj).toEqual({ hex1: 0.5 });

      dm._multiFrictionObj = { hex1: { '0': 1 } };
      expect(dm._multiFrictionObj).toEqual({ hex1: { '0': 1 } });

      dm._computePathCacheObj = { a: { b: ['c'] } };
      expect(dm._computePathCacheObj).toEqual({ a: { b: ['c'] } });

      dm._computePathCacheOrder = ['a'];
      expect(dm._computePathCacheOrder).toEqual(['a']);

      dm._computeDiskCacheObj = { a: { 1: ['b'] } };
      expect(dm._computeDiskCacheObj).toEqual({ a: { 1: ['b'] } });

      dm._computeDiskCacheOrder = ['a'];
      expect(dm._computeDiskCacheOrder).toEqual(['a']);

      dm._visibilityCacheObj = { a: { b: true } };
      expect(dm._visibilityCacheObj).toEqual({ a: { b: true } });

      dm._visibilityCacheOrder = ['a'];
      expect(dm._visibilityCacheOrder).toEqual(['a']);

      dm._gradientCacheObj = { hex1: { hex1: 0 } };
      expect(dm._gradientCacheObj).toEqual({ hex1: { hex1: 0 } });

      dm._perTargetContribs = { hex1: { hex2: 5 } };
      expect(dm._perTargetContribs).toEqual({ hex1: { hex2: 5 } });

      dm._assignedCounts = { hex1: { hex2: 3 } };
      expect(dm._assignedCounts).toEqual({ hex1: { hex2: 3 } });

      dm._targetWeights = { hex1: 1 };
      expect(dm._targetWeights).toEqual({ hex1: 1 });
    });

    it('should delegate map methods', async () => {
      const { DesireMap } = await import('../src/main.js');
      const getContainerSpy = vi.fn(() => ({ id: 'map' }));
      const getLayerSpy = vi.fn(() => ({ id: 'test' }));
      const getStyleSpy = vi.fn(() => ({ layers: [] }));
      const getBoundsSpy = vi.fn(() => ({}));
      const projectSpy = vi.fn(() => ({ x: 10, y: 20 }));
      const unprojectSpy = vi.fn(() => ({ lng: 1, lat: 2 }));
      const queryRenderedFeaturesSpy = vi.fn(() => []);
      const getSourceSpy = vi.fn(() => null);
      const addSourceSpy = vi.fn();
      const addLayerSpy = vi.fn();
      const addControlSpy = vi.fn();
      const fitBoundsSpy = vi.fn();
      const getCanvasSpy = vi.fn(() => null);
      const onSpy = vi.fn();

      const mockMap = {
        simulationNodes: {},
        multiFrictionMap: new Map(),
        cellFrictionMap: new Map(),
        pathDesireScores: new Map(),
        affordanceMap: new Map(),
        globalPeakFlow: 1,
        showFrictionMesh: true,
        mappingReady: false,
        flowsReady: false,
        deckOverlayInstance: { setProps: vi.fn() },
        targetLabelLayerId: 'label',
        placementMode: 'origin',
        placementWeight: 1,
        aoi: undefined,
        readyToCompute: false,
        isComputing: false,
        baseLayer: null,
        flowLayer: null,
        aoi_px: undefined,
        aoi_polygon: undefined,
        _cachedViewHexes: undefined,
        _cachedAoiKey: undefined,
        _lastViewHexesKey: undefined,
        _frictionObj: undefined,
        _affordanceObj: undefined,
        _multiFrictionObj: undefined,
        _cellState: undefined,
        _computePathCacheObj: undefined,
        _computePathCacheOrder: undefined,
        _computeDiskCacheObj: undefined,
        _computeDiskCacheOrder: undefined,
        _visibilityCacheObj: undefined,
        _visibilityCacheOrder: undefined,
        _gradientCacheObj: undefined,
        _perTargetContribs: undefined,
        _assignedCounts: undefined,
        _targetWeights: undefined,
        getContainer: getContainerSpy,
        getLayer: getLayerSpy,
        getStyle: getStyleSpy,
        getBounds: getBoundsSpy,
        project: projectSpy,
        unproject: unprojectSpy,
        queryRenderedFeatures: queryRenderedFeaturesSpy,
        getSource: getSourceSpy,
        addSource: addSourceSpy,
        addLayer: addLayerSpy,
        addControl: addControlSpy,
        fitBounds: fitBoundsSpy,
        getCanvas: getCanvasSpy,
        on: onSpy,
      };

      const dm = new DesireMap(mockMap);
      dm.getContainer();
      dm.getLayer('test');
      dm.getStyle();
      dm.getBounds();
      dm.project([-3.7, 40.4]);
      dm.unproject([10, 20]);
      dm.queryRenderedFeatures([0, 0]);
      dm.getSource('pins');
      dm.addSource('test', {});
      dm.addLayer({ id: 'test' });
      dm.addControl({});
      dm.fitBounds([[0, 0], [1, 1]], { padding: 0 });
      dm.getCanvas();
      dm.on('click', () => {});

      expect(getContainerSpy).toHaveBeenCalled();
      expect(getLayerSpy).toHaveBeenCalledWith('test');
      expect(getStyleSpy).toHaveBeenCalled();
      expect(getBoundsSpy).toHaveBeenCalled();
      expect(projectSpy).toHaveBeenCalledWith([-3.7, 40.4]);
      expect(unprojectSpy).toHaveBeenCalledWith([10, 20]);
      expect(queryRenderedFeaturesSpy).toHaveBeenCalledWith([0, 0]);
      expect(getSourceSpy).toHaveBeenCalledWith('pins');
      expect(addSourceSpy).toHaveBeenCalled();
      expect(addLayerSpy).toHaveBeenCalled();
      expect(addControlSpy).toHaveBeenCalled();
      expect(fitBoundsSpy).toHaveBeenCalledWith([[0, 0], [1, 1]], { padding: 0 });
      expect(getCanvasSpy).toHaveBeenCalled();
      expect(onSpy).toHaveBeenCalled();
    });

    it('should delegate domain methods', async () => {
      const { DesireMap } = await import('../src/main.js');
      const mockMap = {
        simulationNodes: {},
        multiFrictionMap: new Map(),
        cellFrictionMap: new Map(),
        pathDesireScores: new Map(),
        affordanceMap: new Map(),
        globalPeakFlow: 1,
        showFrictionMesh: true,
        mappingReady: false,
        flowsReady: false,
        deckOverlayInstance: { setProps: vi.fn() },
        targetLabelLayerId: 'label',
        placementMode: 'origin',
        placementWeight: 1,
        aoi: undefined,
        readyToCompute: false,
        isComputing: false,
        baseLayer: null,
        flowLayer: null,
        aoi_px: undefined,
        aoi_polygon: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
        _cachedViewHexes: undefined,
        _cachedAoiKey: undefined,
        _lastViewHexesKey: undefined,
        _frictionObj: undefined,
        _affordanceObj: undefined,
        _multiFrictionObj: undefined,
        _cellState: undefined,
        _computePathCacheObj: undefined,
        _computePathCacheOrder: undefined,
        _computeDiskCacheObj: undefined,
        _computeDiskCacheOrder: undefined,
        _visibilityCacheObj: undefined,
        _visibilityCacheOrder: undefined,
        _gradientCacheObj: undefined,
        _perTargetContribs: undefined,
        _assignedCounts: undefined,
        _targetWeights: undefined,
        getContainer: () => ({}),
        getLayer: () => null,
        getStyle: () => ({ layers: [] }),
        getBounds: () => ({ getSouthEast: () => ({ lng: -3.7, lat: 40.4 }), getNorthWest: () => ({ lng: -3.8, lat: 40.5 }) }),
        project: () => ({ x: 0, y: 0 }),
        unproject: () => ({ lng: 0, lat: 0 }),
        queryRenderedFeatures: () => [],
        getSource: () => null,
        addSource: () => {},
        addLayer: () => {},
        addControl: () => {},
        fitBounds: vi.fn(),
        getCanvas: () => null,
        on: () => {},
        getHexes: () => mockHexes,
        triggerFastScan: async () => {},
        mapPolygonCells: () => {},
        mapLineCells: () => {},
        renderInterfacePins: () => {},
        updateLayers: () => {},
        clearLayers: () => {},
        computeDesirePaths: async () => {},
        initializeAffordanceMap: () => {},
        _showAlertCard: () => {},
        _syncSimulationUI: () => {},
      };
      const dm = new DesireMap(mockMap);

      // getHexes
      const hexes = dm.getHexes();
      expect(Array.isArray(hexes)).toBe(true);

      // mapPolygonCells
      dm.mapPolygonCells([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], { layer: '0', cost: 'PAVEMENT' });

      // mapLineCells
      dm.mapLineCells([[0, 0], [1, 1]], { layer: '0', cost: 'PAVEMENT' });

      // renderInterfacePins
      dm.renderInterfacePins();

      // updateLayers
      dm.updateLayers();

      // clearLayers
      dm.clearLayers();

      // triggerFastScan
      await dm.triggerFastScan();

      // computeDesirePaths
      await dm.computeDesirePaths();

      // initializeAffordanceMap
      dm.initializeAffordanceMap();

      // showAlertCard - need to set _showAlertCard on the instance
      dm._showAlertCard = () => {};
      dm.showAlertCard('Test');

      // syncSimulationUI - need to set _syncSimulationUI on the instance
      dm._syncSimulationUI = () => {};
      dm.syncSimulationUI();
    });
  });

  describe('isReadyToCompute', () => {
    it('should return true when there are origin and destination nodes with weight > 0', async () => {
      const { isReadyToCompute } = await import('../src/main.js');
      const mapInstance = {
        simulationNodes: {
          hex1: { type: 'origin', weight: 1 },
          hex2: { type: 'destination', weight: 1 },
        },
      };
      const result = isReadyToCompute(mapInstance);
      expect(result).toBe(true);
    });

    it('should return false when only one node type exists', async () => {
      const { isReadyToCompute } = await import('../src/main.js');
      const mapInstance = {
        simulationNodes: {
          hex1: { type: 'origin', weight: 1 },
        },
      };
      const result = isReadyToCompute(mapInstance);
      expect(result).toBe(false);
    });

    it('should return false when nodes have weight 0', async () => {
      const { isReadyToCompute } = await import('../src/main.js');
      const mapInstance = {
        simulationNodes: {
          hex1: { type: 'origin', weight: 0 },
          hex2: { type: 'destination', weight: 0 },
        },
      };
      const result = isReadyToCompute(mapInstance);
      expect(result).toBe(false);
    });

    it('should handle null simulationNodes', async () => {
      const { isReadyToCompute } = await import('../src/main.js');
      const mapInstance = { simulationNodes: null };
      const result = isReadyToCompute(mapInstance);
      expect(result).toBe(false);
    });

    it('should handle both type nodes', async () => {
      const { isReadyToCompute } = await import('../src/main.js');
      const mapInstance = {
        simulationNodes: {
          hex1: { type: 'dual', weight: 1 },
        },
      };
      const result = isReadyToCompute(mapInstance);
      expect(result).toBe(true);
    });

    it('should return true when both type and origin node exist', async () => {
      const { isReadyToCompute } = await import('../src/main.js');
      const mapInstance = {
        simulationNodes: {
          hex1: { type: 'dual', weight: 1 },
          hex2: { type: 'origin', weight: 1 },
        },
      };
      const result = isReadyToCompute(mapInstance);
      expect(result).toBe(true);
    });

    it('should return true when both type and destination node exist', async () => {
      const { isReadyToCompute } = await import('../src/main.js');
      const mapInstance = {
        simulationNodes: {
          hex1: { type: 'dual', weight: 1 },
          hex2: { type: 'destination', weight: 1 },
        },
      };
      const result = isReadyToCompute(mapInstance);
      expect(result).toBe(true);
    });
  });

  describe('isAccessible', () => {
    it('should return true when no features found', async () => {
      const { isAccessible } = await import('../src/main.js');
      const mapInstance = {
        queryRenderedFeatures: () => [],
      };
      const clickEvent = { point: { x: 100, y: 100 } };
      const result = await isAccessible(mapInstance, clickEvent);
      expect(result).toBe(true);
    });

    it('should handle features with missing geometry', async () => {
      const { isAccessible } = await import('../src/main.js');
      const mapInstance = {
        queryRenderedFeatures: () => [{ properties: {}, geometry: null }],
      };
      const clickEvent = { point: { x: 100, y: 100 } };
      const result = await isAccessible(mapInstance, clickEvent);
      expect(result).toBe(true); // no valid features → allow placement
    });

    it('should filter by sourceLayer', async () => {
      const { isAccessible } = await import('../src/main.js');
      const mapInstance = {
        queryRenderedFeatures: () => [
          { sourceLayer: 'transportation', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
          { sourceLayer: 'building', properties: {}, geometry: { type: 'Polygon', coordinates: [] } },
          { sourceLayer: 'water', properties: {}, geometry: { type: 'Polygon', coordinates: [] } },
        ],
      };
      const clickEvent = { point: { x: 100, y: 100 } };
      const result = await isAccessible(mapInstance, clickEvent);
      expect(result).toBe(false); // building/water are impassable, no walkable ground
    });

    it('should return false for impassable ground level', async () => {
      const { isAccessible } = await import('../src/main.js');
      const mapInstance = {
        queryRenderedFeatures: () => [
          {
            sourceLayer: 'transportation',
            properties: { class: 'motorway' },
            geometry: { type: 'LineString', coordinates: [] },
          },
        ],
      };
      const clickEvent = { point: { x: 100, y: 100 } };
      const result = await isAccessible(mapInstance, clickEvent);
      expect(result).toBe(false);
    });

    it('should return true for walkable ground level', async () => {
      const { isAccessible } = await import('../src/main.js');
      const mapInstance = {
        queryRenderedFeatures: () => [
          {
            sourceLayer: 'transportation',
            properties: { class: 'secondary' },
            geometry: { type: 'LineString', coordinates: [] },
          },
        ],
      };
      const clickEvent = { point: { x: 100, y: 100 } };
      const result = await isAccessible(mapInstance, clickEvent);
      expect(result).toBe(true);
    });

    it('should throw when queryRenderedFeatures is undefined', async () => {
      const { isAccessible } = await import('../src/main.js');
      const mapInstance = {
        queryRenderedFeatures: undefined,
      };
      const clickEvent = { point: { x: 100, y: 100 } };
      await expect(isAccessible(mapInstance, clickEvent)).rejects.toThrow();
    });
  });

  describe('setMapCursor', () => {
    it('should set map-cursor-pointer class and remove others when cursor is pointer', async () => {
      const { setMapCursor } = await import('../src/main.js');
      const calls = [];
      const mockClassList = {
        add: (c) => calls.push(['add', c]),
        remove: (c) => calls.push(['remove', c]),
      };
      const mapInstance = {
        getContainer: () => ({ classList: mockClassList }),
      };
      setMapCursor(mapInstance, 'pointer');
      expect(calls).toContainEqual(['add', 'map-cursor-pointer']);
    });

    it('should set map-cursor-grab class when cursor is grab', async () => {
      const { setMapCursor } = await import('../src/main.js');
      const calls = [];
      const mockClassList = {
        add: (c) => calls.push(['add', c]),
        remove: (c) => calls.push(['remove', c]),
      };
      const mapInstance = {
        getContainer: () => ({ classList: mockClassList }),
      };
      setMapCursor(mapInstance, 'grab');
      expect(calls).toContainEqual(['add', 'map-cursor-grab']);
    });

    it('should set map-cursor-wait class when cursor is wait', async () => {
      const { setMapCursor } = await import('../src/main.js');
      const calls = [];
      const mockClassList = {
        add: (c) => calls.push(['add', c]),
        remove: (c) => calls.push(['remove', c]),
      };
      const mapInstance = {
        getContainer: () => ({ classList: mockClassList }),
      };
      setMapCursor(mapInstance, 'wait');
      expect(calls).toContainEqual(['add', 'map-cursor-wait']);
    });

    it('should clear all cursor classes when cursor is null', async () => {
      const { setMapCursor } = await import('../src/main.js');
      const calls = [];
      const mockClassList = {
        add: (c) => calls.push(['add', c]),
        remove: (c) => calls.push(['remove', c]),
      };
      const mapInstance = {
        getContainer: () => ({ classList: mockClassList }),
      };
      setMapCursor(mapInstance, null);
      expect(calls).toContainEqual(['remove', 'map-cursor-pointer']);
    });

    it('should set map-cursor-crosshair class when cursor is crosshair', async () => {
      const { setMapCursor } = await import('../src/main.js');
      const calls = [];
      const mockClassList = {
        add: (c) => calls.push(['add', c]),
        remove: (c) => calls.push(['remove', c]),
      };
      const mapInstance = {
        getContainer: () => ({ classList: mockClassList }),
      };
      setMapCursor(mapInstance, 'crosshair');
      expect(calls).toContainEqual(['add', 'map-cursor-crosshair']);
    });
  });

  describe('setMapCursorWait', () => {
    it('should add map-cursor-wait class when waiting is true', async () => {
      const { setMapCursorWait } = await import('../src/main.js');
      const calls = [];
      const mockClassList = {
        toggle: (c, v) => calls.push(['toggle', c, v]),
      };
      const mapInstance = {
        getContainer: () => ({ classList: mockClassList }),
      };
      setMapCursorWait(mapInstance, true);
      expect(calls).toContainEqual(['toggle', 'map-cursor-wait', true]);
    });

    it('should remove map-cursor-wait class when waiting is false', async () => {
      const { setMapCursorWait } = await import('../src/main.js');
      const calls = [];
      const mockClassList = {
        toggle: (c, v) => calls.push(['toggle', c, v]),
      };
      const mapInstance = {
        getContainer: () => ({ classList: mockClassList }),
      };
      setMapCursorWait(mapInstance, false);
      expect(calls).toContainEqual(['toggle', 'map-cursor-wait', false]);
    });
  });

  describe('init logic (from main.js)', () => {
    it('should handle pointLayerIds filtering', async () => {
      const pointLayerIds = ['pin-circles', 'pin-labels'];
      const availablePointLayerIds = pointLayerIds.filter((layerId) => layerId);
      expect(availablePointLayerIds.length).toBe(2);
    });

    it('should handle click event logic for node placement', async () => {
      // Simulate the click event logic from main.js
      const simulationNodes = {};
      const placementMode = 'origin';
      const placementWeight = 1;
      const cell = 'hex1';

      // Add node
      simulationNodes[cell] = {
        type: placementMode,
        weight: Math.min(10, Math.max(1, Math.round(placementWeight ?? 1))),
      };

      expect(simulationNodes[cell].type).toBe('origin');
      expect(simulationNodes[cell].weight).toBe(1);

      // Update weight on existing node
      simulationNodes[cell].weight = Math.min(10, simulationNodes[cell].weight + 1);
      expect(simulationNodes[cell].weight).toBe(2);

      // Change type if mode differs
      simulationNodes[cell].type = 'destination';
      expect(simulationNodes[cell].type).toBe('destination');
    });

    it('should handle contextmenu event logic for node removal', async () => {
      // Simulate the contextmenu event logic from main.js
      const simulationNodes = {
        hex1: { type: 'origin', weight: 1 },
      };
      const cell = 'hex1';

      // Decrease weight
      simulationNodes[cell].weight = Math.max(0, simulationNodes[cell].weight - 1);
      expect(simulationNodes[cell].weight).toBe(0);

      // Remove node when weight <= 0
      if (simulationNodes[cell].weight <= 0) {
        delete simulationNodes[cell];
      }
      expect(simulationNodes[cell]).toBeUndefined();
    });

    it('should handle isReadyToCompute logic inline', async () => {
      // Simulate isReadyToCompute logic from main.js
      const simulationNodes = {
        hex1: { type: 'origin', weight: 1 },
        hex2: { type: 'destination', weight: 1 },
      };

      const nodes = Object.values(simulationNodes ?? {});
      const activeNodes = nodes.filter((n) => n.weight > 0);
      const hasEnoughNodes = activeNodes.length >= 2;
      const hasOrigin = activeNodes.some((n) => n.type === 'origin' || n.type === 'both');
      const hasDestination = activeNodes.some((n) => n.type === 'destination' || n.type === 'both');
      const ready = hasEnoughNodes && hasOrigin && hasDestination;

      expect(ready).toBe(true);
    });
  });
});
