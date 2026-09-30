import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { makeFixtureDocument, makeFixtureFCaseAnalysis } from '../fixtures/richCoverageFixtures';
import { buildCoverageMatrix } from '../../lib/legal-engine/coverageMatrix';
import { buildLegalIssueMatrix } from '../../lib/legal-engine/legalIssueMatrix';
import { createGenerationTraceContext } from '../../lib/legal-engine/generationTrace';
import { executeIssueScopedGeneration } from '../../lib/legal-engine/issueScopedGeneration';
import { auditOperationalManual, type ManualIndex } from '../../lib/operational-manual/core';
import { runQualityGateCheck } from '../../lib/legal-engine/qualityGate';
import type { GenerationTask } from '../../lib/legal-engine/generationTasks';

const manual = JSON.parse(readFileSync('data/documents/operational-manual/v1.0/index.json', 'utf8')) as ManualIndex;
describe('manual rules cannot become case evidence across a real task boundary', () => {
  it.each(['CIVIL', 'PENAL', 'AMPARO'])('%s rejects a manual rule ID as sourceEntityId', async (matter) => {
    const analysis = makeFixtureFCaseAnalysis();
    const doc = makeFixtureDocument();
    doc.matter = matter;
    doc.coverageMatrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: doc.coverageMatrix });
    // This controlled fixture exercises transport/allowlists, not legal readiness.
    const issue = { ...matrix.issues[0], status: 'READY_FOR_GENERATION' as const,
      relationStatus: 'EXPLICIT' as const, conflictIds: [],
      clientPositionStatus: 'NOT_REQUIRED' as const, researchStatus: 'NOT_REQUIRED' as const, blocking: false };
    doc.legalIssueMatrix = { ...matrix, issues: [issue, ...matrix.issues.slice(1)] };
    const task: GenerationTask = { id: `manual-task-${matter}`, sectionId: doc.sections[0].id,
      sectionTitle: 'ARGUMENTOS', taskType: 'ISSUE', complexity: 'DEEP', tokenBudget: 3600, status: 'pending',
      legalIssueIds: [issue.id], coverageItemIds: issue.coverageItemIds, factIds: issue.factIds,
      evidenceIds: [...issue.evidenceMentionIds, ...issue.evidenceOfferIds], authorityIds: issue.authorityMentionIds };
    const trace = createGenerationTraceContext({ doc, options: { enabled: true } });
    const before = JSON.stringify(doc.coverageMatrix);
    let contextCharacters = 0;
    let calls = 0;
    const result = await executeIssueScopedGeneration(task, doc, analysis, {
      trace, operationalManualIndex: manual,
      invokeProvider: async request => {
        calls++;
        const pack = request.legalContext as { operationalManual?: { rules: Array<{ id: string }> } };
        expect(pack.operationalManual?.rules.length).toBeGreaterThan(0);
        contextCharacters = JSON.stringify({ operationalManual: pack.operationalManual }).length;
        expect(contextCharacters).toBeLessThanOrEqual(4500);
        return { success: true, content: '', latencyMs: 0, provider: 'nvidia', providerActuallyUsed: 'nvidia', model: 'offline-test-only',
          structuredOutput: { thesis: 'Respuesta sintética', factualDevelopment: ['Texto sintético'],
            evidentiaryDevelopment: [], legalDevelopment: [], application: 'Aplicación provisional', conclusion: 'Pendiente',
            sourceEntityIds: [pack.operationalManual!.rules[0].id], authorityMentionIds: [], unresolvedRequirements: [] } };
      },
    });
    expect(calls).toBeGreaterThan(0);
    expect(result.status).toBe('FAILED');
    expect(result.block).toBeUndefined();
    expect(JSON.stringify(doc.coverageMatrix)).toBe(before);
    const audit = auditOperationalManual(manual, 'Artículo pendiente de verificación oficial.', { matter: matter as 'CIVIL' | 'PENAL' | 'AMPARO' });
    trace.trace.operationalManual!.auditFindings = audit;
    trace.trace.operationalManual!.auditRuleIds = audit.map(f => f.ruleId);
    const gate = runQualityGateCheck(doc);
    expect(gate.canMarkAsFinal).toBe(false);
    writeFileSync(`audit/operational-manual-verification-2026-09-29/task-boundary-${matter}.json`, JSON.stringify({
      matter, taskId: task.id, calls, contextCharacters, result, audit, gate, trace: trace.close(),
      coverageUnchanged: before === JSON.stringify(doc.coverageMatrix),
    }, null, 2));
  });
});
