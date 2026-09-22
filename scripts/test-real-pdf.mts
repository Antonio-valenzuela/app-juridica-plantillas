import fs from 'node:fs';
import path from 'node:path';
import { extractDocument } from '../lib/pdf/documentExtractor';
import { reconstructCaseAnalysis } from '../lib/legal-engine/caseAnalysis';
import { buildLegalIssueMatrix } from '../lib/legal-engine/legalIssueMatrix';
import type { UploadedSourceDocument } from '../lib/legal-engine/context';

async function main() {
  const pdfPath = path.resolve('data/uploads/templates/1787377633126-Recurso_Revision_Amparo_Directo_800-2024_Version_Ampliada__1_.pdf');
  console.log('[STEP 1] Reading PDF:', pdfPath);
  const buffer = fs.readFileSync(pdfPath);
  console.log('[STEP 1] Buffer size:', buffer.length, 'bytes');

  console.log('[STEP 2] Extracting document with extractDocument...');
  const extracted = await extractDocument({
    buffer,
    fileName: 'Recurso_Revision_Amparo_Directo_800-2024.pdf',
    mimeType: 'application/pdf',
  });

  console.log('[STEP 2] Extraction completed:');
  console.log('  Page count:', extracted.pageCount);
  console.log('  Text length:', extracted.text?.length || 0);
  console.log('  Method:', extracted.extractionMethod);

  const sourceDoc: UploadedSourceDocument = {
    id: 'source-pdf-real-1',
    filename: 'Recurso_Revision_Amparo_Directo_800-2024.pdf',
    text: extracted.text || '',
    pageCount: extracted.pageCount,
    sourceValidated: true,
    pages: (extracted.pages || []).map((p, i) => ({
      page: p.pageNumber || i + 1,
      text: p.text || '',
      chars: p.charCount || p.text?.length || 0,
    })),
  };

  console.log('[STEP 3] Running reconstructCaseAnalysis...');
  const caseAnalysis = reconstructCaseAnalysis([sourceDoc], 'Interponer recurso de revisión en amparo directo');

  console.log('[STEP 3] Case analysis summary:');
  console.log('  Parties:', caseAnalysis.parties.length);
  console.log('  Claims:', caseAnalysis.claims.length);
  console.log('  Facts:', caseAnalysis.facts.length);
  console.log('  Authorities:', caseAnalysis.authorities.length);

  console.log('[STEP 4] Building LegalIssueMatrix...');
  const issueMatrix = buildLegalIssueMatrix({
    documentId: 'real-doc-800-2024',
    documentType: 'recurso_revision_amparo_directo',
    richAnalysis: caseAnalysis.richCaseAnalysis,
    sources: [sourceDoc],
  });

  console.log('[STEP 4] LegalIssueMatrix built:');
  console.log('  Total issues:', issueMatrix.issues.length);
  console.log('  Summary:', JSON.stringify(issueMatrix.summary, null, 2));
  console.log('  Issues breakdown:');
  for (const issue of issueMatrix.issues.slice(0, 5)) {
    console.log(`    - [${issue.id}] Type: ${issue.issueType}, Status: ${issue.status}, ResearchStatus: ${issue.researchStatus}`);
    console.log(`      Q: ${issue.question.slice(0, 100)}...`);
  }
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
