// Transferable serialization for the large read-only payloads shipped to agent
// workers. Structured-clone of huge Maps/objects (bearingMap, gradients, visibility)
// is the memory pressure that previously triggered SIGILL. Flattening to typed
// arrays lets us TRANSFER (zero-copy) the numeric payload while only the string
// keys are cloned. Reconstruction is behaviorally identical to the original.
//
// IMPORTANT: flattening always allocates NEW buffers, so the caller's original
// structures (e.g. state._precomputedBearings.data) are never detached.

/** Flatten a string→number map (plain object or Map) into a transferable form. */
export function flattenNumberMap(input) {
  if (!input || typeof input !== 'object') return input;
  if (input.__flat) return input; // already flat
  const keys = [];
  const vals = [];
  if (input instanceof Map) {
    for (const [k, v] of input) {
      keys.push(k);
      vals.push(Number(v) || 0);
    }
  } else {
    for (const k in input) {
      keys.push(k);
      vals.push(Number(input[k]) || 0);
    }
  }
  const arr = new Float32Array(keys.length);
  for (let i = 0; i < keys.length; i++) arr[i] = vals[i];
  return { __flat: true, kind: 'nummap', keys, vals: arr };
}

/** Reconstruct a number map. Pass asMap=true to rebuild a Map, else a plain object. */
export function unflattenNumberMap(flat, asMap = false) {
  if (!flat || !flat.__flat) return flat;
  const { keys, vals } = flat;
  if (asMap) {
    const m = new Map();
    for (let i = 0; i < keys.length; i++) m.set(keys[i], vals[i]);
    return m;
  }
  const obj = Object.create(null);
  for (let i = 0; i < keys.length; i++) obj[keys[i]] = vals[i];
  return obj;
}

/** Flatten a string→(string→number) nested map into a transferable form. */
export function flattenNestedNumberMap(input) {
  if (!input || typeof input !== 'object') return input;
  if (input.__flat) return input; // already flat
  const outerKeys = [];
  const innerKeys = [];
  const vals = [];
  const offsets = [];
  const counts = [];
  for (const ok in input) {
    const inner = input[ok];
    if (!inner) continue;
    outerKeys.push(ok);
    offsets.push(innerKeys.length);
    let c = 0;
    for (const ik in inner) {
      innerKeys.push(ik);
      vals.push(Number(inner[ik]) || 0);
      c++;
    }
    counts.push(c);
  }
  const valsArr = new Float32Array(vals.length);
  for (let i = 0; i < vals.length; i++) valsArr[i] = vals[i];
  const offArr = new Int32Array(offsets);
  const cntArr = new Int32Array(counts);
  return {
    __flat: true,
    kind: 'nestnum',
    outerKeys,
    innerKeys,
    vals: valsArr,
    offsets: offArr,
    counts: cntArr,
  };
}

/** Reconstruct a nested number map as a plain object of plain objects. */
export function unflattenNestedNumberMap(flat) {
  if (!flat || !flat.__flat) return flat;
  const { outerKeys, innerKeys, vals, offsets, counts } = flat;
  const obj = Object.create(null);
  for (let o = 0; o < outerKeys.length; o++) {
    const start = offsets[o];
    const n = counts[o];
    const inner = Object.create(null);
    for (let i = 0; i < n; i++) {
      const idx = start + i;
      inner[innerKeys[idx]] = vals[idx];
    }
    obj[outerKeys[o]] = inner;
  }
  return obj;
}

/** True if the value is a non-empty flattenable map/object (and not already flat). */
export function shouldFlatten(x) {
  if (!x || typeof x !== 'object') return false;
  if (x.__flat) return false;
  if (Array.isArray(x)) return false;
  if (ArrayBuffer.isView(x)) return false;
  if (x instanceof Map) return x.size > 0;
  return Object.keys(x).length > 0;
}
