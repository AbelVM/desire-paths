import { cellToLatLng } from 'h3-js';
import { FRICTION_COSTS, BUFFER_PX } from './constants.js';
//import { Deck } from '@deck.gl/core';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import maplibregl from 'maplibre-gl';

export function renderInterfacePins() {
  const bounds = new maplibregl.LngLatBounds();
  const mapSE = this.project(this.getBounds().getSouthEast());

  const feats = Object.entries(this.simulationNodes).map(([k, node]) => {
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
  const flatData = [];
  // Prefer AOI-ordered hexes when available, fall back to map keys
  const viewHexes = this.getHexes() || Array.from(this.cellFrictionMap.keys());

  // Snapshot Maps to plain objects for faster hot-loop property access
  const frictionObj = Object.create(null);
  for (const [k, v] of this.cellFrictionMap) frictionObj[k] = v;
  const pathObj = Object.create(null);
  for (const [k, v] of this.pathDesireScores) pathObj[k] = v;

  const len = viewHexes.length;
  for (let i = 0; i < len; i++) {
    const h = viewHexes[i];
    flatData.push({
      hex: h,
      f: frictionObj[h],
      s: pathObj[h] || 0,
    });
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
    data: flatData.filter((d) => d.s > 0),
    extruded: false,
    pickable: true,
    beforeId: this.targetLabelLayerId,
    stroked: false,
    getLineWidth: 0,
    filled: true,
    getHexagon: (d) => d.hex,
    getFillColor: (d) => {
      // Use logarithmic scaling for perceptual compression, then map into
      // the same purple ramp used by the legend via linear interpolation
      const logScore = Math.log1p(d.s);
      const logMax = Math.log1p(this.globalPeakFlow);
      const ratio = logMax > 0 ? Math.min(1, logScore / logMax) : 0;

      // Legend stops (from CSS): #ebd2ec, #c699c9, #9c5fa0, #810f7c, #4d0049
      const stops = [
        [235, 210, 236],
        [198, 153, 201],
        [156, 95, 160],
        [129, 15, 124],
        [77, 0, 73],
      ];
      const n = stops.length;
      const pos = ratio * (n - 1);
      const idx = Math.floor(pos);
      const t = pos - idx;
      const c1 = stops[idx];
      const c2 = stops[Math.min(idx + 1, n - 1)];
      const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
      const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
      const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
      const a = Math.floor(140 + 115 * ratio);
      return [r, g, b, a];
    },
    updateTriggers: { getFillColor: [flatData, this.globalPeakFlow] },
  });

  const layers = this.showFrictionMesh === false ? [this.flowLayer] : [this.baseLayer, this.flowLayer];
  this.deckOverlayInstance.setProps({
    layers: layers.filter(Boolean),
  });
}

export function clearLayers() {
  this.baseLayer = null;
  this.flowLayer = null;
  if (this.deckOverlayInstance) {
    this.deckOverlayInstance.setProps({ layers: [] });
  }
  if (this.getCanvas) {
    this.getCanvas().style.cursor = 'crosshair';
  }
}
