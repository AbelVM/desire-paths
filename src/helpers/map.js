import { cellToBoundary, cellToLatLng } from 'h3-js';
import { FRICTION_COSTS, BUFFER_PX, classifyFrictionTier } from './constants.js';
import { H3HexagonLayer } from '@deck.gl/geo-layers';

// Flow hover handler — updates tooltip with hex data.
// Uses info.dataIndex to look up from source array instead of relying on info.object,
// which may be stale when updateTriggers cause re-renders that change object identity.
export function handleFlowHover(info, flowData) {
  const tooltip = document.getElementById('hex-tooltip');
  if (!tooltip) return;

  const entry = flowData?.[info.dataIndex ?? info.index];
  if (entry && entry.hex) {
    tooltip.hidden = false;
    const score = Math.round(entry.s);
    const friction = entry.f;
    const affordance = entry.a;
    const cellType = classifyFrictionTier(friction);
    const typeLabel =
      cellType === 'pavement'
        ? 'Pavement'
        : cellType === 'light_park'
          ? 'Light park'
          : cellType === 'heavy_grass'
            ? 'Heavy grass'
            : 'Impassable';
    tooltip.innerHTML = `<strong>Flow:</strong> ${score} paths<br><strong>Affordance:</strong> ${affordance.toFixed(2)}<br><strong>Type:</strong> ${typeLabel}<br><strong>Friction:</strong> ${friction}`;
    tooltip.style.left = `${info.x}px`;
    tooltip.style.top = `${info.y}px`;
  } else {
    tooltip.hidden = true;
  }
}

function buildCircularAoiPolygon(mapInstance, nodePoints) {
  const centerX = nodePoints.reduce((sum, p) => sum + p.point.x, 0) / nodePoints.length;
  const centerY = nodePoints.reduce((sum, p) => sum + p.point.y, 0) / nodePoints.length;
  let radiusPx = BUFFER_PX;

  for (let i = 0; i < nodePoints.length; i++) {
    const dx = nodePoints[i].point.x - centerX;
    const dy = nodePoints[i].point.y - centerY;
    radiusPx = Math.max(radiusPx, Math.hypot(dx, dy) + BUFFER_PX);
  }

  const nwPx = [centerX - radiusPx, centerY - radiusPx];
  const sePx = [centerX + radiusPx, centerY + radiusPx];
  const polygon = [];
  const steps = 32;

  for (let i = 0; i < steps; i++) {
    const angle = (Math.PI * 2 * i) / steps;
    const px = centerX + Math.cos(angle) * radiusPx;
    const py = centerY + Math.sin(angle) * radiusPx;
    const clamped = [
      Math.max(nwPx[0], Math.min(sePx[0], px)),
      Math.max(nwPx[1], Math.min(sePx[1], py)),
    ];
    const lngLat = mapInstance.unproject(clamped);
    polygon.push([lngLat.lng, lngLat.lat]);
  }
  polygon.push([polygon[0][0], polygon[0][1]]);

  return {
    aoiPx: [nwPx, sePx],
    aoiPolygon: [polygon],
  };
}

