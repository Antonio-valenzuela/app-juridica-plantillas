import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { POST, GET as listDrafts } from '@/app/api/legal-drafts/route';
import { GET, PATCH } from '@/app/api/legal-drafts/[id]/route';
import { GET as analytics } from '@/app/api/workspace/analytics/route';
import { GET as cases } from '@/app/api/workspace/cases/route';
import { POST as exchange } from '@/app/api/desktop-local/session/route';
import { POST as exportDocx } from '@/app/api/legal-engine/export/docx/route';
import { POST as exportPdf } from '@/app/api/legal-engine/export/pdf/route';
import { extractDownloadFilename } from '@/lib/legal-engine/outputFilename';
import { GET as openDocument } from '@/app/api/legal-engine/documents/[documentId]/route';
import { GET as reviewDocument, POST as applyReview } from '@/app/api/legal-engine/review/route';
import { createGenerationJob, evictGenerationJob } from '@/lib/legal-engine/generationJobs';
import { flushGenerationJobPersistence, recoverGenerationJob, persistGenerationJob } from '@/lib/legal-engine/generationJobPersistence';
import { DesktopProfileRepository } from '@/lib/workspace/desktopProfileRepository';
import { createEmptyDocument, createDocumentNode } from '@/lib/legal-engine/types';
import { DesktopDraftRepository } from '@/lib/workspace/desktopDraftRepository';

