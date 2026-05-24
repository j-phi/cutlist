/**
 * Reactive BOM (bill of materials) row computation.
 *
 * Combines packing engine results (when available) with raw model data
 * (fallback) to produce a flat list of BomRow objects for display.
 */

import type { BandedEdges, BoardLayoutLeftover, Micrometres } from 'cutlist';
import { groupPartsByNumber } from '~/lib/utils/bom-utils';
import { suggestStockMatch } from '~/lib/utils/stock-utils';
import { computePartNumberOffsets } from '~/utils/partNumberOffsets';
import type { Model } from '~/composables/useProjects';

export interface BomRow {
  number: number;
  name: string;
  modelId: string;
  modelName: string;
  qty: number;
  material: string;
  thicknessUm: Micrometres;
  widthUm: Micrometres;
  lengthUm: Micrometres;
  grainLock?: 'length' | 'width';
  /**
   * Which of the part's four edges are banded (F7). Absent ≡ no edges banded.
   * Sourced from the model's `partOverrides`, not the packing result (the
   * Part→PartToCut boundary drops the field).
   */
  bandedEdges?: BandedEdges;
  /** Per-part banding thickness override (F7), integer µm; absent ≡ default. */
  bandingThicknessUm?: Micrometres;
  /**
   * Nominal (finished) extents (F7 FR-BND-8). When the subtract toggle is ON,
   * `widthUm`/`lengthUm` reflect the CUT size from the packing result while
   * these stay the finished size for dual display.
   */
  finishedWidthUm: Micrometres;
  finishedLengthUm: Micrometres;
  leftoverCount: number;
  isManual: boolean;
  /**
   * A close stock name when this row's material has no exact stock match
   * (FR-MAT-1). `null` when the material matches or nothing is close enough.
   */
  materialSuggestion: string | null;
}

function modelDisplayName(model: {
  filename: string;
  source: 'gltf' | 'assimp' | 'manual';
}): string {
  const filename = model.filename.trim();
  if (filename) return filename;
  return model.source === 'manual' ? 'Manual Parts' : 'Model';
}

