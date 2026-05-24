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
import { v5ProjectMigration, v5ModelMigration } from './v5';
import { v6Migration } from './v6';
import { v7Migration } from './v7';
import { v8Migration } from './v8';
import { v9Migration } from './v9';
import { v10Migration } from './v10';
import { v11Migration } from './v11';
import { v12Migration } from './v12';

export type { IdbRecord, RecordMigration, StoreName } from './types';
export { migrateProjectToMmStorage } from './v3';
export { migrateProjectDropArchivedAt } from './v4';
export {
  migrateProjectScalarsToUm,
  migrateModelToV5,
  migrateModelPartsToUm,
  migrateModelSourceLabel,
} from './v5';
export { migrateProjectStockToArray } from './v6';
export { migrateProjectStockRoles } from './v7';
export { migrateProjectStockNames } from './v8';
export { migrateProjectStockCost } from './v9';
export { migrateProjectPhase1Fields } from './v10';
export { migrateProjectMeasurementMode } from './v11';
export { migrateProjectStockPerItemCost } from './v12';

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

  // v4: drop the `archivedAt` field from project records. "Open as a tab" is
  // session/UI state now (see `~/composables/useOpenTabs`), not data about
  // the project. Mirror of the Dexie .version(4).upgrade() in
  // `~/composables/useIdb/db`.
  v4Migration,

  // v5: integer micrometres become the engine and storage domain.
  // Project scalars convert from float mm → integer µm; model part sizes
  // convert from float meters → integer µm. Mirror of `.version(5).upgrade()`.
  v5ProjectMigration,
  v5ModelMigration,

  // v6: project stock moves from YAML string (`stock`) to structured array
  // (`stocks: StockMatrix[]`). The Dexie .version(6).upgrade() in
  // `~/composables/useIdb/db` runs the same transform.
  v6Migration,

  // v7: stock entries gain a `role` tier ('offcut' | 'general') and offcut
  // sizes carry a `quantity`. Pre-v7 stock is all general; stamp the default.
  // Mirror of the Dexie .version(7).upgrade() in `~/composables/useIdb/db`.
  v7Migration,

  // v8: stock gains a per-item `name`; `material` becomes a category. The old
  // `material` string moves to `name` and `material` resets to 'Uncategorized'.
  // Mirror of the Dexie .version(8).upgrade() in `~/composables/useIdb/db`.
  v8Migration,

  // v9: stock sizes gain an optional `cost?: number` (material-cost reporting,
  // F2). Purely additive — a v8 record is already valid at v9 — so the
  // transform is a no-op. Mirror of the Dexie .version(9).upgrade().
  v9Migration,

  // v10 — batch of Phase-1 persisted project fields (XR-1: one bump for all
  // same-phase fields): layout alignment (F13), label placement (F20), the
  // banding defaults (F7), and the optimization objective (F11). The new
  // `PartOverride` fields are migration-free (read-path safety net). Mirror of
  // the Dexie .version(10).upgrade() in `~/composables/useIdb/db`.
  v10Migration,

  // v11 — project gains `measurementMode` (F20 Part B): how placed-part
  // measurements render on the board diagram. Default `'edge'`. Presentational
  // (never enters the layout fingerprint). Mirror of the Dexie
  // .version(11).upgrade() in `~/composables/useIdb/db`.
  v11Migration,

  // v12 — per-board/stick cost moves from the size-level `cost` field to a
  // per-thickness / per-length record (`thicknessCosts` / `lengthCosts`).
  // Sheet: `sizes[].cost` → `sizes[].thicknessCosts[String(thickness)]`.
  // Linear: `size.cost` → `size.lengthCosts[String(length)]`. Mirror of the
  // Dexie .version(12).upgrade() in `~/composables/useIdb/db`.
  v12Migration,
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
