import { describe, it, expect } from 'vitest';
import { DOCUMENT_STRATEGIES, getDocumentStrategy } from '@/lib/legal-engine/documentStrategies';
import { DocumentTemplates, getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import { getRequiredSectionIds } from '@/lib/legal-engine/exportGuards';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import { classifyIntent } from '@/lib/legal-engine/classifier';
import {
  buildCaseContext,
  AGRARIO_DOCUMENT_TYPES,
  INMOBILIARIO_DOCUMENT_TYPES,
  isAgrarioDocumentType,
  isInmobiliarioDocumentType,
} from '@/lib/legal-engine/caseContext';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { UniversalLegalDocument, UploadedSourceDocument } from '@/lib/legal-engine/types';
import { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { exportToText } from '@/lib/templates/exportText';
import { evaluateSourceOutputCompatibility } from '@/lib/legal-engine/sourceOutputCompatibility';

const AGRARIO_TYPES = [
  'demanda_agraria',
  'contestacion_demanda_agraria',
  'reconvencion_agraria',
  'alegatos_agrarios',
  'cumplimiento_sentencia_agraria',
  'recurso_agrario',
] as const;

const INMOBILIARIO_TYPES = [
  'promesa_compraventa_inmueble',
  'compraventa_inmueble',
  'arrendamiento_inmueble',
  'terminacion_arrendamiento',
  'requerimiento_pago_rentas',
  'aviso_terminacion',
  'convenio_desocupacion',
  'reconocimiento_adeudo_arrendamiento',
  'demanda_desocupacion',
] as const;

const ALL_LOOP8H_TYPES = [...AGRARIO_TYPES, ...INMOBILIARIO_TYPES];

describe('LOOP 8H — Materia Agraria e Inmobiliaria (15 Document Types)', () => {
  describe('1. Strategy & Template Completeness (15 Document Types)', () => {
    it.each(ALL_LOOP8H_TYPES)('Strategy exists and is registered for %s', (docType) => {
      const strategy = getDocumentStrategy(docType);
      expect(strategy).toBeDefined();
      expect(strategy!.documentType).toBe(docType);
      expect(strategy!.requiredSectionIds.length).toBeGreaterThanOrEqual(4);
    });

    it.each(AGRARIO_TYPES)('Agrario strategy has matter AGRARIO for %s', (docType) => {
      const strategy = getDocumentStrategy(docType);
      expect(strategy!.matter).toBe('AGRARIO');
    });

    it.each(INMOBILIARIO_TYPES)('Inmobiliario strategy has matter INMOBILIARIO for %s', (docType) => {
      const strategy = getDocumentStrategy(docType);
      expect(strategy!.matter).toBe('INMOBILIARIO');
    });

    it.each(ALL_LOOP8H_TYPES)('Template exists and has non-empty estructura for %s', (docType) => {
      const template = getDocumentTemplate(docType);
      expect(template).toBeDefined();
      expect(template.tipo).toBe(docType);
      expect(template.estructura.length).toBeGreaterThanOrEqual(4);
      expect(template.esqueletoDedicado).toBe(true);
    });

    it.each(ALL_LOOP8H_TYPES)('Canonical sections match exactly between strategy and template for %s', (docType) => {
      const strategy = getDocumentStrategy(docType);
      const exportGuardsSections = getRequiredSectionIds(docType);
      expect([...strategy!.requiredSectionIds]).toEqual([...exportGuardsSections]);
    });
  });

  describe('2. Catalog Status and Classification', () => {
    it('All 15 types are present in catalog with status IMPLEMENTED and kind DOCUMENT_TYPE', () => {
      for (const id of ALL_LOOP8H_TYPES) {
        const item = getCatalogDocument(id);
        expect(item, `Catalog item ${id} should exist`).toBeDefined();
        expect(item?.kind).toBe('DOCUMENT_TYPE');
        expect(item?.status).toBe('IMPLEMENTED');
        expect((item as any)?.implemented).toBe(true);
        expect((item as any)?.sourceCompatibility).not.toBeNull();
      }
    });

    it('Type guard functions classify all 15 types correctly', () => {
      for (const id of AGRARIO_TYPES) {
        expect(isAgrarioDocumentType(id)).toBe(true);
        expect(isInmobiliarioDocumentType(id)).toBe(false);
      }
      for (const id of INMOBILIARIO_TYPES) {
        expect(isInmobiliarioDocumentType(id)).toBe(true);
        expect(isAgrarioDocumentType(id)).toBe(false);
      }
    });
  });

  describe('3. Routing Resolution (resolveDocumentRouting)', () => {
    it.each(ALL_LOOP8H_TYPES)('Resolves route successfully for %s', (docType) => {
      const routing = resolveDocumentRouting({ selectedDocumentType: docType });
      expect(routing.resolvedTemplate).toBe(docType);
      expect(routing.resolvedStrategy).toBe(docType);
      expect(routing.template.tipo).toBe(docType);
    });
  });

  describe('4. Classifier Intent Recognition', () => {
    const classifierCases: Array<{ query: string; expected: string }> = [
      { query: 'Quiero presentar una demanda agraria por despojo de parcela ejidal', expected: 'demanda_agraria' },
      { query: 'Contestar la demanda agraria interpuesta por el ejidatario ante el Tribunal Unitario Agrario', expected: 'contestacion_demanda_agraria' },
      { query: 'Formular reconvencion agraria reclamando mejor derecho de posesion comunal', expected: 'reconvencion_agraria' },
      { query: 'Escrito de alegatos agrarios para el cierre de instruccion en el juicio agrario', expected: 'alegatos_agrarios' },
      { query: 'Solicitar el cumplimiento forzoso de la sentencia agraria ejecutoriada', expected: 'cumplimiento_sentencia_agraria' },
      { query: 'Interponer recurso de revision agraria contra la sentencia del tribunal unitario', expected: 'recurso_agrario' },
      { query: 'Redactar un contrato de promesa de compraventa de bien inmueble casa habitacion', expected: 'promesa_compraventa_inmueble' },
      { query: 'Contrato definitivo de compraventa de inmueble departamento en condominio', expected: 'compraventa_inmueble' },
      { query: 'Contrato de arrendamiento de inmueble local comercial con fiador', expected: 'arrendamiento_inmueble' },
      { query: 'Convenio de terminacion de arrendamiento y entrega de posesion', expected: 'terminacion_arrendamiento' },
      { query: 'Requerimiento de pago de rentas vencidas e intereses moratorios al arrendatario', expected: 'requerimiento_pago_rentas' },
      { query: 'Aviso formal de terminacion de arrendamiento por conclusion de plazo', expected: 'aviso_terminacion' },
      { query: 'Convenio de desocupacion y entrega de inmueble finiquito de arrendamiento', expected: 'convenio_desocupacion' },
      { query: 'Reconocimiento de adeudo de rentas atrasadas con plan de pagos', expected: 'reconocimiento_adeudo_arrendamiento' },
      { query: 'Demanda de desocupacion y rescision de arrendamiento por falta de pago de rentas', expected: 'demanda_desocupacion' },
    ];

    it.each(classifierCases)('Classifies "$query" as $expected', ({ query, expected }) => {
      const result = classifyIntent(query);
      expect(result.documentType).toBe(expected);
    });
  });

  describe('5. CaseContext Extraction', () => {
    it('Extracts AgrarioContext correctly from facts and text', () => {
      const sources: UploadedSourceDocument[] = [
        {
          id: 'src-agrario-1',
          name: 'titulo_parcelario.txt',
          type: 'txt',
          content: 'Conflicto de linderos en el ejido denominado Zapata Hermanos, respecto de la parcela número 45-Z-1, tramitado como juicio agrario número 123/2024 ante el Tribunal Unitario Agrario Distrito 18.',
          uploadedAt: new Date().toISOString(),
        },
      ];
      const analysis: CaseAnalysis = {
        parties: {
          actor: 'Emiliano Zapata Salazar',
          demandado: 'Comisariado Ejidal',
        },
        caseNumbers: { principal: '123/2024' },
        facts: [
          { id: '1', number: '1', text: 'Soy titular de la parcela 45-Z-1 en el ejido Zapata Hermanos.' },
        ],
        claims: ['Reconocimiento y restitución de derechos parcelarios'],
      } as any;

      const ctx = buildCaseContext(sources, analysis, undefined, undefined, undefined, 'demanda_agraria');
      expect(ctx.agrario).toBeDefined();
      expect(ctx.agrario?.documentType).toBe('demanda_agraria');
      expect(ctx.agrario?.actorAgrario.value).toBe('Emiliano Zapata Salazar');
      expect(ctx.agrario?.demandadoAgrario.value).toBe('Comisariado Ejidal');
      expect(ctx.agrario?.ejidoOComunidad?.value).toMatch(/Zapata Hermanos/i);
      expect(ctx.agrario?.parcelaOTierras?.value).toMatch(/45-Z-1/);
      expect(ctx.agrario?.expedienteAgrario?.value).toBe('123/2024');
    });

    it('Extracts InmobiliarioContext correctly from facts and text', () => {
      const sources: UploadedSourceDocument[] = [
        {
          id: 'src-inmob-1',
          name: 'contrato_arrendamiento.txt',
          type: 'txt',
          content: 'Contrato de arrendamiento sobre el inmueble ubicado en Insurgentes Sur 1602, Crédito Constructor, Benito Juárez, con folio real número 987654. Renta por la cantidad de $25,000.00 pesos mensuales. Saldo insoluto por la cantidad de $75,000.00 pesos de rentas vencidas. Vigencia del contrato: 12 meses.',
          uploadedAt: new Date().toISOString(),
        } as any,
      ];
      const analysis: CaseAnalysis = {
        parties: {
          actor: 'Inmobiliaria del Valle S.A. de C.V.',
          demandado: 'Juan Pérez Inquilino',
        },
        caseNumbers: { principal: '890/2024' },
        facts: [
          { id: '1', number: '1', text: 'Se celebró arrendamiento del inmueble en Insurgentes Sur 1602.' },
        ],
        claims: ['Desocupación y entrega inmediata del bien arrendado'],
      } as any;

      const ctx = buildCaseContext(sources, analysis, undefined, undefined, undefined, 'demanda_desocupacion');
      expect(ctx.inmobiliario).toBeDefined();
      expect(ctx.inmobiliario?.documentType).toBe('demanda_desocupacion');
      expect(ctx.inmobiliario?.arrendadorOVendedor.value).toBe('Inmobiliaria del Valle S.A. de C.V.');
      expect(ctx.inmobiliario?.arrendatarioOComprador.value).toBe('Juan Pérez Inquilino');
      expect(ctx.inmobiliario?.inmuebleUbicacion?.value).toMatch(/Insurgentes Sur 1602/i);
      expect(ctx.inmobiliario?.folioReal?.value).toBe('987654');
      expect(ctx.inmobiliario?.rentaOPrecio?.value).toMatch(/25,000/);
      expect(ctx.inmobiliario?.adeudoRentas?.value).toMatch(/75,000/);
      expect(ctx.inmobiliario?.vigencia?.value).toMatch(/12 meses/);
    });
  });

  describe('6. Pipeline Execution Without AI (Zero Mock Text)', () => {
    const representativeTypes = [
      'demanda_agraria',
      'contestacion_demanda_agraria',
      'recurso_agrario',
      'arrendamiento_inmueble',
      'requerimiento_pago_rentas',
      'demanda_desocupacion',
    ];

    it.each(representativeTypes)('Pipeline executes cleanly for %s with zero mock text', async (docType) => {
      const isAgr = isAgrarioDocumentType(docType);

      const sourceDoc = createSourceDocument({
        id: `source-${docType}`,
        filename: `${docType}_antecedente.txt`,
        content: isAgr
          ? `Expediente agrario 101/2024. Tribunal Unitario Agrario. Actor: Ejidatario Agrario. Demandado: Comisariado Ejidal. Parcela 12 en ejido San Isidro. Se reclama posesión.`
          : `Inmueble ubicado en Av. Reforma 500, CDMX. Arrendador: Propietario Inmueble. Arrendatario: Inquilino Deudor. Renta $15,000 pesos. Adeudo $45,000 pesos por rentas no pagadas.`,
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
    it('Rejects incompatible source document type for demanda_agraria', () => {
      const incompatibleSource = createSourceDocument({
        id: 'src-incomp-agr',
        filename: 'pagare.txt',
        classification: { sourceDocumentType: 'PAGARE' as any, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
        content: 'Pagaré mercantil por $100,000 pesos.',
        sourceValidated: true,
      } as any);

      expect(() =>
        evaluateSourceOutputCompatibility({
          selectedDocumentType: 'demanda_agraria',
          sourceDocuments: [incompatibleSource],
        }),
      ).toThrow(/SOURCE_DOCUMENT_INCOMPATIBLE/);
    });

    it('Rejects incompatible source document type for demanda_desocupacion', () => {
      const incompatibleSource = createSourceDocument({
        id: 'src-incomp-inmob',
        filename: 'demanda_laboral.txt',
        classification: { sourceDocumentType: 'DEMANDA_LABORAL' as any, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
        content: 'Demanda laboral por despido injustificado.',
        sourceValidated: true,
      } as any);

      expect(() =>
        evaluateSourceOutputCompatibility({
          selectedDocumentType: 'demanda_desocupacion',
          sourceDocuments: [incompatibleSource],
        }),
      ).toThrow(/SOURCE_DOCUMENT_INCOMPATIBLE/);
    });
  });
});
