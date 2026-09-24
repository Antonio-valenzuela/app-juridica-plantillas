'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { UniversalLegalDocument, DocumentNode, ContentBlock, BlockStyle } from '@/lib/legal-engine/types';
import { runQualityGateCheck, QualityGateResult } from '@/lib/legal-engine/qualityGate';
import { normalizeUnresolvedFieldMarkers, extractUnresolvedFieldMarkers } from '@/lib/legal-engine/pendingFields';
import { readDocumentExportReadiness, markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { buildWorkspacePageModel } from '@/lib/legal-engine/generationUi';
import type { ExportMode } from '@/lib/legal-engine/exportModes';

interface WorkspaceDocumentEditorProps {
  document: UniversalLegalDocument | null;
  onUpdateDocument: (updated: UniversalLegalDocument) => void;
  onRegenerateSection?: (sectionId: string, instruction?: string) => Promise<void>;
  onExportDocx?: (mode?: ExportMode) => void;
  onExportPdf?: (mode?: ExportMode) => void;
  onSaveDraft?: () => Promise<boolean>;
  onReopenDraft?: () => Promise<boolean>;
  onSaveAsTemplate?: (doc: UniversalLegalDocument) => Promise<void>;
  onGenerateFromMachote?: (doc: UniversalLegalDocument) => void;
  activeSectionId?: string | null;
  onSelectSection?: (section: DocumentNode) => void;
  onSelectTextHighlight?: (text: string) => void;
  isGenerating?: boolean;
  pipelineStageLabel?: string;
  onTriggerNewDraftModal?: () => void;
  onTriggerUpload?: () => void;
  /** Acción global "Formatear documento" (vive en esta toolbar consolidada). */
  onFormatDocument?: () => void;
  isFormatting?: boolean;
  /** Refinamiento IA del apartado activo desde la toolbar ('reformular'|'ampliar'|'reducir'). */
  onRefineActive?: (mode: 'reformular' | 'ampliar' | 'reducir') => void;
  /** Estado del autoguardado del borrador (chip junto a Guardar). */
  autosaveState?: 'idle' | 'saving' | 'saved';
  /** Navegación de regreso al panel/formulario (zona final de la toolbar). */
  onBackToPanel?: () => void;
  backLabel?: string;
  /** Acción opcional al promover a READY_TO_EXPORT */
  onMarkReadyToExport?: () => void;
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

export function WorkspaceDocumentEditor({
  document,
  onUpdateDocument,
  onRegenerateSection,
  onExportDocx,
  onExportPdf,
  onSaveDraft,
  onReopenDraft,
  onSaveAsTemplate,
  onGenerateFromMachote,
  activeSectionId,
  onSelectSection,
  onSelectTextHighlight,
  isGenerating = false,
  pipelineStageLabel,
  onTriggerUpload,
  onFormatDocument,
  isFormatting = false,
  onRefineActive,
  autosaveState = 'idle',
  onBackToPanel,
  backLabel = '‹ Volver al Panel',
}: WorkspaceDocumentEditorProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showPagesPanel, setShowPagesPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);
  const [editingBlock, setEditingBlock] = useState<{ sectionId: string; blockId: string; text: string } | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [reopenState, setReopenState] = useState<'idle' | 'loading'>('idle');
  const [isTemplateSaving, setIsTemplateSaving] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [zoomMode, setZoomMode] = useState<'custom' | 'fit-width' | 'fit-page'>('custom');
  const [docTitle, setDocTitle] = useState(document?.title || '');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  // EDICIÓN GLOBAL (única fuente de verdad): el documento inicia BLOQUEADO.
  // Un solo control arriba habilita/deshabilita la edición del documento completo.
  const [editLocked, setEditLocked] = useState(true);
  const pagesContainerRef = useRef<HTMLDivElement>(null);

  // History stack for Undo/Redo
  const [history, setHistory] = useState<UniversalLegalDocument[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    if (!document) return;
    // Resincronización diferida a microtask (orden FIFO garantiza que la última marca gane):
    // mantiene el comportamiento del efecto original sin setState síncrono.
    queueMicrotask(() => setDocTitle(document.title || 'Documento Jurídico'));
  }, [document]);

  // Quality gate
  const qualityGate: QualityGateResult | null = useMemo(() => {
    if (!document) return null;
    return runQualityGateCheck(document);
  }, [document]);

  const exportReadiness = useMemo(() => {
    return document ? readDocumentExportReadiness(document) : null;
  }, [document]);

  const isReadyToExport = exportReadiness === 'READY_TO_EXPORT' || exportReadiness === 'FINAL_DOCUMENT';

  const hasExportableContent = useMemo(() => {
    return Boolean(document?.sections.some((section) => section.content.some((block) => block.text.trim().length > 0)));
  }, [document]);

  const pendingIssues = useMemo(() => {
    if (!document) return [];
    const issues: string[] = [];

    // 1. Errores críticos del Quality Gate
    if (qualityGate?.criticalErrors) {
      for (const err of qualityGate.criticalErrors) {
        issues.push(err.message);
      }
    }

    // 2. Marcadores pendientes o no resueltos
    const fullText = document.sections.flatMap((s) => s.content.map((b) => b.text)).join('\n');
    const unresolved = extractUnresolvedFieldMarkers(fullText);
    for (const u of unresolved) {
      issues.push(`Completar campo: ${u.marker}`);
    }

    // 3. Notas internas de elaboración a suprimir
    const hasNotes = /(?:nota\s+(?:de\s+elaboraci[óo]n|editorial|interna)|a\s+suprimir\s+antes\s+de\s+la\s+presentaci[óo]n)/i.test(fullText);
    if (hasNotes && !issues.some((i) => i.includes('notas internas'))) {
      issues.push('Eliminar notas internas de elaboración antes de la presentación definitiva.');
    }

    // 4. Petitorios
    const hasPetition = document.sections.some((s) => s.type === 'petition' && s.content.some((b) => b.text.trim()));
    if (!hasPetition && !issues.some((i) => i.toLowerCase().includes('petitorio'))) {
      issues.push('Confirmar puntos petitorios del escrito.');
    }

    // 5. Deduplicar
    return Array.from(new Set(issues));
  }, [document, qualityGate]);

  const pendingCount = pendingIssues.length;

  const handlePromoteToReady = () => {
    if (!document) return;
    try {
      const readyDoc = markDocumentAsReadyToExport(document, { explicit: true });
      onUpdateDocument(readyDoc);
    } catch {
      setShowPendingModal(true);
    }
  };

  const handleFitWidth = () => {
    if (pagesContainerRef.current) {
      const w = pagesContainerRef.current.clientWidth - 80;
      const target = Math.max(50, Math.min(160, Math.round((w / 816) * 100)));
      setZoomLevel(target);
      setZoomMode('fit-width');
    }
  };

  const handleFitPage = () => {
    if (pagesContainerRef.current) {
      const h = pagesContainerRef.current.clientHeight - 80;
      const target = Math.max(50, Math.min(160, Math.round((h / 1056) * 100)));
      setZoomLevel(target);
      setZoomMode('fit-page');
    }
  };

  // Apartado activo para las acciones de formato de la toolbar.
  const activeSection = useMemo(
    () => document?.sections.find((s) => s.id === activeSectionId) || null,
    [document, activeSectionId]
  );

  // El editor y el buscador comparten una única topología física de páginas.
  const pageModel = useMemo(() => buildWorkspacePageModel(document), [document]);
  const pageBreakdown = pageModel.pages;

  // Coincidencias derivadas (puro): mismos deps que el efecto original, sin estado intermedio.
  const searchMatches = useMemo(() => computeSearchMatches(searchQuery, pageBreakdown), [searchQuery, pageBreakdown]);
  const safeActiveMatch = searchMatches.length > 0 ? Math.min(activeMatch, searchMatches.length - 1) : 0;

  const totalPages = pageModel.totalPages;

  // Lectura siempre dentro del rango válido: sustituye al efecto de clamp.
  // Los writes siguen sobre currentPage; ninguna lectura ve un valor fuera de rango.
  const viewPage = totalPages > 0 ? Math.min(currentPage, totalPages) : currentPage;

  // Navegación por teclado (Flechas ← → y RePág/AvPág)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setCurrentPage((p) => Math.min(totalPages, p + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setCurrentPage((p) => Math.max(1, p - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalPages]);

  const goToNextMatch = (dir: 1 | -1) => {
    if (searchMatches.length === 0) return;
    const next = (safeActiveMatch + dir + searchMatches.length) % searchMatches.length;
    setActiveMatch(next);
    setCurrentPage(searchMatches[next].page);
  };

  // Undo / Redo
  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setHistoryIndex((i) => i - 1);
      onUpdateDocument(prev);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setHistoryIndex((i) => i + 1);
      onUpdateDocument(next);
    }
  };

  // Update block content with history
  const updateBlock = (sectionId: string, blockId: string, newText: string) => {
    if (!document) return;
    const updatedSections = document.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      const content = sec.content.map((b) =>
        b.id === blockId
          ? { ...b, text: newText, isManuallyEdited: true, provenance: 'USER_EDITED' as const, layer: 'USER_POSITION' as const, trustLevel: 'VERIFIED' as const }
          : b
      );
      return { ...sec, content, isManuallyEdited: true };
    });
    const updatedDoc: UniversalLegalDocument = {
      ...document,
      sections: updatedSections,
      updatedAt: new Date().toISOString(),
    };
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), updatedDoc]);
    setHistoryIndex((i) => i + 1);
    onUpdateDocument(updatedDoc);
    setEditingBlock(null);
  };

  const handleSaveTitle = () => {
    if (document && docTitle.trim()) {
      onUpdateDocument({ ...document, title: docTitle.trim(), updatedAt: new Date().toISOString() });
    }
    setIsEditingTitle(false);
  };

  const handleSave = async () => {
    if (!onSaveDraft) return;
    setSaveState('saving');
    const ok = await onSaveDraft();
    setSaveState(ok ? 'saved' : 'idle');
    if (ok) window.setTimeout(() => setSaveState('idle'), 3000);
  };

  const handleReopen = async () => {
    if (!onReopenDraft || reopenState === 'loading') return;
    setReopenState('loading');
    try {
      await onReopenDraft();
    } finally {
      setReopenState('idle');
    }
  };

  const handleSaveMachoteTemplate = async () => {
    if (!document || !onSaveAsTemplate) return;
    setIsTemplateSaving(true);
    try {
      await onSaveAsTemplate(document);
    } finally {
      setIsTemplateSaving(false);
    }
  };

  const runSectionAction = (action: SectionAction, section: DocumentNode) => {
    if (!onRegenerateSection) return;
    const title = section.title;
    const instructions: Record<SectionAction, string> = {
      regenerate: `Regenera por completo el apartado "${title}" con fundamentación legal y antecedentes pertinentes.`,
      expand: `Amplía y desarrolla con mayor profundidad el apartado "${title}", agregando precedentes y doctrina.`,
      reduce: `Sintetiza el apartado "${title}" conservando los argumentos esenciales.`,
      reformulate: `Reformula el apartado "${title}" manteniendo el rigor jurídico.`,
    };
    void onRegenerateSection(section.id, instructions[action]);
  };

  // Variable and search highlight renderer
  const renderFormattedText = (text: string, blockStyle?: BlockStyle) => {
    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
      return parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="bg-[#ffe4a0] text-slate-900 px-0.5 rounded-xs font-bold">
            {part}
          </mark>
        ) : (
          renderVariables(part, i, blockStyle)
        )
      );
    }
    return renderVariables(text, 0, blockStyle);
  };

  const renderVariables = (text: string, baseKey: number, blockStyle?: BlockStyle) => {
    const displayText = normalizeUnresolvedFieldMarkers(text);
    const varRegex = /(\[(?:(?:DATO\s*PENDIENTE|DATOPENDIENTE|DATO\s+ANONIMIZADO|DATOANONIMIZADO)[^\]]+|[A-ZÁÉÍÓÚÑ0-9_\-\s]{2,40})\])/gi;
    const parts = displayText.split(varRegex);

    return parts.map((part, idx) => {
      if (part.startsWith('[') && part.endsWith(']')) {
        return (
          <span
            key={`var-${baseKey}-${idx}`}
            style={{
              fontFamily: 'inherit',
              fontWeight: blockStyle?.fontWeight || 'bold',
              fontSize: 'inherit',
            }}
            className="bg-amber-100/90 text-amber-950 border-b border-amber-500 px-0.5"
            title="Campo variable de plantilla"
          >
            {part}
          </span>
        );
      }
      // Markdown inline de la IA (**negrita**) se renderiza como tal en el visor,
      // igual que lo hará la exportación DOCX.
      if (part.includes('**')) {
        const mdParts = part.split(/\*\*(.+?)\*\*/g);
        return mdParts.map((seg, j) =>
          seg ? (
            j % 2 === 1 ? (
              <strong key={`md-${baseKey}-${idx}-${j}`}>{seg}</strong>
            ) : (
              <span key={`md-${baseKey}-${idx}-${j}`}>{seg}</span>
            )
          ) : null
        );
      }
      return part;
    });
  };

  // Tipografía para lienzo de documento
  const documentFontFamily = document?.defaultFontFamily || 'Times New Roman, Times, "Liberation Serif", serif';

  // Página única activa
  const activePageData = pageBreakdown.find((p) => p.pageNumber === viewPage) || pageBreakdown[0];

  /* ──────────────────────────────────────────────────────────────────────────
     ESTADO EN GENERACIÓN (Pipeline activo)
  ────────────────────────────────────────────────────────────────────────── */
  if (isGenerating && !document) {
    return (
      <main className="flex-1 min-w-0 bg-[#ede8dd] overflow-y-auto flex flex-col h-full select-none font-sans">
        <div className="p-3.5 border-b border-[#ded8c9] bg-[#fbf9f5] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-[#0B2545] border-t-transparent animate-spin" />
            <h2 className="text-[13px] font-extrabold text-[#0B2545]">Redactando Documento Jurídico...</h2>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-[#ded8c9] shadow-2xl p-8 space-y-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#0B2545] text-2xl flex items-center justify-center mx-auto animate-pulse">
              ⚖️
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-extrabold text-[#0B2545]">
                {pipelineStageLabel || 'Analizando machote y redactando versión adaptada...'}
              </h3>
              <p className="text-xs text-slate-500">
                Conservando estructura original, membretes, sellos y jerarquía de apartados.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 min-w-0 bg-[#ede8dd] flex flex-col h-full select-none relative font-sans overflow-hidden">
      {/* ── BARRA SUPERIOR CONSOLIDADA POR ZONAS (sin posicionamiento absoluto):
             A Identificación · B Edición global · C Formato · D Navegación ·
             E Vista · F Documento · G IA/Calidad/Exportación · Volver ── */}
      <div data-testid="editor-toolbar" className="sticky top-0 z-40 shrink-0 bg-[#fbf9f5] border-b border-[#ded8c9] px-3 py-2 shadow-xs font-sans">
        <div data-testid="editor-toolbar-row-primary" className="flex min-w-max flex-nowrap items-center gap-x-2 overflow-x-auto pb-1">
        {/* ── ZONA A · IDENTIFICACIÓN (título truncable, nunca empuja botones) ── */}
        <div className="flex items-center gap-1.5 min-w-[140px] max-w-[240px] xl:max-w-[340px] min-w-0 grow shrink basis-[160px]">
          {document ? (
            <div className="flex items-center gap-1 min-w-0 w-full">
              {isEditingTitle ? (
                <>
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                    className="min-w-0 flex-1 px-2 py-1 bg-white border-2 border-[#0B2545] rounded-lg text-xs font-bold text-slate-900 focus:outline-none font-sans"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveTitle}
                    className="p-1 rounded bg-[#0B2545] text-white text-xs font-bold font-sans shrink-0"
                  >
                    ✓
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { if (!editLocked) setIsEditingTitle(true); }}
                  disabled={editLocked}
                  title={editLocked ? 'Bloqueado: habilita la edición para renombrar' : 'Clic para renombrar documento'}
                  className="flex items-center gap-1 min-w-0 text-xs font-extrabold text-[#0B2545] hover:bg-slate-100 px-2 py-1 rounded-lg text-left font-sans disabled:hover:bg-transparent disabled:cursor-default"
                >
                  <span className="truncate whitespace-nowrap">{docTitle || document.title}</span>
                  {!editLocked && <span className="text-[10px] text-slate-400 shrink-0">✏️</span>}
                </button>
              )}
            </div>
          ) : (
            <span className="text-xs font-extrabold text-slate-500 font-sans truncate">Hoja en Blanco</span>
          )}
        </div>

        {/* ── ZONA B · EDICIÓN GLOBAL (único control del documento completo) ── */}
        <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
          <button
            onClick={() => { setEditLocked((v) => !v); setEditingBlock(null); }}
            title={editLocked ? 'Habilitar la edición del documento completo' : 'Volver a modo lectura'}
            className={`py-1.5 px-3 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 shadow-xs ${
              editLocked
                ? 'bg-white text-[#0B2545] border-[#ded8c9] hover:bg-[#ede8dd]'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
            }`}
          >
            <span>{editLocked ? '🔒' : '✎'}</span>
            <span>{editLocked ? 'Editar contestación' : 'Bloquear edición'}</span>
          </button>
          {!editLocked && history.length > 1 && (
            <button
              onClick={() => {
                const original = history[0];
                setHistory([original]);
                setHistoryIndex(0);
                onUpdateDocument(original);
              }}
              title="Descartar todos los cambios de esta sesión de edición"
              className="py-1.5 px-2.5 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-red-600 text-xs font-bold shadow-xs transition"
            >
              ↩ Descartar
            </button>
          )}
          {/* Deshacer / Rehacer */}
          {document && !editLocked && (
            <div className="hidden sm:flex items-center gap-1">
              <button
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                title="Deshacer"
                className="w-7 h-7 bg-white hover:bg-slate-50 disabled:opacity-30 rounded-lg border border-[#ded8c9] flex items-center justify-center text-xs font-bold text-slate-700 shadow-xs"
              >
                ↩
              </button>
              <button
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                title="Rehacer"
                className="w-7 h-7 bg-white hover:bg-slate-50 disabled:opacity-30 rounded-lg border border-[#ded8c9] flex items-center justify-center text-xs font-bold text-slate-700 shadow-xs"
              >
                ↪
              </button>
            </div>
          )}
          <span
            className={`hidden lg:inline-flex items-center text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              editLocked ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'
            }`}
            title={editLocked ? 'Modo lectura: selección y copia permitidas' : 'Modo edición: el documento completo es editable'}
          >
            {editLocked ? '🔒 Bloqueado' : '🟢 Habilitado'}
          </span>
        </div>

        {/* ── ZONA C · FORMATO (secundarias; etiquetas completas ≥xl) ── */}
        {document && (
          <div className="hidden md:flex items-center gap-1.5 shrink-0 whitespace-nowrap pl-2 border-l border-[#ded8c9]">
            <button
              onClick={onFormatDocument}
              disabled={!onFormatDocument || isFormatting || isGenerating}
              className="py-1.5 px-2.5 bg-[#0B2545] hover:bg-[#081d39] disabled:opacity-50 rounded-lg text-xs font-bold text-white transition whitespace-nowrap"
              title="Analizar estructura y aplicar formato jurídico"
            >
              {isFormatting ? 'Formateando…' : 'Formatear'}
            </button>
            {(['reformulate', 'expand', 'reduce'] as SectionAction[]).map((action) => {
              const info = SECTION_ACTION_LABELS[action];
              const disabled = !activeSection || isGenerating || (!onRegenerateSection && !onRefineActive);
              const mode = action === 'reformulate' ? 'reformular' : action === 'expand' ? 'ampliar' : 'reducir';
              const fire = () => {
                if (onRefineActive) { onRefineActive(mode); return; }
                if (activeSection) runSectionAction(action, activeSection);
              };
              return (
                <button
                  key={action}
                  onClick={fire}
                  disabled={disabled}
                  title={`${info.label} el apartado activo`}
                  className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg text-xs font-bold text-slate-700 transition whitespace-nowrap flex items-center gap-1"
                >
                  <span>{info.icon}</span>
                  <span className="hidden xl:inline">{info.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── ZONA D · NAVEGACIÓN ── */}

        {/* ── ZONA D · NAVEGACIÓN (Páginas · paginado · zoom · búsqueda) ── */}
        {document && (
          <div className="flex items-center gap-2 text-xs text-slate-700 font-sans shrink-0 whitespace-nowrap pl-2 border-l border-[#ded8c9]">
            {/* Panel de miniaturas */}
            <button
              onClick={() => setShowPagesPanel(!showPagesPanel)}
              title={showPagesPanel ? 'Ocultar panel de páginas' : 'Mostrar panel de páginas'}
              className={`py-1.5 px-2.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 shadow-xs ${
                showPagesPanel
                  ? 'bg-[#0B2545] text-white border-[#0B2545]'
                  : 'bg-white text-slate-700 border-[#ded8c9] hover:bg-[#ede8dd]'
              }`}
            >
              <span>☰</span>
              <span className="hidden xl:inline">Páginas</span>
            </button>

            {/* Control Paginado Central */}
            <div className="flex items-center gap-1.5 bg-white border border-[#ded8c9] px-2.5 py-1 rounded-xl shadow-xs">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={viewPage === 1}
                className="w-6 h-6 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none rounded flex items-center justify-center font-bold text-sm text-[#0B2545] transition"
                title="Página anterior (Flecha izquierda ←)"
              >
                ←
              </button>

              <span className="inline-block min-w-[9rem] text-center font-semibold text-slate-700 px-2 font-mono text-xs tabular-nums select-none">
                Pág. <span className="text-[#0B2545] font-extrabold text-sm">{viewPage}</span> / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={viewPage === totalPages}
                className="w-6 h-6 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none rounded flex items-center justify-center font-bold text-sm text-[#0B2545] transition"
                title="Página siguiente (Flecha derecha →)"
              >
                →
              </button>
            </div>

            {/* Zoom Global Estable */}
            <div className="hidden md:flex items-center gap-1 pl-2 border-l border-[#ded8c9]">
              <button
                onClick={() => { setZoomLevel((z) => Math.max(50, z - 10)); setZoomMode('custom'); }}
                className="w-6 h-6 bg-white border border-[#ded8c9] hover:bg-slate-50 rounded-md font-bold text-xs"
                title="Alejar (-10%)"
              >
                −
              </button>
              <select
                value={zoomMode === 'custom' ? String(zoomLevel) : zoomMode}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'fit-width') handleFitWidth();
                  else if (val === 'fit-page') handleFitPage();
                  else {
                    setZoomLevel(Number(val));
                    setZoomMode('custom');
                  }
                }}
                className="bg-white border border-[#ded8c9] rounded-md px-1.5 py-0.5 text-[11px] font-mono font-bold text-[#0B2545] focus:outline-none"
                title="Seleccionar nivel de zoom"
              >
                <option value="fit-page">Ajustar pág.</option>
                <option value="fit-width">Ajustar ancho</option>
                <option value="75">75%</option>
                <option value="100">100%</option>
                <option value="125">125%</option>
                <option value="150">150%</option>
              </select>
              <button
                onClick={() => { setZoomLevel((z) => Math.min(160, z + 10)); setZoomMode('custom'); }}
                className="w-6 h-6 bg-white border border-[#ded8c9] hover:bg-slate-50 rounded-md font-bold text-xs"
                title="Acercar (+10%)"
              >
                +
              </button>
            </div>

            {/* Búsqueda en documento */}
            <div className="relative hidden lg:block">
              <input
                type="text"
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearchQuery(v);
                  setActiveMatch(0);
                  // Mismo salto que hacía el efecto original al cambiar la query.
                  const first = computeSearchMatches(v, pageBreakdown)[0];
                  if (first) setCurrentPage(first.page);
                }}
                className="w-32 bg-white border border-[#ded8c9] rounded-xl pl-2.5 pr-14 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0B2545] font-sans"
              />
              {searchMatches.length > 0 && (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center text-[10px]">
                  <span className="text-[#0B2545] font-bold bg-blue-50 px-1 rounded mr-1">
                    {safeActiveMatch + 1}/{searchMatches.length}
                  </span>
                  <button onClick={() => goToNextMatch(-1)} className="text-slate-500 hover:text-slate-900 px-0.5">↑</button>
                  <button onClick={() => goToNextMatch(1)} className="text-slate-500 hover:text-slate-900 px-0.5">↓</button>
                </div>
              )}
            </div>
          </div>
        )}

        </div>

        {/* ── FILA 2 · DOCUMENTO + IA/CALIDAD/EXPORTACIÓN (+ Volver) ── */}
        <div data-testid="editor-toolbar-row-secondary" className="flex min-w-max flex-nowrap items-center gap-1.5 overflow-x-auto pt-1 font-sans whitespace-nowrap">
          {/* Botón Subir Machote */}
          <button
            onClick={onTriggerUpload}
            className="py-1.5 px-3 rounded-xl bg-white border border-[#ded8c9] hover:bg-[#ede8dd] text-[#0B2545] text-xs font-bold shadow-xs transition flex items-center gap-1"
            title="Subir documento real PDF o DOCX"
          >
            <span>📥</span>
            <span>Subir Machote</span>
          </button>

          {document && (
            <>
              {/* Botón Guardar Borrador + estado de autoguardado */}
              {onReopenDraft && (
                <button
                  onClick={handleReopen}
                  disabled={reopenState === 'loading'}
                  className="py-1.5 px-3 rounded-xl bg-white border border-[#ded8c9] hover:bg-[#ede8dd] text-[#0B2545] text-xs font-bold shadow-xs transition flex items-center gap-1"
                  title="Reabrir el último borrador guardado"
                >
                  <span>↩</span>
                  <span>{reopenState === 'loading' ? 'Abriendo...' : 'Reabrir guardado'}</span>
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saveState === 'saving' || !onSaveDraft}
                className="py-1.5 px-3 rounded-xl bg-white border border-[#ded8c9] hover:bg-[#ede8dd] text-[#0B2545] text-xs font-bold shadow-xs transition flex items-center gap-1"
              >
                <span>💾</span>
                <span>{saveState === 'saving' ? 'Guardando...' : saveState === 'saved' ? '✓ Guardado' : 'Guardar'}</span>
              </button>
              {autosaveState !== 'idle' && (
                <span className="text-[10px] font-semibold text-slate-400 whitespace-nowrap" title="Autoguardado del borrador">
                  {autosaveState === 'saving' ? 'Guardando…' : '✓ Auto'}
                </span>
              )}

              {/* Botón Usar como Machote / Guardar Plantilla */}
              {onSaveAsTemplate && (
                <button
                  onClick={handleSaveMachoteTemplate}
                  disabled={isTemplateSaving}
                  className="py-1.5 px-3 rounded-xl bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 text-xs font-bold shadow-xs transition flex items-center gap-1"
                  title="Guardar este archivo como plantilla reutilizable"
                >
                  <span>📋</span>
                  <span>{isTemplateSaving ? 'Guardando...' : 'Usar como Machote'}</span>
                </button>
              )}

              {/* Botón Generar a partir del Machote */}
              {onGenerateFromMachote && (
                <button
                  onClick={() => onGenerateFromMachote(document)}
                  className="py-1.5 px-3.5 rounded-xl bg-[#0B2545] hover:bg-[#081d39] text-white text-xs font-extrabold shadow-sm transition flex items-center gap-1.5"
                  title="Redactar un nuevo escrito basado en la estructura de este machote"
                >
                  <span>⚡</span>
                  <span>Generar con Machote</span>
                </button>
              )}

              {/* Revisión de Calidad (Quality Gate) */}
              <button
                onClick={() => setShowReviewModal(true)}
                disabled={!qualityGate}
                className="py-1.5 px-3 rounded-xl bg-white border border-[#ded8c9] hover:bg-[#ede8dd] disabled:opacity-40 text-[#0B2545] text-xs font-bold shadow-xs transition flex items-center gap-1"
                title="Revisión de calidad jurídica del documento"
              >
                <span>🛡️</span>
                <span className="hidden md:inline">Calidad</span>
                {qualityGate && (
                  <span className={`text-[9px] font-extrabold px-1 rounded ${qualityGate.canMarkAsFinal ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'}`}>
                    {qualityGate.qualityScore}
                  </span>
                )}
              </button>

              {/* Estado del ciclo de vida y Promover a Listo */}
              {isReadyToExport ? (
                <span className="py-1.5 px-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold shadow-xs flex items-center gap-1.5" title="Documento revisado y listo para exportación">
                  <span>🟢</span>
                  <span>Listo para exportar</span>
                </span>
              ) : pendingCount > 0 ? (
                <button
                  onClick={() => setShowPendingModal(true)}
                  className="py-1.5 px-3 rounded-xl bg-amber-50 border border-amber-300 hover:bg-amber-100 text-amber-800 text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                  title="Ver aspectos pendientes antes de exportar"
                >
                  <span>⚠️</span>
                  <span>{pendingCount} pendiente{pendingCount > 1 ? 's' : ''}</span>
                </button>
              ) : (
                <button
                  onClick={handlePromoteToReady}
                  className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                  title="Finalizar revisión y autorizar exportación oficial"
                >
                  <span>✓</span>
                  <span>Finalizar revisión</span>
                </button>
              )}

              {/* Menú Exportar */}
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu((open) => !open)}
                  className="py-1.5 px-3 rounded-xl border text-xs font-bold shadow-xs transition flex items-center gap-1.5 bg-[#0B2545] hover:bg-[#081d39] text-white border-transparent"
                  title="Elegir exportación de borrador o final"
                >
                  <span>📄</span>
                  <span>Exportar</span>
                  <span className="text-[9px]">▼</span>
                </button>

                {showExportMenu && (
                  <div className="absolute right-0 top-9 w-64 bg-white border border-[#ded8c9] rounded-xl shadow-xl z-50 py-1.5 text-xs text-slate-800 font-semibold animate-in fade-in zoom-in-95">
                    <div className="px-3.5 pt-2 pb-1 text-[10px] uppercase tracking-wide text-amber-800">Exportar borrador</div>
                    {onExportDocx && (
                      <button
                        onClick={() => {
                          onExportDocx('DRAFT');
                          setShowExportMenu(false);
                        }}
                        disabled={!hasExportableContent}
                        className="w-full text-left px-3.5 py-2 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-slate-800"
                      >
                        <span>📄</span> DOCX borrador
                      </button>
                    )}
                    {onExportPdf && (
                      <button
                        onClick={() => {
                          onExportPdf('DRAFT');
                          setShowExportMenu(false);
                        }}
                        disabled={!hasExportableContent}
                        className="w-full text-left px-3.5 py-2 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-slate-800"
                      >
                        <span>🖨️</span> PDF borrador
                      </button>
                    )}
                    <div className="my-1 border-t border-slate-100" />
                    <div className="px-3.5 pt-1 pb-1 text-[10px] uppercase tracking-wide text-slate-600">Exportar final</div>
                    {isReadyToExport ? (
                      <>
                        {onExportDocx && (
                          <button
                            onClick={() => {
                              onExportDocx('FINAL');
                              setShowExportMenu(false);
                            }}
                            className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-800"
                          >
                            <span>📄</span> DOCX final
                          </button>
                        )}
                        {onExportPdf && (
                          <button
                            onClick={() => {
                              onExportPdf('FINAL');
                              setShowExportMenu(false);
                            }}
                            className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-800"
                          >
                            <span>🖨️</span> PDF final
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="px-3.5 py-2 text-[11px] leading-snug text-slate-500">
                        Disponible cuando se resuelvan los pendientes de revisión.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Volver al panel/formulario (navegación de contexto) */}
              {onBackToPanel && (
                <button
                  onClick={onBackToPanel}
                  className="py-1.5 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition whitespace-nowrap"
                  title={backLabel}
                >
                  {backLabel}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {document && (
        <div
          role="status"
          className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-[11px] font-extrabold tracking-wide text-amber-900"
        >
          BORRADOR PARA REVISIÓN DEL ABOGADO · {document.generationMetadata.aiProvider === 'local' ? 'GENERACIÓN LOCAL / REVISAR CON MAYOR CUIDADO' : 'REVISAR DATOS, FUNDAMENTOS Y PETITORIOS'}
        </div>
      )}

      {/* ── CUERPO PRINCIPAL DEL VISOR (Panel Retráctil + Lienzo Paginado Carta) ── */}
      <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">
        {/* Panel Lateral Retráctil de Miniaturas */}
        {document && (
          showPagesPanel ? (
            <aside className="w-[200px] shrink-0 bg-[#f7f4ec] border-r border-[#ded8c9] flex flex-col p-3 overflow-hidden select-none animate-in slide-in-from-left-2 duration-150 font-sans">
              <div className="flex items-center justify-between text-[11px] font-extrabold text-[#0B2545] pb-2 border-b border-[#e8e2d5] mb-2 px-1">
                <span className="tracking-wider uppercase">PÁGINAS ({totalPages})</span>
                <button
                  onClick={() => setShowPagesPanel(false)}
                  className="w-5 h-5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center text-sm font-bold"
                  title="Ocultar panel de páginas (‹)"
                >
                  ‹
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                  const isSelected = viewPage === pageNum;

                  return (
                    <button
                      key={`thumb-${pageNum}`}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-full text-left p-2.5 rounded-xl border transition flex flex-col items-center justify-center space-y-1 ${
                        isSelected
                          ? 'bg-white border-[#0B2545] ring-2 ring-[#0B2545]/30 shadow-sm'
                          : 'bg-white/80 border-[#ded8c9] hover:border-slate-400'
                      }`}
                    >
                      <div className="w-full h-16 bg-white border border-slate-200 rounded p-1.5 flex flex-col justify-between shadow-xs select-none">
                        <div className="flex items-center justify-between text-[9px] font-bold text-[#0B2545]">
                          <span>Pág. {pageNum}</span>
                          <span className="text-[7px] text-slate-400 uppercase">Carta</span>
                        </div>
                        <div className="space-y-0.5 opacity-40">
                          <div className="h-1 bg-slate-400 rounded w-full" />
                          <div className="h-1 bg-slate-300 rounded w-5/6" />
                          <div className="h-1 bg-slate-300 rounded w-4/6" />
                        </div>
                        <span className="text-[7px] text-slate-300 text-right font-mono">816×1056</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>
          ) : null
        )}

        {/* Lienzo Central: MUESTRA UNA SOLA HOJA VISIBLE A LA VEZ */}
        <div
          ref={pagesContainerRef}
          className="legal-document-canvas flex-1 overflow-auto p-6 md:p-8 flex flex-col items-center bg-[#ede8dd]"
        >
          {/* Si NO hay documento: Hoja en Blanco limpia */}
          {!document ? (
            <div
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
              className="transition-transform duration-150 py-4"
            >
              <div
                onClick={onTriggerUpload}
                className="w-[816px] min-h-[1056px] max-w-full bg-white rounded shadow-2xl border border-slate-200/90 p-14 md:p-16 flex flex-col justify-between cursor-pointer hover:border-slate-300 transition select-none group box-border overflow-hidden mx-auto"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 text-xs text-slate-300 font-mono">
                  <span>JURÍDICO RADAR · VISOR PAGINADO LEGAL</span>
                  <span>HOJA EN BLANCO</span>
                </div>

                <div className="text-center py-24 space-y-4 max-w-md mx-auto font-sans">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 text-slate-400 text-2xl flex items-center justify-center mx-auto border border-slate-200 shadow-inner group-hover:scale-105 transition">
                    📄
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-700">
                    Cargar Documento Oficial
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed font-sans">
                    Sube un documento real (PDF de 27 páginas o DOCX) para navegarlo hoja por hoja de forma paginada.
                  </p>
                  <div className="pt-2 flex items-center justify-center gap-3">
                    <span className="py-2 px-4 rounded-xl bg-[#0B2545] text-white text-xs font-bold shadow-md inline-flex items-center gap-1.5 font-sans">
                      <span>📥</span> Subir Archivo Real
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 flex items-center justify-between text-[11px] text-slate-300 font-mono">
                  <span>PÁGINA 1 DE 1</span>
                  <span>FORMATO CARTA (816 × 1056 PX)</span>
                </div>
              </div>
            </div>
          ) : (
            /* ── RENDER DE HOJA PAGINADA ÚNICA (UNA SOLA HOJA A LA VEZ: Pág. 1 / 27) ── */
            <div
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
              className="transition-transform duration-150 py-4"
            >
              <div
                key={`sheet-page-${viewPage}`}
                id={`page-sheet-${viewPage}`}
                style={{
                  fontFamily: documentFontFamily,
                  lineHeight: document.defaultLineHeight || '1.6',
                }}
                className="legal-document-sheet w-[816px] min-h-[1056px] max-w-full bg-white shadow-2xl p-12 md:p-16 text-slate-900 text-[13px] flex flex-col justify-between select-text relative overflow-hidden box-border mx-auto rounded-xs border border-slate-200/60"
              >
                {/* Encabezado de la página física */}
                <div className="legal-document-content space-y-6 w-full max-w-full overflow-hidden break-words">
                  {viewPage === 1 ? (
                    <div className="space-y-4 pb-4 border-b border-slate-200/80 w-full max-w-full">
                      {/* Membrete / Sello Superior Institucional */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pb-2">
                        <span className="font-bold tracking-wider">
                          {document.matter?.toUpperCase() || 'AMPARO'} · {document.documentTypeLabel?.toUpperCase() || 'DOCUMENTO JURÍDICO'}
                        </span>
                        <span>EXP: {document.caseRefs?.expediente || 'EN TRÁMITE'}</span>
                      </div>

                      {/* Título Centrado */}
                      <div className="text-center space-y-1">
                        <h1 className="text-base md:text-lg font-bold tracking-tight break-words text-slate-900 uppercase">
                          {document.documentTypeLabel || 'ESCRITO JURÍDICO'}
                        </h1>
                        <p className="text-xs font-semibold text-slate-600 break-words">
                          {document.title}
                        </p>
                      </div>

                      {/* Proemio / Autoridad */}
                      <div className="flex items-center justify-between text-xs text-slate-800 pt-2">
                        <span className="font-bold uppercase tracking-wider">C. JUEZ / H. TRIBUNAL</span>
                        <span className="text-slate-700">
                          {document.jurisdiction || '—'}, a {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Encabezado de continuación formal */
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono border-b border-slate-200/80 pb-2 w-full">
                      <span className="truncate max-w-sm">{document.title}</span>
                      <span>EXP: {document.caseRefs?.expediente || 'EN TRÁMITE'} · PG. {viewPage} DE {totalPages}</span>
                    </div>
                  )}

                  {/* Contenido de la página única activa */}
                  <div className="space-y-4 w-full max-w-full overflow-hidden break-words">
                    {activePageData?.sections?.map(({ section }) => {
                      const isManuallyEdited = section.isManuallyEdited || section.content.some((b) => b.isManuallyEdited);

                      return (
                        <section
                          key={section.id}
                          id={`sec-${section.id}`}
                          onClick={() => onSelectSection?.(section)}
                          className="group relative py-1 space-y-1.5 w-full max-w-full overflow-hidden break-words"
                        >
                          {/* Título del apartado */}
                          {!section.id.startsWith('sec-page-') && (
                            <div className="flex items-center justify-between border-b border-slate-100 pb-0.5">
                              <div className="flex items-center gap-2">
                                <h3
                                  style={{
                                    fontFamily: section.style?.fontFamily || 'inherit',
                                    fontWeight: section.style?.fontWeight || 'bold',
                                    fontSize: section.style?.fontSize || '13px',
                                    textAlign: section.style?.textAlign || 'left',
                                  }}
                                  className="text-slate-900 tracking-wide"
                                >
                                  {section.title}
                                </h3>
                                {isManuallyEdited && (
                                  <span className="font-sans px-1.5 py-0.2 text-[8px] font-extrabold uppercase rounded bg-amber-100 text-amber-800 border border-amber-300">
                                    Modificado
                                  </span>
                                )}
                              </div>

                              {/* Acciones IA por apartado — SOLO en modo edición global */}
                              {!editLocked && (
                                <div className="font-sans opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                                  {(Object.keys(SECTION_ACTION_LABELS) as SectionAction[]).map((action) => (
                                    <button
                                      key={action}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        runSectionAction(action, section);
                                      }}
                                      disabled={isGenerating || !onRegenerateSection}
                                      title={SECTION_ACTION_LABELS[action].label}
                                      className="px-2 py-0.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-[10px] font-bold rounded-lg shadow-xs disabled:opacity-40"
                                    >
                                      {SECTION_ACTION_LABELS[action].icon} {SECTION_ACTION_LABELS[action].label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Párrafos del documento */}
                          <div className="space-y-2.5 w-full max-w-full overflow-hidden break-words">
                            {section.content.map((block) => {
                              const isEditing = editingBlock?.blockId === block.id;

                              const blockInlineStyle: React.CSSProperties = {
                                fontFamily: block.style?.fontFamily || 'inherit',
                                fontSize: block.style?.fontSize || 'inherit',
                                fontWeight: block.style?.fontWeight || 'normal',
                                fontStyle: (block.style?.fontStyle as any) || 'normal',
                                textAlign: block.style?.textAlign || 'justify',
                                lineHeight: block.style?.lineHeight || 'inherit',
                                textTransform: (block.style?.textTransform as any) || 'none',
                                textDecoration: block.style?.textDecoration || 'none',
                                textIndent: block.style?.indent || '0',
                              };

                              return (
                                <div
                                  key={block.id}
                                  className="group/block relative p-0.5 rounded-xs transition hover:bg-slate-50/40 w-full max-w-full overflow-hidden break-words"
                                >
                                  {isEditing ? (
                                    <div className="relative font-sans w-full" data-block-editor>
                                      {/* Acciones flotantes: NO alteran el flujo ni la altura de la hoja */}
                                      <div className="absolute right-0 -top-7 z-10 flex justify-end gap-1.5">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingBlock(null);
                                          }}
                                          className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg shadow-xs"
                                        >
                                          Cancelar
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            updateBlock(section.id, block.id, editingBlock.text);
                                          }}
                                          className="px-3 py-1 bg-[#0B2545] text-white hover:bg-[#081d39] text-xs font-bold rounded-lg shadow-sm"
                                        >
                                          Guardar cambios
                                        </button>
                                      </div>
                                      {/* Editor in-place: mismas métricas tipográficas del bloque;
                                          crece con el contenido — la hoja nunca se comprime */}
                                      <textarea
                                        autoFocus
                                        defaultValue={editingBlock.text}
                                        style={{ ...blockInlineStyle }}
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
                                        onChange={(e) => {
                                          const value = e.currentTarget.value;
                                          setEditingBlock((current) => current ? { ...current, text: value } : current);
                                        }}
                                        className="w-full bg-transparent border border-[#0B2545] rounded-md px-1 py-0.5 text-slate-900 focus:outline-none focus:border-2 resize-none overflow-hidden"
                                      />
                                    </div>
                                  ) : (
                                    <div
                                      onMouseUp={() => {
                                        const sel = window.getSelection()?.toString().trim();
                                        if (sel && sel.length > 5 && onSelectTextHighlight) {
                                          onSelectTextHighlight(sel);
                                        }
                                      }}
                                      className="flex items-start justify-between gap-2 w-full max-w-full overflow-hidden"
                                    >
                                      <div
                                        style={blockInlineStyle}
                                        className="leading-relaxed text-slate-900 whitespace-pre-wrap break-words overflow-hidden flex-1 [overflow-wrap:anywhere]"
                                      >
                                        {renderFormattedText(block.text, block.style)}
                                      </div>
                                      {/* Lápiz de bloque — SOLO en modo edición global */}
                                      {!editLocked && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingBlock({ sectionId: section.id, blockId: block.id, text: block.text });
                                          }}
                                          className="font-sans opacity-0 group-hover/block:opacity-100 p-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 text-xs rounded shadow-xs shrink-0"
                                          title="Editar texto directamente"
                                        >
                                          ✏️
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>

                {/* Pie de Página Físico */}
                <div className="border-t border-slate-200 pt-4 flex items-center justify-between text-[11px] text-slate-500 font-sans w-full">
                  <span className="font-semibold text-slate-700 truncate max-w-md">
                    {viewPage === totalPages ? 'PROTESTO LO NECESARIO EN DERECHO' : document.caseRefs?.expediente || 'EXPEDIENTE EN TRÁMITE'}
                  </span>
                  <span className="font-mono shrink-0 font-bold text-[#0B2545]">
                    PÁGINA {viewPage} DE {totalPages}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Calidad / Quality Gate */}
      {showReviewModal && qualityGate && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[1001] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 text-xs font-sans animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-[#0B2545]">
                Revisión de Calidad Jurídica
              </h3>
              <button onClick={() => setShowReviewModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-sm">
                ✕
              </button>
            </div>

            <div className={`p-3 rounded-xl border font-bold flex items-center justify-between ${
              qualityGate.canMarkAsFinal
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}>
              <span>{qualityGate.canMarkAsFinal ? '✓ LISTO PARA FIRMA' : '⚠️ REQUIERE REVISIÓN'}</span>
              <span>Puntaje: {qualityGate.qualityScore}/100</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="block text-sm font-extrabold text-[#0B2545]">{qualityGate.metrics.wordCount.toLocaleString()}</span>
                <span className="text-slate-400 uppercase font-bold text-[9px]">Palabras</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="block text-sm font-extrabold text-[#0B2545]">{totalPages}</span>
                <span className="text-slate-400 uppercase font-bold text-[9px]">Páginas Carta</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowReviewModal(false)}
                className="py-1.5 px-4 rounded-xl bg-[#0B2545] text-white font-bold text-xs shadow-sm"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Aspectos Pendientes antes de Exportar */}
      {showPendingModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[1002] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 text-xs font-sans animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📋</span>
                <div>
                  <h3 className="text-sm font-extrabold text-[#0B2545]">
                    {pendingCount > 0 ? 'Documento en Revisión' : 'Listo para Finalizar'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Control de calidad jurídica previo a la exportación
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPendingModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-base p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-slate-600 leading-relaxed">
              {pendingCount > 0
                ? 'Este documento aún tiene detalles o campos pendientes. Para garantizar la integridad jurídica del escrito formal, revisa los siguientes puntos:'
                : 'El documento cumple con los requisitos para ser formalizado. Puedes marcarlo como listo para exportar en DOCX o PDF.'}
            </p>

            {pendingIssues.length > 0 ? (
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {pendingIssues.map((issue, idx) => (
                  <div
                    key={`issue-${idx}`}
                    className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-amber-900 flex items-start gap-2.5"
                  >
                    <span className="text-amber-700 font-bold shrink-0 mt-0.5">⚠️</span>
                    <div className="text-[11px] leading-snug">
                      {issue}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-2">
                <span className="text-emerald-700 font-bold text-base">✓</span>
                <span className="text-xs font-medium">Todos los campos y apartados requeridos han sido completados.</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowPendingModal(false)}
                className="py-2 px-4 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs transition"
              >
                Continuar editando
              </button>

              {pendingCount === 0 ? (
                <button
                  onClick={() => {
                    handlePromoteToReady();
                    setShowPendingModal(false);
                  }}
                  className="py-2 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition flex items-center gap-1.5"
                >
                  <span>✓</span>
                  <span>Marcar listo para exportar</span>
                </button>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
                  {onExportDocx && (
                    <button
                      onClick={() => {
                        onExportDocx('DRAFT');
                        setShowPendingModal(false);
                      }}
                      className="py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold text-xs transition flex items-center gap-1.5"
                        title="Exportar DOCX como borrador para revisión"
                    >
                      <span>📄</span>
                      <span>DOCX borrador</span>
                    </button>
                  )}
                  {onExportPdf && (
                    <button
                      onClick={() => {
                        onExportPdf('DRAFT');
                        setShowPendingModal(false);
                      }}
                      className="py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold text-xs transition flex items-center gap-1.5"
                        title="Exportar PDF como borrador para revisión"
                    >
                      <span>🖨️</span>
                      <span>PDF borrador</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
