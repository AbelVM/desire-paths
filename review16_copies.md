# REVIEW 16 — COPIES: UI text, research.html & faq.html (voice, accuracy, consistency, SEO/GEO/AEO)

**Subject:** Desire Paths simulator — all user-facing copy
**Audience:** mapping enthusiasts, urban-planning professionals, curious explorers
**Reviewer lens:** urban design & planning, space syntax / human dynamics, pedestrian behaviour & foot-traffic modellisation, copywriting, storytelling, search/GEO/AEO
**Scope:** `index.html` (panel + in-app FAQ + meta), `public/docs/research.html`, `public/docs/faq.html`, `public/sitemap.xml`, `src/helpers/constants.js` (source of truth for ranges/labels), `src/helpers/surfaceEdition.js` (Surface Edition copy), `src/helpers/ui.js` (toasts/alerts)

This review deliberately does **not** explain basic concepts (desire paths, ABM, H3, affordance, Dijkstra). It audits the *words* — their accuracy, consistency, voice, and machine-readability — and plans concrete fixes. Every finding is tied to a file and line so it is actionable.

> **Implementation status (updated):** 32 of 32 items ✅ Done. See §6.1 for the per-file change log. A pre-existing integration-test regression (commit `cd17bbf8`) was also fixed as part of this work.

---

## 0. What is already good (preserve)

The copy is unusually strong for a research tool. Do not regress these:

- **The storytelling hook** in the homepage meta description — *"see where pedestrians naturally walk — and why the plan fights their instincts"* (`index.html:9`) — is the single best line in the product. It frames the whole tool as a conflict between design intent and human behaviour, which is exactly the urban-design narrative.
- **The intro panel voice** — *"the city's honest feedback on how people really move"* (`index.html:272`) — is confident, plain, and expert. Preserve.
- **Schema.org maturity.** `research.html` ships a `ScholarlyArticle` (GEO gold); `faq.html` ships `FAQPage` + `HowTo`; `index.html` ships `SoftwareSourceCode` + `WebApplication` + `FAQPage` + `BreadcrumbList`. This is well above average for a static simulator and is the primary AEO asset.
- **Internal linking** between the three pages (`research.html:241`, `faq.html:240`, `index.html:537`) is coherent and uses link-cards.
- **Friction *values* in `faq.html:320` are correct** — verified against `constants.js:16` (PAVEMENT 1.0, LIGHT_PARK 2.5, HEAVY_GRASS 4.0, IMPASSABLE ∞). Only the *labels* drift (see §3).

---

## 1. Copy accuracy — the docs contradict the running app (highest priority)

These are factual errors a user will hit the moment they cross-reference the FAQ with the UI. They erode trust and break the AEO structured data (the `HowTo` describes buttons that do not exist).

### 1.1 `faq.html:115` — "Agents per Weight Unit (5–100)" is wrong
`constants.js:110` defines `agentsPerWeightUnit: { min: 25, max: 500 }`. The UI label is **Crowd size (25–500)** (`index.html:396`, `:403`). The FAQ says **5–100**. Fix the range to **25–500**.

### 1.2 `faq.html:115` — omits Grid resolution
The UI exposes **Grid resolution (0–15)** (`index.html:417`, `constants.js:112`) but the FAQ parameter list never mentions it. Add it.

### 1.3 `faq.html:201` — `HowTo` says click **"Simulate Flows"** (button does not exist)
The actual CTA is **"Reveal desire lines"** (`index.html:446`). The `HowTo` step-3 `text` must name the real button or AI engines / users following it will fail.

### 1.4 `faq.html:207` — `HowTo` says click **"Export GeoJSON"** (button says "Export walk map")
Actual button: **"Export walk map"** (`index.html:447`). Align the `HowTo` text (see also §2.5 for the GeoJSON keyword trade-off).

### 1.5 `faq.html:189` — `HowTo` says "node weight (1–10)"; UI says **"Pull strength"**
The slider is labelled **Pull strength** (`index.html:329`). The `HowTo` should say *"set Pull strength (1–10)"* so the instruction maps to what the user sees.

### 1.6 `index.html:527` — in-app FAQ "How do simulation parameters affect results?" is incomplete
It lists Comfort preference, Shortcut preference, Look-ahead, Viewing arc, Spontaneity, Paths wear in — but **omits Crowd size and Grid resolution**, both present in the UI. Either complete it or link to `/docs/faq.html` for the full list.

### 1.7 `research.html:199,207–227` — the model-comparison table is ambiguous and self-contradictory to a reader
- The header **"MDD (fields)"** and values like **"22.9 (19.6%)"** never define *fields* or the *%*. A reader cannot tell what the number means.
- **Obstacle avoidance shows MDD 26.6** (higher = *more* detour) yet is the only row with **~60% accuracy** and is presented as the best model. Without a note, a planner reads "26.6 > 22.9, so obstacle avoidance is worse." MDD and accuracy measure different things and must be disambiguated.

**Fix (proposed caption / footnote under the table):**
> *MDD = mean extra distance walked versus the shortest possible route, counted in grid cells ("fields"); lower is better. Accuracy = share of simulated steps that fall within a few cells of the observed real-world path. The two are independent: the obstacle-avoidance model accepts a slightly longer detour (MDD 26.6) to achieve the closest match to actual behaviour (~60%).*

