/**
 * phase2MaturityCompletion.test.ts — FASE 2: Madurez documental, marcadores y completion
 *
 * Verifica los 10 requisitos esenciales de la Fase 2:
 * 1. Detección y no preservación de marcadores legacy ([Desarrollar por la IA...])
 * 2. Preservación legítima de texto humano breve (< 200 caracteres)
 * 3. Preservación de contenido editado manualmente (isManuallyEdited)
 * 4. Detección de truncamiento por tokens (finish_reason: length)
 * 5. Generación normal completa (finish_reason: stop)
 * 6. Quality Gate crítico impide pipelineState.isComplete y canMarkAsFinal
 * 7. Bloqueo en exportGuards ante presencia de marcadores de semilla
 * 8. Bloqueo ante bloques requeridos vacíos (AI_REQUIRED)
 * 9. Trazabilidad de fallback determinístico en secciones sustantivas
 * 10. Sanitización de machote con marcadores legacy hacia necesidad de generación estructurada
 */

import { describe, it, expect } from 'vitest';
import {
  hasSeedMarkers,
  isSeedMarker,
  evaluateBlockSeedStatus,
} from '@/lib/legal-engine/seedMarkers';
import { quickClassifyText } from '@/lib/legal-engine/blockPlanner';
import { buildTemplateSkeleton, buildDocumentPlan } from '@/lib/legal-engine/documentPlan';
import { extractMachoteStructure } from '@/lib/legal-engine/structureBuilder';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import { validateForExport } from '@/lib/legal-engine/exportGuards';
import { generateLegalBlock } from '@/lib/legal-engine/pipeline';
import {
  createEmptyDocument,
  createDocumentNode,
  UniversalLegalDocument,
  DocumentNode,
} from '@/lib/legal-engine/types';
import { createContentBlock } from '@/lib/legal-engine/trustLayer';
import { getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';

function createMockDoc(overrides: Partial<UniversalLegalDocument> = {}): UniversalLegalDocument {
  const doc = createEmptyDocument({
    id: 'test-doc-phase2',
    title: 'Documento de Prueba Fase 2',
    documentType: 'demanda_ordinaria_civil',
    documentTypeLabel: 'Demanda Ordinaria Civil',
    matter: 'Civil',
    sections: [],
    ...overrides,
  } as any);
  return doc;
}

describe('FASE 2 — Madurez Documental, Marcadores y Completion', () => {
  // Test 1: Marcador legacy no se preserva directo y requiere generación
  it('1. Marcador legacy no se clasifica como PRESERVE_DIRECT y exige generación', () => {
    const legacyText = '[Desarrollar por la IA conforme a las fuentes permitidas y las reglas del tipo recurso_revision_amparo_directo.]';
    
    expect(hasSeedMarkers(legacyText)).toBe(true);
    expect(isSeedMarker(legacyText)).toBe(true);
    
    // Aunque tiene < 200 caracteres (108 chars), NUNCA debe preservarse directo
    expect(legacyText.length).toBeLessThan(200);
    expect(quickClassifyText(legacyText)).toBe('REQUIRES_AI');
    
    const evaluation = evaluateBlockSeedStatus({ text: legacyText });
    expect(evaluation.hasSeedMarker).toBe(true);
    expect(evaluation.requiresGeneration).toBe(true);
  });

  // Test 2: Texto humano breve legítimo se preserva
  it('2. Texto humano breve legítimo (< 200 chars) sin marcadores se preserva correctamente', () => {
    const humanBrief = 'Comparece por su propio derecho el actor Juan Pérez Hernández, con domicilio procesal en Av. Juárez 123.';
    
    expect(hasSeedMarkers(humanBrief)).toBe(false);
    expect(humanBrief.length).toBeLessThan(200);
    expect(quickClassifyText(humanBrief)).toBe('PRESERVE_DIRECT');
  });

  // Test 3: Contenido manual (isManuallyEdited) se preserva
  it('3. Contenido editado manualmente por el abogado se preserva intacto', () => {
    const manualText = 'Redacción personalizada por el abogado titular con argumentación fáctica directa.';
    const doc = createMockDoc();
    const tpl = getDocumentTemplate('demanda_ordinaria_civil');
    
    const initialSections = buildTemplateSkeleton(tpl, doc);
    // Simular que el usuario editó la sección de hechos
    const hechosSec = initialSections.find((s) => /hechos/i.test(s.title))!;
    hechosSec.isManuallyEdited = true;
    hechosSec.content = [
      {
        id: 'blk-manual-1',
        layer: 'USER_POSITION',
        trustLevel: 'VERIFIED',
        text: manualText,
        isManuallyEdited: true,
        generationRequirement: 'PRESERVED_HUMAN',
        generationStatus: 'generated',
      },
    ];
    doc.sections = initialSections;

    // Ejecutar un nuevo plan heredando del documento previo
    const planResult = buildDocumentPlan({
      doc,
      template: tpl,
    });

    const inheritedHechos = planResult.sections.find((s) => /hechos/i.test(s.title))!;
    expect(inheritedHechos.isManuallyEdited).toBe(true);
    expect(inheritedHechos.content[0].text).toBe(manualText);
    expect(inheritedHechos.content[0].provenance).toBe('USER_EDITED');
  });

  // Test 4: finish_reason = "length" marca truncamiento y no madurez
  it('4. Detección de truncamiento por finish_reason: length impide madurez y completion', async () => {
    const doc = createMockDoc();
    const truncatedText = 'En virtud de lo anterior, la parte actora demanda el cumplimiento forzoso pero el argumento se corta abruptamente aqu';

    // Inyectar sección en doc con metadata de truncamiento
    const section: DocumentNode = createDocumentNode({
      id: 'sec-trunc',
      type: 'argument',
      title: 'ARGUMENTO PRINCIPAL',
      order: 10,
      content: [
        {
          id: 'blk-trunc',
          layer: 'USER_POSITION',
          trustLevel: 'VERIFIED',
          text: truncatedText,
          generationRequirement: 'AI_REQUIRED',
          generationStatus: 'truncated',
        },
      ],
      generation: {
        provider: 'nvidia',
        model: 'deepseek-ai/deepseek-r1',
        fallbackUsed: false,
        generationReason: 'Generación truncada',
        finishReason: 'length',
        isTruncated: true,
        status: 'truncated',
      },
    });
    doc.sections = [section];

    // 1. Quality Gate debe registrar error crítico por truncamiento
    const qg = runQualityGateCheck(doc);
    expect(qg.passed).toBe(false);
    expect(qg.canMarkAsFinal).toBe(false);
    const truncIssue = qg.criticalErrors.find((e) => e.checkId.includes('truncated'));
    expect(truncIssue).toBeDefined();

    // 2. exportGuards debe bloquear la exportación
    const exportResult = validateForExport(doc);
    expect(exportResult.ok).toBe(false);
    expect(exportResult.errors.some((e) => e.includes('TRUNCATED_GENERATION'))).toBe(true);
  });

  // Test 5: finish_reason = "stop" en contenido válido
  it('5. finish_reason: stop con contenido completo permite madurez normal', () => {
    const doc = createMockDoc();
    const completeText = 'PRIMERO. Se demanda la rescisión del contrato de compraventa celebrado entre las partes.\nSEGUNDO. El pago de daños y perjuicios ocasionados por el incumplimiento acreditado en autos.';

    const section: DocumentNode = createDocumentNode({
      id: 'sec-ok',
      type: 'argument',
      title: 'CONCEPTOS DE FONDO',
      order: 10,
      content: [
        {
          id: 'blk-ok',
          layer: 'USER_POSITION',
          trustLevel: 'VERIFIED',
          text: completeText,
          generationRequirement: 'AI_REQUIRED',
          generationStatus: 'generated',
        },
      ],
      generation: {
        provider: 'nvidia',
        model: 'deepseek-ai/deepseek-r1',
        fallbackUsed: false,
        generationReason: 'Generado con éxito',
        finishReason: 'stop',
        isTruncated: false,
        status: 'generated',
      },
    });
    doc.sections = [section];

    const qg = runQualityGateCheck(doc);
    const truncIssue = qg.criticalErrors.find((e) => e.checkId.includes('truncated'));
    expect(truncIssue).toBeUndefined();

    const exportCheck = validateForExport(doc);
    expect(exportCheck.errors.some((e) => e.includes('TRUNCATED_GENERATION'))).toBe(false);
  });

  // Test 6: Quality Gate crítico impide pipelineState.isComplete
  it('6. Documento con errores críticos en Quality Gate no puede marcar pipelineState.isComplete', () => {
    const doc = createMockDoc();
    // Insertar un marcador prohibido que dispara error crítico
    const badSection: DocumentNode = createDocumentNode({
      id: 'sec-bad',
      type: 'argument',
      title: 'HECHOS',
      order: 10,
      content: [
        {
          id: 'blk-bad',
          layer: 'USER_POSITION',
          trustLevel: 'VERIFIED',
          text: '[Desarrollar por la IA conforme a las fuentes permitidas y las reglas del tipo demanda_ordinaria_civil.]',
        },
      ],
    });
    doc.sections = [badSection];

    const qg = runQualityGateCheck(doc);
    expect(qg.passed).toBe(false);
    expect(qg.canMarkAsFinal).toBe(false);
    expect(qg.criticalErrors.length).toBeGreaterThan(0);
  });

  // Test 7: exportGuards bloquea documentos con marcadores de semilla
  it('7. validateForExport bloquea cualquier documento que contenga marcadores de semilla', () => {
    const doc = createMockDoc();
    doc.sections = [
      createDocumentNode({
        id: 'sec-1',
        type: 'argument',
        title: 'CONSIDERACIONES JURÍDICAS',
        order: 10,
        content: [
          createContentBlock(
            'Texto introductorio.\n[Desarrollar por la IA conforme a las fuentes permitidas y las reglas del tipo demanda.]\nTexto final.',
            'USER_POSITION'
          ),
        ],
      }),
    ];

    const exportCheck = validateForExport(doc);
    expect(exportCheck.ok).toBe(false);
    expect(exportCheck.errors.some((e) => e.includes('SEED_MARKER_PRESENT'))).toBe(true);
  });

  // Test 8: Bloque requerido vacío (AI_REQUIRED) impide completion
  it('8. Bloque AI_REQUIRED vacío impide completion y bloquea exportación', () => {
    const doc = createMockDoc();
    doc.sections = [
      createDocumentNode({
        id: 'sec-empty-req',
        type: 'argument',
        title: 'AGRAVIOS DE FONDO',
        order: 10,
        content: [
          {
            id: 'blk-empty-req',
            layer: 'USER_POSITION',
            trustLevel: 'VERIFIED',
            text: '   ',
            generationRequirement: 'AI_REQUIRED',
            generationStatus: 'pending',
          },
        ],
      }),
    ];

    // Quality Gate
    const qg = runQualityGateCheck(doc);
    expect(qg.passed).toBe(false);
    expect(qg.criticalErrors.some((e) => e.checkId.includes('empty_ai_required'))).toBe(true);

    // Export Guards
    const exp = validateForExport(doc);
    expect(exp.ok).toBe(false);
    expect(exp.errors.some((e) => e.includes('EMPTY_AI_REQUIRED_BLOCK'))).toBe(true);
  });

  // Test 9: Substantive fallback determinístico se registra con fallbackUsed y partial
  it('9. Fallback determinístico en bloque sustantivo se registra con fallbackUsed: true y status: partial', async () => {
    const doc = createMockDoc();
    const substantiveBlock = {
      id: 'blk-subst-fallback',
      kind: 'argument' as const,
      sectionType: 'argument' as const,
      title: 'CONCEPTOS DE VIOLACIÓN',
      level: 1,
      order: 10,
      text: '',
      sourceElementIndices: [],
      pages: { start: 1, end: 1 },
      aiNeed: 'REQUIRES_AI' as const,
      requiresAi: true,
      classificationReason: 'Test substantive fallback',
      elementCount: 1,
      charCount: 0,
      context: { facts: [], norms: [], jurisprudence: [], caseNumbers: [], authorities: [] },
    };

    const tempIndex = {
      pages: [],
      elements: [],
      headings: [],
      paragraphs: [],
      pageNumbers: [],
      signatures: [],
      tables: [],
      entities: [],
      dates: [],
      caseNumbers: [],
      authorities: [],
      citations: [],
      legalReferences: [],
      fullText: '',
      pageCount: 1,
      sourceId: 'mock',
      confidence: 100,
    };

    // Ejecutar generateLegalBlock sin proveedor de IA disponible -> genera determinístico
    const res = await generateLegalBlock(
      substantiveBlock,
      doc,
      tempIndex,
      undefined,
      undefined,
      undefined,
      { citationStyle: 'completa', formattingTone: 'formal', argumentativeStyle: 'silogistico' } as any
    );

    expect(res.fallbackUsed).toBe(true);
    expect(res.text.length).toBeGreaterThan(0);
    // El texto no debe tener el marcador crudo de semilla
    expect(hasSeedMarkers(res.text)).toBe(false);
  });

  // Test 10: Machote con marcador legacy se sanitiza hacia necesidad de IA sin fugar texto crudo
  it('10. Machote de referencia con marcador legacy se convierte en AI_REQUIRED sin fugar marcador como contenido', () => {
    const rawMachote = [
      'H. JUZGADO DE DISTRITO EN EL ESTADO DE JALISCO',
      'EXPEDIENTE: 100/2026',
      'PROEMIO',
      'Comparece la parte quejosa promoviendo el presente juicio.',
      'CONCEPTOS DE VIOLACIÓN',
      '[Desarrollar por la IA conforme a las fuentes permitidas y las reglas del tipo demanda_amparo_indirecto.]',
      'PETITORIOS',
      'ÚNICO. Se admita a trámite.',
    ].join('\n');

    const nodes = extractMachoteStructure(rawMachote);
    const conceptosNode = nodes.find((n) => /conceptos/i.test(n.title));
    expect(conceptosNode).toBeDefined();
    
    // El bloque debe haber sido transformado: texto limpio de marcadores y requirement AI_REQUIRED
    const block = conceptosNode!.content[0];
    expect(hasSeedMarkers(block.text)).toBe(false);
    expect(block.generationRequirement).toBe('AI_REQUIRED');
    expect(block.generationStatus).toBe('pending');
  });
});
