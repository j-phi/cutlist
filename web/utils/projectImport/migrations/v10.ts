/**
 * v10: a single batch of Phase-1 persisted project fields (XR-1: batch
 * same-phase fields into one version bump). Adds, when absent:
 *   - `layoutAlignH: 'left'`  (F13)
 *   - `layoutAlignV: 'bottom'` (F13)
 *   - `labelPlacement: 'center'` (F20)
 *   - `bandingThicknessUm: 0` (F7)
 *   - `subtractBandingThickness: false` (F7)
 *   - `optimizationObjective: 'boards'` (F11)
 *
 * The two new `PartOverride` fields (`bandedEdges`, `bandingThicknessUm`) are
 * keyed by partNumber and migration-free — the read-path safety net in
 * `useIdb/defaults.ts` fills their absence — so they are NOT touched here.
 *
 * Defensive — never throws. `??` only fills genuinely-absent fields, so a
 * record that already carries them is returned unchanged. A non-object input
 * could only arrive from a corrupt export; the spread of a non-object is
 * still a valid object literal, so this can't throw.
 */
import type { IdbRecord, RecordMigration } from './types';

export function migrateProjectPhase1Fields(record: IdbRecord): IdbRecord {
  return {
    ...record,
    layoutAlignH: record.layoutAlignH ?? 'left',
    layoutAlignV: record.layoutAlignV ?? 'bottom',
    labelPlacement: record.labelPlacement ?? 'center',
    bandingThicknessUm: record.bandingThicknessUm ?? 0,
    subtractBandingThickness: record.subtractBandingThickness ?? false,
    optimizationObjective: record.optimizationObjective ?? 'boards',
  };
}

export const v10Migration: RecordMigration = {
  version: 10,
  store: 'projects',
  migrate: migrateProjectPhase1Fields,
};
