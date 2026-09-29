import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

export const UPLOAD_ANALYSIS_EXTRACTOR_VERSION = '2026-09-27-source-grounding-v1';
const CACHE_SCHEMA_VERSION = 1;

export interface UploadAnalysisCacheConfig {
  extractorVersion: string;
  provider: string;
  concurrency: number;
}

interface UploadAnalysisCacheEntry<T> {
  schemaVersion: number;
  hash: string;
  byteSize: number;
  createdAt: string;
  configKey: string;
  value: T;
}

function defaultCacheDir(): string {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  return join(localAppData || join(homedir(), 'AppData', 'Local'), 'LexPlantillas', 'upload-analysis-cache');
}

export function getUploadAnalysisCacheDir(): string {
  return process.env.UPLOAD_ANALYSIS_CACHE_DIR?.trim() || defaultCacheDir();
}

export function buildUploadAnalysisCacheConfig(input?: Partial<Pick<UploadAnalysisCacheConfig, 'provider' | 'concurrency'>>): UploadAnalysisCacheConfig {
  return {
    extractorVersion: UPLOAD_ANALYSIS_EXTRACTOR_VERSION,
    provider: input?.provider || process.env.OCR_PROVIDER?.trim().toLowerCase() || 'auto',
    concurrency: Math.max(1, Math.min(4, Math.floor(input?.concurrency || Number(process.env.OCR_CONCURRENCY) || 2))),
  };
}

export function getUploadAnalysisCacheKey(hash: string, config: UploadAnalysisCacheConfig): string {
  return `${hash}:${config.extractorVersion}:${config.provider}:${config.concurrency}:schema-${CACHE_SCHEMA_VERSION}`;
}

export async function sha256Buffer(buffer: Buffer): Promise<string> {
  return createHash('sha256').update(buffer).digest('hex');
}

function cacheFilePath(hash: string): string {
  return join(getUploadAnalysisCacheDir(), `${hash}.json`);
}

export async function readUploadAnalysisCache<T>(
  buffer: Buffer,
  config: UploadAnalysisCacheConfig,
): Promise<{ cacheHit: boolean; hash: string; value?: T }> {
  const hash = await sha256Buffer(buffer);
  try {
    const raw = await readFile(cacheFilePath(hash), 'utf8');
    const entry = JSON.parse(raw) as UploadAnalysisCacheEntry<T>;
    if (
      entry.schemaVersion !== CACHE_SCHEMA_VERSION
      || entry.hash !== hash
      || entry.byteSize !== buffer.length
      || entry.configKey !== getUploadAnalysisCacheKey(hash, config)
      || entry.value === undefined
    ) {
      return { cacheHit: false, hash };
    }
    return { cacheHit: true, hash, value: entry.value };
  } catch {
    return { cacheHit: false, hash };
  }
}

export async function writeUploadAnalysisCache<T>(
  buffer: Buffer,
  config: UploadAnalysisCacheConfig,
  value: T,
): Promise<{ hash: string }> {
  const hash = await sha256Buffer(buffer);
  const directory = getUploadAnalysisCacheDir();
  await mkdir(directory, { recursive: true });
  const entry: UploadAnalysisCacheEntry<T> = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    hash,
    byteSize: buffer.length,
    createdAt: new Date().toISOString(),
    configKey: getUploadAnalysisCacheKey(hash, config),
    value,
  };
  const target = cacheFilePath(hash);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(entry), { encoding: 'utf8' });
    await rm(target, { force: true });
    await rename(temporary, target);
  } catch {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
  return { hash };
}
