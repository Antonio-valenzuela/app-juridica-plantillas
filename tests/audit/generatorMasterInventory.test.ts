import { describe, expect, it } from 'vitest';
import { CANONICAL_DOCUMENT_TYPES, LEGACY_DOCUMENT_IDENTIFIER_IDS, canExportDocumentFinal, getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { WRITING_TYPE_EVIDENCE } from '@/lib/catalog/writingTypeEvidence.generated';
import {
  buildWritingCoverageMatrix,
  renderSelectorTraceabilityMarkdown,
  writeWritingCoverageArtifacts,
} from '@/scripts/audit/build-writing-coverage.mjs';

// Current policy (replaces the 2026-10-04 "0 PASS / 0 selectable" snapshot):
// - functionalStatus is COMPUTED: PASS only for a generable (IMPLEMENTED) type whose per-ID
//   evidence in WRITING_TYPE_EVIDENCE is true. It is mechanical evidence, not legal certification.
// - Every selectable surface exposes PASS types only (aliases resolve to a PASS target).
// - humanReview stays PENDING for every canonical type and FINAL export stays blocked.
// - Types that are not generable by product contract (official form / assisted draft) are FAIL
//   and never selectable.
// Counts are derived from the catalog and the evidence, never hard-coded.
type CanonicalEntry = (typeof CANONICAL_DOCUMENT_TYPES)[number];
const isGenerable = (entry: CanonicalEntry) => entry.status === 'IMPLEMENTED' && entry.implemented;
type SelectableKey = 'selectableInContestaciones' | 'selectableInInitialWritings' | 'selectableInUniversal' | 'selectableInCatalogNavigator';
const hasPerIdEvidence = (entry: CanonicalEntry) => isGenerable(entry) && (WRITING_TYPE_EVIDENCE as Record<string, true | undefined>)[entry.id] === true;

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
    // A non-generable type must say why it fails: the structural blockers plus the missing evidence.
    expect(officialForm?.statusReason).toMatch(/falta compatibilidad declarada de fuente/i);
    expect(officialForm?.statusReason).toMatch(/routing explícito no acreditado/i);
    expect(officialForm?.statusReason).toMatch(/(no hay evidencia determinista por ID|evidencia funcional incompleta|evidencia E2E por (ID|tipo))/i);
    expect(officialForm?.uiSurface.some((surface) => surface.includes('Contestaciones'))).toBe(false);

    // PASS <=> generable + per-ID evidence. humanReview PENDING everywhere; FINAL blocked everywhere.
    const canonicalIds = new Set(CANONICAL_DOCUMENT_TYPES.map((document) => document.id));
    const passIds = new Set(CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.functionalStatus === 'PASS').map((entry) => entry.id));
    const nonGenerable = CANONICAL_DOCUMENT_TYPES.filter((entry) => !isGenerable(entry));
    expect(nonGenerable.length).toBeGreaterThan(0);
    expect(nonGenerable).toHaveLength(CANONICAL_DOCUMENT_TYPES.length - matrix.summary.currentImplementedCount);
    expect(Object.keys(WRITING_TYPE_EVIDENCE).every((id) => canonicalIds.has(id))).toBe(true);
    for (const entry of CANONICAL_DOCUMENT_TYPES) {
      const row = rowsById.get(entry.id)!;
      expect(entry.functionalStatus, entry.id).toBe(hasPerIdEvidence(entry) ? 'PASS' : 'FAIL');
      expect(row.functionalStatus, entry.id).toBe(entry.functionalStatus);
      expect(entry.humanReview, entry.id).toBe('PENDING');
      expect(row.humanReview, entry.id).toBe('PENDING');
      expect(canExportDocumentFinal(entry.id), entry.id).toBe(false);
      if (row.status === 'PASS') expect(hasPerIdEvidence(entry), entry.id).toBe(true);
      // El resolver real cuenta también las plantillas derivadas por familia: evidencia + tipo generable => fila PASS.
      if (hasPerIdEvidence(entry)) expect(row.status, entry.id).toBe('PASS');
      if (!isGenerable(entry)) {
        expect(row.status, entry.id).toBe('FAIL');
        expect(row.selectable, entry.id).toBe(false);
        expect((WRITING_TYPE_EVIDENCE as Record<string, true | undefined>)[entry.id], entry.id).toBeUndefined();
      }
      if (entry.functionalStatus !== 'PASS') expect(row.selectable, entry.id).toBe(false);
    }
    // Aliases and legacy sentinels may be PASS or selectable only through a PASS canonical target.
    for (const row of matrix.rows.filter((entry) => entry.functionalStatus === 'PASS' || entry.selectable)) {
      expect(passIds.has(row.aliasTarget || row.id), row.id).toBe(true);
      if (!canonicalIds.has(row.id)) expect(row.aliasTarget, row.id).toBeTruthy();
    }

    // Selectable counts are derived from the catalog and tie back to the rows.
    const declaredContestaciones = CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.capabilities.selectableInContestaciones);
    const selectableRows = (key: SelectableKey) => matrix.rows.filter((row) => row[key]).length;
    expect(matrix.summary.declaredContestacionesOptions).toBe(declaredContestaciones.length);
    expect(matrix.summary.currentlySelectableContestacionesOptions)
      .toBe(declaredContestaciones.filter((entry) => entry.functionalStatus === 'PASS' && isGenerable(entry)).length);
    expect(matrix.summary.currentlySelectableContestacionesOptions).toBe(selectableRows('selectableInContestaciones'));
    expect(matrix.summary.currentlySelectableInitialWritingOptions).toBe(selectableRows('selectableInInitialWritings'));
    expect(matrix.summary.currentlySelectableUniversalOptions).toBe(selectableRows('selectableInUniversal'));
    expect(matrix.summary.currentlySelectableCatalogNavigatorTypes).toBe(selectableRows('selectableInCatalogNavigator'));
    expect(matrix.summary.currentlySelectableCatalogNavigatorTypes)
      .toBe(CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.functionalStatus === 'PASS' && entry.uiVisibility === 'VISIBLE').length);
    // The only extra Contestaciones option is the free-writing mode, which is not an accredited type.
    expect(matrix.summary.responseModeOptions).toBe(matrix.summary.currentlySelectableContestacionesOptions + 1);
    expect(rowsById.get('redaccion_libre')?.selectable).toBe(false);
    expect(rowsById.get('redaccion_libre')?.functionalStatus).toBe('FAIL');

    expect(matrix.rows.filter((row) => row.functionalStatus === 'NOT_APPLICABLE').every(
      (row) => row.humanReview === 'NOT_REQUIRED' && !row.selectable,
    )).toBe(true);
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
    const selectable = (key: SelectableKey) => matrix.rows.filter((row) => row[key]).length;
    expect(renderSelectorTraceabilityMarkdown(matrix)).toContain(
      `currently selectable Contestaciones/Initial/Universal: ${selectable('selectableInContestaciones')}/${selectable('selectableInInitialWritings')}/${selectable('selectableInUniversal')}.`,
    );
    const paths = writeWritingCoverageArtifacts(matrix);

    expect(paths.markdown).toMatch(/WRITING_COVERAGE_MATRIX\.md$/);
    expect(paths.json).toMatch(/writing-coverage\.json$/);
    expect(paths.selectorMarkdown).toMatch(/SELECTOR_TRACEABILITY\.md$/);
    expect(paths.selectorJson).toMatch(/selector-traceability\.json$/);
  });
});
