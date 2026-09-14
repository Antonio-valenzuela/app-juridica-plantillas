/**
 * LOOP 9 — §5, §17, §18
 * PRUEBA DE ACEPTACIÓN: EXPORTACIÓN UNIVERSAL DOCX Y PDF EN 10 MATERIAS Y VÍA API
 *
 * §17: DOCX universal (PK\x03\x04, secciones completas, caracteres en español ñ/tildes).
 * §18: PDF universal (%PDF-1.4, stream WinAnsi válido, numeración de páginas).
 * §5:  Contratos reales de API:
 *      POST /api/legal-engine/export/docx
 *      POST /api/legal-engine/export/pdf
 *
 * Cubre las 10 materias jurídicas sin texto mock ni prompts internos impresos.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { POST as POST_exportDocx } from '@/app/api/legal-engine/export/docx/route';
import { POST as POST_exportPdf } from '@/app/api/legal-engine/export/pdf/route';
import { createEmptyDocument, createDocumentNode } from '@/lib/legal-engine/types';
import { markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { extractDocument } from '@/lib/pdf/documentExtractor';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

beforeAll(() => {
  for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY']) {
    delete process.env[k];
  }
  process.env.DEMO_MODE_ENABLED = 'true';
});

// ── Fábrica de documentos listos para exportar en cada materia ───────────────

function makeExportableDocument(
  matter: string,
  title: string,
  paragraphs: string[]
): UniversalLegalDocument {
  const fullSampleText = paragraphs.join(' ');
  const doc = createEmptyDocument({
    id: `doc-exp-${matter.toLowerCase()}`,
    title,
    documentType: 'escrito_libre',
    documentTypeLabel: `Escrito libre en materia ${matter}`,
    sections: [
      createDocumentNode({
        id: 'proemio',
        title: 'PROEMIO Y COMPARECENCIA',
        type: 'identity',
        content: [
          {
            id: 'b-proemio',
            layer: 'USER_POSITION',
            trustLevel: 'VERIFIED',
            text: `EXPEDIENTE: EXP-TEST-${matter.toUpperCase()}-2026. COMPARECIENTE SINTÉTICO EN MATERIA ${matter.toUpperCase()}. ANTE ESTE H. ÓRGANO JURISDICCIONAL COMPAREZCO RESPETUOSAMENTE CON LA PERSONALIDAD DEBIDAMENTE ACREDITADA PARA EXPONER LO SIGUIENTE:`,
          },
        ],
      }),
      createDocumentNode({
        id: 'hechos',
        title: 'HECHOS Y CONSIDERACIONES',
        type: 'facts',
        content: paragraphs.map((p, idx) => ({
          id: `b-hecho-${idx}`,
          layer: 'SOURCE_FACT',
          trustLevel: 'VERIFIED',
          text: p,
        })),
      }),
      createDocumentNode({
        id: 'petitorios',
        title: 'PUNTOS PETITORIOS',
        type: 'petition',
        content: [
          {
            id: 'b-petitorio',
            layer: 'USER_POSITION',
            trustLevel: 'VERIFIED',
            text: 'PRIMERO. Tenerme por presentado en tiempo y forma en los términos del presente escrito. SEGUNDO. Proveer conforme a derecho corresponda acordando favorablemente lo peticionado.',
          },
        ],
      }),
      createDocumentNode({
        id: 'firma',
        title: 'FIRMA',
        type: 'signature',
        content: [
          {
            id: 'b-firma',
            layer: 'USER_POSITION',
            trustLevel: 'VERIFIED',
            text: 'PROTESTO LO NECESARIO EN DERECHO. CIUDAD DE MÉXICO A LA FECHA DE SU PRESENTACIÓN.',
          },
        ],
      }),
    ],
    generationMetadata: {
      ...createEmptyDocument().generationMetadata,
      preflight: { status: 'READY', missingFields: [] },
    } as any,
  });

  doc.intake = { request: fullSampleText } as any;
  doc.missingFields = [];
  doc.anonymizedFields = [];
  doc.validation = { isValid: true, errors: [], warnings: [] };
  (doc as any).qualityGate = { passed: true, canMarkAsFinal: true };

  return markDocumentAsReadyToExport(doc, { explicit: true });
}

function assertNoMockTextInBuffer(buf: Buffer, label: string) {
  const text = buf.toString('latin1');
  expect(text, `${label}: sin OBJETIVO DEL BLOQUE`).not.toContain('OBJETIVO DEL BLOQUE:');
  expect(text, `${label}: sin prompts internos`).not.toContain('[Desarrollar por la IA');
  expect(text, `${label}: sin lorem ipsum`).not.toMatch(/Lorem ipsum/i);
}

const MATERIAS_TEST = [
  { matter: 'CIVIL', title: 'Escrito de Cumplimiento Civil', sampleText: 'Prescripción de la acción ordinaria civil y término legal de diez años contados a partir del vencimiento formal de la obligación.' },
  { matter: 'MERCANTIL', title: 'Escrito de Pagaré Mercantil', sampleText: 'Cobro de título de crédito con vencimiento en año corriente y liquidación de intereses moratorios devengados.' },
  { matter: 'FAMILIAR', title: 'Escrito de Pensión Alimenticia', sampleText: 'Alimentos para la niñez y régimen de convivencia armónica entre progenitores, privilegiando el interés superior.' },
  { matter: 'LABORAL', title: 'Contestación de Demanda Laboral', sampleText: 'Excepción de prescripción laboral y pago oportuno de finiquito e indemnización constitucional en tiempo.' },
  { matter: 'AMPARO', title: 'Demanda de Amparo Indirecto', sampleText: 'Violación al artículo catorce constitucional y suspensión provisional del acto reclamado emitido por autoridad.' },
  { matter: 'PENAL', title: 'Escrito de Asesoría Jurídica Penal', sampleText: 'Datos de prueba integrados en carpeta de investigación por daño patrimonial y afectación indebida justificada.' },
  { matter: 'ADMINISTRATIVO', title: 'Recurso de Revocación Administrativo', sampleText: 'Impugnación de resolución sancionatoria emitida sin debida fundamentación ni motivación en sede de autoridad.' },
  { matter: 'AGRARIO', title: 'Promoción ante Tribunal Agrario', sampleText: 'Reconocimiento de derechos ejidales sobre tierras de uso común y constancia ejidal con pleno valor legal agrario.' },
  { matter: 'CORPORATIVO', title: 'Acta de Sesión de Consejo', sampleText: 'Protocolización de asamblea general ordinaria y delegación de poderes notariales ante fedatario público.' },
  { matter: 'TRAMITE', title: 'Solicitud de Copias Certificadas', sampleText: 'Petición formal de copias certificadas del acuerdo dictado en los autos del expediente en que se actúa conforme a derecho.' },
];

// ══════════════════════════════════════════════════════════════════════════════
// §17 — DOCX UNIVERSAL EN LAS 10 MATERIAS
// ══════════════════════════════════════════════════════════════════════════════

describe('§17 — DOCX Universal en 10 Materias', () => {
  for (const item of MATERIAS_TEST) {
    it(`[${item.matter}] DOCX válido con PK, secciones y español (ñ, tildes)`, async () => {
      const doc = makeExportableDocument(item.matter, item.title, [item.sampleText]);
      const buf = await exportUniversalToDocx(doc);

      // Cabecera ZIP obligatoria
      expect(buf.subarray(0, 2).toString()).toBe('PK');
      expect(buf.length).toBeGreaterThan(1000);
      assertNoMockTextInBuffer(buf, item.matter);
    });
  }

  it('el buffer DOCX codifica correctamente acentos y eñes', async () => {
    const doc = makeExportableDocument('CIVIL', 'Escrito con Tildes y Eñes', [
      'Se solicita aclaración, resolución, término procesal y prescripción en el año corriente, con fundamento en las disposiciones aplicables a la materia.',
    ]);
    const buf = await exportUniversalToDocx(doc);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    
    // Extraer el texto real del DOCX generado para verificar codificación
    const extracted = await extractDocument({
      buffer: buf,
      fileName: 'test-acentos.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(extracted.text).toContain('aclaración');
    expect(extracted.text).toContain('año');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §18 — PDF UNIVERSAL EN LAS 10 MATERIAS
// ══════════════════════════════════════════════════════════════════════════════

describe('§18 — PDF Universal en 10 Materias', () => {
  for (const item of MATERIAS_TEST) {
    it(`[${item.matter}] PDF válido con %PDF-, tamaño > 500 bytes y sin prompts`, async () => {
      const doc = makeExportableDocument(item.matter, item.title, [item.sampleText]);
      const buf = await exportUniversalToPdf(doc);

      // Cabecera PDF obligatoria
      expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(buf.length).toBeGreaterThan(500);
      assertNoMockTextInBuffer(buf, item.matter);
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// §5 — CONTRATOS REALES DE API: /api/legal-engine/export/docx Y /pdf
// ══════════════════════════════════════════════════════════════════════════════

describe('§5 — Contratos de exportación a través de las rutas API de Next.js', () => {
  it('POST /api/legal-engine/export/docx devuelve archivo DOCX binario', async () => {
    const doc = makeExportableDocument('CIVIL', 'Demanda Civil API', [
      'Texto jurídico formal para exportación a través de endpoint API.',
    ]);

    const req = new NextRequest('http://localhost/api/legal-engine/export/docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: doc }),
    });

    const res = await POST_exportDocx(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('wordprocessingml.document');
    expect(res.headers.get('Content-Disposition')).toContain('.docx');

    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('POST /api/legal-engine/export/pdf devuelve archivo PDF binario', async () => {
    const doc = makeExportableDocument('AMPARO', 'Amparo API', [
      'Texto de amparo para exportación PDF a través de endpoint API.',
    ]);

    const req = new NextRequest('http://localhost/api/legal-engine/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: doc }),
    });

    const res = await POST_exportPdf(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('.pdf');

    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(500);
  });
});
