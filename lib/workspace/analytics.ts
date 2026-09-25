export type AnalyticsRangeDays = 7 | 30 | 90;
export type AnalyticsStatus = 'COMPLETED' | 'NEEDS_REVIEW' | 'FAILED' | 'CANCELLED';

export interface AnalyticsDraftProjection {
  id: string;
  documentType?: string | null;
  matter?: string | null;
  status?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  validationResults?: unknown;
  generationMetadata?: unknown;
  structuredDoc?: unknown;
  sourceDocuments?: unknown;
}

export interface AnalyticsJobProjection {
  id: string;
  documentId?: string | null;
  status?: string | null;
  terminalStatus?: string | null;
  errorCode?: string | null;
  warnings?: unknown;
  createdAt: string | Date;
  updatedAt: string | Date;
  startedAt: string | Date;
}

export interface AnalyticsDataset {
  rangeDays: AnalyticsRangeDays;
  period: { start: string; end: string };
  hasActivity: boolean;
  insufficientActivity: boolean;
  totals: {
    total: number;
    documentsGenerated: number;
    completed: number;
    needsReview: number;
    failed: number;
    cancelled: number;
    averageGenerationMs: number | null;
    generatedPages: number;
  };
  daily: Array<{ date: string; count: number }>;
  statuses: Array<{ status: AnalyticsStatus; count: number }>;
  byType: Array<{ label: string; count: number }>;
  byMatter: Array<{ label: string; count: number }>;
  extension: { achieved: number; unmet: number; withoutTarget: number };
  quality: { qualityGatePass: number; qualityGateFail: number; validationPass: number; validationFail: number; warnings: number; errors: number; sourcePages: number };
  recent: Array<{
    status: AnalyticsStatus;
    documentType: string;
    matter: string;
    createdAt: string;
    targetPages: number | null;
    actualPages: number | null;
    extensionTargetUnmet: boolean | null;
    qualityGatePass: boolean | null;
    validationPass: boolean | null;
    warningsCount: number;
    errorsCount: number;
    sourceQualityStatus: string | null;
    sourcePages: number;
    durationMs: number | null;
  }>;
  advanced: {
    ocrSuccessRate: number | null;
    extractionFailures: number;
    providerAttempts: number;
    providerFallbacks: number;
    timeoutCount: number;
    httpErrors: number;
    averageGenerationMs: number | null;
    averageStageDurationsMs: Record<string, number>;
    extensionAverageMs: number | null;
    sourceReady: number;
    sourceReview: number;
  };
}

type JsonRecord = Record<string, unknown>;

interface InternalAnalyticsRecord {
  jobId: string | null;
  documentId: string | null;
  status: AnalyticsStatus;
  documentType: string;
  matter: string;
  createdAt: string;
  targetPages: number | null;
  minPages: number | null;
  maxPages: number | null;
  actualPages: number | null;
  extensionTargetUnmet: boolean | null;
  qualityGatePass: boolean | null;
  validationPass: boolean | null;
  warningsCount: number;
  errorsCount: number;
  ocrValidated: boolean | null;
  sourceQualityStatus: string | null;
  sourcePages: number;
  durationMs: number | null;
  stageDurationsMs: Record<string, number>;
  providerAttempts: number;
  providerFallbacks: number;
  timeoutCount: number;
  httpErrors: number;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback: string | null = null): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function isoDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function dateKey(value: string): string {
  return value.slice(0, 10);
}

function uniqueCount(value: unknown): number {
  return new Set(array(value).map((item) => typeof item === 'string' ? item : JSON.stringify(item))).size;
}

function terminalToStatus(value: unknown): AnalyticsStatus | null {
  if (value === 'FAILED') return 'FAILED';
  if (value === 'CANCELLED') return 'CANCELLED';
  if (value === 'NEEDS_REVIEW') return 'NEEDS_REVIEW';
  if (value === 'COMPLETED' || value === 'COMPLETED_WITH_WARNINGS') return 'COMPLETED';
  return null;
}

