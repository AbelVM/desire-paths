import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { latLngToCell } from 'h3-js';
import { MapboxOverlay } from '@deck.gl/mapbox';

import {
  MAP_OPTIONS,
  H3_STRIDE_RESOLUTION,
  FRICTION_COSTS,
  getSurface,
} from './helpers/constants.js';
import { getHexes, triggerFastScan, mapPolygonCells, mapLineCells } from './helpers/grid.js';
import { renderInterfacePins, updateLayers, clearLayers } from './helpers/map.js';
import { setupUI } from './helpers/ui.js';
import { computeDesirePaths, initializeAffordanceMap } from './helpers/compute.js';

const init = () => {
  const setMapCursor = (mapInstance, cursor) => {
    const target = mapInstance.getContainer();
    target.classList.toggle('map-cursor-pointer', cursor === 'pointer');
    target.classList.toggle('map-cursor-crosshair', cursor === 'crosshair');
  };

  const pointLayerIds = ['pin-circles', 'pin-labels'];

  maplibregl.Map.prototype.getHexes = getHexes;
  maplibregl.Map.prototype.triggerFastScan = triggerFastScan;
  maplibregl.Map.prototype.mapPolygonCells = mapPolygonCells;
  maplibregl.Map.prototype.mapLineCells = mapLineCells;
  maplibregl.Map.prototype.renderInterfacePins = renderInterfacePins;
  maplibregl.Map.prototype.updateLayers = updateLayers;
  maplibregl.Map.prototype.clearLayers = clearLayers;
  maplibregl.Map.prototype.computeDesirePaths = computeDesirePaths;
  maplibregl.Map.prototype.initializeAffordanceMap = initializeAffordanceMap;

  const map = new maplibregl.Map(MAP_OPTIONS);

  window._map = map; // Expose map for debugging

  map.multiFrictionMap = new Map();
  map.cellFrictionMap = new Map();
  //map.cachedCoordinates = new Map();
  map.pathDesireScores = new Map();
  map.affordanceMap = new Map();
  map.globalPeakFlow = 1;
  map.simulationNodes = {};
  map.showFrictionMesh = true;
  map.mappingReady = false;
  map.deckOverlayInstance = new MapboxOverlay({
    interleaved: true,
    layers: [],
  });
  map.targetLabelLayerId = undefined;
  map.placementMode = 'origin';
  map.placementWeight = 1;
  map.aoi = undefined;
  map.readyToCompute = false;

  map.addControl(map.deckOverlayInstance);
  setMapCursor(map, 'crosshair');

  map.on('load', (e) => {
    const layers = e.target.getStyle().layers;
    const match = layers.find(
      (l) => l.type === 'symbol' && (l.id.includes('label') || l.id.includes('place'))
    );
    if (match) e.target.targetLabelLayerId = match.id;
    //e.target.triggerFastScan();
  });

  map.on('mousemove', (e) => {
    const availablePointLayerIds = pointLayerIds.filter((layerId) => e.target.getLayer(layerId));
    if (availablePointLayerIds.length === 0) {
      setMapCursor(map, 'crosshair');
      return;
    }

    const features = e.target.queryRenderedFeatures(e.point, {
      layers: availablePointLayerIds,
    });
    setMapCursor(map, features.length > 0 ? 'pointer' : 'crosshair');
  });

  map.on('mouseout', () => {
    setMapCursor(map, 'crosshair');
  });

  //map.on('moveend', e => { e.target.triggerFastScan(); });

  map.on('click', (e) => {
    if (!document.getElementById('map')) return; // Safeguard
    const cell = latLngToCell(e.lngLat.lat, e.lngLat.lng, H3_STRIDE_RESOLUTION);
    let structureChanged = false;

    if (!isAccessible(e)) {
      e.target.showAlertCard('This spot is blocked. Pick a walkable location instead.', {
        title: 'Placement blocked',
        tone: 'warning',
      });
      return;
    }

    if (e.target.simulationNodes[cell]) {
      if (e.target.simulationNodes[cell].type === e.target.placementMode) {
        e.target.simulationNodes[cell].weight += 1;
      } else {
        e.target.simulationNodes[cell].type = e.target.placementMode;
        structureChanged = true;
      }
    } else {
      e.target.simulationNodes[cell] = {
        type: e.target.placementMode,
        weight: Math.min(10, Math.max(1, Math.round(e.target.placementWeight || 1))),
      };
      structureChanged = true;
    }

    e.target.renderInterfacePins();

    if (isReadyToCompute(e.target)) {
      e.target.readyToCompute = true;
    } else {
      e.target.readyToCompute = false;
    }

    if (structureChanged) {
      e.target.mappingReady = false;
    }

    if (e.target.syncSimulationUI) {
      e.target.syncSimulationUI();
    }
  });

  // remove nodes on right-click, and disable context menu
  map.on('contextmenu', (e) => {
    e.preventDefault();
    const cell = latLngToCell(e.lngLat.lat, e.lngLat.lng, H3_STRIDE_RESOLUTION);
    if (
      e.target.simulationNodes[cell] &&
      e.target.simulationNodes[cell].type === e.target.placementMode
    ) {
      e.target.simulationNodes[cell].weight -= 1;
    }
    if (e.target.simulationNodes[cell] && e.target.simulationNodes[cell].weight <= 0) {
      delete e.target.simulationNodes[cell];
      e.target.mappingReady = false;
    }
    e.target.renderInterfacePins();
    e.target.readyToCompute = isReadyToCompute(e.target);
    if (e.target.syncSimulationUI) {
      e.target.syncSimulationUI();
    }
  });

  setupUI(map);
};

// Check if there are at least one source and one sink to compute desire paths
const isReadyToCompute = (mapInstance) => {
  const nodes = Object.values(mapInstance.simulationNodes);
  const hasEnoughNodes = nodes.filter((n) => n.weight > 0).length >= 2;
  const hasOrigin = nodes.some((n) => n.type === 'origin' || n.type === 'both');
  const hasDestination = nodes.some((n) => n.type === 'destination' || n.type === 'both');
  return hasEnoughNodes && hasOrigin && hasDestination;
};

// Check if the added node is accessible by foot, and if not, alert the user and remove it
const isAccessible = (e) => {
  const bbox = [
    [e.point.x - 5, e.point.y - 5],
    [e.point.x + 5, e.point.y + 5],
  ];
  let features = e.target.queryRenderedFeatures(bbox);
  features = features.filter((f) =>
    ['transportation', 'building', 'water', 'landcover', 'landuse'].includes(f.sourceLayer)
  );
  const f = {};
  for (const feat of features) {
    if (!feat?.geometry) continue;
    const surface = getSurface(feat);
    const c = FRICTION_COSTS[surface.cost];
    if (f[surface.layer] === undefined) f[surface.layer] = c;
    else if (c > f[surface.layer]) f[surface.layer] = c;
  }
  const costs = Object.values(f);
  if (costs.length === 0) return true; // No features found; allow placement
  const groundCost = f['0']; // We use ground level
  return groundCost < FRICTION_COSTS.IMPASSABLE;
};

document.addEventListener('DOMContentLoaded', init);
