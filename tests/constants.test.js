import { describe, it, expect } from 'vitest';
import { getSurface } from '../src/helpers/constants.js';

describe('getSurface', () => {
  // --- 1. GLOBAL FILTER: Indoor ---
  it('should return IMPASSABLE for indoor=true (string)', () => {
    const result = getSurface({
      properties: { indoor: 'true', class: 'highway' },
      sourceLayer: 'building',
    });
    expect(result.cost).toBe('IMPASSABLE');
    expect(result.layer).toBe('0');
  });

  it('should return IMPASSABLE for indoor=true (boolean)', () => {
    const result = getSurface({
      properties: { indoor: true, class: 'highway' },
      sourceLayer: 'building',
    });
    expect(result.cost).toBe('IMPASSABLE');
  });

  it('should return IMPASSABLE for indoor=1 (number)', () => {
    const result = getSurface({
      properties: { indoor: 1, class: 'highway' },
      sourceLayer: 'building',
    });
    expect(result.cost).toBe('IMPASSABLE');
  });

  // --- 2. LAYER: TRANSPORTATION ---
  describe('transportation layer', () => {
    it('should return IMPASSABLE for foot=no', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'path', subclass: 'footway', foot: 'no' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('IMPASSABLE');
    });

    it('should return IMPASSABLE for foot=private', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'path', subclass: 'footway', foot: 'private' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('IMPASSABLE');
    });

    it('should return IMPASSABLE for access=no', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'path', subclass: 'footway', access: 'no' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('IMPASSABLE');
    });

    it('should return IMPASSABLE for access=private', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'path', subclass: 'footway', access: 'private' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('IMPASSABLE');
    });

    it('should return IMPASSABLE for construction in class', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'cycleway_construction' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('IMPASSABLE');
    });

    describe('path class', () => {
      it('should return PAVEMENT for pedestrian', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'path', subclass: 'pedestrian' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('PAVEMENT');
      });

      it('should return PAVEMENT for footway', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'path', subclass: 'footway' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('PAVEMENT');
      });

      it('should return PAVEMENT for corridor', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'path', subclass: 'corridor' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('PAVEMENT');
      });

      it('should return PAVEMENT for platform', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'path', subclass: 'platform' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('PAVEMENT');
      });

      it('should return PAVEMENT for generic path', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'path', subclass: 'path' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('PAVEMENT');
      });

      it('should return LIGHT_PARK for bridleway', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'path', subclass: 'bridleway' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('LIGHT_PARK');
      });

      it('should return LIGHT_PARK for cycleway', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'path', subclass: 'cycleway' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('LIGHT_PARK');
      });

      it('should return HEAVY_GRASS for steps', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'path', subclass: 'steps' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('HEAVY_GRASS');
      });
    });

    it('should return HEAVY_GRASS for ford when class is not path', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'highway', brunnel: 'ford' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('HEAVY_GRASS');
    });

    describe('road hierarchy', () => {
      it('should return IMPASSABLE for motorway', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'motorway' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });

      it('should return IMPASSABLE for trunk', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'trunk' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });

      it('should return IMPASSABLE for primary', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'primary' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });

      it('should return IMPASSABLE for raceway', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'raceway' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });

      it('should return PAVEMENT for secondary', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'secondary' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('PAVEMENT');
      });

      it('should return PAVEMENT for tertiary', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'tertiary' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('PAVEMENT');
      });

      it('should return PAVEMENT for minor', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'minor' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('PAVEMENT');
      });

      it('should return PAVEMENT for service', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'service' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('PAVEMENT');
      });
    });

    it('should return LIGHT_PARK for track', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'track' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('LIGHT_PARK');
    });

    describe('railway', () => {
      it('should return IMPASSABLE for railway class', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'railway' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });

      it('should return IMPASSABLE for rail class (OpenMapTiles canonical)', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'rail' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });

      it('should return IMPASSABLE for transit class (OpenMapTiles canonical)', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'transit' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });

      it('should return IMPASSABLE for transit class with tram subclass', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'transit', subclass: 'tram' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });

      it('should return IMPASSABLE for rail subclass', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'highway', subclass: 'rail' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });

      it('should return IMPASSABLE for subway subclass', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'highway', subclass: 'subway' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });

      it('should return IMPASSABLE for tram subclass', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'highway', subclass: 'tram' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });
    });

    describe('ferry / aerialway', () => {
      it('should return IMPASSABLE for a ferry route', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'ferry' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });

      it('should return IMPASSABLE for an aerialway', () => {
        const result = getSurface({
          properties: { layer: 'transportation', class: 'aerialway' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });
    });

    describe('pier', () => {
      it('should return PAVEMENT for a pier at ground layer 0', () => {
        const result = getSurface({
          properties: { layer: '0', class: 'pier' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('PAVEMENT');
        expect(result.layer).toBe('0');
      });

      it('should return PAVEMENT for a pier with no layer tag (defaults to 0)', () => {
        const result = getSurface({
          properties: { class: 'pier' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('PAVEMENT');
        expect(result.layer).toBe('0');
      });

      it('should respect an explicit pier layer (layer 2 stays 2)', () => {
        const result = getSurface({
          properties: { layer: '2', class: 'pier' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('PAVEMENT');
        expect(result.layer).toBe('2');
      });

      it('should return IMPASSABLE for a foot=no pier', () => {
        const result = getSurface({
          properties: { layer: '0', class: 'pier', foot: 'no' },
          sourceLayer: 'transportation',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });
    });

    it('should return PAVEMENT as default for unknown transportation class', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'unknown_road' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('PAVEMENT');
    });

    it('should handle bridge brunnel at vertical layer 0', () => {
      const result = getSurface({
        properties: { layer: '0', class: 'secondary', brunnel: 'bridge' },
        sourceLayer: 'transportation',
      });
      expect(result.layer).toBe('1');
    });

    it('should handle tunnel brunnel at vertical layer 0', () => {
      const result = getSurface({
        properties: { layer: '0', class: 'secondary', brunnel: 'tunnel' },
        sourceLayer: 'transportation',
      });
      expect(result.layer).toBe('-1');
    });
  });

  // --- 3. LAYER: LANDCOVER ---
  describe('landcover layer', () => {
    describe('impassable sub-classes', () => {
      it.each([
        'glacier',
        'bare_rock',
        'scree',
        'swamp',
        'bog',
        'marsh',
        'mangrove',
        'reedbed',
        'saltern',
        'saltmarsh',
        'tidalflat',
        'tundra',
      ])('should return IMPASSABLE for subclass %s', (subclass) => {
        const result = getSurface({
          properties: { layer: 'landcover', class: 'wetland', subclass },
          sourceLayer: 'landcover',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });

      it('should return IMPASSABLE for ice class', () => {
        const result = getSurface({
          properties: { layer: 'landcover', class: 'ice' },
          sourceLayer: 'landcover',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });

      it('should return IMPASSABLE for rock class', () => {
        const result = getSurface({
          properties: { layer: 'landcover', class: 'rock' },
          sourceLayer: 'landcover',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });

      it('should return IMPASSABLE for wetland class', () => {
        const result = getSurface({
          properties: { layer: 'landcover', class: 'wetland' },
          sourceLayer: 'landcover',
        });
        expect(result.cost).toBe('IMPASSABLE');
      });
    });

    describe('heavy grass sub-classes', () => {
      it.each([
        'forest',
        'wood',
        'scrub',
        'shrubbery',
        'heath',
        'sand',
        'beach',
        'dune',
        'fell',
      ])('should return HEAVY_GRASS for subclass %s', (subclass) => {
        const result = getSurface({
          properties: { layer: 'landcover', class: 'vegetation', subclass },
          sourceLayer: 'landcover',
        });
        expect(result.cost).toBe('HEAVY_GRASS');
      });
    });

    describe('light park sub-classes', () => {
      it.each([
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
        'allotments',
      ])('should return LIGHT_PARK for subclass %s', (subclass) => {
        const result = getSurface({
          properties: { layer: 'landcover', class: 'vegetation', subclass },
          sourceLayer: 'landcover',
        });
        expect(result.cost).toBe('LIGHT_PARK');
      });
    });

    describe('managed sub-classes', () => {
      it.each([
        'farm',
        'farmland',
        'orchard',
        'vineyard',
        'plant_nursery',
      ])('should return HEAVY_GRASS for managed subclass %s', (subclass) => {
        const result = getSurface({
          properties: { layer: 'landcover', class: 'vegetation', subclass },
          sourceLayer: 'landcover',
        });
        expect(result.cost).toBe('HEAVY_GRASS');
      });
    });

    describe('canonical-class fallback (unknown/empty subclass)', () => {
      it.each(['ice', 'rock', 'wetland'])(
        'should return IMPASSABLE for class %s with an unknown subclass',
        (cls) => {
          const result = getSurface({
            properties: { layer: 'landcover', class: cls, subclass: 'mystery' },
            sourceLayer: 'landcover',
          });
          expect(result.cost).toBe('IMPASSABLE');
        },
      );

      it.each(['wood', 'farmland', 'sand'])(
        'should return HEAVY_GRASS for class %s with an unknown subclass',
        (cls) => {
          const result = getSurface({
            properties: { layer: 'landcover', class: cls, subclass: 'mystery' },
            sourceLayer: 'landcover',
          });
          expect(result.cost).toBe('HEAVY_GRASS');
        },
      );

      it('should return LIGHT_PARK for class grass with an unknown subclass', () => {
        const result = getSurface({
          properties: { layer: 'landcover', class: 'grass', subclass: 'mystery' },
          sourceLayer: 'landcover',
        });
        expect(result.cost).toBe('LIGHT_PARK');
      });

      it('should return LIGHT_PARK for class grass with no subclass', () => {
        const result = getSurface({
          properties: { layer: 'landcover', class: 'grass' },
          sourceLayer: 'landcover',
        });
        expect(result.cost).toBe('LIGHT_PARK');
      });
    });
  });

  // --- 4. LAYER: LANDUSE ---
  describe('landuse layer', () => {
    describe('impassable', () => {
      it.each(['military', 'industrial', 'quarry', 'dam', 'railway'])(
        'should return IMPASSABLE for landuse %s',
        (cls) => {
          const result = getSurface({
            properties: { layer: 'landuse', class: cls },
            sourceLayer: 'landuse',
          });
          expect(result.cost).toBe('IMPASSABLE');
        },
      );
    });

    describe('pavement', () => {
      it.each([
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
      ])('should return PAVEMENT for landuse %s', (cls) => {
        const result = getSurface({
          properties: { layer: 'landuse', class: cls },
          sourceLayer: 'landuse',
        });
        expect(result.cost).toBe('PAVEMENT');
      });
    });

    describe('light park', () => {
      it.each([
        'stadium',
        'pitch',
        'playground',
        'track',
        'theme_park',
        'zoo',
        'cemetery',
      ])('should return LIGHT_PARK for landuse %s', (cls) => {
        const result = getSurface({
          properties: { layer: 'landuse', class: cls },
          sourceLayer: 'landuse',
        });
        expect(result.cost).toBe('LIGHT_PARK');
      });
    });

    describe('urban fabric', () => {
      it.each(['suburb', 'quarter', 'neighbourhood', 'garages'])(
        'should return PAVEMENT for urban fabric %s',
        (cls) => {
          const result = getSurface({
            properties: { layer: 'landuse', class: cls },
            sourceLayer: 'landuse',
          });
          expect(result.cost).toBe('PAVEMENT');
        },
      );
    });
  });

  // --- 4b. RESTRICTED ACCESS on landcover / landuse ---
  describe('restricted access on landcover / landuse', () => {
    it('should return IMPASSABLE for a private landcover (access=private)', () => {
      const result = getSurface({
        properties: { layer: 'landcover', class: 'vegetation', subclass: 'garden', access: 'private' },
        sourceLayer: 'landcover',
      });
      expect(result.cost).toBe('IMPASSABLE');
    });

    it('should return IMPASSABLE for a foot=no landcover', () => {
      const result = getSurface({
        properties: { layer: 'landcover', class: 'vegetation', subclass: 'park', foot: 'no' },
        sourceLayer: 'landcover',
      });
      expect(result.cost).toBe('IMPASSABLE');
    });

    it('should still return LIGHT_PARK for a public garden (no access tag)', () => {
      const result = getSurface({
        properties: { layer: 'landcover', class: 'vegetation', subclass: 'garden' },
        sourceLayer: 'landcover',
      });
      expect(result.cost).toBe('LIGHT_PARK');
    });

    it('should return IMPASSABLE for a private landuse (access=private)', () => {
      const result = getSurface({
        properties: { layer: 'landuse', class: 'residential', access: 'private' },
        sourceLayer: 'landuse',
      });
      expect(result.cost).toBe('IMPASSABLE');
    });

    it('should return IMPASSABLE for a foot=no landuse', () => {
      const result = getSurface({
        properties: { layer: 'landuse', class: 'residential', foot: 'no' },
        sourceLayer: 'landuse',
      });
      expect(result.cost).toBe('IMPASSABLE');
    });

    it('should still return PAVEMENT for a public residential landuse', () => {
      const result = getSurface({
        properties: { layer: 'landuse', class: 'residential' },
        sourceLayer: 'landuse',
      });
      expect(result.cost).toBe('PAVEMENT');
    });
  });

  // --- 5. LAYER: BUILDING / WATER ---
  it('should return IMPASSABLE for building layer', () => {
    const result = getSurface({
      properties: { class: 'building' },
      sourceLayer: 'building',
    });
    expect(result.cost).toBe('IMPASSABLE');
  });

  it('should return IMPASSABLE for water layer', () => {
    const result = getSurface({
      properties: { class: 'water' },
      sourceLayer: 'water',
    });
    expect(result.cost).toBe('IMPASSABLE');
  });

  // --- 5b. LAYER: WATERWAY / AEROWAY / PARK ---
  describe('waterway layer', () => {
    it.each(['stream', 'river', 'canal', 'drain', 'ditch'])(
      'should return IMPASSABLE for waterway %s',
      (cls) => {
        const result = getSurface({
          properties: { class: cls },
          sourceLayer: 'waterway',
        });
        expect(result.cost).toBe('IMPASSABLE');
      },
    );

    it('should still return IMPASSABLE for a waterway on a bridge (aqueduct)', () => {
      const result = getSurface({
        properties: { class: 'canal', brunnel: 'bridge' },
        sourceLayer: 'waterway',
      });
      expect(result.cost).toBe('IMPASSABLE');
    });

    it('should skip (return null) a culverted waterway (brunnel=tunnel)', () => {
      // A tunneled/piped waterway runs underground; the ground surface above it
      // is walkable, so it must contribute no barrier (null → skipped upstream).
      const result = getSurface({
        properties: { class: 'river', brunnel: 'tunnel' },
        sourceLayer: 'waterway',
      });
      expect(result).toBeNull();
    });
  });

  describe('aeroway layer', () => {
    it.each([
      'runway',
      'taxiway',
      'apron',
      'gate',
      'aerodrome',
      'heliport',
      'helipad',
    ])('should return IMPASSABLE for aeroway %s', (cls) => {
      const result = getSurface({
        properties: { class: cls },
        sourceLayer: 'aeroway',
      });
      expect(result.cost).toBe('IMPASSABLE');
    });
  });

  describe('park layer', () => {
    it.each(['national_park', 'nature_reserve', 'protected_area'])(
      'should return LIGHT_PARK for park %s',
      (cls) => {
        const result = getSurface({
          properties: { class: cls },
          sourceLayer: 'park',
        });
        expect(result.cost).toBe('LIGHT_PARK');
      },
    );
  });

  // --- 6. Default ---
  it('should return PAVEMENT as default for unknown layer', () => {
    const result = getSurface({
      properties: { class: 'unknown' },
      sourceLayer: 'unknown',
    });
    expect(result.cost).toBe('PAVEMENT');
  });

  it('should handle empty properties safely on transportation layer', () => {
    // Previously this threw because cls.includes was called on undefined
    const result = getSurface({ sourceLayer: 'transportation', properties: {} });
    expect(result.cost).toBe('PAVEMENT');
    expect(result.layer).toBe('0');
  });

  it('should handle custom layer value', () => {
    const result = getSurface({
      properties: { layer: '0', class: 'secondary' },
      sourceLayer: 'transportation',
    });
    expect(result.layer).toBe('0');
  });

  it('should handle non-numeric layer value (defaults to 0)', () => {
    const result = getSurface({
      properties: { layer: 'abc', class: 'secondary' },
      sourceLayer: 'transportation',
    });
    // parseInt('abc', 10) returns NaN, now safely defaults to '0'
    expect(result.layer).toBe('0');
  });
});

// --- 7. SURFACE-AWARE TRANSPORTATION MODULATION ---
describe('getSurface surface modulation', () => {
  describe('soft / unpaved surfaces bump the tier up', () => {
    it('should return LIGHT_PARK for a grass footway (path + surface=grass)', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'path', subclass: 'footway', surface: 'grass' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('LIGHT_PARK');
    });

    it('should return LIGHT_PARK for a dirt path (path + surface=dirt)', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'path', subclass: 'path', surface: 'dirt' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('LIGHT_PARK');
    });

    it('should return HEAVY_GRASS for a grass track (track + surface=grass)', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'track', surface: 'grass' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('HEAVY_GRASS');
    });

    it('should return HEAVY_GRASS for a grass bridleway (LIGHT_PARK + surface=grass)', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'path', subclass: 'bridleway', surface: 'grass' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('HEAVY_GRASS');
    });

    it('should return LIGHT_PARK for a gravel secondary road (PAVEMENT + surface=gravel)', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'secondary', surface: 'gravel' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('LIGHT_PARK');
    });
  });

  describe('explicit paved surfaces keep the base class', () => {
    it('should return PAVEMENT for an asphalt path', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'path', subclass: 'footway', surface: 'asphalt' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('PAVEMENT');
    });

    it('should return PAVEMENT for an asphalt track', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'track', surface: 'asphalt' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('PAVEMENT');
    });

    it('should return PAVEMENT for a paved bridleway (surface=paving_stones)', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'path', subclass: 'bridleway', surface: 'paving_stones' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('PAVEMENT');
    });
  });

  describe('no / unknown surface is conservative (keeps base class)', () => {
    it('should return PAVEMENT for a path with no surface tag', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'path', subclass: 'footway' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('PAVEMENT');
    });

    it('should return PAVEMENT for a path with an unknown surface tag', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'path', subclass: 'footway', surface: 'mystery_surface' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('PAVEMENT');
    });

    it('should return LIGHT_PARK for a track with no surface tag', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'track' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('LIGHT_PARK');
    });
  });

  describe('surface never softens an impassable feature', () => {
    it('should return IMPASSABLE for a foot=no path even with surface=asphalt', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'path', subclass: 'footway', foot: 'no', surface: 'asphalt' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('IMPASSABLE');
    });

    it('should return IMPASSABLE for a motorway even with surface=grass', () => {
      const result = getSurface({
        properties: { layer: 'transportation', class: 'motorway', surface: 'grass' },
        sourceLayer: 'transportation',
      });
      expect(result.cost).toBe('IMPASSABLE');
    });
  });

  describe('cache key distinguishes surface tuples', () => {
    it('should classify the same path differently by surface', () => {
      const base = getSurface({
        properties: { layer: 'transportation', class: 'path', subclass: 'footway' },
        sourceLayer: 'transportation',
      });
      const grass = getSurface({
        properties: { layer: 'transportation', class: 'path', subclass: 'footway', surface: 'grass' },
        sourceLayer: 'transportation',
      });
      expect(base.cost).toBe('PAVEMENT');
      expect(grass.cost).toBe('LIGHT_PARK');
    });
  });
});

// --- 8. LANDCOVER: mud ---
describe('getSurface landcover mud', () => {
  it('should return HEAVY_GRASS for subclass mud', () => {
    const result = getSurface({
      properties: { layer: 'landcover', class: 'vegetation', subclass: 'mud' },
      sourceLayer: 'landcover',
    });
    expect(result.cost).toBe('HEAVY_GRASS');
  });
});
