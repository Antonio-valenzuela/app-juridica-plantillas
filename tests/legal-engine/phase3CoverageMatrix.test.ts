/**
 * phase3CoverageMatrix.test.ts — FASE 3: Matriz de Cobertura Documental y Document Plan Profundo
 *
 * Verifica los 12 requisitos obligatorios de la Fase 3 (3S):
 * 1. no-hardcoded-axis: Caso con hechos reales NO genera "congruencia y exhaustividad" fijo
 * 2. claim-coverage: Cada pretensión genera item required en CoverageMatrix y ClaimPlan en el plan
 * 3. fact-coverage: Cada hecho genera item en CoverageMatrix y FactResponsePlan en contestación
 * 4. evidence-links: Pruebas reales vinculadas con hechos específicos en CoverageMatrix
 * 5. no-invented-evidence: Si fuentes no mencionan pruebas, evidence es [] (0 inventadas)
 * 6. multiple-issues: N consideraciones combatidas generan N issues y N agravios en el plan (no 1)
 * 7. issue-deduplication: Variantes semánticas del mismo problema colapsan en 1 issue canónico
 * 8. deep-document-plan: DraftingPlan tiene issuePlans estructurados (nunca legalIssues: [sec.title])
 * 9. contestacion-plan: Contestación genera planes por pretensión, por hecho y excepciones
 * 10. amparo-revision-plan: Revisión genera procedencia + agravios específicos sin jurisprudencia inventada
 * 11. no-orphan-references: validateCoverageAndPlanInvariants detecta y previene referencias huérfanas
 * 12. empty-case: Caso con fuentes mínimas genera CoverageMatrix válida sin truene ni items falsos
 */

import { describe, it, expect } from 'vitest';
import { reconstructCaseAnalysis, LegalIssue } from '@/lib/legal-engine/caseAnalysis';
import {
  buildCoverageMatrix,
  deduplicateLegalIssues,
  normalizeIssueSemanticKey,
  validateCoverageAndPlanInvariants,
  getCaseAnalysisSummary,
  getCoverageSummary,
  getDocumentPlanSummary,
} from '@/lib/legal-engine/coverageMatrix';
import { buildDraftingPlan } from '@/lib/legal-engine/pipeline';
import {
  createEmptyDocument,
  createDocumentNode,
  UniversalLegalDocument,
  UploadedSourceDocument,
} from '@/lib/legal-engine/types';

function mockDoc(overrides: Partial<UniversalLegalDocument> = {}): UniversalLegalDocument {
  return createEmptyDocument({
    id: 'doc-test-phase3',
    title: 'Documento de Prueba Fase 3',
    documentType: 'demanda_ordinaria_civil',
    documentTypeLabel: 'Demanda Ordinaria Civil',
    matter: 'Civil',
    sections: [
      createDocumentNode({ id: 'sec-proemio', type: 'header', title: 'PROEMIO', order: 10, content: [] }),
      createDocumentNode({ id: 'sec-hechos', type: 'background', title: 'HECHOS', order: 20, content: [] }),
      createDocumentNode({ id: 'sec-prestaciones', type: 'argument', title: 'PRESTACIONES', order: 30, content: [] }),
      createDocumentNode({ id: 'sec-agravios', type: 'argument', title: 'AGRAVIOS', order: 40, content: [] }),
      createDocumentNode({ id: 'sec-pruebas', type: 'evidence', title: 'PRUEBAS', order: 50, content: [] }),
      createDocumentNode({ id: 'sec-petitorios', type: 'petition', title: 'PETITORIOS', order: 60, content: [] }),
    ],
    ...overrides,
  } as any);
}

function mockContestacionDoc(): UniversalLegalDocument {
  return createEmptyDocument({
    id: 'doc-contestacion-phase3',
    title: 'Contestación de Demanda',
    documentType: 'contestacion_demanda_oral_civil',
    documentTypeLabel: 'Contestación de Demanda Oral Civil',
    matter: 'Civil',
    sections: [
      createDocumentNode({ id: 'sec-con-proemio', type: 'header', title: 'PROEMIO', order: 10, content: [] }),
      createDocumentNode({ id: 'sec-con-hechos', type: 'background', title: 'CONTESTACIÓN DE HECHOS', order: 20, content: [] }),
      createDocumentNode({ id: 'sec-con-prestaciones', type: 'argument', title: 'CONTESTACIÓN DE PRESTACIONES', order: 30, content: [] }),
      createDocumentNode({ id: 'sec-con-excepciones', type: 'argument', title: 'EXCEPCIONES Y DEFENSAS', order: 40, content: [] }),
      createDocumentNode({ id: 'sec-con-pruebas', type: 'evidence', title: 'PRUEBAS', order: 50, content: [] }),
      createDocumentNode({ id: 'sec-con-petitorios', type: 'petition', title: 'PETITORIOS', order: 60, content: [] }),
    ],
  } as any);
}