let root: string;
const capability = 'f'.repeat(64);
function request(url: string, method = 'GET', body?: unknown, authorized = true) {
  return new NextRequest(`http://127.0.0.1:3200${url}`, { method,
    headers: { 'content-type': 'application/json', ...(authorized ? { 'x-lex-desktop-capability': capability } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const payload = { title: 'Expediente sintético', documentType: 'contestacion_civil', matter: 'Civil',
  formData: { intake: { expediente: 'SINTETICO-01', promovente: 'PERSONA A' } },
  structuredDoc: { id: 'synthetic-document', sections: [{ id: 's1', content: [{ id: 'b1', text: 'Texto sintético pendiente de revisión.' }] }],
    generationMetadata: { readiness: 'REQUIRES_REVIEW', qualityGate: false },
  }, validationResults: { isValid: false, errors: [], warnings: [] },
  generationMetadata: { persistence: { terminalStatus: 'NEEDS_REVIEW' } },
};
beforeEach(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('LEGAL_CASES_USER_EMAIL', '');
  vi.stubEnv('LEGAL_CASES_ORG_SLUG', '');
  root = await mkdtemp(path.join(os.tmpdir(), 'lex-desktop-test-'));
  vi.stubEnv('LEXPLANTILLAS_STORAGE_ROOT', root);
  vi.stubEnv('LEX_RUNTIME_MODE', 'DESKTOP_LOCAL');
  vi.stubEnv('LEX_DESKTOP_BIND_ADDRESS', '127.0.0.1');
  vi.stubEnv('LEX_DESKTOP_PORT', '3200');
  vi.stubEnv('LEX_DESKTOP_CAPABILITY', capability);
  vi.stubEnv('LEX_DESKTOP_EXPIRES_AT', String(Date.now() + 600000));
});
afterEach(async () => { vi.useRealTimers(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
describe('REAL_LOCAL desktop draft repository (no mocked auth/store/aggregator)', () => {
  it('makes an interrupted valid checkpoint reopenable once, without promotion or duplicating the document', async () => {
    const owner = await new DesktopProfileRepository().load();
    const job = createGenerationJob({ desktopOwnerId: owner.ownerId });
    await flushGenerationJobPersistence(job.jobId);
    job.checkpointDocument = createEmptyDocument({ id: 'checkpoint-document', documentType: 'escrito_libre', sections: [createDocumentNode({ id: 'body', title: 'Manifestaciones', type: 'facts', content: [{ id: 'body-1', text: 'Manifestación sintética pendiente de revisión.' } as any] })] });
    job.completed = 1;
    job.checkpointDocument.id = 'checkpoint-document';
    await persistGenerationJob(job); evictGenerationJob(job.jobId);
    const [recovered] = await Promise.all([recoverGenerationJob(job.jobId), recoverGenerationJob(job.jobId)]);
    expect(recovered?.errorCode).toBe('DESKTOP_BACKEND_RESTARTED');
    const drafts = (await (await listDrafts(request('/api/legal-drafts'))).json()).drafts;
    expect(drafts).toHaveLength(1);
    expect(drafts[0].structuredDoc.id).toBe('checkpoint-document');
    expect(drafts[0].structuredDoc.sections[0].content[0].text).toBe('Manifestación sintética pendiente de revisión.');
    expect(drafts[0].structuredDoc.status).not.toBe('final');
    evictGenerationJob(job.jobId); await recoverGenerationJob(job.jobId);
    expect((await (await listDrafts(request('/api/legal-drafts'))).json()).drafts).toHaveLength(1);
    evictGenerationJob(job.jobId);
    await new DesktopDraftRepository().remove(drafts[0].id);
    await recoverGenerationJob(job.jobId);
    expect((await (await listDrafts(request('/api/legal-drafts'))).json()).drafts).toHaveLength(0);
    evictGenerationJob(job.jobId);
  });
  it('counts persisted failed jobs without a draft and preserves interrupted checkpoints after eviction', async () => {
    const owner = await new DesktopProfileRepository().load();
    const job = createGenerationJob({ desktopOwnerId: owner.ownerId });
    await flushGenerationJobPersistence(job.jobId);
    job.checkpointDocument = payload.structuredDoc as never;
    await persistGenerationJob(job);
    evictGenerationJob(job.jobId);
    const recovered = await recoverGenerationJob(job.jobId);
    expect(recovered?.errorCode).toBe('DESKTOP_BACKEND_RESTARTED');
    expect(recovered?.checkpointDocument?.id).toBe('synthetic-document');
    expect(recovered?.organizationId).toBeUndefined();
    expect((await (await analytics(request('/api/workspace/analytics'))).json()).totals.failed).toBe(1);
    evictGenerationJob(job.jobId);
  });
  it('authenticates review locally while retaining missing-document and missing-answer validation', async () => {
    expect((await reviewDocument(request('/api/legal-engine/review?documentId=not-stored'))).status).toBe(404);
    expect((await applyReview(request('/api/legal-engine/review', 'POST', { documentId: 'not-stored', answers: [] }))).status).toBe(400);
    expect((await reviewDocument(request('/api/legal-engine/review?documentId=not-stored', 'GET', undefined, false))).status).toBe(403);
  });
  it('reopens the generated-document endpoint from actual local storage without remote identity', async () => {
    expect((await POST(request('/api/legal-drafts', 'POST', payload))).status).toBe(201);
    const response = await openDocument(request('/api/legal-engine/documents/synthetic-document'), { params: Promise.resolve({ documentId: 'synthetic-document' }) });
    expect(response.status).toBe(200);
    expect((await response.json()).document.id).toBe('synthetic-document');
  });
  it('exports the stored local document as real DRAFT binaries without a fabricated WEB principal', async () => {
    const document = JSON.parse(await readFile('audit/final-pre-windows-readiness/legal-propagation/cases/contestacion/produced-document.json', 'utf8'));
    expect((await POST(request('/api/legal-drafts', 'POST', { ...payload, structuredDoc: document }))).status).toBe(201);
    for (const [format, route] of [['docx', exportDocx], ['pdf', exportPdf]] as const) {
      const response = await route(request(`/api/legal-engine/export/${format}`, 'POST', { document, exportMode: 'DRAFT' }));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toContain("filename*=UTF-8''");
      expect(extractDownloadFilename(response.headers.get('content-disposition'))).toBe(`contestación civil.${format}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.length).toBeGreaterThan(500);
      expect(bytes.subarray(0, format === 'pdf' ? 4 : 2).toString()).toBe(format === 'pdf' ? '%PDF' : 'PK');
      expect((await route(request(`/api/legal-engine/export/${format}`, 'POST', { document: { ...document, id: 'another-document' }, exportMode: 'DRAFT' }))).status).toBe(404);
      expect((await route(request(`/api/legal-engine/export/${format}`, 'POST', { document, exportMode: 'FINAL' }))).status).toBe(422);
      expect((await route(request(`/api/legal-engine/export/${format}`, 'POST', { document, exportMode: 'DRAFT' }, false))).status).toBe(403);
    }
  });
  it('uses the validated HTTP Host for browser origin when Next normalizes the internal URL', async () => {
    const headers = { cookie: `lex_desktop_workspace_cap=${capability}`, 'content-type': 'application/json',
      host: '127.0.0.1:3200', origin: 'http://127.0.0.1:3200', 'sec-fetch-site': 'same-origin' };
    const response = await POST(new NextRequest('http://localhost:3200/api/legal-drafts', {
      method: 'POST', headers, body: JSON.stringify(payload),
    }));
    expect(response.status).toBe(201);
    for (const [host, origin] of [['evil.invalid:3200', 'http://evil.invalid:3200'], ['127.0.0.1:3200', 'http://localhost:3200'], ['127.0.0.1:3000', 'http://127.0.0.1:3000']]) {
      expect((await POST(new NextRequest('http://localhost:3200/api/legal-drafts', {
        method: 'POST', headers: { ...headers, host, origin }, body: JSON.stringify(payload),
      }))).status).toBe(403);
    }
  });
  it('exchanges a workspace-only HttpOnly cookie, rejects cross-site writes and old sessions', async () => {
    const response = await exchange(request('/api/desktop-local/session', 'POST'));
    expect(response.status).toBe(204);
    const cookie = response.headers.getSetCookie().find(value => value.startsWith('lex_desktop_workspace_cap='));
    expect(Boolean(cookie)).toBe(true);
    expect(/HttpOnly/i.test(cookie!)).toBe(true);
    expect(/SameSite=Strict/i.test(cookie!)).toBe(true);
    expect(/Path=\/api;/i.test(cookie!)).toBe(true);
    const headers = { cookie: `lex_desktop_workspace_cap=${capability}`, 'content-type': 'application/json' };
    expect((await listDrafts(new NextRequest('http://127.0.0.1:3200/api/legal-drafts', { headers }))).status).toBe(200);
    expect((await POST(new NextRequest('http://127.0.0.1:3200/api/legal-drafts', {
      method: 'POST', headers: { ...headers, origin: 'https://evil.invalid' }, body: JSON.stringify(payload),
    }))).status).toBe(403);
    vi.stubEnv('LEX_DESKTOP_CAPABILITY', 'e'.repeat(64));
    expect((await listDrafts(new NextRequest('http://127.0.0.1:3200/api/legal-drafts', { headers }))).status).toBe(403);
  });
  it('saves, edits, reloads from disk and projects cases without inventing a tenant', async () => {
    const saved = await POST(request('/api/legal-drafts', 'POST', payload));
    expect(saved.status).toBe(201);
    const { draft } = await saved.json();
    expect(draft.organizationId).toBeUndefined();
    expect(draft.userId).toBeUndefined();
    const ctx = { params: Promise.resolve({ id: draft.id }) };
    const updated = await PATCH(request(`/api/legal-drafts/${draft.id}`, 'PATCH', { title: 'Editado' }), ctx);
    expect(updated.status).toBe(200);
    const reopened = await GET(request(`/api/legal-drafts/${draft.id}`), ctx);
    expect((await reopened.json()).draft).toMatchObject({ title: 'Editado', structuredDoc: { id: 'synthetic-document' } });
    expect((await (await listDrafts(request('/api/legal-drafts'))).json()).drafts).toHaveLength(1);
    const summary = await (await cases(request('/api/workspace/cases'))).json();
    expect(summary.cases).toContainEqual(expect.objectContaining({ title: 'Editado', expediente: 'SINTETICO-01', actor: 'PERSONA A' }));
  });
  it('aggregates zero, one and multiple durable records without reporting manual saves as generated', async () => {
    expect((await (await analytics(request('/api/workspace/analytics'))).json()).totals.total).toBe(0);
    expect((await POST(request('/api/legal-drafts', 'POST', payload))).status).toBe(201);
    let data = await (await analytics(request('/api/workspace/analytics'))).json();
    expect(data.totals).toMatchObject({ total: 1, needsReview: 1, completed: 0 });
    expect(data.totals.averageGenerationMs).toBeNull();
    await POST(request('/api/legal-drafts', 'POST', { ...payload, documentType: 'apelacion_civil' }));
    await POST(request('/api/legal-drafts', 'POST', { title: 'Nota manual sin generación' }));
    data = await (await analytics(request('/api/workspace/analytics'))).json();
    expect(data.totals).toMatchObject({ total: 2, needsReview: 2, completed: 0 });
    expect(data.byType).toEqual([{ label: 'apelacion_civil', count: 1 }, { label: 'contestacion_civil', count: 1 }]);
    expect(JSON.stringify(data)).not.toContain('Texto sintético');
  });
  it('rejects absent capability before storage reads or writes', async () => {
    expect((await POST(request('/api/legal-drafts', 'POST', payload, false))).status).toBe(403);
    expect((await analytics(request('/api/workspace/analytics', 'GET', undefined, false))).status).toBe(403);
  });
  it('applies date ranges to real disk records after reload', async () => {
    const current = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(current - 8 * 86400000);
    expect((await POST(request('/api/legal-drafts', 'POST', payload))).status).toBe(201);
    vi.setSystemTime(current);
    expect((await POST(request('/api/legal-drafts', 'POST', payload))).status).toBe(201);
    const short = await (await analytics(request('/api/workspace/analytics?rangeDays=7'))).json();
    const long = await (await analytics(request('/api/workspace/analytics?rangeDays=30'))).json();
    expect(short.totals.total).toBe(1);
    expect(long.totals.total).toBe(2);
    expect(long.daily.filter((item: { count: number }) => item.count)).toHaveLength(2);
  });
  it('manual edits preserve the original generation activity metadata instead of erasing its history', async () => {
    const { draft } = await (await POST(request('/api/legal-drafts', 'POST', payload))).json();
    expect((await PATCH(request(`/api/legal-drafts/${draft.id}`, 'PATCH', {
      generationMetadata: { readiness: 'REQUIRES_REVIEW', qualityGate: false },
    }), { params: Promise.resolve({ id: draft.id }) })).status).toBe(200);
    expect((await (await analytics(request('/api/workspace/analytics'))).json()).totals.total).toBe(1);
  });
});
