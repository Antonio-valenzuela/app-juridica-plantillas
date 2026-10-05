import { describe, expect, it } from 'vitest';
import {
  resolveWritingType, visibleWritingTypes, writingTypeCensus, classifyWritingType, canonicalTypeOf,
} from '@/lib/catalog/writingTypeIdentity';
import { CANONICAL_DOCUMENT_TYPES, LEGAL_CATALOG_REGISTRY } from '@/lib/catalog/legalCatalog';

/**
 * Contrato global ligero: se ejecuta sobre el registro real, sin generar
 * documentos. Debe correr en cada suite.
 */
describe('contrato de identidad de tipos de escritos', () => {
  const identities = visibleWritingTypes();
  const GABLE = identities.filter(identity => identity.capabilities.draft);
  const BLOCKED = identities.filter(identity => !identity.capabilities.draft);

  it('el censo cubre el 100% de los tipos canónicos del catálogo', () => {
    const census = writingTypeCensus();
    expect(census.visibleTypes).toBe(CANONICAL_DOCUMENT_TYPES.length);
    expect(census.canonicalTypes + census.variants).toBe(census.visibleTypes);
  });

  it('el contrato real es 265 generables + 12 bloqueados por estado de producto', () => {
    expect(GABLE.length).toBe(265);
    expect(BLOCKED.length).toBe(12);
    expect(GABLE.length + BLOCKED.length).toBe(identities.length);
    for (const identity of GABLE) expect(identity.functionalStatus).toBe('PASS');
    for (const identity of BLOCKED) expect(identity.functionalStatus).toBe('FAIL');
  });

  // Invariante §20: nunca PASS + draftable + routing NOT_IMPLEMENTED.
  it('0 incoherencias PASS + draftable + NOT_IMPLEMENTED', () => {
    const inconsistent = identities.filter(identity => identity.capabilities.draft && identity.functionalStatus !== 'PASS');
    expect(inconsistent.map(identity => identity.id)).toEqual([]);
  });

  it.each(GABLE.map(identity => [identity.id, identity] as const))(
    '%s (generable) cumple el contrato completo',
    (_id, identity) => {
      // id y canonicalType válidos
      expect(identity.id).toMatch(/^[a-z0-9_]+$/);
      expect(identity.canonicalType).toBe(identity.id);
      expect(canonicalTypeOf(identity.id)).toBe(identity.id);

      // familia y materia resolvibles
      expect(identity.familyId).toBeTruthy();
      expect(identity.familyLabel).toBeTruthy();
      expect(identity.areaId).toBeTruthy();
      expect(identity.matter).toBeTruthy();
      expect(identity.proceeding).toBeTruthy();
      expect(identity.proceduralPurpose.length).toBeGreaterThan(10);

      // blueprint + strategy resolubles
      expect(identity.template).toBeTruthy();
      expect(identity.generationStrategy.templateId).toBe(identity.id);

      // fuente compatible declarada
      expect(identity.compatibleSources.declared || identity.compatibleSources.acceptsAnySource).toBe(true);

      // secciones no vacías
      expect(identity.requiredSections.length).toBeGreaterThan(0);
      expect(identity.requiredSections.every(section => section.trim().length > 0)).toBe(true);

      // sin fallback genérico accidental
      expect(identity.incorrectFallback).toBe(false);

      // capacidades: DRAFT sí, FINAL sólo con aprobación humana
      expect(identity.capabilities.draft).toBe(true);
      expect(identity.capabilities.docx).toBe(true);
      expect(identity.capabilities.pdf).toBe(true);
      expect(identity.capabilities.finalEligible).toBe(false);

      expect(identity.implementationStatus).toBe('IMPLEMENTED');
      expect(identity.functionalStatus).toBe('PASS');
    },
  );

  it.each(BLOCKED.map(identity => [identity.id, identity] as const))(
    '%s (bloqueado por contrato) es honesto y no generable',
    (_id, identity) => {
      // Backend presente: NO es un huérfano.
      expect(identity.template).toBeTruthy();
      expect(identity.requiredSections.length).toBeGreaterThan(0);
      // Pero no es generable ni certificable como generación.
      expect(identity.capabilities.draft).toBe(false);
      expect(identity.functionalStatus).toBe('FAIL');
      expect(identity.implementationStatus).toBe('IMPLEMENTED_BUT_UNCERTIFIED');
      // Sin fuente declarada: esa es la razón de no ser generable.
      expect(identity.compatibleSources.declared).toBe(false);
      // FINAL jamás.
      expect(identity.capabilities.finalEligible).toBe(false);
    },
  );

  it('no hay tipos huérfanos, IDs duplicados ni blueprints faltantes', () => {
    const census = writingTypeCensus();
    expect(census.duplicateIds).toEqual([]);
    expect(census.blueprintsMissing).toEqual([]);
    expect(census.strategiesMissing).toEqual([]);
    expect(census.incorrectFallbacks).toEqual([]);
    expect(census.emptySections).toEqual([]);
    expect(census.orphanTypes).toEqual([]);
    expect(census.notImplemented).toBe(0);
  });

  it('todo alias resuelve a un tipo canónico sin duplicar backend', () => {
    for (const alias of LEGAL_CATALOG_REGISTRY.aliases) {
      expect(classifyWritingType(alias.id)).toBe('alias');
      const target = canonicalTypeOf(alias.id);
      expect(target).toBeTruthy();
      expect(classifyWritingType(target!)).not.toBe('alias');
      expect(resolveWritingType(alias.id).template.tipo).toBe(resolveWritingType(target!).template.tipo);
    }
  });

  it('el tipo seleccionado sobrevive el pipeline: el template resuelto conserva el documentType', () => {
    for (const identity of identities) {
      const resolved = resolveWritingType(identity.id);
      expect(resolved.template.tipo).toBe(identity.id);
    }
  });
});