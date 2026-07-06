# Desire Paths Simulator — Pending Review Items (review5.md)

> Extracted from `review4.md`. Contains only items **not yet fully implemented**
> (status ❌ Not implemented, plus 🟡 Partial where only part is done).
> Implemented items (✅) have been removed. Each entry keeps its original
> description from `review4.md` plus the verification status and code evidence.

---

## PRIORITIZED PENDING ITEMS

| Priority | Item | Category | Effort | Status |
|----------|------|----------|--------|--------|
| P0 | Fix `distToTarget` stale distance causing incomplete paths (1.3) | Bug | Medium | ❌ Not implemented — `distToTarget` is still computed once (agentTasks.js:546-550) and never updated; the `distToTarget <= 1` early-break (line 563) can still terminate before the agent reaches the target. Relies on the `simCurrent === simTarget` break (line 619) as the real guard. |
| P2 | Improve affordance model with path hierarchy (6.1) | Affordance | Medium | ❌ Not implemented — no `pathHierarchy` / OSM `highway`-class affordance tiers in compute.js. |
| P2 | Multi-source Dijkstra for gradients (2.1) | Performance | High | ❌ Not implemented — `computeDijkstra(targetCell, …)` is single-target (dijkstra.js:15); no multi-source/Johnson/Floyd-Warshall. |
| P2 | Nested `Map` for path-cell cache keys (2.3) | Performance | Low | ❌ Not implemented — still plain `Object.create(null)` keyed `a+'::'+b` (compute.js:127, 134-155). |
| P2 | Transferables for all large payloads (2.5) | Performance | Low | ❌ Not implemented — only `frictionEntries` flattened; `visibilityEntries`/`bearingMap`/`neighborDisks` via structured clone (spatialWorker.js:218-238). |
| P2 | Incremental gradient on friction change (5.1) | Performance | Medium | ❌ Not implemented — gradient cache invalidated only by `_mappingGeneration` (compute.js:439-444); no incremental recompute. |
| P2 | Redundant `gridDistance` tiebreak (5.3) | Performance | Low | ❌ Not implemented — `gridDistance` tiebreak still present (compute.js:1318+). |
| P2 | Local social influence / vision cone (6.2) | Affordance | Medium | ❌ Not implemented — only global `Math.log1p(fp)*0.05` (compute.js:1170-1171); no local/distance-decayed influence. |
| P2 | Space-syntax-informed copy (8.1) | Copy | Low | ❌ Not implemented — still generic definition (index.html:266). |
| P2 | Urban-design context for param labels (8.2) | Copy | Low | ❌ Not implemented — tooltips still functional, no urban-design framing. |
| P2 | Spatial (not technical) legend labels (8.3) | Copy | Low | ❌ Not implemented — still "Hard structure (Cost: ∞)" etc. (index.html:562-574). |
| P2 | `importmap` for shared deps (10.3) | Performance | Low | ❌ Not implemented — uses `manualChunks` (vite.config.js:48-57); no importmap. |
| P2 | `Cache-Control` headers (10.4) | Performance | Low | ❌ Not implemented — no header config in deploy/build. |
| P3 | Replace Proxy `DesireMap` with explicit state (4.1) | Design | High | ❌ Not implemented — `DesireMap` still wraps the map in a `Proxy` (main.js:30-98). |
| P3 | Optimize `precomputeVisibilitySets` with shadow casting (2.2) | Performance | High | ❌ Not implemented — visibility still uses per-cell BFS flood fill. |
| P3 | Add undo/redo for node operations (7.3) | UX | Medium | ❌ Not implemented — no undo/redo stack or `Ctrl+Z` handler. |
| P3 | Add comparison view for parameter sets (7.5) | UX | High | ❌ Not implemented — only one simulation runs at a time. |
| P3 | Add `HowTo` and `Organization` structured data (9.1) | SEO | Low | 🟡 Partial — `Organization` and `ScholarlyArticle` schemas already exist (index.html:87-95), but `HowTo` schema is still missing. |

---

## ADDITIONAL PENDING ITEMS (verified against the codebase)

