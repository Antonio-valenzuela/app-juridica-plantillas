import { expect, it } from 'vitest';
import { extractAppealResolutionReview, extractAppealReasoningCandidates } from '@/lib/legal-engine/case-extraction/appealResolutionReview';
import { defendantBeneficialDecision, eightConsideringsCivil, familyMixedDecision } from '../fixtures/appealReasoningImpact';
import { appealRealHeadingSkeleton } from '../fixtures/appealRealHeadingSkeleton';

function review(source: any, representedRole: 'actor' | 'demandado' = 'actor') {
  const sourceReview = extractAppealResolutionReview([source]);
  const resolution = sourceReview.resolutions[0];
  return extractAppealReasoningCandidates([source], {
    documentType: source.id === 'impact-family' ? 'apelacion_familiar' : 'apelacion_civil',
    resolution,
    parties: resolution.parties,
    representedNames: resolution.parties.filter(p => p.role === representedRole).map(p => p.name),
    sourceFingerprint: sourceReview.sourceFingerprint,
  });
}

it('derives an adverse global disposition and classifies at least six adverse findings across eight civil considerations', () => {
  const result = review(eightConsideringsCivil);
  expect((result as any).globalOutcome.impact).toBe('ADVERSE');
  expect((result as any).globalOutcome.appliedRule).toBe(1);
  expect(eightConsideringsCivil.pages![0].text.slice((result as any).globalOutcome.origin.start, (result as any).globalOutcome.origin.end)).toBe((result as any).globalOutcome.origin.excerpt);
  expect(result.reasonings.filter(r => r.impact === 'ADVERSE').length).toBeGreaterThanOrEqual(6);
  expect(result.reasonings.filter((r: any) => r.impact === 'NEUTRAL')).toHaveLength(1);
  expect(result.reasonings.filter(r => r.impact === 'BENEFICIAL')).toHaveLength(1);
  for (const reasoning of result.reasonings) {
    expect(reasoning.decisionOrigin.excerpt).toContain(reasoning.judgeDecision);
    expect((reasoning as any).appliedRule).toBeGreaterThanOrEqual(1);
    expect((reasoning as any).classificationReason).toBeTruthy();
  }
  expect(result.reasonings.some(r => r.judgeDecision.includes('en ese precedente'))).toBe(false);
  expect(result.candidates.some(c => c.judgeDecision.includes('en ese precedente'))).toBe(false);
});

it('handles another matter and structure with both adverse and favorable findings for the represented defendant', () => {
  const result = review(familyMixedDecision, 'demandado');
  expect(result.reasonings.some(r => r.impact === 'ADVERSE')).toBe(true);
  expect(result.reasonings.some(r => r.impact === 'BENEFICIAL')).toBe(true);
  expect(result.candidates.every(c => c.affectedNames.includes('PERSONA BETA'))).toBe(true);
});

it('does not turn rejection of the claimant into an appeal candidate for the represented defendant', () => {
  const result = review(defendantBeneficialDecision, 'demandado');
  expect((result as any).globalOutcome.impact).toBe('BENEFICIAL');
  expect(result.reasonings.every(r => r.impact === 'BENEFICIAL' || r.impact === 'NEUTRAL')).toBe(true);
  expect(result.candidates).toHaveLength(0);
});

it('keeps a considering active when its prose merely mentions the resolutives', () => {
  const page = eightConsideringsCivil.pages![0];
  const text = page.text.replace('Este juzgado determina que el testimonio es insuficiente para demostrar la entrega.', 'Este juzgado determina que el testimonio es insuficiente para demostrar la entrega, aunque los puntos resolutivos se revisen al final.');
  const source = { ...eightConsideringsCivil, pages: [{ ...page, text, chars: text.length }] };
  const result = review(source);
  expect(result.reasonings.some(r => r.decisionOrigin.excerpt.includes('los puntos resolutivos'))).toBe(true);
  expect(result.reasonings.filter(r => r.impact === 'ADVERSE').length).toBeGreaterThanOrEqual(6);
  expect(result.blocks.filter(block => block.section === 'RESOLUTIVOS')).toHaveLength(1);
});

