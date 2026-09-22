'use client';

import React, { useState } from 'react';

interface PrecedentItem {
  id: number;
  reg: string;
  tesis: string;
  tipo: 'Jurisprudencia' | 'Tesis Aislada';
  isObligatoria: boolean;
  rubro: string;
  texto: string;
  sala: string;
  epoca: string;
  fuente: string;
  materia: string;
}

const SAMPLE_PRECEDENTS: PrecedentItem[] = [
  {
    id: 1,
    reg: '2012480',
    tesis: '2a./J. 48/2016 (10a.)',
    tipo: 'Jurisprudencia',
    isObligatoria: true,
    rubro: 'CONTRATOS BILATERALES. EXCEPCIÓN DE CONTRATO NO CUMPLIDO (EXCEPTIO NON ADIMPLETI CONTRACTUS).',
    texto:
      'La procedencia de dicha excepción en las obligaciones recíprocas requiere que quien la oponga acredite fehacientemente que su contraparte no satisfizo su prestación correlativa en el tiempo, lugar y modo convenidos, o bien que ofreció cumplirla pero no estuvo en aptitud material de ejecutarla. Por tanto, si el demandante no demuestra haber cumplido previamente con sus obligaciones contractuales o haber garantizado su satisfacción, no puede compeler a la demandada al pago o rescisión con pretensión indemnizatoria.',
    sala: 'Segunda Sala de la SCJN',
    epoca: 'Décima Época',
    fuente: 'Gaceta del Semanario Judicial de la Federación, Libro 36, Tomo II',
    materia: 'Civil / Común',
  },
  {
    id: 2,
    reg: '2021155',
    tesis: '1a. CCLV/2019 (10a.)',
    tipo: 'Tesis Aislada',
    isObligatoria: false,
    rubro: 'PENA CONVENCIONAL MORATORIA DESPROPORCIONADA. IMPROCEDENCIA CUANDO EXISTE MORA TOLERADA POR EL ACREEDOR.',
    texto:
      'El artículo 1843 del Código Civil impone un límite de equidad judicial conforme al cual la cláusula penal no puede exceder ni en valor ni en cuantía a la obligación principal cuando mediaron recepciones tácitas o tolerancia procesal imputable al acreedor (mora creditoris).',
    sala: 'Primera Sala de la SCJN',
    epoca: 'Décima Época',
    fuente: 'Gaceta del Semanario Judicial de la Federación, Libro 72',
    materia: 'Civil',
  },
  {
    id: 3,
    reg: '198540',
    tesis: 'I.3o.C. J/19 (9a.)',
    tipo: 'Jurisprudencia',
    isObligatoria: true,
    rubro: 'CARGA DE LA PRUEBA EN RESCISIÓN CONTRACTUAL POR ALEGADO INCUMPLIMIENTO.',
    texto:
      'Cuando el actor demanda la resolución judicial fundada en la falta de entrega oportuna, la demostración de la causa imputable corresponde a quien deduce la acción, debiendo el demandado únicamente demostrar la existencia de los presupuestos de excepción opuestos oportunamente.',
    sala: 'Tribunales Colegiados de Circuito',
    epoca: 'Novena Época',
    fuente: 'Semanario Judicial de la Federación, Tomo V',
    materia: 'Civil',
  },
];

