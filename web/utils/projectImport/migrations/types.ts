/**
 * Shared types for the migration pipeline. Kept separate so per-version
 * migration files can import them without taking a dependency on the
 * registry, which imports them in turn.
 */

export type StoreName =
  | 'projects'
  | 'models'
  | 'buildDoc'
  | 'scenes'
  | 'annotations';

/** A loosely-typed export record (string-keyed object with unknown values). */
export type IdbRecord = Record<string, unknown>;

export interface RecordMigration {
  /** The version this migration brings records TO. */
  version: number;
  store: StoreName;
  /** Pure function: old record in, patched record out. */
  migrate: (record: IdbRecord) => IdbRecord;
}
