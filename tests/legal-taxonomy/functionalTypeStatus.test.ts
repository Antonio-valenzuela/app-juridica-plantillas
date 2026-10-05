import { describe, expect, it } from 'vitest';
import {
  CANONICAL_DOCUMENT_TYPES,
  getContestacionesDeclaredDocumentTypes,
  getContestacionesDocumentOptions,
  getFunctionalDocumentTypes,
  getFunctionalDocumentStatus,
  getInitialWritingDocumentOptions,
  getTypesInDevelopment,
  getUniversalDocumentTypes,
} from '@/lib/catalog/legalCatalog';

describe('generator functional status is independent from template presence', () => {
  it('keeps unproven types out of ordinary document selectors while retaining them in development inventory', () => {
    const developmentIds = new Set(getTypesInDevelopment().map((entry) => entry.id));
    const functional = getFunctionalDocumentTypes();
    const normalOptions = [
      ...getContestacionesDocumentOptions().filter((option) => option.value !== 'redaccion_libre').map((option) => option.value),
      ...getInitialWritingDocumentOptions().map((option) => option.value),
      ...getUniversalDocumentTypes().map((option) => option.value),
    ];

    expect(functional.every((entry) => entry.functionalStatus === 'PASS')).toBe(true);
    expect(normalOptions.every((id) => functional.some((entry) => entry.id === id))).toBe(true);
    expect(getContestacionesDocumentOptions().some((option) => option.value === 'redaccion_libre')).toBe(true);
    expect(getContestacionesDeclaredDocumentTypes()).toHaveLength(13);
    expect(getFunctionalDocumentStatus('apelacion_civil')).toBe('FAIL');
    expect(getFunctionalDocumentStatus('apelacion')).toBeUndefined();
    expect(CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.functionalStatus === 'FAIL')).toHaveLength(277);
    expect(CANONICAL_DOCUMENT_TYPES.every((entry) => entry.humanReview === 'PENDING')).toBe(true);
    expect(CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.functionalStatus !== 'PASS')
      .every((entry) => developmentIds.has(entry.id))).toBe(true);
  });

  it('does not infer functional PASS from IMPLEMENTED or DocumentTemplate presence', () => {
    const structuralTypes = CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.implemented && entry.templateId);
    expect(structuralTypes.length).toBeGreaterThan(0);
    expect(structuralTypes.every((entry) => entry.functionalStatus !== 'PASS')).toBe(true);
  });
});
