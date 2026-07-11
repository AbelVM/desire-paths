# Triage: terra-draw Select-mode vertex dragging broken

**Date:** 2026-07-11
**Symptom:** In Surface Edition (terra-draw) Select mode, the whole polygon can be dragged, but individual vertices (and midpoints) cannot be dragged. Node-pin placement/drag must be suppressed while a Surface Edition mode is active.

---

## Environment / tooling
- terra-draw `1.31.2` (`node_modules/terra-draw/dist/terra-draw.module.js`)
- terra-draw-maplibre-gl-adapter `1.4.1`
- maplibre-gl + deck.gl `MapboxOverlay({interleaved:true})`
- `puppeteer-core@25.3.0` installed; `google-chrome-stable` at `/usr/bin/google-chrome-stable`
- Network to `https://tiles.openfreemap.org/styles/bright` returns HTTP 200 (tiles reachable for headless run)
- `window.__td` debug hook exists in `src/helpers/surfaceEdition.js` (~line 447) for e2e drag testing

---

## Research log

### 1. Static analysis of terra-draw SelectMode (DONE — statically sound)
- `onMouseMove` and `onDragStart` both require `this.selected[0]` to be set.
- Vertex drag path: `dragCoordinate.getDraggable(t,e)` → `getClosestCoordinate` → `pixelDistance.measure(t, coord)` = `project(coord)` vs `(t.containerX, t.containerY)`.
- Feature drag path: `dragFeature.canDrag(t,e)` → same `pixelDistance.measure`.
- **Key insight:** Both vertex and feature drag use the *identical* screen-coordinate math (`containerX/Y`). If feature-drag works (it does — whole polygon drags), then `containerX/Y` are correct, so vertex-drag's math is also correct. The differentiator is NOT coordinate projection.
- `getClosestCoordinate` iterates `coords[0]` for Polygon, returns `index` if `dist < pointerDistance` (default 40).
- `onDragStart` recomputes `getDraggableIndex(t,i)` itself and calls `dragCoordinate.startDragging(i,a)` when `coordinatesFlags.draggable && index>-1`.
- `select` method sets `this.selected=[t]` + creates `selectionPoints`; `selectFeature(id)` → `select(id, false)`.

### 2. Adapter event handling (DONE — not the culprit)
- `getMapEventElement` returns `map.getCanvas()`.
- Core computes `containerX/Y` from `getMapEventElement(t.type).getBoundingClientRect()` — independent of deck.gl.
- Adapter only provides `project`/`unproject`/`getLngLatFromEvent`/`setCursor`; no event registration.

### 3. deck.gl interleaved overlay (DONE — not the culprit)
- `MapboxOverlay({interleaved:true})` renders into the maplibre canvas; does NOT capture/block pointer events.
- **Retracted:** earlier theories that deck.gl blocks events. Both selection and vertex-drag are geometric in terra-draw core.

### 4. Node-pin commits (DONE — not the culprit for terra-draw breakage)
- `f345946` (ui.js/main.js, adds `findNodeAtScreenPoint`) and `fd1126d` (map.js z-sort) ONLY refactor node-pin hit-testing. Neither touches terra-draw.
- `surfaceEdition.js` is NEW/untracked, developed alongside — likely where the regression lives.

### 5. Node-pin suppression (DONE — correctly implemented)
- `main.js` node-placement click handler (lines 431-476) early-returns on `desireMap._surfaceEditActive` (line 443).
- `ui.js` node-pin `handleDragStart`/`handleTouchStart` early-return on `_surfaceEditActive` (1153, 1237).
- `_surfaceEditActive = !!mode` is true for ALL terra-draw modes incl. Select.

### 6. surfaceEdition.js body (DONE — read lines 1-44; body truncated ~17883 chars)
Confirmed from captured fragments:
- Custom Select `pointerup` handler (~line 402) calls `draw.selectFeature(hit.id)` (line 413) / `draw.deselect()` (line 414) → terra-draw `this.selected` IS populated. So hypothesis #1 (selection bypass) is FALSE.
- `TerraDrawSelectMode` flags set `coordinates.draggable:true` (~lines 278-303). So hypothesis #2 (coords.draggable=false) is FALSE.
- `allowManualSelection:false`, `allowManualDeselection:false` (~267-268).
- `window.__td` debug hook (~447) exposes `draw`, `map`, `mode`, `selectFeature`, `dragVertex`, `dragFeature`, `getSelected`, `getFlags`, `getSnapshot`, `getMode`, `setMode`, `addFeatures`, `getMap`, `getRawMap`.
- Pointer listeners (399-415) are harmless: no `preventDefault`/`stopPropagation`; only act on near-stationary select-mode clicks.
- Comments (~260-261, 355-358) incorrectly blame interleaved deck.gl for blocking `featuresAtMouseEvent`/click; the custom geometric `pickPolygon` exists on that (wrong) premise.

