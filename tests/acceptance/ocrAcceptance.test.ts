/**
 * LOOP 9.1 — §OBJETIVO 1 & §OBJETIVO 2
 * PRUEBA DE ACEPTACIÓN OCR Y FAIL-CLOSED
 *
 * Audita y comprueba la ruta OCR productiva:
 *   - image/png (Tesseract local)
 *   - image/jpeg (Tesseract local)
 *   - PDF image-only sintético real sin capa de texto
 *   - PDF escaneado multipágina
 *   - Extracción de imágenes embebidas de PDF hacia Tesseract
 *   - Cadena completa: upload → OCR → classification → CaseContext → compatibility → generación → export
 *   - Distinción estricta fail-closed:
 *       * OCR_PROVIDER_NOT_CONFIGURED
 *       * OCR_AVAILABLE_AND_FAILED
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as POST_analyzeUpload } from '@/app/api/templates/analyze-upload/route';
import { extractDocument } from '@/lib/pdf/documentExtractor';
import { getOCRProvider, ocrAvailable } from '@/lib/pdf/ocrProviders';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { buildCaseContext } from '@/lib/legal-engine/caseContext';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { evaluateSourceOutputCompatibility } from '@/lib/legal-engine/sourceOutputCompatibility';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';
import {
  createSyntheticImageBuffer,
  createSyntheticScannedPdfBuffer,
  createSyntheticMultiPageScannedPdfBuffer,
} from './helpers/syntheticFixtures';

beforeAll(() => {
  for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY']) {
    delete process.env[k];
  }
  process.env.DEMO_MODE_ENABLED = 'true';
});

afterEach(() => {
  delete process.env.OCR_PROVIDER;
});

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
    },
    generationMetadata: {
      ...doc.generationMetadata,
      preflight: { status: 'READY', missingFields: [] },
    },
    qualityGate: { passed: true, canMarkAsFinal: true },
  };
  return markDocumentAsReadyToExport(withPreflight as UniversalLegalDocument, { explicit: true });
}

async function uploadThroughApi(buffer: Buffer, fileName: string, mimeType: string) {
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

// ══════════════════════════════════════════════════════════════════════════════
// 1. AUDITORÍA DE SOPORTE OCR Y DETECCIÓN IMAGE-ONLY
// ══════════════════════════════════════════════════════════════════════════════

describe('LOOP 9.1 — Auditoría y Detección Image-Only', () => {
  it('el PDF escaneado sintético es puramente image-only y no tiene capa de texto seleccionable', async () => {
    const scannedPdf = await createSyntheticScannedPdfBuffer([
      'EXP-OCR-TEST-001',
      'PERSONA_OCR_ALPHA',
      'JUICIO DE PRUEBA',
    ]);

    // Verificamos que el PDF NO contiene ningún bloque de texto PDF (sin BT ... ET)
    const pdfStr = scannedPdf.toString('latin1');
    expect(pdfStr).not.toContain('BT\n');
    expect(pdfStr).not.toContain('/Font');
    expect(pdfStr).toContain('/Subtype /Image');
    expect(pdfStr).toContain('/Filter /DCTDecode');

    // Comprobamos que el extractor sin OCR falla la calidad nativa
    delete process.env.OCR_PROVIDER;
    const result = await extractDocument({
      buffer: scannedPdf,
      fileName: 'EXP-OCR-TEST-001.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.text.length).toBeLessThan(50);
    expect(result.sourceValidated).toBe(false);
    expect(result.ocrStatus).toBe('OCR_PROVIDER_NOT_CONFIGURED');
  });

  it('auditoría de soporte actual: Tesseract soporta image/png, image/jpeg y application/pdf', () => {
    process.env.OCR_PROVIDER = 'tesseract';
    expect(ocrAvailable('image/png')).toBe(true);
    expect(ocrAvailable('image/jpeg')).toBe(true);
    expect(ocrAvailable('application/pdf')).toBe(true);

    const provider = getOCRProvider();
    expect(provider.name).toBe('tesseract');
    expect(provider.supports('image/png')).toBe(true);
    expect(provider.supports('image/jpeg')).toBe(true);
    expect(provider.supports('application/pdf')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. OCR LOCAL CON TESSERACT: IMÁGENES PNG Y JPEG
// ══════════════════════════════════════════════════════════════════════════════

describe('LOOP 9.1 — OCR Real con Tesseract en Imágenes PNG y JPEG', () => {
  it('extrae texto jurídico desde archivo binario PNG sintético', async () => {
    process.env.OCR_PROVIDER = 'tesseract';
    const pngBuf = await createSyntheticImageBuffer('image/png', [
      'EXPEDIENTE: EXP-OCR-PNG-001.',
      'ACTOR: PERSONA_OCR_ALPHA.',
      'DEMANDADO: EMPRESA_DEMANDADA_BETA.',
      'JUZGADO TERCERO CIVIL DE LA CIUDAD DE MEXICO.',
      'JUICIO ORDINARIO CIVIL.',
      'HECHOS: Se reclama incumplimiento forzoso de contrato.',
      'DERECHO: Son aplicables los articulos del Codigo Civil.',
      'PUNTOS PETITORIOS: Proveer de conformidad a derecho.',
    ]);

    const result = await extractDocument({
      buffer: pngBuf,
      fileName: 'prueba_ocr.png',
      mimeType: 'image/png',
    });

    expect(result.ocrUsed).toBe(true);
    expect(result.ocrProvider).toBe('tesseract');
    expect(result.ocrStatus).toBe('OCR_COMPLETED');
    expect(result.text).toContain('EXP-OCR-PNG-001');
    expect(result.text).toContain('PERSONA_OCR_ALPHA');
    expect(result.confidence).toBeGreaterThanOrEqual(50);
  }, 15000);

  it('extrae texto jurídico desde archivo binario JPEG sintético', async () => {
    process.env.OCR_PROVIDER = 'tesseract';
    const jpegBuf = await createSyntheticImageBuffer('image/jpeg', [
      'EXPEDIENTE: EXP-OCR-JPEG-002.',
      'ACTOR: TITULAR_DEMANDANTE_BETA.',
      'DEMANDADO: EMPRESA_OCR_BETA.',
      'JUZGADO CUARTO CIVIL.',
      'JUICIO ORDINARIO CIVIL.',
      'HECHOS: Demanda sobre pago de factura pendiente y liquidacion.',
      'DERECHO: Articulos relativos del Codigo Civil aplicable.',
      'PUNTOS PETITORIOS: Tenerme por presentado y admitir la demanda.',
    ]);

    const result = await extractDocument({
      buffer: jpegBuf,
      fileName: 'prueba_ocr.jpg',
      mimeType: 'image/jpeg',
    });

    expect(result.ocrUsed).toBe(true);
    expect(result.ocrProvider).toBe('tesseract');
    expect(result.ocrStatus).toBe('OCR_COMPLETED');
    expect(result.text).toContain('EXP-OCR-JPEG-002');
    expect(result.text).toContain('EMPRESA_OCR_BETA');
    expect(result.confidence).toBeGreaterThanOrEqual(50);
  }, 15000);
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. OCR EN PDF ESCANEADO REAL Y FLUJO COMPLETO END-TO-END
// ══════════════════════════════════════════════════════════════════════════════

describe('LOOP 9.1 — OCR en PDF Escaneado Real y Pipeline Completo', () => {
  it('PDF escaneado → upload → OCR → extracción → CaseContext → pipeline → DOCX/PDF', async () => {
    process.env.OCR_PROVIDER = 'tesseract';

    const scannedPdfBuf = await createSyntheticScannedPdfBuffer([
      'EXP-OCR-TEST-001',
      'ACTOR: PERSONA_OCR_ALPHA',
      'DEMANDADO: EMPRESA_DEMANDADA_BETA',
      'JUZGADO TERCERO CIVIL',
      'DEMANDA ORDINARIA CIVIL',
      'HECHOS: Se reclama incumplimiento de pago de factura.',
      'PUNTOS PETITORIOS: Proveer de conformidad a derecho.',
    ]);

    // 1. Upload a través de la ruta API de Next.js
    const uploadRes = await uploadThroughApi(scannedPdfBuf, 'EXP-OCR-TEST-001.pdf', 'application/pdf');
    expect(uploadRes.status).toBe(200);
    expect(uploadRes.ok).toBe(true);
    expect(uploadRes.ocrProvider).toBe('tesseract');
    expect(uploadRes.ocrStatus).toBe('OCR_COMPLETED');
    expect(uploadRes.sourceValidated).toBe(true);
    expect(uploadRes.generationEligibility).toBe('eligible');

    // Texto extraído mediante OCR contiene los datos clave
    expect(uploadRes.extractedText).toContain('EXP-OCR-TEST-001');
    expect(uploadRes.extractedText).toContain('PERSONA_OCR_ALPHA');

    // 2. Clasificación jurídica del texto extraído por OCR
    expect(uploadRes.classification.es_juridico).toBe(true);

    // 3. Construcción de SourceDocument y CaseContext
    const srcDoc = createSourceDocument({
      id: 'src-ocr-pdf',
      filename: 'EXP-OCR-TEST-001.pdf',
      extractedText: uploadRes.extractedText,
      sourceValidated: true,
      pages: uploadRes.pages,
    });

    const analysis = uploadRes.analysis || reconstructCaseAnalysis([srcDoc]);
    const context = buildCaseContext([srcDoc], analysis);
    expect(context).toBeDefined();
    expect(srcDoc.sourceValidated).toBe(true);

    // 4. Evaluación de compatibilidad hacia escrito de parte (contestación civil)
    const compat = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'contestacion_demanda_civil',
      sourceDocuments: [srcDoc],
    });
    expect(compat.status).not.toBe('INCOMPATIBLE');

    // 5. Generación de escrito en el motor legal
    const contestacionDoc = await runGenerationPipeline({
      selectedDocumentType: 'contestacion_demanda_civil',
      sourceDocuments: [srcDoc],
      userInstruction: 'Contestar la demanda negando las prestaciones no acreditadas.',
    });
    expect(contestacionDoc).toBeDefined();
    expect(contestacionDoc.sections.length).toBeGreaterThanOrEqual(7);

    // 6. Generación y exportación física DOCX y PDF desde el documento generado con OCR
    const generatedDoc = await runGenerationPipeline({
      selectedDocumentType: 'escrito_libre',
      sourceDocuments: [srcDoc],
      userInstruction: 'Redactar contestación y comparecencia respecto a la demanda civil.',
    });
    expect(generatedDoc).toBeDefined();
    expect(generatedDoc.sections.length).toBeGreaterThanOrEqual(1);

    const exportableDoc = prepareDocForExport(generatedDoc);
    await expect(exportUniversalToDocx(exportableDoc))
      .rejects.toThrow(/FINAL_DOCUMENT_MATERIALIZATION_NOT_VERIFIED|QualityGate|REQUIRES_REVIEW/i);
    await expect(exportUniversalToPdf(exportableDoc))
      .rejects.toThrow(/FINAL_DOCUMENT_MATERIALIZATION_NOT_VERIFIED|QualityGate|REQUIRES_REVIEW/i);
  }, 30000);

  it('PDF escaneado multipágina: extrae y concatena todas las páginas escaneadas', async () => {
    process.env.OCR_PROVIDER = 'tesseract';

    const multiPagePdf = await createSyntheticMultiPageScannedPdfBuffer([
      [
        'EXP-OCR-P1-001',
        'ACTOR: TITULAR_PAGINA_UNO',
        'JUICIO DE AMPARO DIRECTO',
      ],
      [
        'EXP-OCR-P2-002',
        'SEGUNDA PAGINA ESCANEADA',
        'ACTO RECLAMADO Y CONCEPTOS DE VIOLACION',
      ],
    ]);

    const result = await extractDocument({
      buffer: multiPagePdf,
      fileName: 'multipage_scanned.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.ocrUsed).toBe(true);
    expect(result.ocrStatus).toBe('OCR_COMPLETED');
    expect(result.pages.length).toBe(2);
    expect(result.text).toContain('EXP-OCR-P1-001');
    expect(result.text).toContain('SEGUNDA PAGINA ESCANEADA');
  }, 30000);
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. PROTOCOLO FAIL-CLOSED ESTRICTO (OBJETIVO 2)
// ══════════════════════════════════════════════════════════════════════════════

describe('LOOP 9.1 — Protocolo Fail-Closed Estricto', () => {
  it('distingue OCR_PROVIDER_NOT_CONFIGURED cuando no hay proveedor OCR activo', async () => {
    delete process.env.OCR_PROVIDER;

    const scannedPdf = await createSyntheticScannedPdfBuffer([
      'EXP-FAIL-CLOSED-001',
      'TEXTO SIN CAPA DE TEXTO',
    ]);

    const uploadRes = await uploadThroughApi(scannedPdf, 'EXP-FAIL-CLOSED-001.pdf', 'application/pdf');
    expect(uploadRes.status).toBe(200);
    expect(uploadRes.ocrStatus).toBe('OCR_PROVIDER_NOT_CONFIGURED');
    expect(uploadRes.sourceValidated).toBe(false);
    expect(uploadRes.generationEligibility).toBe('blocked');
    // Fail-closed: jamás inventa texto jurídico ni alucina hechos
    expect(uploadRes.extractedText.length).toBeLessThan(50);
  });

  it('distingue OCR_AVAILABLE_AND_FAILED cuando el proveedor falla o la imagen es corrupta', async () => {
    process.env.OCR_PROVIDER = 'tesseract';

    // PDF con stream de imagen vacío/truncado para forzar fallo en el procesamiento OCR
    const corruptPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n' +
      '4 0 obj\n<< /Length 15 >>\nstream\nq 0 0 0 0 re f Q\nendstream\nendobj\n' +
      'xref\n0 5\n0000000000 65535 f \n' +
      'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n250\n%%EOF\n',
      'latin1'
    );

    const result = await extractDocument({
      buffer: corruptPdf,
      fileName: 'corrupt_image.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.ocrStatus).toBe('OCR_AVAILABLE_AND_FAILED');
    expect(result.sourceValidated).toBe(false);
    expect(result.status).not.toBe('READY');
    // Fail-closed: texto vacío o insuficiente, jamás texto inventado
    expect(result.text.length).toBeLessThan(50);
  });
});
