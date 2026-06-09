import { cellToLatLng } from 'h3-js';
import { FRICTION_COSTS, BUFFER_PX } from './constants.js';
//import { Deck } from '@deck.gl/core';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import maplibregl from 'maplibre-gl';

export function renderInterfacePins() {
  const bounds = new maplibregl.LngLatBounds();
  const mapSE = this.project(this.getBounds().getSouthEast());

  const feats = Object.entries(this.simulationNodes ?? {}).map(([k, node]) => {
    const pt = cellToLatLng(k);
    bounds.extend([pt[1], pt[0]]);
    return {
      type: 'Feature',
      properties: { type: node.type, weight: node.weight },
      geometry: { type: 'Point', coordinates: [pt[1], pt[0]] },
    };
  });

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

  let nw = this.project(bounds.getNorthWest());
  let se = this.project(bounds.getSouthEast());
  nw = [Math.max(0, nw.x - BUFFER_PX), Math.max(0, nw.y - BUFFER_PX)];
  se = [Math.min(mapSE.x, se.x + BUFFER_PX), Math.min(mapSE.y, se.y + BUFFER_PX)];

  const sw = this.unproject([nw[0], se[1]]);
  const ne = this.unproject([se[0], nw[1]]);

  this.aoi_px = [nw, se];
  this.aoi_polygon = [
    [sw.lng, sw.lat],
    [ne.lng, sw.lat],
    [ne.lng, ne.lat],
    [sw.lng, ne.lat],
    [sw.lng, sw.lat],
  ];

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

export function clearLayers() {
  this.baseLayer = null;
  this.flowLayer = null;
  this.deckOverlayInstance?.setProps({ layers: [] });
  const canvas = this.getCanvas?.();
  if (canvas) canvas.style.cursor = 'crosshair';
}
