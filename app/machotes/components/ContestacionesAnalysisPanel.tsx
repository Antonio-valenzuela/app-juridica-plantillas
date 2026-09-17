'use client';

import React, { useState } from 'react';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';

interface ContestacionesAnalysisPanelProps {
  hasDocument: boolean;
  analysisAvailable: boolean;
  caseAnalysis?: CaseAnalysis | null;
  aportacionesCount?: number;
}

type AnalysisTab = 'resumen' | 'hechos' | 'prestaciones' | 'excepciones';

export function ContestacionesAnalysisPanel({
  hasDocument,
  analysisAvailable,
  caseAnalysis,
  aportacionesCount = 0,
}: ContestacionesAnalysisPanelProps) {
  const [activeTab, setActiveTab] = useState<AnalysisTab>('resumen');

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

  const vulnerabilities = caseAnalysis?.caseTheory?.vulnerabilities || [];
  const argumentAxes = caseAnalysis?.argumentAxes || [];
  const authority = caseAnalysis?.authorities?.[0];
  const summary =
    caseAnalysis?.caseTheory?.legalTheory ||
    caseAnalysis?.summary ||
    'El sistema mostrará aquí una lectura ejecutiva del documento cargado.';

  const isCompleted = hasDocument && analysisAvailable;

  const tabs = [
    { id: 'resumen' as const, label: 'Resumen', count: null },
    { id: 'hechos' as const, label: 'Hechos', count: facts.length },
    { id: 'prestaciones' as const, label: 'Prestaciones', count: claims.length },
    {
      id: 'excepciones' as const,
      label: 'Riesgos',
      count: vulnerabilities.length + argumentAxes.length + aportacionesCount,
    },
  ];

  // Extract or generate representative legal tags for display
  const detectedTags = React.useMemo(() => {
    const tags: Array<{ label: string; tone: 'blue' | 'amber' }> = [];
    if (claims.length > 0) {
      tags.push({ label: claims[0].slice(0, 30), tone: 'blue' });
    }
    if (vulnerabilities.length > 0) {
      tags.push({ label: typeof vulnerabilities[0] === 'string' ? vulnerabilities[0].slice(0, 30) : 'Riesgo procesal', tone: 'amber' });
    }
    if (argumentAxes.length > 0) {
      tags.push({ label: typeof argumentAxes[0] === 'string' ? argumentAxes[0].slice(0, 30) : 'Eje argumentativo', tone: 'blue' });
    }
    // Fallback standard legal tags if few detected
    if (tags.length < 3) {
      tags.push({ label: 'Derechos laborales', tone: 'blue' });
      tags.push({ label: 'Falta de motivación', tone: 'blue' });
      tags.push({ label: 'Violación al debido proceso', tone: 'blue' });
      tags.push({ label: 'Precedentes relevantes', tone: 'amber' });
    }
    return tags.slice(0, 4);
  }, [claims, vulnerabilities, argumentAxes]);

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition hover:border-slate-300/80">
      <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Análisis de la demanda
          </h2>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            isCompleted
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
              : 'bg-slate-100 text-slate-500 border border-slate-200/60'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-slate-400'}`}
          />
          {isCompleted ? 'Completado' : 'Pendiente'}
        </span>
      </div>

      {/* Tabs / Segmented Control */}
      <div className="mb-2 flex flex-wrap gap-1 rounded-lg bg-slate-100/80 p-1">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-md px-2.5 py-1.5 text-center text-xs font-semibold transition ${
                active
                  ? 'bg-[#0B2545] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              {tab.label}
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span className={`ml-1.5 text-[11px] ${active ? 'text-white/80' : 'text-slate-400'}`}>
                  ({tab.count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!hasDocument || !analysisAvailable ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3.5 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="mt-2 text-sm font-bold text-slate-800">
            El análisis aparecerá aquí
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate-500">
            Al procesar el documento fuente se extraerán automáticamente hechos, prestaciones y riesgos jurídicos.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeTab === 'resumen' && (
            <>
              <p className="text-sm leading-relaxed text-slate-600">
                {summary}
              </p>

              {/* Tag Pills */}
              <div className="flex flex-wrap gap-2 pt-1">
                {detectedTags.map((tag, idx) => (
                  <span
                    key={idx}
                    className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${
                      tag.tone === 'amber'
                        ? 'bg-[#FEF3C7] text-[#92400E] border border-amber-200/60'
                        : 'bg-[#EFF6FF] text-[#1D4ED8] border border-blue-100'
                    }`}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            </>
          )}

          {activeTab === 'hechos' && (
            <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
              {facts.length === 0 ? (
                <p className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                  No se identificaron hechos procesales independientes.
                </p>
              ) : (
                facts.map((fact, idx) => (
                  <div key={fact.id || idx} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                    <div className="flex items-start gap-2.5">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0B2545] text-[11px] font-bold text-white">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm leading-relaxed text-slate-700">
                          {fact.text}
                        </p>
                        {fact.date && (
                          <p className="mt-1 text-[11px] font-medium text-slate-400">
                            Fecha: {fact.date}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'prestaciones' && (
            <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
              {claims.length === 0 ? (
                <p className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                  No se identificaron prestaciones o reclamaciones específicas.
                </p>
              ) : (
                claims.map((claim, idx) => (
                  <div key={claim.id || idx} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                    <div className="flex items-start gap-2.5">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                        {idx + 1}
                      </span>
                      <p className="text-sm leading-relaxed text-slate-700">
                        {claim.text || claim.claim || 'Prestación identificada'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'excepciones' && (
            <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
              {[...vulnerabilities, ...argumentAxes].length === 0 ? (
                <p className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                  Aún no se detectan vulnerabilidades o ejes argumentativos destacados.
                </p>
              ) : (
                [...vulnerabilities, ...argumentAxes].map((item, idx) => (
                  <div key={idx} className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
                    <div className="flex items-start gap-2.5">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white">
                        !
                      </span>
                      <p className="text-sm leading-relaxed text-amber-900">
                        {typeof item === 'string' ? item : JSON.stringify(item)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
