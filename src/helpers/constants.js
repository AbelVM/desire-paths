export const MAP_OPTIONS = {
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/bright',
  center: [-3.7035, 40.4169],
  zoom: 19,
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
  w_f: 1.0, // Friction weight (reserved for future use)
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

// Simulation tick budget: cap steps per agent journey to keep UI responsive
export const MAX_SIM_TICKS = 5000;
export const SIM_TICK_BUFFER = 8; // multiplier on H3 grid distance between origin and destination
export const YIELD_EVERY_AGENTS = 5; // cooperative yield interval during main-thread simulation

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
 * Check if a surface is under construction.
 */
function isUnderConstruction(cls) {
  return cls.includes('_construction');
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
    'glacier', 'bare_rock', 'scree', 'swamp', 'bog', 'marsh',
    'mangrove', 'reedbed', 'saltmarsh', 'tidalflat', 'tundra',
  ];
  if (['ice', 'rock', 'wetland'].includes(cls) || impassableSub.includes(subclass)) {
    return 'IMPASSABLE';
  }
  const heavySub = [
    'forest', 'wood', 'scrub', 'shrubbery', 'heath', 'sand',
    'beach', 'dune', 'fell',
  ];
  if (heavySub.includes(subclass)) return 'HEAVY_GRASS';
  const lightSub = [
    'grass', 'grassland', 'meadow', 'park', 'garden', 'golf_course',
    'village_green', 'recreation_ground', 'flowerbed', 'wet_meadow',
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
    'residential', 'commercial', 'retail', 'school', 'university',
    'kindergarten', 'college', 'library', 'hospital', 'bus_station',
  ];
  if (urban.includes(cls)) return 'PAVEMENT';
  const recreational = [
    'stadium', 'pitch', 'playground', 'track', 'theme_park', 'zoo', 'cemetery',
  ];
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
    'rail', 'narrow_gauge', 'preserved', 'funicular',
    'subway', 'light_rail', 'monorail', 'tram',
  ];
  return cls === 'railway' || rails.includes(subclass);
}

/**
 * Exhaustive surface-only pedestrian friction classification.
 */
export function getSurface(feature) {
  const layerId = feature.sourceLayer || '';
  const { layer, class: cls, subclass, brunnel } = feature.properties;
  const safeCls = cls == null ? '' : String(cls);
  const safeSubclass = subclass == null ? '' : String(subclass);

  // 1. GLOBAL FILTER: Ignore sub-surface and interior
  if (isIndoorIndoors(feature.properties)) {
    return { cost: 'IMPASSABLE', layer: parseLayerValue(layer) };
  }

  // 2. LAYER: TRANSPORTATION
  if (layerId === 'transportation') {
    const verticalLayer = resolveVerticalLayer(layer, brunnel);

    if (isFootRestricted(feature.properties)) {
      return { cost: 'IMPASSABLE', layer: verticalLayer };
    }
    if (isUnderConstruction(safeCls)) {
      return { cost: 'IMPASSABLE', layer: verticalLayer };
    }
    if (safeCls === 'path') {
      return { cost: classifyPathSubclass(safeSubclass), layer: verticalLayer };
    }
    if (brunnel === 'ford') {
      return { cost: 'HEAVY_GRASS', layer: verticalLayer };
    }

    const roadResult = classifyRoadHierarchy(safeCls);
    if (roadResult !== null) return { cost: roadResult, layer: verticalLayer };
    if (safeCls === 'track') return { cost: 'LIGHT_PARK', layer: verticalLayer };
    if (isRailway(safeCls, safeSubclass)) return { cost: 'IMPASSABLE', layer: verticalLayer };

    return { cost: 'PAVEMENT', layer: verticalLayer };
  }

  // 3. LAYER: LANDCOVER
  if (layerId === 'landcover') {
    const result = classifyLandcover(safeCls, safeSubclass);
    if (result) return { cost: result, layer: parseLayerValue(layer) };
  }

  // 4. LAYER: LANDUSE
  if (layerId === 'landuse') {
    const result = classifyLanduse(safeCls);
    if (result) return { cost: result, layer: parseLayerValue(layer) };
  }

  // 5. LAYER: BUILDING or WATER (Physical Barrier)
  if (layerId === 'building' || layerId === 'water') {
    return { cost: 'IMPASSABLE', layer: parseLayerValue(layer) };
  }

  // 6. Default assumption for unclassified features
  return { cost: 'PAVEMENT', layer: parseLayerValue(layer) };
}
