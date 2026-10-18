import { describe, expect, it } from 'vitest';
import { isUnreadablePageText, proposeActuaciones } from '@/lib/legal-engine/actuacionProposal';
import { evaluateSourceOutputCompatibility, inferSourceOutputType } from '@/lib/legal-engine/sourceOutputCompatibility';
import { OFFICIAL_DOCUMENT_MATRIX } from '../fixtures/documentosOficialesSinteticos';

/**
 * Matriz de documentos oficiales SINTÉTICOS → actuación propuesta. Cada fila fija la salida esperada por
 * materia y tipo de acto (no una regla genérica). `confirm` = la elección queda en manos del abogado.
 */
const EXPECTED: Record<string, { kind: string; matter: string; recommended: string | null; confirm: boolean; includes: string[]; excludes?: string[] }> = {
  'demanda-civil': { kind: 'DEMANDA', matter: 'CIVIL', recommended: 'contestacion_demanda_civil', confirm: false, includes: ['contestacion_demanda_civil'] },
  'demanda-divorcio': { kind: 'DEMANDA', matter: 'FAMILIAR', recommended: 'contestacion_divorcio', confirm: false, includes: ['contestacion_divorcio'] },
  'demanda-alimentos': { kind: 'DEMANDA', matter: 'FAMILIAR', recommended: 'contestacion_alimentos', confirm: false, includes: ['contestacion_alimentos'] },
  'demanda-laboral': { kind: 'DEMANDA', matter: 'LABORAL', recommended: 'contestacion_demanda_laboral', confirm: false, includes: ['contestacion_demanda_laboral'], excludes: ['contestacion_demanda_civil'] },
  'demanda-mercantil': { kind: 'DEMANDA', matter: 'MERCANTIL', recommended: 'contestacion_demanda_mercantil', confirm: false, includes: ['contestacion_demanda_mercantil'], excludes: ['contestacion_demanda_civil'] },
  'sentencia-familiar': { kind: 'SENTENCIA_DEFINITIVA', matter: 'FAMILIAR', recommended: 'apelacion_familiar', confirm: true, includes: ['apelacion_familiar', 'demanda_amparo_directo'], excludes: ['contestacion_divorcio', 'contestacion_demanda_civil'] },
  'auto-civil': { kind: 'AUTO_INTERLOCUTORIO', matter: 'CIVIL', recommended: 'apelacion_civil', confirm: true, includes: ['apelacion_civil', 'revocacion_civil', 'demanda_amparo_indirecto'] },
  'auto-familiar': { kind: 'AUTO_INTERLOCUTORIO', matter: 'FAMILIAR', recommended: 'apelacion_familiar', confirm: true, includes: ['apelacion_familiar', 'revocacion_civil'] },
  // Defecto corregido: el auto mercantil se proponía como contestación mercantil.
  'auto-mercantil': { kind: 'AUTO_INTERLOCUTORIO', matter: 'MERCANTIL', recommended: 'apelacion_mercantil', confirm: true, includes: ['apelacion_mercantil', 'revocacion_mercantil'], excludes: ['contestacion_demanda_mercantil'] },
  'acuerdo-tramite': { kind: 'ACUERDO_TRAMITE', matter: 'FAMILIAR', recommended: 'revocacion_civil', confirm: true, includes: ['revocacion_civil', 'promocion_simple'] },
  'acuerdo-vista': { kind: 'ACUERDO_TRAMITE', matter: 'CIVIL', recommended: 'desahogo_vista_civil', confirm: false, includes: ['desahogo_vista_civil'] },
  'acuerdo-requerimiento': { kind: 'ACUERDO_TRAMITE', matter: 'CIVIL', recommended: 'promocion_simple', confirm: false, includes: ['promocion_simple'], excludes: ['contestacion_demanda_civil'] },
  // «escrito inicial de demanda» dentro de una prevención no la convierte en demanda.
  'acuerdo-prevencion': { kind: 'ACUERDO_TRAMITE', matter: 'CIVIL', recommended: 'desahogo_prevencion', confirm: false, includes: ['desahogo_prevencion'], excludes: ['contestacion_demanda_civil'] },
  // Defecto corregido: la sentencia de amparo indirecto se segmentaba como acuerdo / se tipificaba como directo.
  'sentencia-amparo-indirecto': { kind: 'SENTENCIA_AMPARO', matter: 'CIVIL', recommended: 'recurso_revision_amparo', confirm: true, includes: ['recurso_revision_amparo'], excludes: ['recurso_revision_amparo_directo', 'apelacion_civil'] },
  'sentencia-amparo-directo': { kind: 'SENTENCIA_AMPARO', matter: 'CIVIL', recommended: 'recurso_revision_amparo_directo', confirm: true, includes: ['recurso_revision_amparo_directo'], excludes: ['recurso_revision_amparo', 'apelacion_civil'] },
  // Defecto corregido: la contestación con reconvención era incompatible con su regla.
  'contestacion-reconvencion': { kind: 'CONTESTACION', matter: 'FAMILIAR', recommended: 'contestacion_reconvencion_civil', confirm: false, includes: ['contestacion_reconvencion_civil', 'replica', 'promocion_simple'] },
  'contestacion-reconvencion-mercantil': { kind: 'CONTESTACION', matter: 'MERCANTIL', recommended: 'contestacion_reconvencion_mercantil', confirm: false, includes: ['contestacion_reconvencion_mercantil', 'replica'], excludes: ['contestacion_reconvencion_civil'] },
  // Expediente con demanda y sentencia: manda la resolución más reciente, no la primera palabra «demanda».
  'expediente-multiacto': { kind: 'SENTENCIA_DEFINITIVA', matter: 'FAMILIAR', recommended: 'apelacion_familiar', confirm: true, includes: ['apelacion_familiar'], excludes: ['contestacion_divorcio'] },
  // «Vista la demanda de amparo…» dentro de un auto del Juzgado de Distrito no lo convierte en demanda de amparo;
  // sus vías son las de la Ley de Amparo, no apelación ni revocación.
  'auto-amparo-suspension': { kind: 'ACUERDO_TRAMITE', matter: 'CIVIL', recommended: 'recurso_queja_amparo', confirm: true, includes: ['recurso_queja_amparo', 'recurso_revision_amparo'], excludes: ['apelacion_civil', 'revocacion_civil', 'demanda_amparo_indirecto'] },
  'acuerdo-mercantil-requerimiento': { kind: 'ACUERDO_TRAMITE', matter: 'MERCANTIL', recommended: 'promocion_simple', confirm: false, includes: ['promocion_simple', 'revocacion_mercantil'], excludes: ['revocacion_civil', 'contestacion_demanda_mercantil'] },
  // Documento que no corresponde a ninguna actuación: solo redacción libre (el pipeline rechazaría una promoción
  // sobre una fuente sin clasificar con NEEDS_SOURCE_REVIEW); nada se preselecciona.
  'ambiguo': { kind: 'DESCONOCIDO', matter: 'NO_IDENTIFICADA', recommended: null, confirm: true, includes: ['redaccion_libre'], excludes: ['promocion_simple', 'incidente_procesal'] },
  'escaneado-parcial': { kind: 'DEMANDA', matter: 'CIVIL', recommended: 'contestacion_demanda_civil', confirm: true, includes: ['contestacion_demanda_civil'] },
  'escaneado-paginas-breves': { kind: 'DEMANDA', matter: 'CIVIL', recommended: 'contestacion_demanda_civil', confirm: false, includes: ['contestacion_demanda_civil'] },
};

