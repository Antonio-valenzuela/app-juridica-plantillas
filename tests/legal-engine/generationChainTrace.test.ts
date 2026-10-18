import { describe, expect, it } from 'vitest';
import { buildGenerationChainTrace } from '../../scripts/audit/trace-generation-chain';

describe('offline generation-chain trace', () => {
  it('follows a real-shaped issue through a valid non-final block without treating client-position review as coverage', () => {
    const issueId = 'issue-ed36549daf772bab';
    const taskId = 'task-fact-sec-con-hechos-fact-1';
    const factId = 'fact-1';
    const coverageId = 'cov-fact-response-fact-1';
    const blockId = 'blk-task-fact-sec-con-hechos-fact-1';
    const document = {
      id: 'run-document',
      sourceDocuments: [{ id: 'source-case-01', filename: 'case.pdf' }],
      caseAnalysis: {
        facts: [{ id: factId, provenance: [{ sourceId: 'source-case-01' }] }],
        claims: [],
        evidence: [],
      },
      legalIssueMatrix: {
        issues: [{ id: issueId, factIds: [factId], claimIds: [], evidenceMentionIds: [], coverageItemIds: [coverageId] }],
      },
      coverageMatrix: {
        items: [{ id: coverageId, status: 'needs_client_position', statusReason: 'CLIENT_POSITION_UNKNOWN' }],
      },
      sections: [{
        id: 'sec-con-hechos',
        content: [{
          id: blockId,
          generationTaskId: taskId,
          legalIssueIds: [issueId],
          factIds: [factId],
          coverageItemIds: [coverageId],
          issueDraftValidationStatus: 'VALID_NON_FINAL',
          text: 'Se formula una respuesta provisional para revisión del abogado.',
        }],
      }],
      generationMetadata: { factualClaims: [] },
      documentAssemblyResult: { orderedBlocks: [{ id: blockId, sectionId: 'sec-con-hechos' }] },
    };
    const trace = {
      generationId: 'final-validation-01-EXTENSIVE_40-2026-09-29T04-05-34',
      sourceIds: ['source-case-01'],
      generationTasks: [{
        taskId,
        legalIssueIds: [issueId],
        factIds: [factId],
        claimIds: [],
        evidenceIds: [],
        coverageItemIds: [coverageId],
        responseStatus: 'VALID_NON_FINAL',
        providerActuallyUsed: 'groq',
        finalBlockId: blockId,
      }],
      taskExecutions: [],
      issueGenerationAttempts: [{
        legalIssueId: issueId,
        taskId,
        providerActuallyUsed: 'groq',
        outcome: 'PROVIDER_SUCCESS',
        validationStatus: 'VALID_NON_FINAL',
        resultHash: 'issue-draft-real-shaped-hash',
      }],
      semanticEvaluations: [],
      draftBlocks: [{ id: blockId, generationTaskId: taskId, coverageItemIds: [coverageId], sectionId: 'sec-con-hechos' }],
      wordAccounting: [],
      documentAssembly: { orderedBlockIds: [blockId], excludedDraftBlockIds: [] },
    };

    const result = buildGenerationChainTrace(document, trace);
    const row = result.issues.find((candidate: Record<string, unknown>) => candidate.issueId === issueId);

    expect(row).toMatchObject({
      issueId,
      taskIds: [taskId],
      sourceDocumentIds: ['source-case-01'],
      factIds: { task: [factId], finalBlock: [factId] },
      validationStatuses: ['VALID_NON_FINAL'],
      materialized: true,
      materializedBlockIds: [blockId],
      assembled: true,
      coverage: [{ coverageId, status: 'needs_client_position', reasonCode: 'CLIENT_POSITION_UNKNOWN' }],
      lossStage: 'coverage',
    });
    expect(row?.providerResponses[0]).toMatchObject({
      provider: 'groq',
      responseHash: 'issue-draft-real-shaped-hash',
      storedRawText: false,
    });
  });

  it('does not attribute an expansion to an issue when its linked IDs do not intersect', () => {
    const result = buildGenerationChainTrace({
      id: 'doc', sourceDocuments: [], caseAnalysis: { facts: [], claims: [], evidence: [] },
      legalIssueMatrix: { issues: [{ id: 'issue-a', factIds: ['fact-a'], claimIds: [], evidenceMentionIds: [], coverageItemIds: ['cov-a'] }] },
      coverageMatrix: { items: [] }, sections: [], generationMetadata: { factualClaims: [] },
      documentAssemblyResult: { orderedBlocks: [] },
    }, {
      generationId: 'run', sourceIds: [], generationTasks: [], taskExecutions: [], issueGenerationAttempts: [],
      semanticEvaluations: [], draftBlocks: [{ id: 'expansion-b', factIds: ['fact-b'], coverageItemIds: ['cov-b'] }],
      wordAccounting: [], documentAssembly: { orderedBlockIds: [], excludedDraftBlockIds: [] },
    });

    expect(result.issues[0]?.materializedBlockIds).toEqual([]);
    expect(result.issues[0]?.lossStage).toBe('NO_ATRIBUIBLE');
  });
});
