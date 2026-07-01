# Desire Paths — Agent-Based Pedestrian Flow Simulator

[![Live Demo](https://img.shields.io/badge/Live_Demo-Open-blue?style=flat-square)](https://abelvm.github.io/desire-paths/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-341_passing-brightgreen?style=flat-square)](#)

An interactive **agent-based simulation** that models how pedestrians naturally carve **desire paths** across terrain. Place origin and destination nodes on real-world maps, then watch friction fields form and emergent foot traffic patterns emerge from the interaction of agents navigating through walkable surfaces.

Based on the research by [Bossowski et al. (CEUS 2025)](docs/paper.md), this tool visualizes how **agent-based modeling** can predict pedestrian routing behavior for urban planning, landscape architecture, and GIS analysis.

## Live Demo

Try it now at **[abelvm.github.io/desire-paths](https://abelvm.github.io/desire-paths/)** — no installation required. Works in any modern browser with WebGL 2.0 support.

## Features

- **Interactive H3 hex grid** — click to place origin and destination nodes on a MapLibre GL map overlaid on real-world terrain
- **Friction field visualization** — terrain surface costs (buildings, vegetation, greenspace, walkable ground) rendered as a resistance heat map with distinct color coding
- **Agent-based simulation** — synthetic agents step through the terrain using Dijkstra gradients, leaving wear trails that later agents prefer via positive feedback loops
- **Real-world mapping** — geocoder search to find any location; surface classification from OpenFreeMap vector tiles (transportation, landcover, landuse layers)
- **GeoJSON export** — download flow networks for use in ArcGIS, QGIS, or other planning tools

## How It Works

### 1. Place Nodes

Switch between **Origin**, **Destination**, or **Dual** placement mode. Click on the map to drop nodes representing starting points and destinations for pedestrian traffic. Adjust node weight (attraction strength) with left/right-click.

The area of interest (AOI) forms a circular projection around all placed nodes — wider than a bounding box but tighter than a diagonal rectangle, optimizing simulation scope.

### 2. Build Mapping

"Build Mapping" scans the visible map tiles and classifies surface types from vector tile layers:

- **Friction map** — each H3 hex gets a traversal cost (impassable for buildings/water at ∞, 4.0 for dense vegetation, 2.5 for permeable greenspace, 1.0 baseline for walkable surfaces)
- **Affordance map** — initial terrain affordance that guides agent heading based on surface type

### 3. Simulate Flows

"Simulate Flows" runs the ABM (Agent-Based Model) loop:

1. Dijkstra gradients computed per destination (parallelized across Web Workers)
2. Each origin spawns weighted agents toward each reachable destination
3. Agents step one hex at a time, choosing neighbors by gradient descent + stochastic softmax sampling with heading bias
4. Traversed cells accumulate wear → later agents prefer worn paths (**positive feedback loop**)
5. Path desire scores batch-applied and rendered as continuous flow visualization

The simulation uses cooperative scheduling — yielding to the main thread every ~45ms to keep the UI responsive during computation.

### 4. Export

"Export GeoJSON" writes the flow network as a FeatureCollection of H3 hexagon polygons with `desireScore` properties, suitable for import into GIS or urban planning tools.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Map rendering | [MapLibre GL](https://maplibre.org/) + [Deck.gl](https://deck.gl/) (H3 hexagon layers) |
| Spatial indexing | [h3-js](https://uber.github.io/h3.js/) — hexagonal hierarchical geographic grid (resolution 15, ~0.88m spacing) |
| Computation | Web Workers with fallback to main thread; custom min-heap Dijkstra implementation |
| Build tooling | Vite 8, ES modules, Terser minification |
| Testing | Vitest 4 with v8 coverage (341 tests) |

## Simulation Parameters

| Constant | Default | Description |
|----------|---------|-------------|
| `H3_STRIDE_RESOLUTION` | 15 | H3 resolution for simulation grid (~0.88m spacing) |
| `MAX_SIM_TICKS` | 5000 | Maximum steps per agent journey (distance-capped) |
| `SIM_TICK_BUFFER` | 8 | Distance multiplier buffer above shortest path |
| `YIELD_EVERY_AGENTS` | 5 | Agents before yielding to main thread |
| `SIM_YIELD_MS` | 45 | Milliseconds before cooperative yield (below long-task threshold) |
| `AGENTS_PER_DESTINATION` | 25 | Agents spawned per origin-destination pair |
| `TEMPERATURE` | 0.5 | Controls randomness in agent decision-making |

## Friction Cost Model

| Surface Type | Cost | Real-World Equivalent |
|-------------|------|-----------------------|
| Impassable (buildings, water, railways) | ∞ | Structures pedestrians cannot cross |
| Dense vegetation / forest / scrub | 4.0 | Thick brush, dense tree cover |
| Permeable greenspace / meadow / park | 2.5 | Grass, gardens, recreational areas |
| Walkable baseline (paths, roads) | 1.0 | Paved surfaces, footways |

## Use Cases

- **Urban planning** — predict where pedestrians will create new paths before they exist
- **Landscape architecture** — design park layouts that align with natural desire path formation
- **Accessibility analysis** — identify walkable vs. impassable zones around facilities
- **GIS research** — export simulation results for spatial analysis in QGIS or ArcGIS
- **Education** — visualize agent-based modeling concepts and emergent behavior

## Academic Reference

This simulator implements the model described in:

> Bossowski, et al. "Predicting Desire Paths: Agent-Based Simulation for Neighbourhood Route Planning." *Computer Environment and Urban Systems (CEUS)*, 2025.

Full paper available at [`docs/paper.md`](docs/paper.md).

## Getting Started

```bash
npm install
npm run dev        # Start development server (http://localhost:5173)
npm run build      # Production build to dist/
npm test           # Run 341 tests
npm run coverage   # Coverage report
npm run lint       # ESLint check
npm run format     # Prettier formatting
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
│   └── ui.js            — Panel controls, placement mode toggles, progress bar
├── src/workers/         — Web Workers for parallel gradient computation
└── tests/               — Vitest test suite (341 tests)
```

## License

MIT © Abel Vargas