| Section | Item | Status | Evidence |
|---------|------|--------|----------|
| 2.1 | Multi-source Dijkstra for gradients | ❌ | `computeDijkstra(targetCell, …)` is single-target (dijkstra.js:15); no multi-source/Johnson/Floyd-Warshall. |
| 2.3 | Nested `Map` for path-cell cache keys | ❌ | Still plain `Object.create(null)` keyed `a+'::'+b` (compute.js:127, 134-155). |
| 2.4 | `updateLayers` per-frame `slice` allocation | ❌ | Still uses `_flatPool.slice(0, flatCount)` / `_flowPool.slice(0, flowCount)` (map.js:266-267). |
| 2.5 | Transferables for all large payloads | ❌ | Only `frictionEntries` flattened; `visibilityEntries`/`bearingMap`/`neighborDisks` via structured clone (spatialWorker.js:218-238). |
| 3.2 | `_cellLatLngCacheObj` LRU eviction | ❌ | Still uses periodic full reset on 1.5× overflow (compute.js:117-119), not LRU. |
| 4.3 | Duplicate `_bearingFromLatLngs` | ❌ | agentTasks.js:76 still defines its own copy. |
| 4.4 | Duplicate `.btn-segment.is-active` CSS | ❌ | Rules duplicated at main.css:752-768 and 779-795. |
| 5.1 | Incremental gradient on friction change | ❌ | Gradient cache invalidated only by `_mappingGeneration` (compute.js:439-444); no incremental recompute. |
| 5.2 | `gridPathCells` bidirectional cache key | ❌ | Cache keyed `a + '::' + b` without normalization (compute.js:124-155). |
| 5.3 | Redundant `gridDistance` tiebreak | ❌ | `gridDistance` tiebreak still present (compute.js:1318+). |
| 6.2 | Local social influence / vision cone | ❌ | Only global `Math.log1p(fp)*0.05` (compute.js:1170-1171); no local/distance-decayed influence. |
| 6.3 | Exponential (non-linear) decay | ❌ | Still linear `Math.max(0.1, current - DECAY_RATE * recoveryFactor)` (compute.js:1541). |
| 7.1 | Visual feedback for blocked placement | ❌ | Only an alert card (main.js:414-416); no red pulse/shake. |
| 7.2 | Context menu taller-than-viewport clamp | ❌ | Simple flip only (ui.js:486); no `getBoundingClientRect` clamp. |
| 8.1 | Space-syntax-informed copy | ❌ | Still generic definition (index.html:266). |
| 8.2 | Urban-design context for param labels | ❌ | Tooltips still functional, no urban-design framing. |
| 8.3 | Spatial (not technical) legend labels | ❌ | Still "Hard structure (Cost: ∞)" etc. (index.html:562-574). |
| 9.2 | `hreflang` / language alternates | ❌ | No `hreflang` tags in index.html. |
| 9.6 | FAQ JSON-LD / HTML duplication | ❌ | FAQ content still duplicated in JSON-LD (index.html:107-178) and HTML `<details>`. |
| 10.2 | Lazy / preload Google Fonts | ❌ | Plain `rel="stylesheet"` link (index.html:204-206). |
| 10.3 | `importmap` for shared deps | ❌ | Uses `manualChunks` (vite.config.js:48-57); no importmap. |
| 10.4 | `Cache-Control` headers | ❌ | No header config in deploy/build. |
| 10.5 | `ResizeObserver` instead of `window.resize` | ❌ | Still `addUIListener(window, 'resize', …)` (ui.js:1537). |

---

## DETAILED DESCRIPTIONS (from review4.md)

