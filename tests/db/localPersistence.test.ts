/**
 * Fase 1 — persistencia local SQLite (sin Neon, sin red).
 *
 * Ejercita las rutas reales (/api/legal-drafts, /api/legal-engine/parties,
 * /api/workspace/cases, export DOCX/PDF) contra un archivo SQLite temporal
 * migrado desde cero. Solo datos sintéticos. Ninguna prueba usa mocks de Prisma.
 */
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { applyLocalMigrations, createLocalPrismaClient, type LocalPrismaClient } from '@/lib/db/localDatabase';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';

const MIGRATIONS = path.resolve('prisma/migrations');
const EXPEDIENTE = 'SINT-0001/2026';

// Registro de intentos de conexión de red durante TODA la suite (prueba 9).
const attemptedHosts: string[] = [];
const originalSocketConnect = net.Socket.prototype.connect;
const originalTlsConnect = tls.connect;

let root: string;
let databasePath: string;

function syntheticDocument(text: string) {
  // createEmptyDocument genera su propio id; se fija el del documento sintético para que
  // un reintento del editor sea realmente el mismo documento.
  return { ...createEmptyDocument({
    id: 'doc-sintetico-0001',
    title: 'Contestación sintética',
    documentType: 'escrito_libre',
    matter: 'Civil',
    sections: [createDocumentNode({
      id: 'hechos', title: 'Hechos', type: 'facts',
      content: [{ id: 'hechos-1', text } as never],
    })],
  }), id: 'doc-sintetico-0001' };
}

function draftPayload(text: string) {
  const document = syntheticDocument(text);
  return {
    title: 'Expediente sintético de prueba',
    documentType: 'escrito_libre',
    matter: 'Civil',
    formData: { intake: { expediente: EXPEDIENTE, promovente: 'PERSONA SINTÉTICA A', demandado: 'EMPRESA FICTICIA B' } },
    renderedText: text,
    structuredDoc: document,
    status: 'DRAFT',
  };
}

function request(url: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3200${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Simula reiniciar la app: descarta el cliente y los módulos y los vuelve a cargar. */
async function reloadDataLayer() {
  const shared = globalThis as { prisma?: { $disconnect(): Promise<void> } };
  await shared.prisma?.$disconnect();
  delete shared.prisma;
  vi.resetModules();
  const drafts = await import('@/app/api/legal-drafts/route');
  const draft = await import('@/app/api/legal-drafts/[id]/route');
  const parties = await import('@/app/api/legal-engine/parties/route');
  const cases = await import('@/app/api/workspace/cases/route');
  const docx = await import('@/app/api/legal-engine/export/docx/route');
  const pdf = await import('@/app/api/legal-engine/export/pdf/route');
  const { prisma } = await import('@/lib/prisma');
  return { drafts, draft, parties, cases, docx, pdf, prisma: prisma as unknown as LocalPrismaClient };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(() => {
  net.Socket.prototype.connect = function recordConnect(this: net.Socket, ...args: unknown[]) {
    const first = args[0] as { host?: string } | number | undefined;
    attemptedHosts.push(typeof first === 'object' && first ? String(first.host ?? 'localhost') : typeof args[1] === 'string' ? args[1] : 'localhost');
    return (originalSocketConnect as (...a: unknown[]) => net.Socket).apply(this, args);
  } as typeof net.Socket.prototype.connect;
  (tls as { connect: unknown }).connect = (...args: unknown[]) => {
    const options = args.find((arg) => arg && typeof arg === 'object') as { host?: string } | undefined;
    attemptedHosts.push(String(options?.host ?? 'localhost'));
    return (originalTlsConnect as (...a: unknown[]) => tls.TLSSocket)(...args);
  };
});

afterAll(() => {
  net.Socket.prototype.connect = originalSocketConnect;
  (tls as { connect: unknown }).connect = originalTlsConnect;
});

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'lex-sqlite-fase1-'));
  databasePath = path.join(root, 'data', 'lexplantillas.db');
  vi.stubEnv('LEXPLANTILLAS_STORAGE_ROOT', root);
  vi.stubEnv('LEXPLANTILLAS_DATABASE_PATH', databasePath);
  vi.stubEnv('LEX_RUNTIME_MODE', 'WEB');
  vi.stubEnv('DEMO_MODE_ENABLED', 'false');
  vi.stubEnv('LEGAL_CASES_USER_EMAIL', 'abogado.sintetico@example.invalid');
  vi.stubEnv('LEGAL_CASES_ORG_SLUG', 'despacho-sintetico');
});

