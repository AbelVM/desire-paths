export const MAP_OPTIONS = {
  container: 'map',
  style: './bright_custom.json',//'https://tiles.openfreemap.org/styles/bright',
  center: [-3.7035, 40.4169],
  zoom: 17,
  maxZoom: 24,
  // Compact attribution keeps the OSM/MapLibre credit visible in a corner that
  // the legend no longer occupies (legend was moved to bottom-left in review15).
  attributionControl: { compact: true },
};

export const BUFFER_PX = 128; // Buffer in pixels around AOI

export const H3_STRIDE_RESOLUTION = 15; // H3 spatial scaling (~0.88m spacing matches fine-grained urban architecture

export const FRICTION_COSTS = {
  PAVEMENT: 1.0,
  // Increased friction gap to make open-terrain choices more consequential
  LIGHT_PARK: 2.5,
  HEAVY_GRASS: 4.0,
  IMPASSABLE: 999999,
};

export const AFFORDANCE = {
  PAVEMENT: 1.0,
  // Slightly lower starting affordance for open surfaces; wear can still increase these over time
  LIGHT_PARK: 0.6,
  HEAVY_GRASS: 0.3,
  IMPASSABLE: 0.0,
};

/**
 * Surface Edition classes — the 4 terrain types a user can paint onto the map.
 *
 * `friction` is sourced from FRICTION_COSTS (single source of truth). The
 * `fill`/`stroke` hex colors mirror the walking-resistance legend in map.js
 * (`baseLayerProps.getFillColor`): pavement #0096ff, lawn #a6d854, dense
 * planting #27ae60, barrier #e74c3c. `stroke` is a significantly darker hue of
 * `fill` so the polygon border reads as a bold outline against the base map.
 */
export const SURFACE_CLASSES = [
  { key: 'PAVEMENT', label: 'Pavement', fill: '#0096ff', stroke: '#006bb3', friction: FRICTION_COSTS.PAVEMENT },
  { key: 'LIGHT_PARK', label: 'Lawn / soft', fill: '#a6d854', stroke: '#6f9a2f', friction: FRICTION_COSTS.LIGHT_PARK },
  { key: 'HEAVY_GRASS', label: 'Dense planting', fill: '#27ae60', stroke: '#1b7a43', friction: FRICTION_COSTS.HEAVY_GRASS },
  { key: 'IMPASSABLE', label: 'Barrier', fill: '#e74c3c', stroke: '#a93226', friction: FRICTION_COSTS.IMPASSABLE },
];

export const SURFACE_CLASS_BY_KEY = Object.fromEntries(SURFACE_CLASSES.map((c) => [c.key, c]));

/**
 * Single canonical friction → terrain-tier classifier.
 *
 * Returns one of 'impassable' | 'pavement' | 'light_park' | 'heavy_grass'.
 * Thresholds are derived from FRICTION_COSTS so there is exactly one source of
 * truth; callers must use this instead of hardcoding cutoffs.
 */
export function classifyFrictionTier(friction) {
  if (friction >= FRICTION_COSTS.IMPASSABLE) return 'impassable';
  const p = FRICTION_COSTS.PAVEMENT;
  const l = FRICTION_COSTS.LIGHT_PARK;
  const h = FRICTION_COSTS.HEAVY_GRASS;
  if (friction < (p + l) / 2) return 'pavement';
  if (friction < (l + h) / 2) return 'light_park';
  return 'heavy_grass';
}

/** Map a friction value to its starting affordance (tier → AFFORDANCE). */
export function affordanceForFriction(friction) {
  return AFFORDANCE[classifyFrictionTier(friction).toUpperCase()];
}

// TUNED WEIGHTS: Designed for Emergent Path Formation
export const WEIGHTS = {
  // Set to the paper-recommended weighted preference ratio (wa:wd = 1:4)
  w_a: 1.0, // Affordance weight
  w_d: 4.0, // Distance penalty weight (favours shorter detours)
  w_theta: 0.6, // Angular penalty: discourages large steering deviations
};
// Calibration hints for tuning emergent paths (weights are WEIGHTS.w_a /
// w_d / w_theta — there is no w_f):
// Too many worn trails (park turns into a "web"): raise w_d (distance penalty,
//   e.g. 5.0) or lower w_a (affordance weight, e.g. 0.8) so agents favour fewer,
//   shorter routes.
// Too few paths (agents stick to pavement): raise w_a (e.g. 2.0) or lower w_d
//   (e.g. 3.0) so worn trails attract more agents.
// Paths look "jagged"/"zig-zagged": raise w_theta (angular penalty) or lower w_d
//   so agents steer more smoothly.

