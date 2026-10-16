/**
 * Fase G — Neon ya no es dependencia de ejecución.
 *
 * Comprobaciones estáticas (dependencias, esquema, código de runtime) y de
 * comportamiento (una URL remota heredada en el entorno no se lee ni se contacta).
 * Solo datos sintéticos y archivos temporales.
 */
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalPrismaClient, resolveLocalDatabasePath, toSqliteUrl } from '@/lib/db/localDatabase';

const ROOT = process.cwd();
const RUNTIME_DIRS = ['app', 'lib', 'components', 'scripts'];
// Importador OPCIONAL de un JSON ya exportado: no abre conexiones (ver docs/persistencia-local.md).
const ALLOWED_NEON_NAMED_FILES = new Set([path.join('lib', 'db', 'importNeonBackup.ts')]);

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(path.join(ROOT, directory), { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === '.next' ? [] : sourceFiles(relative);
    return /\.(ts|tsx|mjs|mts|js)$/.test(entry.name) ? [relative] : [];
  }));
  return nested.flat();
}

const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let root: string;
beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), 'lex-sin-neon-')); });
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('dependencias y esquema', () => {
  it('package.json y package-lock.json no incluyen controladores de Postgres ni de Neon', async () => {
    const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies });
    expect(names.filter((name) => /neon|^pg$|^pg-|postgres|adapter-pg|@vercel\/postgres/i.test(name))).toEqual([]);
    const lock = await readFile(path.join(ROOT, 'package-lock.json'), 'utf8');
    expect(lock).not.toMatch(/@neondatabase|"node_modules\/pg"|adapter-pg|@vercel\/postgres/i);
  });

  it('el datasource de Prisma es SQLite y no lee DATABASE_URL', async () => {
    const schema = await readFile(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
    const datasource = /datasource\s+db\s*\{[^}]*\}/.exec(schema)?.[0] ?? '';
    expect(datasource).toMatch(/provider\s*=\s*"sqlite"/);
    expect(datasource).not.toMatch(/(?<![A-Z_])(DATABASE_URL|DIRECT_URL)|postgres/i);
  });
});

describe('código de ejecución', () => {
  it('ningún módulo de runtime importa clientes remotos ni lee variables de conexión remota', async () => {
    const offenders: string[] = [];
    for (const file of (await Promise.all(RUNTIME_DIRS.map(sourceFiles))).flat()) {
      const code = stripComments(await readFile(path.join(ROOT, file), 'utf8'));
      if (/@neondatabase|from\s+['"]pg['"]|require\(['"]pg['"]\)|@prisma\/adapter-(pg|neon)|@vercel\/postgres/.test(code)) offenders.push(`${file}: cliente remoto`);
      if (/process\.env\.(DATABASE_URL|DIRECT_URL|POSTGRES_\w+)|env\(["'](DATABASE_URL|DIRECT_URL)["']\)/.test(code)) offenders.push(`${file}: variable de conexión remota`);
      if (/neon\.tech|neondb|-pooler\./i.test(code)) offenders.push(`${file}: host de Neon`);
      if (!ALLOWED_NEON_NAMED_FILES.has(file) && /neon/i.test(code)) offenders.push(`${file}: referencia a Neon en código`);
    }
    expect(offenders).toEqual([]);
  });

  it('lib/prisma.ts usa solo el cliente local y existe una única construcción de PrismaClient', async () => {
    const prismaModule = await readFile(path.join(ROOT, 'lib', 'prisma.ts'), 'utf8');
    expect(prismaModule).toMatch(/createLocalPrismaClient/);
    const constructions: string[] = [];
    for (const file of (await Promise.all(RUNTIME_DIRS.map(sourceFiles))).flat()) {
      if (/new\s+PrismaClient\s*\(/.test(stripComments(await readFile(path.join(ROOT, file), 'utf8')))) constructions.push(file);
    }
    expect(constructions).toEqual([path.join('lib', 'db', 'localDatabase.ts')]);
  });
});

describe('comportamiento con una URL remota heredada en el entorno', () => {
  it('la ruta y la URL de la base local no dependen de DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://sintetico:x@ep-sintetico-pooler.example.invalid/neondb?sslmode=require');
    vi.stubEnv('DIRECT_URL', 'postgresql://sintetico:x@ep-sintetico.example.invalid/neondb');
    vi.stubEnv('LEXPLANTILLAS_DATABASE_PATH', path.join(root, 'data', 'lexplantillas.db'));
    const databasePath = resolveLocalDatabasePath();
    expect(databasePath).toBe(path.join(root, 'data', 'lexplantillas.db'));
    expect(toSqliteUrl(databasePath)).toMatch(/^file:/);
  });

  it('inicializa, escribe, actualiza y reabre la base local sin abrir ninguna conexión de red', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://sintetico:x@ep-sintetico-pooler.example.invalid/neondb?sslmode=require');
    vi.stubEnv('DIRECT_URL', 'postgresql://sintetico:x@ep-sintetico.example.invalid/neondb');
    const attempted: string[] = [];
    const originalConnect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function recordConnect(this: net.Socket, ...args: unknown[]) {
      const first = args[0] as { host?: string; path?: string } | number | undefined;
      attempted.push(typeof first === 'object' && first ? String(first.host ?? first.path ?? 'local') : 'local');
      return (originalConnect as (...a: unknown[]) => net.Socket).apply(this, args);
    } as typeof net.Socket.prototype.connect;
    const databasePath = path.join(root, 'data', 'lexplantillas.db');
    const migrationsDir = path.resolve('prisma', 'migrations');
    try {
      let client = createLocalPrismaClient({ databasePath, migrationsDir });
      const created = await client.organization.create({ data: { name: 'Despacho sintético', slug: 'despacho-sintetico' } });
      await client.organization.update({ where: { id: created.id }, data: { name: 'Despacho sintético editado' } });
      await client.$disconnect();

      client = createLocalPrismaClient({ databasePath, migrationsDir });
      const reopened = await client.organization.findUnique({ where: { slug: 'despacho-sintetico' } });
      expect(reopened?.name).toBe('Despacho sintético editado');
      expect(await client.organization.count()).toBe(1);
      const applied = await client.$queryRawUnsafe<Array<{ migration_name: string }>>('SELECT migration_name FROM _prisma_migrations');
      expect(applied.map((row) => row.migration_name)).toEqual(['202610130001_sqlite_local_baseline']);
      await client.$disconnect();
    } finally {
      net.Socket.prototype.connect = originalConnect;
    }
    expect(attempted.filter((host) => /neon|pooler|example\.invalid|postgres/i.test(host))).toEqual([]);
  });

  it('un fallo de un servicio externo opcional no altera los datos locales ya guardados', async () => {
    const databasePath = path.join(root, 'data', 'lexplantillas.db');
    const migrationsDir = path.resolve('prisma', 'migrations');
    const client = createLocalPrismaClient({ databasePath, migrationsDir });
    try {
      await client.organization.create({ data: { name: 'Despacho sintético', slug: 'despacho-sintetico' } });
      const failingFetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
      vi.stubGlobal('fetch', failingFetch);
      await expect(fetch('https://proveedor-ia.example.invalid/v1')).rejects.toThrow('fetch failed');
      expect(await client.organization.count()).toBe(1);
      expect((await client.organization.findUnique({ where: { slug: 'despacho-sintetico' } }))?.name).toBe('Despacho sintético');
    } finally {
      vi.unstubAllGlobals();
      await client.$disconnect();
    }
  });
});
