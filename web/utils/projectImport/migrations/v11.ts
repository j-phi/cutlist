/**
 * v11: project gains `measurementMode` (F20 Part B) — how placed-part
 * measurements render on the board diagram. Stamp the default `'edge'` when
 * absent (the user-chosen default, matching the existing F14 edge-dimension
 * behaviour).
 *
 * Defensive — never throws. `??` only fills a genuinely-absent field, so a
 * record that already carries `measurementMode` is returned unchanged. A
 * non-object input could only arrive from a corrupt export; the spread of a
 * non-object is still a valid object literal, so this can't throw.
 */
import type { IdbRecord, RecordMigration } from './types';

export function migrateProjectMeasurementMode(record: IdbRecord): IdbRecord {
  return {
    ...record,
    measurementMode: record.measurementMode ?? 'edge',
  };
}

export const v11Migration: RecordMigration = {
  version: 11,
  store: 'projects',
  migrate: migrateProjectMeasurementMode,
};
