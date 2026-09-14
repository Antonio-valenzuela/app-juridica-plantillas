import { describe, expect, it } from 'vitest';
import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { bindCoverageToSections } from '@/lib/legal-engine/richCoverage';
import { buildDocumentPlan } from '@/lib/legal-engine/documentPlan';
import { getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import { fixtureFSourceDocuments, makeFixtureDocument, makeFixtureFCaseAnalysis } from '@/tests/fixtures/richCoverageFixtures';
import { buildDraftingPlan } from '@/lib/legal-engine/pipeline';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

function buildContestacionRichFixtureDocument(options: { legacyClaim?: string } = {}) {
  const analysis = makeFixtureFCaseAnalysis(options.legacyClaim ? { claims: [options.legacyClaim] } : {});
  analysis.richCaseAnalysis!.facts = [{
    id: 'fixture-f-fact-1',
    proposition: 'La relación jurídica se inició en enero de 2024',
    participants: [],
    assertionStatus: 'SOURCE_ASSERTION',
    provenance: [],
    relatedDocumentIds: [],
  }];
  analysis.richCaseAnalysis!.claims = [{
    id: 'fixture-f-claim-1',
    requestedRelief: 'Pago de salarios',
    factualBasisIds: ['fixture-f-fact-1'],
    evidenceMentionIds: [],
    provenance: [],
    status: 'SOURCE_MENTIONED',
  }];
  analysis.richCaseAnalysis!.evidenceMentions = [{
    id: 'fixture-f-evidence-mention-1',
    description: 'Contrato mencionado por la fuente',
    relatedFactIds: ['fixture-f-fact-1'],
    relatedClaimIds: ['fixture-f-claim-1'],
    status: 'SOURCE_MENTIONED',
    provenance: [],
  }];
  const doc = makeFixtureDocument();
  const template = getDocumentTemplate('contestacion_demanda_laboral');
  return { ...doc, sections: buildDocumentPlan({ doc, template, caseAnalysis: analysis }).sections };
}

function buildRichDraftingPlanForFixtureF() {
  const analysis = makeFixtureFCaseAnalysis();
  const doc = makeFixtureDocument();
  const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
  return { plan: buildDraftingPlan(doc, 5000, analysis, matrix), matrix };
}

function buildRichPlanForFixtureF() {
  const analysis = makeFixtureFCaseAnalysis();
  analysis.richCaseAnalysis!.facts = [{
    id: 'fixture-f-fact-1',
    proposition: 'Hecho fuente de prueba',
    participants: [],
    assertionStatus: 'SOURCE_ASSERTION',
    provenance: [],
    relatedDocumentIds: [],
  }];
  const doc = makeFixtureDocument();
  const sections = buildDocumentPlan({
    doc,
    template: getDocumentTemplate('contestacion_demanda_laboral'),
    caseAnalysis: analysis,
  }).sections;
  const matrix = buildCoverageMatrix(analysis, { ...doc, sections }, sections);
  const binding = bindCoverageToSections(sections, matrix);
  return { sections: binding.sections, matrix, orphans: binding.orphanCoverageItemIds };
}

describe('rich Coverage binding to DocumentPlan', () => {
  it('explains each material section through Coverage IDs and keeps required IDs valid', () => {
    const result = buildRichPlanForFixtureF();
    const section = result.sections.find((item) => item.type === 'background')!;
    expect(section.coverageItemIds?.length).toBeGreaterThan(0);
    expect(section.requiredCoverageItemIds).toEqual(expect.arrayContaining(
      section.coverageItemIds!.filter((id) => id.includes('fact')),
    ));
    expect(section.coverageReason).toMatch(/Coverage|hecho/i);
  });

  it('reports a rich Coverage item without an eligible section instead of assigning by title text', () => {
    const analysis = makeFixtureFCaseAnalysis();
    const doc = makeFixtureDocument();
    const sections = buildDocumentPlan({
      doc,
      template: getDocumentTemplate('contestacion_demanda_laboral'),
      caseAnalysis: analysis,
    }).sections;
    const matrix = buildCoverageMatrix(analysis, { ...doc, sections }, sections);
    matrix.items.push({
      id: 'cov-orphan-rich',
      category: 'SOURCE_ARGUMENT_RESPONSE',
      description: 'orphan',
      required: true,
      status: 'blocked',
      targetSectionIds: [],
      scope: 'SUBSTANTIVE',
      satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
      blocking: true,
      requiresClientPosition: false,
    });
    const binding = bindCoverageToSections(sections, matrix);
    expect(binding.orphanCoverageItemIds).toContain('cov-orphan-rich');
    expect(binding.sections.some((section) => section.coverageItemIds?.includes('cov-orphan-rich'))).toBe(false);
  });

  it('maps claims and petition support to their distinct canonical sections for a non-labor template', () => {
    const analysis = makeFixtureFCaseAnalysis();
    analysis.richCaseAnalysis!.claims = [{
      id: 'fixture-civil-claim-1',
      requestedRelief: 'Cumplimiento contractual',
      factualBasisIds: [],
      evidenceMentionIds: [],
      provenance: [],
      status: 'SOURCE_MENTIONED',
    }];
    analysis.richCaseAnalysis!.arguments = [{
      id: 'fixture-civil-argument-1',
      proposition: 'Apoyo explícito al petitorio',
      supportingFactIds: ['fixture-civil-fact-1'],
      citedAuthorityIds: [],
      petitionSectionIds: ['sec-con-petitorios'],
      provenance: [],
    }];
    const doc = { ...makeFixtureDocument(), documentType: 'contestacion_demanda_civil', documentTypeLabel: 'Contestación civil' };
    const sections = buildDocumentPlan({
      doc,
      template: getDocumentTemplate('contestacion_demanda_civil'),
      caseAnalysis: analysis,
    }).sections;
    const matrix = buildCoverageMatrix(analysis, { ...doc, sections }, sections);
    const binding = bindCoverageToSections(sections, matrix);
    const claim = matrix.items.find((item) => item.category === 'CLAIM_RESPONSE')!;
    const petition = matrix.items.find((item) => item.category === 'PETITION_SUPPORT')!;
    expect(binding.sections.find((section) => section.coverageItemIds?.includes(claim.id))?.type).not.toBe('petition');
    expect(binding.sections.find((section) => section.coverageItemIds?.includes(petition.id))?.type).toBe('petition');
  });

  it('builds contestación seeds from rich entities and leaves unknown posture neutral', () => {
    const doc = buildContestacionRichFixtureDocument();
    const ids = doc.sections.flatMap((section) => section.content.flatMap((block) => block.coverageItemIds || []));
    const text = doc.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');
    expect(ids.some((id) => id.includes('fixture-f-fact-1'))).toBe(true);
    expect(text).not.toMatch(/\b(CIERTO|SE_IGNORA|IMPROCEDENTE|SE NIEGA|excepci[oó]n|defensa)\b/i);
  });

  it('does not let contradictory legacy claim text contaminate the rich skeleton', () => {
    const doc = buildContestacionRichFixtureDocument({ legacyClaim: 'IMPROCEDENTE POR PRESCRIPCIÓN' });
    const text = doc.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');
    expect(text).not.toContain('IMPROCEDENTE POR PRESCRIPCIÓN');
  });

  it('keeps technical rich IDs in metadata and out of visible block text', () => {
    const doc = buildContestacionRichFixtureDocument();
    const visible = doc.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');
    expect(visible).not.toMatch(/fixture-f-fact-1|cov-claim-|task-/i);
  });

  it('does not synthesize claim or fact responses from rich data', () => {
    const { plan } = buildRichDraftingPlanForFixtureF();
    const claims = plan.sections.flatMap((section) => section.claimPlans || []);
    const facts = plan.sections.flatMap((section) => section.factResponsePlans || []);
    expect(claims).toHaveLength(2);
    expect(claims.every((claim) => claim.contestedStatus === undefined && claim.defenseStrategy === undefined)).toBe(true);
    expect(facts).toHaveLength(4);
    expect(facts.every((fact) => fact.responseKind === undefined)).toBe(true);
    expect(facts.every((fact) => fact.relatedCoverageItemIds?.length)).toBe(true);
  });

  it('uses the same rich Coverage item IDs in plan, tasks, blocks and trace', async () => {
    const { runGenerationPipeline } = await import('@/lib/legal-engine/pipeline');
    const doc = await runGenerationPipeline({
      flow: 'DOCUMENT_ANALYSIS',
      matter: 'civil',
      documentTypeLabel: 'Contestación de demanda laboral',
      sourceDocuments: fixtureFSourceDocuments(),
      userInstruction: 'Contestar la demanda con postura pendiente donde la fuente no confirma posición',
      traceOptions: { enabled: true },
    });
    const matrixIds = new Set((doc.coverageMatrix?.items || []).map((item) => item.id));
    const richIds = (doc.coverageMatrix?.items || []).filter((item) => item.sourceEntityType).map((item) => item.id);
    const generatedDoc = doc as UniversalLegalDocument & { draftingPlan?: { sections?: Array<{ coverageItemIds?: string[] }> } };
    const planIds = new Set((generatedDoc.draftingPlan?.sections || []).flatMap((section) => section.coverageItemIds || []));
    const taskIds = new Set((doc.sections || []).flatMap((section) => section.content.flatMap((block) => block.coverageItemIds || [])));
    expect(richIds.length).toBeGreaterThan(0);
    expect([...planIds].every((id) => matrixIds.has(String(id)))).toBe(true);
    expect([...taskIds].every((id) => matrixIds.has(id))).toBe(true);
    expect(doc.generationMetadata.auditTrace?.coverageMatrixBeforeGeneration?.items.some((item) => item.id.startsWith('cov-'))).toBe(true);
  });
});
