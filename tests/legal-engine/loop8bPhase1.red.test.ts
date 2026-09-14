import { describe, expect, it } from 'vitest';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { classifyIntent } from '@/lib/legal-engine/classifier';
import { buildCaseContext } from '@/lib/legal-engine/caseContext';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import { runDocumentPreflight } from '@/lib/legal-engine/documentPreflight';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';
import { validateForExport } from '@/lib/legal-engine/exportGuards';
import { runQualityGateCheck, registerDocumentQualityGateRule } from '@/lib/legal-engine/qualityGate';
import { getCanonicalOutputFilename } from '@/lib/legal-engine/outputFilename';
import {
  evaluateSourceOutputCompatibility,
  SourceDocumentIncompatibleError,
} from '@/lib/legal-engine/sourceOutputCompatibility';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { normalizeSourceDocumentType } from '@/lib/legal-engine/sourceDocumentTypes';

function syntheticSource(sourceDocumentType: string, content = 'Fuente jurídica sintética.') {
  return createSourceDocument({
    id: `phase1-${sourceDocumentType.toLowerCase()}`,
    filename: `${sourceDocumentType.toLowerCase()}.pdf`,
    content,
    classification: { sourceDocumentType },
    sourceValidated: true,
  });
}

describe('LOOP 8B FASE 1 — routing y compatibilidad estricta', () => {
  it('pide seleccionar subtipo cuando la materia es específica pero la demanda no lo es', () => {
    expect(classifyIntent('Preparar una demanda civil').documentType).toBe('NEEDS_DOCUMENT_TYPE_SELECTION');
    expect(classifyIntent('Preparar una demanda mercantil').documentType).toBe('NEEDS_DOCUMENT_TYPE_SELECTION');
    expect(() => resolveDocumentRouting({ inferredDocumentType: 'NEEDS_DOCUMENT_TYPE_SELECTION' }))
      .toThrow(expect.objectContaining({ code: 'NEEDS_DOCUMENT_TYPE_SELECTION' }));
  });

  it('clasifica la contestación mercantil en su output canónico separado', () => {
    expect(classifyIntent('Preparar contestación de demanda mercantil').documentType)
      .toBe('contestacion_demanda_mercantil');
  });

  it('no convierte una demanda civil/mercantil con subtipo catalogado en la demanda genérica', () => {
    expect(classifyIntent('Preparar una demanda ordinaria civil').documentType).toBe('demanda_ordinaria_civil');
    expect(classifyIntent('Preparar una demanda civil ordinaria').documentType).toBe('demanda_ordinaria_civil');
    expect(classifyIntent('Preparar una demanda ejecutiva mercantil').documentType).toBe('demanda_ejecutiva_mercantil');
    expect(resolveDocumentRouting({ inferredDocumentType: 'demanda_ordinaria_civil' }))
      .toMatchObject({ resolvedStrategy: 'demanda_ordinaria_civil', resolvedTemplate: 'demanda_ordinaria_civil' });
  });

  it('mantiene civil y mercantil como outputs canónicos distintos', () => {
    const civil = getCatalogDocument('contestacion_demanda_civil');
    const mercantile = getCatalogDocument('contestacion_demanda_mercantil');

    expect(civil).toMatchObject({ kind: 'DOCUMENT_TYPE', id: 'contestacion_demanda_civil' });
    expect(mercantile).toMatchObject({ kind: 'DOCUMENT_TYPE', id: 'contestacion_demanda_mercantil' });
    if (civil?.kind !== 'DOCUMENT_TYPE' || mercantile?.kind !== 'DOCUMENT_TYPE') throw new Error('Expected canonical document types');
    expect(civil.strategyId).toBe('contestacion_demanda_civil');
    expect(mercantile.strategyId).toBe('contestacion_demanda_mercantil');
  });

  it('resuelve el alias histórico mercantil al output canónico sin duplicarlo', () => {
    expect(getCatalogDocument('contestación mercantil')).toMatchObject({
      kind: 'DOCUMENT_TYPE',
      id: 'contestacion_demanda_mercantil',
    });
    expect(resolveDocumentRouting({ selectedDocumentType: 'contestación mercantil' }).resolvedTemplate)
      .toBe('contestacion_demanda_mercantil');
  });

  it('no acepta una fuente mercantil para la contestación civil', () => {
    expect(() => evaluateSourceOutputCompatibility({
      selectedDocumentType: 'contestacion_demanda_civil',
      sourceDocuments: [syntheticSource('DEMANDA_MERCANTIL')],
      sourceAnalysis: { numberedFacts: [{ id: 'fact-1' }], sourceClaims: [{ id: 'claim-1' }] },
    })).toThrowError(SourceDocumentIncompatibleError);
  });

  it('acepta una fuente mercantil para la contestación mercantil y no la mezcla con civil', () => {
    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'contestacion_demanda_mercantil',
      sourceDocuments: [syntheticSource('DEMANDA_MERCANTIL')],
      sourceAnalysis: { numberedFacts: [{ id: 'fact-1' }], sourceClaims: [{ id: 'claim-1' }] },
    });

    expect(result).toMatchObject({
      status: 'COMPATIBLE',
      sourceDocumentType: 'DEMANDA_MERCANTIL',
      sourceMatter: 'MERCANTIL',
      selectedDocumentType: 'contestacion_demanda_mercantil',
    });
  });

  it('genera la salida mercantil con su propia estrategia, template, materia y filename', async () => {
    const document = await runGenerationPipeline({
      selectedDocumentType: 'contestacion_demanda_mercantil',
      documentTypeLabel: 'Contestación de Demanda Mercantil',
      matter: 'Mercantil',
      userInstruction: 'Contestar una demanda mercantil sintética.',
      sourceDocuments: [syntheticSource('DEMANDA_MERCANTIL', 'DEMANDA MERCANTIL. HECHOS: 1. Se celebró una operación comercial. PRESTACIONES: 1. Se reclama el pago.')],
      generateSection: async ({ section }: { section: { title: string } }) => `Contenido sintético mercantil de ${section.title}.`,
    } as any);

    expect(document.documentType).toBe('contestacion_demanda_mercantil');
    expect(document.templateId).toBe('contestacion_demanda_mercantil');
    expect(document.matter).toBe('Mercantil');
    expect(document.generationMetadata.routing?.resolvedStrategy).toBe('contestacion_demanda_mercantil');
    expect(document.generationMetadata.routing?.outputFilename).toMatch(/contestaci[oó]n.*mercantil/i);
    expect((document.generationMetadata as any).preflight?.status).toBe('NEEDS_INPUT');
    expect(document.sections.map((section) => section.title)).toEqual(expect.arrayContaining([
      'CONTESTACIÓN DE HECHOS',
      'EXCEPCIONES Y DEFENSAS',
      'PETITORIOS',
    ]));
  });

  it('aplica el preflight reusable también a una ruta mercantil inferida', async () => {
    const document = await runGenerationPipeline({
      documentTypeLabel: 'Contestación de Demanda Mercantil',
      userInstruction: 'Preparar contestación de demanda mercantil.',
      sourceDocuments: [syntheticSource('DEMANDA_MERCANTIL', 'DEMANDA MERCANTIL. Hechos y prestaciones sintéticos.')],
      generateSection: async ({ section }: { section: { title: string } }) => `Contenido sintético de ${section.title}.`,
    } as any);

    expect(document.documentType).toBe('contestacion_demanda_mercantil');
    expect((document.generationMetadata as any).preflight?.status).toBe('NEEDS_INPUT');
  });

  it('normaliza SourceDocumentType y separa tipo desconocido de extracción incompleta', () => {
    expect(normalizeSourceDocumentType('demanda civil')).toBe('DEMANDA_CIVIL');
    expect(normalizeSourceDocumentType('tipo inventado')).toBeUndefined();

    expect(() => evaluateSourceOutputCompatibility({
      selectedDocumentType: 'contestacion_demanda_civil',
      sourceDocuments: [syntheticSource('UNKNOWN_SOURCE_TYPE')],
    })).not.toThrow();
    expect(evaluateSourceOutputCompatibility({
      selectedDocumentType: 'contestacion_demanda_civil',
      sourceDocuments: [createSourceDocument({
        id: 'phase1-unknown',
        filename: 'fuente-sintetica.pdf',
        content: 'Texto sin clasificación suficiente.',
        sourceValidated: true,
      })],
    })).toMatchObject({ status: 'NEEDS_INPUT', code: 'SOURCE_TYPE_UNKNOWN' });
  });
});

