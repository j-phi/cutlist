// @vitest-environment nuxt
/**
 * Tests for useImportProject — a thin wrapper around importProjectFromFile
 * that wires the result into appendProject / setActiveProject / reloadSteps
 * and surfaces errors via reportError.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

const importProjectFromFile = vi.fn();
const appendProject = vi.fn();
const setActiveProject = vi.fn();
const reportError = vi.fn();

vi.mock('~/utils/projectImport', () => ({
  importProjectFromFile: (...args: unknown[]) => importProjectFromFile(...args),
}));

vi.mock('../useAppErrors', () => ({
  reportError: (e: unknown) => reportError(e),
}));

mockNuxtImport('useProjects', () => () => ({ appendProject }));
mockNuxtImport('useProjectNavigation', () => () => ({ setActiveProject }));
mockNuxtImport('useIdb', () => () => ({ __stub: true }));

import useImportProject from '../useImportProject';

function makeFile(name = 'project.cutlist') {
  return new File(['ignored'], name, { type: 'application/octet-stream' });
}

beforeEach(() => {
  importProjectFromFile.mockReset();
  appendProject.mockReset();
  setActiveProject.mockReset();
  reportError.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useImportProject.importFromFile', () => {
  it('delegates to importProjectFromFile and wires the new project id', async () => {
    importProjectFromFile.mockResolvedValueOnce('new-project-id');
    appendProject.mockResolvedValueOnce(undefined);

    const { importFromFile } = useImportProject();
    const file = makeFile();
    await importFromFile(file);

    expect(importProjectFromFile).toHaveBeenCalledTimes(1);
    expect(importProjectFromFile.mock.calls[0][0]).toBe(file);
    expect(appendProject).toHaveBeenCalledWith('new-project-id');
    expect(setActiveProject).toHaveBeenCalledWith('new-project-id');
  });

  it('propagates errors from importProjectFromFile to the caller', async () => {
    importProjectFromFile.mockRejectedValueOnce(new Error('bad import'));

    const { importFromFile } = useImportProject();
    await expect(importFromFile(makeFile())).rejects.toThrow('bad import');

    expect(appendProject).not.toHaveBeenCalled();
    expect(setActiveProject).not.toHaveBeenCalled();
  });
});

describe('useImportProject.pickAndImport', () => {
  it('reports an error toast when the underlying import fails', async () => {
    importProjectFromFile.mockRejectedValueOnce(new Error('bad import'));

    // Capture the input element so we can drive its onchange ourselves rather
    // than relying on the click() → file picker dance, which doesn't run in
    // happy-dom.
    const created: HTMLInputElement[] = [];
    const realCreate = document.createElement.bind(document);
    const spy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        const el = realCreate(tag) as HTMLInputElement;
        if (tag === 'input') {
          // Stub click() so we don't open a real file dialog.
          el.click = () => {};
          created.push(el);
        }
        return el;
      });

    const { pickAndImport } = useImportProject();
    pickAndImport();

    const input = created[0];
    expect(input).toBeDefined();

    // Simulate the user picking a file.
    const file = makeFile();
    Object.defineProperty(input, 'files', {
      value: [file],
      configurable: true,
    });
    await input.onchange?.({ target: input } as unknown as Event);

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0]).toMatchObject({
      title: 'Import failed',
      severity: 'error',
    });
    expect(reportError.mock.calls[0][0].description).toContain('bad import');

    spy.mockRestore();
  });

  it('is a no-op when the user cancels the file picker', async () => {
    const realCreate = document.createElement.bind(document);
    const created: HTMLInputElement[] = [];
    const spy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
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
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    await input.onchange?.({ target: input } as unknown as Event);

    expect(importProjectFromFile).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();

    spy.mockRestore();
  });
});
