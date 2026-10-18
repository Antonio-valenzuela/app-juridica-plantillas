import { it, expect } from 'vitest';
import { controlledSource, controlledDocument } from '@/tests/fixtures/controlledLegalQuality';
import { buildContestacionSkeleton } from '@/lib/legal-engine/contestacionStructure';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { buildFactResponseMatrix } from '@/lib/legal-engine/legalDocumentPlan';
import type { UniversalLegalDocument, UploadedSourceDocument } from '@/lib/legal-engine/types';
const source: UploadedSourceDocument = controlledSource('contestacion');
it('civil response plan separates arguments from law, defenses and petition', () => {
  const doc: UniversalLegalDocument = controlledDocument('contestacion');
  const analysis = reconstructCaseAnalysis([source], 'Preparar contestación de demanda.');
  const sections = buildContestacionSkeleton(doc, analysis, [], 'contestacion_demanda_civil');
  for (const title of ['COMPARECENCIA Y PERSONALIDAD', 'OBJETO DEL ESCRITO', 'CONTESTACIÓN DE PRESTACIONES', 'CONTESTACIÓN DE HECHOS', 'EXCEPCIONES Y DEFENSAS', 'PRUEBAS', 'DERECHO', 'ARGUMENTOS', 'PETITORIOS']) {
    expect(sections.map(s => s.title)).toContain(title);
  }
  const law = sections.find(section => section.title === 'DERECHO')!.content.map(block => block.text).join('\n');
  expect(law).not.toContain('Son aplicables las disposiciones');
  expect(law).toMatch(/pendiente|verific/i);
});
it('every factual response row carries basis, evidence and risk without a manufactured position', () => {
  const analysis = reconstructCaseAnalysis([source], 'Preparar contestación de demanda.');
  const matrix = buildFactResponseMatrix(analysis.facts);
  expect(matrix.rows).toHaveLength(4);
  for (const row of matrix.rows) {
    expect(row.positionStatus).toBe('PENDING');
    expect(row.evidenceIds).toEqual([]);
    expect((row as unknown as { factualBasis: { factIds: string[] } }).factualBasis?.factIds).toEqual([row.factId]);
    expect((row as unknown as { risk: string[] }).risk).toContain('ATTORNEY_POSITION_REQUIRED');
  }
});
