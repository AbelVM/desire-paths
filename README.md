# Desire Paths

A cartographic flow lab that simulates how pedestrians naturally carve paths across terrain, based on the agent-based model described by Bossowski et al. (CEUS 2025).

Place origin and destination nodes on a walkable map, then watch friction fields form and desire paths emerge from simulated foot traffic.

## Features

- **Interactive H3 hex grid** — click to place origin/destination nodes on a MapLibre GL map
- **Friction field visualization** — terrain surface costs (buildings, vegetation, greenspace, walkable ground) rendered as a resistance heat map
- **Agent-based simulation** — synthetic agents step through the terrain using Dijkstra gradients, leaving wear trails that later agents prefer (positive feedback loop)
- **Cooperative scheduling** — simulation yields to the main thread every 5 agents or ~45ms to keep the UI responsive
- **GeoJSON export** — download flow networks for use in external planning tools

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Map rendering | [MapLibre GL](https://maplibre.org/) + [Deck.gl](https://deck.gl/) (H3 hexagon layers) |
| Spatial indexing | [h3-js](https://uber.github.io/h3.js/) — hexagonal hierarchical geographic grid |
| Computation | Web Workers with fallback to main thread; custom min-heap Dijkstra |
| Build | Vite 8, ES modules |
| Testing | Vitest 4 with v8 coverage |

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

## How It Works

### 1. Place Nodes

Switch between **Origin**, **Destination**, or **Dual** placement mode. Click on the map to drop nodes. Left-click increments weight (up to 10); right-click decrements it. A node is removed when its weight reaches zero.

The area of interest (AOI) forms a circular projection around all placed nodes — wider than a bounding box but tighter than a diagonal rectangle.

### 2. Build Mapping

"Build Mapping" scans the visible map tiles, classifies surface types from vector tile layers (`transportation`, `building`, `water`, `landcover`, `landuse`), and constructs:

- **Friction map** — each H3 hex gets a traversal cost (impassable for buildings/water, 4.0 for dense vegetation, 2.5 for permeable greenspace, 1.0 baseline)
- **Affordance map** — initial terrain affordance that guides agent heading

### 3. Simulate Flows

"Simulate Flows" runs the ABM loop:

1. Dijkstra gradients are computed per destination (parallelized across Web Workers)
2. Each origin spawns weighted agents toward each reachable destination
3. Agents step one hex at a time, choosing neighbors by gradient descent + stochastic softmax sampling with heading bias (`w_theta`)
4. Traversed cells accumulate wear → later agents prefer worn paths
5. Path desire scores are batch-applied and rendered

The simulation caps steps per journey using `estimateMaxTicks()` (distance-based) and yields cooperatively via `scheduler.yield()`.

### 4. Export

"Export GeoJSON" writes the flow network as a FeatureCollection of hexagon polygons with `desireScore` properties, suitable for import into GIS or planning tools.

## Architecture

```
index.html
├── src/main.js          — DesireMap wrapper, map event handlers, node placement
├── src/helpers/
│   ├── constants.js     — Friction costs, simulation parameters (MAX_SIM_TICKS, YIELD_EVERY_AGENTS)
│   ├── grid.js          — H3 disk/distance/bearing helpers; cell state management
│   ├── compute.js       — Dijkstra gradients, agent stepping loop, affordance wear
│   ├── map.js           — AOI polygon builder, Deck.gl layer rendering, GeoJSON export
│   ├── spatialTasks.js  — Surface classification, multi-layer friction, fast scan workers
│   └── ui.js            — Panel controls, placement mode toggles, progress bar
├── src/workers/         — Web Workers for parallel gradient computation
└── tests/               — Vitest test suite (341 tests)
```

## Simulation Parameters

| Constant | Default | Description |
|----------|---------|-------------|
| `H3_STRIDE_RESOLUTION` | 15 | H3 resolution for simulation grid |
| `MAX_SIM_TICKS` | 5000 | Maximum steps per agent journey (capped by distance) |
| `SIM_TICK_BUFFER` | 8 | Distance multiplier buffer above shortest path |
| `YIELD_EVERY_AGENTS` | 5 | Agents before yielding to main thread |
| `SIM_YIELD_MS` | 45 | Milliseconds before cooperative yield |
| `SIM_AGENT_STEP_RING` | 1 | Restrict movement to immediate H3 neighbors (no corner-cutting) |

## Friction Costs

| Surface Type | Cost | Legend Color |
|-------------|------|-------------|
| Impassable (buildings, water) | ∞ | Red |
| Dense vegetation | 4.0 | Green |
| Permeable greenspace | 2.5 | Light green |
| Walkable baseline | 1.0 | Blue tint |

## License

MIT
