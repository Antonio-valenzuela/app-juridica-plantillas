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

export type ExpedienteFieldStatus = 'DETECTED_UNCONFIRMED' | 'CONFIRMED' | 'PENDING' | 'CONFLICT';
type ExpedienteField = 'expediente' | 'actor' | 'demandado' | 'autoridad' | 'materia' | 'estadoProcesal';

interface ContestacionesExpedienteCardProps {
  caseFicha?: ExpedienteFichaData | null;
  caseAnalysis?: CaseAnalysis | null;
  inferredMatter?: string | null;
  onUpdateFicha?: (updated: ExpedienteFichaData) => void;
  fieldStatuses?: Partial<Record<ExpedienteField, ExpedienteFieldStatus>>;
  /** Tipo del documento fuente en lenguaje del abogado ("Demanda civil"). */
  documentTypeLabel?: string;
  /** Preparación real para generar; sustituye al estado procesal supuesto. */
  readiness?: { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' };
}

export function ContestacionesExpedienteCard({
  caseFicha,
  caseAnalysis,
  inferredMatter,
  onUpdateFicha,
  fieldStatuses,
  documentTypeLabel,
  readiness,
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

  // Sin señales suficientes la materia queda "Por confirmar"; nunca se supone "Civil".
  const fichaMateria = caseFicha?.materia && caseFicha.materia !== 'Por confirmar' ? caseFicha.materia : '';
  const engineMateria = inferredMatter && inferredMatter !== 'NO_IDENTIFICADA'
    ? inferredMatter.charAt(0).toUpperCase() + inferredMatter.slice(1).toLowerCase()
    : '';
  const initialMateria = fichaMateria || engineMateria || 'Por confirmar';

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
  const statusLabel: Record<ExpedienteFieldStatus, string> = {
    DETECTED_UNCONFIRMED: 'Detectado',
    CONFIRMED: 'Confirmado',
    PENDING: 'Pendiente',
    CONFLICT: 'Por revisar',
  };
  const status = (field: ExpedienteField) => fieldStatuses?.[field] ? <span className="lex-field-status">{statusLabel[fieldStatuses[field]!]}</span> : null;

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
    <section className="lex-card contestaciones-summary-card">
      <div className="lex-card-header">
        <h2 className="lex-card-title">Resumen del expediente</h2>

        <button
          type="button"
          onClick={() => (isEditing ? handleCancel() : handleStartEdit())}
          className="lex-link-button"
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
              Expediente {status('expediente')}
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
              Materia {status('materia')}
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
              Actor {status('actor')}
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
              Demandado {status('demandado')}
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
              Autoridad {status('autoridad')}
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
              Estado procesal {status('estadoProcesal')}
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
        <dl className="lex-facts">
          {documentTypeLabel && (
            <div className="lex-facts-row">
              <dt>Tipo de documento</dt>
              <dd><span className="lex-pill lex-pill-info">{documentTypeLabel}</span></dd>
            </div>
          )}
          <div className="lex-facts-row">
            <dt>Expediente {status('expediente')}</dt>
            <dd className="font-mono">{formData.expediente || <span className="lex-muted">No identificado</span>}</dd>
          </div>
          <div className="lex-facts-row">
            <dt>Órgano jurisdiccional {status('autoridad')}</dt>
            <dd title={formData.autoridad}>{formData.autoridad || <span className="lex-muted">Por identificar</span>}</dd>
          </div>
          <div className="lex-facts-row">
            <dt>Parte actora {status('actor')}</dt>
            <dd title={formData.actor}>{formData.actor || <span className="lex-muted">Por identificar</span>}</dd>
          </div>
          <div className="lex-facts-row">
            <dt>Parte demandada {status('demandado')}</dt>
            <dd title={formData.demandado}>{formData.demandado || <span className="lex-muted">Por identificar</span>}</dd>
          </div>
          <div className="lex-facts-row">
            <dt>Materia {status('materia')}</dt>
            <dd>
              {formData.materia && formData.materia !== 'Por confirmar'
                ? <span className="lex-pill lex-pill-success">{formData.materia}</span>
                : <span className="lex-muted">Por confirmar</span>}
            </dd>
          </div>
          {readiness && (
            <div className="lex-facts-row">
              <dt>Estado</dt>
              <dd><span className={`lex-pill lex-pill-${readiness.tone}`}>{readiness.label}</span></dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
