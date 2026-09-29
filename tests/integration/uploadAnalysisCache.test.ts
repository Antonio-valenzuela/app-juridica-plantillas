import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  UPLOAD_ANALYSIS_EXTRACTOR_VERSION,
  buildUploadAnalysisCacheConfig,
  getUploadAnalysisCacheKey,
  readUploadAnalysisCache,
  sha256Buffer,
  writeUploadAnalysisCache,
} from '@/lib/upload-analysis/cache';

const originalCacheDir = process.env.UPLOAD_ANALYSIS_CACHE_DIR;
const createdDirs: string[] = [];

afterEach(async () => {
  if (originalCacheDir === undefined) delete process.env.UPLOAD_ANALYSIS_CACHE_DIR;
  else process.env.UPLOAD_ANALYSIS_CACHE_DIR = originalCacheDir;
  await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function useTempCache() {
  const dir = await mkdtemp(join(tmpdir(), 'lex-upload-cache-test-'));
  createdDirs.push(dir);
  process.env.UPLOAD_ANALYSIS_CACHE_DIR = dir;
  return dir;
}

describe('upload analysis cache', () => {
  it('uses SHA-256 plus extractor/OCR configuration, never filename', async () => {
    await useTempCache();
    const buffer = Buffer.from('same PDF bytes');
    const hash = await sha256Buffer(buffer);
    const config = buildUploadAnalysisCacheConfig({ provider: 'tesseract', concurrency: 2 });

    expect(hash).toHaveLength(64);
    expect(getUploadAnalysisCacheKey(hash, config)).toContain(UPLOAD_ANALYSIS_EXTRACTOR_VERSION);
    expect(getUploadAnalysisCacheKey(hash, config)).not.toContain('archivo.pdf');
    expect(getUploadAnalysisCacheKey(hash, config)).not.toContain('otro-nombre.pdf');
  });

  it('returns a cache hit for the same bytes and a miss for a different hash', async () => {
    await useTempCache();
    const original = Buffer.from('source A');
    const other = Buffer.from('source B');
    const config = buildUploadAnalysisCacheConfig({ provider: 'tesseract', concurrency: 2 });
    const payload = { extractedText: 'texto permitido en caché', sourceValidated: true, pageCount: 1 };

    await writeUploadAnalysisCache(original, config, payload);
    const hit = await readUploadAnalysisCache<typeof payload>(original, config);
    const miss = await readUploadAnalysisCache<typeof payload>(other, config);

    expect(hit.cacheHit).toBe(true);
    expect(hit.value).toEqual(payload);
    expect(miss.cacheHit).toBe(false);
    expect(miss.value).toBeUndefined();
  });

  it('invalidates entries when the extractor or OCR configuration changes', async () => {
    await useTempCache();
    const buffer = Buffer.from('versioned source');
    const config = buildUploadAnalysisCacheConfig({ provider: 'tesseract', concurrency: 2 });
    await writeUploadAnalysisCache(buffer, config, { sourceValidated: true });

    const changedConfig = buildUploadAnalysisCacheConfig({ provider: 'tesseract', concurrency: 3 });
    const invalidated = await readUploadAnalysisCache(buffer, changedConfig);

    expect(invalidated.cacheHit).toBe(false);
  });
});
