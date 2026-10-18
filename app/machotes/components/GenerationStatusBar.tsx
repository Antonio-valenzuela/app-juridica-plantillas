'use client';

import React from 'react';
import { getGenerationErrorPresentation } from '@/lib/apiErrorMessage';

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
  errorCode?: string | null;
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

  const rawPct =
    typeof job.percentage === 'number'
      ? Math.max(0, Math.min(100, Math.round(job.percentage)))
      : job.total > 0
        ? Math.round((job.completed / job.total) * 100)
        : 0;
  const pct = isRunning ? Math.min(99, rawPct) : rawPct;

  const hasTotal = job.total > 0;
  const displayCompleted = isRunning && hasTotal && pct < 100 && job.completed >= job.total
    ? Math.max(0, job.total - 1)
    : job.completed;
  const isIndeterminate = isRunning && !hasTotal;
  const usingFallback = isRunning && job.aiProvider === 'fallback';

  return (
    <div
      data-testid="generation-status-bar"
      data-layout="compact"
      data-status={job.status}
      data-progress-mode={isIndeterminate ? 'indeterminate' : 'determinate'}
      role="status"
      aria-live="polite"
      aria-busy={isRunning}
      className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div
          data-testid="generation-status-summary"
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1"
        >
          {isRunning && (
            <>
              <p className="text-sm font-bold text-slate-900">{title}</p>
              <p
                className="inline-flex max-w-full items-center gap-2 break-words text-xs text-slate-500"
                title={job.stage || 'Procesando el expediente…'}
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600 motion-safe:animate-pulse motion-reduce:animate-none"
                />
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
              <p className="text-xs text-red-600">{getGenerationErrorPresentation({ errorCode: job.errorCode, message: job.error }).category}: {getGenerationErrorPresentation({ errorCode: job.errorCode, message: job.error }).cause}</p>
              <details className="text-xs text-red-600"><summary>Ver detalle</summary><p>{getGenerationErrorPresentation({ errorCode: job.errorCode, message: job.error }).detail}</p></details>
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

        <div className="flex shrink-0 items-center gap-2.5">
          <div className="text-right">
            <p className="text-sm font-extrabold leading-5 text-[#0B2545]">
              {isIndeterminate ? 'En curso' : isFailed ? '0%' : isCompleted ? '100%' : `${pct}%`}
            </p>
            {isIndeterminate ? (
              <p className="text-[11px] font-medium text-slate-400">Esperando avance del servidor</p>
            ) : hasTotal ? (
              <p className="text-[11px] font-medium text-slate-400">
                {displayCompleted}/{job.total}
              </p>
            ) : null}
          </div>
          {onCancel && isRunning && (
            <button
              type="button"
              onClick={onCancel}
              disabled={!!cancelling}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 disabled:opacity-50 motion-reduce:transition-none"
            >
              {cancelling ? 'Cancelando…' : 'Cancelar'}
            </button>
          )}
        </div>
      </div>

      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-label="Progreso de generación"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={isIndeterminate ? undefined : isFailed ? 0 : isCompleted ? 100 : pct}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 motion-reduce:transition-none ${isIndeterminate ? 'w-[38%] motion-safe:animate-pulse motion-reduce:animate-none' : ''}`}
          style={{
            width: isIndeterminate ? undefined : `${isFailed ? 0 : isCompleted ? 100 : pct}%`,
            background: 'var(--lex-info)',
          }}
        />
      </div>

      {(job.currentBlock || usingFallback) && (
        <div className="mt-1 flex min-w-0 items-center gap-x-3 gap-y-0.5">
          <div className="min-w-0">
            {job.currentBlock && (
              <p className="truncate text-[11px] leading-4 text-slate-500" title={job.currentBlock}>
                Bloque actual: {job.currentBlock}
              </p>
            )}

            {usingFallback && (
              <p className="text-[11px] leading-4 text-slate-400">
                Modo local seguro para esta sección
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
