import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dump = process.argv[2];
if (!dump || !existsSync(dump)) throw new Error('BACKUP_DUMP_NOT_FOUND');
const result = spawnSync('pg_restore', ['--list', dump], { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`BACKUP_VALIDATION_FAILED_${result.status ?? 'UNKNOWN'}`);
console.log('BACKUP_VALID=YES');
