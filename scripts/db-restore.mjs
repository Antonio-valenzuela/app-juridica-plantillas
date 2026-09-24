import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

const dump = arg('dump');
const databaseUrl = arg('database-url') || process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!dump || !databaseUrl) throw new Error('RESTORE_REQUIRES_DUMP_AND_DATABASE_URL');
if (arg('confirm-target') !== 'YES') throw new Error('RESTORE_REQUIRES_CONFIRM_TARGET_YES');
if (!existsSync(dump)) throw new Error('RESTORE_DUMP_NOT_FOUND');

const result = spawnSync('pg_restore', ['--clean', '--if-exists', '--no-owner', '--dbname', databaseUrl, dump], { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`PG_RESTORE_FAILED_${result.status ?? 'UNKNOWN'}`);
console.log('RESTORE_OK');
