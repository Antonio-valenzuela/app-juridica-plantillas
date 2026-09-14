import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import type { ContentBlock, UniversalLegalDocument } from '@/lib/legal-engine/types';
import type { GenerationTask } from '@/lib/legal-engine/generationTasks';
import { executeGenerationTask, applySemanticEvaluationToCoverageMatrix } from '@/lib/legal-engine/generationTasks';
import type { CoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import {
  evaluateBlockQuality,
  calculateCaseSpecificity,
  calculateRepetitionPenalty,
  evaluateEvidenceLinkage,
  evaluateFactualCoverage,
  evaluateIssueResponsiveness,
  evaluateClaimDepth,
  evaluateFactResponseDepth,
  detectUnsupportedAssertions,
  buildTargetedRevisionPrompt,
  evaluateDocumentSemantics,
  validateAiSemanticEvaluationOutput,
  toBlockQualityEvaluation,
  SEMANTIC_THRESHOLDS,
  type BlockQualityEvaluation,
} from '@/lib/legal-engine/semanticEvaluator';

function createMockTask(overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    id: 'task-issue-1',
    sectionId: 'sec-agravios',
    sectionTitle: 'AGRAVIOS',
    taskType: 'ISSUE',
    complexity: 'DEEP',
    tokenBudget: 3600,
    status: 'pending',
    title: 'Indebida valoración de la prueba pericial en contabilidad',
    objective: 'Demostrar que la sala omitió valorar la pericial y violó el artículo 14 constitucional',
    coverageItemIds: ['cov-issue-1'],
    factIds: ['fact-1'],
    evidenceIds: ['ev-1'],
    authorityIds: [],
    scopedFacts: [
      { id: 'fact-1', text: 'El perito contable determinó un saldo insoluto de $500,000.00 pesos M.N. el 15 de marzo de 2024.' },
    ],
    scopedEvidence: [
      { id: 'ev-1', title: 'Dictamen Pericial en Materia Contable', type: 'PERICIAL', description: 'Dictamen emitido por el C.P. Juan Pérez' },
    ],
    scopedAuthorities: [],
    constitutionalArticles: ['14', '16'],
    conventionalArticles: [],
    issuePlan: {
      issueId: 'issue-1',
      title: 'Indebida valoración de la prueba pericial en contabilidad',
      targetConsideration: 'Considerando Tercero de la sentencia reclamada relativo a la inexistencia del adeudo',
      counterargumentStrategy: 'Evidenciar la omisión de estudio del dictamen pericial contable que demuestra el saldo insoluto',
      constitutionalStandard: 'Garantía de debida fundamentación y motivación en la valoración probatoria',
    },
    ...overrides,
  };
}

function createMockDoc(): UniversalLegalDocument {
  const doc = createEmptyDocument({
    id: 'doc-phase5-test',
    title: 'Juicio de Amparo Directo',
    documentType: 'demanda_amparo_directo',
    documentTypeLabel: 'Demanda de Amparo Directo',
    matter: 'civil',
  });
  doc.parties = {
    quejoso: 'Inmobiliaria del Centro S.A. de C.V.',
    autoridadResponsable: 'Segunda Sala Civil del Tribunal Superior',
    terceroInteresado: 'Desarrollos Comerciales del Norte S.A.',
  };
  doc.caseRefs = {
    expediente: '123/2024',
  };
  return doc;
}

