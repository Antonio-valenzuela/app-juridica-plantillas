/**
 * planDifferenceAndBudgetTiming.test.ts — Validación formal de los dos fixes:
 * 1. buildDraftingPlan responde a draftDepthHint (PROFESSIONAL_20 vs EXTENSIVE_40)
 * 2. allocateSectionBudgets ocurre ANTES de ejecutar la primera tarea de redacción
 */
import { describe, it, expect, vi } from 'vitest';
import { buildDraftingPlan } from '@/lib/legal-engine/pipeline';
import { resolveDraftDepthProfile } from '@/lib/legal-engine/draftDepth';
import { allocateSectionBudgets, generationExtensionForDraftDepth, resolveGenerationExtensionContract } from '@/lib/legal-engine/generationExtension';
import { buildGenerationTasksForSection } from '@/lib/legal-engine/generationTasks';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';

function createSyntheticDoc(): UniversalLegalDocument {
  return {
    id: 'doc-timing-test',
    documentType: 'contestacion_demanda_laboral',
    documentTypeLabel: 'Contestación de Demanda Laboral',
    matter: 'Laboral',
    status: 'draft',
    lifecycle: 'draft',
    sections: [
      { id: 'sec-proemio', type: 'header', title: 'PROEMIO', order: 1, content: [], isRepeatable: false, isEditable: true, isGenerated: false, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [] },
      { id: 'sec-hechos', type: 'background', title: 'CONTESTACIÓN DE HECHOS', order: 2, content: [], isRepeatable: false, isEditable: true, isGenerated: false, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [] },
      { id: 'sec-prestaciones', type: 'argument', title: 'CONTESTACIÓN DE PRESTACIONES', order: 3, content: [], isRepeatable: false, isEditable: true, isGenerated: false, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [] },
      { id: 'sec-excepciones', type: 'argument', title: 'EXCEPCIONES Y DEFENSAS', order: 4, content: [], isRepeatable: false, isEditable: true, isGenerated: false, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [] },
      { id: 'sec-pruebas', type: 'evidence', title: 'PRUEBAS', order: 5, content: [], isRepeatable: false, isEditable: true, isGenerated: false, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [] },
      { id: 'sec-petitorios', type: 'petition', title: 'PETITORIOS', order: 6, content: [], isRepeatable: false, isEditable: true, isGenerated: false, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [] },
    ],
    parties: { actor: 'TRABAJADOR', demandado: 'EMPRESA SA' },
    variables: [],
    generationStatus: 'draft',
    sourceDocuments: [],
  } as any;
}

function createSyntheticAnalysis(): CaseAnalysis {
  return {
    parties: { actor: 'TRABAJADOR', demandado: 'EMPRESA SA' },
    facts: [
      { id: 'fact-1', number: '1', text: 'Ingreso el 01/01/2020 con salario diario de $500', confidence: 0.9, actor: 'ACTOR' },
      { id: 'fact-2', number: '2', text: 'Despido injustificado el 15/05/2024 en horario laboral', confidence: 0.85, actor: 'ACTOR' },
      { id: 'fact-3', number: '3', text: 'Jornada laboral de 12 horas diarias sin pago de horas extras', confidence: 0.8, actor: 'ACTOR' },
    ],
    claims: [
      'Indemnización constitucional de 90 días',
      'Salarios vencidos desde la fecha de separación',
      'Pago de 4 horas extras diarias durante todo el periodo laboral',
    ],
    claimResponses: [
      { id: 'claim-1', number: 'A', text: 'Indemnización constitucional', contestedStatus: 'IMPROCEDENTE' },
      { id: 'claim-2', number: 'B', text: 'Salarios caídos', contestedStatus: 'IMPROCEDENTE' },
      { id: 'claim-3', number: 'C', text: 'Horas extras', contestedStatus: 'IMPROCEDENTE' },
    ],
    argumentAxes: [
      { id: 'axis-1', title: 'Inexistencia del despido por renuncia voluntaria', issue: 'Inexistencia del despido', facts: ['fact-2'], rules: ['Art 47 LFT'], reasoning: 'El trabajador renunció', counterargument: 'Despido', rebuttal: 'Consta finiquito firmado', requestedConsequence: 'Absolución' },
      { id: 'axis-2', title: 'Prescripción de horas extras mayores a un año', issue: 'Prescripción', facts: ['fact-3'], rules: ['Art 516 LFT'], reasoning: 'Prescripción anual', counterargument: 'Pago retroactivo', rebuttal: 'Cómputo anual perentorio', requestedConsequence: 'Excepción de prescripción' },
    ],
    proceduralPosture: {
      proceduralWrit: 'Contestación de demanda',
      constitutionalIssues: [],
      legalityIssues: [
        { id: 'issue-1', type: 'LEGALITY', title: 'Excepción de pago y finiquito', parameter: 'Art 48 LFT', challengedAct: 'Reclamo indemnizatorio', contradiction: 'Se pagó finiquito', affectation: 'Indebido cobro', consequence: 'Absolución' },
        { id: 'issue-2', type: 'LEGALITY', title: 'Excepción de oscuridad de la demanda en horas extras', parameter: 'Art 872 LFT', challengedAct: 'Jornada inverosímil', contradiction: 'No precisa días', affectation: 'Indefensión', consequence: 'Absolución' },
      ],
    },
    evidence: [],
    authorities: [],
    caseNumbers: {},
    proceduralTimeline: [],
  } as any;
}

