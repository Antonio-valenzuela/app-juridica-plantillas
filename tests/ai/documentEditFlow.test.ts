import { describe, expect, it, vi } from 'vitest';
import { POST as documentEditHandler } from '@/app/api/ai/document-edit/route';
import { POST as createDraftHandler } from '@/app/api/legal-drafts/route';
import { GET as getDraftHandler, PATCH as updateDraftHandler } from '@/app/api/legal-drafts/[id]/route';
import { NextRequest } from 'next/server';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import {
  applyLegalEdits,
  buildWorkspaceSnapshot,
  classifyAssistantIntent,
  extractPlaceholders,
  containsForbiddenInternalMetadata,
  type LegalEditOperation,
} from '@/lib/workspace/legalEditContract';

vi.mock('@/lib/prisma', () => {
  const memoryDrafts: any[] = [];
  return {
    prisma: {
      legalDraft: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          const draft = { id: `draft-${Date.now()}-${memoryDrafts.length}`, ...data, createdAt: new Date(), updatedAt: new Date() };
          memoryDrafts.push(draft);
          return draft;
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          return memoryDrafts.find((d) => d.id === where?.id) || null;
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
        findFirst: vi.fn().mockImplementation(async () => ({
          orgId: 'org-demo-legal',
          userId: 'user-demo-legal',
          role: 'ADMIN',
        })),
      },
    },
  };
});

/* ────────────────────────────────────────────────────────────────────────
   DOCUMENTO REAL DE PRUEBA: CONTESTACIÓN DE DEMANDA
   ──────────────────────────────────────────────────────────────────────── */
function buildContestacionDoc() {
  return createEmptyDocument({
    title: 'CONTESTACIÓN DE DEMANDA',
    documentType: 'contestacion_demanda',
    matter: 'civil',
    jurisdiction: 'estatal',
    parties: {
      actor: 'COMERCIALIZADORA DEL GOLFO, S.A. DE C.V.',
      demandado: 'INDUSTRIAS DEL NORTE, S.A. DE C.V.',
    },
    caseRefs: {
      expediente: '0123/2026',
      juzgado: 'JUZGADO SEGUNDO DE LO CIVIL',
    },
    sections: [
      {
        id: 'sec-comparecencia',
        type: 'identity',
        title: 'COMPARECENCIA Y PERSONALIDAD',
        order: 1,
        isRepeatable: false,
        isEditable: true,
        isGenerated: true,
        isManuallyEdited: false,
        variables: [],
        validationErrors: [],
        validationWarnings: [],
        content: [
          {
            id: 'blk-comp-1',
            layer: 'AI_ANALYSIS',
            trustLevel: 'AI_INFERENCE',
            text: '[NOMBRE DEL DEMANDADO], por mi propio derecho, señalando como domicilio para oír y recibir notificaciones el ubicado en [DOMICILIO PROCESAL DEL DEMANDADO], dentro de los autos del expediente número [NUMERO DE EXPEDIENTE], relativo al juicio promovido por [NOMBRE DEL ACTOR], comparezco y expongo:',
          },
        ],
      },
      {
        id: 'sec-hechos',
        type: 'facts',
        title: 'HECHOS',
        order: 2,
        isRepeatable: false,
        isEditable: true,
        isGenerated: true,
        isManuallyEdited: false,
        variables: [],
        validationErrors: [],
        validationWarnings: [],
        content: [
          {
            id: 'blk-hechos-1',
            layer: 'USER_POSITION',
            trustLevel: 'VERIFIED',
            text: 'PRIMERO.- Mi representada nunca celebró contrato alguno con la actora, por lo que la relación jurídica afirmada es ineexistente.',
          },
        ],
      },
      {
        id: 'sec-petitorio',
        type: 'petition',
        title: 'PUNTOS PETITORIOS',
        order: 3,
        isRepeatable: false,
        isEditable: true,
        isGenerated: true,
        isManuallyEdited: false,
        variables: [],
        validationErrors: [],
        validationWarnings: [],
        content: [
          {
            id: 'blk-petitorio-1',
            layer: 'USER_POSITION',
            trustLevel: 'VERIFIED',
            text: 'PRIMERO.- Tenerme por contestado en tiempo y forma la demanda instaurada en mi contra y declarar FUNDADAS las excepciones opuestas.',
          },
        ],
      },
    ] as any,
  });
}

const post = (body: any) =>
  new NextRequest('http://localhost/api/ai/document-edit', {
    method: 'POST',
    body: JSON.stringify(body),
  });

describe('FASE 12 · Clasificador de intención (consulta / propuesta / edición)', () => {
  it('"¿Qué datos faltan?" → CONSULTA (no edita)', () => {
    expect(classifyAssistantIntent('¿Qué datos faltan?')).toBe('consulta');
  });

  it('"Propón qué nombre debería ir en el campo demandado." → PROPUESTA', () => {
    expect(classifyAssistantIntent('Propón qué nombre debería ir en el campo demandado.')).toBe('propuesta');
  });

  it('"Escribe ese nombre en el documento y guarda." → EDICIÓN REAL', () => {
    expect(classifyAssistantIntent('Escribe ese nombre en el documento y guarda.')).toBe('edicion');
  });

  it('"Rellena los datos pendientes usando el contexto actual y guarda los cambios." → EDICIÓN', () => {
    expect(classifyAssistantIntent('Rellena los datos pendientes usando el contexto actual y guarda los cambios.')).toBe('edicion');
  });
});