Also replace the three **"—"** in the Accuracy column with **"n/a"** (or a dash with a footnote "not reported for baseline models") so the column does not read as "broken."

### 1.8 `research.html:79` — `sameAs: null` is invalid JSON-LD
`"sameAs": null` for Tomasz Szandała is dead markup. Remove the key or supply a real URL (ORCID / SUPSI profile).

### 1.9 `research.html` — omits the simulator's model improvements over the paper
The page faithfully describes the *paper's* four models (Basic, Path minimisation, Weighted preferences, Obstacle avoidance) but never states that the **running simulator extends that model**. A reader who opens the app sees behaviour the paper does not describe, which reads as undocumented magic. The research page should carry a short "Beyond the paper" subsection that names the concrete engineering improvements the simulator adds on top of Bossowski et al. (2025), e.g.:

- **H3 hexagonal grid** — replaces the paper's square field lattice, eliminating the diagonal/Manhattan bias and giving uniform 6-neighbour adjacency (no corner-cutting through obstacles).
- **Agent waves** — agents are released in staggered waves rather than one batch, so emergent wear accumulates progressively and the flow network stabilises instead of being dominated by a single run's noise.
- **Gaussian blur on the friction field** — softens hard surface boundaries so agents transition smoothly between terrain tiers instead of snapping at cell edges.
- **Angular penalty** — adds a turn-cost term so agents prefer straight, legible routes over jittery zig-zags (closer to real pedestrian kinematics).
- **Decay / update of wear** — the positive-feedback loop is time-aware: older traversals decay and recent ones are weighted up, so the path system reflects current demand, not just cumulative history.
- **Stochasticity (Temperature)** — route choice is sampled, not greedy, so the ensemble captures the spread of plausible human paths rather than one deterministic line.
- **Obstacle corner-cutting prevention** — when a candidate step would cut diagonally across a building corner, the agent routes a local detour *around* the obstacle (`resolveStepLine` / `cornersImpassable`) instead of jumping the corner, so paths never clip through impassable geometry.
- **Terrain-aware wear & recovery** — vegetation types wear and heal at different rates: dense grass is harder to wear but persists longer, lawns wear easily but recover fast (`updateAffordance` / `decayAffordance`). The paper's single affordance value becomes a per-surface dynamic.
- **Collective ABM wear (true positive feedback)** — every agent accumulates into one shared footprint accumulator, so later agents are drawn toward earlier trails (affordance boosted by the log of accumulated footprints). This is what makes the desire-line network *emerge* from the crowd, not from any single path.
- **Real-world OSM map data** — the friction map is built from actual map geometry (buildings, water, parks, landuse) via fast-scan, not a synthetic lattice, so the model runs on real urban form.
- **Adjustable H3 resolution (0–15)** — the grid coarsens or refines from a single block to a whole district, scaling the same model across scopes the paper's fixed lattice could not.
- **Walled-off / unreachable detection** — destinations enclosed by impassable terrain are detected and reported rather than silently failing, so the tool degrades gracefully on real, messy maps.
- **City-scale parallelism** — the agent loop shards across workers that share one atomic (SAB) footprint accumulator, so the ABM dynamics hold while scaling to city-sized AOIs (the enabler behind the adjustable resolution).

This is also a strong **GEO/AEO** asset: each term (H3, Gaussian blur, angular penalty, agent waves, stochastic agent-based model, obstacle corner-cutting, terrain-aware wear, collective ABM, OSM data) is a distinct, citable concept an AI engine can surface when asked "how does the Desire Paths simulator improve on the CEUS 2025 model?" Add it as a new `<h2>` after the metrics block (`research.html:237`) and, optionally, mirror the list into the `ScholarlyArticle` `description` / `about` keywords (§4.3).

---

## 2. Terminology & voice — UI and docs speak two dialects

The docs use the paper's *technical* terms (good for SEO); the UI uses *friendly* terms (good for UX). Nobody bridges them, so a curious user who reads the FAQ then opens the app cannot find the control they just read about.

### 2.1 The parameter-name mapping gap
| Docs / research (`faq.html:115`, `research.html`) | UI (`index.html`) | Status |
|---|---|---|
| Affordance Weight (1–8) | Comfort preference (`:352`) | rename or cross-ref |
| Distance Penalty (1–8) | Shortcut preference (`:363`) | rename or cross-ref |
| Vision Depth (5–30) | Look-ahead (`:374`) | rename or cross-ref |
| Field of View (30°–360°) | Viewing arc (`:384`) | rename or cross-ref |
| Agents per Weight Unit | Crowd size (`:396`) | rename or cross-ref |
| Temperature (0–2) | Spontaneity (`:407`) | rename or cross-ref |
| node weight | Pull strength (`:329`) | rename or cross-ref |
| Simulate Flows | Reveal desire lines (`:446`) | **wrong in HowTo (§1.3)** |
| Export GeoJSON | Export walk map (`:447`) | label mismatch (§2.5) |

