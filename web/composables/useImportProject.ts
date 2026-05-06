import * as Sentry from '@sentry/nuxt';
import { importProjectFromFile as importProjectFromCompressedFile } from '~/utils/projectImport';
import { reportError } from './useAppErrors';

export default function useImportProject() {
  const { appendProject } = useProjects();
  const { setActiveProject } = useProjectNavigation();
  const idb = useIdb();

  async function importFromFile(file: File) {
    const newProjectId = await importProjectFromCompressedFile(file, idb);
    await appendProject(newProjectId);
    setActiveProject(newProjectId);
    // `useBuildDoc` watches `activeId` at module scope and reloads the
    // doc when the navigation lands.
    Sentry.captureMessage('Project imported', {
      level: 'info',
      extra: {
        projectId: newProjectId,
        fileName: file.name,
        fileSize: file.size,
      },
    });
  }

  function pickAndImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.cutlist';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        await importFromFile(file);
      } catch (err) {
        reportError({
          title: 'Import failed',
          description: err instanceof Error ? err.message : String(err),
          severity: 'error',
        });
      }
    };
    input.click();
  }

  return { pickAndImport, importFromFile };
}
