'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DOCUMENT_FAMILIES,
  LEGAL_AREAS,
  LEGAL_PROCEDURES,
  getCatalogChildren,
  searchCatalog,
  type CatalogNodeKind,
  type CatalogStatus,
} from '@/lib/catalog/legalCatalog';

interface LegalCatalogNavigatorProps {
  onSelect: (documentTypeId: string, context?: CatalogSelectionContext) => void;
  className?: string;
}

export interface CatalogSelectionContext {
  areaId?: string;
  procedureId?: string;
  familyId?: string;
}

interface CatalogListEntry {
  id: string;
  label: string;
  description: string;
  kind: CatalogNodeKind;
  status: CatalogStatus;
  areaId?: string;
  procedureId?: string;
  familyId?: string;
}

function statusLabel(status: CatalogStatus): string {
  if (status === 'IMPLEMENTED') return 'Disponible';
  if (status === 'PARTIAL') return 'Parcial · requiere revisión';
  if (status === 'CATALOG_ONLY') return 'Próximamente';
  if (status === 'REQUIRES_OFFICIAL_FORM') return 'Requiere formato oficial';
  if (status === 'ASSISTED_DRAFT') return 'Asistente de preparación';
  if (status === 'NOT_APPLICABLE') return 'Familia, no documento';
  return 'Próximamente';
}

function statusClass(status: CatalogStatus): string {
  if (status === 'IMPLEMENTED') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (status === 'REQUIRES_OFFICIAL_FORM') return 'text-amber-800 bg-amber-50 border-amber-200';
  if (status === 'ASSISTED_DRAFT') return 'text-blue-800 bg-blue-50 border-blue-200';
  return 'text-slate-600 bg-slate-100 border-slate-200';
}

export type CatalogResultAction = 'NAVIGATE' | 'SELECT' | 'DISABLED';

export function getCatalogResultAction(entry: Pick<CatalogListEntry, 'id' | 'kind' | 'status'>): CatalogResultAction {
  if (entry.kind === 'AREA' || entry.kind === 'PROCEDURE' || entry.kind === 'FAMILY') return 'NAVIGATE';
  if ((entry.kind === 'DOCUMENT_TYPE' || entry.kind === 'LEGACY_ALIAS') && entry.status === 'IMPLEMENTED' && entry.id !== 'otro') return 'SELECT';
  return 'DISABLED';
}

