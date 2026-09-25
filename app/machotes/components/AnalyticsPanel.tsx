'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AnalyticsDataset, AnalyticsRangeDays, AnalyticsStatus } from '@/lib/workspace/analytics';

const ranges: AnalyticsRangeDays[] = [7, 30, 90];

function formatNumber(value: number | null | undefined): string {
  return typeof value === 'number' ? value.toLocaleString('es-MX') : 'Sin datos';
}

function formatDuration(value: number | null | undefined): string {
  if (!value || value <= 0) return 'Sin datos';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function statusLabel(status: AnalyticsStatus): string {
  return ({ COMPLETED: 'Completado', NEEDS_REVIEW: 'Requiere revisión', FAILED: 'Fallido', CANCELLED: 'Cancelado' } as Record<AnalyticsStatus, string>)[status];
}

function statusClass(status: AnalyticsStatus): string {
  return ({ COMPLETED: 'bg-emerald-50 text-emerald-700', NEEDS_REVIEW: 'bg-amber-50 text-amber-800', FAILED: 'bg-red-50 text-red-700', CANCELLED: 'bg-slate-100 text-slate-600' } as Record<AnalyticsStatus, string>)[status];
}

function BarList({ items, label }: { items: Array<{ label: string; count: number }>; label: string }) {
  const maximum = Math.max(1, ...items.map((item) => item.count));
  return (
    <div aria-label={label} className="space-y-3">
      {items.length ? items.slice(0, 6).map((item) => (
        <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-xs">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2 text-slate-600"><span className="truncate">{item.label}</span><strong className="text-[#0B2545]">{item.count}</strong></div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0B2545]" style={{ width: `${Math.max(8, (item.count / maximum) * 100)}%` }} /></div>
          </div>
        </div>
      )) : <p className="text-xs text-slate-500">Aún no hay suficiente actividad.</p>}
    </div>
  );
}

function MetricCard({ label, value, tone = 'navy' }: { label: string; value: string | number; tone?: 'navy' | 'green' | 'amber' | 'red' }) {
  const styles = {
    navy: 'border-slate-200 bg-white text-[#0B2545]',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
    red: 'border-red-100 bg-red-50 text-red-700',
  };
  return <article className={`rounded-xl border p-4 ${styles[tone]}`}><p className="text-[10px] font-bold uppercase tracking-[.12em] opacity-75">{label}</p><strong className="mt-2 block text-xl font-extrabold">{value}</strong></article>;
}

