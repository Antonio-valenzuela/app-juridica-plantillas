'use client';

import React from 'react';
import { reviewAnnexCounts, reviewAnnexHasItems, type ReviewAnnex } from '@/lib/legal-engine/reviewAnnex';

/**
 * Anexo de revisión: notas, riesgos y citas no verificadas que el redactor produjo y que NO forman parte del
 * escrito. Se muestra fuera del documento y no se exporta con él.
 */
export function ReviewAnnexPanel({ annex }: { annex?: ReviewAnnex }) {
  if (!annex || (!reviewAnnexHasItems(annex) && !annex.removedStructure.length)) return null;
  const counts = reviewAnnexCounts(annex);
  const pending = counts.notes + counts.unverifiedCitations + counts.pendingItems + counts.unresolvedFindings;
  return (
    <details data-testid="review-annex" className="lex-annex">
      <summary className="lex-annex-summary">
        Anexo de revisión para el abogado ({pending} {pending === 1 ? 'punto' : 'puntos'}; fuera del escrito)
      </summary>
      <div className="lex-annex-body">
        {annex.unresolvedFindings.length > 0 && (
          <section aria-label="Hallazgos sin resolver">
            <strong>Hallazgos del validador sin resolver</strong>
            <ul>{annex.unresolvedFindings.map((item, i) => <li key={i}>{item.section ? `${item.section}: ` : ''}{item.message}</li>)}</ul>
          </section>
        )}
        {annex.unverifiedCitations.length > 0 && (
          <section aria-label="Citas sin verificar">
            <strong>Citas omitidas del escrito por no constar en fuente verificada</strong>
            <ul>{annex.unverifiedCitations.map((item, i) => <li key={i}>{item.section}: {item.citation}</li>)}</ul>
          </section>
        )}
        {annex.pendingItems.length > 0 && (
          <section aria-label="Pendientes">
            <strong>Pendientes de desarrollo o verificación</strong>
            <ul>{annex.pendingItems.map((item, i) => <li key={i}>{item.section}: {item.text}</li>)}</ul>
          </section>
        )}
        {annex.notes.length > 0 && (
          <section aria-label="Notas y riesgos">
            <strong>Notas y riesgos</strong>
            <ul>{annex.notes.map((item, i) => <li key={i}>{item.section}: {item.text}</li>)}</ul>
          </section>
        )}
        {annex.removedStructure.length > 0 && (
          <p>Se retiraron {annex.removedStructure.length} encabezados, firmas o «lugar y fecha» repetidos dentro de secciones.</p>
        )}
      </div>
    </details>
  );
}
