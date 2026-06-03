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
 * Exhaustive surface-only pedestrian friction classification.
 */
export function getSurface(feature) {
  const layerId = feature.sourceLayer || '';
  const { layer, class: cls, subclass, brunnel, indoor, foot, access } = feature.properties;
  let relativeVerticalLayer = parseInt(layer ?? '0', 10).toString();

  // 1. GLOBAL FILTER: Ignore sub-surface and interior
  if (indoor === 1 || indoor === 'true' || indoor === true)
    return { cost: 'IMPASSABLE', layer: relativeVerticalLayer };

  // 2. LAYER: TRANSPORTATION
  if (layerId === 'transportation') {
    // 0. Vertical structures (Bridges/Tunnels): Even if tagged as "surface," these often have stairs, ramps, or other barriers that can impede pedestrian flow. For simplicity, we'll treat all as impassable, but this could be refined with additional tags in the future.
    if (relativeVerticalLayer === '0') {
      if (brunnel === 'bridge') relativeVerticalLayer = '1';
      if (brunnel === 'tunnel') relativeVerticalLayer = '-1';
    }

    // 1. Non accesible by foot (Explicitly tagged as such)
    if (foot === 'no' || foot === 'private' || access === 'no' || access === 'private')
      return { cost: 'IMPASSABLE', layer: relativeVerticalLayer };

    // 2. CONSTRUCTION CHECK (Always assume danger/impassability)
    if (cls.includes('_construction')) return { cost: 'IMPASSABLE', layer: relativeVerticalLayer };

    // 3. SPECIALIZED PATHS (Fine-grained subclass control)
    // If it's in the 'path' class, the subclass tells us exactly how walkable it is.
    if (cls === 'path') {
      const easyPaths = ['pedestrian', 'footway', 'corridor', 'platform', 'path'];
      if (easyPaths.includes(subclass)) return { cost: 'PAVEMENT', layer: relativeVerticalLayer };
      if (subclass === 'bridleway' || subclass === 'cycleway')
        return { cost: 'LIGHT_PARK', layer: relativeVerticalLayer }; // Walkable but often shared with horses/cycles, so slightly less comfortable.
      if (subclass === 'steps') return { cost: 'HEAVY_GRASS', layer: relativeVerticalLayer }; // Technically walkable, but often less comfortable and more effortful, especially for high foot traffic or accessibility needs.
      return { cost: 'PAVEMENT', layer: relativeVerticalLayer }; // Default for generic 'path'
    }
    if (brunnel === 'ford') return { cost: 'HEAVY_GRASS', layer: relativeVerticalLayer }; // Shallow water crossings can be walkable but less comfortable.

    // 4. ROAD HIERARCHY
    const highSpeed = ['motorway', 'trunk', 'primary', 'raceway', 'busway', 'bus_guideway'];
    const mediumSpeed = ['secondary', 'tertiary'];
    const lowSpeed = ['minor', 'service'];

    if (highSpeed.includes(cls)) return { cost: 'IMPASSABLE', layer: relativeVerticalLayer };
    if (mediumSpeed.includes(cls)) return { cost: 'PAVEMENT', layer: relativeVerticalLayer }; // Assuming sidewalk existence
    if (lowSpeed.includes(cls)) return { cost: 'PAVEMENT', layer: relativeVerticalLayer };

    // 5. RURAL/TRACKS
    if (cls === 'track') return { cost: 'LIGHT_PARK', layer: relativeVerticalLayer }; // Typically unpaved but walkable, often in rural areas or parks.

    // 6. RAILWAYS (Generally impassable)
    // Even if 'surface' level, rails are physical barriers.
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
    if (cls === 'railway' || rails.includes(subclass))
      return { cost: 'IMPASSABLE', layer: relativeVerticalLayer };

    return { cost: 'PAVEMENT', layer: relativeVerticalLayer };
  }

  // 3. LAYER: LANDCOVER (Granular Surface Analysis)
  if (layerId === 'landcover') {
    // 1. IMPASSABLE: High-risk or non-solid terrain
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
      return { cost: 'IMPASSABLE', layer: relativeVerticalLayer };
    }

    // 2. HEAVY_GRASS: Dense vegetation or shifting ground
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
    if (heavySub.includes(subclass)) {
      return { cost: 'HEAVY_GRASS', layer: relativeVerticalLayer };
    }

    // 3. LIGHT_PARK: Maintained leisure or low vegetation
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
    if (lightSub.includes(subclass)) {
      return { cost: 'LIGHT_PARK', layer: relativeVerticalLayer };
    }

    // 4. MANAGED: Cultivated areas
    const managedSub = ['farm', 'farmland', 'allotments', 'orchard', 'vineyard', 'plant_nursery'];
    if (managedSub.includes(subclass)) {
      return { cost: 'HEAVY_GRASS', layer: relativeVerticalLayer };
    }
  }

  // 4. LAYER: LANDUSE
  if (layerId === 'landuse') {
    // 1. IMPASSABLE: Hazard or Restriction
    const restricted = ['military', 'industrial', 'quarry', 'dam', 'railway'];
    if (restricted.includes(cls)) return { cost: 'IMPASSABLE', layer: relativeVerticalLayer };

    // 2. PAVEMENT: High-Infrastructure / Urban Density
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
    if (urban.includes(cls)) return { cost: 'PAVEMENT', layer: relativeVerticalLayer };

    // 3. LIGHT_PARK: Recreational Facilities
    const recreational = [
      'stadium',
      'pitch',
      'playground',
      'track',
      'theme_park',
      'zoo',
      'cemetery',
    ];
    if (recreational.includes(cls)) return { cost: 'LIGHT_PARK', layer: relativeVerticalLayer };

    // 4. TRANSITIONAL/UNKNOWN: General Urban Fabric
    const urbanFabric = ['suburb', 'quarter', 'neighbourhood', 'garages'];
    if (urbanFabric.includes(cls)) return { cost: 'PAVEMENT', layer: relativeVerticalLayer };
  }

  // 5. LAYER: BUILDING or WATER (Physical Barrier)
  if (layerId === 'building' || layerId === 'water')
    return { cost: 'IMPASSABLE', layer: relativeVerticalLayer };

  // 6. Default assumption for unclassified features
  return { cost: 'PAVEMENT', layer: relativeVerticalLayer };
}