function draftMetadata(draft: AnalyticsDraftProjection): {
  metadata: JsonRecord;
  persistence: JsonRecord;
  checkpointMetadata: JsonRecord;
  structured: JsonRecord;
  validation: JsonRecord;
  qualityGate: JsonRecord;
  extension: JsonRecord;
  pipelineState: JsonRecord;
} {
  const metadata = record(draft.generationMetadata);
  const persistence = record(metadata.persistence);
  const checkpoint = record(persistence.checkpointDocument);
  const checkpointMetadata = record(checkpoint.generationMetadata);
  const structured = record(draft.structuredDoc);
  const structuredMetadata = record(structured.generationMetadata);
  const validation = Object.keys(record(draft.validationResults)).length > 0
    ? record(draft.validationResults)
    : record(structured.validation);
  const qualityState = record(persistence.qualityState);
  const qualityGate = Object.keys(record(qualityState.qualityGate)).length > 0
    ? record(qualityState.qualityGate)
    : Object.keys(record(structured.qualityGate)).length > 0
      ? record(structured.qualityGate)
      : record(metadata.qualityGate);
  const extension = [metadata.generationExtension, structuredMetadata.generationExtension, checkpointMetadata.generationExtension]
    .map(record)
    .find((candidate) => Object.keys(candidate).length > 0) || {};
  const pipelineState = Object.keys(record(metadata.pipelineState)).length > 0
    ? record(metadata.pipelineState)
    : record(structuredMetadata.pipelineState);
  return { metadata, persistence, checkpointMetadata, structured, validation, qualityGate, extension, pipelineState };
}

function sourceMetrics(draft: AnalyticsDraftProjection): { sourcePages: number; ocrValidated: boolean | null; sourceQualityStatus: string | null } {
  const sources = array(draft.sourceDocuments);
  if (!sources.length) return { sourcePages: 0, ocrValidated: null, sourceQualityStatus: null };
  let sourcePages = 0;
  let anyUnvalidated = false;
  let allValidated = true;
  let qualityStatus: string | null = null;
  for (const source of sources.map(record)) {
    const pages = finiteNumber(source.pageCount) ?? array(source.pages).length;
    sourcePages += pages || 0;
    const validated = booleanValue(source.sourceValidated);
    if (validated !== true) { allValidated = false; anyUnvalidated = true; }
    const candidateStatus = text(source.sourceQualityStatus) || text(record(source.qualityScore).status);
    if (candidateStatus) qualityStatus = qualityStatus || candidateStatus;
  }
  return {
    sourcePages,
    ocrValidated: anyUnvalidated ? (allValidated ? true : false) : true,
    sourceQualityStatus: qualityStatus,
  };
}

function stageDurations(pipelineState: JsonRecord): Record<string, number> {
  const stages = record(pipelineState.stages);
  const result: Record<string, number> = {};
  for (const [stage, raw] of Object.entries(stages)) {
    const data = record(raw);
    const started = data.startedAt ? new Date(String(data.startedAt)).getTime() : NaN;
    const completed = data.completedAt ? new Date(String(data.completedAt)).getTime() : NaN;
    if (Number.isFinite(started) && Number.isFinite(completed) && completed >= started) result[stage] = completed - started;
  }
  return result;
}

function providerMetrics(metadata: JsonRecord, extension: JsonRecord): { attempts: number; fallbacks: number } {
  const sections = record(metadata.sections);
  const sectionValues = Object.values(sections).map(record);
  const extensionMetrics = record(extension.metrics);
  const calls = finiteNumber(extensionMetrics.llmCalls) ?? finiteNumber(extensionMetrics.continuationCalls) ?? 0;
  const providerCalls = Object.values(record(extensionMetrics.providerCalls)).reduce<number>(
    (sum, value) => sum + (finiteNumber(value) || 0),
    0,
  );
  const attempts = Math.max(calls, providerCalls, sectionValues.filter((section) => text(section.provider)).length);
  const fallbacks = sectionValues.filter((section) => section.fallbackUsed === true).length;
  return { attempts, fallbacks };
}

