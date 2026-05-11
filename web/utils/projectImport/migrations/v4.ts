/**
 * v4: drop the project-level `archivedAt` field. "Open as a tab" is now
 * session state in `localStorage` (see `~/composables/useOpenTabs`), not a
 * property of the project.
 */
import type { IdbRecord, RecordMigration } from './types';

export function migrateProjectDropArchivedAt(record: IdbRecord): IdbRecord {
  if (!('archivedAt' in record)) return record;
  const next: IdbRecord = { ...record };
  delete next.archivedAt;
  return next;
}

export const v4Migration: RecordMigration = {
  version: 4,
  store: 'projects',
  migrate: migrateProjectDropArchivedAt,
};
