import { describe, expect, it } from 'vitest';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { DocumentTemplates, getDocumentTemplate, resolveTemplateByExplicitLabel } from '@/lib/legal-engine/documentTemplates';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import { getCanonicalOutputFilename } from '@/lib/legal-engine/outputFilename';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import { buildTemplateSkeleton } from '@/lib/legal-engine/documentPlan';
import {
  CIVIL_DEMAND_REQUIRED_FIELD_IDS,
  CIVIL_DEMAND_REQUIRED_SECTION_IDS,
  DEMANDA_ORDINARIA_CIVIL_STRATEGY,
  getDocumentStrategy,
} from '@/lib/legal-engine/documentStrategies';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';

const TARGET_ID = 'demanda_ordinaria_civil';
const ALIAS_ID = 'demanda-ordinaria-civil';

function civilDocument(sectionIds = [...CIVIL_DEMAND_REQUIRED_SECTION_IDS]) {
  const sections = sectionIds.map((id, index) => createDocumentNode({
    id,
    title: id,
    type: id === 'petitorios' ? 'petition' : id === 'pruebas' ? 'evidence' : 'custom',
    order: index,
    content: [{
      id: `${id}-block`,
      layer: 'GENERATED_ARGUMENT',
      trustLevel: 'VERIFIED',
      text: `Contenido civil sintético de ${id}. ` + 'Redacción verificable. '.repeat(24),
    }],
  }));

  return createEmptyDocument({
    documentType: TARGET_ID,
    templateId: TARGET_ID,
    documentTypeLabel: 'Demanda Ordinaria Civil',
    matter: 'Civil',
    jurisdiction: 'local civil según competencia que determine el abogado',
    legalBasis: ['Fundamentación jurídica sintética pendiente de revisión profesional.'],
    parties: { actor: 'Parte actora sintética', demandado: 'Parte demandada sintética' },
    sections,
    generationMetadata: {
      ...createEmptyDocument().generationMetadata,
      preflight: { status: 'READY', missingFields: [] },
    } as never,
  });
}

describe('LOOP 8B FASE 2A — strategy, template y catálogo civil', () => {
  it('expone una strategy dedicada con el contrato civil canónico', () => {
    expect(getDocumentStrategy(TARGET_ID)).toBe(DEMANDA_ORDINARIA_CIVIL_STRATEGY);
    expect(DEMANDA_ORDINARIA_CIVIL_STRATEGY.id).toBe(TARGET_ID);
    expect(DEMANDA_ORDINARIA_CIVIL_STRATEGY.requiredSectionIds).toEqual(CIVIL_DEMAND_REQUIRED_SECTION_IDS);
    expect(DEMANDA_ORDINARIA_CIVIL_STRATEGY.requiredFieldIds).toEqual(CIVIL_DEMAND_REQUIRED_FIELD_IDS);
  });

  it('registra únicamente el template canónico dedicado, nunca el template genérico demanda', () => {
    const template = DocumentTemplates[TARGET_ID];

    expect(template).toBeDefined();
    expect(template?.tipo).toBe(TARGET_ID);
    expect(template?.materia).toBe('CIVIL');
    expect(template?.estructura).toEqual([...CIVIL_DEMAND_REQUIRED_SECTION_IDS]);
    expect(template?.esqueletoDedicado).toBe(true);
    expect(template?.tipo).not.toBe('demanda');
  });

  it('usa el plan/render común con once secciones del template dedicado', () => {
    const template = DocumentTemplates[TARGET_ID];
    if (!template) throw new Error('Expected canonical civil template');

    const skeleton = buildTemplateSkeleton(template, civilDocument());

    expect(skeleton).toHaveLength(11);
    expect(skeleton.every((section) => section._templateId === TARGET_ID)).toBe(true);
    expect(skeleton.map((section) => section.id)).toEqual([...CIVIL_DEMAND_REQUIRED_SECTION_IDS]);
    expect(skeleton.map((section) => section.title)).toEqual([...CIVIL_DEMAND_REQUIRED_SECTION_IDS]);
  });

  it('normaliza el alias de entrada al único output canonical', () => {
    expect(getCatalogDocument(ALIAS_ID)).toMatchObject({
      kind: 'LEGACY_ALIAS',
      id: ALIAS_ID,
      targetId: TARGET_ID,
    });

    const routing = resolveDocumentRouting({ selectedDocumentType: ALIAS_ID });
    expect(routing.selectedDocumentType).toBe(TARGET_ID);
    expect(routing.resolvedStrategy).toBe(TARGET_ID);
    expect(routing.resolvedTemplate).toBe(TARGET_ID);
    expect(routing.fallbackUsed).toBe(false);
  });

  it('resuelve el alias también en los accesos legacy de template, sin cambiar el output', () => {
    expect(getDocumentTemplate(ALIAS_ID).tipo).toBe(TARGET_ID);
    expect(resolveTemplateByExplicitLabel(ALIAS_ID)?.tipo).toBe(TARGET_ID);
  });

  it('cambia solo el target civil a IMPLEMENTED y conserva los demás catalog-only', () => {
    expect(getCatalogDocument(TARGET_ID)).toMatchObject({
      kind: 'DOCUMENT_TYPE',
      status: 'IMPLEMENTED',
      strategyId: TARGET_ID,
      templateId: TARGET_ID,
    });
    expect(getCatalogDocument('demanda_oral_civil')).toMatchObject({
      kind: 'DOCUMENT_TYPE',
      status: 'CATALOG_ONLY',
      strategyId: null,
      templateId: null,
    });
  });
});

