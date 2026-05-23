import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '~/utils/localStorage';
import { readSavedTab } from '../useProjectNavigation';

beforeEach(() => {
  localStorage.clear();
});

describe('readSavedTab', () => {
  it('returns the stored tab id when a valid tab is saved', () => {
    localStorage.setItem(STORAGE_KEYS.ui.projectActiveTab('p1'), 'layout');
    expect(readSavedTab('p1')).toBe('layout');
  });

  it('returns null when no tab has been saved for the project', () => {
    expect(readSavedTab('unknown')).toBeNull();
  });

  it('returns null for an unrecognised stored value, ignoring garbage data', () => {
    localStorage.setItem(STORAGE_KEYS.ui.projectActiveTab('p2'), 'not-a-tab');
    expect(readSavedTab('p2')).toBeNull();
  });

  it('reads distinct saved tabs per project', () => {
    localStorage.setItem(STORAGE_KEYS.ui.projectActiveTab('p1'), 'model');
    localStorage.setItem(STORAGE_KEYS.ui.projectActiveTab('p2'), 'boards');
    expect(readSavedTab('p1')).toBe('model');
    expect(readSavedTab('p2')).toBe('boards');
  });
});