>.### 1.3 `runAgentPath` — Infinite loop risk when `distToTarget` is stale
>.**File:** `src/helpers/agentTasks.js` (lines 455-524)
>.
>.```javascript
>.let distToTarget = 0;
>.if (originDestDistances) {
>.  const d = originDestDistances[originCell + '::' + destCell];
>.  if (typeof d === 'number') distToTarget = d;
>.}
>.
>.// ...
>.for (let tick = 0; tick < maxTicks; tick++) {
>.  if (distToTarget <= 1) {  // <-- uses precomputed distance
>.    // ...
>.    break;
>.  }
>.  // ...
>.}
>.```
>.
>.**Bug:** `distToTarget` is computed once at the start and never updated. If the agent takes a detour (e.g., around obstacles), the precomputed straight-line grid distance becomes stale. The agent may reach `distToTarget <= 1` prematurely and break out of the loop before actually reaching the destination, leaving the path incomplete.
>.
>.**Fix:** Update `distToTarget` dynamically using `gridDistance(simCurrent, simTarget)` when the agent's position changes significantly, or remove the precomputed distance check and rely on the `simCurrent === simTarget` break condition.
>.
>.---

>.### 2.2 `precomputeVisibilitySets` — O(n × d²) flood fill
>.**File:** `src/helpers/compute.js` (lines 237-289)
>.
>.For each cell, the function performs a BFS flood fill up to `visionDepth` rings. With 10,000 cells and `visionDepth = 15`, this is ~10,000 × 15² = 1.5M operations. The BFS uses `gridDisk(current, 1)` per cell per ring, which is correct but creates many temporary arrays.
>.
>.**Optimization:** Use a **single multi-source BFS** from all passable cells simultaneously, computing visibility in one pass. Or use **shadow casting** (recursive shadowcasting) for O(n × d) visibility computation, which is standard in roguelike visibility algorithms.

---

### 2.4 `updateLayers` — Per-frame object pooling with slice
**File:** `src/helpers/map.js` (lines 238-267)

```javascript
const flatData = state._flatPool.slice(0, flatCount);
const flowData = state._flowPool.slice(0, flowCount);
```

`Array.prototype.slice()` creates a new array every frame. For 10,000+ cells, this is a significant allocation pressure.

**Optimization:** Pass the pool arrays directly to Deck.gl with a `length` property, or use a custom view that avoids copying:
```javascript
const flatData = state._flatPool;
flatData.length = flatCount; // truncate in-place
```

---

### 3.2 `_cellLatLngCacheObj` — Module-level cache never cleared in workers
**File:** `src/helpers/compute.js` (lines 49-136)

The module-level `_cellLatLngCacheObj` and `_cellLatLngCacheOrder` are cleared by `clearLatLngCache()`, but this is only called from `clearComputeCaches()` and `resetSimulationState()`. If the user pans the map to a new AOI without resetting, the cache grows unbounded until it hits `CELL_LATLNG_CACHE_MAX` (1024), then resets entirely. The periodic full GC (line 132-134) is a blunt instrument that discards useful cache entries.

**Fix:** Use an LRU eviction policy instead of periodic full resets, or increase the cache size and use a softer eviction threshold.

---

### 4.1 Proxy-based `DesireMap` — Unnecessary complexity
**File:** `src/main.js` (lines 30-175)

The `DesireMap` class wraps a `maplibregl.Map` in a `Proxy` to intercept property access and route it to a `_state` bag. While this avoids monkey-patching, it introduces:
- Significant cognitive overhead for debugging (properties appear on `map` but live in `_state`)
- Performance overhead from Proxy traps on every property access
- Fragile `has`/`ownKeys` traps that may break with future MapLibre updates

**Alternative:** Use explicit getter/setter methods or a simple state object passed by reference. The Proxy is clever but premature optimization for a problem that doesn't exist in production.

---

### 4.3 `_bearingFromLatLngs` — Duplicate with different signatures
**Files:** `src/helpers/compute.js` (lines 99-107) and `src/helpers/agentTasks.js` (lines 76-84)

Same function, slightly different parameter handling. The `compute.js` version accepts `[lat, lng]` or `[lng, lat]` arrays, while `agentTasks.js` assumes `[lat, lng, latRad, lngRad]` precomputed format.

**Fix:** Standardize on the precomputed-radians format everywhere and remove the dual-format logic.

---

### 4.4 CSS — Duplicate `.btn-segment.is-active` rules
**File:** `src/style/main.css` (lines 741-784)

The `.btn-segment.is-active[data-placement-mode='*']` rules are defined twice (lines 741-757 and 768-784). This is harmless but indicates copy-paste debt.

---