describe('FASE 5 · Aplicador puro de operaciones sobre el documento real', () => {
  it('replace_field sustituye placeholders con datos confirmados y no toca otras secciones', () => {
    const doc = buildContestacionDoc();
    const result = applyLegalEdits(doc, [
      { operation: 'replace_field', target: '[NOMBRE DEL DEMANDADO]', replacement: doc.parties.demandado!, reason: 'Dato confirmado' },
    ]);
    expect(result.failed).toHaveLength(0);
    expect(result.document).not.toBeNull();

    const comp = result.document!.sections.find((s) => s.id === 'sec-comparecencia')!;
    expect(comp.content[0].text).toContain('INDUSTRIAS DEL NORTE, S.A. DE C.V.');
    expect(comp.content[0].text).not.toContain('[NOMBRE DEL DEMANDADO]');
    expect(comp.content[0].provenance).toBe('USER_EDITED');
    // Alcance: hechos y petitorio intactos
    expect(result.document!.sections.find((s) => s.id === 'sec-hechos')!.content[0].text).toBe(
      doc.sections.find((s) => s.id === 'sec-hechos')!.content[0].text
    );
    expect(result.document!.sections.find((s) => s.id === 'sec-petitorio')!.content[0].text).toBe(
      doc.sections.find((s) => s.id === 'sec-petitorio')!.content[0].text
    );
    // Placeholders restantes preservados
    expect(comp.content[0].text).toContain('[DOMICILIO PROCESAL DEL DEMANDADO]');
  });

  it('replace_field respeta sectionId cuando se acota el alcance', () => {
    const doc = buildContestacionDoc();
    const result = applyLegalEdits(doc, [
      { sectionId: 'sec-comparecencia', operation: 'replace_field', target: '[NUMERO DE EXPEDIENTE]', replacement: '0123/2026' },
    ]);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].sectionId).toBe('sec-comparecencia');
  });

  it('target inexistente → failed sin mutar documento', () => {
    const doc = buildContestacionDoc();
    const result = applyLegalEdits(doc, [
      { operation: 'replace_text', target: 'ESTE TEXTO NO EXISTE EN EL DOCUMENTO', replacement: 'X' },
    ]);
    expect(result.document).toBeNull();
    expect(result.failed[0].reason).toBe('target_not_found');
  });

  it('documentId ajeno → document_mismatch', () => {
    const doc = buildContestacionDoc();
    const result = applyLegalEdits(doc, [
      { documentId: 'otro-documento', operation: 'replace_field', target: '[NOMBRE DEL ACTOR]', replacement: 'X' },
    ] as LegalEditOperation[]);
    expect(result.failed[0].reason).toBe('document_mismatch');
  });

  it('insert_after inserta bloque; reinsertar el mismo texto → duplicate_skipped', () => {
    const doc = buildContestacionDoc();
    const op: LegalEditOperation = {
      sectionId: 'sec-hechos',
      operation: 'insert_after',
      target: 'relación jurídica afirmada es ineexistente',
      replacement: 'SEGUNDO.- Se opone la excepción de inexistencia de la relación jurídica.',
    };
    const first = applyLegalEdits(doc, [op]);
    expect(first.applied).toHaveLength(1);
    expect(first.document!.sections.find((s) => s.id === 'sec-hechos')!.content).toHaveLength(2);

    const second = applyLegalEdits(first.document!, [op]);
    expect(second.applied).toHaveLength(0);
    expect(second.failed[0].reason).toBe('duplicate_skipped');
  });

  it('PROHIBIDO metadata interna dentro del replacement', () => {
    const doc = buildContestacionDoc();
    const result = applyLegalEdits(doc, [
      { operation: 'replace_section', sectionId: 'sec-hechos', target: '*', replacement: 'OBJETIVO DEL BLOQUE: redactar hechos' },
    ]);
    expect(result.applied).toHaveLength(0);
    expect(containsForbiddenInternalMetadata('OBJETIVO DEL BLOQUE: x')).toBe(true);
  });

  it('extractPlaceholders detecta los marcadores del borrador', () => {
    const markers = extractPlaceholders(buildContestacionDoc());
    expect(markers).toContain('[NOMBRE DEL DEMANDADO]');
    expect(markers).toContain('[NUMERO DE EXPEDIENTE]');
  });
});

