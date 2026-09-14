import { describe, expect, it } from 'vitest';
import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { bindCoverageToSections } from '@/lib/legal-engine/richCoverage';
import { buildDraftingPlan } from '@/lib/legal-engine/pipeline';
import { buildGenerationTasksForSection } from '@/lib/legal-engine/generationTasks';
import { deduplicateRichItems } from '@/lib/legal-engine/case-extraction/deduplication';
import { isCoverageSatisfied } from '@/lib/legal-engine/coveragePolicy';
import { makeFixtureDocument, makeFixtureFCaseAnalysis } from '@/tests/fixtures/richCoverageFixtures';
import type { CaseParty } from '@/lib/legal-engine/case-extraction/types';
import type { DocumentCoverageItem } from '@/lib/legal-engine/coverageMatrix';

describe('rich Coverage contracts and legacy regressions', () => {
  it('Contract 31: rich planning ignores contradictory legacy arrays', () => {
    const analysis = makeFixtureFCaseAnalysis({
      claims: ['IMPROCEDENTE POR PRESCRIPCIÓN'],
      facts: [{ id: 'legacy-fact', number: '1', text: 'legacy fact', confidence: 0.5 }],
    });
    const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
    expect(matrix.items.some((item) => item.description.includes('IMPROCEDENTE'))).toBe(false);
    expect(matrix.items.some((item) => item.category === 'CLAIM_RESPONSE')).toBe(true);
  });

  it('Contract 32: legacy behavior remains available when rich analysis is absent', () => {
    const analysis = makeFixtureFCaseAnalysis({ richCaseAnalysis: undefined, claims: ['LEGACY CLAIM'] });
    const doc = makeFixtureDocument();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    expect(matrix.items.some((item) => item.category === 'CLAIM')).toBe(true);
  });

  it('Contract 33: SOURCE_CITED remains distinct from LEGALLY_VERIFIED', () => {
    const matrix = buildCoverageMatrix(makeFixtureFCaseAnalysis(), makeFixtureDocument(), makeFixtureDocument().sections);
    const authority = matrix.items.find((item) => item.authorityMentionIds?.includes('fixture-f-authority-1'))!;
    expect(authority.metadata?.verificationStatus).toBe('SOURCE_CITED');
    expect(authority.metadata?.verificationStatus).not.toBe('LEGALLY_VERIFIED');
  });

  it('Contract 34: explicit relation links are preserved and absent links are UNLINKED', () => {
    const analysis = makeFixtureFCaseAnalysis();
    analysis.richCaseAnalysis!.claims[1] = { ...analysis.richCaseAnalysis!.claims[1], factualBasisIds: [], evidenceMentionIds: [] };
    const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
    const linked = matrix.items.find((item) => item.claimIds?.includes('fixture-f-claim-1'))!;
    const unlinked = matrix.items.find((item) => item.claimIds?.includes('fixture-f-claim-2'))!;
    expect(linked.relationStatus).toBe('EXPLICIT');
    expect(unlinked.relationStatus).toBe('UNLINKED');
  });

  it('Contract 35: similar names are not fused and retain review provenance', () => {
    const party = (id: string, name: string, sourceId: string): CaseParty => ({
      id, name, role: 'ACTOR', aliases: [], confirmed: false, confidence: 0.8,
      provenance: [{ sourceId, excerptHash: id, extractionMethod: 'PARAGRAPH', confidence: 0.8, inferenceLevel: 'LITERAL' }],
    });
    const result = deduplicateRichItems([party('p1', 'Ana López', 'source-a'), party('p2', 'Ana L. López', 'source-b')]);
    expect(result.items).toHaveLength(2);
    expect(result.mergeReasons).toContain('IDENTITY_SIMILARITY_REQUIRES_REVIEW');
  });

  it('Contract 36: conflicts stay open without selecting a winning source', () => {
    const matrix = buildCoverageMatrix(makeFixtureFCaseAnalysis(), makeFixtureDocument(), makeFixtureDocument().sections);
    const conflict = matrix.items.find((item) => item.category === 'CONFLICT_REVIEW')!;
    expect(conflict.status).toBe('blocked');
    expect(conflict.metadata?.requiresReview).toBe(true);
    expect(conflict.metadata?.selectedSourceId).toBeUndefined();
    expect(conflict.metadata?.sourceIds).toEqual(['fixture-f-source-a', 'fixture-f-source-b']);
  });

  it('Contract 37: binding does not create universal sections', () => {
    const doc = makeFixtureDocument();
    const matrix = buildCoverageMatrix(makeFixtureFCaseAnalysis(), doc, doc.sections);
    const binding = bindCoverageToSections(doc.sections, matrix);
    expect(binding.sections.map((section) => section.id)).toEqual(doc.sections.map((section) => section.id));
    expect(binding.sections.every((section) => !section.id.startsWith('universal-'))).toBe(true);
  });

  it('Contract 38: task links use exact canonical Coverage IDs', () => {
    const analysis = makeFixtureFCaseAnalysis();
    const doc = makeFixtureDocument();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const plan = buildDraftingPlan(doc, 5000, analysis, matrix);
    const section = plan.sections.find((candidate) => candidate.claimPlans?.length)!;
    const tasks = buildGenerationTasksForSection(section, doc, analysis, matrix);
    const ids = new Set(matrix.items.map((item) => item.id));
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.flatMap((task) => task.coverageItemIds || []).every((id) => ids.has(id))).toBe(true);
  });

  it('Contract 39: petition support remains separate from claim response', () => {
    const matrix = buildCoverageMatrix(makeFixtureFCaseAnalysis(), makeFixtureDocument(), makeFixtureDocument().sections);
    const claim = matrix.items.find((item) => item.category === 'CLAIM_RESPONSE')!;
    const petition = matrix.items.find((item) => item.category === 'PETITION_SUPPORT')!;
    expect(claim.id).not.toBe(petition.id);
    expect(claim.category).toBe('CLAIM_RESPONSE');
    expect(petition.targetSectionIds).toEqual(['sec-petitorios']);
  });

  it('Contract 40: formal deterministic blocks are valid while substantive deterministic blocks are not', () => {
    const formal: DocumentCoverageItem = {
      id: 'cov-formal-heading', category: 'FORMAL_REQUIREMENT', description: 'Encabezado', required: true,
      status: 'pending', targetSectionIds: ['sec-firma'], scope: 'FORMAL', satisfactionPolicy: 'FORMAL_DETERMINISTIC_ALLOWED', blocking: false,
    };
    const substantive: DocumentCoverageItem = { ...formal, id: 'cov-substantive', category: 'FACT_RESPONSE', scope: 'SUBSTANTIVE', satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE' };
    const blocks = [{ id: 'block-1', text: 'Rubro formal', generatedBy: 'DETERMINISTIC' as const, coverageItemIds: ['cov-formal-heading'] }, { id: 'block-2', text: 'Texto determinístico', generatedBy: 'DETERMINISTIC' as const, coverageItemIds: ['cov-substantive'] }];
    expect(isCoverageSatisfied(formal, blocks, [])).toMatchObject({ satisfied: true });
    expect(isCoverageSatisfied(substantive, blocks, [])).toMatchObject({ satisfied: false });
  });

  it('Contract 41: technical IDs stay out of visible rich skeleton text', () => {
    const doc = makeFixtureDocument();
    const visible = doc.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');
    expect(visible).not.toMatch(/fixture-f-|cov-|task-/i);
  });

  it('Contract 42: matrix construction is deterministic for the same rich input', () => {
    const analysis = makeFixtureFCaseAnalysis();
    const doc = makeFixtureDocument();
    const first = buildCoverageMatrix(analysis, doc, doc.sections);
    const second = buildCoverageMatrix(analysis, doc, doc.sections);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
