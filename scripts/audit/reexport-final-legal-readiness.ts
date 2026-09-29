import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

const AUDIT_ROOT = path.resolve(process.cwd(), 'audit/final-legal-readiness-2026');

export interface ReexportResult {
  caseNumber: string;
  docxBytes: number;
  pdfBytes: number;
  docxPath: string;
  pdfPath: string;
  completedAt: string;
}

type SerializedAuditDocument = UniversalLegalDocument & {
  documentAssemblyResult?: {
    document?: UniversalLegalDocument;
  };
};

export async function reexportFinalLegalReadinessCases(): Promise<ReexportResult[]> {
  const results: ReexportResult[] = [];

  for (const caseNumber of ['01', '02', '03', '04', '05', '06']) {
    const caseRoot = path.join(AUDIT_ROOT, 'cases', caseNumber);
    const evidenceRoot = path.join(caseRoot, 'evidence');
    const outputRoot = path.join(caseRoot, 'outputs');
    await mkdir(outputRoot, { recursive: true });

    const document = JSON.parse(await readFile(path.join(evidenceRoot, 'generated-document.json'), 'utf8')) as SerializedAuditDocument;
    // The live pipeline keeps this back-reference in memory for the identity
    // gate; restore it when replaying the serialized audit artifact.
    if (document.documentAssemblyResult && !document.documentAssemblyResult.document) {
      document.documentAssemblyResult.document = document;
    }
    const trace = JSON.parse(await readFile(path.join(evidenceRoot, 'generation-trace.json'), 'utf8')) as never;
    const docx = await exportUniversalToDocx(document, undefined, trace, { exportMode: 'DRAFT' });
    const pdf = await exportUniversalToPdf(document, trace, { exportMode: 'DRAFT' });
    const docxPath = path.join(outputRoot, `caso-${caseNumber}-contestacion-DRAFT.docx`);
    const pdfPath = path.join(outputRoot, `caso-${caseNumber}-contestacion-DRAFT.pdf`);
    await writeFile(docxPath, docx);
    await writeFile(pdfPath, pdf);

    const completedAt = new Date().toISOString();
    const result: ReexportResult = {
      caseNumber,
      docxBytes: docx.byteLength,
      pdfBytes: pdf.byteLength,
      docxPath,
      pdfPath,
      completedAt,
    };
    results.push(result);

    const caseResultPath = path.join(evidenceRoot, 'case-result.json');
    const caseResult = JSON.parse(await readFile(caseResultPath, 'utf8')) as Record<string, unknown>;
    caseResult.rendererReexport = {
      reason: 'PDF renderer spacing remediation',
      exportMode: 'DRAFT',
      ...result,
    };
    await writeFile(caseResultPath, `${JSON.stringify(caseResult, null, 2)}\n`, 'utf8');
  }

  await writeFile(
    path.join(AUDIT_ROOT, 'renderer-reexport-summary.json'),
    `${JSON.stringify({ completedAt: new Date().toISOString(), results }, null, 2)}\n`,
    'utf8',
  );
  return results;
}
