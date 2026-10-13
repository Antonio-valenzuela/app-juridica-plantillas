import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const backup = process.argv[2];
if (!backup || !existsSync(backup)) throw new Error('BACKUP_DB_NOT_FOUND');
const db = new DatabaseSync(backup, { readOnly: true });
try {
  const integrity = db.prepare('PRAGMA integrity_check').all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('BACKUP_VALIDATION_FAILED_INTEGRITY');
  const migrations = db.prepare('SELECT COUNT(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL').get().n;
  if (!migrations) throw new Error('BACKUP_VALIDATION_FAILED_NO_MIGRATIONS');
  const drafts = db.prepare('SELECT COUNT(*) AS n FROM "LegalDraft"').get().n;
  console.log(`BACKUP_VALID=YES migrations=${migrations} drafts=${drafts}`);
} finally { db.close(); }
