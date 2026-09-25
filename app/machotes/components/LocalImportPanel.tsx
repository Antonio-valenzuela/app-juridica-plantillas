'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LocalImportRecord, LocalImportSummary } from '@/lib/workspace/localImporter';

interface AnalyzeResponse {
  ok: boolean;
  error?: string;
  scanId?: string;
  source?: { kind: 'DIRECTORY' | 'ZIP'; name: string; limited: boolean };
  summary?: LocalImportSummary;
  records?: LocalImportRecord[];
}

const statusLabels: Record<LocalImportRecord['status'], string> = {
  IMPORTABLE: 'Listo para importar',
  DUPLICADO: 'Duplicado',
  EXCLUIDO_POR_SEGURIDAD: 'Excluido por seguridad',
  DAÑADO: 'No pudo procesarse',
  REQUIERE_REVISION: 'Requiere revisión',
  SIN_CLASIFICAR: 'Sin clasificar',
};

const statusStyles: Record<LocalImportRecord['status'], string> = {
  IMPORTABLE: 'bg-emerald-50 text-emerald-700',
  DUPLICADO: 'bg-slate-100 text-slate-600',
  EXCLUIDO_POR_SEGURIDAD: 'bg-red-50 text-red-700',
  DAÑADO: 'bg-rose-50 text-rose-700',
  REQUIERE_REVISION: 'bg-amber-50 text-amber-800',
  SIN_CLASIFICAR: 'bg-slate-100 text-slate-600',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCount(value: number | undefined): string {
  return new Intl.NumberFormat('es-MX').format(value || 0);
}

export function LocalImportPanel() {
  const [sourcePath, setSourcePath] = useState('');
  const [sampleLimit, setSampleLimit] = useState('');
  const [scanId, setScanId] = useState<string | null>(null);
  const [summary, setSummary] = useState<LocalImportSummary | null>(null);
  const [records, setRecords] = useState<LocalImportRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sourceLabel, setSourceLabel] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | LocalImportRecord['status']>('all');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [importedRecords, setImportedRecords] = useState<LocalImportRecord[]>([]);
  const [libraryQuery, setLibraryQuery] = useState('');

  useEffect(() => {
    fetch('/api/workspace/local-import', { cache: 'no-store' })
      .then(async (response): Promise<{ ok: boolean; items?: LocalImportRecord[] }> => response.ok
        ? await response.json() as { ok: boolean; items?: LocalImportRecord[] }
        : { ok: false, items: [] })
      .then((payload) => { if (payload.ok) setImportedRecords(Array.isArray(payload.items) ? payload.items : []); })
      .catch(() => undefined);
  }, []);

  const visibleRecords = useMemo(() => records
    .filter((record) => categoryFilter === 'all' || record.category === categoryFilter)
    .filter((record) => statusFilter === 'all' || record.status === statusFilter)
    .slice(0, 120), [categoryFilter, records, statusFilter]);

  const categories = useMemo(() => Object.keys(summary?.categoryCounts || {}).sort(), [summary]);
  const selectedImportableCount = records.filter((record) => selectedIds.has(record.id) && record.status === 'IMPORTABLE').length;
  const filteredImportedRecords = useMemo(() => importedRecords.filter((record) => `${record.name} ${record.relativePath} ${record.category} ${record.matter}`.toLocaleLowerCase().includes(libraryQuery.toLocaleLowerCase())).slice(0, 8), [importedRecords, libraryQuery]);

  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('Analizando la fuente local…');
    try {
      const response = await fetch('/api/workspace/local-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze',
          sourcePath,
          ...(sampleLimit.trim() ? { limit: Number(sampleLimit) } : {}),
        }),
      });
      const payload = await response.json() as AnalyzeResponse;
      if (!response.ok || !payload.ok || !payload.scanId || !payload.summary || !payload.records) throw new Error(payload.error || 'No fue posible analizar la fuente local.');
      setScanId(payload.scanId);
      setSummary(payload.summary);
      setRecords(payload.records);
      setSelectedIds(new Set());
      setSourceLabel(payload.source?.name || sourcePath);
      setMessage(payload.source?.limited ? 'Muestra analizada. Puedes ampliar el análisis quitando el límite.' : 'Análisis terminado. Selecciona qué deseas incorporar.');
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : 'No fue posible analizar la fuente local.');
      setMessage('');
    } finally {
      setLoading(false);
    }
  }

  async function importSelected() {
    if (!scanId || selectedImportableCount === 0) return;
    setLoading(true);
    setError('');
    setMessage('Incorporando los documentos seleccionados…');
    try {
      const response = await fetch('/api/workspace/local-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', scanId, recordIds: [...selectedIds] }),
      });
      const payload = await response.json() as { ok: boolean; error?: string; imported?: LocalImportRecord[]; skipped?: Array<{ id: string; reason: string }> };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'No fue posible incorporar los documentos.');
      const importedIds = new Set((payload.imported || []).map((record) => record.id));
      setRecords((current) => current.map((record) => importedIds.has(record.id) ? { ...record, imported: true } : record));
      setImportedRecords((current) => [...(payload.imported || []), ...current.filter((record) => !importedIds.has(record.id))]);
      setSelectedIds(new Set());
      setMessage(`${formatCount(payload.imported?.length)} documento(s) incorporado(s). ${formatCount(payload.skipped?.length)} quedó(aron) fuera por revisión o seguridad.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'No fue posible incorporar los documentos.');
      setMessage('');
    } finally {
      setLoading(false);
    }
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectImportable() {
    setSelectedIds(new Set(records.filter((record) => record.status === 'IMPORTABLE' && !record.imported).map((record) => record.id)));
  }

  return <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_5px_18px_rgba(15,23,42,.045)]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#B58A5A]">Zona de revisión local</p>
        <h2 className="mt-1 text-lg font-extrabold text-[#0B2545]">Incorporar documentos del despacho</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">Analiza una carpeta o ZIP en esta computadora, revisa el resumen y elige qué documentos deben entrar a la Biblioteca o a un expediente.</p>
      </div>
      <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold text-emerald-700">Procesamiento local</span>
    </div>

    {importedRecords.length > 0 && <div className="mt-4 rounded-xl border border-slate-200 bg-[#fbfaf7] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-[#B58A5A]">Contenido privado del despacho</p><h3 className="mt-1 text-sm font-extrabold text-[#0B2545]">Documentos del despacho</h3><p className="mt-1 text-[11px] text-slate-500">Separados del catálogo de fuentes oficiales y disponibles sólo en este equipo.</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">{formatCount(importedRecords.length)} incorporados</span></div><input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="Buscar por nombre, categoría o materia…" className="mt-3 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-[#0B2545]" /><div className="mt-3 grid gap-2 md:grid-cols-2">{filteredImportedRecords.map((record) => <div key={record.id} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-2"><p className="truncate text-xs font-bold text-[#0B2545]" title={record.relativePath}>{record.name}</p><span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Incorporado</span></div><p className="mt-1 truncate text-[10px] text-slate-500">{record.category.replaceAll('_', ' ')} · {record.matter.replaceAll('_', ' ')}</p></div>)}</div></div>}

    <form onSubmit={analyze} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3 md:grid-cols-[minmax(0,1fr)_150px_auto] md:items-end">
      <label className="text-[11px] font-bold text-slate-600">Ruta local de carpeta o ZIP<input required value={sourcePath} onChange={(event) => setSourcePath(event.target.value)} placeholder="Ej. C:\\Users\\Abogado\\Documentos\\Datos.zip" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-normal text-slate-700 outline-none focus:border-[#0B2545]" /></label>
      <label className="text-[11px] font-bold text-slate-600">Muestra opcional<input value={sampleLimit} onChange={(event) => setSampleLimit(event.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="Sin límite" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-normal text-slate-700 outline-none focus:border-[#0B2545]" /></label>
      <button disabled={loading} type="submit" className="h-10 rounded-lg bg-[#0B2545] px-4 text-xs font-bold text-white transition hover:bg-[#081d39] disabled:opacity-50">{loading ? 'Trabajando…' : 'Analizar fuente local'}</button>
    </form>

    {(message || error) && <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${error ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-800'}`} aria-live="polite">{error || message}</p>}

    {summary && <>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-7">
        {[
          ['Archivos analizados', summary.analyzed, 'text-[#0B2545]'],
          ['Importables', summary.importable, 'text-emerald-700'],
          ['Duplicados', summary.duplicates, 'text-slate-600'],
          ['Excluidos por seguridad', summary.excluded, 'text-red-700'],
          ['No procesados', summary.damaged, 'text-rose-700'],
          ['Requieren revisión', summary.review, 'text-amber-800'],
          ['Sin clasificar', summary.unclassified, 'text-slate-600'],
        ].map(([label, value, color]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] font-bold leading-tight text-slate-500">{label}</p><p className={`mt-1 text-lg font-extrabold ${color}`}>{formatCount(Number(value))}</p></div>)}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Tipo documental</p><div className="mt-2 flex flex-wrap gap-2">{Object.entries(summary.categoryCounts).sort(([, a], [, b]) => (b || 0) - (a || 0)).slice(0, 8).map(([category, count]) => <span key={category} className="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">{category.replaceAll('_', ' ')} · {formatCount(count)}</span>)}</div></div><div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Materia identificada</p><div className="mt-2 flex flex-wrap gap-2">{Object.entries(summary.matterCounts).sort(([, a], [, b]) => (b || 0) - (a || 0)).slice(0, 8).map(([matter, count]) => <span key={matter} className="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">{matter.replaceAll('_', ' ')} · {formatCount(count)}</span>)}</div></div></div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div><p className="text-xs font-bold text-[#0B2545]">{sourceLabel}</p><p className="text-[11px] text-slate-500">La selección es manual. Los archivos excluidos nunca se incorporan.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={selectImportable} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-[#0B2545] hover:bg-slate-50">Seleccionar importables</button><button type="button" disabled={loading || selectedImportableCount === 0} onClick={() => void importSelected()} className="rounded-lg bg-[#0B2545] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40">Importar seleccionados ({formatCount(selectedImportableCount)})</button></div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2"><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] text-slate-600"><option value="all">Todas las categorías</option>{categories.map((category) => <option key={category} value={category}>{category.replaceAll('_', ' ')}</option>)}</select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] text-slate-600"><option value="all">Todos los estados</option>{Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></div>

       <div className="mt-3 overflow-hidden rounded-xl border border-slate-200"><div className="grid grid-cols-[auto_minmax(0,1fr)_100px_120px] gap-3 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500"><span /> <span>Documento</span><span>Clasificación</span><span>Estado</span></div><div className="divide-y divide-slate-100">{visibleRecords.map((record) => <label key={record.id} className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_100px_120px] items-center gap-3 px-3 py-2.5 text-[11px] hover:bg-slate-50"><input type="checkbox" checked={selectedIds.has(record.id)} disabled={record.status !== 'IMPORTABLE' || record.imported} onChange={() => toggleSelection(record.id)} className="accent-[#0B2545]" /><span className="min-w-0"><span className="block truncate font-bold text-[#0B2545]" title={record.relativePath}>{record.name}</span><span className="block truncate text-[10px] text-slate-400">{record.relativePath} · {formatBytes(record.sizeBytes)}</span></span><span className="truncate text-[10px] font-bold text-slate-500">{record.templateStatus === 'CANDIDATA_A_PLANTILLA' ? 'Candidata a plantilla' : record.category.replaceAll('_', ' ')}</span><span className={`rounded-full px-2 py-1 text-center text-[10px] font-bold ${statusStyles[record.status]}`}>{record.imported ? 'Incorporado' : statusLabels[record.status]}</span></label>)}{visibleRecords.length === 0 && <p className="p-5 text-center text-xs text-slate-500">No hay documentos con estos filtros.</p>}</div></div><p className="mt-2 text-[10px] text-slate-400">Mostrando {formatCount(visibleRecords.length)} de {formatCount(records.length)} registros. La selección de importables incluye también los registros no visibles.</p>
    </>}
  </section>;
}
