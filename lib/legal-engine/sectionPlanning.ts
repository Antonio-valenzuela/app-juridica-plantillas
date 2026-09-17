import type { DocumentNode } from './types';
import type { GenerationTask } from './generationTasks';
import type { SourceProvenance } from './case-extraction/types';
import type { SectionPlan } from './pipeline';

/**
 * Projects the existing coverage/grounding tasks into the canonical plan for
 * one section.  It deliberately does not create a second planning graph: the
 * incoming SectionPlan remains the source of section identity and ordering.
 */
export function projectSectionPlanFromTasks(input: {
  section: DocumentNode;
  sectionPlan: SectionPlan;
  tasks: GenerationTask[];
  provenance?: SourceProvenance[];
}): SectionPlan {
  const orderedTasks = [...input.tasks].sort((left, right) => {
    const order = (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER);
    if (order !== 0) return order;
    return left.id.localeCompare(right.id);
  });
  const uniqueSorted = (values: string[]) => [...new Set(values)].sort();
  const uniqueStable = (values: string[]) => [...new Set(values.filter(Boolean))];
  const plan = input.sectionPlan;
  return {
    ...plan,
    templateSectionId: plan.templateSectionId || input.section.id,
    title: plan.title || input.section.title,
    generationTaskIds: uniqueStable([
      ...(plan.generationTaskIds || []),
      ...orderedTasks.map((task) => task.id),
    ]),
    coverageItemIds: uniqueSorted([
      ...(plan.coverageItemIds || []),
      ...orderedTasks.flatMap((task) => task.coverageItemIds || []),
    ]),
    requiredCoverageItemIds: uniqueSorted(plan.requiredCoverageItemIds || []),
    legalIssueIds: uniqueSorted([
      ...(plan.legalIssueIds || []),
      ...orderedTasks.flatMap((task) => task.legalIssueIds || [task.issueId, task.targetIssueId].filter(Boolean) as string[]),
    ]),
    factIds: uniqueSorted([
      ...(plan.factIds || []),
      ...orderedTasks.flatMap((task) => task.factIds || []),
    ]),
    evidenceIds: uniqueSorted([
      ...(plan.evidenceIds || []),
      ...orderedTasks.flatMap((task) => task.evidenceIds || []),
    ]),
    authorityIds: uniqueSorted([
      ...(plan.authorityIds || []),
      ...orderedTasks.flatMap((task) => task.authorityIds || []),
    ]),
    provenance: [...(plan.provenance || []), ...(input.provenance || [])].filter((value, index, values) => {
      const key = JSON.stringify([value.sourceId, value.page, value.section, value.paragraphIndex, value.elementIndex, value.excerptHash]);
      return values.findIndex((candidate) => JSON.stringify([candidate.sourceId, candidate.page, candidate.section, candidate.paragraphIndex, candidate.elementIndex, candidate.excerptHash]) === key) === index;
    }),
  };
}
