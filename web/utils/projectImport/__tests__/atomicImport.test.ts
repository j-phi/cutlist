/**
 * F3 — FR-DUR-4/-5/-6: atomic import + export-all round-trip.
 *
 * These run against real fake-indexeddb (not the mock facade) because the
 * guarantee under test is a *Dexie transaction* — a property of the real DB,
 * not of the per-method stub. We assert post-import table state (zero orphans
 * on failure, equal counts on success), never mock-shape.
 */

import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../../versions';
import {
  importArchiveData,
  importProjectDataAtomic,
  parseProjectExport,
} from '..';
import { buildExportAllData } from '~/composables/useExportProject';
import { getDb } from '~/composables/useIdb/db';
import { useIdb } from '~/composables/useIdb';
import { makePayload } from './_helpers';

describe('FR-DUR-5 — atomic import rollback', () => {
  it('leaves zero rows when a model write fails mid-import', async () => {
    const payload = makePayload();
    // Two models so the 2nd write can throw after the 1st succeeded.
    payload.models.push({
      ...payload.models[0],
      id: 'model-2',
      filename: 'second.gltf',
    });
    const data = parseProjectExport(payload);

    const db = await getDb();
    let createModelCalls = 0;
    await expect(
      importProjectDataAtomic(data, {
        // Inject a fault on the 2nd model write. The first project + model
        // rows are already written inside the transaction at this point.
        onCreateModel: () => {
          createModelCalls += 1;
          if (createModelCalls === 2) {
            throw new Error('simulated quota failure');
          }
        },
      }),
    ).rejects.toThrow('simulated quota failure');

    // The transaction must have rolled back: nothing from this import remains.
    expect(await db.projects.count()).toBe(0);
    expect(await db.models.count()).toBe(0);
    expect(await db.assets.count()).toBe(0);
    expect(await db.buildDocs.count()).toBe(0);
  });
});

describe('FR-DUR-6 — export all + re-import round-trip', () => {
  it('round-trips two projects with equal model counts', async () => {
    const idb = useIdb();

    // Build two real projects, each with one model.
    const a = await idb.createProject('Alpha', { distanceUnit: 'mm' });
    await idb.createModel({
      id: crypto.randomUUID(),
      projectId: a.id,
      filename: 'alpha.gltf',
      source: 'gltf',
      parts: [],
      colors: [],
      nodePartMap: [],
      enabled: true,
      rawSource: { asset: { version: '2.0' } },
      partOverrides: {},
      createdAt: new Date().toISOString(),
    });

    const b = await idb.createProject('Beta', { distanceUnit: 'mm' });
    await idb.createModel({
      id: crypto.randomUUID(),
      projectId: b.id,
      filename: 'beta-1.gltf',
      source: 'gltf',
      parts: [],
      colors: [],
      nodePartMap: [],
      enabled: true,
      rawSource: { asset: { version: '2.0' } },
      partOverrides: {},
      createdAt: new Date().toISOString(),
    });
    await idb.createModel({
      id: crypto.randomUUID(),
      projectId: b.id,
      filename: 'beta-2.gltf',
      source: 'gltf',
      parts: [],
      colors: [],
      nodePartMap: [],
      enabled: true,
      rawSource: { asset: { version: '2.0' } },
      partOverrides: {},
      createdAt: new Date().toISOString(),
    });

    const archive = await buildExportAllData(idb);
    expect(archive.version).toBe(SCHEMA_VERSION);
    expect(archive.projects).toHaveLength(2);

    // Wipe the DB to simulate importing into a clean browser.
    const db = await getDb();
    await db.projects.clear();
    await db.models.clear();

    const newIds = await importArchiveData(archive);
    expect(newIds).toHaveLength(2);

    const projects = await db.projects.toArray();
    expect(projects.map((p) => p.name).sort()).toEqual(['Alpha', 'Beta']);

    // Model counts per imported project match the source (1 for Alpha, 2 for Beta).
    const countsByName = new Map<string, number>();
    for (const p of projects) {
      const models = await db.models.where('projectId').equals(p.id).toArray();
      countsByName.set(p.name, models.length);
    }
    expect(countsByName.get('Alpha')).toBe(1);
    expect(countsByName.get('Beta')).toBe(2);
  });
});
