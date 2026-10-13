// Humo de respaldo -> validación -> restauración sobre una base temporal sintética.
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const directory = await mkdtemp(join(tmpdir(), 'lex-db-smoke-'));
const env = {
  ...process.env,
  LEXPLANTILLAS_STORAGE_ROOT: directory,
  LEXPLANTILLAS_DATABASE_PATH: join(directory, 'data', 'lexplantillas.db'),
};
function run(args) {
  const result = spawnSync(process.execPath, ['--no-warnings', ...args], { env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`SMOKE_STEP_FAILED:${args[0]}`);
}
try {
  mkdirSync(join(directory, 'data'), { recursive: true });
  const db = new DatabaseSync(env.LEXPLANTILLAS_DATABASE_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  const migrations = readdirSync('prisma/migrations', { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const name of migrations) db.exec(readFileSync(join('prisma/migrations', name, 'migration.sql'), 'utf8'));
  db.exec('CREATE TABLE IF NOT EXISTS _prisma_migrations (id TEXT PRIMARY KEY, checksum TEXT, finished_at DATETIME, migration_name TEXT, logs TEXT, rolled_back_at DATETIME, started_at DATETIME, applied_steps_count INTEGER)');
  db.exec("INSERT INTO _prisma_migrations VALUES ('smoke','x',current_timestamp,'smoke',NULL,NULL,current_timestamp,1)");
  db.close();
  const out = join(directory, 'backup');
  run(['scripts/db-backup.mjs', out]);
  run(['scripts/db-validate-backup.mjs', join(out, 'lexplantillas.db')]);
  run(['scripts/db-restore.mjs', `--backup=${join(out, 'lexplantillas.db')}`, '--confirm-target=YES']);
  JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'));
  console.log('BACKUP_RESTORE_SMOKE=PASS');
} finally {
  await rm(directory, { recursive: true, force: true });
}
