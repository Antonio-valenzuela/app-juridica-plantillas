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
  // Política vigente: functionalStatus se calcula con evidencia por ID. Los tipos derivados por familia ya tienen
  // evidencia (PASS) y se generan sin opt-in; los FAIL actuales no son generables (formulario oficial / borrador
  // asistido), así que el opt-in nunca los habilita. El camino de opt-in para un FAIL implementado se conserva en
  // canGenerateDocumentDraft y se cubre con los guards de estado.
  it('un tipo derivado con evidencia (PASS) se genera sin opt-in y el opt-in no cambia el resultado', () => {
    for (const id of derivedTypes) {
      expect(CANONICAL_DOCUMENT_TYPES.find((entry) => entry.id === id)?.functionalStatus, id).toBe('PASS');
      expect(canGenerateDocumentDraft(id), id).toBe(true);
      expect(canGenerateDocumentDraft(id, true), id).toBe(true);
    }
  });

  it('rechaza todo tipo FAIL sin opt-in y también con opt-in cuando no es generable', () => {
    const failing = CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.functionalStatus === 'FAIL');
    expect(failing.length).toBeGreaterThan(0);
    for (const entry of failing) {
      expect(canGenerateDocumentDraft(entry.id), entry.id).toBe(false);
      expect(canGenerateDocumentDraft(entry.id, true), entry.id).toBe(false);
      expect(canExportDocumentFinal(entry.id), entry.id).toBe(false);
    }
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

  it('mantiene rechazo de una fuente incompatible aunque el tipo tenga evidencia PASS', () => {
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

  it('conserva el rechazo de FINAL para un tipo PASS mientras su revisión humana siga PENDING', () => {
    expect(canGenerateDocumentDraft('contestacion_proveedor', true)).toBe(true);
    expect(CANONICAL_DOCUMENT_TYPES.find((entry) => entry.id === 'contestacion_proveedor')?.humanReview).toBe('PENDING');
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
