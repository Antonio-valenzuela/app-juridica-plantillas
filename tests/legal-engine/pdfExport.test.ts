import { describe, it, expect } from 'vitest';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { validateFormattingIntegrity } from '@/lib/legal-engine/legalFormatter';
import { UniversalLegalDocument } from '@/lib/legal-engine/types';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';
import { markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';

const CANARY_EXPEDIENTE = 'EXP_CANARIO_55441';
const CANARY_CASE_NUMBER = `AMPARO DIRECTO ${CANARY_EXPEDIENTE}`;
const CANARY_CLIENTE = 'CLIENTE_CANARIO_92831';
const SOURCE_TEST_ID = 'SOURCE_TEST_001';

const HEADER = `SUPREMA CORTE DE JUSTICIA DE LA NACIÓN
P R E S E N T E

${CANARY_CLIENTE}, por mi propio derecho.

EXPEDIENTE: ${CANARY_CASE_NUMBER}

RECURSO DE REVISIÓN EN AMPARO DIRECTO`;

const BODY_BLOCK = `XVI. CONSIDERANDO SOBRE LA VALORACIÓN PROBATIVA

La autoridad responsable omitió valorar la prueba documental conforme al principio de exhaustividad, transgrediendo los artículos 14, 16 y 17 constitucionales y la jurisprudencia 1a./J. 43/2014 de la Primera Sala.`;

const CLOSING = `PETITORIOS

PRIMERO. Tenerme por presentado oportunamente.
SEGUNDO. Declarar fundados los agravios.
TERCERO. Sin condena en costas.

PROTESTO LO NECESARIO.

Ciudad de México, a 15 de marzo de 2024.

${CANARY_CLIENTE}
QUEJOSO / RECURRENTE`;

// Suficientemente largo para garantizar >= 2 páginas reales
const LONG_TEXT = [HEADER, ...Array.from({ length: 22 }, () => BODY_BLOCK), CLOSING].join('\n\n');

async function extractPages(buffer: Buffer): Promise<{ pageTexts: string[]; allText: string }> {
  const pdfModule = eval('require')('pdf-parse');
  const PDFParse = pdfModule.PDFParse || (pdfModule.default && pdfModule.default.PDFParse);
  const parsed = await new PDFParse({ data: new Uint8Array(buffer) }).getText();
  const pageTexts = (parsed.pages || []).map((p: any) => p.text || '');
  return { pageTexts, allText: pageTexts.join('\n') };
}

function makeDoc(text: string): UniversalLegalDocument {
  const document = createEmptyDocument({
    id: 'pdf-export-synthetic',
    title: 'Documento PDF sintético',
    documentType: 'escrito_libre',
    documentTypeLabel: 'Escrito libre sintético',
    sourceDocuments: [{
      id: SOURCE_TEST_ID,
      name: 'escrito.pdf',
      type: 'pdf',
      extractedText: text,
      sourceValidated: true,
    }],
    sections: [createDocumentNode({
      id: 'petitorios',
      title: 'PUNTOS PETITORIOS',
      type: 'petition',
      content: [{
        id: 'pdf-content',
        layer: 'SOURCE_FACT',
        trustLevel: 'VERIFIED',
        text: `${text}\n\n${'Contenido jurídico sintético para completar el mínimo de revisión. '.repeat(12)}`,
      }],
    })],
    generationMetadata: {
      ...createEmptyDocument().generationMetadata,
      preflight: { status: 'READY', missingFields: [] },
    } as never,
  });
  (document as any).qualityGate = { passed: true, canMarkAsFinal: true };
  return markDocumentAsReadyToExport(document, { explicit: true });
}

/** Misma normalización que validateFormattingIntegrity (NFD-strip + lowercase + tokens) */
function tokenCounts(text: string): Map<string, number> {
  const norm = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const counts = new Map<string, number>();
  for (const tok of norm.match(/[a-z0-9]+/g) || []) {
    if (tok.length < 2) continue;
    counts.set(tok, (counts.get(tok) || 0) + 1);
  }
  return counts;
}

function findMissing(original: string, extracted: string): string[] {
  const orig = tokenCounts(original);
  const ext = tokenCounts(extracted);
  const missing: string[] = [];
  for (const [tok, n] of orig) {
    if ((ext.get(tok) || 0) < n) missing.push(tok);
  }
  return missing;
}

describe('Exportación PDF — texto REAL, cp1252, multipágina e integridad', () => {
  it('caracteres acentados y símbolos cp1252 (— “ ” ¿ ¡) sobreviven la exportación', async () => {
    const tricky = 'NACIÓN\n\nPÉREZ GARCÍA\n\nConstitución\n\ndiseño jurídico — integral\n\n“texto citado textualmente”\n\n¿qué? ¡esto! Ü ü';
    const buffer = await exportUniversalToPdf(makeDoc(tricky));
    const { allText } = await extractPages(buffer);
    expect(allText).toContain('NACIÓN');
    expect(allText).toContain('PÉREZ');
    expect(allText).toContain('GARCÍA');
    expect(allText).toContain('Constitución');
    expect(allText).toContain('diseño jurídico — integral');
    expect(allText).toContain('“texto citado textualmente”');
    expect(allText).toContain('¿qué? ¡esto!');
    expect(allText).toContain('Ü ü');
  });

  it('documento largo: >=2 páginas, texto en primera, intermedia y última página', async () => {
    const buffer = await exportUniversalToPdf(makeDoc(LONG_TEXT));
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    const { pageTexts, allText } = await extractPages(buffer);

    console.log(`[pdfExport] páginas reales: ${pageTexts.length}, caracteres extraídos totales: ${allText.length}`);
    expect(pageTexts.length).toBeGreaterThanOrEqual(2);

    // Primera página
    expect(pageTexts[0]).toContain('SUPREMA CORTE DE JUSTICIA DE LA NACIÓN');
    expect(pageTexts[0]).toContain(CANARY_CASE_NUMBER);
    expect(pageTexts[0]).toContain('RECURSO DE REVISIÓN EN AMPARO DIRECTO');

    // Página intermedia (cuerpo repetido)
    const middleIdx = Math.floor(pageTexts.length / 2);
    expect(pageTexts[middleIdx] + pageTexts[middleIdx - 1]).toContain('exhaustividad');

    // Última página: cierre del documento
    const lastPage = pageTexts[pageTexts.length - 1];
    expect(lastPage).toContain('PROTESTO LO NECESARIO.');
    expect(lastPage).toContain('QUEJOSO / RECURRENTE');

    // Cadena obligatoria presente en el texto consolidado de TODAS las páginas
    for (const s of ['RECURSO DE REVISIÓN EN AMPARO DIRECTO', CANARY_CASE_NUMBER, 'PRIMERO.', 'PROTESTO LO NECESARIO.']) {
      expect(allText.replace(/\s+/g, ' ')).toContain(s.replace(/\s+/g, ' '));
    }
  });

  it('integridad total: original vs TODAS las páginas extraídas (multiset de tokens)', async () => {
    const doc = makeDoc(LONG_TEXT);
    const editorText = doc.sections.map((s) => s.content.map((b) => b.text).join('\n')).join('\n');
    const integrity = validateFormattingIntegrity(LONG_TEXT, doc);
    expect(integrity.ok).toBe(true);

    const buffer = await exportUniversalToPdf(doc);
    const { pageTexts, allText } = await extractPages(buffer);
    expect(pageTexts.length).toBeGreaterThanOrEqual(2);
    expect(allText.length).toBeGreaterThan(editorText.length * 0.8);

    const missing = findMissing(editorText, allText);
    if (missing.length > 0) {
      throw new Error(`PDF_TEXT_EXPORT_FAILED: tokens perdidos en exportación: ${missing.slice(0, 15).join(', ')}`);
    }
    expect(missing).toEqual([]);
  });
});