export const VISUAL_DEPTH = 15; // How far ahead agents can "see" to evaluate paths (in H3 cells)

export const VISUAL_ANGLE = 120; // The field of view for agents when evaluating next steps (in degrees)

export const AGENTS_PER_DESTINATION = 100; // Number of agents that will be spawned for each origin-destination pair

export const DECAY_RATE = 0.001; // How quickly the affordance of a cell decays over time (5% per tick)

export const UPDATE_RATE = 0.005; // Minimum affordance value to prevent paths from becoming completely unattractive

export const SOFT_CAP = 0.85; // A soft cap on affordance to prevent it from reaching 1.0, which can lead to unrealistic "superhighways" in the simulation. This allows for some variability and prevents the model from becoming too deterministic.

export const MAX_EXPECTED_VOLUME = 100; // A scaling factor for how much "wear" a cell can take before it's fully worn (tuned based on testing)

export const TEMPERATURE = 0.5; // Controls randomness in agent decision-making: 0 = completely deterministic, higher values increase randomness (tuned based on testing)

export const SIMULATION_PARAM_LIMITS = Object.freeze({
  affordanceWeight: { min: 1, max: 8, step: 1 },
  distancePenalty: { min: 1, max: 8, step: 1 },
  visionDepth: { min: 5, max: 30, step: 5 },
  fieldOfView: { min: 30, max: 360, step: 30 },
  agentsPerWeightUnit: { min: 25, max: 500, step: 5 },
  temperature: { min: 0, max: 2, step: 0.25 },
  h3StrideResolution: { min: 0, max: 15, step: 1 },
});

export const DEFAULT_SIMULATION_PARAMS = Object.freeze({
  affordanceWeight: WEIGHTS.w_a,
  distancePenalty: WEIGHTS.w_d,
  visionDepth: VISUAL_DEPTH,
  fieldOfView: VISUAL_ANGLE,
  agentsPerWeightUnit: AGENTS_PER_DESTINATION,
  temperature: TEMPERATURE,
  h3StrideResolution: H3_STRIDE_RESOLUTION,
  emergentWear: true,
  // S1: enumerate agent candidates from the precomputed visibility CSR
  // (typed-array reads) instead of gridDisk + isVisible binary-search
  // + bearing trig. Byte-identical to the string kernel at temperature=0
  // and distribution-identical (statistically equivalent emergent output)
  // at temperature>0, so it is safe to run at all temperatures. Falls back
  // to the string kernel automatically when the visibility CSR is absent.
  useIndexedKernel: true,
});

export const SIMULATION_PARAMS = {
  ...DEFAULT_SIMULATION_PARAMS,
};

function roundToStep(value, step) {
  const base = Math.round(value / step) * step;
  return Number(step >= 1 ? String(base) : base.toFixed(2));
}

function clampParam(name, value) {
  const limit = SIMULATION_PARAM_LIMITS[name];
  if (!limit) return value;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return SIMULATION_PARAMS[name];
  const stepped = roundToStep(numeric, limit.step);
  return Math.min(limit.max, Math.max(limit.min, stepped));
}

