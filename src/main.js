import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MaplibreGeocoder from '@maplibre/maplibre-gl-geocoder';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
import './style/geocoder.css';
import { latLngToCell } from 'h3-js';
import { MapboxOverlay } from '@deck.gl/mapbox';

import { MAP_OPTIONS, FRICTION_COSTS, getSurface, SIMULATION_PARAMS } from './helpers/constants.js';
import { getHexes, triggerFastScan, mapPolygonCells, mapLineCells } from './helpers/grid.js';
import {
  renderInterfacePins,
  updateLayers,
  clearLayers,
  exportSimulationGeoJSON,
} from './helpers/map.js';
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
    // Single consolidated state bag (replace many delegated properties)
    this._state = Object.create(null);

    // Known state keys previously delegated — reads/writes are routed here.
    this._knownStateKeys = new Set([
      'simulationNodes',
      'multiFrictionMap',
      'cellFrictionMap',
      'pathDesireScores',
      'affordanceMap',
      'globalPeakFlow',
      'showFrictionMesh',
      'mappingReady',
      'flowsReady',
      'deckOverlayInstance',
      'targetLabelLayerId',
      'placementMode',
      'placementWeight',
      'dragOccurred',
      'aoi',
      'readyToCompute',
      'isComputing',
      'baseLayer',
      'flowLayer',
      'aoi_px',
      'aoi_polygon',
      '_cachedViewHexes',
      '_cachedAoiKey',
      '_lastViewHexesKey',
      '_frictionObj',
      '_affordanceObj',
      '_multiFrictionObj',
      '_cellState',
      '_computePathCacheObj',
      '_computePathCacheOrder',
      '_computeDiskCacheObj',
      '_computeDiskCacheOrder',
      '_visibilityCacheObj',
      '_visibilityCacheOrder',
      '_gradientCacheObj',
      '_perTargetContribs',
      '_assignedCounts',
      '_targetWeights',
      '_mappingGeneration',
      '_frictionSnapshotGen',
      '_multiFrictionSnapshotGen',
      '_cellStateMappingGen',
      '_precomputedVisibility',
      '_precomputedNeighborDisks',
      'simulationParams',
    ]);

    // Initialize state bag from provided map instance (snapshot at construction)
    // Copy values for known keys from the map into `_state` to avoid runtime fallbacks.
    const mpInit = map;
    for (const k of this._knownStateKeys) {
      if (mpInit && Object.prototype.hasOwnProperty.call(mpInit, k)) {
        this._state[k] = mpInit[k];
      }
    }

    // Return a Proxy so existing property accessors (map.foo) continue to work
    // but are backed by this single `_state` bag instead of mutating the map instance.
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop === 'state') return target._state;
        if (typeof prop === 'string' && target._knownStateKeys.has(prop)) {
          // Return the value from the consolidated state bag only — no runtime fallbacks.
          return target._state[prop];
        }
        // Prefer methods/props on the DesireMap instance
        if (prop in target) {
          const v = Reflect.get(target, prop, receiver);
          if (typeof v === 'function') return v.bind(receiver);
          return v;
        }
        // Fallback to underlying map instance for maplibre methods/properties
        const mp = target.#map;
        if (mp && prop in mp) {
          const mv = mp[prop];
          if (typeof mv === 'function') return mv.bind(mp);
          return mv;
        }
        return undefined;
      },
      set(target, prop, value) {
        if (prop === 'state') {
          target._state = value;
          return true;
        }
        if (typeof prop === 'string' && target._knownStateKeys.has(prop)) {
          target._state[prop] = value;
          const mp = target.#map;
          // Write-through to underlying map when it already has the property
          if (mp && prop in mp) {
            try {
              mp[prop] = value;
            } catch (_e) {}
          }
          return true;
        }
        if (prop in target) return Reflect.set(target, prop, value);
        const mp = target.#map;
        if (mp) {
          try {
            mp[prop] = value;
            return true;
          } catch (_e) {}
        }
        // As a last resort, store private-like props in state bag
        if (typeof prop === 'string' && prop.startsWith('_')) {
          target._state[prop] = value;
          return true;
        }
        return Reflect.set(target, prop, value);
      },
      has(target, prop) {
        if (typeof prop === 'string' && target._knownStateKeys.has(prop)) return true;
        if (prop in target) return true;
        if (prop in target.#map) return true;
        return false;
      },
      ownKeys(target) {
        return Reflect.ownKeys(target).concat([...target._knownStateKeys]);
      },
      getOwnPropertyDescriptor(target, prop) {
        if (typeof prop === 'string' && target._knownStateKeys.has(prop)) {
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: target._state[prop],
          };
        }
        return (
          Reflect.getOwnPropertyDescriptor(target, prop) ||
          Object.getOwnPropertyDescriptor(target.#map, prop)
        );
      },
    });
  }

  // Domain methods
  getHexes(...args) {
    return getHexes(this._state, this, ...args);
  }
  triggerFastScan(...args) {
    return triggerFastScan(this._state, this, ...args);
  }
  mapPolygonCells(...args) {
    return mapPolygonCells(this._state, this, ...args);
  }
  mapLineCells(...args) {
    return mapLineCells(this._state, this, ...args);
  }
  renderInterfacePins(...args) {
    return renderInterfacePins(this._state, this, ...args);
  }
  updateLayers(...args) {
    return updateLayers(this._state, this, ...args);
  }
  clearLayers(...args) {
    return clearLayers(this._state, this, ...args);
  }

  exportSimulationGeoJSON(...args) {
    return exportSimulationGeoJSON(this._state, this, ...args);
  }
  computeDesirePaths(...args) {
    return computeDesirePaths(this._state, this, ...args);
  }
  initializeAffordanceMap(...args) {
    return initializeAffordanceMap(this._state, this, ...args);
  }
  showAlertCard(...args) {
    return typeof this._showAlertCard === 'function'
      ? this._showAlertCard(...args)
      : this.#map.showAlertCard?.(...args);
  }
  syncSimulationUI(...args) {
    return typeof this._syncSimulationUI === 'function'
      ? this._syncSimulationUI(...args)
      : this.#map.syncSimulationUI?.(...args);
  }
}

