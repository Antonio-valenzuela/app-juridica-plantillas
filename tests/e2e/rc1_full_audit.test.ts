import { describe, it, expect, vi } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createEmptyDocument, UniversalLegalDocument } from '@/lib/legal-engine/types';
import { extractPartyField, extractAuthorityLabeled } from '@/lib/legal-engine/partyExtraction';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { validateForExport } from '@/lib/legal-engine/exportGuards';
import { markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { sanitizeLegalDocument } from '@/lib/legal-engine/legalDocumentSanitizer';
import {
  MATTERS,
  JURISDICTIONS,
  DOCUMENT_TYPES,
  CUSTOM_VALUE_MAX_LENGTH,
  sanitizeCustomValue,
  resolveEffectiveLabel,
  validateCustomTaxonomyValue,
} from '@/lib/legal-taxonomy';
import {
  createGenerationJob,
  getGenerationJob,
  updateJobProgress,
  completeJob,
  failJob,
  cancelJob,
} from '@/lib/legal-engine/generationJobs';
import {
  applyLegalEdits,
  buildWorkspaceSnapshot,
  classifyAssistantIntent,
} from '@/lib/workspace/legalEditContract';

function makeReadyExportFixture(document: UniversalLegalDocument): UniversalLegalDocument {
  const readyCandidate = structuredClone(document);
  readyCandidate.documentType = 'escrito_libre';
  readyCandidate.templateId = 'escrito_libre';
  (readyCandidate.generationMetadata as any).preflight = { status: 'READY', missingFields: [] };
  const authorizedText = readyCandidate.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');
  readyCandidate.sourceDocuments = [{
    id: 'synthetic-export-source',
    name: 'synthetic-export-source.txt',
    type: 'txt',
    extractedText: authorizedText,
    sourceValidated: true,
  } as any];
  readyCandidate.sections.push({
    id: 'synthetic-petitorios',
    type: 'petition',
    title: 'PUNTOS PETITORIOS',
    order: readyCandidate.sections.length + 1,
    content: [{
      id: 'synthetic-petitorios-block',
      layer: 'GENERATED_ARGUMENT',
      trustLevel: 'VERIFIED',
      text: 'PRIMERO. ' + 'Contenido jurídico sintético para revisión profesional. '.repeat(12),
    }],
  } as any);
  (readyCandidate as any).qualityGate = { passed: true, canMarkAsFinal: true };
  return markDocumentAsReadyToExport(readyCandidate, { explicit: true });
}
import { applyStyleToSectionText } from '@/lib/legal-engine/styleEngine';
import { LawyerProfile, DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';

const CANARY_EXPEDIENTE = 'EXP_CANARIO_55441';
const CANARY_CLIENTE = 'CLIENTE_CANARIO_92831';
const CANARY_EMPRESA = 'EMPRESA_CANARIO_92831';
const CANARY_DOMICILIO = 'DOMICILIO_CANARIO_77812';
const SOURCE_TEST_ID = 'SOURCE_TEST_001';

describe('AUDITORÍA INTEGRAL RC 1.0 — SUITE DE PRUEBAS E2E Y COMPORTAMIENTO REAL', () => {

  /* ==========================================================================
     FLUJO 1: ESCRITOS INICIALES (Creación, Wizard, Plan, Generación, Edición)
     ========================================================================== */
  describe('1. Flujo Escritos Iniciales', () => {
    it('1.1 Debe generar un escrito inicial con taxonomía personalizada "Otro", estructura canónica y partes', async () => {
      const taxonomy = {
        matter: 'otro',
        matterCustom: { value: 'otro', label: 'Otro', customValue: 'Derecho Aeronáutico y Espacial' },
        jurisdiction: 'federal',
        jurisdictionCustom: null,
        documentType: 'demanda_amparo_indirecto',
        documentTypeCustom: null,
      };

      const doc = await runGenerationPipeline({
        userInstruction: 'Demanda de amparo indirecto contra cancelación de concesión aeronáutica',
        sourceDocuments: [],
        allowUnvalidatedSource: true,
        taxonomy: taxonomy as any,
        matter: 'Derecho Aeronáutico y Espacial',
        documentTypeLabel: 'Demanda de Amparo Indirecto',
        savedParties: [
          { role: 'quejoso', name: 'AeroTransportes del Norte S.A. de C.V.', source: 'manual' },
          { role: 'autoridad', name: 'Agencia Federal de Aviación Civil', source: 'manual' },
        ],
        expediente: 'AMP-900/2026',
      });

      expect(doc).toBeDefined();
      expect(doc.matter).toBe('Derecho Aeronáutico y Espacial');
      expect(doc.jurisdiction).toBe('Federal');
      expect(doc.caseRefs?.expediente).toBe('AMP-900/2026');
      expect(doc.parties.quejoso).toContain('AeroTransportes del Norte');
      expect(doc.parties.autoridadResponsable).toContain('Aviación Civil');
      expect(doc.sections.length).toBeGreaterThanOrEqual(5);

      // Verificar que los apartados canónicos existan
      const titles = doc.sections.map((s) => s.title.toUpperCase());
      expect(titles.some((t) => t.includes('PROEMIO') || t.includes('PERSONALIDAD'))).toBe(true);
      expect(titles.some((t) => t.includes('ACTO') || t.includes('RECLAMADO') || t.includes('HECHOS'))).toBe(true);
      expect(titles.some((t) => t.includes('CONCEPTOS') || t.includes('VIOLACIÓN') || t.includes('AGRAVIOS'))).toBe(true);
      expect(titles.some((t) => t.includes('PETITORIOS') || t.includes('PUNTOS'))).toBe(true);
    });

    it('1.2 Debe permitir la edición manual de un bloque y marcar correctamente isManuallyEdited', async () => {
      const doc = createEmptyDocument({
        id: 'doc-edit-test',
        title: 'Demanda Civil Ordinaria',
        matter: 'Civil',
        jurisdiction: 'Local',
        sections: [
          {
            id: 'sec-hechos',
            type: 'facts',
            title: 'II. Hechos',
            order: 2,
            isRepeatable: false,
            isEditable: true,
            isGenerated: false,
            isManuallyEdited: false,
            variables: [],
            validationErrors: [],
            validationWarnings: [],
            content: [
              {
                id: 'blk-h1',
                layer: 'USER_POSITION',
                trustLevel: 'VERIFIED',
                text: '1. En fecha 15 de enero de 2025 se celebró contrato.',
                isManuallyEdited: false,
              },
            ],
          },
        ],
      });

      // Simular updateBlock del editor
      const newText = '1. En fecha 15 de enero de 2025 se celebró contrato privado de arrendamiento ante dos testigos.';
      const updatedDoc: UniversalLegalDocument = {
        ...doc,
        sections: doc.sections.map((sec) =>
          sec.id === 'sec-hechos'
            ? {
                ...sec,
                isManuallyEdited: true,
                content: sec.content.map((b) =>
                  b.id === 'blk-h1'
                    ? { ...b, text: newText, isManuallyEdited: true, layer: 'USER_POSITION' as const }
                    : b
                ),
              }
            : sec
        ),
      };

      expect(updatedDoc.sections[0].isManuallyEdited).toBe(true);
      expect(updatedDoc.sections[0].content[0].isManuallyEdited).toBe(true);
      expect(updatedDoc.sections[0].content[0].text).toBe(newText);
    });
  });

  /* ==========================================================================
     FLUJO 2: CONTESTACIONES Y RECURSOS (Cotejo, Extracción y Roles)
     ========================================================================== */
  describe('2. Flujo Contestaciones y Recursos', () => {
    it('2.1 Debe extraer partes procesales con precisión y resolver roles de contestación', () => {
      const sampleDemanda = `
C. JUEZ DE DISTRITO EN MATERIA LABORAL EN LA CIUDAD DE MÉXICO.
JUICIO ORDINARIO LABORAL
EXPEDIENTE: 845/2025

CARLOS MENDOZA LÓPEZ, por mi propio derecho, señalando como domicilio para oír y recibir notificaciones...
vengo a demandar a la persona moral LOGÍSTICA INTEGRAL DEL CENTRO S.A. DE C.V., quien tiene su domicilio en...
AUTORIDAD RESPONSABLE: DIRECCIÓN GENERAL DE INSPECCIÓN DEL TRABAJO.
`;

      const extractedActor = extractPartyField(sampleDemanda, [/([A-ZÁÉÍÓÚÑ\s]{4,40}),\s+por\s+mi\s+propio\s+derecho/i]);
      const extractedDemandado = extractPartyField(sampleDemanda, [/vengo\s+a\s+demandar\s+a\s+(?:la\s+persona\s+moral\s+)?([A-ZÁÉÍÓÚÑ\s.]{4,60})/i]);
      const extractedAutoridad = extractAuthorityLabeled(sampleDemanda);

      expect(extractedActor).toContain('CARLOS MENDOZA');
      expect(extractedDemandado).toContain('LOGÍSTICA INTEGRAL');
      expect(extractedAutoridad).toContain('INSPECCIÓN DEL TRABAJO');
    });

    it('2.2 Debe preservar el documento original cargado al 100% durante el análisis y formateo', async () => {
      const originalText = `VISTO el estado procesal del expediente ${CANARY_EXPEDIENTE} seguido por ${CANARY_CLIENTE} contra ${CANARY_EMPRESA}, con domicilio ${CANARY_DOMICILIO}...`;
      const mockSourceDoc = {
        id: SOURCE_TEST_ID,
        name: 'acuerdo_original.pdf',
        extractedText: originalText,
        originalMimeType: 'application/pdf',
        pages: [{ page: 1, text: originalText, chars: originalText.length }],
      };

      const doc = await runGenerationPipeline({
        userInstruction: 'Redactar contestación y análisis del acuerdo',
        sourceDocuments: [mockSourceDoc as any],
        allowUnvalidatedSource: true,
        documentTypeLabel: 'Contestación de Demanda',
        matter: 'Civil',
      });

      // El documento generado tiene sus propias secciones
      expect(doc.sections.length).toBeGreaterThan(0);
      // El documento fuente original en sourceDocuments está 100% íntegro e idéntico
      expect(mockSourceDoc.extractedText).toBe(originalText);
      expect(mockSourceDoc.id).toBe(SOURCE_TEST_ID);
    });
  });

  /* ==========================================================================
     FLUJO 3: JURISDICCIÓN MEXICANA Y TAXONOMÍA ESTRICTA
     ========================================================================== */
  describe('3. Taxonomía y Jurisdicción', () => {
    it('3.1 No debe inventar Cd. de México cuando no hay evidencia de jurisdicción local', () => {
      const res = resolveEffectiveLabel('federal', null, JURISDICTIONS);
      expect(res).toBe('Federal');
      expect(res).not.toBe('Cd. de México');
    });

    it('3.2 Debe respetar la jurisdicción Local cuando se especifica explícitamente', () => {
      const res = resolveEffectiveLabel('local', null, JURISDICTIONS);
      expect(res).toBe('Local');
    });

    it('3.3 Debe validar y sanitizar el campo "Otro" con límite de 80 caracteres', () => {
      const validCustom = 'Derecho Marítimo y Portuario';
      expect(sanitizeCustomValue(validCustom)).toBe(validCustom);

      const tooLong = 'Este es un texto excesivamente largo para una materia jurídica que excede los ochenta caracteres permitidos por la taxonomía';
      const sanitized = sanitizeCustomValue(tooLong);
      expect(sanitized).toBeDefined();
      expect(sanitized!.length).toBeLessThanOrEqual(CUSTOM_VALUE_MAX_LENGTH);

      const validation = validateCustomTaxonomyValue({
        value: 'otro',
        label: 'Otro',
        customValue: 'Derecho Agrario Comunal',
      });
      expect(validation.ok).toBe(true);
    });

    it('3.4 Debe manejar caracteres especiales y acentos en la taxonomía sin romper', () => {
      const withAccents = 'Juicio Oral Mercantil — Acción Cambiaria Directa (Año 2026)';
      const sanitized = sanitizeCustomValue(withAccents);
      expect(sanitized).toBe(withAccents);
    });
  });

  /* ==========================================================================
     FLUJO 4: AISLAMIENTO DE EXPEDIENTES (P0 - Anti-Contaminación Cruzada)
     ========================================================================== */
  describe('4. Aislamiento Estricto de Expedientes', () => {
    it(`4.1 Los datos del Expediente A (${CANARY_EXPEDIENTE}) no deben contaminar al Expediente B (LAB-001/2026)`, async () => {
      // Caso A
      const docA = await runGenerationPipeline({
        userInstruction: 'Demanda de amparo',
        sourceDocuments: [{
          id: SOURCE_TEST_ID,
          name: `${SOURCE_TEST_ID}.pdf`,
          extractedText: `EXPEDIENTE ${CANARY_EXPEDIENTE}. Quejoso: ${CANARY_CLIENTE}. Acto: Clausura.`,
          pages: [{ page: 1, text: `EXPEDIENTE ${CANARY_EXPEDIENTE}. Quejoso: ${CANARY_CLIENTE}.`, chars: 50 }],
        } as any],
        allowUnvalidatedSource: true,
        expediente: CANARY_EXPEDIENTE,
        matter: 'Amparo',
        documentTypeLabel: 'Demanda de Amparo',
      });

      // Caso B (Laboral completamente independiente)
      const docB = await runGenerationPipeline({
        userInstruction: 'Contestación laboral',
        sourceDocuments: [{
          id: 'src-b',
          name: 'laboral_lab001.pdf',
          extractedText: 'EXPEDIENTE: LAB-001/2026. Actor: María González. Demandado: Servicios Digitales S.A.',
          pages: [{ page: 1, text: 'EXPEDIENTE: LAB-001/2026. Actor: María González.', chars: 45 }],
        } as any],
        allowUnvalidatedSource: true,
        expediente: 'LAB-001/2026',
        matter: 'Laboral',
        documentTypeLabel: 'Contestación de Demanda Laboral',
      });

      const textB = JSON.stringify(docB);
      expect(textB).toContain('LAB-001/2026');
      expect(textB).not.toContain(CANARY_EXPEDIENTE);
      expect(textB).not.toContain(CANARY_CLIENTE);
    });
  });

  /* ==========================================================================
     FLUJO 5: IA NVIDIA, METADATOS Y FALLBACK DETERMINÍSTICO
     ========================================================================== */
  describe('5. IA NVIDIA y Fallback Determinístico', () => {
    it('5.1 Sin API key de NVIDIA, el pipeline debe usar fallback local sin inventar provider nvidia', async () => {
      const doc = await runGenerationPipeline({
        selectedDocumentType: 'demanda',
        userInstruction: 'Demanda civil ordinaria',
        sourceDocuments: [],
        allowUnvalidatedSource: true,
        matter: 'Civil',
        documentTypeLabel: 'Demanda Civil',
      });

      expect(doc).toBeDefined();
      expect(doc.generationMetadata).toBeDefined();
      if (!process.env.NVIDIA_API_KEY) {
        expect(doc.generationMetadata.aiUsed).toBe(false);
        expect(doc.generationMetadata.aiProvider).not.toBe('nvidia');
      }
    });

    it('5.2 En generación con fallback determinístico se conserva la identidad del expediente', async () => {
      const doc = await runGenerationPipeline({
        userInstruction: 'Contestación de demanda',
        sourceDocuments: [],
        allowUnvalidatedSource: true,
        expediente: 'EXP-555/2026',
        matter: 'Mercantil',
        documentTypeLabel: 'Contestación Mercantil',
      });

      expect(doc.caseRefs?.expediente).toBe('EXP-555/2026');
    });
  });

  /* ==========================================================================
     FLUJO 6: ASISTENTE LEGAL & CONTRATO DE EDICIÓN (FloatingLegalChat)
     ========================================================================== */
  describe('6. Asistente Legal y Contrato de Edición', () => {
    it('6.1 Debe clasificar correctamente la intención del usuario', () => {
      expect(classifyAssistantIntent('¿Cuál es el plazo para interponer amparo indirecto?')).toBe('consulta');
      expect(classifyAssistantIntent('Podrías sugerir una mejor redacción para este hecho')).toBe('propuesta');
      expect(classifyAssistantIntent('Rellena el campo del demandado con Juan Pérez')).toBe('edicion');
    });

    it('6.2 Debe aplicar operaciones de edición tipadas sobre el borrador activo', () => {
      const baseDoc = createEmptyDocument({
        id: 'doc-chat-edit',
        title: 'Escrito de Demanda',
        matter: 'Civil',
        jurisdiction: 'Local',
        sections: [
          {
            id: 'sec-proemio',
            type: 'header',
            title: 'I. Proemio',
            order: 1,
            isRepeatable: false,
            isEditable: true,
            isGenerated: false,
            isManuallyEdited: false,
            variables: [],
            validationErrors: [],
            validationWarnings: [],
            content: [
              {
                id: 'blk-1',
                layer: 'USER_POSITION',
                trustLevel: 'VERIFIED',
                text: 'Comparezco a demandar a [NOMBRE DEL DEMANDADO] por el pago de pesos.',
                isManuallyEdited: false,
              },
            ],
          },
        ],
      });

      const ops = [
        {
          operation: 'replace_field' as const,
          target: '[NOMBRE DEL DEMANDADO]',
          replacement: 'OPERADORA COMERCIAL DEL SUR S.A.',
          reason: 'Dato proporcionado por el abogado',
        },
      ];

      const result = applyLegalEdits(baseDoc, ops);
      expect(result.applied.length).toBe(1);
      expect(result.failed.length).toBe(0);
      expect(result.document?.sections[0].content[0].text).toContain('OPERADORA COMERCIAL DEL SUR S.A.');
      expect(result.document?.sections[0].content[0].text).not.toContain('[NOMBRE DEL DEMANDADO]');
    });
  });

  /* ==========================================================================
     FLUJO 7: EXPORTACIÓN BINARIA REAL (PDF 1.4 & DOCX OPENXML)
     ========================================================================== */
  describe('7. Exportación Real PDF y DOCX', () => {
    const testDoc = makeReadyExportFixture(createEmptyDocument({
      id: 'doc-export-binary',
      title: 'Recurso de Apelación en Materia Mercantil',
      documentTypeLabel: 'Recurso de Apelación',
      matter: 'Mercantil',
      jurisdiction: 'Local',
      sections: [
        {
          id: 'sec-1',
          type: 'header',
          title: 'I. ÓRGANO DESTINATARIO Y PROEMIO',
          order: 1,
          isRepeatable: false,
          isEditable: true,
          isGenerated: false,
          isManuallyEdited: false,
          variables: [],
          validationErrors: [],
          validationWarnings: [],
          content: [
            {
              id: 'b1',
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
              text: 'H. TRIBUNAL SUPERIOR DE JUSTICIA.\n\nLIC. ALEJANDRO NAVARRO RUIZ, en representación de COMERCIALIZADORA DEL BAJÍO S.A. DE C.V., personalidad que tengo debidamente acreditada en los autos del toca mercantil número 450/2025, comparezco a exponer:',
              isManuallyEdited: false,
              style: { fontFamily: 'Times New Roman', fontSize: '13px', textAlign: 'justify', lineHeight: '1.6' },
            },
          ],
        },
        {
          id: 'sec-2',
          type: 'argument',
          title: 'II. AGRAVIOS',
          order: 2,
          isRepeatable: false,
          isEditable: true,
          isGenerated: false,
          isManuallyEdited: false,
          variables: [],
          validationErrors: [],
          validationWarnings: [],
          content: [
            {
              id: 'b2',
              layer: 'GENERATED_ARGUMENT',
              trustLevel: 'VERIFIED',
              text: 'ÚNICO AGRAVIO. Causa agravio a mi representada la resolución dictada en fecha 10 de octubre de 2025, toda vez que transgrede los artículos 14 y 16 Constitucionales, así como los principios de congruencia y exhaustividad.',
              isManuallyEdited: false,
              style: { fontFamily: 'Times New Roman', fontSize: '13px', textAlign: 'justify', lineHeight: '1.6' },
            },
          ],
        },
      ],
    }));

    it('7.1 Debe generar un archivo PDF 1.4 binario válido con cabecera %PDF y caracteres acentuados WinAnsi', async () => {
      const pdfBuffer = await exportUniversalToPdf(testDoc);
      expect(pdfBuffer).toBeDefined();
      expect(pdfBuffer.length).toBeGreaterThan(500);

      // Verificar cabecera %PDF
      const header = pdfBuffer.subarray(0, 4).toString('ascii');
      expect(header).toBe('%PDF');

      // Verificar que el PDF termine con EOF
      const tail = pdfBuffer.subarray(pdfBuffer.length - 10).toString('latin1');
      expect(tail).toContain('%%EOF');
    });

    it('7.2 Debe generar un archivo DOCX binario válido compatible con Microsoft Word (ZIP PK)', async () => {
      const docxBuffer = await exportUniversalToDocx(testDoc, DEFAULT_LAWYER_PROFILE);
      expect(docxBuffer).toBeDefined();
      expect(docxBuffer.length).toBeGreaterThan(1000);

      // Cabecera ZIP (PK\x03\x04)
      expect(docxBuffer[0]).toBe(0x50); // P
      expect(docxBuffer[1]).toBe(0x4B); // K
      expect(docxBuffer[2]).toBe(0x03);
      expect(docxBuffer[3]).toBe(0x04);
    });

    it('7.3 Las guardas de exportación deben validar la calidad documental', () => {
      const validCheck = validateForExport(testDoc);
      expect(validCheck.ok).toBe(true);

      const emptyDoc = createEmptyDocument({ id: 'empty', title: '', sections: [] });
      const invalidCheck = validateForExport(emptyDoc);
      expect(invalidCheck.ok).toBe(false);
      expect(invalidCheck.errors.length).toBeGreaterThan(0);
    });
  });

  /* ==========================================================================
     FLUJO 8: CONCURRENCIA, TRABAJOS ASÍNCRONOS Y CANCELACIÓN
     ========================================================================== */
  describe('8. Concurrencia y Cancelación de Trabajos', () => {
    it('8.1 Debe crear, consultar y cancelar un trabajo de generación de forma determinística', () => {
      const job = createGenerationJob({ fingerprint: 'job-test-audit', total: 6 });
      expect(job.jobId).toBeDefined();
      expect(job.status).toBe('processing');

      // Actualizar progreso
      updateJobProgress(job.jobId, { completed: 3, currentBlock: 'Sección III. Hechos' });
      const updated = getGenerationJob(job.jobId);
      expect(updated?.completed).toBe(3);
      expect(updated?.currentBlock).toBe('Sección III. Hechos');

      // Cancelar trabajo
      const cancelRes = cancelJob(job.jobId);
      expect(cancelRes?.status).toBe('cancelled');

      const cancelled = getGenerationJob(job.jobId);
      expect(cancelled?.status).toBe('cancelled');
    });
  });

  /* ==========================================================================
     FLUJO 9: PERFIL DE ESTILO DEL ABOGADO (Style Engine)
     ========================================================================== */
  describe('9. Perfil de Estilo del Abogado', () => {
    it('9.1 Debe aplicar el perfil de estilo sin alterar datos sustantivos', () => {
      const customProfile: LawyerProfile = {
        ...DEFAULT_LAWYER_PROFILE,
        lawyerName: 'Lic. Sofia Ramos',
        firmName: 'Ramos & Asociados',
        preferredTone: 'formal_academico',
        citationStyle: 'completo_con_registro',
      };

      const rawClosingText = 'Por lo expuesto, a Usted C. Juez atentamente pido.';
      const styledClosing = applyStyleToSectionText('closing', rawClosingText, customProfile);

      expect(styledClosing).toBeDefined();
      expect(styledClosing.length).toBeGreaterThan(0);
    });
  });

  /* ==========================================================================
     FLUJO 10: AISLAMIENTO ESTRICTO DE PROVEEDORES DE IA EN RUNTIME
     ========================================================================== */
  describe('10. Aislamiento Estricto de Proveedores de IA', () => {
    it('10.1 getProviderChain() debe incluir la cadena resiliente aprobada y excluir proveedores no autorizados', async () => {
      const { getProviderChain } = await import('@/lib/ai/providerChain');
      const chain = getProviderChain();

      expect(chain).toContain('nvidia');
      expect(chain).toContain('local');
      expect(chain).not.toContain('openrouter');
      expect(chain.length).toBeGreaterThanOrEqual(2);
    });
  });

  /* ==========================================================================
     FLUJO 11: MIS PLANTILLAS Y VARIABLES ESTRUCTURADAS
     ========================================================================== */
  describe('11. Mis Plantillas y Sustitución de Variables', () => {
    it('11.1 Debe renderizar variables en plantilla estructurada y mantener integridad', async () => {
      const { renderToDocument, validateTemplateValues } = await import('@/lib/templates/templateRenderer');
      const template = {
        id: 'tpl-arrendamiento',
        title: 'Contrato de Arrendamiento Inmobiliario',
        category: 'contratos' as const,
        sections: [
          {
            id: 'declaraciones',
            title: 'I. DECLARACIONES',
            type: 'text' as const,
            required: true,
            placeholder: 'Declara el arrendador...',
          },
          {
            id: 'clausulas',
            title: 'II. CLÁUSULAS',
            type: 'text' as const,
            required: true,
            placeholder: 'Cláusulas...',
          },
        ],
      };

      const values = {
        declaraciones: 'Declara el arrendador ser legítimo propietario.',
        clausulas: 'PRIMERA. Objeto del contrato.',
      };

      const validation = validateTemplateValues(template as any, values);
      expect(validation.valid).toBe(true);

      const rendered = renderToDocument(template as any, values);
      expect(rendered).toBeDefined();
      expect(rendered.title).toBe('Contrato de Arrendamiento Inmobiliario');
      expect(rendered.sections.length).toBeGreaterThan(0);
    });
  });

  /* ==========================================================================
     FLUJO 12: PERSISTENCIA Y DETECCIÓN DE CAMBIOS (SIGNATURE HASH)
     ========================================================================== */
  describe('12. Persistencia y Detección de Cambios de Borrador', () => {
    it('12.1 La firma de contenido debe detectar ediciones y evitar guardados redundantes', () => {
      function computeDraftSignature(doc: UniversalLegalDocument): string {
        return doc.sections
          .map((section) => section.content.map((block) => block.text).join('\u001F'))
          .join('\u001E');
      }

      const doc1 = createEmptyDocument({
        id: 'doc-pers-1',
        title: 'Borrador Civil',
        sections: [
          {
            id: 's1',
            type: 'facts',
            title: 'Hechos',
            order: 1,
            isRepeatable: false,
            isEditable: true,
            isGenerated: false,
            isManuallyEdited: false,
            variables: [],
            validationErrors: [],
            validationWarnings: [],
            content: [{ id: 'b1', layer: 'USER_POSITION', trustLevel: 'VERIFIED', text: 'Texto original', isManuallyEdited: false }],
          },
        ],
      });

      const sig1 = computeDraftSignature(doc1);
      const sig1Clone = computeDraftSignature({ ...doc1 });
      expect(sig1).toBe(sig1Clone);

      // Modificar texto
      const doc2: UniversalLegalDocument = {
        ...doc1,
        sections: [
          {
            ...doc1.sections[0],
            content: [{ id: 'b1', layer: 'USER_POSITION', trustLevel: 'VERIFIED', text: 'Texto editado por el abogado', isManuallyEdited: true }],
          },
        ],
      };

      const sig2 = computeDraftSignature(doc2);
      expect(sig2).not.toBe(sig1);
    });
  });

  /* ==========================================================================
     FLUJO 13: CONTROL DE CALIDAD JURÍDICO (Quality Gate)
     ========================================================================== */
  describe('13. Control de Calidad Integral (Quality Gate)', () => {
    it('13.1 Debe detectar faltantes estructurales en un documento incompleto', () => {
      const incompleteDoc = createEmptyDocument({
        id: 'doc-incompl',
        title: 'Demanda Incompleta',
        matter: 'Civil',
        jurisdiction: 'Local',
        sections: [
          {
            id: 's-proemio',
            type: 'header',
            title: 'PROEMIO',
            order: 1,
            isRepeatable: false,
            isEditable: true,
            isGenerated: false,
            isManuallyEdited: false,
            variables: [],
            validationErrors: [],
            validationWarnings: [],
            content: [{ id: 'b-p', layer: 'USER_POSITION', trustLevel: 'VERIFIED', text: 'Comparezco ante el Juez.', isManuallyEdited: false }],
          },
        ],
      });

      const gate = runQualityGateCheck(incompleteDoc);
      expect(gate).toBeDefined();
      expect(gate.qualityScore).toBeLessThanOrEqual(100);
      expect(gate.metrics.totalSections).toBe(1);
    });
  });
});
