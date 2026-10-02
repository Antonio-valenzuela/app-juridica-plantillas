import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = 'audit/final-pre-windows-readiness/legal-propagation';
const read = async path => JSON.parse(await readFile(path,'utf8'));
const summary = [];
for (const matter of ['contestacion','apelacion','amparo','penal']) {
  const evidence = await read(`${root}/cases/${matter}/evidence.json`);
  const doc = await read(`${root}/cases/${matter}/produced-document.json`);
  const trace = doc.generationMetadata.auditTrace;
  const projection = evidence.CanonicalAnalysis;
  const coverageStates = {};
  for (const item of doc.coverageMatrix.items) coverageStates[item.status] = (coverageStates[item.status] || 0) + 1;
  const providers = await read(`${root}/cases/${matter}/provider-context.json`);
  const result = {
    matter, sourceHash:evidence.sourceSHA256, beforeTasks:evidence.beforeTasks,
    CaseAnalysis:evidence.CaseAnalysis,
    CanonicalAnalysis:{facts:projection.factResponses.length,claims:projection.claimResponses.length,challenges:projection.challenges.length},
    LegalIssues:doc.legalIssueMatrix.issues.length,
    reviewIssues:doc.legalIssueMatrix.issues.filter(i => i.planningOnly).map(i => ({id:i.id,decision:i.legalDraftingContract.decisionId,coverageIds:i.coverageItemIds,status:i.status,reason:i.statusReason})),
    DocumentPlan:doc.sections.length, GenerationTasks:evidence.taskCount, blockedTasks:evidence.blockedTasks,
    taskStatuses:trace.generationTasks.map(t => ({id:t.taskId,status:t.responseStatus,sectionId:t.sectionId})),
    manual:{version:evidence.manualRules.manualVersion,rules:evidence.manualRules.selectedRuleIds.length},
    providerContext:{contexts:providers.length,manualMaxChars:Math.max(...providers.map(p => p.manualContextCharacters)),scope:'OFFLINE_NOT_SENT'},
    research:evidence.research, validatorFindings:evidence.validatorFindings,
    argumentFindings:evidence.argumentFindings, materializedSections:evidence.materializedSections.map(s => ({id:s.id,title:s.title,blocks:s.blocks})),
    QualityStructure:evidence.QualityStructure, structureErrors:evidence.structureErrors,
    Coverage:coverageStates, QualityGate:evidence.QualityGate.passed, Status:evidence.Status,
    missing:projection.challenges.map(c => ({id:c.id,missing:c.missingData})),
    unresolvedPositions:projection.factResponses.filter(f => !f.clientPosition).map(f => f.sourceFactId),
    unresolvedClaims:projection.claimResponses.filter(c => !c.position).map(c => c.claimId),
  };
  summary.push(result);
}
const beforeHashes = await read(`${root}/before-hashes.json`);
const hashes = [];
for (const before of beforeHashes) {
  const actual = createHash('sha256').update(await readFile(before.Path)).digest('hex').toUpperCase();
  hashes.push({path:before.Path,before:before.Hash,after:actual,unchanged:actual === before.Hash});
}
await writeFile(`${root}/after-hashes.json`,JSON.stringify(hashes,null,2));
if (hashes.some(h => !h.unchanged)) throw new Error('FROZEN_BOUNDARY_CHANGED');
await writeFile(`${root}/comparison.json`,JSON.stringify(summary,null,2));
const md = ['| Materia | Case facts/claims/decisions | Canonical facts/claims/challenges | Issues | Plan | Tasks antes → después | Blocked | Manual | Research | Structure | Gate | Status |',
  '|---|---|---|---:|---:|---:|---:|---|---|---|---|---|',
  ...summary.map(r => `| ${r.matter} | ${r.CaseAnalysis.facts}/${r.CaseAnalysis.claims}/${r.CaseAnalysis.decisions} | ${r.CanonicalAnalysis.facts}/${r.CanonicalAnalysis.claims}/${r.CanonicalAnalysis.challenges} | ${r.LegalIssues} | ${r.DocumentPlan} | ${r.beforeTasks} → ${r.GenerationTasks} | ${r.blockedTasks} | v${r.manual.version}, ${r.manual.rules} | VERIFIED=0 | ${r.QualityStructure} | ${r.QualityGate} | ${r.Status} |`),
  '', 'Hash boundaries: all unchanged. Offline prospective context serialization is not evidence of a live LLM call.'];
await writeFile(`${root}/comparison.md`,md.join('\n')+'\n');
console.log(JSON.stringify(summary.map(r => ({matter:r.matter,tasks:r.GenerationTasks,blocked:r.blockedTasks,structure:r.QualityStructure,gate:r.QualityGate,status:r.Status,coverage:r.Coverage,findings:r.argumentFindings.map(f => f.code)})),null,2));
