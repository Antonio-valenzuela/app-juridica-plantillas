'use client';

import React, { useState, useMemo } from 'react';
import { LEGAL_MATTERS_CATALOG } from '@/lib/catalog/legalCatalog';
import { TemplateVersion } from '@/lib/legal-engine/types';
import type { PersonalTemplateStructure, PersonalTemplateVariable } from '@/lib/templates/personalTemplateBuilder';

export interface TemplateItem {
  id: string;
  name: string;
  category: string;
  documentType?: string;
  matterId?: string;
  subcategoryId?: string;
  version: number;
  versions?: TemplateVersion[];
  description?: string;
  updatedAt: string;
  sectionsCount?: number;
  placeholdersCount?: number;
  pageCount?: number;
  fileSize?: number;
  fileType?: string;
  sourceFileName?: string;
  content?: string;
  variables?: PersonalTemplateVariable[];
  personalStructure?: PersonalTemplateStructure;
}

interface TemplateLibraryManagerProps {
  templates: TemplateItem[];
  onUseTemplate: (template: TemplateItem, version?: TemplateVersion) => void;
  onEditTemplate: (template: TemplateItem) => void;
  onDeleteTemplate: (templateId: string) => void;
  onCreateNewTemplate: () => void;
  /** Bloque opcional renderizado bajo el encabezado (ej. Perfil de estilo del abogado). */
  profileSlot?: React.ReactNode;
}