**Recommendation (low-risk, high-clarity):** keep the friendly UI labels, but (a) add a one-line "In the app this is called…" parenthetical in the FAQ parameter answer, and (b) add the technical term to each UI help-tip's `data-tooltip` so the two vocabularies are explicitly linked. Do **not** rename the UI controls to the paper terms — "Comfort preference" tests better with the curious audience than "Affordance Weight."

### 2.2 `index.html:8` — homepage `<title>` verb "read" is weak
*"Desire Paths — read where people choose to walk"* — "read" is ambiguous (read a chart? read data?) and undersells a *visual* simulator. The OG/meta already use "see." Lead with the stronger verb and the primary keyword:
> **Proposed:** `Desire Paths — see where people naturally walk` (or `…reveal where pedestrians choose to walk`).

### 2.3 `index.html:286` — "both-ends points" is awkward
Onboarding step 1: *"Drop start, end, or both-ends points on the map."* "both-ends" is not a word.
> **Proposed:** *"Drop a start, an end, or both at once."*

### 2.4 `index.html:255` — "Model" tab label is abstract for the curious segment
The tab holds placement + parameters + run. "Model" reads as *the theory*, not *the controls*. For the "just curious" audience, **"Simulate"** or **"Build"** is clearer. (Optional — experts are fine with "Model.") Keep if you prefer the expert framing, but note the mismatch with the friendly parameter names in §2.1.

### 2.5 `index.html:447` — "Export walk map" drops the SEO term "GeoJSON"
Every doc page and the `HowTo` say **GeoJSON** (`faq.html:139`, `research.html:259`), and "GeoJSON" / "GIS" are high-value search queries for the planner segment. The button should keep the keyword:
> **Proposed:** `Export GeoJSON` or `Export walk map · GeoJSON`.
(Resolves §1.4 at the same time — make the button and the `HowTo` agree on "Export GeoJSON.")

### 2.6 Echo the signature hook inside the app
The *"why the plan fights their instincts"* line (`index.html:10`) is the product's thesis but appears only in `<meta>`. Surface it once in the intro panel (`index.html:272`) so the narrative is consistent from search result → app. One sentence, e.g. *"Every desire line is the map arguing with the plan."*

---

## 3. Cross-surface label consistency (friction taxonomy)

Three surfaces describe the same four terrain tiers with three different vocabularies. Values are correct (§0); only the words differ.

| Tier (`constants.js:41`) | `faq.html:320` friction table | `index.html:572` legend | `surfaceEdition.js:42` classes |
|---|---|---|---|
| PAVEMENT (1.0) | Walkable baseline (pavement, paths) | Pavement / easy walking | Pavement |
| LIGHT_PARK (2.5) | Permeable greenspace | Lawn / soft ground | Lawn / soft |
| HEAVY_GRASS (4.0) | Dense vegetation | Dense planting | Dense planting |
| IMPASSABLE (∞) | Hard structure (buildings, water) | Building / barrier — can't cross | Barrier |

**Fix:** pick one canonical label set and use it everywhere. Recommended canonical (matches the Surface Edition painter the user actually clicks): **Pavement · Lawn / soft · Dense planting · Barrier**. Update `faq.html:320` ("Permeable greenspace"→"Lawn / soft", "Dense vegetation"→"Dense planting", "Hard structure (buildings, water)"→"Barrier (buildings, water)") and `index.html:572` ("Lawn / soft ground"→"Lawn / soft" for exact match; "Building / barrier — can't cross"→"Barrier — can't cross"). Keep the cost numbers; they are right.

Also: the UI legend title is **"Walking resistance"** (`index.html:565`) while the docs call the same concept the **"Friction Cost Model"** (`faq.html:319`, `research.html` prose). Add one bridging phrase in the legend or FAQ: *"Walking resistance is the friction cost of each surface."*

---

## 4. SEO / GEO / AEO — structured data, metadata, crawl

### 4.1 `index.html` has **no `<h1>` in the body** — real SEO + a11y gap
The panel title is `<h2>Desire Paths</h2>` (`index.html:244`); there is no page-level `<h1>`. Search crawlers and screen readers expect one. Add a semantic `<h1>` (can be the panel title promoted, or a visually-hidden `<h1>Desire Paths — see where people naturally walk</h1>`). This also lets the `<title>` and `<h1>` reinforce the primary keyword.

### 4.2 `public/sitemap.xml:5,11,17` — `lastmod` is stale (2025-01-15)
Both `research.html:26` and `faq.html:26` declare `article:modified_time` **2026-07-05**. The sitemap contradicts the pages. Update `lastmod` to `2026-07-05` (or today) and keep `changefreq` realistic (the docs are `monthly` but were just edited — consider `monthly` with correct `lastmod`).

### 4.3 `research.html` `ScholarlyArticle` — enrich the GEO signal
It is already the best GEO asset. Add: `"url"` (the paper or `/docs/paper.md`), `"isPartOf"` → the CEUS journal object, `"license"`, and a real `"sameAs"` (DOI/Elsevier) if available. Remove `"sameAs": null` (§1.8). Consider adding `author` ORCID `sameAs` URLs.