export function renderInterfacePins(state, mapInstance) {
  const nodePoints = Object.entries(state.simulationNodes ?? {}).map(([k, node]) => {
    const pt = cellToLatLng(k);
    return {
      cell: k,
      point: mapInstance.project([pt[1], pt[0]]),
      lng: pt[1],
      lat: pt[0],
      type: node.type,
      weight: node.weight,
    };
  });

  const feats = nodePoints.map((node) => ({
    type: 'Feature',
    properties: { type: node.type, weight: node.weight },
    geometry: { type: 'Point', coordinates: [node.lng, node.lat] },
  }));

  if (feats.length === 0) {
    state.aoi_px = undefined;
    state.aoi_polygon = undefined;
    state._cachedViewHexes = undefined;
    state._cachedAoiKey = undefined;
    state._lastViewHexesKey = undefined;
    state._multiFrictionObj = undefined;
    if (mapInstance.getSource('pins')) {
      mapInstance.getSource('pins').setData({ type: 'FeatureCollection', features: [] });
    }
    clearLayers(state, mapInstance);
    return;
  }

  const aoi = buildCircularAoiPolygon(mapInstance, nodePoints);
  state.aoi_px = aoi.aoiPx;
  state.aoi_polygon = aoi.aoiPolygon;

  if (!mapInstance.getSource('pins')) {
    mapInstance.addSource('pins', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: feats },
    });
    mapInstance.addLayer({
      id: 'pin-circles',
      type: 'circle',
      source: 'pins',
      paint: {
        'circle-radius': ['+', 7, ['*', ['get', 'weight'], 2.5]],
        'circle-color': [
          'match',
          ['get', 'type'],
          'origin',
          '#28a745',
          'destination',
          '#dc3545',
          'dual',
          '#ffc107',
          '#000',
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
        'circle-opacity': [
          'case',
          ['==', ['get', 'type'], 'origin'],
          0.9,
          ['==', ['get', 'type'], 'destination'],
          0.9,
          ['==', ['get', 'type'], 'dual'],
          0.95,
          0.7,
        ],
        'circle-blur': 0.1,
      },
    });
    mapInstance.addLayer({
      id: 'pin-labels',
      type: 'symbol',
      source: 'pins',
      layout: {
        'text-field': ['concat', '×', ['get', 'weight']],
        'text-size': 10,
        'text-allow-overlap': true,
        'text-transform': 'uppercase',
        'text-font': ['literal', ['IBM Plex Sans Bold']],
      },
      paint: { 'text-color': '#ffffff' },
    });
    // Add glow effect for dual nodes
    mapInstance.addLayer({
      id: 'pin-glow',
      type: 'circle',
      source: 'pins',
      paint: {
        'circle-radius': ['+', 7, ['*', ['get', 'weight'], 2.5]],
        'circle-color': [
          'match',
          ['get', 'type'],
          'dual',
          'rgba(246, 200, 95, 0.3)',
          'rgba(0, 0, 0, 0)',
        ],
        'circle-blur': 15,
        'circle-opacity': 0.6,
      },
      filter: ['==', ['get', 'type'], 'dual'],
    });
  } else {
    mapInstance.getSource('pins').setData({
      type: 'FeatureCollection',
      features: feats,
    });
  }
}

function updateOrCreateLayer(existingLayer, layerProps) {
  if (existingLayer) {
    if (typeof existingLayer.setProps === 'function') {
      existingLayer.setProps(layerProps);
      return existingLayer;
    }
    if (typeof existingLayer.clone === 'function') {
      return existingLayer.clone(layerProps);
    }
    Object.assign(existingLayer, layerProps);
    return existingLayer;
  }
  return new H3HexagonLayer(layerProps);
}

// Unified path-desire lookup that works for both Map and plain-object scores.
function getPathScore(pathObj, h) {
  if (!pathObj) return 0;
  if (typeof pathObj.get === 'function') return pathObj.get(h) || 0;
  return pathObj[h] || 0;
}

