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

export function renderInterfacePins() {
  const nodePoints = Object.entries(this.simulationNodes ?? {}).map(([k, node]) => {
    const pt = cellToLatLng(k);
    return {
      cell: k,
      point: this.project([pt[1], pt[0]]),
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
    this.aoi_px = undefined;
    this.aoi_polygon = undefined;
    this._cachedViewHexes = undefined;
    this._cachedAoiKey = undefined;
    this._lastViewHexesKey = undefined;
    this._multiFrictionObj = undefined;
    if (this.getSource('pins')) {
      this.getSource('pins').setData({ type: 'FeatureCollection', features: [] });
    }
    this.clearLayers();
    return;
  }

  const aoi = buildCircularAoiPolygon(this, nodePoints);
  this.aoi_px = aoi.aoiPx;
  this.aoi_polygon = aoi.aoiPolygon;

  if (!this.getSource('pins')) {
    this.addSource('pins', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: feats },
    });
    this.addLayer({
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
          'both',
          '#ffc107',
          '#000',
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    });
    this.addLayer({
      id: 'pin-labels',
      type: 'symbol',
      source: 'pins',
      layout: {
        'text-field': ['concat', ['get', 'weight'], 'p'],
        'text-size': 10,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#ffffff' },
    });
  } else {
    this.getSource('pins').setData({
      type: 'FeatureCollection',
      features: feats,
    });
  }
}

export function updateLayers() {
  // Prefer AOI-ordered hexes when available, fall back to map keys
  const viewHexes = this.getHexes() ?? Array.from(this.cellFrictionMap?.keys() ?? []);

  // Snapshot Maps to plain objects for faster hot-loop property access
  const frictionObj = Object.create(null);
  for (const [k, v] of this.cellFrictionMap ?? []) frictionObj[k] = v;
  const pathObj = Object.create(null);
  if (this.pathDesireScores) {
    if (this.pathDesireScores.entries) {
      for (const [k, v] of this.pathDesireScores) pathObj[k] = v;
    } else {
      for (const k in this.pathDesireScores) pathObj[k] = this.pathDesireScores[k];
    }
  }

  // Pre-compute logMax once instead of per-hex in getFillColor callback
  const logMax = Math.log1p(this.globalPeakFlow ?? 1);
  const invLogMax = logMax > 0 ? 1 / logMax : 0;

  // Legend stops (from CSS): #ebd2ec, #c699c9, #9c5fa0, #810f7c, #4d0049
  // Pre-declare to avoid per-call allocation
  const _stopsR = [235, 198, 156, 129, 77];
  const _stopsG = [210, 153, 95, 15, 0];
  const _stopsB = [236, 201, 160, 124, 73];
  const stopsN = 5;

  // Build flatData and flowData in a single pass to avoid filter() allocation
  const flatData = [];
  const flowData = [];
  const len = viewHexes.length;
  for (let i = 0; i < len; i++) {
    const h = viewHexes[i];
    const s = pathObj[h] ?? 0;
    const entry = { hex: h, f: frictionObj[h] ?? 0, s };
    flatData.push(entry);
    if (s > 0) flowData.push(entry);
  }

  this.baseLayer = new H3HexagonLayer({
    id: 'friction-mesh',
    data: flatData,
    extruded: false,
    pickable: false,
    beforeId: this.targetLabelLayerId,
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
    updateTriggers: { getFillColor: [flatData] },
  });

  this.flowLayer = new H3HexagonLayer({
    id: 'flow-mesh',
    data: flowData,
    extruded: false,
    pickable: true,
    onHover: (info) => handleFlowHover(info),
    beforeId: this.targetLabelLayerId,
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
      const r = c1r + ((_stopsR[c2i] - c1r) * t) | 0;
      const g = c1g + ((_stopsG[c2i] - c1g) * t) | 0;
      const b = c1b + ((_stopsB[c2i] - c1b) * t) | 0;
      const a = 140 + (115 * ratio) | 0;
      return [r, g, b, a];
    },
    updateTriggers: { getFillColor: [flowData, this.globalPeakFlow] },
  });

  const layers =
    this.showFrictionMesh === false ? [this.flowLayer] : [this.baseLayer, this.flowLayer];
  this.deckOverlayInstance?.setProps({ layers });
}

function getScore(cell) {
  const scores = this.pathDesireScores;
  if (!scores) return 0;
  return typeof scores.get === 'function' ? scores.get(cell) || 0 : scores[cell] || 0;
}

export function buildSimulationGeoJSON() {
  const pathScores = this.pathDesireScores;
  let scoreCells;
  if (pathScores && typeof pathScores.keys === 'function') {
    scoreCells = Array.from(pathScores.keys());
  } else if (pathScores) {
    scoreCells = Object.keys(pathScores);
  }

  const viewHexes = this.getHexes?.() ?? Array.from(this.cellFrictionMap?.keys() ?? []);

  // Merge: scored cells + visible hexes that aren't already scored
  const allHexes = new Set(scoreCells);
  for (const h of viewHexes) {
    if (!allHexes.has(h)) allHexes.add(h);
  }

  const features = [];

  for (const cell of allHexes) {
    const score = getScore.call(this, cell);
    if (!score) continue;

    const boundary = cellToBoundary(cell, true);
    const frictionObj = this._frictionObj || {};
    const affordanceObj = this._affordanceObj || {};
    const friction = typeof frictionObj[cell] === 'number' ? frictionObj[cell] : this.cellFrictionMap?.get(cell) ?? 0;
    const affordance =
      typeof affordanceObj[cell] === 'number' ? affordanceObj[cell] : this.affordanceMap?.get(cell) ?? 0;

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

export function exportSimulationGeoJSON() {
  const geojson = buildSimulationGeoJSON.call(this);
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

export function clearLayers() {
  this.baseLayer = null;
  this.flowLayer = null;
  this.deckOverlayInstance?.setProps({ layers: [] });
  const canvas = this.getCanvas?.();
  if (canvas) canvas.style.cursor = 'crosshair';
}