### 4.4 `faq.html` — add `speakable` for voice-search AEO
Add a `WebPage` (or extend the existing `FAQPage` context) with a **`speakable`** spec pointing at the H1/H2 + the FAQ answers. Voice assistants (Google Assistant, Siri, Alexa) preferentially read `speakable`-marked content; this is a cheap, high-leverage AEO win for "what is a desire path?" type queries.

### 4.5 Homepage `FAQPage` (`index.html:104`) is thinner than `faq.html:57`
The homepage FAQPage has 8 questions; `faq.html` has 12 and includes four high-intent ones the homepage lacks: **Dijkstra gradient algorithm**, **What simulation parameters can be adjusted?**, **What are the limitations**, **Historical origin**. For AEO, either (a) expand the homepage `FAQPage` to include at least *simulation parameters* and *limitations*, or (b) mark `faq.html` as the canonical FAQ and have the homepage FAQPage link to it. Avoid two competing thin FAQPages.

### 4.6 Social / Open Graph gaps on `research.html` and `faq.html`
- Both lack `og:image` and `twitter:image`; `index.html:28` has `og-image.png`. Add the shared `og-image.png` to both so shared links render richly.
- Add `og:locale="en_US"` to all three (currently absent).
- `twitter:card` is `summary_large_image` on both docs but without `twitter:image` the large card degrades. Add `twitter:image`.

### 4.7 Keyword enrichment (low effort)
`faq.html:11` keywords are good; add the high-intent planner terms the UI/docs use: **"GeoJSON export"**, **"walkability analysis tool"**, **"pedestrian flow prediction"**, **"desire path mapping"**. Keep `meta keywords` (ignored by Google but still parsed by some engines and by LLM crawlers).

### 4.8 Canonical & robots — already correct
All three pages have correct `rel="canonical"` and `robots` (`index,follow,…`). `robots.txt` correctly disallows build/coverage/tmp. No change needed — noted so it is not "fixed" by mistake.

---

## 5. Minor copy polish

- `ui.js:688` toast `"Couldn't remove point"` → `"Couldn't remove that point"` (slightly more natural; trivial).
- `surfaceEdition.js:196` `"All painted surfaces cleared"` — good; keep.
- `index.html:565` legend "Walking resistance" vs docs "Friction Cost Model" — bridge with one phrase (§3).
- `research.html` / `faq.html` footers are consistent and correct — keep.

---

## 6. Prioritized action plan

> **Status legend:** ✅ Done · 🔲 Deferred (out of scope / optional) · ⏳ In progress

