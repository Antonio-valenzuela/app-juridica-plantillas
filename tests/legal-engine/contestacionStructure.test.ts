import { describe, it, expect } from 'vitest';
import { buildContestacionSkeleton, resolveContestacionRoles } from '../../lib/legal-engine/contestacionStructure';
import { validateForExport } from '../../lib/legal-engine/exportGuards';
import { sanitizeLegalDocument } from '../../lib/legal-engine/legalDocumentSanitizer';
import { UniversalLegalDocument, createEmptyDocument } from '../../lib/legal-engine/types';
import { getDocumentTemplate } from '../../lib/legal-engine/documentTemplates';
import { buildDocumentPlan } from '../../lib/legal-engine/documentPlan';

function mkDoc(overrides: Partial<UniversalLegalDocument> = {}): UniversalLegalDocument {
  return createEmptyDocument({
    id: 'd1',
    title: 'Contestación',
    documentType: 'contestacion_demanda_laboral',
    documentTypeLabel: 'Contestación de Demanda',
    matter: 'Laboral',
    sections: [],
    ...overrides,
  } as any);
}

describe('resolveContestacionRoles — identidad procesal', () => {
  it('prioriza partes confirmadas por el abogado sobre el análisis', () => {
    const doc = mkDoc({ parties: { actor: 'Actor Del Análisis', demandado: 'Demandado Del Análisis' } } as any);
    const roles = resolveContestacionRoles(doc, undefined, [
      { role: 'actor', name: 'MARIA LOPEZ' },
      { role: 'demandado', name: 'TRANSPORTES SA' },
    ]);
    expect(roles.contesta).toBe('TRANSPORTES SA');
    expect(roles.contraparte).toBe('MARIA LOPEZ');
  });

  it('usa [DATO PENDIENTE] cuando no hay datos — nunca inventa', () => {
    const roles = resolveContestacionRoles(mkDoc());
    expect(roles.contesta).toContain('[DATO PENDIENTE');
    expect(roles.contraparte).toContain('[DATO PENDIENTE');
  });
});

describe('buildContestacionSkeleton — estructura GENERATED dedicada', () => {
  it('contiene las secciones jurídicas en orden y TODAS son GENERATED (no SOURCE)', () => {
    const secs = buildContestacionSkeleton(mkDoc({
      parties: { actor: 'ACTOR PRUEBA', demandado: 'DEMANDADO PRUEBA' },
      caseRefs: { expediente: '456/2026' },
    } as any));
    const titles = secs.map((s) => s.title);
    expect(titles).toEqual([
      'PROEMIO',
      'COMPARECENCIA Y PERSONALIDAD',
      'OBJETO DEL ESCRITO',
      'CONTESTACIÓN DE HECHOS',
      'CONTESTACIÓN DE PRESTACIONES',
      'EXCEPCIONES Y DEFENSAS',
      'PRUEBAS',
      'ALEGATOS',
      'PETITORIOS',
      'FIRMA',
    ]);
    for (const s of secs) {
      expect((s as any)._provenance).toBe('GENERATED');
    }
    // Roles correctos: quien firma/contesta es el demandado
    const firma = secs.find((s) => s.title === 'FIRMA')!;
    expect(firma.content[0].text).toContain('DEMANDADO PRUEBA');
    expect(firma.content[0].text).not.toContain('ACTOR PRUEBA');
  });

  it('sin títulos duplicados consecutivos', () => {
    const secs = buildContestacionSkeleton(mkDoc() as any);
    for (let i = 1; i < secs.length; i++) {
      expect(secs[i].title.toLowerCase()).not.toBe(secs[i - 1].title.toLowerCase());
    }
  });

  it('mantiene la sección canónica DERECHO en la contestación civil rich-first', () => {
    const civil = mkDoc({
      documentType: 'contestacion_demanda_civil',
      documentTypeLabel: 'Contestación de Demanda Civil',
      matter: 'Civil',
    });
    const secs = buildContestacionSkeleton(civil, {
      richCaseAnalysis: { facts: [], claims: [], evidenceMentions: [] },
    } as any);

    expect(secs.map((section) => section.title)).toContain('DERECHO');
    expect(secs.find((section) => section.title === 'DERECHO')?.type).toBe('legal_grounds');
  });

  it('conserva DERECHO además de ALEGATOS en el plan canónico rich-first laboral', () => {
    const doc = mkDoc({
      documentType: 'contestacion_demanda_laboral',
      documentTypeLabel: 'Contestación de Demanda Laboral',
      matter: 'Laboral',
    });
    const caseAnalysis = {
      richCaseAnalysis: {
        parties: [], assertions: [], claims: [], facts: [], documents: [], evidenceMentions: [], evidenceOffers: [],
        arguments: [], authorities: [], dates: [], amounts: [], proceduralTimeline: [], conflicts: [], missingData: [],
        sourcePosition: { status: 'UNKNOWN', assertionIds: [], provenance: [] },
        clientPosition: { status: 'UNKNOWN', source: 'SOURCE_POSITION', propositionIds: [], provenance: [] },
        extractionStats: {
          sourceUnitCount: 0, candidatesDetected: 0, candidatesAccepted: 0, candidatesMerged: 0,
          candidatesRejected: 0, candidatesForReview: 0, rejectionReasons: {}, provenanceComplete: 0,
          provenancePartial: 0, provenanceMissing: 0,
        },
        candidates: [],
      },
    } as any;
    const plan = buildDocumentPlan({
      doc,
      template: getDocumentTemplate('contestacion_demanda_laboral'),
      caseAnalysis,
    });
    const titles = plan.sections.map((section) => section.title);
    const derecho = plan.sections.find((section) => section.title === 'DERECHO');

    expect(titles).toEqual(expect.arrayContaining(['DERECHO', 'ALEGATOS']));
    expect(derecho?.type).toBe('legal_grounds');
    expect(derecho?.content[0]?.text).toContain('fuentes oficiales');
    expect(derecho?.content[0]?.text).not.toMatch(/artículo\s+\d|jurisprudencia/i);
  });
});

