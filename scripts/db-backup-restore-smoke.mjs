import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL?.trim();
if (!databaseUrl || !adminUrl) {
  console.log('BACKUP_RESTORE_SMOKE=SKIPPED_NO_ISOLATED_TEST_DATABASE');
  process.exit(0);
}

const directory = await mkdtemp(join(tmpdir(), 'app-plantillas-db-smoke-'));
const dump = join(directory, 'database.dump');
try {
  const backup = spawnSync(process.execPath, ['scripts/db-backup.mjs', directory], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit' });
  if (backup.status !== 0) throw new Error('BACKUP_STEP_FAILED');
  const restore = spawnSync(process.execPath, ['scripts/db-restore.mjs', `--dump=${dump}`, `--database-url=${databaseUrl}`, '--confirm-target=YES'], { env: { ...process.env, TEST_DATABASE_URL: databaseUrl, TEST_DATABASE_ADMIN_URL: adminUrl }, stdio: 'inherit' });
  if (restore.status !== 0) throw new Error('RESTORE_STEP_FAILED');
  console.log('BACKUP_RESTORE_SMOKE=PASS');
} finally {
  await rm(directory, { recursive: true, force: true });
}
