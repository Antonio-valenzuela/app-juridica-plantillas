import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { auditLegalArgumentStructure } from '../../lib/legal-engine/legalArgumentContract';
import { buildFactResponseMatrix } from '../../lib/legal-engine/legalDocumentPlan';
import type { UniversalLegalDocument } from '../../lib/legal-engine/types';

const root = 'audit/final-pre-windows-readiness';
const ids = ['contestacion', 'apelacion', 'amparo', 'penal'];
const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const results = [];
for (const id of ids) {
  const directory = `${root}/controlled-cases/${id}`;
  const journey = await read(`${directory}/journey.json`);
  const before = await read(`${root}/legal-quality-causal/before-cases/${id}/journey.json`);
  const doc: UniversalLegalDocument = await read(`${directory}/produced-document.json`);
  const trace = doc.generationMetadata.auditTrace!;
  const analysis = doc.caseAnalysis!;
  const sourceUnchanged = hash(journey.SOURCE.extractedText) === hash(before.SOURCE.extractedText);
  if (!sourceUnchanged) throw new Error(`CONTROLLED_SOURCE_CHANGED:${id}`);
  const findings = auditLegalArgumentStructure(doc);
  const text = doc.sections.flatMap(s => s.content.map(b => b.text)).join('\n');
  const coverageItems = doc.coverageMatrix?.items || [];
  const coverageStates: Record<string, number> = {};
  for (const item of coverageItems) coverageStates[item.status] = (coverageStates[item.status] || 0) + 1;
  const manual = doc.generationMetadata.operationalManual;
  const requiredSections = new Set(trace.documentPlanSnapshot?.sections.filter(s => s.required).map(s => s.id));
  const structuralOmissions = doc.sections.filter(s => requiredSections.has(s.id) && !s.content.some(b => b.text.trim())).map(s => ({ sectionId: s.id, title: s.title }));
  const output = {
    case: id, classification: journey.classification, generationId: trace.generationId,
    sourceId: journey.SOURCE.id, sourceHash: hash(journey.SOURCE.extractedText), sourceUnchanged,
    before: { facts: before.CASE_ANALYSIS.facts.length, claims: before.CASE_ANALYSIS.claims.length, decisions: before.CASE_ANALYSIS.challengedReasonings?.length || 0, tasks: before.GENERATION_TASKS?.length || 0, sections: before.sections.length },
    after: { facts: analysis.facts.length, claims: analysis.claims.length, decisions: analysis.challengedReasonings?.length || 0, richDecisions: analysis.richCaseAnalysis?.decisionReasonings?.length || 0, tasks: trace.generationTasks.length, sections: doc.sections.length },
    CASE_ANALYSIS: analysis, DOCUMENT_PLAN: trace.documentPlanSnapshot, GENERATION_TASKS: trace.generationTasks,
    FACT_RESPONSE_MATRIX_ANALYSIS_ONLY: id === 'contestacion' ? buildFactResponseMatrix(analysis.facts) : undefined,
    matrixLimit: 'Controlled journeys omit draftDepth; this derived matrix documents analysis only and is not claimed as materialized production metadata.',
    MANUAL_RULES: { manualVersion: manual?.manualVersion, ruleCount: manual?.selectedRuleIds.length || 0, selectedRuleIds: manual?.selectedRuleIds, physicalPages: manual?.selectedPages, retrievals: manual?.retrievals, auditFindings: manual?.auditFindings },
    SOURCE_VERIFICATION_STATUS: { FOUND: analysis.richCaseAnalysis?.authorities?.length || 0, VERIFIED: analysis.verifiedAuthorities?.length || 0, APPLICABLE: 'NOT_ESTABLISHED', CURRENT: 'NOT_ESTABLISHED', limit: 'No official source verification was performed offline; manual retrieval is not verification.' },
    PROVIDER_EXECUTIONS: trace.taskExecutions.map(t => ({ taskId: t.taskId, sectionId: t.sectionId, factIds: t.factIds, claimIds: t.claimIds, evidenceIds: t.evidenceIds, provider: t.providerActuallyUsed, status: t.responseStatus, reason: t.fallbackReason, blockId: t.finalBlockId })),
    VALIDATOR_FINDINGS: doc.validation.errors, argumentFindings: findings, structuralOmissions,
    STRUCTURAL_QUALITY: 'FAIL_NOT_CERTIFIED', COVERAGE: { items: coverageItems, states: coverageStates, reportedSummary: doc.coverageMatrix?.summary },
    QUALITY_GATE: trace.qualityGateResult, DOCUMENT_STATUS: { status: doc.status, readiness: journey.FINAL_STATUS.readiness },
    words: text.split(/\s+/).filter(Boolean).length, syntheticPenalPhrasePresent: /delito de imputado/i.test(text),
    exports: journey.exports,
    DOCX: journey.exports?.docx?.status === 'EXPORTED_DRAFT' ? `${directory}/produced-draft.docx` : 'BLOCKED_NO_CURRENT_ARTIFACT',
    PDF: journey.exports?.pdf?.status === 'EXPORTED_DRAFT' ? `${directory}/produced-draft.pdf` : 'BLOCKED_NO_CURRENT_ARTIFACT',
  };
  results.push(output);
  await writeFile(`${directory}/legal-quality-evidence.json`, JSON.stringify(output, null, 2));
}
await writeFile(`${root}/legal-quality-causal/comparison.json`, JSON.stringify(results, null, 2));
const table = ['| Materia | Hechos antes/después | Decisiones antes/después | Tasks | Reglas | Palabras | Estructura | Gate |', '|---|---:|---:|---:|---:|---:|---|---|', ...results.map(r => `| ${r.case} | ${r.before.facts}/${r.after.facts} | ${r.before.decisions}/${r.after.decisions} | ${r.after.tasks} | ${r.MANUAL_RULES.ruleCount} | ${r.words} | ${r.STRUCTURAL_QUALITY} | ${r.QUALITY_GATE?.passed} |`)];
await writeFile(`${root}/legal-quality-causal/comparison.md`, table.join('\n') + '\n');
console.log(JSON.stringify(results.map(r => ({ case: r.case, before: r.before, after: r.after, rules: r.MANUAL_RULES.ruleCount, words: r.words, coverage: r.COVERAGE.states, findings: r.VALIDATOR_FINDINGS.length, gate: r.QUALITY_GATE?.passed, status: r.DOCUMENT_STATUS, exports: r.exports })), null, 2));