it('assigns the last anchored heading in a same-paragraph VISTOS/CONSIDERANDO sequence', () => {
  const source = { ...eightConsideringsCivil, id: 'same-paragraph-headings' };
  const result = review(source);
  const first = (result as any).blocks.find((block: any) => block.section === 'CONSIDERANDO PRIMERO');
  expect(first).toBeTruthy();
  expect(first.impact).toBe('ADVERSE');
  expect(first.decisionOrigins[0].excerpt).toContain('no se acreditó la entrega');
  expect(first.decisionOrigins[0].page).toBe(5);
});

it('segments mixed Roman and ordinal headings inside one resolution', () => {
  const page = eightConsideringsCivil.pages![0];
  const text = page.text
    .replace('CONSIDERANDO PRIMERO', 'CONSIDERANDO:\nI.- PRIMERA CUESTIÓN')
    .replace('CONSIDERANDO SEGUNDO', 'II.- SEGUNDA CUESTIÓN\nPRIMERO.- PRIMERA CUESTIÓN\nSEGUNDO.-');
  const source = { ...eightConsideringsCivil, id: 'mixed-heading-syntax', pages: [{ ...page, text, chars: text.length }] };
  const result = review(source);
  expect(result.blocks.some(block => block.section === 'CONSIDERANDO I'), JSON.stringify(result.blocks.map(block => block.section))).toBe(true);
  expect(result.blocks.some(block => block.section === 'CONSIDERANDO SEGUNDO')).toBe(true);
});

it('recognizes headings through OCR margin noise without changing their source spans', () => {
  const page = eightConsideringsCivil.pages![0];
  const text = page.text
    .replace('CONSIDERANDO PRIMERO', '- o | CONSIDERANDO PRIMERO')
    .replace('CONSIDERANDO SEGUNDO', 'E - CONSIDERANDO SEGUNDO');
  const source = { ...eightConsideringsCivil, id: 'ocr-noisy-headings', pages: [{ ...page, text, chars: text.length }] };
  const result = review(source);
  const first = result.blocks.find(block => block.section === 'CONSIDERANDO PRIMERO');
  if (!first) throw new Error('La cabecera OCR normalizada no produjo el bloque esperado.');
  expect(source.pages![0].text.slice(first.origin.start, first.origin.end)).toBe(first.origin.excerpt);
});

it('retains form-valid Roman headings across sequence gaps, flags OCR doubt, and keeps full spans', () => {
  const source = {
    id: 'roman-sequence-noise',
    pages: [
      { page: 5, text: [
        'JUZGADO DE PRUEBA', 'SENTENCIA DEFINITIVA', 'ACTORES: PERSONA ALFA', 'DEMANDADOS: PERSONA BETA',
        'LOCALIDAD A 12 DOCE DE AGOSTO DE 2026', 'VISTOS: autos', 'CONSIDERANDOS:',
        'I. PRIMERA CUESTIÓN', 'Este juzgado determina que no se acreditó el hecho inicial.',
      ].join('\n') },
      { page: 6, text: [
        'Continuación literal del primer razonamiento en página seis.',
        'II. SEGUNDA CUESTIÓN', 'Este juzgado determina que la prueba es insuficiente para acreditar el segundo hecho.',
        'III. TERCERA CUESTIÓN', 'Este juzgado declara infundada la tercera pretensión.',
        'VI. SEXTA CUESTIÓN', 'El órgano analiza el planteamiento.',
        'VIL. SÉPTIMA CUESTIÓN', 'Este juzgado concluye que no se acreditó la séptima cuestión.',
        'VII. MARCADOR DUPLICADO POR OCR',
        'C. MARCADOR OCR AISLADO', 'D. MARCADOR OCR AISLADO', 'L. MARCADOR OCR AISLADO',
        'MM. MARCADOR OCR AISLADO', 'DL. MARCADOR OCR AISLADO', 'IC. MARCADOR OCR INVÁLIDO',
      ].join('\n') },
    ],
  } as any;
  const result = review(source);
  const sectionToken = (section: string) => section.replace(/^CONSIDERANDOS?\s+/, '');
  const roman = result.blocks.filter(b => b.kind === 'REASONING' && ['I', 'II', 'III', 'VI', 'VIL', 'VII', 'C', 'D', 'L', 'MM', 'DL', 'IC'].includes(sectionToken(b.section)));
  expect(roman.map(b => sectionToken(b.section))).toEqual(['I', 'II', 'III', 'VI', 'VIL', 'VII', 'C', 'D', 'L', 'MM', 'DL']);
  const doubtful = roman.find(b => sectionToken(b.section) === 'VIL') as any;
  expect(doubtful).toMatchObject({ canonicalSection: 'CONSIDERANDOS VII', ocrReadingDoubtful: true });
  expect(roman.find(b => sectionToken(b.section) === 'VII')).toMatchObject({ canonicalSection: 'CONSIDERANDOS VIII', ocrReadingDoubtful: true });
  expect(result.blocks.some(b => b.kind === 'OTHER' && b.unrecognizedContinuation && b.origin.excerpt.startsWith('IC.'))).toBe(true);
  const first = result.blocks.find(b => sectionToken(b.section) === 'I') as any;
  expect(first.pages).toEqual([5, 6]);
  expect(first.sourceSpans.map((span: any) => span.page)).toEqual([5, 6]);
  expect(first.sourceSpans.every((span: any) => source.pages.find((p: any) => p.page === span.page).text.slice(span.start, span.end) === span.excerpt)).toBe(true);
  expect(first.sourceText).toContain('Continuación literal del primer razonamiento en página seis.');
});

