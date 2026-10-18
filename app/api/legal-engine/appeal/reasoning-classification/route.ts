import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWorkspaceExecutionAccess, executionOwnerKey } from '@/lib/security/workspaceExecutionAccess';
import { checkRequestRateLimit } from '@/lib/security/rateLimit';
import { checkGenerationAdmission, maxGenerationInputChars } from '@/lib/security/aiCostControls';
import { explicitExternalProviderConsent } from '@/lib/ai/caseProviderConsent';
import { runLegalAI } from '@/lib/ai/orchestrator';
import {
  classifyAppealReasoningBlocks,
  type AppealAiImpact,
  type AppealAiRule,
  type AppealClassificationBlockInput,
  type AppealClassificationContext,
} from '@/lib/legal-engine/case-extraction/appealReasoningAiClassification';
import { isCivilFamilyAppeal } from '@/lib/legal-engine/case-extraction/appealResolutionReview';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const impacts = ['ADVERSE', 'BENEFICIAL', 'NEUTRAL', 'UNDETERMINED'] as const;
const requestSchema = z.object({
  documentType: z.string().min(1).max(80),
  resolutionId: z.string().min(1).max(200),
  representedRole: z.enum(['actor', 'demandado']),
  representedNames: z.array(z.string().trim().min(1).max(200)).min(1).max(10),
  globalOutcome: z.object({
    impact: z.enum([...impacts, 'MIXED']),
    classificationReason: z.string().max(1000),
  }),
  externalProviderOptIn: z.boolean(),
  blocks: z.array(z.object({
    id: z.string().min(1).max(300),
    resolutionId: z.string().min(1).max(200),
    section: z.string().min(1).max(300),
    kind: z.literal('REASONING'),
    pages: z.array(z.number().int().positive()).min(1).max(250),
    sourceText: z.string().min(1).max(120_000),
    sourceSpans: z.array(z.object({
      sourceId: z.string().min(1).max(200),
      page: z.number().int().positive(),
      excerpt: z.string().min(1).max(120_000),
      start: z.number().int().nonnegative(),
      end: z.number().int().positive(),
    })).min(1).max(2_000),
    fallback: z.object({
      impact: z.enum(impacts),
      appliedRule: z.number().int().min(1).max(5),
      classificationReason: z.string().min(1).max(1000),
    }),
  }).superRefine((block, context) => {
    if (block.sourceSpans.some(span => span.end < span.start || span.end - span.start !== span.excerpt.length)
      || block.sourceText !== block.sourceSpans.map(span => span.excerpt).join('\n')) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'source_span_mismatch' });
    }
  })).max(100),
});

export async function POST(request: NextRequest) {
  const auth = await requireWorkspaceExecutionAccess(request, true);
  if (!auth.ok) return auth.response;

  const rateLimit = checkRequestRateLimit(request, 'generation', 10, executionOwnerKey(auth.context));
  if (!rateLimit.ok) {
    return NextResponse.json({ ok: false, errorCode: 'RATE_LIMITED', message: 'Demasiadas solicitudes de generación. Intenta de nuevo más tarde.' }, { status: 429, headers: rateLimit.headers });
  }
  const owner = {
    organizationId: auth.context.organizationId,
    userId: auth.context.userId,
    desktopOwnerId: auth.context.desktopOwnerId,
  };
  const admission = await checkGenerationAdmission(owner);
  if (!admission.ok) {
    const status = admission.errorCode === 'GENERATION_CONCURRENCY_LIMIT' ? 429 : 503;
    return NextResponse.json({ ok: false, errorCode: admission.errorCode, message: status === 429 ? 'Ya hay demasiadas generaciones activas para este workspace.' : 'La capacidad de generación no está disponible.' }, { status });
  }

  try {
    const rawBody = await request.json().catch(() => ({}));
    if (Buffer.byteLength(JSON.stringify(rawBody), 'utf8') > maxGenerationInputChars()) {
      return NextResponse.json({ ok: false, errorCode: 'GENERATION_INPUT_TOO_LARGE', message: 'La solicitud de generación excede el tamaño permitido.' }, { status: 413 });
    }
    const parsed = requestSchema.safeParse(rawBody);
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
    const body = parsed.data;
    if (!isCivilFamilyAppeal(body.documentType)) return NextResponse.json({ ok: false, error: 'unsupported_appeal_type' }, { status: 400 });
    if (body.blocks.some(block => block.resolutionId !== body.resolutionId)
      || new Set(body.blocks.map(block => block.id)).size !== body.blocks.length) {
      return NextResponse.json({ ok: false, error: 'resolution_block_mismatch' }, { status: 400 });
    }

    const externalProviderOptIn = explicitExternalProviderConsent(body.externalProviderOptIn);
    const context: AppealClassificationContext = {
      documentType: body.documentType,
      representedRole: body.representedRole,
      representedNames: body.representedNames,
      globalOutcome: body.globalOutcome as AppealClassificationContext['globalOutcome'],
    };
    const blocks: AppealClassificationBlockInput[] = body.blocks as AppealClassificationBlockInput[];
    const classifications = await classifyAppealReasoningBlocks(blocks, context, async providerRequest => {
      if (!externalProviderOptIn) return { success: false, provider: 'local', content: '', errorCode: 'EXTERNAL_CONSENT_REQUIRED' };
      const result = await runLegalAI({
        externalProviderOptIn: true,
        privateCaseContext: true,
        taskType: 'appeal_reasoning_classification',
        systemPrompt: providerRequest.systemPrompt,
        userMessage: providerRequest.userMessage,
        outputSchema: providerRequest.outputSchema,
        maxTokens: providerRequest.maxTokens,
        maxProviderRetries: 0,
        temperature: 0,
        requestId: `appeal-classification-${body.resolutionId}-${Date.now()}`,
      });
      return {
        success: result.success,
        provider: result.provider,
        content: result.content,
        errorCode: result.errorCode,
      };
    }, { externalProviderOptIn });

    const warnings = [...new Set(classifications.map(result => result.warning).filter((warning): warning is string => Boolean(warning)))];
    return NextResponse.json({ ok: true, classifications, warnings });
  } catch {
    return NextResponse.json({ ok: false, error: 'appeal_classification_failed' }, { status: 500 });
  }
}