export default function useBomRows() {
  const { data, isComputing } = useBoardLayoutsQuery();
  const { activeProject, enabledModels } = useProjects();
  const { stocks } = useProjectSettings();

  const stockNames = computed(() => [
    ...new Set(stocks.value.map((s) => s.material).filter(Boolean)),
  ]);

  /**
   * Suggest a near-miss stock name for an unplaced material (FR-MAT-1).
   * Only computed for rows with leftovers — a fully-placed row needs no fix.
   */
  function suggestFor(material: string, leftoverCount: number): string | null {
    if (leftoverCount === 0) return null;
    return suggestStockMatch(material, stockNames.value);
  }

  const manualPartNumbers = computed(() => {
    const models = enabledModels.value;
    const offsets = computePartNumberOffsets(models);
    const set = new Set<number>();
    for (let i = 0; i < models.length; i++) {
      if (models[i].source === 'manual') {
        const seen = new Set<number>();
        for (const part of models[i].parts) {
          if (!seen.has(part.partNumber)) {
            set.add(part.partNumber + offsets[i]);
            seen.add(part.partNumber);
          }
        }
      }
    }
    return set;
  });

  /**
   * Banding override per adjusted part number (F7). Read from the hydrated
   * model parts, which carry `bandedEdges`/`bandingThicknessUm` merged from
   * `partOverrides` — the packing result drops them at the PartToCut boundary.
   */
  const bandingByPartNumber = computed(() => {
    const models = enabledModels.value;
    const offsets = computePartNumberOffsets(models);
    const map = new Map<
      number,
      {
        bandedEdges?: BandedEdges;
        bandingThicknessUm?: Micrometres;
        /** Nominal (finished) extents — the packing result may show cut size. */
        finishedWidthUm: Micrometres;
        finishedLengthUm: Micrometres;
      }
    >();
    for (let i = 0; i < models.length; i++) {
      const seen = new Set<number>();
      for (const part of models[i].parts) {
        if (seen.has(part.partNumber)) continue;
        seen.add(part.partNumber);
        map.set(part.partNumber + offsets[i], {
          bandedEdges: part.bandedEdges,
          bandingThicknessUm: part.bandingThicknessUm,
          finishedWidthUm: part.size.width,
          finishedLengthUm: part.size.length,
        });
      }
    }
    return map;
  });

  const modelByPartNumber = computed(() => {
    const models = enabledModels.value;
    const offsets = computePartNumberOffsets(models);
    const map = new Map<number, { id: string; name: string }>();
    for (let i = 0; i < models.length; i++) {
      const label = modelDisplayName(models[i]);
      const seen = new Set<number>();
      for (const part of models[i].parts) {
        if (seen.has(part.partNumber)) continue;
        map.set(part.partNumber + offsets[i], {
          id: models[i].id,
          name: label,
        });
        seen.add(part.partNumber);
      }
    }
    return map;
  });

  const allRows = computed<BomRow[]>(() => {
    // Use packing engine results when available (authoritative)
    if (data.value != null) {
      const leftoverCounts = new Map<number, number>();
      for (const l of data.value.leftovers) {
        leftoverCounts.set(
          l.partNumber,
          (leftoverCounts.get(l.partNumber) ?? 0) + 1,
        );
      }
      const allPlacements: BoardLayoutLeftover[] = [
        ...data.value.layouts.flatMap((l) => l.placements),
        ...data.value.linearLayouts.flatMap((l) => l.placements),
      ];
      return groupPartsByNumber(allPlacements, data.value.leftovers).map(
        (instanceList) => {
          const part = instanceList[0];
          const model = modelByPartNumber.value.get(part.partNumber);
          const leftoverCount = leftoverCounts.get(part.partNumber) ?? 0;
          const banding = bandingByPartNumber.value.get(part.partNumber);
          return {
            number: part.partNumber,
            name: part.name,
            modelId: model?.id ?? '',
            modelName: model?.name ?? '',
            qty: instanceList.length,
            material: part.material,
            thicknessUm: part.thicknessUm,
            widthUm: part.widthUm,
            lengthUm: part.lengthUm,
            grainLock: part.grainLock,
            bandedEdges: banding?.bandedEdges,
            bandingThicknessUm: banding?.bandingThicknessUm,
            finishedWidthUm: banding?.finishedWidthUm ?? part.widthUm,
            finishedLengthUm: banding?.finishedLengthUm ?? part.lengthUm,
            leftoverCount,
            isManual: manualPartNumbers.value.has(part.partNumber),
            materialSuggestion: suggestFor(part.material, leftoverCount),
          };
        },
      );
    }

    // Fallback: build from raw model parts when engine hasn't run
    const project = activeProject.value;
    if (!project) return [];
    const models = enabledModels.value;
    if (models.length === 0) return [];

    const offsets = computePartNumberOffsets(models);
    const excluded = new Set(project.excludedColors ?? []);
    const groups = new Map<number, BomRow>();

    for (let i = 0; i < models.length; i++) {
      const isManual = models[i].source === 'manual';
      const byPn = new Map<number, Model['parts'][number][]>();
      for (const part of models[i].parts) {
        if (excluded.has(part.colorKey)) continue;
        const list = byPn.get(part.partNumber) ?? [];
        list.push(part);
        byPn.set(part.partNumber, list);
      }
      for (const [pn, parts] of byPn) {
        groups.set(pn + offsets[i], {
          number: pn + offsets[i],
          name: parts[0].name,
          modelId: models[i].id,
          modelName: modelDisplayName(models[i]),
          material: project.colorMap[parts[0].colorKey] ?? parts[0].colorKey,
          qty: parts.length,
          thicknessUm: parts[0].size.thickness,
          widthUm: parts[0].size.width,
          lengthUm: parts[0].size.length,
          grainLock: parts[0].grainLock,
          bandedEdges: parts[0].bandedEdges,
          bandingThicknessUm: parts[0].bandingThicknessUm,
          finishedWidthUm: parts[0].size.width,
          finishedLengthUm: parts[0].size.length,
          leftoverCount: 0,
          isManual,
          materialSuggestion: null,
        });
      }
    }

    return [...groups.values()].sort((a, b) => a.number - b.number);
  });

  /** Summary computeds */
  const totalParts = computed(() =>
    allRows.value.reduce((s, r) => s + r.qty, 0),
  );
  const materialNames = computed(() => [
    ...new Set(allRows.value.map((r) => r.material)),
  ]);
  const warningCount = computed(
    () => allRows.value.filter((r) => r.leftoverCount > 0).length,
  );

  const showModelColumn = computed(
    () =>
      new Set(allRows.value.map((row) => row.modelId).filter(Boolean)).size > 1,
  );

  return {
    allRows,
    isComputing,
    totalParts,
    materialNames,
    warningCount,
    showModelColumn,
    manualPartNumbers,
  };
}
