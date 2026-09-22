'use client';

import React from 'react';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

interface InicioViewProps {
  onNewCase: () => void;
  onGenerateBrief: () => void;
  onOpenFile: () => void;
  onGoToTab: (tab: string) => void;
  uploadedDocs?: UploadedSourceDocument[];
  activeExpediente?: string;
  caseFicha?: {
    expediente?: string;
    actor?: string;
    demandado?: string;
    materia?: string;
    tipo?: string;
  } | null;
}

export function InicioView({
  onNewCase,
  onGenerateBrief,
  onOpenFile,
  onGoToTab,
  uploadedDocs = [],
  activeExpediente,
  caseFicha,
}: InicioViewProps) {
  const currentDate = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col w-full pb-10 px-4 sm:px-6 font-sans">
      {/* ── HEADER: SALUDO INSTITUCIONAL & ESTADO PJF ── */}
      <div className="pt-4 pb-5 flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-divider/60">
        <div>
          <span className="font-caption text-[11px] font-semibold text-secondary uppercase tracking-widest block mb-1">
            Módulo Jurídico Central
          </span>
          <h1 className="font-display-title text-display-title text-on-surface tracking-tight">
            Buenos días, Lic. Valenzuela
          </h1>
          <p className="font-meta-regular text-meta-regular text-secondary mt-0.5">
            ¿En qué deseas trabajar hoy?
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          <div className="flex items-center bg-surface-container-low px-3 py-1.5 rounded-lg border border-divider/60 shadow-2xs">
            <span className="inline-block w-2 h-2 rounded-full bg-tertiary-container mr-2 animate-pulse" />
            <span className="font-code-mono text-[11px] text-on-surface font-medium">
              PJF Enlace Directo Activo
            </span>
          </div>
          <div className="h-4 w-px bg-divider mx-1 hidden sm:block" />
          <span className="font-code-mono text-[12px] text-secondary capitalize">
            {currentDate}
          </span>
        </div>
      </div>

      {/* ── SECCIÓN 1: QUICK ACTION CARDS (4 Acciones Rápidas) ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-5 mb-8">
        {/* Card 1: Nuevo expediente */}
        <button
          onClick={onNewCase}
          className="group text-left bg-surface-container-lowest p-4 rounded-xl border border-divider shadow-2xs hover:shadow-md hover:border-primary/40 transition-all duration-150 flex flex-col justify-between h-32 relative overflow-hidden"
        >
          <div className="flex items-start justify-between w-full">
            <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary-container group-hover:bg-primary-container group-hover:text-on-primary transition-colors">
              <span className="material-symbols-outlined text-[20px]">create_new_folder</span>
            </div>
            <kbd className="font-code-mono text-[10px] text-secondary bg-surface-container-low px-1.5 py-0.5 rounded border border-divider/60">
              ⌘N
            </kbd>
          </div>
          <div>
            <span className="font-heading-sm text-heading-sm text-on-surface block group-hover:text-primary-container transition-colors">
              Nuevo expediente
            </span>
            <span className="font-caption text-caption text-secondary">
              Apertura de sumario e indización
            </span>
          </div>
        </button>

        {/* Card 2: Generar escrito */}
        <button
          onClick={onGenerateBrief}
          className="group text-left bg-surface-container-lowest p-4 rounded-xl border border-divider shadow-2xs hover:shadow-md hover:border-primary/40 transition-all duration-150 flex flex-col justify-between h-32 relative overflow-hidden"
        >
          <div className="flex items-start justify-between w-full">
            <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary-container group-hover:bg-primary-container group-hover:text-on-primary transition-colors">
              <span className="material-symbols-outlined text-[20px]">edit_note</span>
            </div>
            <kbd className="font-code-mono text-[10px] text-secondary bg-surface-container-low px-1.5 py-0.5 rounded border border-divider/60">
              ⌘G
            </kbd>
          </div>
          <div>
            <span className="font-heading-sm text-heading-sm text-on-surface block group-hover:text-primary-container transition-colors">
              Generar escrito
            </span>
            <span className="font-caption text-caption text-secondary">
              Demanda, contestación o alegato
            </span>
          </div>
        </button>

        {/* Card 3: Abrir documento */}
        <button
          onClick={onOpenFile}
          className="group text-left bg-surface-container-lowest p-4 rounded-xl border border-divider shadow-2xs hover:shadow-md hover:border-primary/40 transition-all duration-150 flex flex-col justify-between h-32 relative overflow-hidden"
        >
          <div className="flex items-start justify-between w-full">
            <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-secondary group-hover:bg-on-surface group-hover:text-surface transition-colors">
              <span className="material-symbols-outlined text-[20px]">file_open</span>
            </div>
            <kbd className="font-code-mono text-[10px] text-secondary bg-surface-container-low px-1.5 py-0.5 rounded border border-divider/60">
              ⌘O
            </kbd>
          </div>
          <div>
            <span className="font-heading-sm text-heading-sm text-on-surface block">
              Abrir documento
            </span>
            <span className="font-caption text-caption text-secondary">
              Cargar Word, PDF o fojas sueltas
            </span>
          </div>
        </button>

        {/* Card 4: Buscar expediente */}
        <button
          onClick={() => onGoToTab('expedientes')}
          className="group text-left bg-surface-container-lowest p-4 rounded-xl border border-divider shadow-2xs hover:shadow-md hover:border-primary/40 transition-all duration-150 flex flex-col justify-between h-32 relative overflow-hidden"
        >
          <div className="flex items-start justify-between w-full">
            <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[20px]">manage_search</span>
            </div>
            <kbd className="font-code-mono text-[10px] text-secondary bg-surface-container-low px-1.5 py-0.5 rounded border border-divider/60">
              ⌘F
            </kbd>
          </div>
          <div>
            <span className="font-heading-sm text-heading-sm text-on-surface block">
              Buscar expediente
            </span>
            <span className="font-caption text-caption text-secondary">
              Localizar causas, autos o acuerdos
            </span>
          </div>
        </button>
      </section>

      {/* ── SECCIÓN 2: EXPEDIENTES RECIENTES & TIMELINE FORENSE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols): Expedientes Recientes */}
        <div className="lg:col-span-8 flex flex-col">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[20px]">folder_special</span>
              <h2 className="font-section-title text-section-title text-on-surface">
                Expedientes Recientes
              </h2>
              <span className="bg-surface-container text-secondary font-code-mono text-[11px] px-2 py-0.5 rounded-full">
                {caseFicha?.expediente ? '1 activo' : 'Causas registradas'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onGoToTab('expedientes')}
                className="text-xs text-primary hover:underline font-meta-medium flex items-center gap-0.5"
              >
                <span>Ver todos</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl border border-divider shadow-2xs overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 px-4 py-2.5 bg-surface-container-low text-secondary font-caption text-[11px] uppercase tracking-wider border-b border-divider/60">
              <div className="col-span-3">Expediente / Causa</div>
              <div className="col-span-4">Rubro Jurídico</div>
              <div className="col-span-2">Materia</div>
              <div className="col-span-2">Término / Estado</div>
              <div className="col-span-1 text-right">Acción</div>
            </div>

            {/* Rows */}
            <div className="flex flex-col divide-y divide-divider/40">
              {/* Caso Real Activo Si Existe */}
              {caseFicha?.expediente ? (
                <div
                  onClick={() => onGoToTab('contestaciones')}
                  className="group grid grid-cols-12 items-center px-4 py-3.5 hover:bg-surface-container-low/60 transition-colors cursor-pointer relative"
                >
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-primary-container rounded-r opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="col-span-3 flex flex-col pr-2">
                    <span className="font-heading-sm text-heading-sm text-on-surface flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-primary">folder_open</span>
                      {caseFicha.expediente}
                    </span>
                    <span className="font-caption text-caption text-secondary">
                      {caseFicha.actor || 'Juzgado en turno'}
                    </span>
                  </div>
                  <div className="col-span-4 flex flex-col pr-3">
                    <span className="font-body-strong text-body-strong text-on-surface truncate">
                      {caseFicha.tipo || 'Juicio Ordinario Civil'}
                    </span>
                    <span className="font-caption text-caption text-secondary truncate">
                      {caseFicha.demandado ? `vs. ${caseFicha.demandado}` : 'Causa en trámite'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="inline-block bg-surface-container px-2 py-0.5 rounded font-meta-regular text-[11px] text-on-surface-variant font-medium">
                      {caseFicha.materia || 'Civil'}
                    </span>
                  </div>
                  <div className="col-span-2 flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-container" />
                      <span className="font-body-strong text-[12px] text-primary-container">
                        Borrador en curso
                      </span>
                    </div>
                    <span className="font-caption text-[11px] text-secondary">Modif: Hoy</span>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <span className="material-symbols-outlined text-[18px] text-primary">arrow_forward</span>
                  </div>
                </div>
              ) : null}

              {/* Fila Fija 800/2024 */}
              <div
                onClick={() => onGoToTab('contestaciones')}
                className="group grid grid-cols-12 items-center px-4 py-3.5 hover:bg-surface-container-low/60 transition-colors cursor-pointer relative"
              >
                <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-primary-container rounded-r opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="col-span-3 flex flex-col pr-2">
                  <span className="font-heading-sm text-heading-sm text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-secondary">folder_open</span>
                    800/2024
                  </span>
                  <span className="font-caption text-caption text-secondary">Juzg. 14° Civil CDMX</span>
                </div>
                <div className="col-span-4 flex flex-col pr-3">
                  <span className="font-body-strong text-body-strong text-on-surface truncate">
                    Juicio Ordinario Civil
                  </span>
                  <span className="font-caption text-caption text-secondary truncate">
                    Rescisión Contractual e Indemnización
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="inline-block bg-surface-container px-2 py-0.5 rounded font-meta-regular text-[11px] text-on-surface-variant font-medium">
                    Civil
                  </span>
                </div>
                <div className="col-span-2 flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary-container" />
                    <span className="font-body-strong text-[12px] text-primary-container">
                      3 días restantes
                    </span>
                  </div>
                  <span className="font-caption text-[11px] text-secondary">Término fatal</span>
                </div>
                <div className="col-span-1 flex justify-end">
                  <span className="material-symbols-outlined text-[18px] text-secondary group-hover:text-primary">arrow_forward</span>
                </div>
              </div>

              {/* Fila Fija 512/2024 */}
              <div
                onClick={() => onGoToTab('contestaciones')}
                className="group grid grid-cols-12 items-center px-4 py-3.5 hover:bg-surface-container-low/60 transition-colors cursor-pointer relative"
              >
                <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-primary-container rounded-r opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="col-span-3 flex flex-col pr-2">
                  <span className="font-heading-sm text-heading-sm text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-secondary">folder_open</span>
                    512/2024
                  </span>
                  <span className="font-caption text-caption text-secondary">Juzg. 2do Mercantil Oral</span>
                </div>
                <div className="col-span-4 flex flex-col pr-3">
                  <span className="font-body-strong text-body-strong text-on-surface truncate">
                    Cobro de Pagarés
                  </span>
                  <span className="font-caption text-caption text-secondary truncate">
                    Banco Fiduciario vs. Grupo Logístico
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="inline-block bg-surface-container px-2 py-0.5 rounded font-meta-regular text-[11px] text-on-surface-variant font-medium">
                    Mercantil Oral
                  </span>
                </div>
                <div className="col-span-2 flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                    <span className="font-body-strong text-[12px] text-on-surface">
                      Desahogo de pruebas
                    </span>
                  </div>
                  <span className="font-caption text-[11px] text-secondary">Fase probatoria</span>
                </div>
                <div className="col-span-1 flex justify-end">
                  <span className="material-symbols-outlined text-[18px] text-secondary group-hover:text-primary">arrow_forward</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Cuaderno Forense & Timeline Procesal */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-1 px-1">
            <span className="material-symbols-outlined text-primary text-[20px]">calendar_month</span>
            <h2 className="font-section-title text-section-title text-on-surface">
              Cuaderno Forense
            </h2>
          </div>

          <div className="bg-surface-container-lowest rounded-xl border border-divider shadow-2xs p-4 space-y-4">
            {/* Timeline item 1 */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-error-container/40 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[17px]">timer</span>
              </div>
              <div>
                <span className="font-body-strong text-xs text-primary block">
                  Vencimiento Término Contestación
                </span>
                <span className="font-caption text-[11px] text-secondary">
                  Exp. 800/2024 · Juzg. 14° Civil CDMX
                </span>
                <p className="font-meta-regular text-[11px] text-on-surface-variant mt-1">
                  Plazo fatal para radicación electrónica en el sistema del PJCDMX.
                </p>
              </div>
            </div>

            <div className="h-px bg-divider/60" />

            {/* Timeline item 2 */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-container text-secondary flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[17px]">gavel</span>
              </div>
              <div>
                <span className="font-body-strong text-xs text-on-surface block">
                  Audiencia Preliminar Oral
                </span>
                <span className="font-caption text-[11px] text-secondary">
                  Exp. 512/2024 · Juzg. 2do Mercantil
                </span>
                <p className="font-meta-regular text-[11px] text-on-surface-variant mt-1">
                  Depuración procesal y fijación de acuerdos sobre hechos no controvertidos.
                </p>
              </div>
            </div>

            <div className="h-px bg-divider/60" />

            {/* Timeline item 3 */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[17px]">verified</span>
              </div>
              <div>
                <span className="font-body-strong text-xs text-on-surface block">
                  Cotejo de Precedentes SCJN
                </span>
                <span className="font-caption text-[11px] text-secondary">
                  Semanario Judicial · 11a Época
                </span>
                <p className="font-meta-regular text-[11px] text-on-surface-variant mt-1">
                  12 nuevas tesis jurisprudenciales sincronizadas para materia civil.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InicioView;
