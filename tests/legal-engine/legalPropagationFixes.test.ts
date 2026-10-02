import { describe, it, expect } from 'vitest';
import { controlledSource, controlledDocument } from '@/tests/fixtures/controlledLegalQuality';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { buildDraftingPlan } from '@/lib/legal-engine/pipeline';
import { buildGenerationTasksForSection } from '@/lib/legal-engine/generationTasks';
import { buildLegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import { buildDocumentPlan } from '@/lib/legal-engine/documentPlan';
import { getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';

// ── helpers ──────────────────────────────────────────────────────────────────

function amparoSetup() {
  const source = controlledSource('amparo');
  const doc = controlledDocument('amparo');
  const analysis = reconstructCaseAnalysis([source], 'Preparar amparo indirecto.');
  doc.sections = buildDocumentPlan({ doc, template: getDocumentTemplate(doc.documentType)!, caseAnalysis: analysis }).sections;
  return { source, doc, analysis };
}

function penalSetup() {
  const source = controlledSource('penal');
  const doc = controlledDocument('penal');
  const analysis = reconstructCaseAnalysis([source], 'Preparar apelación penal.');
  doc.sections = buildDocumentPlan({ doc, template: getDocumentTemplate(doc.documentType)!, caseAnalysis: analysis }).sections;
  return { source, doc, analysis };
}

// ── 1. Amparo: decisionReasoning cr-1 produces SOURCE_ARGUMENT_RESPONSE ─────

describe('FIX 1a – DecisionReasoning review planning for amparo', () => {
  it('richCaseAnalysis.decisionReasonings has at least 1 item for the amparo fixture', () => {
    const { analysis } = amparoSetup();
    const decisionReasonings = analysis.richCaseAnalysis?.decisionReasonings ?? [];
    expect(decisionReasonings.length).toBeGreaterThan(0);
  });

  it('creates an explicit blocked review issue without manufacturing Coverage', () => {
    const { doc, analysis } = amparoSetup();
    const rich = analysis.richCaseAnalysis!;
    const decisionReasonings = rich.decisionReasonings ?? [];
    expect(decisionReasonings.length).toBeGreaterThan(0);

    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const drIds = decisionReasonings.map((dr) => dr.id);

    // A recognized decision is review input, not automatic substantive Coverage.
    const issues = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: matrix });
    expect(issues.issues.some(issue =>
      (issue.challengedReasoningIds ?? []).some(id => drIds.includes(id))
      && issue.blocking)).toBe(true);
  });
});

// ── 2. Amparo: decisionReasoning coverage → at least 1 GenerationTask ────────

describe('FIX 1b – DecisionReasoning coverage produces GenerationTasks for amparo', () => {
  it('produces at least 1 GenerationTask for the amparo fixture', () => {
    const { doc, analysis } = amparoSetup();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const plan = buildDraftingPlan(doc, 5000, analysis, matrix);
    const tasks = plan.sections.flatMap((section) =>
      buildGenerationTasksForSection(section, doc, analysis, matrix),
    );
    expect(tasks.length).toBeGreaterThan(0);
  });
});

// ── 3. Penal: at least 1 LegalIssue even when crimeClassification=MISSING ────

describe('FIX 2 – Penal fixture produces LegalIssues without inventing crime data', () => {
  it('produces at least 1 LegalIssueItem for the penal fixture', () => {
    const { doc, analysis } = penalSetup();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const issueMatrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: matrix });
    expect(issueMatrix.issues.length).toBeGreaterThan(0);
  });

  it('no issue question or statusReason contains invented crime labels', () => {
    const { doc, analysis } = penalSetup();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const issueMatrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: matrix });
    const inventedPatterns = /delito de imputado|delito desconocido|presunto delito correspondiente/i;
    for (const issue of issueMatrix.issues) {
      expect(issue.question).not.toMatch(inventedPatterns);
      if (issue.statusReason) {
        expect(issue.statusReason).not.toMatch(inventedPatterns);
      }
    }
  });

  it('GenerationTasks for penal contain no invented crime labels', () => {
    const { doc, analysis } = penalSetup();
    const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const plan = buildDraftingPlan(doc, 5000, analysis, matrix);
    const tasks = plan.sections.flatMap((section) =>
      buildGenerationTasksForSection(section, doc, analysis, matrix),
    );
    const inventedPatterns = /delito de imputado|delito desconocido|presunto delito correspondiente/i;
    for (const task of tasks) {
      if (task.objective) expect(task.objective).not.toMatch(inventedPatterns);
      expect(JSON.stringify(task.legalDraftingContract || {})).not.toMatch(inventedPatterns);
    }
  });
});