export function updateLayers(state, mapInstance) {
  const viewHexes = mapInstance.getHexes?.() ?? Array.from(state.cellFrictionMap?.keys() ?? []);
  // No AOI / no cells yet (e.g. surface polygons drawn before any node exists)
  // — nothing to render, so skip the layer rebuild instead of throwing.
  if (!viewHexes || !viewHexes.length) return;

  // B: the Maps are the single source of truth at mapping/render time — we no
  // longer keep a full plain-object copy (`_frictionObj`/`_affordanceObj`) of
  // them just for the renderer. Friction is read straight from `cellFrictionMap`
  // (it is immutable during a sim; draw-obstacle edits write the Map too).
  // Affordance is read from the live sim working copy `_affordanceObj` when a sim
  // has run (it holds the accumulated wear that `affordanceMap` — a pre-sim
  // snapshot — does not), otherwise from `affordanceMap`. Both sources are read
  // per-cell below, so we never materialize a second N-entry container here.
  const frictionMap = state.cellFrictionMap;
  const affObj = state._affordanceObj;
  const useAffObj = !!affObj;
  const affMap = state.affordanceMap;
  const pathObj = state.pathDesireScores; // Map or plain object

  // Only rebuild the per-view flat/flow arrays when the underlying data or the
  // visible hex set actually changed. Calls that don't mutate the data (e.g.
  // the friction-mesh visibility toggle) skip the rebuild entirely and just
  // re-apply the layer props below. `_layerDataVersion` is bumped at every
  // site that changes the canonical maps (grid.js / compute.js).
  const dataVersion = state._layerDataVersion || 0;
  const viewRef = viewHexes;
  const unchanged =
    state._lastLayerDataVersion !== undefined &&
    state._lastLayerDataVersion === dataVersion &&
    state._lastViewHexes === viewRef &&
    state._flatData;

  const logMax = Math.log1p(state.globalPeakFlow ?? 1);
  const invLogMax = logMax > 0 ? 1 / logMax : 0;

  const _stopsR = [235, 198, 156, 129, 77];
  const _stopsG = [210, 153, 95, 15, 0];
  const _stopsB = [236, 201, 160, 124, 73];
  const stopsN = 5;

  // Reuse pre-allocated object pools to avoid per-frame allocations at scale.
  const len = viewHexes.length;
  if (!state._flatPool) {
    state._flatPool = [];
    state._flowPool = [];
  }
  while (state._flatPool.length < len) {
    state._flatPool.push({ hex: '', f: 0, s: 0, a: 0.1 });
  }

  let flatData;
  let flowData;

  if (!unchanged) {
    let flatCount = 0;
    let flowCount = 0;

    for (let i = 0; i < len; i++) {
      const h = viewHexes[i];
      const s = getPathScore(pathObj, h);
      const entry = state._flatPool[flatCount++];
      entry.hex = h;
      entry.f = (frictionMap ? frictionMap.get(h) : undefined) ?? FRICTION_COSTS.PAVEMENT;
      entry.s = s;
      entry.a = (useAffObj ? affObj[h] : affMap?.get(h)) ?? 0.1;
      if (s > 0) {
        while (state._flowPool.length < flowCount + 1) {
          state._flowPool.push({ hex: '', f: 0, s: 0, a: 0.1 });
        }
        state._flowPool[flowCount++] = entry;
      }
    }

    state._flatData = state._flatPool.slice(0, flatCount);
    state._flowData = state._flowPool.slice(0, flowCount);
    // Shrink the reusable pools when the AOI contracts so they don't retain
    // entries from the largest area ever seen (review12 #11). The slice above
    // already copies only the live entries, so truncating is safe.
    state._flatPool.length = flatCount;
    state._flowPool.length = flowCount;
    state._lastLayerDataVersion = dataVersion;
    state._lastViewHexes = viewRef;

    // Version counters let updateTriggers fire only when data actually changes,
    // without relying on array-reference churn.
    state._flatDataVersion = (state._flatDataVersion || 0) + 1;
    state._flowDataVersion = (state._flowDataVersion || 0) + 1;
  }

  flatData = state._flatData;
  flowData = state._flowData;

  // Anchor the footprint/flow deck layers just below the node pins so the pins
  // always stay on top (visible + clickable). Fall back to the label layer only
  // until the pin layers exist.
  const pinLayerId = mapInstance.getLayer('pin-circles') ? 'pin-circles' : state.targetLabelLayerId;

  const baseLayerProps = {
    id: 'friction-mesh',
    data: flatData,
    extruded: false,
    pickable: false,
    beforeId: pinLayerId,
    stroked: false,
    getLineWidth: 0,
    filled: true,
    getHexagon: (d) => d.hex,
    getFillColor: (d) => {
      if (d.f >= FRICTION_COSTS.IMPASSABLE) return [231, 76, 60, 160];
      if (d.f === FRICTION_COSTS.HEAVY_GRASS) return [39, 174, 96, 120];
      if (d.f === FRICTION_COSTS.LIGHT_PARK) return [166, 216, 84, 90];
      return [0, 150, 255, 25];
    },
    updateTriggers: { getFillColor: [state._flatDataVersion] },
  };

  const flowLayerProps = {
    id: 'flow-mesh',
    data: flowData,
    extruded: false,
    pickable: true,
    onHover: (info) => handleFlowHover(info, flowData),
    beforeId: pinLayerId,
    stroked: false,
    getLineWidth: 0,
    filled: true,
    getHexagon: (d) => d.hex,
    getFillColor: (d) => {
      const ratio = invLogMax > 0 ? Math.min(1, Math.log1p(d.s) * invLogMax) : 0;
      const pos = ratio * (stopsN - 1);
      const idx = pos | 0;
      const t = pos - idx;
      const c1r = _stopsR[idx];
      const c1g = _stopsG[idx];
      const c1b = _stopsB[idx];
      const c2i = idx + 1 < stopsN ? idx + 1 : idx;
      const r = (c1r + (_stopsR[c2i] - c1r) * t) | 0;
      const g = (c1g + (_stopsG[c2i] - c1g) * t) | 0;
      const b = (c1b + (_stopsB[c2i] - c1b) * t) | 0;
      const a = (140 + 115 * ratio) | 0;
      return [r, g, b, a];
    },
    updateTriggers: { getFillColor: [state._flowDataVersion, state.globalPeakFlow] },
  };

  state.baseLayer = updateOrCreateLayer(state.baseLayer, baseLayerProps);
  state.flowLayer = updateOrCreateLayer(state.flowLayer, flowLayerProps);

  const layers =
    state.showFrictionMesh === false ? [state.flowLayer] : [state.baseLayer, state.flowLayer];
  state.deckOverlayInstance?.setProps({ layers });
}