export function InvestigacionView() {
  const [searchQuery, setSearchQuery] = useState('Exceptio non adimpleti contractus');
  const [selectedId, setSelectedId] = useState<number>(1);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const activeItem = SAMPLE_PRECEDENTS.find((p) => p.id === selectedId) || SAMPLE_PRECEDENTS[0];

  const handleCopyCitation = (item: PrecedentItem) => {
    const citation = `${item.rubro} [Registro digital: ${item.reg}]. ${item.sala}, ${item.epoca}, ${item.fuente}, pág. 110.`;
    navigator.clipboard.writeText(citation);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="flex flex-col w-full pb-10 px-4 sm:px-6 font-sans">
      {/* ── HEADER: TÍTULO & ENLACE SEMANARIO ── */}
      <div className="flex flex-col gap-2 pt-4 pb-4 border-b border-divider/60">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-secondary font-meta-regular text-xs">
            <span>Workspace</span>
            <span className="material-symbols-outlined text-[13px]">chevron_right</span>
            <span>Investigación Jurídica</span>
            <span className="material-symbols-outlined text-[13px]">chevron_right</span>
            <span className="font-meta-medium text-on-surface">Semanario Judicial de la Federación</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-secondary text-caption">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary-container animate-pulse" />
              <span>Conexión Directa SCJN Activa</span>
            </div>
          </div>
        </div>

        <div className="mt-1">
          <h1 className="font-display-title text-display-title text-on-surface tracking-tight">
            Investigación Jurídica y Precedentes SCJN
          </h1>
          <p className="font-meta-regular text-meta-regular text-secondary mt-0.5">
            Consulta dogmática, contradicciones de criterios y jurisprudencia obligatoria federal para fundamentar tus escritos.
          </p>
        </div>

        {/* ── SPOTLIGHT SEARCH BAR ── */}
        <div className="relative w-full mt-3">
          <div className="w-full h-11 bg-surface-container-lowest rounded-xl border border-divider shadow-2xs flex items-center px-4 gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <span className="material-symbols-outlined text-secondary text-[20px]">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar tesis, rubro, número de registro digital o contradicción (ej. 2012480, mora o nulidad)..."
              className="flex-1 bg-transparent border-none outline-none font-body-default text-xs text-on-surface placeholder:text-secondary"
            />
            <div className="flex items-center gap-2">
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-secondary hover:text-on-surface"
                  title="Limpiar"
                >
                  <span className="material-symbols-outlined text-[16px]">cancel</span>
                </button>
              )}
              <kbd className="px-2 py-0.5 rounded bg-surface-container border border-divider text-secondary font-code-mono text-[11px] font-medium shadow-2xs">
                ⌘F
              </kbd>
            </div>
          </div>
        </div>

        {/* Segment Chips */}
        <div className="flex items-center gap-2 overflow-x-auto py-2">
          <button className="px-3 py-1 rounded-full bg-primary-container text-on-primary font-meta-medium text-caption shadow-2xs shrink-0 flex items-center gap-1">
            <span>Todas las fuentes</span>
            <span className="bg-primary/40 text-[10px] px-1.5 py-0.2 rounded-full font-code-mono">1,482</span>
          </button>
          <button className="px-3 py-1 rounded-full bg-surface-container-lowest text-on-surface hover:bg-surface-container font-meta-regular text-caption shadow-2xs shrink-0 border border-[#D4AF37]/50 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
            <span>Jurisprudencia Obligatoria</span>
          </button>
          <button className="px-3 py-1 rounded-full bg-surface-container-lowest text-secondary hover:text-on-surface font-meta-regular text-caption shadow-2xs shrink-0 border border-divider">
            <span>Undécima Época</span>
          </button>
          <button className="px-3 py-1 rounded-full bg-surface-container-lowest text-secondary hover:text-on-surface font-meta-regular text-caption shadow-2xs shrink-0 border border-divider">
            <span>Materia Civil</span>
          </button>
          <button className="px-3 py-1 rounded-full bg-surface-container-lowest text-secondary hover:text-on-surface font-meta-regular text-caption shadow-2xs shrink-0 border border-divider">
            <span>Amparo</span>
          </button>
        </div>
      </div>

      {/* ── MASTER-DETAIL SPLIT VIEW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-5 items-start">
        {/* Left Column (5 cols): Criterios Feed */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <span className="font-heading-sm text-[13px] font-bold text-on-surface">Criterios Coincidentes</span>
              <span className="font-code-mono text-[11px] text-secondary bg-surface-container px-1.5 py-0.5 rounded">
                {SAMPLE_PRECEDENTS.length} resultados
              </span>
            </div>
          </div>

          {SAMPLE_PRECEDENTS.map((item) => {
            const isSelected = item.id === selectedId;
            return (
              <article
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                  isSelected
                    ? 'bg-surface-container-lowest border-primary shadow-sm'
                    : 'bg-surface-container-lowest/80 border-divider hover:bg-surface-container-low/60 shadow-2xs'
                }`}
              >
                {isSelected && (
                  <div className="absolute left-0 top-3 bottom-3 w-[3px] bg-primary-container rounded-r" />
                )}
                <div className="flex items-center justify-between gap-2 mb-1.5 pl-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed-variant font-code-mono text-[11px] font-semibold">
                      Registro {item.reg}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-meta-medium text-[11px]">
                      {item.tesis}
                    </span>
                  </div>
                  {item.isObligatoria && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-code-mono font-semibold uppercase bg-[#FAF2DC] text-[#7A5B00] border border-[#D4AF37]/50">
                      Obligatoria
                    </span>
                  )}
                </div>

                <h2 className="font-body-strong text-xs text-on-surface pl-1.5 leading-snug">
                  {item.rubro}
                </h2>
                <p className="font-document-body text-xs leading-relaxed text-secondary pl-1.5 mt-1.5 line-clamp-2">
                  {item.texto}
                </p>

                <div className="flex items-center justify-between pt-2.5 mt-2.5 pl-1.5 border-t border-divider/40 text-[11px] text-secondary">
                  <span>{item.sala}</span>
                  <span className="text-primary font-caption flex items-center gap-0.5">
                    Ver ficha <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                  </span>
                </div>
              </article>
            );
          })}
        </div>

        {/* Right Column (7 cols): Ficha Jurisprudencial Completa */}
        <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl border border-divider shadow-sm p-6 flex flex-col space-y-5">
          <div className="flex items-start justify-between gap-4 border-b border-divider/60 pb-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-code-mono text-xs font-bold text-primary bg-primary-fixed px-2.5 py-1 rounded">
                  REGISTRO DIGITAL: {activeItem.reg}
                </span>
                <span className="font-caption text-xs font-semibold text-secondary">
                  {activeItem.tesis}
                </span>
              </div>
              <h3 className="font-document-heading text-[18px] font-bold text-on-surface mt-2 leading-snug">
                {activeItem.rubro}
              </h3>
            </div>

            <button
              onClick={() => handleCopyCitation(activeItem)}
              className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-semibold flex items-center gap-1.5 text-on-surface shrink-0 shadow-2xs border border-divider"
            >
              <span className="material-symbols-outlined text-[16px] text-primary">
                {copiedId === activeItem.id ? 'check' : 'content_copy'}
              </span>
              <span>{copiedId === activeItem.id ? 'Copiada' : 'Copiar Cita'}</span>
            </button>
          </div>

          {/* Texto de la Tesis */}
          <div className="space-y-3 font-document-body text-[14.5px] leading-relaxed text-on-surface text-justify bg-surface-container-low/40 p-4 rounded-xl border border-divider/40">
            <p>{activeItem.texto}</p>
          </div>

          {/* Ficha Técnica de Localización */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface-container-low p-3.5 rounded-xl border border-divider/60 text-xs">
            <div>
              <span className="text-[10.5px] font-semibold text-secondary uppercase block">Época</span>
              <span className="font-meta-medium text-on-surface mt-0.5 block">{activeItem.epoca}</span>
            </div>
            <div>
              <span className="text-[10.5px] font-semibold text-secondary uppercase block">Instancia</span>
              <span className="font-meta-medium text-on-surface mt-0.5 block">{activeItem.sala}</span>
            </div>
            <div>
              <span className="text-[10.5px] font-semibold text-secondary uppercase block">Materia</span>
              <span className="font-meta-medium text-on-surface mt-0.5 block">{activeItem.materia}</span>
            </div>
            <div>
              <span className="text-[10.5px] font-semibold text-secondary uppercase block">Carácter</span>
              <span className="font-meta-medium text-primary mt-0.5 block">{activeItem.tipo}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InvestigacionView;
