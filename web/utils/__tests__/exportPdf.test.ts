import { describe, expect, it } from 'vitest';
import { mmToUm, type Micrometres } from 'cutlist';
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
    linearLayouts: [],
    leftovers,
    formatSize,
    showPartNumbers: true,
    showBomName: true,
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
              widthUm: 1.22 as Micrometres,
              lengthUm: 2.44 as Micrometres,
              thicknessUm: 0.018 as Micrometres,
            },
            placements: [
              {
                partNumber: 1,
                instanceNumber: 1,
                name: 'Side Panel',
                material: 'Plywood',
                widthUm: 0.5 as Micrometres,
                lengthUm: 0.8 as Micrometres,
                thicknessUm: 0.018 as Micrometres,
                leftUm: 0 as Micrometres,
                rightUm: 0.5 as Micrometres,
                bottomUm: 0 as Micrometres,
                topUm: 0.8 as Micrometres,
              },
              {
                partNumber: 1,
                instanceNumber: 2,
                name: 'Side Panel',
                material: 'Plywood',
                widthUm: 0.5 as Micrometres,
                lengthUm: 0.8 as Micrometres,
                thicknessUm: 0.018 as Micrometres,
                leftUm: 0.5 as Micrometres,
                rightUm: 1.0 as Micrometres,
                bottomUm: 0 as Micrometres,
                topUm: 0.8 as Micrometres,
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
                widthUm: 1.22 as Micrometres,
                lengthUm: 2.44 as Micrometres,
                thicknessUm: 0.018 as Micrometres,
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
    const placements = Array.from({ length: 50 }, (_, i) => {
      const widthUm = 0.1 + (i % 5) * 0.05;
      const lengthUm = 0.2 + (i % 3) * 0.1;
      return {
        partNumber: i + 1,
        instanceNumber: 1,
        name: `Part ${i + 1}`,
        material: 'Plywood',
        widthUm,
        lengthUm,
        thicknessUm: 0.018 as Micrometres,
        leftUm: 0 as Micrometres,
        rightUm: widthUm,
        bottomUm: 0 as Micrometres,
        topUm: lengthUm,
      };
    });

    const result = await exportCutlistPdf(
      makeOptions({
        layouts: [
          {
            stock: {
              material: 'Plywood',
              widthUm: 1.22 as Micrometres,
              lengthUm: 2.44 as Micrometres,
              thicknessUm: 0.018 as Micrometres,
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
              widthUm: 1.22 as Micrometres,
              lengthUm: 2.44 as Micrometres,
              thicknessUm: 0.018 as Micrometres,
            },
            placements: [
              {
                partNumber: 1,
                instanceNumber: 1,
                name: 'Panel',
                material: 'Plywood',
                widthUm: 0.5 as Micrometres,
                lengthUm: 0.8 as Micrometres,
                thicknessUm: 0.018 as Micrometres,
                leftUm: 0 as Micrometres,
                rightUm: 0.5 as Micrometres,
                bottomUm: 0 as Micrometres,
                topUm: 0.8 as Micrometres,
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
            anchorAUm: 0 as Micrometres,
            anchorBUm: mmToUm(500),
            offsetUm: mmToUm(100),
          },
          {
            boardIndex: 0,
            axis: 'y',
            anchorAUm: 0 as Micrometres,
            anchorBUm: mmToUm(800),
            offsetUm: mmToUm(50),
          },
        ] as any,
        layouts: [
          {
            stock: {
              material: 'Plywood',
              widthUm: 1.22 as Micrometres,
              lengthUm: 2.44 as Micrometres,
              thicknessUm: 0.018 as Micrometres,
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
        wasteEndUm: 0.2 as Micrometres,
        stock: {
          name: 'Pine 2x4',
          material: 'Pine 2x4',
          crossSectionWidthUm: 0.0381 as Micrometres,
          crossSectionThicknessUm: 0.0889 as Micrometres,
          lengthUm: 2.4384 as Micrometres,
          color: '#dcc391',
          role: 'general',
        },
        placements: [
          {
            partNumber: 1,
            instanceNumber: 1,
            name: 'Stud',
            material: 'Pine 2x4',
            widthUm: 0.0889 as Micrometres,
            thicknessUm: 0.0381 as Micrometres,
            lengthUm: 0.762 as Micrometres,
            offsetUm: 0 as Micrometres,
            allowanceLengthUm: 0 as Micrometres,
          },
          {
            partNumber: 1,
            instanceNumber: 2,
            name: 'Stud',
            material: 'Pine 2x4',
            widthUm: 0.0889 as Micrometres,
            thicknessUm: 0.0381 as Micrometres,
            lengthUm: 0.762 as Micrometres,
            offsetUm: 0.762 as Micrometres,
            allowanceLengthUm: 0 as Micrometres,
          },
        ],
      },
      {
        kind: 'linear',
        wasteEndUm: 0.4 as Micrometres,
        stock: {
          name: 'Pine 2x4',
          material: 'Pine 2x4',
          crossSectionWidthUm: 0.0381 as Micrometres,
          crossSectionThicknessUm: 0.0889 as Micrometres,
          lengthUm: 3.048 as Micrometres,
          color: '#dcc391',
          role: 'general',
        },
        placements: [
          {
            partNumber: 2,
            instanceNumber: 1,
            name: 'Plate',
            material: 'Pine 2x4',
            widthUm: 0.0889 as Micrometres,
            thicknessUm: 0.0381 as Micrometres,
            lengthUm: 1.524 as Micrometres,
            offsetUm: 0 as Micrometres,
            allowanceLengthUm: 0 as Micrometres,
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
        wasteEndUm: 0 as Micrometres,
        stock: {
          name: 'Pine 2x6',
          material: 'Pine 2x6',
          crossSectionWidthUm: 0.0381 as Micrometres,
          crossSectionThicknessUm: 0.1397 as Micrometres,
          lengthUm: 2.4384 as Micrometres,
          role: 'general',
        },
        placements: [],
      },
      {
        kind: 'linear',
        wasteEndUm: 0 as Micrometres,
        stock: {
          name: 'Pine 2x4',
          material: 'Pine 2x4',
          crossSectionWidthUm: 0.0381 as Micrometres,
          crossSectionThicknessUm: 0.0889 as Micrometres,
          lengthUm: 2.4384 as Micrometres,
          role: 'general',
        },
        placements: [],
      },
    ];
    const result = await exportCutlistPdf(makeOptions({ linearLayouts }));
    expect(result).toBeInstanceOf(Uint8Array);
    const header = new TextDecoder().decode(result.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('adds a sheet shopping-list section for sheet layouts', async () => {
    // Two layouts: a general sheet that gets the buy list, vs. an empty BOM
    // that has no sheet section at all.
    const baseline = await exportCutlistPdf(makeOptions());
    const withSheets = await exportCutlistPdf(
      makeOptions({
        layouts: [
          {
            stock: {
              material: 'Plywood',
              widthUm: 1.22 as Micrometres,
              lengthUm: 2.44 as Micrometres,
              thicknessUm: 0.018 as Micrometres,
              role: 'general',
            },
            placements: [],
            wasteRatio: 0,
          },
          {
            stock: {
              material: 'Plywood',
              widthUm: 0.6 as Micrometres,
              lengthUm: 1.2 as Micrometres,
              thicknessUm: 0.018 as Micrometres,
              role: 'offcut',
            },
            placements: [],
            wasteRatio: 0,
          },
        ] as any,
      }),
    );
    const header = new TextDecoder().decode(withSheets.slice(0, 5));
    expect(header).toBe('%PDF-');
    // Sheet section (plus the per-board tiles) must add bytes over an empty BOM.
    expect(withSheets.length).toBeGreaterThan(baseline.length);
  });

  it('omits the sheet shopping-list section when there are no sheet layouts', async () => {
    // No layouts at all → no sheet section, same byte count as the bare BOM.
    const baseline = await exportCutlistPdf(makeOptions());
    const same = await exportCutlistPdf(makeOptions({ layouts: [] }));
    expect(same.length).toBe(baseline.length);
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
            widthUm: 0.3 as Micrometres,
            lengthUm: 0.4 as Micrometres,
            thicknessUm: 0.018 as Micrometres,
          },
        ] as any,
      }),
    );
    expect(result).toBeInstanceOf(Uint8Array);
  });
});
