import { ContentLayer, TrustLevel, ContentBlock, ProvenanceKind } from './types';

export const TRUST_MARKERS = {
  VERIFIED_START: '[[VERIFIED_START]]',
  VERIFIED_END: '[[VERIFIED_END]]',
  UNVERIFIED_START: '[[UNVERIFIED_START]]',
  UNVERIFIED_END: '[[UNVERIFIED_END]]',
  AI_INFERENCE_START: '[[AI_INFERENCE_START]]',
  AI_INFERENCE_END: '[[AI_INFERENCE_END]]'
};

export function detectHallucinationRisks(text: string): string[] {
  const risks: string[] = [];
  
  const jurisprudencePattern = /(?:tesis|jurisprudencia)\s+(?:aislada\s+)?(?:[a-z0-9/.-]+)/ig;
  const matches = text.match(jurisprudencePattern);
  if (matches) {
    risks.push(...matches.map(m => `Posible cita no verificada: ${m}`));
  }
  
  const articlePattern = /art[íi]culo\s+\d+\s+(?:de\s+la\s+)?ley\s+(?:[a-z\s]+)/ig;
  const artMatches = text.match(articlePattern);
  if (artMatches) {
    risks.push(...artMatches.map(m => `Verificar fundamento legal: ${m}`));
  }
  
  return risks;
}

export function markAsAiInference(text: string): string {
  return `${TRUST_MARKERS.AI_INFERENCE_START}${text}${TRUST_MARKERS.AI_INFERENCE_END}`;
}

export function markAsUnverified(text: string): string {
  return `${TRUST_MARKERS.UNVERIFIED_START}${text}${TRUST_MARKERS.UNVERIFIED_END}`;
}

export function stripTrustMarkers(text: string): string {
  let cleanText = text;
  Object.values(TRUST_MARKERS).forEach(marker => {
    cleanText = cleanText.split(marker).join('');
  });
  return cleanText;
}

export function getTrustLevelFromLayer(layer: ContentLayer): TrustLevel {
  switch (layer) {
    case 'SOURCE_FACT':
      return 'VERIFIED';
    case 'COURT_REASONING':
      return 'UNVERIFIED';
    case 'USER_POSITION':
      return 'VERIFIED';
    case 'AI_ANALYSIS':
    case 'GENERATED_ARGUMENT':
      return 'AI_INFERENCE';
    default:
      return 'PENDING';
  }
}

export function createContentBlock(
  text: string, 
  layer: ContentLayer, 
  options: Partial<ContentBlock> = {}
): ContentBlock {
  const provenanceByLayer: Record<ContentLayer, ProvenanceKind> = {
    SOURCE_FACT: 'SOURCE_EXTRACTED',
    COURT_REASONING: 'INFERRED',
    USER_POSITION: 'LAWYER_CONFIRMED',
    AI_ANALYSIS: 'AI_GENERATED',
    GENERATED_ARGUMENT: 'AI_GENERATED',
  };
  return {
    id: crypto.randomUUID(),
    layer,
    trust: getTrustLevelFromLayer(layer),
    text,
    provenance: provenanceByLayer[layer],
    createdAt: new Date().toISOString(),
    ...options
  };
}
