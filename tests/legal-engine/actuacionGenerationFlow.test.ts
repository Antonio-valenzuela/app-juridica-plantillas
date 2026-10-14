import { describe, expect, it } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { proposeActuaciones } from '@/lib/legal-engine/actuacionProposal';
import { contextFromDocument, validateGeneratedOutput } from '@/lib/legal-engine/generatedOutputValidator';
import { OFFICIAL_DOCUMENT_MATRIX } from '../fixtures/documentosOficialesSinteticos';
import { autoDesechaIncidente, documentFromPages, SENTENCIA_DEFINITIVA } from '../fixtures/actosProcesalesSinteticos';

/**
 * De la propuesta al borrador, sin proveedor (sin consentimiento → solo reglas locales), con documentos
 * oficiales SINTÉTICOS: la actuación propuesta (o la elegida a mano) genera un borrador de ESE tipo, sin
 * andamiaje, citas sin respaldo, duplicados ni afirmaciones inventadas, y con las partes en su papel.
 */
const source = (id: string) => OFFICIAL_DOCUMENT_MATRIX.find((item) => item.id === id)!.source;
const workflow = () => ({ flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() });

async function generate(id: string, documentType: string): Promise<any> {
  return runGenerationPipeline({
    selectedDocumentType: documentType, documentTypeLabel: documentType,
    userInstruction: `Redactar el escrito seleccionado con base en el documento fuente.`,
    sourceDocuments: [source(id)], workflow: workflow(),
  } as never);
}

const body = (doc: any) => doc.sections.flatMap((section: any) => (section.content || []).map((block: any) => block.text || '')).join('\n');

describe('propuesta → borrador (sin proveedor, documentos sintéticos)', () => {
  const recommendedCases = OFFICIAL_DOCUMENT_MATRIX
    .map(({ id, source: doc }) => ({ id, recommended: proposeActuaciones([doc]).recommended }))
    .filter((item): item is { id: string; recommended: string } => Boolean(item.recommended));

  for (const { id, recommended } of recommendedCases) {
    it(`${id} → ${recommended}: el tipo sobrevive y la salida no tiene bloqueos`, async () => {
      const doc = await generate(id, recommended);
      expect(doc.documentType).toBe(recommended);
      expect(doc.status).toBe('draft');
      const validation = validateGeneratedOutput(doc, contextFromDocument(doc));
      expect(validation.blockers.map((item) => `${item.code}: ${item.excerpt}`)).toEqual([]);
    }, 120_000);
  }

  it('corrección manual: el abogado cambia a otra vía posible y se genera ESA vía', async () => {
    const proposal = proposeActuaciones([source('auto-civil')]);
    expect(proposal.candidates.map((item) => item.documentType)).toContain('revocacion_civil');
    const doc = await generate('auto-civil', 'revocacion_civil');
    expect(doc.documentType).toBe('revocacion_civil');
    expect(body(doc)).toMatch(/recurso de revocación/);
    expect(body(doc)).not.toMatch(/recurso de apelación/);
  }, 120_000);

  it('cada medio de impugnación se nombra por su tipo y un escrito que no impugna no habla de agravios', async () => {
    expect(body(await generate('sentencia-amparo-indirecto', 'recurso_revision_amparo'))).toMatch(/recurso de revisión/);
    const replica = body(await generate('contestacion-reconvencion', 'replica'));
    expect(replica).not.toMatch(/recurso de apelación|resolución dictada|agravios que se desarrollan|Admitir a trámite el medio de defensa/);
  }, 240_000);

  it('sin instrucción no se afirma el perjuicio ni se inventa un agravio constitucional', async () => {
    const revocacion = body(await generate('acuerdo-tramite', 'revocacion_civil'));
    expect(revocacion).not.toMatch(/lesiona las garant[ií]as/i);
    const revision = body(await generate('sentencia-amparo-directo', 'recurso_revision_amparo_directo'));
    expect(revision).not.toMatch(/AGRAVIO ÚNICO|art[ií]culos 14, 16 y 17/);
    expect(revision).not.toMatch(/debe sostenerse únicamente|debe contrastarse con los principios/);
    expect(revision).not.toMatch(/\[NO VERIFICADO: CONSTITUCION\]AL/i);
    expect(revision).toMatch(/REQUIERE POSTURA DEL ABOGADO/);
  }, 240_000);

  it('partes: el demandado no absorbe el objeto de la acción y cada quien queda en su papel', async () => {
    const divorcio = await generate('demanda-divorcio', 'contestacion_divorcio');
    expect(body(divorcio)).toMatch(/JORGE ARTURO NAVARRETE DUEÑAS, en su carácter de parte demandada, comparece para contestar la demanda promovida por MARTA ELENA SOLÍS RIVERO/);
    expect(body(divorcio)).not.toMatch(/DUEÑAS la disolución/);
    const mercantil = await generate('demanda-mercantil', 'contestacion_demanda_mercantil');
    expect(body(mercantil)).toMatch(/MARIO FICTICIO, en su carácter de parte demandada, comparece para contestar la demanda promovida por CRÉDITOS SINTÉTICOS/);
    const reconvencion = await generate('contestacion-reconvencion-mercantil', 'contestacion_reconvencion_mercantil');
    expect(body(reconvencion)).toMatch(/CRÉDITOS SINTÉTICOS, en su carácter de parte actora en lo principal y demandada en la reconvención, comparece para contestar la reconvención formulada por MARIO FICTICIO/);
  }, 360_000);

  it('PDF con páginas sin texto: el borrador lo advierte y no se presenta como basado en el documento completo', async () => {
    const doc = await generate('escaneado-parcial', 'contestacion_demanda_civil');
    const warning = (doc.validation?.warnings || []).find((item: any) => item.checkId === 'SOURCE_PAGES_UNREAD');
    expect(warning?.message).toMatch(/No se pudo leer texto en 2 de 3 páginas/);
    const complete = await generate('escaneado-paginas-breves', 'contestacion_demanda_civil');
    expect((complete.validation?.warnings || []).some((item: any) => item.checkId === 'SOURCE_PAGES_UNREAD')).toBe(false);
  }, 240_000);

  it('documento no clasificable: la redacción libre genera; no se fuerza otra actuación', async () => {
    const proposal = proposeActuaciones([source('ambiguo')]);
    expect(proposal.recommended).toBeNull();
    const doc = await generate('ambiguo', 'escrito_libre');
    expect(doc.documentType).toBe('escrito_libre');
  }, 120_000);
});

