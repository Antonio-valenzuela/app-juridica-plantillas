import { expect, it } from 'vitest';
import * as extraction from '@/lib/legal-engine/case-extraction/appealResolutionReview';
import { civilReasoningSource, familyReasoningSource } from '../fixtures/appealReasoningSources';
function run(source = civilReasoningSource, role: 'actor' | 'demandado' = 'actor') {
  const review = extraction.extractAppealResolutionReview([source]);
  const resolution = review.resolutions[0];
  const api = (extraction as any).extractAppealReasoningCandidates;
  expect(typeof api, 'Missing phase-2 reasoning extraction contract').toBe('function');
  return api([source], { documentType: role === 'actor' ? 'apelacion_civil' : 'apelacion_familiar', resolution, parties: resolution.parties, representedNames: resolution.parties.filter(p => p.role === role).map(p => p.name), sourceFingerprint: review.sourceFingerprint });
}
it('discovers exactly two adverse candidate decisions, never the beneficial one', () => {
  const r = run();
  expect(r.candidates).toHaveLength(2);
  expect(r.candidates.map((c: any) => c.judgeDecision)).toEqual([
    'Este juzgado declara improcedente la reclamación de los actores porque no acreditaron la entrega.',
    'Se desestima la objeción de los actores relativa a la falta de transcripción; no existe obligación de transcribir los conceptos, según la tesis de rubro «TRANSCRIPCIÓN DE CONCEPTOS».',
  ]);
  expect(r.reasonings.some((r: any) => r.impact === 'BENEFICIAL')).toBe(true);
  expect(r.candidates.every((c: any) => c.affectedNames.join() === 'PERSONA ALFA')).toBe(true);
});
it('discovers a different family numbered decision affecting the represented defendant', () => {
  const r = run(familyReasoningSource, 'demandado');
  expect(r.candidates).toHaveLength(1);
  expect(r.candidates[0].judgeDecision).toBe('Se condena al demandado al pago de alimentos porque consta la obligación reconocida.');
  expect(r.candidates[0].affectedNames).toEqual(['PERSONA BETA']);
});
it('keeps original spans, separates allegation/record/judicial finding and attributes cited authorities without verification', () => {
  const r = run();
  expect(r.statements.map((s: any) => s.kind)).toEqual(expect.arrayContaining(['ALLEGATION', 'RECORD_REFERENCE', 'JUDICIAL_FINDING']));
  for (const item of [...r.statements, ...r.reasonings, ...r.candidates]) {
    const o = item.origin;
    expect(o.sourceId).toBe('civil-reasons'); expect(o.page).toBe(5);
    expect(civilReasoningSource.pages![0].text.slice(o.start, o.end)).toBe(o.excerpt);
    expect(item.resolutionId).toBe(r.resolutionId);
  }
  const citations = r.candidates.flatMap((c: any) => c.authorities);
  expect(citations.some((c: any) => c.text.includes('artículo 10'))).toBe(true);
  expect(citations.every((c: any) => c.status === 'SOURCE_CITED' && c.officiallyVerified === false)).toBe(true);
  expect(r.candidates.every((c: any) => c.legalSupport === 'sin soporte')).toBe(true);
});
it('exposes a refuted objection as weak and excludes the standalone cited thesis', () => {
  const r = run();
  expect(r.candidates.find((c: any) => c.judgeDecision.includes('transcripción')).weakness).toBe('débil');
  expect(r.candidates.some((c: any) => c.judgeDecision.includes('en ese precedente'))).toBe(false);
});
it('does not manufacture prejudice for an unknown represented party', () => {
  const review = extraction.extractAppealResolutionReview([civilReasoningSource]);
  const api = (extraction as any).extractAppealReasoningCandidates;
  expect(typeof api).toBe('function');
  expect(api([civilReasoningSource], { documentType: 'apelacion_civil', resolution: review.resolutions[0], parties: review.resolutions[0].parties, representedNames: ['PERSONA AJENA'], sourceFingerprint: review.sourceFingerprint }).candidates).toEqual([]);
});
it('does not attribute a litigant citation to the judge, even in the same paragraph', () => {
  const text = civilReasoningSource.pages![0].text.split('VISTOS: autos')[0] + 'VISTOS: autos\nCONSIDERANDO SEGUNDO\nLa parte actora invoca el artículo 99 del ordenamiento. Este juzgado declara improcedente la reclamación de los actores porque no acreditaron la entrega.';
  const source = { ...civilReasoningSource, pages: [{ page: 5, text, chars: text.length }] };
  const r = run(source);
  expect(r.candidates).toHaveLength(1);
  expect(r.candidates[0].authorities).toEqual([]);
});
it('keeps a brief literal quote and the full decision span for an extensive reasoning', () => {
  const decision = 'Este juzgado declara improcedente la reclamación de los actores porque no acreditaron la entrega ' + 'con las constancias documentales que fueron descritas en este considerando, '.repeat(8) + 'ni su recepción.';
  const text = civilReasoningSource.pages![0].text.split('VISTOS: autos')[0] + `VISTOS: autos\nCONSIDERANDO SEGUNDO\n${decision}`;
  const r = run({ ...civilReasoningSource, pages: [{ page: 5, text, chars: text.length }] });
  expect(r.candidates).toHaveLength(1);
  expect(r.candidates[0].origin.excerpt.length).toBeLessThanOrEqual(360);
  const o = r.candidates[0].decisionOrigin;
  expect(text.slice(o.start, o.end)).toBe(decision);
  expect(r.candidates[0].judgeDecision).toBe(decision);
});
it.each(['contestacion_demanda_civil', 'demanda_amparo_directo', 'apelacion_penal'])('does not discover candidates outside the civil/family appeal boundary: %s', documentType => {
  const review = extraction.extractAppealResolutionReview([civilReasoningSource]);
  const api = (extraction as any).extractAppealReasoningCandidates;
  expect(api([civilReasoningSource], { documentType, resolution: review.resolutions[0], parties: review.resolutions[0].parties, representedNames: ['PERSONA ALFA'], sourceFingerprint: review.sourceFingerprint }).candidates).toEqual([]);
});
it('changes the candidate set and binding when representation switches to the defendant', () => {
  const actors = run(); const defendants = run(civilReasoningSource, 'demandado');
  expect(defendants.bindingKey).not.toBe(actors.bindingKey);
  expect(defendants.candidates).toHaveLength(1);
  expect(defendants.candidates[0].judgeDecision).toContain('declara procedente');
  expect(defendants.candidates[0].affectedNames).toEqual(['PERSONA BETA']);
});