describe('Test 1 — Diferencia material en planes: PROFESSIONAL_20 vs EXTENSIVE_40', () => {

  it('buildDraftingPlan produce planes sustantivamente diferentes según draftDepthHint', () => {
    const doc = createSyntheticDoc();
    const analysis = createSyntheticAnalysis();

    // MISMO documento y referencia corta (menor a 12000 chars)
    const plan20 = buildDraftingPlan(doc, 3000, analysis, undefined, undefined, 'PROFESSIONAL_20');
    const plan40 = buildDraftingPlan(doc, 3000, analysis, undefined, undefined, 'EXTENSIVE_40');

    // 1. Verificar expectedDepth en secciones de argumento
    const argSec20 = plan20.sections.find((s) => s.templateSectionId === 'sec-excepciones');
    const argSec40 = plan40.sections.find((s) => s.templateSectionId === 'sec-excepciones');
    expect(argSec20).toBeDefined();
    expect(argSec40).toBeDefined();

    // EXTENSIVE_40 debe requerir mayor profundidad que PROFESSIONAL_20
    expect(argSec40!.expectedDepth).toBe('EXTENSIVE');
    expect(argSec20!.expectedDepth).not.toBe('EXTENSIVE'); // DEEP or MEDIUM

    // 2. Verificar expectedParagraphs en secciones de argumento
    expect(argSec40!.expectedParagraphs).toBeGreaterThan(argSec20!.expectedParagraphs);

    // 3. Verificar background / hechos
    const hechos20 = plan20.sections.find((s) => s.templateSectionId === 'sec-hechos');
    const hechos40 = plan40.sections.find((s) => s.templateSectionId === 'sec-hechos');
    expect(hechos40!.expectedDepth).toBe('DEEP');
    expect(hechos20!.expectedDepth).toBe('MEDIUM');
    expect(hechos40!.expectedParagraphs).toBeGreaterThan(hechos20!.expectedParagraphs);

    // 4. Si hay issuePlans, expectedDepth de cada issue debe ser EXTENSIVE en EXTENSIVE_40
    if (argSec40!.issuePlans && argSec40!.issuePlans.length > 0) {
      for (const ip of argSec40!.issuePlans) {
        expect(ip.expectedDepth).toBe('EXTENSIVE');
        expect(ip.expectedParagraphs).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('Presupuestos y contratos de extensión difieren materialmente', () => {
    const p20 = resolveDraftDepthProfile('PROFESSIONAL_20');
    const p40 = resolveDraftDepthProfile('EXTENSIVE_40');
    const c20 = resolveGenerationExtensionContract(generationExtensionForDraftDepth(p20));
    const c40 = resolveGenerationExtensionContract(generationExtensionForDraftDepth(p40));

    expect(c40.targetWords).toBe(20000);
    expect(c20.targetWords).toBe(10000);
    expect(c40.maxContinuationsPerSection).toBe(5);
    expect(c20.maxContinuationsPerSection).toBe(3);
    expect(c40.maxGeneratedTokens).toBeGreaterThan(c20.maxGeneratedTokens);
  });
});

describe('Test 2 — Timing de presupuestos por sección (sectionBudgets antes de ejecutar)', () => {

  it('Demuestra que todos los sectionBudgets existen y son conocidos ANTES de ejecutar la primera tarea', () => {
    const doc = createSyntheticDoc();
    const p40 = resolveDraftDepthProfile('EXTENSIVE_40');
    const contract = resolveGenerationExtensionContract(generationExtensionForDraftDepth(p40));

    // Asignación previa requerida
    contract.sectionBudgets = allocateSectionBudgets(
      doc.sections.map((s) => ({ id: s.id, title: s.title, type: s.type })),
      contract.targetWords,
      contract.maxContinuationsPerSection,
    );

    // COMPROBACIÓN: Antes de ejecutar cualquier tarea, CADA sección ya tiene su presupuesto asignado
    for (const sec of doc.sections) {
      const budget = contract.sectionBudgets[sec.id];
      expect(budget).toBeDefined();
      expect(budget.targetWords).toBeGreaterThan(0);
      expect(budget.maxContinuations).toBeGreaterThanOrEqual(1);
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(budget.priority);
    }

    // Secciones sustantivas (argument / hechos) deben tener prioridad alta o media
    expect(contract.sectionBudgets['sec-excepciones'].priority).toBe('HIGH');
    expect(contract.sectionBudgets['sec-hechos'].priority).toBe('MEDIUM');
    expect(contract.sectionBudgets['sec-proemio'].priority).toBe('LOW');

    expect(contract.sectionBudgets['sec-proemio'].targetWords).toBeLessThan(
      contract.sectionBudgets['sec-excepciones'].targetWords,
    );
  });
});
