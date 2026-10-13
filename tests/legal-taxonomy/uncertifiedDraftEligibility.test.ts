import { describe, expect, it } from 'vitest';
import {
  canExportDocumentFinal,
  canGenerateDocumentDraft,
  CANONICAL_DOCUMENT_TYPES,
  getContestacionesDocumentOptions,
  getInitialWritingDocumentOptions,
  getUniversalDocumentTypes,
} from '@/lib/catalog/legalCatalog';
import { familyDerivedTemplateFor } from '@/lib/legal-engine/documentTemplates';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { evaluateSourceOutputCompatibility } from '@/lib/legal-engine/sourceOutputCompatibility';

const derivedTypes = [
  'contestacion_proveedor',
  'contestacion_seguridad_social',
  'solicitud_acceso_informacion',
  'recurso_revision_transparencia',
] as const;

describe('opt-in para DRAFT de tipos implementados no acreditados', () => {
  it('rechaza FAIL con template derivado si no se confirmó el opt-in', () => {
    expect(canGenerateDocumentDraft('contestacion_proveedor')).toBe(false);
  });

  it('permite FAIL con template derivado únicamente para DRAFT y con opt-in', () => {
    expect(canGenerateDocumentDraft('contestacion_proveedor', true)).toBe(true);
    expect(canExportDocumentFinal('contestacion_proveedor')).toBe(false);
  });

  it('mantiene DRAFT habilitado para PASS sin acknowledgement', () => {
    const canonicalPass = CANONICAL_DOCUMENT_TYPES.find((entry) => entry.functionalStatus === 'PASS')?.id;
    expect(canonicalPass, 'fixture PASS disponible en el catálogo').toBeDefined();
    expect(canGenerateDocumentDraft(canonicalPass!)).toBe(true);
  });

  it('mantiene ASSISTED_DRAFT bloqueado aunque haya opt-in', () => {
    const assisted = CANONICAL_DOCUMENT_TYPES.find((entry) => entry.status === 'ASSISTED_DRAFT')?.id;
    expect(assisted).toBeDefined();
    expect(canGenerateDocumentDraft(assisted!, true)).toBe(false);
    expect(() => resolveDocumentRouting({ selectedDocumentType: assisted! })).toThrow(/DOCUMENT_TYPE_NOT_IMPLEMENTED/);
  });

  it('mantiene REQUIRES_OFFICIAL_FORM bloqueado aunque haya opt-in', () => {
    const officialForm = CANONICAL_DOCUMENT_TYPES.find((entry) => entry.status === 'REQUIRES_OFFICIAL_FORM')?.id;
    expect(officialForm).toBeDefined();
    expect(canGenerateDocumentDraft(officialForm!, true)).toBe(false);
    expect(() => resolveDocumentRouting({ selectedDocumentType: officialForm! })).toThrow(/DOCUMENT_TYPE_NOT_IMPLEMENTED/);
  });

  it('mantiene rechazo de una fuente incompatible para un tipo FAIL', () => {
    expect(CANONICAL_DOCUMENT_TYPES.find((entry) => entry.id === 'contestacion_proveedor')?.functionalStatus).toBe('FAIL');
    const source = createSourceDocument({
      id: 'synthetic-amparo-source',
      filename: 'resolucion.pdf',
      sourceValidated: true,
      content: 'SENTENCIA DEFINITIVA DE AMPARO DIRECTO. Tribunal Colegiado. Materia laboral. Resolución que decide conceptos de violación.',
    });
    expect(() => evaluateSourceOutputCompatibility({
      selectedDocumentType: 'contestacion_proveedor',
      sourceDocuments: [source],
      sourceMatter: 'laboral',
    })).toThrow(/SOURCE_DOCUMENT_INCOMPATIBLE/);
  });

  it('conserva el rechazo de FINAL para un tipo FAIL aunque haya opt-in DRAFT', () => {
    expect(canGenerateDocumentDraft('contestacion_proveedor', true)).toBe(true);
    expect(canExportDocumentFinal('contestacion_proveedor')).toBe(false);
  });

  it.each(derivedTypes)('%s resuelve template y strategy por el resolver derivado', (id) => {
    const derived = familyDerivedTemplateFor(id);
    const route = resolveDocumentRouting({ selectedDocumentType: id });
    expect(derived).toBeDefined();
    expect(route.resolvedTemplate).toBe(derived?.tipo);
    expect(route.resolvedStrategy).toBe(derived?.tipo);
    expect(route.fallbackUsed).toBe(false);
  });

  it('no agrega automáticamente los cuatro tipos derivados a los selectores actuales', () => {
    const selectorIds = new Set([
      ...getContestacionesDocumentOptions({ includeUncertifiedDrafts: true }).map((option) => option.value),
      ...getInitialWritingDocumentOptions({ includeUncertifiedDrafts: true }).map((option) => option.value),
      ...getUniversalDocumentTypes({ includeUncertifiedDrafts: true }).map((option) => option.value),
    ]);
    for (const id of derivedTypes) expect(selectorIds.has(id)).toBe(false);
  });
});
