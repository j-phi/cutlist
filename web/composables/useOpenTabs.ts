/**
 * Open-tab list, persisted in localStorage as an ordered array of project IDs.
 * The top tab bar renders these — being "open as a tab" is session state, not
 * data about the project.
 */
import { ref } from 'vue';

export const OPEN_TABS_STORAGE_KEY = 'cutlist:openTabs';

export const openTabIds = ref<string[]>([]);

function read(): string[] {
  if (!import.meta.client) return [];
  try {
    const parsed = JSON.parse(
      localStorage.getItem(OPEN_TABS_STORAGE_KEY) ?? '[]',
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

function write(ids: string[]): void {
  if (!import.meta.client) return;
  try {
    localStorage.setItem(OPEN_TABS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Quota / private-mode failures are silent — list rebuilds from empty
    // on next reload, same recovery as a deletion.
  }
}

let started = false;

export function startOpenTabs(): void {
  if (started || !import.meta.client) return;
  started = true;
  openTabIds.value = read();
}

export function addOpenTab(id: string): void {
  if (openTabIds.value.includes(id)) return;
  openTabIds.value = [...openTabIds.value, id];
  write(openTabIds.value);
}

export function removeOpenTab(id: string): void {
  if (!openTabIds.value.includes(id)) return;
  openTabIds.value = openTabIds.value.filter((x) => x !== id);
  write(openTabIds.value);
}

/**
 * Replace the order. Ids not in the current list are dropped; missing ids are
 * re-appended at the end so reorder never silently loses tabs.
 */
export function reorderOpenTabs(ids: string[]): void {
  const current = new Set(openTabIds.value);
  const kept = ids.filter((id) => current.has(id));
  const missing = openTabIds.value.filter((id) => !ids.includes(id));
  openTabIds.value = [...kept, ...missing];
  write(openTabIds.value);
}

export function clearOpenTabs(): void {
  openTabIds.value = [];
  if (!import.meta.client) return;
  try {
    localStorage.removeItem(OPEN_TABS_STORAGE_KEY);
  } catch {
    // see write()
  }
}
