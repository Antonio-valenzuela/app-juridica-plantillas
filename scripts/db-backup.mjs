// Respaldo consistente de la base SQLite local (VACUUM INTO) + manifiesto con hashes
// de documents/ y data/. Requiere Node >= 22.5 (node:sqlite).
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { databasePath, storageRoot } from './db-paths.mjs';

async function walk(root, base) {
  const output = [];
  async function visit(directory) {
    let entries = [];
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && !/\.db(-wal|-shm)?$/.test(entry.name)) {
        const bytes = await readFile(absolute);
        output.push({ path: relative(base, absolute).replaceAll(sep, '/'), bytes: (await stat(absolute)).size, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    }
  }
  await visit(root);
  return output;
}

const source = databasePath();
if (!existsSync(source)) throw new Error('BACKUP_DATABASE_NOT_FOUND');
const root = storageRoot();
const outputRoot = resolve(process.argv[2] || join(root, 'backups', new Date().toISOString().replaceAll(':', '-')));
await mkdir(outputRoot, { recursive: true });
const target = join(outputRoot, 'lexplantillas.db');
if (existsSync(target)) throw new Error('BACKUP_TARGET_EXISTS');
const db = new DatabaseSync(source, { readOnly: false });
try {
  db.exec('PRAGMA busy_timeout = 10000');
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
} finally { db.close(); }
const files = [];
for (const sourceRoot of [join(root, 'documents'), join(root, 'data')]) files.push(...await walk(sourceRoot, root));
const bytes = await readFile(target);
await writeFile(join(outputRoot, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), database: 'lexplantillas.db', databaseSha256: createHash('sha256').update(bytes).digest('hex'), files }, null, 2), 'utf8');
console.log(`BACKUP_OK files=${files.length} output=${outputRoot}`);