export function updateSimulationParams(next = {}) {
  if (!next || typeof next !== 'object') return SIMULATION_PARAMS;

  if (Object.prototype.hasOwnProperty.call(next, 'affordanceWeight')) {
    SIMULATION_PARAMS.affordanceWeight = clampParam('affordanceWeight', next.affordanceWeight);
  }
  if (Object.prototype.hasOwnProperty.call(next, 'distancePenalty')) {
    SIMULATION_PARAMS.distancePenalty = clampParam('distancePenalty', next.distancePenalty);
  }
  if (Object.prototype.hasOwnProperty.call(next, 'visionDepth')) {
    SIMULATION_PARAMS.visionDepth = clampParam('visionDepth', next.visionDepth);
  }
  if (Object.prototype.hasOwnProperty.call(next, 'fieldOfView')) {
    SIMULATION_PARAMS.fieldOfView = clampParam('fieldOfView', next.fieldOfView);
  }
  if (Object.prototype.hasOwnProperty.call(next, 'agentsPerWeightUnit')) {
    SIMULATION_PARAMS.agentsPerWeightUnit = clampParam(
      'agentsPerWeightUnit',
      next.agentsPerWeightUnit
    );
  }
  if (Object.prototype.hasOwnProperty.call(next, 'temperature')) {
    SIMULATION_PARAMS.temperature = clampParam('temperature', next.temperature);
  }
  if (Object.prototype.hasOwnProperty.call(next, 'emergentWear')) {
    SIMULATION_PARAMS.emergentWear = Boolean(next.emergentWear);
  }
  if (Object.prototype.hasOwnProperty.call(next, 'h3StrideResolution')) {
    SIMULATION_PARAMS.h3StrideResolution = clampParam(
      'h3StrideResolution',
      next.h3StrideResolution
    );
  }

  return SIMULATION_PARAMS;
}

// Simulation tick budget: cap steps per agent journey to keep UI responsive
export const MAX_SIM_TICKS = 5000;
export const SIM_TICK_BUFFER = 8; // multiplier on H3 grid distance between origin and destination

// IMPASSABLE blur configuration
// Radius (in H3 rings) to blur impassable influence. 2 rings reaches the
// walkable cells immediately outside a barrier (d=1) and one ring beyond
// (d=2). At H3 res-15 (~0.58 m/edge, ~1.01 m center-to-center) this maps to
// the pedestrian "personal space" bands used for the blur halo:
//   d=1  (0–0.58 m from wall) -> HEAVY_GRASS ("hard park")
//   d=2  (0.58–1.16 m)        -> LIGHT_PARK ("light park")
//   d=3+ (>1.2 m)             -> PAVEMENT   (no penalty; never reached)
// SIGMA=1.5 makes the d=2 weight ~0.41 (vs d=1 ~0.80), so the outer ring lands
// in LIGHT_PARK while the inner ring crosses into HEAVY_GRASS — matching the
// desired falloff. SIGMA=1.0 instead left d=2 at ~0.14 (still PAVEMENT),
// missing the "light park" band entirely.
export const IMPASSABLE_BLUR_RADIUS = 2;
// Standard deviation for gaussian falloff (in rings)
export const IMPASSABLE_BLUR_SIGMA = 1.5;
// Maximum friction amount to add (scaled by gaussian weight)
export const IMPASSABLE_BLUR_FRICTION_ADD = 3.0;
// Maximum affordance penalty (absolute amount) applied proportionally to gaussian weight
export const IMPASSABLE_BLUR_AFFORDANCE_PENALTY = 0.4;

/**
 * Parse the vertical layer value safely.
 * Returns '0' for NaN or missing values.
 */
function parseLayerValue(layer) {
  const parsed = parseInt(layer ?? '0', 10);
  return Number.isFinite(parsed) ? String(parsed) : '0';
}

/**
 * Resolve vertical layer adjustments for bridges and tunnels.
 */
function resolveVerticalLayer(rawLayer, brunnel) {
  let layer = parseLayerValue(rawLayer);
  if (layer === '0') {
    if (brunnel === 'bridge') layer = '1';
    if (brunnel === 'tunnel') layer = '-1';
  }
  return layer;
}

/**
 * Check if a surface is blocked by indoor/interior status.
 */
function isIndoorIndoors(properties) {
  const { indoor } = properties;
  return indoor === 1 || indoor === 'true' || indoor === true;
}

/**
 * Check if a surface is not accessible by foot.
 */
function isFootRestricted(properties) {
  const { foot, access } = properties;
  return foot === 'no' || foot === 'private' || access === 'no' || access === 'private';
}

/**
 * Classify transportation path subclass to friction cost.
 */
function classifyPathSubclass(subclass) {
  const easyPaths = ['pedestrian', 'footway', 'corridor', 'platform', 'path'];
  if (easyPaths.includes(subclass)) return 'PAVEMENT';
  if (subclass === 'bridleway' || subclass === 'cycleway') return 'LIGHT_PARK';
  if (subclass === 'steps') return 'HEAVY_GRASS';
  return 'PAVEMENT';
}

