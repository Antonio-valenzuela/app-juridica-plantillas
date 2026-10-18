'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ExternalEgressSummary } from '@/lib/ai/externalEgressLedger';

const PROVIDER_NAMES: Record<string, string> = { groq: 'Groq', nvidia: 'NVIDIA', gemini: 'Gemini' };

function formatNumber(value: number): string {
  return value.toLocaleString('es-MX');
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * «Envíos a IA en la nube»: cuántas solicitudes salieron a cada proveedor, cuánto texto y con qué resultado.
 * Se alimenta del registro local de envíos; no muestra (ni guarda) el contenido enviado.
 */
export function ExternalAiEgressPanel({ rangeDays, endpoint = '/api/workspace/analytics/ai-egress' }: { rangeDays: number; endpoint?: string }) {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; data: ExternalEgressSummary | null }>({ status: 'loading', data: null });

  const load = useCallback(async (range: number) => {
    setState({ status: 'loading', data: null });
    try {
      const response = await fetch(`${endpoint}?rangeDays=${range}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('AI_EGRESS_LOAD_FAILED');
      const payload = await response.json().catch(() => null) as (ExternalEgressSummary & { ok?: boolean }) | null;
      if (!payload || payload.ok === false || !payload.totals) throw new Error('AI_EGRESS_LOAD_FAILED');
      setState({ status: 'ready', data: payload });
    } catch {
      setState({ status: 'error', data: null });
    }
  }, [endpoint]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async loader state is intentional here.
  useEffect(() => { void load(rangeDays); }, [load, rangeDays]);

  const data = state.data;
  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="analytics-egress-title" data-testid="analytics-ai-egress">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="analytics-egress-title" className="text-sm font-extrabold text-[#0B2545]">Envíos a IA en la nube</h3>
          <p className="mt-1 text-xs text-slate-500">Cada solicitud que salió a un proveedor con tu autorización. Se registra el volumen y el resultado, nunca el contenido.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{rangeDays} días</span>
      </div>
      {state.status === 'loading' && <p className="mt-3 text-xs text-slate-500" aria-live="polite">Cargando registro de envíos…</p>}
      {state.status === 'error' && <p className="mt-3 text-xs text-red-700" role="alert">No fue posible leer el registro de envíos.</p>}
      {state.status === 'ready' && data && data.totals.attempts === 0 && (
        <p className="mt-3 text-xs text-slate-600" data-testid="analytics-ai-egress-empty">No se envió ningún contenido a proveedores en la nube en este periodo.</p>
      )}
      {state.status === 'ready' && data && data.totals.attempts > 0 && (
        <>
          <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <p className="rounded-lg bg-slate-50 p-3">Solicitudes enviadas <strong className="block text-lg text-[#0B2545]" data-testid="analytics-ai-egress-attempts">{formatNumber(data.totals.attempts)}</strong><span>{formatNumber(data.totals.operations)} operaciones autorizadas</span></p>
            <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800">Con respuesta <strong className="block text-lg">{formatNumber(data.totals.ok)}</strong></p>
            <p className="rounded-lg bg-red-50 p-3 text-red-800">Con error <strong className="block text-lg">{formatNumber(data.totals.errors)}</strong><span>incluye límites de uso y tiempo agotado</span></p>
            <p className="rounded-lg bg-blue-50 p-3 text-blue-800">Texto enviado <strong className="block text-lg">{formatNumber(data.totals.charsSent)}</strong><span>caracteres</span></p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-bold text-[#0B2545]">Por proveedor</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {data.byProvider.map((item) => <li key={item.provider}>{PROVIDER_NAMES[item.provider] || item.provider}: <strong>{formatNumber(item.attempts)}</strong> solicitudes · {formatNumber(item.ok)} con respuesta · {formatNumber(item.charsSent)} caracteres enviados</li>)}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold text-[#0B2545]">Por operación</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {data.byOperation.slice(0, 8).map((item) => <li key={item.operation}>{item.operation}: <strong>{formatNumber(item.attempts)}</strong></li>)}
              </ul>
            </div>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-bold text-[#0B2545]">Últimos envíos</summary>
            <div className="mt-2 divide-y divide-slate-100 text-xs text-slate-600">
              {data.recent.map((item, index) => (
                <p key={`${item.at}-${index}`} className="py-2">
                  {formatDate(item.at)} · {PROVIDER_NAMES[item.provider] || item.provider}{item.model ? ` (${item.model})` : ''} · {item.operation} · {formatNumber(item.charsSent)} caracteres · {item.outcome === 'OK' ? 'con respuesta' : `error ${item.errorCode || ''}`.trim()} · {Math.round(item.latencyMs / 100) / 10} s
                </p>
              ))}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
