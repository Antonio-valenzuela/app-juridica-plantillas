import fs from 'node:fs';
import path from 'node:path';
import { extractDocument } from '../lib/pdf/documentExtractor';
import { reconstructCaseAnalysis } from '../lib/legal-engine/caseAnalysis';
import type { UploadedSourceDocument } from '../lib/legal-engine/context';

async function main() {
  const f = 'C:/Users/yahir/Desktop/BECA/DEMANDA DE LA FAMILIA GALARZA/NULIDAD DE TESTAMENTO/DEMANDA DE NULIDAD DEL TESTAMENTO.docx';
  const buffer = fs.readFileSync(f);
  const extracted = await extractDocument({ buffer, fileName: path.basename(f), mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

  const sourceDoc: UploadedSourceDocument = {
    id: 'src-demanda-galarza',
    filename: path.basename(f),
    text: extracted.text || '',
    pageCount: extracted.pageCount,
    sourceValidated: true,
    pages: (extracted.pages || []).map((p, i) => ({
      page: p.pageNumber || i + 1,
      text: p.text || '',
      chars: p.charCount || p.text?.length || 0,
    })),
  };

  const ca = reconstructCaseAnalysis([sourceDoc], 'Contestar demanda nulidad testamento');
  console.log('Facts count:', ca.facts.length);
  ca.facts.forEach(fact => {
    console.log(`Fact [${fact.number}] id=${fact.id}:`, (fact.sourceFact || fact.text || '').slice(0, 150));
  });
}

main().catch(console.error);
