import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MaplibreGeocoder from '@maplibre/maplibre-gl-geocoder';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
import './style/geocoder.css';
import { latLngToCell } from 'h3-js';
import { MapboxOverlay } from '@deck.gl/mapbox';

import { MAP_OPTIONS, FRICTION_COSTS, getSurface, SIMULATION_PARAMS } from './helpers/constants.js';
import { getHexes, triggerFastScan } from './helpers/grid.js';
import {
  renderInterfacePins,
  updateLayers,
  clearLayers,
  exportSimulationGeoJSON,
} from './helpers/map.js';
import { setupUI, findNodeAtScreenPoint } from './helpers/ui.js';
import {
  computeDesirePaths,
  initializeAffordanceMap,
  getGradientCacheStats,
} from './helpers/compute.js';
import { logger } from './helpers/logger.js';

// Network-resilience helpers for the Nominatim geocoder (review 3.1). Imported as
// individual subpaths so Vite treeshakes each one independently. None of these
// touch the worker/SharedArrayBuffer payload path, so the SAB zero-copy pattern
// used by the simulation workers is unaffected.
import { PowerCache } from 'performance-helpers/powerCache';
import { PowerSlidingWindow } from 'performance-helpers/powerSlidingWindow';
import { PowerCircuit } from 'performance-helpers/powerCircuit';
import { PowerDeadline } from 'performance-helpers/powerDeadline';

/**
 * DesireMap — wraps a maplibregl.Map with domain methods.
 * Avoids monkey-patching third-party prototypes.
 */
// Domain state keys exposed on the DesireMap instance. They are real,
// enumerable accessor properties (delegating to the `_state` bag) so they are
// visible to Object.keys / for…in / JSON.stringify / hasOwnProperty — removing
// the Proxy ownKeys/getOwnPropertyDescriptor footgun from review12 #8.
const KNOWN_STATE_KEYS = [
  'simulationNodes',
  'cellFrictionMap',
  'pathDesireScores',
  'affordanceMap',
  'cellToIdx',
  'frictionArr',
  'affArr',
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
  '_computePathCacheObj',
  '_computePathCacheOrder',
  '_computeDiskCacheObj',
  '_computeDiskCacheOrder',
  '_visibilityCacheObj',
  '_visibilityCacheOrder',
  '_gradientCache',
  '_protectedGradientDests',
  '_perTargetContribs',
  '_assignedCounts',
  '_targetWeights',
  '_mappingGeneration',
  '_frictionSnapshotGen',
  '_affordanceSnapshotGen',
  '_multiFrictionSnapshotGen',
  '_visibilityBearingCSR',
  '_precomputedNeighborDisks',
  'simulationParams',
];
const KNOWN_STATE_KEYS_SET = new Set(KNOWN_STATE_KEYS);

class DesireMap {
  #map;

