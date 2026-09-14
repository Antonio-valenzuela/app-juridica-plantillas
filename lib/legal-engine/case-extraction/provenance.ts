import { createHash } from 'crypto';
import type {
  ExtractionMethod,
  InferenceLevel,
  SourceProvenance,
  SpeakerRole,
} from './types';

/** Maximum amount of source text retained in a provenance record. */
export const MAX_PROVENANCE_EXCERPT_LENGTH = 1_000;

export interface SourceProvenanceInput {
  sourceId: string;
  sourceType?: string;
  sourceName?: string;
  page?: number;
  section?: string;
  paragraphIndex?: number;
  elementIndex?: number;
  /** Preferred field for callers building a provenance record directly. */
  excerpt?: string;
  /** Alias used by source-unit and candidate builders. */
  text?: string;
  /** Allows a caller that already has a trusted digest to preserve it. */
  excerptHash?: string;
  speakerRole?: SpeakerRole;
  extractionMethod?: ExtractionMethod;
  confidence?: number;
  inferenceLevel?: InferenceLevel;
}

/**
 * Redact credential-shaped values and bound source text before it can enter a
 * trace.  The key names and values are replaced together so a trace cannot
 * accidentally disclose a credential merely by retaining an excerpt.
 */
export function sanitizeExcerpt(value: string | undefined | null): string {
  const input = typeof value === 'string' ? value : '';
  const redacted = input
    .replace(/\b(?:NVIDIA_)?API[_ -]?KEY\s*[:=]\s*[^\s;,)]*/gi, '[REDACTED]')
    .replace(/\b((?:CLIENT_)?SECRET\s*[:=]\s*)[^\s;,)]*/gi, '$1[REDACTED]')
    .replace(/\b((?:PASSWORD|PASSWD|PASS|TOKEN|BEARER)\s*[:=]\s*)[^\s;,)]*/gi, '$1[REDACTED]')
    .replace(/\b(?:nvapi|sk|AIza|ghp|xox[baprs])-[-_a-z0-9]+/gi, '[REDACTED]');

  return redacted.slice(0, MAX_PROVENANCE_EXCERPT_LENGTH).trim();
}

/** Return a stable SHA-256 digest of the sanitized excerpt. */
export function hashExcerpt(value: string | undefined | null): string {
  if (typeof createHash !== 'function') {
    const input = sanitizeExcerpt(value);
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }
  return createHash('sha256').update(sanitizeExcerpt(value), 'utf8').digest('hex');
}

/**
 * Construct a complete provenance value while keeping the source excerpt
 * bounded and secret-free.  The optional second argument preserves the small
 * calling convention used by early extractors: `(source, 'PARAGRAPH')`.
 */
export function createSourceProvenance(
  input: SourceProvenanceInput,
  extractionMethod?: ExtractionMethod,
): SourceProvenance {
  const excerpt = sanitizeExcerpt(input.excerpt ?? input.text);
  const method = extractionMethod ?? input.extractionMethod ?? 'PATTERN';

  return {
    sourceId: input.sourceId,
    ...(input.sourceType ? { sourceType: input.sourceType } : {}),
    ...(input.sourceName ? { sourceName: input.sourceName } : {}),
    ...(input.page !== undefined ? { page: input.page } : {}),
    ...(input.section ? { section: input.section } : {}),
    ...(input.paragraphIndex !== undefined ? { paragraphIndex: input.paragraphIndex } : {}),
    ...(input.elementIndex !== undefined ? { elementIndex: input.elementIndex } : {}),
    excerptHash: input.excerptHash ?? hashExcerpt(excerpt),
    ...(excerpt ? { excerpt } : {}),
    ...(input.speakerRole ? { speakerRole: input.speakerRole } : {}),
    extractionMethod: method,
    confidence: input.confidence ?? 1,
    inferenceLevel: input.inferenceLevel ?? 'LITERAL',
  };
}