afterEach(async () => {
  const shared = globalThis as { prisma?: { $disconnect(): Promise<void> } };
  await shared.prisma?.$disconnect();
  delete shared.prisma;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('1. base SQLite temporal y migraciones desde cero', () => {
  it('crea el archivo, aplica la migración base, activa WAL y es idempotente', async () => {
    const client = createLocalPrismaClient({ databasePath, migrationsDir: MIGRATIONS });
    try {
      await client.$ready();
      const tables = (await client.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)).map((row) => row.name);
      expect(tables).toEqual(expect.arrayContaining(['LegalDraft', 'workspace_case_party', 'Organization', 'User', 'LegalTemplate', 'LawyerStyleProfile', '_prisma_migrations']));
      const migrations = await client.$queryRawUnsafe<Array<{ migration_name: string; finished_at: unknown }>>(
        'SELECT migration_name, finished_at FROM _prisma_migrations');
      expect(migrations.map((row) => row.migration_name)).toEqual(['202610130001_sqlite_local_baseline']);
      expect(migrations[0].finished_at).not.toBeNull();
      const journal = await client.$queryRawUnsafe<Array<{ journal_mode: string }>>('PRAGMA journal_mode');
      expect(journal[0].journal_mode).toBe('wal');
      expect(await applyLocalMigrations(client as never, MIGRATIONS)).toEqual([]);
      expect(client.$databasePath).toBe(databasePath);
    } finally {
      await client.$disconnect();
    }
  });

  it('rechaza una migración aplicada que fue modificada después', async () => {
    const migrationsCopy = path.join(root, 'migrations');
    await cp(MIGRATIONS, migrationsCopy, { recursive: true });
    const client = createLocalPrismaClient({ databasePath, migrationsDir: migrationsCopy });
    try {
      await client.$ready();
      const file = path.join(migrationsCopy, '202610130001_sqlite_local_baseline', 'migration.sql');
      await writeFile(file, `${await readFile(file, 'utf8')}\n-- alterada\n`);
      await expect(applyLocalMigrations(client as never, migrationsCopy)).rejects.toThrow(/LOCAL_DB_MIGRATION_MODIFIED/);
    } finally {
      await client.$disconnect();
    }
  });
});

describe('2–6. expediente, partes y borrador sobreviven a reinicializar', () => {
  it('guarda expediente con partes, borrador, reinicia, edita y reintenta sin duplicar', async () => {
    let layer = await reloadDataLayer();

    // 2. Expediente sintético con partes.
    const created = await layer.drafts.POST(request('/api/legal-drafts', 'POST', draftPayload('Texto sintético original.')));
    expect(created.status).toBe(201);
    const { draft } = await created.json();
    for (const [role, name] of [['actor', 'PERSONA SINTÉTICA A'], ['demandado', 'EMPRESA FICTICIA B']]) {
      const saved = await layer.parties.POST(request('/api/legal-engine/parties', 'POST', { caseKey: EXPEDIENTE, role, name }));
      expect(saved.status).toBe(200);
    }
    const cases = await (await layer.cases.GET(request('/api/workspace/cases'))).json();
    expect(cases.ok).toBe(true);
    expect(cases.cases).toEqual([expect.objectContaining({ id: draft.id, expediente: EXPEDIENTE, actor: 'PERSONA SINTÉTICA A', counterparty: 'EMPRESA FICTICIA B' })]);
    const parties = await (await layer.parties.GET(request(`/api/legal-engine/parties?caseKey=${encodeURIComponent(EXPEDIENTE)}`))).json();
    expect(parties.parties.map((party: { role: string; name: string }) => [party.role, party.name]))
      .toEqual([['actor', 'PERSONA SINTÉTICA A'], ['demandado', 'EMPRESA FICTICIA B']]);

    // 3. Borrador guardado y consultable.
    const fetched = await (await layer.draft.GET(request(`/api/legal-drafts/${draft.id}`), params(draft.id))).json();
    expect(fetched.draft.structuredDoc.sections[0].content[0].text).toBe('Texto sintético original.');

    // 4. Reinicializar la capa de datos (nuevo cliente, mismo archivo).
    layer = await reloadDataLayer();
    const reopened = await (await layer.draft.GET(request(`/api/legal-drafts/${draft.id}`), params(draft.id))).json();
    expect(reopened.ok).toBe(true);
    expect(reopened.draft.structuredDoc.sections[0].content[0].text).toBe('Texto sintético original.');

    // 5. Editar, guardar y verificar tras otro reinicio.
    const edited = draftPayload('Texto sintético editado por el abogado.');
    const patched = await layer.draft.PATCH(request(`/api/legal-drafts/${draft.id}`, 'PATCH', edited), params(draft.id));
    expect(patched.status).toBe(200);
    layer = await reloadDataLayer();
    const afterEdit = await (await layer.draft.GET(request(`/api/legal-drafts/${draft.id}`), params(draft.id))).json();
    expect(afterEdit.draft.structuredDoc.sections[0].content[0].text).toBe('Texto sintético editado por el abogado.');
    expect(afterEdit.draft.renderedText).toBe('Texto sintético editado por el abogado.');

    // 6. Reintentos del mismo guardado: ni POST repetido, ni POST concurrente, ni la parte repetida duplican.
    const retried = await layer.drafts.POST(request('/api/legal-drafts', 'POST', edited));
    expect(retried.status).toBe(200);
    expect((await retried.json()).draft.id).toBe(draft.id);
    const keyed = draftPayload('Otro documento sintético.');
    keyed.structuredDoc = { ...keyed.structuredDoc, id: 'doc-sintetico-0002' };
    const concurrent = await Promise.all([1, 2, 3].map(() =>
      layer.drafts.POST(request('/api/legal-drafts', 'POST', keyed, { 'Idempotency-Key': 'guardado-sintetico-42' }))));
    expect(concurrent.every((response) => response.ok)).toBe(true);
    const concurrentIds = new Set(await Promise.all(concurrent.map(async (response) => (await response.json()).draft.id)));
    expect(concurrentIds.size).toBe(1);
    await layer.parties.POST(request('/api/legal-engine/parties', 'POST', { caseKey: EXPEDIENTE, role: 'actor', name: 'PERSONA SINTÉTICA A' }));
    expect(await layer.prisma.legalDraft.count()).toBe(2);
    expect(await layer.prisma.caseParty.count()).toBe(2);
    const listed = await (await layer.drafts.GET(request('/api/legal-drafts'))).json();
    expect(listed.drafts).toHaveLength(2);
  });
});

describe('7. fallo de escritura', () => {
  it('conserva el texto en una copia de recuperación y responde un error claro (PATCH y POST)', async () => {
    const layer = await reloadDataLayer();
    const created = await (await layer.drafts.POST(request('/api/legal-drafts', 'POST', draftPayload('Versión guardada.')))).json();
    // Fallo real en SQLite (no un mock): un trigger aborta las escrituras.
    await layer.prisma.$executeRawUnsafe(`CREATE TRIGGER simular_fallo_update BEFORE UPDATE ON "LegalDraft" BEGIN SELECT RAISE(ABORT, 'fallo de escritura simulado'); END`);
    await layer.prisma.$executeRawUnsafe(`CREATE TRIGGER simular_fallo_insert BEFORE INSERT ON "LegalDraft" BEGIN SELECT RAISE(ABORT, 'fallo de escritura simulado'); END`);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const failedPatch = await layer.draft.PATCH(
      request(`/api/legal-drafts/${created.draft.id}`, 'PATCH', draftPayload('Texto editado que no debe perderse.')), params(created.draft.id));
    expect(failedPatch.status).toBe(503);
    const patchBody = await failedPatch.json();
    expect(patchBody).toMatchObject({ ok: false, errorCode: 'DRAFT_SAVE_FAILED' });
    expect(patchBody.error).toMatch(/No se pudo guardar el borrador/);
    expect(patchBody.recoveryId).toEqual(expect.any(String));

    const unsaved = draftPayload('Borrador nuevo que no debe perderse.');
    unsaved.structuredDoc = { ...unsaved.structuredDoc, id: 'doc-sintetico-0003' };
    const failedPost = await layer.drafts.POST(request('/api/legal-drafts', 'POST', unsaved));
    expect(failedPost.status).toBe(503);
    expect((await failedPost.json()).errorCode).toBe('DRAFT_SAVE_FAILED');

    const recoveryDirectory = path.join(root, 'data', 'recovery', 'drafts');
    const copies = await Promise.all((await readdir(recoveryDirectory)).map(async (file) => readFile(path.join(recoveryDirectory, file), 'utf8')));
    expect(copies).toHaveLength(2);
    expect(copies.some((copy) => copy.includes('Texto editado que no debe perderse.') && copy.includes(created.draft.id))).toBe(true);
    expect(copies.some((copy) => copy.includes('Borrador nuevo que no debe perderse.'))).toBe(true);
    // La versión anterior sigue intacta en la base.
    const stored = await layer.prisma.legalDraft.findUniqueOrThrow({ where: { id: created.draft.id } });
    expect(stored.renderedText).toBe('Versión guardada.');
  });
});

describe('8. exportación DOCX/PDF sin Neon', () => {
  it('exporta el borrador guardado verificando la propiedad contra SQLite', async () => {
    // El entorno de quien ejecuta puede traer una DATABASE_URL heredada (p. ej. desde .env). Se fija una URL remota
    // sintética: la persistencia local debe ignorarla y la prueba 9 comprueba que no se abrió ninguna conexión.
    vi.stubEnv('DATABASE_URL', 'postgresql://sintetico:x@ep-sintetico-pooler.example.invalid/neondb?sslmode=require');
    // Fuera de NODE_ENV=test para que la verificación de propiedad consulte la base real.
    vi.stubEnv('NODE_ENV', 'development');
    const layer = await reloadDataLayer();
    const payload = draftPayload('Texto sintético para exportar.');
    expect((await layer.drafts.POST(request('/api/legal-drafts', 'POST', payload))).status).toBe(201);
    for (const [format, route, magic] of [['docx', layer.docx.POST, 'PK'], ['pdf', layer.pdf.POST, '%PDF']] as const) {
      const response = await route(request(`/api/legal-engine/export/${format}`, 'POST', { document: payload.structuredDoc, exportMode: 'DRAFT' }));
      expect(response.status, format).toBe(200);
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.length).toBeGreaterThan(500);
      expect(bytes.subarray(0, magic.length).toString()).toBe(magic);
      const foreign = await route(request(`/api/legal-engine/export/${format}`, 'POST', { document: { ...payload.structuredDoc, id: 'doc-no-guardado' }, exportMode: 'DRAFT' }));
      expect(foreign.status).toBe(404);
    }
  });
});

describe('9. red bloqueada', () => {
  it('ninguna prueba de esta suite intentó conectarse fuera de la máquina (ni a Neon)', async () => {
    const generatedSchema = await readFile(path.resolve('node_modules/.prisma/client/schema.prisma'), 'utf8');
    expect(generatedSchema).toMatch(/provider\s*=\s*"sqlite"/);
    const remote = attemptedHosts.filter((host) => !['localhost', '127.0.0.1', '::1', ''].includes(host));
    expect(remote).toEqual([]);
    expect(attemptedHosts.some((host) => /neon|pooler|pgbouncer/i.test(host))).toBe(false);
  });
});
