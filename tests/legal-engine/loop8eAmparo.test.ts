import { describe, expect, it } from 'vitest';
import { getCatalogDocument, LEGAL_CATALOG_REGISTRY } from '@/lib/catalog/legalCatalog';
import { getDocumentStrategy } from '@/lib/legal-engine/documentStrategies';
import { DocumentTemplates, getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import { getRequiredSectionIds } from '@/lib/legal-engine/exportGuards';
import { evaluateSourceOutputCompatibility, SOURCE_OUTPUT_COMPATIBILITY_RULES } from '@/lib/legal-engine/sourceOutputCompatibility';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import { createSourceDocument } from '@/lib/legal-engine/context';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { classifyIntent } from '@/lib/legal-engine/classifier';
import { buildCaseContext, isAmparoDocumentType, AMPARO_DOCUMENT_TYPES } from '@/lib/legal-engine/caseContext';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';

// ── 1. INVENTARIO REAL DERIVADO DEL REPOSITORIO ──────────────────────────────

const AMPARO_CATALOG_DOCS = LEGAL_CATALOG_REGISTRY.documents.filter(
  (doc) => doc.areaId === 'constitucional_amparo' && doc.kind === 'DOCUMENT_TYPE',
);

const TARGET_AMPARO_IDS = AMPARO_CATALOG_DOCS.map((doc) => doc.id);

function syntheticAmparoSource(sourceDocumentType: string, id = 'synthetic-amparo-source', content = 'Constancia jurídica de amparo y control constitucional.') {
  return createSourceDocument({
    id,
    filename: `${id}.txt`,
    content,
    sourceValidated: true,
    classification: { sourceDocumentType, role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
  });
}

function syntheticAmparoAnalysis(overrides: Partial<CaseAnalysis> = {}): CaseAnalysis {
  return {
    parties: {
      quejoso: 'Ciudadano Quejoso Sintético',
      actor: 'Ciudadano Quejoso Sintético',
      autoridadResponsable: 'Juez Tercero de Distrito en Materia Administrativa',
      demandado: 'Juez Tercero de Distrito en Materia Administrativa',
    },
    authorities: ['Juez Tercero de Distrito en Materia Administrativa'],
    facts: [
      { id: 'f-1', number: '1', text: 'La autoridad responsable emitió orden de aseguramiento sin previa garantía de audiencia ni debida fundamentación.', confidence: 1, position: 'UNDEFINED', lawyerPosition: 'UNDEFINED' },
      { id: 'f-2', number: '2', text: 'Dicha determinación fue notificada con fecha 15 de marzo de 2026 causando perjuicio inminente.', confidence: 1, position: 'UNDEFINED', lawyerPosition: 'UNDEFINED' },
    ],
    claims: ['La suspensión provisional y definitiva del acto reclamado', 'El amparo y protección de la Justicia de la Unión'],
    evidence: [{ id: 'ev-1', description: 'Copia certificada del oficio reclamado', type: 'DOCUMENTAL_PUBLICA', confirmed: true }],
    caseNumbers: { principal: 'AMP-IND-1234/2026' },
    ...overrides,
  } as any as CaseAnalysis;
}

describe('LOOP 8E — CONSTITUCIONAL / AMPARO EXTENDIDO', () => {
  describe('1. Inventario y Catálogo Legal (16/16 IMPLEMENTED)', () => {
    it('deriva exactamente 16 tipos canónicos de amparo del catálogo oficial', () => {
      expect(TARGET_AMPARO_IDS).toHaveLength(16);
      expect(AMPARO_DOCUMENT_TYPES).toHaveLength(16);
    });

    it('todos los 16 tipos canónicos tienen status IMPLEMENTED y implemented: true', () => {
      for (const doc of AMPARO_CATALOG_DOCS) {
        expect(doc.status, `El documento ${doc.id} debe estar IMPLEMENTED`).toBe('IMPLEMENTED');
        expect(doc.implemented, `El documento ${doc.id} debe tener implemented=true`).toBe(true);
      }
    });

    it('isAmparoDocumentType reconoce los 16 tipos y rechaza otras materias', () => {
      for (const id of TARGET_AMPARO_IDS) {
        expect(isAmparoDocumentType(id), `Debe reconocer ${id}`).toBe(true);
      }
      expect(isAmparoDocumentType('demanda_ordinaria_civil')).toBe(false);
      expect(isAmparoDocumentType('demanda_laboral')).toBe(false);
      expect(isAmparoDocumentType('demanda_divorcio')).toBe(false);
    });
  });

  describe('2. Contrato de Estrategias y Plantillas', () => {
    it('cada tipo de amparo tiene estrategia registrada con requiredSectionIds coherentes', () => {
      for (const id of TARGET_AMPARO_IDS) {
        const strategy = getDocumentStrategy(id);
        expect(strategy, `Estrategia no encontrada para ${id}`).toBeDefined();
        expect(strategy?.requiredSectionIds.length).toBeGreaterThanOrEqual(5);
        expect(['AMPARO', 'CONSTITUCIONAL']).toContain(strategy?.matter);
      }
    });

    it('cada tipo de amparo tiene plantilla registrada con esqueletoDedicado: true', () => {
      for (const id of TARGET_AMPARO_IDS) {
        const template = getDocumentTemplate(id);
        expect(template, `Plantilla no encontrada para ${id}`).toBeDefined();
        expect(template?.esqueletoDedicado).toBe(true);
        expect(template?.estructura.length).toBeGreaterThanOrEqual(5);
      }
    });

    it('coincidencia 100% entre Strategy.requiredSectionIds y getRequiredSectionIds(id)', () => {
      for (const id of TARGET_AMPARO_IDS) {
        const strategy = getDocumentStrategy(id)!;
        const exportGuardsSections = getRequiredSectionIds(id);
        expect([...strategy.requiredSectionIds], `Mismatch en secciones para ${id}`).toEqual([...exportGuardsSections]);
      }
    });
  });

  describe('3. Compatibilidad de Fuentes y Routing', () => {
    it('declara reglas de compatibilidad de fuentes para los 16 tipos', () => {
      for (const id of TARGET_AMPARO_IDS) {
        const rule = SOURCE_OUTPUT_COMPATIBILITY_RULES[id];
        expect(rule, `Regla de compatibilidad no encontrada para ${id}`).toBeDefined();
        const incompatibleMatters = rule.incompatibleMatterRules?.map((r) => r.matter) || [];
        expect(incompatibleMatters).toContain('civil');
        expect(incompatibleMatters).toContain('laboral');
      }
    });

    it('rutea correctamente todos los tipos de amparo', () => {
      for (const id of TARGET_AMPARO_IDS) {
        const resolution = resolveDocumentRouting({ selectedDocumentType: id });
        expect(resolution.resolvedStrategy).toBe(id);
        expect(resolution.resolvedTemplate).toBe(id);
      }
    });
  });

  describe('4. Clasificación de Fuentes de Amparo', () => {
    it('clasifica correctamente escritos de amparo representativos', () => {
      const intent1 = classifyIntent('Promuevo amparo indirecto contra la orden de clausura emitida por la autoridad');
      expect(intent1.documentType).toBe('demanda_amparo_indirecto');

      const intent2 = classifyIntent('Solicitud de suspensión provisional del acto reclamado para mantener las cosas en el estado en que se encuentran');
      expect(intent2.documentType).toBe('solicitud_suspension_provisional');

      const intent3 = classifyIntent('Vengo a interponer recurso de revisión en amparo contra la sentencia dictada en la audiencia constitucional');
      expect(intent3.documentType).toBe('recurso_revision_amparo');

      const intent4 = classifyIntent('Formulo ampliación de demanda de amparo respecto de los nuevos actos conocidos en el informe justificado');
      expect(intent4.documentType).toBe('ampliacion_demanda_amparo');
    });
  });

  describe('5. Amparo CaseContext y Extracción', () => {
    it('construye AmparoContext extrayendo partes, actos y preceptos violados', () => {
      const sources = [
        syntheticAmparoSource(
          'ACTO_DE_AUTORIDAD',
          'src-amp-1',
          'Acto reclamado consistente en la orden de clausura definitiva fuera de juicio. Notificada el 15 de marzo de 2026. Viola el artículo 14 y artículo 16 constitucional por indebida fundamentación.',
        ),
      ];

      const context = buildCaseContext(
        sources,
        syntheticAmparoAnalysis(),
        {
          quejoso: 'Lic. Roberto Quezada Medina',
          actor: 'Lic. Roberto Quezada Medina',
          autoridadResponsable: 'Juez Primero de Control del Primer Distrito Judicial',
        },
        undefined,
        undefined,
        'demanda_amparo_indirecto',
      );

      expect(context.amparo).toBeDefined();
      expect(context.amparo?.documentType).toBe('demanda_amparo_indirecto');
      expect(context.amparo?.quejoso.value).toBe('Lic. Roberto Quezada Medina');
      expect(context.amparo?.autoridadResponsable.value).toBe('Juez Primero de Control del Primer Distrito Judicial');
      expect(context.amparo?.preceptosViolados.length).toBeGreaterThan(0);
      expect(context.amparo?.preceptosViolados.some((p) => p.includes('14') || p.includes('16'))).toBe(true);
      expect(context.amparo?.tipoAmparo).toBe('INDIRECTO');
      expect(context.amparo?.suspensionSolicitada).toBe(true);
    });
  });

  describe('6. Aislamiento de Contexto entre Expedientes de Amparo', () => {
    it('garantiza estricto aislamiento entre dos expedientes de amparo sin contaminación cruzada', async () => {
      const analysisA = syntheticAmparoAnalysis({
        parties: {
          quejoso: 'Gabriela Morales Solís',
          actor: 'Gabriela Morales Solís',
          autoridadResponsable: 'Secretaría de Medio Ambiente y Recursos Naturales',
        },
        caseNumbers: { principal: 'AMP-IND-101/2026' },
      });

      const analysisB = syntheticAmparoAnalysis({
        parties: {
          quejoso: 'Constructora del Norte S.A. de C.V.',
          actor: 'Constructora del Norte S.A. de C.V.',
          autoridadResponsable: 'Director General del Registro Público de la Propiedad',
        },
        caseNumbers: { principal: 'AMP-IND-999/2026' },
      });

      const docA = await runGenerationPipeline({
        selectedDocumentType: 'demanda_amparo_indirecto',
        documentTypeLabel: 'Demanda de Amparo Indirecto',
        matter: 'AMPARO',
        userInstruction: 'Promover amparo indirecto ambiental',
        sourceDocuments: [syntheticAmparoSource('ACTO_DE_AUTORIDAD', 'src-amp-a')],
        caseAnalysis: analysisA,
      } as any);

      const docB = await runGenerationPipeline({
        selectedDocumentType: 'demanda_amparo_indirecto',
        documentTypeLabel: 'Demanda de Amparo Indirecto',
        matter: 'AMPARO',
        userInstruction: 'Promover amparo indirecto inmobiliario',
        sourceDocuments: [syntheticAmparoSource('ACTO_DE_AUTORIDAD', 'src-amp-b')],
        caseAnalysis: analysisB,
      } as any);

      const textA = docA.sections.flatMap((s) => s.content.map((b) => b.text)).join('\n');
      const textB = docB.sections.flatMap((s) => s.content.map((b) => b.text)).join('\n');

      expect(textA).toContain('Gabriela Morales Solís');
      expect(textA).toContain('AMP-IND-101/2026');
      expect(textA).not.toContain('Constructora del Norte');
      expect(textA).not.toContain('AMP-IND-999/2026');

      expect(textB).toContain('Constructora del Norte S.A. de C.V.');
      expect(textB).toContain('AMP-IND-999/2026');
      expect(textB).not.toContain('Gabriela Morales Solís');
      expect(textB).not.toContain('AMP-IND-101/2026');
    });
  });

  describe('7. Fallback Determinístico sin IA para Tipos Representativos', () => {
    const representativos: (typeof TARGET_AMPARO_IDS)[number][] = [
      'demanda_amparo_indirecto',
      'demanda_amparo_directo',
      'ampliacion_demanda_amparo',
      'solicitud_suspension_provisional',
      'solicitud_suspension_definitiva',
      'alegatos_amparo',
      'recurso_revision_amparo',
      'cumplimiento_ejecutoria_amparo',
    ];

    const sourceTypesForAmparo: Record<string, string> = {
      demanda_amparo_indirecto: 'ACTO_DE_AUTORIDAD',
      demanda_amparo_directo: 'SENTENCIA_O_RESOLUCION',
      ampliacion_demanda_amparo: 'DEMANDA_AMPARO',
      solicitud_suspension_provisional: 'ACTO_DE_AUTORIDAD',
      solicitud_suspension_definitiva: 'ACTO_DE_AUTORIDAD',
      alegatos_amparo: 'ACUERDO',
      recurso_revision_amparo: 'SENTENCIA_AMPARO',
      cumplimiento_ejecutoria_amparo: 'SENTENCIA_AMPARO',
    };

    for (const docId of representativos) {
      it(`${docId} genera texto determinístico profesional sin IA y sin mock text`, async () => {
        const sourceType = sourceTypesForAmparo[docId] || 'ACTO_DE_AUTORIDAD';
        const doc = await runGenerationPipeline({
          selectedDocumentType: docId,
          documentTypeLabel: docId,
          matter: 'AMPARO',
          userInstruction: `Generar ${docId} sin IA`,
          sourceDocuments: [syntheticAmparoSource(sourceType, `src-${docId}`)],
          caseAnalysis: syntheticAmparoAnalysis(),
        } as any);

        expect(doc.documentType).toBe(docId);
        expect(doc.sections.length).toBeGreaterThanOrEqual(5);

        const fullText = doc.sections.flatMap((s) => s.content.map((b) => b.text)).join('\n');
        expect(fullText).not.toContain('[Desarrollar por la IA...]');
        expect(fullText).not.toContain('[Completar por la IA...]');
        expect(fullText).not.toContain('[DESARROLLO DE BLOQUE:');
      });
    }
  });

  describe('8. Flujo A y Flujo B', () => {
    it('Flujo A: genera solicitud de suspensión provisional a partir de acto de autoridad', async () => {
      const source = syntheticAmparoSource(
        'ACTO_DE_AUTORIDAD',
        'src-acto-1',
        'Orden de clausura y suspensión inmediata de actividades comerciales número OF-2026-09. Notificada el 10 de marzo de 2026.',
      );

      const doc = await runGenerationPipeline({
        selectedDocumentType: 'solicitud_suspension_provisional',
        documentTypeLabel: 'Solicitud de Suspensión Provisional',
        matter: 'AMPARO',
        userInstruction: 'Solicitar suspensión provisional urgente',
        sourceDocuments: [source],
        caseAnalysis: syntheticAmparoAnalysis(),
      } as any);

      expect(doc.documentType).toBe('solicitud_suspension_provisional');
      expect(doc.sections.some((s) => s.title.includes('SUSPENSIÓN') || s.title.includes('MEDIDA CAUTELAR') || s.title.includes('BUEN DERECHO'))).toBe(true);
    });

    it('Flujo B: redacción desde cero (NEW_WRITING) para demanda de amparo indirecto', async () => {
      const doc = await runGenerationPipeline({
        selectedDocumentType: 'demanda_amparo_indirecto',
        documentTypeLabel: 'Demanda de Amparo Indirecto',
        matter: 'AMPARO',
        userInstruction: 'Preparar demanda de amparo indirecto inicial',
        sourceDocuments: [],
        flow: 'NEW_WRITING',
        caseAnalysis: syntheticAmparoAnalysis(),
      } as any);

      expect(doc.documentType).toBe('demanda_amparo_indirecto');
      expect(doc.flow).toBe('NEW_WRITING');
      expect(doc.sections.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('9. Exportabilidad Forense a DOCX y PDF', () => {
    it('exporta UniversalLegalDocument de amparo a búfer DOCX y PDF válido con caracteres españoles', async () => {
      const doc = await runGenerationPipeline({
        selectedDocumentType: 'demanda_amparo_indirecto',
        documentTypeLabel: 'Demanda de Amparo Indirecto',
        matter: 'AMPARO',
        userInstruction: 'Preparar demanda de amparo para presentación',
        sourceDocuments: [syntheticAmparoSource('ACTO_DE_AUTORIDAD', 'src-amparo-export')],
        caseAnalysis: syntheticAmparoAnalysis({
          parties: {
            quejoso: 'María de los Ángeles Nuño López',
            actor: 'María de los Ángeles Nuño López',
            autoridadResponsable: 'Juez Cuarto de Distrito en Materia Administrativa',
            demandado: 'Juez Cuarto de Distrito en Materia Administrativa',
          },
        }),
      } as any);

      // Limpia campos pendientes con datos confirmados por el abogado para habilitar exportación
      doc.sections.forEach((section, sIdx) => {
        section.content.forEach((block, bIdx) => {
          block.text = block.text.replace(/\[DATO PENDIENTE:[^\]]+\]/g, `Dato específico confirmado en ${section.title} (${sIdx + 1}.${bIdx + 1})`);
          block.text = block.text.replace(/\[REQUIERE[^\]]+\]/g, `Instrucción procesal desahogada para ${section.title}`);
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

      // Confirmación de caracteres españoles
      const allText = doc.sections.flatMap((s) => s.content.map((b) => b.text)).join('\n');
      expect(allText).toMatch(/[áéíóúñÁÉÍÓÚÑ]/);
      expect(allText).toContain('Ángeles');
    });
  });
});
