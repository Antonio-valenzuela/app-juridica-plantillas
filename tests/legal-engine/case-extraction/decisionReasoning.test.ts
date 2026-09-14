import { describe, expect, it } from 'vitest';
import { classifyCandidates } from '@/lib/legal-engine/case-extraction/classification';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import { extractRichCaseAnalysis } from '@/lib/legal-engine/case-extraction/orchestrator';
import { linkArgumentsToDecisionReasonings } from '@/lib/legal-engine/case-extraction/decisionReasoning';
import { createSourceDocument } from '@/lib/legal-engine/context';
import type { ExtractionCandidate, DecisionReasoningItem } from '@/lib/legal-engine/case-extraction/types';
import { buildCoverageMatrix, validateCoverageAndPlanInvariants } from '@/lib/legal-engine/coverageMatrix';
import { buildLegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import { makeFixtureDocument, makeFixtureFCaseAnalysis } from '@/tests/fixtures/richCoverageFixtures';

function candidate(text: string): ExtractionCandidate {
  return {
    candidateId: 'reasoning-candidate-1',
    kind: 'ASSERTION',
    rawText: text,
    provenance: [{
      ...createSourceProvenance({
        sourceId: 'decision-source',
        page: 12,
        elementIndex: 4,
        excerpt: text,
        extractionMethod: 'PARAGRAPH',
        confidence: 1,
        inferenceLevel: 'LITERAL',
      }),
      candidateId: 'reasoning-candidate-1',
    }],
    decision: 'REQUIRES_REVIEW',
  };
}

describe('court reasoning classification', () => {
  it('classifies an unambiguous court decision reasoning candidate', () => {
    const [classified] = classifyCandidates([
      candidate('Este órgano colegiado advierte que la resolución impugnada carece de exhaustividad.'),
    ]);

    expect(classified.kind).toBe('DECISION_REASONING');
    expect(classified.classification?.label).toBe('DECISION_REASONING');
    expect(classified.speakerRole).toBe('RESOLUTOR');
  });

  it('classifies an explicit holding separately from decision reasoning', () => {
    const [classified] = classifyCandidates([
      candidate('En ese tenor, se impone negar el amparo solicitado.'),
    ]);

    expect(classified.kind).toBe('HOLDING');
    expect(classified.classification?.label).toBe('HOLDING');
    expect(classified.speakerRole).toBe('RESOLUTOR');
  });

  it('keeps an isolated resolutive heading out of substantive classifications', () => {
    const [classified] = classifyCandidates([candidate('R E S U L V E:')]);

    expect(classified.kind).toBe('ASSERTION');
    expect(classified.classification?.label).not.toBe('HOLDING');
  });
});

type ReasoningAnalysis = ReturnType<typeof extractRichCaseAnalysis> & {
  decisionReasonings?: Array<{
    id: string;
    proposition: string;
    reasoningType: string;
    courtAttribution: string;
    provenance: Array<{ sourceId: string; candidateId?: string; page?: number }>;
    challengedByArgumentIds: string[];
  }>;
};

function analyze(text: string): ReasoningAnalysis {
  const source = createSourceDocument({
    id: 'decision-source',
    filename: 'decision.txt',
    type: 'txt',
    sourceValidated: true,
    pages: [{ page: 12, text, chars: text.length }],
  });
  return extractRichCaseAnalysis([source]) as ReasoningAnalysis;
}

describe('rich decision reasoning extraction', () => {
  it('materializes court reasoning with bounded source provenance', () => {
    const analysis = analyze('CONSIDERANDO V: Este órgano colegiado advierte que la resolución impugnada carece de exhaustividad.');

    expect(analysis.decisionReasonings).toHaveLength(1);
    expect(analysis.decisionReasonings?.[0]).toMatchObject({
      reasoningType: 'DECISION_REASONING',
      courtAttribution: 'RESOLUTOR',
    });
    expect(analysis.decisionReasonings?.[0]?.proposition).toMatch(/Este órgano colegiado advierte/);
    expect(analysis.decisionReasonings?.[0]?.proposition.length).toBeLessThan(500);
    expect(analysis.decisionReasonings?.[0]?.provenance[0]).toMatchObject({ sourceId: 'decision-source', page: 12 });
  });

  it('materializes a holding separately', () => {
    const analysis = analyze('En ese tenor, se impone negar el amparo solicitado.');

    expect(analysis.decisionReasonings).toHaveLength(1);
    expect(analysis.decisionReasonings?.[0]?.reasoningType).toBe('HOLDING');
  });

  it('does not promote an isolated resolutive heading to a holding proposition', () => {
    const analysis = analyze('R E S U L V E:');

    expect(analysis.decisionReasonings).toEqual([]);
  });

  it('excludes party reports, authority quotes, and procedural narrative', () => {
    const analysis = analyze([
      'El quejoso refiere que la autoridad violó sus derechos.',
      'El tribunal cita: “Este órgano colegiado advierte que la resolución es válida, tesis 1/2024.”',
      'R E S U L T A N D O: El treinta de enero se presentó la demanda.',
    ].join('\n'));

    expect(analysis.decisionReasonings).toEqual([]);
  });

  it('links only an explicit argument challenge to the exact reasoning reference', () => {
    const analysis = analyze([
      'CONSIDERANDO V: Este órgano colegiado advierte que la resolución impugnada carece de exhaustividad.',
      'AGRAVIO: Impugno expresamente la consideración V porque la conclusión es incorrecta.',
    ].join('\n'));

    const reasoning = analysis.decisionReasonings?.[0];
    const argument = analysis.arguments[0];
    expect(reasoning?.challengedByArgumentIds).toEqual([argument?.id]);
    expect(argument?.challengedReasoningIds).toEqual([reasoning?.id]);
  });

  it('does not link a nearby argument without an exact structural challenge', () => {
    const analysis = analyze([
      'CONSIDERANDO V: Este órgano colegiado advierte que la resolución impugnada carece de exhaustividad.',
      'AGRAVIO: La parte controvierte la resolución porque falta exhaustividad.',
    ].join('\n'));

    expect(analysis.decisionReasonings?.[0]?.challengedByArgumentIds).toEqual([]);
    expect(analysis.arguments[0]?.challengedReasoningIds).toEqual([]);
  });

  it('does not convert a historical source challenge into current client position', () => {
    const analysis = analyze([
      'CONSIDERANDO V: Este órgano colegiado advierte que la resolución impugnada carece de exhaustividad.',
      'AGRAVIO: Impugno expresamente la consideración V porque la conclusión es incorrecta.',
    ].join('\n'));

    expect(analysis.clientPosition.source).toBe('SOURCE_POSITION');
    expect(analysis.clientPosition.propositionIds).not.toContain(analysis.arguments[0]?.id);
  });

  it('keeps reasoning identity deterministic across repeated extraction', () => {
    const text = 'CONSIDERANDO V: Este órgano colegiado advierte que la resolución impugnada carece de exhaustividad.';

    const first = analyze(text).decisionReasonings?.map((reasoning) => reasoning.id);
    const second = analyze(text).decisionReasonings?.map((reasoning) => reasoning.id);

    expect(first).toEqual(second);
    expect(first?.[0]).not.toMatch(/(?:^|-)\d+$/);
  });
});

describe('decision reasoning relationship propagation', () => {
  it('preserves an explicit challenge through Coverage into LegalIssue', () => {
    const analysis = makeFixtureFCaseAnalysis();
    const argument = analysis.richCaseAnalysis!.arguments[0];
    const reasoning: DecisionReasoningItem = {
      id: 'reasoning-explicit',
      proposition: 'El tribunal considera infundada la excepción.',
      reasoningType: 'DECISION_REASONING',
      courtAttribution: 'RESOLUTOR',
      provenance: argument.provenance,
      challengedByArgumentIds: [argument.id],
    };
    analysis.richCaseAnalysis!.decisionReasonings = [reasoning];
    analysis.richCaseAnalysis!.arguments = [{
      ...argument,
      challengedReasoningIds: [reasoning.id],
    }];

    const document = makeFixtureDocument();
    const coverage = buildCoverageMatrix(analysis, document, document.sections);
    const argumentCoverage = coverage.items.find((item) => item.argumentIds?.includes(argument.id));
    expect(argumentCoverage?.relatedChallengedReasoningIds).toEqual([reasoning.id]);

    const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
    const issue = matrix.issues.find((item) => item.source.coverageItemId === `cov-source-argument-${argument.id}`);
    expect(issue?.challengedReasoningIds).toEqual([reasoning.id]);
    expect(validateCoverageAndPlanInvariants(coverage, undefined, analysis, matrix).errors).toEqual([]);
  });

  it('does not fabricate fact, claim, or authority relations from a reasoning link', () => {
    const analysis = makeFixtureFCaseAnalysis();
    const reasoning: DecisionReasoningItem = {
      id: 'reasoning-only',
      proposition: 'El tribunal considera infundada la excepción.',
      reasoningType: 'DECISION_REASONING',
      courtAttribution: 'RESOLUTOR',
      provenance: [],
      challengedByArgumentIds: ['argument-only'],
    };
    analysis.richCaseAnalysis!.decisionReasonings = [reasoning];
    analysis.richCaseAnalysis!.arguments = [{
      id: 'argument-only',
      proposition: 'La fuente combate expresamente la consideración.',
      supportingFactIds: [],
      citedAuthorityIds: [],
      challengedReasoningIds: [reasoning.id],
      provenance: [],
    }];
    analysis.richCaseAnalysis!.authorities = [{
      id: 'unrelated-authority',
      authorityType: 'ARTICLE',
      citationText: 'Artículo independiente.',
      verificationStatus: 'SOURCE_CITED',
      provenance: [],
    }];

    const document = makeFixtureDocument();
    const coverage = buildCoverageMatrix(analysis, document, document.sections);
    const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
    const issue = matrix.issues.find((item) => item.source.coverageItemId === 'cov-source-argument-argument-only');

    expect(issue?.challengedReasoningIds).toEqual([reasoning.id]);
    expect(issue?.factIds).toEqual([]);
    expect(issue?.claimIds).toEqual([]);
    expect(issue?.authorityMentionIds).toEqual([]);
  });

  it('fails closed when the explicit reference matches multiple reasonings', () => {
    const argument = makeFixtureFCaseAnalysis().richCaseAnalysis!.arguments[0];
    const reasonings: DecisionReasoningItem[] = [
      {
        id: 'reasoning-v-a',
        proposition: 'El tribunal considera infundada la primera cuestión.',
        reasoningType: 'DECISION_REASONING',
        courtAttribution: 'RESOLUTOR',
        referenceNumber: 'V',
        provenance: argument.provenance,
        challengedByArgumentIds: [],
      },
      {
        id: 'reasoning-v-b',
        proposition: 'El tribunal considera infundada la segunda cuestión.',
        reasoningType: 'DECISION_REASONING',
        courtAttribution: 'RESOLUTOR',
        referenceNumber: 'V',
        provenance: argument.provenance,
        challengedByArgumentIds: [],
      },
    ];
    const linked = linkArgumentsToDecisionReasonings([{
      ...argument,
      proposition: 'Impugno expresamente la consideración V porque la conclusión es incorrecta.',
    }], reasonings);

    expect(linked.arguments[0]?.challengedReasoningIds).toEqual([]);
    expect(linked.decisionReasonings.every((reasoning) => reasoning.challengedByArgumentIds.length === 0)).toBe(true);
  });

  it('does not treat duplicate provenance on one reasoning as an ambiguous reference', () => {
    const argument = makeFixtureFCaseAnalysis().richCaseAnalysis!.arguments[0];
    const reasoning: DecisionReasoningItem = {
      id: 'reasoning-v-single',
      proposition: 'El tribunal considera infundada la cuestión.',
      reasoningType: 'DECISION_REASONING',
      courtAttribution: 'RESOLUTOR',
      referenceNumber: 'V',
      provenance: [...argument.provenance, ...argument.provenance],
      challengedByArgumentIds: [],
    };
    const linked = linkArgumentsToDecisionReasonings([{
      ...argument,
      proposition: 'Impugno expresamente la consideración V porque la conclusión es incorrecta.',
    }], [reasoning]);

    expect(linked.arguments[0]?.challengedReasoningIds).toEqual([reasoning.id]);
    expect(linked.decisionReasonings[0]?.challengedByArgumentIds).toEqual([argument.id]);
  });
});
