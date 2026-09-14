'use client';

import React, { useState } from 'react';
import type { CaseDocument, UploadedSourceDocument, UniversalLegalDocument } from '@/lib/legal-engine/types';
import type { TemplateItem } from './TemplateLibraryManager';

export interface LibraryItem {
  id: string;
  title: string;
  code?: string;
  matter: string;
  category: string;
  pageCount?: number;
  date: string;
  status: 'verified' | 'pending' | 'review';
  type: 'draft' | 'template' | 'case_doc' | 'mock_doc';
  sourceDoc?: UploadedSourceDocument;
  caseDoc?: CaseDocument;
  template?: TemplateItem;
}

interface WorkspaceLibraryPanelProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  caseDocuments: CaseDocument[];
  uploadedSources: UploadedSourceDocument[];
  templates: TemplateItem[];
  currentDoc: UniversalLegalDocument | null;
  selectedCaseDocId?: string | null;
  onSelectCaseDocument: (doc: CaseDocument) => void;
  onSelectLibraryItem?: (item: LibraryItem) => void;
  onUseTemplate: (tpl: TemplateItem) => void;
  onOpenCreateTemplateModal: () => void;
  onDeleteTemplate?: (id: string) => void;
  onSelectThumbnailPage?: (page: number) => void;
  totalPages?: number;
  currentPage?: number;
  pagePreviews?: Array<{ pageNumber: number; snippet: string; sectionCount: number }>;
}

