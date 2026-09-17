'use client';

import React, { useState } from 'react';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';

export interface ExpedienteFichaData {
  expediente?: string;
  actor?: string;
  demandado?: string;
  autoridad?: string;
  materia?: string;
  estadoProcesal?: string;
}

interface ContestacionesExpedienteCardProps {
  caseFicha?: ExpedienteFichaData | null;
  caseAnalysis?: CaseAnalysis | null;
  inferredMatter?: string | null;
  onUpdateFicha?: (updated: ExpedienteFichaData) => void;
}

export function ContestacionesExpedienteCard({
  caseFicha,
  caseAnalysis,
  inferredMatter,
  onUpdateFicha,
}: ContestacionesExpedienteCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  const initialExpediente =
    caseFicha?.expediente ||
    caseAnalysis?.caseNumbers?.amparoDirecto ||
    caseAnalysis?.caseNumbers?.principal ||
    caseAnalysis?.caseNumbers?.expedienteOrigen ||
    '';

  const initialActor =
    caseFicha?.actor ||
    caseAnalysis?.parties?.actor ||
    caseAnalysis?.parties?.quejoso ||
    '';

  const initialDemandado =
    caseFicha?.demandado ||
    caseAnalysis?.parties?.demandado ||
    caseAnalysis?.parties?.autoridadResponsable ||
    '';

  const initialAutoridad =
    caseFicha?.autoridad ||
    caseAnalysis?.authorities?.[0] ||
    '';

  const initialMateria =
    caseFicha?.materia ||
    inferredMatter ||
    'Civil';

  const derivedData: ExpedienteFichaData = {
    expediente: initialExpediente,
    actor: initialActor,
    demandado: initialDemandado,
    autoridad: initialAutoridad,
    materia: initialMateria,
    estadoProcesal: caseFicha?.estadoProcesal || 'En trámite',
  };

  const [editData, setEditData] = useState<ExpedienteFichaData | null>(null);
  const formData = isEditing ? (editData ?? derivedData) : derivedData;

  const handleStartEdit = () => {
    setEditData(derivedData);
    setIsEditing(true);
  };

  const handleSave = () => {
    if (editData) onUpdateFicha?.(editData);
    setIsEditing(false);
    setEditData(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditData(null);
  };

  return (
    <section className="contestaciones-summary-card rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition hover:border-slate-300/80">
      <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Resumen del expediente
          </h2>
        </div>

        <button
          type="button"
          onClick={() => (isEditing ? handleCancel() : handleStartEdit())}
          className="inline-flex items-center gap-1 rounded-md px-1 py-1 text-sm font-semibold text-blue-700 transition hover:text-blue-900"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span>{isEditing ? 'Cancelar' : 'Editar'}</span>
        </button>
      </div>

      {isEditing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Expediente
            </label>
            <input
              type="text"
              value={formData.expediente}
              onChange={(e) => setEditData(prev => ({ ...(prev ?? formData), expediente: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium outline-none transition focus:border-[#0B2545] focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Materia
            </label>
            <input
              type="text"
              value={formData.materia}
              onChange={(e) => setEditData(prev => ({ ...(prev ?? formData), materia: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium outline-none transition focus:border-[#0B2545] focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Actor
            </label>
            <input
              type="text"
              value={formData.actor}
              onChange={(e) => setEditData(prev => ({ ...(prev ?? formData), actor: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium outline-none transition focus:border-[#0B2545] focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Demandado
            </label>
            <input
              type="text"
              value={formData.demandado}
              onChange={(e) => setEditData(prev => ({ ...(prev ?? formData), demandado: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium outline-none transition focus:border-[#0B2545] focus:bg-white"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Autoridad
            </label>
            <input
              type="text"
              value={formData.autoridad}
              onChange={(e) => setEditData(prev => ({ ...(prev ?? formData), autoridad: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium outline-none transition focus:border-[#0B2545] focus:bg-white"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Estado procesal
            </label>
            <input
              type="text"
              value={formData.estadoProcesal}
              onChange={(e) => setEditData(prev => ({ ...(prev ?? formData), estadoProcesal: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium outline-none transition focus:border-[#0B2545] focus:bg-white"
            />
          </div>

          <div className="sm:col-span-2 flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl bg-[#0B2545] px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-900"
            >
              Guardar
            </button>
          </div>
        </div>
      ) : (
        <div className="contestaciones-summary-fields">
          {/* Columna Izquierda */}
          <div className="contestaciones-summary-column">
            <div className="contestaciones-summary-field">
              <p className="text-[11px] font-medium text-slate-400">Expediente:</p>
              <p className="truncate text-xs font-semibold text-slate-800 font-mono">
                {formData.expediente || 'No identificado'}
              </p>
            </div>
            <div className="contestaciones-summary-field">
              <p className="text-[11px] font-medium text-slate-400">Actor:</p>
              <p className="truncate text-xs font-semibold text-slate-800" title={formData.actor}>
                {formData.actor || '—'}
              </p>
            </div>
            <div className="contestaciones-summary-field">
              <p className="text-[11px] font-medium text-slate-400">Demandado:</p>
              <p className="truncate text-xs font-semibold text-slate-800" title={formData.demandado}>
                {formData.demandado || '—'}
              </p>
            </div>
          </div>

          {/* Columna Derecha */}
          <div className="contestaciones-summary-column">
            <div className="contestaciones-summary-field">
              <p className="text-[11px] font-medium text-slate-400">Autoridad:</p>
              <p className="line-clamp-2 text-xs font-semibold text-slate-800" title={formData.autoridad}>
                {formData.autoridad || '—'}
              </p>
            </div>
            <div className="contestaciones-summary-field">
              <p className="text-[11px] font-medium text-slate-400">Materia:</p>
              <p className="text-xs font-semibold text-slate-800">
                {formData.materia || '—'}
              </p>
            </div>
            <div className="contestaciones-summary-field contestaciones-summary-field-status">
              <p className="text-[11px] font-medium text-slate-400">Estado:</p>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200/60 bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-semibold text-[#92400E]">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {formData.estadoProcesal || 'En trámite'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
