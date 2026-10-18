import type { UniversalLegalDocument } from '../legal-engine/types';

export function explicitExternalProviderConsent(value: unknown): boolean {
  return value === true;
}

const REMOTE_PROVIDER_IDS = new Set(['gemini', 'groq', 'nvidia']);

/**
 * Lista de proveedores remotos autorizados expresamente en la solicitud. Cualquier valor que no sea un
 * arreglo deja la lista sin definir; los elementos desconocidos se descartan (nunca amplían la autorización).
 */
export function explicitAuthorizedProviders(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim().toLowerCase()).filter((item) => REMOTE_PROVIDER_IDS.has(item)))];
}

export function scopeConsentIdempotencyKey(key: string | null, externalProviderOptIn: boolean): string | null {
  return key ? `${externalProviderOptIn ? 'external' : 'local'}:${key}` : null;
}

/** Privacy classification and external-transfer consent are independent. */
export function caseProviderFlags(document: UniversalLegalDocument): {
  privateCaseContext: boolean;
  externalProviderOptIn: boolean;
  authorizedExternalProviders?: string[];
  writingContractPrompt?: string;
} {
  const authorizedExternalProviders = explicitAuthorizedProviders(document.generationMetadata.authorizedExternalProviders);
  return {
    privateCaseContext: Boolean((document as UniversalLegalDocument & { isPrivate?: boolean }).isPrivate ?? true),
    externalProviderOptIn: document.generationMetadata.externalProviderOptIn === true,
    ...(authorizedExternalProviders ? { authorizedExternalProviders } : {}),
    ...(document.generationMetadata.writingContractPrompt ? { writingContractPrompt: document.generationMetadata.writingContractPrompt } : {}),
  };
}
