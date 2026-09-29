import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { caseProviderFlags, explicitExternalProviderConsent, scopeConsentIdempotencyKey } from '@/lib/ai/caseProviderConsent';
import { buildFingerprint } from '@/lib/legal-engine/generationLock';

describe('explicit external provider consent for case documents', () => {
  it('defaults to private case with no external transport', () => {
    expect(caseProviderFlags(createEmptyDocument())).toEqual({
      privateCaseContext: true,
      externalProviderOptIn: false,
    });
  });

  it('keeps the case private while allowing a separately recorded opt-in', () => {
    const doc = createEmptyDocument();
    doc.generationMetadata.externalProviderOptIn = true;
    expect(caseProviderFlags(doc)).toEqual({
      privateCaseContext: true,
      externalProviderOptIn: true,
    });
  });

  it.each([undefined, null, false, 'true', 1])('rejects non-explicit request consent: %s', (value) => {
    expect(explicitExternalProviderConsent(value)).toBe(false);
  });

  it('does not reuse an active opted-in job for an identical request without consent', () => {
    const request = { sourceIds: ['case-1'], userInstruction: 'Generar contestación' };
    expect(buildFingerprint({ ...request, externalProviderOptIn: true }))
      .not.toBe(buildFingerprint({ ...request, externalProviderOptIn: false }));
  });

  it('also partitions caller-provided idempotency keys by consent', () => {
    expect(scopeConsentIdempotencyKey('same-request', true))
      .not.toBe(scopeConsentIdempotencyKey('same-request', false));
    expect(scopeConsentIdempotencyKey(null, true)).toBeNull();
  });
});
