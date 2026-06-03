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
  map.deckOverlayInstance = new MapboxOverlay({
    interleaved: true,
    layers: [],
  });
  map.targetLabelLayerId = undefined;
  map.placementMode = 'origin';
  map.aoi = undefined;
  map.readyToCompute = false;

  map.addControl(map.deckOverlayInstance);

  map.on('load', (e) => {
    const layers = e.target.getStyle().layers;
    const match = layers.find(
      (l) => l.type === 'symbol' && (l.id.includes('label') || l.id.includes('place'))
    );
    if (match) e.target.targetLabelLayerId = match.id;
    //e.target.triggerFastScan();
  });

  //map.on('moveend', e => { e.target.triggerFastScan(); });

  map.on('click', (e) => {
    const cell = latLngToCell(e.lngLat.lat, e.lngLat.lng, H3_STRIDE_RESOLUTION);

    if (!isAccesible(e)) {
      alert('This location is not accessible by foot. Please select a different location.');
      return;
    }

    if (e.target.simulationNodes[cell]) {
      if (e.target.simulationNodes[cell].type === e.target.placementMode) {
        e.target.simulationNodes[cell].weight += 1;
      } else {
        e.target.simulationNodes[cell].type = e.target.placementMode;
      }
    } else {
      e.target.simulationNodes[cell] = {
        type: e.target.placementMode,
        weight: 1,
      };
    }

    e.target.renderInterfacePins();

    if (isReadyToCompute(e.target)) {
      e.target.readyToCompute = true;
      e.target.triggerFastScan();
    } else {
      e.target.readyToCompute = false;
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
    }
    e.target.renderInterfacePins();
    e.target.readyToCompute = isReadyToCompute(e.target);
  });

  setupUI(map);
};

// if there are at least one source and one sink, we can compute desire paths and update the visualization
const isReadyToCompute = function (mapInstance) {
  const nodes = Object.values(mapInstance.simulationNodes);
  const hasEnoughNodes = nodes.filter((n) => n.weight > 0).length >= 2;
  const hasOrigin = nodes.filter((n) => n.type === 'origin' || n.type === 'both').length > 0;
  const hasDestination =
    nodes.filter((n) => n.type === 'destination' || n.type === 'both').length > 0;
  return hasEnoughNodes && hasOrigin && hasDestination;
};

// check if the added node is accessible by foot, and if not, alert the user and remove it
const isAccesible = function (e) {
  const bbox = [
    [e.point.x - 5, e.point.y - 5],
    [e.point.x + 5, e.point.y + 5],
  ];
  const features = e.target.queryRenderedFeatures(bbox);
  const f = {};
  for (const feat of features) {
    if (!feat.geometry) continue;
    const surface = getSurface(feat);
    if (f[surface.layer] === undefined) f[surface.layer] = surface.cost;
    else if (surface.cost < f[surface.layer]) f[surface.layer] = surface.cost;
  }
  const minCost = Math.min(...Object.values(f));
  if (minCost >= FRICTION_COSTS.IMPASSABLE) {
    return false;
  }
  return true;
};

document.addEventListener('DOMContentLoaded', init);
