import fs from 'node:fs';
import path from 'node:path';
import { extractDocumentNative } from '@/lib/document-processing/nativeExtractor';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { classifyIntent } from '@/lib/legal-engine/classifier';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import { getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import { buildDocumentPlan } from '@/lib/legal-engine/documentPlan';
import { buildGenerationTasksForSection } from '@/lib/legal-engine/generationTasks';
import { resolveGenerationExtensionContract, allocateSectionWordTargets } from '@/lib/legal-engine/generationExtension';
import { measureRenderedDocumentPages } from '@/lib/legal-engine/documentPageMetrics';
import { createEmptyDocument } from '@/lib/legal-engine/types';

async function main() {
  const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/1787377633126-Recurso_Revision_Amparo_Directo_800-2024_Version_Ampliada__1_.pdf');
  const fileBytes = fs.readFileSync(fixturePath);
  console.log(`[1] File read: ${fileBytes.length} bytes`);

  const extracted = await extractDocumentNative(fileBytes, path.basename(fixturePath));
  console.log(`[2] Extracted pages: ${extracted.pages.length}, confidence: ${extracted.confidence}%`);

  const sourceDoc = {
    id: 'src-recurso-revision',
    name: path.basename(fixturePath),
    type: 'pdf',
    size: fileBytes.length,
    pages: extracted.pages,
    extractedText: extracted.pages.map(p => p.text).join('\n\n'),
    extractedAt: new Date().toISOString(),
    status: 'validated' as const,
    validationConfidence: extracted.confidence,
    validatedBy: 'NATIVE' as const,
  };

  const caseAnalysis = reconstructCaseAnalysis([sourceDoc], 'Contestación / defensa frente al recurso de revisión');
  console.log(`[3] CaseAnalysis:`, {
    parties: caseAnalysis.parties,
    factsCount: caseAnalysis.facts?.length || 0,
    claimsCount: caseAnalysis.claims?.length || 0,
    hasRich: Boolean(caseAnalysis.richCaseAnalysis),
    richIssuesCount: caseAnalysis.richCaseAnalysis?.legalIssues?.length || 0,
    caseNumbers: caseAnalysis.caseNumbers,
  });

  const classification = classifyIntent(sourceDoc.extractedText);
  console.log(`[4] Classification:`, classification);

  const routing = resolveDocumentRouting({
    sourceDocumentType: classification.documentType,
    selectedDocumentType: undefined,
  });
  console.log(`[5] Routing:`, {
    sourceDocumentType: routing.sourceDocumentType,
    selectedDocumentType: routing.selectedDocumentType,
    resolvedTemplate: routing.resolvedTemplate,
    resolvedStrategy: routing.resolvedStrategy,
  });

  const template = getDocumentTemplate(routing.resolvedTemplate);
  const doc = createEmptyDocument();
  doc.documentType = routing.resolvedTemplate;
  doc.sourceDocuments = [sourceDoc];
  doc.caseAnalysis = caseAnalysis;

  const plan = buildDocumentPlan({
    doc,
    template,
    caseAnalysis,
  });

  console.log(`[6] DocumentPlan:`, {
    templateId: plan.templateId,
    sectionsCount: plan.sections.length,
    sections: plan.sections.map(s => ({ id: s.id, title: s.title, type: s.type })),
    hasLegalIssueMatrix: Boolean(plan.legalIssueMatrix),
    issuesCount: plan.legalIssueMatrix?.issues?.length || 0,
    issues: plan.legalIssueMatrix?.issues?.map(i => ({ id: i.id, title: i.title, category: i.category })),
  });

  // Check extended contract
  const contract = resolveGenerationExtensionContract({
    generationMode: 'extended-legal',
    targetPages: 40,
    minPages: 36,
    maxPages: 44,
  });
  console.log(`[7] Extended Contract:`, contract);

  const sectionWordTargets = allocateSectionWordTargets(
    plan.sections.map(s => ({ id: s.id, title: s.title, type: s.type })),
    contract.targetWords
  );
  console.log(`[8] Allocated Section Word Targets (Total: ${Object.values(sectionWordTargets).reduce((a, b) => a + b, 0)} words):`, sectionWordTargets);

  // Check tasks per section
  let totalTasks = 0;
  for (const sec of plan.sections) {
    const secPlan = {
      templateSectionId: sec.id,
      title: sec.title,
      type: sec.type,
      order: sec.order,
      required: true,
      coverageItemIds: [],
    };
    const tasks = buildGenerationTasksForSection(secPlan as any, doc, caseAnalysis, plan.coverageMatrix, contract);
    totalTasks += tasks.length;
    console.log(`Section "${sec.title}" (${sec.id}) -> ${tasks.length} tasks:`, tasks.map(t => ({ id: t.id, taskType: t.taskType, issueId: t.legalIssueIds })));
  }
  console.log(`[9] Total GenerationTasks across all sections: ${totalTasks}`);

  // Measure empty doc pages
  doc.sections = plan.sections;
  const initialMetrics = await measureRenderedDocumentPages(doc);
  console.log(`[10] Initial Rendered PDF Metrics (empty content):`, initialMetrics);
}

main().catch(console.error);