it('accepts ordinal operative headings only where the sequence is coherent, including feminine compounds', () => {
  const text = [
    'JUZGADO DE PRUEBA', 'SENTENCIA DEFINITIVA', 'ACTORES: PERSONA ALFA', 'DEMANDADOS: PERSONA BETA',
    'LOCALIDAD A 12 DOCE DE AGOSTO DE 2026', 'VISTOS: autos', 'PROPOSICIONES:',
    'PRIMERA. Se tiene por presentado el escrito.', 'SEGUNDA. Se resuelve el primer punto.',
    'TERCERA. Se resuelve el segundo punto.', 'DECIMA QUINTA. Se resuelve el punto quince.',
    'DÉCIMA SEXTA. Se resuelve el punto dieciséis.', 'DÉCIMA SÉPTIMA. Se resuelve el punto diecisiete.',
    'DÉCIMA OCTAVA. Se resuelve el punto dieciocho.', 'DÉCIMA NOVENA. Se resuelve el punto diecinueve.',
    'VIGÉSIMA. Se ordena notificar.', 'C. MARCADOR AISLADO',
  ].join('\n');
  const source = { id: 'ordinal-sequence', pages: [{ page: 5, text, chars: text.length }] } as any;
  const result = review(source);
  const operativeItems = result.blocks.filter(b => b.kind === 'OPERATIVE').map(b => b.section);
  expect(operativeItems).toEqual(expect.arrayContaining([
    'PRIMERA', 'SEGUNDA', 'TERCERA', 'DECIMA QUINTA', 'DECIMA SEXTA',
    'DECIMA SEPTIMA', 'DECIMA OCTAVA', 'DECIMA NOVENA', 'VIGESIMA',
  ]));
  expect(operativeItems).not.toContain('C');
  expect(result.blocks.find(b => b.section === 'PROPOSICIONES')).toMatchObject({ kind: 'OPERATIVE', pages: [5] } as any);
});

it('keeps a prose sentence beginning with “Por tanto,” inside its considering block', () => {
  const page = eightConsideringsCivil.pages![0];
  const prose = 'Por tanto, este juzgado determina que la parte actora no acreditó la entrega del bien reclamado.';
  const text = page.text.replace('CONSIDERANDO PRIMERO', `CONSIDERANDO PRIMERO\n${prose}`);
  const source = { ...eightConsideringsCivil, id: 'prose-por-tanto', pages: [{ ...page, text, chars: text.length }] };
  const result = review(source);
  expect(result.blocks.some(block => block.section === 'POR TANTO')).toBe(false);
  expect(result.reasonings.some(reasoning => reasoning.section === 'CONSIDERANDO PRIMERO' && reasoning.judgeDecision.includes('no acreditó la entrega del bien reclamado'))).toBe(true);
  expect(result.globalOutcome.findings.some(finding => finding.origin.excerpt.includes('no acreditó la entrega del bien reclamado'))).toBe(false);
});

