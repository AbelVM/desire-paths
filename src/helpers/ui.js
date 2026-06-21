import { clearComputeCaches } from './compute.js';

function isFiniteLngLat(value) {
  return value && Number.isFinite(value.lng) && Number.isFinite(value.lat);
}

function boundsFromLngLat(a, b) {
  return [
    [Math.min(a.lng, b.lng), Math.min(a.lat, b.lat)],
    [Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)],
  ];
}

function getAoiBounds(mapInstance) {
  const pxBounds = mapInstance.aoi_px;
  if (Array.isArray(pxBounds) && pxBounds.length === 2) {
    const nw = mapInstance.unproject?.(pxBounds[0]);
    const se = mapInstance.unproject?.(pxBounds[1]);
    if (isFiniteLngLat(nw) && isFiniteLngLat(se)) return boundsFromLngLat(nw, se);
  }

  const polygon = mapInstance.aoi_polygon;
  const rings = Array.isArray(polygon?.[0]?.[0]) ? polygon : polygon ? [polygon] : [];
  if (!rings.length) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    if (!Array.isArray(ring)) continue;
    for (let i = 0; i < ring.length; i++) {
      const [lng, lat] = ring[i] || [];
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }

  if (!Number.isFinite(minLng)) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}

async function fitAoiBounds(mapInstance) {
  const bounds = getAoiBounds(mapInstance);
  if (!bounds || typeof mapInstance.fitBounds !== 'function') return;

  mapInstance.fitBounds(bounds, { padding: 0 });
  await new Promise((resolve) => {
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === 'function') raf(resolve);
    else setTimeout(resolve, 0);
  });
  mapInstance.renderInterfacePins?.();
}

