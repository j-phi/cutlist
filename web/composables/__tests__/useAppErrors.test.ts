/**
 * Trimmed: useAppErrors is a thin wrapper around useToast().add. The single
 * load-bearing invariant is the severity → (color, duration) mapping —
 * "error" must persist (duration 0) and "warning" must auto-dismiss. If those
 * flip, persistent storage errors disappear before the user can read them.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

interface ToastCall {
  color?: unknown;
  duration?: unknown;
}

const toastCalls: ToastCall[] = [];

vi.mock('@sentry/nuxt', () => ({ captureMessage: () => {} }));
vi.mock('@nuxt/ui/composables/useToast', () => ({
  useToast: () => ({
    add: (opts: ToastCall) => {
      toastCalls.push(opts);
    },
  }),
}));

import { reportError } from '../useAppErrors';

beforeEach(() => {
  toastCalls.length = 0;
});

describe('reportError severity mapping', () => {
  it('error severity → red toast that persists until dismissed', () => {
    reportError({ title: 't', description: 'd', severity: 'error' });
    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0].color).toBe('error');
    expect(toastCalls[0].duration).toBe(0);
  });

  it('warning severity → warning toast that auto-dismisses', () => {
    reportError({ title: 't', description: 'd', severity: 'warning' });
    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0].color).toBe('warning');
    expect(toastCalls[0].duration).toBe(8000);
  });
});
