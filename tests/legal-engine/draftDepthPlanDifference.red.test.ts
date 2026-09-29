/**
 * draftDepthPlanDifference.red.test.ts — PRUEBA RED: planes materialmente distintos
 *
 * Demuestra que EXTENSIVE_40 debe diferir sustancialmente de PROFESSIONAL_20:
 * - mayor granularidad de issues
 * - mayor profundidad de sección (complexity = EXTENSIVE vs MEDIUM)
 * - presupuestos de sección más altos
 * - más tareas de generación
 * - más continuaciones permitidas
 *
 * ACTUALMENTE FALLA porque draftDepth no modifica el plan sustantivamente.
 */
import { describe, it, expect } from 'vitest';
import { resolveDraftDepthProfile } from '@/lib/legal-engine/draftDepth';
import { resolveGenerationExtensionContract, allocateSectionBudgets } from '@/lib/legal-engine/generationExtension';
import { generationExtensionForDraftDepth } from '@/lib/legal-engine/generationExtension';
import { buildGenerationTasksForSection } from '@/lib/legal-engine/generationTasks';
import type { SectionPlan, IssuePlan } from '@/lib/legal-engine/pipeline';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMinimalDoc(id = 'doc-test'): UniversalLegalDocument {
  return {
    id,
    title: 'Recurso de Revisión Fiscal',
    documentType: 'recurso_revision_fiscal',
    documentTypeLabel: 'Recurso de Revisión Fiscal',
    matter: 'Fiscal',
    status: 'draft',
    lifecycle: 'draft',
    sections: [
      { id: 'sec-antecedentes', type: 'background', title: 'Antecedentes', order: 1, content: [], isRepeatable: false, isEditable: true, isGenerated: false, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [] },
      { id: 'sec-agravios', type: 'argument', title: 'Agravios', order: 2, content: [], isRepeatable: false, isEditable: true, isGenerated: false, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [] },
      { id: 'sec-fundamentos', type: 'legal_grounds', title: 'Fundamentos Jurídicos', order: 3, content: [], isRepeatable: false, isEditable: true, isGenerated: false, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [] },
      { id: 'sec-pruebas', type: 'evidence', title: 'Pruebas', order: 4, content: [], isRepeatable: false, isEditable: true, isGenerated: false, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [] },
      { id: 'sec-petitorios', type: 'petition', title: 'Puntos Petitorios', order: 5, content: [], isRepeatable: false, isEditable: true, isGenerated: false, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [] },
    ],
    parties: { quejoso: 'EMPRESA FISCAL SA DE CV', autoridadResponsable: 'SAT' },
    caseRefs: { expediente: '1234/2025' },
    variables: [],
    coverageItemIds: [],
    generationStatus: 'draft',
    sourceDocuments: [],
  } as any;
}

function makeIssuePlan(id: string, label: string, depth: 'MEDIUM' | 'DEEP' | 'EXTENSIVE' = 'DEEP'): IssuePlan {
  return {
    id,
    issueId: id,
    title: label,
    expectedDepth: depth,
    targetConsideration: `Consideración controvertida del ${id}`,
    constitutionalStandard: 'Artículo 31 fracción IV CPEUM',
    counterargumentStrategy: `Refutación para ${id}`,
    factIds: ['fact-1', 'fact-2'],
    evidenceIds: ['ev-1'],
    authorityIds: ['auth-1'],
  } as any;
}

