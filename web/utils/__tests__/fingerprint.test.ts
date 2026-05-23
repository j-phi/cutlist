import { describe, expect, it } from 'vitest';
import { fingerprint, layoutFingerprint } from '../fingerprint';

describe('fingerprint', () => {
  it('produces the same hash for structurally equal inputs', () => {
    const a = fingerprint({ parts: [1, 2, 3], flag: true });
    const b = fingerprint({ parts: [1, 2, 3], flag: true });
    expect(a).toBe(b);
  });

  it('changes when values change', () => {
    const a = fingerprint({ parts: [1, 2, 3] });
    const b = fingerprint({ parts: [1, 2, 4] });
    expect(a).not.toBe(b);
  });

  it('changes when keys change', () => {
    const a = fingerprint({ a: 1 });
    const b = fingerprint({ b: 1 });
    expect(a).not.toBe(b);
  });

  it('returns 8 lowercase hex characters', () => {
    const hash = fingerprint({ any: 'thing' });
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is sensitive to nested structure', () => {
    const a = fingerprint({ x: { y: 1 } });
    const b = fingerprint({ x: { y: 2 } });
    expect(a).not.toBe(b);
  });
});

describe('layoutFingerprint — which inputs bust the layout cache', () => {
  const base = {
    parts: [{ partNumber: 1, width: 100, length: 200, thickness: 18 }],
    stocks: [{ kind: 'sheet', material: 'Ply' }],
    config: {
      bladeWidth: 3175,
      margin: 0,
      defaultAlgorithm: 'auto',
      optimizationObjective: 'boards' as const,
    },
    banding: { thicknessUm: 0, subtract: false },
  };

  it('changes when optimizationObjective changes (output-affecting)', () => {
    const a = layoutFingerprint(base);
    const b = layoutFingerprint({
      ...base,
      config: { ...base.config, optimizationObjective: 'cost' },
    });
    expect(a).not.toBe(b);
  });

  it('changes when subtractBandingThickness flips (output-affecting)', () => {
    const a = layoutFingerprint(base);
    const b = layoutFingerprint({
      ...base,
      banding: { thicknessUm: 0, subtract: true },
    });
    expect(a).not.toBe(b);
  });

  it('changes when bandingThicknessUm changes (output-affecting)', () => {
    const a = layoutFingerprint(base);
    const b = layoutFingerprint({
      ...base,
      banding: { thicknessUm: 2000, subtract: false },
    });
    expect(a).not.toBe(b);
  });

  it('is stable across structurally equal inputs', () => {
    expect(layoutFingerprint(base)).toBe(
      layoutFingerprint({ ...base, banding: { ...base.banding } }),
    );
  });
});

describe('fingerprint collision smoke test', () => {
  it('generates distinct hashes for 10000 sequential integers', () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      hashes.add(fingerprint(i));
    }
    // With 32-bit FNV-1a and 10k inputs, zero collisions is expected.
    // Allow up to 1 collision for theoretical possibility.
    expect(hashes.size).toBeGreaterThanOrEqual(9999);
  });

  it('generates distinct hashes for similar small objects', () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      hashes.add(
        fingerprint({
          parts: [{ partNumber: i, width: 0.1, length: 0.2, thickness: 0.018 }],
          config: { bladeWidth: 0.003, optimize: 'auto' },
        }),
      );
    }
    expect(hashes.size).toBe(1000);
  });
});
