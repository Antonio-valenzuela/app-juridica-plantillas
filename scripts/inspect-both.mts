import fs from 'node:fs';
import path from 'node:path';
import { extractDocument } from '../lib/pdf/documentExtractor';
import { reconstructCaseAnalysis } from '../lib/legal-engine/caseAnalysis';
import type { UploadedSourceDocument } from '../lib/legal-engine/context';

async function inspectDoc(pdfPath: string, instruction: string, label: string) {
  console.log(`\n=================== ${label} ===================`);
  console.log('Path:', pdfPath);
  const buffer = fs.readFileSync(pdfPath);
  const extracted = await extractDocument({
    buffer,
    fileName: path.basename(pdfPath),
    mimeType: 'application/pdf',
  });

  console.log('Page count:', extracted.pageCount);
  console.log('Text length:', extracted.text?.length || 0);

  const sourceDoc: UploadedSourceDocument = {
    id: `src-${label}`,
    filename: path.basename(pdfPath),
    text: extracted.text || '',
    pageCount: extracted.pageCount,
    sourceValidated: true,
    pages: (extracted.pages || []).map((p, i) => ({
      page: p.pageNumber || i + 1,
      text: p.text || '',
      chars: p.charCount || p.text?.length || 0,
    })),
  };

  const ca = reconstructCaseAnalysis([sourceDoc], instruction);
  console.log('Challenged Reasonings count:', ca.challengedReasonings?.length);
  for (const cr of ca.challengedReasonings || []) {
    console.log(`  CR ${cr.id} (${cr.number}): ${cr.topic?.slice(0, 80)}`);
  }
  console.log('Challenged Acts count:', ca.challengedActs?.length);
  for (const act of ca.challengedActs || []) {
    console.log(`  Act: ${act.actDescription?.slice(0, 80)}`);
  }
  console.log('Claims count:', ca.claims?.length);
  console.log('Facts count:', ca.facts?.length);
  console.log('Authorities count:', ca.authorities?.length);

  const ci = ca.proceduralPosture?.constitutionalIssues || [];
  const li = ca.proceduralPosture?.legalityIssues || [];
  console.log('Constitutional Issues count:', ci.length);
  for (const issue of ci) {
    console.log(`  [CONST] ${issue.id} | ${issue.title} | Param: ${issue.parameter}`);
  }
  console.log('Legality Issues count:', li.length);
  for (const issue of li) {
    console.log(`  [LEG] ${issue.id} | ${issue.title} | Param: ${issue.parameter}`);
  }

  return { extracted, ca };
}

async function main() {
  const doc1Path = path.resolve('data/uploads/templates/1787377633126-Recurso_Revision_Amparo_Directo_800-2024_Version_Ampliada__1_.pdf');
  const doc2Path = path.resolve('data/uploads/templates/1787377598439-0129000036717288006AST.PDF');

  await inspectDoc(doc1Path, 'Interponer recurso de revisión contra la sentencia dictada en el amparo directo', 'DOC 1: RECURSO REVISIÓN 800/2024');
  await inspectDoc(doc2Path, 'Contestar requerimiento o demanda laboral / administrativa', 'DOC 2: 0129000036717288006AST.PDF');
}

main().catch(console.error);