export function WorkspaceLibraryPanel({
  isCollapsed,
  onToggleCollapse,
  caseDocuments,
  uploadedSources,
  templates,
  currentDoc,
  selectedCaseDocId,
  onSelectCaseDocument,
  onSelectLibraryItem,
  onUseTemplate,
  onOpenCreateTemplateModal,
  onDeleteTemplate,
  onSelectThumbnailPage,
  totalPages = 1,
  currentPage = 1,
  pagePreviews = [],
}: WorkspaceLibraryPanelProps) {
  const [activeTab, setActiveTab] = useState<'docs' | 'templates' | 'sources' | 'thumbnails'>('docs');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMatter, setFilterMatter] = useState<string>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Items exactos de la referencia visual
  const referenceCases: LibraryItem[] = [
    {
      id: 'case-amparo-bgss',
      title: 'Amparo Directo General',
      code: 'BGSS',
      matter: 'Amparo',
      category: 'Amparo Directo',
      pageCount: 27,
      date: '15/08/2024',
      status: 'verified',
      type: 'mock_doc',
    },
    {
      id: 'case-amparo-bdg4',
      title: 'Amparo Directo General',
      code: 'BDG4',
      matter: 'Amparo',
      category: 'Amparo Directo',
      pageCount: 18,
      date: '13/06/2024',
      status: 'verified',
      type: 'mock_doc',
    },
    {
      id: 'case-amparo-dbs4',
      title: 'Amparo Directo a Terceros',
      code: 'DBS4',
      matter: 'Amparo',
      category: 'Tercero Interesado',
      pageCount: 31,
      date: '12/08/2024',
      status: 'verified',
      type: 'mock_doc',
    },
    {
      id: 'case-amparo-dbsa',
      title: 'Amparo Directo sobre Asunto Laboral',
      code: 'DBSA',
      matter: 'Amparo',
      category: 'Materia Laboral',
      pageCount: 22,
      date: '12/08/2024',
      status: 'verified',
      type: 'mock_doc',
    },
    {
      id: 'case-laboral-db54-1',
      title: 'Amparo Laboral',
      code: 'DB54',
      matter: 'Amparo',
      category: 'Contestación Junta',
      pageCount: 14,
      date: '11/06/2024',
      status: 'verified',
      type: 'mock_doc',
    },
    {
      id: 'case-laboral-db54-2',
      title: 'Amparo Laboral',
      code: 'DB54',
      matter: 'Amparo',
      category: 'Revisión Tribunal Colegiado',
      pageCount: 25,
      date: '12/04/2024',
      status: 'verified',
      type: 'mock_doc',
    },
  ];

  // Si hay documento activo en edición, se lista al inicio
  const currentDocItem: LibraryItem | null = currentDoc
    ? {
        id: currentDoc.id || 'current-doc',
        title: currentDoc.title || 'Escrito en Edición',
        code: currentDoc.caseRefs.expediente || 'ACTUAL',
        matter: currentDoc.matter || 'Amparo',
        category: currentDoc.documentTypeLabel || 'Borrador',
        pageCount: totalPages,
        date: new Date().toLocaleDateString('es-MX'),
        status: 'verified',
        type: 'draft',
      }
    : null;

  const libraryItems: LibraryItem[] = [
    ...(currentDocItem ? [currentDocItem] : []),
    ...referenceCases,
  ];

  // Mapear plantillas personalizadas
  const templateItems: LibraryItem[] = templates.map((tpl) => ({
    id: tpl.id,
    title: tpl.name,
    code: `v${tpl.version}`,
    matter: tpl.matterId ? tpl.matterId.toUpperCase() : (tpl.category || 'Amparo'),
    category: tpl.category,
    date: new Date(tpl.updatedAt).toLocaleDateString('es-MX'),
    status: 'verified',
    type: 'template',
    template: tpl,
  }));

  // Mapear documentos del expediente
  const caseDocItems: LibraryItem[] = caseDocuments.map((doc) => ({
    id: doc.id,
    title: doc.name,
    code: doc.type.toUpperCase(),
    matter: 'Expediente',
    category: `${doc.pageCount} pág(s)`,
    pageCount: doc.pageCount,
    date: doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('es-MX') : '—',
    status: doc.status === 'READY' ? 'verified' : 'pending',
    type: 'case_doc',
    caseDoc: doc,
  }));

  const getActiveList = () => {
    switch (activeTab) {
      case 'templates':
        return templateItems.length > 0 ? templateItems : referenceCases;
      case 'sources':
        return caseDocItems.length > 0 ? caseDocItems : referenceCases;
      case 'docs':
      default:
        return libraryItems;
    }
  };

  const filteredItems = getActiveList().filter((it) => {
    const matchesSearch =
      it.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (it.code && it.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      it.matter.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMatter =
      filterMatter === 'all' || it.matter.toLowerCase() === filterMatter.toLowerCase();
    return matchesSearch && matchesMatter;
  });

  const getBadgeColor = (matter: string) => {
    const m = matter.toLowerCase();
    if (m.includes('amparo')) return 'bg-[#e2f4ea] text-[#1b7a43] border-[#bfe4cf]';
    if (m.includes('laboral')) return 'bg-[#e6f0fa] text-[#1b558f] border-[#bed7f3]';
    if (m.includes('civil')) return 'bg-[#f4eaf7] text-[#6d2f8a] border-[#e2cbe8]';
    if (m.includes('mercantil')) return 'bg-[#fdf3e2] text-[#9c5f11] border-[#f5dfb8]';
    return 'bg-[#e2f4ea] text-[#1b7a43] border-[#bfe4cf]';
  };

  /* ──────────────────────────────────────────────────────────────────────────
     VISTA COLAPSADA: Rail lateral café oscuro con iconos y botón de expansión
  ────────────────────────────────────────────────────────────────────────── */
  if (isCollapsed) {
    return (
      <aside className="w-16 shrink-0 min-w-0 bg-[#3a2717] border-r border-[#2e1d10] flex flex-col items-center py-4 space-y-3 transition-all duration-300 select-none z-20">
        <button
          onClick={onToggleCollapse}
          title="Expandir Biblioteca de Documentos"
          className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 text-[#f5f2eb] flex items-center justify-center hover:bg-white/20 transition shadow-sm"
        >
          <span className="text-sm font-bold">→</span>
        </button>

        <div className="w-8 h-[1px] bg-white/15 my-1" />

        <button
          onClick={() => {
            onToggleCollapse();
            setActiveTab('docs');
          }}
          title="Biblioteca de Casos"
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
            activeTab === 'docs'
              ? 'bg-[#3b82f6] text-white shadow-md'
              : 'bg-white/10 border border-white/15 text-[#f5f2eb] hover:bg-white/20'
          }`}
        >
          <span className="text-base">📁</span>
        </button>

        <button
          onClick={() => {
            onToggleCollapse();
            setActiveTab('templates');
          }}
          title="Plantillas y Machotes"
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
            activeTab === 'templates'
              ? 'bg-[#3b82f6] text-white shadow-md'
              : 'bg-white/10 border border-white/15 text-[#f5f2eb] hover:bg-white/20'
          }`}
        >
          <span className="text-base">📋</span>
        </button>

        <button
          onClick={() => {
            onToggleCollapse();
            setActiveTab('sources');
          }}
          title="Expediente del Caso"
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
            activeTab === 'sources'
              ? 'bg-[#3b82f6] text-white shadow-md'
              : 'bg-white/10 border border-white/15 text-[#f5f2eb] hover:bg-white/20'
          }`}
        >
          <span className="text-base">📑</span>
        </button>

        <div className="mt-auto pt-4">
          <button
            onClick={onOpenCreateTemplateModal}
            title="Subir / Crear Machote"
            className="w-10 h-10 rounded-xl bg-[#3b82f6] text-white flex items-center justify-center hover:bg-blue-600 transition shadow-lg"
          >
            <span className="text-lg font-bold">+</span>
          </button>
        </div>
      </aside>
    );
  }

  /* ──────────────────────────────────────────────────────────────────────────
     VISTA EXPANDIDA: Panel de Biblioteca con Grid de 2 Columnas idéntico al mockup
  ────────────────────────────────────────────────────────────────────────── */
  return (
    <aside className="w-[300px] min-[1400px]:w-[320px] shrink-0 min-w-0 bg-[#fbf9f5] border-r border-[#e8e2d5] flex flex-col h-full overflow-hidden transition-all duration-300 select-none max-[900px]:fixed max-[900px]:top-[64px] max-[900px]:bottom-0 max-[900px]:left-0 max-[900px]:z-40 max-[900px]:shadow-2xl">
      {/* ── Cabecera del Panel: "Biblioteca de Documentos" + Funnel ──────── */}
      <div className="p-3.5 border-b border-[#e8e2d5] flex items-center justify-between gap-2 bg-[#fbf9f5]">
        <h2 className="text-[13px] font-extrabold text-[#0B2545] tracking-tight">
          Biblioteca de Documentos
        </h2>

        <div className="flex items-center gap-1.5">
          {/* Botón Filtro (Embudo) */}
          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              title="Filtrar por materia"
              className="w-7 h-7 rounded-lg bg-white border border-[#ded8c9] text-slate-700 flex items-center justify-center text-xs hover:bg-[#ede8dd] transition shadow-xs"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </button>

            {showFilterDropdown && (
              <div className="absolute right-0 top-8 w-44 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 text-xs text-slate-800 font-semibold animate-in fade-in zoom-in-95">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                  Filtrar por materia
                </div>
                {['all', 'amparo', 'laboral', 'civil', 'mercantil'].map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setFilterMatter(m);
                      setShowFilterDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between ${
                      filterMatter === m ? 'text-[#0B2545] font-bold bg-blue-50/50' : 'text-slate-600'
                    }`}
                  >
                    <span>{m === 'all' ? 'Todas las materias' : m.charAt(0).toUpperCase() + m.slice(1)}</span>
                    {filterMatter === m && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Botón Colapsar Panel */}
          <button
            onClick={onToggleCollapse}
            title="Colapsar panel (←)"
            className="w-7 h-7 rounded-lg bg-white border border-[#ded8c9] text-slate-600 flex items-center justify-center text-xs font-bold hover:bg-[#ede8dd] transition shadow-xs"
          >
            ←
          </button>
        </div>
      </div>

      {/* ── Sub-tabs internas compactas ───────────────────────────────────── */}
      <div className="flex px-3 pt-2 gap-1 border-b border-[#e8e2d5] bg-[#fbf9f5]">
        <button
          onClick={() => setActiveTab('docs')}
          className={`flex-1 pb-2 text-[11px] font-bold text-center border-b-2 transition ${
            activeTab === 'docs'
              ? 'border-[#0B2545] text-[#0B2545]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Casos ({referenceCases.length})
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex-1 pb-2 text-[11px] font-bold text-center border-b-2 transition ${
            activeTab === 'templates'
              ? 'border-[#0B2545] text-[#0B2545]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Plantillas ({templates.length})
        </button>
        <button
          onClick={() => setActiveTab('sources')}
          className={`flex-1 pb-2 text-[11px] font-bold text-center border-b-2 transition ${
            activeTab === 'sources'
              ? 'border-[#0B2545] text-[#0B2545]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Expediente ({caseDocuments.length})
        </button>
      </div>

      {/* ── Barra de Búsqueda ─────────────────────────────────────────────── */}
      <div className="p-2.5 border-b border-[#e8e2d5] bg-[#fbf9f5]">
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar documento o clave..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-[#ded8c9] rounded-xl pl-3 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0B2545] transition font-sans"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── GRID DE TARJETAS EN 2 COLUMNAS (Idéntico a la referencia) ─────── */}
      <div className="flex-1 overflow-y-auto p-3">
        {filteredItems.length === 0 ? (
          <div className="py-12 px-4 text-center text-slate-400 text-xs italic font-sans">
            No se encontraron documentos coincidentes.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filteredItems.map((item) => {
              const isSelected =
                (item.caseDoc && selectedCaseDocId === item.caseDoc.id) ||
                (currentDocItem && item.id === currentDocItem.id);

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.caseDoc) onSelectCaseDocument(item.caseDoc);
                    else if (item.template) onUseTemplate(item.template);
                    else if (onSelectLibraryItem) onSelectLibraryItem(item);
                  }}
                  className={`relative rounded-2xl border p-3 flex flex-col justify-between cursor-pointer transition-all duration-200 group bg-white shadow-xs ${
                    isSelected
                      ? 'border-[#0B2545] ring-2 ring-blue-100 shadow-md'
                      : 'border-[#ded8c9] hover:border-[#0B2545] hover:shadow-sm'
                  }`}
                >
                  {/* Fila 1: Chip verde de materia y Dot rojo indicador */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`text-[9px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full border ${getBadgeColor(
                        item.matter
                      )}`}
                    >
                      {item.matter}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        item.status === 'verified' ? 'bg-[#e05244]' : 'bg-amber-400'
                      }`}
                      title={item.status === 'verified' ? 'Verificado' : 'En revisión'}
                    />
                  </div>

                  {/* Fila 2: Título del documento */}
                  <div className="mb-2 min-h-[32px]">
                    <h3 className="text-[11px] font-bold text-slate-900 leading-snug line-clamp-2">
                      {item.title} {item.code ? `(${item.code})` : ''}
                    </h3>
                  </div>

                  {/* Fila 3: Skeletons de 3 líneas horizontales (idéntico al mockup) */}
                  <div className="space-y-1.5 my-1.5 py-1">
                    <div className="h-1 bg-[#ece7db] rounded-full w-full" />
                    <div className="h-1 bg-[#ece7db] rounded-full w-5/6" />
                    <div className="h-1 bg-[#ece7db] rounded-full w-4/6" />
                  </div>

                  {/* Fila 4: Fecha y Menú contextual ⋮ */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-[#f4efe6]">
                    <span className="font-mono text-[10px]">{item.date}</span>

                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId((prev) => (prev === item.id ? null : item.id));
                        }}
                        className="w-5 h-5 rounded hover:bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs"
                      >
                        ⋮
                      </button>

                      {menuOpenId === item.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 bottom-6 w-32 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 text-[11px] text-slate-700 font-semibold animate-in fade-in zoom-in-95"
                        >
                          <button
                            onClick={() => {
                              if (item.template) onUseTemplate(item.template);
                              else if (onSelectLibraryItem) onSelectLibraryItem(item);
                              setMenuOpenId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-1.5 text-[#0B2545]"
                          >
                            <span>⚡</span> Cargar en Hoja
                          </button>
                          {item.type === 'template' && onDeleteTemplate && (
                            <button
                              onClick={() => {
                                onDeleteTemplate(item.template!.id);
                                setMenuOpenId(null);
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 flex items-center gap-1.5"
                            >
                              <span>🗑️</span> Eliminar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Pie del Panel: Acción rápida ──────────────────────────────────── */}
      <div className="p-3 border-t border-[#e8e2d5] bg-[#fbf9f5]">
        <button
          onClick={onOpenCreateTemplateModal}
          className="w-full py-2 px-3 rounded-xl bg-[#0B2545] hover:bg-[#081d39] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition"
        >
          <span>➕</span>
          <span>Subir Nuevo Machote</span>
        </button>
      </div>
    </aside>
  );
}
