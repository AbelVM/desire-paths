import { gridDisk, gridRing, polygonToCells } from 'h3-js';
import { MinHeap } from './minheap.js';
import {
  FRICTION_COSTS,
  H3_STRIDE_RESOLUTION,
  IMPASSABLE_BLUR_RADIUS,
  IMPASSABLE_BLUR_SIGMA,
  IMPASSABLE_BLUR_FRICTION_ADD,
  getSurface,
} from './constants.js';

const FAST_SCAN_LAYERS = new Set(['transportation', 'building', 'water', 'landcover', 'landuse']);

export function normalizeFrictionEntries(source) {
  const lookup = Object.create(null);
  if (!source) return lookup;

  if (typeof source.entries === 'function') {
    for (const [cell, value] of source) lookup[cell] = value;
    return lookup;
  }

  for (const cell in source) lookup[cell] = source[cell];
  return lookup;
}

function computeDijkstraGradientForLookup(targetCell, frictionLookup) {
  const distances = Object.create(null);
  const visited = new Set();
  const heap = new MinHeap();

  distances[targetCell] = 0;
  heap.insert(targetCell, 0);

  while (heap.size() > 0) {
    const current = heap.extractMin();
    if (visited.has(current)) continue;
    visited.add(current);

    const currentDistance = distances[current];
    const neighbors = gridDisk(current, 1);

    for (let i = 0; i < neighbors.length; i++) {
      const neighbor = neighbors[i];
      if (neighbor === current) continue;

      const friction = frictionLookup[neighbor];
      if (typeof friction === 'undefined' || friction >= FRICTION_COSTS.IMPASSABLE) continue;

      const nextDistance = currentDistance + friction;
      if (!(neighbor in distances) || nextDistance < distances[neighbor]) {
        distances[neighbor] = nextDistance;
        heap.insert(neighbor, nextDistance);
      }
    }
  }

  return distances;
}

export function computeDijkstraGradientSnapshot(targetCell, frictionSource) {
  return computeDijkstraGradientForLookup(targetCell, normalizeFrictionEntries(frictionSource));
}

export function computeGradientBatch({ frictionEntries, targets }) {
  const frictionLookup = normalizeFrictionEntries(frictionEntries);
  const gradients = Object.create(null);

  for (let i = 0; i < targets.length; i++) {
    const targetCell = targets[i];
    gradients[targetCell] = computeDijkstraGradientForLookup(targetCell, frictionLookup);
  }

  return gradients;
}

function collectFastScanEntries({ features = [], viewHexes = [] } = {}) {
  const viewLookup = Object.create(null);
  for (let i = 0; i < viewHexes.length; i++) viewLookup[viewHexes[i]] = 1;

  const multiFrictionEntries = Object.create(null);

  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    if (!feature || !feature.geometry) continue;
    if (!FAST_SCAN_LAYERS.has(feature.sourceLayer)) continue;

    const surface = getSurface(feature);
    if (!surface || !surface.layer || !surface.cost) continue;

    const layerKey = surface.layer;
    const layerVal = FRICTION_COSTS[surface.cost];
    if (typeof layerVal === 'undefined') continue;

    const geometry = feature.geometry;
    const applyCells = (coords) => {
      const cells = polygonToCells(coords, H3_STRIDE_RESOLUTION, true);
      for (let j = 0; j < cells.length; j++) {
        const cell = cells[j];
        if (!viewLookup[cell]) continue;

        let layerMap = multiFrictionEntries[cell];
        if (!layerMap) layerMap = multiFrictionEntries[cell] = Object.create(null);
        if (layerMap[layerKey] === undefined || layerVal > layerMap[layerKey]) layerMap[layerKey] = layerVal;
      }
    };

    if (geometry.type === 'Polygon') {
      applyCells(geometry.coordinates);
    } else if (geometry.type === 'MultiPolygon') {
      const polygons = geometry.coordinates;
      for (let j = 0; j < polygons.length; j++) applyCells(polygons[j]);
    }
  }

  const cellFrictionEntries = Object.create(null);
  for (let i = 0; i < viewHexes.length; i++) {
    const cell = viewHexes[i];
    const layerMap = multiFrictionEntries[cell];
    cellFrictionEntries[cell] = layerMap && layerMap['0'] !== undefined ? layerMap['0'] : 0;
  }

  return { multiFrictionEntries, cellFrictionEntries };
}

export function computeFastScanSnapshot({ features = [], viewHexes = [] } = {}) {
  const { multiFrictionEntries, cellFrictionEntries } = collectFastScanEntries({ features, viewHexes });

  const blur = computeImpassableBlurSnapshot({ frictionEntries: cellFrictionEntries });
  return {
    multiFrictionEntries,
    cellFrictionEntries,
    blurWeights: blur.blurWeights,
    blurUpdates: blur.updates,
  };
}

export function computeFastScanChunkSnapshot({ features = [], viewHexes = [] } = {}) {
  return collectFastScanEntries({ features, viewHexes });
}

export function computeImpassableBlurSnapshot({
  frictionEntries,
  radius = IMPASSABLE_BLUR_RADIUS,
  sigma = IMPASSABLE_BLUR_SIGMA,
  addFactor = IMPASSABLE_BLUR_FRICTION_ADD,
}) {
  const frictionLookup = normalizeFrictionEntries(frictionEntries);
  const impassables = [];

  for (const cell in frictionLookup) {
    if (frictionLookup[cell] >= FRICTION_COSTS.IMPASSABLE) impassables.push(cell);
  }

  const blurWeights = Object.create(null);
  if (impassables.length === 0) return { blurWeights, updates: [] };

  for (let i = 0; i < impassables.length; i++) {
    const cell = impassables[i];
    for (let d = 1; d <= radius; d++) {
      let ring;
      try {
        ring = gridRing(cell, d);
      } catch (error) {
        continue;
      }

      const weight = Math.exp(-0.5 * Math.pow(d / sigma, 2));
      for (let j = 0; j < ring.length; j++) {
        const ringCell = ring[j];
        const friction = frictionLookup[ringCell];
        if (typeof friction === 'undefined' || friction >= FRICTION_COSTS.IMPASSABLE) continue;
        blurWeights[ringCell] = (blurWeights[ringCell] || 0) + weight;
      }
    }
  }

  const updates = [];
  const impassableLimit = FRICTION_COSTS.IMPASSABLE - 1;
  for (const cell in blurWeights) {
    const nextFriction = Math.min(impassableLimit, (frictionLookup[cell] || 0) + blurWeights[cell] * addFactor);
    updates.push([cell, nextFriction]);
  }

  return { blurWeights, updates };
}
