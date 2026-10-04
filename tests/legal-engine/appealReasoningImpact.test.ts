import { expect, it } from 'vitest';
import { extractAppealResolutionReview, extractAppealReasoningCandidates } from '@/lib/legal-engine/case-extraction/appealResolutionReview';
import { defendantBeneficialDecision, eightConsideringsCivil, familyMixedDecision } from '../fixtures/appealReasoningImpact';

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
    .replace('CONSIDERANDO PRIMERO', 'CONSIDERANDO:\nI.-')
    .replace('CONSIDERANDO SEGUNDO', 'SEGUNDO.-');
  const source = { ...eightConsideringsCivil, id: 'mixed-heading-syntax', pages: [{ ...page, text, chars: text.length }] };
  const result = review(source);
  expect(result.blocks.some(block => block.section === 'CONSIDERANDO I')).toBe(true);
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
