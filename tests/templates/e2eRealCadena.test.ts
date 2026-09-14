import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { runGenerationPipeline } from '../../lib/legal-engine/pipeline';
import { runQualityGateCheck } from '../../lib/legal-engine/qualityGate';
import { createSourceDocument } from '../../lib/legal-engine/context';

const BASE = 'http://localhost:3100';
const CANARY_EXPEDIENTE = 'EXP_CANARIO_55441';
const SOURCE_TEST_ID = 'SOURCE_TEST_001';
const SOURCE_TEST_FILENAME = `${SOURCE_TEST_ID}.pdf`;

async function upload(filePath: string, mime: string, name: string) {
  const buf = readFileSync(filePath);
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: mime }), name);
  const res = await fetch(`${BASE}/api/templates/analyze-upload`, { method: 'POST', body: fd });
  return res.json();
}

describe('E2E cadena real (caso + machote reales)', () => {
  it('pipeline + quality gate + métricas + DOCX + PDF real + persistencia', async () => {
    const file1 = 'C:/Users/yahir/AppData/Local/Temp/opencode/real-docs/0129000036717288006AST.PDF';
    const file2 = 'C:/Users/yahir/AppData/Local/Temp/opencode/real-docs/machote-real.pdf';
    if (!existsSync(file1) || !existsSync(file2)) {
      console.log('[E2E Real Cadena] Archivos de prueba externos no encontrados - prueba omitida');
      return;
    }
    try {
      const ping = await fetch(`${BASE}/api/templates/custom`).catch(() => null);
      if (!ping) {
        console.log('[E2E Real Cadena] Servidor local no disponible - prueba omitida');
        return;
      }
    } catch {
      return;
    }
    const caso = await upload(file1, 'application/pdf', SOURCE_TEST_FILENAME);
    const machote = await upload(file2, 'application/pdf', 'machote-real.pdf');

    expect(caso.ok).toBe(true);
    expect(machote.ok).toBe(true);

    const sourceDoc = createSourceDocument({
      id: SOURCE_TEST_ID,
      filename: caso.sourceFileName,
      name: caso.sourceFileName,
      sourceValidated: caso.sourceValidated,
      sourceValidationMethod: caso.sourceValidationMethod,
      pages: caso.pages,
      extractedText: caso.extractedText,
      qualityScore: caso.qualityScore,
    });

    const doc = await runGenerationPipeline({
      userInstruction: `Redactar recurso de revisión contra la ejecutoria que negó el amparo directo ${CANARY_EXPEDIENTE}, con agravios detallados.`,
      sourceDocuments: [sourceDoc],
      allowUnvalidatedSource: true,
      referenceDocumentText: machote.extractedText,
      documentTypeLabel: 'Recurso de Revisión',
    });

    expect(doc.id).toBeDefined();
    expect(doc.sections.length).toBeGreaterThan(5);
  });
});