| ID | Type | Finding | Location | Fix | Effort | Priority | Status |
|----|------|---------|----------|-----|--------|----------|--------|
| C1 | Accuracy | "Agents per Weight Unit (5–100)" wrong | `faq.html:115` | → 25–500 (matches `constants.js:110`) | S | **P0** | ✅ Done |
| C2 | Accuracy | FAQ omits Grid resolution | `faq.html:115` | Add "Grid resolution (0–15)" | S | **P0** | ✅ Done |
| C3 | Accuracy | `HowTo` "Simulate Flows" button doesn't exist | `faq.html:201` | → "Reveal desire lines" | S | **P0** | ✅ Done |
| C4 | Accuracy | `HowTo` "Export GeoJSON" ≠ button "Export walk map" | `faq.html:207` + `index.html:447` | Agree on "Export GeoJSON" | S | **P0** | ✅ Done |
| C5 | Accuracy | `HowTo` "node weight" ≠ UI "Pull strength" | `faq.html:189` | → "Pull strength (1–10)" | S | P1 | ✅ Done |
| C6 | Accuracy | In-app FAQ params incomplete | `index.html:527` | Add Crowd size + Grid resolution (or link to /docs/faq.html) | S | P1 | ✅ Done |
| C7 | Accuracy | research table MDD/% ambiguous + self-contradictory | `research.html:199,207` | Add clarifying caption (§1.7); "—"→"n/a" | S | P1 | ✅ Done |
| C8 | Accuracy | `sameAs: null` invalid JSON-LD | `research.html:79` | Remove or use real URL | S | P1 | ✅ Done |
| C9 | Completeness | research.html omits simulator's model improvements over paper | `research.html:237` | Add "Beyond the paper" subsection (H3, agent waves, Gaussian blur, angular penalty, decay/update, stochasticity, corner-cut prevention, terrain-aware wear, collective ABM, OSM data, adjustable resolution, walled-off detection, city-scale parallelism) | M | P1 | ✅ Done |
| A1 | Flow | Intro ¶1 implies auto-emergence on drop (no auto-run) | `index.html:271` | → "…then reveal the desire lines to watch them emerge" | S | P1 | ✅ Done |
| A2 | Flow | "Open Surface Edition" wrong on desktop / unnamed on screen | `index.html:277`, `main.css:2348/813/817`, `ui.js:1814` | Describe real affordance: floating surface painter (mobile: tap pencil) | S | P1 | ✅ Done |
| A3 | Flow | Onboarding steps live in Intro tab but controls are in Model tab | `index.html:283–298` vs `:315–440` | Add "In the Model tab…" orienting clause to steps 1 & 3 | S | P1 | ✅ Done |
| A4 | Flow | Onboarding "Weight" ≠ UI "Pull strength" | `index.html:286` vs `:329` | → "Pull strength sets how strongly each one draws walkers" | S | P2 | ✅ Done |
| A5 | Flow | "both-ends points" not a word (onboarding) | `index.html:286` | → "Drop a start, an end, or both at once" | S | P2 | ✅ Done |
| A6 | Flow | Onboarding "export as GeoJSON" ≠ button "Export walk map" | `index.html:296` vs `:447` | → "Export GeoJSON" (resolves C4/V4) | S | P1 | ✅ Done |
| A7 | Flow | "paint a park … a wall" loose vs 4 real classes | `index.html:277` vs `constants.js:41–46` | → "paint a lawn … or a barrier" | S | P2 | ✅ Done |
| A8 | Flow | "Drop start, end, or both-ends" implies one point suffices | `index.html:286` | → "Drop a start and an end (or both at once)" | S | P2 | ✅ Done |
| V1 | Voice | Homepage `<title>` verb "read" weak | `index.html:8` | → "see where people naturally walk" | S | P1 | ✅ Done |
| V2 | Voice | "both-ends points" not a word | `index.html:286` | → "Drop a start, an end, or both at once" | S | P2 | ✅ Done |
| V3 | Voice | "Model" tab abstract for curious users | `index.html:255` | → "Simulate" (optional) | S | P3 | ✅ Done |
| V4 | Voice | GeoJSON keyword dropped from button | `index.html:447` | → "Export GeoJSON" (resolves C4) | S | P1 | ✅ Done |
| V5 | Voice | Signature hook only in `<meta>` | `index.html:10,272` | Echo one line in intro panel | S | P2 | ✅ Done |
| X1 | Consistency | Friction labels differ across 3 surfaces | `faq.html:320`, `index.html:572`, `surfaceEdition.js:42` | Canonical: Pavement / Lawn / soft / Dense planting / Barrier | S | P1 | ✅ Done |
| X2 | Consistency | "Walking resistance" vs "Friction Cost Model" | `index.html:565`, `faq.html:319` | One bridging phrase | S | P2 | ✅ Done |
| X3 | Consistency | UI↔docs param-name gap | `index.html:352–447`, `faq.html:115` | Cross-ref parenthetical + add technical term to tooltips | M | P1 | ✅ Done |
| E1 | SEO | No `<h1>` in homepage body | `index.html:244` | Add semantic `<h1>` (visually-hidden ok) | S | **P0** | ✅ Done |
| E2 | SEO | Sitemap `lastmod` stale (2025-01-15) | `sitemap.xml:5,11,17` | → 2026-07-05 (match pages) | S | P1 | ✅ Done |
| E3 | GEO | Enrich `ScholarlyArticle` | `research.html:57` | Add url/isPartOf/license/sameAs(DOI) | S | P2 | ✅ Done |
| E4 | AEO | No `speakable` on faq | `faq.html` | Add `WebPage`+`speakable` | S | P2 | ✅ Done |
| E5 | AEO | Homepage FAQPage thinner than faq | `index.html:104` vs `faq.html:57` | Expand or mark faq canonical | M | P2 | ✅ Done |
| E6 | SEO | No og:image / twitter:image / og:locale on docs | `research.html`, `faq.html` | Add shared og-image.png + twitter:image + og:locale | S | P2 | ✅ Done |
| E7 | SEO | Keyword enrichment | `faq.html:11` | Add GeoJSON export / walkability tool / pedestrian flow prediction | S | P3 | ✅ Done |

**Effort:** S = <½ day, M = 1–2 days. **Priority:** P0 = breaks trust/crawl, P1 = high leverage, P2 = polish, P3 = nice-to-have.

**Sequencing:** ship the P0 accuracy + SEO fixes first (C1–C4, E1) — they are all <½ day and stop the docs from lying about the app and give the homepage a real H1. Then the P1 terminology/consistency pass (C5–C8, V1, V4, X1, X3) so the three surfaces and the UI speak one language. Then the P2 GEO/AEO enrichment (E2–E6) and voice polish (V2, V5, X2).

---

## 6.1 Implementation log

**All P0–P2 items implemented except V3 (optional) and E5 (deferred).** Summary of applied changes, by file:

