import { describe, expect, it } from 'vitest';
import { collectRichCoverageFixtureMetrics, fixtureFSourceDocuments, makeFixtureFCaseAnalysis } from '@/tests/fixtures/richCoverageFixtures';

describe('rich Coverage fixture metrics', () => {
  it('fixture F contains the approved contestación shape', () => {
    const analysis = makeFixtureFCaseAnalysis();
    expect(analysis.richCaseAnalysis?.claims).toHaveLength(2);
    expect(analysis.richCaseAnalysis?.facts).toHaveLength(4);
    expect(analysis.richCaseAnalysis?.evidenceMentions.length).toBeGreaterThanOrEqual(2);
    expect(analysis.richCaseAnalysis?.evidenceOffers).toHaveLength(1);
    expect(analysis.richCaseAnalysis?.conflicts).toHaveLength(1);
    expect(analysis.richCaseAnalysis?.missingData.length).toBeGreaterThanOrEqual(2);
  });

  it('reports deterministic A-F Coverage metrics', () => {
    const metrics = collectRichCoverageFixtureMetrics();
    expect(metrics.F.coverageTotal).toBeGreaterThan(0);
    expect(metrics.F.coverageBlocked).toBeGreaterThan(0);
    expect(metrics.F.coverageByType.CLAIM_RESPONSE).toBe(2);
    expect(metrics.F.coverageByType.FACT_RESPONSE).toBe(4);
    expect(metrics.F.orphanCoverageItems).toEqual([]);
  });

  it('retains rich entity counts for every extraction fixture', () => {
    const metrics = collectRichCoverageFixtureMetrics();
    for (const key of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
      expect(metrics[key].plannedSections).toBeGreaterThan(0);
      expect(metrics[key].coverageTotal).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(metrics[key].orphanCoverageItems)).toBe(true);
    }
  });

  it('keeps fixture F substantive and formal scope counts separate', () => {
    const metric = collectRichCoverageFixtureMetrics().F;
    expect(metric.coverageByScope.SUBSTANTIVE).toBeGreaterThan(0);
    expect(metric.coverageByScope.FORMAL).toBeUndefined();
    expect(metric.coverageByType.PETITION_SUPPORT).toBeGreaterThanOrEqual(1);
  });

  it('marks fixture F ineligible while blocking unresolved substantive requirements', () => {
    const metric = collectRichCoverageFixtureMetrics().F;
    expect(metric.finalReadyEligible).toBe(false);
    expect(metric.coverageBlocked).toBeGreaterThanOrEqual(1);
  });

  it('reports the hand-checked fixture F Coverage status distribution', () => {
    const metric = collectRichCoverageFixtureMetrics().F as ReturnType<typeof collectRichCoverageFixtureMetrics>['F'] & {
      coverageByStatus: Record<string, number>;
    };
    expect(metric.coverageByStatus).toEqual({ needs_client_position: 6, pending: 10, blocked: 2 });
  });

  it('reports extraction candidate decisions without deriving them from Coverage', () => {
    const metric = collectRichCoverageFixtureMetrics().F as ReturnType<typeof collectRichCoverageFixtureMetrics>['F'] & {
      candidateDecisions: { detected: number; accepted: number; merged: number; rejected: number; review: number };
    };
    expect(metric.candidateDecisions).toEqual({ detected: 0, accepted: 0, merged: 0, rejected: 0, review: 0 });
  });

  it('reports conservative legacy projection losses for fixture F', () => {
    const metric = collectRichCoverageFixtureMetrics().F as ReturnType<typeof collectRichCoverageFixtureMetrics>['F'] & {
      legacyProjectionLosses: string[];
    };
    expect(metric.legacyProjectionLosses).toEqual(expect.arrayContaining([
      'EvidenceMention status cannot be represented as CLIENT_CONFIRMED in legacy evidence',
      'SourceAssertion remains a source assertion and cannot be represented as an established legacy fact',
    ]));
    expect(metric.legacyProjectionLosses).not.toContain('ClientPosition status remains UNKNOWN in legacy projection');
  });

  it('attaches source provenance to every material fixture F entity', () => {
    const rich = makeFixtureFCaseAnalysis().richCaseAnalysis!;
    const materialEntities = [
      ...rich.parties,
      ...rich.claims,
      ...rich.facts,
      ...rich.documents,
      ...rich.evidenceMentions,
      ...rich.evidenceOffers,
      ...rich.arguments,
      ...rich.authorities,
      ...rich.dates,
      ...rich.amounts,
    ];
    expect(materialEntities.length).toBeGreaterThan(0);
    expect(materialEntities.every((entity) => entity.provenance.length > 0)).toBe(true);
    expect(rich.sourcePosition.provenance.length).toBeGreaterThan(0);
  });

  it('contains one explicit client position while leaving other fixture F facts unconfirmed', () => {
    const rich = makeFixtureFCaseAnalysis().richCaseAnalysis!;
    expect(rich.clientPosition.status).toBe('CONFIRMED');
    expect(rich.clientPosition.source).toBe('CLIENT_POSITION');
    expect(rich.clientPosition.propositionIds).toEqual(['fixture-f-fact-2']);
    expect(rich.clientPosition.propositionIds).not.toContain('fixture-f-fact-1');
  });

  it('keeps the client-confirmed source allegation distinct from an established fact', () => {
    const rich = makeFixtureFCaseAnalysis().richCaseAnalysis!;
    const clientLinkedFact = rich.facts.find((fact) => fact.id === 'fixture-f-fact-2')!;
    expect(clientLinkedFact.assertionStatus).toBe('SOURCE_ASSERTION');
  });

  it('keeps every fixture-f-source excerpt literal and bounded to the synthetic source', () => {
    const rich = makeFixtureFCaseAnalysis().richCaseAnalysis!;
    const sourceText = fixtureFSourceDocuments().flatMap((source) => source.pages || []).map((page) => page.text).join('\n');
    const provenance = [
      ...rich.parties.flatMap((item) => item.provenance),
      ...rich.claims.flatMap((item) => item.provenance),
      ...rich.facts.flatMap((item) => item.provenance),
      ...rich.documents.flatMap((item) => item.provenance),
      ...rich.evidenceMentions.flatMap((item) => item.provenance),
      ...rich.evidenceOffers.flatMap((item) => item.provenance),
      ...rich.arguments.flatMap((item) => item.provenance),
      ...rich.authorities.flatMap((item) => item.provenance),
      ...rich.dates.flatMap((item) => item.provenance),
      ...rich.amounts.flatMap((item) => item.provenance),
      ...rich.sourcePosition.provenance,
    ].filter((entry) => entry.sourceId === 'fixture-f-source');
    expect(provenance.every((entry) => entry.excerpt && sourceText.includes(entry.excerpt))).toBe(true);
  });
});
