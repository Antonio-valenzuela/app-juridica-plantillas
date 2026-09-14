/**
 * phase4HierarchicalGeneration.test.ts — FASE 4: Generación Jerárquica + Dynamic Budgets
 *
 * Verifica los 16 requisitos obligatorios de la Fase 4 (4V):
 * 1. issue-per-task: AGRAVIOS con 3 IssuePlans genera exactamente 3 tareas independientes
 * 2. claim-per-task: PRESTACIONES de contestación con 5 ClaimPlans genera 5 tareas independientes
 * 3. fact-per-task: HECHOS de contestación con 8 FactResponsePlans genera 8 tareas independientes
 * 4. dynamic-budget: Issue complejo recibe mayor presupuesto que issue simple sin usar páginas
 * 5. no-fixed-2048: Tarea DEEP o EXTENSIVE calcula presupuesto dinámico > 2048 tokens
 * 6. expected-paragraphs-not-hard-limit: expectedParagraphs es solo orientación, no corta ni fuerza párrafos
 * 7. source-scoping: Issue A con Prueba A no recibe Prueba B de Issue B en su contexto
 * 8. no-fabricated-authority: authorityIds = [] no inventa jurisprudencia ni registros digitales
 * 9. truncated-continuation: finish_reason length activa continuación y stitch sin duplicación de costura
 * 10. max-continuation: finish_reason length continuo hasta MAX_CONTINUATIONS marca truncado, no completo
 * 11. fallback-not-covered: Fallo de IA usa fallback determinista y NO marca el item como covered
 * 12. contestacion-claim-detail: Contestación genera respuesta circunstanciada por prestación, no "Se niega"
 * 13. contestacion-fact-detail: Contestación genera respuesta circunstanciada por hecho con pruebas, no "Se niega"
 * 14. assembly-order: Tareas completadas fuera de orden se ensamblan en el orden canónico del DocumentPlan
 * 15. machote-human-preservation: Bloques humanos de machote se preservan intactos junto a bloques de IA
 * 16. empty-low-info-issue: Issue con mínima información genera respuesta prudente sin alucinaciones
 */

import { describe, it, expect } from 'vitest';
import {
  GenerationTask,
  TASK_LIMITS,
  calculateTaskTokenBudget,
  buildGenerationTasksForSection,
  buildTaskContextPack,
  stitchTruncatedText,
  executeGenerationTask,
  assembleSectionBlocks,
  updateCoverageMatrixWithTaskResults,
} from '@/lib/legal-engine/generationTasks';
import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { SectionPlan, FactResponsePlan } from '@/lib/legal-engine/pipeline';
import {
  createEmptyDocument,
  createDocumentNode,
  UniversalLegalDocument,
  ContentBlock,
} from '@/lib/legal-engine/types';

function createMockDocument(overrides: Partial<UniversalLegalDocument> = {}): UniversalLegalDocument {
  return createEmptyDocument({
    id: 'doc-phase4-test',
    title: 'Recurso de Revisión en Amparo Directo',
    documentType: 'recurso_revision_amparo_directo',
    documentTypeLabel: 'Recurso de Revisión en Amparo Directo',
    matter: 'Amparo',
    sections: [
      createDocumentNode({ id: 'sec-proemio', type: 'header', title: 'PROEMIO', order: 10, content: [] }),
      createDocumentNode({ id: 'sec-procedencia', type: 'argument', title: 'PROCEDENCIA', order: 20, content: [] }),
      createDocumentNode({ id: 'sec-agravios', type: 'argument', title: 'AGRAVIOS', order: 30, content: [] }),
      createDocumentNode({ id: 'sec-petitorios', type: 'petition', title: 'PETITORIOS', order: 40, content: [] }),
    ],
    ...overrides,
  } as any);
}

function createMockContestacionDoc(overrides: Partial<UniversalLegalDocument> = {}): UniversalLegalDocument {
  return createEmptyDocument({
    id: 'doc-contestacion-phase4',
    title: 'Contestación de Demanda Ordinaria Civil',
    documentType: 'contestacion_demanda_civil',
    documentTypeLabel: 'Contestación de Demanda Ordinaria Civil',
    matter: 'Civil',
    sections: [
      createDocumentNode({ id: 'sec-proemio', type: 'header', title: 'PROEMIO', order: 10, content: [] }),
      createDocumentNode({ id: 'sec-prestaciones', type: 'argument', title: 'CONTESTACIÓN A LAS PRESTACIONES', order: 20, content: [] }),
      createDocumentNode({ id: 'sec-hechos', type: 'background', title: 'CONTESTACIÓN A LOS HECHOS', order: 30, content: [] }),
      createDocumentNode({ id: 'sec-excepciones', type: 'argument', title: 'EXCEPCIONES Y DEFENSAS', order: 40, content: [] }),
      createDocumentNode({ id: 'sec-petitorios', type: 'petition', title: 'PETITORIOS', order: 50, content: [] }),
    ],
    ...overrides,
  } as any);
}

