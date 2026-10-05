import { describe, it, expect } from 'vitest';
import { buildSupportedExpansionPrompt, buildExpansionPrompt } from '@/lib/legal-engine/generationExpansion';
import { buildIssuePrompt, buildIssueContextPack } from '@/lib/legal-engine/issueScopedGeneration';
import type { UniversalLegalDocument, DocumentNode } from '@/lib/legal-engine/types';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { LegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import type { GenerationTask } from '@/lib/legal-engine/generationTasks';

describe('Contrato A — Postura Defensiva Automática (Reglas PERMITIDO y PROHIBIDO)', () => {
  const syntheticDoc: UniversalLegalDocument = {
    id: 'doc-defensive-test',
    documentType: 'contestacion_demanda_laboral',
    documentTypeLabel: 'Contestación Laboral',
    matter: 'Laboral',
    status: 'draft',
    lifecycle: 'draft',
    sections: [
      {
        id: 'sec-hechos',
        type: 'background',
        title: 'CONTESTACIÓN DE HECHOS',
        order: 1,
        content: [{
          id: 'blk-1',
          text: 'Texto previo',
          layer: 'GENERATED_ARGUMENT',
          trustLevel: 'AI_INFERENCE',
          provenance: 'AI_GENERATED',
          generationStatus: 'generated',
          generationRequirement: 'AI_REQUIRED',
        }],
        isRepeatable: false,
        isEditable: true,
        isGenerated: false,
        isManuallyEdited: false,
        variables: [],
        validationErrors: [],
        validationWarnings: [],
      } as DocumentNode,
      {
        id: 'sec-excepciones',
        type: 'argument',
        title: 'EXCEPCIONES Y DEFENSAS',
        order: 2,
        content: [{
          id: 'blk-2',
          text: 'Texto previo excepciones',
          layer: 'GENERATED_ARGUMENT',
          trustLevel: 'AI_INFERENCE',
          provenance: 'AI_GENERATED',
          generationStatus: 'generated',
          generationRequirement: 'AI_REQUIRED',
        }],
        isRepeatable: false,
        isEditable: true,
        isGenerated: false,
        isManuallyEdited: false,
        variables: [],
        validationErrors: [],
        validationWarnings: [],
      } as DocumentNode,
    ],
    parties: { actor: 'TRABAJADOR', demandado: 'EMPRESA' },
    variables: [],
    generationStatus: 'draft',
    sourceDocuments: [{ id: 'source-1', name: 'demanda.docx' } as any],
  } as any;

  const syntheticAnalysis: CaseAnalysis = {
    facts: [
      { id: 'fact-1', number: '1', text: 'El trabajador afirma despido injustificado el 01/07/2025', confidence: 0.9, documentId: 'source-1', lawyerPosition: 'UNDEFINED' },
    ],
    richCaseAnalysis: {
      facts: [
        { id: 'fact-1', proposition: 'El trabajador afirma despido injustificado el 01/07/2025', assertionStatus: 'EXTRACTED', provenance: [] },
      ],
      claims: [
        { id: 'claim-1', requestedRelief: 'Indemnización constitucional', status: 'EXTRACTED', provenance: [{ sourceId: 'source-1' }] },
      ],
      evidenceMentions: [],
      evidenceOffers: [],
      arguments: [],
      authorities: [],
      clientPosition: { status: 'UNKNOWN', propositionIds: [] },
    } as any,
  } as any;

  it('buildSupportedExpansionPrompt incluye cláusulas estrictas de PERMITIDO y PROHIBIDO cuando no hay postura confirmada', () => {
    const packet = {
      sectionId: 'sec-hechos',
      coverageItemIds: ['cov-1'],
      factIds: ['fact-1'],
      evidenceIds: [],
      authorityIds: [],
      legalIssueIds: [],
      sourceIds: ['source-1'],
      facts: ['fact-1 (postura confirmada: CARGA_PROBATORIA_Y_FALTA_DE_ACREDITACION): El trabajador afirma despido injustificado el 01/07/2025'],
      evidence: [],
      authorities: [],
    };
    const contract = {
      sectionWordTargets: { 'sec-hechos': 1500 },
    } as any;

    const prompt = buildSupportedExpansionPrompt(syntheticDoc, syntheticDoc.sections[0]!, packet, contract);

    // Verificación de PROHIBICIONES expresas
    expect(prompt).toMatch(/PROHIBIDO|NO INVENTES/i);
    expect(prompt).toMatch(/versión del demandado|versi[oó]n f[aá]ctica/i);
    expect(prompt).toMatch(/terminaci[oó]n laboral|documentos inexistentes|contratos temporales/i);

    // Verificación de PERMISOS legítimos
    expect(prompt).toMatch(/carga de la prueba|acreditaci[oó]n/i);
    expect(prompt).toMatch(/suficiencia|presupuestos legales|alcance probatorio/i);
  });

  it('buildExpansionPrompt incluye cláusulas estrictas de PERMITIDO y PROHIBIDO contra invención de hechos de descargo', () => {
    const contract = {
      sectionWordTargets: { 'sec-excepciones': 2000 },
    } as any;

    const prompt = buildExpansionPrompt(syntheticDoc, syntheticDoc.sections[1]!, syntheticAnalysis, contract);

    // PROHIBICIONES
    expect(prompt).toMatch(/PROHIBIDO|TERMINANTEMENTE PROHIBIDO/i);
    expect(prompt).toMatch(/versión del demandado|acontecimientos|documentos/i);

    // PERMITIDO
    expect(prompt).toMatch(/carga de la prueba|presupuestos legales|refutaci[oó]n/i);
  });

  it('buildIssuePrompt incluye directiva de defensa sin instrucción cuando clientPosition es UNKNOWN', () => {
    const task: GenerationTask = {
      id: 'task-issue-1',
      sectionId: 'sec-excepciones',
      sectionTitle: 'EXCEPCIONES Y DEFENSAS',
      taskType: 'SECTION_SUPPORT',
      type: 'SECTION_SUPPORT',
      legalIssueIds: ['issue-1'],
      coverageItemIds: ['cov-1'],
      complexity: 'MEDIUM',
      tokenBudget: 2000,
      status: 'pending',
    };

    const matrix: LegalIssueMatrix = {
      documentId: syntheticDoc.id,
      documentType: syntheticDoc.documentType,
      issues: [
        {
          id: 'issue-1',
          issueType: 'FACT_DISPUTE',
          question: '¿Se acredita el despido injustificado?',
          status: 'GENERATABLE_REQUIRES_REVIEW',
          relationStatus: 'EXPLICIT',
          claimIds: ['claim-1'],
          factIds: ['fact-1'],
          evidenceMentionIds: [],
          evidenceOfferIds: [],
          argumentIds: [],
          authorityMentionIds: [],
          coverageItemIds: ['cov-1'],
          required: true,
          provenance: [{ sourceId: 'source-1' }],
        },
      ],
    } as any;

    const docWithMatrix: UniversalLegalDocument = {
      ...syntheticDoc,
      coverageMatrix: {
        items: [
          {
            id: 'cov-1',
            status: 'pending',
            required: true,
            targetSectionIds: ['sec-excepciones'],
            category: 'FACT_RESPONSE',
            description: 'Contestar hecho 1',
            sourceId: 'source-1',
            provenance: [{ sourceId: 'source-1' }],
          },
        ],
      } as any,
    };

    const pack = buildIssueContextPack(task, docWithMatrix, syntheticAnalysis, matrix);
    const issuePrompt = buildIssuePrompt(pack, task);

    expect(issuePrompt.systemPrompt).toMatch(/POSTURA DEFENSIVA|DEFENSA SIN INSTRUCCI[OÓ]N/i);
    expect(issuePrompt.systemPrompt).toMatch(/PROHIBIDO|NO INVENTES/i);
    expect(issuePrompt.systemPrompt).toMatch(/versi[oó]n del demandado|contratos temporales|documentos/i);
  });
});
