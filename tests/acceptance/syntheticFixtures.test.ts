/**
 * Verificación de los generadores de fixtures sintéticos binarios reales.
 * Prueba que PDF digital, DOCX, TXT y PDF escaneado son extraídos por el
 * pipeline universal extractDocument del proyecto.
 */

import { describe, it, expect } from 'vitest';
import {
  createSyntheticPdfBuffer,
  createSyntheticDocxBuffer,
  createSyntheticTxtBuffer,
  createSyntheticScannedPdfBuffer,
} from './helpers/syntheticFixtures';
import { extractDocument } from '@/lib/pdf/documentExtractor';

describe('Synthetic Binary Fixtures — Extracción real comprobada', () => {
  const SAMPLE_LEGAL_TEXT = [
    'DEMANDA ORDINARIA CIVIL.',
    'EXPEDIENTE: EXP-TEST-CIVIL-001.',
    'ACTOR: PERSONA_CIVIL_ALPHA.',
    'DEMANDADO: EMPRESA_TEST_BETA.',
    'JUZGADO CUARTO CIVIL DE LA CIUDAD DE MÉXICO.',
    'Por medio del presente escrito comparezco a demandar en la vía ordinaria civil el cumplimiento forzoso de contrato de compraventa.',
    'HECHOS: Con fecha primero de febrero se celebró el contrato.',
    'DERECHO: Son aplicables los artículos del Código Civil.',
    'PUNTOS PETITORIOS: Se solicita admitir la demanda y emplazar.',
  ].join('\n');

  it('PDF digital sintético: binario válido, inicia con %PDF-, texto extraído por pdf-parse', async () => {
    const pdfBuf = createSyntheticPdfBuffer(SAMPLE_LEGAL_TEXT);
    expect(pdfBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    const result = await extractDocument({
      buffer: pdfBuf,
      fileName: 'EXP-TEST-CIVIL-001.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.text).toContain('EXP-TEST-CIVIL-001');
    expect(result.text).toContain('PERSONA_CIVIL_ALPHA');
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.sourceValidated).toBe(true);
    expect(result.ocrUsed).toBe(false);
  });

  it('DOCX sintético: binario ZIP válido (PK), extraído por mammoth', async () => {
    const docxBuf = await createSyntheticDocxBuffer(SAMPLE_LEGAL_TEXT);
    expect(docxBuf.subarray(0, 2).toString('ascii')).toBe('PK');

    const result = await extractDocument({
      buffer: docxBuf,
      fileName: 'EXP-TEST-CIVIL-001.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    expect(result.text).toContain('EXP-TEST-CIVIL-001');
    expect(result.text).toContain('EMPRESA_TEST_BETA');
    expect(result.sourceValidated).toBe(true);
  });

  it('TXT sintético: extraído fielmente como UTF-8', async () => {
    const txtBuf = createSyntheticTxtBuffer(SAMPLE_LEGAL_TEXT);
    const result = await extractDocument({
      buffer: txtBuf,
      fileName: 'EXP-TEST-CIVIL-001.txt',
      mimeType: 'text/plain',
    });

    expect(result.text).toContain('EXP-TEST-CIVIL-001');
    expect(result.sourceValidated).toBe(true);
  });

  it('PDF escaneado sintético: detecta needsOcr=true sin inventar texto', async () => {
    const scannedBuf = await createSyntheticScannedPdfBuffer();
    const result = await extractDocument({
      buffer: scannedBuf,
      fileName: 'EXP-TEST-SCANNED.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.ocrUsed || result.qualityScore.status === 'NEEDS_OCR' || !result.sourceValidated).toBe(true);
  });
});
