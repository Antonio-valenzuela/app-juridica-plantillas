// Sondeo de solo lectura de la base SQLite local. No escribe ni crea la base.
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { databasePath } from '../db-paths.mjs';

const path = databasePath();
const report = {
  checkedAt: new Date().toISOString(),
  operation: 'SELECT 1 only; read-only',
  database: 'SQLITE_LOCAL',
  remoteDependency: false,
  exists: existsSync(path),
};
if (report.exists) {
  try {
    const db = new DatabaseSync(path, { readOnly: true });
    db.prepare('SELECT 1 AS available').get();
    db.close();
    report.connectivity = 'PASS';
  } catch (error) {
    report.connectivity = 'FAIL';
    report.errorCode = error.code || 'SQLITE_OPEN_ERROR';
  }
} else {
  report.connectivity = 'NOT_CREATED_YET';
}
console.log(JSON.stringify(report, null, 2));
