import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { resolveLexPlantillasStoragePaths } from '@/lib/workspace/storagePaths';

/**
 * Persistencia local (SQLite) de expedientes, partes, borradores y preferencias.
 *
 * - Archivo: <carpeta de datos del usuario>/data/lexplantillas.db
 *   (%LOCALAPPDATA%\LexPlantillas en Windows; configurable con
 *   LEXPLANTILLAS_DATABASE_PATH o LEXPLANTILLAS_STORAGE_ROOT).
 * - Migraciones: prisma/migrations/* aplicadas en orden y registradas en
 *   "_prisma_migrations" con el mismo formato que `prisma migrate deploy`.
 * - Modo WAL (persistente en el archivo) y espera de bloqueo de 10 s por conexión.
 *
 * No hay conexión de red: SQLite es un archivo local. NO está cifrado; ver
 * docs/persistencia-local.md para la protección real y lo pendiente.
 */

export interface LocalDatabaseOptions {
  /** Ruta absoluta del archivo .db. Por defecto, la carpeta de datos del usuario. */
  databasePath?: string;
  /** Carpeta de migraciones. Por defecto, prisma/migrations bajo el cwd. */
  migrationsDir?: string;
}

export function resolveLocalDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.LEXPLANTILLAS_DATABASE_PATH?.trim();
  const resolved = path.resolve(explicit || path.join(resolveLexPlantillasStoragePaths().data, 'lexplantillas.db'));
  // Nunca junto a las dependencias: una reinstalación borraría los expedientes.
  if (resolved.split(path.sep).some((segment) => segment.toLowerCase() === 'node_modules')) {
    throw new Error('LOCAL_DB_PATH_INSIDE_NODE_MODULES');
  }
  return resolved;
}

export function resolveMigrationsDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.LEXPLANTILLAS_MIGRATIONS_DIR?.trim() || path.join(process.cwd(), 'prisma', 'migrations'));
}

/** URL de Prisma para SQLite. socket_timeout = espera máxima (s) ante un bloqueo de escritura. */
export function toSqliteUrl(databasePath: string): string {
  return `file:${databasePath.replaceAll('\\', '/')}?socket_timeout=10`;
}

function ensurePrivateDirectory(directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  // En Windows chmod solo controla el bit de solo lectura; la protección real es
  // la ACL por usuario de %LOCALAPPDATA%. En POSIX deja la carpeta en 0700.
  if (process.platform !== 'win32') chmodSync(directory, 0o700);
}

export interface LocalMigration {
  name: string;
  sql: string;
  checksum: string;
}

export function readLocalMigrations(migrationsDir: string): LocalMigration[] {
  if (!existsSync(migrationsDir)) throw new Error('LOCAL_DB_MIGRATIONS_NOT_FOUND');
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(migrationsDir, entry.name, 'migration.sql')))
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const sql = readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    });
}

/** Divide un script de migración generado por Prisma en sentencias ejecutables. */
export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

const MIGRATIONS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "checksum" TEXT NOT NULL,
  "finished_at" DATETIME,
  "migration_name" TEXT NOT NULL,
  "logs" TEXT,
  "rolled_back_at" DATETIME,
  "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
  "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

type AppliedRow = { migration_name: string; checksum: string; finished_at: unknown; rolled_back_at: unknown };

/** Aplica las migraciones pendientes. Idempotente: reejecutarlo no cambia nada. */
export async function applyLocalMigrations(client: PrismaClient, migrationsDir: string): Promise<string[]> {
  const migrations = readLocalMigrations(migrationsDir);
  const journal = await client.$queryRawUnsafe<Array<{ journal_mode: string }>>('PRAGMA journal_mode = WAL');
  if (String(journal[0]?.journal_mode).toLowerCase() !== 'wal') throw new Error('LOCAL_DB_WAL_UNAVAILABLE');
  await client.$executeRawUnsafe(MIGRATIONS_TABLE_SQL);
  const applied = new Map(
    (await client.$queryRawUnsafe<AppliedRow[]>(
      'SELECT "migration_name", "checksum", "finished_at", "rolled_back_at" FROM "_prisma_migrations"',
    )).filter((row) => row.rolled_back_at === null).map((row) => [row.migration_name, row]),
  );
  const newlyApplied: string[] = [];
  for (const migration of migrations) {
    const previous = applied.get(migration.name);
    if (previous) {
      if (previous.finished_at === null) throw new Error(`LOCAL_DB_MIGRATION_INCOMPLETE:${migration.name}`);
      if (previous.checksum !== migration.checksum) throw new Error(`LOCAL_DB_MIGRATION_MODIFIED:${migration.name}`);
      continue;
    }
    const statements = splitSqlStatements(migration.sql);
    // DDL de SQLite es transaccional: o se aplica la migración completa o nada.
    await client.$transaction(async (tx) => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe(
        'INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count") VALUES (?, ?, current_timestamp, ?, current_timestamp, ?)',
        randomUUID(), migration.checksum, migration.name, statements.length,
      );
    });
    newlyApplied.push(migration.name);
  }
  return newlyApplied;
}

export type LocalPrismaClient = PrismaClient & {
  /** Abre el archivo y aplica migraciones pendientes (se ejecuta solo una vez). */
  $ready(): Promise<void>;
  readonly $databasePath: string;
};

/**
 * Crea un cliente Prisma sobre el archivo SQLite local. Toda operación (modelos y
 * SQL crudo) espera a que el esquema esté migrado; si la inicialización falla, el
 * siguiente intento la reintenta en lugar de quedar envenenada.
 */
export function createLocalPrismaClient(options: LocalDatabaseOptions = {}): LocalPrismaClient {
  const databasePath = options.databasePath ?? resolveLocalDatabasePath();
  const migrationsDir = options.migrationsDir ?? resolveMigrationsDir();
  ensurePrivateDirectory(path.dirname(databasePath));
  const base = new PrismaClient({ datasourceUrl: toSqliteUrl(databasePath) });
  let ready: Promise<void> | null = null;
  const ensureReady = () => {
    ready ??= applyLocalMigrations(base, migrationsDir).then(() => undefined, (error) => {
      ready = null;
      throw error;
    });
    return ready;
  };
  const extended = base.$extends({
    query: {
      async $allOperations({ args, query }) {
        await ensureReady();
        return query(args);
      },
    },
  });
  // $transaction no pasa por $allOperations: sin esto, una transacción como primera
  // operación abriría el archivo antes de migrar y bloquearía la propia migración.
  const transaction = extended.$transaction.bind(extended) as (...args: unknown[]) => Promise<unknown>;
  return Object.assign(extended, {
    $ready: ensureReady,
    $databasePath: databasePath,
    $transaction: async (...args: unknown[]) => {
      await ensureReady();
      return transaction(...args);
    },
  }) as unknown as LocalPrismaClient;
}
