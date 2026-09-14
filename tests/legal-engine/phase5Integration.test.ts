import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import type { DocumentNode, UniversalLegalDocument } from '@/lib/legal-engine/types';
import type { GenerationTask } from '@/lib/legal-engine/generationTasks';
import { executeGenerationTask, applySemanticEvaluationToCoverageMatrix } from '@/lib/legal-engine/generationTasks';
import type { CoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import { evaluateDocumentSemantics } from '@/lib/legal-engine/semanticEvaluator';
import { validateForExport } from '@/lib/legal-engine/exportGuards';

describe('FASE 5 — Integración End-to-End: Evaluación Semántica, Expansión y Cobertura Real (5Z)', () => {
  function createComplexAmparoDoc(): UniversalLegalDocument {
    const doc = createEmptyDocument({
      id: 'doc-amparo-directo-phase5',
      title: 'Demanda de Amparo Directo',
      documentType: 'escrito_libre',
      documentTypeLabel: 'Demanda de Amparo Directo',
      matter: 'civil',
      jurisdiction: 'federal',
    });
    doc.parties = {
      quejoso: 'Inmobiliaria y Arrendadora del Centro S.A. de C.V.',
      autoridadResponsable: 'Segunda Sala Civil del Tribunal Superior de Justicia',
      terceroInteresado: 'Corporación Financiera del Norte S.A. de C.V.',
    };
    doc.caseRefs = {
      expediente: 'toca-civil-456/2024',
    };
    doc.caseAnalysis = {
      facts: [
        { id: 'f-1', number: '1', text: 'La sentencia se emitió el 10 de enero de 2024.', confidence: 1 },
        { id: 'f-2', number: '2', text: 'La rescisión operó el 20 de febrero de 2024.', confidence: 1 },
      ],
      authorities: [],
    } as any;
    return doc;
  }

  it('Flujo Completo: 3 Issues con pase directo, REWRITE de genérico, y PATCH de prueba faltante resultan en cobertura total y aprobación', async () => {
    const doc = createComplexAmparoDoc();

    // 3 Tareas de generación para la sección de Conceptos de Violación / Agravios
    const task1: GenerationTask = {
      id: 'task-agravio-1',
      sectionId: 'sec-agravios',
      sectionTitle: 'CONCEPTOS DE VIOLACIÓN',
      taskType: 'ISSUE',
      complexity: 'DEEP',
      tokenBudget: 3600,
      status: 'pending',
      title: 'Violación al principio de legalidad y debida fundamentación',
      coverageItemIds: ['cov-issue-1'],
      factIds: ['fact-1'],
      evidenceIds: [],
      scopedFacts: [
        { id: 'fact-1', text: 'La Segunda Sala Civil emitió sentencia sin analizar las excepciones procesales oportunas el 10 de enero de 2024.' },
      ],
      scopedEvidence: [],
      scopedAuthorities: [],
      constitutionalArticles: ['14', '16'],
      conventionalArticles: [],
      issuePlan: {
        issueId: 'issue-1',
        title: 'Violación al principio de legalidad y debida fundamentación',
        targetConsideration: 'Considerando Segundo sobre la validez del emplazamiento',
        counterargumentStrategy: 'Demostrar la falta de fundamentación y motivación del considerando segundo',
        constitutionalStandard: 'Garantía de legalidad y debida fundamentación del artículo 16 constitucional',
      },
    };

    const task2: GenerationTask = {
      id: 'task-agravio-2',
      sectionId: 'sec-agravios',
      sectionTitle: 'CONCEPTOS DE VIOLACIÓN',
      taskType: 'ISSUE',
      complexity: 'DEEP',
      tokenBudget: 3600,
      status: 'pending',
      title: 'Incongruencia omisiva respecto a la rescisión contractual',
      coverageItemIds: ['cov-issue-2'],
      factIds: ['fact-2'],
      evidenceIds: [],
      scopedFacts: [
        { id: 'fact-2', text: 'El contrato de arrendamiento base de la acción feneció por rescisión justificada el 20 de febrero de 2024.' },
      ],
      scopedEvidence: [],
      scopedAuthorities: [],
      constitutionalArticles: ['14', '17'],
      conventionalArticles: [],
      issuePlan: {
        issueId: 'issue-2',
        title: 'Incongruencia omisiva respecto a la rescisión contractual',
        targetConsideration: 'Considerando Cuarto referente a la vigencia del contrato de arrendamiento',
        counterargumentStrategy: 'Acreditar que la Sala omitió estudiar la excepción de rescisión contractual previa',
        constitutionalStandard: 'Principio de congruencia y exhaustividad en las sentencias judiciales',
      },
    };

    const task3: GenerationTask = {
      id: 'task-agravio-3',
      sectionId: 'sec-agravios',
      sectionTitle: 'CONCEPTOS DE VIOLACIÓN',
      taskType: 'ISSUE',
      complexity: 'DEEP',
      tokenBudget: 3600,
      status: 'pending',
      title: 'Indebida valoración de la pericial contable sobre intereses usurarios',
      coverageItemIds: ['cov-issue-3'],
      factIds: ['fact-3'],
      evidenceIds: ['ev-pericial'],
      scopedFacts: [
        { id: 'fact-3', text: 'El cálculo de intereses moratorios excede el 8% mensual pactado contrariando la tasa legal.' },
      ],
      scopedEvidence: [
        { id: 'ev-pericial', title: 'Dictamen Pericial Contable', type: 'PERICIAL', description: 'Dictamen rendido por el perito auxiliar' },
      ],
      scopedAuthorities: [],
      constitutionalArticles: ['1', '21'],
      conventionalArticles: ['21.3 CADH'],
      issuePlan: {
        issueId: 'issue-3',
        title: 'Indebida valoración de la pericial contable sobre intereses usurarios',
        targetConsideration: 'Considerando Quinto sobre la cuantificación de intereses y costas',
        counterargumentStrategy: 'Desvirtuar la condena a intereses con el dictamen pericial contable',
        constitutionalStandard: 'Prohibición de usura y explotación del hombre por el hombre',
      },
    };

    // Coverage Matrix con los 3 requerimientos obligatorios
    const coverageMatrix: CoverageMatrix = {
      items: [
        {
          id: 'cov-issue-1',
          category: 'LEGAL_ISSUE',
          description: 'Legalidad y fundamentación de emplazamiento',
          required: true,
          status: 'pending',
          targetSectionIds: ['sec-agravios'],
        },
        {
          id: 'cov-issue-2',
          category: 'LEGAL_ISSUE',
          description: 'Incongruencia omisiva de rescisión',
          required: true,
          status: 'pending',
          targetSectionIds: ['sec-agravios'],
        },
        {
          id: 'cov-issue-3',
          category: 'LEGAL_ISSUE',
          description: 'Valoración de dictamen pericial sobre usura',
          required: true,
          status: 'pending',
          targetSectionIds: ['sec-agravios'],
        },
      ],
      summary: { total: 3, required: 3, pending: 3, generated: 0, covered: 0, weak: 0, unsupported: 0, notApplicable: 0 },
    };
    doc.coverageMatrix = coverageMatrix;

    // Generador mock inteligente que simula:
    // - Task 1: alta especificidad en pase 1 -> PASS
    // - Task 2: pase 1 genérico con clichés -> WEAK (trigger REWRITE) -> pase 2 específico -> PASS
    // - Task 3: pase 1 sin prueba -> WEAK (trigger PATCH/EXPAND) -> pase 2 integra Dictamen Pericial Contable -> PASS
    const smartMultiPassGenerator = async ({ task, pass }: any) => {
      if (task.id === 'task-agravio-1') {
        return `CONCEPTO DE VIOLACIÓN PRIMERO. VULNERACIÓN A LOS ARTÍCULOS 14 Y 16 CONSTITUCIONALES.
Causa agravio a la quejosa Inmobiliaria y Arrendadora del Centro S.A. de C.V. en el expediente toca-civil-456/2024 lo determinado en el Considerando Segundo sobre la validez del emplazamiento por la Segunda Sala Civil del Tribunal Superior de Justicia.
La autoridad responsable emitió sentencia sin analizar las excepciones procesales oportunas el 10 de enero de 2024, dejando en estado de indefensión a mi representada al conculcar la garantía de legalidad y debida fundamentación del artículo 16 constitucional.`;
      }

      if (task.id === 'task-agravio-2') {
        if (pass === 1) {
          // Borrador genérico con muletillas
          return `En primer lugar resulta evidente a todas luces de manera palmaria que la sentencia carece de fundamentación. En consecuencia, de las constancias de autos se desprende sin lugar a dudas que se violó la ley para todos los efectos legales a que haya lugar.`;
        }
        // Pase 2: REWRITE específico
        return `CONCEPTO DE VIOLACIÓN SEGUNDO. VIOLACIÓN AL PRINCIPIO DE CONGRUENCIA Y EXHAUSTIVIDAD.
La sentencia de la Segunda Sala Civil del Tribunal Superior de Justicia transgrede los artículos 14 y 17 constitucionales en su Considerando Cuarto referente a la vigencia del contrato de arrendamiento.
La Sala omitió pronunciarse sobre el hecho demostrado de que el contrato de arrendamiento base de la acción feneció por rescisión justificada el 20 de febrero de 2024 a favor de Inmobiliaria y Arrendadora del Centro S.A. de C.V. Dicha omisión incongruente contraviene la debida fundamentación y congruencia de los fallos judiciales.`;
      }

      if (task.id === 'task-agravio-3') {
        if (pass === 1) {
          // Omite la prueba
          return `CONCEPTO DE VIOLACIÓN TERCERO. VULNERACIÓN AL ARTÍCULO 1 CONSTITUCIONAL POR USURA.
En el Considerando Quinto sobre la cuantificación de intereses y costas, la autoridad responsable incurre en transgresión al artículo 1 constitucional y 21 de la Convención Americana sobre Derechos Humanos al condenar a intereses lesivos.`;
        }
        // Pase 2: Integra la prueba requerida
        return `CONCEPTO DE VIOLACIÓN TERCERO. VULNERACIÓN AL ARTÍCULO 1 CONSTITUCIONAL Y 21 DE LA CONVENCIÓN AMERICANA SOBRE DERECHOS HUMANOS POR INDEBIDA VALORACIÓN PROBATORIA.
El Considerando Quinto sobre la cuantificación de intereses y costas transgrede los derechos de la quejosa Inmobiliaria y Arrendadora del Centro S.A. de C.V. al validar un pacto usurario.
La Sala omitió valorar el Dictamen Pericial Contable rendido en autos, el cual demuestra fehacientemente que el cálculo de intereses moratorios excede el 8% mensual pactado contrariando la tasa legal aplicable y acreditando la explotación económica prohibida por el artículo 21.3 de la Convención Americana y el artículo 1 constitucional.`;
      }

      return 'Texto de respaldo';
    };

    // 1. Ejecutar Tarea 1
    const res1 = await executeGenerationTask(task1, doc, undefined, smartMultiPassGenerator);
    expect(res1.result.success).toBe(true);
    expect(task1.passes).toBe(1);
    expect(task1.evaluation?.verdict).toBe('PASS');

    // 2. Ejecutar Tarea 2 (debe activar revisión REWRITE y terminar en PASS)
    const res2 = await executeGenerationTask(task2, doc, undefined, smartMultiPassGenerator);
    expect(res2.result.success).toBe(true);
    expect(task2.passes).toBe(2);
    expect(task2.revisionPasses).toBe(1);
    expect(task2.evaluation?.verdict).toBe('PASS');

    // Confirmación de trazabilidad de revisión real completa (Ítem 7):
    expect(res2.block.taskId).toBe(task2.id);
    expect(res2.block.coverageItemIds).toEqual(task2.coverageItemIds);
    expect(res2.block.factIds).toEqual(task2.factIds);
    expect(res2.block.evidenceIds).toEqual(task2.evidenceIds);
    expect(res2.block.revisionOfBlockId).toBeDefined();
    expect(res2.block.revisionNumber).toBe(1);
    expect(task2.generatedBlockIds).toBeDefined();
    expect(task2.generatedBlockIds!).toContain(res2.block.id);
    expect(task2.generatedBlockIds![task2.generatedBlockIds!.length - 1]).toBe(res2.block.id);

    // 3. Ejecutar Tarea 3 (debe activar revisión PATCH/EXPAND y terminar en PASS)
    const res3 = await executeGenerationTask(task3, doc, undefined, smartMultiPassGenerator);
    expect(res3.result.success).toBe(true);
    expect(task3.passes).toBe(2);
    expect(task3.revisionPasses).toBe(1);
    expect(task3.evaluation?.verdict).toBe('PASS');

    // 4. Aplicar evaluaciones semánticas a la CoverageMatrix (5S)
    applySemanticEvaluationToCoverageMatrix(doc.coverageMatrix, [task1, task2, task3]);

    // Verificar que los 3 requerimientos quedaron 'covered'
    expect(doc.coverageMatrix.summary.covered).toBe(3);
    expect(doc.coverageMatrix.summary.weak).toBe(0);
    expect(doc.coverageMatrix.items.every((i) => i.status === 'covered')).toBe(true);

    // 5. Evaluar documento completo
    const blockEvaluations = [task1.evaluation!, task2.evaluation!, task3.evaluation!];
    const docEval = evaluateDocumentSemantics(doc, doc.coverageMatrix, blockEvaluations);
    doc.semanticEvaluation = docEval;

    expect(docEval.overallVerdict).toBe('PASS');
    expect(docEval.isComplete).toBe(true);
    expect(docEval.uncoveredRequiredItems).toHaveLength(0);

    // 6. Ensamblar secciones mínimas para Quality Gate
    const secAgravios: DocumentNode = {
      id: 'sec-agravios',
      title: 'CONCEPTOS DE VIOLACIÓN',
      type: 'argument',
      order: 30,
      content: [res1.block, res2.block, res3.block],
      isRepeatable: false,
      isEditable: true,
      isGenerated: true,
      isManuallyEdited: false,
      variables: [],
      validationErrors: [],
      validationWarnings: [],
    };
    const secPetitorios: DocumentNode = {
      id: 'sec-petitorios',
      title: 'PUNTOS PETITORIOS',
      type: 'petition',
      order: 40,
      content: [
        {
          id: 'blk-pet',
          text: 'ÚNICO. Se conceda el amparo y protección de la Justicia de la Unión a la quejosa contra el acto reclamado.',
          layer: 'USER_POSITION',
          generationRequirement: 'DETERMINISTIC',
        },
      ],
      isRepeatable: false,
      isEditable: true,
      isGenerated: false,
      isManuallyEdited: false,
      variables: [],
      validationErrors: [],
      validationWarnings: [],
    };
    doc.sections = [secAgravios, secPetitorios];

    const qg = runQualityGateCheck(doc);
    expect(qg.passed).toBe(true);
    expect(qg.criticalErrors.some((e) => e.checkId === 'UNRESOLVED_COVERAGE_REQUIREMENT')).toBe(false);
  });

  it('Variante de Falla: Si un issue no subsana sus deficiencias tras 2 revisiones, queda WEAK, no es covered y Quality Gate bloquea', async () => {
    const doc = createComplexAmparoDoc();

    const stubbornTask: GenerationTask = {
      id: 'task-agravio-falla',
      sectionId: 'sec-agravios',
      sectionTitle: 'CONCEPTOS DE VIOLACIÓN',
      taskType: 'ISSUE',
      complexity: 'DEEP',
      tokenBudget: 3600,
      status: 'pending',
      title: 'Omisión de estudio probatorio',
      coverageItemIds: ['cov-issue-stubborn'],
      scopedFacts: [{ id: 'fact-1', text: 'Hecho sustancial sobre el saldo insoluto.' }],
      scopedEvidence: [{ id: 'ev-1', title: 'Pericial Contable' }],
      constitutionalArticles: ['14'],
      issuePlan: {
        issueId: 'issue-stubborn',
        title: 'Omisión de estudio probatorio',
        targetConsideration: 'Considerando Tercero',
        counterargumentStrategy: 'Atacar el considerando tercero con la prueba pericial',
        constitutionalStandard: 'Debido proceso y valoración probatoria',
      },
    };

    const matrix: CoverageMatrix = {
      items: [
        {
          id: 'cov-issue-stubborn',
          category: 'LEGAL_ISSUE',
          description: 'Omisión de estudio probatorio pericial',
          required: true,
          status: 'pending',
          targetSectionIds: ['sec-agravios'],
        },
      ],
      summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, weak: 0, unsupported: 0, notApplicable: 0 },
    };
    doc.coverageMatrix = matrix;

    // Generador que siempre repite clichés sin importar cuántas revisiones se le soliciten
    const persistentClichesGenerator = async () => {
      return `En primer lugar resulta evidente a todas luces que de las constancias de autos se desprende sin lugar a dudas que para todos los efectos legales a que haya lugar la sentencia es ilegal.`;
    };

    await executeGenerationTask(stubbornTask, doc, undefined, persistentClichesGenerator);
    expect(stubbornTask.revisionPasses).toBe(2); // Agotó el máximo permitido de 2 revisiones
    expect(stubbornTask.evaluation?.verdict).toBe('WEAK');

    // Al actualizar la CoverageMatrix:
    applySemanticEvaluationToCoverageMatrix(doc.coverageMatrix, [stubbornTask]);
    const item = doc.coverageMatrix.items.find((i) => i.id === 'cov-issue-stubborn')!;
    expect(item.status).toBe('weak');
    expect(item.status).not.toBe('covered');

    // Document Semantic Evaluation:
    const docEval = evaluateDocumentSemantics(doc, doc.coverageMatrix, [stubbornTask.evaluation!]);
    doc.semanticEvaluation = docEval;
    expect(docEval.isComplete).toBe(false);
    expect(docEval.overallVerdict).toBe('WEAK');
    expect(docEval.uncoveredRequiredItems).toContain('cov-issue-stubborn');

    // Quality Gate debe fallar por requerimiento de cobertura no cubierto
    const qg = runQualityGateCheck(doc);
    expect(qg.passed).toBe(false);
    expect(qg.criticalErrors.some((e) => e.checkId === 'UNRESOLVED_COVERAGE_REQUIREMENT')).toBe(true);
    (doc as any).qualityGate = qg;

    // Export guard debe bloquear la exportación como segunda barrera
    const exportRes = validateForExport(doc);
    expect(exportRes.ok).toBe(false);
    expect(exportRes.errors.some((e) => e.includes('QUALITY_GATE_FAILED'))).toBe(true);
  });

  it('Verificación end-to-end: [DATO PENDIENTE DE EXPEDIENTE: ...] produce falla en cadena (Ítem 6)', async () => {
    const doc = createComplexAmparoDoc();
    const taskWithPendingData: GenerationTask = {
      id: 'task-agravio-pending',
      sectionId: 'sec-agravios',
      sectionTitle: 'CONCEPTOS DE VIOLACIÓN',
      taskType: 'ISSUE',
      complexity: 'MEDIUM',
      tokenBudget: 2200,
      status: 'pending',
      title: 'Agravio con dependencia fáctica no resuelta',
      coverageItemIds: ['cov-issue-pending'],
      factIds: ['f-1'],
      evidenceIds: [],
      scopedFacts: [{ id: 'f-1', text: 'La sentencia se emitió el 10 de enero de 2024.' }],
      scopedEvidence: [],
      constitutionalArticles: ['14', '16'],
      issuePlan: {
        issueId: 'issue-pending',
        title: 'Falta de notificación formal',
        targetConsideration: 'Considerando Primero',
        counterargumentStrategy: 'Demostrar que la fecha de notificación no consta legalmente',
        constitutionalStandard: 'Garantía de debida audiencia',
      },
    };

    const matrix: CoverageMatrix = {
      items: [
        {
          id: 'cov-issue-pending',
          category: 'LEGAL_ISSUE',
          description: 'Falta de notificación formal',
          required: true,
          status: 'pending',
          targetSectionIds: ['sec-agravios'],
        },
      ],
      summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, weak: 0, unsupported: 0, notApplicable: 0 },
    };
    doc.coverageMatrix = matrix;

    // Generador que emite marcador formal de dato pendiente de autos
    const pendingDataGenerator = async () => {
      return `CONCEPTO DE VIOLACIÓN.
Causa agravio a Inmobiliaria y Arrendadora del Centro S.A. de C.V. la resolución de la Segunda Sala Civil en el toca-civil-456/2024.
La autoridad responsable omitió notificar formalmente el inicio del procedimiento en la fecha de [DATO PENDIENTE DE EXPEDIENTE: fecha exacta de notificación del acuerdo], vulnerando el artículo 14 constitucional.`;
    };

    const { block } = await executeGenerationTask(taskWithPendingData, doc, undefined, pendingDataGenerator);
    // 1. Semantic Evaluator: detecta la dependencia fáctica y asigna hard fail
    expect(taskWithPendingData.evaluation).toBeDefined();
    expect(taskWithPendingData.evaluation?.verdict).toBe('FAIL');
    expect(taskWithPendingData.evaluation?.unsupportedAssertionPenalty).toBe(1.0);
    expect(taskWithPendingData.evaluation?.hardFailReasons.some((r) => r.includes('UNRESOLVED_FACTUAL_DEPENDENCY'))).toBe(true);

    // 2. CoverageItem NO queda covered (queda unsupported o weak)
    applySemanticEvaluationToCoverageMatrix(doc.coverageMatrix, [taskWithPendingData]);
    const item = doc.coverageMatrix.items.find((i) => i.id === 'cov-issue-pending')!;
    expect(item.status).not.toBe('covered');
    expect(doc.coverageMatrix.summary.covered).toBe(0);

    // 3. Document Semantic Evaluation: isComplete=false y uncoveredRequiredItems contiene el item
    const docEval = evaluateDocumentSemantics(doc, doc.coverageMatrix, [taskWithPendingData.evaluation!]);
    doc.semanticEvaluation = docEval;
    expect(docEval.isComplete).toBe(false);
    expect(docEval.uncoveredRequiredItems).toContain('cov-issue-pending');

    // Ensamblar sección con el bloque para que ExportGuards y QualityGate inspeccionen el texto
    doc.sections = [
      {
        id: 'sec-agravios',
        title: 'CONCEPTOS DE VIOLACIÓN',
        content: [block],
      } as any,
    ];

    // 4. Quality Gate FAIL por requerimiento de cobertura obligatorio no cubierto
    const qg = runQualityGateCheck(doc);
    expect(qg.passed).toBe(false);
    expect(qg.criticalErrors.some((e) => e.checkId === 'UNRESOLVED_COVERAGE_REQUIREMENT')).toBe(true);
    (doc as any).qualityGate = qg;

    // 5. Export BLOCKED por barreras de Quality Gate y marcador de placeholder no resuelto
    const exportRes = validateForExport(doc);
    expect(exportRes.ok).toBe(false);
    expect(exportRes.errors.some((e) => e.includes('QUALITY_GATE_FAILED'))).toBe(true);
    expect(exportRes.errors.some((e) => e.includes('UNRESOLVED_FACTUAL_DEPENDENCY'))).toBe(true);
  });
});
