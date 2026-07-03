import { MinHeap } from './minheap.js';
import { FRICTION_COSTS } from './constants.js';
import { gridDisk } from 'h3-js';

/**
 * Core Dijkstra gradient computation.
 *
 * @param {string} targetCell - The H3 cell ID to compute distances from.
 * @param {Object|Function} frictionLookup - Either a plain object mapping cell IDs to friction costs,
 *   or a function `(cell) => frictionCost` that returns the friction for a given cell.
 * @param {Function} [getNeighbors] - Optional function `(cell) => neighborCellIds` that returns
 *   the neighbors for a given cell. Defaults to H3 `gridDisk(cell, 1)`.
 * @returns {Object} A plain object mapping reachable cell IDs to their distance from `targetCell`.
 */
export function computeDijkstra(targetCell, frictionLookup, getNeighbors) {
  const distances = Object.create(null);
  const visited = new Set();
  const heap = new MinHeap();

  const resolveFriction = typeof frictionLookup === 'function'
    ? frictionLookup
    : (cell) => frictionLookup[cell];

  const resolveNeighbors = typeof getNeighbors === 'function'
    ? getNeighbors
    : (cell) => gridDisk(cell, 1);

  distances[targetCell] = 0;
  heap.insert(targetCell, 0);

  while (heap.size() > 0) {
    const current = heap.extractMin();
    if (visited.has(current)) continue;
    visited.add(current);

    const currentDistance = distances[current];
    const neighbors = resolveNeighbors(current);

    for (let i = 0; i < neighbors.length; i++) {
      const neighbor = neighbors[i];
      if (neighbor === current) continue;

      const friction = resolveFriction(neighbor);
      if (typeof friction !== 'number' || friction >= FRICTION_COSTS.IMPASSABLE) continue;

      const nextDistance = currentDistance + friction;
      if (!Object.hasOwn(distances, neighbor) || nextDistance < distances[neighbor]) {
        distances[neighbor] = nextDistance;
        heap.insert(neighbor, nextDistance);
      }
    }
  }

  return distances;
}