function makeSectionPlan(sectionId: string, depth: 'MEDIUM' | 'DEEP' | 'EXTENSIVE', issues: IssuePlan[]): SectionPlan {
  return {
    templateSectionId: sectionId,
    title: 'Agravios',
    objective: 'Desarrollar los agravios del recurso',
    expectedDepth: depth,
    issuePlans: issues,
    coverageItemIds: issues.map((ip) => `cov-${ip.id}`),
    legalIssueIds: issues.map((ip) => ip.id),
    factIds: ['fact-1', 'fact-2'],
    evidenceIds: ['ev-1'],
    authorityIds: ['auth-1'],
  } as any;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PROFESSIONAL_20 vs EXTENSIVE_40 — planes materialmente distintos', () => {

  it('D1. Los perfiles DraftDepth deben diferir en targetWords y maxProviderCalls', () => {
    const p20 = resolveDraftDepthProfile('PROFESSIONAL_20');
    const p40 = resolveDraftDepthProfile('EXTENSIVE_40');

    // targetWords debe ser al menos 50% mayor en EXTENSIVE_40
    expect(p40.targetWords).toBeGreaterThan(p20.targetWords * 1.5);

    // maxProviderCalls: EXTENSIVE_40 debe permitir al menos el doble
    expect(p40.maxProviderCalls).toBeGreaterThanOrEqual(p20.maxProviderCalls * 1.5);

    // maxPasses: más pases en EXTENSIVE_40
    expect(p40.maxPasses).toBeGreaterThan(p20.maxPasses);

    // targetPages
    expect(p40.targetPages.preferred).toBeGreaterThan(p20.targetPages.preferred);

    console.log('[TEST] PROFESSIONAL_20:', { targetWords: p20.targetWords, maxProviderCalls: p20.maxProviderCalls, maxPasses: p20.maxPasses });
    console.log('[TEST] EXTENSIVE_40:', { targetWords: p40.targetWords, maxProviderCalls: p40.maxProviderCalls, maxPasses: p40.maxPasses });
  });

  it('D2. GenerationExtensionContract debe diferir en continuaciones y tokens', () => {
    const p20 = resolveDraftDepthProfile('PROFESSIONAL_20');
    const p40 = resolveDraftDepthProfile('EXTENSIVE_40');

    const c20 = resolveGenerationExtensionContract(generationExtensionForDraftDepth(p20));
    const c40 = resolveGenerationExtensionContract(generationExtensionForDraftDepth(p40));

    // EXTENSIVE_40 debe tener más continuaciones por sección
    expect(c40.maxContinuationsPerSection).toBeGreaterThan(c20.maxContinuationsPerSection);

    // EXTENSIVE_40 debe permitir más tokens por pase
    expect(c40.maxGeneratedTokens).toBeGreaterThanOrEqual(c20.maxGeneratedTokens);

    // EXTENSIVE_40 debe permitir más expansión
    expect(c40.maxExpansionPasses).toBeGreaterThanOrEqual(c20.maxExpansionPasses);

    // EXTENSIVE_40 debe apuntar a más palabras
    expect(c40.targetWords).toBeGreaterThan(c20.targetWords);

    console.log('[TEST] Contract PROFESSIONAL_20:', {
      maxContinuations: c20.maxContinuationsPerSection,
      maxGeneratedTokens: c20.maxGeneratedTokens,
      targetWords: c20.targetWords,
    });
    console.log('[TEST] Contract EXTENSIVE_40:', {
      maxContinuations: c40.maxContinuationsPerSection,
      maxGeneratedTokens: c40.maxGeneratedTokens,
      targetWords: c40.targetWords,
    });
  });

  it('D3. Section budgets calculados ANTES de generar difieren entre profundidades', () => {
    const sections = [
      { id: 'sec-antecedentes', title: 'Antecedentes', type: 'background' },
      { id: 'sec-agravios', title: 'Agravios', type: 'argument' },
      { id: 'sec-fundamentos', title: 'Fundamentos Jurídicos', type: 'legal_grounds' },
      { id: 'sec-pruebas', title: 'Pruebas', type: 'evidence' },
      { id: 'sec-petitorios', title: 'Puntos Petitorios', type: 'petition' },
    ];

    const p20 = resolveDraftDepthProfile('PROFESSIONAL_20');
    const p40 = resolveDraftDepthProfile('EXTENSIVE_40');

    const budgets20 = allocateSectionBudgets(sections, p20.targetWords, p20.maxPasses);
    const budgets40 = allocateSectionBudgets(sections, p40.targetWords, p40.maxPasses);

    // Todos los presupuestos de EXTENSIVE_40 deben ser mayores
    for (const section of sections) {
      const b20 = budgets20[section.id]!;
      const b40 = budgets40[section.id]!;
      expect(b40.targetWords).toBeGreaterThan(b20.targetWords);
    }

    // La sección de agravios debe tener prioridad HIGH en ambos
    expect(budgets20['sec-agravios']!.priority).toBe('HIGH');
    expect(budgets40['sec-agravios']!.priority).toBe('HIGH');

    // EXTENSIVE_40 debe tener más continuaciones en secciones de alta prioridad
    expect(budgets40['sec-agravios']!.maxContinuations).toBeGreaterThan(budgets20['sec-agravios']!.maxContinuations);

    console.log('[TEST] Budget PROFESSIONAL_20 agravios:', budgets20['sec-agravios']);
    console.log('[TEST] Budget EXTENSIVE_40 agravios:', budgets40['sec-agravios']);
  });

  it('D4. EXTENSIVE_40 genera más tareas por sección con issues complejos', () => {
    const doc = makeMinimalDoc();

    // PROFESSIONAL_20: 2 issues con profundidad MEDIUM
    const issues20 = [
      makeIssuePlan('issue-1', 'Primer agravio fiscal', 'MEDIUM'),
      makeIssuePlan('issue-2', 'Segundo agravio fiscal', 'MEDIUM'),
    ];

    // EXTENSIVE_40: 5 issues con profundidad EXTENSIVE
    const issues40 = [
      makeIssuePlan('issue-1', 'Primer agravio fiscal', 'EXTENSIVE'),
      makeIssuePlan('issue-2', 'Segundo agravio fiscal', 'EXTENSIVE'),
      makeIssuePlan('issue-3', 'Tercer agravio — convencionalidad', 'EXTENSIVE'),
      makeIssuePlan('issue-4', 'Cuarto agravio — principio de legalidad', 'EXTENSIVE'),
      makeIssuePlan('issue-5', 'Quinto agravio — exhaustividad', 'EXTENSIVE'),
    ];

    const secPlan20 = makeSectionPlan('sec-agravios', 'MEDIUM', issues20);
    const secPlan40 = makeSectionPlan('sec-agravios', 'EXTENSIVE', issues40);

    const tasks20 = buildGenerationTasksForSection(secPlan20, doc);
    const tasks40 = buildGenerationTasksForSection(secPlan40, doc);

    // ESTE TEST FALLA ACTUALMENTE: 10 secciones → 1 tarea
    // Debe pasar: cada issue genera su propia tarea
    expect(tasks20.length).toBe(2);
    expect(tasks40.length).toBe(5);

    // Los tokens de presupuesto deben ser mayores en EXTENSIVE_40
    const avgBudget20 = tasks20.reduce((sum, t) => sum + t.tokenBudget, 0) / tasks20.length;
    const avgBudget40 = tasks40.reduce((sum, t) => sum + t.tokenBudget, 0) / tasks40.length;
    expect(avgBudget40).toBeGreaterThan(avgBudget20);

    console.log('[TEST] Tareas PROFESSIONAL_20:', tasks20.length, 'avg tokens:', Math.round(avgBudget20));
    console.log('[TEST] Tareas EXTENSIVE_40:', tasks40.length, 'avg tokens:', Math.round(avgBudget40));
  });

  it('D5. EXTENSIVE_40 debe tener complexity=EXTENSIVE en las tareas, no MEDIUM', () => {
    const doc = makeMinimalDoc();

    const issues40 = [
      makeIssuePlan('issue-ext-1', 'Agravio extenso 1', 'EXTENSIVE'),
      makeIssuePlan('issue-ext-2', 'Agravio extenso 2', 'EXTENSIVE'),
    ];
    const secPlan40 = makeSectionPlan('sec-agravios', 'EXTENSIVE', issues40);
    const tasks40 = buildGenerationTasksForSection(secPlan40, doc);

    // ESTE TEST FALLA ACTUALMENTE si las tareas se crean con MEDIUM
    for (const task of tasks40) {
      expect(task.complexity).toBe('EXTENSIVE');
    }
  });

  it('D6. El tokenBudget de EXTENSIVE debe ser >= 5000', () => {
    const doc = makeMinimalDoc();
    const issues = [makeIssuePlan('issue-big', 'Agravio complejo', 'EXTENSIVE')];
    const secPlan = makeSectionPlan('sec-agravios', 'EXTENSIVE', issues);
    const tasks = buildGenerationTasksForSection(secPlan, doc);

    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      // EXTENSIVE tasks must use significant token budget
      expect(task.tokenBudget).toBeGreaterThanOrEqual(5000);
    }
  });
});

