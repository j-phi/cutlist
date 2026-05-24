import { describe, expect, it } from 'vitest';
import { migrateProjectStockPerItemCost } from '../v12';

describe('migrateProjectStockPerItemCost (v12)', () => {
  describe('sheet stock', () => {
    it('distributes per-size cost to all thicknesses', () => {
      const result = migrateProjectStockPerItemCost({
        id: 'p1',
        stocks: [
          {
            kind: 'sheet',
            material: 'Plywood',
            sizes: [
              { width: 1220, length: 2440, thickness: [12, 18], cost: 50 },
            ],
          },
        ],
      });
      const sizes = (
        result.stocks as {
          sizes: { thicknessCosts: Record<string, number>; cost?: number }[];
        }[]
      )[0].sizes;
      expect(sizes[0].thicknessCosts).toEqual({ '12': 50, '18': 50 });
      expect(sizes[0].cost).toBeUndefined();
    });

    it('leaves sizes without cost unchanged', () => {
      const input = {
        id: 'p1',
        stocks: [
          {
            kind: 'sheet',
            material: 'Plywood',
            sizes: [{ width: 1220, length: 2440, thickness: [18] }],
          },
        ],
      };
      const result = migrateProjectStockPerItemCost(input);
      const size = (result.stocks as { sizes: Record<string, unknown>[] }[])[0]
        .sizes[0];
      expect(size).not.toHaveProperty('cost');
      expect(size).not.toHaveProperty('thicknessCosts');
    });

    it('does not add thicknessCosts when thickness array is empty', () => {
      const result = migrateProjectStockPerItemCost({
        id: 'p1',
        stocks: [
          {
            kind: 'sheet',
            material: 'Plywood',
            sizes: [{ width: 1220, length: 2440, thickness: [], cost: 40 }],
          },
        ],
      });
      const size = (result.stocks as { sizes: Record<string, unknown>[] }[])[0]
        .sizes[0];
      expect(size).not.toHaveProperty('cost');
      expect(size).not.toHaveProperty('thicknessCosts');
    });
  });

  describe('linear stock', () => {
    it('distributes per-size cost to all lengths', () => {
      const result = migrateProjectStockPerItemCost({
        id: 'p1',
        stocks: [
          {
            kind: 'linear',
            material: 'Pine',
            size: {
              crossSectionWidth: 89,
              crossSectionThickness: 38,
              lengths: [2400, 3600],
              cost: 12,
            },
          },
        ],
      });
      const size = (
        result.stocks as {
          size: { lengthCosts: Record<string, number>; cost?: number };
        }[]
      )[0].size;
      expect(size.lengthCosts).toEqual({ '2400': 12, '3600': 12 });
      expect(size.cost).toBeUndefined();
    });

    it('leaves linear sizes without cost unchanged', () => {
      const input = {
        id: 'p1',
        stocks: [
          {
            kind: 'linear',
            material: 'Pine',
            size: {
              crossSectionWidth: 89,
              crossSectionThickness: 38,
              lengths: [2400],
            },
          },
        ],
      };
      const result = migrateProjectStockPerItemCost(input);
      const size = (result.stocks as { size: Record<string, unknown> }[])[0]
        .size;
      expect(size).not.toHaveProperty('cost');
      expect(size).not.toHaveProperty('lengthCosts');
    });

    it('does not add lengthCosts when lengths array is empty', () => {
      const result = migrateProjectStockPerItemCost({
        id: 'p1',
        stocks: [
          {
            kind: 'linear',
            material: 'Pine',
            size: {
              crossSectionWidth: 89,
              crossSectionThickness: 38,
              lengths: [],
              cost: 10,
            },
          },
        ],
      });
      const size = (result.stocks as { size: Record<string, unknown> }[])[0]
        .size;
      expect(size).not.toHaveProperty('cost');
      expect(size).not.toHaveProperty('lengthCosts');
    });
  });

  describe('robustness', () => {
    it('passes through records without stocks unchanged', () => {
      const input = { id: 'p1', name: 'No stocks' };
      expect(migrateProjectStockPerItemCost(input)).toEqual(input);
    });

    it('never throws on null, non-object, or malformed entries', () => {
      expect(() =>
        migrateProjectStockPerItemCost({
          id: 'p1',
          stocks: [
            null,
            'x',
            { kind: 'sheet', sizes: null },
            { kind: 'linear', size: null },
          ],
        }),
      ).not.toThrow();
    });

    it('preserves other stock fields untouched', () => {
      const result = migrateProjectStockPerItemCost({
        id: 'p1',
        stocks: [
          {
            kind: 'sheet',
            material: 'MDF',
            color: '#cccccc',
            role: 'general',
            sizes: [{ width: 600, length: 2400, thickness: [18], cost: 30 }],
          },
        ],
      });
      const stock = (result.stocks as Record<string, unknown>[])[0];
      expect(stock.material).toBe('MDF');
      expect(stock.color).toBe('#cccccc');
      expect(stock.role).toBe('general');
    });
  });
});