it('does not label rejection of a procedural bar adverse when the same finding advances the claimant to merits review', () => {
  const page = defendantBeneficialDecision.pages![0];
  const text = page.text.replace('RESOLUTIVOS', 'Este juzgado determina que no se actualiza la cosa juzgada y procede al estudio de la acción intentada.\n\nRESOLUTIVOS');
  const source = { ...defendantBeneficialDecision, pages: [{ ...page, text, chars: text.length }] };
  const result = review(source, 'actor');
  const reasoning = result.reasonings.find(r => r.judgeDecision.includes('cosa juzgada'));
  expect(reasoning?.impact).toBe('BENEFICIAL');
  expect(result.candidates.some(c => c.reasoningId === reasoning?.id)).toBe(false);
});

function reviewRealHeadingSkeleton(source = appealRealHeadingSkeleton) {
  const partyOrigin = { sourceId: source.id, page: 5, start: 0, end: 0, excerpt: '' };
  const resolution = {
    id: 'confirmed-real-ocr-resolution', sourceId: source.id, type: 'SENTENCIA_DEFINITIVA', date: '', court: '',
    startPage: 5, endPage: 44, parties: [{ role: 'actor', name: 'PERSONA REPRESENTADA', origin: partyOrigin }],
  } as any;
  const result = extractAppealResolutionReview([source]);
  const candidates = extractAppealReasoningCandidates([source], {
    documentType: 'apelacion_civil', resolution,
    parties: resolution.parties, representedNames: ['PERSONA REPRESENTADA'], sourceFingerprint: result.sourceFingerprint,
  });
  return candidates;
}

const realSkeletonBlock = (section: string) => reviewRealHeadingSkeleton().blocks.find(item => item.section === section);

it('recognizes the real OCR split “VISTO S” header without altering its source page', () => {
  expect(realSkeletonBlock('VISTOS')?.origin.page).toBe(5);
});

it('promotes real Roman all-caps title headers to reasoning blocks without a mother header', () => {
  for (const section of ['V', 'VI', 'VIL', 'X', 'XII', 'XIII', 'XVI', 'XIX', 'XX', 'XXI', 'XXIV']) {
    expect(realSkeletonBlock(section)?.kind, `Expected real OCR header ${section} to be a reasoning block`).toBe('REASONING');
  }
  const doubtful = realSkeletonBlock('VIL') as any;
  expect(doubtful).toMatchObject({ canonicalSection: 'VII', ocrReadingDoubtful: true });
  expect(realSkeletonBlock('VII')).toMatchObject({ canonicalSection: 'VIII', ocrReadingDoubtful: true });
  expect(realSkeletonBlock('XV')?.kind).toBe('REASONING');
});

it('recognizes the real feminine and compound ordinal sequence as operative blocks', () => {
  for (const section of ['SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SEPTIMA', 'OCTAVA', 'DECIMA CUARTA', 'DECIMA SEXTA', 'DECIMA SEPTIMA', 'DECIMA OCTAVA', 'DECIMA NOVENA', 'VIGESIMA']) {
    expect(realSkeletonBlock(section)?.kind, `Expected real OCR ordinal ${section} to be operative`).toBe('OPERATIVE');
  }
});

it('cites the real operative disposition and derives the global outcome from page 42', () => {
  const candidates = reviewRealHeadingSkeleton();
  expect(candidates.globalOutcome.impact).toBe('ADVERSE');
  expect(candidates.globalOutcome.origin?.page).toBe(42);
  expect(candidates.globalOutcome.origin?.excerpt).toContain('se declara IMPROCEDENTE la acción');
});