/**
 * Classify road hierarchy to friction cost.
 */
function classifyRoadHierarchy(cls) {
  const highSpeed = ['motorway', 'trunk', 'primary', 'raceway', 'busway', 'bus_guideway'];
  const mediumSpeed = ['secondary', 'tertiary'];
  const lowSpeed = ['minor', 'service'];
  if (highSpeed.includes(cls)) return 'IMPASSABLE';
  if (mediumSpeed.includes(cls)) return 'PAVEMENT';
  if (lowSpeed.includes(cls)) return 'PAVEMENT';
  return null;
}

/**
 * Classify landcover subclass to friction cost.
 */
function classifyLandcover(cls, subclass) {
  const impassableSub = [
    'glacier',
    'bare_rock',
    'scree',
    'swamp',
    'bog',
    'marsh',
    'mangrove',
    'reedbed',
    'saltmarsh',
    'tidalflat',
    'tundra',
  ];
  if (['ice', 'rock', 'wetland'].includes(cls) || impassableSub.includes(subclass)) {
    return 'IMPASSABLE';
  }
  const heavySub = [
    'forest',
    'wood',
    'scrub',
    'shrubbery',
    'heath',
    'sand',
    'beach',
    'dune',
    'fell',
  ];
  if (heavySub.includes(subclass)) return 'HEAVY_GRASS';
  const lightSub = [
    'grass',
    'grassland',
    'meadow',
    'park',
    'garden',
    'golf_course',
    'village_green',
    'recreation_ground',
    'flowerbed',
    'wet_meadow',
  ];
  if (lightSub.includes(subclass)) return 'LIGHT_PARK';
  const managedSub = ['farm', 'farmland', 'allotments', 'orchard', 'vineyard', 'plant_nursery'];
  if (managedSub.includes(subclass)) return 'HEAVY_GRASS';
  return null;
}

/**
 * Classify landuse to friction cost.
 */
function classifyLanduse(cls) {
  const restricted = ['military', 'industrial', 'quarry', 'dam', 'railway'];
  if (restricted.includes(cls)) return 'IMPASSABLE';
  const urban = [
    'residential',
    'commercial',
    'retail',
    'school',
    'university',
    'kindergarten',
    'college',
    'library',
    'hospital',
    'bus_station',
  ];
  if (urban.includes(cls)) return 'PAVEMENT';
  const recreational = ['stadium', 'pitch', 'playground', 'track', 'theme_park', 'zoo', 'cemetery'];
  if (recreational.includes(cls)) return 'LIGHT_PARK';
  const urbanFabric = ['suburb', 'quarter', 'neighbourhood', 'garages'];
  if (urbanFabric.includes(cls)) return 'PAVEMENT';
  return null;
}

/**
 * Check if a transportation class is a railway.
 */
function isRailway(cls, subclass) {
  const rails = [
    'rail',
    'narrow_gauge',
    'preserved',
    'funicular',
    'subway',
    'light_rail',
    'monorail',
    'tram',
  ];
  return cls === 'railway' || rails.includes(subclass);
}

// Lazy-populated friction classification cache (on-demand fills)
const _surfaceCache = new Map();
// City-scale AOIs surface thousands of features but only a few hundred distinct
// property tuples, so a 256 cap thrashed (evicting useful entries mid-scan and
// re-classifying the same tuples repeatedly). 2048 covers the realistic tuple
// space with negligible memory cost (each entry is a tiny {cost, layer} object).
const MAX_SURFACE_CACHE = 2048;

/**
 * Build a normalized cache key from feature properties.
 */
function _makeSurfaceKey(layerId, cls, subclass, brunnel, foot, access, indoor) {
  return `${layerId}|${cls ?? ''}|${subclass ?? ''}|${brunnel ?? ''}|${foot ?? ''}|${access ?? ''}|${indoor ?? ''}`;
}

/**
 * Classify a feature's surface cost using on-demand logic with lazy cache fills.
 */
