import { describe, expect, it } from 'vitest';
import { CANONICAL_DOCUMENT_TYPES, LEGACY_DOCUMENT_IDENTIFIER_IDS, getCatalogDocument } from '@/lib/catalog/legalCatalog';
import {
  buildWritingCoverageMatrix,
  renderSelectorTraceabilityMarkdown,
  writeWritingCoverageArtifacts,
} from '@/scripts/audit/build-writing-coverage.mjs';

describe('master writing coverage inventory', () => {
  it('covers each canonical document and keeps structural presence distinct from end-to-end PASS', () => {
    const matrix = buildWritingCoverageMatrix();
    const rowsById = new Map(matrix.rows.map((row) => [row.id, row]));

    expect(matrix.summary.canonicalDocumentCount).toBe(CANONICAL_DOCUMENT_TYPES.length);
    expect(matrix.summary.currentImplementedCount).toBe(
      CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.status === 'IMPLEMENTED' && entry.implemented).length,
    );
    const matterKeys = Object.keys(matrix.summary.byMatter);
    expect(new Set(matterKeys.map((matter) => matter.toLocaleLowerCase('en-US'))).size).toBe(matterKeys.length);
    expect(Object.values(matrix.summary.byFamily || {}).reduce((total, family) => total + family.count, 0)).toBe(matrix.rows.length);
    for (const document of CANONICAL_DOCUMENT_TYPES) {
      expect(rowsById.has(document.id), document.id).toBe(true);
    }

    const officialForm = rowsById.get('contestacion_impedimento');
    expect(officialForm).toBeDefined();
    expect(officialForm?.templateExists).toBe(true);
    expect(officialForm?.implementedFlag).toBe(false);
    expect(officialForm?.status).toBe('FAIL');
    expect(officialForm?.statusReason).toMatch(/evidencia E2E por (ID|tipo)/i);
    expect(officialForm?.uiSurface.some((surface) => surface.includes('Contestaciones'))).toBe(false);
    expect(matrix.summary.responseModeOptions).toBe(1);
    expect(matrix.summary.declaredContestacionesOptions).toBe(13);
    expect(matrix.summary.currentlySelectableContestacionesOptions).toBe(0);
    expect(matrix.summary.currentlySelectableInitialWritingOptions).toBe(0);
    expect(matrix.summary.currentlySelectableUniversalOptions).toBe(0);
    const canonicalIds = new Set(CANONICAL_DOCUMENT_TYPES.map((document) => document.id));
    expect(matrix.rows.filter((row) => canonicalIds.has(row.id) && row.functionalStatus === 'FAIL'))
      .toHaveLength(CANONICAL_DOCUMENT_TYPES.length);
    expect(matrix.rows.filter((row) => row.functionalStatus === 'NOT_APPLICABLE').every(
      (row) => row.humanReview === 'NOT_REQUIRED' && !row.selectable,
    )).toBe(true);
    expect(matrix.rows.every((row) => row.functionalStatus !== 'PASS')).toBe(true);
    expect(matrix.previousRegexCandidateIds).toHaveLength(matrix.summary.priorResponseNameMatchCandidatesNoLongerSelected);
    expect(matrix.summary.responseOptionsAddedByNameMatching).toBe(0);
    expect(matrix.summary.priorResponseNameMatchCandidatesNoLongerSelected).toBeGreaterThan(0);
    expect(matrix.rows.every((row) => ['PASS', 'FAIL', 'BLOCKED_EXTERNAL'].includes(row.status))).toBe(true);
    for (const row of matrix.rows.filter((entry) => entry.implementedFlag)) {
      expect(row.testFiles, row.id).toContain('tests/legal-taxonomy/implementedDocumentContracts.test.ts');
    }
    for (const id of LEGACY_DOCUMENT_IDENTIFIER_IDS) {
      if (getCatalogDocument(id)?.kind !== 'FAMILY') continue;
      const row = rowsById.get(id);
      expect(row?.uiSurface.some((surface) => surface.includes('Universal')), id).toBe(false);
      expect(row?.selectable, id).toBe(false);
      expect(row?.functionalStatus, id).toBe('NOT_APPLICABLE');
    }
  });

  it('writes the requested Markdown and JSON evidence from the current registries', () => {
    const matrix = buildWritingCoverageMatrix();
    expect(renderSelectorTraceabilityMarkdown(matrix))
      .toContain('currently selectable Contestaciones/Initial/Universal: 0/0/0.');
    const paths = writeWritingCoverageArtifacts(matrix);

    expect(paths.markdown).toMatch(/WRITING_COVERAGE_MATRIX\.md$/);
    expect(paths.json).toMatch(/writing-coverage\.json$/);
    expect(paths.selectorMarkdown).toMatch(/SELECTOR_TRACEABILITY\.md$/);
    expect(paths.selectorJson).toMatch(/selector-traceability\.json$/);
  });
});
