// Shared geometric helpers used by both the main-thread kernel (compute.js)
// and the worker kernel (agentTasks.js) so the two implementations stay in
// sync and we avoid duplicate bearing/angle math.

// Bearing (degrees, [0,360)) from cell `s` to cell `e`, given their
// precomputed [lat, lng, latRad, lngRad] lat/lng arrays (as returned by
// _getCachedLatLng). Assumes radians are present.
export function _bearingFromLatLngs(s, e) {
  const lat1 = s[2];
  const lon1 = s[3];
  const lat2 = e[2];
  const lon2 = e[3];
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Smallest absolute angular difference between two bearings (degrees).
export function angleDiff(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}
