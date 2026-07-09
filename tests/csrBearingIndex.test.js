import { describe, it, expect } from 'vitest';
import { computeVisibilityBearingCSRIndexed } from '../src/helpers/spatialTasks.js';
import { reconstructVisibilityBearing } from '../src/helpers/bearingIndex.js';
import { latLngToCell, gridDisk, cellToLatLng } from 'h3-js';

// Correct great-circle bearing (matches the worker's formula after the P5 bearing
// bug fix). Used to assert the precomputed bearings are numerically correct, not
// just internally consistent.
function bearingBetween(a, b) {
  const [lat1, lng1] = cellToLatLng(a);
  const [lat2, lng2] = cellToLatLng(b);
  const lat1r = (lat1 * Math.PI) / 180;
  const lng1r = (lng1 * Math.PI) / 180;
  const lat2r = (lat2 * Math.PI) / 180;
  const lng2r = (lng2 * Math.PI) / 180;
  const y = Math.sin(lng2r - lng1r) * Math.cos(lat2r);
  const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(lng2r - lng1r);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

describe('P5 CSR-backed bearing/visibility (no per-pair Map)', () => {
  const center = latLngToCell(40.4169, -3.7035, 15);
  const viewHexes = gridDisk(center, 4);

  it('reconstructVisibilityBearing returns correct bearings via proxy', () => {
    // Build a minimal index-space graph manually.
    const N = viewHexes.length;
    // r=1 adjacency via gridDisk
    const idxOf = new Map();
    for (let i = 0; i < N; i++) idxOf.set(viewHexes[i], i);
    const adjOffsets = new Int32Array(N + 1);
    const temp = [];
    for (let i = 0; i < N; i++) {
      const disk = gridDisk(viewHexes[i], 1);
      for (const nb of disk) {
        if (nb === viewHexes[i]) continue;
        const j = idxOf.get(nb);
        if (j === undefined) continue;
        temp.push(j);
      }
      adjOffsets[i + 1] = temp.length;
    }
    const adjNeighbors = Int32Array.from(temp);
    const frictionArr = new Float32Array(N).fill(1);
    // NOTE: use Float64Array (not Float32Array as production does) so the tiny
    // lat/lng deltas between adjacent cells are not collapsed by Float32
    // precision — this isolates the great-circle FORMULA from float precision,
    // letting us assert the precomputed bearing equals the trig reference.
    const latLngArr = new Float64Array(N * 8);
    for (let i = 0; i < N; i++) {
      const [lat, lng] = cellToLatLng(viewHexes[i]);
      const latR = (lat * Math.PI) / 180;
      const lngR = (lng * Math.PI) / 180;
      const b = i * 8;
      latLngArr[b + 2] = latR;
      latLngArr[b + 3] = lngR;
      latLngArr[b + 4] = Math.sin(latR);
      latLngArr[b + 5] = Math.cos(latR);
      latLngArr[b + 6] = Math.sin(lngR);
      latLngArr[b + 7] = Math.cos(lngR);
    }

    const res = computeVisibilityBearingCSRIndexed({
      adjOffsets,
      adjNeighbors,
      frictionArr,
      latLngArr,
      visionDepth: 2,
    });
    const packed = (() => {
      const offsetsBytes = (res.N + 1) * 4;
      const neighborsBytes = res.P * 4;
      const total = offsetsBytes + neighborsBytes + res.P * 2; // Uint16 bearings
      const buf = new ArrayBuffer(total);
      new Int32Array(buf, 0, res.N + 1).set(res.localOffsets);
      new Int32Array(buf, offsetsBytes, res.P).set(res.visNeighbors);
      new Uint16Array(buf, offsetsBytes + neighborsBytes, res.P).set(res.bearings);
      return { buffer: buf, N: res.N, P: res.P, offsetsBytes, neighborsBytes };
    })();

    const { visibilityData, bearingMap } = reconstructVisibilityBearing(packed, viewHexes);

    // Ground-truth lookup by linearly scanning the raw CSR for (a, b). Used to
    // validate the proxy + sort + binary-search machinery WITHOUT asserting on the
    // (pre-existing, out-of-scope) bearing formula itself.
    function rawBearing(a, b) {
      const ai = idxOf.get(a);
      const bi = idxOf.get(b);
      if (ai === undefined || bi === undefined) return undefined;
      const s = res.localOffsets[ai];
      const e = res.localOffsets[ai + 1];
      for (let p = s; p < e; p++) {
        if (res.visNeighbors[p] === bi) return res.bearings[p];
      }
      return undefined;
    }
    function rawVisible(a, b) {
      const ai = idxOf.get(a);
      const bi = idxOf.get(b);
      if (ai === undefined || bi === undefined) return false;
      const s = res.localOffsets[ai];
      const e = res.localOffsets[ai + 1];
      for (let p = s; p < e; p++) {
        if (res.visNeighbors[p] === bi) return true;
      }
      return false;
    }

    // For every origin/neighbor pair, the proxy must match the raw CSR value.
    let checked = 0;
    for (let i = 0; i < N; i++) {
      const a = viewHexes[i];
      const disk = gridDisk(a, 2);
      for (const b of disk) {
        if (b === a) continue;
        const j = idxOf.get(b);
        if (j === undefined) continue;
        if (frictionArr[j] < 0) continue;
        // visibility
        const vis = visibilityData.data[a];
        expect(!!vis[b]).toBe(rawVisible(a, b));
        // bearing via .get (compute.js style)
        const bg1 = bearingMap.get?.(a + '::' + b);
        // bearing via bracket (agentTasks style)
        const bg2 = bearingMap[a + '::' + b];
        const expected = rawBearing(a, b);
        // Bearings are quantized to Uint16 (rounded, ±0.5°). `expected` is the
        // full-precision BFS value (already rounded in the kernel), so the proxy
        // must match it exactly.
        expect(bg1).toBe(Math.round(expected));
        expect(bg2).toBe(Math.round(expected));
        // Also assert the precomputed bearing is numerically correct (guards the
        // worker's great-circle formula against regression). Quantized to ±0.5°.
        expect(bg1).toBe(Math.round(bearingBetween(a, b)));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);

    // Unknown pair → undefined (trig fallback path)
    expect(bearingMap.get?.('nope::nope')).toBeUndefined();
    expect(bearingMap['nope::nope']).toBeUndefined();
    // Non-origin visibility → falsy (legacy fallback)
    expect(visibilityData.data['nope']).toBeUndefined();
  });
});