### 7. Puppeteer reproduction (DONE — repro.js..repro8.js)
Setup that works: `addFeatures` a valid 36-char UUID polygon, `setMode('select')`, `draw.selectFeature(uuid)`, center the RAW map (`window.__map.getRawMap()` — the `window.__map` proxy `project` is unreliable/off-screen) via `setCenter([0.02,0.02])` zoom 12; vertex0 lands at screen ~ (523,516).
- **repro7:** `onDragStart` fires with `allow:true`, `dragTargetType:'coordinate'`, `dragTargetCoordIdx:0`, `a:0`, `h:true` — but `log.start:[]` (startDragging NEVER called). Drag never runs; geometry unchanged. **CONFIRMS the contradiction: detection works, execution does not.**
- **repro8:** captured the EXACT running `onDragStart` source (differs from earlier manual capture). Real logic:
  ```
  n = getSelectedFlags(i)            // {featureFlags, coordinatesFlags, hasDraggableFlags}
  o = n.featureFlags; r = n.coordinatesFlags
  if (n.hasDraggableFlags) {
    ... a = getDraggableIndex(t,i); d = resizeIndex; u=(r?.resizable)&&d!==-1;
        h=(r?.draggable)&&a!==-1; l=midpoints.draggable; p=(o?.draggable)&&canDrag
    if (u) return startDragging(resize)
    if (h) return setCursor(dragStart), dragCoordinate.startDragging(i,a)
    if (l) {...midpoints...}
    if (p) return setCursor(dragStart), dragFeature.startDragging(t,i)
    setCursor('unset')
  }
  ```
  **KEY:** the entire startDragging block is gated on the OUTER `if (n.hasDraggableFlags)`, then the INNER `if (h)`. The wrapper in repro7 computed local `h=true` but did NOT check `hasDraggableFlags`.

### 8. Root cause FOUND (repro9 — RUN 2026-07-11)
- repro9 instruments all three `startDragging` (coord/resize/feat) + `setCursor`, wraps `onDragStart`, and drags vertex0.
- **Result:** `startResize:[{id, idx:0}]` (RESIZE branch taken), `startCoord:[]` (coordinate branch NEVER reached), `startFeat:[]`, `drag:[]` (only coord-drag instrumented), `dcStable/dcResizeStable/dcFeatStable:true` (same instances), `coords0:[0,0]` unchanged.
- **ROOT CAUSE:** `onDragStart` checks the RESIZE branch (`if (u) … dragCoordinateResizeFeature.startDragging`) BEFORE the coordinate branch (`if (h) … dragCoordinate.startDragging`). Our flags set `coordinates.resizable:true` (surfaceEdition.js lines 282/288/294/300), so at a vertex the resize handle matches first → resize path is taken → the coordinate (single-vertex) drag is never started. Vertex drags are silently hijacked by resize.
- The repro7 "contradiction" (local `h=true` but `startDragging` not called) is explained: `h` is computed but the earlier `if (u)` already returned. The wrapper's post-hoc `realU:false` is an artifact — `getDraggableIndex` mutates internal state on a second call, so the wrapper's recomputed `d` reads -1 after the real call already consumed a valid index.
- **Why vertices "do nothing":** resize is taken but its drag does not move the vertex (see §9). Net effect = immovable vertices, while whole-feature drag (separate `dragFeature` path, `p`) still works.

### 9. Midpoint drag ALSO broken — second root cause (FOUND, repro11)
- repro11: midpoint drag did NOT engage (`startCoord:0`, vertex count stayed 5) even after the resize fix.
- `onDragStart` midpoint check: `l = r && "object"==typeof r.midpoints && r.midpoints.draggable`. Our flags used `midpoints: true` (a **boolean**), so `typeof r.midpoints === 'object'` is FALSE → `l` false → midpoint branch never taken.
- Midpoint **rendering** only checks `coordinates.midpoints` truthy, so `true` rendered midpoints but could never drag them.
- **Fix:** `midpoints: { draggable: true }` (object form). Verified repro11: `startCoord:1`, vertex count 5→6 (midpoint promoted to a vertex and moved). ✓

### 10. repro9.js / repro10.js / repro11.js (DONE — run)
- repro9: confirmed resize hijack (§8).
- repro10: after `resizable:false`, vertex drag works — `startCoord:1`, `startResize:0`, `coords0` [0,0]→[0.0068,-0.0068]. ✓
- repro11: midpoint drag works after `midpoints:{draggable:true}` — `startCoord:1`, vertex count 5→6; feature drag `startFeat:1`, polygon translated. ✓

---

## Root cause (confirmed — TWO bugs)
1. **Resize hijack:** `flags.*.feature.coordinates.resizable:true` made `onDragStart` take the RESIZE branch (checked before the coordinate branch) at every vertex. Single-vertex coordinate drag never started → vertices immovable. Whole-feature drag still worked via separate `dragFeature` path.
2. **Midpoint flag shape:** `midpoints: true` (boolean) rendered midpoints but failed the `"object"==typeof r.midpoints` drag check, so midpoints could never be dragged.

## Fix applied (`src/helpers/surfaceEdition.js`, lines ~282/288/294/300)
- `coordinates: { midpoints: true, draggable: true, resizable: true }`
- → `coordinates: { midpoints: { draggable: true }, draggable: true }`
- (resize removed; midpoints promoted to object form; draggable kept.)

## Verification (all pass)
- Vertex drag: `startCoord` called, geometry moves. ✓
- Midpoint drag: `startCoord` called, vertex inserted + moved. ✓
- Feature (body) drag: `startFeat` called, polygon translates. ✓
- Resize: disabled, no longer hijacks. ✓
- Node-pin `_surfaceEditActive` suppression: unchanged, intact. ✓

## Dead-ends (retracted)
- deck.gl interleaved overlay blocks pointer events — FALSE.
- Screen-coordinate projection is wrong — FALSE (feature drag uses identical math and works).
- Custom selection handler bypasses `this.selected` — FALSE (confirmed `draw.selectFeature` is called).
- `coordinates.draggable=false` — FALSE (it's `true`).
- surfaceEdition pointer listeners block `pointerdown` — FALSE (no preventDefault/stopPropagation; only near-stationary select clicks).
- `hasDraggableFlags` false / outer `if` skipped — FALSE (repro9 shows the block IS entered; resize branch is taken, not skipped).

## Next steps
- Manual/visual check in browser (dev server already reflects fix via HMR).
- Consider whether resize should be re-enabled later with a non-conflicting handle (out of scope for this bug).
