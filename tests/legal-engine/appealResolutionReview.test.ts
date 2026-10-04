import { describe, it, expect } from 'vitest';
import { extractRichCaseAnalysis } from '@/lib/legal-engine/case-extraction/orchestrator';
import { appealResolutionSource } from '../fixtures/appealResolutionSource';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { extractAppealResolutionReview, validateAppealConfirmation, selectAppealSources } from '@/lib/legal-engine/case-extraction/appealResolutionReview';
function review(sources = [appealResolutionSource], documentType = 'apelacion_civil') {
  return (extractRichCaseAnalysis(sources, { documentType } as any) as any).appealResolutionReview;
}
describe('phase 1 appeal resolution extraction', () => {
  it('rejects an unconfirmed real request before reaching even provider-unavailable handling', async () => {
    await expect(runGenerationPipeline({ selectedDocumentType: 'apelacion_civil', sourceDocuments: [appealResolutionSource], requireAppealConfirmation: true, forceAiUnavailable: true } as any)).rejects.toMatchObject({ code: 'NEEDS_USER_INPUT' });
  });
  it('separates auto and final sentence at pages 1 and 5, retaining original ranges', () => {
    expect(review()?.resolutions?.map((r: any) => [r.type, r.startPage, r.endPage, r.date])).toEqual([
      ['AUTO', 1, 1, '12 DOCE DE AGOSTO DEL AÑO 2026'], ['SENTENCIA_DEFINITIVA', 5, 44, '24 VEINTICUATRO DE AGOSTO DE 2026'],
    ]);
  });
  it('reads plural parties from the header, expanding shared surnames, never OCR fragments', () => {
    const r = review()?.resolutions?.[1];
    expect(r?.parties?.filter((p: any) => p.role === 'actor').map((p: any) => p.name)).toEqual(['J. ALFA APELLIDO UNO', 'BETA APELLIDO UNO', 'GAMMA APELLIDO UNO', 'J. DELTA APELLIDO UNO']);
    expect(r?.parties?.filter((p: any) => p.role === 'demandado')).toHaveLength(4);
    expect(r?.court).toBe('JUZGADO QUINTO EN MATERIA FAMILIAR');
    expect(r?.parties?.every((p: any) => p.origin.page === 5 && p.origin.excerpt)).toBe(true);
  });
  it('keeps publication reasons bound to their resolution, with no calculated deadline', () => {
    expect(review()?.resolutions?.map((r: any) => [r.notification?.bulletin, r.notification?.date, r.notification?.origin.page])).toEqual([['120', '13 de agosto de 2026', 1], ['139', '25 de agosto de 2026', 44]]);
    expect(review()?.opportunity).toBe('[A VERIFICAR]');
    expect(review()?.status).toBe('NEEDS_USER_INPUT');
  });
  it('requires confirmation even for a single decision and rejects unsupported page inference', () => {
    const source = { ...appealResolutionSource, pages: appealResolutionSource.pages!.slice(1) };
    expect(review([source])?.status).toBe('NEEDS_USER_INPUT');
    expect(review([{ id: 'unpaged', extractedText: source.pages.map(p => p.text).join('\n') }])?.resolutions).toEqual([]);
  });
  it.each(['contestacion_demanda_civil', 'demanda_amparo_directo', 'apelacion_penal'])('does not introduce the contract into %s', type => {
    expect(review([appealResolutionSource], type)).toBeUndefined();
  });
  it('accepts only an explicit complete confirmation bound to the entire source revision', () => {
    const r = extractAppealResolutionReview([appealResolutionSource]);
    const selected = r.resolutions[1];
    const c = { sourceFingerprint: r.sourceFingerprint, resolutionId: selected.id, parties: selected.parties, representedNames: selected.parties.filter(p => p.role === 'actor').map(p => p.name), recipient: selected.court, notification: '25 de agosto de 2026 · Boletín 139', confirmed: true };
    expect(validateAppealConfirmation(r, c).eligible).toBe(true);
    for (const invalid of [{ ...c, confirmed: false }, { ...c, resolutionId: 'missing' }, { ...c, recipient: '' }, { ...c, notification: '[A CONFIRMAR POR EL ABOGADO]' }, { ...c, representedNames: ['outsider'] }, { ...c, parties: [] }]) {
      expect(validateAppealConfirmation(r, invalid).status).toBe('NEEDS_USER_INPUT');
    }
    const revised = structuredClone(appealResolutionSource);
    revised.pages![2].text += '\nCambio de notificación.';
    expect(validateAppealConfirmation(extractAppealResolutionReview([revised]), c).eligible).toBe(false);
    const scoped = selectAppealSources([appealResolutionSource], selected);
    expect(scoped[0].pages!.map(p => p.page)).toEqual([5, 44]);
    expect(scoped[0].extractedText).not.toContain('SE DESECHA INCIDENTE');
  });
  it('does not manufacture notification from an illegible stamp or court from a quoted thesis', () => {
    const source = structuredClone(appealResolutionSource);
    source.pages![1].text = source.pages![1].text.replace('JUZGADO QUINTO EN MATERIA FAMILIAR', 'ÓRGANO ILEGIBLE');
    source.pages![2].text = 'Notificación: sello ilegible / boleti? 13?';
    const selected = extractAppealResolutionReview([source]).resolutions[1];
    expect(selected.court).toBe('[A CONFIRMAR POR EL ABOGADO]');
    expect(selected.notification).toBeUndefined();
  });
});
