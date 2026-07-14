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
import { logger } from './logger.js';
import { SURFACE_CLASSES, SURFACE_CLASS_BY_KEY } from './constants.js';
import { applySurfaceOverride, removeSurfaceOverride, clearSurfaceEditions } from './grid.js';

// Resolve the surface class for a terra-draw feature. A finished feature carries
// its class in `properties.surfaceClass`; anything else falls back to the first
// class so it renders with a real color instead of blank.
function classOf(feature) {
  const key = feature?.properties?.surfaceClass;
  const cls = typeof key === 'string' ? SURFACE_CLASS_BY_KEY[key] : undefined;
  if (typeof key === 'string' && key !== '' && !cls) {
    // An explicit but unrecognized class (typo, or a class removed in a newer
    // version) would otherwise be silently treated as pavement (friction 1.0,
    // affordance 1.0) and mislabel the surface. Warn so the bad data is visible.
    logger.warn(
      `surfaceEdition: unrecognized surfaceClass "${key}"; defaulting to "${SURFACE_CLASSES[0].key}"`
    );
  }
  return cls || SURFACE_CLASSES[0];
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
 * @param {{
 *   showToast?: (msg: string, type?: string, dur?: number) => void,
 *   setMapCursor?: (mapInstance: object, cursor: string | null) => void,
 * }} opts
 */
export function initSurfaceEdition(map, { showToast, setMapCursor } = {}) {
  const toast = typeof showToast === 'function' ? showToast : () => { };
  const state = map.state;
  const rawMap = typeof map.getRawMap === 'function' ? map.getRawMap() : map;
  // Declared up-front (not const) so the teardown below can reference it even on
  // the early-return path, before it is assigned from the map canvas.
  let canvasEl = null;

  if (!state.surfaceEdits) state.surfaceEdits = new Map();

  let currentSurfaceClass = SURFACE_CLASSES[0].key;
  let selectedId = null;
  let currentMode = null; // null = no tool selected
  let draw = null;

  // Per-feature styling for the drawing tools. Unlike `classOf` (used for
  // finished features), a shape that is still being drawn has no `surfaceClass`
  // property yet, so it falls back to the *currently selected* class — the
  // in-progress polygon renders in the chosen surface color instead of always
  // looking like the first class. `currentSurfaceClass` is read at render time.
  const liveClassOf = (feature) =>
    SURFACE_CLASS_BY_KEY[feature?.properties?.surfaceClass || currentSurfaceClass] ||
    SURFACE_CLASSES[0];
  const liveDrawStyles = () => ({
    fillColor: (f) => liveClassOf(f).fill,
    fillOpacity: 0.45,
    outlineColor: (f) => liveClassOf(f).stroke,
    outlineWidth: 3,
  });

  // A painted surface only recolors the friction mesh once a mapping exists
  // (i.e. after "Reveal desire lines" ran a fast-scan that populated
  // `cellFrictionMap`). Before that there are no AOI hexes to color: calling
  // `updateLayers` would compute the AOI H3 cells purely from the node pins'
  // `aoi_polygon` and render every cell as the default (blue), which is exactly
  // the premature-AOI bug we must avoid. Edits are still recorded in
  // `state.surfaceEdits` and applied when the mapping is next built (see
  // `applySurfaceEdits` in triggerFastScan).
  const mappingBuilt = () => !!(state.cellFrictionMap && state.cellFrictionMap.size > 0);

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
    { mode: 'polygon', icon: 'pentagon', label: 'Polygon', tip: 'Draw a polygon' },
    { mode: 'freehand', icon: 'pen-tool', label: 'Freehand', tip: 'Draw freehand' },
    { mode: 'circle', icon: 'circle', label: 'Circle', tip: 'Draw a circle' },
    { mode: 'rectangle', icon: 'square', label: 'Rectangle', tip: 'Draw a rectangle' },
  ];
  const modeButtons = new Map();
  for (const t of drawTools) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'se-tool';
    b.dataset.mode = t.mode;
    b.dataset.baseTitle = t.tip;
    b.title = t.tip;
    b.setAttribute('aria-label', t.tip);
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
  selectBtn.dataset.baseTitle = 'Select and edit or move a surface';
  selectBtn.title = 'Select and edit or move a surface';
  selectBtn.setAttribute('aria-label', 'Select and edit or move a surface');
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

  // ── Mode affordance: floating mode badge ────────────────────
  // A detached pill that floats above the edition toolbar (not inside it, so
  // the toolbar never resizes). Mobile-safe (no cursor needed) and clear of the
  // top-center toast zone. It is an aria-live region for screen readers.
  const modeBadge = document.createElement('div');
  modeBadge.className = 'se-mode-badge';
  modeBadge.setAttribute('role', 'status');
  modeBadge.setAttribute('aria-live', 'polite');
  document.body.appendChild(modeBadge);

  // Keep the badge pinned a fixed gap above the toolbar, recomputed on resize
  // since the toolbar's height changes between desktop and mobile breakpoints.
  const positionModeBadge = () => {
    const r = bar.getBoundingClientRect();
    modeBadge.style.bottom = `${window.innerHeight - r.top + 8}px`;
  };
  positionModeBadge();
  window.addEventListener('resize', positionModeBadge);

  function updateModeBadge(mode) {
    if (!mode) {
      modeBadge.classList.remove('is-visible');
      modeBadge.textContent = '';
      return;
    }
    const t = drawTools.find((d) => d.mode === mode);
    const icon = mode === 'select' ? 'mouse-pointer-2' : t ? t.icon : 'pen-tool';
    const label = mode === 'select' ? 'Editing surface' : `Drawing · ${t ? t.label : mode}`;
    modeBadge.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i><span>${label}</span>`;
    modeBadge.classList.add('is-visible');
    positionModeBadge();
    try {
      createIcons({ icons, attrs: { 'stroke-width': 1.8, color: 'currentColor' } });
    } catch {
      /* icons are decorative; ignore if the runtime is unavailable */
    }
  }

  // Clicking anywhere in the main UI panel deactivates the current drawing
  // mode (returns to "none"). The Surface Edition toolbar lives on <body>,
  // outside the panel, so interacting with it never triggers this.
  const panelEl = document.querySelector('.panel');
  function onPanelClick() {
    if (currentMode) setMode(null);
  }
  if (panelEl) panelEl.addEventListener('click', onPanelClick);
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
    // Track the specific active surface mode so main.js can decide the cursor:
    // drawing modes keep the crosshair, while Select mode computes its own
    // pointer/grab/move cursor (see the select-mode mousemove handler below).
    map._surfaceMode = mode;
    // Show the floating mode badge whenever a Surface Edition mode is active so
    // the user can tell drawing/editing apart from free node placement. Cleared
    // when the mode is deactivated (mode === null).
    updateModeBadge(mode);
    for (const [m, b] of modeButtons) {
      const on = m === mode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
      // When a tool is the active one, its tooltip invites exiting that mode;
      // otherwise it shows the tool's normal label.
      b.title = on
        ? m === 'select'
          ? 'Exit selecting mode'
          : 'Exit drawing mode'
        : b.dataset.baseTitle;
    }
    if (mode && mode !== 'select') toast(`Draw mode: ${mode}`, 'info', 1500);
    // Surface class buttons only make sense once a drawing mode is active.
    syncClassButtons();
    // Cursor while a tool is active; cleared when the mode is deactivated so
    // the map restores its normal (node) cursor. Route through the shared
    // `setMapCursor` helper (same one the node-pin management uses for
    // add/grab/drag) so it clears any lingering node-pin cursor classes
    // (grab/grabbing) first. A plain classList.toggle would leave those in
    // place, and because every cursor rule in main.css is `!important` with
    // grab/grabbing declared after crosshair, the node cursor would win and
    // override the expected tool cursor.
    //   • drawing modes → crosshair (to place points)
    //   • select mode    → pointer until a polygon is selected (the per-move
    //                       pointer/grab/move logic lives in the select-mode
    //                       mousemove handler below)
    if (setMapCursor) {
      if (!mode) setMapCursor(rawMap, null);
      else if (mode === 'select') setMapCursor(rawMap, 'pointer');
      else setMapCursor(rawMap, 'crosshair');
    }
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
  // exists; otherwise select / clear have nothing to act on. The delete button
  // is gated separately on an actual selection (see below).
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
    clearBtn.disabled = !hasFeatures;
    // Delete is only meaningful when a polygon is currently selected.
    deleteBtn.disabled = !selectedId;
  }

  // ── terra-draw initialisation (non-fatal) ────────────────────
  const polygonMode = new TerraDrawPolygonMode({ styles: liveDrawStyles() });
  const freehandMode = new TerraDrawFreehandMode({ styles: liveDrawStyles() });
  const circleMode = new TerraDrawCircleMode({ styles: liveDrawStyles() });
  const rectangleMode = new TerraDrawRectangleMode({ styles: liveDrawStyles() });
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
    destroy();
    return null;
  }

  // ── Event wiring ──────────────────────────────────────────────
  draw.on('select', (id) => {
    selectedId = id;
    syncEditButtons();
  });
  draw.on('deselect', () => {
    selectedId = null;
    syncEditButtons();
  });

  // Painting is deferred to the `finish` event so nothing is triggered while a
  // polygon is still being drawn — terra-draw emits `change`/`update` on every
  // vertex, but the surface must only be applied once the shape is complete (or
  // edited in select mode). `finish` fires for both a completed draw
  // (action 'draw') and post-draw edits (drag/resize/edit actions).
  draw.on('finish', (id, context) => {
    const feat = draw.getSnapshotFeature(id);
    if (!feat || feat.geometry?.type !== 'Polygon') {
      syncEditButtons();
      return;
    }
    const sc = feat.properties?.surfaceClass || currentSurfaceClass;
    // Persist the class on the feature so styling reads it directly.
    if (feat.properties?.surfaceClass !== sc) {
      draw.updateFeatureProperties(id, { surfaceClass: sc });
    }
    const count = applySurfaceOverride(state, feat, sc);
    // Only repaint the friction mesh once a mapping exists (post-Reveal).
    // Otherwise the edit is recorded and applied when the mapping is built.
    if (mappingBuilt()) map.updateLayers?.();
    if (context?.action === 'draw' && count > 0) {
      toast(`Surface painted: ${SURFACE_CLASS_BY_KEY[sc].label}`, 'success');
    }
    syncEditButtons();
  });

  // `change` only handles deletions here (painting happens on `finish`). The
  // in-progress `create`/`update` events fired while drawing must NOT paint or
  // rebuild layers — doing so would compute and render the AOI hexes before the
  // user has finished the polygon (and before Reveal has built a mapping).
  draw.on('change', (ids, type) => {
    if (type === 'delete') {
      for (const id of ids) removeSurfaceOverride(state, id);
      if (mappingBuilt()) map.updateLayers?.();
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

  canvasEl = rawMap.getCanvas();
  let pointerDownAt = null;
  function onPointerDown(e) {
    pointerDownAt = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e) {
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
  }
  canvasEl.addEventListener('pointerdown', onPointerDown);
  canvasEl.addEventListener('pointerup', onPointerUp);

  // ── Select-mode cursor ───────────────────────────────────────
  // In Select mode the cursor reflects what sits under the pointer so the user
  // can tell what an action will do before clicking:
  //   • nothing selected yet              → pointer
  //   • outside the selected polygon     → pointer
  //   • over the selected polygon body   → grab   (drag to move the shape)
  //   • over an editable vertex/midpoint → move   (drag to reshape)
  // Drawing modes keep the crosshair (handled in main.js). Coalesce mousemove
  // into one rAF like main.js does.
  const SELECT_VERTEX_HIT_PX = 8;
  // Editable points = the polygon's ring vertices plus the midpoints between
  // them (terra-draw renders both as draggable handles in select mode).
  function editablePoints(ring) {
    const pts = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      pts.push(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
    return pts;
  }
  function updateSelectCursor(point) {
    if (!setMapCursor || currentMode !== 'select' || !draw) return;
    if (!selectedId) {
      setMapCursor(rawMap, 'pointer');
      return;
    }
    const feat = draw.getSnapshotFeature(selectedId);
    const ring = feat?.geometry?.type === 'Polygon' ? feat.geometry.coordinates[0] : null;
    if (!ring) {
      setMapCursor(rawMap, 'pointer');
      return;
    }
    // Over an editable vertex/midpoint → move
    for (const [lng, lat] of editablePoints(ring)) {
      const p = rawMap.project([lng, lat]);
      if (Math.hypot(p.x - point.x, p.y - point.y) <= SELECT_VERTEX_HIT_PX) {
        setMapCursor(rawMap, 'move');
        return;
      }
    }
    // Inside the selected polygon → grab (drag to move the whole shape)
    const ll = rawMap.unproject([point.x, point.y]);
    if (pointInRing(ll.lng, ll.lat, ring)) {
      setMapCursor(rawMap, 'grab');
      return;
    }
    // Otherwise → pointer
    setMapCursor(rawMap, 'pointer');
  }
  let selectCursorPending = false;
  let lastSelectPoint = null;
  function onMouseMove(e) {
    if (currentMode !== 'select') return;
    lastSelectPoint = e.point;
    if (selectCursorPending) return;
    selectCursorPending = true;
    requestAnimationFrame(() => {
      selectCursorPending = false;
      if (lastSelectPoint) updateSelectCursor(lastSelectPoint);
    });
  }
  rawMap.on('mousemove', onMouseMove);

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
  function startDraw() {
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

  // ── Teardown ─────────────────────────────────────────────────
  // Removes every listener and DOM node this initialiser added so that calling
  // initSurfaceEdition again (reset, HMR) does not stack them (review12 #11).
  function destroy() {
    window.removeEventListener('resize', positionModeBadge);
    if (panelEl) panelEl.removeEventListener('click', onPanelClick);
    if (canvasEl) {
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      canvasEl.removeEventListener('pointerup', onPointerUp);
    }
    if (rawMap) {
      rawMap.off('mousemove', onMouseMove);
      rawMap.off('load', startDraw);
    }
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    if (modeBadge && modeBadge.parentNode) modeBadge.parentNode.removeChild(modeBadge);
    try {
      draw?.stop();
    } catch {
      /* ignore */
    }
    if (import.meta.env.DEV && typeof window !== 'undefined') delete window.__td;
  }

  // TEMP DEBUG: expose for e2e drag test (dev only)
  if (import.meta.env.DEV && typeof window !== 'undefined') window.__td = { draw, setMode, setSurfaceClass, destroy, getSelected: () => selectedId };

  return { draw, setMode, setSurfaceClass, destroy };
}
