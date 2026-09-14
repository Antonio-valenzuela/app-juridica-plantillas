'use client';

import React from 'react';

export interface GenerationStatusData {
  status: string;
  total: number;
  completed: number;
  percentage?: number;
  currentBlock?: string | null;
  stage?: string;
  aiProvider?: string | null;
  documentReadiness?: string | null;
  error?: string;
}

interface GenerationStatusBarProps {
  job: GenerationStatusData | null;
  title?: string;
  onCancel?: () => void;
  cancelling?: boolean;
}

/**
 * Barra de progreso basada EXCLUSIVAMENTE en el estado real del Job
 * (/api/legal-engine/generate/status vía activeGenJob). Sin animaciones falsas:
 * si no hay total aún, se muestra la etapa sin porcentaje inventado.
 */
export function GenerationStatusBar({ job, title = 'Generando escrito jurídico…', onCancel, cancelling }: GenerationStatusBarProps) {
  if (!job) return null;

  const isRunning = job.status === 'processing';
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isCancelled = job.status === 'cancelled';

  if (!isRunning && !isCompleted && !isFailed && !isCancelled) return null;

  // Si /status no trae percentage, calcularlo de completed/total. Nunca inventar.
  const pct =
    typeof job.percentage === 'number'
      ? Math.max(0, Math.min(100, Math.round(job.percentage)))
      : job.total > 0
        ? Math.round((job.completed / job.total) * 100)
        : 0;

  const hasTotal = job.total > 0;
  const usingFallback = isRunning && job.aiProvider === 'fallback';

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-3.5 space-y-2">
      {/* Título / estados */}
      {isRunning && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-extrabold text-[#0B2545] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#B58A5A] animate-pulse" />
            {title}
          </p>
          {hasTotal && <span className="text-[11px] font-bold text-[#8F6745]">{pct}%</span>}
        </div>
      )}
      {isCompleted && (
        job.documentReadiness && job.documentReadiness !== 'READY' ? (
          <p className="text-xs font-extrabold text-amber-700">⚠️ {job.stage || `Generación completada · ${job.documentReadiness}`}</p>
        ) : (
          <p className="text-xs font-extrabold text-emerald-700">✓ Documento generado{hasTotal ? ` · ${job.completed}/${job.total}` : ''}</p>
        )
      )}
      {isFailed && (
        <div>
          <p className="text-xs font-extrabold text-red-700">No se pudo completar la generación.</p>
          {job.error && <p className="text-[11px] text-red-600 mt-0.5 break-words">{job.error}</p>}
        </div>
      )}
      {isCancelled && (
        <div>
          <p className="text-xs font-extrabold text-amber-700">Generación cancelada.</p>
          <p className="text-[11px] text-slate-500">Puedes iniciar una nueva generación.</p>
        </div>
      )}

      {/* Barra: track #E7E5E0 · fill oro bronce · sin animación infinita */}
      <div className="w-full h-2 rounded-full bg-[#E7E5E0] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${isFailed ? 0 : isCompleted ? 100 : pct}%`,
            background: 'linear-gradient(90deg,#B58A5A,#8F6745)',
          }}
        />
      </div>

      {/* Contador real X/Y + sección actual + Cancelar */}
      {isRunning && (
        <>
          <p className="text-[11px] font-semibold text-slate-600">
            {hasTotal ? `${job.completed} / ${job.total}` : job.stage || 'Preparando documento…'}
          </p>
          {job.currentBlock && (
            <p className="text-[11px] text-slate-500 truncate" title={job.currentBlock}>
              {job.currentBlock}
            </p>
          )}
          {usingFallback && (
            <p className="text-[10px] text-slate-400 italic">
              Modo local seguro para esta sección
            </p>
          )}
          {onCancel && (
            <button
              onClick={onCancel}
              disabled={!!cancelling}
              className="mt-2 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-800 text-[11px] font-bold transition"
            >
              {cancelling ? 'Cancelando…' : 'Cancelar generación'}
            </button>
          )}
        </>
      )}
      {isCompleted && !hasTotal && job.stage && (
        <p className="text-[11px] text-slate-500 truncate">{job.stage}</p>
      )}
    </div>
  );
}
