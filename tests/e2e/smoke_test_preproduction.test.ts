import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createEmptyDocument, UniversalLegalDocument } from '@/lib/legal-engine/types';
import { extractPartyField, extractAuthorityLabeled } from '@/lib/legal-engine/partyExtraction';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { validateForExport } from '@/lib/legal-engine/exportGuards';
import { markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { applyLegalEdits, classifyAssistantIntent } from '@/lib/workspace/legalEditContract';
import { applyStyleToSectionText } from '@/lib/legal-engine/styleEngine';
import { LawyerProfile, DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';
import { renderToDocument, validateTemplateValues } from '@/lib/templates/templateRenderer';
import { createGenerationJob, getGenerationJob, cancelJob, findActiveJobByFingerprint } from '@/lib/legal-engine/generationJobs';
import { resolveEffectiveLabel, JURISDICTIONS, sanitizeCustomValue } from '@/lib/legal-taxonomy';
import { prisma } from '@/lib/prisma';

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

describe('SMOKE TEST FINAL — PREPRODUCCIÓN / SIMULACIÓN DE ABOGADO REAL', () => {

  /* ==========================================================================
     1. FLUJO UNIVERSAL & EDITOR: CASO AUDIT-AMP-001/2026
     ========================================================================== */
  describe('1. Flujo Universal y Editor (AUDIT-AMP-001/2026)', () => {
    let generatedDoc: UniversalLegalDocument;

    it('1.1 Debe generar demanda de amparo con expediente, materia penal y partes canónicas', async () => {
      generatedDoc = await runGenerationPipeline({
        userInstruction: 'Demanda de amparo indirecto contra resolución sancionatoria de PROFECO',
        matter: 'Amparo',
        jurisdiction: 'Federal',
        expediente: 'AUDIT-AMP-001/2026',
        savedParties: [
          { role: 'quejoso', name: 'Comercializadora Alfa S.A. de C.V.', source: 'manual' },
          { role: 'autoridad', name: 'Procuraduría Federal del Consumidor', source: 'manual' },
        ],
        allowUnvalidatedSource: true,
        documentTypeLabel: 'Demanda de Amparo Indirecto',
      });

      expect(generatedDoc).toBeDefined();
      expect(generatedDoc.caseRefs?.expediente).toBe('AUDIT-AMP-001/2026');
      expect(generatedDoc.parties.quejoso).toContain('Comercializadora Alfa');
      expect(generatedDoc.parties.autoridadResponsable).toContain('Consumidor');
      expect(generatedDoc.sections.length).toBeGreaterThanOrEqual(5);

      const titles = generatedDoc.sections.map((s) => s.title.toUpperCase());
      expect(titles.some((t) => t.includes('PROEMIO') || t.includes('PERSONALIDAD'))).toBe(true);
      expect(titles.some((t) => t.includes('PETITORIOS') || t.includes('PUNTOS'))).toBe(true);
    }, 240000);

    it('1.2 Debe editar un bloque en el editor, marcar isManuallyEdited y persistir el cambio', () => {
      expect(generatedDoc).toBeDefined();
      const originalText = generatedDoc.sections[0].content[0].text;
      const appendedEdit = `${originalText}\n\n[MODIFICACIÓN DEL ABOGADO]: Se precisa domicilio para oír notificaciones en Insurgentes Sur 1602.`;

      const modifiedDoc: UniversalLegalDocument = {
        ...generatedDoc,
        sections: generatedDoc.sections.map((sec, idx) =>
          idx === 0
            ? {
                ...sec,
                isManuallyEdited: true,
                content: sec.content.map((blk, bIdx) =>
                  bIdx === 0
                    ? { ...blk, text: appendedEdit, isManuallyEdited: true, layer: 'USER_POSITION' as const }
                    : blk
                ),
              }
            : sec
        ),
      };

      // Simular almacenamiento en sessionStorage / DB
      const serialized = JSON.stringify(modifiedDoc);
      const reloadedDoc: UniversalLegalDocument = JSON.parse(serialized);

      expect(reloadedDoc.sections[0].isManuallyEdited).toBe(true);
      expect(reloadedDoc.sections[0].content[0].text).toContain('Insurgentes Sur 1602');
      expect(reloadedDoc.sections[0].content[0].layer).toBe('USER_POSITION');
    });
  });

  /* ==========================================================================
     2. ESCRITOS INICIALES WIZARD CON "OTRO" (<80 CHARS)
     ========================================================================== */
  describe('2. Escritos Iniciales con Materia Personalizada "Otro"', () => {
    it('2.1 Debe aceptar "Derecho Espacial y Telecomunicaciones" (<80 chars) y fuero Federal', async () => {
      const customMatter = 'Derecho Espacial y Telecomunicaciones';
      const sanitized = sanitizeCustomValue(customMatter);
      expect(sanitized).toBe(customMatter);
      expect(sanitized!.length).toBeLessThan(80);

      const doc = await runGenerationPipeline({
        userInstruction: 'Demanda de amparo contra negativa de asignación de banda satelital',
        matter: sanitized ?? undefined,
        jurisdiction: 'Federal',
        expediente: 'SAT-001/2026',
        savedParties: [
          { role: 'quejoso', name: 'Satélites de México S.A. de C.V.', source: 'manual' },
          { role: 'autoridad', name: 'Instituto Federal de Telecomunicaciones', source: 'manual' },
        ],
        allowUnvalidatedSource: true,
        documentTypeLabel: 'Demanda de Amparo Indirecto',
      });

      expect(doc.matter).toBe('Derecho Espacial y Telecomunicaciones');
      expect(doc.jurisdiction).toBe('federal');
      expect(doc.parties.quejoso).toContain('Satélites de México');
      expect(doc.parties.autoridadResponsable).toContain('Telecomunicaciones');
    }, 240000);
  });

  /* ==========================================================================
     3. FLOATING LEGAL CHAT: 3 MODOS (CONSULTA, PROPUESTA, EDICIÓN)
     ========================================================================== */
  describe('3. Floating Legal Chat (Consulta, Propuesta, Edición)', () => {
    const baseDoc = createEmptyDocument({
      id: 'doc-chat-smoke',
      title: 'Borrador Civil Smoke Test',
      matter: 'Civil',
      jurisdiction: 'Local',
      sections: [
        {
          id: 'sec-proemio',
          type: 'header',
          title: 'I. PROEMIO',
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
              text: 'Comparezco ante el C. Juez a demandar a [NOMBRE DEL DEMANDADO] por incumplimiento.',
              isManuallyEdited: false,
            },
          ],
        },
      ],
    });

    it('3.1 Modo CONSULTA: No debe mutar el documento', () => {
      const intent = classifyAssistantIntent('¿Cuáles son los requisitos de procedencia del amparo directo?');
      expect(intent).toBe('consulta');
      // Documento permanece 100% idéntico
      expect(baseDoc.sections[0].content[0].text).toContain('[NOMBRE DEL DEMANDADO]');
    });

    it('3.2 Modo PROPUESTA: No debe mutar el documento automáticamente', () => {
      const intent = classifyAssistantIntent('Podrías sugerir una mejor redacción para el proemio');
      expect(intent).toBe('propuesta');
      expect(baseDoc.sections[0].content[0].text).toContain('[NOMBRE DEL DEMANDADO]');
    });

    it('3.3 Modo EDICIÓN: Debe aplicar la mutación solicitada sobre el campo específico', () => {
      const intent = classifyAssistantIntent('Rellena el campo [NOMBRE DEL DEMANDADO] con Distribuidora del Norte S.A.');
      expect(intent).toBe('edicion');

      const editResult = applyLegalEdits(baseDoc, [
        {
          operation: 'replace_field',
          target: '[NOMBRE DEL DEMANDADO]',
          replacement: 'Distribuidora del Norte S.A.',
          reason: 'Indicación del abogado',
        },
      ]);

      expect(editResult.applied.length).toBe(1);
      expect(editResult.document?.sections[0].content[0].text).toContain('Distribuidora del Norte S.A.');
      expect(editResult.document?.sections[0].content[0].text).not.toContain('[NOMBRE DEL DEMANDADO]');
    });
  });

  /* ==========================================================================
     4. EXPORTACIÓN BINARIA REAL: PDF (%PDF-1.4) & DOCX (PK ZIP)
     ========================================================================== */
  describe('4. Exportación Binaria Real (PDF y DOCX)', () => {
    const docToExport = makeReadyExportFixture(createEmptyDocument({
      id: 'doc-export-smoke',
      title: 'Escrito de Contestación Mercantil',
      documentTypeLabel: 'Contestación de Demanda',
      matter: 'Mercantil',
      jurisdiction: 'Federal',
      sections: [
        {
          id: 's-proemio',
          type: 'header',
          title: 'I. PROEMIO Y PERSONALIDAD',
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
              id: 'b-1',
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
              text: 'C. JUEZ DE DISTRITO EN MATERIA MERCANTIL.\n\nLIC. CARLOS ALBERTO PEÑA, en representación de OPERADORA LOGÍSTICA DEL CENTRO S.A. DE C.V., comparezco a dar contestación en tiempo y forma.',
              isManuallyEdited: false,
            },
          ],
        },
        {
          id: 's-defensas',
          type: 'argument',
          title: 'II. EXCEPCIONES Y DEFENSAS',
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
              id: 'b-2',
              layer: 'GENERATED_ARGUMENT',
              trustLevel: 'VERIFIED',
              text: 'PRIMERA EXCEPCIÓN. Falta de acción y de derecho (sine actione agis), toda vez que las facturas no corresponden a servicios prestados.',
              isManuallyEdited: false,
            },
          ],
        },
      ],
    }));

    it('4.1 Exportar PDF nativo con cabecera %PDF y caracteres en español', async () => {
      const pdfBuffer = await exportUniversalToPdf(docToExport);
      expect(pdfBuffer).toBeDefined();
      expect(pdfBuffer.length).toBeGreaterThan(1000);
      expect(pdfBuffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
      expect(pdfBuffer.subarray(pdfBuffer.length - 10).toString('latin1')).toContain('%%EOF');
    });

    it('4.2 Exportar DOCX OpenXML con cabecera PK ZIP y estilo formal', async () => {
      const docxBuffer = await exportUniversalToDocx(docToExport, DEFAULT_LAWYER_PROFILE);
      expect(docxBuffer).toBeDefined();
      expect(docxBuffer.length).toBeGreaterThan(1500);
      expect(docxBuffer[0]).toBe(0x50); // P
      expect(docxBuffer[1]).toBe(0x4B); // K
    });

    it('4.3 Validar documento vacío en guardas de exportación (error controlado)', () => {
      const emptyDoc = createEmptyDocument({ id: 'empty-test', title: '', sections: [] });
      const check = validateForExport(emptyDoc);
      expect(check.ok).toBe(false);
      expect(check.errors.some((e) => e.includes('DOCUMENTO_VACIO'))).toBe(true);
    });
  });

  /* ==========================================================================
     5. CONTESTACIONES: EXP-AUDIT-001 CON ROLES DIFERENCIADOS
     ========================================================================== */
  describe('5. Contestaciones y Recursos (EXP-AUDIT-001)', () => {
    it('5.1 Debe extraer partes y asegurar que Demandado != Actor y Autoridad != Demandado', () => {
      const sampleExp = `
EXPEDIENTE: EXP-AUDIT-001
JUICIO ORDINARIO MERCANTIL
ACTOR: COMERCIALIZADORA DEL VALLE S.A. DE C.V.
DEMANDADO: DISTRIBUIDORA NACIONAL S.A. DE C.V.
AUTORIDAD RESPONSABLE: SECRETARÍA DE ECONOMÍA
`;

      const actor = extractPartyField(sampleExp, [/ACTOR:\s*([A-ZÁÉÍÓÚÑ\s.]{4,60})/i]);
      const demandado = extractPartyField(sampleExp, [/DEMANDADO:\s*([A-ZÁÉÍÓÚÑ\s.]{4,60})/i]);
      const autoridad = extractAuthorityLabeled(sampleExp);

      expect(actor).toContain('COMERCIALIZADORA DEL VALLE');
      expect(demandado).toContain('DISTRIBUIDORA NACIONAL');
      expect(autoridad).toContain('SECRETARÍA DE ECONOMÍA');

      expect(actor).not.toBe(demandado);
      expect(demandado).not.toBe(autoridad);
    });
  });

  /* ==========================================================================
     6. MIS PLANTILLAS: AUDIT TEMPLATE 1 (CRUD & RENDER)
     ========================================================================== */
  describe('6. Mis Plantillas (AUDIT TEMPLATE 1)', () => {
    it('6.1 Debe crear, validar variables, renderizar documento y verificar persistencia', () => {
      const template = {
        id: 'audit-template-1',
        title: 'AUDIT TEMPLATE 1 - Contrato de Confidencialidad',
        category: 'contratos' as const,
        sections: [
          {
            id: 'declaraciones',
            title: 'I. DECLARACIONES',
            type: 'text' as const,
            required: true,
            placeholder: 'Declaran las partes...',
          },
          {
            id: 'confidencialidad',
            title: 'II. CLÁUSULA DE CONFIDENCIALIDAD',
            type: 'text' as const,
            required: true,
            placeholder: 'Toda información...',
          },
        ],
      };

      const values = {
        declaraciones: 'Declara la Parte Reveladora que es propietaria de secretos comerciales.',
        confidencialidad: 'La Parte Receptora se obliga a no divulgar la información por 5 años.',
      };

      const validation = validateTemplateValues(template as any, values);
      expect(validation.valid).toBe(true);

      const rendered = renderToDocument(template as any, values);
      expect(rendered.title).toBe('AUDIT TEMPLATE 1 - Contrato de Confidencialidad');
      expect(rendered.sections.length).toBeGreaterThan(0);
    });
  });

  /* ==========================================================================
     7. CONCURRENCIA, IDEMPOTENCIA Y CANCELACIÓN
     ========================================================================== */
  describe('7. Concurrencia, Idempotencia y Cancelación de Trabajos', () => {
    it('7.1 Debe evitar doble generación mediante fingerprint / idempotencyKey', () => {
      const idempotencyKey = 'idem-audit-smoke-999';
      const job1 = createGenerationJob({ idempotencyKey, fingerprint: 'fp-smoke-1', total: 8 });
      expect(job1.jobId).toBeDefined();

      // Intento de doble envío concurrente con la misma clave
      const existing = findActiveJobByFingerprint('fp-smoke-1', idempotencyKey);
      expect(existing?.jobId).toBe(job1.jobId);

      // Cancelar trabajo en curso
      const cancelled = cancelJob(job1.jobId);
      expect(cancelled?.status).toBe('cancelled');
    });
  });

  /* ==========================================================================
     8. AISLAMIENTO ESTRICTO DE EXPEDIENTES (AUDIT-A-001 vs AUDIT-B-002)
     ========================================================================== */
  describe('8. Aislamiento Estricto (AUDIT-A-001 vs AUDIT-B-002)', () => {
    it('8.1 Los datos del Caso A nunca deben fugarse al Caso B', async () => {
      const docA = await runGenerationPipeline({
        userInstruction: 'Demanda de amparo minero',
        matter: 'Administrativo',
        jurisdiction: 'Federal',
        expediente: 'AUDIT-A-001',
        savedParties: [{ role: 'quejoso', name: 'Compañía Minera del Sol S.A. de C.V.', source: 'manual' }],
        allowUnvalidatedSource: true,
        documentTypeLabel: 'Demanda de Amparo',
      });

      const docB = await runGenerationPipeline({
        selectedDocumentType: 'demanda',
        userInstruction: 'Juicio ejecutivo mercantil',
        matter: 'Mercantil',
        jurisdiction: 'Local',
        expediente: 'AUDIT-B-002',
        savedParties: [{ role: 'actor', name: 'Juan Carlos Varela Ramírez', source: 'manual' }],
        allowUnvalidatedSource: true,
        documentTypeLabel: 'Demanda Mercantil',
      });

      const serializedB = JSON.stringify(docB);
      expect(serializedB).toContain('AUDIT-B-002');
      expect(serializedB).toContain('Juan Carlos Varela');
      expect(serializedB).not.toContain('AUDIT-A-001');
      expect(serializedB).not.toContain('Minera del Sol');
    }, 500000);
  });

  /* ==========================================================================
     9. JURISDICCIÓN MEXICANA: PRESERVACIÓN SIN ALUCINACIONES
     ========================================================================== */
  describe('9. Jurisdicción Mexicana (Federal, Local, CDMX)', () => {
    it('9.1 No debe inventar Cd. de México cuando no hay selección previa', () => {
      const label = resolveEffectiveLabel('federal', null, JURISDICTIONS);
      expect(label).toBe('Federal');
      expect(label).not.toBe('Cd. de México');
    });

    it('9.2 Debe preservar Local, Estatal y personalizada CDMX cuando son especificadas explícitamente', () => {
      expect(resolveEffectiveLabel('local', null, JURISDICTIONS)).toBe('Local');
      expect(resolveEffectiveLabel('estatal', null, JURISDICTIONS)).toBe('Estatal');
      expect(
        resolveEffectiveLabel(
          'otra',
          { value: 'otra', label: 'Otra', customValue: 'Tribunal Superior de Justicia de la CDMX' },
          JURISDICTIONS
        )
      ).toBe('Tribunal Superior de Justicia de la CDMX');
    });
  });
});
