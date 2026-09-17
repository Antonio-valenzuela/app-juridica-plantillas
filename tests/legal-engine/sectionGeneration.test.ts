import { describe, expect, it, vi } from 'vitest';
import type { AIProviderResult } from '@/lib/ai/providers/types';
import type { SectionContextPacket } from '@/lib/legal-engine/sectionContextPacket';
import { generateSectionDraft, sectionDraftToContentBlock } from '@/lib/legal-engine/sectionGeneration';
import type { GenerationTraceContext } from '@/lib/legal-engine/generationTrace';

function packet(overrides: Partial<SectionContextPacket> = {}): SectionContextPacket {
  return {
    version: 'SECTION_CONTEXT_V1',
    status: 'READY',
    section: { id: 'sec-pruebas', title: 'PRUEBAS', order: 3, role: 'evidence' },
    documentObjective: 'Redactar una contestación trazable.',
    sectionObjective: 'Relacionar documentos con hechos concretos.',
    requirements: ['Explicar el vínculo entre el contrato y el hecho 1.'],
    groundedIssueOutputs: [{
      taskId: 'task-1',
      legalIssueId: 'issue-1',
      status: 'ACCEPTED',
      coverageItemIds: ['cov-1'],
      sourceEntityIds: ['fixture-f-evidence-1'],
      authorityMentionIds: [],
      verifiedAuthorityIds: [],
      factualDevelopment: ['La relación inició en enero de 2024.'],
      evidentiaryDevelopment: ['El contrato mencionado se vincula con ese hecho.'],
      legalDevelopment: [],
      thesis: 'El contrato tiene relación con el hecho.',
      application: 'La constancia permite explicarlo.',
      conclusion: 'La prueba queda vinculada.',
    }],
    facts: [{ id: 'fixture-fact-1', proposition: 'La relación inició en enero de 2024.', assertionStatus: 'SOURCE_ASSERTION', participants: [], relatedDocumentIds: [], provenance: [] }],
    evidence: [{ id: 'fixture-f-evidence-1', kind: 'MENTION', description: 'Contrato laboral mencionado.', relatedFactIds: ['fixture-fact-1'], status: 'SOURCE_MENTIONED', provenance: [] }],
    verifiedAuthorities: [],
    research: [],
    clientPosition: undefined,
    previousSectionSummaries: [],
    blockers: [],
    sourceManifest: { accepted: { coverageItemIds: ['cov-1'], factIds: ['fixture-fact-1'], evidenceIds: ['fixture-f-evidence-1'], authorityIds: [], researchIssueIds: [], issueOutputTaskIds: ['task-1'] }, excluded: [], provenance: [] },
    limits: { maxContextCharacters: 24000, maxGroundedIssueOutputs: 25, maxFacts: 40, maxEvidence: 40, maxAuthorities: 25, maxResearch: 25 },
    diagnostics: [],
    contextHash: 'section-context-test-hash',
    ...overrides,
  };
}

function providerResponse(payload: unknown, overrides: Partial<AIProviderResult> = {}): AIProviderResult {
  return {
    provider: 'nvidia',
    providerRequested: 'nvidia',
    providerActuallyUsed: 'nvidia',
    model: 'meta/llama-3.2-11b-vision-instruct',
    success: true,
    content: JSON.stringify(payload),
    latencyMs: 1,
    origin: 'AI_GENERATED_LEGAL_CONTENT',
    isLegalAiContent: true,
    ...overrides,
  };
}

const readyPayload = {
  status: 'READY',
  text: 'La relación inició en enero de 2024. Contrato laboral mencionado. El contrato laboral mencionado se vincula con ese hecho.',
  usedCoverageItemIds: ['cov-1'],
  usedFactIds: ['fixture-fact-1'],
  usedEvidenceIds: ['fixture-f-evidence-1'],
  usedAuthorityIds: [],
  unresolvedRequirements: [],
};

