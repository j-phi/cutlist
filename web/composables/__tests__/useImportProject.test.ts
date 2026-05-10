// @vitest-environment nuxt
/**
 * useImportProject is a thin wrapper around importProjectFromFile. The import
 * pipeline itself is covered exhaustively in projectImport tests; the only
 * behaviour worth pinning here is the toast surfacing when the picker flow
 * swallows an error (since the wrapper owns that catch).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

const importProjectFromFile = vi.fn();
const reportError = vi.fn();

vi.mock('~/utils/projectImport', () => ({
  importProjectFromFile: (...args: unknown[]) => importProjectFromFile(...args),
}));

vi.mock('../useAppErrors', () => ({
  reportError: (e: unknown) => reportError(e),
}));

mockNuxtImport('useProjects', () => () => ({ appendProject: vi.fn() }));
mockNuxtImport('useProjectNavigation', () => () => ({
  setActiveProject: vi.fn(),
}));
mockNuxtImport('useIdb', () => () => ({ __stub: true }));

import useImportProject from '../useImportProject';

beforeEach(() => {
  importProjectFromFile.mockReset();
  reportError.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useImportProject.pickAndImport', () => {
  it('reports an error toast when the underlying import fails', async () => {
    importProjectFromFile.mockRejectedValueOnce(new Error('bad import'));

    const created: HTMLInputElement[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLInputElement;
      if (tag === 'input') {
        el.click = () => {};
        created.push(el);
      }
      return el;
    });

    const { pickAndImport } = useImportProject();
    pickAndImport();

    const input = created[0];
    Object.defineProperty(input, 'files', {
      value: [new File(['ignored'], 'project.cutlist')],
      configurable: true,
    });
    await input.onchange?.({ target: input } as unknown as Event);

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0]).toMatchObject({
      title: 'Import failed',
      severity: 'error',
    });
    expect(reportError.mock.calls[0][0].description).toContain('bad import');
  });
});