function fromDraft(draft: AnalyticsDraftProjection): InternalAnalyticsRecord {
  const { metadata, persistence, checkpointMetadata, structured, validation, qualityGate, extension, pipelineState } = draftMetadata(draft);
  const source = sourceMetrics(draft);
  const terminal = terminalToStatus(persistence.terminalStatus) || terminalToStatus(metadata.terminalStatus);
  const readiness = text(metadata.readiness) || text(metadata.documentReadiness) || text(persistence.readinessState && record(persistence.readinessState).readiness);
  const derivedStatus = terminal || (draft.status === 'FAILED' ? 'FAILED' : draft.status === 'CANCELLED' ? 'CANCELLED' : qualityGate.passed === false || validation.isValid === false || readiness === 'REQUIRES_REVIEW' ? 'NEEDS_REVIEW' : 'COMPLETED');
  const actualPages = finiteNumber(extension.actualPages) ?? finiteNumber(record(metadata.qualityMetrics).actualPages) ?? finiteNumber(record(record(persistence.qualityState).qualityMetrics).actualPages);
  const targetPages = finiteNumber(extension.targetPages);
  const minPages = finiteNumber(extension.minPages);
  const maxPages = finiteNumber(extension.maxPages);
  const explicitUnmet = booleanValue(extension.extensionTargetUnmet);
  const extensionTargetUnmet = explicitUnmet ?? (targetPages !== null && actualPages !== null ? actualPages < (minPages ?? targetPages) : null);
  const provider = providerMetrics(metadata, extension);
  const errors = array(validation.errors).length + (metadata.errorCode ? 1 : 0);
  const warnings = uniqueCount([...
    array(metadata.warnings),
    ...array(persistence.warnings),
    ...array(validation.warnings),
  ]);
  const duration = finiteNumber(metadata.generationTimeMs) ?? finiteNumber(persistence.durationMs);
  return {
    jobId: text(persistence.jobId),
    documentId: draft.id,
    status: derivedStatus,
    documentType: text(draft.documentType, 'Sin especificar') || 'Sin especificar',
    matter: text(draft.matter, 'Sin especificar') || 'Sin especificar',
    createdAt: isoDate(draft.createdAt),
    targetPages,
    minPages,
    maxPages,
    actualPages,
    extensionTargetUnmet,
    qualityGatePass: booleanValue(qualityGate.passed),
    validationPass: booleanValue(validation.isValid),
    warningsCount: warnings,
    errorsCount: errors,
    ocrValidated: source.ocrValidated,
    sourceQualityStatus: source.sourceQualityStatus,
    sourcePages: source.sourcePages,
    durationMs: duration,
    stageDurationsMs: stageDurations(pipelineState),
    providerAttempts: provider.attempts,
    providerFallbacks: provider.fallbacks,
    timeoutCount: /TIMEOUT/i.test(String(metadata.errorCode || '')) ? 1 : 0,
    httpErrors: finiteNumber(metadata.httpErrors) ?? 0,
  };
}

function fromJob(job: AnalyticsJobProjection): InternalAnalyticsRecord {
  const status = terminalToStatus(job.terminalStatus) || (job.status === 'failed' ? 'FAILED' : job.status === 'cancelled' ? 'CANCELLED' : 'NEEDS_REVIEW');
  const started = new Date(job.startedAt).getTime();
  const updated = new Date(job.updatedAt).getTime();
  const durationMs = Number.isFinite(started) && Number.isFinite(updated) && updated >= started ? updated - started : null;
  return {
    jobId: job.id,
    documentId: job.documentId || null,
    status,
    documentType: 'Sin especificar',
    matter: 'Sin especificar',
    createdAt: isoDate(job.createdAt),
    targetPages: null,
    minPages: null,
    maxPages: null,
    actualPages: null,
    extensionTargetUnmet: null,
    qualityGatePass: null,
    validationPass: null,
    warningsCount: uniqueCount(job.warnings),
    errorsCount: job.errorCode ? 1 : 0,
    ocrValidated: null,
    sourceQualityStatus: null,
    sourcePages: 0,
    durationMs,
    stageDurationsMs: {},
    providerAttempts: 0,
    providerFallbacks: 0,
    timeoutCount: /TIMEOUT/i.test(String(job.errorCode || '')) ? 1 : 0,
    httpErrors: /^HTTP_/i.test(String(job.errorCode || '')) ? 1 : 0,
  };
}

