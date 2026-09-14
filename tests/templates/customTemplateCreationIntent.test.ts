import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createMock, findFirstMock, updateManyMock, writeFileMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  findFirstMock: vi.fn(),
  updateManyMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    writeFileSync: writeFileMock,
    unlinkSync: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    legalTemplate: {
      create: createMock,
      findFirst: findFirstMock,
      updateMany: updateManyMock,
    },
  },
}));

vi.mock('@/lib/cases/access', () => ({
  requireCaseAccess: vi.fn(async () => ({
    ok: true,
    context: { organizationId: 'org-test', userId: 'user-test', role: 'LAWYER' },
  })),
}));

import { PATCH } from '@/app/api/templates/custom/[id]/route';
import { POST } from '@/app/api/templates/custom/route';
import { validateTemplateCreationPayload } from '@/lib/templates/templateCreationIntent';

const REQUIRES_EXPLICIT_INTENT = 'TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT';

describe('Tarea 3: intención explícita de creación de plantilla', () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue({ id: 'template-created' });
    findFirstMock.mockReset();
    updateManyMock.mockReset();
    writeFileMock.mockReset();
  });

  it.each(['SOURCE_DOCUMENT', 'DRAFT', 'FINAL_DOCUMENT', 'REFERENCE_DOCUMENT'] as const)(
    'rechaza %s como sustituto de una creación explícita',
    (entityKind) => {
      expect(validateTemplateCreationPayload({ entityKind })).toEqual({
        ok: false,
        code: REQUIRES_EXPLICIT_INTENT,
      });
    },
  );

  it('rechaza TEMPLATE sin EXPLICIT_TEMPLATE', () => {
    expect(validateTemplateCreationPayload({ entityKind: 'TEMPLATE' })).toEqual({
      ok: false,
      code: REQUIRES_EXPLICIT_INTENT,
    });
  });

  it('acepta únicamente TEMPLATE con EXPLICIT_TEMPLATE', () => {
    expect(validateTemplateCreationPayload({
      entityKind: 'TEMPLATE',
      creationIntent: 'EXPLICIT_TEMPLATE',
    })).toEqual({ ok: true });
  });

  it('crea la fila explícita con metadata de plantilla propiedad del usuario', async () => {
    const request = new NextRequest('http://localhost/api/templates/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityKind: 'TEMPLATE',
        creationIntent: 'EXPLICIT_TEMPLATE',
        title: 'Plantilla explícita',
        content: 'Contenido de plantilla reutilizable.',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledOnce();
    expect(createMock.mock.calls[0][0].data.structureJson.__juridicoRadar).toMatchObject({
      entityKind: 'TEMPLATE',
      originClass: 'user',
      creationIntent: 'EXPLICIT_TEMPLATE',
    });
  });

  it('crea multipart explícito con metadata de plantilla propiedad del usuario', async () => {
    const formData = new FormData();
    formData.append('entityKind', 'TEMPLATE');
    formData.append('creationIntent', 'EXPLICIT_TEMPLATE');
    formData.append('title', 'Plantilla multipart explícita');
    formData.append('documentContent', 'Contenido reutilizable multipart.');
    formData.append('file', new File(['Contenido reutilizable multipart.'], 'plantilla.txt', { type: 'text/plain' }));

    const request = new NextRequest('http://localhost/api/templates/custom', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledOnce();
    expect(createMock.mock.calls[0][0].data.structureJson.__juridicoRadar).toMatchObject({
      entityKind: 'TEMPLATE',
      originClass: 'user',
      creationIntent: 'EXPLICIT_TEMPLATE',
    });
  });

  it('rechaza el POST no explícito antes de crear LegalTemplate', async () => {
    const request = new NextRequest('http://localhost/api/templates/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityKind: 'DRAFT',
        title: 'Borrador que no debe convertirse',
        content: 'Contenido de prueba',
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      error: REQUIRES_EXPLICIT_INTENT,
      code: REQUIRES_EXPLICIT_INTENT,
    });
    expect(createMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('rechaza multipart sin ambos campos antes de crear LegalTemplate', async () => {
    const formData = new FormData();
    formData.append('entityKind', 'TEMPLATE');
    formData.append('title', 'Plantilla sin intención');
    formData.append('documentContent', 'Contenido de prueba');
    formData.append('file', new File(['Contenido de prueba'], 'plantilla.txt', { type: 'text/plain' }));

    const request = new NextRequest('http://localhost/api/templates/custom', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      error: REQUIRES_EXPLICIT_INTENT,
      code: REQUIRES_EXPLICIT_INTENT,
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it.each(['', '{"entityKind":"TEMPLATE"'])('responde 400 ante JSON vacío o malformado (%s)', async (body) => {
    const request = new NextRequest('http://localhost/api/templates/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('mantiene la marca TEMPLATE en PATCH explícito', async () => {
    const structureJson = {
      kind: 'personal-template',
      __juridicoRadar: {
        entityKind: 'TEMPLATE',
        originClass: 'user',
        creationIntent: 'EXPLICIT_TEMPLATE',
        version: 1,
      },
    };
    const existing = {
      id: 'template-id',
      structureJson,
      variables: [],
      sourceFileName: null,
    };
    findFirstMock
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ ...existing, title: 'Plantilla actualizada' });
    updateManyMock.mockResolvedValue({ count: 1 });

    const request = new NextRequest('http://localhost/api/templates/custom/template-id', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityKind: 'TEMPLATE',
        creationIntent: 'EXPLICIT_TEMPLATE',
        title: 'Plantilla actualizada',
      }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: 'template-id' }) });

    expect(response.status).toBe(200);
    expect(updateManyMock).toHaveBeenCalledOnce();
    expect(updateManyMock.mock.calls[0][0].data.structureJson.__juridicoRadar).toMatchObject({
      entityKind: 'TEMPLATE',
      originClass: 'user',
      creationIntent: 'EXPLICIT_TEMPLATE',
    });
    expect(updateManyMock.mock.calls[0][0].data).not.toHaveProperty('entityKind');
    expect(updateManyMock.mock.calls[0][0].data).not.toHaveProperty('creationIntent');
  });

  it.each(['system', 'test_demo'] as const)(
    'normaliza originClass %s a user al editar una plantilla',
    async (originClass) => {
      const structureJson = {
        kind: 'personal-template',
        __juridicoRadar: {
          entityKind: 'TEMPLATE',
          originClass,
          creationIntent: 'EXPLICIT_TEMPLATE',
          version: 1,
        },
      };
      const existing = {
        id: `template-${originClass}`,
        structureJson,
        variables: [],
        sourceFileName: null,
      };
      findFirstMock
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ ...existing, title: 'Plantilla editada' });
      updateManyMock.mockResolvedValue({ count: 1 });

      const request = new NextRequest(`http://localhost/api/templates/custom/template-${originClass}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityKind: 'TEMPLATE',
          creationIntent: 'EXPLICIT_TEMPLATE',
          title: 'Plantilla editada',
        }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: `template-${originClass}` }),
      });

      expect(response.status).toBe(200);
      expect(updateManyMock.mock.calls[0][0].data.structureJson.__juridicoRadar).toMatchObject({
        entityKind: 'TEMPLATE',
        originClass: 'user',
        creationIntent: 'EXPLICIT_TEMPLATE',
      });
    },
  );

  it.each([
    ['unmarked', {}],
    ['legacy', {
      __juridicoRadar: {
        entityKind: 'TEMPLATE',
        originClass: 'legacy',
        creationIntent: 'EXPLICIT_TEMPLATE',
      },
    }],
    ['source', { __juridicoRadar: { entityKind: 'SOURCE_DOCUMENT' } }],
    ['draft', { __juridicoRadar: { entityKind: 'DRAFT' } }],
    ['final', { __juridicoRadar: { entityKind: 'FINAL_DOCUMENT' } }],
    ['reference', { __juridicoRadar: { entityKind: 'REFERENCE_DOCUMENT' } }],
  ] as const)('rechaza PATCH sobre fila %s sin lifecycle TEMPLATE válido', async (label, structureJson) => {
    const id = `invalid-${label}`;
    findFirstMock.mockResolvedValueOnce({
      id,
      structureJson,
      variables: [],
      sourceFileName: `${label}.txt`,
    });

    const request = new NextRequest(`http://localhost/api/templates/custom/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityKind: 'TEMPLATE',
        creationIntent: 'EXPLICIT_TEMPLATE',
        title: 'No convertir entidad',
      }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id }) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      error: REQUIRES_EXPLICIT_INTENT,
      code: REQUIRES_EXPLICIT_INTENT,
    });
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it.each(['content', 'originalText'] as const)(
    'rechaza PATCH cuando %s queda vacío después de sanitizar',
    async (emptyField) => {
    const structureJson = {
      kind: 'personal-template',
      __juridicoRadar: {
        entityKind: 'TEMPLATE',
        originClass: 'user',
        creationIntent: 'EXPLICIT_TEMPLATE',
        version: 1,
      },
    };
    findFirstMock.mockResolvedValueOnce({
      id: 'template-empty-content',
      structureJson,
      variables: [],
      sourceFileName: null,
    });

    const request = new NextRequest('http://localhost/api/templates/custom/template-empty-content', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityKind: 'TEMPLATE',
        creationIntent: 'EXPLICIT_TEMPLATE',
        [emptyField]: ' \n\t ',
      }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'template-empty-content' }),
    });

    expect(response.status).toBe(400);
    expect(updateManyMock).not.toHaveBeenCalled();
    },
  );
});
