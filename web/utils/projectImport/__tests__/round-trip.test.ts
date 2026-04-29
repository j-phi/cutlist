/**
 * Spec 00 round-trip: a project carrying scenes and annotations survives
 * JSON serialization + parse + import with structural equality (modulo
 * fresh IDs assigned on import).
 */

import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../../versions';
import { importProjectData, parseProjectExport } from '..';
import type { ProjectExport } from '~/composables/useExportProject';

function makeIdbMock() {
  const calls = {
    createProject: [] as any[],
    updateProject: [] as any[],
    createModel: [] as any[],
    createBuildStep: [] as any[],
    createScene: [] as any[],
    createAnnotation: [] as any[],
  };
  return {
    calls,
    db: {
      async createProject(name: string, opts?: any) {
        calls.createProject.push({ name, opts });
        return { id: 'new-proj' };
      },
      async updateProject(id: string, patch: any) {
        calls.updateProject.push({ id, patch });
      },
      async createModel(model: any) {
        calls.createModel.push(model);
      },
      async createBuildStep(step: any) {
        calls.createBuildStep.push(step);
      },
      async createScene(scene: any) {
        calls.createScene.push(scene);
      },
      async createAnnotation(annotation: any) {
        calls.createAnnotation.push(annotation);
      },
    },
  };
}

