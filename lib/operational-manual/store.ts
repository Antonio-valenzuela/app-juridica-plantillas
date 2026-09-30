import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveLexPlantillasStoragePaths } from '../workspace/storagePaths';
import { buildManualIndex, type ManualIndex, type ManualPage } from './core';

export const MANUAL_ID = 'lex-plantillas-operativo-juridico';
const VERSION = '1.0';
function directory(root?: string): string { return path.join(root || resolveLexPlantillasStoragePaths().documents, 'operational-manual', 'v1.0'); }
function candidateDirectories(root?: string): string[] {
  return root ? [directory(root)] : [directory(), directory(path.join(process.cwd(), 'data', 'documents'))];
}
function digest(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

export async function importCanonicalManual(pdfPath: string, storageRoot?: string): Promise<ManualIndex> {
  const originalBytes = await readFile(pdfPath);
  const sourceHash = digest(originalBytes);
  const pdfModule = await import('pdf-parse');
  const parser = new pdfModule.PDFParse({ data: new Uint8Array(originalBytes) });
  let result: Awaited<ReturnType<typeof parser.getText>>;
  try { result = await parser.getText(); }
  finally { await parser.destroy(); }
  const rawPages = Array.isArray(result.pages) ? result.pages : [];
  const pages: ManualPage[] = rawPages.map((page, index) => ({ physicalPage: index + 1, text: String(page.text || '') }));
  const target = directory(storageRoot);
  const index = buildManualIndex(pages, { manualId: MANUAL_ID, version: VERSION, sourceHash, originalFile: 'LEX_PLANTILLAS_MANUAL_OPERATIVO.pdf' });
  if (rawPages.length !== 212 || index.manifest.errors.length) throw new Error(`MANUAL_IMPORT_INTEGRITY_FAILED:${index.manifest.errors.join(';')}`);
  await mkdir(target, { recursive: true });
  const originalTarget = path.join(target, 'LEX_PLANTILLAS_MANUAL_OPERATIVO.pdf');
  const existingOriginal = await readFile(originalTarget).catch(() => null);
  if (existingOriginal && digest(existingOriginal) !== sourceHash) throw new Error('MANUAL_VERSION_IMMUTABLE');
  if (!existingOriginal) await copyFile(pdfPath, originalTarget);
  if (digest(await readFile(originalTarget)) !== sourceHash) throw new Error('MANUAL_SOURCE_HASH_MISMATCH');
  const tempPath = path.join(target, `index.${process.pid}.tmp`);
  try {
    await writeFile(tempPath, JSON.stringify(index), 'utf8');
    await rename(tempPath, path.join(target, 'index.json'));
  } catch (error) { throw error; }
  return index;
}

let cached: { index: ManualIndex; root: string } | undefined;
export async function loadActiveManual(storageRoot?: string): Promise<ManualIndex | null> {
  if (cached && candidateDirectories(storageRoot).includes(cached.root)) return cached.index;
  for (const root of candidateDirectories(storageRoot)) {
    try {
      const index = JSON.parse(await readFile(path.join(root, 'index.json'), 'utf8')) as ManualIndex;
      if (index.manifest.active !== true || index.manifest.detectedPages !== 212 || index.manifest.errors.length) continue;
      const original = await readFile(path.join(root, 'LEX_PLANTILLAS_MANUAL_OPERATIVO.pdf'));
      if (digest(original) !== index.manifest.sourceHash) continue;
      cached = { root, index };
      return index;
    } catch { /* Se intenta la siguiente ubicación, sin activar datos inválidos. */ }
  }
  return null;
}

export async function readCanonicalManualBytes(storageRoot?: string): Promise<Buffer | null> {
  const index = await loadActiveManual(storageRoot);
  if (!index) return null;
  return readFile(path.join(cached?.root || directory(storageRoot), 'LEX_PLANTILLAS_MANUAL_OPERATIVO.pdf'));
}
