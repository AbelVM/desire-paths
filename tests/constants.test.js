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
        'allotments',
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

  // --- 6. Default ---
  it('should return PAVEMENT as default for unknown layer', () => {
    const result = getSurface({
      properties: { class: 'unknown' },
      sourceLayer: 'unknown',
    });
    expect(result.cost).toBe('PAVEMENT');
  });

  it('should throw when properties is empty and sourceLayer is transportation', () => {
    // When cls is undefined and layerId is transportation, cls.includes throws
    expect(() => getSurface({ sourceLayer: 'transportation', properties: {} })).toThrow();
  });

  it('should handle custom layer value', () => {
    const result = getSurface({
      properties: { layer: '0', class: 'secondary' },
      sourceLayer: 'transportation',
    });
    expect(result.layer).toBe('0');
  });

  it('should handle non-numeric layer value (produces NaN)', () => {
    const result = getSurface({
      properties: { layer: 'abc', class: 'secondary' },
      sourceLayer: 'transportation',
    });
    // parseInt('abc', 10) returns NaN, which toString() converts to 'NaN'
    expect(result.layer).toBe('NaN');
  });
});
