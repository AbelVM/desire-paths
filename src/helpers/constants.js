export const MAP_OPTIONS = {
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/bright',
  center: [-3.7035, 40.4169],
  zoom: 18,
  maxZoom: 24,
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

// TUNED WEIGHTS: Designed for Emergent Path Formation
export const WEIGHTS = {
  // Set to the paper-recommended weighted preference ratio (wa:wd = 1:4)
  w_a: 1.0, // Affordance weight
  w_d: 4.0, // Distance penalty weight (favours shorter detours)
  w_theta: 0.6, // Angular penalty: discourages large steering deviations
};
// Calibration Summary for your testing:
// Too many paths, everywhere: If the entire park is turning into a "web" of worn trails, increase w_f (to 1.1) or decrease w_a (to 1.5).
// No paths at all (agents stick to concrete): Your agents are too "robotic." Increase w_a (to 2.0) or decrease w_f (to 0.7).
// Paths look "jagged" or "zig-zagged": Your agents are too distance-focused. Increase w_d (to 1.0).

export const VISUAL_DEPTH = 15; // How far ahead agents can "see" to evaluate paths (in H3 cells)

export const VISUAL_ANGLE = 120; // The field of view for agents when evaluating next steps (in degrees)

export const AGENTS_PER_DESTINATION = 25; // Number of agents that will be spawned for each origin-destination pair

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
  agentsPerWeightUnit: { min: 5, max: 100, step: 5 },
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
export const YIELD_EVERY_AGENTS = 50; // cooperative yield interval during main-thread simulation (time guard is primary throttle)
export const SIM_YIELD_MS = 45; // keep agent sampling under the browser long-task threshold

// IMPASSABLE blur configuration
// Radius (in H3 rings) to blur impassable influence (1 = immediate neighbors)
export const IMPASSABLE_BLUR_RADIUS = 1;
// Standard deviation for gaussian falloff (in rings)
export const IMPASSABLE_BLUR_SIGMA = 1.0;
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
