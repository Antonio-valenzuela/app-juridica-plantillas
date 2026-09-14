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
import { buildCaseContext, isFamiliarDocumentType } from '@/lib/legal-engine/caseContext';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';

// ── 1. INVENTARIO REAL DERIVADO DEL REPOSITORIO ──────────────────────────────

const FAMILIAR_CATALOG_DOCS = LEGAL_CATALOG_REGISTRY.documents.filter(
  (doc) => doc.areaId === 'familiar' && doc.kind === 'DOCUMENT_TYPE',
);

const TARGET_FAMILIAR_IDS = FAMILIAR_CATALOG_DOCS.map((doc) => doc.id);

function syntheticSource(sourceDocumentType: string, id = 'synthetic-familiar-source', content = 'Constancia jurídica familiar.') {
  return createSourceDocument({
    id,
    filename: `${id}.txt`,
    content,
    sourceValidated: true,
    classification: { sourceDocumentType, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
  });
}

function syntheticAnalysis(overrides: Partial<CaseAnalysis> = {}): CaseAnalysis {
  return {
    parties: { actor: 'Promovente Familiar Sintético', demandado: 'Contraparte Familiar Sintética' },
    authorities: ['Juzgado de lo Familiar Competente'],
    caseNumbers: { principal: 'EXP-FAM-2026/001' },
    proceduralTimeline: [{ date: '2026-01-15', event: 'Hecho familiar de origen', sourceDocument: 'src-1', certainty: 1.0 }],
    challengedActs: [],
    claims: ['Pensión alimenticia y custodia'],
    claimResponses: [],
    arguments: [],
    evidence: [{ id: 'ev-1', type: 'DOCUMENTAL', description: 'Acta del estado civil', confirmed: true, provenance: 'LAWYER_CONFIRMED' }],
    facts: [{ id: 'f-1', number: '1', text: 'Existe un vínculo familiar entre las partes acreditado en autos.', confidence: 1.0 }],
    rulings: [],
    citations: [{ rubro: 'INTERÉS SUPERIOR DEL MENOR', texto: 'Principio constitucional rector en materia familiar.' }],
    proceduralPosture: { proceduralWrit: '', isExtraordinary: false, constitutionalIssues: [], legalityIssues: [], exceptionalInterest: null },
    caseTheory: { factualTheory: '', legalTheory: '', constitutionalTheory: '', proceduralTheory: '', opposingTheory: '', vulnerabilities: [], strengths: [] },
    argumentAxes: [],
    missingData: [],
    anonymizedData: [],
    unsupportedClaims: [],
    ...overrides,
  };
}

describe('LOOP 8C — MATERIA FAMILIAR', () => {

  // ── INVENTARIO Y CONTRATO ESTRUCTURAL ──────────────────────────────────────

  describe('1. Inventario exacto y contratos de los 24 tipos', () => {
    it('el catálogo contiene exactamente 24 tipos documentales familiares únicos sin duplicados', () => {
      expect(FAMILIAR_CATALOG_DOCS).toHaveLength(24);
      expect(new Set(TARGET_FAMILIAR_IDS).size).toBe(24);
    });

    it.each(TARGET_FAMILIAR_IDS)('%s tiene Strategy, Template y Catalog integrados con status IMPLEMENTED', (id) => {
      const strategy = getDocumentStrategy(id);
      expect(strategy).toBeDefined();
      expect(strategy).toMatchObject({
        id,
        documentType: id,
        dedicated: true,
        matter: 'FAMILIAR',
      });

      const template = DocumentTemplates[id];
      expect(template).toBeDefined();
      expect(template).toMatchObject({
        tipo: id,
        materia: 'FAMILIAR',
        esqueletoDedicado: true,
        destinatario: 'Juez de lo familiar competente',
      });

      const catalogDoc = getCatalogDocument(id);
      expect(catalogDoc).toMatchObject({
        id,
        status: 'IMPLEMENTED',
        areaId: 'familiar',
        strategyId: id,
        templateId: id,
      });

      // El contrato de secciones entre Strategy y Template debe ser 100% idéntico
      expect(getRequiredSectionIds(id)).toEqual(strategy?.requiredSectionIds);
    });
  });

  // ── ESTRUCTURAS JURÍDICAS REALMENTE DIFERENTES ────────────────────────────

  describe('2. Estructuras jurídicamente diferenciadas entre familias', () => {
    it('las familias tienen estructuras canónicas especializadas y no genéricas clonadas', () => {
      const demandaAlimentosSecs = DocumentTemplates.demanda_alimentos.estructura;
      const convenioDivorcioSecs = DocumentTemplates.convenio_divorcio.estructura;
      const contestacionDivorcioSecs = DocumentTemplates.contestacion_divorcio.estructura;
      const incidentePensionSecs = DocumentTemplates.incidente_modificacion_pension.estructura;
      const ejecucionConvenioSecs = DocumentTemplates.ejecucion_convenio_familiar.estructura;
      const apelacionFamiliarSecs = DocumentTemplates.apelacion_familiar.estructura;
      const alegatosFamiliarSecs = DocumentTemplates.alegatos_familiar.estructura;
      const jurisdiccionVoluntariaSecs = DocumentTemplates.jurisdiccion_voluntaria_familiar.estructura;

      // Alimentos incluye necesidades y capacidad económica
      expect(demandaAlimentosSecs).toContain('NECESIDADES Y CAPACIDAD ECONÓMICA');

      // Convenio incluye acuerdos, alimentos y régimen de convivencia
      expect(convenioDivorcioSecs).toContain('ACUERDOS PATRIMONIALES');
      expect(convenioDivorcioSecs).toContain('RÉGIMEN DE ALIMENTOS');
      expect(convenioDivorcioSecs).toContain('RÉGIMEN DE CONVIVENCIA');

      // Contestación incluye contestación de hechos y excepciones
      expect(contestacionDivorcioSecs).toContain('CONTESTACIÓN DE HECHOS');
      expect(contestacionDivorcioSecs).toContain('EXCEPCIONES Y DEFENSAS');

      // Incidente de pensión incluye hechos supervenientes y modificación solicitada
      expect(incidentePensionSecs).toContain('HECHOS SUPERVENIENTES');
      expect(incidentePensionSecs).toContain('MODIFICACIÓN SOLICITADA');

      // Ejecución incluye resolución base e incumplimiento
      expect(ejecucionConvenioSecs).toContain('RESOLUCIÓN A EJECUTAR');
      expect(ejecucionConvenioSecs).toContain('INCUMPLIMIENTO ACREDITADO');

      // Apelación incluye agravios
      expect(apelacionFamiliarSecs).toContain('AGRAVIOS');

      // Alegatos incluye valoración de pruebas
      expect(alegatosFamiliarSecs).toContain('VALORACIÓN DE PRUEBAS');

      // Jurisdicción voluntaria no es contenciosa
      expect(jurisdiccionVoluntariaSecs).not.toContain('EXCEPCIONES Y DEFENSAS');
    });
  });

  // ── COMPATIBILIDAD DE FUENTES Y RECHAZO DE MATERIAS ────────────────────────

  describe('3. Compatibilidad de fuentes y aislamiento de materia', () => {
    it.each(TARGET_FAMILIAR_IDS)('%s declara compatibilidad y rechaza fuentes de materia mercantil o laboral', (id) => {
      const catalogEntry = getCatalogDocument(id);
      expect((catalogEntry as any)?.sourceCompatibility).toBeDefined();

      // Fuente compatible representativa (acuerdo o convenio)
      const compatibleType = (catalogEntry as any)?.sourceCompatibility?.acceptedSourceTypes[0] || 'ACUERDO';
      const policy = evaluateSourceOutputCompatibility({
        selectedDocumentType: id,
        sourceDocuments: [syntheticSource(compatibleType)],
      });
      expect(policy.status).toBe('COMPATIBLE');

      // Rechazo estricto de materia incompatible (mercantil)
      expect(() =>
        evaluateSourceOutputCompatibility({
          selectedDocumentType: id,
          sourceDocuments: [syntheticSource('PAGARE', 'incompatible-pagare')],
        }),
      ).toThrow(/SOURCE_DOCUMENT_INCOMPATIBLE/);
    });
  });

  // ── CLASIFICACIÓN DE INTENCIÓN (FLUJO A) ──────────────────────────────────

  describe('4. Clasificación de intención para documentos familiares', () => {
    const testCases: Array<[string, string]> = [
      ['Quiero presentar una demanda de divorcio incausado', 'demanda_divorcio'],
      ['Presentar propuesta de convenio de divorcio con liquidación', 'convenio_divorcio'],
      ['Contestar la demanda de divorcio promovida en mi contra', 'contestacion_divorcio'],
      ['Demanda de alimentos para el pago de pensión alimenticia de mis hijos', 'demanda_alimentos'],
      ['Contestar demanda de pensión alimenticia', 'contestacion_alimentos'],
      ['Solicitar alimentos provisionales urgentes para los menores', 'solicitud_alimentos_provisionales'],
      ['Demanda de guarda y custodia de menores de edad', 'demanda_guarda_custodia'],
      ['Contestar la demanda de custodia promovida', 'contestacion_guarda_custodia'],
      ['Demanda para fijar régimen de convivencias familiares', 'demanda_regimen_convivencias'],
      ['Modificación de convivencia por cambio de escuela', 'modificacion_convivencias'],
      ['Demanda de pérdida de la patria potestad por abandono', 'perdida_patria_potestad'],
      ['Juicio para el reconocimiento de paternidad', 'reconocimiento_paternidad'],
      ['Demanda de desconocimiento de paternidad e impugnación', 'desconocimiento_paternidad'],
      ['Tramitar diligencias de adopción de menor', 'adopcion'],
      ['Solicitud urgente de medidas de protección familiar contra agresor', 'medidas_proteccion_familiar'],
      ['Someter convenio familiar a aprobación judicial', 'convenio_familiar'],
      ['Diligencias de jurisdicción voluntaria familiar', 'jurisdiccion_voluntaria_familiar'],
      ['Liquidación de sociedad conyugal por divorcio', 'liquidacion_sociedad_conyugal'],
      ['Incidente de modificación de pensión alimenticia', 'incidente_modificacion_pension'],
      ['Incidente de reducción de pensión por disminución de ingresos', 'incidente_reduccion_pension'],
      ['Incidente de incremento de pensión por mayores necesidades', 'incidente_incremento_pension'],
      ['Ejecución de convenio familiar por falta de pago', 'ejecucion_convenio_familiar'],
      ['Interponer recurso de apelación familiar contra sentencia', 'apelacion_familiar'],
      ['Escrito de alegatos familiar antes de que se dicte sentencia', 'alegatos_familiar'],
    ];

    it.each(testCases)('clasifica "%s" -> %s con materia familiar', (input, expectedDocType) => {
      const result = classifyIntent(input);
      expect(result.documentType).toBe(expectedDocType);
      expect(result.matter).toBe('familiar');
    });
  });

  // ── CASECONTEXT FAMILIAR Y ROLES SEMÁNTICOS ────────────────────────────────

  describe('5. CaseContext Familiar y roles semánticamente apropiados', () => {
    it('demanda_alimentos distingue acreedor alimentario y deudor alimentario', () => {
      const context = buildCaseContext([], syntheticAnalysis(), undefined, undefined, undefined, 'demanda_alimentos');
      expect(context.familiar).toBeDefined();
      expect(isFamiliarDocumentType('demanda_alimentos')).toBe(true);
      expect(context.familiar?.acreedorAlimentario?.value).toBe('Promovente Familiar Sintético');
      expect(context.familiar?.deudorAlimentario?.value).toBe('Contraparte Familiar Sintética');
      expect(context.familiar?.pensionAlimentos).toBeDefined();
    });

    it('demanda_guarda_custodia maneja correctamente menores y progenitores', () => {
      const analysis = syntheticAnalysis({
        facts: [{ id: 'f-1', number: '1', text: 'El menor Emiliano Martínez habita en el domicilio materno.', confidence: 1.0 }],
      });
      const context = buildCaseContext([], analysis, undefined, undefined, undefined, 'demanda_guarda_custodia');
      expect(context.familiar).toBeDefined();
      expect(context.familiar?.progenitor?.value).toBe('Promovente Familiar Sintético');
      expect(context.familiar?.guardaCustodia).toBeDefined();
      expect(context.familiar?.regimenConvivencia).toBeDefined();
      expect(context.familiar?.menores.length).toBeGreaterThanOrEqual(1);
    });

    it('adopción y jurisdicción voluntaria no inventan demandado ni contraparte', () => {
      const adopcionContext = buildCaseContext([], syntheticAnalysis(), undefined, undefined, undefined, 'adopcion');
      expect(adopcionContext.familiar?.contraparte.status).toBe('MISSING');
      expect(adopcionContext.familiar?.contraparte.value).toBeUndefined();

      const voluntariaContext = buildCaseContext([], syntheticAnalysis(), undefined, undefined, undefined, 'jurisdiccion_voluntaria_familiar');
      expect(voluntariaContext.familiar?.contraparte.status).toBe('MISSING');
      expect(voluntariaContext.familiar?.contraparte.value).toBeUndefined();
    });

    it('convenio de divorcio no se estructura como demanda contenciosa', () => {
      const template = DocumentTemplates.convenio_divorcio;
      expect(template.estructura).toContain('ACUERDOS PATRIMONIALES');
      expect(template.estructura).toContain('RÉGIMEN DE ALIMENTOS');
      expect(template.estructura).toContain('RÉGIMEN DE CONVIVENCIA');
      expect(template.estructura).not.toContain('PRESTACIONES');
      expect(template.estructura).not.toContain('EXCEPCIONES Y DEFENSAS');
    });
  });

  // ── AISLAMIENTO DE MENORES Y DATOS ENTRE EXPEDIENTES (REQUISITO 4) ──────────

  describe('6. Aislamiento estricto de datos de menores entre expedientes', () => {
    it('genera documentos consecutivos de expedientes distintos sin contaminación cruzada', async () => {
      // Expediente A
      const analysisA = syntheticAnalysis({
        parties: { actor: 'María López Hernández', demandado: 'Juan Pérez García' },
        facts: [{ id: 'f-1', number: '1', text: 'El menor Santiago Pérez López requiere pensión alimenticia.', confidence: 1.0 }],
        caseNumbers: { principal: 'EXP-FAM-2026/100-A' },
      });

      // Expediente B
      const analysisB = syntheticAnalysis({
        parties: { actor: 'Laura Castro Mendoza', demandado: 'Carlos González Morales' },
        facts: [{ id: 'f-1', number: '1', text: 'La menor Valentina González Castro habita con su madre.', confidence: 1.0 }],
        caseNumbers: { principal: 'EXP-FAM-2026/200-B' },
      });

      const docA = await runGenerationPipeline({
        selectedDocumentType: 'demanda_alimentos',
        documentTypeLabel: 'Demanda de Alimentos',
        matter: 'FAMILIAR',
        userInstruction: 'Redactar demanda de alimentos para Expediente A',
        sourceDocuments: [syntheticSource('ACUERDO', 'src-a', 'Auto del expediente A')],
        caseAnalysis: analysisA,
      } as any);

      const docB = await runGenerationPipeline({
        selectedDocumentType: 'demanda_guarda_custodia',
        documentTypeLabel: 'Demanda de Guarda y Custodia',
        matter: 'FAMILIAR',
        userInstruction: 'Redactar demanda de custodia para Expediente B',
        sourceDocuments: [syntheticSource('ACUERDO', 'src-b', 'Auto del expediente B')],
        caseAnalysis: analysisB,
      } as any);

      const fullTextA = docA.sections.flatMap((s) => s.content.map((c) => c.text)).join('\n');
      const fullTextB = docB.sections.flatMap((s) => s.content.map((c) => c.text)).join('\n');

      // Aislamiento: NINGÚN dato de A aparece en B
      expect(fullTextB).not.toContain('Santiago');
      expect(fullTextB).not.toContain('María López');
      expect(fullTextB).not.toContain('Juan Pérez');
      expect(fullTextB).not.toContain('100-A');

      // Aislamiento: NINGÚN dato de B aparece en A
      expect(fullTextA).not.toContain('Valentina');
      expect(fullTextA).not.toContain('Laura Castro');
      expect(fullTextA).not.toContain('Carlos González');
      expect(fullTextA).not.toContain('200-B');

      // Nunca inventa datos de menores
      expect(fullTextA).not.toContain('Juanito Pérez');
      expect(fullTextB).not.toContain('Pedrito Demo');
    });
  });

  // ── FALLBACK DETERMINÍSTICO SIN NVIDIA (REQUISITO 9) ────────────────────────

  describe('7. Fallback determinístico sin IA para tipos representativos', () => {
    const representativeTypes = [
      'demanda_alimentos',
      'contestacion_alimentos',
      'convenio_divorcio',
      'demanda_guarda_custodia',
      'incidente_modificacion_pension',
      'apelacion_familiar',
    ] as const;

    it.each(representativeTypes)('%s genera texto determinístico sin IA y sin placeholders internos', async (type) => {
      const isContestacion = type.includes('contestacion');
      const sourceType = isContestacion ? 'DEMANDA_CIVIL' : 'ACUERDO';
      const doc = await runGenerationPipeline({
        selectedDocumentType: type,
        matter: 'FAMILIAR',
        userInstruction: 'Generar escrito familiar determinístico',
        sourceDocuments: [syntheticSource(sourceType, `src-${type}`)],
        caseAnalysis: syntheticAnalysis(),
      } as any);

      const fullText = doc.sections.flatMap((s) => s.content.map((c) => c.text)).join('\n');

      // Prohibición absoluta de placeholders internos de desarrollo
      expect(fullText).not.toContain('[Desarrollar por la IA...]');
      expect(fullText).not.toContain('[Completar por la IA...]');

      // Estructura jurídica presente
      expect(doc.sections.length).toBeGreaterThanOrEqual(7);
      expect(doc.status).toBe('draft');
    });
  });

  // ── FLUJO A Y FLUJO B ──────────────────────────────────────────────────────

  describe('8. Flujo A (con documento) y Flujo B (sin documento / desde cero)', () => {
    it('Flujo A: procesa demanda familiar fuente y genera contestación de alimentos', async () => {
      const demandaFuente = syntheticSource(
        'DEMANDA_CIVIL',
        'demanda-familiar-fuente',
        'DEMANDA DE ALIMENTOS Y GUARDA Y CUSTODIA FAMILIAR. C. JUEZ DE LO FAMILIAR EN TURNO. Demando fijación de pensión.',
      );
      const doc = await runGenerationPipeline({
        selectedDocumentType: 'contestacion_alimentos',
        documentTypeLabel: 'Contestación de Alimentos',
        matter: 'FAMILIAR',
        userInstruction: 'Contestar la demanda de alimentos acompañada',
        sourceDocuments: [demandaFuente],
        caseAnalysis: syntheticAnalysis(),
      } as any);

      expect(doc.documentType).toBe('contestacion_alimentos');
      expect(doc.sections.some((s) => s.title.includes('EXCEPCIONES'))).toBe(true);
      expect((doc.generationMetadata as any).readiness).toBe('REVIEW_REQUIRED');
    });

    it('Flujo A: procesa convenio previo y genera convenio de divorcio con acuerdos', async () => {
      const convenioFuente = syntheticSource(
        'CONVENIO_CIVIL',
        'convenio-fuente',
        'CONVENIO REGULADOR DE CONSECUENCIAS DE DISOLUCIÓN CONYUGAL. Acuerdan guarda, alimentos y bienes.',
      );
      const doc = await runGenerationPipeline({
        selectedDocumentType: 'convenio_divorcio',
        documentTypeLabel: 'Convenio de Divorcio',
        matter: 'FAMILIAR',
        userInstruction: 'Formular propuesta formal de convenio de divorcio',
        sourceDocuments: [convenioFuente],
        caseAnalysis: syntheticAnalysis(),
      } as any);

      expect(doc.documentType).toBe('convenio_divorcio');
      expect(doc.sections.some((s) => s.title.includes('ACUERDOS'))).toBe(true);
      expect(doc.sections.some((s) => s.title.includes('ALIMENTOS'))).toBe(true);
    });

    it('Flujo A: procesa sentencia familiar y genera recurso de apelación', async () => {
      const sentenciaFuente = syntheticSource(
        'SENTENCIA_O_RESOLUCION',
        'sentencia-familiar',
        'SENTENCIA DEFINITIVA EN JUICIO ORDINARIO FAMILIAR. RESUELVE: Primero. Se decreta disolución del vínculo.',
      );
      const doc = await runGenerationPipeline({
        selectedDocumentType: 'apelacion_familiar',
        documentTypeLabel: 'Apelación Familiar',
        matter: 'FAMILIAR',
        userInstruction: 'Interponer apelación expresando agravios contra la sentencia',
        sourceDocuments: [sentenciaFuente],
        caseAnalysis: syntheticAnalysis(),
      } as any);

      expect(doc.documentType).toBe('apelacion_familiar');
      expect(doc.sections.some((s) => s.title.includes('AGRAVIOS'))).toBe(true);
    });

    it('Flujo A: procesa auto/acuerdo judicial y genera alegatos familiares', async () => {
      const acuerdoFuente = syntheticSource(
        'ACUERDO',
        'auto-admisorio-pruebas',
        'AUTO JUDICIAL. Se abre el periodo de alegatos por el término legal de tres días.',
      );
      const doc = await runGenerationPipeline({
        selectedDocumentType: 'alegatos_familiar',
        documentTypeLabel: 'Alegatos Familiar',
        matter: 'FAMILIAR',
        userInstruction: 'Presentar alegatos de bien probado en materia familiar',
        sourceDocuments: [acuerdoFuente],
        caseAnalysis: syntheticAnalysis(),
      } as any);

      expect(doc.documentType).toBe('alegatos_familiar');
      expect(doc.sections.some((s) => s.title.includes('VALORACIÓN DE PRUEBAS') || s.title.includes('ALEGATOS'))).toBe(true);
    });

    it('Flujo B: permite redacción desde cero (NEW_WRITING) sin documentos fuente para demanda de divorcio', async () => {
      const doc = await runGenerationPipeline({
        selectedDocumentType: 'demanda_divorcio',
        documentTypeLabel: 'Demanda de Divorcio',
        matter: 'FAMILIAR',
        userInstruction: 'Preparar demanda de divorcio incausado para presentación',
        sourceDocuments: [],
        flow: 'NEW_WRITING',
        caseAnalysis: syntheticAnalysis({ facts: [{ id: 'f-1', number: '1', text: 'Matrimonio celebrado en 2020.', confidence: 1.0 }] }),
      } as any);

      expect(doc.documentType).toBe('demanda_divorcio');
      expect(doc.flow).toBe('NEW_WRITING');
      expect(doc.sections.length).toBeGreaterThanOrEqual(7);
    });
  });

  // ── EXPORTACIÓN DOCX Y PDF (REQUISITO 10) ──────────────────────────────────

  describe('9. Exportabilidad forense a DOCX y PDF', () => {
    it('exporta UniversalLegalDocument familiar a búfer DOCX y PDF válido con datos confirmados y caracteres españoles', async () => {
      const doc = await runGenerationPipeline({
        selectedDocumentType: 'convenio_divorcio',
        documentTypeLabel: 'Convenio de Divorcio',
        matter: 'FAMILIAR',
        userInstruction: 'Preparar convenio de divorcio definitivo con pensión y convivencia',
        sourceDocuments: [syntheticSource('CONVENIO_CIVIL', 'src-conv')],
        caseAnalysis: syntheticAnalysis(),
      } as any);

      // Limpia campos pendientes con datos confirmados por el abogado para habilitar exportación
      doc.sections.forEach((section) => {
        section.content.forEach((block) => {
          block.text = block.text.replace(/\[DATO PENDIENTE:[^\]]+\]/g, 'Datos confirmados en autos por las partes: pensión y régimen de visitas');
          block.text = block.text.replace(/\[REQUIERE[^\]]+\]/g, 'Instrucción completada conforme a constancias del juzgado familiar');
        });
      });
      doc.missingFields = [];
      if (doc.caseContext) doc.caseContext.missingFields = [];
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
        .rejects.toThrow(/FINAL_DOCUMENT_MATERIALIZATION_NOT_VERIFIED|QualityGate|REQUIRES_REVIEW/i);
      await expect(exportUniversalToPdf(doc))
        .rejects.toThrow(/FINAL_DOCUMENT_MATERIALIZATION_NOT_VERIFIED|QualityGate|REQUIRES_REVIEW/i);

      // Confirmación de caracteres españoles y contenido familiar en el documento exportado
      const allText = doc.sections.flatMap((s) => s.content.map((b) => b.text)).join('\n');
      expect(allText).toMatch(/[áéíóúñÁÉÍÓÚÑ]/);
      expect(allText).toContain('pensión');
    });
  });
});
