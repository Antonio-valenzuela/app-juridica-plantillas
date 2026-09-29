import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractDocument } from '@/lib/pdf/documentExtractor';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { buildSourceGrounding } from '@/lib/legal-engine/sourceGrounding';
import { resolveContestacionRoutingFromSource } from '@/lib/legal-engine/documentRouting';

const auditRoot = path.resolve(process.cwd(), 'audit/final-legal-readiness-2026');

async function groundingFor(caseNumber: string) {
  const sourceDirectory = path.join(auditRoot, 'cases', caseNumber, 'source');
  const [fileName] = await fs.readdir(sourceDirectory);
  const filePath = path.join(sourceDirectory, fileName);
  const buffer = await fs.readFile(filePath);
  const extracted = await extractDocument({
    buffer,
    fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  return buildSourceGrounding(createSourceDocument({
    id: `routing-${caseNumber}`,
    filename: fileName,
    extractedText: extracted.text,
    pages: extracted.pages,
    sourceValidated: true,
    sourceQualityStatus: 'READY',
  }));
}

describe('classification to routing remains independent', () => {
  it.each([
    ['01', 'contestacion_demanda_laboral'],
    ['02', 'contestacion_demanda_laboral'],
    ['03', 'contestacion_demanda_civil'],
    ['04', 'contestacion_alimentos'],
    ['05', 'contestacion_demanda_mercantil'],
    ['06', 'contestacion_demanda_laboral'],
  ])('routes source case %s using only grounded classification', async (caseNumber, expectedTemplate) => {
    const grounding = await groundingFor(caseNumber);
    const routing = resolveContestacionRoutingFromSource({
      sourceDocumentType: grounding.container.documentType,
      matter: grounding.container.matter,
      caseText: grounding.caseText,
    });

    expect(routing.resolvedTemplate).toBe(expectedTemplate);
    expect(routing.templateSource).toBe('CANONICAL_ID');
    expect(routing.fallbackUsed).toBe(false);
  });

  it('fails closed when the source family or matter is unresolved', () => {
    expect(() => resolveContestacionRoutingFromSource({
      sourceDocumentType: 'DOCUMENTO_JURIDICO_NO_CLASIFICADO',
      matter: 'NO_IDENTIFICADA',
      caseText: 'escrito sin estructura suficiente',
    })).toThrow(/NEEDS_DOCUMENT_TYPE_SELECTION/);
  });
});
