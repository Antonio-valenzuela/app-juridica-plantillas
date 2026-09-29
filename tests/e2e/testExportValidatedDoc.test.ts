import { it, expect } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { evaluateProfessionalDraftQuality } from '@/lib/legal-engine/professionalDraftQuality';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

function documentText(doc: UniversalLegalDocument): string {
  return doc.sections
    .flatMap((s) => s.content.map((b) => b.text || ''))
    .join('\n\n');
}

function splitIntoPages(text: string, wordsPerPage = 500): string[] {
  const words = text.split(/\s+/);
  const pages: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerPage) {
    pages.push(words.slice(i, i + wordsPerPage).join(' '));
  }
  return pages.length > 0 ? pages : [text];
}

it('exporta el documento generado en Caso 01 EXTENSIVE_40 a DOCX y PDF', async () => {
  const runDir = path.resolve('audit/final-generator-validation/run-2026-09-28T18-22-14');
  const evidenceDir = path.join(runDir, 'evidence');
  const outputDir = path.join(runDir, 'outputs');

  const docJsonPath = path.join(evidenceDir, 'generated-document.json');
  const generated: UniversalLegalDocument = JSON.parse(await readFile(docJsonPath, 'utf8'));

  console.log('Exporting DOCX...');
  const docxBuf = await exportUniversalToDocx(
    generated, undefined, generated.generationMetadata?.auditTrace, { exportMode: 'DRAFT' }
  );
  const docxPath = path.join(outputDir, 'caso-01-EXTENSIVE_40-DRAFT.docx');
  await writeFile(docxPath, docxBuf);
  console.log(`✓ DOCX exported: ${docxBuf.byteLength} bytes → ${docxPath}`);

  console.log('Exporting PDF...');
  const pdfBuf = await exportUniversalToPdf(
    generated, undefined, { exportMode: 'DRAFT' }
  );
  const pdfPath = path.join(outputDir, 'caso-01-EXTENSIVE_40-DRAFT.pdf');
  await writeFile(pdfPath, pdfBuf);
  console.log(`✓ PDF exported: ${pdfBuf.byteLength} bytes → ${pdfPath}`);

  const generatedText = documentText(generated);
  const simulatedPages = splitIntoPages(generatedText, 500);

  const verifiedAuthorityIds = new Set(
    generated.sections
      .flatMap((s) => s.content)
      .flatMap((b) => (b as any).verifiedAuthorityIds || [])
  );
  const provenanceGate = (generated.generationMetadata as any).provenanceIntegrityGate;
  const provenanceErrors = Array.isArray(provenanceGate?.errors) ? provenanceGate.errors.length : 0;
  const coherenceErrors = ((generated.validation?.errors || []) as any[]).filter(
    (e) => /COHERENCE|CONSISTENCY|CONTRADICTION/i.test(`${e?.code || ''} ${e?.message || ''}`)
  ).length;

  const quality = evaluateProfessionalDraftQuality({
    draftDepth: 'EXTENSIVE_40',
    renderedPages: simulatedPages,
    sourceTexts: [''],
    substantiveText: generatedText,
    contentStopReason: (generated.generationMetadata as any).draftContentStopReason as any ?? null,
    unresolvedAttorneyQuestions: 0,
    verifiedAuthorityCount:
      (generated.generationMetadata as any).legalDocumentPlan?.verifiedAuthorityIds?.length ?? 0,
    appliedAuthorityCount: verifiedAuthorityIds.size,
    coherenceErrors,
    provenanceErrors,
  });

  const totalWords = wordCount(generatedText);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('RESULTADO FINAL — CASO 01 EXTENSIVE_40');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Páginas estimadas:      ${simulatedPages.length}`);
  console.log(`Palabras totales:       ${totalWords}`);
  console.log(`Palabras sustantivas:   ${quality.substantiveWords}`);
  console.log(`DOCX bytes:             ${docxBuf.byteLength}`);
  console.log(`PDF bytes:              ${pdfBuf.byteLength}`);
  console.log(`exactDuplicateRatio:    ${quality.exactDuplicateRatio.toFixed(4)}`);
  console.log(`semanticDuplicateRatio: ${quality.semanticDuplicateRatio.toFixed(4)}`);
  console.log(`sourceCopyRatio:        ${quality.sourceCopyRatio.toFixed(4)}`);
  console.log(`provenanceErrors:       ${provenanceErrors}`);
  console.log(`coherenceErrors:        ${coherenceErrors}`);
  console.log(`Quality Gate:           ${quality.qualityGate}`);
  console.log(`Issues:                 ${quality.issues.join(', ') || 'NINGUNO'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const report = {
    meta: {
      caseNumber: '01',
      draftDepth: 'EXTENSIVE_40',
      runDir,
      docxPath,
      pdfPath,
      docxBytes: docxBuf.byteLength,
      pdfBytes: pdfBuf.byteLength,
      totalWords,
      substantiveWords: quality.substantiveWords,
      pagesEstimated: simulatedPages.length,
      qualityGate: quality.qualityGate,
      issues: quality.issues,
    },
    sections: generated.sections.map((s) => ({
      title: s.title,
      type: s.type,
      words: wordCount(s.content.map((b) => b.text || '').join(' ')),
    })),
  };

  await writeFile(path.join(runDir, 'validation-report.json'), JSON.stringify(report, null, 2), 'utf8');

  expect(docxBuf.byteLength).toBeGreaterThan(10000);
  expect(pdfBuf.byteLength).toBeGreaterThan(5000);
  expect(totalWords).toBeGreaterThan(1000);
});
