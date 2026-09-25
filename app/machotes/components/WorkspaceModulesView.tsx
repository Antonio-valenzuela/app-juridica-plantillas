'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { WorkspaceAuthorityResult, WorkspaceLibraryItem } from '@/lib/workspace/research';
import type { WorkspaceCaseSummary } from '@/lib/workspace/cases';
import { calculateWorkspaceTerm, workspaceTermStorageKey, type WorkspaceTermMode, type WorkspaceTermRecord } from '@/lib/workspace/terms';
import { AGENDA_CHANGED_EVENT, readAgendaEvents, writeAgendaEvents, type AgendaEvent, type AgendaPriority } from '@/lib/workspace/agenda';
import type { LegalWorkspaceCaseContext } from '@/context/LegalWorkspaceContext';
import { LocalImportPanel } from './LocalImportPanel';
import { AnalyticsPanel } from './AnalyticsPanel';

export type WorkspaceModule =
  | 'inicio'
  | 'expedientes'
  | 'terminos'
  | 'jurisprudencia'
  | 'biblioteca'
  | 'alertas'
  | 'configuracion'
  | 'ayuda'
  | 'universal'
  | 'initial_writings'
  | 'responses_resources'
  | 'my-templates';

interface WorkspaceModulesViewProps {
  mode: WorkspaceModule;
  onNavigate: (mode: WorkspaceModule) => void;
  onCaseSelected?: (caseSummary: WorkspaceCaseSummary | null) => void;
  onOpenCase?: (caseSummary: WorkspaceCaseSummary) => void | Promise<void>;
  activeCase?: LegalWorkspaceCaseContext | null;
}

const muted = 'text-slate-500';
const card = 'rounded-2xl border border-slate-200 bg-white shadow-[0_5px_18px_rgba(15,23,42,.045)]';
const input = 'h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-[#0B2545] focus:bg-white focus:ring-2 focus:ring-[#0B2545]/10';