describe('LOOP 8B FASE 1 — CaseContext, preflight y quality gates', () => {
  const source = syntheticSource('DEMANDA_CIVIL', 'DEMANDA CIVIL. ACTOR: Parte actora. DEMANDADO: Parte demandada.');
  const analysis = reconstructCaseAnalysis([source], 'Contestar demanda civil');
  const context = buildCaseContext([source], analysis, {
    actor: 'Parte actora confirmada',
    demandado: 'Parte demandada confirmada',
  });

  it('conserva estado y proveniencia en el contexto normalizado', () => {
    expect(context.fields.actor).toMatchObject({
      status: 'CONFIRMED',
      value: 'Parte actora confirmada',
      provenance: 'LAWYER_CONFIRMED',
    });
    expect(context.fields.demandado).toMatchObject({
      status: 'CONFIRMED',
      provenance: 'LAWYER_CONFIRMED',
    });
    expect(context.sourceDocumentIds).toEqual([source.id]);
  });

  it('expone un preflight reusable por tipo, fuente y CaseContext', () => {
    const result = runDocumentPreflight('contestacion_demanda_civil', source, context);

    expect(result.status).toBe('NEEDS_INPUT');
    expect(result.missingFields.length).toBeGreaterThan(0);
    expect(result.missingFields.some((field) => field.id === 'case_number')).toBe(true);
  });

  it('bloquea una salida canónica que omite secciones requeridas', () => {
    const doc = createEmptyDocument({
      documentType: 'contestacion_demanda_civil',
      templateId: 'contestacion_demanda_civil',
      documentTypeLabel: 'Contestación de Demanda Civil',
      sections: [createDocumentNode({
        id: 'petitorios',
        title: 'PETITORIOS',
        type: 'petition',
        content: [{ id: 'p1', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text: 'PRIMERO. Tener por presentado el escrito.' }],
      })],
    });

    const quality = runQualityGateCheck(doc);
    expect(quality.criticalErrors.some((error) => error.checkId === 'MISSING_REQUIRED_SECTION')).toBe(true);
    expect(quality.canMarkAsFinal).toBe(false);
    expect(validateForExport(doc).errors.some((error) => error.includes('MISSING_REQUIRED_SECTION'))).toBe(true);
  });

  it('no trata el output civil implementado como CATALOG_ONLY si alguien construye el documento manualmente', () => {
    const doc = createEmptyDocument({
      documentType: 'demanda_ordinaria_civil',
      templateId: 'demanda_ordinaria_civil',
      sections: [createDocumentNode({
        id: 'body',
        title: 'CONTENIDO',
        type: 'argument',
        content: [{ id: 'b1', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text: 'Contenido sintético.' }],
      })],
    });

    expect(validateForExport(doc).errors.some((error) => error.includes('DOCUMENT_TYPE_NOT_IMPLEMENTED'))).toBe(false);
  });

  it('permite registrar gates específicos por documento sin eliminar los universales', () => {
    const cleanup = registerDocumentQualityGateRule({
      id: 'phase1-specific-rule',
      appliesTo: ['contestacion_demanda_civil'],
      evaluate: () => [{ checkId: 'PHASE1_SPECIFIC_RULE', message: 'Regla sintética de prueba.' }],
    });
    const doc = createEmptyDocument({
      documentType: 'contestacion_demanda_civil',
      templateId: 'contestacion_demanda_civil',
      sections: [],
    });

    const quality = runQualityGateCheck(doc);
    cleanup();
    expect(quality.criticalErrors.some((error) => error.checkId === 'PHASE1_SPECIFIC_RULE')).toBe(true);
  });

  it('deriva un nombre determinista desde el ID canónico, nunca desde la fuente', () => {
    const filename = getCanonicalOutputFilename('contestacion_demanda_mercantil', context);

    expect(filename).toMatch(/contestaci[oó]n.*mercantil.*\.docx$/i);
    expect(filename).not.toMatch(/[<>:"/\\|?*]/);
  });
});
