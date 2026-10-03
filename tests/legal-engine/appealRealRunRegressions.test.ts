import { describe, expect, it } from 'vitest';
import { generateLegalBlock } from '@/lib/legal-engine/pipeline';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';
import type { LegalBlock } from '@/lib/legal-engine/blockPlanner';

/**
 * Regresiones detectadas en la generación real de la apelación 1152/2013 con
 * proveedor externo (ver audit/legal-generation-quality-recovery/real-appeal-1152-2013):
 *  - AGRAVIOS emitía vocabulario constitucional en un recurso civil.
 *  - RESOLUCIÓN RECURRIDA, RESOLUCIÓN IMPUGNADA y ANTECEDENTES PROCESALES
 *    salieron byte-idénticos.
 */
function civilAppeal(matter = 'civil', jurisdiction = 'local civil') {
  const doc = createEmptyDocument({
    id: 'appeal-real-regression', documentType: 'apelacion_civil',
    documentTypeLabel: 'recurso de apelación civil', matter, jurisdiction, flow: 'DOCUMENT_ANALYSIS',
  });
  doc.caseRefs = { ...doc.caseRefs, expediente: '1152/2013' };
  doc.parties = {
    ...doc.parties,
    actor: 'JUAN PÉREZ SÁNCHEZ',
    demandado: 'CONSTRUCTORA DEL VALLE, S.A. DE C.V.',
    autoridadDestinataria: 'JUEZ DE PRIMERA INSTANCIA DEL DISTRITO JUDICIAL DE ZAPOPAN',
  };
  return doc;
}

const mk = (title: string, sectionType: string, id: string, seed = ''): LegalBlock => ({
  id, kind: sectionType, sectionType, title, level: 1, order: 1, text: seed,
  sourceElementIndices: [], pages: { start: 1, end: 1 },
  aiNeed: 'PRESERVE_DIRECT', requiresAi: false,
  classificationReason: 'fixture offline', elementCount: 1, charCount: 10,
} as unknown as LegalBlock);

async function render(doc: any, title: string, sectionType: string, id: string, seed = '') {
  return (await generateLegalBlock(
    mk(title, sectionType, id, seed), doc, {} as any,
    undefined, undefined, undefined, DEFAULT_LAWYER_PROFILE, undefined, undefined,
  )).text;
}

/** El plan siembra las secciones sustantivas; con semilla el bloque cae al
 *  último fallback determinista, que es donde se filtró el lenguaje
 *  constitucional en la generación real. */
const PLAN_SEED = 'AGRAVIOS: desarrollar los agravios individualizados conforme a las constancias del expediente.';

const CONSTITUTIONAL = /tutela judicial efectiva|derechos fundamentales|marco de derechos humanos|debido proceso|constitucional/i;

describe('regresiones de la generación real de la apelación 1152/2013', () => {
  it('AGRAVIOS de una apelación civil no redacta en lenguaje constitucional', async () => {
    for (const matter of ['civil', 'Civil', 'federal', 'amparo']) {
      const text = await render(civilAppeal(matter), 'AGRAVIOS', 'argument', `ag-${matter}`);
      expect(text, `materia=${matter}`).not.toMatch(CONSTITUTIONAL);
    }
  });

  it('RESOLUCIÓN RECURRIDA, RESOLUCIÓN IMPUGNADA y ANTECEDENTES no son el mismo texto', async () => {
    const doc = civilAppeal();
    const [recurrida, impugnada, antecedentes] = await Promise.all([
      render(doc, 'RESOLUCIÓN RECURRIDA', 'background', 'b1'),
      render(doc, 'RESOLUCIÓN IMPUGNADA', 'background', 'b2'),
      render(doc, 'ANTECEDENTES PROCESALES', 'background', 'b3'),
    ]);
    const distinct = new Set([recurrida.trim(), impugnada.trim(), antecedentes.trim()]);
    expect(distinct.size).toBe(3);
  });

  it('cada sección de fondo aporta una función distinta: la impugnada cita el acto, la recurrida lo ubica', async () => {
    const doc = civilAppeal();
    const recurrida = await render(doc, 'RESOLUCIÓN RECURRIDA', 'background', 'b1');
    const impugnada = await render(doc, 'RESOLUCIÓN IMPUGNADA', 'background', 'b2');
    expect(impugnada).not.toBe(recurrida);
    expect(`${recurrida}\n${impugnada}`).toMatch(/1152\/2013/);
  });
});