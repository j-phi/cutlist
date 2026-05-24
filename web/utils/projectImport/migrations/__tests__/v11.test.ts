import { describe, expect, it } from 'vitest';
import { migrateProjectMeasurementMode } from '../v11';

describe('migrateProjectMeasurementMode (v11)', () => {
  it('stamps the default "edge" when measurementMode is absent', () => {
    const result = migrateProjectMeasurementMode({ id: 'p1', name: 'X' });
    expect(result.measurementMode).toBe('edge');
  });

  it('preserves an existing measurementMode value', () => {
    const result = migrateProjectMeasurementMode({
      id: 'p1',
      measurementMode: 'inside',
    });
    expect(result.measurementMode).toBe('inside');
  });

  it('leaves other fields untouched', () => {
    const input = {
      id: 'p1',
      name: 'Cabinet',
      labelPlacement: 'top',
      bladeWidth: 3175,
    };
    const result = migrateProjectMeasurementMode(input);
    expect(result.name).toBe('Cabinet');
    expect(result.labelPlacement).toBe('top');
    expect(result.bladeWidth).toBe(3175);
  });

  it('never throws on missing or malformed input', () => {
    expect(() => migrateProjectMeasurementMode({ id: 'p1' })).not.toThrow();
    expect(() =>
      migrateProjectMeasurementMode({} as { id: string }),
    ).not.toThrow();
  });
});
