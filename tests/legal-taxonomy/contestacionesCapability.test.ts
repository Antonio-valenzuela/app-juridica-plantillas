import { describe, expect, it } from 'vitest';
import {
  CANONICAL_DOCUMENT_TYPES,
  canExportDocumentFinal,
  canGenerateDocumentDraft,
  getCatalogDocument,
  getContestacionesDeclaredDocumentTypes,
  getContestacionesDocumentOptions,
  getInitialWritingDocumentOptions,
  getUniversalDocumentTypes,
} from '@/lib/catalog/legalCatalog';

// Política vigente: functionalStatus se calcula con evidencia por ID (PASS) y NO equivale a certificación jurídica:
// humanReview sigue PENDING y FINAL permanece bloqueado. Hoy todo tipo IMPLEMENTED tiene evidencia (PASS); los
// tipos que el producto no puede generar (formulario oficial / borrador asistido) son FAIL y nunca se ofrecen.
describe('canonical Contestaciones selector capability', () => {
  it('offers only explicitly declared response-flow outputs and the free-writing mode', () => {
    const ids = getContestacionesDocumentOptions().map((option) => option.value);
    const declared = new Set(getContestacionesDeclaredDocumentTypes().map((entry) => entry.id));

    expect(ids).toContain('redaccion_libre');
    for (const id of ids.filter((value) => value !== 'redaccion_libre')) {
      expect(declared.has(id), id).toBe(true);
      const type = getCatalogDocument(id);
      expect(type?.kind === 'DOCUMENT_TYPE' ? type.functionalStatus : null, id).toBe('PASS');
    }
    expect(ids.filter((value) => value !== 'redaccion_libre')).toHaveLength(
      getContestacionesDeclaredDocumentTypes().filter((entry) => { const type = getCatalogDocument(entry.id); return type?.kind === 'DOCUMENT_TYPE' && type.functionalStatus === 'PASS' && type.implemented; }).length,
    );
    expect(ids).not.toContain('contestacion_impedimento');
  });

  it('exposes only implemented types, labels only the unproven as in development, in all writing surfaces', () => {
    const responseOptions = getContestacionesDocumentOptions({ includeUncertifiedDrafts: true });
    const initialOptions = getInitialWritingDocumentOptions({ includeUncertifiedDrafts: true });
    const universalOptions = getUniversalDocumentTypes({ includeUncertifiedDrafts: true });

    for (const option of [...responseOptions, ...initialOptions, ...universalOptions]) {
      const entry = getCatalogDocument(option.value);
      const target = entry?.kind === 'LEGACY_ALIAS' ? getCatalogDocument(entry.targetId) : entry;
      if (option.value === 'redaccion_libre') continue;
      expect(target?.kind === 'DOCUMENT_TYPE' && target.status, option.value).toBe('IMPLEMENTED');
      // La etiqueta «En desarrollo» solo corresponde a un tipo sin evidencia funcional.
      expect(/En desarrollo \(sin certificar\)/i.test(option.label), option.value).toBe(target?.kind === 'DOCUMENT_TYPE' && target.functionalStatus !== 'PASS');
    }
    expect(responseOptions.some((option) => option.value === 'contestacion_demanda_civil')).toBe(true);
    expect(initialOptions.some((option) => option.value === 'demanda_ordinaria_civil')).toBe(true);
    expect(universalOptions.some((option) => option.value === 'contestacion_demanda_civil')).toBe(true);
    expect(responseOptions.some((option) => option.value === 'contestacion_impedimento')).toBe(false);
  });

  it('allows drafts only for generable types and never exposes any type as FINAL without human review', () => {
    expect(canGenerateDocumentDraft('contestacion_demanda_civil', false)).toBe(true);
    expect(canGenerateDocumentDraft('contestacion_impedimento', true)).toBe(false);
    // Ningún tipo no generable se habilita con el opt-in de borrador.
    for (const entry of CANONICAL_DOCUMENT_TYPES.filter((item) => !item.implemented)) expect(canGenerateDocumentDraft(entry.id, true), entry.id).toBe(false);
    // PASS técnico no autoriza FINAL: falta la aprobación humana de cada tipo.
    expect(canExportDocumentFinal('contestacion_demanda_civil')).toBe(false);
    for (const entry of CANONICAL_DOCUMENT_TYPES) expect(canExportDocumentFinal(entry.id), entry.id).toBe(entry.humanReview === 'APPROVED' && entry.functionalStatus === 'PASS');
  });
});