describe('FASE 4/6 · Endpoint /api/ai/document-edit (contrato de modos)', () => {
  const snapshotOf = () => {
    const doc = buildContestacionDoc();
    const snapshot = buildWorkspaceSnapshot(doc, 'draft-test-contestacion');
    // Domicilio NO confirmado en el contexto → debe quedar pendiente.
    delete (snapshot.fields as any).partie_domicilioprocesal;
    return snapshot;
  };

  it('CONSULTA: "¿Qué datos faltan?" no devuelve operaciones', async () => {
    const res = await documentEditHandler(post({ message: '¿Qué datos faltan?', activeDocument: snapshotOf() }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.mode).toBe('consulta');
    expect(data.operations).toHaveLength(0);
  });

  it('PROPUESTA: propone valores confirmados pero no aplica nada', async () => {
    const res = await documentEditHandler(post({
      message: 'Propón qué nombre debería ir en el campo demandado.',
      activeDocument: snapshotOf(),
    }));
    const data = await res.json();
    expect(data.mode).toBe('propuesta');
    expect(data.explanation.length).toBeGreaterThan(0);
  });

  it('EDICIÓN: "rellena los datos" genera operaciones SOLO con datos confirmados del contexto', async () => {
    const res = await documentEditHandler(post({
      message: 'Rellena los datos pendientes usando el contexto actual y guarda los cambios.',
      activeDocument: snapshotOf(),
    }));
    const data = await res.json();
    expect(data.mode).toBe('edicion');
    expect(data.operations.length).toBeGreaterThan(0);

    for (const op of data.operations) {
      expect(op.operation).toBe('replace_field');
      expect(op.replacement).toBeTruthy();
      expect(op.replacement).not.toBe('[DATO NO CONFIRMADO]');
      // Cada replacement proviene de un valor confirmado del snapshot
      const confirmedValues = Object.values(snapshotOf().fields);
      expect(confirmedValues).toContain(op.replacement);
    }

    // El domicilio no está confirmado → warning, NO operación inventada.
    const domicilioOp = data.operations.find((o: any) => o.target === '[DOMICILIO PROCESAL DEL DEMANDADO]');
    expect(domicilioOp).toBeUndefined();
    expect(data.warnings.join(' ')).toContain('[DOMICILIO PROCESAL DEL DEMANDADO]');
  });

  it('sin borrador activo responde sin operaciones', async () => {
    const res = await documentEditHandler(post({ message: 'Rellena los datos' }));
    const data = await res.json();
    expect(data.mode).toBe('edicion');
    expect(data.operations).toHaveLength(0);
    expect(data.warnings.join(' ')).toContain('Sin contexto');
  });
});

describe('FASE 8/11 · Persistencia real por la única ruta existente (/api/legal-drafts)', () => {
  it('IA → applyLegalEdits → PATCH → GET: el cambio persiste sin copiar y pegar', async () => {
    // 1) Crear draft igual que handleSaveDraft (POST)
    let doc = buildContestacionDoc();
    const createRes = await createDraftHandler(new NextRequest('http://localhost/api/legal-drafts', {
      method: 'POST',
      body: JSON.stringify({
        title: doc.title,
        matter: doc.matter,
        structuredDoc: doc,
        status: 'DRAFT',
      }),
    }));
    const created = await createRes.json();
    expect(created.ok).toBe(true);
    const draftId: string = created.draft.id;

    // 2) Contrato de edición: mismas operaciones que entrega el endpoint al modelo determinista
    const planRes = await documentEditHandler(post({
      message: 'Rellena los datos pendientes usando el contexto actual y guarda los cambios.',
      activeDocument: buildWorkspaceSnapshot(doc, draftId),
    }));
    const plan = await planRes.json();
    expect(plan.mode).toBe('edicion');
    expect(plan.operations.length).toBeGreaterThan(0);

    // 3) Mutator registrado por la página: aplicar sobre el doc REAL
    const applied = applyLegalEdits(doc, plan.operations, { expectedDraftId: draftId });
    expect(applied.document).not.toBeNull();
    doc = applied.document!;
    expect(extractPlaceholders(doc)).not.toContain('[NOMBRE DEL DEMANDADO]');
    expect(extractPlaceholders(doc)).not.toContain('[NUMERO DE EXPEDIENTE]');

    // 4) Guardar cambios (PATCH — misma ruta que el botón "Guardar cambios")
    const patchRes = await updateDraftHandler(new NextRequest(`http://localhost/api/legal-drafts/${draftId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: doc.title, matter: doc.matter, structuredDoc: doc, status: 'DRAFT' }),
    }), { params: Promise.resolve({ id: draftId }) });
    expect(patchRes.status).toBeLessThan(300);

    // 5) Reabrir el documento: los cambios persisten
    const getRes = await getDraftHandler(new NextRequest(`http://localhost/api/legal-drafts/${draftId}`), {
      params: Promise.resolve({ id: draftId }),
    });
    const reopened = await getRes.json();
    expect(reopened.ok).toBe(true);
    const persistedText = JSON.stringify(reopened.draft.structuredDoc);
    expect(persistedText).toContain('INDUSTRIAS DEL NORTE, S.A. DE C.V.');
    expect(persistedText).toContain('0123/2026');
    expect(persistedText).not.toContain('[NOMBRE DEL DEMANDADO]');
    expect(persistedText).not.toContain('[NUMERO DE EXPEDIENTE]');
  });
});
