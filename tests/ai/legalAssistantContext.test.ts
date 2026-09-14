import { describe, expect, it, vi } from 'vitest';
import { POST as assistantHandler } from '@/app/api/ai/legal-assistant/route';
import { POST as createDraftHandler, GET as listDraftsHandler } from '@/app/api/legal-drafts/route';
import { GET as getDraftHandler } from '@/app/api/legal-drafts/[id]/route';
import { NextRequest } from 'next/server';

// Mock prisma for unit tests with in-memory draft store and org membership
vi.mock('@/lib/prisma', () => {
  const memoryDrafts: any[] = [];
  return {
    prisma: {
      item: {
        findMany: vi.fn().mockImplementation(async ({ where }) => {
          // Verify SENADO_WEB exclusion
          const notSources = where?.AND?.map((a: any) => a.source?.not).filter(Boolean);
          if (notSources?.includes('SENADO_WEB')) {
            return [
              {
                id: 'item-1',
                title: 'Ley Amparo Reglamentaria',
                source: 'DOF',
                tema: ['Constitucional'],
                url: 'https://dof.gob.mx/ley',
              },
            ];
          }
          return [];
        }),
      },
      legalDraft: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          const draft = { id: `draft-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
          memoryDrafts.push(draft);
          return draft;
        }),
        findMany: vi.fn().mockImplementation(async ({ where }) => {
          return memoryDrafts.filter((d) => d.organizationId === where?.organizationId);
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          return memoryDrafts.find((d) => d.id === where?.id && d.organizationId === where?.organizationId) || null;
        }),
      },
      orgUserRole: {
        findFirst: vi.fn().mockImplementation(async () => {
          return {
            orgId: 'org-demo-legal',
            userId: 'user-demo-legal',
            role: 'ADMIN',
          };
        }),
      },
    },
  };
});

describe('Integración Contextual del Asistente Legal IA', () => {
  it('detecta automáticamente el machote actual y no pide volver a pegar el documento', async () => {
    const req = new NextRequest('http://localhost/api/ai/legal-assistant', {
      method: 'POST',
      body: JSON.stringify({
        message: 'revisa el machote que acabo de crear',
        contextMode: 'current_document',
        activeDocument: {
          templateName: 'Demanda de amparo indirecto',
          matter: 'amparo',
          jurisdiction: 'federal',
          fields: {
            quejoso: 'Juan Pérez',
            hechos: 'El día 10 de mayo fui notificado de la resolución...',
            petitorios: 'PRIMERO.- Tenerme por presentado. SEGUNDO.- Conceder el amparo.',
          },
          previewText: 'DEMANDA DE AMPARO INDIRECTO. Quejoso: Juan Pérez...',
          pendingMarkers: [],
        },
      }),
    });

    const res = await assistantHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.contextLabel).toContain('Demanda de amparo indirecto');
    expect(data.answer).not.toMatch(/copia|pega|proporciona el texto/i);
    expect(data.answer).toContain('Analicé tu Demanda de amparo indirecto');
  });

  it('detecta contradicción entre hechos vacíos y puntos petitorios de privación de libertad', async () => {
    const req = new NextRequest('http://localhost/api/ai/legal-assistant', {
      method: 'POST',
      body: JSON.stringify({
        message: 'qué le falta a este borrador',
        contextMode: 'current_document',
        activeDocument: {
          templateName: 'Demanda de amparo indirecto',
          matter: 'amparo',
          jurisdiction: 'federal',
          fields: {
            quejoso: 'María López',
            hechos: '',
            acto_reclamado: '',
            petitorios: 'SEGUNDO.- Conceder la suspensión provisional contra la privación de libertad e incomunicación de mi representado.',
          },
          previewText: 'DEMANDA DE AMPARO. Petitorios: privación de libertad e incomunicación.',
          pendingMarkers: ['hechos', 'autoridad_responsable'],
        },
      }),
    });

    const res = await assistantHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.consistencyProblems.length).toBeGreaterThan(0);
    expect(data.consistencyProblems[0]).toContain(
      'Los puntos petitorios presuponen una privación de libertad, pero el documento no contiene hechos ni acto reclamado que sustenten ese supuesto.'
    );
    expect(data.issues.some((i: any) => i.id === 'issue-contradiction-libertad')).toBe(true);
  });

  it('no muestra bloques JSON crudos en el campo de respuesta directa', async () => {
    const req = new NextRequest('http://localhost/api/ai/legal-assistant', {
      method: 'POST',
      body: JSON.stringify({
        message: 'revisa los conceptos de violación',
        contextMode: 'current_document',
        activeDocument: {
          templateName: 'Contrato de arrendamiento',
          fields: { arrendador: 'Pedro' },
        },
      }),
    });

    const res = await assistantHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(typeof data.answer).toBe('string');
    const trimmed = data.answer.trim();
    expect(trimmed.startsWith('{')).toBe(false);
    expect(trimmed.endsWith('}')).toBe(false);
    expect(trimmed.startsWith('```')).toBe(false);
    expect(data.answer).not.toContain('"summary":');
    expect(data.answer).not.toContain('"overallRisk":');
  });

  it('excluye SENADO_WEB y fuentes en cuarentena de las citas oficiales', async () => {
    const req = new NextRequest('http://localhost/api/ai/legal-assistant', {
      method: 'POST',
      body: JSON.stringify({
        message: 'buscar reformas en materia fiscal',
        contextMode: 'none',
      }),
    });

    const res = await assistantHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    const hasSenado = (data.citations || []).some(
      (c: any) => c.fuente === 'SENADO_WEB' || c.fuente === 'senado_web'
    );
    expect(hasSenado).toBe(false);
  });

  it('mantiene la separación multi-tenant de borradores en la API LegalDraft', async () => {
    const createReq = new NextRequest('http://localhost/api/legal-drafts', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Demanda Test Tenant A',
        documentType: 'machote',
        matter: 'civil',
        formData: { cliente: 'Empresa A' },
      }),
    });

    const createRes = await createDraftHandler(createReq);
    const createData = await createRes.json();

    expect(createRes.status).toBe(201);
    expect(createData.ok).toBe(true);
    const draftId = createData.draft.id;

    // Fetch as same tenant
    const getReq = new NextRequest(`http://localhost/api/legal-drafts/${draftId}`, {
      method: 'GET',
    });

    const getRes = await getDraftHandler(getReq, { params: Promise.resolve({ id: draftId }) });
    const getData = await getRes.json();

    expect(getRes.status).toBe(200);
    expect(getData.ok).toBe(true);
    expect(getData.draft.id).toBe(draftId);
  });

  it('desactiva el contexto activo cuando el usuario selecciona modo "none"', async () => {
    const req = new NextRequest('http://localhost/api/ai/legal-assistant', {
      method: 'POST',
      body: JSON.stringify({
        message: 'explicación general de amparo',
        contextMode: 'none',
        activeDocument: {
          templateName: 'Demanda de amparo indirecto',
        },
      }),
    });

    const res = await assistantHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.contextLabel).toBe('Sin contexto de documento');
  });
});