function mergeRecords(base: InternalAnalyticsRecord, incoming: InternalAnalyticsRecord): InternalAnalyticsRecord {
  const incomingHasDocumentData = incoming.documentType !== 'Sin especificar' || incoming.targetPages !== null || incoming.qualityGatePass !== null;
  return {
    ...base,
    jobId: base.jobId || incoming.jobId,
    documentId: base.documentId || incoming.documentId,
    status: incoming.jobId === base.jobId && incoming.documentType === 'Sin especificar' ? incoming.status : base.status,
    documentType: incomingHasDocumentData ? incoming.documentType : base.documentType,
    matter: incomingHasDocumentData ? incoming.matter : base.matter,
    createdAt: new Date(base.createdAt) <= new Date(incoming.createdAt) ? base.createdAt : incoming.createdAt,
    targetPages: incoming.targetPages ?? base.targetPages,
    minPages: incoming.minPages ?? base.minPages,
    maxPages: incoming.maxPages ?? base.maxPages,
    actualPages: incoming.actualPages ?? base.actualPages,
    extensionTargetUnmet: incoming.extensionTargetUnmet ?? base.extensionTargetUnmet,
    qualityGatePass: incoming.qualityGatePass ?? base.qualityGatePass,
    validationPass: incoming.validationPass ?? base.validationPass,
    warningsCount: Math.max(base.warningsCount, incoming.warningsCount),
    errorsCount: Math.max(base.errorsCount, incoming.errorsCount),
    ocrValidated: incoming.ocrValidated ?? base.ocrValidated,
    sourceQualityStatus: incoming.sourceQualityStatus ?? base.sourceQualityStatus,
    sourcePages: Math.max(base.sourcePages, incoming.sourcePages),
    durationMs: incoming.durationMs ?? base.durationMs,
    stageDurationsMs: { ...base.stageDurationsMs, ...incoming.stageDurationsMs },
    providerAttempts: Math.max(base.providerAttempts, incoming.providerAttempts),
    providerFallbacks: Math.max(base.providerFallbacks, incoming.providerFallbacks),
    timeoutCount: Math.max(base.timeoutCount, incoming.timeoutCount),
    httpErrors: Math.max(base.httpErrors, incoming.httpErrors),
  };
}

function sameRecord(left: InternalAnalyticsRecord, right: InternalAnalyticsRecord): boolean {
  return Boolean((left.jobId && right.jobId && left.jobId === right.jobId) || (left.documentId && right.documentId && left.documentId === right.documentId));
}

function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

