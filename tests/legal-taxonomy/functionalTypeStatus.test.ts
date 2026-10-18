import { describe, expect, it } from 'vitest';
import {
  CANONICAL_DOCUMENT_TYPES,
  getCatalogDocument,
  getContestacionesDeclaredDocumentTypes,
  getContestacionesDocumentOptions,
  getFunctionalDocumentTypes,
  getFunctionalDocumentStatus,
  getInitialWritingDocumentOptions,
  getTypesInDevelopment,
  getUniversalDocumentTypes,
} from '@/lib/catalog/legalCatalog';
import { WRITING_TYPE_EVIDENCE } from '@/lib/catalog/writingTypeEvidence.generated';

// Política vigente: functionalStatus se CALCULA. PASS solo para un tipo generable (IMPLEMENTED) con evidencia
// determinista por ID en WRITING_TYPE_EVIDENCE; no se deduce de IMPLEMENTED ni de la presencia de plantilla, y
// no es certificación jurídica (humanReview sigue PENDING y FINAL bloqueado).
const hasEvidence = (id: string) => (WRITING_TYPE_EVIDENCE as Record<string, true | undefined>)[id] === true;
const canonicalTarget = (id: string) => {
  const entry = getCatalogDocument(id);
  return entry?.kind === 'LEGACY_ALIAS' ? getCatalogDocument(entry.targetId) : entry;
};

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
    // Toda opción ordinaria (canónica o alias) resuelve a un destino canónico PASS.
    for (const id of normalOptions) {
      const target = canonicalTarget(id);
      expect(target?.kind === 'DOCUMENT_TYPE' ? target.functionalStatus : null, id).toBe('PASS');
      expect(functional.some((entry) => entry.id === target?.id), id).toBe(true);
    }
    expect(getContestacionesDocumentOptions().some((option) => option.value === 'redaccion_libre')).toBe(true);
    expect(getContestacionesDeclaredDocumentTypes()).toHaveLength(CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.capabilities.selectableInContestaciones).length);
    expect(getFunctionalDocumentStatus('apelacion_civil')).toBe(hasEvidence('apelacion_civil') ? 'PASS' : 'FAIL');
    expect(getFunctionalDocumentStatus('apelacion')).toBeUndefined();
    const failing = CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.functionalStatus === 'FAIL');
    expect(failing).toHaveLength(CANONICAL_DOCUMENT_TYPES.length - Object.keys(WRITING_TYPE_EVIDENCE).length);
    expect(CANONICAL_DOCUMENT_TYPES.every((entry) => entry.humanReview === 'PENDING')).toBe(true);
    expect(CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.functionalStatus !== 'PASS')
      .every((entry) => developmentIds.has(entry.id))).toBe(true);
  });

  it('does not infer functional PASS from IMPLEMENTED or DocumentTemplate presence', () => {
    const structuralTypes = CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.implemented && entry.templateId);
    expect(structuralTypes.length).toBeGreaterThan(0);
    // PASS <=> evidencia por ID: la presencia de plantilla o el estado IMPLEMENTED no bastan por sí solos.
    for (const entry of structuralTypes) expect(entry.functionalStatus === 'PASS', entry.id).toBe(hasEvidence(entry.id));
    for (const entry of CANONICAL_DOCUMENT_TYPES.filter((item) => item.functionalStatus === 'PASS')) expect(hasEvidence(entry.id), entry.id).toBe(true);
    // Un tipo con plantilla pero sin evidencia sigue FAIL.
    const unproven = CANONICAL_DOCUMENT_TYPES.filter((entry) => !hasEvidence(entry.id));
    expect(unproven.every((entry) => entry.functionalStatus === 'FAIL')).toBe(true);
  });
});
