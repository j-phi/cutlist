/**
 * Model and part operations on the active project.
 *
 * Covers source-model lifecycle (add/remove/toggle), color-map mutations,
 * part overrides (grain lock, name override), and manual-part CRUD. Each
 * function returns early when the requested `projectId` is not the active
 * project so calls remain safe across project switches.
 */
import type { Part } from '~/utils/modelTypes';
import { useIdb, type PartOverride } from '~/composables/useIdb';
import { applyOverrides } from '~/utils/modelHydration';
import { computePartNumberOffsets } from '~/utils/partNumberOffsets';
import { activeProjectData } from './state';
import type { ManualPartInput, Model } from './types';

export default function useProjectModels() {
  const idb = useIdb();

  async function addModel(projectId: string, model: Model) {
    if (activeProjectData.value?.id === projectId) {
      const { rawSource: _r, ...meta } = model;
      activeProjectData.value = {
        ...activeProjectData.value,
        models: [...activeProjectData.value.models, meta],
      };
    }
    await idb.createModel({
      id: model.id,
      projectId,
      filename: model.filename,
      source: model.source,
      parts: model.parts,
      colors: model.colors ?? [],
      nodePartMap: model.nodePartMap ?? [],
      enabled: model.enabled,
      rawSource: model.rawSource ?? null,
      partOverrides: {},
      createdAt: new Date().toISOString(),
    });
  }

  async function removeModel(projectId: string, modelId: string) {
    if (activeProjectData.value?.id === projectId) {
      activeProjectData.value = {
        ...activeProjectData.value,
        models: activeProjectData.value.models.filter((m) => m.id !== modelId),
      };
    }
    await idb.deleteModel(modelId);
  }

  async function toggleModel(projectId: string, modelId: string) {
    const current = activeProjectData.value?.models.find(
      (m) => m.id === modelId,
    );
    const newEnabled = current ? !current.enabled : true;

    if (activeProjectData.value?.id === projectId) {
      activeProjectData.value = {
        ...activeProjectData.value,
        models: activeProjectData.value.models.map((m) =>
          m.id === modelId ? { ...m, enabled: newEnabled } : m,
        ),
      };
    }
    await idb.updateModel(modelId, { enabled: newEnabled });
  }

  async function updateColorMap(
    id: string,
    colorKey: string,
    material: string,
  ) {
    const project = activeProjectData.value;
    if (!project || project.id !== id) return;
    const newColorMap = { ...project.colorMap, [colorKey]: material };
    activeProjectData.value = { ...project, colorMap: newColorMap };
    await idb.updateProject(id, { colorMap: newColorMap });
  }

  async function toggleColorExcluded(id: string, colorKey: string) {
    const project = activeProjectData.value;
    if (!project || project.id !== id) return;
    const excluded = project.excludedColors ?? [];
    const newExcluded = excluded.includes(colorKey)
      ? excluded.filter((k) => k !== colorKey)
      : [...excluded, colorKey];
    activeProjectData.value = { ...project, excludedColors: newExcluded };
    await idb.updateProject(id, { excludedColors: newExcluded });
  }

  /** Apply a partial override to a part by its adjusted (project-wide) number. */
  async function applyPartOverride(
    projectId: string,
    adjustedPartNumber: number,
    patch: Partial<PartOverride>,
  ) {
    const project = activeProjectData.value;
    if (!project || project.id !== projectId) return;

    const enabled = project.models.filter((m) => m.enabled);
    const offsets = computePartNumberOffsets(enabled);

    for (let i = 0; i < enabled.length; i++) {
      const model = enabled[i];
      const targetPartNumber = adjustedPartNumber - offsets[i];
      if (!model.parts.some((d) => d.partNumber === targetPartNumber)) continue;

      const updatedParts: Part[] = model.parts.map((d) =>
        d.partNumber === targetPartNumber ? { ...d, ...patch } : d,
      );
      activeProjectData.value = {
        ...project,
        models: project.models.map((m) =>
          m.id === model.id ? { ...m, parts: updatedParts } : m,
        ),
      };

      const existing = await idb.getProjectWithModels(projectId);
      const idbModel = existing?.models.find((m) => m.id === model.id);
      const currentOverrides = { ...(idbModel?.partOverrides ?? {}) };
      const merged = { ...currentOverrides[targetPartNumber], ...patch };
      const cleaned = Object.fromEntries(
        Object.entries(merged).filter(([, v]) => v !== undefined),
      ) as PartOverride;
      if (Object.keys(cleaned).length === 0) {
        delete currentOverrides[targetPartNumber];
      } else {
        currentOverrides[targetPartNumber] = cleaned;
      }
      await idb.updateModel(model.id, { partOverrides: currentOverrides });
      break;
    }
  }

  async function updatePartGrainLock(
    projectId: string,
    adjustedPartNumber: number,
    grainLock: 'length' | 'width' | undefined,
  ) {
    await applyPartOverride(projectId, adjustedPartNumber, { grainLock });
  }

  async function updatePartNameOverride(
    projectId: string,
    adjustedPartNumber: number,
    name: string,
  ) {
    const nextName = name.trim();
    if (!nextName) return;
    await applyPartOverride(projectId, adjustedPartNumber, { name: nextName });
  }

  /** Batch-set (or clear) `name` on every part that matches `colorKey`. */
  async function batchRenameByColor(
    projectId: string,
    colorKey: string,
    name: string | undefined,
  ) {
    const project = activeProjectData.value;
    if (!project || project.id !== projectId) return;

    const trimmed = name?.trim() || undefined;
    const clearing = trimmed === undefined;
    const enabled = project.models.filter((m) => m.enabled);

    // Read IDB up-front so we can restore original names when clearing
    const existing = await idb.getProjectWithModels(projectId);
    if (!existing) return;

    const affectedModels: { modelId: string; partNumbers: Set<number> }[] = [];
    let updatedModels = project.models;

    for (const model of enabled) {
      const partNumbers = new Set<number>();
      for (const part of model.parts) {
        if (part.colorKey === colorKey) partNumbers.add(part.partNumber);
      }
      if (partNumbers.size === 0) continue;
      affectedModels.push({ modelId: model.id, partNumbers });

      // When clearing, restore each part's original name from IDB
      const idbModel = existing.models.find((m) => m.id === model.id);
      const originalNames = new Map<number, string>();
      if (clearing && idbModel) {
        for (const p of idbModel.parts) {
          if (partNumbers.has(p.partNumber))
            originalNames.set(p.partNumber, p.name);
        }
      }

      const updatedParts = model.parts.map((p) => {
        if (!partNumbers.has(p.partNumber)) return p;
        if (clearing) {
          return { ...p, name: originalNames.get(p.partNumber) ?? p.name };
        }
        return { ...p, name: trimmed };
      });
      updatedModels = updatedModels.map((m) =>
        m.id === model.id ? { ...m, parts: updatedParts } : m,
      );
    }

    activeProjectData.value = { ...project, models: updatedModels };

    // Persist override changes to IDB
    const patch: Partial<PartOverride> = { name: trimmed };
    for (const { modelId, partNumbers } of affectedModels) {
      const idbModel = existing.models.find((m) => m.id === modelId);
      const overrides = { ...(idbModel?.partOverrides ?? {}) };
      for (const pn of partNumbers) {
        const merged = { ...overrides[pn], ...patch };
        const cleaned = Object.fromEntries(
          Object.entries(merged).filter(([, v]) => v !== undefined),
        ) as PartOverride;
        if (Object.keys(cleaned).length === 0) delete overrides[pn];
        else overrides[pn] = cleaned;
      }
      await idb.updateModel(modelId, { partOverrides: overrides });
    }
  }

  // ─── Manual-part CRUD ───────────────────────────────────────────────────────

  async function addManualPart(projectId: string, data: ManualPartInput) {
    const project = activeProjectData.value;
    if (!project || project.id !== projectId) return;

    const existing = project.models.find((m) => m.source === 'manual');
    const newPartNumber = existing
      ? Math.max(0, ...existing.parts.map((d) => d.partNumber)) + 1
      : 1;

    const newParts: Part[] = Array.from({ length: data.qty }, (_, i) => ({
      partNumber: newPartNumber,
      instanceNumber: i + 1,
      name: data.name,
      colorKey: data.material,
      size: {
        width: data.widthUm,
        length: data.lengthUm,
        thickness: data.thicknessUm,
      },
    }));

    // grainLock goes into partOverrides, not onto the Part
    const newOverrides: Record<number, PartOverride> = {};
    if (data.grainLock) {
      newOverrides[newPartNumber] = { grainLock: data.grainLock };
    }

    if (existing) {
      const updatedParts = [...existing.parts, ...newParts];
      const idbModel = (await idb.getProjectWithModels(projectId))?.models.find(
        (m) => m.id === existing.id,
      );
      const mergedOverrides = {
        ...(idbModel?.partOverrides ?? {}),
        ...newOverrides,
      };
      activeProjectData.value = {
        ...project,
        models: project.models.map((m) =>
          m.id === existing.id
            ? { ...m, parts: applyOverrides(updatedParts, mergedOverrides) }
            : m,
        ),
      };
      await idb.updateModel(existing.id, {
        parts: updatedParts,
        partOverrides: mergedOverrides,
      });
    } else {
      const modelId = crypto.randomUUID();
      const model = {
        id: modelId,
        filename: 'Manual Parts',
        source: 'manual' as const,
        parts: applyOverrides(newParts, newOverrides),
        colors: [],
        enabled: true,
      };
      activeProjectData.value = {
        ...project,
        models: [...project.models, model],
      };
      await idb.createModel({
        id: modelId,
        projectId,
        filename: model.filename,
        source: 'manual',
        parts: newParts,
        colors: [],
        nodePartMap: [],
        enabled: true,
        rawSource: null,
        partOverrides: newOverrides,
        createdAt: new Date().toISOString(),
      });
    }

    if (!project.colorMap[data.material]) {
      await updateColorMap(projectId, data.material, data.material);
    }
  }

  async function addManualParts(projectId: string, inputs: ManualPartInput[]) {
    if (inputs.length === 0) return;
    const project = activeProjectData.value;
    if (!project || project.id !== projectId) return;

    const existing = project.models.find((m) => m.source === 'manual');
    let counter = existing
      ? Math.max(0, ...existing.parts.map((d) => d.partNumber)) + 1
      : 1;

    const newParts: Part[] = [];
    const newOverrides: Record<number, PartOverride> = {};

    for (const input of inputs) {
      const partNumber = counter++;
      for (let i = 0; i < input.qty; i++) {
        newParts.push({
          partNumber,
          instanceNumber: i + 1,
          name: input.name,
          colorKey: input.material,
          size: {
            width: input.widthUm,
            length: input.lengthUm,
            thickness: input.thicknessUm,
          },
        });
      }
      // grainLock goes into partOverrides, not onto the Part
      if (input.grainLock) {
        newOverrides[partNumber] = { grainLock: input.grainLock };
      }
    }

    if (existing) {
      const updatedParts = [...existing.parts, ...newParts];
      const idbModel = (await idb.getProjectWithModels(projectId))?.models.find(
        (m) => m.id === existing.id,
      );
      const mergedOverrides = {
        ...(idbModel?.partOverrides ?? {}),
        ...newOverrides,
      };
      activeProjectData.value = {
        ...project,
        models: project.models.map((m) =>
          m.id === existing.id
            ? { ...m, parts: applyOverrides(updatedParts, mergedOverrides) }
            : m,
        ),
      };
      await idb.updateModel(existing.id, {
        parts: updatedParts,
        partOverrides: mergedOverrides,
      });
    } else {
      const modelId = crypto.randomUUID();
      const model = {
        id: modelId,
        filename: 'Manual Parts',
        source: 'manual' as const,
        parts: applyOverrides(newParts, newOverrides),
        colors: [],
        enabled: true,
      };
      activeProjectData.value = {
        ...project,
        models: [...project.models, model],
      };
      await idb.createModel({
        id: modelId,
        projectId,
        filename: model.filename,
        source: 'manual',
        parts: newParts,
        colors: [],
        nodePartMap: [],
        enabled: true,
        rawSource: null,
        partOverrides: newOverrides,
        createdAt: new Date().toISOString(),
      });
    }

    // colorMap reconciliation — one write for the whole batch
    const current = activeProjectData.value;
    if (current) {
      const newColorMap = { ...current.colorMap };
      let changed = false;
      for (const input of inputs) {
        if (!(input.material in newColorMap)) {
          newColorMap[input.material] = input.material;
          changed = true;
        }
      }
      if (changed) {
        activeProjectData.value = { ...current, colorMap: newColorMap };
        await idb.updateProject(projectId, { colorMap: newColorMap });
      }
    }
  }

  async function updateManualPart(
    projectId: string,
    partNumber: number,
    data: ManualPartInput,
  ) {
    const project = activeProjectData.value;
    if (!project || project.id !== projectId) return;

    const existing = project.models.find((m) => m.source === 'manual');
    if (!existing) return;

    const remaining = existing.parts.filter((d) => d.partNumber !== partNumber);
    const updated: Part[] = Array.from({ length: data.qty }, (_, i) => ({
      partNumber,
      instanceNumber: i + 1,
      name: data.name,
      colorKey: data.material,
      size: {
        width: data.widthUm,
        length: data.lengthUm,
        thickness: data.thicknessUm,
      },
    }));
    // Strip overrides from remaining parts (they live in partOverrides)
    const cleanParts = [...remaining, ...updated].map(
      ({ grainLock: _, ...rest }) => rest,
    );

    const idbModel = (await idb.getProjectWithModels(projectId))?.models.find(
      (m) => m.id === existing.id,
    );
    const updatedOverrides = { ...(idbModel?.partOverrides ?? {}) };
    if (data.grainLock) {
      updatedOverrides[partNumber] = {
        ...updatedOverrides[partNumber],
        grainLock: data.grainLock,
      };
    } else if (updatedOverrides[partNumber]) {
      const { grainLock: _, ...rest } = updatedOverrides[partNumber];
      if (Object.keys(rest).length === 0) {
        delete updatedOverrides[partNumber];
      } else {
        updatedOverrides[partNumber] = rest;
      }
    }

    activeProjectData.value = {
      ...project,
      models: project.models.map((m) =>
        m.id === existing.id
          ? { ...m, parts: applyOverrides(cleanParts, updatedOverrides) }
          : m,
      ),
    };
    await idb.updateModel(existing.id, {
      parts: cleanParts,
      partOverrides: updatedOverrides,
    });

    if (!project.colorMap[data.material]) {
      await updateColorMap(projectId, data.material, data.material);
    }
  }

  async function removeManualPart(projectId: string, partNumber: number) {
    const project = activeProjectData.value;
    if (!project || project.id !== projectId) return;

    const existing = project.models.find((m) => m.source === 'manual');
    if (!existing) return;

    const remaining = existing.parts.filter((d) => d.partNumber !== partNumber);

    if (remaining.length === 0) {
      activeProjectData.value = {
        ...project,
        models: project.models.filter((m) => m.id !== existing.id),
      };
      await idb.deleteModel(existing.id);
      return;
    }

    const idbModel = (await idb.getProjectWithModels(projectId))?.models.find(
      (m) => m.id === existing.id,
    );
    const updatedOverrides = { ...(idbModel?.partOverrides ?? {}) };
    delete updatedOverrides[partNumber];

    // Persist raw parts only. Grain locks live in partOverrides.
    const cleanParts = remaining.map(({ grainLock: _, ...rest }) => rest);

    activeProjectData.value = {
      ...project,
      models: project.models.map((m) =>
        m.id === existing.id
          ? { ...m, parts: applyOverrides(cleanParts, updatedOverrides) }
          : m,
      ),
    };
    await idb.updateModel(existing.id, {
      parts: cleanParts,
      partOverrides: updatedOverrides,
    });
  }

  return {
    addModel,
    removeModel,
    toggleModel,
    updateColorMap,
    toggleColorExcluded,
    addManualPart,
    addManualParts,
    updateManualPart,
    removeManualPart,
    updatePartGrainLock,
    updatePartNameOverride,
    batchRenameByColor,
  };
}