describe('LOOP 8B FASE 2A — required fields, sections, filename y calidad civil', () => {
  it('mantiene exactamente los once IDs de sección y campos del contrato civil', () => {
    expect(CIVIL_DEMAND_REQUIRED_SECTION_IDS).toEqual([
      'destinatario',
      'comparecencia',
      'personalidad',
      'identificacion_partes',
      'via_accion',
      'prestaciones',
      'hechos',
      'derecho',
      'pruebas',
      'petitorios',
      'firma',
    ]);
    expect(new Set(CIVIL_DEMAND_REQUIRED_SECTION_IDS).size).toBe(11);
    expect(CIVIL_DEMAND_REQUIRED_FIELD_IDS).toEqual(expect.arrayContaining([
      'actor', 'demandado', 'destinatario', 'personalidad', 'jurisdiccion',
      'procedimiento', 'via', 'accion', 'prestaciones', 'hechos',
      'fundamentacion', 'pruebas', 'petitorios', 'firma',
    ]));
  });

  it('deriva el filename del canonical ID tanto para el alias como para el canonical', () => {
    const canonicalFilename = getCanonicalOutputFilename(TARGET_ID);
    const aliasFilename = getCanonicalOutputFilename(ALIAS_ID);

    expect(canonicalFilename).toBe('Demanda Ordinaria Civil.docx');
    expect(aliasFilename).toBe(canonicalFilename);
  });

  it('bloquea calidad civil si falta cualquiera de los once IDs canónicos', () => {
    const incomplete = civilDocument(CIVIL_DEMAND_REQUIRED_SECTION_IDS.filter((id) => id !== 'derecho'));
    const quality = runQualityGateCheck(incomplete);

    expect(quality.criticalErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: 'CIVIL_REQUIRED_SECTION', sectionId: 'derecho' }),
    ]));
    expect(quality.canMarkAsFinal).toBe(false);
  });

  it('bloquea lenguaje de otra familia en una demanda civil', () => {
    const document = civilDocument();
    const section = document.sections.find((candidate) => candidate.id === 'hechos');
    if (!section) throw new Error('Expected synthetic hechos section');
    section.content[0].text = 'Se hacen valer conceptos de violación y acto reclamado.';

    const quality = runQualityGateCheck(document);

    expect(quality.criticalErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: 'CIVIL_CROSS_FAMILY_CONTENT' }),
    ]));
    expect(quality.canMarkAsFinal).toBe(false);
  });
});