  constructor(map) {
    this.#map = map;
    // Public alias of the underlying maplibre Map. Exposed (instead of reading
    // the private #map) so callers going through the Proxy get-trap — which
    // binds methods to the receiver (the Proxy), breaking private-field access
    // — can still reach the real map (e.g. terra-draw's adapter).
    this.rawMap = map;
    // Single consolidated state bag (replace many delegated properties). Domain
    // keys are exposed as real accessor properties (see below) that delegate
    // here, so the bag stays the single source of truth the domain methods read.
    this._state = Object.create(null);

    const self = this;
    // Expose each known state key as a REAL, enumerable accessor property that
    // delegates to `_state`. This makes domain state proper own properties:
    // Object.keys / for…in / JSON.stringify / hasOwnProperty now see them, and
    // the Proxy no longer needs custom ownKeys/getOwnPropertyDescriptor traps
    // (which previously hid them and created a has/descriptor invariant smell).
    for (const k of KNOWN_STATE_KEYS) {
      if (k === 'simulationParams') {
        // `simulationParams` is the single live module object; reads return it
        // directly and writes merge into it so `SIMULATION_PARAMS` and
        // `state.simulationParams` can never diverge.
        Object.defineProperty(self, k, {
          enumerable: true,
          configurable: true,
          get() {
            return SIMULATION_PARAMS;
          },
          set(v) {
            Object.assign(SIMULATION_PARAMS, v);
          },
        });
        continue;
      }
      Object.defineProperty(self, k, {
        enumerable: true,
        configurable: true,
        get() {
          return self._state[k];
        },
        set(v) {
          self._state[k] = v;
        },
      });
    }

    // Initialize state bag from provided map instance (snapshot at construction)
    // Copy values for known keys from the map into `_state` to avoid runtime fallbacks.
    for (const k of KNOWN_STATE_KEYS) {
      if (map && Object.prototype.hasOwnProperty.call(map, k)) {
        this._state[k] = map[k];
      }
    }

    // Return a Proxy so existing property accessors (map.foo) continue to work
    // but are backed by this single `_state` bag instead of mutating the map
    // instance. Domain keys are now real own properties, so the default
    // ownKeys/getOwnPropertyDescriptor behavior is correct and consistent.
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop === 'state') return target._state;
        // Prefer the DesireMap instance (domain state accessors + methods)
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
        // Last-resort fallback to the state bag for private-like props stored
        // there directly (e.g. `_surfaceEditActive`) that aren't declared as
        // known state keys. Without this such flags read back as `undefined`
        // and guards that depend on them never fire.
        if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(target._state, prop)) {
          return target._state[prop];
        }
        return undefined;
      },
      set(target, prop, value) {
        if (prop === 'state') {
          target._state = value;
          return true;
        }
        // Known state keys are real accessor properties delegating to `_state`.
        // Set the accessor (canonical value) and write through to the underlying
        // map when it already has the property (preserves prior behavior tested
        // by "should delegate property setters").
        if (typeof prop === 'string' && KNOWN_STATE_KEYS_SET.has(prop)) {
          target[prop] = value;
          const mp = target.#map;
          if (mp && prop in mp) {
            try {
              mp[prop] = value;
            } catch (e) {
              logger.warn(`DesireMap: write-through to map.${prop} failed`, e);
            }
          }
          return true;
        }
        // Domain state keys (and methods) are real own properties → set directly.
        if (prop in target) return Reflect.set(target, prop, value);
        const mp = target.#map;
        if (mp) {
          try {
            mp[prop] = value;
            return true;
          } catch (e) {
            logger.warn(`DesireMap: write to map.${prop} failed`, e);
          }
        }
        // As a last resort, store private-like props in the state bag.
        if (typeof prop === 'string' && prop.startsWith('_')) {
          target._state[prop] = value;
          return true;
        }
        return Reflect.set(target, prop, value);
      },
      has(target, prop) {
        if (prop in target) return true;
        if (prop in target.#map) return true;
        if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(target._state, prop)) {
          return true;
        }
        return false;
      },
      // No custom ownKeys / getOwnPropertyDescriptor: the default behavior now
      // correctly reports the real accessor properties (review12 #8), so
      // enumeration and the has/descriptor contract are consistent.
    });
  }

  // Domain methods
  getHexes(...args) {
    return getHexes(this._state, this, ...args);
  }
  triggerFastScan(...args) {
    return triggerFastScan(this._state, this, ...args);
  }
  renderInterfacePins(...args) {
    return renderInterfacePins(this._state, this, ...args);
  }
  // Expose the underlying maplibre Map (terra-draw's adapter needs the real
  // instance, not this Proxy). Returns the public `rawMap` field so it resolves
  // correctly even when called through the Proxy get-trap (which binds `this`
  // to the Proxy and cannot read the private `#map`).
  getRawMap() {
    return this.rawMap;
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
    'map-cursor-crosshair',
    'map-cursor-move'
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

// Pick the cursor from cached simulation-node positions instead of a per-event
// queryRenderedFeatures GPU readback. Pins are draggable, so we show a grab
// cursor when the pointer is within a node's rendered radius. Uses the same
// hit test as the drag handler so the cursor and draggability always agree.
const PIN_HIT_PADDING_PX = 4;
function updateCursorFromNodes(mapInstance, point) {
  const hit = findNodeAtScreenPoint(mapInstance, point, PIN_HIT_PADDING_PX) !== null;
  setMapCursor(mapInstance, hit ? 'grab' : 'crosshair');
}

const init = () => {
  const map = new maplibregl.Map(MAP_OPTIONS);
  const desireMap = new DesireMap(map);
  if (import.meta.env.DEV && typeof window !== 'undefined') window.__map = desireMap; // TEMP DEBUG

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

  // Add geocoder control with Nominatim service.
  //
  // Geocoder network resilience (review 3.1): the old code cached raw results in
  // a hand-rolled Map with a 5-minute TTL and a 200-entry cap, and fired a bare
  // `fetch` with no timeout, retry, rate limiting, or failure isolation. That
  // meant a single slow/hanging Nominatim response could stall the geocoder
  // indefinitely, and a Nominatim outage would hammer the service on every
  // keystroke. The helpers below add: bounded TTL+LRU cache (PowerCache),
  // Nominatim's 1 req/s policy (PowerSlidingWindow), fast-fail on outage
  // (PowerCircuit), and per-call timeout+retry (PowerDeadline). None of this
  // touches the worker/SAB simulation path.
  const geocoderCache = new PowerCache({
    maxEntries: 1000,
    defaultTTL: 30 * 24 * 60 * 60 * 1000, // 30 days — geocoding is stable
  });
  // Dev-only observability hooks for the PowerCache-backed caches (review 3.1/3.2).
  // `geocoderCache.stats()` / `getGradientCacheStats(desireMap)` surface hit rates
  // so we can confirm the caches are actually being used.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    try {
      window.__dp_getGeocoderCacheStats = () => geocoderCache.stats();
      window.__dp_getGradientCacheStats = () => getGradientCacheStats(desireMap);
    } catch (_e) {}
  }
  // Nominatim usage policy: max 1 request/second. A sliding window of capacity 1
  // over 1000ms enforces that across all geocoder calls.
  const geocoderRateLimit = new PowerSlidingWindow({ capacity: 1, windowMs: 1000 });
  // Trip open after 5 consecutive failures; half-open trial after 10s. While open,
  // calls fail fast (returning cached/empty results) instead of hitting the network.
  const geocoderCircuit = new PowerCircuit({ threshold: 5, timeout: 10000 });
  // Per-call: 4s total budget, up to 2 attempts with exponential backoff+jitter.
  const geocoderDeadline = new PowerDeadline({
    maxAttempts: 2,
    totalTimeout: 4000,
    retryDelay: 250,
    backoff: 'exponential',
    jitter: true,
  });

  // Wait (poll) until the rate limiter admits one request, or give up after ~1s.
  // The geocoder is already debounced at 300ms, so this almost never blocks; it
  // only serializes the rare case of multiple in-flight queries in the same second.
  async function acquireRateLimitSlot(maxWaitMs = 1000) {
    const step = 200;
    let waited = 0;
    while (!geocoderRateLimit.tryConsume(1)) {
      if (waited >= maxWaitMs) return false;
      await new Promise((r) => setTimeout(r, step));
      waited += step;
    }
    return true;
  }

  async function fetchNominatim(query) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      query
    )}&format=geojson&polygon_geojson=1&addressdetails=1`;
    // PowerCircuit.call wraps the work and trips open on repeated failure.
    return geocoderCircuit.call(() =>
      geocoderDeadline.run(
        async (signal) => {
          const response = await fetch(url, { signal });
          if (!response.ok) {
            const err = new Error(`Nominatim ${response.status}`);
            err.status = response.status;
            throw err;
          }
          return response.json();
        },
        { retryIf: (err) => !err || (err.status >= 500 && err.status < 600) }
      )
    );
  }

  async function geocodeQuery(query) {
    const cached = geocoderCache.get(query);
    if (cached) return cached;

    // If the circuit is open, skip the network entirely and fall back to cache
    // (already handled above) or an empty result — don't pile onto a down service.
    if (geocoderCircuit.state === 'open') return [];

    await acquireRateLimitSlot();
    const geojson = await fetchNominatim(query);
    const features = [];
    for (const feature of geojson.features || []) {
      const bbox = feature.bbox;
      const center = bbox
        ? [bbox[0] + (bbox[2] - bbox[0]) / 2, bbox[1] + (bbox[3] - bbox[1]) / 2]
        : feature.geometry?.coordinates || [0, 0];
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: center },
        place_name: feature.properties.display_name,
        properties: feature.properties,
        text: feature.properties.display_name,
        place_type: ['place'],
        center,
      });
    }
    geocoderCache.set(query, features);
    return features;
  }

  let geocoderDebounceTimer = null;

  const geocoderApi = {
    forwardGeocode: async (config) => {
      const features = [];
      try {
        features.push(...(await geocodeQuery(config.query)));
      } catch (e) {
        // Circuit-open / timeout / network errors degrade to an empty result set
        // rather than throwing into the MaplibreGeocoder control.
        logger.warn(`forwardGeocode failed for "${config.query}"`, e);
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

  // Coalesce mousemove into a single rAF so we do at most one cursor update per
  // frame. We avoid queryRenderedFeatures entirely (no per-event GPU readback):
  // instead we test the pointer against the cached simulation-node positions
  // projected to screen space. Pins are draggable, so show a grab cursor while
  // hovering one.
  let mouseMovePending = false;
  let lastMousePoint = null;
  desireMap.on('mousemove', (e) => {
    // Respect isDragging flag set by ui.js — don't override cursor during drag
    if (desireMap.isDragging) return;

    // During computation, always show wait cursor regardless of hover target
    if (desireMap.isComputing) return;

    // While a Surface Edition mode is active, terra-draw owns the map. Drawing
    // modes keep a crosshair (not a node grab cursor). Select mode computes its
    // own pointer/grab/move cursor via surfaceEdition's mousemove handler, so
    // leave it alone here.
    if (desireMap._surfaceEditActive) {
      if (desireMap._surfaceMode !== 'select') {
        setMapCursor(desireMap, 'crosshair');
      }
      return;
    }

    lastMousePoint = e.point;
    if (mouseMovePending) return;
    mouseMovePending = true;
    requestAnimationFrame(() => {
      mouseMovePending = false;
      if (lastMousePoint) updateCursorFromNodes(desireMap, lastMousePoint);
    });
  });

  desireMap.on('mouseout', () => {
    if (desireMap.isComputing) {
      setMapCursorWait(desireMap, true);
    } else if (desireMap._surfaceEditActive) {
      // Drawing modes → crosshair; Select mode → pointer (nothing to grab
      // until the pointer re-enters and is tested by surfaceEdition).
      setMapCursor(desireMap, desireMap._surfaceMode === 'select' ? 'pointer' : 'crosshair');
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

    // While a Surface Edition draw tool is active, terra-draw owns the click.
    if (desireMap._surfaceEditActive) return;

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
// `getStyleSourceEntries`/`isSourceLoading` do not exist in maplibre-gl@5.x,
// so we enumerate sources via getStyle() and use isSourceLoaded() (true once a
// source's tiles have finished loading). areTilesLoaded() is a robust fallback
// that reports false while any tile is still in flight.
const sourcesLoading = (mapInstance) => {
  if (typeof mapInstance.areTilesLoaded === 'function' && !mapInstance.areTilesLoaded()) {
    return true;
  }
  const sources = mapInstance.getStyle?.()?.sources ?? {};
  for (const id in sources) {
    if (typeof mapInstance.isSourceLoaded === 'function' && !mapInstance.isSourceLoaded(id)) {
      return true;
    }
  }
  return false;
};

// Check if the added node is accessible by foot, and if not, alert the user and remove it
const isAccessible = async (mapInstance, clickEvent) => {
  const bbox = [
    [clickEvent.point.x - 5, clickEvent.point.y - 5],
    [clickEvent.point.x + 5, clickEvent.point.y + 5],
  ];

  const queryLayerCosts = (inst) => {
    const features = inst.queryRenderedFeatures(bbox) ?? [];
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
    return layerCosts;
  };

  let layerCosts = queryLayerCosts(mapInstance);
  let attempts = 0;
  const maxAttempts = 3;

  while (Object.keys(layerCosts).length === 0 && attempts < maxAttempts && sourcesLoading(mapInstance)) {
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, 150));
    layerCosts = queryLayerCosts(mapInstance);
  }

  const costs = Object.values(layerCosts);
  if (costs.length > 0) {
    const groundCost =
      typeof layerCosts['0'] === 'number' ? layerCosts['0'] : Math.min(...costs);
    return groundCost < FRICTION_COSTS.IMPASSABLE;
  }

  return true;
};

export { DesireMap, isReadyToCompute, isAccessible };

document.addEventListener('DOMContentLoaded', init);
