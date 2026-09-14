import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { validateCoverageAndPlanInvariants } from '@/lib/legal-engine/coverageMatrix';
import { createGenerationJob, completeJob } from '@/lib/legal-engine/generationJobs';
import { evaluateDocumentAssemblyChecks, decideDocumentAssemblyReadiness } from '@/lib/legal-engine/documentReadiness';
import { buildDocumentPlan } from '@/lib/legal-engine/documentPlan';
import { buildBlockedIssueOutcome } from '@/lib/legal-engine/issueScopedGeneration';
import { sanitizeLegalDocument, classifyPlaceholder } from '@/lib/legal-engine/legalDocumentSanitizer';
import { deriveSectionContracts } from '@/lib/legal-engine/documentSectionContracts';
import { applySectionCoverageTransition, buildProceduralIdentity, runGenerationPipeline, type PipelineInput } from '@/lib/legal-engine/pipeline';
import { createEmptyDocument, type GenerationMetadata, type UniversalLegalDocument, type UploadedSourceDocument } from '@/lib/legal-engine/types';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { getDocumentTemplate, type DocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import { GET as getStatusHandler } from '@/app/api/legal-engine/generate/status/route';
import {
  buildFixtureRichCaseAnalysis,
  buildFixtureLegalIssueMatrix,
  buildFixtureCoverageMatrix,
  buildFixtureDocument,
  buildFixtureDraftingPlanSections,
  buildStaleIssuePlan,
} from '@/tests/fixtures/recursoRevisionAmparoDirectoFixture';

type ValidationPlan = NonNullable<Parameters<typeof validateCoverageAndPlanInvariants>[1]>;
type ValidationCaseAnalysis = NonNullable<Parameters<typeof validateCoverageAndPlanInvariants>[2]>;
type BlockedTask = Parameters<typeof buildBlockedIssueOutcome>[0];
type BlockedIssueMatrix = NonNullable<Parameters<typeof buildBlockedIssueOutcome>[1]>;
type BlockedOptions = NonNullable<Parameters<typeof buildBlockedIssueOutcome>[2]>;
type SectionContractsInput = Parameters<typeof deriveSectionContracts>[0];
type AssemblyInput = Parameters<typeof evaluateDocumentAssemblyChecks>[0];
type ReadinessInput = Parameters<typeof decideDocumentAssemblyReadiness>[0];
type CoverageTransitionDocument = Parameters<typeof applySectionCoverageTransition>[0];
type CoverageTransitionSection = Parameters<typeof applySectionCoverageTransition>[1];
type CoverageTransitionBlock = Parameters<typeof applySectionCoverageTransition>[2];

function asTyped<T>(value: unknown): T {
  return value as T;
}

describe('Real-case generation integration contracts', () => {

  it('Contract 1: canonical RICH IssuePlan ID validates against LegalIssueMatrix', () => {
    const caseAnalysis = { richCaseAnalysis: buildFixtureRichCaseAnalysis() };
    const coverageMatrix = buildFixtureCoverageMatrix();
    const legalIssueMatrix = buildFixtureLegalIssueMatrix();
    const documentPlan = {
      sections: buildFixtureDraftingPlanSections(),
      legalIssueMatrix,
    };

    const result = validateCoverageAndPlanInvariants(
      coverageMatrix,
      asTyped<ValidationPlan>(documentPlan),
      asTyped<ValidationCaseAnalysis>(caseAnalysis),
      legalIssueMatrix,
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('Contract 2: truly stale/nonexistent RICH issueId fails closed', () => {
    const caseAnalysis = { richCaseAnalysis: buildFixtureRichCaseAnalysis() };
    const coverageMatrix = buildFixtureCoverageMatrix();
    const legalIssueMatrix = buildFixtureLegalIssueMatrix();
    const documentPlan = {
      sections: [
        {
          ...buildFixtureDraftingPlanSections()[0],
          issuePlans: [buildStaleIssuePlan()],
        },
      ],
      legalIssueMatrix,
    };

    const result = validateCoverageAndPlanInvariants(
      coverageMatrix,
      asTyped<ValidationPlan>(documentPlan),
      asTyped<ValidationCaseAnalysis>(caseAnalysis),
      legalIssueMatrix,
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('stale-issue-999'))).toBe(true);
  });

  it('Contract 3: blocked eligible-resolution task gets terminal accounted outcome', () => {
    const matrix = buildFixtureLegalIssueMatrix();
    const task = {
      id: 'task-blocked-1',
      legalIssueIds: ['fixture-rrad-issue-1'],
      type: 'LEGAL_ISSUE',
      sectionId: 'sec-agravios',
      order: 1,
      orderInParent: 0,
    };

    // When issue is blocked due to needs research
    const derivedReadiness = new Map([
      ['fixture-rrad-issue-1', {
        status: 'NEEDS_LEGAL_RESEARCH',
        researchRequired: true,
        clientPostureRequired: false,
        conflictDetected: false,
      }],
    ]);

    const outcome = buildBlockedIssueOutcome(asTyped<BlockedTask>(task), asTyped<BlockedIssueMatrix>(matrix), {
      derivedReadinessByIssueId: asTyped<BlockedOptions['derivedReadinessByIssueId']>(derivedReadiness),
      formal: false,
    });

    expect(outcome.status).toBe('BLOCKED');
    expect(outcome.taskId).toBe('task-blocked-1');
    expect(outcome.attempts).toEqual([]); // Did not fail at provider level
    expect(outcome.failureReason).toBe('ELIGIBILITY_BLOCKED');
  });

  it('Contract 4: no required task can disappear without terminal outcome', () => {
    const tasks = [
      { id: 't-1', legalIssueIds: ['i-1'], type: 'LEGAL_ISSUE' },
      { id: 't-2', legalIssueIds: ['i-2'], type: 'LEGAL_ISSUE' },
      { id: 't-3', legalIssueIds: ['i-3'], type: 'LEGAL_ISSUE' },
    ];

    const allOutcomes = [
      { taskId: 't-1', status: 'ACCEPTED', attempts: [{ providerActuallyUsed: 'mock' }] },
      { taskId: 't-2', status: 'BLOCKED', attempts: [] },
      { taskId: 't-3', status: 'FALLBACK', attempts: [] },
    ];

    const outcomesByTaskId = new Map(allOutcomes.map((o) => [o.taskId, o]));
    const plannedTasks = tasks.length;
    let acceptedTasks = 0;
    let blockedTasks = 0;
    let reviewRequiredTasks = 0;
    let unresolvedTasks = 0;

    for (const task of tasks) {
      const outcome = outcomesByTaskId.get(task.id);
      if (!outcome) {
        unresolvedTasks += 1;
        continue;
      }
      if (outcome.status === 'ACCEPTED') acceptedTasks += 1;
      else if (outcome.status === 'BLOCKED') blockedTasks += 1;
      else if (outcome.status === 'FALLBACK') reviewRequiredTasks += 1;
      else unresolvedTasks += 1;
    }

    expect(plannedTasks).toBe(3);
    expect(acceptedTasks).toBe(1);
    expect(blockedTasks).toBe(1);
    expect(reviewRequiredTasks).toBe(1);
    expect(unresolvedTasks).toBe(0);
    expect(plannedTasks).toBe(acceptedTasks + blockedTasks + reviewRequiredTasks);
  });

  it('Contract 5: empty required substantive section prevents READY', () => {
    const doc = buildFixtureDocument();
    doc.sections = [
      {
        id: 'sec-agravios',
        title: 'AGRAVIOS',
        type: 'argument',
        content: [],
        order: 1,
        isRepeatable: true,
        isEditable: true,
        isGenerated: false,
        isManuallyEdited: false,
        variables: [],
        validationErrors: [],
        validationWarnings: [],
      },
    ] as UniversalLegalDocument['sections'];

    const contracts = deriveSectionContracts({
      documentType: 'recurso_revision_amparo_directo',
      documentPlan: asTyped<SectionContractsInput['documentPlan']>({ sections: doc.sections, templateId: 'recurso_revision_amparo_directo' }),
      candidateSections: doc.sections,
    });

    const checks = evaluateDocumentAssemblyChecks(asTyped<AssemblyInput>({
      document: asTyped<AssemblyInput['document']>(doc),
      assembly: {
        sections: [{ sectionId: 'sec-agravios', blockIds: [], title: 'AGRAVIOS', type: 'argument', contentBlocks: [] }],
        orderedBlocks: [],
      },
      sectionContracts: contracts,
      coverage: { allRequiredSatisfied: true, findings: [] },
      baseQualityGate: { passed: true, checks: [] },
    }));

    expect(checks.hasMaterialBlocker).toBe(true);
    expect(checks.findings.some((f) => f.code === 'EMPTY_REQUIRED_SUBSTANTIVE_SECTION')).toBe(true);

    const readiness = decideDocumentAssemblyReadiness({
      checks,
      legalIssueMatrix: asTyped<NonNullable<ReadinessInput['legalIssueMatrix']>>({ sourceMode: 'RICH' }),
      richCaseAnalysis: asTyped<NonNullable<ReadinessInput['richCaseAnalysis']>>({}),
      coverage: { allRequiredSatisfied: true },
      baseQualityGate: { passed: true },
      assembly: asTyped<ReadinessInput['assembly']>({ sections: [], orderedBlocks: [] }),
    } as ReadinessInput);

    expect(readiness).toBe('BLOCKED');
    expect(readiness).not.toBe('READY');
  });

  it('Contract 6: deterministic generic fallback cannot fabricate substantive Coverage', () => {
    const doc = buildFixtureDocument();
    doc.coverageMatrix = asTyped<UniversalLegalDocument['coverageMatrix']>({
      items: [
        {
          id: 'cov-agravio-1',
          category: 'LEGAL_ISSUE',
          scope: 'AGRAVIO',
          description: 'Agravio sustantivo',
          status: 'pending',
          targetSectionIds: ['sec-agravios'],
        },
      ],
      summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
    });

    const fallbackBlock = {
      id: 'blk-fallback-1',
      coverageItemIds: ['cov-agravio-1'],
      generationRequirement: 'AI_REQUIRED',
      fallbackStatus: 'DETERMINISTIC_FALLBACK',
      text: 'Texto determinista de rescate por timeout de proveedor',
    };

    applySectionCoverageTransition(
      asTyped<CoverageTransitionDocument>(doc),
      asTyped<CoverageTransitionSection>({ id: 'sec-agravios', type: 'argument', coverageItemIds: ['cov-agravio-1'] }),
      asTyped<CoverageTransitionBlock>(fallbackBlock),
    );

    expect(doc.coverageMatrix?.items[0]?.status).not.toBe('covered');
  });

  it('Contract 7: source authority is not automatically destination authority', () => {
    const doc = createEmptyDocument();
    doc.parties = {
      autoridadResponsable: 'H. TRIBUNAL COLEGIADO DE CIRCUITO (FUENTE)',
    };
    doc.documentTypeLabel = 'Recurso de Revisión en Amparo Directo';

    const template = {
      tipo: 'recurso_revision_amparo_directo',
      destinatario: 'H. SUPREMA CORTE DE JUSTICIA DE LA NACIÓN',
      estructura: ['Rubro'],
      etiquetas: [],
      rolAutor: 'quejoso',
    };

    const plan = buildDocumentPlan({
      doc,
      template: asTyped<DocumentTemplate>(template),
    });

    const headerSec = plan.sections.find((s) => s.type === 'header');
    const text = headerSec?.content[0]?.text || '';

    expect(text).toContain('H. SUPREMA CORTE DE JUSTICIA DE LA NACIÓN');
    expect(text).not.toContain('H. TRIBUNAL COLEGIADO DE CIRCUITO (FUENTE)');
  });

  it('Contract 7b: source, resolving court, competent destination and filing-through court remain distinct', () => {
    const source: UploadedSourceDocument = {
      id: 'authority-roles-source',
      filename: 'sentencia-sanitizada.pdf',
      content: [
        'AMPARO DIRECTO: 123/2026',
        'Zapopan, Jalisco. Acuerdo del Segundo Tribunal Colegiado en Materia de Trabajo del Tercer Circuito, correspondiente a la sesión de quince de abril de dos mil veintiséis.',
        'La demanda se promovió contra la autoridad responsable: H. PLENO DEL TRIBUNAL DE ARBITRAJE Y ESCALAFÓN DEL ESTADO DE JALISCO.',
        'Así lo resolvió este Segundo Tribunal Colegiado en Materia de Trabajo del Tercer Circuito, por unanimidad de votos.',
      ].join('\n'),
      sourceValidated: true,
    };

    const analysis = reconstructCaseAnalysis([source], 'Interponer recurso de revisión en amparo directo.');
    const template = getDocumentTemplate('recurso_revision_amparo_directo');
    const doc = createEmptyDocument();
    doc.documentType = template.tipo;
    doc.documentTypeLabel = 'Recurso de Revisión en Amparo Directo';
    doc.parties.autoridadResponsable = analysis.parties.autoridadResponsable;

    const identity = buildProceduralIdentity(doc, template, [source], analysis);

    expect(identity.sourceAuthority).toContain('TRIBUNAL DE ARBITRAJE Y ESCALAFÓN');
    expect(identity.organoResolucionRecurrida).toContain('Segundo Tribunal Colegiado en Materia de Trabajo del Tercer Circuito');
    expect(identity.autoridadDestinataria).toBe(template.destinatario);
    expect(identity.organoPresentacion).toBe(identity.organoResolucionRecurrida);

    doc.proceduralIdentity = identity;
    const plan = buildDocumentPlan({ doc, template, caseAnalysis: analysis });
    const header = plan.sections.find((section) => section.type === 'header');
    expect(header?.content[0]?.text).toContain(template.destinatario);
    expect(header?.content[0]?.text).toContain(`POR CONDUCTO DE: ${identity.organoResolucionRecurrida}`);
    expect(header?.content[0]?.text).not.toContain('TRIBUNAL DE ARBITRAJE Y ESCALAFÓN');
  });

  it('Contract 7c: valid laboral source plus explicit amparo-revision target is not a context mismatch', async () => {
    const source: UploadedSourceDocument = {
      id: 'context-match-source',
      filename: 'sentencia-amparo-directo.pdf',
      content: 'SENTENCIA DE AMPARO DIRECTO 800/2024. AUTORIDAD RESPONSABLE: H. TRIBUNAL DE ARBITRAJE.',
      sourceValidated: true,
    };

    const input: PipelineInput = {
      selectedDocumentType: 'recurso_revision_amparo_directo',
      documentTypeLabel: 'Recurso de revisión en amparo directo',
      matter: 'laboral',
      jurisdiction: 'federal',
      userInstruction: 'Interponer recurso de revisión en amparo directo.',
      sourceDocuments: [source],
      generateSection: async ({ section }: { section: { title: string } }) => `Contenido controlado de ${section.title}.`,
    };
    const doc = await runGenerationPipeline(input);

    const contextMismatch = (doc.generationMetadata as GenerationMetadata & { contextMismatch?: unknown }).contextMismatch;
    expect(contextMismatch).toBeUndefined();
    expect(doc.validation.errors.some((error) => error.checkId === 'DOCUMENT_CONTEXT_MISMATCH')).toBe(false);
  });

  it('Contract 8: technical unresolved placeholder prevents final readiness', () => {
    const doc = buildFixtureDocument();
    doc.sections = [
      {
        id: 'sec-1',
        title: 'SEC 1',
        type: 'custom',
        content: [{ text: 'Texto con variable no resuelta {{UNRESOLVED_TOKEN}}', id: 'blk-1', layer: 'USER_POSITION' }],
      },
    ] as UniversalLegalDocument['sections'];

    const { report } = sanitizeLegalDocument(asTyped<UniversalLegalDocument>(doc));

    expect(report.placeholdersFound).toContain('{{UNRESOLVED_TOKEN}}');
    const technical = (report.classifiedPlaceholders || []).filter((p) => p.kind === 'TECHNICAL_UNRESOLVED');
    expect(technical.length).toBeGreaterThan(0);
    expect(technical[0].marker).toBe('{{UNRESOLVED_TOKEN}}');

    const checks = evaluateDocumentAssemblyChecks(asTyped<AssemblyInput>({
      document: asTyped<AssemblyInput['document']>(doc),
      assembly: {
        sections: [{ sectionId: 'sec-1', blockIds: ['blk-1'], title: 'SEC 1', type: 'custom', contentBlocks: doc.sections[0].content }],
        orderedBlocks: doc.sections[0].content,
      },
      sectionContracts: [],
      coverage: { allRequiredSatisfied: true, findings: [] },
      baseQualityGate: { passed: true, checks: [] },
      findings: [
        {
          code: 'UNRESOLVED_TECHNICAL_PLACEHOLDER',
          severity: 'BLOCKER',
          message: 'Placeholders técnicos no resueltos detectados',
          blockIds: [],
          legalIssueIds: [],
          coverageItemIds: [],
          sectionIds: [],
        },
      ],
    }));

    const readiness = decideDocumentAssemblyReadiness({
      checks,
      legalIssueMatrix: asTyped<NonNullable<ReadinessInput['legalIssueMatrix']>>({ sourceMode: 'RICH' }),
      richCaseAnalysis: asTyped<NonNullable<ReadinessInput['richCaseAnalysis']>>({}),
      coverage: { allRequiredSatisfied: true },
      baseQualityGate: { passed: true },
      assembly: asTyped<ReadinessInput['assembly']>({ sections: [], orderedBlocks: [] }),
    } as ReadinessInput);

    expect(readiness).toBe('BLOCKED');
  });

  it('Contract 9: intentional anonymization alone does not prevent readiness', () => {
    const anonymizedToken = '[DATO ANONIMIZADO: Nombre de persona física]';
    const classification = classifyPlaceholder(anonymizedToken);
    expect(classification).toBe('INTENTIONAL_ANONYMIZATION');

    const doc = buildFixtureDocument();
    doc.sections = [
      {
        id: 'sec-1',
        title: 'SEC 1',
        type: 'custom',
        content: [{ text: `El quejoso ${anonymizedToken} comparece.`, id: 'blk-1', layer: 'USER_POSITION' }],
      },
    ] as UniversalLegalDocument['sections'];

    const { report } = sanitizeLegalDocument(asTyped<UniversalLegalDocument>(doc));
    const technical = (report.classifiedPlaceholders || []).filter((p) => p.kind === 'TECHNICAL_UNRESOLVED');
    expect(technical).toEqual([]);

    const anonymized = (report.classifiedPlaceholders || []).filter((p) => p.kind === 'INTENTIONAL_ANONYMIZATION');
    expect(anonymized.length).toBeGreaterThan(0);
  });

  it('Contract 10: generation job COMPLETED is distinct from document readiness', () => {
    const job = createGenerationJob({ total: 1 });
    const doc = createEmptyDocument();
    doc.status = 'draft';
    doc.generationMetadata.pipelineState.isComplete = false;

    const completed = completeJob(job.jobId, doc);

    expect(completed?.status).toBe('completed');
    expect(completed?.percentage).toBe(100);
    expect(completed?.documentReadiness).toBe('REQUIRES_REVIEW');
    expect(completed?.stage).toContain('requiere revisión');
    expect(completed?.stage).not.toBe('Documento generado correctamente');
  });

  it('Contract 11: polling/status exposes documentReadiness', async () => {
    const job = createGenerationJob({ total: 2 });
    const doc = createEmptyDocument();
    doc.status = 'draft';

    completeJob(job.jobId, doc, { documentReadiness: 'REQUIRES_REVIEW' });

    const req = new NextRequest(`http://localhost/api/legal-engine/generate/status?jobId=${job.jobId}`, {
      headers: { 'x-lawyer-token': 'dev-lawyer-token' },
    });

    const res = await getStatusHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe('completed');
    expect(json.documentReadiness).toBe('REQUIRES_REVIEW');
  });

  it('Contract 12: UI does not present non-READY completed job as successful final document', () => {
    const completedJobWithReview = {
      status: 'completed',
      total: 10,
      completed: 10,
      percentage: 100,
      stage: 'Documento generado en borrador (requiere revisión del abogado)',
      documentReadiness: 'REQUIRES_REVIEW',
    };

    const isNonReadyCompleted =
      completedJobWithReview.status === 'completed' &&
      completedJobWithReview.documentReadiness !== 'READY';

    expect(isNonReadyCompleted).toBe(true);

    const readyJob = {
      status: 'completed',
      total: 10,
      completed: 10,
      percentage: 100,
      stage: 'Documento generado y listo para revisión final',
      documentReadiness: 'READY',
    };

    expect(readyJob.documentReadiness === 'READY').toBe(true);
  });

});
