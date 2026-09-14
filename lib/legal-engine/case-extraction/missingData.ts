import type { ClientPosition, MissingDataItem, RichCaseAnalysis, SourcePosition, SourceProvenance } from './types';

export interface MissingDataResult {
  items: MissingDataItem[];
}

function allProvenance(analysis: RichCaseAnalysis): SourceProvenance[] {
  return [
    ...analysis.parties.flatMap((item) => item.provenance),
    ...analysis.assertions.flatMap((item) => item.provenance),
    ...analysis.claims.flatMap((item) => item.provenance),
    ...analysis.facts.flatMap((item) => item.provenance),
    ...analysis.documents.flatMap((item) => item.provenance),
    ...analysis.evidenceMentions.flatMap((item) => item.provenance),
    ...analysis.arguments.flatMap((item) => item.provenance),
    ...analysis.authorities.flatMap((item) => item.provenance),
  ];
}

function sourceIds(analysis: RichCaseAnalysis): string[] {
  return Array.from(new Set(allProvenance(analysis).map((item) => item.sourceId)));
}

function positionProvenance(analysis: RichCaseAnalysis): SourceProvenance[] {
  const values = [...analysis.sourcePosition.provenance, ...allProvenance(analysis)];
  const seen = new Set<string>();
  return values.filter((item) => {
    const key = `${item.sourceId}|${item.page ?? ''}|${item.excerptHash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function deriveClientPosition(analysis: RichCaseAnalysis): ClientPosition {
  if (analysis.clientPosition.status === 'CONFIRMED' && analysis.clientPosition.source === 'CLIENT_POSITION') {
    return { ...analysis.clientPosition, propositionIds: [...analysis.clientPosition.propositionIds], provenance: [...analysis.clientPosition.provenance] };
  }
  return {
    status: 'UNKNOWN',
    source: 'SOURCE_POSITION',
    propositionIds: [],
    provenance: positionProvenance(analysis),
  };
}

export function deriveSourcePosition(analysis: RichCaseAnalysis): SourcePosition {
  if (analysis.sourcePosition.status === 'KNOWN') return analysis.sourcePosition;
  return {
    status: analysis.assertions.length > 0 ? 'KNOWN' : 'UNKNOWN',
    assertionIds: analysis.assertions.map((item) => item.id),
    provenance: allProvenance(analysis),
  };
}

export function buildMissingData(analysis: RichCaseAnalysis): MissingDataResult {
  const items: MissingDataItem[] = [];
  const searched = sourceIds(analysis);
  const hasOpposingPosition = analysis.parties.some((party) => party.role === 'DEMANDADO')
    || analysis.assertions.some((assertion) => assertion.actorRole === 'PARTE_DEMANDADA');

  if (!hasOpposingPosition || deriveClientPosition(analysis).status === 'UNKNOWN') {
    const hasSubstantiveSourceGrounding = analysis.facts.some((f) => f.assertionStatus === 'ESTABLISHED_FACT')
      || (analysis.facts.length > 0 && analysis.arguments.length > 0);
    const blocking = !hasSubstantiveSourceGrounding;

    items.push({
      field: 'clientPosition',
      reason: 'No explicit client or opposing-party posture was found in the available source material.',
      importance: 'HIGH',
      sectionAffected: 'POSTURA',
      blocking,
      sourceSearched: searched,
      requiresClientInput: true,
    });
  }

  if (analysis.facts.length === 0) {
    items.push({
      field: 'facts',
      reason: 'No source-grounded factual proposition was extracted.',
      importance: 'MEDIUM',
      sectionAffected: 'HECHOS',
      blocking: false,
      sourceSearched: searched,
      requiresClientInput: false,
    });
  }

  return { items };
}
