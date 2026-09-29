import type { CaseAnalysis } from './caseAnalysis';
import type { CaseReferences } from './types';
import type { SourceGrounding } from './sourceGrounding';

export type ProvenanceIntegrityEvaluationStatus = 'PASS' | 'REVIEW_REQUIRED' | 'BLOCKED';

export interface ProvenanceIntegrityEvaluation {
  name: 'PROVENANCE_INTEGRITY_GATE';
  status: ProvenanceIntegrityEvaluationStatus;
  issues: string[];
  blockedFields: string[];
  sourceIds: string[];
}

export interface EvaluateProvenanceIntegrityGateInput {
  sourceGrounding?: SourceGrounding[];
  caseRefs?: CaseReferences;
  caseAnalysis?: Partial<CaseAnalysis>;
}

function normalize(value: unknown): string {
  return String(value || '').trim().toLocaleLowerCase();
}

function hasAuthorityMatch(grounding: SourceGrounding, value: string): boolean {
  const expected = normalize(value);
  return grounding.values.some((candidate) => candidate.category === 'JURISPRUDENCE' && normalize(candidate.value) === expected);
}

function hasPermittedMetadata(grounding: SourceGrounding, value: string): boolean {
  const expected = normalize(value);
  return grounding.values.some((candidate) => candidate.category === 'CASE_METADATA'
    && candidate.canUseAsCaseMetadata
    && normalize(candidate.value) === expected);
}

function includesMaterialText(container: string, candidate: string): boolean {
  const left = normalize(container);
  const right = normalize(candidate);
  return right.length >= 18 && (left.includes(right) || right.includes(left));
}

/**
 * Comprueba que los metadatos y hechos que pueden llegar al escrito tengan
 * una fuente permitida. La evaluación es independiente de la plantilla de
 * salida y no convierte un estado de revisión en una afirmación jurídica.
 */
export function evaluateProvenanceIntegrityGate(
  input: EvaluateProvenanceIntegrityGateInput,
): ProvenanceIntegrityEvaluation {
  const groundings = Array.isArray(input.sourceGrounding) ? input.sourceGrounding : [];
  const issues = new Set<string>();
  const blockedFields = new Set<string>();
  const blockedIssueCodes = new Set([
    'CASE_METADATA_DERIVED_FROM_JURISPRUDENCE',
    'CASE_FACT_DERIVED_FROM_PRECEDENT_FACTS',
    'CASE_METADATA_MISSING_PERMITTED_PROVENANCE',
    'AUTHORITY_VALUE_CANNOT_FEED_CASE_METADATA',
  ]);

  for (const grounding of groundings) {
    for (const issue of grounding.provenanceIntegrity.issues) issues.add(issue);
    const expediente = grounding.caseMetadata.expediente.value;
    const claimedExpediente = input.caseRefs?.expediente || input.caseAnalysis?.caseNumbers?.principal;

    if (expediente && !hasPermittedMetadata(grounding, expediente)) {
      if (hasAuthorityMatch(grounding, expediente)) issues.add('CASE_METADATA_DERIVED_FROM_JURISPRUDENCE');
      else issues.add('CASE_METADATA_MISSING_PERMITTED_PROVENANCE');
      blockedFields.add('expediente');
    }
    if (claimedExpediente) {
      if (hasAuthorityMatch(grounding, claimedExpediente)) {
        issues.add('CASE_METADATA_DERIVED_FROM_JURISPRUDENCE');
        blockedFields.add('expediente');
      } else if (!hasPermittedMetadata(grounding, claimedExpediente)) {
        issues.add('CASE_METADATA_MISSING_PERMITTED_PROVENANCE');
        blockedFields.add('expediente');
      }
    }

    if (grounding.caseFacts.some((fact) => fact.authorityOnly || !fact.canUseAsCaseFact)) {
      issues.add('CASE_FACT_DERIVED_FROM_PRECEDENT_FACTS');
      blockedFields.add('caseFacts');
    }
    if (input.caseAnalysis?.facts?.some((fact) => grounding.precedentFacts.some((precedent) => includesMaterialText(fact.text, precedent.text)))) {
      issues.add('CASE_FACT_DERIVED_FROM_PRECEDENT_FACTS');
      blockedFields.add('caseFacts');
    }
    if (grounding.values.some((value) => value.category === 'JURISPRUDENCE' && (value.canUseAsCaseMetadata || value.canUseAsCaseFact))) {
      issues.add('AUTHORITY_VALUE_CANNOT_FEED_CASE_METADATA');
      blockedFields.add('expediente');
    }
    if (grounding.caseMetadata.status === 'AMBIGUOUS') blockedFields.add('expediente');
  }

  const issueList = Array.from(issues);
  const status: ProvenanceIntegrityEvaluationStatus = issueList.some((issue) => blockedIssueCodes.has(issue))
    ? 'BLOCKED'
    : issueList.length > 0
      ? 'REVIEW_REQUIRED'
      : 'PASS';

  return {
    name: 'PROVENANCE_INTEGRITY_GATE',
    status,
    issues: issueList,
    blockedFields: Array.from(blockedFields),
    sourceIds: groundings.map((grounding) => grounding.sourceId),
  };
}
