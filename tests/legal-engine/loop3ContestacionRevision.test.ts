import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { extractDocument } from '@/lib/pdf/documentExtractor';
import {
  DocumentTemplates,
  getDocumentTemplate,
  resolveTemplateByExplicitLabel,
} from '@/lib/legal-engine/documentTemplates';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import { buildDocumentPlan } from '@/lib/legal-engine/documentPlan';
import { runDocumentPreflight } from '@/lib/legal-engine/documentPreflight';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { markDocumentAsFinal } from '@/lib/legal-engine/documentLifecycle';
import { validateForExport } from '@/lib/legal-engine/exportGuards';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';

const TARGET_ID = 'contestacion_revision_extraordinaria_amparo_directo';
const TARGET_LABEL = 'Contestación / Revisión extraordinaria ante sentencia de amparo directo';

const sentenceSource = createSourceDocument({
  id: 'sanitized-sentence-800-2024',
  filename: '0129000036717288006AST.PDF',
  sourceValidated: true,
  pages: [
    {
      page: 1,
      text: [
        'SENTENCIA DE AMPARO DIRECTO.',
        'AMPARO DIRECTO: 800/2024.',
        'QUEJOSO: ***** ******* ********* *****.',
        'Segundo Tribunal Colegiado en Materia de Trabajo del Tercer Circuito.',
      ].join('\n'),
      chars: 190,
    },
    {
      page: 2,
      text: [
        'RESOLUCIÓN FINAL.',
        'La Justicia de la Unión no ampara ni protege a la parte quejosa.',
        'La fuente es una sentencia y no una demanda inicial.',
      ].join('\n'),
      chars: 150,
    },
  ],
});

const REAL_PUBLIC_PDF = path.resolve(
  process.cwd(),
  'data/uploads/templates/1787377598439-0129000036717288006AST.PDF',
);