it('uses PROPOSICIONES as an operative-section heading without allowing prose “Por tanto,” to do so', () => {
  const page = { page: 1, text: 'PROPOSICIONES:\nPRIMERA. Se declara infundada la acción.', chars: 54 };
  const source = { ...appealRealHeadingSkeleton, id: 'proposiciones-operative-smoke', pages: [page] };
  const partyOrigin = { sourceId: source.id, page: 1, start: 0, end: 0, excerpt: '' };
  const resolution = { id: 'confirmed-propositions', sourceId: source.id, startPage: 1, endPage: 1, parties: [{ role: 'actor', name: 'PERSONA REPRESENTADA', origin: partyOrigin }] } as any;
  const review = extractAppealReasoningCandidates([source], {
    documentType: 'apelacion_civil', resolution, parties: resolution.parties,
    representedNames: ['PERSONA REPRESENTADA'], sourceFingerprint: 'fixture-proposiciones',
  });
  expect(review.blocks.some(block => block.section === 'PROPOSICIONES' && block.kind === 'OPERATIVE')).toBe(true);
  expect(review.globalOutcome.impact).toBe('ADVERSE');
});

it('normalizes user-identified spaced-letter header forms while preserving their source spans', () => {
  const text = [
    'C O N S I D E R A N D O S:',
    'I.- Este juzgado determina que la acción es infundada.',
    'R E S U L T A N D O y C O N S I D E R A N D O:',
    'II.- Este juzgado determina que la actora no acreditó el hecho.',
    'P R O P O S I C I O N E S:',
    'PRIMERA. Se declara infundada la acción.',
  ].join('\n');
  const source = { ...appealRealHeadingSkeleton, id: 'spaced-letter-heading-regression', pages: [{ page: 5, text, chars: text.length }] };
  const review = reviewRealHeadingSkeleton(source);
  expect(review.blocks.some(block => block.section === 'CONSIDERANDOS' && block.kind === 'REASONING')).toBe(true);
  expect(review.blocks.some(block => block.section === 'PROPOSICIONES' && block.kind === 'OPERATIVE')).toBe(true);
  expect(review.blocks.every(block => source.pages[0].text.slice(block.origin.start, block.origin.end) === block.origin.excerpt)).toBe(true);
  expect(review.globalOutcome.impact).toBe('ADVERSE');
});

it('keeps OCR Roman headings by form, uses sequence only to annotate ambiguity, and separates an unrecognized tail', () => {
  const pages = [
    { page: 14, text: [
      'CONSIDERANDOS:',
      'VI. CARGA DE LA PRUEBA.',
      'Motivo suficientemente extenso para conservar el bloque.',
      'VIL. CAPACIDAD DE LA TESTADORA.',
      'La lectura OCR de este numeral requiere confirmación.',
      'VII. ALCANCE DE LA PRUEBA TESTIMONIAL.',
      'Este razonamiento continúa en el mismo documento.',
      '1X. VALORACIÓN DE LAS CONSTANCIAS.',
      'La secuencia siguiente también requiere revisión.',
      'Y. EFECTOS DE LA RESOLUCIÓN.',
      'La sustitución OCR V/Y no altera el texto fuente.',
    ].join('\n'), chars: 0 },
    { page: 38, text: [
      'XXIV. SOBRE EL TESTAMENTO COMO ACTO SOLEMNE.',
      'El razonamiento concluye con una valoración probatoria.',
      'XV. SOBRE EL CRITERIO RELATIVO A LA CAPACIDAD DEL TESTADOR.',
      'L PODER JUDICIAL DEL ESTADO DE JALISCO',
    ].join('\n'), chars: 0 },
    { page: 40, text: [
      'XXV. título OCR con caja inconsistente.',
      'Conclusión final sin cabecera legible.',
    ].join('\n'), chars: 0 },
    { page: 41, text: '1 : PODER JUDICIAL DEL ESTADO DE JALISCO', chars: 0 },
  ];
  const source = { ...appealRealHeadingSkeleton, id: 'roman-form-ocr-regression', pages };
  const result = reviewRealHeadingSkeleton(source);
  const sections = result.blocks.filter(block => block.kind === 'REASONING');
  const block = (section: string) => sections.find(item => item.section === section || item.section.endsWith(` ${section}`));

  expect(block('VIL')).toMatchObject({ canonicalSection: 'CONSIDERANDOS VII', ocrReadingDoubtful: true });
  expect(block('VII')).toMatchObject({ canonicalSection: 'CONSIDERANDOS VIII', ocrReadingDoubtful: true });
  expect(block('1X')).toMatchObject({ canonicalSection: 'CONSIDERANDOS IX', ocrReadingDoubtful: true });
  expect(block('Y')).toMatchObject({ canonicalSection: 'CONSIDERANDOS V', ocrReadingDoubtful: true });
  expect(block('XV')).toMatchObject({ section: 'CONSIDERANDOS XV', ocrReadingDoubtful: true });
  expect(block('XXIV')?.pages).not.toContain(40);
  expect(result.blocks.some(item => item.unrecognizedContinuation && item.kind === 'OTHER' && item.pages.includes(40))).toBe(true);
  expect(result.blocks.some(item => item.section.includes('PODER JUDICIAL'))).toBe(false);
  expect(result.blocks.some(item => item.kind === 'REASONING' && item.section === '1')).toBe(false);
  for (const item of result.blocks) {
    for (const span of item.sourceSpans) {
      expect(pages.find(page => page.page === span.page)?.text.slice(span.start, span.end)).toBe(span.excerpt);
    }
  }
});

