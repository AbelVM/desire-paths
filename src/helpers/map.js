import { cellToLatLng } from 'h3-js';
import { FRICTION_COSTS, BUFFER_PX } from './constants.js';
//import { Deck } from '@deck.gl/core';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import maplibregl from 'maplibre-gl';

export function renderInterfacePins() {
  const bounds = new maplibregl.LngLatBounds();
  const mapSE = this.project(this.getBounds().getSouthEast());

  const feats = Object.keys(this.simulationNodes).map((k) => {
    const pt = cellToLatLng(k);
    const node = this.simulationNodes[k];
    bounds.extend([pt[1], pt[0]]);
    return {
      type: 'Feature',
      properties: { type: node.type, weight: node.weight },
      geometry: { type: 'Point', coordinates: [pt[1], pt[0]] },
    };
  });

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
  const viewHexes = Array.from(this.cellFrictionMap.keys());
  const len = viewHexes.length;
  for (let i = 0; i < len; i++) {
    const h = viewHexes[i];
    flatData.push({
      hex: h,
      f: this.cellFrictionMap.get(h),
      s: this.pathDesireScores.get(h),
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
      // FIX: Logarithmic distribution formula handles weight outliers beautifully
      const logScore = Math.log1p(d.s);
      const logMax = Math.log1p(this.globalPeakFlow);
      const ratio = logMax > 0 ? logScore / logMax : 0;

      return [
        Math.floor(135 + 120 * ratio),
        0,
        Math.floor(236 * ratio),
        Math.floor(140 + 115 * ratio),
      ];
    },
    updateTriggers: { getFillColor: [flatData, this.globalPeakFlow] },
  });

  this.deckOverlayInstance.setProps({
    layers: [this.baseLayer, this.flowLayer],
  });
}

export function clearLayers() {
  if (this.flowLayer) this.flowLayer = null;
  this.deckOverlayInstance.setProps({ layers: [this.baseLayer] });
}