describe('propuesta de actuación sobre documentos oficiales sintéticos', () => {
  it('cubre toda la matriz', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(OFFICIAL_DOCUMENT_MATRIX.map((item) => item.id).sort());
  });

  for (const { id, source } of OFFICIAL_DOCUMENT_MATRIX) {
    it(`${id}: actuación esperada y solo vías compatibles`, () => {
      const expected = EXPECTED[id];
      const proposal = proposeActuaciones([source]);
      const types = proposal.candidates.map((item) => item.documentType);
      expect(proposal.detected.kind).toBe(expected.kind);
      expect(proposal.detected.matter).toBe(expected.matter);
      expect(proposal.recommended).toBe(expected.recommended);
      expect(proposal.requiresConfirmation).toBe(expected.confirm);
      for (const type of expected.includes) expect(types, type).toContain(type);
      for (const type of expected.excludes ?? []) expect(types, type).not.toContain(type);
      // Ninguna vía propuesta es rechazada por la matriz fuente→salida (gates intactos).
      for (const type of types.filter((item) => item !== 'redaccion_libre')) {
        expect(() => evaluateSourceOutputCompatibility({ selectedDocumentType: type, sourceDocuments: [source] }), type).not.toThrow();
      }
      // Ninguna vía de recurso se presenta como procedente: solo «posible» con verificaciones.
      for (const item of proposal.candidates.filter((candidate) => candidate.family === 'RECURSO' || candidate.family === 'AMPARO')) {
        expect(item.status).toBe('POSIBLE');
        expect(item.toConfirm.length).toBeGreaterThan(0);
      }
    });
  }

  it('la reconvención se hace valer solo para la actuación que la requiere: la contestación sigue admitiendo réplica', () => {
    const source = OFFICIAL_DOCUMENT_MATRIX.find((item) => item.id === 'contestacion-reconvencion')!.source;
    expect(inferSourceOutputType([source])).toBe('CONTESTACION_DEMANDA');
    const reconvencion = evaluateSourceOutputCompatibility({ selectedDocumentType: 'contestacion_reconvencion_civil', sourceDocuments: [source] });
    expect(reconvencion.sourceDocumentType).toBe('RECONVENCION_CIVIL');
    expect(reconvencion.controllingActs?.[0]?.label).toBe('contestación con reconvención');
    expect(() => evaluateSourceOutputCompatibility({ selectedDocumentType: 'replica', sourceDocuments: [source] })).not.toThrow();
  });

  it('una contestación SIN reconvención no habilita la contestación a la reconvención', () => {
    const source = OFFICIAL_DOCUMENT_MATRIX.find((item) => item.id === 'contestacion-reconvencion')!.source;
    const plain = { ...source, id: 'sin-reconvencion', pages: source.pages!.map((page) => ({ ...page, text: page.text.split('RECONVENCIÓN')[0] })) };
    plain.extractedText = plain.pages.map((page) => page.text).join('\n');
    plain.content = plain.extractedText;
    expect(() => evaluateSourceOutputCompatibility({ selectedDocumentType: 'contestacion_reconvencion_civil', sourceDocuments: [plain] })).toThrow(/SOURCE_DOCUMENT_INCOMPATIBLE/);
    expect(proposeActuaciones([plain]).candidates.map((item) => item.documentType)).not.toContain('contestacion_reconvencion_civil');
  });

  it('una demanda sigue sin admitir una apelación (los controles de compatibilidad no se relajan)', () => {
    const source = OFFICIAL_DOCUMENT_MATRIX.find((item) => item.id === 'demanda-civil')!.source;
    expect(() => evaluateSourceOutputCompatibility({ selectedDocumentType: 'apelacion_civil', sourceDocuments: [source] })).toThrow(/SOURCE_DOCUMENT_INCOMPATIBLE/);
  });

  it('informa las páginas que no pudo leer y no las cuenta como analizadas', () => {
    const proposal = proposeActuaciones([OFFICIAL_DOCUMENT_MATRIX.find((item) => item.id === 'escaneado-parcial')!.source]);
    expect(proposal.extraction).toMatchObject({ totalPages: 3, pagesWithText: 1, unreadablePages: [2, 3], complete: false });
    expect(proposal.extraction.notice).toMatch(/No se pudo leer texto en 2 de 3 páginas/);
  });

  it('una página breve pero legible no es ilegible; el ruido de escaneo sí', () => {
    expect(isUnreadablePageText('NOTIFÍQUESE.')).toBe(false);
    expect(isUnreadablePageText('Foja 3')).toBe(false);
    expect(isUnreadablePageText('')).toBe(true);
    expect(isUnreadablePageText('  ~~ |/ .. 1 ;')).toBe(true);
    expect(isUnreadablePageText('ii l| ;; ,, ..')).toBe(true);
  });
});

