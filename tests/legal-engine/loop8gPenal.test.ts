import { describe, it, expect } from 'vitest';
import { DOCUMENT_STRATEGIES, getDocumentStrategy } from '@/lib/legal-engine/documentStrategies';
import { DocumentTemplates, getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import { getRequiredSectionIds } from '@/lib/legal-engine/exportGuards';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import { classifyIntent } from '@/lib/legal-engine/classifier';
import {
  buildCaseContext,
  PENAL_DOCUMENT_TYPES,
  isPenalDocumentType,
} from '@/lib/legal-engine/caseContext';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { UniversalLegalDocument, UploadedSourceDocument } from '@/lib/legal-engine/types';
import { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { generatePrintHtml } from '@/lib/templates/exportPdf';
import { exportToText } from '@/lib/templates/exportText';
import { evaluateSourceOutputCompatibility } from '@/lib/legal-engine/sourceOutputCompatibility';

const ALL_PENAL_LEAF_TYPES = [
  'denuncia',
  'querella',
  'ampliacion_denuncia',
  'ampliacion_querella',
  'escrito_asesor_juridico',
  'escrito_defensa',
  'solicitud_actos_investigacion',
  'solicitud_acceso_carpeta',
  'solicitud_copias_carpeta',
  'solicitud_medida_proteccion',
  'escrito_coadyuvancia',
  'apelacion_penal',
  'revocacion_penal',
  'escrito_ejecucion_penal',
];

describe('LOOP 8G — Materia Penal Integral (CNPP y LNEP)', () => {
  describe('1. Strategy & Template Completeness (14 Document Types)', () => {
    it.each(ALL_PENAL_LEAF_TYPES)('Strategy exists and is registered for %s', (docType) => {
      const strategy = getDocumentStrategy(docType);
      expect(strategy).toBeDefined();
      expect(strategy!.documentType).toBe(docType);
      expect(strategy!.requiredSectionIds.length).toBeGreaterThanOrEqual(4);
    });

    it.each(ALL_PENAL_LEAF_TYPES)('Template exists and has non-empty estructura for %s', (docType) => {
      const template = getDocumentTemplate(docType);
      expect(template).toBeDefined();
      expect(template.tipo).toBe(docType);
      expect(template.estructura.length).toBeGreaterThanOrEqual(4);
      expect(template.esqueletoDedicado).toBe(true);
      expect(template.materia).toBe('PENAL');
    });

    it.each(ALL_PENAL_LEAF_TYPES)('Canonical sections match exactly between strategy and template for %s', (docType) => {
      const strategy = getDocumentStrategy(docType);
      const exportGuardsSections = getRequiredSectionIds(docType);
      expect([...strategy!.requiredSectionIds]).toEqual([...exportGuardsSections]);
    });
  });

  describe('2. Catalog Status and Classification', () => {
    it('All 14 leaf types are present in catalog with status IMPLEMENTED and kind DOCUMENT_TYPE', () => {
      for (const id of ALL_PENAL_LEAF_TYPES) {
        const item = getCatalogDocument(id);
        expect(item, `Catalog item ${id} should exist`).toBeDefined();
        expect(item?.kind).toBe('DOCUMENT_TYPE');
        expect(item?.status).toBe('IMPLEMENTED');
        expect((item as any)?.implemented).toBe(true);
        expect((item as any)?.sourceCompatibility).not.toBeNull();
      }
    });

    it('Amparo contextual containers in penal are kind FAMILY and status NOT_APPLICABLE', () => {
      for (const id of ['amparo_indirecto_penal', 'amparo_directo_penal']) {
        const item = getCatalogDocument(id);
        expect(item, `Catalog item ${id} should exist`).toBeDefined();
        expect(item?.kind).toBe('FAMILY');
        expect(item?.status).toBe('NOT_APPLICABLE');
        expect((item as any)?.implemented).toBe(false);
      }
    });

    it('Assisted draft penal items are status ASSISTED_DRAFT and kind DOCUMENT_TYPE with implemented false', () => {
      for (const id of ['oposicion_medida_cautelar', 'solicitud_revision_medida_cautelar', 'acuerdo_reparatorio_propuesta']) {
        const item = getCatalogDocument(id);
        expect(item, `Catalog item ${id} should exist`).toBeDefined();
        expect(item?.kind).toBe('DOCUMENT_TYPE');
        expect(item?.status).toBe('ASSISTED_DRAFT');
        expect((item as any)?.implemented).toBe(false);
      }
    });

    it('Total penal items in catalog is exactly 19 (14 leaf + 2 family + 3 assisted draft)', () => {
      const all19 = [
        ...ALL_PENAL_LEAF_TYPES,
        'amparo_indirecto_penal',
        'amparo_directo_penal',
        'oposicion_medida_cautelar',
        'solicitud_revision_medida_cautelar',
        'acuerdo_reparatorio_propuesta',
      ];
      expect(new Set(all19).size).toBe(19);
      for (const id of all19) {
        expect(getCatalogDocument(id)).toBeDefined();
      }
    });
  });

  describe('3. Routing Resolution (resolveDocumentRouting)', () => {
    it.each(ALL_PENAL_LEAF_TYPES)('Resolves route successfully for %s', (docType) => {
      const routing = resolveDocumentRouting({ selectedDocumentType: docType });
      expect(routing.resolvedTemplate).toBe(docType);
      expect(routing.resolvedStrategy).toBe(docType);
      expect(routing.template.tipo).toBe(docType);
    });

    it('Blocks family container amparo_indirecto_penal', () => {
      expect(() => resolveDocumentRouting({ selectedDocumentType: 'amparo_indirecto_penal' })).toThrow();
    });

    it('Blocks assisted draft oposicion_medida_cautelar', () => {
      expect(() => resolveDocumentRouting({ selectedDocumentType: 'oposicion_medida_cautelar' })).toThrow(/DOCUMENT_TYPE_NOT_IMPLEMENTED/);
    });
  });

  describe('4. Classification Intent (classifyIntent)', () => {
    const testCases: Array<{ query: string; expected: string }> = [
      { query: 'presentar denuncia de hechos ante el ministerio publico por fraude', expected: 'denuncia' },
      { query: 'formular querella penal por delito de despojo', expected: 'querella' },
      { query: 'ampliación de denuncia aportando nuevos hechos delictivos', expected: 'ampliacion_denuncia' },
      { query: 'ampliación de querella con hechos supervenientes', expected: 'ampliacion_querella' },
      { query: 'comparecencia e intervención técnica del asesor jurídico de la víctima', expected: 'escrito_asesor_juridico' },
      { query: 'nombramiento y escrito de defensa técnica del imputado', expected: 'escrito_defensa' },
      { query: 'solicitud de actos de investigación y diligencias ministeriales', expected: 'solicitud_actos_investigacion' },
      { query: 'solicitud de acceso a carpeta y consulta de registros de investigación', expected: 'solicitud_acceso_carpeta' },
      { query: 'solicitud de copias de la carpeta de investigación penal', expected: 'solicitud_copias_carpeta' },
      { query: 'solicitud urgente de medidas de protección para la víctima de violencia', expected: 'solicitud_medida_proteccion' },
      { query: 'escrito de coadyuvancia con la acusación ministerial penal', expected: 'escrito_coadyuvancia' },
      { query: 'recurso de apelación penal en contra del auto de vinculación a proceso', expected: 'apelacion_penal' },
      { query: 'recurso de revocación penal conforme al CNPP', expected: 'revocacion_penal' },
      { query: 'escrito ante juez de ejecución penal por beneficio preliberacional', expected: 'escrito_ejecucion_penal' },
    ];

    it.each(testCases)('Correctly classifies "$query" as $expected', ({ query, expected }) => {
      const result = classifyIntent(query);
      expect(result.documentType).toBe(expected);
      expect(result.matter).toBe('penal');
    });
  });

  describe('5. Penal CaseContext & Extraction', () => {
    it('isPenalDocumentType recognizes all 14 types', () => {
      for (const id of ALL_PENAL_LEAF_TYPES) {
        expect(isPenalDocumentType(id)).toBe(true);
      }
      expect(isPenalDocumentType('demanda_ordinaria_civil')).toBe(false);
      expect(isPenalDocumentType('demanda_nulidad_fiscal')).toBe(false);
    });

    it('buildCaseContext populates penal context with parsed facts and references', () => {
      const mockSource: UploadedSourceDocument = createSourceDocument({
        id: 'src-penal-1',
        filename: 'notificacion_carpeta.txt',
        content: 'Carpeta de investigación: CI-FDM-2026/0892. Causa penal 104/2026. Delito de fraude equiparado cometido en agravio de la víctima Juan Pérez López por el imputado Carlos Sánchez Díaz.',
        sourceValidated: true,
        classification: { sourceDocumentType: 'ACTO_DE_AUTORIDAD', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
      });

      const mockAnalysis: CaseAnalysis = {
        parties: { actor: 'Juan Pérez López', demandado: 'Carlos Sánchez Díaz' },
        authorities: ['Agente del Ministerio Público Titular de la Unidad de Investigación'],
        caseNumbers: { principal: 'CI-FDM-2026/0892' },
        proceduralTimeline: [{ date: '10 de mayo de 2026', event: 'Inicio de la carpeta de investigación' } as any],
        challengedActs: [],
        claims: ['Inicio formal del procedimiento penal'],
        claimResponses: [],
        arguments: ['Se actualizan los elementos normativos del delito investigado'],
        evidence: [],
        facts: [
          {
            id: 'fact-1',
            number: '1',
            text: 'En fecha 10 de mayo de 2026 se iniciaron las diligencias en la carpeta de investigación CI-FDM-2026/0892 por delito de fraude patrimonial.',
            confidence: 1,
            position: 'UNDEFINED',
            lawyerPosition: 'UNDEFINED',
            sourceReference: { documentId: 'src-penal-1', page: 1 },
          },
        ],
        rulings: [],
        citations: [],
        proceduralPosture: { proceduralWrit: '', isExtraordinary: false, constitutionalIssues: [], legalityIssues: [], exceptionalInterest: null },
      } as any;

      const caseCtx = buildCaseContext([mockSource], mockAnalysis, undefined, undefined, undefined, 'denuncia');
      expect(caseCtx.penal).toBeDefined();
      expect(caseCtx.penal?.carpetaInvestigacion?.value).toBe('CI-FDM-2026/0892');
      expect(caseCtx.penal?.causaPenal?.value).toBe('104/2026');
      expect(caseCtx.penal?.delitoImputado?.value).toContain('fraude');
      expect(caseCtx.penal?.agraviosPenales).toHaveLength(1);
    });
  });

  describe('6. Pipeline Execution & Deterministic Fallback (0 Mock Text)', () => {
    it.each(ALL_PENAL_LEAF_TYPES)('Generates complete document for %s without AI provider and 0 forbidden mock text', async (docType) => {
      const mockSource: UploadedSourceDocument = createSourceDocument({
        id: `src-${docType}`,
        filename: 'actuacion_penal.txt',
        content: `Carpeta de investigación CI-PEN-2026/100. Delito de despojo. Imputado Roberto Morales. Víctima María Elena Castro.`,
        sourceValidated: true,
        classification: { sourceDocumentType: 'ACTO_DE_AUTORIDAD', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
      });

      const mockAnalysis: CaseAnalysis = {
        parties: { actor: 'María Elena Castro', demandado: 'Roberto Morales' },
        authorities: ['Juzgado de Control del Sistema Penal Acusatorio'],
        caseNumbers: { principal: 'CI-PEN-2026/100' },
        proceduralTimeline: [{ date: '15 de junio de 2026', event: 'Notificación de actuación procesal' } as any],
        challengedActs: [],
        claims: ['Justicia y debido proceso penal'],
        claimResponses: [],
        arguments: ['Violación al debido proceso penal y garantías constitucionales'],
        evidence: [],
        facts: [
          {
            id: 'fact-1',
            number: '1',
            text: 'Con fecha 15 de junio de 2026 se radicaron las actuaciones dentro de la carpeta CI-PEN-2026/100.',
            confidence: 1,
            position: 'UNDEFINED',
            lawyerPosition: 'UNDEFINED',
            sourceReference: { documentId: `src-${docType}`, page: 1 },
          },
        ],
        rulings: [],
        citations: [],
        proceduralPosture: { proceduralWrit: '', isExtraordinary: false, constitutionalIssues: [], legalityIssues: [], exceptionalInterest: null },
      } as any;

      const doc = await runGenerationPipeline({
        sourceDocuments: [mockSource],
        selectedDocumentType: docType,
        caseAnalysis: mockAnalysis,
      } as any);

      expect(doc).toBeDefined();
      expect(doc.documentType).toBe(docType);
      expect(doc.sections.length).toBeGreaterThanOrEqual(4);

      const fullText = doc.sections.flatMap((s) => s.content.map((c) => c.text)).join('\n\n');
      expect(fullText).not.toMatch(/\[Desarrollar por la IA/i);
      expect(fullText).not.toMatch(/Texto pendiente de desarrollo/i);
      expect(fullText.length).toBeGreaterThan(100);
    });
  });

  describe('7. Source Compatibility & Matter Isolation', () => {
    it('Rejects incompatible sources (mercantil, laboral, fiscal) for penal document types', () => {
      const incompatibleSource = createSourceDocument({
        id: 'src-incompat',
        filename: 'pagare.txt',
        content: 'Pagaré mercantil por $100,000 pesos',
        sourceValidated: true,
        classification: { sourceDocumentType: 'PAGARE', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
      });
      expect(() =>
        evaluateSourceOutputCompatibility({
          selectedDocumentType: 'denuncia',
          sourceDocuments: [incompatibleSource],
        })
      ).toThrow(/SOURCE_DOCUMENT_INCOMPATIBLE/);
    });

    it('Accepts compatible sources (ACTO_DE_AUTORIDAD, ACUERDO) for penal document types', () => {
      const compatibleSource = createSourceDocument({
        id: 'src-compat',
        filename: 'acuerdo.txt',
        content: 'Acuerdo ministerial de trámite penal',
        sourceValidated: true,
        classification: { sourceDocumentType: 'ACUERDO', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
      });
      const policy = evaluateSourceOutputCompatibility({
        selectedDocumentType: 'ampliacion_denuncia',
        sourceDocuments: [compatibleSource],
      });
      expect(policy.status).toBe('COMPATIBLE');
    });

    it('Ensures strict isolation between two different penal cases', async () => {
      const sourceA: UploadedSourceDocument = createSourceDocument({
        id: 'src-case-a',
        filename: 'caso_a.txt',
        content: 'Carpeta CI-EXPEDIENTE-AAA. Imputado Pedro Alfa. Delito de robo con violencia.',
        sourceValidated: true,
        classification: { sourceDocumentType: 'ACTO_DE_AUTORIDAD', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
      });
      const sourceB: UploadedSourceDocument = createSourceDocument({
        id: 'src-case-b',
        filename: 'caso_b.txt',
        content: 'Carpeta CI-EXPEDIENTE-BBB. Imputado Laura Beta. Delito de fraude fiscal.',
        sourceValidated: true,
        classification: { sourceDocumentType: 'ACTO_DE_AUTORIDAD', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
      });

      const analysisA: CaseAnalysis = {
        parties: { actor: 'Víctima Alfa', demandado: 'Pedro Alfa' },
        authorities: ['MP Central A'],
        caseNumbers: { principal: 'CI-EXPEDIENTE-AAA' },
        proceduralTimeline: [],
        challengedActs: [],
        claims: ['Pena máxima'],
        claimResponses: [],
        arguments: [],
        evidence: [],
        facts: [{ id: 'f1', number: '1', text: 'Hecho del caso A en CI-EXPEDIENTE-AAA.', confidence: 1, position: 'UNDEFINED', lawyerPosition: 'UNDEFINED' }],
        rulings: [],
        citations: [],
        proceduralPosture: { proceduralWrit: '', isExtraordinary: false, constitutionalIssues: [], legalityIssues: [], exceptionalInterest: null },
      } as any;

      const analysisB: CaseAnalysis = {
        parties: { actor: 'Víctima Beta', demandado: 'Laura Beta' },
        authorities: ['MP Central B'],
        caseNumbers: { principal: 'CI-EXPEDIENTE-BBB' },
        proceduralTimeline: [],
        challengedActs: [],
        claims: ['Reparación del daño'],
        claimResponses: [],
        arguments: [],
        evidence: [],
        facts: [{ id: 'f2', number: '1', text: 'Hecho del caso B en CI-EXPEDIENTE-BBB.', confidence: 1, position: 'UNDEFINED', lawyerPosition: 'UNDEFINED' }],
        rulings: [],
        citations: [],
        proceduralPosture: { proceduralWrit: '', isExtraordinary: false, constitutionalIssues: [], legalityIssues: [], exceptionalInterest: null },
      } as any;

      const resA = await runGenerationPipeline({ sourceDocuments: [sourceA], selectedDocumentType: 'denuncia', caseAnalysis: analysisA } as any);
      const resB = await runGenerationPipeline({ sourceDocuments: [sourceB], selectedDocumentType: 'denuncia', caseAnalysis: analysisB } as any);

      const textA = resA.sections.flatMap((s) => s.content.map((c) => c.text)).join(' ');
      const textB = resB.sections.flatMap((s) => s.content.map((c) => c.text)).join(' ');

      expect(textA).toContain('CI-EXPEDIENTE-AAA');
      expect(textA).not.toContain('CI-EXPEDIENTE-BBB');
      expect(textA).not.toContain('Laura Beta');

      expect(textB).toContain('CI-EXPEDIENTE-BBB');
      expect(textB).not.toContain('CI-EXPEDIENTE-AAA');
      expect(textB).not.toContain('Pedro Alfa');
    });
  });
});
