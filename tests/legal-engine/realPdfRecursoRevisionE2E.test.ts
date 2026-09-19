import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { extractPdfTextServer } from '@/lib/pdf/pdfExtractor';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';
import type { DocumentAssemblyResult } from '@/lib/legal-engine/documentAssemblyTypes';

type AssemblyAttachedDocument = UniversalLegalDocument & {
  documentAssemblyResult?: DocumentAssemblyResult;
};

const REAL_PUBLIC_PDF = path.resolve(
  process.cwd(),
  'data/uploads/templates/1787377598439-0129000036717288006AST.PDF',
);

function sectionText(doc: UniversalLegalDocument, pattern: RegExp): string {
  return doc.sections
    .filter((s) => pattern.test(s.title))
    .flatMap((s) => s.content || [])
    .map((b) => b.text)
    .join('\n\n');
}

describe('E2E Real PDF — Recurso de Revisión en Amparo Directo', () => {
  it('processes the real 27-page PDF and delivers all substantive sections without generic placeholders', async () => {
    expect(fs.existsSync(REAL_PUBLIC_PDF)).toBe(true);

    const buffer = fs.readFileSync(REAL_PUBLIC_PDF);
    const extraction = await extractPdfTextServer(buffer);
    expect(extraction.pages.length).toBeGreaterThanOrEqual(25);

    const source = createSourceDocument({
      id: 'real-sanitized-amparo-sentence',
      filename: '1787377598439-0129000036717288006AST.PDF',
      type: 'application/pdf',
      pages: extraction.pages.map((p) => ({
        page: p.pageNumber,
        text: p.text,
        chars: p.text.length,
      })),
      sourceValidated: true,
      fileSizeBytes: buffer.byteLength,
    });

    const result = await runGenerationPipeline({
      selectedDocumentType: 'recurso_revision_amparo_directo',
      documentTypeLabel: 'Recurso de revisión en amparo directo',
      matter: 'laboral',
      jurisdiction: 'federal',
      userInstruction: 'Interponer recurso de revisión en amparo directo fundado en omisión de análisis de convencionalidad y constitucionalidad.',
      sourceDocuments: [source],
      generationId: 'real-pdf-e2e-gate-check',
      traceOptions: { enabled: true },
    }) as AssemblyAttachedDocument;

    const assembly = result.documentAssemblyResult;
    expect(assembly).toBeDefined();
    expect(assembly!.sections.length).toBe(10);

    // 3. Substantive sections non-empty:
    // ANTECEDENTES > 0
    const antecedentes = sectionText(result, /antecedente/i);
    expect(antecedentes.length).toBeGreaterThan(0);

    // INTERÉS EXCEPCIONAL > 0
    const interesExcepcional = sectionText(result, /inter[eé]s\s+excepcional/i);
    expect(interesExcepcional.length).toBeGreaterThan(0);

    // BLOQUE DE CONSTITUCIONALIDAD > 0
    const bloqueConstitucionalidad = sectionText(result, /bloque\s+de\s+constitucionali/i);
    expect(bloqueConstitucionalidad.length).toBeGreaterThan(0);

    // AGRAVIOS > 0
    const agravios = sectionText(result, /agravio/i);
    expect(agravios.length).toBeGreaterThan(0);

    // 4. Zero generic placeholders in any section
    const fullDocumentText = result.sections
      .flatMap((s) => s.content || [])
      .map((b) => b.text)
      .join('\n\n');

    expect(fullDocumentText).not.toContain('[DATO PENDIENTE DE EXPEDIENTE');
    expect(fullDocumentText).not.toContain('[REQUIERE INSTRUCCIÓN DEL ABOGADO');
    expect(fullDocumentText).not.toContain('{{');
    expect(fullDocumentText).not.toContain('}}');

    // 5. Check character metrics
    console.log('REAL PDF E2E METRICS:', {
      totalSections: result.sections.length,
      antecedentesChars: antecedentes.length,
      interesExcepcionalChars: interesExcepcional.length,
      bloqueConstitucionalidadChars: bloqueConstitucionalidad.length,
      agraviosChars: agravios.length,
      totalDocumentChars: fullDocumentText.length,
    });

    expect(antecedentes.length).toBeGreaterThanOrEqual(100);
    expect(interesExcepcional.length).toBeGreaterThanOrEqual(150);
    expect(bloqueConstitucionalidad.length).toBeGreaterThanOrEqual(150);
    expect(agravios.length).toBeGreaterThanOrEqual(150);
  }, 90000);
});
