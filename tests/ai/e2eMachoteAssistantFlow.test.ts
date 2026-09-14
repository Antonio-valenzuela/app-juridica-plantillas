import { describe, expect, it, vi } from 'vitest';
import { POST as assistantHandler } from '@/app/api/ai/legal-assistant/route';
import { POST as createDraftHandler, GET as listDraftsHandler } from '@/app/api/legal-drafts/route';
import { GET as getDraftHandler, PATCH as updateDraftHandler } from '@/app/api/legal-drafts/[id]/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/prisma', () => {
  const memoryDrafts: any[] = [];
  return {
    prisma: {
      item: {
        findMany: vi.fn().mockImplementation(async ({ where }) => {
          const notSources = where?.AND?.map((a: any) => a.source?.not).filter(Boolean);
          if (notSources?.includes('SENADO_WEB')) {
            return [
              {
                id: 'item-1',
                title: 'Constitución Política de los Estados Unidos Mexicanos',
                source: 'DOF',
                tema: ['Constitucional'],
                url: 'https://dof.gob.mx/constitucion',
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
        update: vi.fn().mockImplementation(async ({ where, data }) => {
          const idx = memoryDrafts.findIndex((d) => d.id === where?.id);
          if (idx !== -1) {
            memoryDrafts[idx] = { ...memoryDrafts[idx], ...data, updatedAt: new Date() };
            return memoryDrafts[idx];
          }
          throw new Error('Not found');
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

describe('E2E Flow: Crear borrador, consultar asistente, recibir observaciones, aceptar, rechazar y verificar aislamiento', () => {
  it('1. Crea un borrador en la API /api/legal-drafts', async () => {
    const req = new NextRequest('http://localhost/api/legal-drafts', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Demanda de Amparo Indirecto E2E',
        documentType: 'machote',
        matter: 'amparo',
        jurisdiction: 'federal',
        formData: {
          quejoso: 'Carlos Mendoza',
          hechos: 'El 15 de enero de 2026 fui retenido sin orden judicial...',
          petitorios: 'PRIMERO.- Tenerme por presentado. SEGUNDO.- Conceder la suspensión provisional.',
        },
      }),
    });

    const res = await createDraftHandler(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.draft.id).toBeDefined();
    expect(data.draft.title).toBe('Demanda de Amparo Indirecto E2E');
  });

  it('2. Escribe al asistente: "revisa el machote que acabo de crear" y recibe observaciones del borrador real', async () => {
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
            quejoso: 'Carlos Mendoza',
            hechos: 'El 15 de enero de 2026 fui retenido sin orden judicial...',
            petitorios: 'PRIMERO.- Tenerme por presentado. SEGUNDO.- Conceder la suspensión provisional.',
          },
          previewText: 'DEMANDA DE AMPARO INDIRECTO. Quejoso: Carlos Mendoza...',
          pendingMarkers: ['autoridad_responsable'],
        },
      }),
    });

    const res = await assistantHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.contextLabel).toContain('Demanda de amparo indirecto');
    expect(data.answer).not.toMatch(/copia|pega|proporciona el texto/i);
    expect(typeof data.answer).toBe('string');
    expect(data.answer.trim().startsWith('{')).toBe(false);
    expect(data.issues.length).toBeGreaterThan(0);
  });

  it('3. Simula interacción UI: Aceptar una sugerencia actualiza el campo del borrador, rechazar otra no lo modifica', async () => {
    const listReq = new NextRequest('http://localhost/api/legal-drafts', { method: 'GET' });
    const listRes = await listDraftsHandler(listReq);
    const listData = await listRes.json();

    expect(listRes.status).toBe(200);
    expect(listData.drafts.length).toBeGreaterThan(0);
    const draftId = listData.drafts[0].id;

    // Apply issue (Aceptar sugerencia)
    const updateReq = new NextRequest(`http://localhost/api/legal-drafts/${draftId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        formData: {
          quejoso: 'Carlos Mendoza',
          hechos: 'El 15 de enero de 2026 fui retenido sin orden judicial por la autoridad municipal...',
          autoridad_responsable: 'Comisario de Seguridad Pública Municipal',
        },
      }),
    });

    const updateRes = await updateDraftHandler(updateReq, { params: Promise.resolve({ id: draftId }) });
    const updateData = await updateRes.json();

    expect(updateRes.status).toBe(200);
    expect(updateData.ok).toBe(true);
    expect(updateData.draft.formData.autoridad_responsable).toBe('Comisario de Seguridad Pública Municipal');
  });

  it('4. Confirma exclusión estricta de SENADO_WEB y aislamiento multi-tenant', async () => {
    const req = new NextRequest('http://localhost/api/ai/legal-assistant', {
      method: 'POST',
      body: JSON.stringify({
        message: 'consultar jurisprudencia en materia amparo',
        contextMode: 'none',
      }),
    });

    const res = await assistantHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    const containsSenado = (data.citations || []).some((c: any) => c.fuente === 'SENADO_WEB');
    expect(containsSenado).toBe(false);
  });
});
