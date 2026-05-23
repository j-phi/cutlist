import { describe, expect, it } from 'vitest';
import { migrateProjectPhase1Fields } from '../v10';

describe('migrateProjectPhase1Fields', () => {
  it('fills the six Phase-1 project defaults when absent', () => {
    const result = migrateProjectPhase1Fields({ id: 'p1', name: 'P' });
    expect(result).toMatchObject({
      layoutAlignH: 'left',
      layoutAlignV: 'bottom',
      labelPlacement: 'center',
      bandingThicknessUm: 0,
      subtractBandingThickness: false,
      optimizationObjective: 'boards',
    });
  });

  it('leaves an explicit value untouched on every field', () => {
    const input = {
      id: 'p1',
      layoutAlignH: 'right',
      layoutAlignV: 'top',
      labelPlacement: 'top',
      bandingThicknessUm: 2000,
      subtractBandingThickness: true,
      optimizationObjective: 'cost',
    };
    expect(migrateProjectPhase1Fields(input)).toEqual(input);
  });

  it('preserves unrelated fields', () => {
    const result = migrateProjectPhase1Fields({
      id: 'p1',
      name: 'Keep me',
      bladeWidth: 3175,
    });
    expect(result.name).toBe('Keep me');
    expect(result.bladeWidth).toBe(3175);
  });

  it('never throws on a malformed record', () => {
    expect(() => migrateProjectPhase1Fields({})).not.toThrow();
    // Falsy-but-present values are kept (only genuine absence is filled).
    const withFalsy = migrateProjectPhase1Fields({
      id: 'p1',
      subtractBandingThickness: false,
      bandingThicknessUm: 0,
    });
    expect(withFalsy.subtractBandingThickness).toBe(false);
    expect(withFalsy.bandingThicknessUm).toBe(0);
  });
});
