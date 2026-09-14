import { describe, expect, it } from 'vitest';
import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { buildDraftingPlan } from '@/lib/legal-engine/pipeline';
import { buildGenerationTasksForSection } from '@/lib/legal-engine/generationTasks';
import { makeFixtureDocument, makeFixtureFCaseAnalysis } from '@/tests/fixtures/richCoverageFixtures';

function buildRichTasksForFixtureF() {
  const analysis = makeFixtureFCaseAnalysis();
  const doc = makeFixtureDocument();
  const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
  const plan = buildDraftingPlan(doc, 5000, analysis, matrix);
  const tasks = plan.sections.flatMap((section) => buildGenerationTasksForSection(section, doc, analysis, matrix));
  return { tasks, matrix };
}

describe('rich Coverage to GenerationTask', () => {
  it('maps each required rich claim and fact to a task with exact Coverage IDs', () => {
    const { tasks, matrix } = buildRichTasksForFixtureF();
    for (const item of matrix.items.filter((candidate) => candidate.required && /CLAIM_RESPONSE|FACT_RESPONSE/.test(candidate.category))) {
      expect(tasks.filter((task) => task.coverageItemIds?.includes(item.id)).length).toBeGreaterThanOrEqual(1);
    }
    expect(tasks.flatMap((task) => task.coverageItemIds || []).some((id) => id.includes('legacy'))).toBe(false);
  });

  it('uses COVERAGE_ITEM only for conflict or missing-position work without a native task type', () => {
    const { tasks } = buildRichTasksForFixtureF();
    const generic = tasks.filter((task) => task.taskType === 'COVERAGE_ITEM');
    expect(generic.length).toBeGreaterThan(0);
    expect(generic.every((task) => task.coverageItemIds?.some((id) => /conflict|missing/.test(id)))).toBe(true);
  });
});
