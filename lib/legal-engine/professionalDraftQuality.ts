import type { DraftDepth } from './draftDepth';
import { resolveDraftDepthProfile } from './draftDepth';

export type ProfessionalDraftQualityGate = 'PASS' | 'REVIEW_REQUIRED' | 'FAIL';

export type ProfessionalDraftQualityIssue =
  | 'EXACT_DUPLICATION'
  | 'SEMANTIC_DUPLICATION'
  | 'EXCESSIVE_SOURCE_COPY'
  | 'SHALLOW_CONTENT'
  | 'TARGET_PAGES_NOT_MET'
  | 'CONTENT_LIMIT_REACHED'
  | 'PLACEHOLDERS_PRESENT'
  | 'ATTORNEY_INPUT_PENDING'
  | 'FACT_COVERAGE_INCOMPLETE'
  | 'CLAIM_COVERAGE_INCOMPLETE'
  | 'EVIDENCE_COVERAGE_INCOMPLETE'
  | 'SECTION_COVERAGE_INCOMPLETE'
  | 'COHERENCE_ERRORS'
  | 'PROVENANCE_ERRORS';

export interface ProfessionalDraftQualityInput {
  draftDepth: DraftDepth;
  renderedPages: readonly string[];
  sourceTexts?: readonly string[];
  substantiveText?: string;
  contentStopReason?: 'CONTENT_LIMIT_REACHED' | 'COVERAGE_COMPLETE' | 'TARGET_REACHED' | 'PROVIDER_UNAVAILABLE' | 'REPETITION_BLOCKED' | 'RESOURCE_LIMIT' | 'ATTORNEY_INPUT_REQUIRED' | null;
  placeholderCount?: number;
  unresolvedAttorneyQuestions?: number;
  verifiedAuthorityCount?: number;
  appliedAuthorityCount?: number;
  factsCovered?: number;
  factsRequired?: number;
  claimsCovered?: number;
  claimsRequired?: number;
  evidenceCoverage?: number;
  sectionCoverage?: number;
  coherenceErrors?: number;
  provenanceErrors?: number;
}

export interface ProfessionalDraftQualityMetrics {
  draftDepth: DraftDepth;
  actualPages: number;
  actualWords: number;
  substantiveWords: number;
  duplicatedWords: number;
  repetitionRatio: number;
  duplicateParagraphRatio: number;
  exactDuplicateRatio: number;
  semanticDuplicateRatio: number;
  sourceCopyRatio: number;
  placeholderCount: number;
  unresolvedAttorneyQuestions: number;
  verifiedAuthorityCount: number;
  appliedAuthorityCount: number;
  factsCovered: number;
  claimsCovered: number;
  evidenceCoverage: number;
  sectionCoverage: number;
  coherenceErrors: number;
  provenanceErrors: number;
  qualityGate: ProfessionalDraftQualityGate;
  issues: ProfessionalDraftQualityIssue[];
}

function wordTokens(value: string): string[] {
  return value.toLocaleLowerCase('es-MX').match(/[\p{L}\p{N}]+/gu) || [];
}

function shingles(words: readonly string[], size: number): string[] {
  if (words.length < size) return [];
  const result: string[] = [];
  for (let index = 0; index <= words.length - size; index += 1) {
    result.push(words.slice(index, index + size).join(' '));
  }
  return result;
}

function uniqueShingles(words: readonly string[], size: number): Set<string> {
  return new Set(shingles(words, size));
}

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  left.forEach((entry) => { if (right.has(entry)) intersection += 1; });
  return intersection / (left.size + right.size - intersection);
}

