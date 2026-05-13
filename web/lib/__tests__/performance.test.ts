import { describe, expect, it } from 'vitest';
import {
  generateBoardLayouts,
  mmToUm,
  type PartToCut,
  type StockMatrix,
} from '..';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function createPart(
  partNumber: number,
  instanceNumber: number,
  material: string,
  widthMm: number,
  lengthMm: number,
  thicknessMm: number,
  grainLock?: 'length' | 'width',
): PartToCut {
  return {
    partNumber,
    instanceNumber,
    name: `Part ${partNumber}`,
    material,
    grainLock,
    size: {
      thickness: mmToUm(thicknessMm),
      width: mmToUm(widthMm),
      length: mmToUm(lengthMm),
    },
  };
}

/**
 * Generate a realistic large-project fixture. Mix of materials/thicknesses,
 * varied part sizes, some with grain lock.
 */
function generateLargeFixture(partCount: number): {
  parts: PartToCut[];
  stock: StockMatrix[];
} {
  const materials = ['Oak', 'Birch Ply', 'MDF', 'Walnut', 'Maple'];
  const thicknesses = [18, 12, 25]; // mm
  const widths = [100, 150, 200, 250, 300, 400, 500, 600];
  const lengths = [200, 300, 400, 500, 600, 800, 1000, 1200];
  const grainOptions: (undefined | 'length' | 'width')[] = [
    undefined,
    undefined,
    undefined,
    'length',
    'width',
  ];

  const parts: PartToCut[] = [];
  let partNumber = 1;
  let instanceNumber = 1;

  for (let i = 0; i < partCount; i++) {
    const material = materials[i % materials.length];
    const thickness = thicknesses[i % thicknesses.length];
    const width = widths[i % widths.length];
    const length = lengths[i % lengths.length];
    const grain = grainOptions[i % grainOptions.length];

    // Every 5 parts share a partNumber (simulating qty > 1)
    if (i % 5 === 0) {
      partNumber++;
      instanceNumber = 1;
    }

    parts.push(
      createPart(
        partNumber,
        instanceNumber++,
        material,
        width,
        length,
        thickness,
        grain,
      ),
    );
  }

  const stock: StockMatrix[] = materials.map((material) => ({
    kind: 'sheet' as const,
    material,
    sizes: [
      {
        width: 600,
        length: 2400,
        thickness: [18, 12, 25],
      },
      {
        width: 1200,
        length: 2400,
        thickness: [18, 12, 25],
      },
      {
        width: 300,
        length: 1200,
        thickness: [18, 12, 25],
      },
    ],
  }));

  return { parts, stock };
}

function expectAllPartsAccountedFor(
  result: ReturnType<typeof generateBoardLayouts>,
  parts: PartToCut[],
) {
  const placedCount = result.layouts.reduce(
    (total, layout) => total + layout.placements.length,
    0,
  );
  expect(placedCount + result.leftovers.length).toBe(parts.length);
}

// ─── Large fixture smoke tests ───────────────────────────────────────────────

describe('generateBoardLayouts large fixture smoke tests', () => {
  it.each(['auto', 'cnc'] as const)(
    'Should account for every part in %s mode',
    (defaultAlgorithm) => {
      const { parts, stock } = generateLargeFixture(50);

      const result = generateBoardLayouts(parts, stock, {
        bladeWidth: mmToUm(3.175),
        margin: 0,
        defaultAlgorithm,
      });

      expect(result.layouts.length).toBeGreaterThan(0);
      expectAllPartsAccountedFor(result, parts);
    },
  );
});