function Icon({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>{children}</span>;
}

function authorityTypeLabel(type: string): string {
  return ({ JURISPRUDENCE: 'Jurisprudencia', THESIS: 'Tesis', PRECEDENT: 'Precedente', STATUTE: 'Ley', CODE: 'Código', REGULATION: 'Reglamento' } as Record<string, string>)[type] || 'Criterio jurídico';
}

function verificationLabel(status: WorkspaceAuthorityResult['verificationStatus']): string {
  return ({ VERIFIED: 'Verificado', REQUIRES_OFFICIAL_CONFIRMATION: 'Requiere confirmar fuente oficial', UNVERIFIED: 'Sin confirmar', UNKNOWN: 'Estado no disponible' } as Record<string, string>)[status];
}

function sourceLabel(source?: string): string {
  if (source === 'SCJN') return 'Semanario Judicial / SCJN';
  if (source === 'CORPUS_IURIS') return 'Fuente secundaria de investigación';
  if (source === 'DOF') return 'Diario Oficial de la Federación';
  return 'Fuente jurídica';
}

function Header({ title, eyebrow, description, action }: { title: string; eyebrow: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[.18em] text-[#B58A5A]">{eyebrow}</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#0B2545]">{title}</h1>
        <p className={`mt-1 text-sm ${muted}`}>{description}</p>
      </div>
      {action}
    </div>
  );
}

function RealResearchView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WorkspaceAuthorityResult[]>([]);
  const [selected, setSelected] = useState<WorkspaceAuthorityResult | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function search() {
    if (query.trim().length < 3) { setStatus('Escribe al menos 3 caracteres.'); return; }
    setLoading(true); setHasError(false); setStatus('Consultando fuentes jurídicas…');
    try {
      const response = await fetch('/api/workspace/research?q=' + encodeURIComponent(query.trim()));
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error('RESEARCH_UNAVAILABLE');
      setResults(payload.results || []); setSelected(null);
      if (payload.status === 'FAIL' && !payload.results?.length) {
        setHasError(true);
        setStatus('El servicio de investigación jurídica no está disponible en este momento.');
       } else {
         setStatus(payload.results?.length ? `${payload.results.length} resultados verificables o pendientes de confirmar` : 'No encontramos criterios verificables para esta búsqueda.');
      }
    } catch { setResults([]); setHasError(true); setStatus('El servicio de investigación jurídica no está disponible en este momento.'); }
    finally { setLoading(false); }
  }

   return <WorkspaceFrame title="Jurisprudencia SCJN" eyebrow="Investigación jurídica" description="Consulta criterios reales conservando registro, fuente y estado de verificación."><div className="grid grid-cols-1 gap-4 xl:grid-cols-[210px_minmax(0,1fr)_300px]"><aside className={`${card} h-fit p-4`}><h2 className="text-sm font-extrabold text-[#0B2545]">Criterios de lectura</h2><p className="mt-3 text-xs leading-relaxed text-slate-500">Los resultados secundarios se muestran como pendientes de confirmar y no se presentan como autoridad verificada.</p><div className="mt-4 rounded-xl bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">Confirma siempre la fuente oficial antes de incorporar un criterio al escrito.</div></aside><section className="min-w-0"><form onSubmit={(event) => { event.preventDefault(); void search(); }} className={`${card} flex items-center gap-2 p-3`}><Icon className="text-slate-400">search</Icon><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Buscar rubro, registro o texto…" /><button disabled={loading} type="submit" className="rounded-lg bg-[#0B2545] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{loading ? 'Buscando…' : 'Buscar'}</button></form><div className="mt-2 flex items-center justify-between gap-3"><p className="text-xs text-slate-500" aria-live="polite">{status}</p>{hasError && <button type="button" onClick={() => void search()} className="text-xs font-bold text-[#0B5ED7]">Reintentar</button>}</div><div className="mt-4 space-y-3">{results.map((result) => <article key={result.id} role="button" tabIndex={0} onClick={() => setSelected(result)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelected(result); }} className={`${card} cursor-pointer p-4 hover:border-[#B58A5A] ${selected?.id === result.id ? 'border-[#0B2545] ring-1 ring-[#0B2545]' : ''}`}><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">{authorityTypeLabel(result.tipo)}</span><span className="text-xs text-slate-400">Registro {result.registroDigital || 'no informado'}</span></div><h3 className="mt-3 text-sm font-extrabold leading-snug text-[#0B2545]">{result.rubro}</h3><p className="mt-2 text-xs leading-relaxed text-slate-500">{result.snippet || 'La fuente no expuso un fragmento en esta consulta.'}</p><div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-400"><span>{sourceLabel(result.source)}</span><span>·</span><span>{verificationLabel(result.verificationStatus)}</span></div></article>)}{!hasError && !loading && query && results.length === 0 && <div className={`${card} p-6 text-center text-sm text-slate-500`}>No encontramos criterios verificables para esta búsqueda.</div>}</div></section><aside className={`${card} p-5`}><p className="text-xs font-bold uppercase tracking-wide text-[#B58A5A]">Criterio seleccionado</p>{selected ? <><h2 className="mt-3 text-lg font-extrabold text-[#0B2545]">{selected.rubro}</h2><p className="mt-3 text-xs text-slate-600">Estado: {verificationLabel(selected.verificationStatus)}</p><p className="mt-1 text-xs text-slate-600">Fuente: {sourceLabel(selected.source)}</p>{selected.officialUrl && <a href={selected.officialUrl} target="_blank" rel="noreferrer" className="mt-5 block text-xs font-bold text-[#0B5ED7]">Abrir fuente consultada →</a>}</> : <p className="mt-3 text-sm leading-relaxed text-slate-600">Selecciona un resultado real para consultar su ficha y fuente.</p>}</aside></div></WorkspaceFrame>;
}

function RealLibraryView() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<WorkspaceLibraryItem[]>([]);
  const [status, setStatus] = useState('Cargando catálogo jurídico…');
  const [hasError, setHasError] = useState(false);
  useEffect(() => { fetch('/api/workspace/library', { cache: 'no-store' }).then(async (response) => { const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error('LIBRARY_UNAVAILABLE'); return payload; }).then((payload) => { const nextItems = Array.isArray(payload.items) ? payload.items : []; setItems(nextItems); setStatus(nextItems.length ? `${nextItems.length} ordenamientos disponibles` : 'El catálogo jurídico no está disponible en este momento.'); }).catch(() => { setHasError(true); setStatus('El catálogo jurídico no está disponible en este momento.'); }); }, []);
  const filtered = useMemo(() => items.filter((item) => `${item.title} ${item.abbreviation}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [items, query]);
   return <WorkspaceFrame title="Biblioteca Jurídica" eyebrow="Centro documental" description="Catálogo de legislación para consulta, con referencia y enlace a publicación oficial."><LocalImportPanel /><div className="grid grid-cols-1 gap-4 xl:grid-cols-[190px_minmax(0,1fr)_280px]"><aside className={`${card} h-fit p-4`}><h2 className="text-sm font-extrabold text-[#0B2545]">Alcance</h2><div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">Aquí se consultan ordenamientos jurídicos. Los machotes reutilizables pertenecen a Mis Plantillas y los criterios a Jurisprudencia.</div></aside><section><div className={`${card} flex items-center gap-2 p-3`}><Icon className="text-slate-400">search</Icon><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Buscar ley, código o sigla…" /></div><div className="mt-2 flex items-center justify-between gap-3"><p className="text-xs text-slate-500" aria-live="polite">{status}</p>{hasError && <button type="button" onClick={() => window.location.reload()} className="text-xs font-bold text-[#0B5ED7]">Reintentar</button>}</div><div className="mt-4 grid gap-3 sm:grid-cols-2">{filtered.map((item) => <article key={item.id} className={`${card} p-4`}><Icon className="text-[#B58A5A]">menu_book</Icon><h3 className="mt-3 text-sm font-extrabold text-[#0B2545]">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.abbreviation} · Última reforma: {item.lastReform || 'no informada'}</p><a href={item.officialUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-xs font-bold text-[#0B5ED7]">Abrir publicación oficial →</a></article>)}{!hasError && filtered.length === 0 && <div className={`${card} p-6 text-center text-sm text-slate-500 sm:col-span-2`}>{query ? 'No hay ordenamientos que coincidan.' : 'No hay ordenamientos disponibles.'}</div>}</div></section><aside className={`${card} p-5`}><p className="text-xs font-bold uppercase tracking-wide text-[#B58A5A]">Fuente de referencia</p><div className="mt-4 rounded-xl bg-slate-50 p-4"><p className="text-sm font-bold text-[#0B2545]">Catálogo jurídico local</p><p className="mt-1 text-xs leading-relaxed text-slate-500">La consulta conserva la referencia de trabajo y enlaza la publicación oficial disponible.</p></div></aside></div></WorkspaceFrame>;
}

function RealAlertsView() {
   const [query, setQuery] = useState('');
   const [results, setResults] = useState<WorkspaceAuthorityResult[]>([]);
   const [status, setStatus] = useState('Aún no se ha consultado el Diario Oficial.');
   const [lastUpdated, setLastUpdated] = useState<string | null>(null);
   const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
   async function search() { setLoading(true); setHasError(false); setStatus('Consultando publicaciones oficiales…'); try { const response = await fetch('/api/workspace/alerts?q=' + encodeURIComponent(query.trim()), { cache: 'no-store' }); const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error('ALERTS_UNAVAILABLE'); const nextResults = Array.isArray(payload.results) ? payload.results : []; setResults(nextResults); setLastUpdated(new Date().toISOString()); setStatus(nextResults.length ? `${nextResults.length} publicaciones verificables` : 'No encontramos publicaciones verificables para esta consulta.'); } catch { setResults([]); setHasError(true); setStatus('El servicio de publicaciones oficiales no está disponible en este momento.'); } finally { setLoading(false); } }
   return <WorkspaceFrame title="Alertas DOF y Boletín" eyebrow="Novedades legales" description="Consulta publicaciones oficiales bajo demanda; la pantalla no simula vigilancia automática."><section className="max-w-[1100px]"><form onSubmit={(event) => { event.preventDefault(); void search(); }} className={`${card} p-4`}><div className="flex flex-col gap-3 md:flex-row"><input value={query} onChange={(event) => setQuery(event.target.value)} className={input} placeholder="Filtrar por título de publicación…" /><button disabled={loading} type="submit" className="rounded-xl bg-[#0B2545] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{loading ? 'Consultando…' : 'Actualizar publicaciones'}</button></div></form><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-slate-500" aria-live="polite">{status}</p><p className="mt-1 text-[11px] text-slate-400">Fuente: Diario Oficial de la Federación (SIDOF){lastUpdated ? ` · Última consulta: ${new Date(lastUpdated).toLocaleString('es-MX')}` : ''}</p></div>{hasError && <button type="button" onClick={() => void search()} className="text-xs font-bold text-[#0B5ED7]">Reintentar</button>}</div><div className="mt-4 space-y-3">{results.map((result) => <article key={result.id} className={`${card} flex gap-3 p-4`}><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#B58A5A]" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-extrabold text-[#0B2545]">{result.rubro}</h3><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">Fuente oficial</span></div><p className="mt-1 text-xs text-slate-500">{result.snippet || 'La publicación no expuso descripción adicional en esta consulta.'}</p>{result.officialUrl && <a href={result.officialUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-[#0B5ED7]">Abrir publicación oficial →</a>}</div></article>)}{!loading && results.length === 0 && <div className={`${card} p-6 text-center text-sm text-slate-500`}>{hasError ? 'No fue posible consultar las publicaciones.' : 'Consulta para cargar publicaciones reales del Diario Oficial.'}</div>}</div></section></WorkspaceFrame>;
}

function RealExpedientesView({ onCaseSelected, onOpenCase }: Pick<WorkspaceModulesViewProps, 'onCaseSelected' | 'onOpenCase'>) {
  const [cases, setCases] = useState<WorkspaceCaseSummary[]>([]);
  const [status, setStatus] = useState('Cargando asuntos persistidos…');
  const [selected, setSelected] = useState<WorkspaceCaseSummary | null>(null);
  const [query, setQuery] = useState('');
  const [matterFilter, setMatterFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const loadCases = React.useCallback(async () => {
    setLoading(true);
    setHasError(false);
    setStatus('Cargando asuntos persistidos…');
    try {
      const response = await fetch('/api/workspace/cases', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error('CASES_UNAVAILABLE');
      const nextCases = Array.isArray(payload.cases) ? payload.cases : [];
      setCases(nextCases);
      setStatus(`${nextCases.length} asuntos persistidos`);
    } catch {
      setHasError(true);
      setCases([]);
      setStatus('No fue posible cargar los asuntos persistidos.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadCases();
  }, [loadCases]);
  const matters = useMemo(() => Array.from(new Set(cases.map((item) => item.matter).filter((item): item is string => Boolean(item)))).sort(), [cases]);
  const filteredCases = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return cases.filter((item) => {
      const matchesMatter = matterFilter === 'all' || item.matter === matterFilter;
      const haystack = `${item.title} ${item.expediente || ''} ${item.matter || ''} ${item.actor || ''} ${item.counterparty || ''}`.toLocaleLowerCase();
      return matchesMatter && (!normalized || haystack.includes(normalized));
    });
  }, [cases, matterFilter, query]);
  function selectCase(item: WorkspaceCaseSummary) {
    setSelected(item);
    onCaseSelected?.(item);
  }
  function closeCase() {
    setSelected(null);
    onCaseSelected?.(null);
  }
  return <WorkspaceFrame title="Expedientes" eyebrow="Gestor de asuntos" description="Asuntos basados únicamente en borradores persistidos; los campos ausentes permanecen sin clasificar."><section className={`${card} p-4`}><div className="mb-4 flex flex-col gap-3 md:flex-row"><input value={query} onChange={(event) => setQuery(event.target.value)} className={input} placeholder="Buscar por expediente, documento o parte…" aria-label="Buscar expedientes" /><select value={matterFilter} onChange={(event) => setMatterFilter(event.target.value)} className={`${input} md:max-w-[220px]`} aria-label="Filtrar expedientes por materia"><option value="all">Todas las materias</option>{matters.map((matter) => <option key={matter} value={matter}>{matter}</option>)}</select></div><div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs text-slate-500" aria-live="polite">{status}</p>{hasError && <button type="button" onClick={() => void loadCases()} className="text-xs font-bold text-[#0B5ED7]">Reintentar</button>}</div>{loading ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500"><Icon className="text-[#B58A5A]">progress_activity</Icon><p className="mt-2">Cargando asuntos persistidos…</p></div> : hasError ? <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center"><Icon className="text-red-600">error</Icon><h2 className="mt-3 text-lg font-extrabold text-[#0B2545]">No se pudo cargar Expedientes</h2><p className="mt-1 text-sm text-red-700">Revisa la conexión del despacho e inténtalo de nuevo.</p></div> : filteredCases.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center"><Icon className="text-[#B58A5A]">folder_open</Icon><h2 className="mt-3 text-lg font-extrabold text-[#0B2545]">{cases.length ? 'No hay coincidencias' : 'Sin borradores persistidos'}</h2><p className="mt-1 text-sm text-slate-500">{cases.length ? 'Modifica la búsqueda o la materia.' : 'No se muestran expedientes de demostración ni asociaciones inventadas.'}</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400"><th className="px-3 py-3">Documento</th><th className="px-3 py-3">Expediente</th><th className="px-3 py-3">Materia</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Última actividad</th><th className="px-3 py-3">Acción</th></tr></thead><tbody>{filteredCases.map((item) => <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50"><td className="px-3 py-3 font-bold text-[#0B2545]">{item.title}</td><td className="px-3 py-3">{item.expediente || 'No informado'}</td><td className="px-3 py-3">{item.matter || 'No informada'}</td><td className="px-3 py-3">{item.status || 'No informado'}</td><td className="px-3 py-3 text-slate-500">{new Date(item.updatedAt).toLocaleDateString('es-MX')}</td><td className="px-3 py-3"><button type="button" onClick={() => selectCase(item)} className="font-bold text-[#0B5ED7]">Abrir ficha</button></td></tr>)}</tbody></table></div>}{selected && <div className="mt-4 rounded-xl bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-[#B58A5A]">Ficha persistida</p><h2 className="mt-1 text-sm font-extrabold text-[#0B2545]">{selected.title}</h2></div><button type="button" onClick={closeCase} className="text-xs font-bold text-slate-500">Cerrar</button></div><p className="mt-3 text-xs text-slate-600">ID real: {selected.id}</p><p className="mt-1 text-xs text-slate-600">Expediente: {selected.expediente || 'No informado'} · Jurisdicción: {selected.jurisdiction || 'No informada'}</p><p className="mt-1 text-xs text-slate-600">Fuentes asociadas: {selected.sourceCount}</p>{selected.actor && <p className="mt-1 text-xs text-slate-600">Parte promovente: {selected.actor}</p>}{selected.counterparty && <p className="mt-1 text-xs text-slate-600">Contraparte: {selected.counterparty}</p>}{onOpenCase && <button type="button" onClick={() => void onOpenCase(selected)} className="mt-4 rounded-xl bg-[#0B2545] px-4 py-2 text-xs font-bold text-white">Abrir borrador asociado</button>}</div>}</section></WorkspaceFrame>;
}

const agendaPriorityStyles: Record<AgendaPriority, { label: string; dot: string; chip: string; border: string }> = {
  HIGH: { label: 'Alta', dot: 'bg-red-600', chip: 'bg-red-50 text-red-800', border: 'border-red-200' },
  MEDIUM: { label: 'Media', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800', border: 'border-amber-200' },
  LOW: { label: 'Baja', dot: 'bg-sky-600', chip: 'bg-sky-50 text-sky-800', border: 'border-sky-200' },
};

function calendarCells(month: Date): Array<string | null> {
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, monthIndex, 1, 12));
  const offset = (firstDay.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0, 12)).getUTCDate();
  return [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`)];
}

function RealTermsView({ activeCase }: { activeCase?: LegalWorkspaceCaseContext | null }) {
  const [date, setDate] = useState('');
  const [days, setDays] = useState('');
  const [mode, setMode] = useState<WorkspaceTermMode>('CALENDAR');
  const [includeStart, setIncludeStart] = useState(false);
  const [jurisdiction, setJurisdiction] = useState('');
  const [excludedDate, setExcludedDate] = useState('');
  const [excludedDates, setExcludedDates] = useState<string[]>([]);
  const [result, setResult] = useState<{ date?: string; assumptions?: string[]; error?: string }>({});
  const [calculatedAt, setCalculatedAt] = useState<string | null>(null);
  const [agenda, setAgenda] = useState<AgendaEvent[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12));
  });
  const [selectedAgendaDate, setSelectedAgendaDate] = useState<string | null>(null);
  const storageKey = workspaceTermStorageKey(activeCase?.caseId);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as WorkspaceTermRecord;
      if (!saved?.input || !saved?.result) return;
      setDate(saved.input.startDate || '');
      setDays(String(saved.input.days || ''));
      setMode(saved.input.mode || 'CALENDAR');
      setIncludeStart(Boolean(saved.input.includeStart));
      setJurisdiction(saved.input.jurisdiction || '');
      setExcludedDates(Array.isArray(saved.input.excludedDates) ? saved.input.excludedDates : []);
      setResult({ date: saved.result.calculatedDate, assumptions: saved.result.assumptions });
      setCalculatedAt(saved.calculatedAt || null);
    } catch { /* Un archivo local inválido no bloquea el cálculo actual. */ }
  }, [storageKey]);

  useEffect(() => {
    const refreshAgenda = () => setAgenda(readAgendaEvents());
    refreshAgenda();
    window.addEventListener(AGENDA_CHANGED_EVENT, refreshAgenda);
    return () => window.removeEventListener(AGENDA_CHANGED_EVENT, refreshAgenda);
  }, []);

  const visibleAgenda = useMemo(() => {
    if (!activeCase?.caseId) return agenda;
    return agenda.filter((event) => event.caseId === activeCase.caseId || (!event.caseId && event.expediente === activeCase.expedienteNumber));
  }, [activeCase, agenda]);
  const agendaByDate = useMemo(() => {
    const grouped = new Map<string, AgendaEvent[]>();
    visibleAgenda.forEach((event) => grouped.set(event.dueDate, [...(grouped.get(event.dueDate) || []), event]));
    return grouped;
  }, [visibleAgenda]);
  const monthLabel = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(calendarMonth);
  const selectedDayEvents = selectedAgendaDate ? agendaByDate.get(selectedAgendaDate) || [] : [];

  function changeCalendarMonth(offset: number) {
    setCalendarMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + offset, 1, 12)));
    setSelectedAgendaDate(null);
  }

  function calculate() {
    try {
      const input = { startDate: date, days: Number(days), mode, includeStart, excludedDates, jurisdiction };
      const calculated = calculateWorkspaceTerm(input);
      const now = new Date().toISOString();
      setResult({ date: calculated.calculatedDate, assumptions: calculated.assumptions });
      setCalculatedAt(now);
      try { localStorage.setItem(storageKey, JSON.stringify({ input, result: calculated, calculatedAt: now, caseId: activeCase?.caseId, expediente: activeCase?.expedienteNumber } satisfies WorkspaceTermRecord)); } catch { /* La calculadora sigue funcionando aunque el almacenamiento local no esté disponible. */ }
    } catch (error) { setResult({ error: error instanceof Error ? error.message : 'Captura fecha y días válidos.' }); }
  }

  function addExcludedDate() { if (excludedDate && !excludedDates.includes(excludedDate)) setExcludedDates((current) => [...current, excludedDate].sort()); setExcludedDate(''); }

  function updateAgendaEvent(id: string, update: Partial<Pick<AgendaEvent, 'status' | 'priority'>>) {
    const next = readAgendaEvents().map((event) => event.id === id ? { ...event, ...update, updatedAt: new Date().toISOString() } : event);
    writeAgendaEvents(next);
    setAgenda(next);
  }

  return <WorkspaceFrame title="Cómputo de Términos" eyebrow="Herramienta procesal" description="Cálculo orientativo. Verifica los días inhábiles y las reglas aplicables antes de utilizar la fecha.">
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(460px,1.08fr)]">
      <section className={`${card} p-5`}>
        <div className="mb-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{activeCase?.caseId ? <>Asunto asociado: <strong className="text-[#0B2545]">{activeCase.expedienteNumber || activeCase.caseId}</strong></> : 'Sin expediente asociado: los eventos se muestran como agenda general del equipo.'}</div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">Fecha inicial<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={`${input} mt-1.5`} /></label>
          <label className="text-xs font-bold text-slate-600">Días<input type="number" min="1" value={days} onChange={(event) => setDays(event.target.value)} className={`${input} mt-1.5`} /></label>
          <label className="text-xs font-bold text-slate-600">Modo<select value={mode} onChange={(event) => setMode(event.target.value as WorkspaceTermMode)} className={`${input} mt-1.5`}><option value="CALENDAR">Calendario natural</option><option value="BUSINESS">Días hábiles provisionales</option></select></label>
          <label className="text-xs font-bold text-slate-600">Jurisdicción<input value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} className={`${input} mt-1.5`} placeholder="Ej. federal" /></label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600 md:col-span-2"><input type="checkbox" checked={includeStart} onChange={(event) => setIncludeStart(event.target.checked)} /> Incluir fecha inicial</label>
        </div>
        <div className="mt-5 rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-[#0B2545]">Fechas excluidas configuradas</p>
          <div className="mt-3 flex gap-2"><input type="date" value={excludedDate} onChange={(event) => setExcludedDate(event.target.value)} className={input} /><button type="button" onClick={addExcludedDate} className="shrink-0 rounded-xl border border-slate-300 px-3 text-xs font-bold text-[#0B2545]">Agregar</button></div>
          {excludedDates.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{excludedDates.map((item) => <button key={item} type="button" onClick={() => setExcludedDates((current) => current.filter((dateItem) => dateItem !== item))} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-700">{item} ×</button>)}</div>}
          <p className="mt-2 text-[11px] text-slate-500">Este cálculo usa un calendario genérico y no consulta el calendario oficial del Poder Judicial Federal; las fechas excluidas sólo aplican a este cálculo.</p>
        </div>
        <button type="button" onClick={calculate} className="mt-5 rounded-xl bg-[#0B2545] px-4 py-3 text-xs font-bold text-white">Calcular</button>
        {result.error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">{result.error}</p>}
        {result.date && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-xs leading-relaxed text-amber-900"><p className="font-extrabold">Fecha calculada: {new Date(`${result.date}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</p><p className="mt-2 font-bold">Advertencia: resultado PROVISIONAL.</p><p className="mt-1">El conteo usa un calendario genérico; no incorpora el calendario oficial de días inhábiles del Poder Judicial Federal.</p><p className="mt-1">La fecha puede cambiar porque festivos oficiales, suspensiones de labores o acuerdos específicos pueden mover la fecha real. Verifica la fecha aplicable antes de utilizarla.</p><ul className="mt-1 list-disc pl-4">{result.assumptions?.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>{calculatedAt && <p className="mt-3 text-[11px]">Último cálculo guardado en este equipo: {new Date(calculatedAt).toLocaleString('es-MX')}</p>}</div>}
      </section>

      <section className={`${card} self-start p-4`} aria-label="Agenda de términos procesales">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#B58A5A]">Seguimiento automático</p><h2 className="mt-1 text-xl font-extrabold text-[#0B2545]">Agenda del expediente</h2><p className="mt-1 text-xs text-slate-500">Los eventos se crean desde términos detectados en documentos generados.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{visibleAgenda.length} {visibleAgenda.length === 1 ? 'evento' : 'eventos'}</span></div>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold"><span className="flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-red-800"><i className="h-2 w-2 rounded-full bg-red-600" /> Alta</span><span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-800"><i className="h-2 w-2 rounded-full bg-amber-500" /> Media</span><span className="flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-sky-800"><i className="h-2 w-2 rounded-full bg-sky-600" /> Baja</span></div>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><button type="button" aria-label="Mes anterior" onClick={() => changeCalendarMonth(-1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-lg font-bold text-[#0B2545] hover:bg-white">‹</button><p className="text-sm font-extrabold capitalize text-[#0B2545]">{monthLabel}</p><button type="button" aria-label="Mes siguiente" onClick={() => changeCalendarMonth(1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-lg font-bold text-[#0B2545] hover:bg-white">›</button></div>
        <div className="!mb-0 mt-3 grid !grid-cols-7 !gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => <span key={day} className="py-1">{day}</span>)}</div>
        <div className="mx-auto !mb-0 mt-3 grid !grid-cols-7 !gap-1 max-w-[360px] rounded-xl border border-slate-200 bg-[#fbfaf7] p-1.5" aria-label="Calendario mensual de términos">{calendarCells(calendarMonth).map((day, index) => { const events = day ? agendaByDate.get(day) || [] : []; return <div key={`${day || 'empty'}-${index}`} className="min-w-0">{day ? <button type="button" aria-label={`Seleccionar eventos del ${day}`} aria-pressed={selectedAgendaDate === day} onClick={() => setSelectedAgendaDate(day)} className={`flex min-h-[34px] w-full flex-col items-center justify-center rounded-lg border text-[11px] font-bold transition ${selectedAgendaDate === day ? 'border-[#0B2545] bg-white text-[#0B2545] shadow-sm' : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white'}`}><span>{Number(day.slice(-2))}</span><span aria-label="Círculos de prioridad" className="mt-0.5 flex min-h-2 items-center gap-1">{events.slice(0, 4).map((event) => <i key={event.id} title={`${agendaPriorityStyles[event.priority].label}: ${event.title}`} className={`h-2 w-2 rounded-full ${agendaPriorityStyles[event.priority].dot} ${event.status === 'COMPLETED' ? 'opacity-40' : ''}`} />)}</span></button> : <div className="min-h-[34px]" aria-hidden="true" />}</div>; })}</div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-live="polite">{selectedAgendaDate ? <><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#B58A5A]">Día seleccionado</p><h3 className="mt-1 text-sm font-extrabold capitalize text-[#0B2545]">{new Date(`${selectedAgendaDate}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3></div><button type="button" onClick={() => setSelectedAgendaDate(null)} className="text-[11px] font-bold text-slate-500 hover:text-[#0B2545]">Cerrar</button></div>{selectedDayEvents.length === 0 ? <p className="mt-4 text-xs text-slate-500">No hay términos registrados para este día.</p> : <div className="mt-4 space-y-2">{selectedDayEvents.map((event) => <article key={event.id} className={`rounded-xl border bg-white p-3 ${event.status === 'COMPLETED' ? 'border-slate-200 opacity-70' : agendaPriorityStyles[event.priority].border}`}><div className="flex items-start gap-3"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${agendaPriorityStyles[event.priority].dot}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className={`text-xs font-extrabold text-[#0B2545] ${event.status === 'COMPLETED' ? 'line-through' : ''}`}>{event.title}</h4><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${agendaPriorityStyles[event.priority].chip}`}>{agendaPriorityStyles[event.priority].label}</span></div><p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">Fuente: “{event.sourceText}”</p>{event.needsReview && <p className="mt-1 text-[11px] font-bold text-amber-700">Revisar fecha derivada del documento.</p>}<div className="mt-2 flex flex-wrap items-center gap-2"><label className="text-[10px] font-bold text-slate-500">Prioridad<select aria-label={`Prioridad de ${event.title}`} value={event.priority} onChange={(change) => updateAgendaEvent(event.id, { priority: change.target.value as AgendaPriority })} className="ml-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-bold text-slate-700"><option value="HIGH">Alta</option><option value="MEDIUM">Media</option><option value="LOW">Baja</option></select></label><button type="button" onClick={() => updateAgendaEvent(event.id, { status: event.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED' })} className="min-h-[32px] rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-[#0B2545] hover:bg-white">{event.status === 'COMPLETED' ? 'Reabrir evento' : 'Marcar como atendido'}</button></div></div></div></article>)}</div>}</> : <div className="text-center"><p className="text-xs font-bold text-[#0B2545]">Selecciona un día del calendario</p><p className="mt-1 text-[11px] text-slate-500">Aquí aparecerán sus términos, fuente y acciones de seguimiento.</p></div>}</div>
      </section>
    </div>
  </WorkspaceFrame>;
}

 type UserFacingSystemStatus = 'Operativo' | 'Requiere atención' | 'No disponible';

 interface UserFacingSystemItem {
   label: string;
   status: UserFacingSystemStatus;
   detail: string;
 }

 const initialSystemStatus: UserFacingSystemItem[] = [
   { label: 'Base de datos', status: 'Requiere atención', detail: 'Verificando disponibilidad del despacho.' },
   { label: 'Investigación jurídica', status: 'Requiere atención', detail: 'Confirma la disponibilidad al realizar una consulta.' },
   { label: 'Publicaciones oficiales', status: 'Operativo', detail: 'Consulta bajo demanda; no hay monitoreo automático.' },
   { label: 'Generación documental', status: 'No disponible', detail: 'Verificando disponibilidad de generación.' },
 ];

 function systemStatusClass(status: UserFacingSystemStatus): string {
   if (status === 'Operativo') return 'bg-emerald-50 text-emerald-700';
   if (status === 'Requiere atención') return 'bg-amber-50 text-amber-800';
   return 'bg-red-50 text-red-700';
 }

 function UserFacingSystemStatusPanel() {
   const [items, setItems] = useState<UserFacingSystemItem[]>(initialSystemStatus);

   useEffect(() => {
     let cancelled = false;
     const readJson = async (url: string) => {
       try {
         const response = await fetch(url, { cache: 'no-store' });
         return { ok: response.ok, payload: await response.json() as Record<string, any> };
       } catch {
         return { ok: false, payload: {} as Record<string, any> };
       }
     };
     void Promise.all([readJson('/api/health/readiness'), readJson('/api/health/providers')]).then(([readiness, providers]) => {
       if (cancelled) return;
       const database = readiness.payload.components?.database;
       const databaseStatus: UserFacingSystemStatus = database?.status === 'READY'
         ? 'Operativo'
         : database?.status === 'NOT_CONFIGURED'
           ? 'No disponible'
           : 'Requiere atención';
       const availableProviders = Array.isArray(providers.payload.providers) ? providers.payload.providers : [];
       const remoteAvailable = availableProviders.some((provider: any) => provider.id !== 'local' && provider.available);
       const localAvailable = availableProviders.some((provider: any) => provider.id === 'local' && provider.available);
       const generationStatus: UserFacingSystemStatus = remoteAvailable ? 'Operativo' : localAvailable ? 'Requiere atención' : 'No disponible';
       setItems([
         { label: 'Base de datos', status: databaseStatus, detail: databaseStatus === 'Operativo' ? 'Disponible para el despacho.' : 'La disponibilidad requiere atención.' },
         initialSystemStatus[1],
         initialSystemStatus[2],
         { label: 'Generación documental', status: generationStatus, detail: generationStatus === 'Operativo' ? 'Disponible para generar documentos.' : generationStatus === 'Requiere atención' ? 'Disponible en modo auxiliar.' : 'No hay generación disponible.' },
       ]);
     });
     return () => { cancelled = true; };
   }, []);

   return <div className="mt-5 grid gap-2 sm:grid-cols-2">{items.map((item) => <div key={item.label} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-[#0B2545]">{item.label}</p><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${systemStatusClass(item.status)}`}>{item.status}</span></div><p className="mt-2 text-[11px] leading-relaxed text-slate-500">{item.detail}</p></div>)}</div>;
 }

 function RealHomeView({ onNavigate }: { onNavigate: (mode: WorkspaceModule) => void }) {
  const [dashboard, setDashboard] = useState<any>(null);
  const [status, setStatus] = useState('Cargando métricas persistidas…');
  useEffect(() => { fetch('/api/workspace/dashboard', { cache: 'no-store' }).then(async (response) => { const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.message || 'No fue posible cargar métricas.'); return payload; }).then((payload) => { setDashboard(payload); setStatus('Datos reales de LegalDraft y GenerationJob.'); }).catch((error) => setStatus(error instanceof Error ? error.message : 'No fue posible cargar métricas.')); }, []);
  const stats = dashboard?.stats || { generated: 0, review: 0, failed: 0, pendingReview: 0, totalDocuments: 0, averageGenerationMs: null };
  const actions: Array<[string, string, string, WorkspaceModule]> = [['gavel', 'Motor Jurídico', 'Abrir generación', 'universal'], ['description', 'Escritos Iniciales', 'Abrir módulo', 'initial_writings'], ['article', 'Contestaciones', 'Abrir módulo', 'responses_resources'], ['folder_special', 'Mis Plantillas', 'Abrir biblioteca personal', 'my-templates'], ['folder_open', 'Expedientes', `${stats.totalDocuments} documentos persistidos`, 'expedientes']];
  const hasDailyData = Boolean(dashboard?.daily?.some((item: any) => item.count > 0));
  const healthLabel = !dashboard ? 'No disponible' : dashboard.health.status === 'attention' ? 'Requiere atención' : 'Operativo';
  return <WorkspaceFrame title="Inicio" eyebrow="Centro de trabajo" description="Métricas y actividad derivadas de datos persistidos; control operativo del despacho."><div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="Generados" value={stats.generated} tone="green" /><Metric label="Requieren revisión" value={stats.review} tone="amber" /><Metric label="Fallidos" value={stats.failed} tone="red" /><Metric label="Promedio de generación" value={stats.averageGenerationMs ? `${Math.round(stats.averageGenerationMs / 1000)} s` : 'Sin datos'} tone="blue" /></div><div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]"><section className={`${card} p-5`}><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold text-[#0B2545]">Generaciones · últimos 30 días</h2><p className="mt-1 text-xs text-slate-500">Solo se grafican documentos creados en persistencia.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{stats.totalDocuments} total</span></div>{hasDailyData ? <div className="mt-6 flex h-36 items-end gap-1.5">{(dashboard?.daily || []).map((item: any) => <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${item.date}: ${item.count}`}><div className="w-full rounded-t bg-[#0B2545]" style={{ height: `${Math.max(10, Math.min(100, item.count * 22))}%` }} /><span className="text-[8px] text-slate-400">{item.date.slice(8)}</span></div>)}</div> : <div className="mt-6 flex h-36 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">{dashboard ? 'Sin generaciones registradas en este periodo.' : 'Métricas no disponibles en este momento.'}</div>}</section><section className={`${card} p-5`}><div className="flex items-center justify-between"><h2 className="text-lg font-extrabold text-[#0B2545]">Estado del sistema</h2><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${healthLabel === 'Operativo' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{healthLabel}</span></div><div className="mt-4 space-y-3 text-xs text-slate-600"><p>Persistencia documental: <strong className="text-[#0B2545]">{dashboard?.health?.persistedDocuments ?? '—'}</strong></p><p>Trabajos registrados: <strong className="text-[#0B2545]">{dashboard?.health?.persistedJobs ?? '—'}</strong></p><p>Revisión pendiente: <strong className="text-amber-700">{stats.pendingReview}</strong></p>{dashboard?.health?.latestFailure && <p className="rounded-lg bg-red-50 p-2 text-red-700">Último fallo: {dashboard.health.latestFailure.code || 'GENERATION_FAILED'}</p>}</div></section></div><section className={`${card} mt-4 p-5`}><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-extrabold text-[#0B2545]">Documentos recientes</h2><span className="text-xs text-slate-500">{status}</span></div>{dashboard?.recentDocuments?.length ? <div className="mt-3 divide-y divide-slate-100">{dashboard.recentDocuments.map((item: any) => <button key={item.id} type="button" onClick={() => onNavigate('expedientes')} className="flex w-full items-center justify-between gap-3 py-3 text-left"><span className="min-w-0 truncate text-xs font-bold text-[#0B2545]">{item.title}</span><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${item.status === 'failed' ? 'bg-red-50 text-red-700' : item.status === 'review' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{item.status === 'failed' ? 'Fallido' : item.status === 'review' ? 'Revisión' : 'Generado'}</span></button>)}</div> : <p className="mt-3 text-sm text-slate-500">Aún no hay documentos persistidos para mostrar.</p>}</section><div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">{actions.map(([icon, title, value, mode]) => <button key={title} type="button" onClick={() => onNavigate(mode)} className={`${card} min-h-[104px] p-4 text-left transition hover:border-[#B58A5A]`}><Icon className="text-[#B58A5A]">{icon}</Icon><p className="mt-4 text-xs font-bold text-slate-500">{title}</p><strong className="mt-1 block text-xs font-extrabold text-[#0B2545]">{value}</strong></button>)}</div></WorkspaceFrame>;
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone: 'green' | 'amber' | 'red' | 'blue' }) {
  const colors = { green: 'border-emerald-100 bg-emerald-50 text-emerald-700', amber: 'border-amber-100 bg-amber-50 text-amber-800', red: 'border-red-100 bg-red-50 text-red-700', blue: 'border-blue-100 bg-blue-50 text-blue-700' };
  return <article className={`rounded-2xl border p-4 ${colors[tone]}`}><p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{label}</p><strong className="mt-2 block text-2xl font-extrabold">{value}</strong></article>;
}

function RealSettingsView() {
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('Cargando perfil persistido…');
  useEffect(() => { fetch('/api/workspace/lawyer-profile').then((response) => response.json()).then((payload) => { if (payload.ok) { setProfile(payload.profile || {}); setStatus(payload.isDefault ? 'Perfil predeterminado no persistido.' : 'Perfil persistido cargado.'); } else setStatus('No fue posible cargar el perfil.'); }).catch(() => setStatus('No fue posible cargar el perfil.')); }, []);
  async function save() { const response = await fetch('/api/workspace/lawyer-profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) }); setStatus(response.ok ? 'Perfil guardado.' : 'No fue posible guardar el perfil.'); }
  return <WorkspaceFrame title="Configuración" eyebrow="Preferencias del despacho" description="Analíticas, perfil y estado real de persistencia."><AnalyticsPanel /><section className={`${card} mt-5 max-w-[850px] p-5`}><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-extrabold text-[#0B2545]">Perfil del despacho</h2><p className="mt-1 text-xs text-slate-500">Estos datos se reutilizan en documentos cuando el abogado los confirma.</p></div><span className="text-xs text-slate-500">{status}</span></div><div className="mt-5 grid gap-4 md:grid-cols-2">{[['lawyerName', 'Nombre'], ['firmName', 'Despacho'], ['professionalLicense', 'Cédula profesional'], ['email', 'Correo']].map(([key, label]) => <label key={key} className="text-xs font-bold text-slate-600">{label}<input value={profile[key] || ''} onChange={(event) => setProfile((current) => ({ ...current, [key]: event.target.value }))} className={`${input} mt-1.5`} /></label>)}</div><button type="button" onClick={() => void save()} className="mt-6 rounded-xl bg-[#0B2545] px-4 py-3 text-xs font-bold text-white">Guardar perfil</button></section></WorkspaceFrame>;
}

function RealHelpView() {
  return <WorkspaceFrame title="Ayuda" eyebrow="Centro de soporte" description="Guías de uso de esta aplicación y sus estados de fuente."><section className={`${card} max-w-[900px] p-5`}><div className="grid gap-3 md:grid-cols-2">{[['Flujo de generación', 'Carga una fuente, revisa el análisis, genera y valida antes de exportar.'], ['Investigación', 'Usa la búsqueda jurídica para localizar criterios y confirma siempre la fuente oficial antes de citar.'], ['Expedientes', 'No se muestran filas hasta que exista un listado persistente disponible para el espacio.'], ['Fuentes bloqueadas', 'La pantalla informa cuando una fuente externa requiere configuración o no está disponible.']].map(([title, description]) => <article key={title} className="rounded-xl border border-slate-200 p-4"><h2 className="text-sm font-extrabold text-[#0B2545]">{title}</h2><p className="mt-2 text-xs leading-relaxed text-slate-500">{description}</p></article>)}</div></section></WorkspaceFrame>;
}

function WorkspaceFrame({ title, eyebrow, description, action, children }: { title: string; eyebrow: string; description: string; action?: string; children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1600px] px-5 py-6 md:px-8"><Header title={title} eyebrow={eyebrow} description={description} action={action ? <button type="button" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0B2545] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#081d39]"><Icon>add</Icon>{action}</button> : undefined} />{title === 'Inicio' && <UserFacingSystemStatusPanel />}{children}</div>;
}

export function WorkspaceModulesView({ mode, onNavigate, onCaseSelected, onOpenCase, activeCase }: WorkspaceModulesViewProps) {
  if (mode === 'inicio') return <RealHomeView onNavigate={onNavigate} />;
  if (mode === 'expedientes') return <RealExpedientesView onCaseSelected={onCaseSelected} onOpenCase={onOpenCase} />;
  if (mode === 'terminos') return <RealTermsView activeCase={activeCase} />;
  if (mode === 'jurisprudencia') return <RealResearchView />;
  if (mode === 'biblioteca') return <RealLibraryView />;
  if (mode === 'alertas') return <RealAlertsView />;
  if (mode === 'configuracion') return <RealSettingsView />;
  if (mode === 'ayuda') return <RealHelpView />;
  return null;
}

export default WorkspaceModulesView;
