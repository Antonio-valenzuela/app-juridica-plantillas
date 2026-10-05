import { describe, expect, it } from 'vitest';
import { canExportDocumentFinal, canGenerateDocumentDraft, getContestacionesDocumentOptions, getInitialWritingDocumentOptions, getUniversalDocumentTypes } from '@/lib/catalog/legalCatalog';

describe('canonical Contestaciones selector capability', () => {
  it('offers only explicitly declared response-flow outputs and the free-writing mode', () => {
    const ids = getContestacionesDocumentOptions().map((option) => option.value);

    expect(ids).toEqual(['redaccion_libre']);
    expect(ids).not.toContain('contestacion_impedimento');
  });

  it('exposes only implemented development types after explicit draft-only opt-in in all writing surfaces', () => {
    const responseOptions = getContestacionesDocumentOptions({ includeUncertifiedDrafts: true });
    const initialOptions = getInitialWritingDocumentOptions({ includeUncertifiedDrafts: true });
    const universalOptions = getUniversalDocumentTypes({ includeUncertifiedDrafts: true });

    expect(responseOptions.some((option) => option.value === 'contestacion_demanda_civil' && /En desarrollo \(sin certificar\)/i.test(option.label))).toBe(true);
    expect(initialOptions.some((option) => option.value === 'demanda_ordinaria_civil' && /En desarrollo \(sin certificar\)/i.test(option.label))).toBe(true);
    expect(universalOptions.some((option) => option.value === 'contestacion_demanda_civil' && /En desarrollo \(sin certificar\)/i.test(option.label))).toBe(true);
    expect(responseOptions.some((option) => option.value === 'contestacion_impedimento')).toBe(false);
  });

  it('allows unaccredited implemented types only as DRAFT and never exposes them as FINAL', () => {
    expect(canGenerateDocumentDraft('contestacion_demanda_civil', false)).toBe(false);
    expect(canGenerateDocumentDraft('contestacion_demanda_civil', true)).toBe(true);
    expect(canGenerateDocumentDraft('contestacion_impedimento', true)).toBe(false);
    expect(canExportDocumentFinal('contestacion_demanda_civil')).toBe(false);
  });
});
