import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveLexPlantillasStoragePaths } from './storagePaths';

type LocalRecord = { id: string };
const shared = globalThis as typeof globalThis & { lexRecordWrites?: Map<string, Promise<unknown>> };
shared.lexRecordWrites ??= new Map();

/** Separate domain collections in the same workspace. No implicit WEB imports. */
export class DesktopRecordRepository<T extends LocalRecord> {
  private directory: string;
  constructor(collection: 'jobs' | 'cases' | 'templates' | 'agenda' | 'parties', private valid: (record: T) => boolean,
    root = resolveLexPlantillasStoragePaths().workspace) {
    this.directory = path.resolve(root, `desktop-${collection}-v1`);
  }
  private file(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new TypeError('DESKTOP_RECORD_ID_INVALID');
    return path.join(this.directory, `${id}.json`);
  }
  async find(id: string): Promise<T | null> {
    try {
      const envelope = JSON.parse(await readFile(this.file(id), 'utf8'));
      if (envelope.version !== 1 || envelope.record?.id !== id || !this.valid(envelope.record)) throw new Error('DESKTOP_RECORD_CORRUPT');
      return envelope.record;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  async list(): Promise<T[]> {
    let files: string[];
    try { files = await readdir(this.directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const records = await Promise.all(files.filter(file => /^[0-9a-f-]{36}\.json$/.test(file)).map(file => this.find(file.slice(0, -5))));
    const found: T[] = [];
    for (const record of records) if (record !== null) found.push(record);
    return found;
  }
  async mutate(id: string, change: (existing: T | null) => T | null): Promise<T | null> {
    const file = this.file(id);
    const prior = shared.lexRecordWrites!.get(file) ?? Promise.resolve();
    const next = prior.catch(() => undefined).then(async () => {
      const existing = await this.find(id);
      const record = change(existing);
      if (!record) { if (existing) await unlink(file); return null; }
      if (record.id !== id || !this.valid(record)) throw new TypeError('DESKTOP_RECORD_INVALID');
      await mkdir(this.directory, { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify({ version: 1, record }), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        // Windows readers may briefly hold the destination open. Retry only the
        // atomic rename; never unlink a valid checkpoint or retry another failure.
        for (let attempt = 0; ; attempt++) {
          try { await rename(temporary, file); break; }
          catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (process.platform !== 'win32' || !['EPERM', 'EBUSY'].includes(code || '') || attempt >= 3) throw error;
            await new Promise(resolve => setTimeout(resolve, [10, 30, 100][attempt]));
          }
        }
      } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
      return record;
    });
    shared.lexRecordWrites!.set(file, next);
    try { return await next; }
    finally { if (shared.lexRecordWrites!.get(file) === next) shared.lexRecordWrites!.delete(file); }
  }
  put(record: T) { return this.mutate(record.id, () => record); }
}
