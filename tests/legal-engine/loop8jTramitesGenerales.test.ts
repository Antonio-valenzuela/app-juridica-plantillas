import { describe, it, expect } from 'vitest';
import { DOCUMENT_STRATEGIES, getDocumentStrategy } from '@/lib/legal-engine/documentStrategies';
import { DocumentTemplates, getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import { getRequiredSectionIds } from '@/lib/legal-engine/exportGuards';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import { classifyIntent } from '@/lib/legal-engine/classifier';
import {
  buildCaseContext,
  TRAMITE_GENERAL_DOCUMENT_TYPES,
  isTramiteGeneralDocumentType,
} from '@/lib/legal-engine/caseContext';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { UniversalLegalDocument, UploadedSourceDocument } from '@/lib/legal-engine/types';
import { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { exportToText } from '@/lib/templates/exportText';
import { evaluateSourceOutputCompatibility } from '@/lib/legal-engine/sourceOutputCompatibility';

const TRAMITE_GENERAL_TYPES = [
  'promocion_simple',
  'desahogo_prevencion',
  'cumplimiento_requerimiento',
  'cumplimiento_prevencion',
  'manifestaciones',
  'comparecencia',
  'ratificacion',
  'solicitud_copias',
  'solicitud_copias_certificadas',
  'solicitud_acceso_expediente',
  'solicitud_certificacion',
  'autorizacion_abogados',
  'revocacion_autorizados',
  'cambio_domicilio_procesal',
  'senalamiento_correo',
  'impulso_procesal',
  'solicitud_acumulacion',
  'solicitud_archivo',
  'solicitud_desarchivo',
  'desistimiento',
  'allanamiento',
  'convenio_judicial',
  'aclaracion',
  'correccion_error',
  'solicitud_devolucion_documentos',
] as const;

describe('LOOP 8J — Trámites Generales de Juzgado (25 Tipos)', () => {
  describe('1. Strategy & Template Completeness (25 Document Types)', () => {
    it.each(TRAMITE_GENERAL_TYPES)('Strategy exists and is registered for %s', (docType) => {
      const strategy = getDocumentStrategy(docType);
      expect(strategy).toBeDefined();
      expect(strategy?.documentType).toBe(docType);
      expect(strategy?.requiredSectionIds.length).toBeGreaterThanOrEqual(4);
    });

    it.each(TRAMITE_GENERAL_TYPES)('Strategy has matter GENERAL for %s', (docType) => {
      const strategy = getDocumentStrategy(docType);
      expect(strategy?.matter).toBe('GENERAL');
    });

    it.each(TRAMITE_GENERAL_TYPES)('Template exists and has non-empty estructura for %s', (docType) => {
      const template = getDocumentTemplate(docType);
      expect(template).toBeDefined();
      expect(template.tipo).toBe(docType);
      expect(template.estructura.length).toBeGreaterThanOrEqual(5);
      expect(template.esqueletoDedicado).toBe(true);
    });

    it.each(TRAMITE_GENERAL_TYPES)('Canonical sections match exactly between strategy and template for %s', (docType) => {
      const strategy = getDocumentStrategy(docType);
      const exportGuardsSections = getRequiredSectionIds(docType);
      expect([...(strategy?.requiredSectionIds || [])]).toEqual([...exportGuardsSections]);
    });
  });

  describe('2. Catalog Status and Classification', () => {
    it('All 25 types are present in catalog with status IMPLEMENTED and kind DOCUMENT_TYPE', () => {
      for (const id of TRAMITE_GENERAL_TYPES) {
        const item = getCatalogDocument(id);
        expect(item, `Catalog item ${id} should exist`).toBeDefined();
        expect(item?.kind).toBe('DOCUMENT_TYPE');
        expect(item?.status).toBe('IMPLEMENTED');
        expect((item as any)?.implemented).toBe(true);
        expect((item as any)?.sourceCompatibility).not.toBeNull();
        expect((item as any)?.sourceCompatibility?.sourceRequired).toBe(false);
      }
    });

    it('Type guard isTramiteGeneralDocumentType classifies all 25 types correctly', () => {
      for (const id of TRAMITE_GENERAL_TYPES) {
        expect(isTramiteGeneralDocumentType(id)).toBe(true);
      }
      expect(isTramiteGeneralDocumentType('demanda_laboral')).toBe(false);
      expect(isTramiteGeneralDocumentType('amparo_indirecto')).toBe(false);
      expect(isTramiteGeneralDocumentType('contrato_compraventa')).toBe(false);
    });
  });

  describe('3. Routing Resolution (resolveDocumentRouting)', () => {
    it.each(TRAMITE_GENERAL_TYPES)('Resolves route successfully for %s', (docType) => {
      const routing = resolveDocumentRouting({ selectedDocumentType: docType });
      expect(routing.resolvedTemplate).toBe(docType);
      expect(routing.resolvedStrategy).toBe(docType);
      expect(routing.template.tipo).toBe(docType);
    });
  });

  describe('4. Classifier Intent Recognition', () => {
    const classifierCases: Array<{ query: string; expected: string }> = [
      { query: 'Presentar promoción simple de trámite judicial ante el juzgado', expected: 'promocion_simple' },
      { query: 'Escrito de desahogo de prevención a la demanda inicial', expected: 'desahogo_prevencion' },
      { query: 'Escrito de cumplimiento a requerimiento judicial notificado', expected: 'cumplimiento_requerimiento' },
      { query: 'Cumplimiento y subsanación de prevención del juzgado', expected: 'cumplimiento_prevencion' },
      { query: 'Escrito de manifestaciones en desahogo de vista con el informe', expected: 'manifestaciones' },
      { query: 'Escrito de comparecencia y apersonamiento al juicio', expected: 'comparecencia' },
      { query: 'Escrito de ratificación judicial de contenido y firma', expected: 'ratificacion' },
      { query: 'Solicitud de copias simples del expediente judicial', expected: 'solicitud_copias' },
      { query: 'Solicitud de copias certificadas de todo lo actuado', expected: 'solicitud_copias_certificadas' },
      { query: 'Solicitud de acceso y consulta electrónica del expediente virtual', expected: 'solicitud_acceso_expediente' },
      { query: 'Solicitud de certificación de términos secretarial o ejecutoria', expected: 'solicitud_certificacion' },
      { query: 'Autorización y designación de abogados patronos con cédula profesional', expected: 'autorizacion_abogados' },
      { query: 'Revocación de abogados y autorizados nombrados con anterioridad', expected: 'revocacion_autorizados' },
      { query: 'Cambio de domicilio procesal para oír y recibir notificaciones', expected: 'cambio_domicilio_procesal' },
      { query: 'Señalamiento de correo electrónico y buzón judicial para notificaciones', expected: 'senalamiento_correo' },
      { query: 'Solicitud de impulso procesal para abrir la siguiente etapa', expected: 'impulso_procesal' },
      { query: 'Solicitud de acumulación de juicios por conexidad de causas', expected: 'solicitud_acumulacion' },
      { query: 'Solicitud de archivo definitivo del expediente por asunto totalmente concluido', expected: 'solicitud_archivo' },
      { query: 'Solicitud de desarchivo del expediente remitido al archivo judicial', expected: 'solicitud_desarchivo' },
      { query: 'Escrito de desistimiento de la demanda y de la instancia procesal', expected: 'desistimiento' },
      { query: 'Escrito de allanamiento incondicional a la demanda', expected: 'allanamiento' },
      { query: 'Presentación de convenio judicial de transacción para elevar a cosa juzgada', expected: 'convenio_judicial' },
      { query: 'Solicitud de aclaración de auto o proveído contradictorio', expected: 'aclaracion' },
      { query: 'Corrección de error material mecanográfico en el auto judicial', expected: 'correccion_error' },
      { query: 'Solicitud de devolución de documentos originales dejando copia certificada', expected: 'solicitud_devolucion_documentos' },
    ];

    it.each(classifierCases)('Classifies "$query" as $expected', ({ query, expected }) => {
      const result = classifyIntent(query);
      expect(result.documentType).toBe(expected);
    });
  });

  describe('5. CaseContext Extraction & Resolution', () => {
    it('Extracts TramiteGeneralContext correctly from analysis and text', () => {
      const sources: UploadedSourceDocument[] = [
        {
          id: 'src-tramite-1',
          name: 'acuerdo_prevencion.txt',
          type: 'txt',
          content: 'Juzgado Décimo Quinto de Distrito en Materia Civil. Expediente número 894/2024. Promovente Roberto Gómez Bolaños. Se requiere al promovente para que en el término de tres días exhiba copias de traslado del escrito inicial.',
          uploadedAt: new Date().toISOString(),
        } as any,
      ];
      const analysis: CaseAnalysis = {
        parties: {
          actor: 'Roberto Gómez Bolaños',
          autoridadResponsable: 'Juzgado Décimo Quinto de Distrito en Materia Civil',
        },
        caseNumbers: {
          principal: '894/2024',
        },
        facts: [
          { id: '1', number: '1', text: 'Se notificó proveído requiriendo exhibición de copias de traslado.' },
        ],
        claims: ['Tener por desahogado el requerimiento judicial'],
      } as any;

      const ctx = buildCaseContext(sources, analysis, undefined, undefined, undefined, 'desahogo_prevencion');
      expect(ctx.tramiteGeneral).toBeDefined();
      expect(ctx.tramiteGeneral?.documentType).toBe('desahogo_prevencion');
      expect(ctx.tramiteGeneral?.promovente.value).toBe('Roberto Gómez Bolaños');
      expect(ctx.tramiteGeneral?.numeroExpediente?.value).toBe('894/2024');
      expect(ctx.tramiteGeneral?.juzgadoOTribunal?.value).toMatch(/Juzgado Décimo Quinto/i);
      expect(ctx.tramiteGeneral?.peticionOObjeto?.value).toBeDefined();
    });
  });

  describe('6. Pipeline Execution Without AI (Zero Mock Text)', () => {
    it.each(TRAMITE_GENERAL_TYPES)('Pipeline executes cleanly for %s with zero mock text', async (docType) => {
      const sourceDoc = createSourceDocument({
        id: `source-${docType}`,
        filename: `${docType}_auto.txt`,
        content: `Juzgado Quinto de lo Civil. Expediente 456/2023. Actor: Juan Pérez Martínez. Demandado: Pedro López Hernández. Se promueve ${docType} para los efectos legales conducentes.`,
        sourceValidated: true,
      });

      const res = await runGenerationPipeline({
        selectedDocumentType: docType,
        sourceDocuments: [sourceDoc],
      });

      expect(res).toBeDefined();
      const doc = res as UniversalLegalDocument;
      expect(doc.documentType).toBe(docType);
      expect(doc.sections.length).toBeGreaterThanOrEqual(5);

      const allText = doc.sections.flatMap((s) => s.content.map((c) => c.text)).join('\n');
      expect(allText.length).toBeGreaterThan(100);

      expect(allText).not.toMatch(/\[Desarrollar por la IA/i);
      expect(allText).not.toMatch(/\[Completar por la IA/i);
      expect(allText).not.toMatch(/LOREM IPSUM/i);

      const textOutput = exportToText(doc as any);
      expect(textOutput.length).toBeGreaterThan(100);
    });
  });

  describe('7. Source Compatibility Evaluation', () => {
    it('Allows generation without sources since court motions are sourceRequired: false', () => {
      for (const id of TRAMITE_GENERAL_TYPES) {
        const comp = evaluateSourceOutputCompatibility({
          selectedDocumentType: id,
          sourceDocuments: [],
        });
        expect(comp.status).toBe('COMPATIBLE');
        expect(comp.sourceRequired).toBe(false);
      }
    });
  });
});
