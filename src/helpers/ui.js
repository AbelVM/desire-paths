export function setupUI(map) {
  const panel = document.querySelector('.panel');
  const modeButton = document.getElementById('btn-toggle-mode');
  const frictionButton = document.getElementById('btn-toggle-friction');
  const computeButton = document.getElementById('btn-compute');
  const clearButton = document.getElementById('btn-clear');
  const modeLabel = document.getElementById('mode-status');
  const loader = document.getElementById('scan-loader');
  const flowReadout = document.getElementById('max-flow-readout');
  const alertCard = document.getElementById('app-alert');
  const alertTitle = document.getElementById('app-alert-title');
  const alertMessage = document.getElementById('app-alert-message');
  const alertDismiss = document.getElementById('app-alert-dismiss');
  let alertTimer;

  const syncModeUI = () => {
    if (map.placementMode === 'origin') {
      modeLabel.innerText = 'Placement: Origin nodes';
      modeLabel.className = 'mode-indicator mode-origin';
      modeButton.innerText = 'Switch to Destination';
      modeButton.dataset.nextMode = 'destination';
      return;
    }

    if (map.placementMode === 'destination') {
      modeLabel.innerText = 'Placement: Destination nodes';
      modeLabel.className = 'mode-indicator mode-destination';
      modeButton.innerText = 'Switch to Dual Mode';
      modeButton.dataset.nextMode = 'both';
      return;
    }

    modeLabel.innerText = 'Placement: Dual nodes';
    modeLabel.className = 'mode-indicator mode-both';
    modeButton.innerText = 'Switch to Origin';
    modeButton.dataset.nextMode = 'origin';
  };

  const syncFrictionUI = () => {
    const enabled = map.showFrictionMesh !== false;
    frictionButton.innerText = enabled ? 'Hide Friction Mesh' : 'Show Friction Mesh';
    frictionButton.setAttribute('aria-pressed', String(enabled));
    if (map.baseLayer || map.flowLayer) {
      map.updateLayers();
    }
  };

  const syncFlowReadout = () => {
    const peak = Math.max(0, Math.round(map.globalPeakFlow || 0));
    flowReadout.innerText = `Peak Flow Intensity: ${peak}`;
  };

  const hideAlertCard = () => {
    if (!alertCard) return;
    window.clearTimeout(alertTimer);
    alertCard.hidden = true;
    alertCard.dataset.tone = '';
  };

  const showAlertCard = (message, { title = 'Notice', tone = 'warning', timeout = 5000 } = {}) => {
    if (!alertCard || !alertTitle || !alertMessage) return;
    window.clearTimeout(alertTimer);
    alertTitle.innerText = title;
    alertMessage.innerText = message;
    alertCard.dataset.tone = tone;
    alertCard.hidden = false;
    if (timeout > 0) {
      alertTimer = window.setTimeout(hideAlertCard, timeout);
    }
  };

  const setBusyState = (busy) => {
    map.isComputing = busy;
    modeButton.disabled = busy;
    frictionButton.disabled = busy;
    computeButton.disabled = busy;
    clearButton.disabled = busy;
    loader.style.display = busy ? 'block' : 'none';
    computeButton.innerText = busy ? 'Simulating...' : 'Simulate Flows';
    panel.setAttribute('aria-busy', String(busy));
  };

  const resetSimulationState = () => {
    hideAlertCard();
    map.simulationNodes = {};
    map.pathDesireScores.clear();
    map.affordanceMap.clear();
    map.cellFrictionMap.clear();
    map.multiFrictionMap.clear();
    map.globalPeakFlow = 1;
    map.readyToCompute = false;
    map.aoi = undefined;
    map.aoi_px = undefined;
    map.aoi_polygon = undefined;
    map._cachedViewHexes = undefined;
    map._cachedAoiKey = undefined;
    map._lastViewHexesKey = undefined;
    map._frictionObj = undefined;
    map._affordanceObj = undefined;
    map._multiFrictionObj = undefined;
    map._cellState = undefined;
    map._computePathCacheObj = undefined;
    map._computePathCacheOrder = undefined;
    map._computeDiskCacheObj = undefined;
    map._computeDiskCacheOrder = undefined;
    map._visibilityCacheObj = undefined;
    map._visibilityCacheOrder = undefined;
    map._gradientCacheObj = undefined;
    map._perTargetContribs = undefined;
    map._assignedCounts = undefined;
    map._targetWeights = undefined;
    if (map.getSource('pins')) {
      map.getSource('pins').setData({ type: 'FeatureCollection', features: [] });
    }
    map.clearLayers();
    syncFlowReadout();
  };

  modeButton.addEventListener('click', () => {
    map.placementMode = modeButton.dataset.nextMode || 'origin';
    syncModeUI();
  });

  frictionButton.addEventListener('click', () => {
    map.showFrictionMesh = map.showFrictionMesh === false;
    syncFrictionUI();
  });

  computeButton.addEventListener('click', async () => {
    setBusyState(true);
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      map.computeDesirePaths();
    } catch (err) {
      console.error('Desire path computation failed:', err);
      showAlertCard('Simulation error. Please try again.', {
        title: 'Simulation failed',
        tone: 'error',
      });
    } finally {
      syncFlowReadout();
      setBusyState(false);
    }
  });

  clearButton.addEventListener('click', () => {
    resetSimulationState();
  });

  if (alertDismiss) {
    alertDismiss.addEventListener('click', hideAlertCard);
  }

  map.showAlertCard = showAlertCard;

  syncModeUI();
  syncFrictionUI();
  syncFlowReadout();
}
