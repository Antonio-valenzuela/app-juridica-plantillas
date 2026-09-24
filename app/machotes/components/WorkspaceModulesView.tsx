'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { WorkspaceAuthorityResult, WorkspaceLibraryItem } from '@/lib/workspace/research';
import type { WorkspaceCaseSummary } from '@/lib/workspace/cases';
import { calculateWorkspaceTerm, type WorkspaceTermMode } from '@/lib/workspace/terms';

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
}

const muted = 'text-slate-500';
const card = 'rounded-2xl border border-slate-200 bg-white shadow-[0_5px_18px_rgba(15,23,42,.045)]';
const input = 'h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-[#0B2545] focus:bg-white focus:ring-2 focus:ring-[#0B2545]/10';

function Icon({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>{children}</span>;
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

  async function search() {
    if (query.trim().length < 3) { setStatus('Escribe al menos 3 caracteres.'); return; }
    setLoading(true); setStatus('Consultando Corpus Iuris y fuente SCJN…');
    try {
      const response = await fetch('/api/workspace/research?q=' + encodeURIComponent(query.trim()));
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Consulta no disponible');
      setResults(payload.results || []); setSelected(null);
      setStatus(payload.reasons?.includes('CORPUS_AUTH_REQUIRED') ? 'Conecta Corpus Iuris para búsqueda avanzada. El fallback oficial no devolvió resultados en esta consulta.' : payload.results?.length ? `${payload.results.length} resultados reales · ${payload.sourceRepo}` : 'Sin resultados reales para esta consulta.');
    } catch (error) { setResults([]); setStatus(error instanceof Error ? error.message : 'No fue posible consultar la fuente.'); }
    finally { setLoading(false); }
  }

  return <WorkspaceFrame title="Jurisprudencia SCJN" eyebrow="Investigación jurídica" description="Consulta resultados reales conservando registro, fuente y estado de verificación."><div className="grid grid-cols-1 gap-4 xl:grid-cols-[210px_minmax(0,1fr)_300px]"><aside className={`${card} h-fit p-4`}><h2 className="text-sm font-extrabold text-[#0B2545]">Filtros de lectura</h2><p className="mt-3 text-xs leading-relaxed text-slate-500">La búsqueda usa fuentes jurídicas mexicanas; un resultado secundario no se presenta como autoridad verificada.</p><div className="mt-4 rounded-xl bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">La verificación oficial depende de la URL y disponibilidad de la fuente primaria.</div></aside><section className="min-w-0"><form onSubmit={(event) => { event.preventDefault(); void search(); }} className={`${card} flex items-center gap-2 p-3`}><Icon className="text-slate-400">search</Icon><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Buscar rubro, registro o texto…" /><button disabled={loading} type="submit" className="rounded-lg bg-[#0B2545] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{loading ? 'Buscando…' : 'Buscar'}</button></form><p className="mt-2 text-xs text-slate-500" aria-live="polite">{status}</p><div className="mt-4 space-y-3">{results.map((result) => <article key={result.id} onClick={() => setSelected(result)} className={`${card} cursor-pointer p-4 hover:border-[#B58A5A] ${selected?.id === result.id ? 'border-[#0B2545] ring-1 ring-[#0B2545]' : ''}`}><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">{result.tipo}</span><span className="text-xs text-slate-400">Registro {result.registroDigital || 'no informado'}</span></div><h3 className="mt-3 text-sm font-extrabold leading-snug text-[#0B2545]">{result.rubro}</h3><p className="mt-2 text-xs leading-relaxed text-slate-500">{result.snippet || 'La fuente no expuso un fragmento en esta consulta.'}</p><div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-400"><span>{result.source || 'fuente jurídica'}</span><span>·</span><span>{result.verificationStatus}</span></div></article>)}{!loading && query && results.length === 0 && <div className={`${card} p-6 text-center text-sm text-slate-500`}>No hay resultados reales para mostrar.</div>}</div></section><aside className={`${card} p-5`}><p className="text-xs font-bold uppercase tracking-wide text-[#B58A5A]">Criterio seleccionado</p>{selected ? <><h2 className="mt-3 text-lg font-extrabold text-[#0B2545]">{selected.rubro}</h2><p className="mt-3 text-xs text-slate-600">Estado: {selected.verificationStatus}</p>{selected.officialUrl && <a href={selected.officialUrl} target="_blank" rel="noreferrer" className="mt-5 block text-xs font-bold text-[#0B5ED7]">Abrir fuente oficial →</a>}</> : <p className="mt-3 text-sm leading-relaxed text-slate-600">Selecciona un resultado real para consultar su ficha y fuente.</p>}</aside></div></WorkspaceFrame>;
}

function RealLibraryView() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<WorkspaceLibraryItem[]>([]);
  const [status, setStatus] = useState('Cargando catálogo local de lex-mx…');
  useEffect(() => { fetch('/api/workspace/library').then((response) => response.json()).then((payload) => { setItems(payload.items || []); setStatus(`${payload.items?.length || 0} ordenamientos disponibles · fuente lex-mx local`); }).catch(() => setStatus('No fue posible cargar el catálogo real.')); }, []);
  const filtered = useMemo(() => items.filter((item) => `${item.title} ${item.abbreviation}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [items, query]);
  return <WorkspaceFrame title="Biblioteca" eyebrow="Centro documental" description="Legislación mexicana importada con referencia y enlace oficial."><div className="grid grid-cols-1 gap-4 xl:grid-cols-[190px_minmax(0,1fr)_280px]"><aside className={`${card} h-fit p-4`}><h2 className="text-sm font-extrabold text-[#0B2545]">Fuente</h2><div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">Catálogo preparado a partir de lex-mx. El contenido conserva su URL oficial; no se mezclan filas ficticias.</div></aside><section><div className={`${card} flex items-center gap-2 p-3`}><Icon className="text-slate-400">search</Icon><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Buscar ley, código o sigla…" /></div><p className="mt-2 text-xs text-slate-500">{status}</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{filtered.map((item) => <article key={item.id} className={`${card} p-4`}><Icon className="text-[#B58A5A]">menu_book</Icon><h3 className="mt-3 text-sm font-extrabold text-[#0B2545]">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.abbreviation} · Última reforma: {item.lastReform || 'no informada'}</p><a href={item.officialUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-xs font-bold text-[#0B5ED7]">Abrir fuente oficial →</a></article>)}{filtered.length === 0 && <div className={`${card} p-6 text-center text-sm text-slate-500 sm:col-span-2`}>No hay ordenamientos reales que coincidan.</div>}</div></section><aside className={`${card} p-5`}><p className="text-xs font-bold uppercase tracking-wide text-[#B58A5A]">Provenance</p><div className="mt-4 rounded-xl bg-slate-50 p-4"><p className="text-sm font-bold text-[#0B2545]">lex-mx</p><p className="mt-1 text-xs leading-relaxed text-slate-500">La fuente de trabajo es secundaria; la descarga enlaza la publicación oficial de Cámara de Diputados.</p></div></aside></div></WorkspaceFrame>;
}

function RealAlertsView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WorkspaceAuthorityResult[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  async function search() { setLoading(true); setStatus('Consultando SIDOF/DOF…'); try { const response = await fetch('/api/workspace/alerts?q=' + encodeURIComponent(query.trim())); const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.error || 'Consulta no disponible'); setResults(payload.results || []); setStatus(payload.results?.length ? `${payload.results.length} publicaciones reales · ${payload.source}` : 'No hay publicaciones reales para mostrar.'); } catch (error) { setResults([]); setStatus(error instanceof Error ? error.message : 'No fue posible consultar DOF.'); } finally { setLoading(false); } }
  return <WorkspaceFrame title="Alertas DOF y Boletín" eyebrow="Novedades legales" description="Consulta alertas públicas reales del SIDOF; no se presentan como publicaciones fechadas si la fuente no devuelve esa fecha."><section className="max-w-[1100px]"><form onSubmit={(event) => { event.preventDefault(); void search(); }} className={`${card} p-4`}><div className="flex flex-col gap-3 md:flex-row"><input value={query} onChange={(event) => setQuery(event.target.value)} className={input} placeholder="Filtrar por título de alerta…" /><button disabled={loading} type="submit" className="rounded-xl bg-[#0B2545] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{loading ? 'Consultando…' : 'Actualizar alertas'}</button></div></form><p className="mt-2 text-xs text-slate-500" aria-live="polite">{status}</p><div className="mt-4 space-y-3">{results.map((result) => <article key={result.id} className={`${card} flex gap-3 p-4`}><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#B58A5A]" /><div className="min-w-0"><h3 className="text-sm font-extrabold text-[#0B2545]">{result.rubro}</h3><p className="mt-1 text-xs text-slate-500">{result.snippet || 'La fuente no expuso descripción adicional en esta consulta.'}</p>{result.officialUrl && <a href={result.officialUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-[#0B5ED7]">Abrir fuente oficial →</a>}</div></article>)}{!loading && results.length === 0 && <div className={`${card} p-6 text-center text-sm text-slate-500`}>Actualiza para consultar las alertas públicas reales del SIDOF.</div>}</div></section></WorkspaceFrame>;
}

function RealExpedientesView() {
  const [cases, setCases] = useState<WorkspaceCaseSummary[]>([]);
  const [status, setStatus] = useState('Cargando borradores persistidos…');
  const [selected, setSelected] = useState<WorkspaceCaseSummary | null>(null);
  useEffect(() => {
    fetch('/api/workspace/cases', { cache: 'no-store' })
      .then(async (response) => { const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.error || 'No fue posible cargar los asuntos.'); return payload; })
      .then((payload) => { const nextCases = Array.isArray(payload.cases) ? payload.cases : []; setCases(nextCases); setStatus(`${nextCases.length} borradores persistidos`); })
      .catch((error) => setStatus(error instanceof Error ? error.message : 'No fue posible cargar los asuntos.'));
  }, []);
  return <WorkspaceFrame title="Expedientes" eyebrow="Gestor de asuntos" description="Listado basado únicamente en borradores persistidos; los campos ausentes permanecen sin clasificar."><section className={`${card} p-4`}><p className="mb-3 text-xs text-slate-500" aria-live="polite">{status}</p>{cases.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center"><Icon className="text-[#B58A5A]">folder_open</Icon><h2 className="mt-3 text-lg font-extrabold text-[#0B2545]">Sin borradores persistidos</h2><p className="mt-1 text-sm text-slate-500">No se muestran expedientes de demostración ni asociaciones inventadas.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400"><th className="px-3 py-3">Documento</th><th className="px-3 py-3">Expediente</th><th className="px-3 py-3">Materia</th><th className="px-3 py-3">Parte promovente</th><th className="px-3 py-3">Actualizado</th></tr></thead><tbody>{cases.map((item) => <tr key={item.id} onClick={() => setSelected(item)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"><td className="px-3 py-3 font-bold text-[#0B2545]">{item.title}</td><td className="px-3 py-3">{item.expediente || 'No informado'}</td><td className="px-3 py-3">{item.matter || 'No informada'}</td><td className="px-3 py-3">{item.actor || 'No informada'}</td><td className="px-3 py-3 text-slate-500">{new Date(item.updatedAt).toLocaleDateString('es-MX')}</td></tr>)}</tbody></table></div>}{selected && <div className="mt-4 rounded-xl bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-[#B58A5A]">Ficha persistida</p><h2 className="mt-1 text-sm font-extrabold text-[#0B2545]">{selected.title}</h2></div><button type="button" onClick={() => setSelected(null)} className="text-xs font-bold text-slate-500">Cerrar</button></div><p className="mt-3 text-xs text-slate-600">ID real: {selected.id}</p><p className="mt-1 text-xs text-slate-600">Jurisdicción: {selected.jurisdiction || 'No informada'} · Fuentes: {selected.sourceCount}</p><p className="mt-1 text-xs text-slate-600">Contraparte: {selected.counterparty || 'No informada'}</p></div>}</section></WorkspaceFrame>;
}

function RealTermsView() {
  const [date, setDate] = useState('');
  const [days, setDays] = useState('');
  const [mode, setMode] = useState<WorkspaceTermMode>('CALENDAR');
  const [includeStart, setIncludeStart] = useState(false);
  const [jurisdiction, setJurisdiction] = useState('');
  const [excludedDate, setExcludedDate] = useState('');
  const [excludedDates, setExcludedDates] = useState<string[]>([]);
  const [result, setResult] = useState<{ date?: string; assumptions?: string[]; error?: string }>({});
  function calculate() {
    try { const calculated = calculateWorkspaceTerm({ startDate: date, days: Number(days), mode, includeStart, excludedDates, jurisdiction }); setResult({ date: calculated.calculatedDate, assumptions: calculated.assumptions }); }
    catch (error) { setResult({ error: error instanceof Error ? error.message : 'Captura fecha y días válidos.' }); }
  }
  function addExcludedDate() { if (excludedDate && !excludedDates.includes(excludedDate)) setExcludedDates((current) => [...current, excludedDate].sort()); setExcludedDate(''); }
  return <WorkspaceFrame title="Cómputo de Términos" eyebrow="Herramienta procesal" description="Resultado provisional con parámetros explícitos; verifica siempre el calendario oficial aplicable."><section className={`${card} max-w-[850px] p-5`}><div className="grid gap-4 md:grid-cols-3"><label className="text-xs font-bold text-slate-600">Fecha inicial<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={`${input} mt-1.5`} /></label><label className="text-xs font-bold text-slate-600">Días<input type="number" min="1" value={days} onChange={(event) => setDays(event.target.value)} className={`${input} mt-1.5`} /></label><label className="text-xs font-bold text-slate-600">Modo<select value={mode} onChange={(event) => setMode(event.target.value as WorkspaceTermMode)} className={`${input} mt-1.5`}><option value="CALENDAR">Calendario natural</option><option value="BUSINESS">Días hábiles provisionales</option></select></label><label className="text-xs font-bold text-slate-600">Jurisdicción<input value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} className={`${input} mt-1.5`} placeholder="Ej. federal" /></label><label className="flex items-center gap-2 pt-7 text-xs font-bold text-slate-600"><input type="checkbox" checked={includeStart} onChange={(event) => setIncludeStart(event.target.checked)} /> Incluir fecha inicial</label></div><div className="mt-5 rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold text-[#0B2545]">Fechas excluidas configuradas</p><div className="mt-3 flex gap-2"><input type="date" value={excludedDate} onChange={(event) => setExcludedDate(event.target.value)} className={input} /><button type="button" onClick={addExcludedDate} className="shrink-0 rounded-xl border border-slate-300 px-3 text-xs font-bold text-[#0B2545]">Agregar</button></div>{excludedDates.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{excludedDates.map((item) => <button key={item} type="button" onClick={() => setExcludedDates((current) => current.filter((dateItem) => dateItem !== item))} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-700">{item} ×</button>)}</div>}<p className="mt-2 text-[11px] text-slate-500">No se presume un calendario oficial: estas fechas sólo aplican a este cálculo.</p></div><button type="button" onClick={calculate} className="mt-5 rounded-xl bg-[#0B2545] px-4 py-3 text-xs font-bold text-white">Calcular</button>{result.error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">{result.error}</p>}{result.date && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-xs leading-relaxed text-amber-900"><p className="font-extrabold">Fecha calculada: {new Date(`${result.date}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</p><p className="mt-2 font-bold">Advertencia: resultado PROVISIONAL.</p><ul className="mt-1 list-disc pl-4">{result.assumptions?.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></div>}</section></WorkspaceFrame>;
}

function RealHomeView({ onNavigate }: { onNavigate: (mode: WorkspaceModule) => void }) {
  const [cases, setCases] = useState<WorkspaceCaseSummary[]>([]);
  const [status, setStatus] = useState('Cargando métricas persistidas…');
  useEffect(() => { fetch('/api/workspace/cases', { cache: 'no-store' }).then(async (response) => { const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.error || 'No fue posible cargar métricas.'); return payload; }).then((payload) => { const nextCases = Array.isArray(payload.cases) ? payload.cases : []; setCases(nextCases); setStatus('Métricas basadas en LegalDraft persistidos.'); }).catch((error) => setStatus(error instanceof Error ? error.message : 'No fue posible cargar métricas.')); }, []);
  const actions: Array<[string, string, string, WorkspaceModule]> = [['gavel', 'Motor Jurídico', 'Abrir generación', 'universal'], ['description', 'Escritos Iniciales', 'Abrir módulo', 'initial_writings'], ['article', 'Contestaciones', 'Abrir módulo', 'responses_resources'], ['folder_special', 'Mis Plantillas', 'Abrir biblioteca personal', 'my-templates'], ['folder_open', 'Expedientes', `${cases.length} borradores persistidos`, 'expedientes']];
  return <WorkspaceFrame title="Inicio" eyebrow="Centro de trabajo" description="Métricas y actividad derivadas de datos persistidos; los módulos externos no se simulan."><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">{actions.map(([icon, title, value, mode]) => <button key={title} type="button" onClick={() => onNavigate(mode)} className={`${card} min-h-[150px] p-5 text-left transition hover:border-[#B58A5A]`}><Icon className="text-[#B58A5A]">{icon}</Icon><p className="mt-8 text-sm font-bold text-slate-500">{title}</p><strong className="mt-1 block text-base font-extrabold text-[#0B2545]">{value}</strong></button>)}</div><section className={`${card} mt-5 max-w-[1000px] p-5`}><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-extrabold text-[#0B2545]">Actividad reciente persistida</h2><span className="text-xs text-slate-500">{status}</span></div>{cases.length === 0 ? <p className="mt-3 text-sm text-slate-500">No hay borradores persistidos para mostrar actividad.</p> : <div className="mt-3 space-y-2">{cases.slice(0, 5).map((item) => <button key={item.id} type="button" onClick={() => onNavigate('expedientes')} className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-left"><span className="text-xs font-bold text-[#0B2545]">{item.title}</span><span className="text-[11px] text-slate-500">{new Date(item.updatedAt).toLocaleDateString('es-MX')}</span></button>)}</div>}</section></WorkspaceFrame>;
}

function RealSettingsView() {
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('Cargando perfil persistido…');
  useEffect(() => { fetch('/api/workspace/lawyer-profile').then((response) => response.json()).then((payload) => { if (payload.ok) { setProfile(payload.profile || {}); setStatus(payload.isDefault ? 'Perfil predeterminado no persistido.' : 'Perfil persistido cargado.'); } else setStatus('No fue posible cargar el perfil.'); }).catch(() => setStatus('No fue posible cargar el perfil.')); }, []);
  async function save() { const response = await fetch('/api/workspace/lawyer-profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) }); setStatus(response.ok ? 'Perfil guardado.' : 'No fue posible guardar el perfil.'); }
  return <WorkspaceFrame title="Configuración" eyebrow="Preferencias del despacho" description="Perfil y estado real de persistencia."><section className={`${card} max-w-[850px] p-5`}><p className="text-xs text-slate-500">{status}</p><div className="mt-5 grid gap-4 md:grid-cols-2">{[['lawyerName', 'Nombre'], ['firmName', 'Despacho'], ['professionalLicense', 'Cédula profesional'], ['email', 'Correo']].map(([key, label]) => <label key={key} className="text-xs font-bold text-slate-600">{label}<input value={profile[key] || ''} onChange={(event) => setProfile((current) => ({ ...current, [key]: event.target.value }))} className={`${input} mt-1.5`} /></label>)}</div><button type="button" onClick={() => void save()} className="mt-6 rounded-xl bg-[#0B2545] px-4 py-3 text-xs font-bold text-white">Guardar perfil</button></section></WorkspaceFrame>;
}

function RealHelpView() {
  return <WorkspaceFrame title="Ayuda" eyebrow="Centro de soporte" description="Guías de uso de esta aplicación y sus estados de fuente."><section className={`${card} max-w-[900px] p-5`}><div className="grid gap-3 md:grid-cols-2">{[['Flujo de generación', 'Carga una fuente, revisa el análisis, genera y valida antes de exportar.'], ['Investigación', 'Corpus Iuris y lex-mx sirven para descubrimiento; la autoridad oficial conserva su propia verificación.'], ['Expedientes', 'No se muestran filas hasta que exista un listado persistente disponible para el espacio.'], ['Fuentes bloqueadas', 'La pantalla informa cuando una API requiere credencial o rechaza la conexión.']].map(([title, description]) => <article key={title} className="rounded-xl border border-slate-200 p-4"><h2 className="text-sm font-extrabold text-[#0B2545]">{title}</h2><p className="mt-2 text-xs leading-relaxed text-slate-500">{description}</p></article>)}</div></section></WorkspaceFrame>;
}

function WorkspaceFrame({ title, eyebrow, description, action, children }: { title: string; eyebrow: string; description: string; action?: string; children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1600px] px-5 py-6 md:px-8"><Header title={title} eyebrow={eyebrow} description={description} action={action ? <button type="button" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0B2545] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#081d39]"><Icon>add</Icon>{action}</button> : undefined} />{children}</div>;
}

export function WorkspaceModulesView({ mode, onNavigate }: WorkspaceModulesViewProps) {
  if (mode === 'inicio') return <RealHomeView onNavigate={onNavigate} />;
  if (mode === 'expedientes') return <RealExpedientesView />;
  if (mode === 'terminos') return <RealTermsView />;
  if (mode === 'jurisprudencia') return <RealResearchView />;
  if (mode === 'biblioteca') return <RealLibraryView />;
  if (mode === 'alertas') return <RealAlertsView />;
  if (mode === 'configuracion') return <RealSettingsView />;
  if (mode === 'ayuda') return <RealHelpView />;
  return null;
}

export default WorkspaceModulesView;
