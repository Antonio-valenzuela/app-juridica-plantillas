import type { BlockQualityEvaluation } from './semanticEvaluator';
import type { SectionSourceManifest } from './sectionContextPacket';

export type SectionDraftStatus = 'ACCEPTED' | 'VALID_NON_FINAL' | 'REVIEW_REQUIRED' | 'BLOCKED';

export interface SectionDraftProviderInfo {
  requested: string;
  actuallyUsed: string;
  model: string | null;
  calls: number;
  fallbackReason?: string | null;
}

export interface SectionDraftTrace {
  promptVersion: string;
  contextHash: string;
  outputHash: string;
  finishReason?: string;
  diagnostics: string[];
}

export interface SectionDraft {
  id: string;
  sectionId: string;
  text: string;
  status: SectionDraftStatus;
  readiness: 'READY' | 'REQUIRES_REVIEW' | 'BLOCKED';
  coverageItemIds: string[];
  legalIssueIds: string[];
  factIds: string[];
  evidenceIds: string[];
  authorityIds: string[];
  generationTaskIds: string[];
  sourceManifest: SectionSourceManifest;
  provider: SectionDraftProviderInfo;
  semanticEvaluation?: BlockQualityEvaluation;
  trace: SectionDraftTrace;
  hash: string;
  diagnostics: string[];
}

