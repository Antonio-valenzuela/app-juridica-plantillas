import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceExecutionAccess, executionOwnerKey } from '@/lib/security/workspaceExecutionAccess';
import { loadWorkspaceGenerationArtifact, saveGenerationArtifact } from '@/lib/legal-engine/generationPersistence';
import { buildReviewRequest } from '@/lib/legal-engine/reviewRequest';
import { runVerificationContinuation } from '@/lib/legal-engine/verificationContinuation';
import { generateSection } from '@/lib/legal-engine/pipeline';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';
import { checkRequestRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/security/apiErrors';
import { generateRequestId } from '@/lib/logger';
import { explicitAuthorizedProviders, explicitExternalProviderConsent } from '@/lib/ai/caseProviderConsent';
import {
  getDraftRegenerationRoutingError,
  getUncertifiedDraftAcknowledgementError,
} from '@/lib/legal-engine/uncertifiedDraftAcknowledgement';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireWorkspaceExecutionAccess(request);
  if (!auth.ok) return auth.response;
  const documentId = new URL(request.url).searchParams.get('documentId')?.trim() || '';
  if (!documentId) return NextResponse.json({ ok: false, error: 'MISSING_DOCUMENT_ID' }, { status: 400 });
  const document = await loadWorkspaceGenerationArtifact(auth.context, documentId);
  if (!document) return NextResponse.json({ ok: false, error: 'DOCUMENT_NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, reviewRequest: buildReviewRequest(document) });
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id')?.trim() || generateRequestId();
  const auth = await requireWorkspaceExecutionAccess(request);
  if (!auth.ok) return auth.response;
  const rateLimit = checkRequestRateLimit(request, 'review', 20, executionOwnerKey(auth.context));
  if (!rateLimit.ok) return NextResponse.json({ ok: false, errorCode: 'RATE_LIMITED', message: 'Demasiadas solicitudes de revisión. Intenta de nuevo más tarde.' }, { status: 429, headers: rateLimit.headers });

  try {
    const body = await request.json();
    const documentId = typeof body.documentId === 'string' ? body.documentId.trim() : '';
    const answers = Array.isArray(body.answers) ? body.answers : [];
    if (!documentId || answers.length === 0) return NextResponse.json({ ok: false, error: 'DOCUMENT_ID_AND_ANSWERS_REQUIRED' }, { status: 400 });

    const document = await loadWorkspaceGenerationArtifact(auth.context, documentId);
    if (!document) return NextResponse.json({ ok: false, error: 'DOCUMENT_NOT_FOUND' }, { status: 404 });
    // El artefacto guardado conserva el consentimiento de su generación original; el de esta solicitud es independiente.
    document.generationMetadata = {
      ...(document.generationMetadata || {}),
      externalProviderOptIn: explicitExternalProviderConsent(body.externalProviderOptIn),
      authorizedExternalProviders: explicitAuthorizedProviders(body.authorizedExternalProviders),
    } as typeof document.generationMetadata;
    const reviewRequest = buildReviewRequest(document);
    const validIds = new Set(reviewRequest.pendingItems.map((item) => item.id));
    const invalid = answers.find((answer: any) => typeof answer?.itemId !== 'string' || !validIds.has(answer.itemId) || typeof answer?.answer !== 'string' || !answer.answer.trim());
    if (invalid) return NextResponse.json({ ok: false, error: 'INVALID_REVIEW_ANSWER', pendingItemIds: [...validIds] }, { status: 400 });

    const triggersSectionRegeneration = answers.some((answer: any) =>
      reviewRequest.pendingItems.find((item) => item.id === answer.itemId)?.type !== 'FILING_METADATA',
    );
    if (triggersSectionRegeneration) {
      const routingError = getDraftRegenerationRoutingError(document.documentType);
      if (routingError) return NextResponse.json({ ok: false, ...routingError }, { status: 422 });
      const acknowledgementError = getUncertifiedDraftAcknowledgementError(
        document.documentType,
        body.uncertifiedDraftAcknowledged,
      );
      if (acknowledgementError) {
        return NextResponse.json({ ok: false, ...acknowledgementError }, { status: 422 });
      }
    }

    const affectedSections = new Set<string>();
    for (const answer of answers) {
      const item = reviewRequest.pendingItems.find((candidate) => candidate.id === answer.itemId)!;
      item.affectedSections.forEach((sectionId) => affectedSections.add(sectionId));
      const answerText = String(answer.answer).trim();
      if (item.type === 'FILING_METADATA') {
        for (const section of document.sections.filter((candidate) => item.affectedSections.includes(candidate.id))) {
          section.content = [{ id: `human-${item.id}`, text: answerText, layer: 'GENERATED_ARGUMENT', trustLevel: 'HUMAN_CONFIRMED', provenance: 'HUMAN_CONFIRMED', isManuallyEdited: true, generationRequirement: 'PRESERVED_HUMAN', generationStatus: 'generated' } as any];
        }
      } else {
        for (const sectionId of item.affectedSections) {
          const generated = await generateSection(document, sectionId, `Integra exclusivamente esta respuesta humana confirmada: ${answerText}. No inventes hechos, autoridades ni efectos distintos.`);
          if (generated.aiUsed !== true) return NextResponse.json({ ok: false, error: 'SELECTIVE_REGENERATION_UNAVAILABLE', sectionId }, { status: 503 });
        }
      }
      document.missingFields = (document.missingFields || []).filter((field) => !field.toLowerCase().includes(item.id.replace('position-', '').toLowerCase()));
    }

    const verified = runVerificationContinuation(document);
    const nextReview = buildReviewRequest(verified.document);
    (verified.document.generationMetadata as any).reviewRequest = nextReview;
    await saveGenerationArtifact({ ...auth.context, document: verified.document, progress: 100, terminalStatus: verified.qualityGate.passed ? 'COMPLETED' : 'NEEDS_REVIEW', warnings: verified.qualityGate.passed ? [] : ['DOCUMENT_REQUIRES_REVIEW'] });
    return NextResponse.json({ ok: true, documentId: verified.document.id, document: verified.document, answersApplied: answers.map((answer: any) => answer.itemId), sectionsRegenerated: [...affectedSections], fullRegeneration: false, reviewRequest: nextReview, validation: verified.validation, qualityGate: verified.qualityGate });
  } catch (error: any) {
    return apiErrorResponse({ requestId, status: 500, errorCode: 'REVIEW_APPLICATION_FAILED', message: 'No fue posible aplicar las respuestas de revisión.', internalError: error });
  }
}
