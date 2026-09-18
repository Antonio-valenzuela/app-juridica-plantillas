'use client';

import React from 'react';

interface ContestacionesChecklistProps {
  hasDocument: boolean;
  analysisCompleted: boolean;
  configDefined: boolean;
  isGenerating: boolean;
  generationJob?: {
    total: number;
    completed: number;
    percentage: number;
    currentBlock: string | null;
    status: string;
    stage?: string;
    documentReadiness?: string | null;
  } | null;
  blockReason?: string | null;
  isIncompatible?: boolean;
  onGenerate: () => void;
  onOpenEditor?: () => void;
}

export interface ContestacionesGenerationSignals {
  hasDocument: boolean;
  analysisAvailable: boolean;
  analysisRequiresReview?: boolean;
  configDefined: boolean;
  isIncompatible?: boolean;
  isGenerating: boolean;
  blockReason?: string | null;
}

export function canStartContestacionGeneration(signals: ContestacionesGenerationSignals) {
  return Boolean(
    signals.hasDocument &&
      signals.analysisAvailable &&
      signals.configDefined &&
      !signals.isIncompatible &&
      !signals.blockReason &&
      !signals.isGenerating
  );
}

export function ContestacionesChecklist({
  hasDocument,
  analysisCompleted,
  configDefined,
  isGenerating,
  blockReason,
  isIncompatible,
  onGenerate,
  onOpenEditor,
}: ContestacionesChecklistProps) {
  const isAllReady = canStartContestacionGeneration({
    hasDocument,
    analysisAvailable: analysisCompleted,
    configDefined,
    isIncompatible,
    isGenerating,
    blockReason,
  });

  const checklistItems = [
    { label: 'Documento fuente cargado y legible', completed: hasDocument },
    { label: 'Resumen del expediente completado', completed: hasDocument },
    { label: 'Análisis de la demanda revisado', completed: analysisCompleted },
    { label: 'Configuración de la contestación definida', completed: configDefined },
    { label: 'Revisar lineamientos específicos de la autoridad', completed: false },
  ];

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition hover:border-slate-300/80">
      <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Checklist de preparación
          </h2>
        </div>
      </div>

      <div className="contestaciones-checklist-grid">
        {/* Columna Izquierda: Checklist items */}
        <div className="contestaciones-checklist-items space-y-1.5">
          {checklistItems.map((item, idx) => (
            <div
              key={idx}
              className="flex select-none items-center gap-2 text-xs"
            >
              <div
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded transition ${
                  item.completed
                    ? 'bg-[#0B2545] text-white'
                    : 'border border-slate-300 bg-white'
                }`}
              >
                {item.completed && (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              <span
                className={item.completed ? 'font-medium text-slate-700' : 'text-slate-400'}
              >
                {item.label}
              </span>
            </div>
          ))}

          {blockReason && !isGenerating && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800">
              <p className="font-semibold">Requerimiento pendiente</p>
              <p className="mt-0.5 text-[11px] leading-relaxed">{blockReason}</p>
            </div>
          )}
        </div>

        {/* Columna Derecha: Botón de generación CTA */}
        <div className="contestaciones-checklist-action flex flex-col items-center justify-center space-y-2">
          <button
            type="button"
            onClick={onGenerate}
            disabled={!isAllReady || isGenerating}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B2545] px-4 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {isGenerating ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Generando contestación…</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Generar contestación</span>
                <span>&gt;</span>
              </>
            )}
          </button>

          <p className="flex items-center gap-1 text-center text-xs leading-tight text-slate-400">
            <svg className="h-3 w-3 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Se generará un borrador profesional con fundamento legal y estructura formal.</span>
          </p>

          {onOpenEditor && (
            <button
              type="button"
              onClick={onOpenEditor}
              className="text-sm font-semibold text-slate-500 transition hover:text-slate-800 underline decoration-slate-300 underline-offset-2"
            >
              Continuar en editor jurídico
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