export function setupUI(map) {
  const panel = document.querySelector('.panel');
  const modeButtons = Array.from(document.querySelectorAll('[data-placement-mode]'));
  const frictionButton = document.getElementById('btn-toggle-friction');
  const frictionLegendBody = document.getElementById('friction-legend-body');
  const weightInput = document.getElementById('node-weight');
  const weightReadout = document.getElementById('node-weight-readout');
  const buildButton = document.getElementById('btn-build-mapping');
  const computeButton = document.getElementById('btn-compute');
  const exportButton = document.getElementById('btn-export-geojson');
  const clearButton = document.getElementById('btn-clear');
  const modeLabel = document.getElementById('mode-status');
  const loader = document.getElementById('scan-loader');
  const flowReadout = document.getElementById('max-flow-readout');
  const progress = document.getElementById('simulation-progress');
  const progressBar = document.getElementById('simulation-progress-bar');
  const progressLabel = document.getElementById('simulation-progress-label');
  const alertCard = document.getElementById('app-alert');
  const alertTitle = document.getElementById('app-alert-title');
  const alertMessage = document.getElementById('app-alert-message');
  const alertDismiss = document.getElementById('app-alert-dismiss');
  let alertTimer;

  const clampWeight = (value) => Math.min(10, Math.max(1, Number.parseInt(value, 10) || 1));

  const syncModeUI = () => {
    for (const button of modeButtons) {
      const active = button.dataset.placementMode === map.placementMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }

    if (map.placementMode === 'origin') {
      modeLabel.innerText = 'Placement: Origin nodes';
      modeLabel.className = 'mode-indicator mode-origin';
      return;
    }

    if (map.placementMode === 'destination') {
      modeLabel.innerText = 'Placement: Destination nodes';
      modeLabel.className = 'mode-indicator mode-destination';
      return;
    }

    modeLabel.innerText = 'Placement: Dual nodes';
    modeLabel.className = 'mode-indicator mode-both';
  };

  const syncWeightUI = () => {
    const weight = clampWeight(map.placementWeight);
    map.placementWeight = weight;
    if (weightInput) weightInput.value = String(weight);
    if (weightReadout) weightReadout.value = String(weight);
  };

  const syncFrictionUI = () => {
    const enabled = map.showFrictionMesh !== false;
    frictionButton.innerText = enabled ? '⊖' : '⊕';
    frictionButton.setAttribute('aria-pressed', String(enabled));
    frictionButton.setAttribute(
      'aria-label',
      enabled ? 'Hide friction legend' : 'Show friction legend'
    );
    frictionButton.setAttribute('title', enabled ? 'Hide friction legend' : 'Show friction legend');
    if (frictionLegendBody) frictionLegendBody.hidden = !enabled;
    if (map.baseLayer || map.flowLayer) {
      map.updateLayers();
    }
  };

  const syncFlowReadout = () => {
    const peak = Math.max(0, Math.round(map.globalPeakFlow ?? 0));
    flowReadout.innerText = `Peak Flow Intensity: ${peak}`;
  };

  const syncProgressUI = () => {
    const state = map.simulationProgress || { processed: 0, total: 0, percent: 0, phase: 'Idle' };
    const percent = Math.max(0, Math.min(100, Number(state.percent) || 0));
    if (progressBar) progressBar.style.transform = `scaleX(${percent / 100})`;
    if (progress) {
      progress.hidden = state.total <= 0 && state.phase === 'Idle';
    }
    if (progressLabel) {
      progressLabel.innerText =
        state.total > 0
          ? `${state.phase} ${state.processed}/${state.total} agents (${Math.round(percent)}%)`
          : state.phase;
    }
  };

  const syncSimulationUI = () => {
    const busy = map.isComputing === true;
    const mappingReady = map.mappingReady === true;
    const readyToRun = map.readyToCompute === true;
    const hasGrid = Object.keys(map.simulationNodes ?? {}).length > 0;

    if (buildButton) buildButton.toggleAttribute('disabled', busy);
    if (clearButton) clearButton.disabled = busy || !hasGrid;
    computeButton.disabled = busy || !mappingReady || !readyToRun;
    if (exportButton) exportButton.disabled = busy;
    computeButton.innerText = busy ? 'Simulating...' : 'Simulate Flows';
    if (loader && !busy) {
      loader.style.display = 'none';
    }
    syncProgressUI();
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

  const setBusyState = (busy, message = 'Sampling walkable surfaces...') => {
    map.isComputing = busy;
    for (const button of modeButtons) button.disabled = busy;
    frictionButton.disabled = busy;
    if (weightInput) weightInput.disabled = busy;
    if (buildButton) buildButton.disabled = busy;
    if (exportButton) exportButton.disabled = busy;
    computeButton.disabled = busy;
    clearButton.disabled = busy;
    loader.innerText = message;
    loader.style.display = busy ? 'block' : 'none';
    computeButton.innerText = busy ? 'Simulating...' : 'Simulate Flows';
    if (progressLabel) progressLabel.innerText = message;
    panel.setAttribute('aria-busy', String(busy));
  };

  const resetSimulationState = () => {
    hideAlertCard();
    map.simulationNodes = {};
    map.pathDesireScores?.clear();
    map.affordanceMap?.clear();
    map.cellFrictionMap?.clear();
    map.multiFrictionMap?.clear();
    map.globalPeakFlow = 1;
    map.readyToCompute = false;
    map.mappingReady = false;
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
    map._perTargetContribs = undefined;
    map._assignedCounts = undefined;
    map._targetWeights = undefined;
    map._mappingGeneration = undefined;
    map._frictionSnapshotGen = undefined;
    map._multiFrictionSnapshotGen = undefined;
    map._gradientCacheGen = undefined;
    map._visibilityCacheGen = undefined;
    map.simulationProgress = undefined;
    clearComputeCaches.call(map);
    map.getSource?.('pins')?.setData({ type: 'FeatureCollection', features: [] });
    map.clearLayers();
    syncFlowReadout();
    syncSimulationUI();
  };

  for (const button of modeButtons) {
    button.addEventListener('click', () => {
      map.placementMode = button.dataset.placementMode || 'origin';
      syncModeUI();
    });
  }

  if (weightInput) {
    weightInput.addEventListener('input', () => {
      map.placementWeight = clampWeight(weightInput.value);
      syncWeightUI();
    });
  }

  frictionButton.addEventListener('click', () => {
    map.showFrictionMesh = map.showFrictionMesh === false;
    syncFrictionUI();
  });

  if (buildButton) {
    buildButton.addEventListener('click', async () => {
      if (!map.simulationNodes || Object.keys(map.simulationNodes).length === 0) {
        showAlertCard('Place at least one node before building the mapping.', {
          title: 'Nothing to build',
          tone: 'warning',
        });
        return;
      }

      setBusyState(true, 'Building mapping...');
      try {
        await fitAoiBounds(map);
        await new Promise((resolve) => {
          const raf = globalThis.requestAnimationFrame;
          if (typeof raf === 'function') raf(resolve);
          else setTimeout(resolve, 0);
        });
        await map.triggerFastScan();
        map.mappingReady = map.cellFrictionMap.size > 0;
        if (!map.mappingReady) {
          showAlertCard(
            'The current layout did not produce a mapping. Add more nodes and try again.',
            {
              title: 'Mapping unavailable',
              tone: 'warning',
            }
          );
        }
      } catch (err) {
        console.error('Mapping build failed:', err);
        showAlertCard('Mapping build failed. Please try again.', {
          title: 'Build failed',
          tone: 'error',
        });
      } finally {
        setBusyState(false);
        syncSimulationUI();
      }
    });
  }

  computeButton.addEventListener('click', async () => {
    if (!map.mappingReady) return;
    setBusyState(true);
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await map.computeDesirePaths();
    } catch (err) {
      console.error('Desire path computation failed:', err);
      showAlertCard('Simulation error. Please try again.', {
        title: 'Simulation failed',
        tone: 'error',
      });
    } finally {
      syncFlowReadout();
      setBusyState(false);
      syncSimulationUI();
    }
  });

  if (exportButton) {
    exportButton.addEventListener('click', () => {
      try {
        const geojson = map.exportSimulationGeoJSON();
        showAlertCard(`Exported ${geojson.features.length} flow cells as GeoJSON.`, {
          title: 'GeoJSON exported',
          tone: 'success',
        });
      } catch (err) {
        console.error('GeoJSON export failed:', err);
        showAlertCard('GeoJSON export failed. Please try again.', {
          title: 'Export failed',
          tone: 'error',
        });
      }
    });
  }

  clearButton.addEventListener('click', () => {
    resetSimulationState();
  });

  if (alertDismiss) {
    alertDismiss.addEventListener('click', hideAlertCard);
  }

  map._showAlertCard = showAlertCard;
  map._syncSimulationUI = syncSimulationUI;
  map.showAlertCard = showAlertCard;
  map.syncSimulationUI = syncSimulationUI;

  map.placementWeight = clampWeight(map.placementWeight || 1);
  syncModeUI();
  syncWeightUI();
  syncFrictionUI();
  syncFlowReadout();
  syncProgressUI();
  syncSimulationUI();
}
