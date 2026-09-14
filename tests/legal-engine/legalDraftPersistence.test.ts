import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  markDocumentAsFinal,
  markDocumentAsSource,
  markDocumentEntity,
  markReferenceDocument,
  markTemplateEntity,
  readDocumentEntityKind,
} from '@/lib/legal-engine/documentLifecycle';

const { createMock, findFirstMock, updateMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  findFirstMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    legalDraft: {
      create: createMock,
      findFirst: findFirstMock,
      update: updateMock,
    },
  },
}));

vi.mock('@/lib/cases/access', () => ({
  requireCaseAccess: vi.fn(async () => ({
    ok: true,
    context: { organizationId: 'org-test', userId: 'user-test', role: 'LAWYER' },
  })),
}));

import { POST } from '@/app/api/legal-drafts/route';
import { PATCH } from '@/app/api/legal-drafts/[id]/route';

function jsonRequest(url: string, method: 'POST' | 'PATCH', body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function invalidLifecycleDocuments() {
  return [
    ['TEMPLATE', markTemplateEntity({ id: 'template-1' }, 'user')],
    ['FINAL_DOCUMENT', markDocumentAsFinal(markDocumentEntity({ id: 'final-1' }, 'DRAFT'), { explicit: true })],
    ['REFERENCE_DOCUMENT', markReferenceDocument({ id: 'reference-1' }, 'reference-1')],
  ] as const;
}

describe('persistencia server-side del ciclo de vida de LegalDraft', () => {
  beforeEach(() => {
    createMock.mockReset().mockResolvedValue({ id: 'draft-created' });
    findFirstMock.mockReset();
    updateMock.mockReset().mockResolvedValue({ id: 'draft-existing' });
  });

  it('normaliza el documento principal como DRAFT y cada fuente como SOURCE_DOCUMENT en POST', async () => {
    const source = { id: 'source-1', content: 'Contenido de fuente' };
    const structuredDoc = { id: 'draft-1', title: 'Borrador', sourceDocuments: [source] };

    const response = await POST(jsonRequest('http://localhost/api/legal-drafts', 'POST', {
      title: 'Borrador',
      structuredDoc,
      sourceDocuments: [source],
    }));

    expect(response.status).toBe(201);
    const data = createMock.mock.calls[0][0].data;
    expect(readDocumentEntityKind(data.structuredDoc)).toBe('DRAFT');
    expect(readDocumentEntityKind(data.structuredDoc.sourceDocuments[0])).toBe('SOURCE_DOCUMENT');
    expect(readDocumentEntityKind(data.sourceDocuments[0])).toBe('SOURCE_DOCUMENT');
  });

  it.each(invalidLifecycleDocuments())(
    'rechaza un documento principal %s en POST y no persiste la fila',
    async (_label, structuredDoc) => {
      const response = await POST(jsonRequest('http://localhost/api/legal-drafts', 'POST', {
        title: 'Borrador inválido',
        structuredDoc,
      }));

      expect(response.status).toBe(400);
      expect(createMock).not.toHaveBeenCalled();
    },
  );

  it('normaliza el documento principal como DRAFT y cada fuente como SOURCE_DOCUMENT en PATCH', async () => {
    const source = { id: 'source-2', content: 'Contenido actualizado' };
    const structuredDoc = { id: 'draft-2', title: 'Borrador actualizado', sourceDocuments: [source] };
    findFirstMock.mockResolvedValueOnce({ id: 'draft-existing' });

    const response = await PATCH(
      jsonRequest('http://localhost/api/legal-drafts/draft-existing', 'PATCH', {
        structuredDoc,
        sourceDocuments: [source],
      }),
      { params: Promise.resolve({ id: 'draft-existing' }) },
    );

    expect(response.status).toBe(200);
    const data = updateMock.mock.calls[0][0].data;
    expect(readDocumentEntityKind(data.structuredDoc)).toBe('DRAFT');
    expect(readDocumentEntityKind(data.structuredDoc.sourceDocuments[0])).toBe('SOURCE_DOCUMENT');
    expect(readDocumentEntityKind(data.sourceDocuments[0])).toBe('SOURCE_DOCUMENT');
  });

  it.each(invalidLifecycleDocuments())(
    'rechaza un documento principal %s en PATCH y no actualiza la fila',
    async (_label, structuredDoc) => {
      findFirstMock.mockResolvedValueOnce({ id: 'draft-existing' });

      const response = await PATCH(
        jsonRequest('http://localhost/api/legal-drafts/draft-existing', 'PATCH', { structuredDoc }),
        { params: Promise.resolve({ id: 'draft-existing' }) },
      );

      expect(response.status).toBe(400);
      expect(updateMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['TEMPLATE', markTemplateEntity({ id: 'template-source' }, 'user')],
    ['FINAL_DOCUMENT', markDocumentAsFinal(markDocumentEntity({ id: 'final-source' }, 'DRAFT'), { explicit: true })],
    ['REFERENCE_DOCUMENT', markReferenceDocument({ id: 'reference-source' }, 'reference-source')],
  ] as const)('rechaza una fuente %s en POST y no persiste la fila', async (_label, sourceDocuments) => {
    const response = await POST(jsonRequest('http://localhost/api/legal-drafts', 'POST', {
      title: 'Borrador con fuente inválida',
      structuredDoc: { id: 'draft-3' },
      sourceDocuments: [sourceDocuments],
    }));

    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rechaza una fuente ya marcada como referencia dentro de structuredDoc en PATCH', async () => {
    findFirstMock.mockResolvedValueOnce({ id: 'draft-existing' });

    const response = await PATCH(
      jsonRequest('http://localhost/api/legal-drafts/draft-existing', 'PATCH', {
        structuredDoc: {
          id: 'draft-4',
          sourceDocuments: [markReferenceDocument({ id: 'reference-nested' }, 'reference-nested')],
        },
      }),
      { params: Promise.resolve({ id: 'draft-existing' }) },
    );

    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('no permite guardar una referencia como fuente aunque el documento principal sea un DRAFT válido', async () => {
    const response = await POST(jsonRequest('http://localhost/api/legal-drafts', 'POST', {
      title: 'Borrador con referencia',
      structuredDoc: markDocumentEntity({ id: 'draft-5' }, 'DRAFT'),
      sourceDocuments: [markDocumentAsSource({ id: 'source-valid' }, 'source-valid'), markReferenceDocument({ id: 'reference-2' })],
    }));

    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });
});
