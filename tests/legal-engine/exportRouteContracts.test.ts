import { readFileSync } from 'node:fs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getCanonicalOutputFilename, resolveDocumentOutputFilename } from '@/lib/legal-engine/outputFilename';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';

vi.mock('@/lib/security/lawyerAuth', () => ({
  requireLawyerAccess: vi.fn(),
}));

import { POST as postDocx } from '@/app/api/legal-engine/export/docx/route';
import { POST as postPdf } from '@/app/api/legal-engine/export/pdf/route';

const routeRoot = 'app/api/legal-engine/export';

function request(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('FASE 7 Task 7 — export route contracts', () => {
  beforeEach(() => {
    vi.mocked(requireLawyerAccess).mockResolvedValue({
      ok: true,
      context: {
        organizationId: 'org-synthetic',
        userId: 'user-synthetic',
        lawyerId: 'user-synthetic',
        role: 'lawyer',
      },
    } as never);
  });

  it('31. returns a Windows-safe canonical filename', () => {
    const document = createEmptyDocument({
      title: 'CON',
      generationMetadata: {
        ...createEmptyDocument().generationMetadata,
        routing: { outputFilename: 'PRN.txt' },
      } as never,
    });
    const filename = resolveDocumentOutputFilename(document, 'docx');

    expect(filename).toMatch(/\.docx$/i);
    expect(filename).not.toMatch(/[<>:"/\\|?*\u0000-\u001f]/);
    expect(filename).not.toMatch(/[. ](?=\.docx$)/);
    expect(filename).not.toMatch(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.[^.]+)?\.docx$/i);
    expect(getCanonicalOutputFilename('escrito_libre')).toMatch(/\.docx$/i);
  });

  it('32. rejects path traversal in title and filename metadata', () => {
    const document = createEmptyDocument({
      title: '../../documento',
      generationMetadata: {
        ...createEmptyDocument().generationMetadata,
        routing: { outputFilename: 'C:\\Windows\\System32\\..\\evil' },
      } as never,
    });
    const filename = resolveDocumentOutputFilename(document, 'pdf');

    expect(filename).toMatch(/\.pdf$/i);
    expect(filename).not.toContain('..');
    expect(filename).not.toMatch(/[\\/]/);
    expect(filename).not.toMatch(/^(?:[A-Za-z]:|\\\\|\/)/);
  });

  it('authenticates before parsing either export payload', async () => {
    vi.mocked(requireLawyerAccess).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 }),
    } as never);
    for (const handler of [postDocx, postPdf]) {
      const req = request('api/legal-engine/export/docx', { renderedSections: [] });
      const json = vi.spyOn(req, 'json');
      const response = await handler(req);
      expect(response.status).toBe(401);
      expect(json).not.toHaveBeenCalled();
    }
  });

  it('requires body.document and rejects the legacy renderedSections payload', async () => {
    const docxResponse = await postDocx(request('api/legal-engine/export/docx', {
      renderedSections: [{ title: 'LEGACY', content: 'no' }],
    }));
    expect(docxResponse.status).toBe(400);

    const pdfResponse = await postPdf(request('api/legal-engine/export/pdf', {
      renderedSections: [{ title: 'LEGACY', content: 'no' }],
    }));
    expect(pdfResponse.status).toBe(422);
    await expect(pdfResponse.json()).resolves.toMatchObject({ error: 'PDF_LEGACY_PAYLOAD_REJECTED' });
  });

  it('keeps the universal routes on the universal exporter and canonical filename resolver', () => {
    for (const file of ['docx/route.ts', 'pdf/route.ts']) {
      const source = readFileSync(`${routeRoot}/${file}`, 'utf8');
      expect(source).toContain('requireLawyerAccess');
      expect(source).toContain('resolveDocumentOutputFilename');
      expect(source).not.toContain('generatePrintHtml');
      expect(source).not.toContain('exportToDocx');
    }
  });
});
