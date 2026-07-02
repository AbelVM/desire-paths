import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MaplibreGeocoder from '@maplibre/maplibre-gl-geocoder';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
import './style/geocoder.css';
import { latLngToCell } from 'h3-js';
import { MapboxOverlay } from '@deck.gl/mapbox';

import {
  MAP_OPTIONS,
  H3_STRIDE_RESOLUTION,
  FRICTION_COSTS,
  getSurface,
} from './helpers/constants.js';
import { getHexes, triggerFastScan, mapPolygonCells, mapLineCells } from './helpers/grid.js';
import { renderInterfacePins, updateLayers, clearLayers, exportSimulationGeoJSON } from './helpers/map.js';
import { setupUI } from './helpers/ui.js';
import { computeDesirePaths, initializeAffordanceMap } from './helpers/compute.js';

/**
 * DesireMap — wraps a maplibregl.Map with domain methods.
 * Avoids monkey-patching third-party prototypes.
 */
class DesireMap {
  #map;

  constructor(map) {
    this.#map = map;
  }

  // Delegated maplibregl properties
  get simulationNodes() { return this.#map.simulationNodes; }
  set simulationNodes(v) { this.#map.simulationNodes = v; }
  get multiFrictionMap() { return this.#map.multiFrictionMap; }
  set multiFrictionMap(v) { this.#map.multiFrictionMap = v; }
  get cellFrictionMap() { return this.#map.cellFrictionMap; }
  set cellFrictionMap(v) { this.#map.cellFrictionMap = v; }
  get pathDesireScores() { return this.#map.pathDesireScores; }
  set pathDesireScores(v) { this.#map.pathDesireScores = v; }
  get affordanceMap() { return this.#map.affordanceMap; }
  set affordanceMap(v) { this.#map.affordanceMap = v; }
  get globalPeakFlow() { return this.#map.globalPeakFlow; }
  set globalPeakFlow(v) { this.#map.globalPeakFlow = v; }
  get showFrictionMesh() { return this.#map.showFrictionMesh; }
  set showFrictionMesh(v) { this.#map.showFrictionMesh = v; }
  get mappingReady() { return this.#map.mappingReady; }
  set mappingReady(v) { this.#map.mappingReady = v; }
  get flowsReady() { return this.#map.flowsReady; }
  set flowsReady(v) { this.#map.flowsReady = v; }
  get deckOverlayInstance() { return this.#map.deckOverlayInstance; }
  set deckOverlayInstance(v) { this.#map.deckOverlayInstance = v; }
  get targetLabelLayerId() { return this.#map.targetLabelLayerId; }
  set targetLabelLayerId(v) { this.#map.targetLabelLayerId = v; }
  get placementMode() { return this.#map.placementMode; }
  set placementMode(v) { this.#map.placementMode = v; }
  get placementWeight() { return this.#map.placementWeight; }
  set placementWeight(v) { this.#map.placementWeight = v; }
  get dragOccurred() { return this.#map.dragOccurred; }
  set dragOccurred(v) { this.#map.dragOccurred = v; }
  get aoi() { return this.#map.aoi; }
  set aoi(v) { this.#map.aoi = v; }
  get readyToCompute() { return this.#map.readyToCompute; }
  set readyToCompute(v) { this.#map.readyToCompute = v; }
  get isComputing() { return this.#map.isComputing; }
  set isComputing(v) { this.#map.isComputing = v; }
  get baseLayer() { return this.#map.baseLayer; }
  set baseLayer(v) { this.#map.baseLayer = v; }
  get flowLayer() { return this.#map.flowLayer; }
  set flowLayer(v) { this.#map.flowLayer = v; }
  get aoi_px() { return this.#map.aoi_px; }
  set aoi_px(v) { this.#map.aoi_px = v; }
  get aoi_polygon() { return this.#map.aoi_polygon; }
  set aoi_polygon(v) { this.#map.aoi_polygon = v; }
  get _cachedViewHexes() { return this.#map._cachedViewHexes; }
  set _cachedViewHexes(v) { this.#map._cachedViewHexes = v; }
  get _cachedAoiKey() { return this.#map._cachedAoiKey; }
  set _cachedAoiKey(v) { this.#map._cachedAoiKey = v; }
  get _lastViewHexesKey() { return this.#map._lastViewHexesKey; }
  set _lastViewHexesKey(v) { this.#map._lastViewHexesKey = v; }
  get _frictionObj() { return this.#map._frictionObj; }
  set _frictionObj(v) { this.#map._frictionObj = v; }
  get _affordanceObj() { return this.#map._affordanceObj; }
  set _affordanceObj(v) { this.#map._affordanceObj = v; }
  get _multiFrictionObj() { return this.#map._multiFrictionObj; }
  set _multiFrictionObj(v) { this.#map._multiFrictionObj = v; }
  get _cellState() { return this.#map._cellState; }
  set _cellState(v) { this.#map._cellState = v; }
  get _computePathCacheObj() { return this.#map._computePathCacheObj; }
  set _computePathCacheObj(v) { this.#map._computePathCacheObj = v; }
  get _computePathCacheOrder() { return this.#map._computePathCacheOrder; }
  set _computePathCacheOrder(v) { this.#map._computePathCacheOrder = v; }
  get _computeDiskCacheObj() { return this.#map._computeDiskCacheObj; }
  set _computeDiskCacheObj(v) { this.#map._computeDiskCacheObj = v; }
  get _computeDiskCacheOrder() { return this.#map._computeDiskCacheOrder; }
  set _computeDiskCacheOrder(v) { this.#map._computeDiskCacheOrder = v; }
  get _visibilityCacheObj() { return this.#map._visibilityCacheObj; }
  set _visibilityCacheObj(v) { this.#map._visibilityCacheObj = v; }
  get _visibilityCacheOrder() { return this.#map._visibilityCacheOrder; }
  set _visibilityCacheOrder(v) { this.#map._visibilityCacheOrder = v; }
  get _gradientCacheObj() { return this.#map._gradientCacheObj; }
  set _gradientCacheObj(v) { this.#map._gradientCacheObj = v; }
  get _perTargetContribs() { return this.#map._perTargetContribs; }
  set _perTargetContribs(v) { this.#map._perTargetContribs = v; }
  get _assignedCounts() { return this.#map._assignedCounts; }
  set _assignedCounts(v) { this.#map._assignedCounts = v; }
  get _targetWeights() { return this.#map._targetWeights; }
  set _targetWeights(v) { this.#map._targetWeights = v; }

  // Delegated methods
  getContainer() { return this.#map.getContainer(); }
  getLayer(id) { return this.#map.getLayer(id); }
  getStyle() { return this.#map.getStyle(); }
  getBounds() { return this.#map.getBounds(); }
  project(...args) { return this.#map.project(...args); }
  unproject(...args) { return this.#map.unproject(...args); }
  queryRenderedFeatures(...args) { return this.#map.queryRenderedFeatures(...args); }
  getSource(id) { return this.#map.getSource(id); }
  addSource(...args) { return this.#map.addSource(...args); }
  addLayer(...args) { return this.#map.addLayer(...args); }
  addControl(...args) { return this.#map.addControl(...args); }
  fitBounds(...args) { return this.#map.fitBounds(...args); }
  getCanvas() { return this.#map.getCanvas(); }
  on(...args) { return this.#map.on(...args); }

  // Domain methods
  getHexes(...args) { return getHexes.call(this, ...args); }
  triggerFastScan(...args) { return triggerFastScan.call(this, ...args); }
  mapPolygonCells(...args) { return mapPolygonCells.call(this, ...args); }
  mapLineCells(...args) { return mapLineCells.call(this, ...args); }
  renderInterfacePins(...args) { return renderInterfacePins.call(this, ...args); }
  updateLayers(...args) { return updateLayers.call(this, ...args); }
  clearLayers(...args) { return clearLayers.call(this, ...args); }

  exportSimulationGeoJSON(...args) { return exportSimulationGeoJSON.call(this, ...args); }
  computeDesirePaths(...args) { return computeDesirePaths.call(this, ...args); }
  initializeAffordanceMap(...args) { return initializeAffordanceMap.call(this, ...args); }
  showAlertCard(...args) { return typeof this._showAlertCard === 'function' ? this._showAlertCard(...args) : this.#map.showAlertCard?.(...args); }
  syncSimulationUI(...args) { return typeof this._syncSimulationUI === 'function' ? this._syncSimulationUI(...args) : this.#map.syncSimulationUI?.(...args); }
}

export function setMapCursor(mapInstance, cursor) {
  const target = mapInstance.getContainer();
  // Clear all cursor classes first
  target.classList.remove('map-cursor-pointer', 'map-cursor-grab', 'map-cursor-grabbing', 'map-cursor-wait', 'map-cursor-crosshair');
  if (cursor) {
    target.classList.add(`map-cursor-${cursor}`);
  }
}

export function setMapCursorWait(mapInstance, waiting) {
  const target = mapInstance.getContainer();
  const spinner = document.querySelector('.loading');
  target.classList.toggle('map-cursor-wait', waiting);
  if (spinner) {
    spinner.style.display = waiting ? 'block' : 'none';
  } 
}

const init = () => {
  const pointLayerIds = ['pin-circles', 'pin-labels'];

  const map = new maplibregl.Map(MAP_OPTIONS);
  const desireMap = new DesireMap(map);

  desireMap.multiFrictionMap = new Map();
  desireMap.cellFrictionMap = new Map();
  // desireMap.cachedCoordinates = new Map();
  desireMap.pathDesireScores = new Map();
  desireMap.affordanceMap = new Map();
  desireMap.globalPeakFlow = 1;
  desireMap.simulationNodes = {};
  desireMap.showFrictionMesh = true;
  desireMap.mappingReady = false;
  desireMap.flowsReady = false;
  desireMap.deckOverlayInstance = new MapboxOverlay({
    interleaved: true,
    layers: [],
  });
  desireMap.addControl(desireMap.deckOverlayInstance);
  desireMap.targetLabelLayerId = undefined;
  desireMap.placementMode = 'origin';
  desireMap.placementWeight = 1;
  desireMap.aoi = undefined;
  desireMap.readyToCompute = false;
  desireMap.dragOccurred = false;

  // Add geocoder control with Nominatim service
  const geocoderApi = {
    forwardGeocode: async (config) => {
      const features = [];
      try {
        const request = `https://nominatim.openstreetmap.org/search?q=${config.query}&format=geojson&polygon_geojson=1&addressdetails=1`;
        const response = await fetch(request);
        const geojson = await response.json();
        for (const feature of geojson.features) {
          const center = [
            feature.bbox[0] + (feature.bbox[2] - feature.bbox[0]) / 2,
            feature.bbox[1] + (feature.bbox[3] - feature.bbox[1]) / 2
          ];
          const point = {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: center
            },
            place_name: feature.properties.display_name,
            properties: feature.properties,
            text: feature.properties.display_name,
            place_type: ['place'],
            center
          };
          features.push(point);
        }
      } catch (e) {
        console.error(`Failed to forwardGeocode with error: ${e}`);
      }
      return { features };
    }
  };

  desireMap.addControl(new MaplibreGeocoder(geocoderApi, { maplibregl }));
  setMapCursor(desireMap, 'crosshair');

  desireMap.on('load', (e) => {
    const layers = e.target.getStyle().layers;
    const match = layers.find(
      (l) => l.type === 'symbol' && (l.id.includes('label') || l.id.includes('place'))
    );
    if (match) e.target.targetLabelLayerId = match.id;
    // e.target.triggerFastScan();
  });

  desireMap.on('mousemove', (e) => {
    // Respect isDragging flag set by ui.js — don't override cursor during drag
    if (desireMap.isDragging) return;

    // During computation, always show wait cursor regardless of hover target
    if (desireMap.isComputing) return;

    const availablePointLayerIds = pointLayerIds.filter((layerId) => desireMap.getLayer(layerId));
    if (availablePointLayerIds.length === 0) {
      setMapCursor(desireMap, 'crosshair');
    } else {
      const features = desireMap.queryRenderedFeatures(e.point, {
        layers: availablePointLayerIds,
      });
      // Pins are draggable — show grab cursor when hovering them
      setMapCursor(desireMap, features.length > 0 ? 'grab' : 'crosshair');
    }
  });

  desireMap.on('mouseout', () => {
    if (desireMap.isComputing) {
      setMapCursorWait(desireMap, true);
    } else {
      setMapCursor(desireMap, 'crosshair');
    }
    const tooltip = document.getElementById('hex-tooltip');
    if (tooltip) tooltip.hidden = true;
  });

  // desireMap.on('moveend', e => { e.target.triggerFastScan(); });

  // Click handler — place new nodes only (weight managed via context menu)
  desireMap.on('click', (e) => {
    if (!document.getElementById('map')) return;

    // Ignore clicks while context menu is open or during drag
    const ctxMenu = document.getElementById('context-menu');
    if (ctxMenu && !ctxMenu.hidden) return;
    if (desireMap.dragOccurred) {
      desireMap.dragOccurred = false;
      return;
    }

    let coords = e.lngLat;
    // Clicks on rendered features may not carry lngLat — skip them
    if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return;

    const cell = latLngToCell(coords.lat, coords.lng, H3_STRIDE_RESOLUTION);

    if (!isAccessible(desireMap, e)) {
      desireMap.showAlertCard('This spot is blocked. Pick a walkable location instead.', {
        title: 'Placement blocked',
        tone: 'warning',
      });
      return;
    }

    const nodes = desireMap.simulationNodes;
    // Only place new nodes — existing nodes are managed via context menu
    if (!nodes[cell]) {
      nodes[cell] = {
        type: desireMap.placementMode,
        weight: Math.min(10, Math.max(1, Math.round(desireMap.placementWeight ?? 1))),
        cell,
      };

      desireMap.renderInterfacePins();
      desireMap.readyToCompute = isReadyToCompute(desireMap);
    }

    desireMap.syncSimulationUI?.();
  });

  setupUI(desireMap, { setMapCursor, setMapCursorWait });
};

// Check if there are at least one source and one sink to compute desire paths
const isReadyToCompute = (mapInstance) => {
  const nodes = Object.values(mapInstance.simulationNodes ?? {});
  const activeNodes = nodes.filter((n) => n.weight > 0);
  const hasOrigin = activeNodes.some((n) => n.type === 'origin' || n.type === 'dual');
  const hasDestination = activeNodes.some((n) => n.type === 'destination' || n.type === 'dual');
  return hasOrigin && hasDestination;
};

// Check if the added node is accessible by foot, and if not, alert the user and remove it
const isAccessible = (mapInstance, clickEvent) => {
  const bbox = [
    [clickEvent.point.x - 5, clickEvent.point.y - 5],
    [clickEvent.point.x + 5, clickEvent.point.y + 5],
  ];
  const features = mapInstance.queryRenderedFeatures(bbox) ?? [];
  const filtered = features.filter((f) =>
    ['transportation', 'building', 'water', 'landcover', 'landuse'].includes(f.sourceLayer)
  );
  const layerCosts = Object.create(null);
  for (const feat of filtered) {
    if (!feat?.geometry) continue;
    const surface = getSurface(feat);
    const c = FRICTION_COSTS[surface.cost];
    const layer = surface.layer;
    if (layerCosts[layer] === undefined || c > layerCosts[layer]) {
      layerCosts[layer] = c;
    }
  }
  const costs = Object.values(layerCosts);
  if (costs.length === 0) return true; // No features found; allow placement
  const groundCost = typeof layerCosts['0'] === 'number' ? layerCosts['0'] : Math.min(...costs);
  return groundCost < FRICTION_COSTS.IMPASSABLE;
};

export { DesireMap, isReadyToCompute, isAccessible };

document.addEventListener('DOMContentLoaded', init);