function makePayload(): ProjectExport {
  const now = '2026-04-29T10:00:00.000Z';
  return {
    version: SCHEMA_VERSION,
    exportedAt: now,
    project: {
      id: 'proj-1',
      name: 'Round Trip',
      colorMap: { '#aaa': 'Plywood' },
      excludedColors: [],
      stock: 'stock yaml',
      distanceUnit: 'mm',
      bladeWidth: 3,
      margin: 0,
      optimize: 'Auto',
      showPartNumbers: true,
      createdAt: now,
      updatedAt: now,
    },
    models: [],
    buildSteps: [],
    scenes: [
      {
        id: 'scene-1',
        projectId: 'proj-1',
        name: 'Front',
        order: 0,
        cameraMode: 'perspective',
        cameraPose: { position: [1, 2, 3], target: [0, 0, 0] },
        objectOffsets: {
          5: { position: [0.1, 0, 0], quaternion: [0, 0, 0, 1] },
        },
        floorVisible: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'scene-2',
        projectId: 'proj-1',
        name: 'Top',
        order: 1,
        cameraMode: 'orthographic',
        cameraPose: { position: [0, 5, 0], target: [0, 0, 0] },
        objectOffsets: {},
        visibleObjects: [1, 2, 3],
        floorVisible: false,
        thumbnailDataUrl: 'data:image/png;base64,xx',
        createdAt: now,
        updatedAt: now,
      },
    ],
    annotations: [
      {
        id: 'ann-1',
        sceneId: 'scene-1',
        kind: 'callout',
        groupId: 5,
        anchorLocal: [0, 0, 0],
        anchorNormalLocal: [0, 0, 1],
        labelOffsetLocal: [0.5, 0.5, 0],
        text: 'Domino at 50%',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ann-2',
        sceneId: 'scene-1',
        kind: 'dimension',
        groupId: 5,
        anchor1: { groupId: 5, local: [0, 0, 0] },
        anchor2: { groupId: 5, local: [1, 0, 0] },
        offsetLocal: [0, 0.2, 0],
        text: '100 mm',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ann-3',
        sceneId: 'scene-2',
        kind: 'callout',
        groupId: 8,
        anchorLocal: [0.2, 0.2, 0.2],
        anchorNormalLocal: [1, 0, 0],
        labelOffsetLocal: [1, 0, 0],
        text: 'Top corner',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ann-4',
        sceneId: 'scene-2',
        kind: 'dimension',
        groupId: 9,
        anchor1: { groupId: 9, local: [0, 0, 0] },
        anchor2: { groupId: 9, local: [0, 1, 0] },
        offsetLocal: [0.3, 0, 0],
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

describe('Spec 00 — scenes & annotations round-trip', () => {
  it('preserves scene & annotation content through serialize → parse → import', async () => {
    const original = makePayload();

    // Simulate the file boundary: the export is a JSON-serialized blob.
    const parsed = parseProjectExport(JSON.parse(JSON.stringify(original)));
    expect(parsed.scenes).toHaveLength(2);
    expect(parsed.annotations).toHaveLength(4);

    const { db, calls } = makeIdbMock();
    await importProjectData(parsed, db as any);

    // Two scenes were imported, with new IDs and projectId remapped.
    expect(calls.createScene).toHaveLength(2);
    const sceneIds = calls.createScene.map((s: any) => s.id);
    expect(new Set(sceneIds).size).toBe(2);
    for (const s of calls.createScene) {
      expect(s.projectId).toBe('new-proj');
      expect(s.id).not.toBe('scene-1');
      expect(s.id).not.toBe('scene-2');
    }

    // Each annotation got a new id and a sceneId remapped to one of the new
    // scene ids — preserving its original scene grouping. Imports preserve
    // input array order, so we can pair positionally.
    expect(calls.createAnnotation).toHaveLength(4);
    const newSceneIdByOld = new Map<string, string>();
    for (let i = 0; i < calls.createScene.length; i++) {
      const oldId = original.scenes![i].id;
      newSceneIdByOld.set(oldId, calls.createScene[i].id);
    }
    for (let i = 0; i < calls.createAnnotation.length; i++) {
      const ann = calls.createAnnotation[i];
      const orig = original.annotations![i];
      expect(ann.sceneId).toBe(newSceneIdByOld.get(orig.sceneId));
      // Every field aside from id/sceneId is unchanged.
      const { id: _i, sceneId: _s, ...annContent } = ann;
      const { id: _oi, sceneId: _os, ...origContent } = orig;
      expect(annContent).toEqual(origContent);
    }

    // Annotations on scene-1 stay attached to the new scene-1 id.
    const newScene1Id = newSceneIdByOld.get('scene-1')!;
    const onScene1 = calls.createAnnotation.filter(
      (a: any) => a.sceneId === newScene1Id,
    );
    expect(onScene1).toHaveLength(2);
    expect(onScene1.map((a: any) => a.kind).sort()).toEqual([
      'callout',
      'dimension',
    ]);
  });

  it('drops orphan annotations whose scene is not in the payload', async () => {
    const payload = makePayload();
    payload.annotations!.push({
      id: 'orphan',
      sceneId: 'scene-missing',
      kind: 'callout',
      groupId: 99,
      anchorLocal: [0, 0, 0],
      anchorNormalLocal: [0, 0, 1],
      labelOffsetLocal: [0, 0, 0],
      text: 'lost',
      createdAt: '2026-04-29T10:00:00.000Z',
      updatedAt: '2026-04-29T10:00:00.000Z',
    });

    const parsed = parseProjectExport(JSON.parse(JSON.stringify(payload)));
    const { db, calls } = makeIdbMock();
    await importProjectData(parsed, db as any);

    // 4 valid + 1 orphan in the payload, only 4 imported.
    expect(calls.createAnnotation).toHaveLength(4);
    expect(
      calls.createAnnotation.find((a: any) => a.text === 'lost'),
    ).toBeUndefined();
  });

  it('payload without scenes/annotations still imports cleanly', async () => {
    const payload = makePayload();
    delete payload.scenes;
    delete payload.annotations;

    const parsed = parseProjectExport(JSON.parse(JSON.stringify(payload)));
    const { db, calls } = makeIdbMock();
    await importProjectData(parsed, db as any);

    expect(calls.createScene).toHaveLength(0);
    expect(calls.createAnnotation).toHaveLength(0);
    expect(calls.createProject).toHaveLength(1);
  });
});
