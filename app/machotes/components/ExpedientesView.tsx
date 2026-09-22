'use client';

import React, { useState } from 'react';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

interface ExpedientesViewProps {
  onNewExpediente: () => void;
  onSelectExpediente: (exp: string) => void;
  uploadedDocs?: UploadedSourceDocument[];
  caseFicha?: {
    expediente?: string;
    actor?: string;
    demandado?: string;
    materia?: string;
    tipo?: string;
  } | null;
}

export function ExpedientesView({
  onNewExpediente,
  onSelectExpediente,
  caseFicha,
}: ExpedientesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMatter, setSelectedMatter] = useState('all');

  return (
    <div className="flex flex-col w-full pb-10 px-4 sm:px-6 font-sans">
      {/* ── HEADER DE EXPEDIENTES ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 pt-3 border-b border-divider/60">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display-title text-display-title text-on-surface tracking-tight">
              Expedientes y Cuadernos Judiciales
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-code-mono text-[11px] font-semibold">
              {caseFicha?.expediente ? '4 REGISTRADOS' : '3 REGISTRADOS'}
            </span>
          </div>
          <p className="font-body-default text-body-default text-secondary mt-0.5">
            Registro unificado de causas procesales, cédulas de notificación y autos judiciales radicados.
          </p>
        </div>

        <button
          onClick={onNewExpediente}
          className="h-9 px-4 rounded-lg bg-primary-container text-on-primary hover:bg-primary font-body-strong text-xs flex items-center gap-2 shadow-xs transition-all self-start sm:self-center"
        >
          <span className="material-symbols-outlined text-[18px]">create_new_folder</span>
          <span>+ Nuevo Expediente</span>
        </button>
      </div>

      {/* ── BUSCADOR & FILTROS ── */}
      <div className="p-3 bg-surface-container-lowest rounded-xl border border-divider shadow-2xs my-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <div className="flex items-center h-9 px-3 rounded-lg bg-surface-container-low text-secondary w-full border border-divider/60 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <span className="material-symbols-outlined text-[18px] mr-2 text-secondary">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por número de expediente, juzgado o partes..."
              className="w-full bg-transparent border-none outline-none font-body-default text-xs text-on-surface placeholder:text-secondary"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {['all', 'Civil', 'Mercantil', 'Amparo'].map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMatter(m)}
              className={`px-3 py-1 rounded-lg text-xs transition-colors shrink-0 ${
                selectedMatter === m
                  ? 'bg-surface-container-high text-on-surface font-semibold shadow-2xs'
                  : 'text-secondary hover:text-on-surface'
              }`}
            >
              {m === 'all' ? 'Todas las materias' : m}
            </button>
          ))}
        </div>
      </div>

      {/* ── TABLA FINDER DENSE ── */}
      <div className="bg-surface-container-lowest rounded-xl border border-divider shadow-2xs overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low text-secondary font-caption text-[11px] uppercase tracking-wider border-b border-divider/60">
              <th className="py-2.5 px-4 font-semibold">Expediente</th>
              <th className="py-2.5 px-4 font-semibold">Órgano Jurisdiccional</th>
              <th className="py-2.5 px-4 font-semibold">Juicio / Causa</th>
              <th className="py-2.5 px-3 font-semibold">Materia</th>
              <th className="py-2.5 px-4 font-semibold">Estado Procesal</th>
              <th className="py-2.5 px-4 font-semibold text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider/40 text-body-default">
            {caseFicha?.expediente && (
              <tr
                onClick={() => onSelectExpediente(caseFicha.expediente!)}
                className="hover:bg-surface-container-low/60 transition-colors cursor-pointer bg-[#fffbfb]"
              >
                <td className="py-3 px-4 font-code-mono text-xs font-bold text-primary">
                  {caseFicha.expediente}
                </td>
                <td className="py-3 px-4 text-xs text-on-surface">
                  {caseFicha.actor || 'Juzgado de Primera Instancia'}
                </td>
                <td className="py-3 px-4 text-xs font-medium text-on-surface">
                  {caseFicha.tipo || 'Juicio Ordinario Civil'}
                </td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded bg-surface-container text-[11px] font-medium text-on-surface-variant">
                    {caseFicha.materia || 'Civil'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    En trámite
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <span className="material-symbols-outlined text-[18px] text-primary">arrow_forward</span>
                </td>
              </tr>
            )}

            <tr
              onClick={() => onSelectExpediente('800/2024')}
              className="hover:bg-surface-container-low/60 transition-colors cursor-pointer"
            >
              <td className="py-3 px-4 font-code-mono text-xs font-bold text-on-surface">
                800/2024
              </td>
              <td className="py-3 px-4 text-xs text-on-surface">
                Juzgado 14° Civil de Proceso Escrito CDMX
              </td>
              <td className="py-3 px-4 text-xs font-medium text-on-surface">
                Rescisión Contractual · Inmobiliaria vs Desarrollos
              </td>
              <td className="py-3 px-3">
                <span className="px-2 py-0.5 rounded bg-surface-container text-[11px] font-medium text-on-surface-variant">
                  Civil
                </span>
              </td>
              <td className="py-3 px-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  3 días restantes
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <span className="material-symbols-outlined text-[18px] text-secondary">arrow_forward</span>
              </td>
            </tr>

            <tr
              onClick={() => onSelectExpediente('512/2024')}
              className="hover:bg-surface-container-low/60 transition-colors cursor-pointer"
            >
              <td className="py-3 px-4 font-code-mono text-xs font-bold text-on-surface">
                512/2024
              </td>
              <td className="py-3 px-4 text-xs text-on-surface">
                Juzgado 2do Mercantil Oral CDMX
              </td>
              <td className="py-3 px-4 text-xs font-medium text-on-surface">
                Cobro de Pagarés · Banco vs Grupo Logístico
              </td>
              <td className="py-3 px-3">
                <span className="px-2 py-0.5 rounded bg-surface-container text-[11px] font-medium text-on-surface-variant">
                  Mercantil
                </span>
              </td>
              <td className="py-3 px-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-secondary font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                  Desahogo de pruebas
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <span className="material-symbols-outlined text-[18px] text-secondary">arrow_forward</span>
              </td>
            </tr>

            <tr
              onClick={() => onSelectExpediente('930/2023')}
              className="hover:bg-surface-container-low/60 transition-colors cursor-pointer"
            >
              <td className="py-3 px-4 font-code-mono text-xs font-bold text-on-surface">
                930/2023
              </td>
              <td className="py-3 px-4 text-xs text-on-surface">
                1er Tribunal Colegiado en Materia Civil
              </td>
              <td className="py-3 px-4 text-xs font-medium text-on-surface">
                Juicio de Amparo Directo · Crédito Indebido
              </td>
              <td className="py-3 px-3">
                <span className="px-2 py-0.5 rounded bg-surface-container text-[11px] font-medium text-on-surface-variant">
                  Amparo
                </span>
              </td>
              <td className="py-3 px-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-tertiary font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                  Para sentencia
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <span className="material-symbols-outlined text-[18px] text-secondary">arrow_forward</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ExpedientesView;