export function setMapCursor(mapInstance, cursor) {
  const target = mapInstance.getContainer();
  // Clear all cursor classes first
  target.classList.remove(
    'map-cursor-pointer',
    'map-cursor-grab',
    'map-cursor-grabbing',
    'map-cursor-wait',
    'map-cursor-crosshair'
  );
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
  desireMap.simulationParams = { ...SIMULATION_PARAMS };

  // Add geocoder control with Nominatim service
  // Geocoder query cache + debounce for Nominatim rate limiting
  const geocoderCache = new Map();
  const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

  let geocoderDebounceTimer = null;

  const geocoderApi = {
    forwardGeocode: async (config) => {
      const features = [];
      try {
        // Prune expired entries before checking cache
        const now = Date.now();
        for (const [key, val] of geocoderCache) {
          if (now - val.timestamp >= CACHE_MAX_AGE_MS) geocoderCache.delete(key);
        }

        // Return cached result if available and not expired
        const cached = geocoderCache.get(config.query);
        if (cached && now - cached.timestamp < CACHE_MAX_AGE_MS) {
          return { features: cached.features };
        }

        const request = `https://nominatim.openstreetmap.org/search?q=${config.query}&format=geojson&polygon_geojson=1&addressdetails=1`;
        const response = await fetch(request);
        const geojson = await response.json();
        for (const feature of geojson.features) {
          const center = [
            feature.bbox[0] + (feature.bbox[2] - feature.bbox[0]) / 2,
            feature.bbox[1] + (feature.bbox[3] - feature.bbox[1]) / 2,
          ];
          const point = {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: center,
            },
            place_name: feature.properties.display_name,
            properties: feature.properties,
            text: feature.properties.display_name,
            place_type: ['place'],
            center,
          };
          features.push(point);
        }

        // Cache the result
        geocoderCache.set(config.query, { features, timestamp: Date.now() });

        // Prune cache if it grows beyond 200 entries (LRU by eviction order)
        if (geocoderCache.size > 200) {
          const oldestKey = geocoderCache.keys().next().value;
          geocoderCache.delete(oldestKey);
        }
      } catch (e) {
        console.error(`Failed to forwardGeocode with error: ${e}`);
      }
      return { features };
    },
  };

  desireMap.addControl(
    new MaplibreGeocoder(
      {
        forwardGeocode: async (config) => {
          // Debounce: wait 300ms after the last keystroke before firing
          return new Promise((resolve) => {
            if (geocoderDebounceTimer) clearTimeout(geocoderDebounceTimer);
            geocoderDebounceTimer = setTimeout(() => {
              resolve(geocoderApi.forwardGeocode(config));
            }, 300);
          });
        },
      },
      { maplibregl, collapsed: true }
    )
  );
  setMapCursor(desireMap, 'crosshair');

  desireMap.on('load', (e) => {
    const layers = e.target.getStyle().layers;
    const match = layers.find(
      (l) => l.type === 'symbol' && (l.id.includes('label') || l.id.includes('place'))
    );
    if (match) e.target.targetLabelLayerId = match.id;
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

  // Click handler — place new nodes only (weight managed via context menu)
  desireMap.on('click', async (e) => {
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

    const cell = latLngToCell(coords.lat, coords.lng, SIMULATION_PARAMS.h3StrideResolution);

    if (!(await isAccessible(desireMap, e))) {
      const msg = sourcesLoading(desireMap)
        ? 'Map tiles are still loading. Wait a moment and try again.'
        : 'This spot is blocked. Pick a walkable location instead.';
      desireMap.showAlertCard(msg, {
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

// Check if any tile source on the map is currently fetching data.
const sourcesLoading = (mapInstance) => {
  const sourceIds = mapInstance.getStyleSourceEntries?.() ?? [];
  for (const entry of sourceIds) {
    if (mapInstance.isSourceLoading(entry.id)) return true;
  }
  return false;
};

// Check if the added node is accessible by foot, and if not, alert the user and remove it
const isAccessible = async (mapInstance, clickEvent) => {
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
  if (costs.length === 0) {
    // No features found — defer placement if tiles are still loading.
    // When tiles haven't loaded for a region, queryRenderedFeatures returns empty;
    // treating that as "walkable" allows placement on water/buildings that aren't rendered yet.
    if (sourcesLoading(mapInstance)) {
      // Wait for tiles to load, then re-query once to avoid race condition
      await new Promise((resolve) => setTimeout(resolve, 150));
      const retryFeatures = mapInstance.queryRenderedFeatures(bbox) ?? [];
      const retryFiltered = retryFeatures.filter((f) =>
        ['transportation', 'building', 'water', 'landcover', 'landuse'].includes(f.sourceLayer)
      );
      const retryLayerCosts = Object.create(null);
      for (const feat of retryFiltered) {
        if (!feat?.geometry) continue;
        const surface = getSurface(feat);
        const c = FRICTION_COSTS[surface.cost];
        const layer = surface.layer;
        if (retryLayerCosts[layer] === undefined || c > retryLayerCosts[layer]) {
          retryLayerCosts[layer] = c;
        }
      }
      const retryCosts = Object.values(retryLayerCosts);
      if (retryCosts.length > 0) {
        const groundCost =
          typeof retryLayerCosts['0'] === 'number' ? retryLayerCosts['0'] : Math.min(...retryCosts);
        return groundCost < FRICTION_COSTS.IMPASSABLE;
      }
      // Still no features after retry — allow placement
      return true;
    }
    return true;
  }
  const groundCost = typeof layerCosts['0'] === 'number' ? layerCosts['0'] : Math.min(...costs);
  return groundCost < FRICTION_COSTS.IMPASSABLE;
};

export { DesireMap, isReadyToCompute, isAccessible };

document.addEventListener('DOMContentLoaded', init);
