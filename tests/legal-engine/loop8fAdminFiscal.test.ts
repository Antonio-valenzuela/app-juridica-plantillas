import { describe, it, expect } from 'vitest';
import { DOCUMENT_STRATEGIES, getDocumentStrategy } from '@/lib/legal-engine/documentStrategies';
import { DocumentTemplates, getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import { getRequiredSectionIds } from '@/lib/legal-engine/exportGuards';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import { classifyIntent } from '@/lib/legal-engine/classifier';
import {
  buildCaseContext,
  ADMINISTRATIVO_DOCUMENT_TYPES,
  FISCAL_DOCUMENT_TYPES,
  isAdministrativoDocumentType,
  isFiscalDocumentType,
} from '@/lib/legal-engine/caseContext';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { UniversalLegalDocument, UploadedSourceDocument } from '@/lib/legal-engine/types';
import { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';

const ALL_ADMIN_TYPES = [
  'demanda_nulidad_administrativa',
  'contestacion_nulidad_administrativa',
  'ampliacion_demanda_nulidad',
  'contestacion_ampliacion_nulidad',
  'alegatos_administrativos',
  'cumplimiento_sentencia_administrativa',
  'recurso_administrativo',
  'recurso_revision_administrativa',
  'solicitud_suspension_acto_administrativo',
  'incidente_administrativo',
];

const ALL_FISCAL_TYPES = [
  'demanda_nulidad_fiscal',
  'contestacion_nulidad_fiscal',
  'ampliacion_demanda_fiscal',
  'contestacion_ampliacion_fiscal',
  'recurso_revocacion_fiscal',
  'recurso_revision_fiscal',
  'alegatos_fiscales',
  'cumplimiento_sentencia_fiscal',
  'solicitud_suspension_fiscal',
  'escritos_ante_autoridad_fiscal',
];

describe('LOOP 8F — Materia Administrativa y Fiscal Integral', () => {
  describe('1. Strategy & Template Completeness (20 Document Types)', () => {
    const all20Types = [...ALL_ADMIN_TYPES, ...ALL_FISCAL_TYPES];

    it.each(all20Types)('Strategy exists and is registered for %s', (docType) => {
      const strategy = getDocumentStrategy(docType);
      expect(strategy).toBeDefined();
      expect(strategy!.documentType).toBe(docType);
      expect(strategy!.requiredSectionIds.length).toBeGreaterThanOrEqual(4);
    });

    it.each(all20Types)('Template exists and has non-empty estructura for %s', (docType) => {
      const template = getDocumentTemplate(docType);
      expect(template).toBeDefined();
      expect(template.tipo).toBe(docType);
      expect(template.estructura.length).toBeGreaterThanOrEqual(4);
      expect(template.esqueletoDedicado).toBe(true);
    });

    it.each(all20Types)('Canonical sections match exactly between strategy and template for %s', (docType) => {
      const strategy = getDocumentStrategy(docType);
      const exportGuardsSections = getRequiredSectionIds(docType);
      expect([...strategy!.requiredSectionIds]).toEqual([...exportGuardsSections]);
    });
  });

  describe('2. Catalog Status and Classification', () => {
    it('All 10 Administrativo types are present in catalog with correct kind & status', () => {
      for (const id of ALL_ADMIN_TYPES) {
        const item = getCatalogDocument(id);
        expect(item, `Catalog item ${id} should exist`).toBeDefined();
        if (id === 'incidente_administrativo') {
          expect(item?.kind).toBe('FAMILY');
          expect(item?.status).toBe('NOT_APPLICABLE');
        } else {
          expect(item?.kind).toBe('DOCUMENT_TYPE');
          expect(item?.status).toBe('IMPLEMENTED');
          expect((item as any)?.implemented).toBe(true);
        }
      }
    });

    it('All 10 Fiscal types are present in catalog with correct kind & status', () => {
      for (const id of ALL_FISCAL_TYPES) {
        const item = getCatalogDocument(id);
        expect(item, `Catalog item ${id} should exist`).toBeDefined();
        expect(item?.kind).toBe('DOCUMENT_TYPE');
        expect(item?.status).toBe('IMPLEMENTED');
        expect((item as any)?.implemented).toBe(true);
      }
    });

    it('Total Administrativo and Fiscal leaf document types implemented count is 19', () => {
      const adminFiscalLeaves = [...ALL_ADMIN_TYPES, ...ALL_FISCAL_TYPES].filter(
        (id) => id !== 'incidente_administrativo',
      );
      expect(adminFiscalLeaves.length).toBe(19);
      for (const id of adminFiscalLeaves) {
        const item = getCatalogDocument(id);
        expect((item as any)?.implemented).toBe(true);
      }
    });
  });

  describe('3. Document Routing Resolution', () => {
    const all20Types = [...ALL_ADMIN_TYPES, ...ALL_FISCAL_TYPES];

    it.each(all20Types)('Resolves document routing correctly for %s', (docType) => {
      const routing = resolveDocumentRouting({ selectedDocumentType: docType });
      expect(routing.resolvedTemplate).toBe(docType);
      expect(routing.resolvedStrategy).toBe(docType);
      expect(routing.template.tipo).toBe(docType);
    });
  });

  describe('4. Classifier Intent Matching', () => {
    it('Classifies demanda nulidad administrativa', () => {
      const match = classifyIntent('demanda de nulidad administrativa ante el tribunal de justicia administrativa');
      expect(match.documentType).toBe('demanda_nulidad_administrativa');
    });

    it('Classifies contestacion nulidad administrativa', () => {
      const match = classifyIntent('contestación de demanda de juicio contencioso administrativo');
      expect(match.documentType).toBe('contestacion_nulidad_administrativa');
    });

    it('Classifies ampliacion demanda nulidad administrativa', () => {
      const match = classifyIntent('ampliación de demanda de nulidad por nuevos hechos');
      expect(match.documentType).toBe('ampliacion_demanda_nulidad');
    });

    it('Classifies alegatos administrativos', () => {
      const match = classifyIntent('escrito de alegatos de bien probado en juicio contencioso administrativo');
      expect(match.documentType).toBe('alegatos_administrativos');
    });

    it('Classifies recurso revision administrativa', () => {
      const match = classifyIntent('recurso de revisión administrativa contra la interlocutoria');
      expect(match.documentType).toBe('recurso_revision_administrativa');
    });

    it('Classifies suspension acto administrativo', () => {
      const match = classifyIntent('solicitud de suspensión del acto administrativo impugnado');
      expect(match.documentType).toBe('solicitud_suspension_acto_administrativo');
    });

    it('Classifies demanda nulidad fiscal', () => {
      const match = classifyIntent('juicio de nulidad fiscal contra crédito fiscal del SAT');
      expect(match.documentType).toBe('demanda_nulidad_fiscal');
    });

    it('Classifies recurso revocacion fiscal', () => {
      const match = classifyIntent('recurso de revocación en materia fiscal contra la liquidación del SAT');
      expect(match.documentType).toBe('recurso_revocacion_fiscal');
    });

    it('Classifies alegatos fiscales', () => {
      const match = classifyIntent('alegatos de bien probado en juicio de nulidad fiscal ante sala regional');
      expect(match.documentType).toBe('alegatos_fiscales');
    });

    it('Classifies solicitud suspension fiscal', () => {
      const match = classifyIntent('solicitud de suspensión del procedimiento administrativo de ejecución fiscal');
      expect(match.documentType).toBe('solicitud_suspension_fiscal');
    });

    it('Classifies escritos ante autoridad fiscal', () => {
      const match = classifyIntent('promoción y escrito libre ante la autoridad recaudadora fiscal');
      expect(match.documentType).toBe('escritos_ante_autoridad_fiscal');
    });
  });

  describe('5. CaseContext Extraction & Isolation', () => {
    const dummySources: UploadedSourceDocument[] = [
      {
        id: 'src-admin-1',
        filename: 'resolucion_sancionatoria.txt',
        content: 'Resolución administrativa número OF-ADMIN-2024-089 notificada el 15 de marzo de 2024 por la Procuraduría Ambiental.',
        sourceValidated: true,
      } as any,
    ];

    const dummyAdminAnalysis: CaseAnalysis = {
      parties: {
        actor: 'Empresa Verde S.A. de C.V.',
        autoridadResponsable: 'Secretaría del Medio Ambiente',
      },
      caseNumbers: { principal: 'TFJA-2024/001' },
      facts: [
        {
          id: '1',
          number: '1',
          text: 'La autoridad emitió la resolución administrativa número OF-ADMIN-2024-089 en la que impone clausura.',
          date: '10 de marzo de 2024',
        } as any,
        {
          id: '2',
          number: '2',
          text: 'Dicho acto fue notificado con fecha 15 de marzo de 2024.',
          date: '15 de marzo de 2024',
        } as any,
      ],
      claims: ['Se solicita la nulidad lisa y llana de la clausura'],
      arguments: [
        'Violación al debido proceso: Indebida fundamentación y motivación en la orden de clausura.',
      ],
    } as any;

    it('Builds AdministrativoContext properly for demanda_nulidad_administrativa', () => {
      const ctx = buildCaseContext(dummySources, dummyAdminAnalysis, undefined, undefined, undefined, 'demanda_nulidad_administrativa');
      expect(ctx.administrativo).toBeDefined();
      expect(ctx.administrativo?.documentType).toBe('demanda_nulidad_administrativa');
      expect(ctx.administrativo?.actor.value).toBe('Empresa Verde S.A. de C.V.');
      expect(ctx.administrativo?.autoridadDemandada.value).toBe('Secretaría del Medio Ambiente');
      expect(ctx.administrativo?.resolucionImpugnada?.value).toContain('OF-ADMIN-2024-089');
      expect(ctx.administrativo?.fechaNotificacionResolucion?.value).toBe('15 de marzo de 2024');
      expect(ctx.administrativo?.conceptosImpugnacion.length).toBeGreaterThan(0);
      expect(ctx.fiscal).toBeUndefined();
    });

    const dummyFiscalSources: UploadedSourceDocument[] = [
      {
        id: 'src-fiscal-1',
        filename: 'credito_sat.txt',
        content: 'Liquidación tributaria número SAT-500-2024 determinando crédito fiscal por la cantidad de $1,250,000.00 pesos notificada el 20 de abril de 2024.',
        sourceValidated: true,
      } as any,
    ];

    const dummyFiscalAnalysis: CaseAnalysis = {
      parties: {
        actor: 'Comercializadora del Norte S.A.',
        autoridadResponsable: 'Administración Desconcentrada Jurídica del SAT',
      },
      caseNumbers: { principal: 'TFJA-FIS-2024/88' },
      facts: [
        {
          id: '1',
          number: '1',
          text: 'El SAT emitió la resolución determinante liquidación SAT-500-2024 por crédito fiscal $1,250,000.00.',
        } as any,
        {
          id: '2',
          number: '2',
          text: 'Dicho acto fue notificado con fecha 20 de abril de 2024.',
        } as any,
      ],
      claims: ['Nulidad del crédito fiscal por caducidad de facultades'],
      arguments: [
        'Caducidad: Operó la caducidad de las facultades de comprobación del artículo 67 del CFF.',
      ],
    } as any;

    it('Builds FiscalContext properly for demanda_nulidad_fiscal', () => {
      const ctx = buildCaseContext(dummyFiscalSources, dummyFiscalAnalysis, undefined, undefined, undefined, 'demanda_nulidad_fiscal');
      expect(ctx.fiscal).toBeDefined();
      expect(ctx.fiscal?.documentType).toBe('demanda_nulidad_fiscal');
      expect(ctx.fiscal?.contribuyente.value).toBe('Comercializadora del Norte S.A.');
      expect(ctx.fiscal?.autoridadFiscalDemandada.value).toBe('Administración Desconcentrada Jurídica del SAT');
      expect(ctx.fiscal?.resolucionDeterminativa?.value).toContain('SAT-500-2024');
      expect(ctx.fiscal?.creditoFiscal?.value).toContain('1,250,000.00');
      expect(ctx.fiscal?.fechaNotificacion?.value).toBe('20 de abril de 2024');
      expect(ctx.fiscal?.conceptosImpugnacion.length).toBeGreaterThan(0);
      expect(ctx.administrativo).toBeUndefined();
    });
  });

  describe('6. Pipeline Execution — Zero Mock Text & Integrity', () => {
    it('Executes deterministic pipeline for demanda_nulidad_administrativa (Flow A)', async () => {
      const source = createSourceDocument({
        id: 'src-adm',
        filename: 'resolucion.txt',
        content: 'Oficio de sanción OF-ADM-123 emitido el 10 de enero de 2024 y notificado el 15 de enero de 2024.',
        sourceValidated: true,
        classification: { sourceDocumentType: 'ACTO_ADMINISTRATIVO', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
      });

      const doc = await runGenerationPipeline({
        selectedDocumentType: 'demanda_nulidad_administrativa',
        documentTypeLabel: 'Demanda de Nulidad Administrativa',
        matter: 'ADMINISTRATIVO',
        userInstruction: 'Promover demanda de nulidad',
        sourceDocuments: [source],
        caseAnalysis: {
          parties: {
            actor: 'Constructora Alfa',
            demandado: 'Secretaría de Obras Públicas',
            autoridadResponsable: 'Tribunal Federal de Justicia Administrativa',
          },
          caseNumbers: { principal: 'TFJA-2024/001' },
          facts: [{ number: 1, text: 'Resolución de clausura indebida emitida por la demandada.' }],
          claims: ['Nulidad lisa y llana'],
        },
      } as any);

      expect(doc.sections.length).toBeGreaterThanOrEqual(5);
      const fullText = doc.sections.flatMap((s) => s.content.map((c) => c.text)).join('\n\n');
      expect(fullText).not.toContain('[Desarrollar por la IA');
      expect(fullText).toContain('Constructora Alfa');
      expect(fullText).toContain('TFJA-2024/001');
    });

    it('Executes deterministic pipeline for demanda_nulidad_fiscal (Flow A)', async () => {
      const source = createSourceDocument({
        id: 'src-fisc',
        filename: 'credito.txt',
        content: 'Crédito fiscal SAT-CR-999 por $500,000 notificado el 12 de febrero de 2024.',
        sourceValidated: true,
        classification: { sourceDocumentType: 'CREDITO_FISCAL', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
      });

      const doc = await runGenerationPipeline({
        selectedDocumentType: 'demanda_nulidad_fiscal',
        documentTypeLabel: 'Demanda de Nulidad Fiscal',
        matter: 'FISCAL',
        userInstruction: 'Promover demanda de nulidad fiscal',
        sourceDocuments: [source],
        caseAnalysis: {
          parties: {
            actor: 'Industrial del Golfo S.A.',
            demandado: 'SAT Administración General de Auditoría Fiscal Federal',
          },
          caseNumbers: { principal: 'TFJA-FIS-2024/88' },
          facts: [{ number: 1, text: 'Determinación ilegal de crédito fiscal sin facultades.' }],
          claims: ['Nulidad lisa y llana del crédito'],
        },
      } as any);

      expect(doc.sections.length).toBeGreaterThanOrEqual(5);
      const fullText = doc.sections.flatMap((s) => s.content.map((c) => c.text)).join('\n\n');
      expect(fullText).not.toContain('[Desarrollar por la IA');
      expect(fullText).toContain('Industrial del Golfo S.A.');
      expect(fullText).toContain('TFJA-FIS-2024/88');
    });

    it('Executes new writing (Flow B) for recurso_revocacion_fiscal without source crash', async () => {
      const doc = await runGenerationPipeline({
        selectedDocumentType: 'recurso_revocacion_fiscal',
        documentTypeLabel: 'Recurso de Revocación Fiscal',
        matter: 'FISCAL',
        flow: 'NEW_WRITING',
        generationMode: 'free_writing',
        userInstruction: 'Interponer recurso de revocación',
        intake: {
          objective: 'Interponer recurso de revocación contra la negativa ficta de devolución de saldo a favor',
          representedParty: 'Minera del Sur S.A.',
          counterparty: 'Administración Desconcentrada de Recaudación',
        },
      } as any);

      expect(doc.sections.length).toBeGreaterThanOrEqual(4);
      const fullText = doc.sections.flatMap((s) => s.content.map((c) => c.text)).join('\n\n');
      expect(fullText).not.toContain('[Desarrollar por la IA');
      expect(fullText.length).toBeGreaterThan(200);
    });
  });
});
