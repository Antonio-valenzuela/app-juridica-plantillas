import { it, expect } from 'vitest';
import { controlledSource } from '../fixtures/controlledLegalQuality';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { instructions } from '../fixtures/draftingInstructions';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { auditLegalArgumentStructure } from '@/lib/legal-engine/legalArgumentContract';

for (const matter of ['contestacion','apelacion','amparo','penal'] as const) it(`${matter}: controlled materialization retains individual structures without releasing FINAL`, async () => {
  const source = controlledSource(matter);
  const analysis = reconstructCaseAnalysis([source],instructions[matter]);
  const types = {contestacion:'contestacion_demanda_civil',apelacion:'apelacion_civil',amparo:'demanda_amparo_indirecto',penal:'apelacion_penal'};
  const doc = await runGenerationPipeline({selectedDocumentType:types[matter],matter:matter === 'contestacion' || matter === 'apelacion' ? 'civil' : matter,
    sourceDocuments:[source],userInstruction:instructions[matter],flow:'DOCUMENT_ANALYSIS',externalProviderOptIn:false,
    workflow:{flow:'DOCUMENT_ANALYSIS',analysis,selection:{mode:'automatic'},sourceDocuments:[source],updatedAt:new Date().toISOString()},
    // Fail immediately if an external invocation leaks into these offline tests.
    issueProviderInvoker:async () => { throw new Error('EXTERNAL_PROVIDER_FORBIDDEN'); },
    traceOptions:{enabled:true}});
  const root = 'audit/final-pre-windows-readiness/legal-propagation';
  const before = JSON.parse(await readFile(`${root}/before-cases/${matter}/journey.json`,'utf8'));
  expect(source.extractedText).toBe(before.SOURCE.extractedText);
  const directory = `${root}/cases/${matter}`;
  await mkdir(directory,{recursive:true});
  const text = doc.sections.map(s => `${s.title}\n${s.content.map(b => b.text).join('\n')}`).join('\n\n');
  const trace = doc.generationMetadata.auditTrace!;
  const projection = doc.caseAnalysis!.richCaseAnalysis!.draftingProjection!;
  const structureErrors:string[] = [];
  if (matter === 'apelacion') {
    for (const section of doc.sections.filter(s => /agravio/i.test(s.title))) {
      if (!section.content.some(b => b.text.trim())) structureErrors.push(`EMPTY_GRIEVANCE_SECTION:${section.id}`);
    }
  }
  if (matter === 'contestacion') {
    expect(doc.sections.find(s => /contestaci.*hechos/i.test(s.title))?.content).toHaveLength(4);
    expect(doc.sections.find(s => /contestaci.*prestaciones/i.test(s.title))?.content).toHaveLength(2);
    for (const f of projection.factResponses) if (!text.includes(`HECHO ${f.sourceFactId}`)) structureErrors.push(`FACT_NOT_VISIBLE:${f.sourceFactId}`);
    for (const c of projection.claimResponses) if (!text.includes(`PRESTACIÓN ${c.claimId}:`)) structureErrors.push(`CLAIM_NOT_VISIBLE:${c.claimId}`);
  } else for (const c of projection.challenges) {
    const task = trace.generationTasks.find(t => (t.contextPack as any)?.legalDraftingContract?.id === c.id);
    if (!task) structureErrors.push(`TASK_NOT_TRACED:${c.id}`);
    if (task?.responseStatus !== 'BLOCKED') structureErrors.push(`BLOCKED_TASK_STATE_NOT_TRACED:${c.id}`);
    if (!text.includes(c.challengedText)) structureErrors.push(`ACT_NOT_VISIBLE:${c.id}`);
    if (c.requestedEffect && !text.includes(c.requestedEffect.text)) structureErrors.push(`EFFECT_NOT_VISIBLE:${c.id}`);
    if (!text.includes('Pendientes que bloquean conclusión jurídica')) structureErrors.push(`BLOCKER_NOT_VISIBLE:${c.id}`);
    if (matter === 'apelacion') {
      const findings = auditLegalArgumentStructure(doc).filter(f => f.sectionId === task?.sectionId);
      for (const finding of findings) structureErrors.push(`GRIEVANCE_${finding.code}`);
    }
  }
  const report = {
    matter, classification:'OFFLINE_CONTROLLED_NOT_PROVIDER_SUCCESS', sourceSHA256:createHash('sha256').update(source.extractedText!).digest('hex'),
    CaseAnalysis:{facts:doc.caseAnalysis!.facts.length,claims:doc.caseAnalysis!.claims.length,decisions:doc.caseAnalysis!.challengedReasonings?.length || 0},
    CanonicalAnalysis:projection, LegalIssues:doc.legalIssueMatrix,
    DocumentPlan:trace.documentPlanSnapshot, GenerationTasks:trace.generationTasks,
    beforeTasks:before.GENERATION_TASKS?.length || 0, taskCount:trace.generationTasks.length,
    blockedTasks:trace.taskExecutions.filter(t => t.responseStatus === 'BLOCKED').length,
    manualRules:doc.generationMetadata.operationalManual,
    research:{verifiedAuthorities:doc.caseAnalysis!.verifiedAuthorities?.length || 0,status:'NOT_VERIFIED_OFFLINE'},
    validatorFindings:doc.validation.errors, argumentFindings:auditLegalArgumentStructure(doc),
    materializedSections:doc.sections.map(s => ({id:s.id,title:s.title,blocks:s.content.length,text:s.content.map(b => b.text).join('\n')})),
    QualityStructure:structureErrors.length ? 'FAIL' : 'PASS', structureErrors,
    Coverage:doc.coverageMatrix, QualityGate:trace.qualityGateResult, Status:(doc.generationMetadata as any).readiness,
  };
  await writeFile(`${directory}/evidence.json`,JSON.stringify(report,null,2));
  await writeFile(`${directory}/produced-document.json`,JSON.stringify(doc,null,2));
  await writeFile(`${directory}/produced-document.txt`,text);
  expect(trace.qualityGateResult?.passed).toBe(false);
  expect((doc.generationMetadata as any).readiness).toBe('REVIEW_REQUIRED');
  expect(structureErrors).toEqual([]);
  expect(text).not.toMatch(/delito de imputado|delito desconocido|presunto delito correspondiente/);
},60000);
