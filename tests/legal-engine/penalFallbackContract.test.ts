import { it, expect } from 'vitest';
import { controlledSource, controlledDocument } from '@/tests/fixtures/controlledLegalQuality';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { buildCaseContext } from '@/lib/legal-engine/caseContext';
import { generateLegalBlock } from '@/lib/legal-engine/pipeline';
import { DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';
import type { LegalBlock } from '@/lib/legal-engine/blockPlanner';
import type { DocumentIndex } from '@/lib/legal-engine/documentIndex';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';
it('unknown penal facts do not become an asserted crime/victim/participant in deterministic rendering', async () => {
  const doc: UniversalLegalDocument = controlledDocument('penal');
  const source = controlledSource('penal');
  doc.caseContext = buildCaseContext([source], reconstructCaseAnalysis([source], ''), undefined, undefined, undefined, 'apelacion_penal');
  doc.caseContext!.penal!.delitoImputado = { key: 'delitoImputado', label: 'Delito investigado', status: 'MISSING', resolution: 'REQUIRES_LAWYER_DECISION' };
  const block: LegalBlock = { id: 'missing-facts', kind: 'antecedentes', sectionType: 'background', title: 'Antecedentes penales', level: 1, order: 1, text: '', sourceElementIndices: [], pages: { start: 1, end: 1 }, aiNeed: 'PRESERVE_DIRECT', requiresAi: false, classificationReason: 'Deterministic regression', elementCount: 0, charCount: 0 };
  const output = await generateLegalBlock(block, doc, {} as DocumentIndex, undefined, undefined, undefined, DEFAULT_LAWYER_PROFILE);
  expect(output.text).not.toMatch(/Se investigan hechos|cometidos en agravio|probable part[ií]cipe/);
  expect(output.text).toContain('[DATO PENDIENTE: Delito investigado]');
});
it.each(['apelacion', 'amparo', 'penal'] as const)('does not affirm timeliness or the requested merits without support: %s', async matter => {
  const doc = controlledDocument(matter);
  const source = controlledSource(matter);
  const analysis = reconstructCaseAnalysis([source], 'Preparar borrador preliminar; no confirmar oportunidad ni procedencia.');
  doc.caseContext = buildCaseContext([source], analysis, undefined, undefined, undefined, doc.documentType);
  const block: LegalBlock = { id: 'missing-petition', kind: 'petitorios', sectionType: 'petition', title: 'Puntos petitorios', level: 1, order: 1, text: '', sourceElementIndices: [], pages: { start: 1, end: 1 }, aiNeed: 'PRESERVE_DIRECT', requiresAi: false, classificationReason: 'Deterministic regression', elementCount: 0, charCount: 0 };
  const output = await generateLegalBlock(block, doc, {} as DocumentIndex, analysis, undefined, undefined, DEFAULT_LAWYER_PROFILE);
  expect(output.text).not.toMatch(/en tiempo y forma|declarando fundadas|resoluci[oó]n favorable/);
  expect(output.text).toMatch(/PENDIENTE|REQUIERE/);
});
