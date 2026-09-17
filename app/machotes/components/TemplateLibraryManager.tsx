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

  const matterTotal = useMemo(() => {
    const values = templates
      .map((template) => (template.category || template.matterId || '').trim().toLowerCase())
      .filter(Boolean);
    return new Set(values).size;
  }, [templates]);

  const recentTemplate = useMemo(() => {
    return templates.reduce<TemplateItem | null>((current, template) => {
      if (!current) return template;
      const currentTime = new Date(current.updatedAt || '').getTime();
      const templateTime = new Date(template.updatedAt || '').getTime();
      return templateTime > currentTime ? template : current;
    }, null);
  }, [templates]);

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
    <div className="templates-page space-y-5 w-full mx-auto">
      <header className="templates-hero">
        <div className="templates-hero-copy">
          <div className="templates-hero-icon" aria-hidden="true">▤</div>
          <div>
            <h1>Mis Plantillas y Machotes</h1>
            <p>Biblioteca de documentos oficiales y plantillas reutilizables para redacción judicial.</p>
          </div>
        </div>
        <div className="templates-hero-note">La tecnología al servicio de la justicia <span aria-hidden="true" /></div>
      </header>

      <section className="templates-metrics" aria-label="Resumen de la biblioteca">
        <div className="templates-metric-card">
          <div className="templates-metric-icon templates-metric-icon-blue" aria-hidden="true">▤</div>
          <div><strong>{templates.length}</strong><span>Plantillas en mi biblioteca</span></div>
        </div>
        <div className="templates-metric-card">
          <div className="templates-metric-icon templates-metric-icon-green" aria-hidden="true">▥</div>
          <div><strong>{matterTotal}</strong><span>Materias</span></div>
        </div>
        <div className="templates-metric-card">
          <div className="templates-metric-icon templates-metric-icon-slate" aria-hidden="true">◷</div>
          <div><strong>{recentTemplate ? 'Recientes' : 'Sin registros'}</strong><span>{recentTemplate ? formatDateSafe(recentTemplate.updatedAt) : 'Aún no hay plantillas'}</span></div>
        </div>
        {profileSlot ? <div className="templates-profile-slot">{profileSlot}</div> : null}
      </section>

      <section className="templates-library-card">
        <div className="templates-controls">
          <label className="templates-search-field">
            <span aria-hidden="true">⌕</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Buscar por nombre, materia o palabra clave..."
              aria-label="Buscar plantillas"
            />
          </label>
          <label className="templates-filter-field">
            <span className="sr-only">Filtrar por materia</span>
            <select
              value={selectedMatterId}
              onChange={(e) => { setSelectedMatterId(e.target.value); setPage(1); }}
              aria-label="Filtrar por materia"
            >
              <option value="all">Todas las materias ({templates.length})</option>
              {availableMatters.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.count})</option>)}
            </select>
          </label>
          <button onClick={onCreateNewTemplate} className="templates-create-button">
            <span aria-hidden="true">＋</span> Crear Machote / Plantilla
          </button>
        </div>

        <div className="templates-list-heading">
          <div>
            <h2>Mis plantillas</h2>
            <p>{filteredTemplates.length} {filteredTemplates.length === 1 ? 'plantilla' : 'plantillas'} en tu biblioteca personal</p>
          </div>
        </div>

        {filteredTemplates.length === 0 && (
          <div className="templates-empty-state">
            <div className="templates-empty-icon" aria-hidden="true">▤</div>
            <h3>No se encontraron plantillas coincidentes</h3>
            <p>Prueba ajustando el término de búsqueda o seleccionando otra materia en el filtro.</p>
            <button
              onClick={() => { setSearchQuery(''); setSelectedMatterId('all'); setPage(1); }}
              className="templates-reset-button"
            >
              Restablecer filtros
            </button>
          </div>
        )}

        {pagedTemplates.length > 0 && (
          <div className="templates-list">
            {pagedTemplates.map((tpl) => {
              const matterStyle = getMatterStyle(tpl.category);
              const ext = tpl.fileType || tpl.sourceFileName?.split('.').pop()?.toUpperCase() || 'PDF';
              const pageCount = tpl.pageCount || 1;
              const preview = previewText(tpl);

              return (
                <article key={tpl.id} className="templates-row-card">
                  <button
                    type="button"
                    onClick={() => setPreviewTemplate(tpl)}
                    className="templates-thumbnail"
                    aria-label={`Vista previa de ${tpl.name}`}
                  >
                    {preview ? (
                      <span className="templates-thumbnail-text">{preview}</span>
                    ) : (
                      <span className="templates-thumbnail-lines" aria-hidden="true">
                        <span /><span /><span /><span /><span />
                      </span>
                    )}
                    <span className="templates-thumbnail-caption">Vista previa</span>
                  </button>

                  <div className="templates-row-main">
                    <div className="templates-row-topline">
                      <span className={`templates-matter-tag ${matterStyle.bg}`}>{matterStyle.tag}</span>
                      <span className="templates-row-format">{ext}</span>
                    </div>
                    <h3 onClick={() => setPreviewTemplate(tpl)} title={tpl.name}>{tpl.name}</h3>
                    <p>{tpl.description?.trim() || 'Plantilla personal revisada para documentos jurídicos.'}</p>
                    <div className="templates-row-meta">
                      <span aria-label="Páginas">▧ {pageCount} {pageCount === 1 ? 'pág.' : 'págs.'}</span>
                      <span aria-label="Actualización">◷ {formatDateSafe(tpl.updatedAt)}</span>
                    </div>
                  </div>

                  <div className="templates-row-actions">
                    <p className="templates-row-summary">{tpl.description?.trim() || `Documento ${matterStyle.tag.toLowerCase()} reutilizable.`}</p>
                    <div className="templates-action-buttons">
                      <button type="button" onClick={() => onUseTemplate(tpl)} className="templates-use-button">⚡ Usar</button>
                      <button type="button" onClick={() => onEditTemplate(tpl)} className="templates-icon-button" title="Editar plantilla" aria-label={`Editar ${tpl.name}`}>✎</button>
                      <button type="button" onClick={() => handleDelete(tpl.id, tpl.name)} disabled={deletingId === tpl.id} className="templates-icon-button templates-delete-button" title="Eliminar plantilla" aria-label={`Eliminar ${tpl.name}`}>🗑</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

      </section>

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