function formatDateSafe(dateStr?: string): string {
  if (!dateStr) return 'Actualizado recientemente';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Actualizado recientemente';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function TemplateLibraryManager({
  templates,
  onUseTemplate,
  onEditTemplate,
  onDeleteTemplate,
  onCreateNewTemplate,
  profileSlot,
}: TemplateLibraryManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMatterId, setSelectedMatterId] = useState('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateItem | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 9;

  const matterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    templates.forEach((t) => {
      const catKey = (t.category || t.matterId || 'general').toLowerCase();
      counts[catKey] = (counts[catKey] || 0) + 1;
    });
    return counts;
  }, [templates]);
  // Reinicio de página determinista: se hace en los onChange de búsqueda/filtro,
  // sin useEffect (evita cascadas de render).

  const availableMatters = useMemo(() => {
    if (Array.isArray(LEGAL_MATTERS_CATALOG)) {
      return LEGAL_MATTERS_CATALOG.map((m) => {
        const mId = m.id.toLowerCase();
        const count = (matterCounts[mId] || 0) + (matterCounts[m.name.toLowerCase()] || 0);
        return { id: m.id, name: m.name, icon: m.icon, count };
      });
    }
    return [
      { id: 'amparo', name: 'Amparo', icon: '⚖️', count: matterCounts['amparo'] || 0 },
      { id: 'laboral', name: 'Laboral', icon: '💼', count: matterCounts['laboral'] || 0 },
      { id: 'civil', name: 'Civil', icon: '📜', count: matterCounts['civil'] || 0 },
      { id: 'mercantil', name: 'Mercantil', icon: '🏢', count: matterCounts['mercantil'] || 0 },
    ];
  }, [matterCounts]);

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return templates.filter((tpl) => {
      const matchesSearch =
        !q ||
        tpl.name.toLowerCase().includes(q) ||
        (tpl.description || '').toLowerCase().includes(q) ||
        (tpl.category || '').toLowerCase().includes(q);
      const tplCat = (tpl.category || tpl.matterId || '').toLowerCase();
      const matchesMatter =
        selectedMatterId === 'all' ||
        tplCat === selectedMatterId.toLowerCase() ||
        tplCat.includes(selectedMatterId.toLowerCase());
      return matchesSearch && matchesMatter;
    });
  }, [templates, searchQuery, selectedMatterId]);

  // Paginación real sobre el resultado filtrado
  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedTemplates = useMemo(
    () => filteredTemplates.slice((safePage - 1) * PAGE_SIZE, (safePage - 1) * PAGE_SIZE + PAGE_SIZE),
    [filteredTemplates, safePage]
  );

  const getMatterStyle = (category?: string) => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('amparo')) return { bg: 'bg-emerald-50 text-emerald-800 border-emerald-200', tag: 'Amparo' };
    if (cat.includes('laboral')) return { bg: 'bg-blue-50 text-blue-800 border-blue-200', tag: 'Laboral' };
    if (cat.includes('civil')) return { bg: 'bg-purple-50 text-purple-800 border-purple-200', tag: 'Civil' };
    if (cat.includes('mercantil')) return { bg: 'bg-amber-50 text-amber-800 border-amber-200', tag: 'Mercantil' };
    return { bg: 'bg-slate-100 text-slate-800 border-slate-200', tag: category || 'General' };
  };

  const previewText = (tpl: TemplateItem): string =>
    (tpl.content || '').trim().slice(0, 1200);

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar el machote "${name}"?`)) {
      setDeletingId(id);
      try {
        onDeleteTemplate(id);
      } finally {
        setDeletingId(null);
      }
    }
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* HEADER COMPACTO CENTRADO (referencia) */}
      <div className="bg-white p-6 rounded-2xl border border-[#ded8c9] shadow-sm">
        <div className="flex flex-col items-center text-center gap-1.5">
          <div className="flex items-center gap-3 justify-center">
            <span className="text-xl">📄</span>
            <h2 className="text-lg font-black text-[#0B2545]">Mis Plantillas y Machotes</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F7F1E8] text-[#8F6745] border border-[#D6B887] whitespace-nowrap">
              {templates.length} {templates.length === 1 ? 'plantilla' : 'plantillas'}
            </span>
          </div>
          <p className="text-xs text-slate-500 max-w-md">
            Biblioteca de documentos oficiales y plantillas reutilizables
            para redacción judicial.
          </p>
          <button
            onClick={onCreateNewTemplate}
            className="mt-1 px-4 py-2 bg-[#0B2545] hover:bg-[#081d39] text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
          >
            + Crear Machote / Plantilla
          </button>
        </div>

        <div className="mt-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="🔍 Buscar por nombre, materia o palabra clave..."
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#0B2545] transition"
          />
        </div>

        <div className="mt-3">
          <select
            value={selectedMatterId}
            onChange={(e) => { setSelectedMatterId(e.target.value); setPage(1); }}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:bg-white focus:border-[#0B2545] transition"
          >
            <option value="all">Todas las Materias ({templates.length})</option>
            {availableMatters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.icon} {m.name} ({m.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      {profileSlot}

      {filteredTemplates.length === 0 && (
        <div className="bg-white p-12 rounded-2xl border border-dashed border-[#ded8c9] text-center space-y-3">
          <div className="text-4xl">📄</div>
          <h3 className="text-sm font-bold text-slate-800">No se encontraron plantillas coincidentes</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Prueba ajustando el término de búsqueda o seleccionando otra materia en el filtro.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedMatterId('all');
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            Restablecer filtros
          </button>
        </div>
      )}

      {pagedTemplates.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {pagedTemplates.map((tpl) => {
            const matterStyle = getMatterStyle(tpl.category);
            const ext = tpl.fileType || tpl.sourceFileName?.split('.').pop()?.toUpperCase() || 'PDF';
            const pageCount = tpl.pageCount || 1;
            const preview = previewText(tpl);

            return (
              <div
                key={tpl.id}
                className="bg-white rounded-2xl border border-[#E7DFD2] hover:border-[#B58A5A] transition-all duration-200 shadow-sm hover:shadow-md flex flex-col overflow-hidden group"
              >
                {/* Fila superior: materia | formato·páginas */}
                <div className="p-4 pb-2 flex items-center justify-between">
                  <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border uppercase ${matterStyle.bg}`}>
                    {matterStyle.tag}
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white text-slate-600 border border-[#E7DFD2]">
                    {ext} · {pageCount} {pageCount === 1 ? 'pág' : 'págs'}
                  </span>
                </div>

                {/* PREVIEW dominante con contenido real */}
                <div
                  onClick={() => setPreviewTemplate(tpl)}
                  className="px-4 cursor-pointer"
                >
                  <div className="h-[280px] bg-white rounded-lg border border-slate-200 shadow-inner p-4 overflow-hidden relative">
                    {preview ? (
                      <div className="h-full whitespace-pre-line font-serif text-[6.5px] leading-[10px] text-slate-700 overflow-hidden">
                        {preview}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col justify-between">
                        <div>
                          <div className="text-center pb-2 border-b border-slate-100 mb-2">
                            <div className="text-[7px] font-black tracking-widest text-slate-400 uppercase">
                              PODER JUDICIAL DE LA FEDERACIÓN
                            </div>
                            <div className="text-[6px] text-slate-400">ESCRITO JUDICIAL</div>
                          </div>
                          <div className="space-y-1.5 opacity-60">
                            <div className="h-1.5 bg-slate-300 rounded w-5/6" />
                            <div className="h-1.5 bg-slate-200 rounded w-full" />
                            <div className="h-1.5 bg-slate-200 rounded w-4/6" />
                            <div className="h-1.5 bg-slate-100 rounded w-full" />
                          </div>
                        </div>
                        <div className="text-[8px] text-slate-400 text-center pt-1 border-t border-slate-50 flex justify-between items-center">
                          <span>Foja 1 de {pageCount}</span>
                          <span className="text-[#0B2545] font-bold flex items-center gap-1 group-hover:underline">
                            👁️ Vista rápida
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cuerpo: badge páginas, título, descripción */}
                <div className="p-4 flex-1 flex flex-col space-y-1.5">
                  <span className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-50 text-slate-600 border border-slate-200">
                    📄 {pageCount} {pageCount === 1 ? 'pág' : 'págs'}
                  </span>
                  <h3
                    onClick={() => setPreviewTemplate(tpl)}
                    className="text-base font-bold text-[#0B2545] leading-snug line-clamp-2 cursor-pointer"
                    title={tpl.name}
                  >
                    {tpl.name}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2">
                    {tpl.description?.trim() || formatDateSafe(tpl.updatedAt)}
                  </p>

                  {/* Footer de acciones alineado abajo */}
                  <div className="mt-auto pt-3 flex items-center gap-2">
                    <button
                      onClick={() => onUseTemplate(tpl)}
                      className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-[#0B2545] text-xs font-extrabold rounded-xl transition flex items-center justify-center gap-1 tracking-wide"
                    >
                      ⚡ USAR
                    </button>
                    <button
                      onClick={() => onEditTemplate(tpl)}
                      className="w-9 h-9 flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-[#E7DFD2] text-xs transition"
                      title="Editar plantilla"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => handleDelete(tpl.id, tpl.name)}
                      disabled={deletingId === tpl.id}
                      className="w-9 h-9 flex items-center justify-center bg-white hover:bg-red-50 text-red-500 rounded-xl border border-[#E7DFD2] text-xs transition disabled:opacity-40"
                      title="Eliminar plantilla"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paginación real (control visible; números según páginas existentes) */}
      {filteredTemplates.length > 0 && (
        <div className="flex items-center justify-center gap-1.5 pt-1 pb-2">
          <button
            onClick={() => setPage(Math.max(1, safePage - 1))}
            disabled={safePage <= 1}
            className="w-8 h-8 rounded-lg border border-[#E7DFD2] bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-40 disabled:hover:bg-white"
            aria-label="Página anterior"
          >
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition ${
                n === safePage
                  ? 'bg-[#0B2545] text-white shadow-sm'
                  : 'border border-[#E7DFD2] bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => setPage(Math.min(totalPages, safePage + 1))}
            disabled={safePage >= totalPages}
            className="w-8 h-8 rounded-lg border border-[#E7DFD2] bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-40 disabled:hover:bg-white"
            aria-label="Página siguiente"
          >
            ›
          </button>
        </div>
      )}

      {previewTemplate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h4 className="text-xs font-black text-[#0B2545] uppercase tracking-wider">
                  Vista Previa del Machote
                </h4>
                <p className="text-xs text-slate-600 font-bold mt-0.5">{previewTemplate.name}</p>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="w-7 h-7 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-[#f5f2eb] flex justify-center">
              <div className="bg-white p-8 rounded-lg shadow-md border border-slate-300 w-full max-w-lg min-h-[400px] text-xs font-serif text-slate-800 leading-relaxed">
                <div className="text-center font-bold mb-4 border-b pb-2">
                  PODER JUDICIAL DE LA FEDERACIÓN
                  <div className="text-[10px] font-sans font-normal text-slate-500">
                    {previewTemplate.category?.toUpperCase() || 'ESCRITO JUDICIAL'}
                  </div>
                </div>
                <div className="whitespace-pre-line text-justify">
                  {previewTemplate.content ||
                    'QUEJOSO: [QUEJOSO]\nAUTORIDAD RESPONSABLE: [AUTORIDAD]\nEXPEDIENTE: [EXPEDIENTE]\n\nC. JUEZ DE DISTRITO / MAGISTRADO EN TURNO.\n\nPor medio del presente escrito vengo en tiempo y forma a formular el presente escrito legal...'}
                </div>
              </div>
            </div>

            {(previewTemplate.personalStructure || previewTemplate.variables?.length) && (
              <div className="px-6 pb-4 bg-[#f5f2eb] space-y-2 text-[11px] text-slate-700">
                {previewTemplate.personalStructure?.sections?.length ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-3">
                    <span className="font-bold text-[#0B2545]">Estructura:</span>{' '}
                    {previewTemplate.personalStructure.sections.map((section) => section.title).join(' · ')}
                  </div>
                ) : null}
                {previewTemplate.variables?.length ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-3">
                    <span className="font-bold text-[#0B2545]">Variables:</span>{' '}
                    {previewTemplate.variables.map((variable) => `${variable.label} (${variable.placeholder})`).join(' · ')}
                  </div>
                ) : null}
              </div>
            )}

            <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-white">
              <button
                onClick={() => setPreviewTemplate(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
              >
                Cerrar
              </button>
              <button
                onClick={() => {
                  const t = previewTemplate;
                  setPreviewTemplate(null);
                  onUseTemplate(t);
                }}
                className="px-5 py-2 bg-[#0B2545] hover:bg-[#081d39] text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
              >
                ⚡ Usar en el Editor Jurídico
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
