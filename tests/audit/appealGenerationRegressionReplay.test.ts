import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { evaluateGeneratedLegalAdmission as admissionBefore } from '../fixtures/legacy/generatedLegalAdmissionBefore';
import { evaluateGeneratedLegalAdmission as admissionAfter } from '@/lib/legal-engine/generatedLegalAdmission';
import { generateLegalBlock } from '@/lib/legal-engine/pipeline';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';
import type { LegalBlock } from '@/lib/legal-engine/blockPlanner';

/**
 * REPLAY OFFLINE. No invoca ningún proveedor: los candidatos de entrada son
 * los mismos para ambas admisiones, de modo que la comparación aísla
 * exactamente el cambio de contrato (sección completa → proposición).
 *
 * El módulo `legacy` es el archivo literal de generatedLegalAdmission.ts en
 * el commit 1b530c7, donde `pendingText` reemplazaba la sección entera.
 */

const document_ = () => {
  const doc = createEmptyDocument({
    id: 'replay-apelacion-1152-2013', documentType: 'apelacion_civil',
    documentTypeLabel: 'recurso de apelación civil', matter: 'civil',
    jurisdiction: 'local civil', flow: 'DOCUMENT_ANALYSIS',
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

const CANDIDATES: Array<{ title: string; sectionType: string; text: string }> = [
  {
    title: 'RESOLUCIÓN RECURRIDA', sectionType: 'background',
    text: 'La resolución recurrida fue dictada dentro del expediente 1152/2013 por el Juzgado de Primera Instancia competente en materia civil. La parte apelante sostiene que dicha resolución no tomó en cuenta el contrato de arrendamiento que obra en autos. De las constancias se advierte que el contrato fue presentado oportunamente.',
  },
  {
    title: 'ANTECEDENTES PROCESALES', sectionType: 'background',
    text: 'Los antecedentes procesales relevantes para resolver la controversia son los que constan en las actuaciones. La parte apelante sostiene que la autoridad omitió contestar dos agravios planteados en su escrito de respuesta. El expediente contiene la constancia de presentación de esos agravios.',
  },
  {
    title: 'CONSIDERACIONES COMBATIDAS', sectionType: 'custom',
    text: 'La autoridad sostuvo que la prueba documental no acreditaba el adeudo. La parte apelante sostiene que tal consideración es incongruente con las constancias. Existe incongruencia entre tener por acreditado el contrato y desestimar el adeudo derivado de él. Esta contradicción resulta relevante porque resuelve el fondo de la controversy.',
  },
  {
    title: 'AGRAVIOS', sectionType: 'argument',
    text: 'AGRAVIO PRIMERO. La resolución recurrida omitió pronunciarse sobre la prueba documental presentada oportunamente por la parte apelante. De las constancias de autos se advierte que la documental fue ofrecida dentro del plazo correspondiente. La parte apelante sostiene que la autoridad no tuvo por considerar dicho medio de prueba al resolver. Existe incongruencia entre considerar la prueba en el procedimiento y omitir su valoración en la sentencia. Esta contradicción resulta relevante porque la resolución se emitió sin agotar la vía probatoria abierta. Por lo tanto, la resolución presenta una falta de exhaustividad respecto de una cuestión procesal relevante. El artículo 421 del Código de Procedimientos Civiles establece que la autoridad debe pronunciarse sobre los medios de prueba ofrecidos en tiempo y forma. AGRAVIO SEGUNDO. La resolución recurrida no motivó la valoración de la prueba conforme a las reglas generales del ordenamiento jurídico.',
  },
  {
    title: 'PROCEDENCIA Y OPORTUNIDAD', sectionType: 'legal_grounds',
    text: 'El recurso se interpone dentro del término legal contado a partir de la notificación de la resolución. La notificación consta en autos con fecha 14 de marzo de 2026. El artículo 522 del Código de Procedimientos Civiles dispone que el término para apelar es de cinco días.',
  },
  {
    title: 'FUNDAMENTACIÓN / CRITERIOS VERIFICADOS', sectionType: 'legal_grounds',
    text: 'La jurisprudencia 1a./XX/2014 ha señalado que la omisión de un medio de prueba relevante genera inconformidad de la sentencia. Dicho criterio jurisprudencial establece que la sentencia que no analiza la prueba ofrecida carece de exhaustividad. La parte apelante sostiene que dicho criterio resulta aplicable al caso.',
  },
  {
    title: 'EFECTOS SOLICITADOS A LA ALZADA', sectionType: 'custom',
    text: 'La parte apelante solicita que se revoque la resolución recurrida y se dicte sentencia que resuelva conforme a las constancias. Se solicita condenar a la demandada al pago de costas.',
  },
  {
    title: 'PUNTOS PETITORIOS', sectionType: 'petition',
    text: 'PRIMERO. Tener por presentado el presente escrito. SEGUNDO. Se solicita revocar la resolución recurrida. TERCERO. Se solicita absolver a la parte demandada de las prestaciones reclamadas.',
  },
];

const words = (value: string) => (value.match(/[\p{L}\p{N}]+/gu) || []).length;
const AMPARO_ONLY = /amparo|garant[ií]as fundamentales|tutela judicial efectiva|concepto de violaci[óo]n|acto reclamado|medio de defensa|tribunal colegiado|juzgado de distrito/i;

function metricsFor(admission: typeof admissionBefore | typeof admissionAfter, doc: any) {
  let cumulativeText = '';
  const sections = CANDIDATES.map(candidate => {
    const result: any = admission({ text: candidate.text, sectionType: candidate.sectionType, document: doc });
    // El motor anterior sólo sustituía el texto cuando `accepted` era falso;
    // `pendingText` era siempre el marcador literal.
    const text = (result.accepted ? candidate.text : result.pendingText) as string;
    cumulativeText += `${text}\n\n`;
    // Una sección queda anulada cuando el motor la reduce a un marcador. El
    // contrato anterior lo hacía SIEMPRE; el nuevo lo hace sólo cuando nada
    // sobrevive. Se mide por pérdida de substance, no por el rótulo.
    const wholeSectionPending = !result.accepted && words(text) <= words(candidate.text) * 0.6;
    return {
      title: candidate.title,
      inputWords: words(candidate.text),
      outputWords: words(text),
      reasons: (result.reasons as string[]) ?? [],
      rejectedWords: (result.rejectedWords as number) ?? 0,
      wholeSectionPending,
      granularPending: /\[PENDIENTE DE DESARROLLO/.test(text) && !wholeSectionPending,
      substantive: words(text) > 40 && !wholeSectionPending,
    };
  });
  const stripMarkers = (value: string) => value.replace(/\[[^\]]*\]/g, ' ');
  return {
    totalSections: sections.length,
    substantiveSections: sections.filter(section => section.substantive).length,
    wholeSectionPendings: sections.filter(section => section.wholeSectionPending).length,
    granularPendings: sections.filter(section => section.granularPending).length,
    admittedWords: sections.reduce((sum, section) => sum + section.outputWords, 0),
    // Palabras de desarrollo realmente conservadas, sin contar los marcadores.
    preservedReasoningWords: words(stripMarkers(cumulativeText)),
    rejectedWords: sections.reduce((sum, section) => sum + section.rejectedWords, 0),
    sections,
  };
}

describe('REPLAY OFFLINE de la regresión de generación — Apelación Civil 1152/2013', () => {
  const doc = document_();
  const before = metricsFor(admissionBefore, doc as any);
  const after = metricsFor(admissionAfter, doc as any);

  it('el contrato anterior convertía secciones completas en un único marcador', () => {
    // El artefacto histórico: un solo motivo basketa por toda la sección.
    expect(before.wholeSectionPendings).toBeGreaterThan(0);
    for (const section of before.sections.filter(candidate => candidate.wholeSectionPending)) {
      expect(section.outputWords).toBeLessThan(section.inputWords);
    }
  });

  it('la admisión granular conserva el desarrollo y reduce las secciones anuladas', () => {
    expect(after.wholeSectionPendings).toBeLessThan(before.wholeSectionPendings);
    expect(after.admittedWords).toBeGreaterThan(before.admittedWords);
  });

  it('recupera el agravio: conserva el silogismo y suspende sólo el fundamento no verificado', () => {
    const agravios = after.sections.find(section => section.title === 'AGRAVIOS')!;
    expect(agravios.substantive).toBe(true);
    expect(agravios.wholeSectionPending).toBe(false);
    expect(agravios.reasons).toContain('UNVERIFIED_LEGAL_ASSERTION');
  });

  it('no inventa evidencia ni peticiones', () => {
    const petitorios = after.sections.find(section => section.title === 'PUNTOS PETITORIOS')!;
    expect(petitorios.reasons).toContain('UNSUPPORTED_PETITION');
    const efectos = after.sections.find(section => section.title === 'EFECTOS SOLICITADOS A LA ALZADA')!;
    expect(efectos.reasons).toContain('UNSUPPORTED_PETITION');
  });

  it('las secciones de identidad del recurso ya no se repiten', async () => {
    const render = async (title: string, id: string) => {
      const block = {
        id, kind: 'identity', sectionType: 'identity', title, level: 1, order: 1, text: '',
        sourceElementIndices: [], pages: { start: 1, end: 1 }, aiNeed: 'PRESERVE_DIRECT', requiresAi: false,
        classificationReason: 'replay', elementCount: 1, charCount: 10,
      } as unknown as LegalBlock;
      return (await generateLegalBlock(block, document_(), {} as any, undefined, undefined, undefined, DEFAULT_LAWYER_PROFILE, undefined, undefined)).text;
    };
    const texts = await Promise.all([
      render('PROEMIO', 'a'), render('IDENTIFICACIÓN DEL ASUNTO', 'b'), render('COMPARECENCIA Y PERSONALIDAD', 'c'),
    ]);
    const duplicated = new Set(texts.map(text => text.trim())).size !== texts.length;
    const contamination = texts.filter(text => AMPARO_ONLY.test(text)).length;
    const report = { duplicatedProemio: duplicated, amparoContamination: contamination, texts };

    mkdirSync('audit/legal-generation-quality-recovery/appeal-replay', { recursive: true });
    writeFileSync('audit/legal-generation-quality-recovery/appeal-replay/report.json', JSON.stringify({
      scope: 'OFFLINE_REPLAY_NOT_GENERATION',
      expediente: '1152/2013', documentType: 'apelacion_civil',
      before, after, identitySections: report,
    }, null, 2));

    expect(report.duplicatedProemio).toBe(false);
    expect(report.amparoContamination).toBe(0);
  });
});