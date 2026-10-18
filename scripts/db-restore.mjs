// Restaura un respaldo sobre la base local. La base actual se conserva como
// <db>.antes-de-restaurar-<fecha> (nunca se borra). Cerrar la aplicación antes.
import { copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { databasePath } from './db-paths.mjs';

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}
const backup = arg('backup');
if (!backup) throw new Error('RESTORE_REQUIRES_BACKUP');
if (arg('confirm-target') !== 'YES') throw new Error('RESTORE_REQUIRES_CONFIRM_TARGET_YES');
if (!existsSync(backup)) throw new Error('RESTORE_BACKUP_NOT_FOUND');
const check = spawnSync(process.execPath, [fileURLToPath(new URL('./db-validate-backup.mjs', import.meta.url)), backup], { stdio: 'inherit' });
if (check.status !== 0) throw new Error('RESTORE_BACKUP_INVALID');
const target = resolve(arg('target') || databasePath());
if (existsSync(target)) copyFileSync(target, `${target}.antes-de-restaurar-${new Date().toISOString().replaceAll(':', '-')}`);
for (const suffix of ['-wal', '-shm']) if (existsSync(target + suffix)) unlinkSync(target + suffix);
copyFileSync(backup, target);
console.log(`RESTORE_OK target=${target}`);