describe('FASE 5 — Evaluación Semántica y Anti-Genericidad (Unit Tests)', () => {
  it('aplica la evaluación issue-scoped con el contrato de coverage completo', () => {
    const matrix: CoverageMatrix = {
      items: [{
        id: 'cov-issue-1',
        category: 'LEGAL_ISSUE',
        description: 'Omisión de valoración pericial contable',
        required: true,
        status: 'pending',
        targetSectionIds: ['sec-agravios'],
      }],
      summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, weak: 0, unsupported: 0, notApplicable: 0 },
    };
    const issueScopedEvaluation = {
      legalIssueId: 'issue-1',
      taskId: 'task-issue-1',
      blockId: 'blk-task-issue-1',
      sectionId: 'sec-agravios',
      specificity: 0.8,
      factualGrounding: 0.8,
      evidenceGrounding: 0.8,
      positionConsistency: 1,
      authorityDiscipline: 1,
      application: 1,
      completeness: 1,
      overallScore: 0.88,
      verdict: 'PASS' as const,
      revisionMode: 'NONE' as const,
      deficiencies: [],
      hardFailReasons: [],
    };

    const blockEvaluation = toBlockQualityEvaluation(
      issueScopedEvaluation,
      createMockTask(),
    );
    expect(() => applySemanticEvaluationToCoverageMatrix(matrix, [blockEvaluation])).not.toThrow();
    expect(matrix.items[0].status).toBe('covered');
  });

  // 1. generated != covered
  it('1. generated != covered: un bloque generado con éxito técnico pero reprobado semánticamente no pasa a "covered"', async () => {
    const doc = createMockDoc();
    const task = createMockTask();
    const matrix: CoverageMatrix = {
      items: [
        {
          id: 'cov-issue-1',
          category: 'LEGAL_ISSUE',
          description: 'Omisión de valoración pericial',
          required: true,
          status: 'pending',
          targetSectionIds: ['sec-agravios'],
        },
      ],
      summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, weak: 0, unsupported: 0, notApplicable: 0 },
    };

    // Generador que produce texto genérico vacío de autos
    const genericGenerator = async () => {
      return `En primer lugar, resulta evidente a todas luces que la resolución recurrida carece de fundamentación. En consecuencia, de las constancias de autos se desprende sin lugar a dudas que se violaron mis derechos humanos. Para todos los efectos legales a que haya lugar, se solicita el amparo.`;
    };

    const { result } = await executeGenerationTask(task, doc, undefined, genericGenerator);
    expect(result.success).toBe(true);
    expect(task.status).toBe('completed');
    expect(task.evaluation?.verdict).toBe('WEAK');

    // Al aplicar la evaluación semántica a la CoverageMatrix:
    applySemanticEvaluationToCoverageMatrix(matrix, [task]);
    const item = matrix.items.find((i) => i.id === 'cov-issue-1')!;
    expect(item.status).not.toBe('covered');
    expect(item.status).toBe('weak');
  });

  // 2. PASS promueve a covered
  it('2. Bloque evaluado con veredicto PASS promueve el coverage item a "covered"', async () => {
    const doc = createMockDoc();
    const task = createMockTask();
    const matrix: CoverageMatrix = {
      items: [
        {
          id: 'cov-issue-1',
          category: 'LEGAL_ISSUE',
          description: 'Omisión de valoración pericial contable',
          required: true,
          status: 'pending',
          targetSectionIds: ['sec-agravios'],
        },
      ],
      summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, weak: 0, unsupported: 0, notApplicable: 0 },
    };

    const specificForensicGenerator = async () => {
      return `AGRAVIO PRIMERO. VULNERACIÓN AL ARTÍCULO 14 CONSTITUCIONAL POR OMISIÓN DE ESTUDIO DEL DICTAMEN PERICIAL CONTABLE.
Causa agravio directo a mi mandante Inmobiliaria del Centro S.A. de C.V. el Considerando Tercero de la sentencia reclamada dictada en el expediente 123/2024, en el cual la Segunda Sala Civil desestimó la procedencia de la condena sin fundar ni motivar su determinación.
En efecto, la responsable omitió valorar exhaustivamente el Dictamen Pericial en Materia Contable rendido en autos, el cual demuestra de forma fehaciente que el perito contable determinó un saldo insoluto de $500,000.00 pesos M.N. el 15 de marzo de 2024.
Dicho medio de convicción acredita que la parte demandada incurrió en mora, por lo que la omisión de la Sala transgrede las formalidades esenciales del procedimiento y los principios de congruencia y exhaustividad.`;
    };

    const { result } = await executeGenerationTask(task, doc, undefined, specificForensicGenerator);
    expect(result.success).toBe(true);
    expect(task.evaluation?.verdict).toBe('PASS');

    applySemanticEvaluationToCoverageMatrix(matrix, [task]);
    const item = matrix.items.find((i) => i.id === 'cov-issue-1')!;
    expect(item.status).toBe('covered');
  });

  // 3. Factual coverage
  it('3. Factual coverage detecta uso de hechos asignados y penaliza omisión total', () => {
    const task = createMockTask();
    const textWithFacts = 'Conforme al dictamen, el perito contable determinó formalmente un saldo insoluto de $500,000.00 pesos el día 15 de marzo de 2024.';
    const resWithFacts = evaluateFactualCoverage(textWithFacts, task);
    expect(resWithFacts.score).toBeGreaterThanOrEqual(0.7);
    expect(resWithFacts.deficiencies).toHaveLength(0);

    const textWithoutFacts = 'La autoridad responsable violentó los derechos fundamentales del promovente al dictar un acto carente de legalidad en el juicio de origen.';
    const resWithoutFacts = evaluateFactualCoverage(textWithoutFacts, task);
    expect(resWithoutFacts.score).toBeLessThan(0.4);
    expect(resWithoutFacts.deficiencies.length).toBeGreaterThan(0);
  });

  // 4. Legal support
  it('4. Legal support evalúa fundamentación normativa y lógica jurídica sin exigir jurisprudencia cuando no hay tesis en contexto', () => {
    const doc = createMockDoc();
    const task = createMockTask({ scopedAuthorities: [] });
    const blockWithArticles: ContentBlock = {
      id: 'blk-test-law',
      layer: 'GENERATED_ARGUMENT',
      text: 'Se actualiza una violación directa a los artículos 14 y 16 de la Constitución Política de los Estados Unidos Mexicanos, así como al Código de Comercio.',
    };

    const evalRes = evaluateBlockQuality(blockWithArticles, task, doc);
    expect(evalRes.legalSupport).toBeGreaterThanOrEqual(0.7);
    expect(evalRes.deficiencies.some((d) => d.includes('criterios o jurisprudencias no autorizados'))).toBe(false);
  });

  // 5. Evidence linkage
  it('5. Evidence linkage premia mención de pruebas con estándar de valoración', () => {
    const task = createMockTask();
    const textWithProofStandard = 'El Dictamen Pericial en Materia Contable obra a fojas de autos y acredita plenamente el saldo insoluto en favor de la actora.';
    const resWithProof = evaluateEvidenceLinkage(textWithProofStandard, task);
    expect(resWithProof.score).toBeGreaterThanOrEqual(0.8);
    expect(resWithProof.evidenceUsed).toContain('Dictamen Pericial en Materia Contable');

    const textHollow = 'De las pruebas se desprende sin lugar a dudas que nos asiste la razón conforme a las constancias.';
    const resHollow = evaluateEvidenceLinkage(textHollow, task);
    expect(resHollow.score).toBeLessThanOrEqual(0.2);
    expect(resHollow.deficiencies.some((d) => d.includes('Cita genérica a "pruebas"'))).toBe(true);
  });

  // 6. Issue responsiveness
  it('6. Issue responsiveness penaliza desvío de la controversia asignada', () => {
    const task = createMockTask();
    const responsiveText = 'Se combate expresamente el Considerando Tercero de la sentencia reclamada relativo a la inexistencia del adeudo, toda vez que incurre en incongruencia al omitir el estudio del dictamen pericial contable que demuestra el saldo insoluto.';
    const respRes = evaluateIssueResponsiveness(responsiveText, task);
    expect(respRes.score).toBeGreaterThanOrEqual(0.7);

    const unresponsiveText = 'El principio pro persona contenido en el artículo 1 constitucional impone juzgar con perspectiva de género en todos los asuntos de la vida republicana.';
    const unrespRes = evaluateIssueResponsiveness(unresponsiveText, task);
    expect(unrespRes.score).toBeLessThan(0.3);
    expect(unrespRes.deficiencies.some((d) => d.includes('no responde a la controversia asignada'))).toBe(true);
  });

  // 7. Specificity
  it('7. Specificity penaliza bloques con baja densidad fáctica del caso', () => {
    const doc = createMockDoc();
    const task = createMockTask();

    const denseText = 'En el expediente 123/2024, la quejosa Inmobiliaria del Centro S.A. de C.V. demostró con el Dictamen Pericial en Materia Contable del 15 de marzo de 2024 que la autoridad responsable Segunda Sala Civil violó los artículos 14 y 16 constitucionales al desconocer la cantidad de $500,000.00 pesos.';
    const denseRes = calculateCaseSpecificity(denseText, task, doc);
    expect(denseRes.specificity).toBeGreaterThanOrEqual(0.5);

    const abstractText = 'En primer lugar, resulta evidente a todas luces que para todos los efectos legales a que haya lugar la justicia y equidad deben prevalecer de manera palmaria.';
    const abstractRes = calculateCaseSpecificity(abstractText, task, doc);
    expect(abstractRes.specificity).toBeLessThan(0.2);
  });

  // 8. Repetition penalty (internal)
  it('8. Repetition penalty detecta párrafos duplicados y n-gramas repetitivos internos', () => {
    const repeatedText = [
      'La autoridad responsable violó flagrantemente las garantías individuales de legalidad y debido proceso consagradas en la carta magna al emitir una resolución infundada.',
      'La autoridad responsable violó flagrantemente las garantías individuales de legalidad y debido proceso consagradas en la carta magna al emitir una resolución infundada.',
    ].join('\n\n');

    const repRes = calculateRepetitionPenalty(repeatedText);
    expect(repRes.penalty).toBeGreaterThanOrEqual(0.35);
    expect(repRes.duplicateDetails.some((d) => d.includes('alta redundancia textual'))).toBe(true);
  });

  // 9. Repetition penalty (siblings)
  it('9. Repetition penalty detecta solapamiento sustantivo con bloques hermanos de la misma sección', () => {
    const currentBlockText = 'El tribunal colegiado vulneró el artículo 14 constitucional al omitir el estudio de las constancias procesales y desestimar las pretensiones de mi representada.';
    const siblingBlockText = 'El tribunal colegiado vulneró el artículo 14 constitucional al omitir el estudio de las constancias procesales y desestimar las pretensiones de mi representada con notoria ilegalidad.';

    const repRes = calculateRepetitionPenalty(currentBlockText, [siblingBlockText]);
    expect(repRes.penalty).toBeGreaterThan(0.3);
    expect(repRes.duplicateDetails.some((d) => d.includes('bloque hermano'))).toBe(true);
  });

  // 10. Anti-genericidad
  it('10. Anti-genericidad detecta y penaliza clichés retóricos ("en primer lugar", "en consecuencia", "resulta evidente")', () => {
    const doc = createMockDoc();
    const task = createMockTask();
    const clichesText = 'En primer lugar, resulta evidente que en segundo lugar a todas luces de manera palmaria se niega por improcedente lo alegado.';
    const spec = calculateCaseSpecificity(clichesText, task, doc);
    expect(spec.genericPhrasesCount).toBeGreaterThanOrEqual(4);
    expect(spec.specificity).toBeLessThan(0.15);
  });

  // 11. Afirmaciones no sustentadas / jurisprudencia fabricada
  it('11. Detección de afirmaciones no sustentadas / jurisprudencia fabricada', () => {
    const task = createMockTask({ scopedAuthorities: [] });
    const caseAnalysis: CaseAnalysis = { authorities: [] } as any;

    const fabricatedText = 'Como lo sostiene la jurisprudencia con Registro digital 2099999 de rubro: USURA EN PAGARÉS MERCANTILES. SU ANÁLISIS OFICIOSO.';
    const unsupportedRes = detectUnsupportedAssertions(fabricatedText, task, caseAnalysis);
    expect(unsupportedRes.penalty).toBe(1.0);
    expect(unsupportedRes.hardFailReasons.some((r) => r.includes('FABRICATED_AUTHORITY'))).toBe(true);
  });

  // 12. Dependencias fácticas no resueltas
  it('12. Bloque con dependencias fácticas no resueltas recibe FAIL inmediato y penalización máxima', () => {
    const doc = createMockDoc();
    const task = createMockTask();
    const block: ContentBlock = {
      id: 'blk-unresolved',
      layer: 'GENERATED_ARGUMENT',
      text: 'La cantidad demandada asciende a [DATO PENDIENTE DE EXPEDIENTE: Monto total del adeudo] según contrato.',
    };

    const evalRes = evaluateBlockQuality(block, task, doc);
    expect(evalRes.verdict).toBe('FAIL');
    expect(evalRes.unsupportedAssertionPenalty).toBe(1.0);
    expect(evalRes.hardFailReasons.some((r) => r.includes('UNRESOLVED_FACTUAL_DEPENDENCY'))).toBe(true);
  });

  // 13. Seed markers
  it('13. Bloque con seed markers recibe FAIL inmediato', () => {
    const doc = createMockDoc();
    const task = createMockTask();
    const block: ContentBlock = {
      id: 'blk-seed',
      layer: 'GENERATED_ARGUMENT',
      text: '[Desarrollar por la IA la argumentación jurídica correspondiente]',
    };

    const evalRes = evaluateBlockQuality(block, task, doc);
    expect(evalRes.verdict).toBe('FAIL');
    expect(evalRes.hardFailReasons.some((r) => r.includes('SEED_MARKER_PRESENT'))).toBe(true);
  });

  // 14. Truncado
  it('14. Bloque truncado recibe penalización y no pasa evaluación', () => {
    const doc = createMockDoc();
    const task = createMockTask({ isTruncated: true });
    const block: ContentBlock = {
      id: 'blk-trunc',
      layer: 'GENERATED_ARGUMENT',
      generationStatus: 'truncated',
      text: 'El agravio que se hace valer consiste en que la sala responsable omitió considerar que...',
    };

    const evalRes = evaluateBlockQuality(block, task, doc);
    expect(evalRes.verdict).toBe('FAIL');
    expect(evalRes.hardFailReasons.some((r) => r.includes('UNRESOLVED_TRUNCATION'))).toBe(true);
  });

  // 15. Contestación de hechos telegráfica
  it('15. Contestación de hechos telegráfica ("Es falso") recibe score bajo y veredicto WEAK', () => {
    const task = createMockTask({ taskType: 'FACT_RESPONSE', title: 'Hecho 3 de la demanda' });
    const shortFactRes = evaluateFactResponseDepth('Es falso.', task);
    expect(shortFactRes.score).toBeLessThanOrEqual(0.2);
    expect(shortFactRes.deficiencies.some((d) => d.includes('Respuesta telegráfica al hecho'))).toBe(true);
  });

  // 16. Contestación de prestaciones superficial
  it('16. Contestación de prestaciones superficial ("Se niega por improcedente") recibe score bajo y veredicto WEAK', () => {
    const task = createMockTask({ taskType: 'CLAIM', title: 'Prestación B' });
    const shortClaimRes = evaluateClaimDepth('Se niega por improcedente.', task);
    expect(shortClaimRes.score).toBeLessThanOrEqual(0.2);
    expect(shortClaimRes.deficiencies.some((d) => d.includes('Contestación superficial de la prestación'))).toBe(true);
  });

  // 17. Contestación circunstanciada de hecho
  it('17. Contestación circunstanciada de hecho con postura explícita recibe veredicto PASS', () => {
    const doc = createMockDoc();
    const task = createMockTask({
      taskType: 'FACT_RESPONSE',
      title: 'Hecho 1',
      scopedFacts: [
        { id: 'fact-1', text: 'El actor sostiene que la demandada no entregó el inmueble el 15 de marzo de 2024.' },
      ],
      scopedEvidence: [],
      evidenceIds: [],
    });
    const block: ContentBlock = {
      id: 'blk-fact-ok',
      layer: 'GENERATED_ARGUMENT',
      text: 'AL HECHO NÚMERO 1: El hecho correlativo es FALSO y se niega en su totalidad. Lo cierto es que el día 15 de marzo de 2024 la demandada Inmobiliaria del Centro S.A. de C.V. entregó formalmente el inmueble como se acreditará en autos con el acta de entrega-recepción correspondiente.',
    };

    const evalRes = evaluateBlockQuality(block, task, doc);
    expect(evalRes.argumentDepth).toBeGreaterThanOrEqual(0.7);
    expect(evalRes.verdict).toBe('PASS');
  });

  // 18. Contestación de prestación con defensa de fondo
  it('18. Contestación de prestación con defensa de fondo y sustento fáctico recibe veredicto PASS', () => {
    const doc = createMockDoc();
    const task = createMockTask({
      taskType: 'CLAIM',
      title: 'Prestación Principal',
      scopedFacts: [
        { id: 'fact-1', text: 'El actor demanda el pago de pesos derivado del contrato.' },
      ],
      scopedEvidence: [],
      evidenceIds: [],
    });
    const block: ContentBlock = {
      id: 'blk-claim-ok',
      layer: 'GENERATED_ARGUMENT',
      text: 'A LA PRESTACIÓN IDENTIFICADA CON EL INCISO A): Se niega la procedencia de la demanda de pago de pesos derivada del contrato en virtud de que el actor carece de acción y derecho. Al efecto se opone la excepción de prescripción liberatoria y pago acreditado el 15 de marzo de 2024 a favor de Inmobiliaria del Centro S.A. de C.V., toda vez que no se satisfacen los presupuestos de los artículos 14 y 16 aplicables.',
    };

    const evalRes = evaluateBlockQuality(block, task, doc);
    expect(evalRes.argumentDepth).toBeGreaterThanOrEqual(0.7);
    expect(evalRes.verdict).toBe('PASS');
  });

  // 19. REWRITE prompt
  it('19. Generación de prompt de revisión dirigida en modo REWRITE por clichés/repetición', () => {
    const task = createMockTask();
    const currentBlock: ContentBlock = {
      id: 'blk-cliche',
      layer: 'GENERATED_ARGUMENT',
      text: 'En primer lugar resulta evidente a todas luces de manera palmaria...',
    };
    const evaluation: BlockQualityEvaluation = {
      blockId: currentBlock.id,
      taskId: task.id,
      factualCoverage: 0.2,
      legalSupport: 0.3,
      evidenceLinkage: 0.1,
      issueResponsiveness: 0.2,
      argumentDepth: 0.2,
      specificity: 0.1,
      completeness: 0.2,
      repetitionPenalty: 0.4,
      unsupportedAssertionPenalty: 0,
      overallScore: 0.25,
      verdict: 'WEAK',
      revisionMode: 'REWRITE',
      deficiencies: ['Abuso de clichés retóricos', 'Alta redundancia'],
      coveredCoverageItemIds: [],
      missingCoverageItemIds: ['cov-issue-1'],
      hardFailReasons: [],
    };

    const prompt = buildTargetedRevisionPrompt(task, currentBlock, evaluation);
    expect(prompt.systemInstruction).toContain('MODO DE REVISIÓN ASIGNADO: REWRITE');
    expect(prompt.systemInstruction).toContain('Abuso de clichés retóricos');
    expect(prompt.userMessage).toContain(currentBlock.text);
  });

  // 20. EXPAND prompt
  it('20. Generación de prompt de revisión dirigida en modo EXPAND por desarrollo insuficiente', () => {
    const task = createMockTask();
    const currentBlock: ContentBlock = {
      id: 'blk-expand',
      layer: 'GENERATED_ARGUMENT',
      text: 'Se impugna la sentencia por violación al artículo 14 constitucional.',
    };
    const evaluation: BlockQualityEvaluation = {
      blockId: currentBlock.id,
      taskId: task.id,
      factualCoverage: 0.5,
      legalSupport: 0.6,
      evidenceLinkage: 0.5,
      issueResponsiveness: 0.6,
      argumentDepth: 0.5,
      specificity: 0.4,
      completeness: 0.4,
      repetitionPenalty: 0,
      unsupportedAssertionPenalty: 0,
      overallScore: 0.52,
      verdict: 'WEAK',
      revisionMode: 'EXPAND',
      deficiencies: ['Falta profundizar en la subsunción jurídica'],
      coveredCoverageItemIds: [],
      missingCoverageItemIds: ['cov-issue-1'],
      hardFailReasons: [],
    };

    const prompt = buildTargetedRevisionPrompt(task, currentBlock, evaluation);
    expect(prompt.systemInstruction).toContain('MODO DE REVISIÓN ASIGNADO: EXPAND');
    expect(prompt.systemInstruction).toContain('EXPANDE Y PROFUNDIZA');
  });

  // 21. PATCH prompt
  it('21. Generación de prompt de revisión dirigida en modo PATCH por omisión de prueba específica', () => {
    const task = createMockTask();
    const currentBlock: ContentBlock = {
      id: 'blk-patch',
      layer: 'GENERATED_ARGUMENT',
      text: 'El agravio ataca adecuadamente el Considerando Tercero pero omitió la prueba.',
    };
    const evaluation: BlockQualityEvaluation = {
      blockId: currentBlock.id,
      taskId: task.id,
      factualCoverage: 0.7,
      legalSupport: 0.8,
      evidenceLinkage: 0.2,
      issueResponsiveness: 0.8,
      argumentDepth: 0.7,
      specificity: 0.6,
      completeness: 0.6,
      repetitionPenalty: 0,
      unsupportedAssertionPenalty: 0,
      overallScore: 0.58,
      verdict: 'WEAK',
      revisionMode: 'PATCH',
      deficiencies: ['No identifica la prueba: Dictamen Pericial en Materia Contable'],
      coveredCoverageItemIds: [],
      missingCoverageItemIds: ['cov-issue-1'],
      hardFailReasons: [],
    };

    const prompt = buildTargetedRevisionPrompt(task, currentBlock, evaluation);
    expect(prompt.systemInstruction).toContain('MODO DE REVISIÓN ASIGNADO: PATCH');
    expect(prompt.systemInstruction).toContain('CORRIGE E INSERTA PUNTUALMENTE');
  });

  // 22. Límite de revisiones
  it('22. Límite de revisiones: no excede MAX_SEMANTIC_REVISIONS_PER_TASK = 2', async () => {
    const doc = createMockDoc();
    const task = createMockTask();
    expect(SEMANTIC_THRESHOLDS.MAX_SEMANTIC_REVISIONS_PER_TASK).toBe(2);

    let calls = 0;
    const persistentWeakGenerator = async (params: any) => {
      calls++;
      return `Borrador intento ${params?.pass || calls} muy genérico en primer lugar resulta evidente a todas luces.`;
    };

    await executeGenerationTask(task, doc, undefined, persistentWeakGenerator as any);
    expect(calls).toBeLessThanOrEqual(3); // 1 generación inicial + máximo 2 revisiones = 3 llamadas máximo
    expect(task.revisionPasses).toBeLessThanOrEqual(2);
    expect(task.evaluation?.verdict).toBe('WEAK');
  });

  // 23. DocumentSemanticEvaluation global
  it('23. DocumentSemanticEvaluation agrega evaluaciones de bloques y reporta estado global del documento', () => {
    const doc = createMockDoc();
    const matrix: CoverageMatrix = {
      items: [
        { id: 'cov-1', category: 'LEGAL_ISSUE', description: 'Issue 1', required: true, status: 'covered', targetSectionIds: ['sec-agravios'] },
        { id: 'cov-2', category: 'LEGAL_ISSUE', description: 'Issue 2', required: true, status: 'pending', targetSectionIds: ['sec-agravios'] },
      ],
      summary: { total: 2, required: 2, pending: 1, generated: 0, covered: 1, weak: 0, unsupported: 0, notApplicable: 0 },
    };

    const evals: BlockQualityEvaluation[] = [
      {
        blockId: 'blk-1',
        taskId: 't-1',
        factualCoverage: 0.9,
        legalSupport: 0.9,
        evidenceLinkage: 0.9,
        issueResponsiveness: 0.9,
        argumentDepth: 0.9,
        specificity: 0.8,
        completeness: 0.9,
        repetitionPenalty: 0,
        unsupportedAssertionPenalty: 0,
        overallScore: 0.88,
        verdict: 'PASS',
        revisionMode: 'NONE',
        deficiencies: [],
        coveredCoverageItemIds: ['cov-1'],
        missingCoverageItemIds: [],
        hardFailReasons: [],
      },
      {
        blockId: 'blk-2',
        taskId: 't-2',
        factualCoverage: 0.4,
        legalSupport: 0.4,
        evidenceLinkage: 0.2,
        issueResponsiveness: 0.4,
        argumentDepth: 0.3,
        specificity: 0.3,
        completeness: 0.3,
        repetitionPenalty: 0.2,
        unsupportedAssertionPenalty: 0,
        overallScore: 0.35,
        verdict: 'WEAK',
        revisionMode: 'REWRITE',
        deficiencies: ['Desarrollo insuficiente del agravio'],
        coveredCoverageItemIds: [],
        missingCoverageItemIds: ['cov-2'],
        hardFailReasons: [],
      },
    ];

    const docEval = evaluateDocumentSemantics(doc, matrix, evals);
    expect(docEval.totalBlocksEvaluated).toBe(2);
    expect(docEval.passedBlocks).toBe(1);
    expect(docEval.weakBlocks).toBe(1);
    expect(docEval.isComplete).toBe(false);
    expect(docEval.overallVerdict).toBe('WEAK');
    expect(docEval.uncoveredRequiredItems).toContain('cov-2');
  });

  // 24. Calibración con 5 Fixtures Contrastantes (A, B, C, D, E)
  describe('24. Calibración con 5 Fixtures Contrastantes', () => {
    it('Fixture A: Específico y fundado recibe PASS', () => {
      const doc = createMockDoc();
      const task = createMockTask();
      const block: ContentBlock = {
        id: 'blk-fixture-a',
        layer: 'GENERATED_ARGUMENT',
        text: `CONCEPTO DE VIOLACIÓN PRIMERO. VULNERACIÓN AL ARTÍCULO 14 CONSTITUCIONAL POR INDEBIDA VALORACIÓN PROBATORIA.
Causa agravio a la quejosa Inmobiliaria del Centro S.A. de C.V. el Considerando Tercero de la sentencia dictada en el toca 123/2024 por la Segunda Sala Civil del Tribunal Superior.
En dicho considerando, la Sala omitió valorar exhaustivamente el Dictamen Pericial en Materia Contable rendido en autos el 15 de marzo de 2024, el cual demostró fehacientemente la existencia de un saldo insoluto de $500,000.00 pesos M.N. a cargo de la demandada. Dicha omisión transgrede las formalidades esenciales del procedimiento y la garantía de legalidad.`,
      };

      const evalRes = evaluateBlockQuality(block, task, doc);
      expect(evalRes.overallScore).toBeGreaterThanOrEqual(SEMANTIC_THRESHOLDS.PASS_OVERALL);
      expect(evalRes.specificity).toBeGreaterThanOrEqual(SEMANTIC_THRESHOLDS.PASS_SPECIFICITY);
      expect(evalRes.issueResponsiveness).toBeGreaterThanOrEqual(SEMANTIC_THRESHOLDS.PASS_ISSUE_RESPONSIVENESS);
      expect(evalRes.verdict).toBe('PASS');
    });

    it('Fixture B: Largo, abstracto y retórico con clichés recibe WEAK', () => {
      const doc = createMockDoc();
      const task = createMockTask();
      const block: ContentBlock = {
        id: 'blk-fixture-b',
        layer: 'GENERATED_ARGUMENT',
        text: `En primer lugar, resulta evidente a todas luces que la resolución impugnada carece de fundamentación y motivación. En consecuencia, de las constancias de autos se desprende sin lugar a dudas que se violaron las garantías individuales consagradas en la carta magna. De manera palmaria, es por demás sabido que para todos los efectos legales a que haya lugar, la justicia y equidad deben prevalecer sobre cualquier formalismo. Por tanto, en segundo lugar, se solicita el amparo y protección de la justicia federal para restaurar el orden constitucional violentado de forma manifiesta.`,
      };

      const evalRes = evaluateBlockQuality(block, task, doc);
      expect(evalRes.specificity).toBeLessThan(SEMANTIC_THRESHOLDS.PASS_SPECIFICITY);
      expect(evalRes.verdict).toBe('WEAK');
      expect(evalRes.revisionMode).toBe('REWRITE');
    });

    it('Fixture C: Off-topic / controversia equivocada reprueba por issue responsiveness', () => {
      const doc = createMockDoc();
      const task = createMockTask();
      const block: ContentBlock = {
        id: 'blk-fixture-c',
        layer: 'GENERATED_ARGUMENT',
        text: `El principio pro persona y el control de convencionalidad exigen juzgar con perspectiva de género en todos los asuntos de materia laboral y electoral. El artículo 1 constitucional tutela la dignidad humana de las comunidades indígenas conforme a tratados internacionales suscritos por el Estado Mexicano en el marco de la OEA.`,
      };

      const evalRes = evaluateBlockQuality(block, task, doc);
      expect(evalRes.issueResponsiveness).toBeLessThan(SEMANTIC_THRESHOLDS.PASS_ISSUE_RESPONSIVENESS);
      expect(evalRes.verdict).not.toBe('PASS');
    });

    it('Fixture D: Conciso y suficiente recibe PASS sin castigo de longitud', () => {
      const doc = createMockDoc();
      const task = createMockTask();
      const block: ContentBlock = {
        id: 'blk-fixture-d',
        layer: 'GENERATED_ARGUMENT',
        text: `La Segunda Sala Civil vulneró el artículo 14 constitucional en el expediente 123/2024. En el Considerando Tercero omitió valorar el Dictamen Pericial en Materia Contable del 15 de marzo de 2024, dictamen que acredita el saldo insoluto de $500,000.00 pesos en favor de Inmobiliaria del Centro S.A. de C.V.`,
      };

      const evalRes = evaluateBlockQuality(block, task, doc);
      expect(evalRes.specificity).toBeGreaterThanOrEqual(SEMANTIC_THRESHOLDS.PASS_SPECIFICITY);
      expect(evalRes.issueResponsiveness).toBeGreaterThanOrEqual(SEMANTIC_THRESHOLDS.PASS_ISSUE_RESPONSIVENESS);
      expect(evalRes.verdict).toBe('PASS');
    });

    it('Fixture E: Entity-stuffing sin razonamiento recibe penalización en especificidad y veredicto WEAK', () => {
      const doc = createMockDoc();
      const task = createMockTask();
      const block: ContentBlock = {
        id: 'blk-fixture-e',
        layer: 'GENERATED_ARGUMENT',
        text: `Inmobiliaria del Centro S.A. de C.V., expediente 123/2024, Segunda Sala Civil del Tribunal Superior, $500,000.00 pesos M.N., 15 de marzo de 2024, artículos 14 y 16, Dictamen Pericial en Materia Contable.`,
      };

      const evalRes = evaluateBlockQuality(block, task, doc);
      expect(evalRes.specificity).toBeLessThan(SEMANTIC_THRESHOLDS.PASS_SPECIFICITY);
      expect(evalRes.verdict).toBe('WEAK');
    });
  });

  // 25. Conditional Claim Depth
  it('25. Profundidad de contestación a prestaciones es condicional: no penaliza excepción ausente si no fue requerida en ClaimPlan', () => {
    const taskWithException = createMockTask({
      taskType: 'CLAIM',
      title: 'Prestación A',
      claimPlan: {
        claimId: 'claim-a',
        title: 'Prestación A',
        claimText: 'El actor demanda el pago de pesos por concepto de honorarios.',
        relatedExceptionIds: ['exc-prescripcion'],
      },
    });
    const textWithoutException = 'Se niega la procedencia de la prestación reclamada en virtud de que el actor carece de acción y derecho al no acreditarse el vínculo causal.';
    const resA = evaluateClaimDepth(textWithoutException, taskWithException);
    expect(resA.deficiencies.some((d) => d.includes('No menciona la excepción o defensa vinculada'))).toBe(true);

    const taskWithoutException = createMockTask({
      taskType: 'CLAIM',
      title: 'Prestación B',
      claimPlan: {
        claimId: 'claim-b',
        title: 'Prestación B',
        claimText: 'El actor demanda el cumplimiento del contrato.',
        relatedExceptionIds: [],
      },
    });
    const resB = evaluateClaimDepth(textWithoutException, taskWithoutException);
    expect(resB.deficiencies.some((d) => d.includes('No menciona la excepción o defensa vinculada'))).toBe(false);
    expect(resB.score).toBeGreaterThanOrEqual(0.7);
  });

  // 26. Fact Response Depth para hechos no controvertidos
  it('26. Contestación de hechos telegráfica pero válida: "Es cierto" en hechos no controvertidos recibe score 1.0', () => {
    const uncontestedTask = createMockTask({
      taskType: 'FACT_RESPONSE',
      title: 'Hecho 1 (Personalidad)',
      factResponsePlan: {
        factId: 'fact-1',
        factText: 'La empresa actora está legalmente constituida.',
        contestedStatus: 'uncontested',
        position: 'ADMIT',
      },
    });
    const admitRes = evaluateFactResponseDepth('Es cierto el hecho correlativo.', uncontestedTask);
    expect(admitRes.score).toBe(1.0);
    expect(admitRes.deficiencies).toHaveLength(0);

    const contestedTask = createMockTask({
      taskType: 'FACT_RESPONSE',
      title: 'Hecho 3 (Despido)',
      factResponsePlan: {
        factId: 'fact-3',
        factText: 'El trabajador fue despedido injustificadamente el 1 de marzo.',
        contestedStatus: 'contested',
        position: 'DENY',
      },
    });
    const denyRes = evaluateFactResponseDepth('Es falso.', contestedTask);
    expect(denyRes.score).toBeLessThanOrEqual(0.2);
    expect(denyRes.deficiencies.some((d) => d.includes('Respuesta telegráfica'))).toBe(true);
  });

  // 27. Jurisprudencia fabricada concreta vs. Jurisprudencia general SCJN
  it('27. Jurisprudencia fabricada concreta detona Hard Fail; mención genérica de SCJN solo aplica penalización suave', () => {
    const task = createMockTask({ scopedAuthorities: [] });
    const caseAnalysis: CaseAnalysis = { authorities: [] } as any;

    const fakeSpecific = 'Conforme a la jurisprudencia obligatoria con Registro digital: 2029999 de rubro: PAGARÉ. NULIDAD POR USURA.';
    const resSpecific = detectUnsupportedAssertions(fakeSpecific, task, caseAnalysis);
    expect(resSpecific.penalty).toBe(1.0);
    expect(resSpecific.hardFailReasons.some((r) => r.includes('FABRICATED_AUTHORITY'))).toBe(true);

    const genericScjn = 'De conformidad con los criterios y jurisprudencia de la Suprema Corte de Justicia de la Nación aplicables en materia de debida fundamentación.';
    const resGeneric = detectUnsupportedAssertions(genericScjn, task, caseAnalysis);
    expect(resGeneric.penalty).toBeLessThanOrEqual(0.05);
    expect(resGeneric.hardFailReasons).toHaveLength(0);
  });

  // 28. Dimensiones no compensables
  it('28. Dimensiones no compensables: un score alto en otros rubros no compensa reprobar issue responsiveness o especificidad', () => {
    const doc = createMockDoc();
    const task = createMockTask();

    const blockOffIssue: ContentBlock = {
      id: 'blk-off-issue',
      layer: 'GENERATED_ARGUMENT',
      text: `En el expediente 123/2024, Inmobiliaria del Centro S.A. de C.V. exhibió el Dictamen Pericial en Materia Contable del 15 de marzo de 2024 por $500,000.00 pesos. Sin embargo, este argumento versa exclusivamente sobre la inconstitucionalidad de la tarifa de derechos de alumbrado público municipal conforme a los artículos 14 y 16 constitucionales.`,
    };

    const evalRes = evaluateBlockQuality(blockOffIssue, task, doc);
    expect(evalRes.issueResponsiveness).toBeLessThan(SEMANTIC_THRESHOLDS.PASS_ISSUE_RESPONSIVENESS);
    expect(evalRes.verdict).not.toBe('PASS');
  });

  // 29. Trazabilidad de revisión de bloques y sanitización de salida de evaluador IA
  it('29. Trazabilidad de revisión de bloques y sanitización de salida de evaluador IA', async () => {
    const doc = createMockDoc();
    const task = createMockTask();

    // A. Trazabilidad de revisión en executeGenerationTask
    let passCount = 0;
    const multiPassGenerator = async ({ pass }: any) => {
      passCount++;
      if (pass === 1) {
        return 'En primer lugar resulta evidente a todas luces que se vulneró el derecho.';
      }
      return `CONCEPTO DE VIOLACIÓN. La Segunda Sala Civil violó el artículo 14 en el expediente 123/2024 al omitir el Dictamen Pericial en Materia Contable del 15 de marzo de 2024 que demuestra el adeudo de $500,000.00 pesos en perjuicio de Inmobiliaria del Centro S.A. de C.V.`;
    };

    const { block: finalBlock } = await executeGenerationTask(task, doc, undefined, multiPassGenerator);
    expect(passCount).toBe(2);
    expect(task.passes).toBe(2);
    expect(finalBlock.revisionNumber).toBe(1);
    expect(finalBlock.revisionOfBlockId).toBeDefined();
    expect(finalBlock.taskId).toBe(task.id);
    expect(finalBlock.coverageItemIds).toEqual(task.coverageItemIds);

    // B. Validación en runtime de evaluación IA rechazando IDs inventados
    const rawAiPayload = {
      factualCoverage: 0.9,
      legalSupport: 0.85,
      evidenceLinkage: 0.8,
      issueResponsiveness: 0.9,
      argumentDepth: 0.85,
      specificity: 0.8,
      completeness: 0.85,
      overallScore: 0.86,
      verdict: 'PASS',
      revisionMode: 'NONE',
      deficiencies: [
        'Falta precisar el hecho [fact-1]',
        'Error crítico en el requerimiento fantasma [cov-inventado-999]',
      ],
      coveredCoverageItemIds: ['cov-issue-1', 'cov-fantasma-888'],
      missingCoverageItemIds: ['cov-alucinada-777'],
    };

    const aiValidation = validateAiSemanticEvaluationOutput(rawAiPayload, task);
    expect(aiValidation.isValid).toBe(true);
    expect(aiValidation.evaluation?.coveredCoverageItemIds).toEqual(['cov-issue-1']);
    expect(aiValidation.evaluation?.missingCoverageItemIds).toEqual([]);
    expect(aiValidation.evaluation?.deficiencies.some((d) => d.includes('cov-inventado-999'))).toBe(false);
    expect(aiValidation.evaluation?.deficiencies.some((d) => d.includes('fact-1'))).toBe(true);
  });
});