describe('section-level generation', () => {
  it('makes one narrative provider request and returns a grounded SectionDraft', async () => {
    const invoke = vi.fn().mockResolvedValue(providerResponse(readyPayload));
    const result = await generateSectionDraft(packet(), { invokeProvider: invoke });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0].systemPrompt).toContain('ONE COMPLETE LEGAL SECTION');
    expect(invoke.mock.calls[0][0].systemPrompt).toContain('FINAL OUTPUT CONTRACT');
    expect(invoke.mock.calls[0][0].systemPrompt).toContain('usedCoverageItemIds');
    expect(invoke.mock.calls[0][0].userMessage).not.toContain('responde cada EvidenceMention');
    expect(invoke.mock.calls[0][0].userMessage).toContain('allowedPropositions');
    expect(invoke.mock.calls[0][0].userMessage).toContain('La relación inició en enero de 2024.');
    expect(invoke.mock.calls[0][0].userMessage).toContain('Contrato laboral mencionado.');
    expect(invoke.mock.calls[0][0].userMessage).not.toContain('sourceEntityIds');
    expect(invoke.mock.calls[0][0].userMessage).not.toContain('extractionMethod');
    expect(invoke.mock.calls[0][0].userMessage).not.toContain('confidence');
    expect(result.status).toBe('ACCEPTED');
    expect(result.readiness).toBe('READY');
    expect(result.text).toContain('contrato laboral');
    expect(result.coverageItemIds).toEqual(['cov-1']);
    expect(result.factIds).toEqual(['fixture-fact-1']);
    expect(result.evidenceIds).toEqual(['fixture-f-evidence-1']);
    expect(result.provider.calls).toBe(1);
  });

  it('rejects incomplete schema, generic prose, unknown IDs and metadata leaks closed', async () => {
    const incomplete = await generateSectionDraft(packet(), { invokeProvider: vi.fn().mockResolvedValue(providerResponse({ status: 'READY', text: 'incompleto' })) });
    expect(incomplete.status).toBe('REVIEW_REQUIRED');
    expect(incomplete.diagnostics).toContain('SECTION_OUTPUT_SCHEMA_INVALID');

    const generic = await generateSectionDraft(packet(), { invokeProvider: vi.fn().mockResolvedValue(providerResponse({ ...readyPayload, text: 'La evidencia resulta relevante para el caso y es pertinente para la controversia.', usedFactIds: [], usedEvidenceIds: [] })) });
    expect(generic.status).not.toBe('ACCEPTED');
    expect(generic.semanticEvaluation?.verdict).not.toBe('PASS');

    const unknown = await generateSectionDraft(packet(), { invokeProvider: vi.fn().mockResolvedValue(providerResponse({ ...readyPayload, usedFactIds: ['fact-invented'] })) });
    expect(unknown.status).toBe('REVIEW_REQUIRED');
    expect(unknown.diagnostics).toContain('UNKNOWN_FACT_ID');

    const unknownEvidence = await generateSectionDraft(packet(), { invokeProvider: vi.fn().mockResolvedValue(providerResponse({ ...readyPayload, usedEvidenceIds: ['evidence-invented'] })) });
    expect(unknownEvidence.status).toBe('REVIEW_REQUIRED');
    expect(unknownEvidence.diagnostics).toContain('UNKNOWN_EVIDENCE_ID');

    const unknownAuthority = await generateSectionDraft(packet(), { invokeProvider: vi.fn().mockResolvedValue(providerResponse({ ...readyPayload, usedAuthorityIds: ['authority-invented'] })) });
    expect(unknownAuthority.status).toBe('REVIEW_REQUIRED');
    expect(unknownAuthority.diagnostics).toContain('UNKNOWN_AUTHORITY_ID');

    const metadata = await generateSectionDraft(packet(), { invokeProvider: vi.fn().mockResolvedValue(providerResponse({ ...readyPayload, text: 'La prueba fue extraída por OCR con confidence 0.95 en el element 267.' })) });
    expect(metadata.status).toBe('REVIEW_REQUIRED');
    expect(metadata.diagnostics).toContain('SECTION_METADATA_LEAK');

    const extraProperty = await generateSectionDraft(packet(), { invokeProvider: vi.fn().mockResolvedValue(providerResponse({ ...readyPayload, unexpected: 'no permitido' })) });
    expect(extraProperty.status).toBe('REVIEW_REQUIRED');
    expect(extraProperty.diagnostics).toContain('SECTION_OUTPUT_SCHEMA_INVALID');

    const hardFail = await generateSectionDraft(packet(), { invokeProvider: vi.fn().mockResolvedValue(providerResponse({ ...readyPayload, text: 'La relación queda pendiente [DATO PENDIENTE: confirmar fecha].' })) });
    expect(hardFail.status).toBe('REVIEW_REQUIRED');
    expect(hardFail.diagnostics).toContain('SECTION_SEMANTIC_HARD_FAIL');
  });

  it('preserves timeout diagnostics and does not call provider for blocked packet', async () => {
    const trace = {
      recordTaskPlanned: vi.fn(),
      recordTaskExecution: vi.fn(),
    } as unknown as GenerationTraceContext;
    const timeout = await generateSectionDraft(packet(), { invokeProvider: vi.fn().mockRejectedValue(new Error('Timeout de prueba')), trace });
    expect(timeout.status).toBe('REVIEW_REQUIRED');
    expect(timeout.diagnostics).toContain('PROVIDER_ERROR');
    expect(timeout.diagnostics.join(' ')).not.toContain('Bearer');
    expect(trace.recordTaskPlanned).toHaveBeenCalledTimes(1);
    expect(trace.recordTaskExecution).toHaveBeenCalledTimes(1);

    const invoke = vi.fn();
    const blocked = await generateSectionDraft(packet({ status: 'BLOCKED', blockers: ['CONTEXT_OVERFLOW'] }), { invokeProvider: invoke });
    expect(invoke).not.toHaveBeenCalled();
    expect(blocked.status).toBe('BLOCKED');
    expect(blocked.diagnostics).toContain('CONTEXT_OVERFLOW');
  });

  it('plans the synthetic section task once and updates it on successful execution', async () => {
    const recordTaskExecution = vi.fn();
    const trace = {
      recordTaskPlanned: vi.fn(),
      recordTaskExecution,
      recordSemanticEvaluation: vi.fn(),
      recordDraftBlock: vi.fn(),
    } as unknown as GenerationTraceContext;
    const result = await generateSectionDraft(packet(), { invokeProvider: vi.fn().mockResolvedValue(providerResponse(readyPayload)), trace });

    expect(result.status).toBe('ACCEPTED');
    expect(trace.recordTaskPlanned).toHaveBeenCalledTimes(1);
    expect(trace.recordTaskExecution).toHaveBeenCalledTimes(1);
    expect(recordTaskExecution.mock.calls[0][0]).toMatchObject({
      taskId: 'section:sec-pruebas',
      coverageItemIds: ['cov-1'],
      factIds: ['fixture-fact-1'],
      evidenceIds: ['fixture-f-evidence-1'],
    });
  });

  it('rejects local fallback as NVIDIA section generation', async () => {
    const fallback = await generateSectionDraft(packet(), {
      invokeProvider: vi.fn().mockResolvedValue(providerResponse(readyPayload, {
        providerActuallyUsed: 'local',
        origin: 'LOCAL_PLACEHOLDER',
        isLegalAiContent: false,
      })),
    });
    expect(fallback.status).toBe('REVIEW_REQUIRED');
    expect(fallback.diagnostics).toContain('PROVIDER_FALLBACK_REJECTED');
  });

  it('rejects provider truncation before materialization', async () => {
    const truncated = await generateSectionDraft(packet(), {
      invokeProvider: vi.fn().mockResolvedValue(providerResponse(readyPayload, { isTruncated: true, finishReason: 'length' })),
    });
    expect(truncated.status).toBe('REVIEW_REQUIRED');
    expect(truncated.diagnostics).toContain('SECTION_OUTPUT_TRUNCATED');
    expect(truncated.text).toBe('');
  });

  it('rejects unsupported factual qualifiers even when every grounding ID is valid', async () => {
    const result = await generateSectionDraft(packet(), {
      invokeProvider: vi.fn().mockResolvedValue(providerResponse({
        ...readyPayload,
        text: 'La relación inició en enero de 2024, según consta en la demanda laboral. Contrato laboral mencionado.',
      })),
    });

    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.diagnostics).toContain('SECTION_CLAIM_GROUNDING_FAILED');
    expect(result.diagnostics.join(' ')).toContain('UNSUPPORTED_INFERENCE');
  });

  it('detects generic filler by source overlap instead of a phrase blacklist', async () => {
    const result = await generateSectionDraft(packet(), {
      invokeProvider: vi.fn().mockResolvedValue(providerResponse({
        ...readyPayload,
        text: 'La prueba presentada resulta relevante para el caso.',
      })),
    });

    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.diagnostics).toContain('SECTION_CLAIM_GROUNDING_FAILED');
    expect(result.diagnostics.join(' ')).toContain('GENERIC_FILLER');
  });

  it('accepts a source-bounded evidentiary section without demanding a normative citation', async () => {
    const result = await generateSectionDraft(packet(), {
      invokeProvider: vi.fn().mockResolvedValue(providerResponse({
        ...readyPayload,
        text: 'La relación inició en enero de 2024. Contrato laboral mencionado. El contrato laboral mencionado se vincula con ese hecho.',
      })),
    });

    expect(result.status).toBe('ACCEPTED');
    expect(result.semanticEvaluation?.verdict).toBe('PASS');
    expect(result.semanticEvaluation?.deficiencies.join(' ')).not.toContain('Ausencia de invocación de preceptos normativos');
  });

  it('keeps an argumentative section under review when its required normative support is absent', async () => {
    const argumentativePacket = packet({
      section: { id: 'sec-agravios', title: 'AGRAVIOS', order: 3, role: 'argument' },
      sectionObjective: 'Desarrollar el agravio con soporte normativo.',
    });
    const result = await generateSectionDraft(argumentativePacket, {
      invokeProvider: vi.fn().mockResolvedValue(providerResponse({
        ...readyPayload,
        text: 'La relación inició en enero de 2024. Contrato laboral mencionado. El contrato laboral mencionado se vincula con ese hecho.',
      })),
    });

    expect(result.status).not.toBe('ACCEPTED');
    expect(result.semanticEvaluation?.deficiencies.join(' ')).toContain('Ausencia de invocación de preceptos normativos');
  });

  it('does not let packet-wide sources ground claims omitted from used IDs', async () => {
    const result = await generateSectionDraft(packet(), {
      invokeProvider: vi.fn().mockResolvedValue(providerResponse({
        ...readyPayload,
        text: 'La relación inició en enero de 2024.',
        usedFactIds: [],
        usedEvidenceIds: [],
      })),
    });

    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.diagnostics).toContain('SECTION_CLAIM_GROUNDING_FAILED');
  });

  it('rejects a novel qualifier hidden inside a high-overlap paraphrase', async () => {
    const result = await generateSectionDraft(packet(), {
      invokeProvider: vi.fn().mockResolvedValue(providerResponse({
        ...readyPayload,
        text: 'Contrato laboral vigente.',
        usedFactIds: [],
      })),
    });

    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.diagnostics.join(' ')).toContain('UNSUPPORTED_INFERENCE');
  });

  it('does not combine unrelated source tokens into a new proposition', async () => {
    const result = await generateSectionDraft(packet(), {
      invokeProvider: vi.fn().mockResolvedValue(providerResponse({
        ...readyPayload,
        text: 'La relación inició contrato laboral.',
      })),
    });

    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.diagnostics.join(' ')).toContain('SECTION_CLAIM_GROUNDING_FAILED');
  });

  it('rejects a dominant-source claim completed with tokens from another source', async () => {
    const result = await generateSectionDraft(packet({
      groundedIssueOutputs: [],
      facts: [{
        id: 'fact-dominant',
        proposition: 'La relación jurídica inició en enero de 2024 y consta en el expediente laboral.',
        assertionStatus: 'SOURCE_ASSERTION',
        participants: [],
        relatedDocumentIds: [],
        provenance: [],
      }],
      evidence: [{
        id: 'evidence-completing',
        kind: 'MENTION',
        description: 'Contrato laboral mencionado.',
        relatedFactIds: [],
        status: 'SOURCE_MENTIONED',
        provenance: [],
      }],
      sourceManifest: {
        accepted: {
          coverageItemIds: ['cov-1'],
          factIds: ['fact-dominant'],
          evidenceIds: ['evidence-completing'],
          authorityIds: [],
          researchIssueIds: [],
          issueOutputTaskIds: [],
        },
        excluded: [],
        provenance: [],
      },
    }), {
      invokeProvider: vi.fn().mockResolvedValue(providerResponse({
        ...readyPayload,
        text: 'La relación jurídica inició en enero de 2024 y consta contrato laboral.',
        usedFactIds: ['fact-dominant'],
        usedEvidenceIds: ['evidence-completing'],
      })),
    });

    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.diagnostics.join(' ')).toContain('SECTION_CLAIM_GROUNDING_FAILED');
  });

  it('rejects polarity changes and subject-object inversion as paraphrase', async () => {
    const base = packet({
      groundedIssueOutputs: [],
      facts: [{
        id: 'fact-polarity',
        proposition: 'La autoridad negó la solicitud.',
        assertionStatus: 'SOURCE_ASSERTION',
        participants: [],
        relatedDocumentIds: [],
        provenance: [],
      }],
      evidence: [{
        id: 'evidence-polarity',
        kind: 'MENTION',
        description: 'Solicitud documental mencionada.',
        relatedFactIds: ['fact-polarity'],
        status: 'SOURCE_MENTIONED',
        provenance: [],
      }],
      sourceManifest: {
        accepted: {
          coverageItemIds: ['cov-1'],
          factIds: ['fact-polarity'],
          evidenceIds: ['evidence-polarity'],
          authorityIds: [],
          researchIssueIds: [],
          issueOutputTaskIds: [],
        },
        excluded: [],
        provenance: [],
      },
    });
    for (const text of ['La autoridad no negó la solicitud.', 'La solicitud negó la autoridad.']) {
      const result = await generateSectionDraft(base, {
        invokeProvider: vi.fn().mockResolvedValue(providerResponse({
          ...readyPayload,
          text,
          usedFactIds: ['fact-polarity'],
          usedEvidenceIds: ['evidence-polarity'],
        })),
      });
      expect(result.status).toBe('REVIEW_REQUIRED');
      expect(result.diagnostics.join(' ')).toContain('SECTION_CLAIM_GROUNDING_FAILED');
    }
  });

  it('treats background sections as fact responses without requiring a norm', async () => {
    const recordTaskExecution = vi.fn();
    const result = await generateSectionDraft(packet({
      section: { id: 'sec-antecedentes', title: 'ANTECEDENTES', order: 1, role: 'background' },
      groundedIssueOutputs: [],
      evidence: [],
    }), {
      invokeProvider: vi.fn().mockResolvedValue(providerResponse({
        ...readyPayload,
        text: 'La relación inició en enero de 2024.',
        usedEvidenceIds: [],
      })),
      trace: {
        recordTaskPlanned: vi.fn(),
        recordTaskExecution,
        recordSemanticEvaluation: vi.fn(),
        recordDraftBlock: vi.fn(),
      } as never,
    });

    expect(recordTaskExecution.mock.calls[0][0]).toMatchObject({ taskType: 'FACT_RESPONSE' });
    expect(result.semanticEvaluation?.deficiencies.join(' ')).not.toContain('Ausencia de invocación de preceptos normativos');
  });

  it('treats legal_grounds as argumentative and does not accept a generic mention of ley as normative support', async () => {
    const result = await generateSectionDraft(packet({
      section: { id: 'sec-agravios', title: 'AGRAVIOS', order: 3, role: 'legal_grounds' },
    }), {
      invokeProvider: vi.fn().mockResolvedValue(providerResponse({
        ...readyPayload,
        text: 'La relación inició en enero de 2024. Contrato laboral mencionado. El contrato laboral mencionado se vincula con ese hecho conforme a la ley.',
      })),
    });

    expect(result.status).not.toBe('ACCEPTED');
    expect(result.semanticEvaluation?.deficiencies.join(' ')).toContain('Ausencia de invocación de preceptos normativos');
  });

  it('does not reauthorize VALID_NON_FINAL issue prose as a primary source', async () => {
    const base = packet();
    const result = await generateSectionDraft(packet({
      groundedIssueOutputs: [{ ...base.groundedIssueOutputs[0], status: 'VALID_NON_FINAL' }],
    }), {
      invokeProvider: vi.fn().mockResolvedValue(providerResponse({
        ...readyPayload,
        text: 'La constancia permite explicarlo.',
        usedFactIds: [],
        usedEvidenceIds: [],
      })),
    });

    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.diagnostics).toContain('SECTION_CLAIM_GROUNDING_FAILED');
  });

  it('attributes the materialized block to the synthetic section task while preserving upstream dependencies', async () => {
    const draft = await generateSectionDraft(packet(), { invokeProvider: vi.fn().mockResolvedValue(providerResponse(readyPayload)) });
    const block = sectionDraftToContentBlock(draft);

    expect(block.generationTaskId).toBe('section:sec-pruebas');
    expect(block.generationTaskIds).toEqual(expect.arrayContaining(['section:sec-pruebas', 'task-1']));
  });
});
