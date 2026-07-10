// Canonical friction / affordance storage (review10 §3.1).
//
// The two hottest fields used to live in FOUR parallel containers:
//   cellFrictionMap (Map), affordanceMap (Map),
//   _frictionObj (plain object), _affordanceObj (plain object).
// They are now a single canonical representation:
//   state.frictionArr : Float32Array(N)  — friction, indexed by viewHexes order
//   state.affArr      : Float32Array(N)  — affordance working copy (mutated by sim)
//   state.cellToIdx   : Map<cell, number> — cell -> array index
//   state.viewHexes   : string[]          — the AOI cell order (already on state)
//
// `cellFrictionMap` / `affordanceMap` are thin Map-like VIEWS over these arrays
// (see FrictionArrayMap) so every existing consumer keeps working via the Map
// interface (get/set/has/size/keys/entries/clear/iteration) while the two hottest
// fields drop from two N-entry Maps to one N-entry index Map plus two compact
// typed arrays (~2x steady-state memory win). `cellToIdx` is the only remaining
// N-entry container and is required for cell->index lookups (the gradient graph
// builds its own passable-only index internally).

/** Build the cell->index Map from the AOI cell order. O(N), done once per mapping. */
export function buildCellToIdx(viewHexes) {
  const m = new Map();
  for (let i = 0; i < viewHexes.length; i++) m.set(viewHexes[i], i);
  return m;
}

/**
 * Thin Map-like view over a Float32Array indexed by `cellToIdx`.
 *
 * Exposes the subset of the Map interface the codebase actually uses
 * (get/set/has/size/keys/values/entries/clear/forEach/delete/iteration) while
 * the backing store is a compact typed array. `clear()` resets the array to 0
 * (callers always re-set every cell immediately after); `delete()` zeroes the
 * slot (the fixed-size array cannot shrink). `entries()`/`values()`/`iterator`
 * yield in `cellToIdx` order (== viewHexes order), which is what the gradient
 * graph and `_frictionObj` materialization rely on (order-independent there).
 *
 * Survives structured-clone only as a plain object (methods are dropped), but
 * every worker boundary runs `normalizeFrictionEntries` on the MAIN thread
 * first, which iterates the view into a plain object before posting — so the
 * view is never shipped across the worker boundary in instance form.
 */
export class FrictionArrayMap {
  constructor(arr, cellToIdx) {
    this._arr = arr;
    this._idx = cellToIdx;
  }

  get(cell) {
    const i = this._idx.get(cell);
    return i === undefined ? undefined : this._arr[i];
  }

  set(cell, v) {
    const i = this._idx.get(cell);
    if (i !== undefined) this._arr[i] = v;
    return this;
  }

  has(cell) {
    return this._idx.has(cell);
  }

  get size() {
    return this._idx.size;
  }

  clear() {
    this._arr.fill(0);
    return this;
  }

  delete(cell) {
    const i = this._idx.get(cell);
    if (i !== undefined) this._arr[i] = 0;
    return true;
  }

  keys() {
    return this._idx.keys();
  }

  values() {
    const arr = this._arr;
    const idx = this._idx;
    return (function* () {
      for (const i of idx.values()) yield arr[i];
    })();
  }

  entries() {
    const arr = this._arr;
    const idx = this._idx;
    return (function* () {
      for (const [cell, i] of idx) yield [cell, arr[i]];
    })();
  }

  forEach(fn, thisArg) {
    const arr = this._arr;
    for (const [cell, i] of this._idx) fn.call(thisArg, arr[i], cell, this);
  }

  [Symbol.iterator]() {
    return this.entries();
  }
}
