import { describe, expect, it } from 'vitest';
import type { LinearBoardLayout } from 'cutlist';
import { exportCutlistPdf, type ExportPdfOptions } from '../exportPdf';
import { aggregateBom } from '../pdf/bom';

const formatSize = (m: number) => `${Math.round(m * 1000)}mm`;

function makeOptions(overrides?: Partial<ExportPdfOptions>): ExportPdfOptions {
  const layouts = overrides?.layouts ?? [];
  const leftovers = overrides?.leftovers ?? [];
  const bomRows =
    overrides?.bomRows ??
    aggregateBom(
      layouts.flatMap((l) => l.placements),
      leftovers,
      formatSize,
    );
  return {
    documentName: 'Test Cutlist',
    generatedAt: new Date('2025-01-15T12:00:00Z'),
    scale: 10 as const,
    bomRows,
    layouts,
    leftovers,
    formatSize,
    showPartNumbers: true,
    ...overrides,
  };
}

describe('exportCutlistPdf', () => {
  it('produces a valid PDF with empty BOM', async () => {
    const result = await exportCutlistPdf(makeOptions());
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
    // Check PDF magic bytes: %PDF-
    const header = new TextDecoder().decode(result.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('produces a PDF with BOM rows from placements', async () => {
    const result = await exportCutlistPdf(
      makeOptions({
        layouts: [
          {
            stock: {
              material: 'Plywood',
              widthM: 1.22,
              lengthM: 2.44,
              thicknessM: 0.018,
            },
            placements: [
              {
                partNumber: 1,
                instanceNumber: 1,
                name: 'Side Panel',
                material: 'Plywood',
                widthM: 0.5,
                lengthM: 0.8,
                thicknessM: 0.018,
                leftM: 0,
                bottomM: 0,
                rotated: false,
              },
              {
                partNumber: 1,
                instanceNumber: 2,
                name: 'Side Panel',
                material: 'Plywood',
                widthM: 0.5,
                lengthM: 0.8,
                thicknessM: 0.018,
                leftM: 0.5,
                bottomM: 0,
                rotated: false,
              },
            ],
            wasteRatio: 0.3,
          },
        ] as any,
      }),
    );
    expect(result).toBeInstanceOf(Uint8Array);
    // Should be larger than an empty BOM due to board drawing
    expect(result.length).toBeGreaterThan(100);
  });

  it('produces a PDF at different scales', async () => {
    const scales = [1, 5, 10, 20, 50] as const;
    for (const scale of scales) {
      const result = await exportCutlistPdf(
        makeOptions({
          scale,
          layouts: [
            {
              stock: {
                material: 'Plywood',
                widthM: 1.22,
                lengthM: 2.44,
                thicknessM: 0.018,
              },
              placements: [],
              wasteRatio: 0,
            },
          ] as any,
        }),
      );
      expect(result).toBeInstanceOf(Uint8Array);
      const header = new TextDecoder().decode(result.slice(0, 5));
      expect(header).toBe('%PDF-');
    }
  });

  it('handles large BOM (many parts) without error', async () => {
    const placements = Array.from({ length: 50 }, (_, i) => ({
      partNumber: i + 1,
      instanceNumber: 1,
      name: `Part ${i + 1}`,
      material: 'Plywood',
      widthM: 0.1 + (i % 5) * 0.05,
      lengthM: 0.2 + (i % 3) * 0.1,
      thicknessM: 0.018,
      leftM: 0,
      bottomM: 0,
      rotated: false,
    }));

    const result = await exportCutlistPdf(
      makeOptions({
        layouts: [
          {
            stock: {
              material: 'Plywood',
              widthM: 1.22,
              lengthM: 2.44,
              thicknessM: 0.018,
            },
            placements,
            wasteRatio: 0.1,
          },
        ] as any,
      }),
    );
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('respects showPartNumbers: false', async () => {
    const result = await exportCutlistPdf(
      makeOptions({
        showPartNumbers: false,
        layouts: [
          {
            stock: {
              material: 'Plywood',
              widthM: 1.22,
              lengthM: 2.44,
              thicknessM: 0.018,
            },
            placements: [
              {
                partNumber: 1,
                instanceNumber: 1,
                name: 'Panel',
                material: 'Plywood',
                widthM: 0.5,
                lengthM: 0.8,
                thicknessM: 0.018,
                leftM: 0,
                bottomM: 0,
                rotated: false,
              },
            ],
            wasteRatio: 0.3,
          },
        ] as any,
      }),
    );
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('handles measurements on boards', async () => {
    const result = await exportCutlistPdf(
      makeOptions({
        measurements: [
          {
            boardIndex: 0,
            axis: 'x',
            anchorA: 0,
            anchorB: 0.5,
            offsetM: 0.1,
          },
          {
            boardIndex: 0,
            axis: 'y',
            anchorA: 0,
            anchorB: 0.8,
            offsetM: 0.05,
          },
        ] as any,
        layouts: [
          {
            stock: {
              material: 'Plywood',
              widthM: 1.22,
              lengthM: 2.44,
              thicknessM: 0.018,
            },
            placements: [],
            wasteRatio: 0,
          },
        ] as any,
      }),
    );
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('prints the BOM when there are no layouts or leftovers (e.g. no stock assigned yet)', async () => {
    const emptyResult = await exportCutlistPdf(makeOptions());

    const withBomResult = await exportCutlistPdf(
      makeOptions({
        layouts: [],
        leftovers: [],
        bomRows: [
          {
            partNumber: 1,
            name: 'Side Panel',
            qty: 2,
            material: 'Plywood',
            size: '18mm × 500mm × 800mm',
          },
          {
            partNumber: 2,
            name: 'Top',
            qty: 1,
            material: 'Oak',
            size: '22mm × 400mm × 900mm',
          },
        ],
      }),
    );

    expect(withBomResult).toBeInstanceOf(Uint8Array);
    const header = new TextDecoder().decode(withBomResult.slice(0, 5));
    expect(header).toBe('%PDF-');
    // Rendering actual BOM rows must produce more bytes than an empty BOM.
    expect(withBomResult.length).toBeGreaterThan(emptyResult.length);
  });

  it('renders a linear shopping-list section when linearLayouts are supplied', async () => {
    const linearLayouts: LinearBoardLayout[] = [
      {
        kind: 'linear',
        wasteEndM: 0.2,
        stock: {
          material: 'Pine 2x4',
          crossSectionWidthM: 0.0381,
          crossSectionThicknessM: 0.0889,
          lengthM: 2.4384,
          color: '#dcc391',
        },
        placements: [
          {
            partNumber: 1,
            instanceNumber: 1,
            name: 'Stud',
            material: 'Pine 2x4',
            widthM: 0.0889,
            thicknessM: 0.0381,
            lengthM: 0.762,
            offsetM: 0,
          },
          {
            partNumber: 1,
            instanceNumber: 2,
            name: 'Stud',
            material: 'Pine 2x4',
            widthM: 0.0889,
            thicknessM: 0.0381,
            lengthM: 0.762,
            offsetM: 0.762,
          },
        ],
      },
      {
        kind: 'linear',
        wasteEndM: 0.4,
        stock: {
          material: 'Pine 2x4',
          crossSectionWidthM: 0.0381,
          crossSectionThicknessM: 0.0889,
          lengthM: 3.048,
          color: '#dcc391',
        },
        placements: [
          {
            partNumber: 2,
            instanceNumber: 1,
            name: 'Plate',
            material: 'Pine 2x4',
            widthM: 0.0889,
            thicknessM: 0.0381,
            lengthM: 1.524,
            offsetM: 0,
          },
        ],
      },
    ];

    const baseline = await exportCutlistPdf(makeOptions());
    const withLinear = await exportCutlistPdf(makeOptions({ linearLayouts }));
    expect(withLinear).toBeInstanceOf(Uint8Array);
    const header = new TextDecoder().decode(withLinear.slice(0, 5));
    expect(header).toBe('%PDF-');
    // Linear section adds at least one extra page worth of content.
    expect(withLinear.length).toBeGreaterThan(baseline.length);
  });

  it('omits the linear section when linearLayouts is empty', async () => {
    const baseline = await exportCutlistPdf(makeOptions());
    const empty = await exportCutlistPdf(makeOptions({ linearLayouts: [] }));
    // Empty linear list must not add pages.
    expect(empty.length).toBe(baseline.length);
  });

  it('groups linear sticks by material with stable shopping-list order', async () => {
    const linearLayouts: LinearBoardLayout[] = [
      {
        kind: 'linear',
        wasteEndM: 0,
        stock: {
          material: 'Pine 2x6',
          crossSectionWidthM: 0.0381,
          crossSectionThicknessM: 0.1397,
          lengthM: 2.4384,
        },
        placements: [],
      },
      {
        kind: 'linear',
        wasteEndM: 0,
        stock: {
          material: 'Pine 2x4',
          crossSectionWidthM: 0.0381,
          crossSectionThicknessM: 0.0889,
          lengthM: 2.4384,
        },
        placements: [],
      },
    ];
    const result = await exportCutlistPdf(makeOptions({ linearLayouts }));
    expect(result).toBeInstanceOf(Uint8Array);
    const header = new TextDecoder().decode(result.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('handles leftovers in BOM aggregation', async () => {
    const result = await exportCutlistPdf(
      makeOptions({
        leftovers: [
          {
            partNumber: 1,
            instanceNumber: 1,
            name: 'Leftover Part',
            material: 'Plywood',
            widthM: 0.3,
            lengthM: 0.4,
            thicknessM: 0.018,
          },
        ] as any,
      }),
    );
    expect(result).toBeInstanceOf(Uint8Array);
  });
});