### 5.2 `gridPathCells` — Called repeatedly for same pairs
**File:** `src/helpers/compute.js` (line 157)

`gridPathCells(a, b)` is called in `_getCachedPathCells`, but the cache key is `a + '::' + b`. For bidirectional paths, `gridPathCells(a, b) === gridPathCells(b, a)`, but the cache stores both directions separately.

**Optimization:** Normalize cache keys: `const key = a < b ? a + '::' + b : b + '::' + a;`

---

### 6.1 Current affordance model is binary for infrastructure
**File:** `src/helpers/compute.js` (lines 1403-1418)

```javascript
function updateAffordance(ctx, cell, volume = 1) {
  const cs = ctx._cellState?.[cell];
  const friction = cs?.friction ?? ctx._frictionObj?.[cell];
  if (friction === FRICTION_COSTS.PAVEMENT || friction === FRICTION_COSTS.IMPASSABLE) return;
  // ...
}
```

Pavement and impassable cells never accumulate wear. This is physically correct for pavement, but **impassable cells should never be considered at all** (they're filtered earlier). The real issue is that the affordance model doesn't distinguish between:
- **Primary paths** (wide sidewalks) — should have higher base affordance
- **Secondary paths** (narrow footways) — should have lower base affordance
- **Tertiary paths** (desire paths themselves) — should start at 0 and accumulate

**Improvement:** Add a `pathHierarchy` dimension to the friction model, mapping OSM `highway` classes to affordance tiers:
- `primary`/`secondary` → affordance 1.0 (high)
- `tertiary`/`unclassified` → affordance 0.8
- `footway`/`path` → affordance 0.6
- `service` → affordance 0.4

---

### 6.3 Decay is uniform across terrain types
**File:** `src/helpers/compute.js` (lines 1426-1438)

```javascript
function decayAffordance(ctx, cell) {
  const recoveryFactor = friction === FRICTION_COSTS.HEAVY_GRASS ? 0.5 : 1.5;
  const current = cs?.affordance ?? ctx._affordanceObj?.[cell] ?? 0.1;
  const newVal = Math.max(0.1, current - DECAY_RATE * recoveryFactor);
  // ...
}
```

Light park recovers 1.5× faster than heavy grass, but both recover linearly. Real vegetation recovery is **non-linear** — grass recovers quickly in the first week, then slows as roots reestablish.

**Improvement:** Use exponential decay: `newVal = current * Math.exp(-DECAY_RATE * recoveryFactor)`. This produces more realistic path persistence curves.

---

### 7.1 No visual feedback for node placement failure
**File:** `src/main.js` (lines 405-414)

When `isAccessible` returns false, an alert card is shown. But the user gets no **immediate** visual feedback on the map — no red flash, no shake animation, no temporary marker showing "blocked."

**Improvement:** Add a brief red pulse animation at the click location using a temporary Deck.gl layer or CSS animation on the map container.

---

### 7.2 Context menu positioning can overflow viewport
**File:** `src/helpers/ui.js` (lines 472-489)

```javascript
if (left + menuWidth > viewportWidth) left = cx - offsetX - menuWidth;
if (top + menuHeight > viewportHeight) top = cy - offsetY - menuHeight;
```

The menu flips horizontally if it overflows the right edge, and vertically if it overflows the bottom. But it doesn't handle the case where the menu is **taller than the viewport** — it will still overflow.

**Improvement:** Use `getBoundingClientRect()` on the menu after positioning, and if it still overflows, clamp `top` to `viewportHeight - menuHeight` with a minimum of 0.

---

### 7.3 No undo/redo for node operations
Users can accidentally delete nodes or change their type with no way to recover.

**Improvement:** Add a simple undo stack (last 10 actions) with `Ctrl+Z` / `Cmd+Z` keyboard shortcuts.

---

### 7.5 No comparison view for different parameter sets
The paper compares multiple models (basic, path-minimizing, weighted, obstacle-aware). The simulator only runs one configuration at a time.

**Improvement:** Add a "Compare" mode that runs two simulations side-by-side (split view or overlay with opacity slider), showing how different parameter values affect path formation.

---

### 9.1 Current structured data is good but incomplete
**File:** `index.html` (lines 43-194)

The page already has `SoftwareSourceCode`, `WebApplication`, `FAQPage`, and `BreadcrumbList` schemas. Strengths:
- Cites the academic paper directly
- Includes `codeRepository` and `issueTracker`
- Has `FAQPage` with 8 questions

**Missing:**
- **`HowTo` schema** for the step-by-step usage guide
- **`VideoObject` schema** if a demo video is added
- **`Organization` schema** for the author/institution *(now present)*
- **`ScholarlyArticle` citation** in `SoftwareSourceCode` is incomplete — missing `issn`, `volume`, `issue`, `pages`

---

### 9.2 No `hreflang` or language alternatives
The page is English-only but has no `hreflang` tags. If translated versions are planned, add:
```html
<link rel="alternate" hreflang="en" href="https://abelvm.github.io/desire-paths/" />
<link rel="alternate" hreflang="es" href="https://abelvm.github.io/desire-paths/es/" />
```

---

### 9.6 FAQ content duplicated between JSON-LD and HTML
**File:** `index.html` (lines 98-169 and 444-518)

The FAQ content appears in both the `FAQPage` JSON-LD schema and the HTML `<details>` elements. This is good for AEO (AI engines can extract from both), but the content is **exactly duplicated** — any update must be made in two places.

**Improvement:** Generate the JSON-LD from the HTML FAQ content at build time, or use a single source of truth.

---

### 10.2 Add `loading="lazy"` to Google Fonts
**File:** `index.html` (line 199-201)

```html
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
```

Add `loading="lazy"` to defer font loading until after first paint:
```html
<link rel="preload" href="https://fonts.googleapis.com/css2?..." as="style" onload="this.onload=null;this.rel='stylesheet'" />
<noscript><link href="..." rel="stylesheet" /></noscript>
```

---

### 10.5 Consider `ResizeObserver` instead of `window.resize`
**File:** `src/helpers/ui.js` (lines 1521-1529)

```javascript
addUIListener(window, 'resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (window.innerWidth >= 600 && panelCollapsed) {
      setPanelCollapsed(false);
    }
  }, 150);
});
```

`ResizeObserver` on the panel container is more precise than `window.resize`, which fires for any window resize (including dev tools opening).

---

### 2.1 Dijkstra gradient computation — O(n log n) per destination
**File:** `src/helpers/dijkstra.js`

The Dijkstra implementation is correct but runs on the full AOI for every destination. With 10 destinations and 10,000 cells, this is 10 × O(n log n) = ~1M operations. The worker pool parallelizes this, but each worker still runs a single-threaded Dijkstra.

**Optimization:** For multiple destinations, consider using **Multi-Source Dijkstra** (run all destinations simultaneously from a single heap) or **Johnson's algorithm** if the graph is dense. Alternatively, precompute all-pairs shortest paths using Floyd-Warshall if the AOI is small (< 5,000 cells).

---

### 2.3 `_getCachedPathCells` — String concatenation for cache keys
**File:** `src/helpers/compute.js` (line 157)

```javascript
const arr = gridPathCells(a, b);
```

The cache key is implicitly `a + '::' + b` (from line 149: `inner[b]`). For H3 cell IDs (typically 15+ characters), string concatenation and hashing is a hot-path cost.

**Optimization:** Use a numeric hash or a `Map` of `Map`s: `cache.get(a)?.get(b)`. The current plain-object approach is already fast, but a nested `Map` avoids string allocation entirely.

---

### 2.5 Worker message serialization — Transferable arrays not always used
**File:** `src/helpers/spatialWorker.js` (lines 169-189)

```javascript
function flattenPayloadAndTransfers(payload) {
  const fe = payload.frictionEntries;
  if (!fe || typeof fe !== 'object') return { payload, transfer: [] };
  // ...
}
```

Only `frictionEntries` is flattened for transfer. Other large payloads like `visibilityEntries`, `bearingMap`, and `neighborDisks` are serialized via structured clone, which is slower than transferable ArrayBuffers.

**Optimization:** Flatten all large typed-array-like payloads for transfer, not just `frictionEntries`.

---

### 5.1 Gradient caching — No invalidation on friction changes
**File:** `src/helpers/compute.js` (lines 796-851)

Gradients are cached in `_gradientCacheObj` and keyed by destination cell. The cache is invalidated by `_mappingGeneration` changes, but if the user changes simulation parameters that affect agent behavior (not friction), the gradients remain valid. However, if the user modifies the map (e.g., draws a new obstacle), `_mappingGeneration` increments and all gradients are recomputed.

**Optimization:** For small AOI changes, use **incremental Dijkstra** (only recompute gradients for cells whose friction changed) instead of full recomputation.

---

### 5.3 `runSingleAgentPath` — Redundant `gridDistance` in tiebreak
**File:** `src/helpers/compute.js` (lines 1306-1313)

```javascript
} else if (candidateCost === currentBestCost) {
  const dCandidate = gridDistance(curr, cellsArr[i]);
  const dBest = gridDistance(curr, cellsArr[bestIndex]);
  if (dCandidate < dBest) {
    bestIndex = i;
  }
}
```

`gridDistance` is an H3 call that traverses the H3 hierarchy. In the worker version (`agentTasks.js`), this is also present (lines 404-410). This tiebreak is rare but expensive when it triggers.

**Optimization:** Precompute grid distances for all candidate pairs in the disk, or use a cheaper distance metric (e.g., precomputed lat/lng Euclidean distance).

---

### 6.2 No social influence on affordance
The paper mentions "collective behaviour" (section 2.3) where pedestrians follow worn paths because they see others using them. The current model has `accumulatedFootprints` boosting affordance via `Math.log1p(fp) * 0.05`, but this is a **global** accumulator — all agents see all footprints equally.

**Improvement:** Add a **local social influence** factor where agents only see footprints within their vision cone, and the influence decays with distance from the footprint. This better models the paper's "collective behaviour" mechanism.

---

### 8.1 Current copy is generic
**File:** `index.html` (lines 260-268)

> "A desire path, or social trail, is an unplanned route created by repeated pedestrian movement, usually revealing a route that users perceive as shorter, clearer, or more convenient than the official path."

**Improved copy (space syntax informed):**
> "Desire paths are the physical trace of pedestrian choice — emergent routes that reveal where official infrastructure fails to match natural movement patterns. They are the spatial syntax of a place: the lines people actually walk, not the lines planners drew."

---

### 8.2 Parameter labels lack urban design context
**File:** `index.html` (lines 340-413)

Current tooltips are functional but don't connect to urban design theory:
- "Affordance weight" → "How strongly agents prefer existing paths vs. creating new ones. Higher values produce conservative pedestrians who stick to sidewalks."
- "Distance penalty" → "The cost of detouring. Higher values produce directness-seeking pedestrians who cut across open space."
- "Vision depth" → "Perceptual range in meters. Models how far ahead pedestrians evaluate terrain — akin to visibility in space syntax."

---

### 8.3 Legend labels are technical, not spatial
**File:** `index.html` (lines 542-575)

> "Hard structure (Cost: ∞)" → "Impassable: buildings, water, walls"
> "Dense vegetation (Cost: 4.0)" → "Heavy vegetation: forest, scrub — high traversal cost"
> "Permeable greenspace (Cost: 2.5)" → "Open greenspace: grass, meadow — moderate traversal cost"
> "Walkable baseline" → "Paved infrastructure: paths, roads, sidewalks"

---

### 10.3 Use `importmap` for Three.js/Deck.gl dependencies
The current Vite config splits `maplibre-gl`, `@deck.gl`, and `h3-js` into separate chunks. Consider using an `importmap` to deduplicate shared dependencies (e.g., `@luma.gl` is used by both `@deck.gl/core` and `@deck.gl/geo-layers`).

---

### 10.4 Add `Cache-Control` headers for static assets
The `dist/` build produces hashed filenames (e.g., `index-10fvoH1R.css`), which is good for cache busting. But the GitHub Pages deployment should serve these with `Cache-Control: public, max-age=31536000, immutable` for optimal CDN caching.

---

*Pending items extracted from `review4.md`. Implemented items (✅) were excluded.*