describe('mismo camino que el navegador: PDF sintético → extracción del servidor → propuesta', () => {
  async function fromPdf(name: string, buffer: Buffer) {
    const { analyzeUploadedDocument } = await import('@/lib/upload-analysis/analyze');
    const { createSourceDocument } = await import('@/lib/legal-engine/context');
    const data: any = await analyzeUploadedDocument({ buffer, fileName: name, mimeType: 'application/pdf' } as any);
    const pages = (data.pages || []).map((page: any) => ({ page: page.page, text: page.text || '', chars: page.chars || 0 }));
    return createSourceDocument({ id: name, filename: name, name, type: 'application/pdf', extractedText: data.extractedText || '', pages, sourceValidated: data.sourceValidated === true } as any);
  }

  it('demanda sin título «DEMANDA» (rubro C. JUEZ… y «por mi propio derecho… demandar»): corresponde contestarla', async () => {
    const { CIVIL_ARRENDAMIENTO_DEMAND, demandToPdf } = await import('../helpers/syntheticDemandPdf');
    const proposal = proposeActuaciones([await fromPdf('demanda.pdf', demandToPdf(CIVIL_ARRENDAMIENTO_DEMAND))]);
    expect(proposal.detected.kind).toBe('DEMANDA');
    expect(proposal.recommended).toBe('contestacion_demanda_civil');
    expect(proposal.requiresConfirmation).toBe(false);
  }, 120_000);

  it('auto de 44 fojas con el juzgado como encabezado corriente: se reconoce el auto, no «desconocido»', async () => {
    const { autoFamiliarPdf } = await import('../helpers/syntheticPdf');
    const proposal = proposeActuaciones([await fromPdf('auto-familiar-44.pdf', autoFamiliarPdf(44))]);
    expect(proposal.detected.kind).toBe('AUTO_INTERLOCUTORIO');
    expect(proposal.detected.matter).toBe('FAMILIAR');
    expect(proposal.recommended).toBe('apelacion_familiar');
    expect(proposal.requiresConfirmation).toBe(true);
  }, 120_000);

  it('PDF de 44 fojas con auto y sentencia: manda la sentencia y se informa el otro acto', async () => {
    const { appealPdf } = await import('../helpers/syntheticPdf');
    const proposal = proposeActuaciones([await fromPdf('apelacion44.pdf', appealPdf(44))]);
    expect(proposal.detected.kind).toBe('SENTENCIA_DEFINITIVA');
    expect(proposal.detected.otherActs.length).toBeGreaterThan(0);
    expect(proposal.candidates.map((item) => item.documentType)).toContain('apelacion_familiar');
  }, 120_000);
});
