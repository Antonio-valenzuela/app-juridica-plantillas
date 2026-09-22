import fs from 'node:fs';
import path from 'node:path';
import { extractDocument } from '../lib/pdf/documentExtractor';
import { reconstructCaseAnalysis } from '../lib/legal-engine/caseAnalysis';
import type { UploadedSourceDocument } from '../lib/legal-engine/context';

async function main() {
  const pdfPath = path.resolve('data/uploads/templates/1787377598439-0129000036717288006AST.PDF');
  console.log('[STEP 1] Reading Doc 2 PDF:', pdfPath);
  const buffer = fs.readFileSync(pdfPath);
  console.log('[STEP 1] Buffer size:', buffer.length, 'bytes');

  console.log('[STEP 2] Extracting document with extractDocument...');
  const extracted = await extractDocument({
    buffer,
    fileName: '0129000036717288006AST.PDF',
    mimeType: 'application/pdf',
  });

  console.log('[STEP 2] Extraction completed:');
  console.log('  Page count:', extracted.pageCount);
  console.log('  Text length:', extracted.text?.length || 0);
  console.log('  Method:', extracted.extractionMethod);
  console.log('  OCR Used:', extracted.ocrUsed);
  console.log('  Confidence:', extracted.confidenceAfter);
  console.log('  Quality:', extracted.qualityAfter);
  console.log('  Preview (first 1000 chars):\n', extracted.text?.slice(0, 1000));

  const sourceDoc: UploadedSourceDocument = {
    id: 'source-doc-2',
    filename: '0129000036717288006AST.PDF',
    text: extracted.text || '',
    pageCount: extracted.pageCount,
    sourceValidated: true,
    pages: (extracted.pages || []).map((p, i) => ({
      page: p.pageNumber || i + 1,
      text: p.text || '',
      chars: p.charCount || p.text?.length || 0,
    })),
  };

  console.log('[STEP 3] Running reconstructCaseAnalysis on Doc 2...');
  const caseAnalysis = reconstructCaseAnalysis([sourceDoc], 'Contestar requerimiento o crédito fiscal / resolución administrativa');

  console.log('[STEP 3] Doc 2 Case Analysis summary:');
  console.log('  Document type:', caseAnalysis.documentType);
  console.log('  Procedural posture family:', caseAnalysis.proceduralPosture?.primaryAction);
  console.log('  Facts count:', caseAnalysis.facts?.length);
  console.log('  Claims count:', caseAnalysis.claims?.length);
  console.log('  Challenged acts count:', caseAnalysis.challengedActs?.length);
  console.log('  Authorities count:', caseAnalysis.authorities?.length);
  console.log('  Constitutional issues count:', caseAnalysis.proceduralPosture?.constitutionalIssues?.length);
  console.log('  Legality issues count:', caseAnalysis.proceduralPosture?.legalityIssues?.length);

  const constIssues = caseAnalysis.proceduralPosture?.constitutionalIssues || [];
  const legIssues = caseAnalysis.proceduralPosture?.legalityIssues || [];

  console.log('[STEP 4] Issues in Doc 2:');
  for (const issue of constIssues) {
    console.log(`  - [CONST] ${issue.id} | ${issue.title} | Param: ${issue.parameter}`);
  }
  for (const issue of legIssues) {
    console.log(`  - [LEG] ${issue.id} | ${issue.title} | Param: ${issue.parameter}`);
  }
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
