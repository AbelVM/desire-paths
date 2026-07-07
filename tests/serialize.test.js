import { describe, it, expect } from 'vitest';
import {
  flattenNumberMap,
  unflattenNumberMap,
  flattenNestedNumberMap,
  unflattenNestedNumberMap,
  shouldFlatten,
} from '../src/helpers/serialize.js';

describe('serialize: number map round-trip', () => {
  it('flattens and reconstructs a plain number map', () => {
    const src = Object.create(null);
    src['cellA'] = 1.5;
    src['cellB'] = 2.25;
    src['cellC'] = 0;

    const flat = flattenNumberMap(src);
    expect(flat.__flat).toBe(true);
    expect(Array.isArray(flat.keys)).toBe(true);
    expect(flat.keys).toEqual(['cellA', 'cellB', 'cellC']);
    expect(flat.vals).toBeInstanceOf(Float32Array);
    expect(flat.vals.buffer).toBeInstanceOf(ArrayBuffer);

    const restored = unflattenNumberMap(flat);
    expect(restored['cellA']).toBeCloseTo(1.5);
    expect(restored['cellB']).toBeCloseTo(2.25);
    expect(restored['cellC']).toBe(0);
  });

  it('reconstructs a Map when asMap is true', () => {
    const src = Object.create(null);
    src['x'] = 3;
    src['y'] = 4;
    const flat = flattenNumberMap(src);
    const restored = unflattenNumberMap(flat, true);
    expect(restored instanceof Map).toBe(true);
    expect(restored.get('x')).toBeCloseTo(3);
    expect(restored.get('y')).toBeCloseTo(4);
  });

  it('does not mutate the caller original', () => {
    const src = Object.create(null);
    src['a'] = 1;
    src['b'] = 2;
    flattenNumberMap(src);
    expect(src['a']).toBe(1);
    expect(src['b']).toBe(2);
  });
});

describe('serialize: nested number map round-trip', () => {
  it('flattens and reconstructs a nested number map', () => {
    const src = Object.create(null);
    src['cellA'] = Object.create(null);
    src['cellA']['layer1'] = 1;
    src['cellA']['layer2'] = 2;
    src['cellB'] = Object.create(null);
    src['cellB']['layer1'] = 3;

    const flat = flattenNestedNumberMap(src);
    expect(flat.__flat).toBe(true);
    expect(flat.vals).toBeInstanceOf(Float32Array);

    const restored = unflattenNestedNumberMap(flat);
    expect(restored['cellA']['layer1']).toBeCloseTo(1);
    expect(restored['cellA']['layer2']).toBeCloseTo(2);
    expect(restored['cellB']['layer1']).toBeCloseTo(3);
  });

  it('preserves layer key ordering', () => {
    const src = Object.create(null);
    src['c'] = Object.create(null);
    src['c']['z'] = 1;
    src['c']['a'] = 2;
    const flat = flattenNestedNumberMap(src);
    expect(flat.innerKeys).toEqual(['z', 'a']);
    const restored = unflattenNestedNumberMap(flat);
    expect(Object.keys(restored['c'])).toEqual(['z', 'a']);
  });
});

describe('serialize: shouldFlatten guards', () => {
  it('returns false for null/undefined/array/typed-array/empty', () => {
    expect(shouldFlatten(null)).toBe(false);
    expect(shouldFlatten(undefined)).toBe(false);
    expect(shouldFlatten([])).toBe(false);
    expect(shouldFlatten(new Float32Array(3))).toBe(false);
    expect(shouldFlatten(Object.create(null))).toBe(false);
  });

  it('returns true for a non-empty plain object', () => {
    const o = Object.create(null);
    o['k'] = 1;
    expect(shouldFlatten(o)).toBe(true);
  });

  it('returns true for a non-empty Map', () => {
    const m = new Map();
    m.set('k', 1);
    expect(shouldFlatten(m)).toBe(true);
  });
});
