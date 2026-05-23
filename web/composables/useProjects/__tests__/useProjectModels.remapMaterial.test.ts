/**
 * Tests for remapMaterial — the schema-free material-match recovery (FR-MAT-2).
 *
 * Accepting a near-miss suggestion ("Walnut" → "walnut") must rewrite the
 * project's colorMap so the affected parts now resolve to an existing stock
 * name, with no alias table / migration. We assert on the resulting material
 * assignment (the outcome the packing engine reads), not on call metadata.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { useIdb } from '~/composables/useIdb';
import useProjectModels from '../useProjectModels';
import { activeProjectData } from '../state';

const idb = useIdb();

async function seedProject(colorMap: Record<string, string>): Promise<string> {
  const project = await idb.createProject('RemapTest');
  await idb.updateProject(project.id, { colorMap });
  const full = await idb.getProjectWithModels(project.id);
  activeProjectData.value = full ?? null;
  return project.id;
}

describe('remapMaterial', () => {
  beforeEach(() => {
    activeProjectData.value = null;
  });

  it('rewrites every assignment that targeted the old material', async () => {
    const id = await seedProject({
      '#aaa': 'Walnut',
      '#bbb': 'Walnut',
      '#ccc': 'Oak',
    });

    const { remapMaterial } = useProjectModels();
    await remapMaterial(id, 'Walnut', 'walnut');

    // The parts that read colorMap['#aaa'] / ['#bbb'] now resolve to the
    // existing stock name, so the engine re-matches them.
    expect(activeProjectData.value?.colorMap).toEqual({
      '#aaa': 'walnut',
      '#bbb': 'walnut',
      '#ccc': 'Oak',
    });

    // Persisted, so the recovery survives reload.
    const stored = await idb.getProjectWithModels(id);
    expect(stored?.colorMap).toEqual({
      '#aaa': 'walnut',
      '#bbb': 'walnut',
      '#ccc': 'Oak',
    });
  });

  it('handles manual parts where the colorKey is the material string', async () => {
    // Manual parts use the material string itself as the colorKey, mapped
    // to the same value. Remapping the value (not the key) is enough for the
    // layout query, which reads colorMap[colorKey].
    const id = await seedProject({ 'Walnut ': 'Walnut ' });

    const { remapMaterial } = useProjectModels();
    await remapMaterial(id, 'Walnut ', 'Walnut');

    expect(activeProjectData.value?.colorMap['Walnut ']).toBe('Walnut');
  });
});