function AnalyticsContent({ data }: { data: AnalyticsDataset }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Documentos generados" value={formatNumber(data.totals.documentsGenerated)} />
        <MetricCard label="Completados" value={formatNumber(data.totals.completed)} tone="green" />
        <MetricCard label="Requieren revisión" value={formatNumber(data.totals.needsReview)} tone="amber" />
        <MetricCard label="Fallidos" value={formatNumber(data.totals.failed)} tone="red" />
        <MetricCard label="Tiempo promedio" value={formatDuration(data.totals.averageGenerationMs)} />
        <MetricCard label="Páginas generadas" value={formatNumber(data.totals.generatedPages)} />
        <MetricCard label="Objetivo alcanzado" value={formatNumber(data.extension.achieved)} tone="green" />
        <MetricCard label="Objetivo no alcanzado" value={formatNumber(data.extension.unmet)} tone="amber" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,1fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="analytics-daily-title">
          <div className="flex items-start justify-between gap-3"><div><h3 id="analytics-daily-title" className="text-sm font-extrabold text-[#0B2545]">Generaciones por día</h3><p className="mt-1 text-xs text-slate-500">Documentos registrados en el periodo seleccionado.</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{data.rangeDays} días</span></div>
          <div className="mt-5 flex h-36 items-end gap-1.5" role="img" aria-label="Generaciones por día">
            {data.daily.map((item) => {
              const maximum = Math.max(1, ...data.daily.map((entry) => entry.count));
              const height = item.count ? Math.max(10, (item.count / maximum) * 100) : 3;
              return <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${item.date}: ${item.count} generaciones`}><div data-testid={`analytics-daily-bar-${item.date}`} aria-label={`${item.date}: ${item.count} generaciones`} className="w-full rounded-t bg-[#0B2545]" style={{ height: `${height}%` }} /><span className="text-[8px] text-slate-400">{item.date.slice(8)}</span></div>;
            })}
          </div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="analytics-status-title">
          <h3 id="analytics-status-title" className="text-sm font-extrabold text-[#0B2545]">Estado de generación</h3>
          <div className="mt-4 space-y-2" role="list">
            {data.statuses.map((item) => <div key={item.status} className="flex items-center justify-between gap-3 text-xs" role="listitem"><span className={`rounded-full px-2 py-1 font-bold ${statusClass(item.status)}`}>{statusLabel(item.status)}</span><strong className="text-[#0B2545]">{item.count}</strong></div>)}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-extrabold text-[#0B2545]">Documentos por tipo</h3><p className="mb-4 mt-1 text-xs text-slate-500">Sólo categorías persistidas.</p><BarList items={data.byType} label="Documentos por tipo" /></section>
        <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-extrabold text-[#0B2545]">Documentos por materia</h3><p className="mb-4 mt-1 text-xs text-slate-500">Sólo categorías persistidas.</p><BarList items={data.byMatter} label="Documentos por materia" /></section>
      </div>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="analytics-quality-title">
        <div className="flex items-start justify-between gap-3"><div><h3 id="analytics-quality-title" className="text-sm font-extrabold text-[#0B2545]">Calidad de generación</h3><p className="mt-1 text-xs text-slate-500">Los fallos de calidad mantienen el documento en revisión; no se clasifican como fallo de aplicación.</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{data.totals.total} registros</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">Quality gate <strong className="block text-lg">{data.quality.qualityGatePass}/{data.quality.qualityGateFail}</strong><span>PASS / FAIL</span></div><div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">Validación <strong className="block text-lg">{data.quality.validationPass}/{data.quality.validationFail}</strong><span>PASS / FAIL</span></div><div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Advertencias <strong className="block text-lg">{data.quality.warnings}</strong><span>registradas</span></div><div className="rounded-lg bg-red-50 p-3 text-xs text-red-800">Errores <strong className="block text-lg">{data.quality.errors}</strong><span>registrados</span></div></div>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="analytics-recent-title">
        <div className="flex items-center justify-between gap-3"><div><h3 id="analytics-recent-title" className="text-sm font-extrabold text-[#0B2545]">Actividad reciente</h3><p className="mt-1 text-xs text-slate-500">Resumen técnico sin contenido jurídico.</p></div><span className="text-xs text-slate-500">{data.totals.total} registros</span></div>
        <div className="mt-3 divide-y divide-slate-100">
          {data.recent.map((item, index) => <article key={`${item.createdAt}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs"><div><span className={`rounded-full px-2 py-1 font-bold ${statusClass(item.status)}`}>{statusLabel(item.status)}</span><span className="ml-2 text-slate-500">{item.documentType} · {item.matter}</span></div><div className="flex items-center gap-2 text-slate-500">{item.extensionTargetUnmet ? <span className="font-bold text-amber-700">Objetivo de extensión no alcanzado</span> : item.targetPages !== null && item.actualPages !== null ? <span>{item.actualPages}/{item.targetPages} páginas</span> : null}</div></article>)}
        </div>
      </section>

      <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <summary className="cursor-pointer text-sm font-extrabold text-[#0B2545]">Diagnóstico avanzado</summary>
        <div className="mt-4 grid gap-3 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-5"><p>OCR validado: <strong>{data.advanced.ocrSuccessRate === null ? 'Sin datos' : `${data.advanced.ocrSuccessRate}%`}</strong></p><p>Fuentes listas: <strong>{formatNumber(data.advanced.sourceReady)}</strong></p><p>Fuentes en revisión: <strong>{formatNumber(data.advanced.sourceReview)}</strong></p><p>Fallos de extracción: <strong>{formatNumber(data.advanced.extractionFailures)}</strong></p><p>Intentos de proveedor: <strong>{formatNumber(data.advanced.providerAttempts)}</strong></p><p>Fallback de proveedor: <strong>{formatNumber(data.advanced.providerFallbacks)}</strong></p><p>Timeouts: <strong>{formatNumber(data.advanced.timeoutCount)}</strong></p><p>Errores HTTP: <strong>{formatNumber(data.advanced.httpErrors)}</strong></p><p>Generación promedio: <strong>{formatDuration(data.advanced.averageGenerationMs)}</strong></p><p>Extensión promedio: <strong>{formatDuration(data.advanced.extensionAverageMs)}</strong></p></div>
        {Object.keys(data.advanced.averageStageDurationsMs).length ? <div className="mt-4 border-t border-slate-200 pt-3"><p className="font-bold text-[#0B2545]">Tiempo promedio por etapa</p><div className="mt-2 flex flex-wrap gap-2">{Object.entries(data.advanced.averageStageDurationsMs).map(([stage, duration]) => <span key={stage} className="rounded-full bg-white px-2 py-1">{stage}: {formatDuration(duration)}</span>)}</div></div> : null}
      </details>
    </>
  );
}

export function AnalyticsPanel({ endpoint = '/api/workspace/analytics' }: { endpoint?: string }) {
  const [rangeDays, setRangeDays] = useState<AnalyticsRangeDays>(30);
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; data: AnalyticsDataset | null }>({ status: 'loading', data: null });

  const load = useCallback(async (range: AnalyticsRangeDays) => {
    setState({ status: 'loading', data: null });
    try {
      const response = await fetch(`${endpoint}?rangeDays=${range}`, { cache: 'no-store' });
      const payload = await response.json() as AnalyticsDataset & { ok?: boolean };
      if (!response.ok || payload.ok === false) throw new Error('ANALYTICS_LOAD_FAILED');
      setState({ status: 'ready', data: payload });
    } catch {
      setState({ status: 'error', data: null });
    }
  }, [endpoint]);

  useEffect(() => { void load(rangeDays); }, [load, rangeDays]);

  const hasActivity = Boolean(state.data && (state.data.hasActivity ?? state.data.totals.total > 0));

  return (
    <section className="mt-5" aria-labelledby="analytics-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#B58A5A]">Control del despacho</p><h2 id="analytics-title" className="mt-1 text-xl font-extrabold text-[#0B2545]">Analíticas</h2><p className="mt-1 text-xs text-slate-500">Actividad, calidad y extensión derivados de registros reales.</p></div><div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1" role="group" aria-label="Periodo de analíticas">{ranges.map((range) => <button key={range} type="button" aria-pressed={rangeDays === range} onClick={() => setRangeDays(range)} className={`min-h-9 min-w-[68px] whitespace-nowrap rounded-lg px-3 text-xs font-bold transition ${rangeDays === range ? 'bg-[#0B2545] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{range} días</button>)}</div></div>
      {state.status === 'loading' ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500" aria-live="polite">Cargando analíticas…</div> : null}
      {state.status === 'error' ? <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-center" role="alert"><p className="text-sm font-bold text-red-700">No fue posible cargar las analíticas.</p><button type="button" onClick={() => void load(rangeDays)} className="mt-3 min-h-10 rounded-lg bg-[#0B2545] px-4 text-xs font-bold text-white">Reintentar</button></div> : null}
      {state.status === 'ready' && state.data && !hasActivity ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Aún no hay suficiente actividad.</div> : null}
      {state.status === 'ready' && state.data && hasActivity ? <AnalyticsContent data={state.data} /> : null}
    </section>
  );
}
