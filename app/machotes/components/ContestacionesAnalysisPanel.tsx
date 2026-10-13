'use client';

import React from 'react';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';

interface ContestacionesAnalysisPanelProps {
  hasDocument: boolean;
  analysisAvailable: boolean;
  caseAnalysis?: CaseAnalysis | null;
  /** Páginas del documento fuente, para confirmar que se leyó completo. */
  pageCount?: number;
}

export function ContestacionesAnalysisPanel({
  hasDocument,
  analysisAvailable,
  caseAnalysis,
  pageCount,
}: ContestacionesAnalysisPanelProps) {

  const claims = caseAnalysis?.claims || [];
  const timeline = caseAnalysis?.proceduralTimeline || [];
  const facts =
    caseAnalysis?.facts && caseAnalysis.facts.length > 0
      ? caseAnalysis.facts
      : timeline.map((ev, idx) => ({
          id: `timeline-${idx}`,
          number: String(idx + 1),
          text: ev.event,
          date: ev.date,
        }));

  const isCompleted = hasDocument && analysisAvailable;
  const evidenceCount = caseAnalysis?.richCaseAnalysis?.evidenceMentions?.length || 0;
  // Datos esenciales que el abogado debe completar. Son frases en lenguaje llano
  // del extractor; nunca se muestran objetos ni códigos internos.
  // Se excluyen los diagnósticos codificados del extractor ("[facts] …", en inglés),
  // que son registros internos, y los datos propios del amparo (quejoso, autoridad
  // responsable), que no aplican a la contestación de una demanda.
  const pendingItems = (caseAnalysis?.missingData || [])
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .filter((item) => !/^\s*\[/.test(item) && !/quejos|autoridad señalada como responsable/i.test(item))
    .slice(0, 3);
  const relevant: Array<{ label: string; tone: 'done' | 'pending' }> = [
    facts.length
      ? { label: `Se identificaron ${facts.length} hechos para contestar`, tone: 'done' }
      : { label: 'No se identificaron hechos numerados: revisa el documento', tone: 'pending' },
    claims.length
      ? { label: `Se detectaron ${claims.length} prestaciones`, tone: 'done' }
      : { label: 'No se detectaron prestaciones', tone: 'pending' },
    ...(evidenceCount ? [{ label: `Se localizaron ${evidenceCount} pruebas ofrecidas`, tone: 'done' as const }] : []),
    ...(typeof pageCount === 'number' && pageCount > 0 ? [{ label: `Documento completo (${pageCount} página${pageCount === 1 ? '' : 's'})`, tone: 'done' as const }] : []),
    ...pendingItems.map((item) => ({ label: `Por revisar: ${item}`, tone: 'pending' as const })),
  ];

  return (
    <section className="lex-card">
      <div className="lex-card-header">
        <h2 className="lex-card-title">Análisis de la demanda</h2>
        <span className={`lex-pill ${isCompleted ? 'lex-pill-success' : 'lex-pill-neutral'}`}>
          {isCompleted ? 'Analizado' : 'Pendiente'}
        </span>
      </div>

      {!hasDocument || !analysisAvailable ? (
        <p className="lex-empty-note">
          Al cargar el documento se identifican hechos, prestaciones y datos pendientes de revisión.
        </p>
      ) : (
        <>
          <h3 className="lex-subtitle lex-subtitle-first">Información relevante</h3>
          <ul className="lex-checklist">
            {relevant.map((item) => (
              <li key={item.label} className={item.tone === 'done' ? 'is-done' : 'is-pending'}>
                <span className="lex-check-icon" aria-hidden="true">{item.tone === 'done' ? '✓' : '!'}</span>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>

          {(facts.length > 0 || claims.length > 0) && (
            <details className="lex-disclosure">
              <summary>
                <span>Ver hechos y prestaciones</span>
                <span className="lex-disclosure-hint">{facts.length} · {claims.length}</span>
              </summary>
              {facts.length > 0 && (
                <>
                  <h4 className="lex-list-title">Hechos</h4>
                  <ol className="lex-numbered">
                    {facts.map((fact, idx) => (
                      <li key={fact.id || idx}>{String(fact.text || '').replace(/\s+/g, ' ')}</li>
                    ))}
                  </ol>
                </>
              )}
              {claims.length > 0 && (
                <>
                  <h4 className="lex-list-title">Prestaciones</h4>
                  <ol className="lex-numbered">
                    {claims.map((claim, idx) => (
                      <li key={(claim as any)?.id || idx}>
                        {String(typeof claim === 'string' ? claim : ((claim as any)?.text || (claim as any)?.claim || '')).replace(/\s+/g, ' ')}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </details>
          )}
        </>
      )}
    </section>
  );
}
