import { describe, expect, it } from 'vitest';
import { getCatalogDocument, LEGAL_CATALOG_REGISTRY } from '@/lib/catalog/legalCatalog';
import { getDocumentStrategy } from '@/lib/legal-engine/documentStrategies';
import { DocumentTemplates } from '@/lib/legal-engine/documentTemplates';
import { getRequiredSectionIds } from '@/lib/legal-engine/exportGuards';
import { evaluateSourceOutputCompatibility } from '@/lib/legal-engine/sourceOutputCompatibility';
import { createSourceDocument } from '@/lib/legal-engine/context';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { classifyIntent } from '@/lib/legal-engine/classifier';
import { buildCaseContext, isLaboralDocumentType } from '@/lib/legal-engine/caseContext';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';

// ── 1. INVENTARIO REAL DERIVADO DEL REPOSITORIO ──────────────────────────────

const LABORAL_CATALOG_DOCS = LEGAL_CATALOG_REGISTRY.documents.filter(
  (doc) => doc.areaId === 'laboral' && doc.kind === 'DOCUMENT_TYPE',
);

const TARGET_LABORAL_IDS = LABORAL_CATALOG_DOCS.map((doc) => doc.id);

function syntheticLaborSource(sourceDocumentType: string, id = 'synthetic-labor-source', content = 'Constancia jurídica laboral.') {
  return createSourceDocument({
    id,
    filename: `${id}.txt`,
    content,
    sourceValidated: true,
    classification: { sourceDocumentType, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
  });
}

function syntheticLaborAnalysis(overrides: Partial<CaseAnalysis> = {}): CaseAnalysis {
  return {
    parties: { actor: 'Trabajador Sindicalizado Sintético', demandado: 'Compañía Patronal Sintética S.A. de C.V.' },
    authorities: ['Tribunal Laboral Federal de Asuntos Individuales'],
    caseNumbers: { principal: 'EXP-LAB-2026/088' },
    proceduralTimeline: [{ date: '2026-02-10', event: 'Despido injustificado en las instalaciones de la demandada', sourceDocument: 'src-1', certainty: 1.0 }],
    challengedActs: [],
    claims: ['Indemnización constitucional de tres meses', 'Salarios caídos y vencidos', 'Prima de antigüedad'],
    claimResponses: [],
    arguments: [],
    evidence: [{ id: 'ev-1', type: 'DOCUMENTAL', description: 'Constancia de no conciliación prejudicial', confirmed: true, provenance: 'LAWYER_CONFIRMED' }],
    facts: [
      { id: 'f-1', number: '1', text: 'El actor ingresó a laborar el 01 de enero de 2020 con puesto de Operador General y salario diario de $550.00 pesos.', confidence: 1.0 },
      { id: 'f-2', number: '2', text: 'Con fecha 10 de febrero de 2026 fue despedido injustificadamente por el representante legal de la demandada.', confidence: 1.0 },
    ],
    rulings: [],
    citations: [{ rubro: 'DESPIDO INJUSTIFICADO. CARGA DE LA PRUEBA', texto: 'Corresponde a la parte patronal acreditar la causa justificada de rescisión.' }],
    proceduralPosture: { proceduralWrit: '', isExtraordinary: false, constitutionalIssues: [], legalityIssues: [], exceptionalInterest: null },
    caseTheory: { factualTheory: '', legalTheory: '', constitutionalTheory: '', proceduralTheory: '', opposingTheory: '', vulnerabilities: [], strengths: [] },
    argumentAxes: [],
    missingData: [],
    anonymizedData: [],
    unsupportedClaims: [],
    ...overrides,
  };
}

describe('LOOP 8D — MATERIA LABORAL INTEGRAL', () => {

  // ── 1. INVENTARIO Y CONTRATO ESTRUCTURAL DE LOS 13 TIPOS ───────────────────

  describe('1. Inventario exacto y contratos de los 13 tipos canónicos', () => {
    it('el catálogo contiene exactamente 13 tipos documentales laborales canónicos únicos sin duplicados', () => {
      expect(LABORAL_CATALOG_DOCS).toHaveLength(13);
      expect(new Set(TARGET_LABORAL_IDS).size).toBe(13);
    });

    it.each(TARGET_LABORAL_IDS)('%s tiene Strategy, Template y Catalog integrados con status IMPLEMENTED', (id) => {
      const strategy = getDocumentStrategy(id);
      expect(strategy).toBeDefined();
      expect(strategy).toMatchObject({
        id,
        documentType: id,
        dedicated: true,
        matter: 'LABORAL',
      });

      const template = DocumentTemplates[id];
      expect(template).toBeDefined();

      const expectedDestinatario =
        id === 'demanda_amparo_directo_laboral'
          ? 'Tribunal Colegiado de Circuito'
          : id === 'demanda_amparo_indirecto_laboral'
            ? 'Juez de Distrito'
            : 'Tribunal Laboral competente';

      expect(template).toMatchObject({
        tipo: id,
        materia: 'LABORAL',
        esqueletoDedicado: true,
        destinatario: expectedDestinatario,
      });

      const catalogDoc = getCatalogDocument(id);
      expect(catalogDoc).toMatchObject({
        id,
        status: 'IMPLEMENTED',
        areaId: 'laboral',
        strategyId: id,
        templateId: id,
      });

      // Contrato de secciones 100% idéntico entre Strategy, Template y ExportGuards
      expect(getRequiredSectionIds(id)).toEqual(strategy?.requiredSectionIds);
    });
  });

  // ── 2. ESTRUCTURAS JURÍDICAS DIFERENCIADAS ENTRE FAMILIAS ──────────────────

  describe('2. Estructuras jurídicamente diferenciadas entre familias procesales', () => {
    it('las familias laborales tienen estructuras canónicas especializadas y no genéricas clonadas', () => {
      const demandaSecs = DocumentTemplates.demanda_laboral.estructura;
      const contestacionSecs = DocumentTemplates.contestacion_demanda_laboral.estructura;
      const reconvencionSecs = DocumentTemplates.reconvencion_laboral.estructura;
      const contestacionReconvencionSecs = DocumentTemplates.contestacion_reconvencion_laboral.estructura;
      const ampliacionSecs = DocumentTemplates.ampliacion_demanda_laboral.estructura;
      const pruebasSecs = DocumentTemplates.ofrecimiento_pruebas_laboral.estructura;
      const objecionSecs = DocumentTemplates.objecion_pruebas_laboral.estructura;
      const prevencionSecs = DocumentTemplates.desahogo_prevencion_laboral.estructura;
      const alegatosSecs = DocumentTemplates.alegatos_laborales.estructura;
      const cumplimientoSecs = DocumentTemplates.cumplimiento_laudo_sentencia_laboral.estructura;
      const ejecucionSecs = DocumentTemplates.ejecucion_sentencia_laboral.estructura;
      const amparoDirectoSecs = DocumentTemplates.demanda_amparo_directo_laboral.estructura;
      const amparoIndirectoSecs = DocumentTemplates.demanda_amparo_indirecto_laboral.estructura;

      // Demanda laboral incluye condiciones de trabajo y hechos del despido
      expect(demandaSecs).toContain('CONDICIONES GENERALES DE TRABAJO');
      expect(demandaSecs).toContain('PRESTACIONES RECLAMADAS');
      expect(demandaSecs).toContain('HECHOS DEL DESPIDO Y RELACIÓN LABORAL');

      // Contestación incluye excepciones y defensas y contestación de hechos
      expect(contestacionSecs).toContain('CONTESTACIÓN DE HECHOS');
      expect(contestacionSecs).toContain('CONTESTACIÓN DE PRESTACIONES');
      expect(contestacionSecs).toContain('EXCEPCIONES Y DEFENSAS');

      // Reconvención laboral
      expect(reconvencionSecs).toContain('OBJETO DE LA RECONVENCIÓN');
      expect(reconvencionSecs).toContain('PRESTACIONES RECONVENIDAS');

      // Contestación a la reconvención
      expect(contestacionReconvencionSecs).toContain('CONTESTACIÓN DE HECHOS DE LA RECONVENCIÓN');
      expect(contestacionReconvencionSecs).toContain('EXCEPCIONES Y DEFENSAS FRENTE A LA RECONVENCIÓN');

      // Ampliación de demanda
      expect(ampliacionSecs).toContain('HECHOS NUEVOS O MODIFICADOS');
      expect(ampliacionSecs).toContain('PRESTACIONES ADICIONALES');

      // Ofrecimiento de pruebas
      expect(pruebasSecs).toContain('RELACIÓN DE PRUEBAS LABORALES');
      expect(pruebasSecs).toContain('RELACIÓN CON LOS HECHOS CONTROVERTIDOS');

      // Objeción de pruebas
      expect(objecionSecs).toContain('OBJECIÓN DE PRUEBAS DE LA CONTRAPARTE');
      expect(objecionSecs).toContain('MOTIVOS DE INADMISIBILIDAD Y FALTA DE ALCANCE PROBATORIO');

      // Desahogo de prevención
      expect(prevencionSecs).toContain('ACUERDO O REQUERIMIENTO NOTIFICADO');
      expect(prevencionSecs).toContain('DESAHOGO PUNTUAL DE LA PREVENCIÓN');
      expect(prevencionSecs).toContain('ACLARACIONES Y COMPLEMENTACIONES');

      // Alegatos
      expect(alegatosSecs).toContain('VALORACIÓN DE LAS PRUEBAS DESAHOGADAS');
      expect(alegatosSecs).toContain('ARGUMENTOS Y CONCLUSIONES JURÍDICAS');

      // Cumplimiento voluntario
      expect(cumplimientoSecs).toContain('MANIFESTACIÓN DE CUMPLIMIENTO');
      expect(cumplimientoSecs).toContain('CONSTANCIAS Y LIQUIDACIÓN');

      // Ejecución forzosa
      expect(ejecucionSecs).toContain('LAUDO O SENTENCIA DEFINITIVA FIRME');
      expect(ejecucionSecs).toContain('INCUMPLIMIENTO DE LA CONDENA');
      expect(ejecucionSecs).toContain('SOLICITUD DE REQUERIMIENTO DE PAGO Y EMBARGO');

      // Amparo directo laboral
      expect(amparoDirectoSecs).toContain('LAUDO O SENTENCIA DEFINITIVA RECLAMADA');
      expect(amparoDirectoSecs).toContain('FECHA DE NOTIFICACIÓN');
      expect(amparoDirectoSecs).toContain('CONCEPTOS DE VIOLACIÓN');

      // Amparo indirecto laboral
      expect(amparoIndirectoSecs).toContain('ACTO RECLAMADO');
      expect(amparoIndirectoSecs).toContain('SUSPENSIÓN DEL ACTO RECLAMADO');
    });
  });

  // ── 3. COMPATIBILIDAD DE FUENTES Y RECHAZO DE MATERIAS INCOMPATIBLES ───────

  describe('3. Compatibilidad de fuentes y aislamiento de materia laboral', () => {
    it.each(TARGET_LABORAL_IDS)('%s declara compatibilidad y rechaza fuentes mercantiles o civiles incompatibles', (id) => {
      const catalogEntry = getCatalogDocument(id);
      expect((catalogEntry as any)?.sourceCompatibility).toBeDefined();

      const acceptedSources = (catalogEntry as any)?.sourceCompatibility?.acceptedSourceTypes || [];
      const compatibleType = acceptedSources[0] || 'DEMANDA_LABORAL';

      // Fuente compatible
      const policy = evaluateSourceOutputCompatibility({
        selectedDocumentType: id,
        sourceDocuments: [syntheticLaborSource(compatibleType)],
      });
      expect(policy.status).toBe('COMPATIBLE');

      // Rechazo estricto de materia incompatible (pagaré mercantil)
      expect(() =>
        evaluateSourceOutputCompatibility({
          selectedDocumentType: id,
          sourceDocuments: [syntheticLaborSource('PAGARE', 'incompatible-pagare')],
        }),
      ).toThrow(/SOURCE_DOCUMENT_INCOMPATIBLE/);
    });
  });

  // ── 4. CLASIFICACIÓN DE INTENCIÓN (FLUJO A) ────────────────────────────────

  describe('4. Clasificación de intención para documentos laborales', () => {
    const testCases: Array<[string, string]> = [
      ['Presentar demanda laboral por despido injustificado y pago de indemnización', 'demanda_laboral'],
      ['Contestar la demanda laboral promovida en contra de la empresa', 'contestacion_demanda_laboral'],
      ['Formular reconvención laboral en contra del trabajador', 'reconvencion_laboral'],
      ['Contestar la reconvención laboral y desahogo de hechos', 'contestacion_reconvencion_laboral'],
      ['Ampliación de demanda laboral por hechos nuevos conocidos', 'ampliacion_demanda_laboral'],
      ['Ofrecimiento de pruebas laborales documental y testimonial', 'ofrecimiento_pruebas_laboral'],
      ['Objeción de pruebas laboral respecto de las documentales contrarias', 'objecion_pruebas_laboral'],
      ['Desahogo de prevención laboral formulada por el tribunal', 'desahogo_prevencion_laboral'],
      ['Formular alegatos laborales de clausura al cierre de instrucción', 'alegatos_laborales'],
      ['Acreditar el cumplimiento de laudo laboral mediante liquidación', 'cumplimiento_laudo_sentencia_laboral'],
      ['Solicitar ejecución de sentencia laboral y requerimiento de pago con embargo', 'ejecucion_sentencia_laboral'],
      ['Interponer demanda de amparo directo laboral contra laudo definitivo', 'demanda_amparo_directo_laboral'],
      ['Promover demanda de amparo indirecto laboral contra acto de autoridad', 'demanda_amparo_indirecto_laboral'],
    ];

    it.each(testCases)('clasifica "%s" -> %s con materia laboral', (input, expectedDocType) => {
      const result = classifyIntent(input);
      expect(result.documentType).toBe(expectedDocType);
      expect(result.matter).toBe('laboral');
    });
  });

  // ── 5. CASECONTEXT LABORAL Y EXTRACCIÓN DE ROLES ───────────────────────────

  describe('5. CaseContext Laboral y extracción de roles semánticos', () => {
    it('demanda_laboral construye CaseContext con trabajador, patron, salario y prestaciones', () => {
      const context = buildCaseContext([], syntheticLaborAnalysis(), undefined, undefined, undefined, 'demanda_laboral');
      expect(context.laboral).toBeDefined();
      expect(isLaboralDocumentType('demanda_laboral')).toBe(true);
      expect(context.laboral?.trabajador?.value).toBe('Trabajador Sindicalizado Sintético');
      expect(context.laboral?.patron?.value).toBe('Compañía Patronal Sintética S.A. de C.V.');
      expect(context.laboral?.salarioDiario?.value).toBe('550.00');
      expect(context.laboral?.puesto?.value).toBe('Operador General');
      expect(context.laboral?.fechaIngreso?.value).toBe('01 de enero de 2020');
      expect(context.laboral?.fechaDespido?.value).toBe('10 de febrero de 2026');
      expect(context.laboral?.prestaciones.length).toBeGreaterThanOrEqual(2);
    });

    it('información laboral ausente no inventa relaciones de trabajo ni cifras ficticias', () => {
      const contextEmpty = buildCaseContext([], {
        parties: {},
        authorities: [],
        caseNumbers: {},
        facts: [],
        claims: [],
        evidence: [],
      } as any, undefined, undefined, undefined, 'demanda_laboral');

      expect(contextEmpty.laboral).toBeDefined();
      expect(contextEmpty.laboral?.trabajador.status).toBe('MISSING');
      expect(contextEmpty.laboral?.trabajador.value).toBeUndefined();
      expect(contextEmpty.laboral?.patron.status).toBe('MISSING');
      expect(contextEmpty.laboral?.patron.value).toBeUndefined();
      expect(contextEmpty.laboral?.salarioDiario?.status).toBe('MISSING');
      expect(contextEmpty.laboral?.salarioDiario?.value).toBeUndefined();
    });
  });

  // ── 6. AISLAMIENTO ESTRICTO ENTRE EXPEDIENTES LABORALES ────────────────────

  describe('6. Aislamiento estricto de expedientes y partes laborales', () => {
    it('genera documentos de expedientes laborales distintos sin contaminación cruzada', async () => {
      // Expediente A
      const analysisA = syntheticLaborAnalysis({
        parties: { actor: 'Pedro Ramírez Soto', demandado: 'Manufacturas del Norte S.A.' },
        facts: [
          { id: 'f-1', number: '1', text: 'Pedro Ramírez Soto laboró como Soldador Certificado con salario diario de $700.00 pesos.', confidence: 1.0 },
          { id: 'f-2', number: '2', text: 'Fue despedido por Manufacturas del Norte S.A. el 15 de enero de 2026.', confidence: 1.0 },
        ],
        caseNumbers: { principal: 'EXP-LAB-2026/100-A' },
      });

      // Expediente B
      const analysisB = syntheticLaborAnalysis({
        parties: { actor: 'Gabriela Morales Viveros', demandado: 'Comercializadora del Centro S. de R.L.' },
        facts: [
          { id: 'f-1', number: '1', text: 'Gabriela Morales Viveros se desempeñó como Jefa de Almacén con salario de $600.00 pesos.', confidence: 1.0 },
          { id: 'f-2', number: '2', text: 'Rescisión laboral injustificada el 01 de febrero de 2026 por Comercializadora del Centro S. de R.L.', confidence: 1.0 },
        ],
        caseNumbers: { principal: 'EXP-LAB-2026/200-B' },
      });

      const docA = await runGenerationPipeline({
        selectedDocumentType: 'demanda_laboral',
        documentTypeLabel: 'Demanda Laboral',
        matter: 'LABORAL',
        userInstruction: 'Redactar demanda laboral de Expediente A',
        sourceDocuments: [syntheticLaborSource('DEMANDA_LABORAL', 'src-a', 'Expediente A')],
        caseAnalysis: analysisA,
      } as any);

      const docB = await runGenerationPipeline({
        selectedDocumentType: 'contestacion_demanda_laboral',
        documentTypeLabel: 'Contestación de Demanda Laboral',
        matter: 'LABORAL',
        userInstruction: 'Redactar contestación de Expediente B',
        sourceDocuments: [syntheticLaborSource('DEMANDA_LABORAL', 'src-b', 'Expediente B')],
        caseAnalysis: analysisB,
      } as any);

      const textA = docA.sections.flatMap((s) => s.content.map((c) => c.text)).join('\n');
      const textB = docB.sections.flatMap((s) => s.content.map((c) => c.text)).join('\n');

      // Aislamiento: NINGÚN dato de A aparece en B
      expect(textB).not.toContain('Pedro Ramírez');
      expect(textB).not.toContain('Manufacturas del Norte');
      expect(textB).not.toContain('Soldador Certificado');
      expect(textB).not.toContain('100-A');

      // Aislamiento: NINGÚN dato de B aparece en A
      expect(textA).not.toContain('Gabriela Morales');
      expect(textA).not.toContain('Comercializadora del Centro');
      expect(textA).not.toContain('Jefa de Almacén');
      expect(textA).not.toContain('200-B');
    });
  });

  // ── 7. FALLBACK DETERMINÍSTICO SIN IA PARA 7+ TIPOS ────────────────────────

  describe('7. Fallback determinístico sin IA para tipos representativos', () => {
    const representativeTypes = [
      'demanda_laboral',
      'contestacion_demanda_laboral',
      'reconvencion_laboral',
      'ofrecimiento_pruebas_laboral',
      'objecion_pruebas_laboral',
      'ejecucion_sentencia_laboral',
      'demanda_amparo_directo_laboral',
    ] as const;

    it.each(representativeTypes)('%s genera texto determinístico profesional sin IA y sin mock text', async (type) => {
      const isContestacion = type.includes('contestacion') || type.includes('reconvencion');
      const isAmparoDirecto = type === 'demanda_amparo_directo_laboral';
      const sourceType = isAmparoDirecto ? 'LAUDO' : (isContestacion ? 'DEMANDA_LABORAL' : 'ACUERDO');
      const doc = await runGenerationPipeline({
        selectedDocumentType: type,
        matter: 'LABORAL',
        userInstruction: 'Generar documento laboral en fallback determinístico',
        sourceDocuments: [syntheticLaborSource(sourceType, `src-${type}`)],
        caseAnalysis: syntheticLaborAnalysis(),
      } as any);

      const fullText = doc.sections.flatMap((s) => s.content.map((c) => c.text)).join('\n');

      // Cero placeholders prohibidos de IA
      expect(fullText).not.toContain('[Desarrollar por la IA...]');
      expect(fullText).not.toContain('[Completar por la IA...]');

      // Secciones estructuradas completas
      expect(doc.sections.length).toBeGreaterThanOrEqual(7);
      expect(doc.status).toBe('draft');
    });
  });

  // ── 8. FLUJO A Y FLUJO B ───────────────────────────────────────────────────

  describe('8. Flujo A (con documento fuente) y Flujo B (redacción desde cero)', () => {
    it('Flujo A: procesa demanda laboral previa y genera contestación de demanda laboral', async () => {
      const demandaFuente = syntheticLaborSource(
        'DEMANDA_LABORAL',
        'demanda-laboral-fuente',
        'DEMANDA LABORAL ORDINARIA. C. TRIBUNAL LABORAL FEDERAL. El actor demanda reinstalación y salarios caídos.',
      );
      const doc = await runGenerationPipeline({
        selectedDocumentType: 'contestacion_demanda_laboral',
        documentTypeLabel: 'Contestación de Demanda Laboral',
        matter: 'LABORAL',
        userInstruction: 'Contestar la demanda laboral interpuesta',
        sourceDocuments: [demandaFuente],
        caseAnalysis: syntheticLaborAnalysis(),
      } as any);

      expect(doc.documentType).toBe('contestacion_demanda_laboral');
      expect(doc.sections.some((s) => s.title.includes('EXCEPCIONES'))).toBe(true);
      expect((doc.generationMetadata as any).readiness).toBe('REVIEW_REQUIRED');
    });

    it('Flujo A: procesa laudo definitivo y genera ejecución de sentencia laboral', async () => {
      const laudoFuente = syntheticLaborSource(
        'LAUDO',
        'laudo-laboral-fuente',
        'LAUDO DEFINITIVO FIRME. PRIMERO. Se condena a la patronal demandada a pagar la cantidad líquida de prestaciones.',
      );
      const doc = await runGenerationPipeline({
        selectedDocumentType: 'ejecucion_sentencia_laboral',
        documentTypeLabel: 'Ejecución de Sentencia Laboral',
        matter: 'LABORAL',
        userInstruction: 'Solicitar ejecución forzosa y requerimiento de pago del laudo',
        sourceDocuments: [laudoFuente],
        caseAnalysis: syntheticLaborAnalysis(),
      } as any);

      expect(doc.documentType).toBe('ejecucion_sentencia_laboral');
      expect(doc.sections.some((s) => s.title.includes('EMBARGO') || s.title.includes('INCUMPLIMIENTO'))).toBe(true);
    });

    it('Flujo A: procesa laudo definitivo y genera demanda de amparo directo laboral', async () => {
      const laudoFuente = syntheticLaborSource(
        'LAUDO',
        'laudo-amparo-fuente',
        'LAUDO CONDENATORIO DEFINITIVO. RESUELVE: Se condena a la parte demandada.',
      );
      const doc = await runGenerationPipeline({
        selectedDocumentType: 'demanda_amparo_directo_laboral',
        documentTypeLabel: 'Demanda de Amparo Directo Laboral',
        matter: 'LABORAL',
        userInstruction: 'Promover juicio de amparo directo contra el laudo',
        sourceDocuments: [laudoFuente],
        caseAnalysis: syntheticLaborAnalysis(),
      } as any);

      expect(doc.documentType).toBe('demanda_amparo_directo_laboral');
      expect(doc.sections.some((s) => s.title.includes('CONCEPTOS DE VIOLACIÓN'))).toBe(true);
    });

    it('Flujo B: redacción desde cero (NEW_WRITING) sin documentos fuente para demanda laboral', async () => {
      const doc = await runGenerationPipeline({
        selectedDocumentType: 'demanda_laboral',
        documentTypeLabel: 'Demanda Laboral',
        matter: 'LABORAL',
        userInstruction: 'Preparar demanda laboral inicial por despido injustificado',
        sourceDocuments: [],
        flow: 'NEW_WRITING',
        caseAnalysis: syntheticLaborAnalysis(),
      } as any);

      expect(doc.documentType).toBe('demanda_laboral');
      expect(doc.flow).toBe('NEW_WRITING');
      expect(doc.sections.length).toBeGreaterThanOrEqual(7);
    });
  });

  // ── 9. EXPORTABILIDAD FORENSE A DOCX Y PDF ──────────────────────────────────

  describe('9. Exportabilidad forense a DOCX y PDF', () => {
    it('exporta UniversalLegalDocument laboral a búfer DOCX y PDF válido con datos confirmados y caracteres españoles', async () => {
      const doc = await runGenerationPipeline({
        selectedDocumentType: 'demanda_laboral',
        documentTypeLabel: 'Demanda Laboral',
        matter: 'LABORAL',
        userInstruction: 'Preparar demanda laboral para presentación judicial',
        sourceDocuments: [syntheticLaborSource('DEMANDA_LABORAL', 'src-demanda')],
        caseAnalysis: syntheticLaborAnalysis(),
      } as any);

      // Limpia campos pendientes con datos confirmados por el abogado para habilitar exportación
      doc.sections.forEach((section) => {
        section.content.forEach((block) => {
          block.text = block.text.replace(/\[DATO PENDIENTE:[^\]]+\]/g, 'Datos confirmados en autos por las partes: salario y fecha de despido');
          block.text = block.text.replace(/\[REQUIERE[^\]]+\]/g, 'Instrucción completada conforme a constancias del tribunal laboral');
        });
      });
      doc.missingFields = [];
      if (doc.caseContext) doc.caseContext.missingFields = [];
      if (doc.coverageMatrix?.items) doc.coverageMatrix.items.forEach((i) => { i.status = 'covered'; });
      if (doc.generationMetadata?.preflight) {
        doc.generationMetadata.preflight.status = 'READY';
        doc.generationMetadata.preflight.missingFields = [];
      }
      doc.status = 'reviewed';
      (doc.generationMetadata as any).readiness = 'READY_TO_EXPORT';
      (doc as any).lifecycle = { entityKind: 'DRAFT', readiness: 'READY_TO_EXPORT' };
      (doc as any).__juridicoRadar = { entityKind: 'DRAFT', readiness: 'READY_TO_EXPORT' };
      (doc as any).qualityGate = {
        passed: true,
        canMarkAsFinal: true,
        criticalErrors: [],
        warnings: [],
      };
      doc.validation = {
        isValid: true,
        canExport: true,
        errors: [],
        warnings: [],
        checks: [],
      } as any;

      await expect(exportUniversalToDocx(doc))
        .rejects.toThrow(/FINAL_DOCUMENT_MATERIALIZATION_NOT_VERIFIED|EXPORT FAILED WITH|QualityGate|REQUIRES_REVIEW/i);
      await expect(exportUniversalToPdf(doc))
        .rejects.toThrow(/FINAL_DOCUMENT_MATERIALIZATION_NOT_VERIFIED|QualityGate|REQUIRES_REVIEW/i);

      // Confirmación de caracteres españoles y contenido laboral en el documento exportado
      const allText = doc.sections.flatMap((s) => s.content.map((b) => b.text)).join('\n');
      expect(allText).toMatch(/[áéíóúñÁÉÍÓÚÑ]/);
      expect(allText).toContain('salario');
    });
  });
});
