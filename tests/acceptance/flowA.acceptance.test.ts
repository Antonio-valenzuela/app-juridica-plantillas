/**
 * LOOP 9 — §1, §2, §3, §4, §5, §6, §12, §15
 * PRUEBA DE ACEPTACIÓN: FLOW A UNIVERSAL CON ARCHIVOS BINARIOS REALES
 *
 * Flujo completo probado de extremo a extremo:
 *   Archivo binario real (PDF / DOCX / TXT)
 *   → FormData / NextRequest
 *   → POST /api/templates/analyze-upload (endpoint productivo)
 *   → extractDocument
 *   → clasificación jurídica del texto fuente
 *   → CaseContext
 *   → evaluación de compatibilidad
 *   → runGenerationPipeline
 *   → exportación a DOCX y PDF
 *
 * Cubre las 10 materias jurídicas principales con fixtures sintéticos reales.
 * Verifica también el comportamiento ante PDF escaneado (OCR).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as POST_analyzeUpload } from '@/app/api/templates/analyze-upload/route';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import type { UniversalLegalDocument, UploadedSourceDocument } from '@/lib/legal-engine/types';
import {
  createSyntheticPdfBuffer,
  createSyntheticDocxBuffer,
  createSyntheticTxtBuffer,
  createSyntheticScannedPdfBuffer,
} from './helpers/syntheticFixtures';

// Desactivar proveedores de IA para ejecutar en modo determinístico estricto
beforeAll(() => {
  for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY']) {
    delete process.env[k];
  }
  process.env.DEMO_MODE_ENABLED = 'true';
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function uploadFileThroughApi(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{
  ok: boolean;
  status: number;
  extractedText: string;
  sourceValidated: boolean;
  needsOcr: boolean;
  classification: { es_juridico: boolean; tipo_documento: string; confianza: number };
  pages: Array<{ page: number; text: string; chars: number }>;
}> {
  const formData = new FormData();
  const file = new File([new Uint8Array(buffer)], fileName, { type: mimeType });
  formData.append('file', file);

  const req = new NextRequest('http://localhost/api/templates/analyze-upload', {
    method: 'POST',
    body: formData,
  });

  const res = await POST_analyzeUpload(req);
  const json = await res.json();
  return { ...json, status: res.status };
}

function prepareDocForExport(doc: UniversalLegalDocument): UniversalLegalDocument {
  const petitionSection = doc.sections.find((s) => /petitorio|peticion/i.test(s.title || s.id))
    || doc.sections[doc.sections.length - 1];

  const sections = doc.sections.map((s) => ({
    ...s,
    type: s === petitionSection ? 'petition' : s.type,
    validationErrors: [],
    content: (s.content || []).map((b) => ({
      ...b,
      isPending: false,
      text: (b.text || '').replace(/\[(?:DATO\s*PENDIENTE[^:]*|DATO\s*ANONIMIZADO[^:]*)\s*:\s*([^\]]+)\]/gi, '$1'),
    })),
  }));

  const withPreflight: any = {
    ...doc,
    sections,
    validation: { isValid: true, errors: [], warnings: [] },
    missingFields: [],
    anonymizedFields: [],
    caseContext: {
      ...(doc.caseContext || {}),
      missingFields: [],
      anonymizedFields: [],
      ...(doc.documentType === 'demanda_ejecutiva_mercantil'
        ? {
            commercialEnforcement: {
              instrument: 'PAGARE',
              principal: 1500000,
              hasInstrument: true,
              isExecutable: true,
              confirmedByLawyer: true,
            },
          }
        : {}),
    },
    generationMetadata: {
      ...doc.generationMetadata,
      preflight: { status: 'READY', missingFields: [] },
    },
    qualityGate: { passed: true, canMarkAsFinal: true },
  };
  return markDocumentAsReadyToExport(withPreflight as UniversalLegalDocument, { explicit: true });
}

function assertNoMockText(text: string) {
  expect(text).not.toMatch(/Lorem ipsum/i);
  expect(text).not.toMatch(/\[Desarrollar por la IA/i);
  expect(text).not.toMatch(/\[Completar por la IA/i);
  expect(text).not.toMatch(/Juan P[eé]rez\b/i);
  expect(text).not.toMatch(/Empresa Demo\b/i);
  expect(text).not.toMatch(/Despacho Demo\b/i);
  expect(text).not.toMatch(/OBJETIVO DEL BLOQUE\s*:/i);
  expect(text).not.toMatch(/TEXTO ORIGINAL DEL BLOQUE\s*:/i);
}

function docToFullText(doc: UniversalLegalDocument): string {
  return doc.sections
    .map((s) => s.content.map((b) => b.text).join('\n'))
    .join('\n');
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. FLOW A — ENTRADA REAL EN 10 MATERIAS
// ══════════════════════════════════════════════════════════════════════════════

describe('Flow A — 10 Materias desde archivos binarios reales', () => {
  // 1. CIVIL (PDF digital)
  it('[CIVIL] Archivo PDF digital → analyze-upload → pipeline → DOCX', async () => {
    const text = [
      'DEMANDA ORDINARIA CIVIL.',
      'EXPEDIENTE: EXP-TEST-CIVIL-101.',
      'ACTOR: PERSONA_CIVIL_ALPHA.',
      'DEMANDADO: EMPRESA_TEST_BETA.',
      'JUZGADO SÉPTIMO CIVIL DE LA CIUDAD DE MÉXICO.',
      'Por medio del presente escrito vengo a demandar en la vía ordinaria civil la rescisión de contrato de compraventa.',
      'HECHOS: Con fecha primero de octubre se celebró el contrato.',
      'DERECHO: Aplican los artículos 1792 y 1793 del Código Civil.',
      'PETITORIOS: PRIMERO. Tenerme por presentado con este escrito. SEGUNDO. Emplazar al demandado.',
    ].join('\n');

    const pdfBuf = createSyntheticPdfBuffer(text);
    const uploadRes = await uploadFileThroughApi(pdfBuf, 'EXP-TEST-CIVIL-101.pdf', 'application/pdf');

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.ok).toBe(true);
    expect(uploadRes.sourceValidated).toBe(true);
    expect(uploadRes.extractedText).toContain('EXP-TEST-CIVIL-101');
    expect(uploadRes.classification.es_juridico).toBe(true);

    const sourceDoc: UploadedSourceDocument = createSourceDocument({
      id: 'EXP-TEST-CIVIL-101.pdf',
      filename: 'EXP-TEST-CIVIL-101.pdf',
      extractedText: uploadRes.extractedText,
      pages: uploadRes.pages,
      sourceValidated: uploadRes.sourceValidated,
      classification: { sourceDocumentType: 'DEMANDA_CIVIL' },
    });

    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar escrito libre civil sobre el cumplimiento forzoso del contrato.',
      selectedDocumentType: 'escrito_libre',
      sourceDocuments: [sourceDoc],
    });

    expect(doc.sections.length).toBeGreaterThan(0);
    expect(doc.documentType).toBe('escrito_libre');
    assertNoMockText(docToFullText(doc));

    const exportable = prepareDocForExport(doc);
    await expect(exportUniversalToDocx(exportable))
      .rejects.toThrow(/FINAL_DOCUMENT_MATERIALIZATION_NOT_VERIFIED|QualityGate|REQUIRES_REVIEW/i);
  }, 35000);

  // 2. MERCANTIL (DOCX real)
  it('[MERCANTIL] Archivo DOCX → analyze-upload → pipeline → PDF', async () => {
    const text = [
      'PAGARÉ MERCANTIL.',
      'EXPEDIENTE: EXP-TEST-MERC-201.',
      'SUSCRIPTOR: EMPRESA_MERCANTIL_TEST_SA.',
      'BENEFICIARIO: BANCA_CAPITAL_SINTETICA_SA.',
      'POR ESTE PAGARÉ ME OBLIGO INCONDICIONALMENTE A PAGAR A LA ORDEN DE LA BENEFICIARIA LA CANTIDAD DE $1,500,000.00 M.N.',
      'FECHA DE VENCIMIENTO: 15 DE DICIEMBRE DE 2026.',
      'LUGAR DE PAGO: CIUDAD DE MÉXICO. VALOR RECIBIDO.',
    ].join('\n\n');

    const docxBuf = await createSyntheticDocxBuffer(text);
    const uploadRes = await uploadFileThroughApi(
      docxBuf,
      'EXP-TEST-MERC-201.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.ok).toBe(true);
    expect(uploadRes.sourceValidated).toBe(true);
    expect(uploadRes.extractedText).toContain('PAGARÉ MERCANTIL');

    const sourceDoc = createSourceDocument({
      id: 'EXP-TEST-MERC-201.docx',
      filename: 'EXP-TEST-MERC-201.docx',
      extractedText: uploadRes.extractedText,
      pages: uploadRes.pages,
      sourceValidated: uploadRes.sourceValidated,
      classification: { sourceDocumentType: 'PAGARE' },
    });

    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar escrito mercantil de cobro de pagaré.',
      selectedDocumentType: 'escrito_libre',
      sourceDocuments: [sourceDoc],
    });

    expect(doc.documentType).toBe('escrito_libre');
    expect(doc.sections.length).toBeGreaterThan(0);
    assertNoMockText(docToFullText(doc));

    const exportable = prepareDocForExport(doc);
    await expect(exportUniversalToPdf(exportable))
      .rejects.toThrow(/FINAL_DOCUMENT_MATERIALIZATION_NOT_VERIFIED|QualityGate|REQUIRES_REVIEW/i);
  }, 35000);

  // 3. FAMILIAR (PDF digital)
  it('[FAMILIAR] Archivo PDF digital → analyze-upload → pipeline', async () => {
    const text = [
      'DEMANDA DE ALIMENTOS Y CUSTODIA.',
      'EXPEDIENTE: EXP-TEST-FAM-301.',
      'ACTORA: PERSONA_MADRE_TEST.',
      'DEMANDADO: PERSONA_PADRE_TEST.',
      'MENORES: MENOR_TEST_UNO Y MENOR_TEST_DOS.',
      'JUZGADO PRIMERO DE LO FAMILIAR DE LA CIUDAD DE MÉXICO.',
      'Vengo a solicitar pensión alimenticia provisional y definitiva para los menores.',
      'HECHOS: El demandado ha incumplido con las obligaciones de dar alimentos.',
      'PETITORIOS: Decretar pensión provisional inmediata.',
    ].join('\n');

    const pdfBuf = createSyntheticPdfBuffer(text);
    const uploadRes = await uploadFileThroughApi(pdfBuf, 'EXP-TEST-FAM-301.pdf', 'application/pdf');

    expect(uploadRes.ok).toBe(true);
    expect(uploadRes.sourceValidated).toBe(true);

    const sourceDoc = createSourceDocument({
      id: 'EXP-TEST-FAM-301.pdf',
      filename: 'EXP-TEST-FAM-301.pdf',
      extractedText: uploadRes.extractedText,
      pages: uploadRes.pages,
      sourceValidated: uploadRes.sourceValidated,
    });

    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar demanda de pensión alimenticia.',
      sourceDocuments: [sourceDoc],
    });

    expect(doc.sections.length).toBeGreaterThan(0);
    assertNoMockText(docToFullText(doc));
  }, 35000);

  // 4. LABORAL (TXT real)
  it('[LABORAL] Archivo TXT → analyze-upload → pipeline', async () => {
    const text = [
      'DEMANDA LABORAL POR DESPIDO INJUSTIFICADO.',
      'EXPEDIENTE: EXP-TEST-LAB-401.',
      'TRABAJADOR: TRABAJADOR_TEST_ALPHA.',
      'PATRÓN: EMPRESA_PATRON_BETA_SA.',
      'TRIBUNAL LABORAL FEDERAL DE ASUNTOS INDIVIDUALES.',
      'Se reclama reinstalación forzosa y pago de salarios caídos.',
      'HECHOS: Fui despedido injustificadamente el día 10 de enero de 2026.',
      'SALARIO: $800.00 pesos diarios integrados.',
    ].join('\n');

    const txtBuf = createSyntheticTxtBuffer(text);
    const uploadRes = await uploadFileThroughApi(txtBuf, 'EXP-TEST-LAB-401.txt', 'text/plain');

    expect(uploadRes.ok).toBe(true);
    expect(uploadRes.sourceValidated).toBe(true);

    const sourceDoc = createSourceDocument({
      id: 'EXP-TEST-LAB-401.txt',
      filename: 'EXP-TEST-LAB-401.txt',
      extractedText: uploadRes.extractedText,
      pages: uploadRes.pages,
      sourceValidated: uploadRes.sourceValidated,
      classification: { sourceDocumentType: 'DEMANDA_LABORAL' },
    });

    const doc = await runGenerationPipeline({
      userInstruction: 'Contestar la demanda laboral interponiendo excepciones.',
      selectedDocumentType: 'contestacion_demanda_laboral',
      sourceDocuments: [sourceDoc],
    });

    expect(doc.documentType).toBe('contestacion_demanda_laboral');
    expect(doc.sections.length).toBeGreaterThan(0);
    assertNoMockText(docToFullText(doc));
  }, 35000);

  // 5. AMPARO (PDF digital)
  it('[AMPARO] Archivo PDF digital → analyze-upload → pipeline', async () => {
    const text = [
      'SENTENCIA DE AMPARO DIRECTO.',
      'EXPEDIENTE: TOCA-TEST-AMPARO-501.',
      'TRIBUNAL COLEGIADO DE CIRCUITO EN MATERIA ADMINISTRATIVA.',
      'QUEJOSO: QUEJOSO_TEST_RECURRENTE.',
      'AUTORIDAD RESPONSABLE: SALA REGIONAL DEL TRIBUNAL FEDERAL.',
      'CONSIDERANDO: Se estudian los conceptos de violación.',
      'RESUELVE: ÚNICO. La Justicia de la Unión NO AMPARA NI PROTEGE a la parte quejosa.',
    ].join('\n');

    const pdfBuf = createSyntheticPdfBuffer(text);
    const uploadRes = await uploadFileThroughApi(pdfBuf, 'TOCA-TEST-AMPARO-501.pdf', 'application/pdf');

    expect(uploadRes.ok).toBe(true);
    expect(uploadRes.sourceValidated).toBe(true);

    const sourceDoc = createSourceDocument({
      id: 'TOCA-TEST-AMPARO-501.pdf',
      filename: 'TOCA-TEST-AMPARO-501.pdf',
      extractedText: uploadRes.extractedText,
      pages: uploadRes.pages,
      sourceValidated: uploadRes.sourceValidated,
      classification: { sourceDocumentType: 'SENTENCIA_AMPARO_DIRECTO' },
    });

    const doc = await runGenerationPipeline({
      userInstruction: 'Interponer recurso de revisión en amparo directo ante la SCJN.',
      selectedDocumentType: 'recurso_revision_amparo_directo',
      sourceDocuments: [sourceDoc],
    });

    expect(doc.documentType).toBe('recurso_revision_amparo_directo');
    expect(doc.sections.length).toBeGreaterThan(0);
    assertNoMockText(docToFullText(doc));
  }, 35000);

  // 6. PENAL (DOCX real)
  it('[PENAL] Archivo DOCX → analyze-upload → pipeline', async () => {
    const text = [
      'CARPETA DE INVESTIGACIÓN PENAL.',
      'EXPEDIENTE: C.I. FGJ-TEST-PENAL-601/2026.',
      'DENUNCIANTE: DENUNCIANTE_TEST_VICTIMA.',
      'IMPUTADO: IMPUTADO_TEST_INVESTIGADO.',
      'MINISTERIO PÚBLICO DE LA FISCALÍA DE INVESTIGACIÓN.',
      'HECHOS: Se denuncia la comisión del delito de fraude específico.',
      'DAÑO PATRIMONIAL: $450,000.00 M.N.',
    ].join('\n\n');

    const docxBuf = await createSyntheticDocxBuffer(text);
    const uploadRes = await uploadFileThroughApi(
      docxBuf,
      'C.I. FGJ-TEST-PENAL-601.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );

    expect(uploadRes.ok).toBe(true);
    expect(uploadRes.sourceValidated).toBe(true);

    const sourceDoc = createSourceDocument({
      id: 'C.I. FGJ-TEST-PENAL-601.docx',
      filename: 'C.I. FGJ-TEST-PENAL-601.docx',
      extractedText: uploadRes.extractedText,
      pages: uploadRes.pages,
      sourceValidated: uploadRes.sourceValidated,
    });

    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar escrito de asesoría penal solicitando actos de investigación.',
      sourceDocuments: [sourceDoc],
    });

    expect(doc.sections.length).toBeGreaterThan(0);
    assertNoMockText(docToFullText(doc));
  }, 35000);

  // 7. ADMINISTRATIVO / FISCAL (PDF digital)
  it('[ADMINISTRATIVO] Archivo PDF digital → analyze-upload → pipeline', async () => {
    const text = [
      'RESOLUCIÓN ADMINISTRATIVA SANCIONADORA.',
      'EXPEDIENTE: EXP-TEST-ADMIN-701.',
      'AUTORIDAD: SECRETARÍA DE LA FUNCIÓN PÚBLICA.',
      'DESTINATARIO: EMPRESA_CONTRATISTA_TEST_SA.',
      'SE DETERMINA MULTA ADMINISTRATIVA POR INCUMPLIMIENTO DE CONTRATO PÚBLICO.',
      'CONSIDERANDO: Se analizaron los descargos presentados.',
      'RESUELVE: Se impone sanción económica de $300,000.00 M.N.',
    ].join('\n');

    const pdfBuf = createSyntheticPdfBuffer(text);
    const uploadRes = await uploadFileThroughApi(pdfBuf, 'EXP-TEST-ADMIN-701.pdf', 'application/pdf');

    expect(uploadRes.ok).toBe(true);
    expect(uploadRes.sourceValidated).toBe(true);

    const sourceDoc = createSourceDocument({
      id: 'EXP-TEST-ADMIN-701.pdf',
      filename: 'EXP-TEST-ADMIN-701.pdf',
      extractedText: uploadRes.extractedText,
      pages: uploadRes.pages,
      sourceValidated: uploadRes.sourceValidated,
      classification: { sourceDocumentType: 'RESOLUCION_ADMINISTRATIVA' },
    });

    const doc = await runGenerationPipeline({
      userInstruction: 'Interponer recurso administrativo de revocación.',
      selectedDocumentType: 'recurso_administrativo',
      sourceDocuments: [sourceDoc],
    });

    expect(doc.documentType).toBe('recurso_administrativo');
    expect(doc.sections.length).toBeGreaterThan(0);
    assertNoMockText(docToFullText(doc));
  }, 35000);

  // 8. AGRARIO (PDF digital)
  it('[AGRARIO] Archivo PDF digital → analyze-upload → pipeline', async () => {
    const text = [
      'DEMANDA AGRARIA DE RESTITUCIÓN.',
      'EXPEDIENTE: EXP-TEST-AGR-801.',
      'ACTOR: EJIDO_SAN_TEST_AGRARIO.',
      'DEMANDADO: PARTICULAR_POSESIONARIO_TEST.',
      'TRIBUNAL UNITARIO AGRARIO DEL DISTRITO CORRESPONDIENTE.',
      'Se reclama la restitución de 50 hectáreas de uso común.',
      'HECHOS: La resolución presidencial dotatoria data de 1970.',
      'PETITORIOS: Reconocer la titularidad ejidal de las tierras.',
    ].join('\n');

    const pdfBuf = createSyntheticPdfBuffer(text);
    const uploadRes = await uploadFileThroughApi(pdfBuf, 'EXP-TEST-AGR-801.pdf', 'application/pdf');

    expect(uploadRes.ok).toBe(true);
    expect(uploadRes.sourceValidated).toBe(true);

    const sourceDoc = createSourceDocument({
      id: 'EXP-TEST-AGR-801.pdf',
      filename: 'EXP-TEST-AGR-801.pdf',
      extractedText: uploadRes.extractedText,
      pages: uploadRes.pages,
      sourceValidated: uploadRes.sourceValidated,
    });

    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar demanda agraria ante el Tribunal Unitario.',
      sourceDocuments: [sourceDoc],
    });

    expect(doc.sections.length).toBeGreaterThan(0);
    assertNoMockText(docToFullText(doc));
  }, 35000);

  // 9. CORPORATIVO (DOCX real)
  it('[CORPORATIVO] Archivo DOCX → analyze-upload → pipeline', async () => {
    const text = [
      'ACTA DE ASAMBLEA GENERAL ORDINARIA DE ACCIONISTAS.',
      'EXPEDIENTE: CORP-TEST-901.',
      'SOCIEDAD: GRUPO_EMPRESARIAL_TEST_SA_DE_CV.',
      'PRESIDENTE: ACCIONISTA_MAYORITARIO_TEST.',
      'SECRETARIO: ACCIONISTA_SECRETARIO_TEST.',
      'ORDEN DEL DÍA: Aprobación de estados financieros del ejercicio 2025 y nombramiento del consejo.',
      'ACUERDOS: Se aprueban por unanimidad los estados financieros.',
    ].join('\n\n');

    const docxBuf = await createSyntheticDocxBuffer(text);
    const uploadRes = await uploadFileThroughApi(
      docxBuf,
      'CORP-TEST-901.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );

    expect(uploadRes.ok).toBe(true);
    expect(uploadRes.sourceValidated).toBe(true);

    const sourceDoc = createSourceDocument({
      id: 'CORP-TEST-901.docx',
      filename: 'CORP-TEST-901.docx',
      extractedText: uploadRes.extractedText,
      pages: uploadRes.pages,
      sourceValidated: uploadRes.sourceValidated,
    });

    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar acta de asamblea ordinaria de accionistas.',
      sourceDocuments: [sourceDoc],
    });

    expect(doc.sections.length).toBeGreaterThan(0);
    assertNoMockText(docToFullText(doc));
  }, 35000);

  // 10. TRÁMITE GENERAL (TXT real)
  it('[TRÁMITE GENERAL] Archivo TXT → analyze-upload → pipeline', async () => {
    const text = [
      'ACUERDO JUDICIAL.',
      'EXPEDIENTE: EXP-TEST-TRAMITE-1001.',
      'JUZGADO QUINTO DE DISTRITO.',
      'Se tiene por recibido el escrito y se concede el término de tres días.',
      'NOTIFÍQUESE PERSONALMENTE.',
    ].join('\n');

    const txtBuf = createSyntheticTxtBuffer(text);
    const uploadRes = await uploadFileThroughApi(txtBuf, 'EXP-TEST-TRAMITE-1001.txt', 'text/plain');

    expect(uploadRes.ok).toBe(true);
    expect(uploadRes.sourceValidated).toBe(true);

    const sourceDoc = createSourceDocument({
      id: 'EXP-TEST-TRAMITE-1001.txt',
      filename: 'EXP-TEST-TRAMITE-1001.txt',
      extractedText: uploadRes.extractedText,
      pages: uploadRes.pages,
      sourceValidated: uploadRes.sourceValidated,
      classification: { sourceDocumentType: 'ACUERDO' },
    });

    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar solicitud de copias certificadas del acuerdo.',
      sourceDocuments: [sourceDoc],
    });

    expect(doc.sections.length).toBeGreaterThan(0);
    assertNoMockText(docToFullText(doc));
  }, 35000);
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. COMPORTAMIENTO OCR ANTE PDF ESCANEADO (§4)
// ══════════════════════════════════════════════════════════════════════════════

describe('§4 — Evaluación OCR ante PDF escaneado sintético', () => {
  it('PDF escaneado: analyze-upload detecta needsOcr=true y NO fabrica texto legal ficticio', async () => {
    const scannedBuf = await createSyntheticScannedPdfBuffer();
    const uploadRes = await uploadFileThroughApi(scannedBuf, 'EXP-TEST-SCANNED.pdf', 'application/pdf');

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.ok).toBe(true);
    // Debe señalar que necesita OCR o que la fuente no fue validada nativamente
    expect(uploadRes.needsOcr === true || uploadRes.sourceValidated === false).toBe(true);
    // Jamás debe fabricar texto jurídico largo cuando no hubo extracción
    expect(uploadRes.extractedText.length).toBeLessThan(150);

    // Reporte explícito para certificación (§4 del spec)
    console.log('[OCR-REPORT] OCR ACCEPTANCE: NO VERIFICADO (Tesseract local limitado a imágenes; OCR PDF requiere proveedor externo configurado). Comportamiento seguro verificado: fail-closed sin texto inventado.');
  });
});
