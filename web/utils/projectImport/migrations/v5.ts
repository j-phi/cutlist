/**
 * v5: integer micrometres become the engine and storage domain.
 *
 * - `IdbProject.{bladeWidth, margin}`: float mm → integer µm.
 * - `IdbModel.parts[].size.{thickness,width,length}`: float meters → integer µm.
 *
 * Defensive — never throws. A non-finite or missing dimension is reset to 0
 * rather than rolling back the upgrade transaction.
 */
import type { IdbRecord, RecordMigration } from './types';

const MM_TO_UM = 1_000;
const M_TO_UM = 1_000_000;

function toUmFrom(scale: number, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.round(value * scale);
}

export function migrateProjectScalarsToUm(record: IdbRecord): IdbRecord {
  return {
    ...record,
    bladeWidth: toUmFrom(MM_TO_UM, record.bladeWidth),
    margin: toUmFrom(MM_TO_UM, record.margin),
  };
}

export function migrateModelPartsToUm(record: IdbRecord): IdbRecord {
  const parts = record.parts;
  if (!Array.isArray(parts)) return record;
  const next: IdbRecord[] = parts.map((part) => {
    if (!part || typeof part !== 'object') return part;
    const p = part as IdbRecord;
    const size = p.size as IdbRecord | undefined;
    if (!size) return p;
    return {
      ...p,
      size: {
        ...size,
        thickness: toUmFrom(M_TO_UM, size.thickness),
        width: toUmFrom(M_TO_UM, size.width),
        length: toUmFrom(M_TO_UM, size.length),
      },
    };
  });
  return { ...record, parts: next };
}

export const v5ProjectMigration: RecordMigration = {
  version: 5,
  store: 'projects',
  migrate: migrateProjectScalarsToUm,
};

export const v5ModelMigration: RecordMigration = {
  version: 5,
  store: 'models',
  migrate: migrateModelPartsToUm,
};
