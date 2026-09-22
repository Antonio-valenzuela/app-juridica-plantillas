import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { describe, expect, it } from 'vitest';
import { runFastMode } from '@/lib/ai/orchestrator';
import type { AIProviderResult, AIRequest } from '@/lib/ai/providers/types';
import { extractDocument } from '@/lib/pdf/documentExtractor';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import type { GenerationTrace } from '@/lib/legal-engine/generationTrace';
import type { UniversalLegalDocument, UploadedSourceDocument } from '@/lib/legal-engine/types';

dotenv.config({ path: path.join(process.cwd(), '.env') });
process.env.NVIDIA_REQUEST_TIMEOUT_MS ||= '90000';
delete process.env.DEMO_MODE_ENABLED;

const GOLDEN_PATH = 'C:\\Users\\yahir\\.gemini\\antigravity\\brain\\9e22de42-f574-48ec-b12b-9eca82f5f4fa\\scratch\\test_docs\\11_DE_JULIO_CONTESTACION_DEMANDA_REIVINDICATORIA.docx';
const AUDIT_PATH = 'C:\\Users\\yahir\\.gemini\\antigravity\\brain\\9e22de42-f574-48ec-b12b-9eca82f5f4fa\\scratch\\argumentative_contract_golden_audit.json';

interface RecordedProviderCall {
  taskId: string;
  taskType?: string;
  draftContract?: string;
  requiredFields: string[];
  returnedFields: string[];
  providerActuallyUsed?: string;
  success: boolean;
  outputChars: number;
  latencyMs: number;
}

function taskIdFromRequest(request: AIRequest): string {
  const match = String(request.requestId || '').match(/^issue:(.+):attempt:\d+$/);
  return match?.[1] || String(request.requestId || 'unknown');
}

function returnedFields(response: AIProviderResult): string[] {
  if (response.structuredOutput && typeof response.structuredOutput === 'object') {
    return Object.keys(response.structuredOutput).sort();
  }
  try {
    const parsed = JSON.parse(String(response.content || ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed).sort() : [];
  } catch {
    return [];
  }
}

function lastByTask<T extends { taskId: string }>(entries: readonly T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const entry of entries) result.set(entry.taskId, entry);
  return result;
}

