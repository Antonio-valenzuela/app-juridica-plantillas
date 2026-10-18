import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { extractWordDocumentParagraphs, readDocxPackage } from '../helpers/docxPackageReader';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), owner: vi.fn() }));
vi.mock('@/lib/security/lawyerAuth', () => ({ requireLawyerAccess: mocks.auth }));
vi.mock('@/lib/legal-engine/documentOwnership', () => ({ documentBelongsToPrincipal: mocks.owner }));
vi.mock('@/lib/workspace/desktopDraftRepository', () => ({ desktopDraftRepository: () => null }));
import { POST as docx } from '@/app/api/legal-engine/export/docx/route';
import { POST as pdf } from '@/app/api/legal-engine/export/pdf/route';

beforeEach(() => {
  mocks.auth.mockResolvedValue({ ok: true, context: { organizationId: 'synthetic-recovery', userId: 'test-only' } });
  mocks.owner.mockResolvedValue(true);
});
describe('rutas reales con documento sintético del run, sin providers', () => {
  it.each([['docx', docx], ['pdf', pdf]] as const)('%s: DRAFT binario y FINAL 422 conservando hallazgos', async (format, handler) => {
    const document = JSON.parse(readFileSync('audit/final-contestaciones-validation/run-2026-10-02T21-56-42-990Z/laboral/generated-document.json', 'utf8'));
    const marker = 'EDICION ACTUAL DEL ABOGADO: no presentar sin revision.';
    document.sections[0].content.push({ id: 'real-route-edit', text: marker, layer: 'GENERATED_ARGUMENT', trustLevel: 'UNVERIFIED', isManuallyEdited: true });
    const request = (mode: string) => new NextRequest(`http://localhost/api/legal-engine/export/${format}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', ...(mode === 'DRAFT' ? { 'x-unsaved-draft-export': 'true' } : {}) },
      body: JSON.stringify({ document, exportMode: mode }),
    });
    const response = await handler(request('DRAFT'));
    expect(response.status).toBe(200);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, format === 'docx' ? 2 : 4).toString()).toBe(format === 'docx' ? 'PK' : '%PDF');
    if (format === 'docx') {
      const zip = await readDocxPackage(bytes);
      const visibleText = [...extractWordDocumentParagraphs(await zip.readText('word/document.xml')),
        ...extractWordDocumentParagraphs(await zip.readText('word/header1.xml'))].join('\n');
      expect(visibleText).toContain(marker);
      expect(await zip.readText('word/header1.xml')).toContain('BORRADOR NO GUARDADO');
    }
    expect(document.qualityGate.canMarkAsFinal).toBe(false);
    const final = await handler(request('FINAL'));
    expect(final.status).toBe(422);
    expect((await final.json()).error).toBe('EXPORT_GUARD_FAILED');
  });
});