function _classifySurface(feature) {
  const layerId = feature.sourceLayer || '';
  const props = feature.properties;
  const { layer, class: clsRaw, subclass, brunnel } = props;
  const cls = clsRaw == null ? '' : String(clsRaw);
  const sub = subclass == null ? '' : String(subclass);

  // Global filter: indoor/interior → impassable
  if (isIndoorIndoors(props)) {
    return { cost: 'IMPASSABLE', layer: parseLayerValue(layer) };
  }

  // Transportation layer
  if (layerId === 'transportation') {
    const vLayer = resolveVerticalLayer(layer, brunnel);

    if (isFootRestricted(props)) return { cost: 'IMPASSABLE', layer: vLayer };
    if (cls.includes('_construction')) return { cost: 'IMPASSABLE', layer: vLayer };

    if (cls === 'path') return { cost: classifyPathSubclass(sub), layer: vLayer };
    if (brunnel === 'ford') return { cost: 'HEAVY_GRASS', layer: vLayer };

    const roadResult = classifyRoadHierarchy(cls);
    if (roadResult !== null) return { cost: roadResult, layer: vLayer };
    if (cls === 'track') return { cost: 'LIGHT_PARK', layer: vLayer };
    if (isRailway(cls, sub)) return { cost: 'IMPASSABLE', layer: vLayer };

    return { cost: 'PAVEMENT', layer: vLayer };
  }

  // Landcover
  if (layerId === 'landcover') {
    const result = classifyLandcover(cls, sub);
    if (result) return { cost: result, layer: parseLayerValue(layer) };
  }

  // Landuse
  if (layerId === 'landuse') {
    const result = classifyLanduse(cls);
    if (result) return { cost: result, layer: parseLayerValue(layer) };
  }

  // Building / water → impassable
  if (layerId === 'building' || layerId === 'water') {
    return { cost: 'IMPASSABLE', layer: parseLayerValue(layer) };
  }

  // Default
  return { cost: 'PAVEMENT', layer: parseLayerValue(layer) };
}

/**
 * Fast friction classification using lazy-populated cache.
 * First hit computes and caches; subsequent hits are O(1).
 */
export function getSurface(feature) {
  const layerId = feature.sourceLayer || '';
  const props = feature.properties;
  const cls = props.class == null ? '' : String(props.class);
  const sub = props.subclass == null ? '' : String(props.subclass);

  const key = _makeSurfaceKey(
    layerId,
    cls,
    sub,
    props.brunnel ?? '',
    props.foot ?? '',
    props.access ?? '',
    props.indoor ?? ''
  );

  let entry = _surfaceCache.get(key);
  if (entry) return entry;

  // On-demand classification + cache fill
  const result = _classifySurface(feature);
  if (!_resultHasCost(result)) {
    _surfaceCache.set(key, null);
    return null;
  }
  if (_surfaceCache.size >= MAX_SURFACE_CACHE) {
    // Evict oldest entry (Map iteration order = insertion order)
    const firstKey = _surfaceCache.keys().next().value;
    _surfaceCache.delete(firstKey);
  }
  _surfaceCache.set(key, result);
  return result;
}

function _resultHasCost(r) {
  return r && typeof r.cost === 'string';
}

// Cache size limit for cell lat/lng cache (used in visibility checks)
export const CELL_LATLNG_CACHE_MAX = 1024;

// Local cache bounds for compute-heavy H3 calls (tuned from instrumentation)
export const COMPUTE_PATH_CACHE_MAX = 256;
export const COMPUTE_DISK_CACHE_MAX = 256;
export const COMPUTE_VISIBILITY_CACHE_MAX = 2048;
// Cap on the lazy neighbor-disk cache. At city scale (≈5e5 cells) an uncapped
// cache would hold one ~720-cell array per distinct visited cell — multiple GB.
// LRU eviction keeps memory bounded; recomputation on miss is cheap and rare
// once the working set of frequently-visited cells fits within the cap.
export const NEIGHBOR_DISK_CACHE_MAX = 4096;
export const GRADIENT_CACHE_MAX_ENTRIES = 16;

// Cache size limit for path and polygon caches (used in compute-heavy operations)
export const PATH_CACHE_MAX = 2000;
export const POLY_CACHE_MAX = 2000;

// Cache size limit for poly cells cache (used in spatial operations)
export const POLY_CELLS_CACHE_MAX = 512;