describe('regresión: sentencia que NARRA «agravios» dentro de un PDF con auto y sentencia (caso reportado)', () => {
  const narrated = ['SENTENCIA DEFINITIVA', 'PODER JUDICIAL DEL ESTADO DE JALISCO. CONSEJO DE LA JUDICATURA.', 'EXPEDIENTE: 1234/2025', 'Guadalajara, Jalisco, a veinte de septiembre de dos mil veinticinco.', 'La parte demandada expresó agravios en su oposición, que se desestimaron por improcedentes.', 'PRIMERO. Se declara disuelto el vínculo matrimonial.', 'NOTIFÍQUESE. Así lo sentenció la Jueza.'].join('\n');
  const pages = [autoDesechaIncidente('familiar'), 'Continuación de actuaciones. Foja 2.', 'Continuación de actuaciones. Foja 3.', 'Continuación de actuaciones. Foja 4.', narrated, 'Continuación de la sentencia. Foja 6.'];
  const src = documentFromPages('mixto-agravios', pages);

  for (const type of ['apelacion_civil', 'apelacion_familiar']) {
    it(`${type}: la resolución elegida no se reclasifica como «recurso» por mencionar agravios`, async () => {
      const { deriveProvisionalAppealConfirmation, extractAppealResolutionReview } = await import('@/lib/legal-engine/case-extraction/appealResolutionReview');
      const review = extractAppealResolutionReview([src]);
      const doc: any = await runGenerationPipeline({
        selectedDocumentType: type, documentTypeLabel: type, userInstruction: 'Redactar.', sourceDocuments: [src], workflow: workflow(),
        requireAppealConfirmation: true, appealConfirmation: deriveProvisionalAppealConfirmation(review, { expediente: '1234/2025' }),
      } as never);
      expect(doc.documentType).toBe(type);
    }, 120_000);
  }

  it('la propuesta y la revisión de apelación ven el mismo acto y ofrecen la apelación', () => {
    const proposal = proposeActuaciones([src]);
    expect(proposal.detected.kind).toBe('SENTENCIA_DEFINITIVA');
    expect(proposal.candidates.map((item) => item.documentType)).toContain('apelacion_familiar');
  });
});
