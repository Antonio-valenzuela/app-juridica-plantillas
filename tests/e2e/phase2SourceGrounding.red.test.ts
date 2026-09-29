import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeUploadedDocument } from '@/lib/upload-analysis/analyze';

const auditRoot = path.resolve(process.cwd(), 'audit/final-legal-readiness-2026');

const realCases = [
  {
    caseNumber: '01',
    expectedSourceDocumentType: 'DEMANDA_LABORAL',
    expectedMatter: 'LABORAL',
  },
  {
    caseNumber: '02',
    expectedSourceDocumentType: 'DEMANDA_LABORAL',
    expectedMatter: 'LABORAL',
  },
  {
    caseNumber: '03',
    expectedSourceDocumentType: 'DEMANDA_CIVIL',
    expectedMatter: 'CIVIL',
  },
  {
    caseNumber: '04',
    expectedSourceDocumentType: 'DEMANDA_CIVIL',
    expectedMatter: 'FAMILIAR',
  },
  {
    caseNumber: '05',
    expectedSourceDocumentType: 'DEMANDA_MERCANTIL',
    expectedMatter: 'MERCANTIL',
  },
  {
    caseNumber: '06',
    expectedSourceDocumentType: 'DEMANDA_LABORAL',
    expectedMatter: 'LABORAL',
  },
] as const;

async function analyzeRealCase(caseNumber: string) {
  const sourceDirectory = path.join(auditRoot, 'cases', caseNumber, 'source');
  const [fileName] = await fs.readdir(sourceDirectory);
  if (!fileName) throw new Error(`No existe fuente real para el caso ${caseNumber}.`);
  const filePath = path.join(sourceDirectory, fileName);
  const buffer = await fs.readFile(filePath);
  return {
    fileName,
    result: await analyzeUploadedDocument({
      buffer,
      fileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  };
}

describe.sequential('FASE 2 RED source classification with the six real sources', () => {
  it.each(realCases)('$caseNumber must identify the principal source document, not an embedded precedent', async (expected) => {
    const { fileName, result } = await analyzeRealCase(expected.caseNumber);

    expect({
      caseNumber: expected.caseNumber,
      fileName,
      observedSourceDocumentType: result.classification.sourceDocumentType,
      observedMatter: result.classification.materia,
    }).toMatchObject({
      caseNumber: expected.caseNumber,
      fileName: expect.any(String),
      observedSourceDocumentType: expected.expectedSourceDocumentType,
      observedMatter: expected.expectedMatter,
    });
  });
});
