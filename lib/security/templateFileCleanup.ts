import { lstat, unlink } from 'node:fs/promises';
import path from 'node:path';

export type TemplateFileCleanupResult = 'DELETED' | 'NOT_FOUND' | 'SKIPPED_INVALID';

function isSafeSavedFileName(savedFileName: string): boolean {
  return savedFileName.length > 0
    && savedFileName !== '.'
    && savedFileName !== '..'
    && path.basename(savedFileName) === savedFileName
    && !savedFileName.includes('/')
    && !savedFileName.includes('\\');
}

export function resolveOwnedTemplateFilePath(
  storageRoot: string,
  savedFileName: string,
): string | null {
  if (!isSafeSavedFileName(savedFileName)) return null;

  const resolvedRoot = path.resolve(storageRoot);
  const resolvedFile = path.resolve(resolvedRoot, savedFileName);
  const rootPrefix = `${resolvedRoot}${path.sep}`;
  return resolvedFile.startsWith(rootPrefix) ? resolvedFile : null;
}

export async function deleteOwnedTemplateFile({
  storageRoot,
  savedFileName,
}: {
  storageRoot: string;
  savedFileName: string;
}): Promise<TemplateFileCleanupResult> {
  const filePath = resolveOwnedTemplateFilePath(storageRoot, savedFileName);
  if (!filePath) return 'SKIPPED_INVALID';

  try {
    const fileStat = await lstat(filePath);
    if (!fileStat.isFile()) return 'SKIPPED_INVALID';
    await unlink(filePath);
    return 'DELETED';
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return 'NOT_FOUND';
    }
    throw error;
  }
}