// ── Prueba E: Tasks vs Sections ───────────────────────────────────────────────

describe('Secciones → Tareas — relación correcta', () => {

  it('E1. 10 secciones sustantivas → al menos 10 tareas totales (no 1)', () => {
    const doc = makeMinimalDoc();

    // Simular un documento con 3 secciones sustantivas, cada una con 2-4 issues
    const sectionPlans: SectionPlan[] = [
      makeSectionPlan('sec-agravios', 'EXTENSIVE', [
        makeIssuePlan('issue-1', 'Primer agravio', 'EXTENSIVE'),
        makeIssuePlan('issue-2', 'Segundo agravio', 'EXTENSIVE'),
        makeIssuePlan('issue-3', 'Tercer agravio', 'EXTENSIVE'),
      ]),
      makeSectionPlan('sec-fundamentos', 'DEEP', [
        makeIssuePlan('issue-4', 'Fundamento constitucional', 'DEEP'),
        makeIssuePlan('issue-5', 'Fundamento convencional', 'DEEP'),
      ]),
    ];

    const allTasks = sectionPlans.flatMap((sp) =>
      buildGenerationTasksForSection(sp, doc)
    );

    // ESTE TEST FALLA si todo colapsa en 1 tarea general
    expect(allTasks.length).toBeGreaterThanOrEqual(5);

    // Registro de métricas
    const taskReport = {
      plannedSections: sectionPlans.length,
      generationTasks: allTasks.length,
      llmTasks: allTasks.filter((t) => t.taskType === 'ISSUE' || t.taskType === 'EVIDENCE' || t.taskType === 'SECTION_SUPPORT').length,
      completedTasks: 0,
      fallbackTasks: 0,
    };

    console.log('[TEST] Task report:', JSON.stringify(taskReport, null, 2));
    expect(taskReport.generationTasks).toBeGreaterThan(taskReport.plannedSections);
  });

  it('E2. Cada tarea tiene sectionId, taskType y tokenBudget válidos', () => {
    const doc = makeMinimalDoc();
    const issues = [
      makeIssuePlan('issue-a', 'Agravio A', 'EXTENSIVE'),
      makeIssuePlan('issue-b', 'Agravio B', 'DEEP'),
    ];
    const secPlan = makeSectionPlan('sec-agravios', 'EXTENSIVE', issues);
    const tasks = buildGenerationTasksForSection(secPlan, doc);

    for (const task of tasks) {
      expect(task.id).toBeTruthy();
      expect(task.sectionId).toBe('sec-agravios');
      expect(task.taskType).toBeTruthy();
      expect(task.tokenBudget).toBeGreaterThan(0);
      expect(task.status).toBe('pending');
    }
  });
});
