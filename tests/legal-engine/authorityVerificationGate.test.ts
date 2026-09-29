import { describe, expect, it } from 'vitest';
import { evaluateAuthorityVerificationGate } from '@/lib/legal-engine/authorityVerificationGate';
import type { VerifiedAuthority } from '@/lib/legal-engine/legal-research/types';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';

const authority = {
  id: 'verified-7', verificationStatus: 'VERIFIED', identifier: 'artículo 7',
  identity: { canonicalCitation: 'Artículo 7 de la Ley de Ejemplo', authorityType: 'STATUTE', issuingAuthority: 'Congreso', identityKey: 'example-7' },
  source: { sourceUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/example.pdf', sourceDomain: 'diputados.gob.mx', sourceTier: 'OFFICIAL_PRIMARY', retrievedAt: '2026-09-27', sourceHash: 'source-hash' },
  temporalValidity: { status: 'CURRENT_AND_APPLICABLE', checkedAt: '2026-09-27', basis: ['vigencia cotejada'] },
  jurisdictionValidity: { status: 'APPLICABLE', basis: ['ámbito cotejado'] },
  proposition: { text: 'Regla jurídica de ejemplo.', supportLevel: 'DIRECT', limitations: [] },
  supportsLegalIssueIds: ['issue-1'], sourceAuthorityMentionIds: [], verificationHash: 'verification-hash',
} as VerifiedAuthority;

describe('authority verification gate', () => {
  it('blocks a depth-mode AI draft with an unaudited material authority citation', () => {
    const doc = createEmptyDocument();
    doc.generationMetadata.draftDepth = 'PROFESSIONAL_20';
    doc.sections.push({
      id: 'law', type: 'argument', title: 'DERECHO', order: 1,
      isRepeatable: false, isEditable: true, isGenerated: true, isManuallyEdited: false,
      variables: [], validationErrors: [], validationWarnings: [],
      content: [{ id: 'b1', layer: 'GENERATED_ARGUMENT', generatedBy: 'AI', text: 'Conforme al artículo 7 de la Ley de Ejemplo, procede la petición.' }],
    });

    const quality = runQualityGateCheck(doc);
    expect(quality.criticalErrors.some((error) => error.checkId === 'AUTHORITY_VERIFICATION_FAILED')).toBe(true);
  });

  it('blocks an article citation with no authority-to-issue audit', () => {
    const result = evaluateAuthorityVerificationGate({
      blocks: [{ id: 'b1', text: 'Conforme al artículo 7 de la Ley de Ejemplo, procede la petición.' }],
      uses: [], verifiedAuthorities: [],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.unsupportedLegalAuthorities).toBe(1);
    expect(result.issues).toContain('AUTHORITY_USE_MISSING:b1');
  });

  it('requires official verification and issue-specific application, not just an ID', () => {
    const result = evaluateAuthorityVerificationGate({
      blocks: [{ id: 'b1', text: 'Conforme al artículo 7 de la Ley de Ejemplo, procede la petición.' }],
      uses: [{ blockId: 'b1', citationText: 'artículo 7', authorityId: 'verified-7', issueId: 'other-issue', proposition: 'Regla jurídica de ejemplo.', application: '' }],
      verifiedAuthorities: [authority],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.appliedAuthorityCount).toBe(0);
    expect(result.issues).toContain('AUTHORITY_ISSUE_MISMATCH:b1');
  });

  it('counts a verified and applied citation only when official evidence and issue linkage are valid', () => {
    const result = evaluateAuthorityVerificationGate({
      blocks: [{ id: 'b1', text: 'Conforme al artículo 7 de la Ley de Ejemplo, procede la petición.' }],
      uses: [{ blockId: 'b1', citationText: 'artículo 7', authorityId: 'verified-7', issueId: 'issue-1', proposition: 'Regla jurídica de ejemplo.', application: 'La regla se aplica a la petición del caso.' }],
      verifiedAuthorities: [authority],
    });
    expect(result.status).toBe('PASS');
    expect(result.verifiedAuthorityCount).toBe(1);
    expect(result.appliedAuthorityCount).toBe(1);
    expect(result.unsupportedLegalAuthorities).toBe(0);
  });

  it('rejects a fixture labeled as an official authority in a real-document gate', () => {
    const result = evaluateAuthorityVerificationGate({
      blocks: [{ id: 'b1', text: 'Conforme al artículo 7 de la Ley de Ejemplo, procede la petición.' }],
      uses: [{ blockId: 'b1', citationText: 'artículo 7', authorityId: 'verified-7', issueId: 'issue-1', proposition: 'Regla jurídica de ejemplo.', application: 'La regla se aplica a la petición.' }],
      verifiedAuthorities: [{ ...authority, source: { ...authority.source, isFixture: true } }],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.issues).toContain('AUTHORITY_OFFICIAL_SOURCE_INVALID:b1');
  });
});
