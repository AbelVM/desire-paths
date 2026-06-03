export function setupUI(map) {
  document.getElementById('btn-toggle-mode').addEventListener('click', () => {
    const lbl = document.getElementById('mode-status');
    if (map.placementMode === 'origin') {
      map.placementMode = 'destination';
      lbl.innerText = 'Placement Role: Destination (B)';
      lbl.className = 'mode-indicator mode-destination';
    } else if (map.placementMode === 'destination') {
      map.placementMode = 'both';
      lbl.innerText = 'Placement Role: Dual Mode (A + B)';
      lbl.className = 'mode-indicator mode-both';
    } else {
      map.placementMode = 'origin';
      lbl.innerText = 'Placement Role: Origin (A)';
      lbl.className = 'mode-indicator mode-origin';
    }
  });

  document.getElementById('btn-compute').addEventListener('click', () => {
    map.computeDesirePaths();
  });
  document.getElementById('btn-clear').addEventListener('click', () => {
    map.simulationNodes = {};
    map.pathDesireScores.clear();
    map.globalPeakFlow = 1;
    if (map.getSource('pins'))
      map.getSource('pins').setData({ type: 'FeatureCollection', features: [] });
    //map.triggerFastScan();
    map.clearLayers();
  });
}
