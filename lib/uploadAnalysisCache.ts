export type UploadCacheFile = Pick<File, 'name' | 'size' | 'lastModified'>;

export function createUploadCacheKey(file: UploadCacheFile): string {
  return `${file.name}\u001f${file.size}\u001f${file.lastModified}`;
}

export function getCachedUploadAnalysis<T>(
  cache: Map<string, T>,
  file: UploadCacheFile,
): T | undefined {
  return cache.get(createUploadCacheKey(file));
}

export function rememberUploadAnalysis<T>(
  cache: Map<string, T>,
  file: UploadCacheFile,
  analysis: T,
): void {
  cache.set(createUploadCacheKey(file), analysis);
}