function documentOption(
  entry: CatalogListEntry,
  onSelect: (id: string, context?: CatalogSelectionContext) => void,
  onNavigate: (context: CatalogSelectionContext) => void,
) {
  const action = getCatalogResultAction(entry);
  return (
    <li key={`${entry.kind}-${entry.id}`}>
      <button
        type="button"
        disabled={action === 'DISABLED'}
        onClick={() => {
          const context = { areaId: entry.areaId, procedureId: entry.procedureId, familyId: entry.familyId };
          if (action === 'SELECT') onSelect(entry.id, context);
          if (action === 'NAVIGATE') onNavigate(context);
        }}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-[#0B2545] focus:outline-none focus:ring-2 focus:ring-[#0B2545]/30 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span className="flex min-w-0 items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-800">{entry.label}</span>
            <span className="mt-0.5 block break-words text-[11px] leading-4 text-slate-500">{entry.description}</span>
          </span>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(entry.status)}`}>
            {statusLabel(entry.status)}
          </span>
        </span>
      </button>
    </li>
  );
}

export function LegalCatalogNavigator({ onSelect, className = '' }: LegalCatalogNavigatorProps) {
  const [areaId, setAreaId] = useState('');
  const [procedureId, setProcedureId] = useState('');
  const [familyId, setFamilyId] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const procedures = useMemo(
    () => LEGAL_PROCEDURES.filter((procedure) => !areaId || procedure.areaId === areaId),
    [areaId],
  );
  const families = useMemo(
    () => DOCUMENT_FAMILIES.filter((family) => (!areaId || family.areaId === areaId) && (!procedureId || family.procedureId === procedureId)),
    [areaId, procedureId],
  );
  const documents = useMemo(
    () => getCatalogChildren(areaId || undefined, procedureId || undefined, familyId || undefined).filter((entry) => entry.kind === 'DOCUMENT_TYPE' || entry.kind === 'FAMILY'),
    [areaId, procedureId, familyId],
  );
  const searchResults = useMemo(() => (debouncedQuery.trim() ? searchCatalog(debouncedQuery).slice(0, 50) : []), [debouncedQuery]);
  const searchGroups = useMemo(() => {
    const groups = new Map<string, { key: string; title: string; results: typeof searchResults }>();
    for (const result of searchResults) {
      const area = result.areaId ? LEGAL_AREAS.find((candidate) => candidate.id === result.areaId) : undefined;
      const family = result.familyId ? DOCUMENT_FAMILIES.find((candidate) => candidate.id === result.familyId) : undefined;
      const title = [area?.label, family?.label].filter(Boolean).join(' / ') || 'Estructura del catálogo';
      const key = `${result.areaId || 'catalog'}:${result.familyId || result.kind}`;
      const group = groups.get(key) || { key, title, results: [] };
      group.results.push(result);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [searchResults]);

  const resetBelowArea = (nextAreaId: string) => {
    setAreaId(nextAreaId);
    setProcedureId('');
    setFamilyId('');
  };
  const resetBelowProcedure = (nextProcedureId: string) => {
    setProcedureId(nextProcedureId);
    setFamilyId('');
  };
  const navigateTo = (context: CatalogSelectionContext) => {
    setAreaId(context.areaId || '');
    setProcedureId(context.procedureId || '');
    setFamilyId(context.familyId || '');
    setQuery('');
  };

  return (
    <section className={`rounded-xl border border-slate-200 bg-[#FBF9F5] p-4 ${className}`} aria-labelledby="legal-catalog-title">
      <div className="mb-3">
        <h3 id="legal-catalog-title" className="text-sm font-bold text-[#0B2545]">Catálogo jurídico</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">Elige materia, procedimiento, qué quieres hacer y después el documento.</p>
      </div>

      <label htmlFor="legal-catalog-search" className="mb-1 block text-xs font-semibold text-slate-700">Búsqueda global</label>
      <input
        id="legal-catalog-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Nombre, alias o ID canónico"
        className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#0B2545] focus:ring-2 focus:ring-[#0B2545]/20"
        aria-describedby="legal-catalog-results"
      />

      {query.trim() ? (
        <div id="legal-catalog-results" aria-live="polite">
          <p className="mb-2 text-xs font-semibold text-slate-700">Resultados: {searchResults.length}</p>
          {searchResults.length > 0 ? <div className="space-y-3">{searchGroups.map((group) => <section key={group.key} aria-label={group.title}><h4 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{group.title}</h4><ul className="space-y-2">{group.results.map((result) => documentOption(result, onSelect, navigateTo))}</ul></section>)}</div> : <p className="text-xs text-slate-500">No hay coincidencias en el catálogo.</p>}
        </div>
      ) : (
        <>
          <nav className="mb-3 flex flex-wrap items-center gap-1 text-[11px] text-slate-500" aria-label="Ruta del catálogo">
            <span aria-current={!areaId ? 'step' : undefined} className={!areaId ? 'font-semibold text-[#0B2545]' : undefined}>Materia</span>
            <span aria-hidden="true">/</span>
            <span aria-current={areaId && !procedureId ? 'step' : undefined} className={areaId && !procedureId ? 'font-semibold text-[#0B2545]' : undefined}>Procedimiento</span>
            <span aria-hidden="true">/</span>
            <span aria-current={procedureId && !familyId ? 'step' : undefined} className={procedureId && !familyId ? 'font-semibold text-[#0B2545]' : undefined}>Qué quieres hacer</span>
            <span aria-hidden="true">/</span>
            <span aria-current={familyId ? 'step' : undefined} className={familyId ? 'font-semibold text-[#0B2545]' : undefined}>Documento</span>
          </nav>

          {(areaId || procedureId || familyId) && <button type="button" onClick={() => { if (familyId) setFamilyId(''); else if (procedureId) setProcedureId(''); else setAreaId(''); }} className="mb-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#0B2545] transition hover:border-[#0B2545] focus:outline-none focus:ring-2 focus:ring-[#0B2545]/30">Atrás</button>}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold text-slate-700">
              Materia
              <select value={areaId} onChange={(event) => resetBelowArea(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal outline-none focus:border-[#0B2545] focus:ring-2 focus:ring-[#0B2545]/20">
                <option value="">Selecciona una materia</option>
                {LEGAL_AREAS.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Procedimiento
              <select value={procedureId} onChange={(event) => resetBelowProcedure(event.target.value)} disabled={!areaId} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal outline-none focus:border-[#0B2545] focus:ring-2 focus:ring-[#0B2545]/20 disabled:bg-slate-100">
                <option value="">Selecciona un procedimiento</option>
                {procedures.map((procedure) => <option key={procedure.id} value={procedure.id}>{procedure.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Qué quieres hacer
              <select value={familyId} onChange={(event) => setFamilyId(event.target.value)} disabled={!procedureId} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal outline-none focus:border-[#0B2545] focus:ring-2 focus:ring-[#0B2545]/20 disabled:bg-slate-100">
                <option value="">Selecciona una familia</option>
                {families.map((family) => <option key={family.id} value={family.id}>{family.label}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4" aria-live="polite">
            {!familyId ? <p className="text-xs text-slate-500">Selecciona una familia para ver documentos disponibles.</p> : documents.length > 0 ? <ul className="space-y-2">{documents.map((entry) => documentOption({ id: entry.id, label: entry.label, description: 'description' in entry ? entry.description : '', kind: entry.kind, status: entry.status, areaId: 'areaId' in entry ? entry.areaId : undefined, procedureId: 'procedureId' in entry ? entry.procedureId : undefined, familyId: 'familyId' in entry ? entry.familyId : undefined }, onSelect, navigateTo))}</ul> : <p className="text-xs text-slate-500">No hay documentos registrados en esta familia.</p>}
          </div>
        </>
      )}
    </section>
  );
}
