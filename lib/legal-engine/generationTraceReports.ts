import { mkdir, rename, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { GenerationTrace } from './generationTrace';
import { sanitizeTraceValue } from './generationTraceSanitizer';

export interface GenerationTraceArtifactOptions {
  outputDir: string;
  writeMarkdown?: boolean;
}

export interface GenerationTraceArtifacts {
  jsonPath: string;
  markdownPath?: string;
  errors: string[];
}

const REPORT_SECTIONS = [
  'SOURCE',
  'EXTRACTION',
  'CASE ANALYSIS',
  'DOCUMENT PLAN',
  'COVERAGE BEFORE',
  'GENERATION TASKS',
  'PROVIDERS USED',
  'FALLBACKS',
  'SEMANTIC EVALUATIONS',
  'COVERAGE AFTER',
  'QUALITY GATE',
  'DOCX EXPORT',
  'WARNINGS',
  'ERRORS',
] as const;

function safeGenerationId(generationId: string): string {
  return generationId.replace(/[^A-Za-z0-9._-]/g, '_');
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

function listProviders(trace: GenerationTrace): Array<Record<string, unknown>> {
  const entries = trace.taskExecutions.length > 0 ? trace.taskExecutions : trace.generationTasks;
  return entries.map((entry) => ({
    taskId: entry.taskId,
    providerRequested: entry.providerRequested,
    providerActuallyUsed: entry.providerActuallyUsed,
    model: entry.model,
    origin: entry.origin,
  }));
}

function listFallbacks(trace: GenerationTrace): Array<Record<string, unknown>> {
  return trace.taskExecutions
    .filter((entry) => entry.fallbackUsed || entry.fallbackReason || entry.origin === 'LOCAL_PLACEHOLDER' || entry.origin === 'DETERMINISTIC_FALLBACK')
    .map((entry) => ({
      taskId: entry.taskId,
      fallbackUsed: entry.fallbackUsed,
      fallbackReason: entry.fallbackReason,
      origin: entry.origin,
      providerActuallyUsed: entry.providerActuallyUsed,
      finalBlockId: entry.finalBlockId,
    }));
}

/**
 * Renderiza un reporte auditable. El texto se construye únicamente a partir
 * del trace sanitizado; nunca incluye prompts crudos ni credenciales.
 */
export function renderGenerationReportMarkdown(input: GenerationTrace): string {
  const trace = sanitizeTraceValue(input) as GenerationTrace;
  const sections: Record<(typeof REPORT_SECTIONS)[number], string> = {
    SOURCE: json({ generationId: trace.generationId, sourceIds: trace.sourceIds, documentType: trace.documentType, matter: trace.matter }),
    EXTRACTION: json(trace.extraction),
    'CASE ANALYSIS': json(trace.caseAnalysisSnapshot),
    'DOCUMENT PLAN': json(trace.documentPlanSnapshot),
    'COVERAGE BEFORE': json(trace.coverageMatrixBeforeGeneration),
    'GENERATION TASKS': json({ planned: trace.generationTasks, executions: trace.taskExecutions }),
    'PROVIDERS USED': json(listProviders(trace)),
    FALLBACKS: json(listFallbacks(trace)),
    'SEMANTIC EVALUATIONS': json(trace.semanticEvaluations),
    'COVERAGE AFTER': json(trace.coverageMatrixAfterGeneration),
    'QUALITY GATE': json(trace.qualityGateResult),
    'DOCX EXPORT': json(trace.exportMetadata),
    WARNINGS: json(trace.warnings),
    ERRORS: json(trace.errors),
  };

  return [
    `# Generation report ${trace.generationId}`,
    '',
    `- Schema: ${trace.schemaVersion}`,
    `- Started: ${trace.startedAt}`,
    `- Completed: ${trace.completedAt || 'incomplete'}`,
    ...REPORT_SECTIONS.flatMap((heading) => [``, `## ${heading}`, ``, '```json', sections[heading], '```']),
    '',
  ].join('\n');
}

/**
 * Publica el JSON y, opcionalmente, el Markdown mediante temporales en el
 * mismo directorio. Ante un fallo se limpian temporales y artefactos parciales.
 */
export async function writeGenerationTraceArtifacts(
  input: GenerationTrace,
  options: GenerationTraceArtifactOptions,
): Promise<GenerationTraceArtifacts> {
  const safeTrace = sanitizeTraceValue(input) as GenerationTrace;
  const outputDir = options.outputDir;
  const id = safeGenerationId(safeTrace.generationId);
  const jsonPath = join(outputDir, `generation-trace-${id}.json`);
  const markdownPath = options.writeMarkdown === false
    ? undefined
    : join(outputDir, `generation-report-${id}.md`);
  const jsonTemp = `${jsonPath}.${randomUUID()}.tmp`;
  const markdownTemp = markdownPath ? `${markdownPath}.${randomUUID()}.tmp` : undefined;
  const published: string[] = [];

  try {
    await mkdir(outputDir, { recursive: true });
    await writeFile(jsonTemp, `${JSON.stringify(safeTrace, null, 2)}\n`, 'utf8');
    if (markdownTemp && markdownPath) {
      await writeFile(markdownTemp, renderGenerationReportMarkdown(safeTrace), 'utf8');
    }
    await rename(jsonTemp, jsonPath);
    published.push(jsonPath);
    if (markdownTemp && markdownPath) {
      await rename(markdownTemp, markdownPath);
      published.push(markdownPath);
    }
    return { jsonPath, markdownPath, errors: [] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await Promise.all([
      rm(jsonTemp, { force: true }),
      markdownTemp ? rm(markdownTemp, { force: true }) : Promise.resolve(),
      ...published.map((path) => rm(path, { force: true })),
    ]);
    const traceErrors = Array.isArray(safeTrace.errors) ? safeTrace.errors : [];
    const traceError = `TRACE_ARTIFACT_WRITE_FAILED: ${String(sanitizeTraceValue(message))}`;
    traceErrors.push(traceError);
    safeTrace.errors = traceErrors;
    if (Array.isArray(input.errors) && !input.errors.includes(traceError)) input.errors.push(traceError);
    return { jsonPath, markdownPath, errors: traceErrors };
  }
}
