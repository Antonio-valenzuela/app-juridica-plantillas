import { it, expect } from 'vitest';
import { controlledSource, controlledDocument } from '../fixtures/controlledLegalQuality';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { buildDocumentPlan } from '@/lib/legal-engine/documentPlan';
import { getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import { buildDraftingPlan } from '@/lib/legal-engine/pipeline';
import { buildGenerationTasksForSection } from '@/lib/legal-engine/generationTasks';
import { buildIssueContextPack, buildIssuePrompt } from '@/lib/legal-engine/issueScopedGeneration';
import { validateLegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import { instructions } from '../fixtures/draftingInstructions';
import { loadActiveManual } from '@/lib/operational-manual/store';
import { retrieveManualRules, type ManualMatter } from '@/lib/operational-manual/core';
import { mkdir, writeFile } from 'node:fs/promises';

for (const matter of ['contestacion','apelacion','amparo','penal'] as const) it(`${matter}: canonical structured input reaches plan, task and actual provider serializer`, async () => {
  const source = controlledSource(matter);
  const analysis = reconstructCaseAnalysis([source],instructions[matter]);
  const doc = controlledDocument(matter);
  const plan = buildDocumentPlan({doc,template:getDocumentTemplate(doc.documentType)!,caseAnalysis:analysis});
  doc.sections = plan.sections; doc.coverageMatrix = plan.coverageMatrix; doc.legalIssueMatrix = plan.legalIssueMatrix;
  const drafting = buildDraftingPlan(doc,source.extractedText!.length,analysis);
  const tasks = drafting.sections.flatMap(s => buildGenerationTasksForSection(s,doc,analysis,doc.coverageMatrix));
  const relevant = tasks.filter(t => t.legalDraftingContract);
  expect(relevant.length).toBeGreaterThan(0);
  expect(validateLegalIssueMatrix(doc.legalIssueMatrix!,doc.coverageMatrix!,analysis).errors).not.toContain(expect.stringContaining('INVALID_REVIEW_ONLY_ISSUE'));
  if (matter === 'contestacion') {
    expect(relevant.filter(t => t.taskType === 'FACT_RESPONSE')).toHaveLength(4);
    expect(relevant.filter(t => t.taskType === 'CLAIM')).toHaveLength(2);
  } else {
    const reviewTasks = relevant.filter(t => t.legalDraftingContract && 'decisionId' in t.legalDraftingContract);
    expect(reviewTasks).toHaveLength(1);
    expect(reviewTasks[0].coverageItemIds).toEqual([]);
    expect(doc.legalIssueMatrix!.issues.find(i => i.id === reviewTasks[0].targetIssueId)?.status).toBe('NEEDS_RESEARCH');
  }
  const manual = await loadActiveManual();
  expect(manual).toBeDefined();
  const serialized = [];
  for (const task of relevant) {
    const pack = buildIssueContextPack(task,doc,analysis,doc.legalIssueMatrix!);
    const selection = retrieveManualRules(manual!,{
      matter:(matter === 'contestacion' || matter === 'apelacion' ? 'CIVIL' : matter.toUpperCase()) as ManualMatter,
      caseType:doc.documentType, stage:task.sectionTitle,
      task:`${task.title || ''} ${task.objective || ''} ${pack.legalIssue.question}`, budgetChars:4500,
      measureContext:rules => JSON.stringify({operationalManual:{manualVersion:manual!.manifest.version,manualHash:manual!.manifest.sourceHash,
        rules:rules.map(r => ({id:r.stableRuleId,physicalPage:r.physicalPage,originalText:r.originalText}))}}).length,
    });
    const operationalManual = {manualVersion:manual!.manifest.version,manualHash:manual!.manifest.sourceHash,
      rules:selection.selected.map(r => ({id:r.stableRuleId,physicalPage:r.physicalPage,originalText:r.originalText}))};
    expect(JSON.stringify({operationalManual}).length).toBeLessThanOrEqual(4500);
    const prompt = buildIssuePrompt({...pack,operationalManual},task);
    expect((pack as any).legalDraftingContract).toEqual(task.legalDraftingContract);
    expect(prompt.userMessage).toContain(JSON.stringify(task.legalDraftingContract));
    expect(prompt.systemPrompt).toContain('DO NOT FILL MISSING DATA');
    expect(prompt.systemPrompt).toContain('DO NOT CONVERT MISSING INTO A FACT');
    expect(prompt.systemPrompt).toContain('DO NOT CREATE UNVERIFIED AUTHORITIES');
    serialized.push({task, baseContextPack:pack, manualRules:selection.selected,
      research:pack.verifiedResearch || {status:'NOT_VERIFIED',authorities:[]},
      manualContextCharacters:JSON.stringify({operationalManual}).length,
      systemPrompt:prompt.systemPrompt,userMessage:prompt.userMessage,
      scope:'PROSPECTIVE_OFFLINE_SERIALIZATION_NOT_SENT',
      hashLimit:'baseContextPack.contextHash is the canonical pre-manual hash; no provider execution hash is claimed'});
  }
  const directory = `audit/final-pre-windows-readiness/legal-propagation/cases/${matter}`;
  await mkdir(directory,{recursive:true});
  await writeFile(`${directory}/provider-context.json`,JSON.stringify(serialized,null,2));
});
