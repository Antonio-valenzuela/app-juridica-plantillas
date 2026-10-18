import { describe, it, expect } from 'vitest';
import { extractAppealResolutionReview } from '@/lib/legal-engine/case-extraction/appealResolutionReview';
import { appealOcrMarginSource } from '../fixtures/appealOcrMarginSource';
describe('phase 1 OCR margins, preserving literal provenance', () => {
  it.each(['12 TRECE DE AGOSTO DEL AÑO 2026 DOS MIL VEINTISEIS', '12 DOCE DE AGOSTO DEL AÑO 2032 DOS MIL TREINTA Y UNO'])('flags numeric/written disagreement without substituting %s', date => {
    const text = `JUZGADO QUINTO\nAUTO: TRÁMITE\nZAPOPAN, JALISCO A ${date}\nVISTOS: autos`;
    const r = extractAppealResolutionReview([{ id: 'date-conflict', pages: [{ page: 1, text, chars: text.length }] }]).resolutions[0];
    expect(r.dateStatus).toBe('CONFIRM_DATE');
    expect(r.dateOrigin?.excerpt).toContain(date);
  });
  it.each(['12 DE AGOSTO DEL AÑO 2026', '12 DE AGOSTO DE 2026', '12 DOCE DE AGOSTO DEL AÑO 2031 DOS MIL TREINTA Y UNO'])('does not claim a contradiction in a readable date: %s', date => {
    const text = `JUZGADO QUINTO\nAUTO: TRÁMITE\nZAPOPAN, JALISCO A ${date}\nVISTOS: autos`;
    expect(extractAppealResolutionReview([{ id: 'readable-date', pages: [{ page: 1, text, chars: text.length }] }]).resolutions[0].dateStatus).toBe('EXTRACTED');
  });
  it('separates operative headings with observed OCR prefixes', () => {
    const r = extractAppealResolutionReview([appealOcrMarginSource]);
    expect(r.resolutions.map(r => [r.type, r.startPage, r.endPage])).toEqual([['AUTO', 1, 1], ['SENTENCIA_DEFINITIVA', 5, 44]]);
  });
  it('joins actors, defendants and court only inside the same header block', () => {
    const r = extractAppealResolutionReview([appealOcrMarginSource]).resolutions.find(r => r.startPage === 5)!;
    expect(r.parties.filter(p => p.role === 'actor').map(p => p.name)).toEqual(['J. ALFA APELLIDO UNO', 'BETA APELLIDO UNO', 'GAMMA APELLIDO UNO', 'J. DELTA APELLIDO UNO']);
    expect(r.parties.filter(p => p.role === 'demandado').map(p => p.name)).toEqual(['PARTE UNO', 'LIC. NOTARIO DOS, NOTARIO PÚBLICO NÚMERO 13 TRECE DE LOCALIDAD', 'DIRECCIÓN DEL ARCHIVO ESTATAL', 'SUCESIÓN TESTAMENTARIA A BIENES DE PERSONA TRES']);
    expect(r.court).toBe('JUZGADO QUINTO EN MATERIA FAMILIAR DEL PRIMER PARTIDO JUDICIAL');
    expect(r.parties.some(p => /CITADA|AJENA/.test(p.name))).toBe(false);
    for (const o of [r.courtOrigin!, ...r.parties.map(p => p.origin)]) {
      const page = appealOcrMarginSource.pages!.find(p => p.page === o.page)!;
      expect(o.start).toBeGreaterThanOrEqual(0);
      expect(page.text.slice(o.start, o.end)).toBe(o.excerpt);
    }
    expect(r.parties[0].origin.excerpt).toContain('IR | UNO. |');
  });
  it('preserves 2926 instead of correcting it to the written year and flags confirmation', () => {
    const r = extractAppealResolutionReview([appealOcrMarginSource]).resolutions.find(r => r.startPage === 1)!;
    expect((r as any)?.dateStatus).toBe('CONFIRM_DATE');
    expect((r as any)?.dateOrigin?.excerpt).toContain('2926 DOS\nE MIL VEINTISEIS');
    expect(r?.date).toContain('2926');
    expect(r?.date).not.toContain('2026');
  });
  it('does not read an illegible handwritten notification or compute a deadline', () => {
    const r = extractAppealResolutionReview([appealOcrMarginSource]);
    expect(r.resolutions[0]?.notification).toBeUndefined();
    expect(r.opportunity).toBe('[A VERIFICAR]');
  });
  it.each([
    'E TESIS CITADA EN LOS CONSIDERANDOS\nE EXPEDIENTE: AJENO\nE JUZGADO NOVENO AJENO\nSE DICTA SENTENCIA DEFINITIVA\nE ACTORES: PERSONA CITADA\nE VISTOS autos de ese precedente.',
    'E CONSIDERANDO SEGUNDO: se transcribe otra resolución.\n- o | AUTO: RESOLUCIÓN CITADA\nE EXPEDIENTE: AJENO\nE JUZGADO NOVENO AJENO\nE ACTORES: PERSONA CITADA\nE Por recibido el escrito ajeno.',
  ])('rejects noisy quoted precedent/resolution, not just its court or parties', text => {
    expect(extractAppealResolutionReview([{ id: 'quoted', pages: [{ page: 9, chars: text.length, text }] }]).resolutions).toEqual([]);
  });
});