export function buildAnalyticsDataset(input: { drafts: AnalyticsDraftProjection[]; jobs: AnalyticsJobProjection[]; rangeDays: AnalyticsRangeDays; now?: Date }): AnalyticsDataset {
  const now = input.now ? new Date(input.now) : new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (input.rangeDays - 1));
  start.setUTCHours(0, 0, 0, 0);
  const records: InternalAnalyticsRecord[] = [];
  for (const source of input.drafts) {
    const candidate = fromDraft(source);
    const index = records.findIndex((existing) => sameRecord(existing, candidate));
    if (index >= 0) records[index] = mergeRecords(records[index], candidate);
    else records.push(candidate);
  }
  for (const source of input.jobs) {
    const candidate = fromJob(source);
    const index = records.findIndex((existing) => sameRecord(existing, candidate));
    if (index >= 0) records[index] = mergeRecords(records[index], candidate);
    else records.push(candidate);
  }
  const periodRecords = records.filter((item) => {
    const timestamp = new Date(item.createdAt).getTime();
    return timestamp >= start.getTime() && timestamp <= now.getTime();
  });
  const counts: Record<AnalyticsStatus, number> = { COMPLETED: 0, NEEDS_REVIEW: 0, FAILED: 0, CANCELLED: 0 };
  for (const item of periodRecords) counts[item.status] += 1;
  const dailyMap = new Map<string, number>();
  for (let cursor = new Date(start); cursor <= now; cursor.setUTCDate(cursor.getUTCDate() + 1)) dailyMap.set(dateKey(cursor.toISOString()), 0);
  for (const item of periodRecords) dailyMap.set(dateKey(item.createdAt), (dailyMap.get(dateKey(item.createdAt)) || 0) + 1);
  const group = (selector: (item: InternalAnalyticsRecord) => string) => {
    const grouped = new Map<string, number>();
    for (const item of periodRecords) { const label = selector(item); grouped.set(label, (grouped.get(label) || 0) + 1); }
    return Array.from(grouped, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };
  const targeted = periodRecords.filter((item) => item.targetPages !== null);
  const achieved = targeted.filter((item) => item.extensionTargetUnmet === false).length;
  const unmet = targeted.filter((item) => item.extensionTargetUnmet === true).length;
  const generationTimes = periodRecords.flatMap((item) => item.durationMs !== null ? [item.durationMs] : []);
  const stageValues = new Map<string, number[]>();
  for (const item of periodRecords) for (const [stage, duration] of Object.entries(item.stageDurationsMs)) stageValues.set(stage, [...(stageValues.get(stage) || []), duration]);
  const averageStageDurationsMs = Object.fromEntries(Array.from(stageValues, ([stage, values]) => [stage, average(values) || 0]));
  const ocrRecords = periodRecords.filter((item) => item.ocrValidated !== null);
  const recent = [...periodRecords].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8).map((item) => ({
    status: item.status,
    documentType: item.documentType,
    matter: item.matter,
    createdAt: item.createdAt,
    targetPages: item.targetPages,
    actualPages: item.actualPages,
    extensionTargetUnmet: item.extensionTargetUnmet,
    qualityGatePass: item.qualityGatePass,
    validationPass: item.validationPass,
    warningsCount: item.warningsCount,
    errorsCount: item.errorsCount,
    sourceQualityStatus: item.sourceQualityStatus,
    sourcePages: item.sourcePages,
    durationMs: item.durationMs,
  }));
  return {
    rangeDays: input.rangeDays,
    period: { start: start.toISOString(), end: now.toISOString() },
    hasActivity: periodRecords.length > 0,
    insufficientActivity: periodRecords.length === 0,
    totals: {
      total: periodRecords.length,
      documentsGenerated: periodRecords.filter((item) => item.status === 'COMPLETED' || item.status === 'NEEDS_REVIEW').length,
      completed: counts.COMPLETED,
      needsReview: counts.NEEDS_REVIEW,
      failed: counts.FAILED,
      cancelled: counts.CANCELLED,
      averageGenerationMs: average(generationTimes),
      generatedPages: periodRecords.reduce((sum, item) => sum + (item.actualPages || 0), 0),
    },
    daily: Array.from(dailyMap, ([date, count]) => ({ date, count })),
    statuses: (Object.keys(counts) as AnalyticsStatus[]).map((status) => ({ status, count: counts[status] })),
    byType: group((item) => item.documentType),
    byMatter: group((item) => item.matter),
    extension: { achieved, unmet, withoutTarget: periodRecords.length - targeted.length },
    quality: {
      qualityGatePass: periodRecords.filter((item) => item.qualityGatePass === true).length,
      qualityGateFail: periodRecords.filter((item) => item.qualityGatePass === false).length,
      validationPass: periodRecords.filter((item) => item.validationPass === true).length,
      validationFail: periodRecords.filter((item) => item.validationPass === false).length,
      warnings: periodRecords.reduce((sum, item) => sum + item.warningsCount, 0),
      errors: periodRecords.reduce((sum, item) => sum + item.errorsCount, 0),
      sourcePages: periodRecords.reduce((sum, item) => sum + item.sourcePages, 0),
    },
    recent,
    advanced: {
      ocrSuccessRate: ocrRecords.length ? Math.round((ocrRecords.filter((item) => item.ocrValidated === true).length / ocrRecords.length) * 100) : null,
      extractionFailures: periodRecords.filter((item) => item.sourceQualityStatus === 'NEEDS_SOURCE_REVIEW' || item.sourceQualityStatus === 'FAILED').length,
      providerAttempts: periodRecords.reduce((sum, item) => sum + item.providerAttempts, 0),
      providerFallbacks: periodRecords.reduce((sum, item) => sum + item.providerFallbacks, 0),
      timeoutCount: periodRecords.reduce((sum, item) => sum + item.timeoutCount, 0),
      httpErrors: periodRecords.reduce((sum, item) => sum + item.httpErrors, 0),
      averageGenerationMs: average(generationTimes),
      averageStageDurationsMs,
      extensionAverageMs: average(periodRecords.flatMap((item) => item.stageDurationsMs.extend ? [item.stageDurationsMs.extend] : [])),
      sourceReady: periodRecords.filter((item) => item.sourceQualityStatus === 'READY').length,
      sourceReview: periodRecords.filter((item) => item.sourceQualityStatus === 'NEEDS_SOURCE_REVIEW' || item.sourceQualityStatus === 'FAILED').length,
    },
  };
}