it('recognizes real OCR margin debris before Roman headings without changing source spans', () => {
  const pages = [{ page: 11, text: [
    'ñ - 1 IV.- FIJACIÓN DE LA LITIS.',
    'La controversia queda delimitada por la resolución.',
    'ÓN E - XI. SOBRE LA SUPUESTA COACCIÓN, AMENAZA, DOLO Y MANIPULACIÓN.',
    'Se revisa el planteamiento a partir de las constancias.',
    '1 XIV. SOBRE EL ARTÍCULO 2847 DEL CÓDIGO CIVIL.',
    'La disposición se atribuye a la resolución fuente.',
    'ue : - XV. SOBRE LA IDENTIFICACIÓN VENCIDA.',
    'El encabezado conserva la procedencia OCR.',
    '- To XVII. VALOR DEL INSTRUMENTO NOTARIAL.',
    'El bloque conserva su texto de origen.',
    'Ma XVIII. SOBRE LA TESIS INVOCADA CON REGISTRO DIGITAL.',
    'La cita permanece SOURCE_CITED.',
    'ES - XXVI. SOBRE LA PRETENSIÓN DE CANCELACIÓN DEL REGISTRO.',
    'La conclusión conserva procedencia.',
    'IV. Que se haga conforme a las prescripciones de la ley.',
    'II.10.C. 3/13, página 47.',
  ].join('\n'), chars: 0 }];
  const source = { ...appealRealHeadingSkeleton, id: 'ocr-margin-header-regression', pages };
  const result = reviewRealHeadingSkeleton(source);
  for (const token of ['IV', 'XI', 'XIV', 'XV', 'XVII', 'XVIII', 'XXVI']) {
    const block = result.blocks.find(item => item.kind === 'REASONING' && (item.section === token || item.section.endsWith(` ${token}`)));
    expect(block, `expected noisy OCR heading ${token} to be recognized`).toBeDefined();
    expect(block?.origin.excerpt).toContain(token);
    expect(pages[0].text.slice(block!.origin.start, block!.origin.end)).toBe(block!.origin.excerpt);
  }
  expect(result.blocks.some(item => item.section === '1')).toBe(false);
  expect(result.blocks.some(item => item.origin.excerpt.includes('Que se haga conforme'))).toBe(false);
  expect(result.blocks.some(item => item.origin.excerpt.includes('II.10.C.'))).toBe(false);
});

it('marks the final reasoning block when its trailing text continues before the operative section', () => {
  const pages = [
    { page: 5, text: 'CONSIDERANDOS:\nI. VALORACIÓN DE LAS CONSTANCIAS.', chars: 0 },
    { page: 6, text: 'La conclusión continúa después del último encabezado de razonamiento.', chars: 0 },
    { page: 7, text: 'PROPOSICIONES:\nPRIMERA. Notifíquese.', chars: 0 },
  ];
  const result = reviewRealHeadingSkeleton({ ...appealRealHeadingSkeleton, id: 'trailing-reasoning-continuation', pages });
  const finalReasoning = result.blocks.filter(item => item.kind === 'REASONING').at(-1);
  expect(finalReasoning?.pages).toContain(6);
  expect(finalReasoning?.unrecognizedContinuation).toBe(true);
});
