import { describe, expect, it } from 'vitest';
import { generateLegalBlock } from '@/lib/legal-engine/pipeline';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';
import type { LegalBlock } from '@/lib/legal-engine/blockPlanner';

/**
 * El expediente fuente puede ser una sentencia de amparo (el catálogo admite
 * SENTENCIA_AMPARO y SENTENCIA_AMPARO_DIRECTO como origen de una apelación
 * civil). La materia inferida del fuente no puede decidir la vía procesal del
 * escrito solicitado: el recurso pedido manda.
 */
const appealFromAmparoSentence = () => {
  const doc = createEmptyDocument({
    id: 'apelacion-from-amparo', documentType: 'apelacion_civil', documentTypeLabel: 'recurso de apelación civil',
    matter: 'amparo', jurisdiction: 'local civil', flow: 'DOCUMENT_ANALYSIS',
  });
  doc.caseRefs = { ...doc.caseRefs, expediente: '1152/2013' };
  doc.parties = {
    ...doc.parties,
    actor: 'JUAN PÉREZ SÁNCHEZ',
    demandado: 'CONSTRUCTORA DEL VALLE, S.A. DE C.V.',
    autoridadDestinataria: 'JUEZ DE PRIMERA INSTANCIA DEL DISTRITO JUDICIAL DE ZAPOPAN',
  };
  return doc;
};

const block = (title: string, sectionType: string, id: string): LegalBlock => ({
  id,
  kind: sectionType,
  sectionType,
  title,
  level: 1,
  order: 1,
  text: '',
  sourceElementIndices: [],
  pages: { start: 1, end: 1 },
  aiNeed: 'PRESERVE_DIRECT',
  requiresAi: false,
classificationReason: 'fixture offline',
  elementCount: 1,
  charCount: 10,
} as unknown as LegalBlock);

async function render(title: string, sectionType: string, id: string) {
  return (await generateLegalBlock(
    block(title, sectionType, id), appealFromAmparoSentence(), {} as any,
    undefined, undefined, undefined, DEFAULT_LAWYER_PROFILE, undefined, undefined,
  )).text;
}

const AMPARO_ONLY = /amparo|garant[ií]as fundamentales|tutela judicial efectiva|debida fundamentaci[óo]n y motivaci[óo]n|concepto de violaci[óo]n|conceptos de violaci[óo]n|acto reclamado|medio de defensa|tribunal colegiado|juzgado de distrito|concesi[óo]n definitiva|ejecutoria de amparo|titular de la acci[óo]n popular/i;

describe('el recurso pedido determina la vía procesal, no la materia inferida del fuente', () => {
  it('ANTECEDENTES PROCESALES de una apelación civil no usa vocabulario de amparo', async () => {
    const text = await render('ANTECEDENTES PROCESALES', 'background', 'sec-1');
    expect(text).not.toMatch(AMPARO_ONLY);
  });

  it('AGRAVIOS de una apelación civil no usa conceptos de violación ni medios de defensa', async () => {
    const text = await render('AGRAVIOS', 'argument', 'sec-2');
    expect(text).not.toMatch(AMPARO_ONLY);
  });

  it('CONSIDERACIONES COMBATIDAS de una apelación civil no invoca garantías fundamentales', async () => {
    const text = await render('CONSIDERACIONES COMBATIDAS', 'custom', 'sec-3');
    expect(text).not.toMatch(AMPARO_ONLY);
  });

  it('EFECTOS SOLICITADOS A LA ALZADA de una apelación civil no pide tutela de garantías', async () => {
    const text = await render('EFECTOS SOLICITADOS A LA ALZADA', 'custom', 'sec-4');
    expect(text).not.toMatch(AMPARO_ONLY);
  });

  it('un amparo directo sí conserva su propia vía procesal', async () => {
    const doc = createEmptyDocument({
      id: 'amparo-directo', documentType: 'amparo_directo', documentTypeLabel: 'amparo directo',
      matter: 'constitucional', jurisdiction: 'federal', flow: 'DOCUMENT_ANALYSIS',
    });
    const rendered = (await generateLegalBlock(
      block('ANTECEDENTES', 'background', 'sec-amparo'), doc, {} as any,
      undefined, undefined, undefined, DEFAULT_LAWYER_PROFILE, undefined, undefined,
    )).text;
    // La protección no se relaja: el amparo directo conserva su lenguaje.
    expect(rendered.toLowerCase()).toMatch(/amparo|garant|autoridad responsable|acto/);
  });
});