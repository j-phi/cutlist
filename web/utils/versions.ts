/**
 * Cross-cutting version constants and the shared schema error class.
 *
 * These values are referenced by multiple unrelated subsystems (IDB open
 * path, export/import pipeline), so they live in their own tiny module to
 * avoid pulling in unrelated dependencies wherever they're used.
 *
 * Bump policies:
 * - `SCHEMA_VERSION` — any IDB record type's fields change. Must also add
 *   a matching `this.version(N)` call on `CutlistDB` and (if the change
 *   affects exported data) a record migration entry in
 *   `./projectImport/migrations`.
 */

/**
 * Schema version for record shapes. Must equal the highest Dexie
 * `.version(N)` declared on `CutlistDB`. Never decrement.
 */
export const SCHEMA_VERSION = 8;

/**
 * The lowest export-file schema version this client can still parse.
 * Older `.cutlist` files raise `LegacyExportError` rather than failing in
 * Zod validation with a confusing field-level error.
 */
export const MIN_SUPPORTED_EXPORT_VERSION = 1;

/**
 * Thrown when data (a stored DB or an imported export file) was created by
 * a newer version of Cutlist than the one currently running. Prevents
 * silent corruption by refusing to proceed.
 *
 * Raised from:
 * - `useIdb/db.ts` — translates Dexie's `VersionError` on DB open.
 * - `projectImport/migrations.ts:migrateExport` — when an imported
 *   `.cutlist` advertises a version greater than `SCHEMA_VERSION`.
 */
export class FutureSchemaError extends Error {
  constructor(
    storedVersion: number,
    context: 'database' | 'export' = 'database',
  ) {
    const source = context === 'database' ? 'Database' : 'This export';
    const action =
      context === 'database'
        ? 'Please update the app or clear your browser data.'
        : 'Please update the app.';
    super(
      `${source} was created by a newer version of Cutlist ` +
        `(schema v${storedVersion}, but this version only supports up to ` +
        `v${SCHEMA_VERSION}). ${action}`,
    );
    this.name = 'FutureSchemaError';
  }
}

/**
 * Thrown when an imported `.cutlist` was written by a Cutlist version older
 * than `MIN_SUPPORTED_EXPORT_VERSION`. The data shape has changed enough
 * that no migration path exists; the user is told the file is too old to
 * import.
 */
export class LegacyExportError extends Error {
  constructor(exportVersion: number) {
    super(
      `This .cutlist file was made by an older version of Cutlist ` +
        `(format v${exportVersion}) and cannot be imported by this build ` +
        `(format v${SCHEMA_VERSION}). Open it in the version that produced ` +
        `it, re-export, or start a new project.`,
    );
    this.name = 'LegacyExportError';
  }
}
