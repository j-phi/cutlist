import { describe, expect, it } from 'vitest';
import { StockMatrix } from 'cutlist';
import {
  clusterParts,
  suggestStock,
  type SuggesterPart,
} from '../suggestStock';

const mm = (n: number) => n / 1000;

function part(
  thicknessMm: number,
  widthMm: number,
  lengthMm: number,
): SuggesterPart {
  return {
    size: {
      thickness: mm(thicknessMm),
      width: mm(widthMm),
      length: mm(lengthMm),
    },
  };
}

describe('clusterParts', () => {
  it('groups parts within ±2mm of cross-section', () => {
    const clusters = clusterParts([
      part(45, 70, 1500),
      part(46, 71, 1800),
      part(45, 70, 700),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].partsCount).toBe(3);
    expect(clusters[0].longestPartMm).toBe(1800);
  });

  it('drops panels and over-wide stock', () => {
    const clusters = clusterParts([
      part(30, 700, 2150), // wide tabletop
      part(35, 785, 1550), // wide block
      part(45, 70, 1800), // stick
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].widthMm).toBe(70);
  });
});

describe('suggestStock', () => {
  it('matches parts modeled at exact preset dimensions', () => {
    const out = suggestStock(
      [part(45, 70, 700), part(45, 70, 1550)],
      'mm',
      new Set(),
    );
    expect(out).toHaveLength(1);
    expect(out[0].matrix.material).toBe('AU Pine 70×45');
    expect(out[0].partsCovered).toBe(2);
    expect(out[0].matrix.oversize).toEqual({ length: 20, crossSection: 0 });
  });

  it('matches parts smaller than preset within the plane-down ceiling', () => {
    const [s] = suggestStock([part(41, 66, 1200)], 'mm', new Set());
    expect(s.matrix.material).toBe('AU Pine 70×45');
    expect(s.matrix.oversize?.crossSection).toBe(4);
  });

  it('rejects clusters whose gap exceeds the plane-down ceiling', () => {
    // 50×30 — every preset gaps W or T by more than 6mm on at least one axis.
    expect(suggestStock([part(30, 50, 1200)], 'mm', new Set())).toEqual([]);
  });

  it('picks the shortest stock length covering the longest part plus waste', () => {
    const [s] = suggestStock([part(45, 70, 1850)], 'mm', new Set());
    // 1850 + 20 = 1870 mm; AU Pine 70×45 has lengths [2400, 3000, 3600, 4800].
    expect(s.matrix.size.lengths).toEqual([2400]);
  });

  it('falls through to the next candidate when the best match is in stock', () => {
    // 70×45 matches AU Pine 70×45 (exact) and C24 47×75 (gap 5/2);
    // with AU Pine added, we should still surface C24 47×75.
    const [s] = suggestStock(
      [part(45, 70, 1500)],
      'mm',
      new Set(['AU Pine 70×45']),
    );
    expect(s.matrix.material).toBe('C24 47×75');
  });

  it('ranks suggestions by parts covered descending', () => {
    const out = suggestStock(
      [part(45, 70, 1000), part(45, 70, 1200), part(45, 140, 800)],
      'mm',
      new Set(),
    );
    expect(out.map((s) => s.matrix.material)).toEqual([
      'AU Pine 70×45',
      'AU Pine 140×45',
    ]);
  });

  it('honours the unit filter', () => {
    expect(
      suggestStock([part(38, 89, 1500)], 'mm', new Set())[0].matrix.material,
    ).toBe('CLS 38×89');
    expect(
      suggestStock([part(38, 89, 1500)], 'in', new Set())[0].matrix.material,
    ).toBe('Pine 2×4');
  });

  it('produces a schema-valid matrix for inch presets (regression)', () => {
    // 3.5″×1.5″ used to scale to 88.89999… / 38.09999… mm; the resulting
    // sub-pico negative oversize gap failed the nonnegative schema and
    // dropped the row. roundMm at presetToMmStock kills the slop,
    // suggester clamp catches anything residual.
    const [s] = suggestStock([part(38.1, 88.9, 1200)], 'in', new Set());
    expect(s.matrix.material).toBe('Pine 2×4');
    expect(s.matrix.oversize?.crossSection).toBe(0);
    expect(s.matrix.size.crossSectionWidth).toBe(88.9);
    expect(s.matrix.size.crossSectionThickness).toBe(38.1);
    expect(StockMatrix.safeParse(s.matrix).success).toBe(true);
  });
});
