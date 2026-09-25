import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command}_FAILED_${result.status ?? 'UNKNOWN'}`);
}

async function walk(root, storageRoot) {
  const output = [];
  async function visit(directory) {
    let entries = [];
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        const bytes = await readFile(absolute);
        const info = await stat(absolute);
        output.push({ path: relative(storageRoot, absolute).replaceAll('\\', '/'), bytes: info.size, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    }
  }
  await visit(root);
  return output;
}

const databaseUrl = required('DATABASE_URL');
const configuredStorageRoot = process.env.LEXPLANTILLAS_STORAGE_ROOT?.trim();
const applicationDataRoot = process.platform === 'win32'
  ? process.env.LOCALAPPDATA?.trim() || join(homedir(), 'AppData', 'Local')
  : process.env.XDG_DATA_HOME?.trim() || join(homedir(), '.local', 'share');
const storageRoot = resolve(configuredStorageRoot || join(applicationDataRoot, 'LexPlantillas'));
const outputRoot = resolve(process.argv[2] || join(storageRoot, 'backups', new Date().toISOString().replaceAll(':', '-')));
await mkdir(outputRoot, { recursive: true });
const dumpPath = join(outputRoot, 'database.dump');
run('pg_dump', ['--format=custom', '--file', dumpPath, databaseUrl]);
run('pg_restore', ['--list', dumpPath]);
const files = [];
for (const sourceRoot of [join(storageRoot, 'documents'), join(storageRoot, 'data')]) {
  files.push(...await walk(sourceRoot, storageRoot));
}
await writeFile(join(outputRoot, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), dump: 'database.dump', files }, null, 2), 'utf8');
console.log(`BACKUP_OK files=${files.length} output=${outputRoot}`);