function mockAmparoRevisionDoc(): UniversalLegalDocument {
  return createEmptyDocument({
    id: 'doc-amparo-rev-phase3',
    title: 'Recurso de Revisión en Amparo Directo',
    documentType: 'recurso_revision_amparo_directo',
    documentTypeLabel: 'Recurso de Revisión en Amparo Directo',
    matter: 'Constitucional',
    sections: [
      createDocumentNode({ id: 'sec-rev-header', type: 'header', title: 'RUBRO Y AUTORIDAD', order: 10, content: [] }),
      createDocumentNode({ id: 'sec-rev-procedencia', type: 'legal_grounds', title: 'PROCEDENCIA DEL RECURSO', order: 20, content: [] }),
      createDocumentNode({ id: 'sec-rev-agravios', type: 'argument', title: 'AGRAVIOS', order: 30, content: [] }),
      createDocumentNode({ id: 'sec-rev-pruebas', type: 'evidence', title: 'PRUEBAS', order: 40, content: [] }),
      createDocumentNode({ id: 'sec-rev-petitorios', type: 'petition', title: 'PETITORIOS', order: 50, content: [] }),
    ],
  } as any);
}

describe('FASE 3 — Matriz de Cobertura Documental y Document Plan Profundo', () => {

  // Test 1: No hardcoded axis
  it('1. no-hardcoded-axis: Un caso con hechos específicos NO genera el eje genérico de congruencia/exhaustividad', () => {
    const sources: UploadedSourceDocument[] = [
      {
        id: 'src-arrendamiento',
        filename: 'demanda_arrendamiento.txt',
        content: `JUICIO ORDINARIO CIVIL DE ARRENDAMIENTO
        ACTOR: Inmobiliaria Metropolitana S.A. de C.V.
        DEMANDADO: Rodrigo Gómez Sánchez
        EXPEDIENTE: 450/2023
        HECHOS:
        1. Las partes celebraron contrato de arrendamiento sobre el local comercial número 4.
        2. El arrendatario omitió el pago de las rentas correspondientes a los meses de enero y febrero de 2024.`,
      },
    ];

    const analysis = reconstructCaseAnalysis(sources, 'preparar contestación de demanda', '', { includeReferenceInAnalysis: false });

    // El eje argumentativo NO debe contener texto hardcodeado sobre congruencia y exhaustividad
    for (const axis of analysis.argumentAxes) {
      expect(axis.title).not.toContain('TRANSGRESIÓN AL PRINCIPIO DE CONGRUENCIA, EXHAUSTIVIDAD');
      expect(axis.issue).not.toContain('Indebida fundamentación y falta de análisis integral de los planteamientos');
    }
  });

  // Test 2: Claim coverage
  it('2. claim-coverage: Cada pretensión genera un item en CoverageMatrix y un ClaimPlan en la sección', () => {
    const sources: UploadedSourceDocument[] = [
      {
        id: 'src-demanda-prestaciones',
        filename: 'demanda.txt',
        content: `DEMANDA ORDINARIA MERCANTIL
        PRESTACIONES:
        A) El pago de la cantidad de $250,000.00 M.N. por concepto de saldo insoluto.
        B) El pago de intereses ordinarios a razón del 2% mensual.
        C) El pago de gastos y costas judiciales.`,
      },
    ];

    const analysis = reconstructCaseAnalysis(sources, 'contestar la demanda', '', { includeReferenceInAnalysis: false });
    expect(analysis.claims.length).toBe(3);

    const doc = mockContestacionDoc();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);

    // CoverageMatrix debe contener items para cada pretensión con required = true
    const claimItems = matrix.items.filter((i) => i.category === 'CLAIM');
    expect(claimItems.length).toBe(3);
    claimItems.forEach((ci) => {
      expect(ci.required).toBe(true);
      expect(ci.status).toBe('pending');
      expect(ci.targetSectionIds.length).toBeGreaterThan(0);
    });

    // DraftingPlan debe tener claimPlans en la sección de prestaciones
    const plan = buildDraftingPlan(doc, 5000, analysis);
    const prestacionesSec = plan.sections.find((s) => /prestaci/i.test(s.title));
    expect(prestacionesSec).toBeDefined();
    expect(prestacionesSec?.claimPlans?.length).toBe(3);
    expect(prestacionesSec?.claimPlans?.[0].claimText).toContain('250,000.00');
  });

  // Test 3: Fact coverage
  it('3. fact-coverage: Cada hecho numerado genera un item en CoverageMatrix y FactResponsePlan en contestación', () => {
    const sources: UploadedSourceDocument[] = [
      {
        id: 'src-hechos-laboral',
        filename: 'demanda_hechos.txt',
        content: `DEMANDA LABORAL
        HECHOS:
        1. El trabajador ingresó a laborar el 1 de junio de 2021 como chofer repartidor.
        2. Se le asignó una jornada de trabajo de lunes a sábado de 8:00 a 17:00 horas.
        3. El día 15 de enero de 2024 fue despedido injustificadamente en la puerta del centro de trabajo.`,
      },
    ];

    const analysis = reconstructCaseAnalysis(sources, 'contestar demanda laboral', '', { includeReferenceInAnalysis: false });
    expect(analysis.facts.length).toBe(3);

    const doc = mockContestacionDoc();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);

    const factItems = matrix.items.filter((i) => i.category === 'FACT');
    expect(factItems.length).toBe(3);
    factItems.forEach((fi) => {
      expect(fi.required).toBe(true);
      expect(fi.status).toBe('pending');
    });

    const plan = buildDraftingPlan(doc, 5000, analysis);
    const hechosSec = plan.sections.find((s) => /hecho/i.test(s.title));
    expect(hechosSec).toBeDefined();
    expect(hechosSec?.factResponsePlans?.length).toBe(3);
    expect(hechosSec?.factResponsePlans?.[0].factNumber).toBe('1');
    expect(hechosSec?.factResponsePlans?.[2].factText).toContain('despedido');
  });

  // Test 4: Evidence links
  it('4. evidence-links: Las pruebas del análisis se extraen y se vinculan con los hechos en CoverageMatrix', () => {
    const sources: UploadedSourceDocument[] = [
      {
        id: 'src-pruebas-vinculadas',
        filename: 'escrito_con_pruebas.txt',
        content: `HECHOS:
        1. El 10 de octubre de 2022 las partes firmaron un pagaré ante dos testigos por la cantidad pactada.
        PRUEBAS:
        1. DOCUMENTAL PRIVADA. Consistente en el título de crédito denominado pagaré suscrito el 10 de octubre de 2022, en relación con el hecho 1.
        2. TESTIMONIAL. A cargo de los señores Pedro López y María Ruiz, para acreditar la entrega del dinero vinculada al hecho 1.`,
      },
    ];

    const analysis = reconstructCaseAnalysis(sources, 'analizar juicio ejecutivo mercantil', '', { includeReferenceInAnalysis: false });
    expect(analysis.evidence.length).toBe(2);

    const doc = mockDoc();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);

    const evItems = matrix.items.filter((i) => i.category === 'EVIDENCE');
    expect(evItems.length).toBe(2);

    // La prueba documental debe estar vinculada al hecho 1
    const docPrueba = evItems.find((e) => /DOCUMENTAL/i.test(e.description));
    expect(docPrueba).toBeDefined();
    expect(docPrueba?.relatedFactIds).toBeDefined();
    expect(docPrueba?.relatedFactIds?.length).toBeGreaterThan(0);
  });

  // Test 5: No invented evidence
  it('5. no-invented-evidence: Si las fuentes no mencionan pruebas, evidence es [] y 0 items en CoverageMatrix', () => {
    const sources: UploadedSourceDocument[] = [
      {
        id: 'src-sin-pruebas',
        filename: 'notificacion.txt',
        content: `TRIBUNAL SUPERIOR DE JUSTICIA
        EXPEDIENTE: 102/2024
        Se tiene por notificada a la parte demandada para los efectos legales conducentes.`,
      },
    ];

    const analysis = reconstructCaseAnalysis(sources, 'tramitar amparo', '', { includeReferenceInAnalysis: false });

    // Invariante estricto: evidence DEBE ser array vacío
    expect(analysis.evidence).toEqual([]);

    const doc = mockDoc();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const evItems = matrix.items.filter((i) => i.category === 'EVIDENCE');

    // 0 pruebas inventadas
    expect(evItems.length).toBe(0);
  });

  // Test 6: Multiple issues
  it('6. multiple-issues: Un caso con 3 consideraciones combatidas genera 3 issues y 3 ejes argumentativos, no 1', () => {
    const sources: UploadedSourceDocument[] = [
      {
        id: 'src-sentencia-3-considerandos',
        filename: 'sentencia_recurrida.txt',
        content: `SENTENCIA DEFINITIVA
        EXPEDIENTE: 890/2023
        CONSIDERANDO PRIMERO: Este Juzgado es legalmente competente para conocer del presente juicio.
        CONSIDERANDO SEGUNDO: La excepción de prescripción opuesta por la demandada resulta infundada por no haber transcurrido el término de dos años previsto por la ley.
        CONSIDERANDO TERCERO: Se desestima la prueba pericial en grafoscopía ofrecida por el quejoso por considerar que no se desahogó conforme a derecho.
        CONSIDERANDO CUARTO: Se condena al demandado al pago total de las prestaciones reclamadas por carecer de defensas acreditadas.
        RESUELVE:
        PRIMERO. Ha procedido la vía ordinaria.
        SEGUNDO. Se condena a la parte demandada.`,
      },
    ];

    const analysis = reconstructCaseAnalysis(sources, 'interponer recurso de apelacion o revision', '', { includeReferenceInAnalysis: false });

    // Debe extraer las consideraciones
    expect(analysis.challengedReasonings).toBeDefined();
    expect(analysis.challengedReasonings!.length).toBe(4);

    // Debe generar múltiples ejes argumentativos dinámicos basados en consideraciones (no 1 fijo)
    expect(analysis.argumentAxes.length).toBe(4);
    expect(analysis.argumentAxes[0].id).toBe('axis-1');
    expect(analysis.argumentAxes[1].id).toBe('axis-2');
    expect(analysis.argumentAxes[2].id).toBe('axis-3');
    expect(analysis.argumentAxes[3].id).toBe('axis-4');

    // Ninguno es el template fijo de congruencia
    expect(analysis.argumentAxes[0].title).not.toContain('TRANSGRESIÓN AL PRINCIPIO DE CONGRUENCIA, EXHAUSTIVIDAD');
  });

  // Test 7: Issue deduplication
  it('7. issue-deduplication: Variantes semánticas del mismo problema colapsan en 1 issue canónico con referencias consolidadas', () => {
    const rawIssues: LegalIssue[] = [
      {
        id: 'issue-raw-1',
        type: 'CONSTITUTIONAL',
        title: 'Falta de exhaustividad e incongruencia en la resolución recurrida',
        parameter: 'Artículo 17 Constitucional',
        challengedAct: 'Resolución de apelación dictada por la Sala',
        contradiction: 'La Sala omitió pronunciarse sobre el cuarto agravio.',
        affectation: 'Indefensión',
        consequence: 'Revocación',
        relatedFactIds: ['fact-1'],
      },
      {
        id: 'issue-raw-2',
        type: 'CONSTITUTIONAL',
        title: 'Violación al principio de congruencia y exhaustividad de las sentencias',
        parameter: 'Artículo 17 Constitucional; Artículo 74 Ley de Amparo',
        challengedAct: 'Resolución de apelación dictada por la Sala',
        contradiction: 'Incongruencia omisiva respecto a los planteamientos deducidos.',
        affectation: 'Violación a tutela judicial efectiva',
        consequence: 'Reposición',
        relatedFactIds: ['fact-2'],
      },
      {
        id: 'issue-raw-3',
        type: 'CONSTITUTIONAL',
        title: 'La sentencia no fue exhaustiva al desatender las pruebas',
        parameter: 'Artículo 14 Constitucional',
        challengedAct: 'Resolución de apelación dictada por la Sala',
        contradiction: 'Omisión de análisis integral.',
        affectation: 'Falta de motivación',
        consequence: 'Amparo y protección',
        relatedFactIds: ['fact-3'],
      },
    ];

    expect(normalizeIssueSemanticKey(rawIssues[0].title)).toBe('exhaustividad_congruencia');
    expect(normalizeIssueSemanticKey(rawIssues[1].title)).toBe('exhaustividad_congruencia');
    expect(normalizeIssueSemanticKey(rawIssues[2].title)).toBe('exhaustividad_congruencia');

    const deduplicated = deduplicateLegalIssues(rawIssues);

    // Colapsa a 1 solo issue consolidado
    expect(deduplicated.length).toBe(1);
    expect(deduplicated[0].canonicalKey).toBe('exhaustividad_congruencia');

    // Las referencias de hechos se fusionaron sin pérdida
    expect(deduplicated[0].relatedFactIds).toContain('fact-1');
    expect(deduplicated[0].relatedFactIds).toContain('fact-2');
    expect(deduplicated[0].relatedFactIds).toContain('fact-3');
  });

  // Test 8: Deep document plan
  it('8. deep-document-plan: DraftingPlan tiene issuePlans estructurados y NO usa legalIssues: [sec.title]', () => {
    const sources: UploadedSourceDocument[] = [
      {
        id: 'src-amparo-issues',
        filename: 'ejecutoria.txt',
        content: `CONSIDERANDO TERCERO: Se declara infundado el planteamiento relativo a la prescripción de la acción.
        CONSIDERANDO CUARTO: Se convalida la ilegalidad del emplazamiento practicado en domicilio diverso.`,
      },
    ];

    const analysis = reconstructCaseAnalysis(sources, 'interponer amparo directo', '', { includeReferenceInAnalysis: false });
    const doc = mockDoc();
    const plan = buildDraftingPlan(doc, 6000, analysis);

    const agraviosSec = plan.sections.find((s) => s.title === 'AGRAVIOS');
    expect(agraviosSec).toBeDefined();

    // Invariante 3L: legalIssues NO debe ser [sec.title]
    expect(agraviosSec?.legalIssues).not.toEqual(['AGRAVIOS']);
    expect(agraviosSec?.legalIssues.length).toBeGreaterThan(0);

    // Debe contener issuePlans estructurados
    expect(agraviosSec?.issuePlans).toBeDefined();
    expect(agraviosSec?.issuePlans!.length).toBeGreaterThanOrEqual(2);

    for (const ip of agraviosSec!.issuePlans!) {
      expect(ip.title).toBeDefined();
      expect(ip.counterargumentStrategy).toBeDefined();
      expect(ip.authorityIds).toEqual([]); // CERO INVENTADAS
      expect(ip.expectedDepth).toBeDefined();
    }
  });

  // Test 9: Contestacion plan
  it('9. contestacion-plan: Genera plan completo con prestaciones, hechos, excepciones y pruebas vinculadas', () => {
    const sources: UploadedSourceDocument[] = [
      {
        id: 'src-demanda-completa',
        filename: 'demanda_completa.txt',
        content: `JUICIO ORDINARIO CIVIL
        ACTOR: Constructora Alfa S.A.
        DEMANDADO: Bernardo Garza
        PRESTACIONES:
        A) La rescisión del contrato de obra a precio alzado.
        B) La devolución del anticipo no amortizado por $180,000.00 M.N.
        HECHOS:
        1. Con fecha 5 de mayo de 2023 se firmó el contrato de obra.
        2. El contratista suspendió unilateralmente las obras el 20 de agosto de 2023.
        PRUEBAS:
        1. DOCUMENTAL PRIVADA. Contrato de obra de fecha 5 de mayo de 2023, vinculado al hecho 1.`,
      },
    ];

    const analysis = reconstructCaseAnalysis(sources, 'contestar la demanda de constructora alfa', '', { includeReferenceInAnalysis: false });
    const doc = mockContestacionDoc();
    const plan = buildDraftingPlan(doc, 8000, analysis);

    // 1. Prestaciones planificadas
    const prestSec = plan.sections.find((s) => /prestaci/i.test(s.title));
    expect(prestSec?.claimPlans?.length).toBe(2);

    // 2. Hechos planificados
    const hechosSec = plan.sections.find((s) => /hecho/i.test(s.title));
    expect(hechosSec?.factResponsePlans?.length).toBe(2);

    // 3. Excepciones presentes
    const excepSec = plan.sections.find((s) => /excepcion/i.test(s.title));
    expect(excepSec).toBeDefined();

    // 4. Pruebas sin invención
    expect(analysis.evidence.length).toBe(1);
    expect(analysis.evidence[0].type).toContain('DOCUMENTAL');
  });

  // Test 10: Amparo revision plan
  it('10. amparo-revision-plan: Genera procedencia fundamentada, agravios específicos y sin jurisprudencia inventada', () => {
    const sources: UploadedSourceDocument[] = [
      {
        id: 'src-tcc-sentencia',
        filename: 'sentencia_tcc.txt',
        content: `SEGUNDO TRIBUNAL COLEGIADO EN MATERIA ADMINISTRATIVA DEL PRIMER CIRCUITO
        AMPARO DIRECTO: 320/2023
        QUEJOSO: Consorcio Químico Mexicano S.A. de C.V.
        CONSIDERANDO CUARTO: En cuanto a la inconstitucionalidad del artículo 45 del reglamento, se desestima el concepto al considerarse una cuestión de mera legalidad y no de interpretación directa.
        CONSIDERANDO QUINTO: Resulta inoperante el argumento sobre violación al principio de seguridad jurídica.
        RESUELVE:
        ÚNICO. La Justicia de la Unión NO AMPARA NI PROTEGE a la parte quejosa.`,
      },
    ];

    const analysis = reconstructCaseAnalysis(sources, 'recurso de revision amparo directo', '', { includeReferenceInAnalysis: false });
    const doc = mockAmparoRevisionDoc();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const plan = buildDraftingPlan(doc, 10000, analysis);

    // Procedencia requerida
    const procItem = matrix.items.find((i) => i.category === 'PROCEDURAL_REQUIREMENT');
    expect(procItem).toBeDefined();
    expect(procItem?.required).toBe(true);

    // Cuestiones de agravio específicas
    const agraviosSec = plan.sections.find((s) => /agravio/i.test(s.title));
    expect(agraviosSec).toBeDefined();
    expect(agraviosSec?.issuePlans?.length).toBeGreaterThanOrEqual(1);

    // Cero autoridades / tesis inventadas
    expect(analysis.citations).toEqual([]);
    agraviosSec?.issuePlans?.forEach((ip) => {
      expect(ip.authorityIds).toEqual([]);
    });
  });

  // Test 11: No orphan references
  it('11. no-orphan-references: validateCoverageAndPlanInvariants detecta y previene referencias huérfanas', () => {
    const sources: UploadedSourceDocument[] = [
      {
        id: 'src-val-invariants',
        filename: 'caso_base.txt',
        content: `HECHOS:
        1. El día 1 de enero de 2024 se celebró el acto.
        PRESTACIONES:
        1. El cumplimiento del convenio.`,
      },
    ];

    const analysis = reconstructCaseAnalysis(sources, 'contestar demanda', '', { includeReferenceInAnalysis: false });
    const doc = mockContestacionDoc();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const plan = buildDraftingPlan(doc, 5000, analysis);

    // Matriz y Plan legítimos pasan la validación sin errores
    const validCheck = validateCoverageAndPlanInvariants(matrix, plan, analysis);
    expect(validCheck.ok).toBe(true);
    expect(validCheck.errors).toEqual([]);

    // Corrupción intencional: agregar referencia huérfana de factId
    const corruptedMatrix = JSON.parse(JSON.stringify(matrix));
    corruptedMatrix.items[0].relatedFactIds = ['fact-id-fantasma-inexistente'];

    const corruptCheck = validateCoverageAndPlanInvariants(corruptedMatrix, plan, analysis);
    expect(corruptCheck.ok).toBe(false);
    expect(corruptCheck.errors.some((e: string) => e.includes('fact-id-fantasma-inexistente'))).toBe(true);
  });

  // Test 12: Empty case
  it('12. empty-case: Un caso con fuentes mínimas genera CoverageMatrix válida sin truene ni items falsos', () => {
    const sources: UploadedSourceDocument[] = [
      {
        id: 'src-minimo',
        filename: 'documento_minimo.txt',
        content: 'Acuerdo de trámite por recibido.',
      },
    ];

    expect(() => {
      const analysis = reconstructCaseAnalysis(sources, 'revisar expediente', '', { includeReferenceInAnalysis: false });
      expect(analysis.facts).toEqual([]);
      expect(analysis.claims).toEqual([]);
      expect(analysis.evidence).toEqual([]);
      expect(analysis.argumentAxes).toEqual([]);

      const doc = mockDoc();
      const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
      expect(matrix).toBeDefined();
      expect(matrix.items.length).toBeGreaterThanOrEqual(0);

      const plan = buildDraftingPlan(doc, 2000, analysis);
      expect(plan).toBeDefined();
      expect(plan.sections.length).toBe(doc.sections.length);

      const summaryAnalysis = getCaseAnalysisSummary(analysis);
      const summaryCov = getCoverageSummary(matrix);
      const summaryPlan = getDocumentPlanSummary(plan);

      expect(summaryAnalysis).toContain('[CASE ANALYSIS SUMMARY]');
      expect(summaryCov).toContain('[COVERAGE SUMMARY]');
      expect(summaryPlan).toContain('[DOCUMENT PLAN SUMMARY]');
    }).not.toThrow();
  });
});
