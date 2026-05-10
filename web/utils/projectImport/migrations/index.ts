/**
 * Migration registry + export-import migration pipeline.
 *
 * This file is the single registry: it imports each per-version transform
 * from `./v<N>.ts` and exposes the ordered `migrations[]` array. It owns
 * no version-specific logic — adding a new schema version means a new
 * `./v<N>.ts` file plus one line here.
 *
 * Mirroring contract: every entry registered here must also be expressed
 * as a Dexie `.version(N).upgrade()` block on `CutlistDB` in
 * `~/composables/useIdb/db`. Both paths run the same per-version
 * transform so local IDB upgrades and `.cutlist` imports converge on the
 * same final shape.
 *
 * Rules for the `migrations` array:
 *   - Append only; never edit or delete a shipped entry.
 *   - Pure functions (no side effects, no async).
 *   - Defensive — must not throw on malformed input. A throw inside Dexie
 *     rolls back the transaction and leaves the user unable to open the DB.
 */

import {
  FutureSchemaError,
  LegacyExportError,
  MIN_SUPPORTED_EXPORT_VERSION,
  SCHEMA_VERSION,
} from '../../versions';
import type { IdbRecord, RecordMigration, StoreName } from './types';
import { v3Migration } from './v3';
import { v4Migration } from './v4';

export type { IdbRecord, RecordMigration, StoreName } from './types';
export { migrateProjectToMmStorage } from './v3';
export { migrateStockToV4 } from './v4';

/** Ordered, append-only record migration list. */
export const migrations: RecordMigration[] = [
  // v1 baseline: nothing to migrate. Older formats are rejected with
  // `LegacyExportError` in `migrateExport` rather than transformed.

  // v2: `optimize: 'Auto' | 'CNC'` → `defaultAlgorithm: Algorithm`. Mirror
  // of the Dexie .version(2).upgrade() in `~/composables/useIdb/db`.
  {
    version: 2,
    store: 'projects',
    migrate: (record) => {
      const next: IdbRecord = {
        ...record,
        defaultAlgorithm: record.optimize === 'CNC' ? 'cnc' : 'auto',
      };
      delete next.optimize;
      return next;
    },
  },

  v3Migration,

  // v4: stamp explicit `kind: 'sheet'` on existing stock-YAML rows so the
  // discriminated `StockMatrix` union parses them as the sheet variant.
  v4Migration,
];

/** Apply all migrations for a store from `fromVersion` to SCHEMA_VERSION. */
export function migrateRecord(
  store: StoreName,
  record: IdbRecord,
  fromVersion: number,
): IdbRecord {
  let result = record;
  for (const m of migrations) {
    if (m.store === store && m.version > fromVersion) {
      result = m.migrate(result);
    }
  }
  return result;
}

// ─── Export migration ─────────────────────────────────────────────────────────

interface RawExport {
  version?: number;
  project?: IdbRecord;
  models?: IdbRecord[];
  buildDoc?: IdbRecord;
  scenes?: IdbRecord[];
  annotations?: IdbRecord[];
  [key: string]: unknown;
}

/**
 * Migrate an imported `.cutlist` from its version to `SCHEMA_VERSION`.
 * Throws `FutureSchemaError` when the export advertises a version greater
 * than this client supports — the same error class used on DB open, so
 * callers can handle "future schema" uniformly regardless of source.
 */
export function migrateExport(raw: RawExport): RawExport {
  const fromVersion = raw.version ?? 0;

  if (fromVersion > SCHEMA_VERSION) {
    throw new FutureSchemaError(fromVersion, 'export');
  }

  if (fromVersion < MIN_SUPPORTED_EXPORT_VERSION) {
    throw new LegacyExportError(fromVersion);
  }

  if (fromVersion >= SCHEMA_VERSION) return raw;

  const project = raw.project
    ? migrateRecord('projects', raw.project, fromVersion)
    : raw.project;

  const models = (raw.models ?? []).map((m) =>
    migrateRecord('models', m, fromVersion),
  );

  const buildDoc = raw.buildDoc
    ? migrateRecord('buildDoc', raw.buildDoc, fromVersion)
    : raw.buildDoc;

  const scenes = (raw.scenes ?? []).map((s) =>
    migrateRecord('scenes', s, fromVersion),
  );

  const annotations = (raw.annotations ?? []).map((a) =>
    migrateRecord('annotations', a, fromVersion),
  );

  return {
    ...raw,
    version: SCHEMA_VERSION,
    project,
    models,
    buildDoc,
    scenes,
    annotations,
  };
}
