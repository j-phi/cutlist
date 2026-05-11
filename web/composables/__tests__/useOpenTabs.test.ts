import { beforeEach, describe, expect, it } from 'vitest';
import {
  addOpenTab,
  clearOpenTabs,
  openTabIds,
  OPEN_TABS_STORAGE_KEY,
  removeOpenTab,
  reorderOpenTabs,
} from '../useOpenTabs';

beforeEach(() => {
  localStorage.clear();
  openTabIds.value = [];
});

describe('useOpenTabs', () => {
  it('addOpenTab appends new ids at the end and is idempotent', () => {
    addOpenTab('a');
    addOpenTab('b');
    addOpenTab('a'); // duplicate
    expect(openTabIds.value).toEqual(['a', 'b']);
    expect(JSON.parse(localStorage.getItem(OPEN_TABS_STORAGE_KEY)!)).toEqual([
      'a',
      'b',
    ]);
  });

  it('removeOpenTab filters out the id and persists', () => {
    addOpenTab('a');
    addOpenTab('b');
    addOpenTab('c');
    removeOpenTab('b');
    expect(openTabIds.value).toEqual(['a', 'c']);
    expect(JSON.parse(localStorage.getItem(OPEN_TABS_STORAGE_KEY)!)).toEqual([
      'a',
      'c',
    ]);
  });

  it('reorderOpenTabs replaces the order, dropping unknown ids and re-appending missing ones', () => {
    addOpenTab('a');
    addOpenTab('b');
    addOpenTab('c');
    reorderOpenTabs(['c', 'a', 'ghost']);
    // ghost is dropped (not currently in the list); b is re-appended at the end.
    expect(openTabIds.value).toEqual(['c', 'a', 'b']);
  });

  it('clearOpenTabs wipes both the ref and localStorage', () => {
    addOpenTab('a');
    addOpenTab('b');
    clearOpenTabs();
    expect(openTabIds.value).toEqual([]);
    expect(localStorage.getItem(OPEN_TABS_STORAGE_KEY)).toBeNull();
  });
});
