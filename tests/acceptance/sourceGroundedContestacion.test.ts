import { describe, expect, it, vi } from 'vitest';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import {
  resolveEffectiveIssueGenerationEligibility,
} from '@/lib/legal-engine/issueScopedGeneration';
import type { LegalIssueItem } from '@/lib/legal-engine/legalIssueMatrix';
import { generateSection, type SectionPlan } from '@/lib/legal-engine/pipeline';
import { reconstructCaseAnalysis, type CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { buildGenerationTasksForSection } from '@/lib/legal-engine/generationTasks';

describe('FASE RED: Source-Grounded Contestacion Generation Architecture', () => {
  const mockFacts = [
    { id: 'fact-1', number: '1', text: 'Imputacion inicial de posesion', sourceFact: 'PUNTO 1, UNO DEL CAPITULO DE HECHOS' },
    { id: 'fact-2', number: '2', text: 'Reconocimiento de hecho', sourceFact: 'PUNTO 2, DOS DEL CAPITULO DE HECHOS' },
    { id: 'fact-3', number: '3', text: 'Ocupacion de finca comodato', sourceFact: 'PUNTO 3, TRES... TENGO EN COMODATO' },
    { id: 'fact-4', number: '4', text: 'Desconocimiento por no propio', sourceFact: 'PUNTO 4 CUATRO... DESCONOZCO TAL SITUACION' },
    { id: 'fact-5', number: '5', text: 'Posesion sobre finca vs accion reivindicatoria', sourceFact: 'SITUACION RESPECTO DE LA POSESION' },
    { id: 'fact-6', number: '6', text: 'Improcedencia de reivindicacion', sourceFact: 'TERCER PUNTO PETITORIO... ACCION EQUIVOCADAMENTE INFUNDADA' },
    { id: 'fact-7', number: '7', text: 'Comodato otorgado por Ignacio Lopez Lopez el 15 de junio de 2009', sourceFact: 'DESEO MANIFESTAR... COMODATO 15 DE JUNIO 2009 IGNACIO LOPEZ LOPEZ' },
  ];

  const mockClaims = [
    { id: 'claim-1', number: '1', text: 'Inciso A: Entrega de inmueble' },
    { id: 'claim-2', number: '2', text: 'Inciso B: Pago de frutos y accesiones' },
    { id: 'claim-3', number: '3', text: 'Inciso C: Pago de gastos y costas' },
  ];

  function createContestacionDoc(): any {
    const doc = createEmptyDocument();
    doc.id = 'doc-contestacion-test';
    doc.documentType = 'contestacion_demanda_civil';
    doc.documentTypeLabel = 'Contestacion de Demanda Civil';
    doc.matter = 'civil';
    doc.parties = {
      actor: 'Adjudicataria Sucesoria',
      demandado: 'Pedro Gomez Garcia',
    };
    doc.sections = [
      { id: 'sec-con-proemio', title: 'PROEMIO', type: 'header', order: 10, content: [{ id: 'b1', text: 'PROEMIO', layer: 'USER_POSITION', trustLevel: 'VERIFIED' }] },
      { id: 'sec-con-comparecencia', title: 'COMPARECENCIA Y PERSONALIDAD', type: 'identity', order: 20, content: [{ id: 'b2', text: 'COMPARECENCIA', layer: 'USER_POSITION', trustLevel: 'VERIFIED' }] },
      { id: 'sec-con-hechos', title: 'CONTESTACION DE HECHOS', type: 'background', order: 30, content: [{ id: 'b3', text: '', layer: 'USER_POSITION', trustLevel: 'VERIFIED' }] },
      { id: 'sec-con-prestaciones', title: 'CONTESTACION DE PRESTACIONES', type: 'argument', order: 40, content: [{ id: 'b4', text: '', layer: 'USER_POSITION', trustLevel: 'VERIFIED' }] },
      { id: 'sec-con-excepciones', title: 'EXCEPCIONES Y DEFENSAS', type: 'argument', order: 50, content: [{ id: 'b5', text: '', layer: 'USER_POSITION', trustLevel: 'VERIFIED' }] },
      { id: 'sec-con-pruebas', title: 'PRUEBAS', type: 'evidence', order: 60, content: [{ id: 'b6', text: '', layer: 'USER_POSITION', trustLevel: 'VERIFIED' }] },
      { id: 'sec-con-firma', title: 'FIRMA', type: 'signature', order: 70, content: [{ id: 'b7', text: 'FIRMA', layer: 'USER_POSITION', trustLevel: 'VERIFIED' }] },
    ] as any;
    return doc;
  }

  // PASO 1 — RED: CONTESTACION DE HECHOS
  it('Paso 1: CONTESTACION DE HECHOS debe ser AI-eligible sin researchBundle y asignar factIds', async () => {
    const factIssue: LegalIssueItem = {
      id: 'issue-fact-dispute-1',
      issueType: 'FACT_DISPUTE',
      question: 'El demandado ocupa el inmueble en calidad de comodatario?',
      source: { mode: 'RICH_COVERAGE', coverageItemId: 'cov-fact-3', coverageCategory: 'FACT_RESPONSE', sourceEntityIds: ['fact-3'] },
      coverageItemIds: ['cov-fact-3'],
      claimIds: [],
      factIds: ['fact-3'],
      evidenceMentionIds: [],
      evidenceOfferIds: [],
      argumentIds: [],
      authorityMentionIds: [],
      conflictIds: [],
      missingDataIds: [],
      clientPositionStatus: 'NOT_REQUIRED',
      required: true,
      blocking: false,
      status: 'NEEDS_RESEARCH',
      researchStatus: 'SOURCE_CITED_UNVERIFIED',
      provenance: [],
      relationStatus: 'EXPLICIT',
    };

    // Sin researchBundle externo: una tarea SOURCE_GROUNDED con hechos no debe bloquearse con RESEARCH_BUNDLE_MISSING
    const eligibility = resolveEffectiveIssueGenerationEligibility({
      issue: factIssue,
      researchBundle: undefined,
      derivedReadiness: undefined,
      formal: false,
      taskType: 'FACT_RESPONSE',
    });

    expect(eligibility.eligible).toBe(true);
    expect(eligibility.effectiveStatus).toBe('READY_FOR_GENERATION');
    expect(eligibility.reason).not.toBe('RESEARCH_BUNDLE_MISSING');
  });

  // PASO 2 — RED: CONTESTACION DE PRESTACIONES
  it('Paso 2: CONTESTACION DE PRESTACIONES debe ser SOURCE_GROUNDED sin agrupar en fallback unico', async () => {
    const claimIssue: LegalIssueItem = {
      id: 'issue-claim-response-1',
      issueType: 'CLAIM_ELEMENT',
      question: 'Procede la entrega del inmueble reclamada en la prestacion 1?',
      source: { mode: 'RICH_COVERAGE', coverageItemId: 'cov-claim-1', coverageCategory: 'CLAIM_RESPONSE', sourceEntityIds: ['claim-1'] },
      coverageItemIds: ['cov-claim-1'],
      claimIds: ['claim-1'],
      factIds: ['fact-3'],
      evidenceMentionIds: [],
      evidenceOfferIds: [],
      argumentIds: [],
      authorityMentionIds: [],
      conflictIds: [],
      missingDataIds: [],
      clientPositionStatus: 'NOT_REQUIRED',
      required: true,
      blocking: false,
      status: 'NEEDS_RESEARCH',
      researchStatus: 'SOURCE_CITED_UNVERIFIED',
      provenance: [],
      relationStatus: 'EXPLICIT',
    };

    const eligibility = resolveEffectiveIssueGenerationEligibility({
      issue: claimIssue,
      researchBundle: undefined,
      derivedReadiness: undefined,
      formal: false,
      taskType: 'CLAIM',
    });

    expect(eligibility.eligible).toBe(true);
    expect(eligibility.effectiveStatus).toBe('READY_FOR_GENERATION');
  });

  // PASO 3 — RED: EXCEPCIONES Y DEFENSAS (SOURCE_GROUNDED vs RESEARCH_DEPENDENT)
  it('Paso 3A: Defensa con hechos de fuente es SOURCE_GROUNDED y AI-eligible sin researchBundle', () => {
    const sourceDefenseIssue: LegalIssueItem = {
      id: 'issue-defense-comodato',
      issueType: 'SOURCE_ARGUMENT',
      question: 'Se desvirtua la accion reivindicatoria por existir comodato legitimo?',
      source: { mode: 'RICH_COVERAGE', coverageItemId: 'cov-arg-1', coverageCategory: 'SOURCE_ARGUMENT_RESPONSE', sourceEntityIds: ['fact-3', 'fact-7'] },
      coverageItemIds: ['cov-arg-1'],
      claimIds: ['claim-1'],
      factIds: ['fact-3', 'fact-7'],
      evidenceMentionIds: [],
      evidenceOfferIds: [],
      argumentIds: ['arg-comodato'],
      authorityMentionIds: [],
      conflictIds: [],
      missingDataIds: [],
      clientPositionStatus: 'NOT_REQUIRED',
      required: true,
      blocking: false,
      status: 'READY_FOR_GENERATION',
      researchStatus: 'NOT_REQUIRED',
      provenance: [],
      relationStatus: 'EXPLICIT',
    };

    const eligibility = resolveEffectiveIssueGenerationEligibility({
      issue: sourceDefenseIssue,
      researchBundle: undefined,
      derivedReadiness: undefined,
      formal: false,
      taskType: 'ISSUE',
    });

    expect(eligibility.eligible).toBe(true);
  });

  it('Paso 3B: Tarea que requiere jurisprudencia externa sin researchBundle DEBE seguir fail-closed', () => {
    const researchRequiredIssue: LegalIssueItem = {
      id: 'issue-jurisprudencia-externa',
      issueType: 'AUTHORITY_RESEARCH',
      question: 'Jurisprudencia de la SCJN define legitimacion en la accion reivindicatoria?',
      source: { mode: 'RICH_COVERAGE', coverageItemId: 'cov-auth-1', coverageCategory: 'AUTHORITY_MENTION', sourceEntityIds: ['auth-scjn-1'] },
      coverageItemIds: ['cov-auth-1'],
      claimIds: [],
      factIds: [],
      evidenceMentionIds: [],
      evidenceOfferIds: [],
      argumentIds: [],
      authorityMentionIds: ['auth-scjn-1'],
      conflictIds: [],
      missingDataIds: [],
      clientPositionStatus: 'NOT_REQUIRED',
      required: true,
      blocking: true,
      status: 'NEEDS_RESEARCH',
      researchStatus: 'NEEDS_RESEARCH',
      provenance: [],
      relationStatus: 'EXPLICIT',
    };

    const eligibility = resolveEffectiveIssueGenerationEligibility({
      issue: researchRequiredIssue,
      researchBundle: undefined,
      derivedReadiness: undefined,
      formal: false,
      taskType: 'LEGAL_RESEARCH',
    });

    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toBe('LEGAL_RESEARCH_PLAN_ONLY');
  });

  // PASO 4 — CONTROLES NEGATIVOS
  it('Paso 4A: Secciones ceremoniales (PROEMIO, COMPARECENCIA, FIRMA) deben permanecer deterministicas', async () => {
    const doc = createContestacionDoc();
    const caseAnalysis: Partial<CaseAnalysis> = {
      facts: mockFacts as any,
      arguments: ['Defensa de comodato'],
      claims: mockClaims.map(c => c.text),
      claimResponses: mockClaims as any,
    };

    // PROEMIO (header)
    const proemio = await generateSection(doc, 'sec-con-proemio', undefined, undefined, undefined, undefined, caseAnalysis as any);
    expect(proemio.aiUsed).toBe(false);

    // COMPARECENCIA (identity)
    const comparecencia = await generateSection(doc, 'sec-con-comparecencia', undefined, undefined, undefined, undefined, caseAnalysis as any);
    expect(comparecencia.aiUsed).toBe(false);

    // FIRMA (signature)
    const firma = await generateSection(doc, 'sec-con-firma', undefined, undefined, undefined, undefined, caseAnalysis as any);
    expect(firma.aiUsed).toBe(false);
  });

  it('Paso 4B: Fuente vacia (sin hechos, prestaciones ni evidencia) NO debe habilitar IA para inventar', async () => {
    const doc = createContestacionDoc();
    const emptyAnalysis: Partial<CaseAnalysis> = {
      facts: [],
      arguments: [],
      claims: [],
      claimResponses: [],
      evidence: [],
    };

    const result = await generateSection(doc, 'sec-con-hechos', undefined, undefined, undefined, undefined, emptyAnalysis as any);
    expect(result.aiUsed).toBe(false);
  });

  it('Paso 4C: CONTESTACION DE HECHOS en contestacion debe ser AI eligible si hay hechos en fuente', async () => {
    const doc = createContestacionDoc();
    const caseAnalysis: Partial<CaseAnalysis> = {
      facts: mockFacts as any,
      arguments: ['Defensa de comodato'],
      claims: mockClaims.map(c => c.text),
      claimResponses: mockClaims as any,
    };

    const customGenerator = vi.fn().mockResolvedValue('Contestación detallada a los hechos generada por IA');
    const result = await generateSection(
      doc,
      'sec-con-hechos',
      undefined,
      customGenerator,
      undefined,
      undefined,
      caseAnalysis as any
    );

    // When facts are present in source, CONTESTACION DE HECHOS must be AI-eligible and invoke generator
    expect(result.aiUsed).toBe(true);
    expect(customGenerator).toHaveBeenCalled();
  });

  it('Paso 4D: CONTESTACION DE PRESTACIONES en contestacion debe ser AI eligible si hay prestaciones', async () => {
    const doc = createContestacionDoc();
    const caseAnalysis: Partial<CaseAnalysis> = {
      facts: mockFacts as any,
      arguments: ['Defensa de comodato'],
      claims: mockClaims.map(c => c.text),
      claimResponses: mockClaims as any,
    };

    const customGenerator = vi.fn().mockResolvedValue('Contestación detallada a las prestaciones generada por IA');
    const result = await generateSection(
      doc,
      'sec-con-prestaciones',
      undefined,
      customGenerator,
      undefined,
      undefined,
      caseAnalysis as any
    );

    // When claims are present in source, CONTESTACION DE PRESTACIONES must be AI-eligible and invoke generator
    expect(result.aiUsed).toBe(true);
    expect(customGenerator).toHaveBeenCalled();
  });

  it('Paso 5: buildGenerationTasksForSection debe poblar sourceDocIds en todas las tareas generadas', () => {
    const doc = createContestacionDoc();
    doc.sourceDocuments = [{ id: 'doc-source-1', name: 'demanda.docx' } as any];
    const sectionPlan = {
      templateSectionId: 'sec-con-hechos',
      title: 'CONTESTACIÓN DE HECHOS',
      objective: 'Contestar hechos',
      factResponsePlans: [
        {
          factId: 'fact-1',
          factNumber: '1',
          factText: 'El actor afirma ser propietario.',
          responseKind: 'FALSO',
        },
      ],
    } as any;

    const tasks = buildGenerationTasksForSection(sectionPlan, doc);
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(task.sourceDocIds).toBeDefined();
      expect(task.sourceDocIds).toEqual(['doc-source-1']);
    }
  });

  it('Paso 6: reconstructCaseAnalysis debe extraer hechos y prestaciones con encabezados reales de contestación', async () => {
    const sampleContestacionText = `
JUICIO ORDINARIO CIVIL
EXPEDIENTE: 123/2024

C. JUEZ DE LO CIVIL

CONTESTACION DE PRESTACIONES.
A) Se niega que el actor tenga derecho a la reivindicación.
B) Se niega la entrega del bien inmueble.
C) Se niegan los gastos y costas.

Y POR OTRO LADO, DOY CONTESTACION A LOS HECHOS.
1.- El hecho uno es falso, toda vez que existe un contrato de comodato.
2.- El hecho dos ni se afirma ni se niega por no ser propio.
3.- El hecho tres es cierto en cuanto a la fecha.

DERECHO
Aplican los artículos del Código Civil.
`;

    const analysis = reconstructCaseAnalysis([
      {
        id: 'doc-contestacion-1',
        filename: 'contestacion.docx',
        extractedText: sampleContestacionText,
        type: 'docx',
      } as any,
    ]);

    expect(analysis.facts.length).toBe(3);
    expect(analysis.facts[0].text).toContain('comodato');
    expect(analysis.claims.length).toBe(3);
    expect(analysis.claims[0]).toContain('reivindicación');
  });
});

