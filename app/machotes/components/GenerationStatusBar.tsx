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

export function GenerationStatusBar({
  job,
  title = 'Generando escrito jurídico…',
  onCancel,
  cancelling,
}: GenerationStatusBarProps) {
  if (!job) return null;

  const isRunning = job.status === 'processing';
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isCancelled = job.status === 'cancelled';

  if (!isRunning && !isCompleted && !isFailed && !isCancelled) return null;

  const pct =
    typeof job.percentage === 'number'
      ? Math.max(0, Math.min(100, Math.round(job.percentage)))
      : job.total > 0
        ? Math.round((job.completed / job.total) * 100)
        : 0;

  const hasTotal = job.total > 0;
  const usingFallback = isRunning && job.aiProvider === 'fallback';

  return (
    <div data-testid="generation-status-bar" className="rounded-xl bg-white px-4 py-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          {isRunning && (
            <>
              <p className="text-sm font-black text-slate-900">{title}</p>
              <p className="text-xs text-slate-500">
                {job.stage || 'Procesando el expediente…'}
              </p>
            </>
          )}

          {isCompleted && (
            <>
              <p className="text-sm font-black text-emerald-700">
                Documento generado
              </p>
              <p className="text-xs text-slate-500">
                {job.documentReadiness && job.documentReadiness !== 'READY'
                  ? `Estado: ${job.documentReadiness}`
                  : 'La generación concluyó correctamente.'}
              </p>
            </>
          )}

          {isFailed && (
            <>
              <p className="text-sm font-black text-red-700">
                No se pudo completar la generación
              </p>
              <p className="text-xs text-red-600">{job.error || 'Error no especificado.'}</p>
            </>
          )}

          {isCancelled && (
            <>
              <p className="text-sm font-black text-amber-700">
                Generación cancelada
              </p>
              <p className="text-xs text-slate-500">
                Puedes iniciar una nueva corrida cuando lo necesites.
              </p>
            </>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className="text-lg font-black text-[#0B2545]">
            {isFailed ? '0%' : isCompleted ? '100%' : `${pct}%`}
          </p>
          {hasTotal && (
            <p className="text-xs font-semibold text-slate-400">
              {job.completed}/{job.total}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${isFailed ? 0 : isCompleted ? 100 : pct}%`,
            background: 'linear-gradient(90deg,#0B2545 0%, #2457A6 60%, #5B8DEF 100%)',
          }}
        />
      </div>

      <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          {job.currentBlock && (
            <p className="truncate text-xs text-slate-500" title={job.currentBlock}>
              Bloque actual: {job.currentBlock}
            </p>
          )}

          {usingFallback && (
            <p className="text-[11px] italic text-slate-400">
              Modo local seguro para esta sección
            </p>
          )}
        </div>

        {onCancel && isRunning && (
          <button
            onClick={onCancel}
            disabled={!!cancelling}
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
          >
            {cancelling ? 'Cancelando…' : 'Cancelar'}
          </button>
        )}
      </div>
    </div>
  );
}
