import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
let root: string;
function req(endpoint: string, method = 'GET', body?: unknown) { return new NextRequest(`http://127.0.0.1:3200/api/${endpoint}`, {
  method, headers: { 'content-type': 'application/json', 'x-lex-desktop-capability': 'a'.repeat(64) }, ...(body ? { body: JSON.stringify(body) } : {}),
}); }
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'lex-routes-'));
  for (const [key, value] of Object.entries({ LEXPLANTILLAS_STORAGE_ROOT: root, LEX_RUNTIME_MODE: 'DESKTOP_LOCAL', LEX_DESKTOP_BIND_ADDRESS: '127.0.0.1',
    LEX_DESKTOP_PORT: '3200', LEX_DESKTOP_CAPABILITY: 'a'.repeat(64), LEX_DESKTOP_EXPIRES_AT: String(Date.now() + 600000), NODE_ENV: 'production',
    LEGAL_CASES_USER_EMAIL: '', LEGAL_CASES_ORG_SLUG: '', DEMO_MODE_ENABLED: 'false' })) vi.stubEnv(key, value);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
it('imports a controlled file and links its verified storage metadata to an existing local case', async () => {
  const cases = await import('@/app/api/workspace/cases/route');
  const imports = await import('@/app/api/workspace/local-import/route');
  const input = path.join(root, 'input'); await mkdir(input);
  await writeFile(path.join(input, 'demanda-civil-sintetica.txt'), 'DEMANDA CIVIL SINTETICA. HECHOS: manifestaciones no acreditadas. Documento de prueba, sin fechas procesales.');
  const { case: item } = await (await cases.POST(req('workspace/cases', 'POST', { title: 'CASO SINTETICO' }))).json();
  const analyzed = await imports.POST(req('workspace/local-import', 'POST', { sourcePath: input, action: 'analyze' }));
  expect(analyzed.status).toBe(200);
  const scan = await analyzed.json();
  const result = await imports.POST(req('workspace/local-import', 'POST', { action: 'import', scanId: scan.scanId, recordIds: [scan.records[0].id], caseId: item.id }));
  expect(result.status).toBe(200);
  expect((await result.json()).imported).toHaveLength(1);
  const linked = (await (await cases.GET(req('workspace/cases'))).json()).cases.find((value: { id: string }) => value.id === item.id);
  expect(linked.importedRecords).toEqual([expect.objectContaining({ id: scan.records[0].id, scanId: scan.scanId, sha256: scan.records[0].sha256 })]);
  expect((await (await imports.GET(req('workspace/local-import'))).json()).items).toHaveLength(1);
});
it('reads actual local dashboard without a WEB principal', async () => {
  const { GET } = await import('@/app/api/workspace/dashboard/route');
  const response = await GET(req('workspace/dashboard'));
  expect(response.status).toBe(200);
  expect((await response.json()).stats.totalDocuments).toBe(0);
});
it('reaches local import input validation before any scan or remote database', async () => {
  const { POST } = await import('@/app/api/workspace/local-import/route');
  expect((await POST(req('workspace/local-import', 'POST', {}))).status).toBe(400);
});
it('reaches editor format validation using the local capability', async () => {
  const { POST } = await import('@/app/api/legal-engine/format/route');
  expect((await POST(req('legal-engine/format', 'POST', {}))).status).toBe(400);
});
it('reaches section-generation validation without calling a provider for missing input', async () => {
  const { POST } = await import('@/app/api/legal-engine/generate-section/route');
  expect((await POST(req('legal-engine/generate-section', 'POST', {}))).status).toBe(400);
});
