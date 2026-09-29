import { readFile } from 'node:fs/promises';

async function run() {
  let docPath = 'audit/autonomous-legal-drafting-phase4/attempt-03/cases/01/EXTENSIVE_40/evidence/generated-document.json';
  let raw: string;
  try {
    raw = await readFile(docPath, 'utf8');
  } catch {
    docPath = 'audit/professional-drafting-phase3/cases/01/EXTENSIVE_40/evidence/generated-document.json';
    raw = await readFile(docPath, 'utf8');
  }
  const doc = JSON.parse(raw);
  console.log('Document loaded from:', docPath);
  console.log('Sections:', doc.sections?.length);
  const blocks = doc.sections?.flatMap((s: any) => s.content || []) || [];
  console.log('Blocks count:', blocks.length);
  const extensionBlocks = blocks.filter((b: any) => b.generationTaskType === 'EXTENSION');
  console.log('Extension blocks count:', extensionBlocks.length);
  for (const b of extensionBlocks) {
    console.log(' - TaskId:', b.generationTaskId, 'chars:', b.text?.length, 'provider:', b.provider);
  }
  
  const items = doc.coverageMatrix?.items || [];
  console.log('Coverage items count:', items.length);
  const statusCounts: Record<string, number> = {};
  for (const item of items) {
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  }
  console.log('Coverage status counts:', statusCounts);

  const usedCoverageIds = new Set(blocks.flatMap((block: any) => block.coverageItemIds || []));
  console.log('usedCoverageIds count:', usedCoverageIds.size);

  const eligible = items.filter((item: any) =>
    item.required
    && ['pending', 'weak', 'insufficient'].includes(item.status)
    && !item.requiresClientPosition
    && item.status !== 'blocked'
    && !usedCoverageIds.has(item.id)
  );
  console.log('eligiblePendingCoverage in buildSupportedExpansionPackets count:', eligible.length);

  const contract = doc.generationMetadata?.generationExtension;
  console.log('generationExtension contract:', contract);
  console.log('draftContentStopReason:', doc.generationMetadata?.draftContentStopReason);

  // Import internal functions from generationExpansion.ts
  const { assessRemainingDraftSupport } = await import('../lib/legal-engine/draftDepth');
  
  // Let's inspect facts
  console.log('Case facts count:', doc.caseAnalysis?.facts?.length);
  const factPositions = {};
  for (const f of doc.caseAnalysis?.facts || []) {
    factPositions[f.lawyerPosition || 'UNDEFINED'] = (factPositions[f.lawyerPosition || 'UNDEFINED'] || 0) + 1;
  }
  console.log('Fact positions:', factPositions);

  console.log('evidenceMentions count:', doc.caseAnalysis?.richCaseAnalysis?.evidenceMentions?.length);
  console.log('verifiedAuthorities count:', doc.caseAnalysis?.verifiedAuthorities?.length);

  // Let's simulate relaxed buildSupportedExpansionPackets:
  const relaxedSourceIds = new Set(doc.sourceDocuments?.map((s: any) => s.id).filter(Boolean));
  const relaxedAllBlocks = doc.sections.flatMap((s: any) => s.content || []);
  const relaxedUsedCoverageIds = new Set(relaxedAllBlocks.flatMap((b: any) => b.coverageItemIds || []));
  const relaxedUsedFactIds = new Set(relaxedAllBlocks.flatMap((b: any) => b.factIds || []));

  const confirmedFacts = new Map();
  for (const fact of doc.caseAnalysis?.facts || []) {
    const sourceId = fact.documentId || fact.sourceReference?.documentId;
    if (!fact.id || !sourceId || !relaxedSourceIds.has(sourceId)) continue;
    const text = (fact.sourceFact || fact.text || '').trim();
    if (!text) continue;
    confirmedFacts.set(fact.id, {
      text,
      sourceId,
      position: fact.lawyerPosition && fact.lawyerPosition !== 'UNDEFINED' ? fact.lawyerPosition : 'DEFENSA_DE_FONDO',
    });
  }
  console.log('Relaxed confirmedFacts count:', confirmedFacts.size);

  const eligibleCoverage = (doc.coverageMatrix?.items || []).filter((item: any) =>
    item.required
    && ['pending', 'weak', 'insufficient', 'needs_client_position'].includes(item.status)
    && item.status !== 'blocked'
    && !relaxedUsedCoverageIds.has(item.id)
  );
  console.log('Relaxed eligibleCoverage count:', eligibleCoverage.length);

  // Check how many sections get packets:
  let totalSupportedItems = 0;
  for (const section of doc.sections) {
    const items = eligibleCoverage.filter((item: any) => item.targetSectionIds?.includes(section.id));
    if (!items.length) continue;
    let sectionSupported = 0;
    for (const item of items) {
      const factIds = [...(item.relatedFactIds || []), ...(item.factIds || [])];
      const hasFact = factIds.some((id: string) => confirmedFacts.has(id));
      if (hasFact) sectionSupported++;
    }
    if (sectionSupported > 0) {
      console.log(`Section ${section.id} (${section.title}) has ${sectionSupported} supported items!`);
      totalSupportedItems += sectionSupported;
    }
  }
  console.log('Total supported items across sections:', totalSupportedItems);
}

run().catch(console.error);