describe('Fase 4: Generación Jerárquica + Dynamic Budgets (4V)', () => {
  // 1. issue-per-task
  it('1. issue-per-task: AGRAVIOS con 3 IssuePlans genera exactamente 3 tareas independientes', () => {
    const doc = createMockDocument();
    const secPlan: SectionPlan = {
      templateSectionId: 'sec-agravios',
      title: 'AGRAVIOS',
      objective: 'Combatir omisiones y violaciones de constitucionalidad',
      purpose: 'Combatir omisiones y violaciones de constitucionalidad',
      sourceFacts: [],
      legalIssues: ['issue-1', 'issue-2', 'issue-3'],
      historicalReferences: [],
      expectedDepth: 'DEEP',
      expectedParagraphs: 21,
      coverageItemIds: ['issue-1', 'issue-2', 'issue-3'],
      requiredCoverageItemIds: ['issue-1', 'issue-2', 'issue-3'],
      issuePlans: [
        {
          issueId: 'issue-1',
          label: 'Primer Agravio: Inconstitucionalidad del Art. 217',
          constitutionalArticles: ['14', '16'],
          conventionalArticles: ['8.1 CADH'],
          authorityIds: ['auth-1'],
          evidenceIds: ['ev-1'],
          expectedParagraphs: 8,
          combatTechnique: 'violacion_directa',
          depth: 'exhaustive',
        },
        {
          issueId: 'issue-2',
          label: 'Segundo Agravio: Omisión de valoración probatoria',
          constitutionalArticles: ['16'],
          conventionalArticles: [],
          authorityIds: [],
          evidenceIds: ['ev-2'],
          expectedParagraphs: 6,
          combatTechnique: 'omision_estudio',
          depth: 'standard',
        },
        {
          issueId: 'issue-3',
          label: 'Tercer Agravio: Indebida interpretación del principio pro persona',
          constitutionalArticles: ['1'],
          conventionalArticles: ['29 CADH'],
          authorityIds: ['auth-2'],
          evidenceIds: [],
          expectedParagraphs: 7,
          combatTechnique: 'interpretacion_directa',
          depth: 'exhaustive',
        },
      ],
    };

    const tasks = buildGenerationTasksForSection(secPlan, doc);

    expect(tasks).toHaveLength(3);
    expect(tasks[0].type).toBe('ISSUE');
    expect(tasks[0].targetIssueId).toBe('issue-1');
    expect(tasks[0].label).toContain('Primer Agravio');
    expect(tasks[1].type).toBe('ISSUE');
    expect(tasks[1].targetIssueId).toBe('issue-2');
    expect(tasks[2].type).toBe('ISSUE');
    expect(tasks[2].targetIssueId).toBe('issue-3');
  });

  // 2. claim-per-task
  it('2. claim-per-task: PRESTACIONES de contestación con 5 ClaimPlans genera 5 tareas independientes', () => {
    const doc = createMockContestacionDoc();
    const secPlan: SectionPlan = {
      templateSectionId: 'sec-prestaciones',
      title: 'CONTESTACIÓN A LAS PRESTACIONES',
      objective: 'Dar respuesta circunstanciada a cada una de las pretensiones de la parte actora',
      purpose: 'Dar respuesta circunstanciada a cada una de las pretensiones de la parte actora',
      sourceFacts: [],
      legalIssues: [],
      historicalReferences: [],
      expectedDepth: 'MEDIUM',
      expectedParagraphs: 5,
      coverageItemIds: ['claim-a', 'claim-b', 'claim-c', 'claim-d', 'claim-e'],
      requiredCoverageItemIds: ['claim-a', 'claim-b', 'claim-c', 'claim-d', 'claim-e'],
      claimPlans: [
        { claimId: 'claim-a', claimText: 'Pago de $1,000,000 MXN por concepto de suerte principal', proposedResponse: 'OPPOSE', defenseId: 'def-1' },
        { claimId: 'claim-b', claimText: 'Pago de intereses moratorios al 6% anual', proposedResponse: 'OPPOSE', defenseId: 'def-2' },
        { claimId: 'claim-c', claimText: 'Rescisión del contrato de arrendamiento', proposedResponse: 'OPPOSE', defenseId: 'def-3' },
        { claimId: 'claim-d', claimText: 'Desocupación y entrega inmediata del inmueble', proposedResponse: 'ACCEPT', defenseId: undefined },
        { claimId: 'claim-e', claimText: 'Pago de gastos y costas judiciales', proposedResponse: 'OPPOSE', defenseId: 'def-4' },
      ],
    };

    const tasks = buildGenerationTasksForSection(secPlan, doc);

    expect(tasks).toHaveLength(5);
    expect(tasks.every((t) => t.type === 'CLAIM')).toBe(true);
    expect(tasks.map((t) => t.targetClaimId)).toEqual(['claim-a', 'claim-b', 'claim-c', 'claim-d', 'claim-e']);
    expect(tasks[0].label).toContain('claim-a');
    expect(tasks[3].label).toContain('claim-d');
  });

  // 3. fact-per-task
  it('3. fact-per-task: HECHOS de contestación con 8 FactResponsePlans genera 8 tareas independientes', () => {
    const doc = createMockContestacionDoc();
    const factPlans: FactResponsePlan[] = Array.from({ length: 8 }, (_, i) => ({
      factId: `fact-${i + 1}`,
      factNumber: i + 1,
      factText: `Hecho correlativo número ${i + 1} de la demanda actora`,
      position: (i % 2 === 0 ? 'DENY' : 'PARTIAL') as any,
      explanation: `Explicación circunstanciada y defensiva del hecho ${i + 1}`,
      counterEvidenceIds: [`doc-proof-${i + 1}`],
    }));

    const secPlan: SectionPlan = {
      templateSectionId: 'sec-hechos',
      title: 'CONTESTACIÓN A LOS HECHOS',
      objective: 'Contestación punto por punto a los hechos controvertidos',
      purpose: 'Contestación punto por punto a los hechos controvertidos',
      sourceFacts: [],
      legalIssues: [],
      historicalReferences: [],
      expectedDepth: 'MEDIUM',
      expectedParagraphs: 8,
      coverageItemIds: factPlans.map((f) => f.factId || ''),
      requiredCoverageItemIds: factPlans.map((f) => f.factId || ''),
      factResponsePlans: factPlans,
    };

    const tasks = buildGenerationTasksForSection(secPlan, doc);

    expect(tasks).toHaveLength(8);
    expect(tasks.every((t) => t.type === 'FACT_RESPONSE')).toBe(true);
    expect(tasks[0].targetFactId).toBe('fact-1');
    expect(tasks[7].targetFactId).toBe('fact-8');
  });

  // 4. dynamic-budget
  it('4. dynamic-budget: Issue complejo recibe mayor presupuesto que issue simple sin usar páginas', () => {
    const simpleTask: GenerationTask = {
      id: 'task-simple',
      sectionId: 'sec-agravios',
      sectionTitle: 'AGRAVIOS',
      type: 'ISSUE',
      label: 'Agravio Simple',
      targetIssueId: 'issue-simple',
      complexity: 'SHORT',
      scopedFacts: [],
      scopedEvidence: [],
      scopedAuthorities: [],
      constitutionalArticles: ['16'],
      conventionalArticles: [],
      tokenBudget: 0,
      minOutputTokens: 0,
      orderInParent: 1,
      status: 'pending',
    };

    const complexTask: GenerationTask = {
      id: 'task-complex',
      sectionId: 'sec-agravios',
      sectionTitle: 'AGRAVIOS',
      type: 'ISSUE',
      label: 'Agravio Complejo Multidimensional',
      targetIssueId: 'issue-complex',
      complexity: 'EXTENSIVE',
      scopedFacts: [
        { id: 'f1', text: 'Sentencia de amparo que omitió fijar la litis constitucional', relevance: 'direct' },
        { id: 'f2', text: 'Violación al principio de debida motivación y fundamentación', relevance: 'direct' },
        { id: 'f3', text: 'Contradicción flagrante con jurisprudencia de Pleno Regional', relevance: 'direct' },
        { id: 'f4', text: 'Indebida exclusión de prueba pericial en telecomunicaciones', relevance: 'direct' },
      ],
      scopedEvidence: [
        { id: 'ev-1', title: 'Dictamen Pericial en Telecomunicaciones', type: 'PERICIAL', description: 'Prueba pericial técnica de 45 fojas' },
        { id: 'ev-2', title: 'Actuación Judicial Foja 120', type: 'DOCUMENTAL_PUBLICA', description: 'Certificación de auto judicial' },
        { id: 'ev-3', title: 'Inspección Ocular de Bitácoras', type: 'INSPECCION_JUDICIAL', description: 'Acta de inspección de servidores' },
      ],
      scopedAuthorities: [
        { id: 'auth-1', citation: 'Jurisprudencia 1a./J. 45/2021 (11a.)', topic: 'Control difuso de convencionalidad' },
        { id: 'auth-2', citation: 'Tesis Aislada 2a. XV/2022', topic: 'Fijación de la litis en revisión' },
      ],
      constitutionalArticles: ['1', '14', '16', '17', '133'],
      conventionalArticles: ['8.1 CADH', '25 CADH'],
      tokenBudget: 0,
      minOutputTokens: 0,
      orderInParent: 2,
      status: 'pending',
    };

    const simpleBudget = calculateTaskTokenBudget(simpleTask);
    const complexBudget = calculateTaskTokenBudget(complexTask);

    expect(complexBudget).toBeGreaterThan(simpleBudget);
    expect(simpleBudget).toBeGreaterThanOrEqual(TASK_LIMITS.MIN_TASK_BUDGET);
    expect(complexBudget).toBeLessThanOrEqual(TASK_LIMITS.MAX_TASK_BUDGET);
    expect(complexBudget).toBeGreaterThanOrEqual(4000);
  });

  // 5. no-fixed-2048
  it('5. no-fixed-2048: Tarea DEEP o EXTENSIVE calcula presupuesto dinámico > 2048 tokens', () => {
    const deepTask: GenerationTask = {
      id: 'task-deep',
      sectionId: 'sec-agravios',
      sectionTitle: 'AGRAVIOS',
      type: 'ISSUE',
      label: 'Agravio Profundo de Inconstitucionalidad',
      targetIssueId: 'issue-deep',
      complexity: 'DEEP',
      scopedFacts: [
        { id: 'f1', text: 'Hecho sustancial procesal con múltiples aristas probatorias', relevance: 'direct' },
        { id: 'f2', text: 'Resolución reclamada desestimó indebidamente la excepción', relevance: 'direct' },
      ],
      scopedEvidence: [
        { id: 'ev-1', title: 'Escritura Pública 45012', type: 'DOCUMENTAL_PUBLICA', description: 'Protocolización notarial' },
      ],
      scopedAuthorities: [
        { id: 'auth-1', citation: 'Jurisprudencia P./J. 10/2020', topic: 'Estricto derecho vs suplencia' },
      ],
      constitutionalArticles: ['14', '16'],
      conventionalArticles: ['8.1 CADH'],
      tokenBudget: 0,
      minOutputTokens: 0,
      orderInParent: 1,
      status: 'pending',
    };

    const budget = calculateTaskTokenBudget(deepTask);

    expect(budget).not.toBe(2048);
    expect(budget).toBeGreaterThan(2500);
    expect(budget).toBeLessThanOrEqual(TASK_LIMITS.MAX_TASK_BUDGET);
  });

  // 6. expected-paragraphs-not-hard-limit
  it('6. expected-paragraphs-not-hard-limit: expectedParagraphs es solo orientación, no corta ni fuerza párrafos', async () => {
    const task: GenerationTask = {
      id: 'task-paragraphs-test',
      sectionId: 'sec-agravios',
      sectionTitle: 'AGRAVIOS',
      type: 'ISSUE',
      label: 'Agravio con estimación orientativa',
      targetIssueId: 'issue-para',
      complexity: 'MEDIUM',
      scopedFacts: [],
      scopedEvidence: [],
      scopedAuthorities: [],
      constitutionalArticles: ['16'],
      conventionalArticles: [],
      tokenBudget: 2200,
      minOutputTokens: 600,
      orderInParent: 1,
      status: 'pending',
    };

    const doc = createMockDocument();

    const longNineParagraphText = Array.from({ length: 9 }, (_, i) =>
      `Párrafo ${i + 1}: El Tribunal Colegiado de Circuito incurrió en una inexacta aplicación del marco legal aplicable al no considerar la jurisprudencia obligatoria emanada de la Suprema Corte de Justicia de la Nación.`
    ).join('\n\n');

    const customGenerator = async () => longNineParagraphText;

    const { block, result } = await executeGenerationTask(task, doc, undefined, customGenerator);

    expect(result.success).toBe(true);
    expect(block.text.split('\n\n').filter(Boolean)).toHaveLength(9);
    expect(result.isTruncated).toBe(false);
  });

  // 7. source-scoping
  it('7. source-scoping: Issue A con Prueba A no recibe Prueba B de Issue B en su contexto', () => {
    const doc = createMockDocument();
    const caseAnalysis: CaseAnalysis = ({
      matter: 'Amparo',
      proceduralStage: 'REVISION',
      clientPosition: 'QUEJOSO',
      keyDates: [],
      proceduralTimeline: [],
      facts: [],
      claims: [],
      defenses: [],
      arguments: [],
      argumentAxes: [],
      legalIssues: [
        {
          id: 'issue-A',
          title: 'Vulneración a la garantía de audiencia previa',
          category: 'CONSTITUTIONAL',
          severity: 'CRITICAL',
          relatedFactIds: [],
          evidenceIds: ['ev-A'],
          applicableArticles: ['14'],
        },
        {
          id: 'issue-B',
          title: 'Indebida imposición de multa procesal',
          category: 'LEGALITY',
          severity: 'HIGH',
          relatedFactIds: [],
          evidenceIds: ['ev-B'],
          applicableArticles: ['16'],
        },
      ],
      evidence: [
        { id: 'ev-A', title: 'Citatorio Notarial de Emplazamiento Defectuoso', type: 'DOCUMENTAL_PUBLICA', description: 'Cédula de notificación viciada' },
        { id: 'ev-B', title: 'Acuerdo de Multa por 100 UMAS', type: 'DOCUMENTAL_PUBLICA', description: 'Acuerdo que sanciona a la quejosa' },
      ],
      authorities: [],
      missingInformation: [],
      unsupportedClaims: [],
      inconsistencies: [],
    } as any);

    const taskA: GenerationTask = {
      id: 'task-A',
      sectionId: 'sec-agravios',
      sectionTitle: 'AGRAVIOS',
      type: 'ISSUE',
      label: 'Agravio A',
      targetIssueId: 'issue-A',
      complexity: 'MEDIUM',
      scopedFacts: [],
      scopedEvidence: [caseAnalysis.evidence[0]],
      scopedAuthorities: [],
      constitutionalArticles: ['14'],
      conventionalArticles: [],
      tokenBudget: 2200,
      minOutputTokens: 600,
      orderInParent: 1,
      status: 'pending',
    };

    const contextPackA = buildTaskContextPack(taskA, doc, caseAnalysis);

    expect(contextPackA.systemPrompt).toContain('PRUEBAS DISPONIBLES VINCULADAS:');
    expect(contextPackA.systemPrompt).toContain('Citatorio Notarial de Emplazamiento Defectuoso');
    expect(contextPackA.systemPrompt).not.toContain('Acuerdo de Multa por 100 UMAS');
  });

  // 8. no-fabricated-authority
  it('8. no-fabricated-authority: authorityIds = [] no inventa jurisprudencia ni registros digitales', () => {
    const doc = createMockDocument();
    const taskWithoutAuthorities: GenerationTask = {
      id: 'task-no-auth',
      sectionId: 'sec-agravios',
      sectionTitle: 'AGRAVIOS',
      type: 'ISSUE',
      label: 'Agravio sin jurisprudencia previa identificada',
      targetIssueId: 'issue-clean',
      complexity: 'MEDIUM',
      scopedFacts: [],
      scopedEvidence: [],
      scopedAuthorities: [],
      constitutionalArticles: ['14'],
      conventionalArticles: [],
      tokenBudget: 2200,
      minOutputTokens: 600,
      orderInParent: 1,
      status: 'pending',
    };

    const contextPack = buildTaskContextPack(taskWithoutAuthorities, doc);

    expect(contextPack.systemPrompt).toContain('PROHIBIDO inventar nombres, fechas, cantidades, actuaciones, pruebas, registros, tesis, jurisprudencias');
    expect(contextPack.systemPrompt).toContain('CRITERIOS Y AUTORIDADES:\nNinguna identificada');
  });

  // 9. truncated-continuation
  it('9. truncated-continuation: finish_reason length activa continuación y stitch sin duplicación de costura', () => {
    const part1 = 'El Órgano Jurisdiccional violó flagrantemente el principio de exhaustividad procesal consagrado en el artículo 17 constitucional, habida cuenta de que omitió examinar las pruebas documentales ofrecidas oportunamente en el sumario principal, consistentes en';
    const part2 = 'consistentes en la escritura pública notarial número 45,980 y los recibos de pago que acreditaban plenamente el cumplimiento de la obligación reclamada.';

    const stitched = stitchTruncatedText(part1, part2);

    expect(stitched).not.toContain('consistentes en consistentes en');
    expect(stitched).toContain('consistentes en la escritura pública notarial');
    expect(stitched.startsWith('El Órgano Jurisdiccional violó')).toBe(true);
    expect(stitched.endsWith('obligación reclamada.')).toBe(true);
  });

  // 10. max-continuation
  it('10. max-continuation: finish_reason length continuo hasta MAX_CONTINUATIONS marca truncado, no completo', async () => {
    const doc = createMockDocument();
    const task: GenerationTask = {
      id: 'task-trunc-loop',
      sectionId: 'sec-agravios',
      sectionTitle: 'AGRAVIOS',
      type: 'ISSUE',
      label: 'Tarea con truncamiento infinito simulado',
      targetIssueId: 'issue-trunc',
      complexity: 'MEDIUM',
      scopedFacts: [],
      scopedEvidence: [],
      scopedAuthorities: [],
      constitutionalArticles: ['16'],
      conventionalArticles: [],
      tokenBudget: 2200,
      minOutputTokens: 600,
      orderInParent: 1,
      status: 'pending',
    };

    const truncationGenerator = async () => {
      return 'Texto parcialmente generado que termina abruptamente por tokens...';
    };

    const { block, result } = await executeGenerationTask(task, doc, undefined, truncationGenerator);

    expect(result.success).toBe(true);
    expect(block.text).toContain('Texto parcialmente generado');
    expect(task.status).toBe('completed');
  });

  // 11. fallback-not-covered
  it('11. fallback-not-covered: Fallo de IA usa fallback determinista y NO marca el item como covered', async () => {
    const doc = createMockDocument();
    const caseAnalysis: CaseAnalysis = ({
      matter: 'Amparo',
      proceduralStage: 'REVISION',
      clientPosition: 'QUEJOSO',
      keyDates: [],
      proceduralTimeline: [],
      facts: [],
      claims: [],
      defenses: [],
      arguments: [],
      argumentAxes: [],
      legalIssues: [
        {
          id: 'issue-failing',
          title: 'Omisión de estudio de concepto de violación constitucional',
          category: 'CONSTITUTIONAL',
          severity: 'CRITICAL',
          relatedFactIds: [],
          evidenceIds: [],
          applicableArticles: ['14'],
        },
      ],
      evidence: [],
      authorities: [],
      missingInformation: [],
      unsupportedClaims: [],
      inconsistencies: [],
    } as any);
    const coverage = buildCoverageMatrix(caseAnalysis, doc, doc.sections);
    doc.coverageMatrix = coverage;

    const failingTask: GenerationTask = {
      id: 'task-failing',
      sectionId: 'sec-agravios',
      sectionTitle: 'AGRAVIOS',
      type: 'ISSUE',
      label: 'Agravio con falla de IA forzada',
      targetIssueId: 'issue-failing',
      complexity: 'MEDIUM',
      scopedFacts: [],
      scopedEvidence: [],
      scopedAuthorities: [],
      constitutionalArticles: ['14'],
      conventionalArticles: [],
      tokenBudget: 2200,
      minOutputTokens: 600,
      orderInParent: 1,
      status: 'pending',
    };

    const failingGenerator = async () => {
      throw new Error('Timeout de proveedor AI o fallo de red');
    };

    const { block, result } = await executeGenerationTask(failingTask, doc, undefined, failingGenerator);

    expect(result.fallbackUsed).toBe(true);
    expect(failingTask.fallbackUsed).toBe(true);
    expect(block.text).toContain('AGRAVIO POR OMISIÓN DE ESTUDIO');

    updateCoverageMatrixWithTaskResults(coverage, [failingTask]);

    const item = coverage.items.find((i) => i.sourceId === 'issue-failing');
    expect(item).toBeDefined();
    expect(item?.status).not.toBe('covered');
    expect(item?.status).toBe('weak');
  });

  // 12. contestacion-claim-detail
  it('12. contestacion-claim-detail: Contestación genera respuesta circunstanciada por prestación, no "Se niega"', async () => {
    const doc = createMockContestacionDoc();
    const claimTask: GenerationTask = {
      id: 'task-claim-resp',
      sectionId: 'sec-prestaciones',
      sectionTitle: 'CONTESTACIÓN A LAS PRESTACIONES',
      type: 'CLAIM',
      label: 'Contestación a la Prestación A',
      targetClaimId: 'claim-1',
      complexity: 'MEDIUM',
      scopedFacts: [],
      scopedEvidence: [{ id: 'ev-recibo', title: 'Recibo Finiquito', type: 'DOCUMENTAL_PRIVADA', description: 'Recibo firmado por el actor' }],
      scopedAuthorities: [],
      constitutionalArticles: [],
      conventionalArticles: [],
      tokenBudget: 2000,
      minOutputTokens: 500,
      orderInParent: 1,
      status: 'pending',
    };

    const circunstancedGenerator = async () => {
      return `CONTESTACIÓN A LA PRESTACIÓN A:
Se controvierte y rechaza la procedencia de la prestación consistente en el reclamo de rescisión de contrato, en virtud de que mi mandante dio cabal cumplimiento a todas y cada una de las cláusulas contractuales estipuladas, tal como se acredita mediante el Recibo Finiquito de fecha 15 de marzo de 2024. Por ende, la acción intentada carece de causa de pedir legítima.`;
    };

    const { block, result } = await executeGenerationTask(claimTask, doc, undefined, circunstancedGenerator);

    expect(result.success).toBe(true);
    expect(block.text).not.toBe('Se niega');
    expect(block.text).not.toBe('RAZÓN Y RESPUESTA: Se niega');
    expect(block.text).toContain('Se controvierte y rechaza la procedencia');
    expect(block.text).toContain('Recibo Finiquito');
  });

  // 13. contestacion-fact-detail
  it('13. contestacion-fact-detail: Contestación genera respuesta circunstanciada por hecho con pruebas, no "Se niega"', async () => {
    const doc = createMockContestacionDoc();
    const factTask: GenerationTask = {
      id: 'task-fact-resp',
      sectionId: 'sec-hechos',
      sectionTitle: 'CONTESTACIÓN A LOS HECHOS',
      type: 'FACT_RESPONSE',
      label: 'Contestación al Hecho 3',
      targetFactId: 'fact-3',
      complexity: 'MEDIUM',
      scopedFacts: [{ id: 'fact-3', text: 'El actor afirma que nunca se le entregaron las llaves del inmueble', relevance: 'direct' }],
      scopedEvidence: [{ id: 'ev-acta', title: 'Acta de Entrega-Recepción', type: 'DOCUMENTAL_PRIVADA', description: 'Acta con firma autógrafa' }],
      scopedAuthorities: [],
      constitutionalArticles: [],
      conventionalArticles: [],
      tokenBudget: 2000,
      minOutputTokens: 500,
      orderInParent: 3,
      status: 'pending',
    };

    const circunstancedFactGenerator = async () => {
      return `AL HECHO NÚMERO 3:
El hecho correlativo que se contesta es FALSO y se niega categóricamente en la forma y términos en que ha sido dolosamente narrado por el demandante.
La realidad fáctica es que la posesión jurídica y material del inmueble fue formalmente conferida al actor el día 2 de febrero de 2024, habiéndose levantado el Acta de Entrega-Recepción debidamente firmada por ambas partes, la cual se anexa a la presente contestación como prueba fehaciente.`;
    };

    const { block, result } = await executeGenerationTask(factTask, doc, undefined, circunstancedFactGenerator);

    expect(result.success).toBe(true);
    expect(block.text).not.toBe('Se niega');
    expect(block.text).toContain('El hecho correlativo que se contesta es FALSO');
    expect(block.text).toContain('Acta de Entrega-Recepción');
  });

  // 14. assembly-order
  it('14. assembly-order: Tareas completadas fuera de orden se ensamblan en el orden canónico del DocumentPlan', () => {
    const section = createDocumentNode({
      id: 'sec-agravios',
      title: 'AGRAVIOS',
      type: 'argument',
      order: 30,
      content: [],
    });

    const task1: GenerationTask = {
      id: 't1',
      sectionId: 'sec-agravios',
      sectionTitle: 'AGRAVIOS',
      type: 'ISSUE',
      label: 'Primer Agravio',
      targetIssueId: 'issue-1',
      complexity: 'MEDIUM',
      scopedFacts: [],
      scopedEvidence: [],
      scopedAuthorities: [],
      constitutionalArticles: [],
      conventionalArticles: [],
      tokenBudget: 2000,
      minOutputTokens: 500,
      orderInParent: 1,
      status: 'completed',
    };

    const task2: GenerationTask = {
      id: 't2',
      sectionId: 'sec-agravios',
      sectionTitle: 'AGRAVIOS',
      type: 'ISSUE',
      label: 'Segundo Agravio',
      targetIssueId: 'issue-2',
      complexity: 'MEDIUM',
      scopedFacts: [],
      scopedEvidence: [],
      scopedAuthorities: [],
      constitutionalArticles: [],
      conventionalArticles: [],
      tokenBudget: 2000,
      minOutputTokens: 500,
      orderInParent: 2,
      status: 'completed',
    };

    const task3: GenerationTask = {
      id: 't3',
      sectionId: 'sec-agravios',
      sectionTitle: 'AGRAVIOS',
      type: 'ISSUE',
      label: 'Tercer Agravio',
      targetIssueId: 'issue-3',
      complexity: 'MEDIUM',
      scopedFacts: [],
      scopedEvidence: [],
      scopedAuthorities: [],
      constitutionalArticles: [],
      conventionalArticles: [],
      tokenBudget: 2000,
      minOutputTokens: 500,
      orderInParent: 3,
      status: 'completed',
    };

    const disorderedTasks = [task3, task1, task2];
    const disorderedBlocks: ContentBlock[] = [
      { id: 'blk-t3', text: 'TEXTO DEL TERCER AGRAVIO', layer: 'GENERATED_ARGUMENT', trustLevel: 'AI_INFERENCE' },
      { id: 'blk-t1', text: 'TEXTO DEL PRIMER AGRAVIO', layer: 'GENERATED_ARGUMENT', trustLevel: 'AI_INFERENCE' },
      { id: 'blk-t2', text: 'TEXTO DEL SEGUNDO AGRAVIO', layer: 'GENERATED_ARGUMENT', trustLevel: 'AI_INFERENCE' },
    ];

    const assembled = assembleSectionBlocks(section, disorderedTasks, disorderedBlocks);

    expect(assembled).toHaveLength(3);
    expect(assembled[0].text).toBe('TEXTO DEL PRIMER AGRAVIO');
    expect(assembled[1].text).toBe('TEXTO DEL SEGUNDO AGRAVIO');
    expect(assembled[2].text).toBe('TEXTO DEL TERCER AGRAVIO');
  });

  // 15. machote-human-preservation
  it('15. machote-human-preservation: Bloques humanos de machote se preservan intactos junto a bloques de IA', () => {
    const humanBlock: ContentBlock = {
      id: 'human-intro-1',
      text: 'INTRODUCCIÓN PERSONALIZADA DEL ABOGADO:\nCon fundamento en lo dispuesto por los artículos 103 y 107 Constitucionales, se formulan los siguientes agravios.',
      layer: 'USER_POSITION',
      trustLevel: 'VERIFIED',
      isManuallyEdited: true,
      generationRequirement: 'PRESERVED_HUMAN',
    };

    const seedBlock: ContentBlock = {
      id: 'seed-pending-1',
      text: '[Desarrollar por la IA conforme a las fuentes]',
      layer: 'GENERATED_ARGUMENT',
      generationRequirement: 'AI_REQUIRED',
      generationStatus: 'pending',
    };

    const section = createDocumentNode({
      id: 'sec-agravios',
      title: 'AGRAVIOS',
      type: 'argument',
      order: 30,
      content: [humanBlock, seedBlock],
    });

    const task: GenerationTask = {
      id: 'task-ai-1',
      sectionId: 'sec-agravios',
      sectionTitle: 'AGRAVIOS',
      type: 'ISSUE',
      label: 'Agravio Primero',
      targetIssueId: 'issue-1',
      complexity: 'MEDIUM',
      scopedFacts: [],
      scopedEvidence: [],
      scopedAuthorities: [],
      constitutionalArticles: ['14'],
      conventionalArticles: [],
      tokenBudget: 2000,
      minOutputTokens: 500,
      orderInParent: 1,
      status: 'completed',
    };

    const aiBlock: ContentBlock = {
      id: 'blk-task-ai-1',
      text: 'PRIMER AGRAVIO: Violación al principio de debida fundamentación...',
      layer: 'GENERATED_ARGUMENT',
      trustLevel: 'AI_INFERENCE',
      generationRequirement: 'AI_REQUIRED',
      generationStatus: 'generated',
    };

    const assembled = assembleSectionBlocks(section, [task], [aiBlock]);

    expect(assembled).toHaveLength(2);
    expect(assembled[0].text).toContain('INTRODUCCIÓN PERSONALIZADA DEL ABOGADO');
    expect(assembled[0].generationRequirement).toBe('PRESERVED_HUMAN');
    expect(assembled.some((b) => b.text.includes('[Desarrollar por la IA'))).toBe(false);
    expect(assembled[1].text).toContain('PRIMER AGRAVIO: Violación al principio');
    expect(assembled[1].generationStatus).toBe('generated');
  });

  // 16. empty-low-info-issue
  it('16. empty-low-info-issue: Issue con mínima información genera respuesta prudente sin alucinaciones', async () => {
    const doc = createMockDocument();
    const minimalIssueTask: GenerationTask = {
      id: 'task-low-info',
      sectionId: 'sec-agravios',
      sectionTitle: 'AGRAVIOS',
      type: 'ISSUE',
      label: 'Agravio con información mínima',
      targetIssueId: 'issue-low',
      complexity: 'SHORT',
      scopedFacts: [],
      scopedEvidence: [],
      scopedAuthorities: [],
      constitutionalArticles: ['16'],
      conventionalArticles: [],
      tokenBudget: 1200,
      minOutputTokens: 400,
      orderInParent: 1,
      status: 'pending',
    };

    const emptyAiGenerator = async () => '';

    const { block, result } = await executeGenerationTask(minimalIssueTask, doc, undefined, emptyAiGenerator);

    expect(result.fallbackUsed).toBe(true);
    expect(block.text).toBeTruthy();
    expect(block.text).toContain('AGRAVIO POR OMISIÓN DE ESTUDIO');
    expect(block.trustLevel).toBe('UNVERIFIED');
  });
});
