import { cellToBoundary, cellToLatLng } from 'h3-js';
import { FRICTION_COSTS, BUFFER_PX } from './constants.js';
import { H3HexagonLayer } from '@deck.gl/geo-layers';

// Flow hover handler — updates tooltip with hex data
export function handleFlowHover(info) {
  const tooltip = document.getElementById('hex-tooltip');
  if (!tooltip) return;

  // info.object contains the data object (hex cell entry)
  if (info.object && info.object.hex) {
    tooltip.hidden = false;
    const score = Math.round(info.object.s);
    const friction = info.object.f;
    tooltip.innerHTML = `<strong>Flow:</strong> ${score} paths · <strong>Friction:</strong> ${friction}`;
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

export function updateLayers(state, mapInstance) {
  const viewHexes = mapInstance.getHexes?.() ?? Array.from(state.cellFrictionMap?.keys() ?? []);

  const frictionObj = Object.create(null);
  if (state.cellFrictionMap && typeof state.cellFrictionMap.entries === 'function') {
    for (const [k, v] of state.cellFrictionMap.entries()) frictionObj[k] = v;
  } else {
    for (const k in state.cellFrictionMap ?? {}) frictionObj[k] = state.cellFrictionMap[k];
  }

  const pathObj = Object.create(null);
  if (state.pathDesireScores) {
    if (typeof state.pathDesireScores.entries === 'function') {
      for (const [k, v] of state.pathDesireScores.entries()) pathObj[k] = v;
    } else {
      for (const k in state.pathDesireScores) pathObj[k] = state.pathDesireScores[k];
    }
  }

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
    state._flatPool.push({ hex: '', f: 0, s: 0 });
  }

  let flatCount = 0;
  let flowCount = 0;

  for (let i = 0; i < len; i++) {
    const h = viewHexes[i];
    const s = pathObj[h] ?? 0;
    const entry = state._flatPool[flatCount++];
    entry.hex = h;
    entry.f = frictionObj[h] ?? 0;
    entry.s = s;
    if (s > 0) {
      while (state._flowPool.length < flowCount + 1) {
        state._flowPool.push({ hex: '', f: 0, s: 0 });
      }
      state._flowPool[flowCount++] = entry;
    }
  }

  const flatData = state._flatPool.slice(0, flatCount);
  const flowData = state._flowPool.slice(0, flowCount);

  // Version counters let updateTriggers fire only when data actually changes,
  // without relying on array-reference churn.
  state._flatDataVersion = (state._flatDataVersion || 0) + 1;
  state._flowDataVersion = (state._flowDataVersion || 0) + 1;

  const baseLayerProps = {
    id: 'friction-mesh',
    data: flatData,
    extruded: false,
    pickable: false,
    beforeId: state.targetLabelLayerId,
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
    onHover: (info) => handleFlowHover(info),
    beforeId: state.targetLabelLayerId,
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
    const frictionObj = state._frictionObj || {};
    const affordanceObj = state._affordanceObj || {};
    const friction =
      typeof frictionObj[cell] === 'number'
        ? frictionObj[cell]
        : (state.cellFrictionMap?.get(cell) ?? 0);
    const affordance =
      typeof affordanceObj[cell] === 'number'
        ? affordanceObj[cell]
        : (state.affordanceMap?.get(cell) ?? 0);

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
