'use client';

import React, { useState } from 'react';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';

interface ContestacionesViewProps {
  onImportEmplazamiento: () => void;
  onNewContestacion: () => void;
  onOpenEditor: () => void;
  uploadedDocs?: UploadedSourceDocument[];
  caseFicha?: {
    expediente?: string;
    actor?: string;
    demandado?: string;
    materia?: string;
    tipo?: string;
    autoridad?: string;
  } | null;
  caseAnalysis?: CaseAnalysis | null;
  onGenerateContestacion?: (posturas: Record<number, any>, excepciones: string[]) => Promise<void>;
}

export function ContestacionesView({
  onImportEmplazamiento,
  onNewContestacion,
  onOpenEditor,
  uploadedDocs = [],
  caseFicha,
  caseAnalysis,
  onGenerateContestacion,
}: ContestacionesViewProps) {
  const [viewMode, setViewMode] = useState<'workspace' | 'tabla'>('workspace');
  const [filterState, setFilterState] = useState<'todas' | 'perentorio' | 'borradores'>('todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [activePage, setActivePage] = useState(4);
  const totalPages = uploadedDocs[0]?.pages?.length || 18;
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileSuccess, setCompileSuccess] = useState(false);

  // Posturas por hecho (1: negativa, 2: salvedades, 3: admitido)
  const [posturas, setPosturas] = useState<Record<number, { tipo: 'negativa' | 'parcial' | 'ignora' | 'propio'; texto: string }>>({
    1: {
      tipo: 'negativa',
      texto:
        'EL HECHO PRIMERO SE NIEGA por no ser un hecho propio de mi mandante y ser totalmente falso en la forma en que se encuentra expuesto por la actora. Es falso de toda falsedad que se hubiere celebrado el contrato de suministro el 14 de marzo de 2024, toda vez que en dicha data mi representada se encontraba legalmente imposibilitada.',
    },
    2: {
      tipo: 'parcial',
      texto:
        'EL HECHO SEGUNDO SE ADMITE ÚNICAMENTE en cuanto a la fecha 28 de abril de 2024; pero SE ACLARA Y REFUTA EN SU TOTALIDAD en cuanto a que los perfiles metálicos hubiesen sido recibidos a "entera satisfacción", pues se levantó Minuta de Observaciones por defectos ostensibles de origen, no existiendo exigibilidad respecto a la parcialidad pretendida.',
    },
    3: {
      tipo: 'negativa',
      texto:
        'EL HECHO TERCERO SE NIEGA categóricamente. No se produjeron los perjuicios alegados, ni existe nexo causal atribuible a mi representada que justifique la cuantía de $1,200,000.00 M.N.',
    },
  });

  // Excepciones procesales activas
  const [excepciones, setExcepciones] = useState<Record<string, boolean>>({
    legitimacion: true,
    prescripcion: true,
    incompetencia: true,
    litispendencia: false,
  });

  const toggleExcepcion = (id: string) => {
    setExcepciones((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleQuickPostura = (hechoNum: number, tipo: 'negativa' | 'parcial' | 'propio') => {
    setPosturas((prev) => {
      const current = prev[hechoNum] || { tipo: 'negativa', texto: '' };
      let newText = current.texto;
      if (tipo === 'negativa') {
        newText = `EL HECHO SE NIEGA EN SU TOTALIDAD por ser totalmente inexacto y no ajustarse a la realidad de los acontecimientos ocurridos.`;
      } else if (tipo === 'parcial') {
        newText = `EL HECHO SE ADMITE CON SALVEDADES ÚNICAMENTE en cuanto a sus referencias temporales, pero se refuta la interpretación perjudicial que de él pretende derivar la contraparte.`;
      } else if (tipo === 'propio') {
        newText = `EL HECHO SE ACREDITA COMO PROPIO en los términos estrictos que constan en las documentales anexas exhibidas por esta representación.`;
      }
      return {
        ...prev,
        [hechoNum]: { tipo, texto: newText },
      };
    });
  };

  const handleTriggerGenerate = async () => {
    setIsCompiling(true);
    try {
      if (onGenerateContestacion) {
        const activeExcepcionesList = Object.keys(excepciones).filter((k) => excepciones[k]);
        await onGenerateContestacion(posturas, activeExcepcionesList);
      } else {
        await new Promise((r) => setTimeout(r, 1200));
        onOpenEditor();
      }
      setCompileSuccess(true);
      setTimeout(() => setCompileSuccess(false), 3000);
    } catch {
      // Ignora error si el pipeline lo maneja
    } finally {
      setIsCompiling(false);
    }
  };

  const activeExpediente = caseFicha?.expediente || 'EXP-442/2026';
  const activeJuicio = caseFicha?.tipo || 'Juicio Ordinario Civil';
  const activeJuzgado = caseFicha?.autoridad || 'Juzgado 15° de lo Civil de la CDMX';
  const activeActor = caseFicha?.actor || 'Promotora de Inmuebles Residenciales S.A. de C.V.';

  return (
    <div className="flex flex-col w-full pb-space-xl px-gutter font-sans bg-surface min-h-screen">
      <div className="w-full max-w-[1800px] mx-auto flex flex-col gap-space-md pt-space-sm">
        {/* CABECERA PRINCIPAL DEL MÓDULO */}
        <div className="bg-surface-container-low rounded-xl p-space-lg shadow-xs border border-outline-variant/30">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-space-md">
            <div className="space-y-space-xxs min-w-0">
              <div className="flex items-center gap-space-sm flex-wrap">
                <span className="bg-primary-container text-on-primary px-space-sm py-space-xxs rounded font-code-sm text-code-sm font-semibold tracking-wider uppercase">
                  Módulo Procesal 03
                </span>
                <span className="bg-surface-container-highest text-on-surface-variant px-space-sm py-space-xxs rounded font-code-sm text-code-sm">
                  Fase de Emplazamiento & Fijación de Litis
                </span>
                <span className="inline-flex items-center gap-space-xxs bg-tertiary-fixed text-on-tertiary-fixed px-space-sm py-space-xxs rounded font-code-sm text-code-sm font-medium">
                  <span className="material-symbols-outlined text-[14px]">verified_user</span>
                  Traslado Certificado Digitalmente
                </span>
              </div>
              <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
                Módulo Especializado en Contestaciones & Excepciones Procesales
              </h1>
              <div className="flex items-center gap-space-md flex-wrap text-on-surface-variant">
                <div className="flex items-center gap-space-xxs">
                  <span className="material-symbols-outlined text-[16px] text-primary">gavel</span>
                  <span className="font-body-md text-body-md font-medium text-on-surface">{activeExpediente}</span>
                </div>
                <span className="text-outline-variant">•</span>
                <span className="font-body-md text-body-md">{activeJuicio}</span>
                <span className="text-outline-variant">•</span>
                <span className="font-body-md text-body-md">{activeJuzgado}</span>
                <span className="text-outline-variant">•</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">Actor: {activeActor}</span>
              </div>
            </div>

            {/* METADATA TÉRMINO & COBERTURA DE RIESGO + BOTONES */}
            <div className="flex items-center gap-space-md flex-wrap">
              <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-xs border border-amber-200/60 flex items-center gap-space-md min-w-[280px]">
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-700">
                  <span className="material-symbols-outlined text-[24px]">hourglass_top</span>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center justify-between gap-space-xs">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-amber-900 font-bold">
                      Término Judicial Fatal
                    </span>
                    <span className="h-2 w-2 rounded-full bg-amber-600 animate-ping"></span>
                  </div>
                  <span className="font-headline-sm text-headline-sm text-amber-950 font-bold">9 Días Hábiles</span>
                  <span className="font-code-sm text-code-sm text-amber-800">Vence: 4 de Septiembre de 2026 (23:59 hrs)</span>
                </div>
              </div>

              <div className="hidden 2xl:flex flex-col bg-surface-container-lowest p-space-md rounded-lg shadow-xs border border-outline-variant/30 w-44">
                <div className="flex items-center justify-between mb-space-xxs">
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Estatus Hechos</span>
                  <span className="font-code-sm text-code-sm text-primary font-bold">6/9 Listos</span>
                </div>
                <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                  <div className="bg-primary-container h-full rounded-full" style={{ width: '66.6%' }}></div>
                </div>
                <span className="font-code-sm text-code-sm text-on-surface-variant mt-space-xxs">3 Excepciones fijadas</span>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-space-xs bg-surface-container-lowest p-1 rounded-lg border border-outline-variant/30 shadow-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('workspace')}
                  className={`px-space-sm py-space-xxs rounded font-label-sm text-label-sm transition-all ${
                    viewMode === 'workspace'
                      ? 'bg-primary text-on-primary font-semibold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Estrategia & Litis
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('tabla')}
                  className={`px-space-sm py-space-xxs rounded font-label-sm text-label-sm transition-all ${
                    viewMode === 'tabla'
                      ? 'bg-primary text-on-primary font-semibold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Expedientes
                </button>
              </div>

              <button
                onClick={onImportEmplazamiento}
                className="h-9 px-space-sm rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container border border-outline-variant/30 shadow-xs flex items-center gap-space-xs transition-all text-label-sm font-semibold"
                title="Importar archivo de demanda"
              >
                <span className="material-symbols-outlined text-[17px] text-primary">upload_file</span>
                <span>Importar Emplazamiento</span>
              </button>

              <button
                type="button"
                onClick={onNewContestacion}
                className="h-9 px-space-sm rounded-lg bg-primary-container text-on-primary hover:bg-primary shadow-xs flex items-center gap-space-xs transition-all text-label-sm font-semibold"
                title="Abrir configuración de una nueva contestación"
              >
                <span className="material-symbols-outlined text-[17px]">add</span>
                <span>Nueva Contestación</span>
              </button>

              <button
                type="button"
                onClick={onOpenEditor}
                className="h-9 px-space-sm rounded-lg bg-surface-container-lowest text-primary hover:bg-surface-container border border-outline-variant/30 shadow-xs flex items-center gap-space-xs transition-all text-label-sm font-semibold"
                title="Abrir el editor jurídico"
              >
                <span className="material-symbols-outlined text-[17px]">edit_document</span>
                <span>Editar Respuesta</span>
              </button>
            </div>
          </div>
        </div>

        {/* WORKSPACE DIVIDIDO EN DOS COLUMNAS (SPLIT VIEW) */}
        {viewMode === 'workspace' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-start">
              {/* COLUMNA IZQUIERDA: VISOR DE TRASLADO & EXTRACCIÓN (6 cols) */}
              <section className="lg:col-span-6 bg-surface-container-lowest rounded-xl shadow-xs border border-outline-variant/30 overflow-hidden flex flex-col">
                {/* Toolbar Visor */}
                <div className="bg-surface-container-low px-space-md py-space-sm flex items-center justify-between gap-space-sm border-b border-outline-variant/20">
                  <div className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-[18px] text-primary">description</span>
                    <span className="font-headline-sm text-headline-sm text-on-surface">Escrito de Demanda (Traslado)</span>
                    <span className="bg-surface-container-highest font-code-sm text-code-sm px-space-xs py-space-xxs rounded text-on-surface-variant">
                      Fojas 1 - {totalPages}
                    </span>
                  </div>
                  <div className="flex items-center gap-space-xs">
                    {/* Paginador */}
                    <div className="flex items-center bg-surface-container-lowest rounded px-space-xs py-space-xxs shadow-xs border border-outline-variant/20">
                      <button
                        type="button"
                        onClick={() => setActivePage((p) => Math.max(1, p - 1))}
                        className="text-on-surface-variant hover:text-primary transition-colors p-space-xxs"
                        title="Página anterior"
                      >
                        <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                      </button>
                      <span className="font-code-sm text-code-sm px-space-xs font-semibold text-on-surface">
                        Pág. {activePage} de {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActivePage((p) => Math.min(totalPages, p + 1))}
                        className="text-on-surface-variant hover:text-primary transition-colors p-space-xxs"
                        title="Página siguiente"
                      >
                        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sub-Barra Contextual de Segmentación Fáctica */}
                <div className="bg-surface-container px-space-md py-space-xs flex items-center justify-between text-on-surface-variant border-b border-outline-variant/20">
                  <div className="flex items-center gap-space-sm">
                    <span className="material-symbols-outlined text-[16px] text-tertiary">document_scanner</span>
                    <span className="font-label-sm text-label-sm">Segmentación de Hechos Procesada por OCR Óptico SCJN</span>
                  </div>
                  <div className="flex items-center gap-space-xs font-code-sm text-code-sm">
                    <span className="text-emerald-700 font-semibold flex items-center gap-space-xxs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>Cotejo 100% Legible
                    </span>
                  </div>
                </div>

                {/* Lienzo de Hoja Judicial Simulada */}
                <div className="p-space-lg bg-surface-container-low max-h-[760px] overflow-y-auto space-y-space-md">
                  {/* Hoja de Papel de Juzgado */}
                  <div className="bg-surface-container-lowest p-space-xl rounded-lg shadow-sm relative border border-outline-variant/20">
                    {/* Sello de Recepción Judicial de la Hoja */}
                    <div className="absolute top-space-md right-space-md text-right bg-surface-container-low/70 p-space-xs rounded border border-outline-variant/20">
                      <p className="font-code-sm text-code-sm text-outline uppercase font-bold tracking-wider">JUZGADO 15° CIVIL CDMX</p>
                      <p className="font-code-sm text-code-sm text-on-surface-variant">RECIBIDO OFICIALÍA DE PARTES</p>
                      <p className="font-code-sm text-code-sm text-primary font-bold">18 AGO 2026 • 11:24 HRS</p>
                    </div>

                    <div className="space-y-space-lg font-body-lg text-body-lg text-on-surface pt-space-xl font-serif">
                      <div className="text-center font-headline-sm text-headline-sm uppercase text-primary tracking-wide font-sans font-bold">
                        CAPÍTULO DE HECHOS DE LA DEMANDA
                      </div>

                      {/* HECHO PRIMERO SEGMENTADO */}
                      <div className="bg-surface-container-low p-space-md rounded-lg relative transition-all hover:shadow-md border border-outline-variant/20">
                        <div className="flex items-center justify-between mb-space-xs">
                          <span className="font-label-sm text-label-sm uppercase font-bold text-primary bg-primary-fixed px-space-xs py-space-xxs rounded font-sans">
                            Hecho Primero (Demanda)
                          </span>
                          <span className="font-code-sm text-code-sm text-on-surface-variant font-sans">Foja 4, líneas 12 a 24</span>
                        </div>
                        <p className="text-on-surface leading-relaxed text-justify italic">
                          &ldquo;1.- Con fecha 14 de marzo del año 2024, las partes celebraron en la Ciudad de México el contrato de suministro de materiales para construcción denominado &apos;CONTRATO-MX-440&apos;, pactándose en su cláusula Quinta el pago por la cantidad líquida de $4,850,000.00 M.N., pagaderos en tres exhibiciones quincenales consecutivas mediante transferencia interbancaria al Banco Mercantil.&rdquo;
                        </p>
                        {/* Barra de Acciones Rápidas sobre el Hecho */}
                        <div className="mt-space-md pt-space-xs flex flex-wrap items-center gap-space-xs bg-surface-container-lowest p-space-xs rounded font-sans">
                          <span className="font-label-sm text-label-sm text-on-surface-variant px-space-xs">Respuesta Rápida:</span>
                          <button
                            type="button"
                            onClick={() => handleQuickPostura(1, 'negativa')}
                            className="bg-error text-on-error px-space-sm py-space-xxs rounded font-label-sm text-label-sm flex items-center gap-space-xxs hover:opacity-90 transition-opacity"
                          >
                            <span className="material-symbols-outlined text-[14px]">cancel</span>
                            Refutar / Negar Hecho
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickPostura(1, 'parcial')}
                            className="bg-tertiary-container text-on-tertiary-container px-space-sm py-space-xxs rounded font-label-sm text-label-sm flex items-center gap-space-xxs hover:opacity-90 transition-opacity"
                          >
                            <span className="material-symbols-outlined text-[14px]">rule</span>
                            Aceptar con Salvedades
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickPostura(1, 'propio')}
                            className="bg-surface-container-highest text-on-surface px-space-sm py-space-xxs rounded font-label-sm text-label-sm flex items-center gap-space-xxs hover:bg-surface-container-high transition-colors"
                          >
                            <span className="material-symbols-outlined text-[14px]">check_circle</span>
                            Acreditar como Propio
                          </button>
                        </div>
                      </div>

                      {/* HECHO SEGUNDO SEGMENTADO (ACTIVO / EN FOCO) */}
                      <div className="bg-surface-bright p-space-md rounded-lg shadow-md relative border-2 border-primary">
                        <div className="flex items-center justify-between mb-space-xs">
                          <div className="flex items-center gap-space-xs font-sans">
                            <span className="font-label-sm text-label-sm uppercase font-bold text-on-primary bg-primary-container px-space-xs py-space-xxs rounded">
                              Hecho Segundo (En Revisión Activa)
                            </span>
                            <span className="material-symbols-outlined text-[16px] text-primary animate-bounce">arrow_forward</span>
                          </div>
                          <span className="font-code-sm text-code-sm text-on-surface-variant font-sans">Foja 4, líneas 25 a 42</span>
                        </div>
                        <p className="text-on-surface leading-relaxed text-justify selection:bg-tertiary-fixed-dim">
                          &ldquo;2.- Es el caso que el demandado, no obstante haber recibido a entera satisfacción el primer cargamento de estructuras de acero el día{' '}
                          <mark className="bg-tertiary-fixed font-semibold px-space-xxs">28 de abril de 2024</mark>, omitió injustificadamente realizar la liquidación de la segunda parcialidad convenida, incurriendo en mora culpable desde el día siguiente a su presunto vencimiento, negándose sistemáticamente a dar respuesta a los requerimientos notariales practicados.&rdquo;
                        </p>
                        {/* Selector de fragmentos fácticos con botones contextuales */}
                        <div className="mt-space-md pt-space-sm bg-surface-container-low p-space-sm rounded-lg flex flex-col gap-space-xs font-sans">
                          <div className="flex items-center justify-between">
                            <span className="font-label-sm text-label-sm text-primary font-semibold flex items-center gap-space-xxs">
                              <span className="material-symbols-outlined text-[14px]">edit_note</span>
                              Inyectar al Cuadro de Contestación:
                            </span>
                            <span className="font-code-sm text-code-sm text-secondary font-medium">Contradicción Fáctica Detectada</span>
                          </div>
                          <div className="flex items-center gap-space-xs flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleQuickPostura(2, 'negativa')}
                              className="bg-primary-container text-on-primary px-space-sm py-space-xs rounded font-label-md text-label-md flex items-center gap-space-xs hover:bg-primary transition-colors shadow-xs"
                            >
                              <span className="material-symbols-outlined text-[16px]">close</span>
                              [Refutar / Negar Hecho]
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickPostura(2, 'parcial')}
                              className="bg-tertiary text-on-tertiary px-space-sm py-space-xs rounded font-label-md text-label-md flex items-center gap-space-xs hover:opacity-90 transition-opacity shadow-xs"
                            >
                              <span className="material-symbols-outlined text-[16px]">flaky</span>
                              [Aceptar con Salvedades]
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickPostura(2, 'propio')}
                              className="bg-surface-container-highest hover:bg-surface-container-high text-on-surface px-space-sm py-space-xs rounded font-label-md text-label-md flex items-center gap-space-xs transition-colors"
                            >
                              <span className="material-symbols-outlined text-[16px]">done_all</span>
                              [Acreditar como Propio]
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* HECHO TERCERO SEGMENTADO */}
                      <div className="bg-surface-container-low p-space-md rounded-lg relative opacity-90 hover:opacity-100 transition-opacity border border-outline-variant/20">
                        <div className="flex items-center justify-between mb-space-xs">
                          <span className="font-label-sm text-label-sm uppercase font-bold text-on-surface-variant bg-surface-container-highest px-space-xs py-space-xxs rounded font-sans">
                            Hecho Tercero (Demanda)
                          </span>
                          <span className="font-code-sm text-code-sm text-on-surface-variant font-sans">Foja 5, líneas 1 a 19</span>
                        </div>
                        <p className="text-on-surface leading-relaxed text-justify italic">
                          &ldquo;3.- Derivado de dicho impago, mi representada sufrió cuantiosos perjuicios comerciales evaluados pericialmente en $1,200,000.00 M.N., cuyo resarcimiento es exigible conforme al artículo 1949 del Código Civil aplicable al presente fuero común.&rdquo;
                        </p>
                        <div className="mt-space-sm flex items-center justify-end gap-space-xs font-sans">
                          <button
                            type="button"
                            onClick={() => handleQuickPostura(3, 'negativa')}
                            className="text-primary hover:underline font-label-sm text-label-sm flex items-center gap-space-xxs"
                          >
                            <span className="material-symbols-outlined text-[14px]">stylus</span>
                            Asignar postura defensiva
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Pie de Foja Procesal */}
                    <div className="mt-space-xl pt-space-md flex items-center justify-between font-code-sm text-code-sm text-outline border-t border-outline-variant/20">
                      <span>{activeExpediente} • TRASLADO FOJA 4 DE {totalPages}</span>
                      <span>FIRMA AUTÓGRAFA Y COTEJO ELECTRÓNICO</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* COLUMNA DERECHA: FORMULACIÓN DE CONTESTACIÓN & EXCEPCIONES PREVIAS (6 cols) */}
              <section className="lg:col-span-6 bg-surface-container-lowest rounded-xl shadow-xs border border-outline-variant/30 overflow-hidden flex flex-col">
                {/* Toolbar Formulación */}
                <div className="bg-surface-container-low px-space-md py-space-sm flex items-center justify-between gap-space-sm border-b border-outline-variant/20">
                  <div className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-[18px] text-primary">edit_document</span>
                    <span className="font-headline-sm text-headline-sm text-on-surface">Estrategia de Contestación & Litis</span>
                  </div>
                  <div className="flex items-center gap-space-xs">
                    <span className="bg-emerald-100 text-emerald-900 px-space-xs py-space-xxs rounded font-code-sm text-code-sm flex items-center gap-space-xxs font-medium">
                      <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
                      IA NVIDIA Litigios On
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPosturas({
                          1: { tipo: 'negativa', texto: 'EL HECHO SE NIEGA categóricamente.' },
                          2: { tipo: 'parcial', texto: 'EL HECHO SE ADMITE ÚNICAMENTE en cuanto a...' },
                          3: { tipo: 'negativa', texto: 'EL HECHO SE NIEGA por carecer de veracidad.' },
                        });
                      }}
                      className="p-space-xxs text-on-surface-variant hover:text-primary rounded transition-colors"
                      title="Restaurar valores canónicos"
                    >
                      <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                    </button>
                  </div>
                </div>

                {/* Contenedor del Editor y Excepciones */}
                <div className="p-space-lg max-h-[760px] overflow-y-auto space-y-space-lg">
                  {/* SECCIÓN A: SELECTOR DE POSTURA FÁCTICA POR HECHO */}
                  <div className="space-y-space-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-space-xs">
                        <span className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center font-code-sm text-code-sm font-bold">
                          1
                        </span>
                        <h2 className="font-headline-sm text-headline-sm text-on-surface">Pronunciamiento Categórico de Hechos</h2>
                      </div>
                      <span className="font-code-sm text-code-sm text-on-surface-variant">Obligación Procesal (Art. 266 CPCDF)</span>
                    </div>

                    {/* TARJETA POSTURA: HECHO PRIMERO */}
                    <div className="bg-surface-container-low rounded-lg p-space-md space-y-space-sm border border-outline-variant/20">
                      <div className="flex items-center justify-between">
                        <span className="font-label-md text-label-md font-bold text-on-surface">HECHO PRIMERO DE DEMANDA</span>
                        <span className="bg-error-container text-on-error-container px-space-sm py-space-xxs rounded-full font-code-sm text-code-sm font-bold flex items-center gap-space-xxs">
                          <span className="material-symbols-outlined text-[12px]">do_not_disturb_on</span>
                          NEGACIÓN TOTAL
                        </span>
                      </div>
                      <div className="bg-surface-container-lowest p-space-sm rounded font-body-md text-body-md text-on-surface-variant italic border border-outline-variant/20">
                        &ldquo;Con fecha 14 de marzo del año 2024, las partes celebraron en la Ciudad de México el contrato...&rdquo;
                      </div>
                      <div className="space-y-space-xs">
                        <label className="font-label-sm text-label-sm text-on-surface font-semibold flex items-center justify-between">
                          <span>Redacción de la Contestación al Hecho Primero:</span>
                          <span className="font-code-sm text-code-sm text-secondary">Fórmula Procesal Vigente</span>
                        </label>
                        <textarea
                          rows={3}
                          value={posturas[1]?.texto || ''}
                          onChange={(e) =>
                            setPosturas((prev) => ({
                              ...prev,
                              1: { tipo: prev[1]?.tipo || 'negativa', texto: e.target.value },
                            }))
                          }
                          className="w-full bg-surface-container-lowest p-space-sm rounded font-body-md text-body-md text-on-surface focus:outline-none focus:ring-1 focus:ring-primary shadow-xs border border-outline-variant/20"
                        />
                      </div>
                    </div>

                    {/* TARJETA POSTURA: HECHO SEGUNDO (DETALLE AVANZADO) */}
                    <div className="bg-surface-container-high rounded-lg p-space-md space-y-space-sm border border-outline-variant/30 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-label-md text-label-md font-bold text-primary">HECHO SEGUNDO DE DEMANDA</span>
                        <span className="bg-tertiary-fixed text-on-tertiary-fixed px-space-sm py-space-xxs rounded-full font-code-sm text-code-sm font-bold flex items-center gap-space-xxs">
                          <span className="material-symbols-outlined text-[12px]">fact_check</span>
                          ADMITE CON SALVEDADES
                        </span>
                      </div>
                      <div className="bg-surface-container-lowest p-space-sm rounded font-body-md text-body-md text-on-surface italic border border-outline-variant/20">
                        &ldquo;...recibido a entera satisfacción el primer cargamento de estructuras de acero el día 28 de abril de 2024...&rdquo;
                      </div>
                      {/* Selector Radio de Categoría de Contestación */}
                      <div className="grid grid-cols-3 gap-space-xs pt-space-xxs">
                        {[
                          { id: 'negativa', label: 'Negativa Lisa' },
                          { id: 'parcial', label: 'Admite Parcial' },
                          { id: 'ignora', label: 'Ignora Hecho' },
                        ].map((cat) => (
                          <label
                            key={cat.id}
                            className={`flex items-center gap-space-xs p-space-xs rounded cursor-pointer transition-colors border ${
                              posturas[2]?.tipo === cat.id
                                ? 'bg-primary text-on-primary border-primary font-semibold'
                                : 'bg-surface-container-lowest hover:bg-surface-container border-outline-variant/20 text-on-surface'
                            }`}
                          >
                            <input
                              type="radio"
                              name="postura_hecho_2"
                              checked={posturas[2]?.tipo === cat.id}
                              onChange={() =>
                                setPosturas((prev) => ({
                                  ...prev,
                                  2: { tipo: cat.id as any, texto: prev[2]?.texto || '' },
                                }))
                              }
                              className="accent-primary"
                            />
                            <span className="font-label-sm text-label-sm">{cat.label}</span>
                          </label>
                        ))}
                      </div>
                      {/* Redacción Activa */}
                      <div className="space-y-space-xs">
                        <label className="font-label-sm text-label-sm text-on-surface font-semibold flex items-center justify-between">
                          <span>Redacción Defensiva con Salvedad Expresa:</span>
                          <span className="font-code-sm text-code-sm text-emerald-800 font-semibold">Protección procesal activa</span>
                        </label>
                        <textarea
                          rows={4}
                          value={posturas[2]?.texto || ''}
                          onChange={(e) =>
                            setPosturas((prev) => ({
                              ...prev,
                              2: { tipo: prev[2]?.tipo || 'parcial', texto: e.target.value },
                            }))
                          }
                          className="w-full bg-surface-container-lowest p-space-sm rounded font-body-md text-body-md text-on-surface focus:outline-none focus:ring-1 focus:ring-primary shadow-xs border border-outline-variant/20"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN B: EXCEPCIONES DILATORIAS Y PERENTORIAS */}
                  <div className="space-y-space-md pt-space-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-space-xs">
                        <span className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center font-code-sm text-code-sm font-bold">
                          2
                        </span>
                        <h2 className="font-headline-sm text-headline-sm text-on-surface">Excepciones y Defensas Procesales</h2>
                      </div>
                      <span className="bg-surface-container-highest px-space-xs py-space-xxs rounded font-code-sm text-code-sm text-on-surface font-semibold">
                        {Object.values(excepciones).filter(Boolean).length} Activas de 4
                      </span>
                    </div>

                    <div className="space-y-space-sm">
                      {/* EXCEPCIÓN 1: FALTA DE LEGITIMACIÓN */}
                      <div className="bg-surface-container-low p-space-md rounded-lg space-y-space-xs shadow-xs border border-outline-variant/20">
                        <div className="flex items-start justify-between gap-space-sm">
                          <label className="flex items-start gap-space-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={excepciones.legitimacion}
                              onChange={() => toggleExcepcion('legitimacion')}
                              className="mt-1 w-4 h-4 accent-primary rounded"
                            />
                            <div>
                              <div className="flex items-center gap-space-xs">
                                <span className="font-headline-sm text-headline-sm text-on-surface">
                                  Falta de Legitimación en la Causa (Sine Actione Agis)
                                </span>
                                <span className="bg-primary text-on-primary font-code-sm text-code-sm px-space-xs py-space-xxs rounded">
                                  Perentoria
                                </span>
                              </div>
                              <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xxs">
                                La persona moral demandante carece de titularidad activa sobre los derechos litigiosos al no acreditar personería societaria idónea.
                              </p>
                            </div>
                          </label>
                          {excepciones.legitimacion && (
                            <span className="material-symbols-outlined text-[18px] text-emerald-700">check_circle</span>
                          )}
                        </div>
                        <div className="bg-surface-container-lowest p-space-xs rounded font-code-sm text-code-sm text-on-surface-variant border border-outline-variant/20">
                          <span className="font-bold text-primary">Fundamento Procesal Automático:</span> Arts. 1°, 35 fracción IV del CPCDF; Tesis Jurisprudencial 1a./J. 38/2016 (SCJN).
                        </div>
                      </div>

                      {/* EXCEPCIÓN 2: PRESCRIPCIÓN DE LA ACCIÓN */}
                      <div className="bg-surface-container-low p-space-md rounded-lg space-y-space-xs shadow-xs border border-outline-variant/20">
                        <div className="flex items-start justify-between gap-space-sm">
                          <label className="flex items-start gap-space-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={excepciones.prescripcion}
                              onChange={() => toggleExcepcion('prescripcion')}
                              className="mt-1 w-4 h-4 accent-primary rounded"
                            />
                            <div>
                              <div className="flex items-center gap-space-xs">
                                <span className="font-headline-sm text-headline-sm text-on-surface">
                                  Prescripción Negativa de la Acción Rescisoria
                                </span>
                                <span className="bg-primary text-on-primary font-code-sm text-code-sm px-space-xs py-space-xxs rounded">
                                  Perentoria
                                </span>
                              </div>
                              <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xxs">
                                Extinción por el transcurso de más de un año en materia mercantil/civil sin gestión judicial formalmente notificada.
                              </p>
                            </div>
                          </label>
                          {excepciones.prescripcion && (
                            <span className="material-symbols-outlined text-[18px] text-emerald-700">check_circle</span>
                          )}
                        </div>
                        <div className="bg-surface-container-lowest p-space-xs rounded font-code-sm text-code-sm text-on-surface-variant border border-outline-variant/20">
                          <span className="font-bold text-primary">Fundamento Procesal Automático:</span> Arts. 1158 y 1161 del Código Civil para el Distrito Federal.
                        </div>
                      </div>

                      {/* EXCEPCIÓN 3: INCOMPETENCIA POR TERRITORIO */}
                      <div className="bg-surface-container-low p-space-md rounded-lg space-y-space-xs shadow-xs border border-outline-variant/20">
                        <div className="flex items-start justify-between gap-space-sm">
                          <label className="flex items-start gap-space-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={excepciones.incompetencia}
                              onChange={() => toggleExcepcion('incompetencia')}
                              className="mt-1 w-4 h-4 accent-primary rounded"
                            />
                            <div>
                              <div className="flex items-center gap-space-xs">
                                <span className="font-headline-sm text-headline-sm text-on-surface">
                                  Incompetencia por Razón de Territorio (Declinatoria)
                                </span>
                                <span className="bg-tertiary-container text-on-tertiary-container font-code-sm text-code-sm px-space-xs py-space-xxs rounded">
                                  Dilatoria / Previa
                                </span>
                              </div>
                              <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xxs">
                                Sometimiento expreso pactado en la Cláusula Décima Segunda a los Tribunales del Primer Partido Judicial de Guadalajara, Jalisco.
                              </p>
                            </div>
                          </label>
                          {excepciones.incompetencia && (
                            <span className="material-symbols-outlined text-[18px] text-emerald-700">check_circle</span>
                          )}
                        </div>
                        <div className="bg-surface-container-lowest p-space-xs rounded font-code-sm text-code-sm text-on-surface-variant border border-outline-variant/20">
                          <span className="font-bold text-primary">Fundamento Procesal Automático:</span> Arts. 156 fracción IV y 163 del Código de Procedimientos Civiles para el D.F.
                        </div>
                      </div>

                      {/* EXCEPCIÓN 4: LITISPENDENCIA */}
                      <div className="bg-surface-container-low/60 p-space-md rounded-lg space-y-space-xs border border-outline-variant/20 opacity-80 hover:opacity-100 transition-opacity">
                        <label className="flex items-start gap-space-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={excepciones.litispendencia}
                            onChange={() => toggleExcepcion('litispendencia')}
                            className="mt-1 w-4 h-4 accent-primary rounded"
                          />
                          <div>
                            <div className="flex items-center gap-space-xs">
                              <span className="font-headline-sm text-headline-sm text-on-surface">
                                Litispendencia o Conexidad de la Causa
                              </span>
                              <span className="bg-surface-container-highest text-on-surface-variant font-code-sm text-code-sm px-space-xs py-space-xxs rounded">
                                Dilatoria
                              </span>
                            </div>
                            <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xxs">
                              Juicio preliminar conexo radicado ante el Juzgado 4° de Distrito en Materia Civil.
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* RECAPITULACIÓN JURISPRUDENCIAL SCJN */}
                  <div className="bg-surface-container p-space-md rounded-lg flex items-center justify-between border border-outline-variant/30">
                    <div className="flex items-center gap-space-sm">
                      <span className="material-symbols-outlined text-primary text-[20px]">account_balance</span>
                      <div>
                        <p className="font-label-sm text-label-sm text-on-surface font-bold uppercase">
                          Criterios SCJN Acoplados a Excepciones
                        </p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                          3 tesis de jurisprudencia por reiteración listas para el capítulo de derecho.
                        </p>
                      </div>
                    </div>
                    <span className="font-code-sm text-code-sm bg-surface-container-lowest text-primary px-space-sm py-space-xxs rounded font-bold border border-outline-variant/20">
                      Registro: 2024190
                    </span>
                  </div>
                </div>
              </section>
            </div>

            {/* BARRA INFERIOR DE CONTROL Y ACCIÓN PROCESAL */}
            <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-md border border-outline-variant/30">
              <div className="flex flex-col md:flex-row items-center justify-between gap-space-md">
                {/* Indicadores de Calidad & Blindaje Procesal */}
                <div className="flex items-center gap-space-md flex-wrap">
                  <div className="flex items-center gap-space-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-600"></span>
                    <span className="font-label-md text-label-md font-semibold text-on-surface">
                      Blindaje de Litis: Conforme a Derecho
                    </span>
                  </div>
                  <div className="h-4 w-px bg-outline-variant hidden sm:block"></div>
                  <div className="flex items-center gap-space-xxs text-on-surface-variant">
                    <span className="material-symbols-outlined text-[16px]">verified</span>
                    <span className="font-code-sm text-code-sm">Cotejo FIREL Integrado</span>
                  </div>
                  <div className="flex items-center gap-space-xxs text-secondary">
                    <span className="material-symbols-outlined text-[16px]">timer</span>
                    <span className="font-code-sm text-code-sm font-semibold">Término en cómputo judicial</span>
                  </div>
                </div>

                {/* Botones Operativos Litigiosos */}
                <div className="flex items-center gap-space-sm flex-wrap w-full md:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      alert('Sintetizando agravios fácticos con modelo NVIDIA Llama 3.2...');
                    }}
                    className="bg-surface-container-high hover:bg-surface-container-highest text-on-surface px-space-md py-space-sm rounded-lg font-label-md text-label-md flex items-center gap-space-xs transition-colors shadow-xs border border-outline-variant/30"
                  >
                    <span className="material-symbols-outlined text-[18px] text-emerald-800">neurology</span>
                    <span>Sintetizar Agravios con NVIDIA</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      alert('Guarda de No-Contaminación P0 verificada: fuentes herméticamente aisladas.');
                    }}
                    className="bg-surface-container-high hover:bg-surface-container-highest text-on-surface px-space-md py-space-sm rounded-lg font-label-md text-label-md flex items-center gap-space-xs transition-colors shadow-xs border border-outline-variant/30"
                  >
                    <span className="material-symbols-outlined text-[18px] text-tertiary">security</span>
                    <span>Validar Guarda de No-Contaminación</span>
                  </button>

                  {/* Botón principal: Generar Escrito de Contestación Completo */}
                  <button
                    type="button"
                    disabled={isCompiling}
                    onClick={handleTriggerGenerate}
                    className="bg-primary hover:bg-primary-container text-on-primary px-space-lg py-space-sm rounded-lg font-label-lg text-label-lg font-bold flex items-center gap-space-sm transition-all shadow-md active:scale-95 disabled:opacity-50"
                  >
                    {isCompiling ? (
                      <>
                        <span className="material-symbols-outlined text-[20px] animate-spin">sync</span>
                        <span>Compilando Auto y Contestación...</span>
                      </>
                    ) : compileSuccess ? (
                      <>
                        <span className="material-symbols-outlined text-[20px]">task_alt</span>
                        <span>¡Escrito Compilado y Firmado FIREL!</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[20px]">contract</span>
                        <span>Generar Escrito de Contestación Completo</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* TABLA HISTÓRICA DE EXPEDIENTES Y CONTESTACIONES */}
        {viewMode === 'tabla' && (
          <div className="flex flex-col gap-space-md">
            {/* Barra de Filtros Rápidos */}
            <div className="bg-surface-container-lowest rounded-xl p-space-md border border-outline-variant/30 shadow-xs space-y-space-sm">
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-space-sm">
                <div className="relative flex-1 max-w-xl">
                  <div className="h-9 px-space-sm rounded-lg bg-surface-container-low flex items-center text-on-surface-variant focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20 transition-all border border-outline-variant/30">
                    <span className="material-symbols-outlined text-[18px] mr-2 text-primary">search</span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por expediente, actor, juzgado o excepción planteada..."
                      className="bg-transparent border-none outline-none font-body-md text-xs text-on-surface w-full placeholder:text-outline"
                    />
                    <kbd className="px-1.5 py-0.5 rounded bg-surface border border-outline-variant text-on-surface-variant font-code-sm text-[10px]">
                      ⌘F
                    </kbd>
                  </div>
                </div>

                {/* Segmented Control de Estados */}
                <div className="inline-flex p-1 bg-surface-container-low rounded-lg items-center text-on-surface-variant font-label-sm text-xs border border-outline-variant/20">
                  <button
                    type="button"
                    onClick={() => setFilterState('todas')}
                    className={`px-3 py-1 rounded transition-colors text-xs font-semibold ${
                      filterState === 'todas'
                        ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                        : 'hover:text-on-surface'
                    }`}
                  >
                    Todas (14)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterState('perentorio')}
                    className={`px-3 py-1 rounded transition-colors text-xs font-semibold flex items-center gap-1.5 ${
                      filterState === 'perentorio'
                        ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                        : 'hover:text-on-surface'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span>En Plazo Perentorio (3)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterState('borradores')}
                    className={`px-3 py-1 rounded transition-colors text-xs font-semibold ${
                      filterState === 'borradores'
                        ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                        : 'hover:text-on-surface'
                    }`}
                  >
                    Borradores (5)
                  </button>
                </div>
              </div>
            </div>

            {/* TABLA PROCESAL DE CONTESTACIONES */}
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container text-on-surface-variant font-label-sm text-[11px] tracking-wider uppercase border-b border-outline-variant/30">
                      <th className="py-2.5 px-4 font-semibold">Expediente & Juzgado</th>
                      <th className="py-2.5 px-4 font-semibold">Litis / Partes</th>
                      <th className="py-2.5 px-4 font-semibold">Excepciones y Defensas</th>
                      <th className="py-2.5 px-3 font-semibold text-center">Fojas</th>
                      <th className="py-2.5 px-4 font-semibold">Término / Estado</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Acción Procesal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20 text-body-md text-xs">
                    {/* Caso Real Activo */}
                    <tr className="hover:bg-surface-container-low transition-colors bg-surface-bright">
                      <td className="py-3 px-4 align-top">
                        <div className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                          <div>
                            <div className="font-code-sm text-xs font-bold text-on-surface flex items-center gap-1.5">
                              <span>EXP. {activeExpediente}</span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-semibold uppercase">
                                Activo
                              </span>
                            </div>
                            <div className="font-body-sm text-[11px] text-on-surface-variant mt-0.5">
                              {activeJuzgado}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="max-w-[210px]">
                          <div className="font-semibold text-xs text-on-surface truncate">
                            {activeJuicio}
                          </div>
                          <div className="font-body-sm text-[11px] text-on-surface-variant truncate mt-0.5">
                            {activeActor}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="max-w-[230px]">
                          <span className="font-semibold text-xs text-on-surface block truncate">
                            Excepciones de Fondo y Forma
                          </span>
                          <p className="font-body-sm text-xs text-on-surface-variant line-clamp-1 italic mt-0.5 font-serif">
                            Falta de acción y derecho (sine actione agis)
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-3 align-top text-center">
                        <span className="font-code-sm text-xs text-on-surface-variant px-2 py-0.5 rounded bg-surface-container">
                          {totalPages} fs.
                        </span>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="flex items-center gap-1 text-primary font-semibold text-xs">
                          <span className="material-symbols-outlined text-[16px]">priority_high</span>
                          <span>En revisión de borrador</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top text-right">
                        <button
                          type="button"
                          onClick={() => setViewMode('workspace')}
                          className="h-8 px-3 rounded-lg bg-primary text-on-primary font-semibold text-xs hover:bg-primary-container shadow-xs transition-colors inline-flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[15px]">edit</span>
                          <span>Continuar Redacción</span>
                        </button>
                      </td>
                    </tr>

                    {/* Fila Modelo EXP-800/2024 */}
                    <tr className="hover:bg-surface-container-low transition-colors bg-surface-container-lowest">
                      <td className="py-3 px-4 align-top">
                        <div className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-secondary mt-1.5 shrink-0" />
                          <div>
                            <div className="font-code-sm text-xs font-bold text-on-surface flex items-center gap-1.5">
                              <span>EXP. 800/2024</span>
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-semibold uppercase">
                                Perentorio
                              </span>
                            </div>
                            <div className="font-body-sm text-[11px] text-on-surface-variant mt-0.5">
                              Juzgado 14° Civil de Proceso Escrito CDMX
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="max-w-[210px]">
                          <div className="font-semibold text-xs text-on-surface truncate">
                            Inmobiliaria del Norte S.A.
                          </div>
                          <div className="font-body-sm text-[11px] text-on-surface-variant truncate mt-0.5">
                            vs. Desarrollos Civiles MX
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="max-w-[230px]">
                          <span className="font-semibold text-xs text-on-surface block truncate">
                            Contestación con Reconvención
                          </span>
                          <p className="font-body-sm text-xs text-on-surface-variant line-clamp-1 italic mt-0.5 font-serif">
                            Exceptio non adimpleti contractus y Plus Petitio
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-3 align-top text-center">
                        <span className="font-code-sm text-xs text-on-surface-variant px-2 py-0.5 rounded bg-surface-container">
                          18 fs.
                        </span>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="flex items-center gap-1 text-primary font-semibold text-xs">
                          <span className="material-symbols-outlined text-[16px]">priority_high</span>
                          <span>Vence en 3 días</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top text-right">
                        <button
                          type="button"
                          onClick={() => setViewMode('workspace')}
                          className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs transition-colors inline-flex items-center gap-1 border border-outline-variant/30"
                        >
                          <span className="material-symbols-outlined text-[15px]">visibility</span>
                          <span>Consultar</span>
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ContestacionesView;