- **`index.html`** — V1 title (`Desire Paths — see where people naturally walk`); E1 visually-hidden `<h1>`; A1 intro ¶1 (no auto-emerge claim); A2/A7 surface painter copy ("paint a lawn … or a barrier", pencil on mobile); V5 signature hook echoed in intro panel; A3–A8 onboarding card (Simulate-tab orienting clauses, "Pull strength", "Drop a start and an end (or both at once)", "Export GeoJSON"); V4/A6 button relabelled **Export GeoJSON** (`id="btn-export-geojson"`); C6 in-app FAQ now lists **Crowd size** + **Grid resolution**; X1 legend labels canonicalised (Pavement / Lawn / soft / Dense planting / Barrier); X2 legend note bridging "Walking resistance" ↔ "Friction Cost Model"; X3 paper-term tooltips on parameter help-tips; V3 tab label "Model" → "Simulate"; E5 homepage `FAQPage` expanded with the four high-intent questions it lacked (Dijkstra gradient, adjustable parameters, limitations, historical origin) so it now matches `faq.html` coverage.
- **`public/docs/faq.html`** — C1/C2 parameter answer corrected to `Agents per Weight Unit (25–500)` + added `Grid resolution (0–15)` with app-label cross-ref; C3 `HowTo` step 3 → "Reveal desire lines"; C4 `HowTo` step 4 → "Export GeoJSON"; C5 `HowTo` → "Pull strength (1–10)"; X1 friction table labels canonicalised (Pavement / Lawn / soft / Dense planting / Barrier); E4 added `WebPage` + `speakable` spec; E6 added `og:image` / `twitter:image` / `og:locale="en_US"`; E7 keywords enriched (GeoJSON export, walkability analysis tool, pedestrian flow prediction, desire path mapping).
- **`public/docs/research.html`** — C7 model table `—` → `n/a` + added MDD/Accuracy clarifying caption; C8 removed `"sameAs": null`; C9 added "Beyond the paper" subsection (12 verified improvements); E3 `ScholarlyArticle` enriched with `url` / `sameAs` / `isPartOf` (CEUS Periodical + ISSN 0198-9715); E6 added `og:image` / `twitter:image` / `og:locale="en_US"`.
- **`public/docs/docs.css`** — added `.table-caption` style for the C7 caption.
- **`public/sitemap.xml`** — E2 all three `<lastmod>2025-01-15</lastmod>` → `2026-07-05` (matches page `article:modified_time`).
- **`src/style/main.css`** — added `.visually-hidden` (E1) and `.legend-note` (X2) utility classes.
- **`tests/integration.test.js`** — fixed stale `computeButton` mock (added `setAttribute` / `removeAttribute`) so the 34 failing `setupUI` → `syncSimulationUI` tests pass. This was a pre-existing regression from commit `cd17bbf8` ("new, improved, mobile ui"), **not** caused by the copy edits.

**Deferred / not applied:** none — all 32 items implemented.

**Out of scope / untouched (confirmed correct):** friction *values* (§0), `ScholarlyArticle`/`FAQPage`/`HowTo` existence, legend colours, `robots.txt`/canonical tags (§8).

**Known unrelated issue (not part of this review):** `src/workers/agent.worker.js:282` has a pre-existing eslint `no-undef` error (`'terminateAllWorkers' is not defined`). Not touched.

---

## 7. Proposed copy (drop-in)

**`index.html:8` (title)**
```
<title>Desire Paths — see where people naturally walk</title>
```

**`index.html:286` (onboarding step 1)**
```
Drop a start, an end, or both at once on the map. Pull strength sets how
strongly each one draws walkers.
```

**`index.html:447` (export button)**
```
<button class="btn btn-ghost" id="btn-export-geojson" type="button">Export GeoJSON</button>
```

**`index.html:271` (intro ¶1 — fix auto-emergence claim, A1)**
```
Drop a start and an end on the map, then reveal the desire lines to watch
them emerge — shaped by how walkable the ground is.
```

**`index.html:277` (intro ¶2 — fix "Open Surface Edition" + class names, A2/A7)**
```
Use the surface painter at the bottom of the map to draw areas that override
walkability — on phones, tap the pencil first. Paint a lawn to invite walkers
or a barrier to block them, and the paths bend around your edits.
<a href="https://en.wikipedia.org/wiki/Desire_path" target="_blank"
  rel="noopener noreferrer">Learn more</a>.
```

**`index.html:283–298` (onboarding card — A3/A4/A5/A6/A8)**
```
<div class="onboarding-step active" data-step="1">
  <span class="step-number">1</span>
  <span class="step-text">In the Model tab, pick start or end, then drop a
    start and an end (or both at once) on the map. Pull strength sets how
    strongly each one draws walkers.</span>
</div>
<div class="onboarding-step active" data-step="2">
  <span class="step-number">2</span>
  <span class="step-text">Use the surface painter (bottom of the map) to draw
    polygons, freehand, circles, or rectangles that reshape walkability.</span>
</div>
<div class="onboarding-step active" data-step="3">
  <span class="step-number">3</span>
  <span class="step-text">Back in the Model tab, tune the sliders, reveal the
    desire lines, then export as GeoJSON.</span>
</div>
```

**`faq.html:115` (parameter answer — corrected + complete)**
```
The simulator offers several adjustable parameters: Affordance Weight (1–8)
controls how strongly agents prefer worn or comfortable surfaces; Distance
Penalty (1–8) sets the trade-off between route length and surface quality;
Vision Depth (5–30) sets how far ahead each agent evaluates cells; Field of
View (30°–360°) defines the agent's viewing arc; Crowd size / Agents per
Weight Unit (25–500) scales sample size; Temperature (0–2) controls
randomness in route choice; Grid resolution (0–15) sets H3 cell detail; and
Emergent Wear toggles the positive-feedback loop on traversed cells.
(In the app these appear as Comfort preference, Shortcut preference,
Look-ahead, Viewing arc, Crowd size, Spontaneity, and Grid resolution.)
```

