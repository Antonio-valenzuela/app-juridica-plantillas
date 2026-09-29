import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractDocument } from '@/lib/pdf/documentExtractor';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { buildSourceGrounding } from '@/lib/legal-engine/sourceGrounding';

const auditRoot = path.resolve(process.cwd(), 'audit/final-legal-readiness-2026');

async function realCase(caseNumber: string) {
  const sourceDirectory = path.join(auditRoot, 'cases', caseNumber, 'source');
  const [fileName] = await fs.readdir(sourceDirectory);
  const filePath = path.join(sourceDirectory, fileName);
  const buffer = await fs.readFile(filePath);
  const extracted = await extractDocument({
    buffer,
    fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  return createSourceDocument({
    id: `phase2-${caseNumber}`,
    filename: fileName,
    extractedText: extracted.text,
    pages: extracted.pages,
    sourceValidated: true,
    sourceQualityStatus: 'READY',
  });
}

describe('FASE 2 provenance regressions from the six real sources', () => {
  it('case 04 keeps jurisprudence Hechos outside the current case facts', async () => {
    const source = await realCase('04');
    const analysis = reconstructCaseAnalysis([source]);
    const grounding = buildSourceGrounding(source);
    const precedentText = 'Un hombre demandó a su padre';

    expect(analysis.caseNumbers.principal).not.toBe('2/2022');
    expect(analysis.facts.some((fact) => fact.text.includes(precedentText))).toBe(false);
    expect(analysis.richCaseAnalysis?.facts.some((fact) => fact.proposition.includes(precedentText))).toBe(false);
    expect(grounding.precedentFacts.some((span) => span.text.includes(precedentText))).toBe(true);
    expect(grounding.values.some((value) => value.value === '2/2022' && value.canUseAsCaseMetadata)).toBe(false);
  });

  it.each([
    ['03', '3296/2004'],
    ['05', '591/2021'],
  ])('case %s does not use cited precedent %s as current expediente', async (caseNumber, precedentNumber) => {
    const source = await realCase(caseNumber);
    const analysis = reconstructCaseAnalysis([source]);
    const grounding = buildSourceGrounding(source);

    expect(analysis.caseNumbers.principal).not.toBe(precedentNumber);
    expect(grounding.caseMetadata.expediente.value).not.toBe(precedentNumber);
    expect(grounding.values.some((value) => value.value === precedentNumber && value.canUseAsCaseMetadata)).toBe(false);
  });

  it.each(['03', '04'])('keeps current-case facts available when case %s uses nonstandard headings', async (caseNumber) => {
    const source = await realCase(caseNumber);
    const analysis = reconstructCaseAnalysis([source], 'Redactar contestación jurídica de la fuente.');

    expect(analysis.facts.length).toBeGreaterThan(0);
    expect(analysis.richCaseAnalysis?.facts.length || 0).toBeGreaterThan(0);
    expect(analysis.facts.some((fact) => /Un hombre demandó a su padre/i.test(fact.text))).toBe(false);
  });
});

describe('FASE 2 adversarial source separation', () => {
  it('does not let ten amparo jurisprudences dominate a civil demand', () => {
    const extractedText = [
      'DEMANDA ORDINARIA CIVIL',
      'C. JUEZ DE LO CIVIL EN TURNO.',
      'VENGO A DEMANDAR RESPONSABILIDAD CIVIL Y DAÑO MORAL.',
      'PRESTACIONES: el pago de daños y perjuicios.',
      'HECHOS: el demandado incumplió su obligación.',
      'CRITERIOS JURISPRUDENCIALES APLICABLES:',
      ...Array.from({ length: 10 }, (_, index) => `Registro digital: ${2027000 + index}. Amparo directo ${index + 1}/2022.`),
    ].join('\n');
    const source = createSourceDocument({
      id: 'adversarial-demand',
      filename: 'demanda-civil.docx',
      extractedText,
      pages: [{ page: 1, text: extractedText, chars: extractedText.length }],
      sourceValidated: true,
    });
    const grounding = buildSourceGrounding(source);
    expect(grounding.container.documentType).toBe('DEMANDA_CIVIL');
    expect(grounding.container.matter).toBe('CIVIL');
    expect(grounding.container.documentFamily).toBe('DEMANDA');
  });

  it('keeps an unlabelled expediente unresolved when only precedent numbers exist', () => {
    const extractedText = [
      'C. JUEZ DE LO CIVIL EN TURNO.',
      'VENGO A DEMANDAR EL CUMPLIMIENTO DE CONTRATO.',
      'CRITERIOS JURISPRUDENCIALES:',
      'Amparo directo 3296/2004.',
      'Toca 591/2021.',
    ].join('\n');
    const source = createSourceDocument({
      id: 'adversarial-no-expediente',
      filename: 'escrito.docx',
      extractedText,
      pages: [{ page: 1, text: extractedText, chars: extractedText.length }],
      sourceValidated: true,
    });
    const grounding = buildSourceGrounding(source);
    expect(grounding.caseMetadata.expediente.value).toBeNull();
    expect(grounding.caseMetadata.status).toBe('REQUIRES_INPUT');
    expect(grounding.values.filter((value) => /3296\/2004|591\/2021/.test(value.value)).every((value) => !value.canUseAsCaseMetadata)).toBe(true);
  });

  it('keeps a contestación that cites a sentence as CONTESTACION, not SENTENCIA', () => {
    const extractedText = [
      'CONTESTACIÓN DE LA DEMANDA',
      'C. JUEZ DE LO CIVIL EN TURNO.',
      'CONTESTO LA DEMANDA EN TIEMPO Y FORMA.',
      'HECHOS: niego los hechos que no sean expresamente reconocidos.',
      'SENTENCIA CITADA: la resolución invocada sirve únicamente como referencia.',
      'JURISPRUDENCIA APLICABLE:',
      'Amparo directo 14/2021.',
    ].join('\n');
    const grounding = buildSourceGrounding(createSourceDocument({
      id: 'adversarial-contestacion-sentence',
      filename: 'contestacion.docx',
      extractedText,
      pages: [{ page: 1, text: extractedText, chars: extractedText.length }],
      sourceValidated: true,
    }));
    expect(grounding.container.documentFamily).toBe('CONTESTACION');
    expect(grounding.container.documentType).toBe('CONTESTACION_DEMANDA');
    expect(grounding.authoritySpans.some((span) => span.text.includes('Amparo directo 14/2021'))).toBe(true);
  });

  it('keeps an appeal that cites amparos as RECURSO and preserves its own expediente', () => {
    const extractedText = [
      'RECURSO DE APELACIÓN',
      'EXPEDIENTE: 77/2026',
      'C. SALA CIVIL COMPETENTE.',
      'AGRAVIOS: la resolución causa perjuicio a esta parte.',
      'CRITERIOS JURISPRUDENCIALES:',
      'Amparo directo 3296/2004.',
      'Amparo directo 591/2021.',
    ].join('\n');
    const grounding = buildSourceGrounding(createSourceDocument({
      id: 'adversarial-appeal-amparos',
      filename: 'apelacion.docx',
      extractedText,
      pages: [{ page: 1, text: extractedText, chars: extractedText.length }],
      sourceValidated: true,
    }));
    expect(grounding.container.documentFamily).toBe('RECURSO');
    expect(grounding.caseMetadata.expediente.value).toBe('77/2026');
    expect(grounding.values.filter((value) => /3296\/2004|591\/2021/.test(value.value)).every((value) => !value.canUseAsCaseMetadata)).toBe(true);
  });
});
