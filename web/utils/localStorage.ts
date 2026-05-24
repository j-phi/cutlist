function encodeStorageSegment(value: string) {
  return encodeURIComponent(value);
}

export const STORAGE_KEYS = {
  ui: {
    // Split panel width on BOM tab (preview pane width in px), scoped per project.
    projectBomPreviewWidth(projectId: string) {
      return `@cutlist/ui/project/${encodeStorageSegment(projectId)}/bom-preview-width/v1`;
    },
    // Split panel height on BOM tab (preview pane height in px on mobile), scoped per project.
    projectBomPreviewHeight(projectId: string) {
      return `@cutlist/ui/project/${encodeStorageSegment(projectId)}/bom-preview-height/v1`;
    },
    // BOM filter/sort state, scoped per project.
    projectBomFilter(projectId: string) {
      return `@cutlist/ui/project/${encodeStorageSegment(projectId)}/bom-filter/v1`;
    },
    // Whether the Models panel on the BOM tab is expanded, scoped per project.
    projectBomModelsExpanded(projectId: string) {
      return `@cutlist/ui/project/${encodeStorageSegment(projectId)}/bom-models-expanded/v1`;
    },
    // Whether the "How stock works" sidebar on the Stock tab is collapsed, scoped per project.
    projectStockHelpCollapsed(projectId: string) {
      return `@cutlist/ui/project/${encodeStorageSegment(projectId)}/stock-help-collapsed/v1`;
    },
    // Whether the "How the BOM works" sidebar on the BOM tab is collapsed, scoped per project.
    projectBomHelpCollapsed(projectId: string) {
      return `@cutlist/ui/project/${encodeStorageSegment(projectId)}/bom-help-collapsed/v1`;
    },
    // Whether the "How layouts work" sidebar on the Layout tab is collapsed, scoped per project.
    projectLayoutHelpCollapsed(projectId: string) {
      return `@cutlist/ui/project/${encodeStorageSegment(projectId)}/layout-help-collapsed/v1`;
    },
    // Whether the shopping list overlay on the Layout tab is hidden, scoped per project.
    projectLayoutShoppingListHidden(projectId: string) {
      return `@cutlist/ui/project/${encodeStorageSegment(projectId)}/layout-shopping-list-hidden/v1`;
    },
    // Whether unused offcuts are shown as empty boards on the Layout tab, scoped per project.
    projectLayoutShowUnused(projectId: string) {
      return `@cutlist/ui/project/${encodeStorageSegment(projectId)}/layout-show-unused/v1`;
    },
    // Edge-banding cost per unit length (F7 FR-BND-3), scoped per project.
    // Display-only — does NOT affect packing, so it's a localStorage UI
    // setting rather than an IDB field (avoids a schema bump after v10).
    // Stored as a string so fractional rates (e.g. 0.012) survive intact —
    // unlike `setLocalStorageNumber`, which rounds to an integer.
    projectBandingCostPerLength(projectId: string) {
      return `@cutlist/ui/project/${encodeStorageSegment(projectId)}/banding-cost-per-length/v1`;
    },
    // Last-visited workspace tab for a project (ProjectTabId string).
    projectActiveTab(projectId: string) {
      return `@cutlist/ui/project/${encodeStorageSegment(projectId)}/active-tab/v1`;
    },
    // How Layout-tab board panels are ordered within a group ('board' | 'fullest'). Global.
    layoutPanelOrder: '@cutlist/ui/layout-panel-order/v1',
    // Whether the "back up your work" durability banner has been dismissed. Global.
    storageBackupBannerDismissed:
      '@cutlist/ui/storage-backup-banner-dismissed/v1',
  },
} as const;

export function getLocalStorageNumber(key: string): number | null {
  if (!import.meta.client) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function setLocalStorageNumber(key: string, value: number) {
  if (!import.meta.client) return;
  try {
    window.localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // Ignore storage failures (private mode/quota/security policies).
  }
}

export function getLocalStorageJson<T>(key: string): T | null {
  if (!import.meta.client) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setLocalStorageJson(key: string, value: unknown) {
  if (!import.meta.client) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures (private mode/quota/security policies).
  }
}
