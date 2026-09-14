import fs from 'node:fs';
import { createRequire } from 'node:module';
import { exportUniversalToPdf } from './lib/legal-engine/exportPdfUniversal';
import { buildFallbackAnalysis } from './lib/legal-engine/legalFormatAnalyzer';
import { buildFormattedDocument } from './lib/legal-engine/legalFormatter';
import { sanitizeLegalDocument } from './lib/legal-engine/legalDocumentSanitizer';
const req = createRequire(import.meta.url);

function stats(doc: any, label: string) {
  const blocks = doc.sections.flatMap((s: any) => s.content);
  const chars = blocks.reduce((a: number, b: any) => a + b.text.length, 0);
  console.log(`${label}: sections=${doc.sections.length} blocks=${blocks.length} chars=${chars}`);
  return blocks;
}

const HEADER = 'SUPREMA CORTE DE JUSTICIA DE LA NACIÓN\nP R E S E N T E\n\nJUAN PÉREZ GARCÍA, por mi propio derecho.\n\nEXPEDIENTE: AMPARO DIRECTO 800/2024\n\nRECURSO DE REVISIÓN EN AMPARO DIRECTO';
const BODY_BLOCK = 'XVI. CONSIDERANDO SOBRE LA VALORACIÓN PROBATIVA\n\nLa autoridad responsable omitió valorar la prueba documental conforme al principio de exhaustividad, transgrediendo los artículos 14, 16 y 17 constitucionales y la jurisprudencia 1a./J. 43/2014 de la Primera Sala.';
const CLOSING = 'PETITORIOS\n\nPRIMERO. Tenerme por presentado oportunamente.\nSEGUNDO. Declarar fundados los agravios.\nTERCERO. Sin condena en costas.\n\nPROTESTO LO NECESARIO.\n\nCiudad de México, a 15 de marzo de 2024.\n\nJUAN PÉREZ GARCÍA\nQUEJOSO / RECURRENTE';
const LONG_TEXT = [HEADER, ...Array.from({ length: 22 }, () => BODY_BLOCK), CLOSING].join('\n\n');

// PASO 1: documento ANTES del exportador
const doc = buildFormattedDocument(buildFallbackAnalysis(LONG_TEXT), [{ id: 's', name: 'e.pdf', type: 'pdf', extractedText: LONG_TEXT, sourceValidated: true }] as any);
const blocks1 = stats(doc, 'PASO1 Document-before-exporter');
console.log('first100:', JSON.stringify(blocks1[0].text.slice(0, 100)));
console.log('last100:', JSON.stringify(blocks1[blocks1.length - 1].text.slice(-100)));

// PASO 2: dentro del exporter la primera línea es sanitizeLegalDocument
const { document: sanitized, report } = sanitizeLegalDocument(doc as any);
stats(sanitized, 'PASO2 Exporter-input (post-sanitize)');
console.log('sanitize report:', JSON.stringify({ removedPrompts: report.removedPrompts, removedDuplicates: report.removedDuplicates, truncatedWarnings: report.truncatedWarnings?.length }));

// PASO 5: páginas internas del PDF final (objetos /Type /Page)
const buf = await exportUniversalToPdf(doc as any);
const raw = buf.toString('latin1');
console.log('PASO5 Layout/PDF pages:', (raw.match(/\/Type \/Page[^s]/g) || []).length);
fs.writeFileSync(process.env.TEMP + '/opencode/out.pdf', buf);

// Extracción real
const m = req('pdf-parse');
const r = await new m.PDFParse({ data: new Uint8Array(buf) }).getText();
const pageTexts = (r.pages || []).map((p: any) => p.text || '');
console.log('Extracted pages:', pageTexts.length, '| chars allPages:', pageTexts.join('\n').length);

// PASO 4: documento MANUAL sin formatter (bloques únicos)
const manual: any = {
  id: 'doc-manual', title: 'DOC MANUAL', documentType: 'escrito', documentTypeLabel: 'DOC MANUAL',
  matter: '', jurisdiction: '', status: 'draft', parties: {}, caseRefs: {}, variables: {},
  sourceDocuments: [], validation: { isValid: true, errors: [], warnings: [] },
  generationMetadata: { pipelineState: { currentStage: null, stages: {}, isComplete: true, hasErrors: false }, aiUsed: false },
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  sections: Array.from({ length: 5 }, (_, si) => ({
    id: `sec-${si}`, type: 'custom', title: `SECCION UNICA ${si + 1}`, order: si + 1,
    isRepeatable: false, isEditable: true, isGenerated: false, isManuallyEdited: false,
    variables: [], validationErrors: [], validationWarnings: [],
    content: Array.from({ length: 5 }, (_, bi) => ({
      id: `b-${si}-${bi}`, layer: 'SOURCE_FACT', trustLevel: 'VERIFIED', isManuallyEdited: false,
      text: `Bloque ${si}-${bi}: ` + 'Contenido juridico unico numero ' + (si * 5 + bi) + ' con texto suficiente de doscientos caracteres para forzar multiples lineas y paginas reales en el expediente ' + 'x'.repeat(180 - ((si * 5 + bi) % 40)),
      style: undefined,
    })),
  })),
};
stats(manual, 'PASO4 Manual-doc-before');
const bufM = await exportUniversalToPdf(manual);
const rM = await new m.PDFParse({ data: new Uint8Array(bufM) }).getText();
const pM = (rM.pages || []).map((p: any) => p.text || '');
console.log('PASO4 Manual -> PDF pages:', pM.length, '| chars:', pM.join('\n').length);
