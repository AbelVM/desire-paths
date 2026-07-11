import {
  TerraDraw,
  TerraDrawPolygonMode,
  TerraDrawFreehandMode,
  TerraDrawCircleMode,
  TerraDrawRectangleMode,
  TerraDrawSelectMode,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import maplibregl from 'maplibre-gl';
import { createIcons, icons } from 'lucide';
import { SURFACE_CLASSES, SURFACE_CLASS_BY_KEY } from './constants.js';
import { applySurfaceOverride, removeSurfaceOverride, clearSurfaceEditions } from './grid.js';

// Resolve the surface class for a terra-draw feature. While a shape is still
// being drawn (before its class is assigned) it falls back to the first class so
// it renders with a real color instead of blank.
function classOf(feature) {
  const key = feature?.properties?.surfaceClass;
  return SURFACE_CLASS_BY_KEY[key] || SURFACE_CLASSES[0];
}

// Per-feature styling: a translucent fill plus a significantly bolder/darker
// stroke of the same hue (see SURFACE_CLASSES in constants.js).
function makeDrawStyles() {
  return {
    fillColor: (f) => classOf(f).fill,
    fillOpacity: 0.45,
    outlineColor: (f) => classOf(f).stroke,
    outlineWidth: 3,
  };
}

// terra-draw keeps each feature's `id` at the top level. We resolve the clicked
// polygon by hit-testing the snapshot directly (see the select-mode click
// handler), which gives us the real terra-draw id without depending on maplibre's
// rendered-feature `id` (which is a generated value, not the terra-draw id).

/**
 * Initialise the Surface Edition tooling on the map.
 *
 * Wires terra-draw (polygon / freehand / circle / rectangle / select) to the
 * simulation's friction field so painted polygons completely override the
 * underlying surface. Builds a detached, center-bottom floating toolbar with
 * lucide icons and returns a small control handle.
 *
 * @param {object} map - the DesireMap proxy (exposes `.state` and `.getRawMap()`)
 * @param {{ showToast?: (msg: string, type?: string, dur?: number) => void }} opts
 */
export function initSurfaceEdition(map, { showToast } = {}) {
  const toast = typeof showToast === 'function' ? showToast : () => { };
  const state = map.state;
  const rawMap = typeof map.getRawMap === 'function' ? map.getRawMap() : map;

  if (!state.surfaceEdits) state.surfaceEdits = new Map();

  let currentSurfaceClass = SURFACE_CLASSES[0].key;
  let selectedId = null;
  let currentMode = null; // null = no tool selected
  let draw = null;

  // ── Floating toolbar (center-bottom) — built first so it is always visible,
  // even if terra-draw fails to initialise below. ──────────────────────────
  const bar = document.createElement('div');
  bar.className = 'surface-edition';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Surface edition');

  // Surface class selector
  const classRow = document.createElement('div');
  classRow.className = 'se-classes';
  const classButtons = new Map();
  for (const c of SURFACE_CLASSES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'se-class' + (c.key === currentSurfaceClass ? ' is-active' : '');
    b.dataset.surface = c.key;
    b.style.setProperty('--se-fill', c.fill);
    b.style.setProperty('--se-stroke', c.stroke);
    b.title = c.label;
    b.setAttribute('aria-label', `Surface: ${c.label}`);
    b.setAttribute('aria-pressed', String(c.key === currentSurfaceClass));
    b.innerHTML = `<span class="se-swatch"></span><span class="se-class-label">${c.label}</span>`;
    b.addEventListener('click', () => setSurfaceClass(c.key));
    classRow.appendChild(b);
    classButtons.set(c.key, b);
  }

  // Tool buttons
  const toolRow = document.createElement('div');
  toolRow.className = 'se-tools';

  // Group 1 — drawing tools
  const drawTools = [
    { mode: 'polygon', icon: 'pentagon', label: 'Polygon' },
    { mode: 'freehand', icon: 'pen-tool', label: 'Freehand' },
    { mode: 'circle', icon: 'circle', label: 'Circle' },
    { mode: 'rectangle', icon: 'square', label: 'Rectangle' },
  ];
  const modeButtons = new Map();
  for (const t of drawTools) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'se-tool';
    b.dataset.mode = t.mode;
    b.title = t.label;
    b.setAttribute('aria-label', t.label);
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<i data-lucide="${t.icon}" aria-hidden="true"></i>`;
    b.addEventListener('click', () => setMode(t.mode));
    toolRow.appendChild(b);
    modeButtons.set(t.mode, b);
  }

  const sep = document.createElement('span');
  sep.className = 'se-sep';
  toolRow.appendChild(sep);

  // Group 2 — edit / actions. `select / move` leads this group.
  const selectBtn = document.createElement('button');
  selectBtn.type = 'button';
  selectBtn.className = 'se-tool';
  selectBtn.dataset.mode = 'select';
  selectBtn.title = 'Select / move';
  selectBtn.setAttribute('aria-label', 'Select / move');
  selectBtn.setAttribute('aria-pressed', 'false');
  selectBtn.innerHTML = `<i data-lucide="mouse-pointer-2" aria-hidden="true"></i>`;
  selectBtn.addEventListener('click', () => setMode('select'));
  toolRow.appendChild(selectBtn);
  modeButtons.set('select', selectBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'se-tool se-danger';
  deleteBtn.title = 'Delete selected';
  deleteBtn.setAttribute('aria-label', 'Delete selected surface');
  deleteBtn.innerHTML = `<i data-lucide="trash-2" aria-hidden="true"></i>`;
  deleteBtn.addEventListener('click', () => {
    if (draw && selectedId) {
      draw.removeFeatures([selectedId]);
      selectedId = null;
      // If that was the last polygon, select mode has nothing left to act on —
      // deactivate it (and any other active tool) so the map returns to free
      // node placement.
      const hasFeatures = draw
        .getSnapshot()
        .some((f) => f.geometry?.type === 'Polygon');
      if (!hasFeatures && currentMode) setMode(null);
      syncEditButtons();
    } else {
      toast('Select a surface first to delete it', 'warning');
    }
  });
  toolRow.appendChild(deleteBtn);

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'se-tool se-danger';
  clearBtn.title = 'Clear all surfaces';
  clearBtn.setAttribute('aria-label', 'Clear all surfaces');
  clearBtn.innerHTML = `<i data-lucide="eraser" aria-hidden="true"></i>`;
  clearBtn.addEventListener('click', () => {
    if (draw) draw.clear();
    toast('All painted surfaces cleared', 'info');
    // With no surfaces left, select mode has nothing to act on — deactivate it
    // (and any other active tool) so the map returns to free node placement.
    if (currentMode) setMode(null);
    syncEditButtons();
  });
  toolRow.appendChild(clearBtn);
  // No polygons yet — keep edit/action buttons disabled until one is drawn.
  syncEditButtons();
  // No drawing mode yet — keep surface class buttons disabled until one is picked.
  syncClassButtons();

  bar.appendChild(classRow);
  bar.appendChild(toolRow);
  document.body.appendChild(bar);

  // Clicking anywhere in the main UI panel deactivates the current drawing
  // mode (returns to "none"). The Surface Edition toolbar lives on <body>,
  // outside the panel, so interacting with it never triggers this.
  const panelEl = document.querySelector('.panel');
  if (panelEl) {
    panelEl.addEventListener('click', () => {
      if (currentMode) setMode(null);
    });
  }
  try {
    createIcons({ icons, attrs: { 'stroke-width': 1.8, color: 'currentColor' } });
  } catch {
    /* icons are decorative; ignore if the runtime is unavailable */
  }

  // ── Mode / class switching ───────────────────────────────────
  function setMode(mode) {
    if (!draw) return;
    // Clicking the already-active tool toggles it off (back to "none").
    if (mode === currentMode) mode = null;
    currentMode = mode;
    // terra-draw always needs an active mode; fall back to select so the map
    // stays interactive, but treat "none" as no tool highlighted.
    draw.setMode(mode || 'select');
    // Suppress node placement/dragging whenever any Surface Edition tool is
    // active — including Select mode. In Select mode the user is editing
    // polygons (dragging vertices / midpoints), so node pins must not be placed
    // or dragged: otherwise their mousedown/mousemove handlers steal the pointer
    // events that terra-draw needs to drag the selected polygon's points.
    // When no tool is selected (`mode` is null) this stays false, so node pins
    // remain fully interactive and terra-draw's select mode is just a harmless
    // fallback (no polygon can be selected without the Select tool active).
    map._surfaceEditActive = !!mode;
    for (const [m, b] of modeButtons) {
      const on = m === mode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    if (mode && mode !== 'select') toast(`Draw mode: ${mode}`, 'info', 1500);
    // Surface class buttons only make sense once a drawing mode is active.
    syncClassButtons();
    // Crosshair cursor while any draw/select mode is active; cleared when the
    // mode is deactivated so the map restores its normal (node) cursor.
    const container = rawMap.getContainer();
    if (container) container.classList.toggle('map-cursor-crosshair', !!mode);
  }

  // Surface class buttons only matter when actively drawing a new shape. They
  // stay disabled for select mode (and the delete/clear actions, which don't
  // change the mode) since those don't assign a surface class.
  function syncClassButtons() {
    const disabled = !currentMode || currentMode === 'select';
    for (const b of classButtons.values()) b.disabled = disabled;
  }

  function setSurfaceClass(key) {
    currentSurfaceClass = key;
    for (const [k, b] of classButtons) {
      const on = k === key;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    toast(`Surface: ${SURFACE_CLASS_BY_KEY[key].label}`, 'info', 1500);
  }

  // Enable the edit/action buttons only when at least one painted polygon
  // exists; otherwise select / delete / clear have nothing to act on.
  function syncEditButtons() {
    let hasFeatures = false;
    if (draw) {
      try {
        hasFeatures = draw.getSnapshot().some((f) => f.geometry?.type === 'Polygon');
      } catch {
        hasFeatures = false;
      }
    }
    selectBtn.disabled = !hasFeatures;
    deleteBtn.disabled = !hasFeatures;
    clearBtn.disabled = !hasFeatures;
  }

  // ── terra-draw initialisation (non-fatal) ────────────────────
  const polygonMode = new TerraDrawPolygonMode({ styles: makeDrawStyles() });
  const freehandMode = new TerraDrawFreehandMode({ styles: makeDrawStyles() });
  const circleMode = new TerraDrawCircleMode({ styles: makeDrawStyles() });
  const rectangleMode = new TerraDrawRectangleMode({ styles: makeDrawStyles() });
  const selectMode = new TerraDrawSelectMode({
    // terra-draw's own click-to-select relies on its internal hit-testing
    // (featuresAtMouseEvent), which is blocked by the interleaved deck.gl
    // overlay sitting above the map canvas. That path therefore never selects
    // (and worse, its onLeftClick immediately *deselects* anything our manual
    // handler just selected). We drive selection ourselves from maplibre's
    // `click` event instead, so disable terra-draw's manual select/deselect.
    // Drag-to-move and midpoint-resize still work (they use pointer events on
    // the selection points, not onLeftClick).
    allowManualSelection: false,
    allowManualDeselection: false,
    styles: {
      // A bold, bright outline + slightly stronger fill makes the selected
      // surface obviously distinct from its unselected (drawn) appearance,
      // which otherwise differ only marginally (fill 0.45 → 0.5).
      selectedPolygonColor: (f) => classOf(f).fill,
      selectedPolygonFillOpacity: 0.55,
      selectedPolygonOutlineColor: '#ffffff',
      selectedPolygonOutlineWidth: 4,
    },
    flags: {
      polygon: {
        feature: {
          draggable: true,
          coordinates: { midpoints: { draggable: true }, draggable: true },
        },
      },
      freehand: {
        feature: {
          draggable: true,
          coordinates: { midpoints: { draggable: true }, draggable: true },
        },
      },
      circle: {
        feature: {
          draggable: true,
          coordinates: { midpoints: { draggable: true }, draggable: true },
        },
      },
      rectangle: {
        feature: {
          draggable: true,
          coordinates: { midpoints: { draggable: true }, draggable: true },
        },
      },
    },
  });

  try {
    draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map: rawMap, lib: maplibregl }),
      modes: [polygonMode, freehandMode, circleMode, rectangleMode, selectMode],
    });
  } catch (err) {
    console.error('[surface-edition] terra-draw failed to initialise:', err);
    toast('Surface editing is unavailable', 'error');
    for (const b of modeButtons.values()) b.disabled = true;
    deleteBtn.disabled = true;
    clearBtn.disabled = true;
    return null;
  }

  // ── Event wiring ──────────────────────────────────────────────
  draw.on('select', (id) => {
    selectedId = id;
  });
  draw.on('deselect', () => {
    selectedId = null;
  });

  draw.on('change', (ids, type) => {
    if (type === 'create' || type === 'update') {
      let count = 0;
      for (const id of ids) {
        const feat = draw.getSnapshotFeature(id);
        if (!feat || feat.geometry?.type !== 'Polygon') continue;
        const sc = feat.properties?.surfaceClass || currentSurfaceClass;
        // Persist the class on the feature so styling reads it directly.
        if (feat.properties?.surfaceClass !== sc) {
          draw.updateFeatureProperties(id, { surfaceClass: sc });
        }
        count += applySurfaceOverride(state, feat, sc);
      }
      map.updateLayers?.();
      if (type === 'create' && count > 0) {
        toast(`Surface painted: ${SURFACE_CLASS_BY_KEY[currentSurfaceClass].label}`, 'success');
      }
    } else if (type === 'delete') {
      for (const id of ids) removeSurfaceOverride(state, id);
      map.updateLayers?.();
    }
    syncEditButtons();
  });

  // ── Click-to-select in select mode ───────────────────────────
  // We drive selection from the map canvas's `pointerup` event — the very same
  // DOM element terra-draw listens on for drawing, so it fires reliably here
  // even though maplibre's `click` can be swallowed by the interleaved deck.gl
  // overlay. terra-draw's own select-mode `onLeftClick` is disabled via
  // allowManualSelection/Deselection (its internal hit-testing is blocked by
  // that overlay), so we hit-test the pointer against terra-draw's snapshot
  // directly to obtain the real feature id, then drive selection through
  // terra-draw's public select/deselect API.
  function pointInRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      const intersect =
        yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Returns the topmost polygon (last drawn) in the snapshot that contains the
  // given lng/lat, honouring holes. Snapshot features carry the real
  // terra-draw id (a UUID), which is what selectFeature expects.
  function pickPolygon(lng, lat) {
    const snap = draw.getSnapshot();
    for (let i = snap.length - 1; i >= 0; i--) {
      const f = snap[i];
      if (f.geometry?.type !== 'Polygon') continue;
      const rings = f.geometry.coordinates;
      if (!pointInRing(lng, lat, rings[0])) continue;
      let inHole = false;
      for (let r = 1; r < rings.length; r++) {
        if (pointInRing(lng, lat, rings[r])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return f;
    }
    return null;
  }

  const canvasEl = rawMap.getCanvas();
  let pointerDownAt = null;
  canvasEl.addEventListener('pointerdown', (e) => {
    pointerDownAt = { x: e.clientX, y: e.clientY };
  });
  canvasEl.addEventListener('pointerup', (e) => {
    if (currentMode !== 'select' || !draw) return;
    // Only treat a near-stationary press as a click; ignore map pans/drags so
    // we don't select/deselect while the user is moving the map.
    if (pointerDownAt) {
      const moved = Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y);
      if (moved > 6) return;
    }
    const rect = canvasEl.getBoundingClientRect();
    const ll = rawMap.unproject([e.clientX - rect.left, e.clientY - rect.top]);
    const hit = pickPolygon(ll.lng, ll.lat);
    if (hit) draw.selectFeature(hit.id);
    else if (selectedId) draw.deselectFeature(selectedId);
  });

  // ── Clear hook for the main "Clear map" button ───────────────
  map._clearSurfaceEditions = () => {
    if (draw) {
      try {
        draw.clear();
      } catch {
        /* ignore */
      }
    }
    clearSurfaceEditions(state);
    selectedId = null;
    setMode(null);
    syncEditButtons();
  };

  // ── Start terra-draw once the map is ready ───────────────────
  const startDraw = () => {
    if (!draw) return;
    try {
      draw.start();
      setMode(null);
    } catch {
      /* ignore */
    }
    syncEditButtons();
  };
  if (typeof rawMap.loaded === 'function' && rawMap.loaded()) startDraw();
  else rawMap.on('load', startDraw);

  // TEMP DEBUG: expose for e2e drag test
  if (typeof window !== 'undefined') window.__td = { draw, setMode, setSurfaceClass, getSelected: () => selectedId };

  return { draw, setMode, setSurfaceClass };
}