function exactDuplicateRatio(words: readonly string[]): { ratio: number; repeatedWords: number } {
  const grams = shingles(words, 10);
  if (grams.length === 0) return { ratio: 0, repeatedWords: 0 };
  const counts = new Map<string, number>();
  for (const gram of grams) counts.set(gram, (counts.get(gram) || 0) + 1);
  const repeatedGrams = Array.from(counts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return {
    ratio: repeatedGrams / grams.length,
    repeatedWords: Math.min(words.length, repeatedGrams * 10),
  };
}

function semanticPageDuplicateRatio(pages: readonly string[]): number {
  const pageShingles = pages.map((page) => {
    const tokens = wordTokens(page);
    return tokens.length < 30 ? null : uniqueShingles(tokens, 3);
  }).filter((value): value is Set<string> => value !== null);
  if (pageShingles.length < 2) return 0;

  let duplicatePages = 0;
  for (let index = 1; index < pageShingles.length; index += 1) {
    if (pageShingles.slice(0, index).some((previous) => jaccard(previous, pageShingles[index]!) >= 0.75)) {
      duplicatePages += 1;
    }
  }
  return duplicatePages / pageShingles.length;
}

function semanticParagraphDuplicateRatio(pages: readonly string[]): number {
  const paragraphs = pages
    .flatMap((page) => page.split(/\r?\n+/))
    .map((paragraph) => paragraph
      .replace(/^\s*\d+\s*[.)-]\s*/, '')
      .replace(/\b(hecho|hechos|prestaci[oó]n|prestaciones|punto|apartado)\s+(?:n[uú]mero\s*)?\d+\b/gi, '$1 #'))
    .map((paragraph) => wordTokens(paragraph).join(' '))
    .filter((paragraph) => paragraph.split(' ').length >= 6);
  if (paragraphs.length < 2) return 0;

  const counts = new Map<string, number>();
  for (const paragraph of paragraphs) counts.set(paragraph, (counts.get(paragraph) || 0) + 1);
  const duplicates = Array.from(counts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return duplicates / paragraphs.length;
}

function sourceCopyRatio(outputWords: readonly string[], sourceTexts: readonly string[]): number {
  const outputGrams = shingles(outputWords, 8);
  if (outputGrams.length === 0) return 0;
  const sourceWords = wordTokens(sourceTexts.join('\n'));
  const sourceGrams = uniqueShingles(sourceWords, 8);
  if (sourceGrams.size === 0) return 0;
  return outputGrams.filter((gram) => sourceGrams.has(gram)).length / outputGrams.length;
}

function duplicateParagraphRatio(pages: readonly string[]): number {
  const paragraphs = pages
    .flatMap((page) => page.split(/\r?\n+/))
    .map((paragraph) => wordTokens(paragraph).join(' '))
    .filter((paragraph) => paragraph.length > 0);
  if (paragraphs.length < 2) return 0;

  const counts = new Map<string, number>();
  for (const paragraph of paragraphs) counts.set(paragraph, (counts.get(paragraph) || 0) + 1);
  const duplicates = Array.from(counts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return duplicates / paragraphs.length;
}

function countBracketPlaceholders(text: string): number {
  return (text.match(/\[[^\]\r\n]{2,100}\]/g) || []).length;
}

function countAttorneyQuestions(text: string): number {
  const matches = text.match(/(?:requiere\s+definir|requiere\s+confirmar|dato\s+pendiente|postura\s+pendiente)/gi) || [];
  return matches.length;
}

export function evaluateProfessionalDraftQuality(
  input: ProfessionalDraftQualityInput,
): ProfessionalDraftQualityMetrics {
  const fullText = input.renderedPages.join('\n');
  const words = wordTokens(fullText);
  const duplicate = exactDuplicateRatio(words);
  const repetitionRatio = words.length > 0 ? duplicate.repeatedWords / words.length : 0;
  const duplicateParagraphs = duplicateParagraphRatio(input.renderedPages);
  const profile = resolveDraftDepthProfile(input.draftDepth);
  const placeholderCount = input.placeholderCount ?? countBracketPlaceholders(fullText);
  const unresolvedAttorneyQuestions = input.unresolvedAttorneyQuestions ?? countAttorneyQuestions(fullText);
  const actualPages = input.renderedPages.length;
  const substantiveWords = wordTokens(input.substantiveText ?? fullText).length;
  const evidenceCoverage = input.evidenceCoverage ?? 0;
  const sectionCoverage = input.sectionCoverage ?? 0;
  const coherenceErrors = input.coherenceErrors ?? 0;
  const provenanceErrors = input.provenanceErrors ?? 0;
  const factsCovered = input.factsCovered ?? 0;
  const claimsCovered = input.claimsCovered ?? 0;
  const issues: ProfessionalDraftQualityIssue[] = [];

  if (duplicate.ratio > 0.2 || repetitionRatio > 0.2 || duplicateParagraphs > 0.2) issues.push('EXACT_DUPLICATION');
  const semanticDuplicateRatio = Math.max(
    semanticPageDuplicateRatio(input.renderedPages),
    semanticParagraphDuplicateRatio(input.renderedPages),
  );
  if (semanticDuplicateRatio > 0.2) issues.push('SEMANTIC_DUPLICATION');
  const sourceCopy = sourceCopyRatio(words, input.sourceTexts || []);
  if (sourceCopy > 0.4) issues.push('EXCESSIVE_SOURCE_COPY');

  if (input.contentStopReason === 'CONTENT_LIMIT_REACHED') {
    issues.push('CONTENT_LIMIT_REACHED');
  } else if (input.contentStopReason === 'ATTORNEY_INPUT_REQUIRED') {
    issues.push('ATTORNEY_INPUT_PENDING');
  } else if (substantiveWords < (input.draftDepth === 'PROFESSIONAL_20' ? 1_200 : 1_800)) {
    issues.push('SHALLOW_CONTENT');
  }
  if (input.contentStopReason !== 'CONTENT_LIMIT_REACHED' && actualPages < profile.targetPages.min) {
    issues.push('TARGET_PAGES_NOT_MET');
  }

  if (placeholderCount > 0) issues.push('PLACEHOLDERS_PRESENT');
  if (unresolvedAttorneyQuestions > 0) issues.push('ATTORNEY_INPUT_PENDING');
  if (input.factsRequired !== undefined && factsCovered < input.factsRequired) issues.push('FACT_COVERAGE_INCOMPLETE');
  if (input.claimsRequired !== undefined && claimsCovered < input.claimsRequired) issues.push('CLAIM_COVERAGE_INCOMPLETE');
  if (evidenceCoverage < 1) issues.push('EVIDENCE_COVERAGE_INCOMPLETE');
  if (sectionCoverage < 1) issues.push('SECTION_COVERAGE_INCOMPLETE');
  if (coherenceErrors > 0) issues.push('COHERENCE_ERRORS');
  if (provenanceErrors > 0) issues.push('PROVENANCE_ERRORS');

  const blockingIssues: ProfessionalDraftQualityIssue[] = [
    'EXACT_DUPLICATION',
    'SEMANTIC_DUPLICATION',
    'EXCESSIVE_SOURCE_COPY',
    'SHALLOW_CONTENT',
    'TARGET_PAGES_NOT_MET',
    'COHERENCE_ERRORS',
    'PROVENANCE_ERRORS',
  ];
  const qualityGate = issues.some((issue) => blockingIssues.includes(issue))
    ? 'FAIL'
    : issues.length > 0 ? 'REVIEW_REQUIRED' : 'PASS';

  return {
    draftDepth: input.draftDepth,
    actualPages,
    actualWords: words.length,
    substantiveWords,
    duplicatedWords: duplicate.repeatedWords,
    repetitionRatio,
    duplicateParagraphRatio: duplicateParagraphs,
    exactDuplicateRatio: duplicate.ratio,
    semanticDuplicateRatio,
    sourceCopyRatio: sourceCopy,
    placeholderCount,
    unresolvedAttorneyQuestions,
    verifiedAuthorityCount: input.verifiedAuthorityCount ?? 0,
    appliedAuthorityCount: input.appliedAuthorityCount ?? 0,
    factsCovered,
    claimsCovered,
    evidenceCoverage,
    sectionCoverage,
    coherenceErrors,
    provenanceErrors,
    qualityGate,
    issues,
  };
}