describe('Loop 3 — estrategia de contestación/revisión extraordinaria de amparo directo', () => {
  it('registra un strategy/template canónico propio y no resuelve a una demanda', () => {
    const template = getDocumentTemplate(TARGET_ID);

    expect(template.tipo).toBe(TARGET_ID);
    expect(DocumentTemplates[TARGET_ID]).toBe(template);
    expect(resolveTemplateByExplicitLabel(TARGET_LABEL)?.tipo).toBe(TARGET_ID);
    expect(template.tipo).not.toBe('demanda_amparo_indirecto');
    expect(template.tipo).not.toBe('demanda_amparo_directo');
    expect(template.estructura).toEqual(expect.arrayContaining([
      'IDENTIFICACIÓN DEL ASUNTO',
      'COMPARECENCIA Y PERSONALIDAD',
      'SENTENCIA DE AMPARO DIRECTO IMPUGNADA',
      'ANTECEDENTES PROCESALES',
      'CUESTIÓN CONSTITUCIONAL Y/O PLANTEAMIENTO EXTRAORDINARIO',
      'AGRAVIOS / ARGUMENTOS',
      'PETITORIOS',
      'CIERRE Y FIRMA',
    ]));
    expect(template.vozPrompt).toMatch(/sentencia de amparo directo/i);
    expect(template.vozPrompt).not.toMatch(/demanda de amparo/i);
  });

  it('mantiene el ID seleccionado aunque la fuente sea una sentencia', () => {
    const routing = resolveDocumentRouting({
      selectedDocumentType: TARGET_ID,
      sourceDocumentType: 'SENTENCIA_O_RESOLUCION',
      documentTypeLabel: TARGET_LABEL,
    });

    expect(routing.selectedDocumentType).toBe(TARGET_ID);
    expect(routing.resolvedStrategy).toBe(TARGET_ID);
    expect(routing.resolvedTemplate).toBe(TARGET_ID);
    expect(routing.template.tipo).toBe(TARGET_ID);
    expect(routing.fallbackUsed).toBe(false);
  });

  it('construye una estructura específica, no la de contestación de demanda ni la de amparo inicial', () => {
    const template = getDocumentTemplate(TARGET_ID);
    const doc = createEmptyDocument({
      documentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      matter: 'constitucional',
      jurisdiction: 'federal',
    });
    const plan = buildDocumentPlan({ doc, template });
    const titles = plan.sections.map((section) => section.title);

    expect(plan.templateId).toBe(TARGET_ID);
    expect(titles).toEqual(template.estructura);
    expect(titles).not.toContain('CONCEPTOS DE VIOLACIÓN');
    expect(titles).not.toContain('SUSPENSIÓN');
    expect(titles).not.toContain('CONTESTACIÓN DE HECHOS');
    expect(titles).not.toContain('CONTESTACIÓN DE PRESTACIONES');
    expect(plan.sections.every((section) => section._templateId === TARGET_ID)).toBe(true);
    expect(plan.sections.every((section) => section._provenance === 'GENERATED')).toBe(true);
  });

  it('devuelve preflight NEEDS_INPUT estructurado si no están acreditadas procedencia y cuestión constitucional', () => {
    const doc = createEmptyDocument({
      documentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      matter: 'constitucional',
      jurisdiction: 'federal',
    });

    const result = runDocumentPreflight(doc, getDocumentTemplate(TARGET_ID));

    expect(result.status).toBe('NEEDS_INPUT');
    expect(result.missingFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Parte promovente o recurrente', reason: expect.any(String) }),
      expect.objectContaining({ label: 'Sentencia de amparo directo impugnada', reason: expect.any(String) }),
      expect.objectContaining({ label: 'Cuestión constitucional e interés excepcional', reason: expect.any(String) }),
    ]));
    expect(result.missingFields.every((field) => field.label && field.reason)).toBe(true);
  });

  it('rechaza explícitamente una fuente incompatible con la estrategia post-sentencia', () => {
    const doc = createEmptyDocument({
      documentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      matter: 'constitucional',
      jurisdiction: 'federal',
      sourceDocuments: [createSourceDocument({
        id: 'not-a-sentence',
        filename: 'demanda.pdf',
        sourceValidated: true,
        pages: [{ page: 1, text: 'DEMANDA DE AMPARO INDIRECTO. ACTO RECLAMADO.', chars: 54 }],
      })],
    });

    const result = runDocumentPreflight(doc, getDocumentTemplate(TARGET_ID));

    expect(result.status).toBe('NOT_APPLICABLE');
    expect(result.code).toBe('PROCEDURAL_VIABILITY_FAILED');
    expect(result.warnings.join(' ')).toMatch(/sentencia|ejecutoria/i);
  });

  it('considera viable la estrategia solo cuando procedencia y argumentos tienen respaldo verificable', () => {
    const initial = {
      documentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      matter: 'constitucional',
      jurisdiction: 'federal',
      parties: { quejoso: 'Parte promovente confirmada', autoridadResponsable: 'Tribunal Colegiado' },
      caseRefs: { expediente: '800/2024', amparo: '800/2024', tribunal: 'Segundo Tribunal Colegiado' },
      sourceDocuments: [sentenceSource],
      legalBasis: ['Fundamento confirmado'],
      caseAnalysis: {
        parties: { quejoso: 'Parte promovente confirmada' },
        authorities: ['Segundo Tribunal Colegiado'],
        caseNumbers: { principal: '800/2024' },
        proceduralTimeline: [],
        challengedActs: [{ authority: 'Segundo Tribunal Colegiado', actDescription: 'Sentencia de amparo directo', page: 1, excerpt: 'SENTENCIA DE AMPARO DIRECTO' }],
        claims: [],
        arguments: ['La consideración constitucional impugnada'],
        evidence: [],
        facts: [],
        rulings: [{ body: 'Sentencia', rulingText: 'No ampara', page: 2 }],
        citations: [],
        proceduralPosture: {
          proceduralWrit: 'sentencia de amparo directo',
          isExtraordinary: true,
          constitutionalIssues: [{
            id: 'issue-1',
            type: 'CONSTITUTIONAL',
            title: 'Cuestión constitucional',
            parameter: 'Parámetro confirmado',
            challengedAct: 'Consideración de la sentencia',
            contradiction: 'Contradicción confirmada',
            affectation: 'Afectación confirmada',
            consequence: 'Efecto solicitado',
            sourceDoc: sentenceSource.id,
            page: 1,
            excerpt: 'SENTENCIA DE AMPARO DIRECTO',
          }],
          legalityIssues: [],
          exceptionalInterest: 'Interés excepcional aportado y pendiente de revisión',
        },
        caseTheory: {
          factualTheory: '', legalTheory: '', constitutionalTheory: '', proceduralTheory: '', opposingTheory: '', vulnerabilities: [], strengths: [],
        },
        argumentAxes: [{
          id: 'axis-1',
          title: 'Argumento confirmado',
          issue: 'Cuestión constitucional',
          facts: ['Hecho confirmado'],
          rules: ['Regla confirmada'],
          reasoning: 'Razonamiento confirmado',
          counterargument: '',
          rebuttal: '',
          requestedConsequence: 'Consecuencia confirmada',
          sources: [{ documentId: sentenceSource.id, page: 1, excerpt: 'SENTENCIA DE AMPARO DIRECTO' }],
        }],
        missingData: [],
        anonymizedData: [],
        unsupportedClaims: [],
      } as any,
    } as any;
    const doc = createEmptyDocument(initial);
    doc.caseAnalysis = initial.caseAnalysis;
    doc.legalBasis = initial.legalBasis;

    const result = runDocumentPreflight(doc, getDocumentTemplate(TARGET_ID), doc.caseAnalysis as any);

    expect(result.status).toBe('READY');
    expect(result.missingFields).toHaveLength(0);
  });

  it('no acepta referencias fabricadas a documentos, páginas o fragmentos inexistentes', () => {
    const doc = createEmptyDocument({
      documentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      parties: { quejoso: 'Parte confirmada', autoridadResponsable: 'Tribunal Colegiado' },
      caseRefs: { expediente: '800/2024', tribunal: 'Tribunal Colegiado' },
      sourceDocuments: [sentenceSource],
      legalBasis: ['Fundamento confirmado'],
    });
    const analysis = {
      authorities: ['Tribunal Colegiado'],
      caseNumbers: { principal: '800/2024' },
      challengedActs: [{ authority: 'Tribunal Colegiado', actDescription: 'Sentencia de amparo directo' }],
      proceduralTimeline: [],
      citations: [],
      rulings: [{ body: 'Sentencia', rulingText: 'No ampara' }],
      proceduralPosture: {
        constitutionalIssues: [{ sourceDoc: 'NO_EXISTE', page: 999, excerpt: 'Fragmento inventado' }],
      },
      argumentAxes: [{ sources: [{ documentId: 'NO_EXISTE', page: 999, excerpt: 'Fragmento inventado' }] }],
    } as any;

    const result = runDocumentPreflight(doc, getDocumentTemplate(TARGET_ID), analysis);

    expect(result.status).toBe('NEEDS_INPUT');
    expect(result.missingFields.map((field) => field.id)).toEqual(expect.arrayContaining(['constitutional_question', 'arguments']));
  });

  it('no hereda texto manual de una demanda al cambiar al template post-sentencia', () => {
    const previousDemandSection = {
      id: 'old-comparecencia',
      type: 'identity' as const,
      title: 'COMPARECENCIA Y PERSONALIDAD',
      order: 1,
      content: [{ id: 'old-block', layer: 'GENERATED_ARGUMENT' as const, trustLevel: 'VERIFIED' as const, text: 'DEMANDA DE AMPARO INDIRECTO. CONCEPTOS DE VIOLACIÓN Y SUSPENSIÓN.', isManuallyEdited: true }],
      isRepeatable: false,
      isEditable: true,
      isGenerated: true,
      isManuallyEdited: true,
      variables: [],
      validationErrors: [],
      validationWarnings: [],
      _templateId: 'demanda_amparo_indirecto',
      _provenance: 'GENERATED' as const,
    };
    const doc = createEmptyDocument({ documentType: TARGET_ID, documentTypeLabel: TARGET_LABEL, sections: [previousDemandSection] });
    const plan = buildDocumentPlan({ doc, template: getDocumentTemplate(TARGET_ID) });
    const comparecencia = plan.sections.find((section) => section.title === 'COMPARECENCIA Y PERSONALIDAD');

    expect(comparecencia?.content.map((block) => block.text).join('\n')).not.toMatch(/DEMANDA DE AMPARO|CONCEPTOS DE VIOLACIÓN|SUSPENSIÓN/i);
  });

  it('no usa demandado como promovente/recurrente y bloquea contenido cross-template', () => {
    const doc = createEmptyDocument({
      documentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      parties: { demandado: 'Demandado no promovente' },
      sections: [{
        id: 'target-body', type: 'argument', title: 'AGRAVIOS / ARGUMENTOS', order: 1,
        content: [{ id: 'target-block', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text: 'DEMANDA DE AMPARO INDIRECTO' }],
        isRepeatable: false, isEditable: true, isGenerated: true, isManuallyEdited: false,
        variables: [], validationErrors: [], validationWarnings: [], _templateId: TARGET_ID, _provenance: 'GENERATED',
      } as any],
    });
    const plan = buildDocumentPlan({ doc, template: getDocumentTemplate(TARGET_ID) });
    const comparecencia = plan.sections.find((section) => section.title === 'COMPARECENCIA Y PERSONALIDAD');
    const comparecenciaText = comparecencia?.content.map((block) => block.text).join('\n') || '';
    const contentCheck = validateForExport(doc);
    const quality = runQualityGateCheck(doc);

    expect(comparecenciaText).not.toContain('Demandado no promovente');
    expect(contentCheck.ok).toBe(false);
    expect(quality.criticalErrors.map((error) => error.checkId)).toContain('POST_SENTENCE_CROSS_TEMPLATE');
  });

  it('impide que un preflight NEEDS_INPUT aislado se convierta en FINAL_DOCUMENT', () => {
    const doc = createEmptyDocument({
      documentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      sections: [{
        id: 'petition', type: 'petition', title: 'PETITORIOS', order: 1,
        content: [{ id: 'petition-block', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text: 'PRIMERO. Tener por presentado este escrito.' }],
        isRepeatable: false, isEditable: true, isGenerated: true, isManuallyEdited: false,
        variables: [], validationErrors: [], validationWarnings: [], _templateId: TARGET_ID, _provenance: 'GENERATED',
      } as any],
    });
    (doc.generationMetadata as any).preflight = { status: 'NEEDS_INPUT', missingFields: [{ label: 'Parte promovente' }] };

    expect(() => markDocumentAsFinal(doc, { explicit: true })).toThrow(/incompleto|pendiente|final/i);
  });

  it('genera un borrador útil del caso sanitizado 800/2024 sin cambiarlo a demanda', async () => {
    const doc = await runGenerationPipeline({
      selectedDocumentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      userInstruction: 'Preparar la respuesta extraordinaria frente a la sentencia de amparo directo.',
      sourceDocuments: [sentenceSource],
      generateSection: async ({ section }: { section: { title: string } }) =>
        `Contenido controlado de ${section.title}.`,
    } as any);

    const titles = doc.sections.map((section) => section.title);
    const text = doc.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');

    expect(doc.documentType).toBe(TARGET_ID);
    expect(doc.templateId).toBe(TARGET_ID);
    expect(doc.caseAnalysis?.caseNumbers.principal).toBe('800/2024');
    expect(doc.proceduralIdentity?.sourceDocumentType).toBe('SENTENCIA_O_RESOLUCION');
    expect((doc.generationMetadata as any).routing).toMatchObject({
      selectedDocumentType: TARGET_ID,
      resolvedStrategy: TARGET_ID,
      resolvedTemplate: TARGET_ID,
      sourceDocumentType: 'SENTENCIA_O_RESOLUCION',
      fallbackUsed: false,
    });
    expect((doc.generationMetadata as any).preflight.status).toBe('NEEDS_INPUT');
    expect(titles).toContain('SENTENCIA DE AMPARO DIRECTO IMPUGNADA');
    expect(titles).not.toContain('CONTESTACIÓN DE HECHOS');
    expect(titles).not.toContain('CONTESTACIÓN DE PRESTACIONES');
    expect(text).not.toMatch(/demanda de amparo (?:directo|indirecto)/i);
    expect(text).not.toMatch(/DEMANDADO.*contesta/i);
    expect((doc.generationMetadata as any).routing.outputFilename).not.toMatch(/demanda/i);
  });

  it('descarta un nombre solicitado incompatible y deriva el filename del template real', () => {
    const routing = resolveDocumentRouting({
      selectedDocumentType: TARGET_ID,
      outputFilename: 'Demanda de Amparo Indirecto.pdf',
    });
    expect(routing.outputFilename).not.toMatch(/demanda/i);
    expect(routing.outputFilename).toMatch(/contestaci[oó]n|revisi[oó]n/i);
  });

  it('recorre el PDF sanitizado real 0129000036717288006AST(1).PDF sin desanonimizar ni cambiar la familia', async () => {
    const extraction = await extractDocument({
      buffer: fs.readFileSync(REAL_PUBLIC_PDF),
      fileName: '0129000036717288006AST(1).PDF',
      mimeType: 'application/pdf',
    });
    const source = createSourceDocument({
      id: 'real-sanitized-sentence',
      filename: extraction.fileName,
      type: extraction.mimeType,
      pages: extraction.pages,
      sourceValidated: extraction.sourceValidated,
      fileSizeBytes: extraction.fileSizeBytes,
    });

    const doc = await runGenerationPipeline({
      selectedDocumentType: TARGET_ID,
      documentTypeLabel: TARGET_LABEL,
      userInstruction: 'Preparar el escrito post-sentencia con base únicamente en la fuente.',
      sourceDocuments: [source],
      generateSection: async ({ section }: { section: { title: string } }) => `Contenido controlado de ${section.title}.`,
    } as any);
    const text = doc.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');

    expect(doc.caseAnalysis?.caseNumbers.principal).toBe('800/2024');
    expect(doc.caseAnalysis?.anonymizedData).toContain('Nombre del promovente');
    expect(doc.proceduralIdentity?.sourceDocumentType).toBe('SENTENCIA_O_RESOLUCION');
    expect(doc.documentType).toBe(TARGET_ID);
    expect(doc.templateId).toBe(TARGET_ID);
    expect(text).not.toMatch(/demanda_amparo_(?:directo|indirecto)|demanda de amparo/i);
    expect(text).not.toContain('***** ******* ********* *****');
    expect((doc.generationMetadata as any).preflight.status).toBe('NEEDS_INPUT');
    expect((doc.generationMetadata as any).routing.outputFilename).not.toMatch(/demanda/i);
  }, 60000);
});
