import type { UniversalLegalDocument } from '../legal-engine/types';

export function explicitExternalProviderConsent(value: unknown): boolean {
  return value === true;
}

export function scopeConsentIdempotencyKey(key: string | null, externalProviderOptIn: boolean): string | null {
  return key ? `${externalProviderOptIn ? 'external' : 'local'}:${key}` : null;
}

/** Privacy classification and external-transfer consent are independent. */
export function caseProviderFlags(document: UniversalLegalDocument): {
  privateCaseContext: boolean;
  externalProviderOptIn: boolean;
} {
  return {
    privateCaseContext: Boolean((document as UniversalLegalDocument & { isPrivate?: boolean }).isPrivate ?? true),
    externalProviderOptIn: document.generationMetadata.externalProviderOptIn === true,
  };
}