**`faq.html:201` (HowTo step 3)**
```
Click "Reveal desire lines". The app builds a friction (walking-resistance)
map from terrain data, classifies surfaces into walkable and impassable
zones, then runs hundreds of synthetic agents through the terrain.
```

**`faq.html:207` (HowTo step 4)**
```
View the flow network as a heat map on the hex grid. Toggle the
walking-resistance overlay, hover cells for details, and click "Export
GeoJSON" to download the results.
```

**`research.html` (table caption, after `:229`)**
```
MDD = mean extra distance walked versus the shortest possible route, in grid
cells ("fields"); lower is better. Accuracy = share of simulated steps within
a few cells of the observed real-world path. The two are independent: the
obstacle-avoidance model accepts a slightly longer detour (MDD 26.6) to match
actual behaviour most closely (~60%). "n/a" = not reported for baseline models.
```

**`research.html:79` (author)**
```
{ "@type": "Person", "name": "Tomasz Szandała",
  "affiliation": { "@type": "Organization",
    "name": "Wroclaw University of Science and Technology" } }
```
(remove `"sameAs": null`; add ORCID/SUPSI URL if available)

**`research.html` (new "Beyond the paper" subsection, after `:237`)**
```
<h2><i data-lucide="sparkles" aria-hidden="true"></i> Beyond the paper</h2>
<p>The simulator builds on the Bossowski et al. (2025) model with several
engineering improvements that the original study did not model:</p>
<ul class="contributions-list">
  <li><strong>H3 hexagonal grid</strong> — replaces the square field lattice,
  removing diagonal/Manhattan bias and giving uniform 6-neighbour adjacency
  with no corner-cutting through obstacles.</li>
  <li><strong>Agent waves</strong> — agents are released in staggered waves so
  emergent wear accumulates progressively and the flow network stabilises
  instead of being dominated by a single run's noise.</li>
  <li><strong>Gaussian blur on the friction field</strong> — softens hard
  surface boundaries so agents transition smoothly between terrain tiers.</li>
  <li><strong>Angular penalty</strong> — adds a turn-cost term so agents prefer
  straight, legible routes over jittery zig-zags.</li>
  <li><strong>Decay / update of wear</strong> — the positive-feedback loop is
  time-aware: older traversals decay and recent ones are weighted up, so the
  path system reflects current demand.</li>
  <li><strong>Stochasticity (Temperature)</strong> — route choice is sampled,
  not greedy, capturing the spread of plausible human paths.</li>
  <li><strong>Obstacle corner-cutting prevention</strong> — when a step would
  cut diagonally across a building corner, the agent detours around the
  obstacle instead of jumping it, so paths never clip impassable geometry.</li>
  <li><strong>Terrain-aware wear &amp; recovery</strong> — dense grass is harder
  to wear but persists; lawns wear easily but recover fast, so each surface
  has its own dynamic affordance.</li>
  <li><strong>Collective ABM wear</strong> — all agents share one footprint
  accumulator, so later agents are drawn to earlier trails; the desire-line
  network emerges from the crowd.</li>
  <li><strong>Real-world OSM data</strong> — the friction map is built from
  actual map geometry (buildings, water, parks), not a synthetic lattice.</li>
  <li><strong>Adjustable H3 resolution (0–15)</strong> — the same model scales
  from a single block to a whole district.</li>
  <li><strong>Walled-off detection</strong> — destinations enclosed by
  impassable terrain are reported rather than silently failing.</li>
  <li><strong>City-scale parallelism</strong> — the agent loop shards across
  workers sharing one atomic footprint, keeping ABM dynamics at city size.</li>
</ul>
```

**`faq.html:320` (friction table — canonical labels)**
```
Building / barrier — can't cross      ∞ (impassable)
Dense planting                        4.0
Lawn / soft                           2.5
Pavement / easy walking               1.0
```
(keep numbers; align wording with `surfaceEdition.js:42`)

---

## 9. Intro & onboarding alignment with the *live* UI flow (focus area)

The Intro tab is the first thing a user sees (it is the default active tab — `ui.js:1859` `activateTab('panel-intro')`). Its prose and the three-step onboarding card must describe the *actual* interaction sequence, not an idealised one. Several lines describe a flow the running app does not have. All findings below are code-verified against `index.html`, `main.css`, `ui.js`, `surfaceEdition.js`, and `constants.js`.

### 9.1 `index.html:271–275` — intro ¶1 implies paths appear automatically on drop
> *"Drop start and end points on the map and watch desire lines emerge, shaped by how walkable the ground is."*

There is **no auto-run**. Desire lines are computed only when the user clicks **Reveal desire lines** (`index.html:446`); dropping points alone does nothing visible. The onboarding step 3 gets this right ("reveal the desire lines"), but the lead paragraph overpromises an automatic reaction. A first-time user who drops two points and waits will see nothing and assume the tool is broken.
**Fix:** *"Drop a start and an end on the map, then reveal the desire lines to watch them emerge — shaped by how walkable the ground is."*

### 9.2 `index.html:277` — "Open Surface Edition" is wrong on desktop, underspecified on mobile
> *"Open **Surface Edition** to draw areas that override walkability…"*

