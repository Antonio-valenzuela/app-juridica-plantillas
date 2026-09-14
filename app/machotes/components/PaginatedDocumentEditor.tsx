'use client';

import React, { useState, useMemo } from 'react';
import { UniversalLegalDocument, DocumentNode, CaseDocument, UploadedSourceDocument, ContentBlock } from '@/lib/legal-engine/types';
import { runQualityGateCheck, QualityGateResult } from '@/lib/legal-engine/qualityGate';
import { buildQualityGateSummary } from '@/lib/legal-engine/qualityGateSummary';
import { normalizeUnresolvedFieldMarkers } from '@/lib/legal-engine/pendingFields';

interface PaginatedDocumentEditorProps {
  document: UniversalLegalDocument;
  onUpdateDocument: (updated: UniversalLegalDocument) => void;
  onRegenerateSection?: (sectionId: string, instruction?: string) => Promise<void>;
  onExportDocx?: () => void;
  onExportPdf?: () => void;
  onSaveDraft?: () => Promise<boolean>;
  onCloseEditor?: () => void;
  caseDocuments?: CaseDocument[];
  sourceDocs?: UploadedSourceDocument[];
  selectedSourceDoc?: CaseDocument | null;
  onSelectCaseDocument?: (doc: CaseDocument) => void;
  isGenerating?: boolean;
  referenceText?: string;
}

type SectionAction = 'regenerate' | 'expand' | 'reduce' | 'reformulate';

const SECTION_ACTION_LABELS: Record<SectionAction, { icon: string; label: string }> = {
  regenerate: { icon: '🔄', label: 'Regenerar' },
  expand: { icon: '➕', label: 'Ampliar' },
  reduce: { icon: '➖', label: 'Reducir' },
  reformulate: { icon: '✍️', label: 'Reformular' },
};

interface SearchHit {
  page: number;
  sectionId: string;
}

// Derivación pura de coincidencias de búsqueda (sustituye al estado + efecto).
function computeSearchMatches(
  query: string,
  breakdown: Array<{ pageNumber: number; sections: Array<{ section: { id: string }; text: string }> }>
): SearchHit[] {
  const q = query.toLowerCase();
  const matches: SearchHit[] = [];
  if (!q.trim()) return matches;
  breakdown.forEach((p) => {
    p.sections.forEach(({ section, text }) => {
      if (text.toLowerCase().includes(q)) matches.push({ page: p.pageNumber, sectionId: section.id });
    });
  });
  return matches;
}