describe('validateForExport — guardas de salida', () => {
  it('RECHAZA markdown crudo real', () => {
    const doc = mkDoc();
    doc.sections = [{
      id: 's1', type: 'argument', title: 'X', order: 1,
      content: [{ id: 'b1', layer: 'USER_POSITION', trustLevel: 'VERIFIED', text: '**PRUEBAS** con negrita cruda', isManuallyEdited: false }],
    } as any];
    const r = validateForExport(doc);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Markdown crudo/i);
  });

  it('RECHAZA etiquetas internas impresas', () => {
    const doc = mkDoc();
    doc.sections = [{
      id: 's1', type: 'argument', title: 'X', order: 1,
      content: [{ id: 'b1', layer: 'USER_POSITION', trustLevel: 'VERIFIED', text: 'OBJETIVO DEL BLOQUE: desarrollar\nTexto.', isManuallyEdited: false }],
    } as any];
    expect(validateForExport(doc).ok).toBe(false);
  });

  it('RECHAZA bloques SOURCE dentro de una contestación', () => {
    const doc = mkDoc();
    doc.sections = [{
      id: 's1', type: 'background', title: 'DEMANDA (fuente)', order: 1,
      content: [{ id: 'b1', layer: 'SOURCE_FACT', trustLevel: 'VERIFIED', text: 'Texto extraído del expediente.', isManuallyEdited: false }],
      _provenance: 'SOURCE',
    } as any];
    const r = validateForExport(doc);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/SOURCE/);
  });

  it('RECHAZA títulos consecutivos duplicados', () => {
    const doc = mkDoc();
    const blk = { id: 'b', layer: 'USER_POSITION', trustLevel: 'VERIFIED', text: 'Contenido suficientemente largo para validar.', isManuallyEdited: false };
    doc.sections = [
      { id: 's1', type: 'evidence', title: 'PRUEBAS', order: 1, content: [blk] },
      { id: 's2', type: 'evidence', title: 'PRUEBAS', order: 2, content: [blk] },
    ] as any;
    const r = validateForExport(doc);
    expect(r.errors.join(' ')).toMatch(/duplicados/i);
  });

  it('bloquea una contestación con datos pendientes mientras permanece en DRAFT', () => {
    const secs = buildContestacionSkeleton(mkDoc({ parties: { actor: 'A', demandado: 'B' } } as any));
    // Simular redacción IA con redacción de fuente citada
    secs[3].content[0].text = 'Respecto del hecho "El diecisiete de ***** ingresé", la demandada la niega.';
    const doc = mkDoc({ sections: secs });
    const r = validateForExport(doc);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('LIFECYCLE_NOT_EXPORTABLE'),
    ]));
  });
});

describe('sanitizer — fusión estructural de títulos duplicados', () => {
  it('fusiona secciones consecutivas con el mismo título SIN perder contenido', () => {
    const doc = mkDoc();
    doc.sections = [
      { id: 's1', type: 'evidence', title: 'PRUEBAS', order: 1, content: [{ id: 'b1', layer: 'USER_POSITION', trustLevel: 'VERIFIED', text: 'Confesional a cargo.', isManuallyEdited: false }] },
      { id: 's2', type: 'evidence', title: 'PRUEBAS', order: 2, content: [{ id: 'b2', layer: 'USER_POSITION', trustLevel: 'VERIFIED', text: 'Documental pública IMSS.', isManuallyEdited: false }] },
    ] as any;
    const { document: out } = sanitizeLegalDocument(doc);
    const pruebas = out.sections.filter((s) => s.title.toUpperCase() === 'PRUEBAS');
    expect(pruebas.length).toBe(1);
    const joined = pruebas[0].content.map((b) => b.text).join(' ');
    expect(joined).toContain('Confesional');
    expect(joined).toContain('IMSS');
  });

  it('elimina etiquetas de metadata del abogado si la IA las imprimiera', () => {
    const doc = mkDoc();
    doc.sections = [{
      id: 's1', type: 'argument', title: 'X', order: 1,
      content: [{ id: 'b1', layer: 'USER_POSITION', trustLevel: 'VERIFIED', text: 'APORTACIONES DEL ABOGADO:\n1. Excepción.\n\nArgumento real de la contestación.', isManuallyEdited: false }],
    } as any];
    const { document: out } = sanitizeLegalDocument(doc);
    const t = out.sections[0].content.map((b) => b.text).join('\n');
    expect(t).not.toContain('APORTACIONES DEL ABOGADO');
    expect(t).toContain('Argumento real');
  });
});
