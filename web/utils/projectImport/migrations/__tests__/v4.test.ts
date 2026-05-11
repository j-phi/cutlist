import { describe, expect, it } from 'vitest';
import { migrateProjectDropArchivedAt } from '../v4';

describe('v4 migration — drop archivedAt', () => {
  it('removes the field when present', () => {
    const before = {
      id: 'p1',
      name: 'Old',
      archivedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const after = migrateProjectDropArchivedAt(before);
    expect(after).not.toHaveProperty('archivedAt');
    expect(after.name).toBe('Old');
    expect(after.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('does not throw on a near-empty record', () => {
    // Migrations run inside Dexie transactions; throwing locks the user out.
    expect(() => migrateProjectDropArchivedAt({} as never)).not.toThrow();
    expect(migrateProjectDropArchivedAt({ archivedAt: null } as never)).toEqual(
      {},
    );
  });
});
