import { describe, it, expect } from 'vitest';
import { DOCUMENT_STRATEGIES, getDocumentStrategy } from '@/lib/legal-engine/documentStrategies';
import { DocumentTemplates, getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import { getRequiredSectionIds } from '@/lib/legal-engine/exportGuards';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import { classifyIntent } from '@/lib/legal-engine/classifier';
import {
  buildCaseContext,
  CORPORATIVO_DOCUMENT_TYPES,
  CONTRACTUAL_DOCUMENT_TYPES,
  PROPIEDAD_INTELECTUAL_DOCUMENT_TYPES,
  isCorporativoDocumentType,
  isContractualDocumentType,
  isPropiedadIntelectualDocumentType,
} from '@/lib/legal-engine/caseContext';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { UniversalLegalDocument, UploadedSourceDocument } from '@/lib/legal-engine/types';
import { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { exportToText } from '@/lib/templates/exportText';
import { evaluateSourceOutputCompatibility } from '@/lib/legal-engine/sourceOutputCompatibility';

const CORP_TYPES = [
  'constitucion_sociedad',
  'modificacion_estatutos',
  'acta_asamblea_ordinaria',
  'acta_asamblea_extraordinaria',
  'resoluciones_unanimidad',
  'acta_consejo',
  'aumento_capital',
  'reduccion_capital',
  'cesion_partes_sociales',
  'compraventa_acciones',
  'poderes',
  'revocacion_poder',
  'convenio_accionistas',
  'acuerdo_confidencialidad',
  'carta_intencion',
] as const;

const CONTRACTUAL_TYPES = [
  'contrato_compraventa',
  'contrato_arrendamiento',
  'contrato_prestacion_servicios',
  'contrato_obra',
  'contrato_mutuo',
  'contrato_comodato',
  'contrato_mandato',
  'contrato_comision',
  'contrato_distribucion',
  'contrato_suministro',
  'contrato_confidencialidad',
  'contrato_licencia',
  'convenio_transaccional',
  'convenio_reconocimiento_adeudo',
  'convenio_terminacion',
  'convenio_modificatorio',
  'memorando_entendimiento',
] as const;

const PI_TYPES = [
  'contrato_licencia_marca',
  'cesion_derechos_marca',
  'licencia_derechos_autor',
  'cesion_derechos_autor',
  'infraccion_propiedad_industrial',
  'recurso_propiedad_intelectual',
  'solicitud_registro_marca',
  'contestacion_impedimento',
  'oposicion_marca',
  'nulidad_registro',
  'caducidad_registro',
] as const;

const ALL_LOOP8I_TYPES = [...CORP_TYPES, ...CONTRACTUAL_TYPES, ...PI_TYPES];

describe('LOOP 8I — Corporativo (15) + Contractual (17) + Propiedad Intelectual (11) = 43 Tipos', () => {
  describe('1. Strategy & Template Completeness (43 Document Types)', () => {
    it.each(ALL_LOOP8I_TYPES)('Strategy exists and is registered for %s', (docType) => {
      const strategy = getDocumentStrategy(docType);
      expect(strategy).toBeDefined();
      expect(strategy?.documentType).toBe(docType);
      expect(strategy?.requiredSectionIds.length).toBeGreaterThanOrEqual(4);
    });

    it.each(CORP_TYPES)('Corporativo strategy has matter CORPORATIVO for %s', (docType) => {
      const strategy = getDocumentStrategy(docType);
      expect(strategy?.matter).toBe('CORPORATIVO');
    });

    it.each(CONTRACTUAL_TYPES)('Contractual strategy has matter CONTRACTUAL for %s', (docType) => {
      const strategy = getDocumentStrategy(docType);
      expect(strategy?.matter).toBe('CONTRACTUAL');
    });

    it.each(PI_TYPES)('Propiedad Intelectual strategy has matter PROPIEDAD_INTELECTUAL for %s', (docType) => {
      const strategy = getDocumentStrategy(docType);
      expect(strategy?.matter).toBe('PROPIEDAD_INTELECTUAL');
    });

    it.each(ALL_LOOP8I_TYPES)('Template exists and has non-empty estructura for %s', (docType) => {
      const template = getDocumentTemplate(docType);
      expect(template).toBeDefined();
      expect(template.tipo).toBe(docType);
      expect(template.estructura.length).toBeGreaterThanOrEqual(4);
      expect(template.esqueletoDedicado).toBe(true);
    });

    it.each(ALL_LOOP8I_TYPES)('Canonical sections match exactly between strategy and template for %s', (docType) => {
      const strategy = getDocumentStrategy(docType);
      const exportGuardsSections = getRequiredSectionIds(docType);
      expect([...(strategy?.requiredSectionIds || [])]).toEqual([...exportGuardsSections]);
    });
  });

  describe('2. Catalog Status and Classification', () => {
    it('All 43 types are present in catalog with status IMPLEMENTED and kind DOCUMENT_TYPE', () => {
      for (const id of ALL_LOOP8I_TYPES) {
        const item = getCatalogDocument(id);
        expect(item, `Catalog item ${id} should exist`).toBeDefined();
        expect(item?.kind).toBe('DOCUMENT_TYPE');
        expect(item?.status).toBe('IMPLEMENTED');
        expect((item as any)?.implemented).toBe(true);
        expect((item as any)?.sourceCompatibility).not.toBeNull();
      }
    });

    it('Type guard functions classify all 43 types correctly', () => {
      for (const id of CORP_TYPES) {
        expect(isCorporativoDocumentType(id)).toBe(true);
        expect(isContractualDocumentType(id)).toBe(false);
        expect(isPropiedadIntelectualDocumentType(id)).toBe(false);
      }
      for (const id of CONTRACTUAL_TYPES) {
        expect(isContractualDocumentType(id)).toBe(true);
        expect(isCorporativoDocumentType(id)).toBe(false);
        expect(isPropiedadIntelectualDocumentType(id)).toBe(false);
      }
      for (const id of PI_TYPES) {
        expect(isPropiedadIntelectualDocumentType(id)).toBe(true);
        expect(isCorporativoDocumentType(id)).toBe(false);
        expect(isContractualDocumentType(id)).toBe(false);
      }
    });
  });

  describe('3. Routing Resolution (resolveDocumentRouting)', () => {
    it.each(ALL_LOOP8I_TYPES)('Resolves route successfully for %s', (docType) => {
      const routing = resolveDocumentRouting({ selectedDocumentType: docType });
      expect(routing.resolvedTemplate).toBe(docType);
      expect(routing.resolvedStrategy).toBe(docType);
      expect(routing.template.tipo).toBe(docType);
    });
  });

  describe('4. Classifier Intent Recognition', () => {
    const classifierCases: Array<{ query: string; expected: string }> = [
      // Corporativo
      { query: 'Redactar acta de constitución de sociedad anónima de capital variable', expected: 'constitucion_sociedad' },
      { query: 'Elaborar modificación de estatutos de la empresa por cambio de objeto social', expected: 'modificacion_estatutos' },
      { query: 'Redactar acta de asamblea ordinaria de accionistas anual', expected: 'acta_asamblea_ordinaria' },
      { query: 'Acta de asamblea extraordinaria de accionistas', expected: 'acta_asamblea_extraordinaria' },
      { query: 'Resoluciones tomadas por unanimidad de accionistas fuera de asamblea', expected: 'resoluciones_unanimidad' },
      { query: 'Acta de sesión de consejo de administración', expected: 'acta_consejo' },
      { query: 'Acuerdo de aumento de capital social de la empresa', expected: 'aumento_capital' },
      { query: 'Acuerdo de reducción de capital social con reembolso a socios', expected: 'reduccion_capital' },
      { query: 'Contrato de cesión de partes sociales de SRL', expected: 'cesion_partes_sociales' },
      { query: 'Contrato de compraventa de acciones representativas del capital', expected: 'compraventa_acciones' },
      { query: 'Otorgamiento de poderes generales para pleitos y cobranzas y actos de dominio', expected: 'poderes' },
      { query: 'Revocación de poderes conferidos al apoderado legal', expected: 'revocacion_poder' },
      { query: 'Convenio de accionistas y pacto parasocial', expected: 'convenio_accionistas' },
      { query: 'Acuerdo de confidencialidad corporativo para protección de secretos', expected: 'acuerdo_confidencialidad' },
      { query: 'Carta de intención LOI para adquisición de empresa', expected: 'carta_intencion' },
      // Contractual
      { query: 'Contrato de compraventa de mercancías a precio alzado', expected: 'contrato_compraventa' },
      { query: 'Contrato de arrendamiento de maquinaria y equipo de transporte', expected: 'contrato_arrendamiento' },
      { query: 'Contrato de prestación de servicios profesionales independientes', expected: 'contrato_prestacion_servicios' },
      { query: 'Contrato de obra a precio alzado para remodelación', expected: 'contrato_obra' },
      { query: 'Contrato de mutuo con interés y pagaré anexo', expected: 'contrato_mutuo' },
      { query: 'Contrato de comodato y préstamo de uso gratuito de mobiliario', expected: 'contrato_comodato' },
      { query: 'Contrato de mandato civil para gestión de trámites', expected: 'contrato_mandato' },
      { query: 'Contrato de comisión mercantil con porcentaje de ventas', expected: 'contrato_comision' },
      { query: 'Contrato de distribución comercial con territorio exclusivo', expected: 'contrato_distribucion' },
      { query: 'Contrato de suministro de insumos periódicos', expected: 'contrato_suministro' },
      { query: 'Contrato de confidencialidad y no divulgación de información reservada', expected: 'contrato_confidencialidad' },
      { query: 'Contrato de licencia de software y derechos de explotación tecnológica', expected: 'contrato_licencia' },
      { query: 'Convenio transaccional para poner fin a controversia', expected: 'convenio_transaccional' },
      { query: 'Convenio de reconocimiento de adeudo y calendario de pago en parcialidades', expected: 'convenio_reconocimiento_adeudo' },
      { query: 'Convenio de terminación anticipada de contrato con finiquito mutuo', expected: 'convenio_terminacion' },
      { query: 'Convenio modificatorio addendum de contrato para prorrogar vigencia', expected: 'convenio_modificatorio' },
      { query: 'Memorando de entendimiento comercial para alianza estratégica', expected: 'memorando_entendimiento' },
      // Propiedad Intelectual
      { query: 'Contrato de licencia de uso de marca registrada', expected: 'contrato_licencia_marca' },
      { query: 'Contrato de cesión de derechos de marca ante el IMPI', expected: 'cesion_derechos_marca' },
      { query: 'Contrato de licencia de derechos de autor y obra literaria', expected: 'licencia_derechos_autor' },
      { query: 'Contrato de cesión de derechos patrimoniales de autor INDAUTOR', expected: 'cesion_derechos_autor' },
      { query: 'Declaración administrativa de infracción ante IMPI por uso indebido de marca', expected: 'infraccion_propiedad_industrial' },
      { query: 'Recurso de revisión en sede administrativa contra resolución del IMPI', expected: 'recurso_propiedad_intelectual' },
      { query: 'Solicitud formal de registro de marca ante el IMPI clase 35', expected: 'solicitud_registro_marca' },
      { query: 'Contestación de impedimento legal u oficio de requisitos del IMPI', expected: 'contestacion_impedimento' },
      { query: 'Escrito de oposición a solicitud de registro de marca publicada en la Gaceta', expected: 'oposicion_marca' },
      { query: 'Demanda de declaración administrativa de nulidad de registro marcario', expected: 'nulidad_registro' },
      { query: 'Solicitud de declaración administrativa de caducidad de marca por falta de uso', expected: 'caducidad_registro' },
    ];

    it.each(classifierCases)('Classifies "$query" as $expected', ({ query, expected }) => {
      const result = classifyIntent(query);
      expect(result.documentType).toBe(expected);
    });
  });

  describe('5. CaseContext Extraction', () => {
    it('Extracts CorporativoContext correctly from text and analysis', () => {
      const sources: UploadedSourceDocument[] = [
        {
          id: 'src-corp-1',
          name: 'estatutos.txt',
          type: 'txt',
          content: 'Asamblea general de la empresa denominada Innovaciones Tecnológicas del Norte S.A. de C.V., con capital social suscrito de $1,000,000.00 pesos. Objeto social: desarrollo y comercialización de software.',
          uploadedAt: new Date().toISOString(),
        },
      ];
      const analysis: CaseAnalysis = {
        parties: {
          actor: 'Innovaciones Tecnológicas del Norte S.A. de C.V.',
          demandado: 'Socio Minoritario',
        },
        facts: [
          { id: '1', number: '1', text: 'Se convocó a asamblea general de accionistas en el domicilio social.' },
        ],
        claims: ['Aprobación de estados financieros y ratificación de consejeros'],
      } as any;

      const ctx = buildCaseContext(sources, analysis, undefined, undefined, undefined, 'acta_asamblea_ordinaria');
      expect(ctx.corporativo).toBeDefined();
      expect(ctx.corporativo?.documentType).toBe('acta_asamblea_ordinaria');
      expect(ctx.corporativo?.sociedad.value).toMatch(/Innovaciones Tecnológicas del Norte/i);
      expect(ctx.corporativo?.capitalSocial?.value).toMatch(/1,000,000/);
      expect(ctx.corporativo?.objetoSocial?.value).toMatch(/desarrollo y comercialización de software/i);
      expect(ctx.corporativo?.acuerdosAsamblea.length).toBeGreaterThan(0);
    });

    it('Extracts ContractualContext correctly from text and analysis', () => {
      const sources: UploadedSourceDocument[] = [
        {
          id: 'src-contract-1',
          name: 'acuerdo_base.txt',
          type: 'txt',
          content: 'Contrato celebrado entre Proveedora Global como prestador y Servicios Integrales como cliente. Contraprestación pactada por la cantidad de $120,000.00 pesos m.n. Vigencia del contrato: 24 meses. Pena convencional de $20,000.00 pesos en caso de mora.',
          uploadedAt: new Date().toISOString(),
        } as any,
      ];
      const analysis: CaseAnalysis = {
        parties: {
          actor: 'Proveedora Global S.A.',
          demandado: 'Servicios Integrales S.A.',
        },
        facts: [
          { id: '1', number: '1', text: 'Se prestan servicios de consultoría estratégica y desarrollo.' },
        ],
        claims: ['Cumplimiento de las entregas y pago oportuno de honorarios'],
      } as any;

      const ctx = buildCaseContext(sources, analysis, undefined, undefined, undefined, 'contrato_prestacion_servicios');
      expect(ctx.contractual).toBeDefined();
      expect(ctx.contractual?.documentType).toBe('contrato_prestacion_servicios');
      expect(ctx.contractual?.parteA.value).toBe('Proveedora Global S.A.');
      expect(ctx.contractual?.parteB.value).toBe('Servicios Integrales S.A.');
      expect(ctx.contractual?.contraprestacionOPrecio?.value).toMatch(/120,000/);
      expect(ctx.contractual?.vigenciaOPlazo?.value).toMatch(/24 meses/);
      expect(ctx.contractual?.penaConvencional?.value).toMatch(/20,000/);
    });

    it('Extracts PropiedadIntelectualContext correctly from text and analysis', () => {
      const sources: UploadedSourceDocument[] = [
        {
          id: 'src-pi-1',
          name: 'oficio_impi.txt',
          type: 'txt',
          content: 'Expediente ante el IMPI número 2345678, relativo a la solicitud de registro de la marca denominada QUANTUM LEGAL en la Clase 42 de la Clasificación Internacional.',
          uploadedAt: new Date().toISOString(),
        } as any,
      ];
      const analysis: CaseAnalysis = {
        parties: {
          actor: 'Quantum Technologies S.A.P.I. de C.V.',
          autoridadResponsable: 'Instituto Mexicano de la Propiedad Industrial',
        },
        facts: [
          { id: '1', number: '1', text: 'Se presentó solicitud de registro marcario para proteger software legal.' },
        ],
        arguments: [
          'El signo cuenta con plena distintividad y no incurre en las causales de impedimento del artículo 173 de la LFPPI.',
        ],
      } as any;

      const ctx = buildCaseContext(sources, analysis, undefined, undefined, undefined, 'contestacion_impedimento');
      expect(ctx.propiedadIntelectual).toBeDefined();
      expect(ctx.propiedadIntelectual?.documentType).toBe('contestacion_impedimento');
      expect(ctx.propiedadIntelectual?.titularOSolicitante.value).toBe('Quantum Technologies S.A.P.I. de C.V.');
      expect(ctx.propiedadIntelectual?.signoDistintivoUObra?.value).toMatch(/QUANTUM LEGAL/i);
      expect(ctx.propiedadIntelectual?.numeroRegistroOExpediente?.value).toMatch(/2345678/);
      expect(ctx.propiedadIntelectual?.claseNiza?.value).toBe('42');
      expect(ctx.propiedadIntelectual?.fundamentosOPreceptos.length).toBeGreaterThan(0);
    });
  });

  describe('6. Pipeline Execution Without AI (Zero Mock Text)', () => {
    const representativeTypes = [
      'constitucion_sociedad',
      'acta_asamblea_ordinaria',
      'poderes',
      'contrato_compraventa',
      'contrato_prestacion_servicios',
      'convenio_reconocimiento_adeudo',
      'contrato_licencia_marca',
      'infraccion_propiedad_industrial',
      'solicitud_registro_marca',
    ];

    it.each(representativeTypes)('Pipeline executes cleanly for %s with zero mock text', async (docType) => {
      const sourceDoc = createSourceDocument({
        id: `source-${docType}`,
        filename: `${docType}_antecedente.txt`,
        content: `Documento base para ${docType}. Empresa: Alpha Beta S.A. de C.V. Parte contraparte: Gamma Delta S.A. Monto pactado: $50,000 pesos. Registro: 123456. Se ratifican todos los acuerdos convenidos.`,
        sourceValidated: true,
      });

      const res = await runGenerationPipeline({
        selectedDocumentType: docType,
        sourceDocuments: [sourceDoc],
      });

      expect(res).toBeDefined();
      const doc = res as UniversalLegalDocument;
      expect(doc.documentType).toBe(docType);
      expect(doc.sections.length).toBeGreaterThanOrEqual(4);

      // Verify each section has content and zero mock placeholders
      const allText = doc.sections.flatMap((s) => s.content.map((c) => c.text)).join('\n');
      expect(allText.length).toBeGreaterThan(100);

      expect(allText).not.toMatch(/\[Desarrollar por la IA/i);
      expect(allText).not.toMatch(/\[Completar por la IA/i);
      expect(allText).not.toMatch(/LOREM IPSUM/i);

      // Verify text export
      const textOutput = exportToText(doc as any);
      expect(textOutput.length).toBeGreaterThan(100);
    });
  });

  describe('7. Source Compatibility Matrix and Negative Validation', () => {
    it('Rejects incompatible source document type for constitucion_sociedad', () => {
      const incompatibleSource = createSourceDocument({
        id: 'src-incomp-corp',
        filename: 'demanda_laboral.txt',
        classification: { sourceDocumentType: 'DEMANDA_LABORAL' as any, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
        content: 'Demanda laboral individual por despido.',
        sourceValidated: true,
      } as any);

      expect(() =>
        evaluateSourceOutputCompatibility({
          selectedDocumentType: 'constitucion_sociedad',
          sourceDocuments: [incompatibleSource],
        }),
      ).toThrow(/SOURCE_DOCUMENT_INCOMPATIBLE/);
    });

    it('Rejects incompatible source document type for contrato_compraventa', () => {
      const incompatibleSource = createSourceDocument({
        id: 'src-incomp-contract',
        filename: 'demanda_laboral.txt',
        classification: { sourceDocumentType: 'DEMANDA_LABORAL' as any, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
        content: 'Demanda laboral por despido.',
        sourceValidated: true,
      } as any);

      expect(() =>
        evaluateSourceOutputCompatibility({
          selectedDocumentType: 'contrato_compraventa',
          sourceDocuments: [incompatibleSource],
        }),
      ).toThrow(/SOURCE_DOCUMENT_INCOMPATIBLE/);
    });

    it('Rejects incompatible source document type for infraccion_propiedad_industrial', () => {
      const incompatibleSource = createSourceDocument({
        id: 'src-incomp-pi',
        filename: 'demanda_laboral.txt',
        classification: { sourceDocumentType: 'DEMANDA_LABORAL' as any, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
        content: 'Demanda laboral por despido.',
        sourceValidated: true,
      } as any);

      expect(() =>
        evaluateSourceOutputCompatibility({
          selectedDocumentType: 'infraccion_propiedad_industrial',
          sourceDocuments: [incompatibleSource],
        }),
      ).toThrow(/SOURCE_DOCUMENT_INCOMPATIBLE/);
    });
  });
});
