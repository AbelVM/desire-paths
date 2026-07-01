# Desire Paths — Agent-Based Pedestrian Flow Simulator

[![Live Demo](https://img.shields.io/badge/Live_Demo-Open-blue?style=flat-square)](https://abelvm.github.io/desire-paths/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-341_passing-brightgreen?style=flat-square)](#)

An interactive **agent-based simulation** that models how pedestrians naturally carve **desire paths** across terrain. Place origin and destination nodes on real-world maps, then watch friction fields form and emergent foot traffic patterns emerge from the interaction of agents navigating through walkable surfaces.

Based on the research by [Bossowski et al. (CEUS 2025)](docs/paper.pdf), this tool visualizes how **agent-based modeling** can predict pedestrian routing behavior for urban planning, landscape architecture, and GIS analysis.

## Live Demo

Try it now at **[abelvm.github.io/desire-paths](https://abelvm.github.io/desire-paths/)** — no installation required. Works in any modern browser with WebGL 2.0 support.

## How to Use

### 1. Choose a Location

The map loads centered on Madrid by default. Use the **search bar** at the top-right to find any city, park, or neighborhood worldwide. The app queries OpenStreetMap's Nominatim service for geocoding.

### 2. Place Nodes

Select a placement mode from the left panel:

- **Origin** — places starting points (red markers)
- **Destination** — places endpoints (green markers)  
- **Dual** — each placed node acts as both origin and destination (purple marker with glow)

Click on walkable ground to drop nodes. Use the **Node Weight slider** (1–10) before placing to control attraction strength — higher weight means more agents spawn from that point.

**Interact with placed nodes:**
- **Left-click** an existing node to increase its weight (+1)
- **Right-click** a node for a context menu: change type, adjust weight, or remove it
- **Drag and drop** any node to reposition it on the map

### 3. Simulate Flows

With at least one origin (or dual) node and one destination (or dual) node placed, click **"Simulate Flows"**. The app will:

1. Auto-build a friction map from the visible map tiles
2. Classify terrain surfaces into walkable vs. impassable zones
3. Run hundreds of synthetic agents through the terrain using gradient-based pathfinding with stochastic sampling
4. Agents leave wear trails that later agents prefer — creating emergent desire paths through positive feedback

A progress bar shows simulation status (mapping → simulating → complete). The **Peak Flow** readout reports total agents simulated and completion status.

### 4. Explore Results

After simulation completes:
- **Flow network** is rendered as a continuous heat map on the hex grid
- **Friction resistance map** can be toggled on/off via the legend button (−/+)
- Hover hexagons to inspect their properties
- Click **"Export GeoJSON"** to download the flow cells with `desireScore` values for use in GIS tools

### 5. Reset

Click **"Reset Grid"** to clear all nodes, flows, and cached state. Start a new simulation from scratch.

## Features

- **Interactive H3 hex grid** — click to place origin/destination/dual nodes on a MapLibre GL map overlaid on real-world terrain
- **Friction field visualization** — terrain surface costs rendered as a color-coded resistance heat map with collapsible legend
- **Agent-based simulation** — synthetic agents use Dijkstra gradients + softmax sampling, leaving wear trails that create emergent desire paths via positive feedback
- **Real-world geocoding** — search any location worldwide using OpenStreetMap Nominatim
- **Node interaction** — drag to reposition, right-click for type/weight controls, left-click to increase weight
- **GeoJSON export** — download flow networks for ArcGIS, QGIS, or other planning tools

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Map rendering | [MapLibre GL](https://maplibre.org/) + [Deck.gl](https://deck.gl/) (H3 hexagon layers) |
| Spatial indexing | [h3-js](https://uber.github.io/h3.js/) — hexagonal hierarchical geographic grid (resolution 15, ~0.88m spacing) |
| Geocoding | OpenStreetMap Nominatim via MapLibre GL Geocoder |
| Computation | Web Workers for parallel Dijkstra; custom min-heap; cooperative main-thread yielding (~45ms intervals) |
| Build tooling | Vite 8, ES modules, Terser minification |
| Testing | Vitest 4 with v8 coverage (341 tests) |

## Simulation Parameters

| Constant | Default | Description |
|----------|---------|-------------|
| `H3_STRIDE_RESOLUTION` | 15 | H3 resolution for simulation grid (~0.88m spacing) |
| `MAX_SIM_TICKS` | 5000 | Maximum steps per agent journey (distance-capped via `gridDistance × 8 + 32`) |
| `SIM_TICK_BUFFER` | 8 | Distance multiplier buffer above shortest path |
| `YIELD_EVERY_AGENTS` | 5 | Agents before yielding to main thread |
| `SIM_YIELD_MS` | 45 | Milliseconds before cooperative yield (below long-task threshold) |
| `AGENTS_PER_DESTINATION` | 25 | Base agents spawned per origin-destination pair (scaled by node weight) |
| `TEMPERATURE` | 0.5 | Controls randomness in agent decision-making (softmax sampling) |

## Friction Cost Model

| Surface Type | Cost | Legend Color | Real-World Equivalent |
|-------------|------|--------------|-----------------------|
| Hard structure (buildings, water, railways) | ∞ | Red | Surfaces pedestrians cannot cross |
| Dense vegetation (forest, scrub, brush) | 4.0 | Dark green | Thick tree cover, dense undergrowth |
| Permeable greenspace (grass, meadow, park) | 2.5 | Light green | Open grassy areas, gardens |
| Walkable baseline (paths, roads, sidewalks) | 1.0 | Blue tint | Paved surfaces, footways |

## Affordance Model

Agents are guided by a terrain **affordance** system that evolves during simulation:

- Paved surfaces start with highest affordance (agents prefer them naturally)
- Grass and vegetation start lower but accumulate wear over time
- Heavy grass resists path formation more than light grass (1.5× vs 0.8× resistance factor)
- Decay rate is terrain-aware — light grass recovers faster, heavy grass retains paths longer

## Use Cases

- **Urban planning** — predict where pedestrians will create new paths before they exist
- **Landscape architecture** — design park layouts that align with natural desire path formation
- **Accessibility analysis** — identify walkable vs. impassable zones around facilities
- **GIS research** — export simulation results for spatial analysis in QGIS or ArcGIS
- **Education** — visualize agent-based modeling concepts and emergent behavior

## Academic Reference

This simulator implements the model described in:

> Bossowski, et al. "Predicting Desire Paths: Agent-Based Simulation for Neighbourhood Route Planning." *Computer Environment and Urban Systems (CEUS)*, 2025.

Full paper available at [`docs/paper.md`](docs/paper.pdf).

## Getting Started

```bash
npm install
npm run dev        # Start development server (http://localhost:5173)
npm run build      # Production build to dist/
npm test           # Run 341 tests
npm run coverage   # Coverage report
npm run lint       # ESLint check
npm run format     # Prettier formatting
npm run deploy     # Deploy dist folder to GH-pages
```

## Architecture

```
index.html
├── src/main.js          — DesireMap wrapper, map event handlers, node placement
├── src/helpers/
│   ├── constants.js     — Friction costs, simulation parameters, surface classification
│   ├── grid.js          — H3 disk/distance/bearing helpers; cell state management
│   ├── compute.js       — Dijkstra gradients, agent stepping loop, affordance wear
│   ├── map.js           — AOI polygon builder, Deck.gl layer rendering, GeoJSON export
│   ├── spatialTasks.js  — Surface classification, multi-layer friction, fast scan workers
│   └── ui.js            — Panel controls, context menu, drag & drop, progress bar
├── src/workers/         — Web Workers for parallel gradient computation
└── tests/               — Vitest test suite (341 tests)
```

## License

MIT © Abel Vázquez Montoro
