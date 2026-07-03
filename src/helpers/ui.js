import { clearComputeCaches, clearLatLngCache } from './compute.js';
import { latLngToCell } from 'h3-js';
import { H3_STRIDE_RESOLUTION } from './constants.js';
import { terminateAllWorkers } from './spatialWorker.js';

function isFiniteLngLat(value) {
  return value && Number.isFinite(value.lng) && Number.isFinite(value.lat);
}

const uiCleanupListeners = [];

function cleanupUIListeners() {
  for (const { target, event, handler } of uiCleanupListeners) {
    try {
      target.removeEventListener(event, handler);
    } catch {
      // ignore stale entries
    }
  }
  uiCleanupListeners.length = 0;
}

function addUIListener(target, event, handler) {
  target.addEventListener(event, handler);
  uiCleanupListeners.push({ target, event, handler });
}

function isActiveNode(node) {
  return node && Number(node.weight) > 0;
}

function hasBuildInputs(nodes = {}) {
  const activeNodes = Object.values(nodes ?? {}).filter((n) => isActiveNode(n));
  // Need at least two distinct nodes (a single dual node can't serve as both origin and destination simultaneously)
  if (activeNodes.length < 2) return false;
  return (
    activeNodes.some((node) => node.type === 'origin' || node.type === 'dual') &&
    activeNodes.some((node) => node.type === 'destination' || node.type === 'dual')
  );
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
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

async function fitAoiBounds(mapInstance) {
  const bounds = getAoiBounds(mapInstance);
  if (!bounds || typeof mapInstance.fitBounds !== 'function') return;

  // Use moveend event instead of RAF — fires when panning/zooming animation completes,
  // avoiding unnecessary wait time while guaranteeing the map is ready.
  const fitPromise = new Promise((resolve) => {
    if (typeof mapInstance.on === 'function' && typeof mapInstance.off === 'function') {
      const handler = () => {
        mapInstance.off('moveend', handler);
        resolve();
      };
      mapInstance.on('moveend', handler);
    } else {
      // Fallback: use RAF for environments without event support (e.g. tests)
      const raf = globalThis.requestAnimationFrame;
      if (typeof raf === 'function') raf(resolve);
      else setTimeout(resolve, 0);
    }
  });

  mapInstance.fitBounds(bounds, { padding: 0 });
  await fitPromise;
  mapInstance.renderInterfacePins?.();
}

// ──────────────────────────────────────────────
// Centralized UI State Store
// ──────────────────────────────────────────────

function createUIState(map) {
  const state = {
    // DOM element references (populated once, reused everywhere)
    panel: null,
    modeButtons: [],
    frictionButton: null,
    frictionLegendBody: null,
    weightInput: null,
    weightReadout: null,
    computeButton: null,
    exportButton: null,
    clearButton: null,
    modeLabel: null,
    nodeCountChip: null,
    loader: null,
    flowReadout: null,
    simulationProgress: null,
    progressBar: null,
    progressLabel: null,
    alertCard: null,
    alertTitle: null,
    alertMessage: null,
    alertDismiss: null,
    onboardingOverlay: null,
    onboardingDismissBtn: null,
    mapContainer: null,
    toastContainer: null,

    // Context menu (created dynamically at runtime)
    contextMenu: null,
    contextChangeTypeBtn: null,
    contextIncreaseWeightBtn: null,
    contextDecreaseWeightBtn: null,
    contextRemoveNodeBtn: null,

    // UI state variables
    onboardingStep: 1,
    totalOnboardingSteps: 3,
    onboardingDismissed: false,
    activeContextMenuItem: null,
    activeContextMenuItemCell: null,
    contextMenuClickHandler: null,
    contextMenuContextMenuHandler: null,
    draggingNodeCell: null,

    // Internal collections (not DOM elements)
    buttonHandlers: new WeakMap(),
  };

  // Populate DOM references in a single pass
  // Internal property names may differ from HTML element IDs, so we use explicit mappings.
  const idMap = {
    panel: 'panel',
    frictionButton: 'btn-toggle-friction',
    frictionLegendBody: 'friction-legend-body',
    weightInput: 'node-weight',
    weightReadout: 'node-weight-readout',
    computeButton: 'btn-compute',
    exportButton: 'btn-export-geojson',
    clearButton: 'btn-clear',
    modeLabel: 'mode-status',
    nodeCountChip: 'node-count-chip',
    loader: 'scan-loader',
    flowReadout: 'max-flow-readout',
    simulationProgress: 'simulation-progress',
    progressBar: 'simulation-progress-bar',
    progressLabel: 'simulation-progress-label',
    alertCard: 'app-alert',
    alertTitle: 'app-alert-title',
    alertMessage: 'app-alert-message',
    alertDismiss: 'app-alert-dismiss',
    onboardingOverlay: 'onboarding-overlay',
    onboardingDismissBtn: 'onboarding-dismiss',
    mapContainer: 'map',
  };

  for (const [prop, id] of Object.entries(idMap)) {
    state[prop] = document.getElementById(id);
  }

  const panelEl = document.querySelector('.panel');
  if (panelEl) state.panel = panelEl;

  state.modeButtons = Array.from(document.querySelectorAll('[data-placement-mode]'));

  // Toast container — create if missing
  const toastContainer =
    document.getElementById('toast-container') || document.createElement('div');
  toastContainer.id = 'toast-container';
  toastContainer.className = 'toast-container';
  if (!toastContainer.parentNode) {
    document.body.appendChild(toastContainer);
  }
  state.toastContainer = toastContainer;

  return state;
}

export function setupUI(map, { setMapCursor, setMapCursorWait } = {}) {
  const uiState = createUIState(map);
  let alertTimer;

  // ──────────────────────────────────────────────
  // Toast Notification System
  // ──────────────────────────────────────────────
  const showToastNotification = (message, type = 'info', duration = 3000) => {
    // Remove all existing toasts — only ever show one at a time
    while (uiState.toastContainer.firstChild) {
      uiState.toastContainer.removeChild(uiState.toastContainer.firstChild);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    else if (type === 'warning') icon = '⚠️';
    else if (type === 'error') icon = '❌';

    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <div class="toast-message">${message}</div>
      <button class="toast-close" type="button" aria-label="Dismiss notification">×</button>
    `;

    uiState.toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    const timeoutId = setTimeout(() => {
      hideToastNotification(toast);
    }, duration);

    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) {
      closeBtn.onclick = () => {
        clearTimeout(timeoutId);
        hideToastNotification(toast);
      };
    }
  };

  const hideToastNotification = (toast) => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode === uiState.toastContainer) {
        uiState.toastContainer.removeChild(toast);
      }
    }, 300);
  };

  // ──────────────────────────────────────────────
  // Onboarding Helpers
  // ──────────────────────────────────────────────
  const dismissOnboarding = () => {
    uiState.onboardingDismissed = true;
    if (uiState.onboardingOverlay) uiState.onboardingOverlay.hidden = true;
  };

  const updateOnboardingStep = () => {
    if (!uiState.onboardingOverlay) return;

    // Don't auto-show if user has dismissed it
    if (uiState.onboardingDismissed) {
      uiState.onboardingOverlay.hidden = true;
      return;
    }

    const nodes = Object.values(map.simulationNodes ?? {});
    const activeNodes = nodes.filter((n) => n.weight > 0);
    const hasOrigins = activeNodes.some((n) => n.type === 'origin' || n.type === 'dual');
    const hasDestinations = activeNodes.some((n) => n.type === 'destination' || n.type === 'dual');

    if (hasOrigins && !hasDestinations) {
      uiState.onboardingStep = 2;
    } else if (hasOrigins && hasDestinations) {
      uiState.onboardingStep = 3;
    } else {
      uiState.onboardingStep = 1;
    }

    // Show overlay only during onboarding (up to step 3, before simulation runs)
    const shouldShow = activeNodes.length > 0 && !map.flowsReady;
    if (shouldShow) {
      uiState.onboardingOverlay.hidden = false;
    } else if (!hasOrigins && !hasDestinations) {
      // Show overlay when there are no nodes at all
      uiState.onboardingOverlay.hidden = false;
    } else {
      uiState.onboardingOverlay.hidden = true;
    }

    // Highlight active step
    const steps = uiState.onboardingOverlay.querySelectorAll('.onboarding-step');
    for (const step of steps) {
      const stepNum = parseInt(step.dataset.step, 10);
      step.classList.toggle('active', stepNum === uiState.onboardingStep);
    }
  };

  // ──────────────────────────────────────────────
  // Context Menu System
  // ──────────────────────────────────────────────
  const createContextMenu = () => {
    if (uiState.contextMenu) return uiState.contextMenu;

    const menu = document.createElement('div');
    menu.id = 'context-menu';
    menu.className = 'context-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button id="context-change-type" class="context-btn" type="button">Change Type</button>
      <div class="context-divider"></div>
      <button id="context-increase-weight" class="context-btn" type="button"><span class="context-icon">＋</span> Increase Weight</button>
      <button id="context-decrease-weight" class="context-btn" type="button"><span class="context-icon">－</span> Decrease Weight</button>
      <div class="context-divider"></div>
      <button id="context-remove-node" class="context-btn context-danger" type="button">Remove Node</button>
    `;
    document.body.appendChild(menu);
    uiState.contextMenu = menu;

    // Cache button references for showContextMenu
    uiState.contextChangeTypeBtn = menu.querySelector('#context-change-type');
    uiState.contextIncreaseWeightBtn = menu.querySelector('#context-increase-weight');
    uiState.contextDecreaseWeightBtn = menu.querySelector('#context-decrease-weight');
    uiState.contextRemoveNodeBtn = menu.querySelector('#context-remove-node');

    return menu;
  };

  const cleanupContextMenuDocumentListeners = () => {
    if (uiState.contextMenuClickHandler) {
      document.removeEventListener('click', uiState.contextMenuClickHandler);
      uiState.contextMenuClickHandler = null;
    }
    if (uiState.contextMenuContextMenuHandler) {
      document.removeEventListener('contextmenu', uiState.contextMenuContextMenuHandler);
      uiState.contextMenuContextMenuHandler = null;
    }
  };

  const showContextMenu = (e, node, cell) => {
    e.preventDefault();
    if (!node || !isActiveNode(node) || !cell) return;

    uiState.activeContextMenuItem = node;
    uiState.activeContextMenuItemCell = cell;

    createContextMenu();
    const contextMenu = uiState.contextMenu;
    if (!contextMenu) return;

    // Remove stale listeners before adding fresh ones
    cleanupContextMenuDocumentListeners();

    // Position menu within viewport bounds, using originalEvent for client coordinates
    const offsetX = 12;
    const offsetY = -8;
    const cx = e.originalEvent?.clientX ?? e.clientX ?? 0;
    const cy = e.originalEvent?.clientY ?? e.clientY ?? 0;
    let left = cx + offsetX;
    let top = cy + offsetY;

    const menuWidth = contextMenu.offsetWidth || 160;
    const menuHeight = contextMenu.offsetHeight || 80;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (left + menuWidth > viewportWidth) left = cx - offsetX - menuWidth;
    if (top + menuHeight > viewportHeight) top = cy - offsetY - menuHeight;

    contextMenu.style.left = `${left}px`;
    contextMenu.style.top = `${top}px`;

    // Set up menu items using addEventListener for reliable handler attachment
    const changeTypeBtn = uiState.contextChangeTypeBtn;
    const increaseWeightBtn = uiState.contextIncreaseWeightBtn;
    const decreaseWeightBtn = uiState.contextDecreaseWeightBtn;
    const removeNodeBtn = uiState.contextRemoveNodeBtn;

    if (changeTypeBtn) {
      // Remove any previous listener to avoid stacking
      const prevHandler = uiState.buttonHandlers.get(changeTypeBtn);
      if (prevHandler) changeTypeBtn.removeEventListener('click', prevHandler);

      // Capture type at setup time to prevent cascading mutations from stacked listeners
      const currentType = node.type;
      const nextType =
        currentType === 'origin'
          ? 'destination'
          : currentType === 'destination'
            ? 'dual'
            : 'origin';
      const label = nextType.charAt(0).toUpperCase() + nextType.slice(1);

      const nodeCellKey = cell;
      const handler = (ev) => {
        ev.stopPropagation();
        hideContextMenu();

        if (!nodeCellKey || !map.simulationNodes[nodeCellKey]) return;

        map.simulationNodes[nodeCellKey].type = nextType;

        map.mappingReady = false;
        map.flowsReady = false;
        map.renderInterfacePins?.();
        syncSimulationUI?.();
        showToastNotification(`Node changed to ${label}`, 'success');
      };
      changeTypeBtn.innerHTML = `Change to ${label}`;
      changeTypeBtn.addEventListener('click', handler);
      uiState.buttonHandlers.set(changeTypeBtn, handler);
    }

    if (increaseWeightBtn || decreaseWeightBtn) {
      // Capture node reference at setup time
      const nodeCellKey = cell;

      const makeWeightHandler = (delta) => {
        return (ev) => {
          ev.stopPropagation();
          hideContextMenu();

          const nodeRef = map.simulationNodes?.[nodeCellKey];
          if (!nodeCellKey || !nodeRef) return;

          const newWeight = clampWeight(nodeRef.weight + delta);
          if (newWeight !== nodeRef.weight) {
            nodeRef.weight = newWeight;
            map.mappingReady = false;
            map.flowsReady = false;
            map.renderInterfacePins?.();
            syncSimulationUI?.();
            showToastNotification(`Weight: ${newWeight}`, 'info');
          } else {
            const label = delta > 0 ? 'already at maximum' : 'already at minimum';
            showToastNotification(`Weight is ${label} (1–10)`, 'warning');
          }
        };
      };

      const prevInc = uiState.buttonHandlers.get(increaseWeightBtn);
      if (prevInc) increaseWeightBtn.removeEventListener('click', prevInc);

      const prevDec = uiState.buttonHandlers.get(decreaseWeightBtn);
      if (prevDec) decreaseWeightBtn.removeEventListener('click', prevDec);

      const incHandler = makeWeightHandler(+1);
      if (increaseWeightBtn) {
        increaseWeightBtn.addEventListener('click', incHandler);
        uiState.buttonHandlers.set(increaseWeightBtn, incHandler);
      }

      const decHandler = makeWeightHandler(-1);
      if (decreaseWeightBtn) {
        decreaseWeightBtn.addEventListener('click', decHandler);
        uiState.buttonHandlers.set(decreaseWeightBtn, decHandler);
      }
    }

    if (removeNodeBtn) {
      const prevRemove = uiState.buttonHandlers.get(removeNodeBtn);
      if (prevRemove) removeNodeBtn.removeEventListener('click', prevRemove);

      const nodeCellKey = cell;
      const handler = (ev) => {
        ev.stopPropagation();
        hideContextMenu();
        try {
          if (!nodeCellKey || !map.simulationNodes[nodeCellKey]) return;

          delete map.simulationNodes[nodeCellKey];
          showToastNotification('Node removed', 'warning');

          map.mappingReady = false;
          map.flowsReady = false;
          map.renderInterfacePins?.();
          syncSimulationUI?.();
        } catch (err) {
          console.error('[context menu] remove node failed:', err);
          showToastNotification('Failed to remove node', 'error');
        }
      };
      removeNodeBtn.addEventListener('click', handler);
      uiState.buttonHandlers.set(removeNodeBtn, handler);
    }

    // Show menu immediately (no animation race)
    contextMenu.hidden = false;
    contextMenu.style.opacity = '1';

    // Single delegated listeners — remove stale ones first to avoid stacking
    const handleClickOutside = (ev) => {
      if (!contextMenu.contains(ev.target)) hideContextMenu();
    };
    const handleContextMenu = () => hideContextMenu();

    uiState.contextMenuClickHandler = handleClickOutside;
    uiState.contextMenuContextMenuHandler = handleContextMenu;
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('contextmenu', handleContextMenu);
  };

  // Hide context menu with fade-out animation (idempotent — no-op if already hidden)
  const hideContextMenu = () => {
    const contextMenu = uiState.contextMenu;
    if (!contextMenu || contextMenu.hidden) return;

    contextMenu.style.opacity = '0';
    setTimeout(() => {
      if (contextMenu && contextMenu.style.opacity === '0') {
        contextMenu.hidden = true;
        contextMenu.style.opacity = '';
      }
      // Clean up button handlers — WeakMap values are freed when buttons are removed from DOM.
      // Clear all stored handlers to break closures over node/cell references immediately.
      const handlers = uiState.buttonHandlers;
      if (handlers && typeof handlers.clear === 'function') {
        for (const [btn, handler] of handlers) {
          btn.removeEventListener('click', handler);
        }
        handlers.clear();
      }
    }, 140);
  };

  // ──────────────────────────────────────────────
  // Weight Helpers
  // ──────────────────────────────────────────────
  const clampWeight = (value) => Math.min(10, Math.max(1, Number.parseInt(value, 10) || 1));

  // ──────────────────────────────────────────────
  // UI Sync Functions — all read from uiState
  // ──────────────────────────────────────────────

  const syncModeUI = () => {
    for (const button of uiState.modeButtons) {
      const active = button.dataset.placementMode === map.placementMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }

    // Count nodes by type
    const nodes = Object.values(map.simulationNodes ?? {});
    let originCount = 0;
    let destCount = 0;
    for (const n of nodes) {
      if (n.weight <= 0) continue;
      if (n.type === 'origin' || n.type === 'dual') originCount++;
      if (n.type === 'destination' || n.type === 'dual') destCount++;
    }

    const hasOrigins = originCount > 0;
    const hasDestinations = destCount > 0;
    const readyToCompute = map.readyToCompute === true;

    let modeText = '';
    if (map.placementMode === 'origin') {
      modeText = `Origin · ${hasOrigins ? originCount + ' placed' : '0 placed'}`;
      uiState.modeLabel.className = 'mode-indicator mode-origin';
    } else if (map.placementMode === 'destination') {
      modeText = `Destination · ${hasDestinations ? destCount + ' placed' : '0 placed'}`;
      uiState.modeLabel.className = 'mode-indicator mode-destination';
    } else {
      const dualNodes = nodes.filter((n) => n.weight > 0 && n.type === 'dual').length;
      modeText = `Dual · ${dualNodes} placed`;
      uiState.modeLabel.className = 'mode-indicator mode-dual';
    }

    if (readyToCompute) {
      modeText += ' · Ready';
      if (uiState.nodeCountChip) uiState.nodeCountChip.classList.add('is-ready');
      if (uiState.modeLabel?.classList) uiState.modeLabel.classList.add('ready');
    } else {
      if (uiState.modeLabel?.classList) uiState.modeLabel.classList.remove('ready');
      if (uiState.nodeCountChip) uiState.nodeCountChip.classList.remove('is-ready');

      if (!hasOrigins && !hasDestinations) {
        modeText += ' · Place a node';
      } else if (!hasOrigins) {
        modeText += ' · Add origin';
      } else if (!hasDestinations) {
        modeText += ' · Add destination';
      }
    }

    if (uiState.modeLabel) {
      uiState.modeLabel.innerText = modeText;

      // Add keyboard shortcut hint when nodes are placed
      const hasNodes = originCount + destCount > 0;
      if (hasNodes && !readyToCompute) {
        uiState.modeLabel.setAttribute(
          'title',
          'Drag nodes to move them · ↑↓ arrows adjust placement weight'
        );
      } else if (readyToCompute) {
        uiState.modeLabel.setAttribute(
          'title',
          'Ready — press Simulate Flows · Drag nodes to reposition'
        );
      } else {
        uiState.modeLabel.removeAttribute('title');
      }
    }

    // Update count chip (always visible)
    if (uiState.nodeCountChip) {
      const originsEl = uiState.nodeCountChip.querySelector('.count-chip-origins');
      const destsEl = uiState.nodeCountChip.querySelector('.count-chip-dests');
      if (originsEl) originsEl.textContent = String(originCount);
      if (destsEl) destsEl.textContent = String(destCount);
    }

    // Update onboarding step visibility
    updateOnboardingStep();
  };

  const syncWeightUI = () => {
    const weight = clampWeight(map.placementWeight);
    map.placementWeight = weight;
    if (uiState.weightInput) uiState.weightInput.value = String(weight);
    if (uiState.weightReadout) uiState.weightReadout.value = String(weight);
  };

  const syncFrictionUI = () => {
    const enabled = map.showFrictionMesh !== false;
    const iconEl = uiState.frictionButton?.querySelector?.('.toggle-icon');

    // Add active state for better visual feedback
    if (uiState.frictionButton) {
      uiState.frictionButton.classList.toggle('is-active', enabled);
    }

    if (iconEl) {
      iconEl.textContent = enabled ? '−' : '+';
      iconEl.style.transform = 'rotate(360deg)';
      setTimeout(() => (iconEl.style.transform = ''), 140);
    }
    uiState.frictionButton?.setAttribute(
      'aria-label',
      enabled ? 'Hide friction legend' : 'Show friction legend'
    );
    uiState.frictionButton?.setAttribute('aria-pressed', String(enabled));
    if (uiState.frictionLegendBody) uiState.frictionLegendBody.hidden = !enabled;
    if (map.baseLayer || map.flowLayer) {
      const startTime = performance.now();
      const animateUpdate = () => {
        if (performance.now() - startTime < 300) {
          map.updateLayers?.();
          requestAnimationFrame(animateUpdate);
        }
      };
      requestAnimationFrame(animateUpdate);
    }
  };

  const syncFlowReadout = () => {
    const peak = Math.max(0, Math.round(map.globalPeakFlow ?? 0));
    uiState.flowReadout.innerText = `Peak Flow: ${peak} agents · ${map.flowsReady ? 'Simulation complete' : 'No simulation yet'}`;
  };

  const syncProgressUI = () => {
    const state = map.simulationProgress || { processed: 0, total: 0, percent: 0, phase: 'Idle' };
    const percent = Math.max(0, Math.min(100, Number(state.percent) || 0));
    if (uiState.progressBar) uiState.progressBar.style.transform = `scaleX(${percent / 100})`;
    if (uiState.simulationProgress) {
      uiState.simulationProgress.hidden = state.total <= 0 && state.phase === 'Idle';
    }
    if (uiState.progressLabel) {
      if (state.total > 0) {
        uiState.progressLabel.innerHTML = `<span class="progress-phase">${state.phase}</span><span class="progress-detail">${state.processed}/${state.total} agents · ${Math.round(percent)}%</span>`;
      } else if (map.flowsReady === true) {
        uiState.progressLabel.innerHTML = `<span class="progress-phase">Simulation complete</span><span class="progress-detail">${Object.keys(map.simulationNodes ?? {}).length} nodes placed · Export or reset to start new</span>`;
      } else {
        const hasOrigins = Object.values(map.simulationNodes ?? {}).some(
          (n) => (n.type === 'origin' || n.type === 'dual') && n.weight > 0
        );
        const hasDests = Object.values(map.simulationNodes ?? {}).some(
          (n) => (n.type === 'destination' || n.type === 'dual') && n.weight > 0
        );

        if (!hasOrigins && !hasDests) {
          uiState.progressLabel.innerHTML = `<span class="progress-phase">Ready to begin</span><span class="progress-detail">Place origin and destination nodes on the map</span>`;
        } else if (hasOrigins && hasDests) {
          uiState.progressLabel.innerHTML = `<span class="progress-phase">Ready to simulate</span><span class="progress-detail">${Object.keys(map.simulationNodes ?? {}).length} nodes placed · Press Simulate Flows</span>`;
        } else if (hasOrigins) {
          uiState.progressLabel.innerHTML = `<span class="progress-phase">Need destination</span><span class="progress-detail">Place a destination node to enable simulation</span>`;
        } else {
          uiState.progressLabel.innerHTML = `<span class="progress-phase">Need origin</span><span class="progress-detail">Place an origin node to begin</span>`;
        }
      }
    }
  };

  const syncSimulationUI = () => {
    const busy = map.isComputing === true;
    const mappingReady = map.mappingReady === true;
    const canBuild = hasBuildInputs(map.simulationNodes);
    const canCompute = mappingReady && canBuild;
    const canExport = map.flowsReady === true && (map.pathDesireScores?.size ?? 0) > 0;
    const hasGrid = Object.keys(map.simulationNodes ?? {}).length > 0;

    // Build Mapping button removed — simulation auto-builds on demand
    if (uiState.clearButton) uiState.clearButton.disabled = busy || !hasGrid;
    uiState.computeButton.disabled = busy || (!canCompute && !canBuild);
    if (uiState.exportButton) uiState.exportButton.disabled = busy || !canExport;
    uiState.computeButton.innerText = busy ? 'Simulating...' : 'Simulate Flows';
    if (uiState.loader && !busy) {
      uiState.loader.style.display = 'none';
    }
    syncProgressUI();
    // Reset wait cursor when computation finishes so hover states resume normally
    if (!busy) setMapCursorWait?.(map, false);
    // Sync mode UI to update node counts and readiness state
    syncModeUI();
  };

  const showAlertCard = (message, { title = 'Notice', tone = 'warning', timeout = 5000 } = {}) => {
    showToastNotification(message, tone, timeout);
  };

  const hideAlertCard = () => {
    if (!uiState.alertCard) return;
    window.clearTimeout(alertTimer);
    uiState.alertCard.hidden = true;
    uiState.alertCard.dataset.tone = '';
  };

  const setBusyState = (busy, message = 'Sampling walkable surfaces...') => {
    map.isComputing = busy;
    for (const button of uiState.modeButtons) button.disabled = busy;
    uiState.frictionButton.disabled = busy;
    if (uiState.weightInput) uiState.weightInput.disabled = busy;
    if (uiState.exportButton) uiState.exportButton.disabled = busy;
    uiState.computeButton.disabled = busy;
    uiState.clearButton.disabled = busy;
    uiState.loader.innerText = message;
    uiState.loader.style.display = busy ? 'block' : 'none';
    uiState.computeButton.innerText = busy ? 'Simulating...' : 'Simulate Flows';
    // Update cursor during computation
    setMapCursorWait?.(map, busy);
    if (uiState.progressLabel) {
      uiState.progressLabel.innerHTML = `<span class="progress-phase">${message}</span>`;
    }
    uiState.panel.setAttribute('aria-busy', String(busy));
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
    map.flowsReady = false;
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
    clearComputeCaches(map);
    clearLatLngCache();
    terminateAllWorkers();
    map.getSource?.('pins')?.setData({ type: 'FeatureCollection', features: [] });
    map.clearLayers();
    syncFlowReadout();
    syncSimulationUI();
    // Reset onboarding to step 1
    uiState.onboardingStep = 1;
    uiState.onboardingDismissed = false;
  };

  // ──────────────────────────────────────────────
  // Event Bindings — all reference uiState
  // ──────────────────────────────────────────────

  for (const button of uiState.modeButtons) {
    button.addEventListener('click', () => {
      map.placementMode = button.dataset.placementMode || 'origin';
      syncModeUI();
    });
  }

  // --- Keyboard Shortcuts ---
  document.addEventListener('keydown', (e) => {
    if (
      document.activeElement === uiState.weightInput ||
      document.activeElement === uiState.weightReadout
    ) {
      let currentValue = parseInt(uiState.weightInput.value, 10);
      if (isNaN(currentValue)) currentValue = 1;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        map.placementWeight = Math.min(10, currentValue + 1);
        syncWeightUI?.();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        map.placementWeight = Math.max(1, currentValue - 1);
        syncWeightUI?.();
      }
    }

    // Escape to hide context menu
    if (e.key === 'Escape') {
      uiState.draggingNodeCell = null;
      hideContextMenu?.();
    }
  });

  if (uiState.weightInput) {
    uiState.weightInput.addEventListener('input', () => {
      map.placementWeight = clampWeight(uiState.weightInput.value);
      syncWeightUI();
    });
  }

  uiState.frictionButton.addEventListener('click', () => {
    map.showFrictionMesh = map.showFrictionMesh === false;
    syncFrictionUI();
  });

  // Drag pins on mousedown/mousemove/mouseup — use maplibre native events so they
  // fire even when the deck.gl overlay (which renders pin circles) intercepts canvas clicks.
  const dragState = {
    active: false,
    startCell: null,
    moved: false,
  };

  const handleDragStart = (e) => {
    if (!isFiniteLngLat(e.lngLat)) return;

    // Don't intercept right-click — it would suppress the native contextmenu event
    if ((e.originalEvent?.button ?? 0) !== 0) return;

    // Block drag while computing
    if (map.isComputing || dragState.active) return;

    const cell = latLngToCell(e.lngLat.lat, e.lngLat.lng, H3_STRIDE_RESOLUTION);
    const node = map.simulationNodes?.[cell];
    if (node && isActiveNode(node)) {
      e.preventDefault?.();
      dragState.active = true;
      map.isDragging = true;
      dragState.startCell = cell;
      dragState.moved = false;
      setMapCursor?.(map, 'grabbing');
    }
  };

  const handleDragMove = (e) => {
    if (!dragState.active || !dragState.startCell) return;

    if (!isFiniteLngLat(e.lngLat)) return;

    dragState.moved = true;

    // Snap to nearest H3 cell
    const newCell = latLngToCell(e.lngLat.lat, e.lngLat.lng, H3_STRIDE_RESOLUTION);
    if (newCell !== dragState.startCell && map.simulationNodes[newCell]) {
      // Target cell already has a node — stop dragging here
      dragState.active = false;
      map.isDragging = false;
      setMapCursor?.(map, 'grab');
      return;
    }

    const node = map.simulationNodes[dragState.startCell];
    if (node) {
      delete map.simulationNodes[dragState.startCell];
      map.simulationNodes[newCell] = { ...node, cell: newCell };
      dragState.startCell = newCell;
      map.renderInterfacePins?.();
    }
  };

  const handleDragEnd = () => {
    if (!dragState.active) return;

    dragState.active = false;
    dragState.startCell = null;
    map.isDragging = false;
    setMapCursor?.(map, 'grab');
    map.mappingReady = false;
    map.flowsReady = false;
    // Expose drag flag so main.js click handler can skip node manipulation
    map.dragOccurred = dragState.moved;
  };

  if (map.on) {
    map.on('mousedown', handleDragStart);
    map.on('mousemove', handleDragMove);
  }
  window.addEventListener?.('mouseup', handleDragEnd, { passive: true });

  // Right-click on map shows context menu for nodes at cursor position
  map.on?.('contextmenu', (e) => {
    if (!uiState.mapContainer) return;

    // Block context menu while computing
    if (map.isComputing) return;

    let node = null;

    // Strategy 1: Try lngLat from the event (works for canvas clicks)
    if (isFiniteLngLat(e.lngLat)) {
      const cell = latLngToCell(e.lngLat.lat, e.lngLat.lng, H3_STRIDE_RESOLUTION);
      node = map.simulationNodes?.[cell];
    }

    // Strategy 2: If lngLat failed or no active node found, query rendered pin features at click position
    if (!node || !isActiveNode(node)) {
      const containerRect = uiState.mapContainer.getBoundingClientRect();
      let point;
      if (e.point) {
        // e.point is canvas-relative — use directly
        point = e.point;
      } else if (containerRect && (e.originalEvent?.clientX ?? 0)) {
        // Convert viewport coords to canvas-relative pixel coords
        const cx = e.originalEvent.clientX - containerRect.left;
        const cy = e.originalEvent.clientY - containerRect.top;
        point = [cx, cy];
      }

      if (point) {
        try {
          // Query a slightly larger area for better hit detection on pin circles
          const features = map.queryRenderedFeatures(point, { layers: ['pin-circles'] });
          if (features.length > 0) {
            // Find the closest feature to the click point
            let closest = null;
            let minDist = Infinity;
            for (const feat of features) {
              const [lng, lat] = feat.geometry.coordinates;
              const projected = map.project([lat, lng]);
              const dist = Math.hypot(projected.x - point[0], projected.y - point[1]);
              if (dist < minDist) {
                minDist = dist;
                closest = { lng, lat };
              }
            }
            if (closest) {
              const cell = latLngToCell(closest.lat, closest.lng, H3_STRIDE_RESOLUTION);
              node = map.simulationNodes?.[cell];
            }
          }
        } catch (_) {
          /* queryRenderedFeatures may fail in tests */
        }
      }
    }

    if (node && isActiveNode(node)) {
      const cell =
        node.cell ||
        (isFiniteLngLat(e.lngLat)
          ? latLngToCell(e.lngLat.lat, e.lngLat.lng, H3_STRIDE_RESOLUTION)
          : undefined);
      if (cell) {
        e.preventDefault();
        showContextMenu(e, node, cell);
      } else {
        hideContextMenu();
      }
    } else {
      hideContextMenu();
    }
  });

  // Left-click on the map canvas — ignore when context menu is open or clicking on a pin feature
  map.on?.('click', (e) => {
    const ctxMenu = uiState.contextMenu;
    if (ctxMenu && !ctxMenu.hidden) return;
    if (dragState.active) return; // Skip if currently dragging a node

    let coords = e.lngLat;
    // Clicks on rendered features may not carry lngLat — skip them
    if (!isFiniteLngLat(coords)) {
      const pt = e.point ?? [e.originalEvent?.clientX ?? 0, e.originalEvent?.clientY ?? 0];
      coords = map.unproject?.(pt);
    }
    if (!isFiniteLngLat(coords)) return;

    // Check if clicking on an existing active node — ignore (handled by drag / context menu)
    const cell = latLngToCell(coords.lat, coords.lng, H3_STRIDE_RESOLUTION);
    const existingNode = map.simulationNodes?.[cell];
    if (existingNode && isActiveNode(existingNode)) return;
  });

  uiState.computeButton.addEventListener('click', async () => {
    if (!hasBuildInputs(map.simulationNodes)) {
      showToastNotification(
        'Place at least one origin/dual node and one destination/dual node before simulating flows.',
        'warning'
      );
      return;
    }

    // Auto-build mapping if not already done
    if (!map.mappingReady) {
      setBusyState(true, 'Building mapping...');
      try {
        map.flowsReady = false;
        await fitAoiBounds(map);
        await map.triggerFastScan();
        map.mappingReady = map.cellFrictionMap.size > 0;
        map.flowsReady = false;
        if (!map.mappingReady) {
          showToastNotification(
            'The current layout did not produce a mapping. Add more nodes and try again.',
            'warning'
          );
          setBusyState(false);
          syncSimulationUI();
          return;
        }
      } catch (err) {
        map.flowsReady = false;
        console.error('Mapping build failed:', err);
        showToastNotification('Mapping build failed. Please try again.', 'error');
        setBusyState(false);
        syncSimulationUI();
        return;
      }
    }

    // Run simulation
    setBusyState(true, 'Simulating flows...');
    try {
      await new Promise((resolve) => {
        const raf = globalThis.requestAnimationFrame;
        if (typeof raf === 'function') raf(resolve);
        else setTimeout(resolve, 0);
      });
      await map.computeDesirePaths();
      map.flowsReady = true;
    } catch (err) {
      map.flowsReady = false;
      console.error('Desire path computation failed:', err);
      showToastNotification('Simulation error. Please try again.', 'error');
    } finally {
      syncFlowReadout();
      setBusyState(false);
      syncSimulationUI();
    }
  });

  if (uiState.exportButton) {
    uiState.exportButton.addEventListener('click', () => {
      if (map.flowsReady !== true) {
        showToastNotification('Simulate flows before exporting GeoJSON.', 'warning');
        return;
      }
      try {
        const geojson = map.exportSimulationGeoJSON();
        showToastNotification(
          `Exported ${geojson.features.length} flow cells as GeoJSON.`,
          'success'
        );
      } catch (err) {
        console.error('GeoJSON export failed:', err);
        showToastNotification('GeoJSON export failed. Please try again.', 'error');
      }
    });
  }

  uiState.clearButton.addEventListener('click', () => {
    resetSimulationState();
  });

  if (uiState.alertDismiss) {
    uiState.alertDismiss.addEventListener('click', hideAlertCard);
  }

  // Onboarding dismiss button + backdrop click-to-dismiss
  if (uiState.onboardingDismissBtn) {
    uiState.onboardingDismissBtn.addEventListener('click', () => {
      dismissOnboarding();
    });
  }
  // Click outside card dismisses overlay
  if (uiState.onboardingOverlay) {
    uiState.onboardingOverlay.addEventListener('click', (e) => {
      if (!e.target.closest('.onboarding-card')) {
        dismissOnboarding();
      }
    });
  }

  map._showAlertCard = showAlertCard;
  map._syncSimulationUI = syncSimulationUI;
  map.showAlertCard = showAlertCard;
  map.syncSimulationUI = syncSimulationUI;

  // Expose uiState on map for external access if needed
  map.uiState = uiState;

  map.placementWeight = clampWeight(map.placementWeight || 1);
  syncModeUI();
  syncWeightUI();
  syncFrictionUI();
  syncFlowReadout();
  syncProgressUI();
  syncSimulationUI();
}