describe('golden real NVIDIA contract and materialization audit', () => {
  const hasKey = !!process.env.NVIDIA_API_KEY?.trim();
  const shouldRunReal = hasKey && process.env.NVIDIA_REAL_TEST === 'true';

  it.skipIf(!shouldRunReal)('traces the canonical civil answer through NVIDIA, validation, DraftBlock, assembly, and editor model', async () => {
    expect(process.env.NVIDIA_API_KEY?.trim(), 'NVIDIA_API_KEY must come from .env; never embed it in a test').toBeTruthy();
    expect(fs.existsSync(GOLDEN_PATH)).toBe(true);

    const fileBuffer = fs.readFileSync(GOLDEN_PATH);
    const fileName = path.basename(GOLDEN_PATH);
    const extracted = await extractDocument({ buffer: fileBuffer, fileName, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    expect(extracted.text.length).toBeGreaterThan(6000);

    const caseAnalysis = reconstructCaseAnalysis([{
      id: 'source-11-julio', filename: fileName, name: fileName, type: 'docx', extractedText: extracted.text,
    } as any]);
    const sourceDoc: UploadedSourceDocument = createSourceDocument({
      id: 'source-11-julio', filename: fileName, name: fileName, type: 'docx', fileUrl: `blob:${fileName}`,
      extractedText: extracted.text, pages: extracted.pages, sourceValidated: true, fileSizeBytes: fileBuffer.length,
    } as any);

    const calls: RecordedProviderCall[] = [];
    const invokeRealNvidia = async (request: AIRequest): Promise<AIProviderResult> => {
      const started = Date.now();
      const response = await runFastMode(request);
      const schema = request.outputSchema as { required?: string[] } | undefined;
      calls.push({
        taskId: taskIdFromRequest(request),
        taskType: request.taskType,
        draftContract: request.legalContext?.draftContract,
        requiredFields: [...(schema?.required || [])].sort(),
        returnedFields: returnedFields(response),
        providerActuallyUsed: response.providerActuallyUsed,
        success: response.success,
        outputChars: String(response.content || '').length,
        latencyMs: Date.now() - started,
      });
      return response;
    };

    let trace: GenerationTrace | undefined;
    const doc: UniversalLegalDocument = await runGenerationPipeline({
      userInstruction: 'Redactar contestación de demanda formal contestando prestaciones y hechos puntualmente con excepciones y pruebas',
      sourceDocuments: [sourceDoc],
      allowUnvalidatedSource: true,
      selectedDocumentType: 'contestacion_demanda_civil',
      matter: 'CIVIL',
      documentTypeLabel: 'Contestación de Demanda Civil',
      generationId: 'golden-argumentative-contract-live-nvidia',
      traceOptions: { enabled: true },
      issueProviderInvoker: invokeRealNvidia,
      maxIssueConcurrency: 3,
      workflow: {
        sourceDocuments: [sourceDoc], analysis: caseAnalysis, selection: { mode: 'automatic' },
        flow: 'DOCUMENT_ANALYSIS', updatedAt: new Date().toISOString(),
      },
    }, { onTraceReady: (readyTrace) => { trace = readyTrace; } });

    expect(trace).toBeDefined();
    const closedTrace = trace!;
    const tasksById = new Map(closedTrace.generationTasks.map((task) => [task.taskId, task]));
    const executionsByTask = lastByTask(closedTrace.taskExecutions);

    const rows = doc.sections.map((section) => {
      const tasks = [...tasksById.values()].filter((task) => task.sectionId === section.id);
      const taskIds = new Set(tasks.map((task) => task.taskId));
      const sectionCalls = calls.filter((call) => taskIds.has(call.taskId));
      const executions = tasks.map((task) => executionsByTask.get(task.taskId)).filter(Boolean);
      const blocks = section.content.filter((block) => block.generationTaskId && taskIds.has(block.generationTaskId));
      const statuses = executions.map((entry) => String(entry!.responseStatus).toUpperCase());
      const attemptedTaskIds = new Set(sectionCalls.map((call) => call.taskId));
      const blocked = tasks.filter((task) => !attemptedTaskIds.has(task.taskId) && !blocks.some((block) => block.generationTaskId === task.taskId)).length;
      return {
        section: section.title,
        taskTypes: [...new Set(tasks.map((task) => task.taskType))].sort(),
        tasks: tasks.length,
        nvidiaCalls: sectionCalls.filter((call) => call.providerActuallyUsed === 'nvidia').length,
        contract: [...new Set(sectionCalls.map((call) => call.draftContract).filter(Boolean))].sort().join('+') || 'N/A',
        accepted: statuses.filter((status) => status === 'ACCEPTED').length,
        reviewRequired: statuses.filter((status) => status === 'VALID_NON_FINAL' || status === 'REQUIRES_REVIEW').length,
        blocked,
        fallback: executions.filter((entry) => entry!.fallbackUsed).length,
        providerChars: sectionCalls.reduce((sum, call) => sum + call.outputChars, 0),
        draftBlockChars: blocks.reduce((sum, block) => sum + block.text.length, 0),
        materializedChars: section.content.reduce((sum, block) => sum + block.text.length, 0),
        editorChars: section.content.reduce((sum, block) => sum + block.text.length, 0),
      };
    });

    const audit = {
      generatedAt: new Date().toISOString(),
      source: fileName,
      model: closedTrace.model,
      totalProviderCalls: calls.length,
      totalNvidiaCalls: calls.filter((call) => call.providerActuallyUsed === 'nvidia').length,
      calls,
      rows,
      validationFailures: closedTrace.issueGenerationAttempts
        .filter((attempt) => attempt.outcome === 'VALIDATION_FAILED')
        .map((attempt) => ({ taskId: attempt.taskId, validationStatus: attempt.validationStatus })),
      documentChars: doc.sections.reduce((sum, section) => sum + section.content.reduce((sectionSum, block) => sectionSum + block.text.length, 0), 0),
    };
    fs.writeFileSync(AUDIT_PATH, JSON.stringify(audit, null, 2), 'utf8');
    console.log(`GOLDEN_AUDIT_PATH=${AUDIT_PATH}`);
    console.table(rows);

    const argumentativeCalls = calls.filter((call) => call.draftContract === 'ARGUMENTATIVE');
    expect(calls.filter((call) => call.providerActuallyUsed === 'nvidia').length).toBeGreaterThan(0);
    expect(argumentativeCalls.length).toBeGreaterThan(0);
    expect(argumentativeCalls.every((call) => ['thesis', 'application', 'conclusion'].every((field) => call.requiredFields.includes(field)))).toBe(true);
    expect(argumentativeCalls.every((call) => ['thesis', 'application', 'conclusion'].every((field) => call.returnedFields.includes(field)))).toBe(true);
    expect(doc.sections.flatMap((section) => section.content).map((block) => block.text).join('\n').length).toBeGreaterThan(1500);
  }, 600000);
});
