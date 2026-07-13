import { describe, it, expect, vi } from 'vitest';

// Deterministic cell so we can assert the gradient friction source is updated.
const DRAWN = 'drawn-cell';

vi.mock('h3-js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    polygonToCells: vi.fn(() => [DRAWN]),
    latLngToCell: vi.fn(() => DRAWN),
    gridPathCells: vi.fn(() => [DRAWN]),
  };
});

import { FRICTION_COSTS } from '../src/helpers/constants.js';

function createMockMap() {
  return {
    multiFrictionMap: new Map(),
    cellFrictionMap: new Map(),
    _frictionObj: undefined,
    _gradientCache: undefined,
    _gradientCacheGen: 5,
    _polyCache: undefined,
    _pathCache: undefined,
  };
}

describe('drawing obstacles updates the gradient friction source (C5)', () => {
  it('mapPolygonCells recomputes cellFrictionMap and invalidates the gradient cache', async () => {
    const { mapPolygonCells } = await import('../src/helpers/grid.js');
    const map = createMockMap();
    map.multiFrictionMap.set(DRAWN, { '0': FRICTION_COSTS.PAVEMENT });
    map.cellFrictionMap.set(DRAWN, FRICTION_COSTS.PAVEMENT);

    mapPolygonCells(map, map, [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], {
      layer: '0',
      cost: 'IMPASSABLE',
    });

    // The drawn barrier must be visible to the gradient (which reads cellFrictionMap).
    expect(map.cellFrictionMap.get(DRAWN)).toBe(FRICTION_COSTS.IMPASSABLE);
    // The cached gradient graph topology + per-target gradient cache must be dropped.
    expect(map._gradientCache).toBeNull();
    expect(map._gradientCacheGen).toBeUndefined();
  });

  it('mapLineCells recomputes cellFrictionMap and invalidates the gradient cache', async () => {
    const { mapLineCells } = await import('../src/helpers/grid.js');
    const map = createMockMap();
    map.multiFrictionMap.set(DRAWN, { '0': FRICTION_COSTS.PAVEMENT });
    map.cellFrictionMap.set(DRAWN, FRICTION_COSTS.PAVEMENT);

    mapLineCells(map, map, [[0, 0], [1, 1]], { layer: '0', cost: 'IMPASSABLE' });

    expect(map.cellFrictionMap.get(DRAWN)).toBe(FRICTION_COSTS.IMPASSABLE);
    expect(map._gradientCache).toBeNull();
    expect(map._gradientCacheGen).toBeUndefined();
  });

  it('does not throw when cellFrictionMap is absent', async () => {
    const { mapPolygonCells } = await import('../src/helpers/grid.js');
    const map = createMockMap();
    map.cellFrictionMap = undefined;
    map.multiFrictionMap.set(DRAWN, { '0': FRICTION_COSTS.PAVEMENT });

    expect(() =>
      mapPolygonCells(map, map, [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], {
        layer: '0',
        cost: 'IMPASSABLE',
      })
    ).not.toThrow();
  });
});