function getScore(state, cell) {
  const scores = state.pathDesireScores;
  if (!scores) return 0;
  if (typeof scores.get === 'function') return scores.get(cell) || 0;
  return scores[cell] || 0;
}

export function buildSimulationGeoJSON(state, mapInstance) {
  const pathScores = state.pathDesireScores;
  let scoreCells;
  if (pathScores) {
    if (typeof pathScores.keys === 'function') scoreCells = Array.from(pathScores.keys());
    else scoreCells = Object.keys(pathScores);
  }

  const viewHexes = mapInstance.getHexes?.() ?? Array.from(state.cellFrictionMap?.keys() ?? []);

  // Merge: scored cells + visible hexes that aren't already scored
  const allHexes = new Set(scoreCells ?? []);
  for (const h of viewHexes) {
    if (!allHexes.has(h)) allHexes.add(h);
  }

  const features = [];

  for (const cell of allHexes) {
    const score = getScore(state, cell);
    if (!score) continue;

    const boundary = cellToBoundary(cell, true);
    // Friction: the Map is canonical. Affordance: prefer the live sim working
    // copy `_affordanceObj` (accumulated wear) when present, else the Map.
    const affordanceObj = state._affordanceObj;
    const friction = state.cellFrictionMap?.get(cell) ?? FRICTION_COSTS.PAVEMENT;
    // `_affordanceObj` is the canonical `affordanceMap` view (a FrictionArrayMap
    // in production, a Map in tests) — read it through the Map interface when
    // available, falling back to bracket access for any legacy plain-object
    // fixture. Either way prefer it over `affordanceMap` (the pre-sim snapshot).
    const affordance =
      (affordanceObj && typeof affordanceObj.get === 'function'
        ? affordanceObj.get(cell)
        : affordanceObj?.[cell]) ?? (state.affordanceMap?.get(cell) ?? 0);

    features.push({
      type: 'Feature',
      properties: {
        h3: cell,
        desireScore: score,
        affordance,
        friction,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [boundary],
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

export function exportSimulationGeoJSON(state, mapInstance) {
  const geojson = buildSimulationGeoJSON(state, mapInstance);
  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `desire-paths-${date}.geojson`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return geojson;
}

export function clearLayers(state, mapInstance) {
  state.baseLayer = null;
  state.flowLayer = null;
  state.deckOverlayInstance?.setProps({ layers: [] });
  const canvas = mapInstance.getCanvas?.();
  if (canvas) canvas.style.cursor = 'crosshair';
}