- **Desktop (>599px):** the Surface Edition toolbar is `display:flex` by default (`main.css:2348` base rule) and is **always on screen** (floating, center-bottom). There is no "Open" action — nothing to open.
- **Mobile (≤599px):** it is `display:none` by default and is revealed only by the pencil **"edit"** button in the action bar (`ui.js:1814` toggles `body.se-toolbox-open`; `main.css:813`/`817`). So on mobile you *do* open it, but via a pencil icon the copy never names.
- **The name is invisible on screen.** The toolbar has no visible "Surface Edition" heading — it shows surface-class chips (Pavement / Lawn·soft / Dense planting / Barrier) and draw-tool icons. "Surface Edition" exists only as an `aria-label` (`surfaceEdition.js:97`) and in code comments. So the copy references a name the user cannot see and an "open" gesture that does not exist on desktop.

**Fix (describe the real affordance):** *"Use the surface painter at the bottom of the map to draw areas that override walkability — on phones, tap the pencil first. Paint a lawn to invite walkers or a barrier to block them, and the paths bend around your edits."*

### 9.3 `index.html:283–298` — onboarding steps reference controls that live in the *Model* tab
The onboarding card sits in the **Intro** tab, but:
- Step 1 ("Drop start, end, or both-ends points") depends on the **placement-mode buttons** (Start / End / Both) at `index.html:315–325`. The default mode is `origin` (`index.html:316` `is-active`), so a bare map click drops a *start* — but choosing start vs end vs both, and setting strength, requires the **Model** tab.
- Step 3 ("Tune the sliders…") depends on the **Walking behaviour** sliders at `index.html:350–440`, also in the Model tab.

The onboarding never tells the user to open the **Model** tab, so a desktop reader in the Intro tab has no idea where the placement modes and sliders are. (The mobile action bar does surface the mode buttons + Reveal, which is why this bites desktop users most.)
**Fix:** add one orienting clause to step 1, e.g. *"In the Model tab, pick start or end, then drop points on the map."* and to step 3 *"Back in the Model tab, tune the sliders, then Reveal desire lines."*

### 9.4 `index.html:286` — onboarding says "Weight"; UI says "Pull strength"
> *"Weight sets how strongly each pulls walkers."*

The slider is labelled **Pull strength (1–10)** (`index.html:329`, `:337`). "Weight" is the paper term (node weight). This is the same UI↔docs vocabulary gap as §2.1 / X3, surfacing inside the onboarding itself. Use the on-screen label and let the tooltip carry the paper term.
**Fix:** *"Pull strength sets how strongly each one draws walkers."*

### 9.5 `index.html:286` — "both-ends points" is not a word (onboarding instance of V2)
Already flagged as V2 for the title area; the same error is in the onboarding card.
**Fix:** *"Drop a start, an end, or both at once."*

### 9.6 `index.html:296` — onboarding says "export as GeoJSON"; button says "Export walk map"
> *"…then export as GeoJSON."*

The button is **Export walk map** (`index.html:447`). Same defect as C4 / V4, now inside the primary onboarding CTA. Align to **Export GeoJSON** (or "Export walk map · GeoJSON") so the last step names the real button.

### 9.7 `index.html:277` — "paint a park … or a wall" is loose vs the four real classes
The painter offers exactly four classes (`constants.js:41–46`): **Pavement, Lawn / soft, Dense planting, Barrier**. "park" and "wall" are not classes. Tighten to the real vocabulary (this also reinforces the canonical labels from §3 / X1).
**Fix:** *"…paint a lawn to invite walkers or a barrier to block them…"*

### 9.8 `index.html:286` — "Drop start, end, or both-ends points" implies one point is enough
A desire line needs **at least one origin AND one destination**. The "or" reads as "any one of these is fine," which would leave a user with a single start point and no result even after Reveal.
**Fix:** *"Drop a start and an end (or both at once) on the map."*

### 9.9 Summary of the flow mismatch
| Copy says | Actual UI flow | Where |
|---|---|---|
| "watch desire lines emerge" (on drop) | lines appear only after **Reveal desire lines** | `index.html:271` vs `:446` |
| "Open Surface Edition" | desktop: always-visible toolbar, no open; mobile: pencil toggle | `index.html:277`, `main.css:2348/813/817`, `ui.js:1814` |
| "Drop start, end, or both-ends" (in Intro tab) | placement modes + sliders are in the **Model** tab | `index.html:286` vs `:315–440` |
| "Weight sets…" | slider is **Pull strength** | `index.html:286` vs `:329` |
| "export as GeoJSON" | button is **Export walk map** | `index.html:296` vs `:447` |
| "paint a park … a wall" | classes are Pavement / Lawn·soft / Dense planting / Barrier | `index.html:277` vs `constants.js:41–46` |

---

## 8. Out of scope (do not touch)

- Friction *values* — verified correct against `constants.js:16`.
- The `ScholarlyArticle` / `FAQPage` / `HowTo` *existence* — correct and valuable; only enrich, never remove.
- Legend colours — confirmed to match the actual friction/flow ramps (`review15` §0); not a copy issue.
- `robots.txt` / canonical tags — correct.

(End of review)