export function PaginatedDocumentEditor({
  document,
  onUpdateDocument,
  onRegenerateSection,
  onExportDocx,
  onExportPdf,
  onSaveDraft,
  onCloseEditor,
  caseDocuments = [],
  sourceDocs = [],
  selectedSourceDoc,
  onSelectCaseDocument,
  isGenerating = false,
  referenceText,
}: PaginatedDocumentEditorProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [leftTab, setLeftTab] = useState<'documents' | 'structure' | 'thumbnails'>('documents');
  const [rightTab, setRightTab] = useState<'fuentes' | 'datos' | 'ia' | 'herramientas' | 'metricas'>('fuentes');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);
  const [editingBlock, setEditingBlock] = useState<{ sectionId: string; blockId: string; text: string } | null>(null);
  const [sectionInstruction, setSectionInstruction] = useState('');
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [sourcePage, setSourcePage] = useState(1);

  const qualityGate: QualityGateResult = useMemo(() => runQualityGateCheck(document), [document]);
  const qualityGateSummary = useMemo(() => buildQualityGateSummary(qualityGate), [qualityGate]);

  const CHARS_PER_PAGE = 1800;

  const pageBreakdown = useMemo(() => {
    const pages: Array<{ pageNumber: number; sections: Array<{ section: DocumentNode; text: string }> }> = [];
    let currentPageNum = 1;
    let currentChars = 0;
    let currentSections: Array<{ section: DocumentNode; text: string }> = [];

    document.sections.forEach((sec) => {
      const secText = sec.content.map((b) => b.text).join('\n\n');
      const secLength = secText.length || 200;

      if (currentChars + secLength > CHARS_PER_PAGE && currentSections.length > 0) {
        pages.push({ pageNumber: currentPageNum, sections: currentSections });
        currentPageNum++;
        currentChars = 0;
        currentSections = [];
      }

      currentSections.push({ section: sec, text: secText });
      currentChars += secLength;
    });

    if (currentSections.length > 0) {
      pages.push({ pageNumber: currentPageNum, sections: currentSections });
    }

    return pages.length > 0 ? pages : [{ pageNumber: 1, sections: [] }];
  }, [document.sections]);

  const totalPages = pageBreakdown.length;
  const activePageData = pageBreakdown.find((p) => p.pageNumber === currentPage) || pageBreakdown[0];

  // Coincidencias derivadas (puro): mismos deps que el efecto original, sin estado intermedio.
  const searchMatches = useMemo(() => computeSearchMatches(searchQuery, pageBreakdown), [searchQuery, pageBreakdown]);
  const safeActiveMatch = searchMatches.length > 0 ? Math.min(activeMatch, searchMatches.length - 1) : 0;

  const sectionPageMap = useMemo(() => {
    const map: Record<string, number> = {};
    pageBreakdown.forEach((p) => p.sections.forEach(({ section }) => (map[section.id] = p.pageNumber)));
    return map;
  }, [pageBreakdown]);

  const goToNextMatch = (dir: 1 | -1) => {
    if (searchMatches.length === 0) return;
    const next = (safeActiveMatch + dir + searchMatches.length) % searchMatches.length;
    setActiveMatch(next);
    setCurrentPage(searchMatches[next].page);
  };

  const scrollToSection = (sectionId: string) => {
    const page = sectionPageMap[sectionId];
    if (page) setCurrentPage(page);
    setActiveSectionId(sectionId);
    window.setTimeout(() => {
      const el = globalThis.document.getElementById(`sec-${sectionId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  /* ── Edición granular de bloques ─────────────────────────────────────── */
  const updateBlock = (sectionId: string, blockId: string, newText: string) => {
    const updatedSections = document.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      const content = sec.content.map((b) =>
        b.id === blockId
          ? { ...b, text: newText, isManuallyEdited: true, layer: 'USER_POSITION' as const, trustLevel: 'VERIFIED' as const }
          : b
      );
      return { ...sec, content, isManuallyEdited: true };
    });
    onUpdateDocument({ ...document, sections: updatedSections, updatedAt: new Date().toISOString() });
    setEditingBlock(null);
  };

  const runSectionAction = (action: SectionAction, section: DocumentNode) => {
    if (!onRegenerateSection) return;
    const title = section.title;
    const instructions: Record<SectionAction, string> = {
      regenerate:
        sectionInstruction.trim() ||
        `Regenera por completo el apartado "${title}" con argumentos jurídicos extensos (planteamiento, hecho, norma, criterio, aplicación, refutación, consecuencia y conclusión).`,
      expand: `Amplía y desarrolla con mayor profundidad el apartado "${title}", incorporando más argumentos, fundamentos legales, doctrina y detalle sin perder precisión ni inventar datos.`,
      reduce: `Sintetiza el apartado "${title}" conservando lo esencial, los argumentos principales y la precisión jurídica, reduciendo su extensión.`,
      reformulate: `Reformula el apartado "${title}" con una redacción distinta, manteniendo íntegro el contenido jurídico, la argumentación y el estilo del escrito.`,
    };
    void onRegenerateSection(section.id, instructions[action]);
  };

  const handleSave = async () => {
    if (!onSaveDraft) return;
    setSaveState('saving');
    const ok = await onSaveDraft();
    setSaveState(ok ? 'saved' : 'idle');
    if (ok) window.setTimeout(() => setSaveState('idle'), 3000);
  };

  /* ── Métricas ─────────────────────────────────────────────────────────── */
  const metrics = useMemo(() => {
    const generatedChars = (document.sections || []).reduce((a: number, s: DocumentNode) => a + (s.content || []).reduce((x: number, b: ContentBlock) => x + (b.text?.length || 0), 0), 0);
    const generatedWords = (document.sections || []).reduce((a: number, s: DocumentNode) => a + (s.content || []).reduce((x: number, b: ContentBlock) => x + (b.text || '').split(/\s+/).filter(Boolean).length, 0), 0);
    const paragraphs = (document.sections || []).reduce((a: number, s: DocumentNode) => a + (s.content || []).reduce((x: number, b: ContentBlock) => x + (b.text || '').split(/\n\s*\n/).filter(Boolean).length, 0), 0);
    const argumentsCount = (document.sections || []).filter((s: DocumentNode) => s.type === 'argument').length;
    const sourcesCount = (document.sections || []).reduce((a: number, s: DocumentNode) => a + (s.content || []).reduce((x: number, b: ContentBlock) => x + (b.sources?.length || 0), 0), 0);
    const srcPages = (document.sourceDocuments || []).reduce((a: number, s: UploadedSourceDocument) => a + (s.pages?.length || 0), 0);
    const srcChars = (document.sourceDocuments || []).reduce((a: number, s: UploadedSourceDocument) => a + (s.extractedText?.length || 0), 0);
    const refChars = referenceText?.length || 0;
    return {
      generated: {
        pages: Math.max(1, Math.ceil(generatedChars / 1800)),
        chars: generatedChars,
        words: generatedWords,
        sections: document.sections.length,
        paragraphs,
        arguments: argumentsCount,
        sources: sourcesCount,
      },
      source: { pages: srcPages, chars: srcChars, words: (document.sourceDocuments || []).reduce((a: number, s: UploadedSourceDocument) => a + ((s.extractedText || '').split(/\s+/).filter(Boolean).length || 0), 0) },
      machote: { chars: refChars, words: referenceText ? referenceText.split(/\s+/).filter(Boolean).length : 0 },
    };
  }, [document, referenceText]);

  const activeSection =
    document.sections.find((s) => s.id === activeSectionId) ||
    activePageData?.sections[0]?.section ||
    document.sections[0] ||
    null;

  const renderPendingMarkers = (text: string, baseKey = 0) => {
    const displayText = normalizeUnresolvedFieldMarkers(text);
    const markerRegex = /(\[(?:(?:DATO\s*PENDIENTE|DATOPENDIENTE|DATO\s+ANONIMIZADO|DATOANONIMIZADO)[^\]]+|[A-ZÁÉÍÓÚÑ0-9_\-\s]{2,40})\])/gi;
    const markerOnlyRegex = /^\[(?:(?:DATO\s*PENDIENTE|DATOPENDIENTE|DATO\s+ANONIMIZADO|DATOANONIMIZADO)[^\]]+|[A-ZÁÉÍÓÚÑ0-9_\-\s]{2,40})\]$/i;
    return displayText.split(markerRegex).map((part, index) => {
      if (!markerOnlyRegex.test(part)) return part;
      return (
        <span key={`pending-${baseKey}-${index}`} className="bg-amber-100/90 text-amber-950 border-b border-amber-500 px-0.5" title="Campo pendiente o anonimizado">
          {part}
        </span>
      );
    });
  };

  const highlight = (text: string) => {
    if (!searchQuery.trim()) return renderPendingMarkers(text);
    const q = searchQuery.trim();
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 rounded-sm px-0.5">{part}</mark>
      ) : (
        <React.Fragment key={i}>{renderPendingMarkers(part, i)}</React.Fragment>
      )
    );
  };

  const selectedSource = caseDocuments.find((d) => d.id === selectedSourceDoc?.id) || selectedSourceDoc || null;

  return (
    <div className="flex flex-col h-full bg-[#f5f5f7] text-slate-900 font-sans">
      {/* ── Barra superior ────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          {onCloseEditor && (
            <button
              onClick={onCloseEditor}
              className="flex items-center gap-1.5 text-slate-500 hover:text-[#0B2545] text-sm font-bold transition-colors shrink-0"
            >
              ← Volver
            </button>
          )}
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#0B2545] bg-blue-50 px-3 py-1 rounded-full border border-blue-200 shrink-0">
            Modo Borrador (Editable)
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold truncate text-[#0B2545]">{document.documentTypeLabel}</h2>
            <p className="text-[11px] text-slate-500 truncate">{document.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!qualityGate.canMarkAsFinal ? (
            <button
              onClick={() => { setShowValidation(true); setRightTab('herramientas'); }}
              className="flex items-center gap-2 bg-amber-50 border border-amber-300 px-3 py-1.5 rounded-full text-[11px] text-amber-800 font-bold hover:bg-amber-100 transition"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Requiere revisión ({qualityGate.qualityScore}/100)
            </button>
          ) : (
            <button
              onClick={() => { setShowValidation(true); setRightTab('herramientas'); }}
              className="flex items-center gap-2 bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-full text-[11px] text-emerald-800 font-bold hover:bg-emerald-100 transition"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              Verificado para firma
            </button>
          )}

          <button onClick={handleSave} disabled={saveState === 'saving' || !onSaveDraft} className="jr-button-primary text-xs py-1.5 px-4">
            {saveState === 'saving' ? 'Guardando...' : saveState === 'saved' ? '✓ Guardado' : '💾 Guardar'}
          </button>
          {onExportDocx && (
            <button onClick={onExportDocx} className="jr-button-primary text-xs py-1.5 px-4">
              📄 DOCX
            </button>
          )}
          {onExportPdf && (
            <button onClick={onExportPdf} className="jr-button-secondary text-xs py-1.5 px-4">
              🖨️ PDF
            </button>
          )}
        </div>
      </div>

      {/* ── Barra de navegación de páginas ─────────────────────────────────── */}
      <div className="shrink-0 bg-white/80 backdrop-blur border-b border-slate-200 px-5 py-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-2.5 py-1 bg-white hover:bg-slate-50 disabled:opacity-40 rounded-lg text-slate-700 font-semibold border border-slate-300 shadow-sm"
          >
            ←
          </button>
          <span className="font-medium">
            Página <span className="text-[#0B2545] font-extrabold">{currentPage}</span> de {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-2.5 py-1 bg-white hover:bg-slate-50 disabled:opacity-40 rounded-lg text-slate-700 font-semibold border border-slate-300 shadow-sm"
          >
            →
          </button>

          <div className="flex items-center gap-1.5 pl-3 border-l border-slate-300">
            <span className="text-slate-500">Ir a:</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (val >= 1 && val <= totalPages) setCurrentPage(val);
              }}
              className="w-14 px-2 py-0.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-center font-bold"
            />
          </div>

          <div className="flex items-center gap-1.5 pl-3 border-l border-slate-300">
            <span className="text-slate-500">Zoom</span>
            <button onClick={() => setZoomLevel((z) => Math.max(50, z - 10))} className="px-2 py-0.5 bg-white border border-slate-300 rounded-lg font-bold">−</button>
            <span className="font-mono font-bold text-[#0B2545] w-10 text-center">{zoomLevel}%</span>
            <button onClick={() => setZoomLevel((z) => Math.min(150, z + 10))} className="px-2 py-0.5 bg-white border border-slate-300 rounded-lg font-bold">+</button>
          </div>
        </div>

        {/* Buscar */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar en el documento..."
              value={searchQuery}
              onChange={(e) => {
                const v = e.target.value;
                setSearchQuery(v);
                setActiveMatch(0);
                // Mismo salto que hacía el efecto original al cambiar la query.
                const first = computeSearchMatches(v, pageBreakdown)[0];
                if (first) setCurrentPage(first.page);
              }}
              className="w-56 px-3 py-1 pr-16 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-[#0B2545] shadow-sm"
            />
            {searchMatches.length > 0 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#0B2545] bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5">
                {safeActiveMatch + 1}/{searchMatches.length}
              </span>
            )}
          </div>
          <button onClick={() => goToNextMatch(1)} disabled={searchMatches.length === 0} className="px-2 py-1 bg-white border border-slate-300 rounded-lg font-bold disabled:opacity-40">↓</button>
          <button onClick={() => goToNextMatch(-1)} disabled={searchMatches.length === 0} className="px-2 py-1 bg-white border border-slate-300 rounded-lg font-bold disabled:opacity-40">↑</button>
        </div>
      </div>

      {/* ── Cuerpo: 3 paneles ─────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Panel izquierdo */}
        <aside className="w-[260px] shrink-0 bg-white border-r border-slate-200 flex flex-col">
          <div className="flex border-b border-slate-200">
            {(['documents', 'structure', 'thumbnails'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setLeftTab(tab)}
                className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider transition ${
                  leftTab === tab ? 'text-[#0B2545] border-b-2 border-[#0B2545] bg-blue-50/40' : 'text-slate-500 hover:text-[#0B2545]'
                }`}
              >
                {tab === 'documents' ? '📁 Docs' : tab === 'structure' ? '🌳 Estructura' : '🗂 Miniaturas'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {leftTab === 'documents' && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                  Documentos del Caso ({caseDocuments.length})
                </p>
                {caseDocuments.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic px-1">Sin documentos cargados.</p>
                ) : (
                  caseDocuments.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => {
                        onSelectCaseDocument?.(doc);
                        setSourcePage(1);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl border transition ${
                        selectedSource?.id === doc.id
                          ? 'bg-white border-[#0B2545] shadow-sm'
                          : 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-slate-700">
                        <span className="truncate">{doc.name}</span>
                        <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono uppercase shrink-0">{doc.type}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
                        <span>{doc.pageCount} pág(s)</span>
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                            doc.status === 'READY' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {doc.status === 'READY' ? 'VERIFICADA' : 'PARCIAL/OCR'}
                        </span>
                      </div>
                    </button>
                  ))
                )}

                {selectedSource && (
                  <div className="mt-3 border-t border-slate-200 pt-2">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1.5">
                      <span className="truncate max-w-[140px]">Fuente: {selectedSource.name}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setSourcePage((p) => Math.max(1, p - 1))} disabled={sourcePage === 1} className="px-1.5 py-0.5 bg-slate-100 rounded disabled:opacity-40">←</button>
                        <span className="font-mono">{sourcePage}/{selectedSource.pageCount}</span>
                        <button onClick={() => setSourcePage((p) => Math.min(selectedSource.pageCount, p + 1))} disabled={sourcePage === selectedSource.pageCount} className="px-1.5 py-0.5 bg-slate-100 rounded disabled:opacity-40">→</button>
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-[10px] font-serif leading-relaxed whitespace-pre-wrap max-h-44 overflow-y-auto text-slate-700">
                      {selectedSource.pages?.[sourcePage - 1]?.text || 'Sin contenido en esta página.'}
                    </div>
                  </div>
                )}
              </>
            )}

            {leftTab === 'structure' && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                  Estructura del escrito ({document.sections.length} apartados)
                </p>
                {document.sections.map((sec: DocumentNode, idx: number) => {
                  const isEmpty = !(sec.content || []).some((b: ContentBlock) => (b.text || '').trim());
                  const isActive = activeSectionId === sec.id;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => scrollToSection(sec.id)}
                      className={`w-full text-left p-2 rounded-lg border text-[11px] transition flex items-center gap-2 ${
                        isActive ? 'bg-[#0B2545] text-white border-[#0B2545]' : 'bg-slate-50/60 border-slate-200 text-slate-600 hover:border-[#0B2545]'
                      }`}
                    >
                      <span className="text-[9px] font-mono opacity-60 w-5 shrink-0">{idx + 1}.</span>
                      <span className="flex-1 truncate font-semibold">{sec.title}</span>
                      {isEmpty && <span className="text-[8px] font-bold uppercase text-amber-500 shrink-0">vacía</span>}
                    </button>
                  );
                })}
              </>
            )}

            {leftTab === 'thumbnails' && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                  Páginas ({totalPages})
                </p>
                {pageBreakdown.map((p) => {
                  const preview = p.sections.map((s) => s.text).join(' ').slice(0, 130);
                  return (
                    <button
                      key={p.pageNumber}
                      onClick={() => setCurrentPage(p.pageNumber)}
                      className={`w-full text-left p-2.5 rounded-xl border transition ${
                        currentPage === p.pageNumber ? 'bg-white border-[#0B2545] shadow-sm' : 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-bold text-[#0B2545] mb-1">
                        <span>Página {p.pageNumber}</span>
                        <span className="text-slate-400 font-mono">{p.sections.length} sec(s)</span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-md p-2 text-[9px] leading-relaxed text-slate-500 line-clamp-4">
                        {preview || 'Página en blanco'}
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </aside>

        {/* Panel central: hoja Carta */}
        <main className="flex-1 bg-slate-100/90 overflow-y-auto flex justify-center p-6">
          <div className="self-start" style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}>
            <div className="w-[816px] bg-white shadow-2xl rounded-sm border border-slate-200/80 p-12 min-h-[1056px] text-slate-900 font-serif leading-relaxed text-sm space-y-8">
              {/* Header Marker */}
              <div className="border-b border-slate-200 pb-3 flex justify-between items-center text-[11px] text-slate-400 font-sans tracking-wide">
                <span>JURÍDICO RADAR — MOTOR DE ELABORACIÓN JURÍDICA</span>
                <span>EXPEDIENTE: {document.caseRefs.expediente || 'DATO PENDIENTE'}</span>
              </div>

              {activePageData?.sections.length === 0 ? (
                <div className="text-center py-20 text-slate-400 italic font-sans text-xs">
                  No hay contenido redactado en esta página.
                </div>
              ) : (
                activePageData.sections.map(({ section }: { section: DocumentNode }) => {
                  const isManuallyEdited = section.isManuallyEdited || (section.content || []).some((b: ContentBlock) => b.isManuallyEdited);
                  const isEmpty = !(section.content || []).some((b: ContentBlock) => (b.text || '').trim());
                  return (
                    <section key={section.id} id={`sec-${section.id}`} className="group relative p-4 rounded-xl border border-transparent hover:border-slate-200 hover:bg-slate-50/60 transition space-y-2.5 font-sans">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-[#0B2545] text-xs uppercase tracking-wider">{section.title}</h3>
                          {isManuallyEdited && (
                            <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-amber-100 text-amber-800 border border-amber-300">
                              Editado
                            </span>
                          )}
                          {isEmpty && (
                            <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded bg-red-50 text-red-600 border border-red-200">
                              Sin contenido
                            </span>
                          )}
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1.5">
                          {(Object.keys(SECTION_ACTION_LABELS) as SectionAction[]).map((action) => (
                            <button
                              key={action}
                              onClick={() => runSectionAction(action, section)}
                              disabled={isGenerating || !onRegenerateSection}
                              title={SECTION_ACTION_LABELS[action].label}
                              className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-[10px] font-bold rounded-lg shadow-sm disabled:opacity-40"
                            >
                              {SECTION_ACTION_LABELS[action].icon} {SECTION_ACTION_LABELS[action].label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {section.content.length === 0 ? (
                        <p className="text-slate-300 italic text-xs py-3">Apartado sin redactar. Use «Regenerar» para desarrollarlo.</p>
                      ) : (
                        <div className="space-y-2">
                          {section.content.map((block: ContentBlock) => {
                            const isEditing = editingBlock?.blockId === block.id;
                            return (
                              <div key={block.id} className="group/block relative rounded-lg border border-transparent hover:border-blue-200 hover:bg-white p-1.5 transition">
                                {isEditing ? (
                                  <div className="relative" data-block-editor>
                                    {/* Acciones flotantes fuera del flujo de la hoja */}
                                    <div className="absolute right-0 -top-7 z-10 flex justify-end gap-1.5">
                                      <button
                                        onClick={() => setEditingBlock(null)}
                                        className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg shadow-xs"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          const ta = (e.currentTarget.closest('[data-block-editor]')?.querySelector('textarea')) as HTMLTextAreaElement | null;
                                          updateBlock(section.id, block.id, ta?.value ?? editingBlock?.text ?? block.text);
                                        }}
                                        className="px-3 py-1 bg-[#0B2545] text-white hover:bg-[#081d39] text-xs font-bold rounded-lg shadow-sm"
                                      >
                                        Guardar
                                      </button>
                                    </div>
                                    {/* Auto-expandible: mismas métricas serif del texto; la hoja no se contrae */}
                                    <textarea
                                      autoFocus
                                      defaultValue={editingBlock?.text || block.text}
                                      ref={(el) => {
                                        if (el) {
                                          el.style.height = 'auto';
                                          el.style.height = `${el.scrollHeight}px`;
                                        }
                                      }}
                                      onInput={(e) => {
                                        const el = e.currentTarget;
                                        el.style.height = 'auto';
                                        el.style.height = `${el.scrollHeight}px`;
                                      }}
                                      className="w-full bg-transparent border border-[#0B2545] rounded-md px-1 py-0.5 text-sm text-slate-900 font-serif leading-relaxed focus:outline-none resize-none overflow-hidden"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex items-start gap-2">
                                    <p className="font-serif leading-relaxed whitespace-pre-wrap text-slate-800 text-sm flex-1">
                                      {highlight(block.text)}
                                    </p>
                                    <button
                                      onClick={() => setEditingBlock({ sectionId: section.id, blockId: block.id, text: block.text })}
                                      className="opacity-0 group-hover/block:opacity-100 px-2 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg shrink-0"
                                      title="Editar bloque"
                                    >
                                      ✏️
                                    </button>
                                  </div>
                                )}
                                {block.sources && block.sources.length > 0 && (
                                  <p className="text-[9px] text-slate-400 font-sans mt-0.5">
                                    🔖 {block.sources.length} referencia(s) al expediente
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })
              )}

              {/* Footer Marker */}
              <div className="border-t border-slate-200 pt-3 flex justify-between items-center text-[11px] text-slate-400 font-sans tracking-wide">
                <span>PÁGINA {currentPage} DE {totalPages}</span>
                <span>PROTESTO LO NECESARIO EN DERECHO</span>
              </div>
            </div>
          </div>
        </main>

        {/* Panel derecho */}
        <aside className="w-[300px] shrink-0 bg-white border-l border-slate-200 flex flex-col">
          <div className="flex border-b border-slate-200">
            {(['fuentes', 'datos', 'ia', 'herramientas', 'metricas'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`flex-1 py-2.5 text-[9px] font-bold uppercase tracking-wider transition ${
                  rightTab === tab ? 'text-[#0B2545] border-b-2 border-[#0B2545] bg-blue-50/40' : 'text-slate-500 hover:text-[#0B2545]'
                }`}
              >
                {tab === 'fuentes' ? '📚 Fuentes' : tab === 'datos' ? '🧾 Datos' : tab === 'ia' ? '✨ IA' : tab === 'herramientas' ? '🛠 Herramientas' : '📊 Métricas'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* FUENTES */}
            {rightTab === 'fuentes' && (
              <>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">FUENTE ACTUAL</p>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Documentos del expediente usados como base del escrito. Cada bloque del documento enlaza sus referencias.
                  </p>
                </div>
                {sourceDocs.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">No hay documentos fuente cargados.</p>
                ) : (
                  sourceDocs.map((s) => (
                    <div key={s.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-700 truncate max-w-[150px]">{s.filename || s.name}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${s.sourceValidated !== false ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                          {s.sourceValidated !== false ? 'VERIFICADA' : 'PARCIAL'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        {s.pages?.length || 1} pág(s) · {(s.extractedText || '').length.toLocaleString()} caracteres
                      </p>
                    </div>
                  ))
                )}

                {activeSection && (
                  <div className="border-t border-slate-200 pt-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Referencias del apartado: {activeSection.title}
                    </p>
                    {activeSection.content.flatMap((b: ContentBlock) => b.sources || []).length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic">Este apartado no cita fragmentos del expediente.</p>
                    ) : (
                      activeSection.content.flatMap((b: ContentBlock) => (b.sources || []).map((src: any, i: number) => (
                        <div key={`${b.id}-${i}`} className="p-2 rounded-lg bg-blue-50/50 border border-blue-100 text-[10px] text-slate-600 mb-1.5">
                          <span className="font-bold text-[#0B2545]">Doc:</span> {src.documentId} {src.page ? `· pág. ${src.page}` : ''}
                          {src.textSnippet && <p className="mt-0.5 line-clamp-2 text-slate-500">{src.textSnippet}</p>}
                        </div>
                      )))
                    )}
                  </div>
                )}
              </>
            )}

            {/* DATOS */}
            {rightTab === 'datos' && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">DATOS DEL CASO</p>
                {[
                  ['Expediente', document.caseRefs.expediente],
                  ['Amparo', document.caseRefs.amparo],
                  ['Actor / Quejoso', document.parties.actor || document.parties.quejoso],
                  ['Demandado', document.parties.demandado],
                  ['Tercero interesado', document.parties.terceroInteresado],
                  ['Autoridad responsable', document.parties.autoridadResponsable],
                  ['Materia', document.matter],
                  ['Jurisdicción', document.jurisdiction],
                ].map(([label, value]) => (
                  <div key={label} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className={`text-[12px] font-bold ${value ? 'text-slate-800' : 'text-amber-600'}`}>
                      {value || 'DATO PENDIENTE'}
                    </p>
                  </div>
                ))}
                <p className="text-[10px] text-slate-400 italic">
                  Los campos faltantes se muestran como «DATO PENDIENTE». Nunca se inventan datos del caso.
                </p>
              </>
            )}

            {/* IA */}
            {rightTab === 'ia' && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ASISTENCIA DE REDACCIÓN</p>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Regenera, amplía, reduce o reformula cualquier apartado. Si edita manualmente, Radar conserva sus cambios y no los sobrescribe.
                </p>
                <textarea
                  rows={3}
                  value={sectionInstruction}
                  onChange={(e) => setSectionInstruction(e.target.value)}
                  placeholder="Instrucción específica para el apartado activo (p. ej. enfatizar violación al debido proceso)..."
                  className="jr-input font-sans text-xs"
                />
                {activeSection ? (
                  <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-200">
                    <p className="text-[10px] font-bold text-[#0B2545] mb-1">Apartado activo:</p>
                    <p className="text-[11px] font-semibold text-slate-700">{activeSection.title}</p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">Seleccione un apartado en el panel de estructura.</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {activeSection &&
                    (Object.keys(SECTION_ACTION_LABELS) as SectionAction[]).map((action) => (
                      <button
                        key={action}
                        onClick={() => runSectionAction(action, activeSection)}
                        disabled={isGenerating || !onRegenerateSection}
                        className="machote-jr-button-secondary text-[10px] py-2"
                      >
                        {SECTION_ACTION_LABELS[action].icon} {SECTION_ACTION_LABELS[action].label}
                      </button>
                    ))}
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-500 leading-relaxed">
                  <p className="font-bold text-slate-600 mb-0.5">Memoria y RAG</p>
                  Radar distingue la fuente actual del historial del abogado (estilo, fórmulas y estrategia) sin copiar nombres, hechos ni expedientes ajenos.
                </div>
              </>
            )}

            {/* HERRAMIENTAS */}
            {rightTab === 'herramientas' && (
              <>
                <button
                  onClick={() => setShowValidation((v) => !v)}
                  className="machote-jr-button-secondary w-full text-xs py-2.5"
                >
                  ✅ Validar escrito
                </button>

                {showValidation && (
                  <div className="space-y-2">
                    <div className={`p-2.5 rounded-xl text-[11px] font-bold border ${qualityGate.canMarkAsFinal ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-300'}`}>
                      {qualityGate.canMarkAsFinal
                        ? `✓ LISTO PARA FIRMA (${qualityGate.qualityScore}/100)`
                        : `REQUIERE EXPANSIÓN / REVISIÓN (${qualityGate.qualityScore}/100)`}
                    </div>

                    {qualityGate.metrics.isProportional === false && (
                      <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] text-red-700 font-bold">
                        ⚠️ Extensión desproporcionada frente al machote. Ejecute «Ampliar» en los apartados clave.
                      </div>
                    )}

                    {qualityGateSummary.groups.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase text-slate-600">
                          Revisión agrupada ({qualityGateSummary.totalIssueCount})
                        </p>
                        {qualityGateSummary.groups.map((group) => {
                          const critical = group.criticalCount > 0;
                          return (
                            <div key={group.key} className={`p-2 rounded-lg border text-[10px] ${critical ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                              <div className="font-bold">
                                {group.label}: {group.count} incidencia{group.count === 1 ? '' : 's'}
                                {group.criticalCount > 0 ? ` · ${group.criticalCount} error${group.criticalCount === 1 ? '' : 'es'}` : ''}
                              </div>
                              {group.uniqueDetails.length > 0 && (
                                <details className="mt-1">
                                  <summary className="cursor-pointer font-semibold">Ver detalle ({group.uniqueDetails.length})</summary>
                                  <div className="mt-1 space-y-1">
                                    {group.uniqueDetails.map((detail, index) => <p key={`${group.key}-${index}`}>{detail}</p>)}
                                  </div>
                                </details>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-1.5 text-center text-[10px]">
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-200"><span className="block text-sm font-extrabold text-[#0B2545]">{qualityGate.metrics.wordCount.toLocaleString()}</span>palabras</div>
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-200"><span className="block text-sm font-extrabold text-[#0B2545]">{qualityGate.metrics.characterCount.toLocaleString()}</span>caracteres</div>
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-200"><span className="block text-sm font-extrabold text-[#0B2545]">{qualityGate.metrics.pendingFieldsCount}</span>pendientes</div>
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-200"><span className="block text-sm font-extrabold text-[#0B2545]">{qualityGate.metrics.manuallyEditedSectionsCount}</span>editados</div>
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-200 pt-3 space-y-2">
                  <button onClick={handleSave} disabled={!onSaveDraft} className="machote-jr-button-primary w-full text-xs py-2.5">
                    💾 Guardar borrador
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    {onExportDocx && (
                      <button onClick={onExportDocx} className="machote-jr-button-secondary text-[11px] py-2">📄 DOCX</button>
                    )}
                    {onExportPdf && (
                      <button onClick={onExportPdf} className="machote-jr-button-secondary text-[11px] py-2">🖨️ PDF</button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* MÉTRICAS */}
            {rightTab === 'metricas' && (
              <>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">FUENTE</p>
                  <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200"><span className="block text-sm font-extrabold text-[#0B2545]">{metrics.source.pages}</span>páginas</div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200"><span className="block text-sm font-extrabold text-[#0B2545]">{metrics.source.chars.toLocaleString()}</span>caracteres</div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200"><span className="block text-sm font-extrabold text-[#0B2545]">{metrics.source.words.toLocaleString()}</span>palabras</div>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">MACHOTE</p>
                  <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200"><span className="block text-sm font-extrabold text-[#0B2545]">{metrics.machote.chars ? Math.ceil(metrics.machote.chars / 1800) : 0}</span>páginas</div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200"><span className="block text-sm font-extrabold text-[#0B2545]">{metrics.machote.chars.toLocaleString()}</span>caracteres</div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200"><span className="block text-sm font-extrabold text-[#0B2545]">{metrics.machote.words.toLocaleString()}</span>palabras</div>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">GENERADO</p>
                  <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200"><span className="block text-sm font-extrabold text-[#0B2545]">{metrics.generated.pages}</span>páginas</div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200"><span className="block text-sm font-extrabold text-[#0B2545]">{metrics.generated.chars.toLocaleString()}</span>caracteres</div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200"><span className="block text-sm font-extrabold text-[#0B2545]">{metrics.generated.words.toLocaleString()}</span>palabras</div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200"><span className="block text-sm font-extrabold text-[#0B2545]">{metrics.generated.sections}</span>apartados</div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200"><span className="block text-sm font-extrabold text-[#0B2545]">{metrics.generated.paragraphs}</span>párrafos</div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200"><span className="block text-sm font-extrabold text-[#0B2545]">{metrics.generated.arguments}</span>argumentos</div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5">
                    🔖 Referencias a fuentes: <strong className="text-[#0B2545]">{metrics.generated.sources}</strong>
                  </p>
                </div>

              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
