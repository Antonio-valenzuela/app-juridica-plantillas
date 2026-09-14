'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { CaseDocument, UploadedSourceDocument } from '@/lib/legal-engine/types';
import { reconstructCaseAnalysis, CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { GenerationStatusBar } from './GenerationStatusBar';
import type { TemplateItem } from './TemplateLibraryManager';
import { LEGAL_CATALOG_REGISTRY, getCatalogDocument } from '@/lib/catalog/legalCatalog';
import {
  evaluateSourceOutputCompatibility,
  inferSourceOutputType,
} from '@/lib/legal-engine/sourceOutputCompatibility';
import { sourceDocumentMatter } from '@/lib/legal-engine/sourceDocumentTypes';

interface CaseDocumentsReaderProps {
  documents: CaseDocument[];
  sourceDocs?: UploadedSourceDocument[];
  selectedDocId?: string | null;
  onSelectDocument: (doc: CaseDocument) => void;
  onUploadNewDocument?: () => void;
  onGenerateResponse?: (request?: string | {
    userInstructions: string;
    selectedDocumentType: string;
    documentTypeLabel: string;
    referenceDocumentId?: string;
    referenceDocumentText?: string;
    generationMode?: 'automatic' | 'personal_template' | 'reference_document';
  }) => void;
  onOpenEditor?: () => void;
  isGenerating?: boolean;
  generationJob?: { total: number; completed: number; percentage: number; currentBlock: string | null; status: string; stage?: string; documentReadiness?: string | null } | null;
  customTemplates?: TemplateItem[];
}

export type ContestacionesStepStatus = 'COMPLETED' | 'ACTIVE' | 'PENDING' | 'BLOCKED';

export interface ContestacionesUiSignals {
  hasDocument: boolean;
  analysisAvailable: boolean;
  analysisRequiresReview: boolean;
  generationStatus?: string | null;
  readiness?: string | null;
}

export function deriveContestacionesSteps(signals: ContestacionesUiSignals) {
  const analysisStatus: ContestacionesStepStatus = !signals.hasDocument
    ? 'PENDING'
    : signals.analysisRequiresReview
      ? 'BLOCKED'
      : signals.analysisAvailable
        ? 'COMPLETED'
        : 'ACTIVE';

  const readiness = signals.readiness?.toUpperCase() || null;
  const generationStatus = signals.generationStatus?.toLowerCase() || null;
  const generationStatusValue: ContestacionesStepStatus = !signals.hasDocument || !signals.analysisAvailable
    ? 'PENDING'
    : readiness === 'BLOCKED' || readiness === 'INVALID'
      ? 'BLOCKED'
      : generationStatus === 'processing'
        ? 'ACTIVE'
        : generationStatus === 'completed'
          ? readiness === 'READY' ? 'COMPLETED' : 'ACTIVE'
          : 'ACTIVE';

  return [
    { id: 'upload' as const, status: signals.hasDocument ? 'COMPLETED' : 'ACTIVE' as ContestacionesStepStatus },
    { id: 'analysis' as const, status: analysisStatus },
    { id: 'generation' as const, status: generationStatusValue },
  ];
}

export function formatContestacionesReadiness(readiness?: string | null) {
  switch (readiness?.toUpperCase()) {
    case 'READY':
      return { label: 'Listo para generar', tone: 'success' as const };
    case 'REQUIRES_REVIEW':
      return { label: 'Requiere revisión', tone: 'warning' as const };
    case 'BLOCKED':
      return { label: 'Bloqueado', tone: 'danger' as const };
    case 'INVALID':
      return { label: 'Inválido', tone: 'danger' as const };
    case 'INCOMPLETE':
      return { label: 'Incompleto', tone: 'warning' as const };
    default:
      return { label: 'Pendiente de evaluación', tone: 'neutral' as const };
  }
}

const CONTESTACIONES_STEP_LABELS = {
  upload: 'Cargar documento',
  analysis: 'Revisar análisis',
  generation: 'Generar contestación',
} as const;

const CONTESTACIONES_STEP_STATE_LABELS: Record<ContestacionesStepStatus, string> = {
  COMPLETED: 'Completado',
  ACTIVE: 'En curso',
  PENDING: 'Pendiente',
  BLOCKED: 'Revisión requerida',
};

export const CONTESTACIONES_SECTION_ORDER = [
  'summary',
  'analysis',
  'configuration',
  'readiness',
  'action',
] as const;

function formatContestacionesFileSize(bytes?: number) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const RESPONSE_DOCUMENT_TYPES = [
  { value: 'contestacion_demanda_laboral', label: 'Contestación de Demanda Laboral' },
  { value: 'contestacion_demanda_civil', label: 'Contestación de Demanda Civil' },
  { value: 'contestacion_demanda_mercantil', label: 'Contestación de Demanda Mercantil' },
  { value: 'recurso_revision_amparo_directo', label: 'Recurso de Revisión en Amparo Directo' },
  { value: 'contestacion_revision_extraordinaria_amparo_directo', label: 'Contestación / Revisión extraordinaria de Amparo Directo' },
  { value: 'recurso_reclamacion', label: 'Recurso de Reclamación' },
  { value: 'incidente_procesal', label: 'Incidente Procesal / de Nulidad' },
] as const;


interface LawyerAportacion {
  id: string;
  titulo: string;
  detalle: string;
}

export function CaseDocumentsReader({
  documents,
  sourceDocs = [],
  selectedDocId,
  onSelectDocument,
  onUploadNewDocument,
  onGenerateResponse,
  onOpenEditor,
  isGenerating = false,
  generationJob = null,
  customTemplates = [],
}: CaseDocumentsReaderProps) {
  const selectedDoc = documents.find((d) => d.id === selectedDocId) || documents[0];
  const selectedSourceDoc = sourceDocs.find((source) => source.id === selectedDoc?.id) || sourceDocs[0];
  const [activePage, setActivePage] = useState(1);
  const [selectedFragment, setSelectedFragment] = useState<string | null>(null);
  const [selectedAnalysisPill, setSelectedAnalysisPill] = useState<string>('prestaciones');
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedResponseType, setSelectedResponseType] = useState<string>('contestacion_demanda_civil');
  const userHasManuallyChangedDocTypeRef = useRef(false);
  const [documentSearchQuery, setDocumentSearchQuery] = useState('');
  const [isComboboxOpen, setIsComboboxOpen] = useState(false);
  const [preparationMethod, setPreparationMethod] = useState<'new' | 'machote'>('new');
  const [selectedMachoteId, setSelectedMachoteId] = useState<string>('');
  const comboboxRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<'original' | 'structure'>('original');
  const [showSourcePanel, setShowSourcePanel] = useState(true);
  const storageKey = `contestaciones_ctx_${selectedDoc?.id || selectedDocId || 'sin-documento'}`;
  const [aportaciones, setAportaciones] = useState<LawyerAportacion[]>([]);
  const [apFormOpen, setApFormOpen] = useState(false);
  const [apEditId, setApEditId] = useState<string | null>(null);
  const [apTitulo, setApTitulo] = useState('');
  const [apDetalle, setApDetalle] = useState('');
  // Qué categorías del análisis del expediente se envían realmente a la IA.
  const [analysisConfig, setAnalysisConfig] = useState<Record<string, boolean>>({
    prestaciones: true,
    hechos: true,
    puntos: true,
    excepciones: true,
    defensas: true,
    pruebas: true,
    fundamentos: true,
  });

  // Hidratación desde sessionStorage al cambiar el documento activo.
  useEffect(() => {
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      try {
        const savedAp = sessionStorage.getItem(`${storageKey}_aportaciones`);
        if (!cancelled) setAportaciones(savedAp ? (JSON.parse(savedAp) as LawyerAportacion[]) : []);
        const savedCfg = sessionStorage.getItem(`${storageKey}_config`);
        if (!cancelled && savedCfg) {
          const parsed = JSON.parse(savedCfg) as Record<string, boolean>;
          setAnalysisConfig((prev) => ({ ...prev, ...parsed }));
        }
      } catch {
        // storage no disponible: se trabaja solo en memoria
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [storageKey]);

  const persistAportaciones = (list: LawyerAportacion[]) => {
    setAportaciones(list);
    try { sessionStorage.setItem(`${storageKey}_aportaciones`, JSON.stringify(list)); } catch {}
  };

  const startAddAportacion = () => {
    setApEditId(null);
    setApTitulo('');
    setApDetalle('');
    setApFormOpen(true);
  };

  const startEditAportacion = (a: LawyerAportacion) => {
    setApEditId(a.id);
    setApTitulo(a.titulo);
    setApDetalle(a.detalle);
    setApFormOpen(true);
  };

  const saveAportacion = () => {
    const t = apTitulo.trim();
    const d = apDetalle.trim();
    if (!t || !d) return;
    if (apEditId) {
      persistAportaciones(aportaciones.map((a) => (a.id === apEditId ? { ...a, titulo: t, detalle: d } : a)));
    } else {
      persistAportaciones([...aportaciones, { id: `apo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, titulo: t, detalle: d }]);
    }
    setApFormOpen(false);
    setApEditId(null);
    setApTitulo('');
    setApDetalle('');
  };

  const deleteAportacion = (id: string) => persistAportaciones(aportaciones.filter((a) => a.id !== id));

  const toggleAnalysisCategory = (id: string) =>
    setAnalysisConfig((prev) => {
      const next = { ...prev, [id]: prev[id] === false };
      try { sessionStorage.setItem(`${storageKey}_config`, JSON.stringify(next)); } catch {}
      return next;
    });

  const totalPages = selectedDoc?.pageCount || selectedDoc?.pages?.length || 1;
  const safeActivePage = Math.min(Math.max(1, activePage), totalPages);

  const activePageObj = useMemo(() => {
    if (!selectedDoc || !selectedDoc.pages || selectedDoc.pages.length === 0) return null;
    return selectedDoc.pages.find((p) => p.page === safeActivePage) || selectedDoc.pages[safeActivePage - 1];
  }, [selectedDoc, safeActivePage]);

  const activePageBlocks = useMemo(() => {
    return activePageObj?.blocks || [];
  }, [activePageObj]);

  // Reconstrucción del análisis del caso
  const caseAnalysis: CaseAnalysis = useMemo(() => {
    return reconstructCaseAnalysis(sourceDocs, selectedDoc?.name || '');
  }, [sourceDocs, selectedDoc]);

  // Contenido de la página actual
  const currentPageContent = useMemo(() => {
    if (!selectedDoc || !selectedDoc.pages || selectedDoc.pages.length === 0) {
      return 'No hay contenido disponible para esta foja.';
    }
    const pageObj = selectedDoc.pages.find((p) => p.page === activePage) || selectedDoc.pages[activePage - 1];
    return pageObj ? pageObj.text : 'Foja sin contenido.';
  }, [selectedDoc, activePage]);

  const paragraphs = useMemo(() => {
    return currentPageContent
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }, [currentPageContent]);

  const handleTextSelection = () => {
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length > 8) {
      setSelectedFragment(sel);
    }
  };

  const actor = caseAnalysis.parties?.actor || caseAnalysis.parties?.quejoso;
  const demandado = caseAnalysis.parties?.demandado || caseAnalysis.parties?.autoridadResponsable;
  const expediente =
    caseAnalysis.caseNumbers?.amparoDirecto ||
    caseAnalysis.caseNumbers?.principal ||
    caseAnalysis.caseNumbers?.expedienteOrigen;
  const juzgado = caseAnalysis.authorities?.[0];

  const analysisPills = [
    { id: 'prestaciones', label: 'Prestaciones reclamadas' },
    { id: 'hechos', label: 'Hechos relevantes' },
    { id: 'puntos', label: 'Puntos controvertidos' },
    { id: 'excepciones', label: 'Posibles excepciones' },
    { id: 'defensas', label: 'Defensas' },
    { id: 'pruebas', label: 'Pruebas necesarias' },
    { id: 'fundamentos', label: 'Fundamentos jurídicos' },
  ];

  /* ── Contenido real por categoría del análisis (fuente: caseAnalysis) ──── */
  const categoryContent = (id: string): string => {
    switch (id) {
      case 'prestaciones':
        return caseAnalysis.claims.join('\n');
      case 'hechos':
        return caseAnalysis.proceduralTimeline.map((e) => `${e.date ? `${e.date}: ` : ''}${e.event}`).join('\n');
      case 'puntos':
        return caseAnalysis.proceduralPosture.constitutionalIssues.map((i) => `${i.title}${i.parameter ? ` · ${i.parameter}` : ''}`).join('\n');
      case 'excepciones':
        return (caseAnalysis.caseTheory?.vulnerabilities || []).join('\n');
      case 'defensas':
        return caseAnalysis.argumentAxes.map((a) => `${a.title}: ${a.reasoning || a.rebuttal}`).join('\n');
      case 'pruebas':
        return caseAnalysis.evidence.map((e) => e.description).join('\n');
      case 'fundamentos':
        return caseAnalysis.citations.map((c) => `${c.rubro || ''} (Registro: ${c.registro || ''})`).join('\n');
      default:
        return '';
    }
  };

  // Categorías que REALMENTE se enviarán a la IA: activadas por el abogado Y con
  // contenido extraído. Si no hay contenido, no se promete análisis (honestidad UI).
  const activeCategoryPills = analysisPills.filter((p) => analysisConfig[p.id] !== false && categoryContent(p.id).trim().length > 0);

  /* ── Instrucción enriquecida que viaja al pipeline de contestación ─────── */
  const buildContestacionInstruction = (): string => {
    const parts: string[] = [];
    if (customPrompt.trim()) {
      parts.push(`INSTRUCCIONES DE DEFENSA DEL ABOGADO:\n${customPrompt.trim()}`);
    }
    if (activeCategoryPills.length > 0) {
      const sections = activeCategoryPills
        .map((p) => `- ${p.label}:\n${categoryContent(p.id).trim().slice(0, 900)}`)
        .join('\n');
      parts.push(`BASE DEL ANÁLISIS JURÍDICO DEL EXPEDIENTE (utilizar como contexto obligatorio de la contestación):\n${sections}`);
    }
    if (aportaciones.length > 0) {
      const list = aportaciones.map((a, i) => `${i + 1}. ${a.titulo}: ${a.detalle}`).join('\n');
      parts.push(`APORTACIONES DEL ABOGADO (considerar obligatoriamente al redactar la contestación):\n${list}`);
    }
    return parts.join('\n\n');
  };

  /* ── Catálogo e Inferencia de Tipo / Materia para Contestaciones ────────── */
  const catalogOptions = useMemo(() => {
    return LEGAL_CATALOG_REGISTRY.documents
      .filter((d) => d.implemented)
      .map((d) => ({
        value: d.id,
        label: d.label,
        areaId: d.areaId,
        description: d.description,
        isResponse: /contestaci[oó]n|recurso|incidente|excepci[oó]n|reconvenci[oó]n/i.test(d.label) || /contestacion|recurso|incidente|excepcion|reconvencion/i.test(d.id),
      }));
  }, []);

  const inferredSourceType = useMemo(() => {
    if (!sourceDocs || sourceDocs.length === 0) return null;
    return inferSourceOutputType(sourceDocs);
  }, [sourceDocs]);

  const inferredMatter = useMemo(() => {
    if (!inferredSourceType || inferredSourceType === 'DOCUMENTO_JURIDICO_NO_CLASIFICADO') return null;
    return sourceDocumentMatter(inferredSourceType);
  }, [inferredSourceType]);

  const suggestedDocType = useMemo(() => {
    if (inferredSourceType === 'SENTENCIA_AMPARO_DIRECTO') {
      return 'recurso_revision_amparo_directo';
    }
    if (inferredMatter === 'LABORAL' || inferredSourceType === 'DEMANDA_LABORAL') {
      return 'contestacion_demanda_laboral';
    }
    if (inferredMatter === 'MERCANTIL' || inferredSourceType === 'DEMANDA_MERCANTIL') {
      return 'contestacion_demanda_mercantil';
    }
    if (inferredMatter === 'FAMILIAR') {
      return 'contestacion_divorcio';
    }
    if (inferredMatter === 'ADMINISTRATIVO') {
      return 'contestacion_nulidad_administrativa';
    }
    if (inferredMatter === 'FISCAL') {
      return 'contestacion_nulidad_fiscal';
    }
    if (inferredMatter === 'AGRARIO') {
      return 'contestacion_demanda_agraria';
    }
    if (inferredMatter === 'AMPARO') {
      return 'recurso_revision_amparo_directo';
    }
    if (inferredMatter === 'CIVIL' || inferredSourceType === 'DEMANDA_CIVIL') {
      return 'contestacion_demanda_civil';
    }
    return 'contestacion_demanda_civil';
  }, [inferredSourceType, inferredMatter]);

  useEffect(() => {
    if (suggestedDocType && !userHasManuallyChangedDocTypeRef.current) {
      setSelectedResponseType(suggestedDocType);
    }
  }, [suggestedDocType]);

  const checkDocCompatibility = useCallback((docType: string): { compatible: boolean; reason?: string } => {
    if (!sourceDocs || sourceDocs.length === 0) {
      return { compatible: true };
    }
    try {
      evaluateSourceOutputCompatibility({
        selectedDocumentType: docType,
        sourceDocuments: sourceDocs,
      });
      return { compatible: true };
    } catch (err: any) {
      return {
        compatible: false,
        reason: err?.message || 'Este escrito pertenece a otra materia y no corresponde al expediente analizado.',
      };
    }
  }, [sourceDocs]);

  const currentDocCompatibility = useMemo(() => {
    return checkDocCompatibility(selectedResponseType);
  }, [checkDocCompatibility, selectedResponseType]);

  const filteredOptions = useMemo(() => {
    const q = documentSearchQuery.trim().toLowerCase();

    let list = catalogOptions;
    if (q) {
      list = catalogOptions.filter((opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q) ||
        opt.areaId.toLowerCase().includes(q) ||
        (opt.description && opt.description.toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => {
      const isSuggestedA = a.value === suggestedDocType ? 1 : 0;
      const isSuggestedB = b.value === suggestedDocType ? 1 : 0;
      if (isSuggestedA !== isSuggestedB) return isSuggestedB - isSuggestedA;

      const compatA = checkDocCompatibility(a.value).compatible ? 1 : 0;
      const compatB = checkDocCompatibility(b.value).compatible ? 1 : 0;
      if (compatA !== compatB) return compatB - compatA;

      const respA = a.isResponse ? 1 : 0;
      const respB = b.isResponse ? 1 : 0;
      if (respA !== respB) return respB - respA;

      return a.label.localeCompare(b.label);
    });
  }, [catalogOptions, documentSearchQuery, suggestedDocType, checkDocCompatibility]);

  const selectedDocOption = useMemo(() => {
    return catalogOptions.find((opt) => opt.value === selectedResponseType) || {
      value: selectedResponseType,
      label: selectedResponseType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      areaId: '',
      description: '',
      isResponse: true,
    };
  }, [catalogOptions, selectedResponseType]);

  const isContestacion = useMemo(() => {
    return /contestaci[oó]n/i.test(selectedDocOption.label) || /contestacion/i.test(selectedResponseType);
  }, [selectedDocOption, selectedResponseType]);

  const suggestedDocOption = useMemo(() => {
    return catalogOptions.find((opt) => opt.value === suggestedDocType) || null;
  }, [catalogOptions, suggestedDocType]);

  const selectedCatalogDoc = useMemo(() => {
    return getCatalogDocument(selectedResponseType);
  }, [selectedResponseType]);

  const selectedAreaId = selectedCatalogDoc && selectedCatalogDoc.kind === 'DOCUMENT_TYPE'
    ? selectedCatalogDoc.areaId.toLowerCase()
    : '';

  const compatibleMachotes = useMemo(() => {
    if (!customTemplates || customTemplates.length === 0) return [];
    return customTemplates.filter((tpl) => {
      if (tpl.documentType && tpl.documentType === selectedResponseType) return true;
      const tplMatter = (tpl.matterId || tpl.category || '').toLowerCase();
      if (!tplMatter || tplMatter === 'general') return true;
      if (selectedAreaId) {
        if (tplMatter.includes(selectedAreaId) || selectedAreaId.includes(tplMatter)) return true;
        if ((selectedAreaId.includes('amparo') || selectedAreaId.includes('constitucional')) &&
            (tplMatter.includes('amparo') || tplMatter.includes('constitucional'))) {
          return true;
        }
        return false;
      }
      return true;
    });
  }, [customTemplates, selectedResponseType, selectedAreaId]);

  const effectiveMachoteId = useMemo(() => {
    if (selectedMachoteId && compatibleMachotes.some((m) => m.id === selectedMachoteId)) {
      return selectedMachoteId;
    }
    return compatibleMachotes[0]?.id || '';
  }, [selectedMachoteId, compatibleMachotes]);

  const selectedMachote = useMemo(() => {
    return compatibleMachotes.find((m) => m.id === effectiveMachoteId) || compatibleMachotes[0] || null;
  }, [compatibleMachotes, effectiveMachoteId]);

  const analysisAvailable = Boolean(selectedDoc && sourceDocs.length > 0 && selectedDoc.status === 'READY');
  const conflictCount = caseAnalysis.richCaseAnalysis?.conflicts?.length || 0;
  const analysisRequiresReview = Boolean(
    selectedDoc?.status === 'NEEDS_MANUAL_REVIEW'
      || caseAnalysis.missingData.length > 0
      || conflictCount > 0,
  );
  const contestacionesSteps = deriveContestacionesSteps({
    hasDocument: Boolean(selectedDoc),
    analysisAvailable,
    analysisRequiresReview,
    generationStatus: generationJob?.status,
    readiness: generationJob?.documentReadiness,
  });
  const readinessSummary = formatContestacionesReadiness(generationJob?.documentReadiness);
  const readinessRows: Array<{ label: string; detail: string; status: ContestacionesStepStatus }> = [
    {
      label: 'Documento fuente',
      detail: selectedDoc ? 'Documento cargado' : 'Carga un documento para comenzar',
      status: selectedDoc ? 'COMPLETED' : 'PENDING',
    },
    {
      label: 'Análisis del expediente',
      detail: !selectedDoc
        ? 'Pendiente del documento fuente'
        : analysisRequiresReview
          ? 'Requiere revisión del abogado'
          : analysisAvailable
            ? 'Análisis disponible'
            : 'Pendiente de extracción',
      status: !selectedDoc ? 'PENDING' : analysisRequiresReview ? 'BLOCKED' : analysisAvailable ? 'COMPLETED' : 'ACTIVE',
    },
    ...(sourceDocs.length > 0 ? [{
      label: 'Información faltante',
      detail: caseAnalysis.missingData.length > 0
        ? `${caseAnalysis.missingData.length} dato(s) pendiente(s) de confirmar`
        : 'No se detectan datos faltantes en esta vista',
      status: caseAnalysis.missingData.length > 0 ? 'BLOCKED' as const : 'COMPLETED' as const,
    }] : []),
    ...(sourceDocs.length > 0 && caseAnalysis.richCaseAnalysis ? [{
      label: 'Conflictos del expediente',
      detail: conflictCount > 0 ? `${conflictCount} conflicto(s) requieren revisión` : 'Sin conflictos detectados',
      status: conflictCount > 0 ? 'BLOCKED' as const : 'COMPLETED' as const,
    }] : []),
    {
      label: 'Configuración',
      detail: selectedDocOption.label,
      status: 'COMPLETED',
    },
  ];
  const generationBlockReason = !selectedDoc
    ? 'Carga un documento fuente para habilitar la generación.'
    : !currentDocCompatibility.compatible
      ? currentDocCompatibility.reason || 'El tipo de escrito no corresponde al expediente.'
      : preparationMethod === 'machote' && compatibleMachotes.length === 0
        ? 'No hay un machote compatible; cambia a crear un escrito nuevo.'
        : null;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (comboboxRef.current && !comboboxRef.current.contains(event.target as Node)) {
        setIsComboboxOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="machotes-contestaciones-root flex flex-col h-full w-full bg-[#f4f7f9] font-sans select-none overflow-hidden text-slate-900">
      <style>{`
        .machotes-contestaciones-root {
          --primary-color: var(--mach-ink, var(--jr-primary, #0B2545));
          --primary-hover: var(--mach-accent-hover, var(--jr-primary-hover, #081d39));
          --bg-slate: var(--mach-bg-panel, var(--jr-bg, #f5f5f7));
          --border-slate: var(--mach-border, var(--jr-border-dark, #e2e8f0));
          --contestaciones-bg: var(--mach-bg-panel, var(--jr-bg, #f5f5f7));
          --contestaciones-surface: var(--mach-surface, var(--jr-surface, #ffffff));
          --contestaciones-primary: var(--mach-ink, var(--jr-primary, #0B2545));
          --contestaciones-accent: var(--mach-gold, #B58A5A);
          --contestaciones-muted: var(--mach-text-muted, var(--jr-text-secondary, #64748b));
          --contestaciones-radius: var(--mach-radius-card, var(--jr-radius-md, 14px));
          --contestaciones-shadow: var(--mach-shadow-card, var(--jr-shadow-sm, 0 2px 8px rgba(15, 23, 42, .04)));
          font-family: Inter, system-ui, -apple-system, sans-serif;
          background: var(--contestaciones-bg) !important;
        }
        .contestaciones-header {
          background: transparent;
          border-bottom: 0;
          padding: 22px 24px 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }
        .contestaciones-header-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .contestaciones-header-title {
          margin: 0;
          font-size: 32px;
          font-weight: 800;
          color: var(--contestaciones-primary);
          letter-spacing: -0.02em;
          line-height: 1.1;
        }
        .contestaciones-header-subtitle {
          margin: 5px 0 0;
          font-size: 14px;
          color: var(--contestaciones-muted);
          line-height: 1.45;
        }
        .contestaciones-grid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 20px;
          max-width: 1560px;
          width: 100%;
          margin: 0 auto;
          padding: 12px 24px 28px;
          align-items: start;
          flex: 1;
          overflow-y: auto;
        }
        .contestaciones-col-left {
          grid-column: span 8;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .contestaciones-col-right {
          grid-column: span 4;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .contestaciones-col-full {
          grid-column: span 12;
        }
        .contestaciones-context-stack {
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-width: 0;
        }
        .contestaciones-context-card {
          background: var(--contestaciones-surface);
          border: 1px solid var(--border-slate);
          border-radius: 16px;
          padding: 16px;
          box-shadow: var(--contestaciones-shadow);
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-width: 0;
        }
        .contestaciones-context-card > header,
        .contestaciones-context-card > .contestaciones-context-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding-bottom: 10px;
          border-bottom: 1px solid #edf1f5;
        }
        .contestaciones-context-heading h2,
        .contestaciones-context-card h2 {
          margin: 0;
          color: var(--contestaciones-primary);
          font-size: 14px;
          font-weight: 800;
          letter-spacing: -.01em;
        }
        .contestaciones-summary-card .contestaciones-table {
          padding: 0;
          background: transparent;
          border: 0;
        }
        .contestaciones-summary-card .contestaciones-table > div:first-child {
          gap: 12px !important;
          margin-bottom: 10px !important;
        }
        .contestaciones-summary-card .contestaciones-table > div:last-child {
          gap: 6px !important;
          padding-top: 10px !important;
        }
        .contestaciones-analysis-card .contestaciones-pills-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }
        .contestaciones-analysis-card .contestaciones-pill-btn {
          padding: 8px 10px;
          font-size: 11px;
          min-height: 40px;
        }
        .contestaciones-analysis-content {
          min-height: 0 !important;
          max-height: 176px;
          overflow-y: auto;
          padding: 12px !important;
          font-size: 11px !important;
        }
        .contestaciones-config-card {
          gap: 10px;
        }
        .contestaciones-config-card > .contestaciones-config-heading {
          display: block;
        }
        .contestaciones-config-card > .contestaciones-config-heading h2 {
          margin: 0;
        }
        .contestaciones-config-card > .contestaciones-config-heading p {
          margin: 3px 0 0;
          color: var(--contestaciones-muted);
          font-size: 11px;
          line-height: 1.4;
        }
        .contestaciones-config-methods {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 8px !important;
        }
        .contestaciones-config-methods > div {
          padding: 10px !important;
        }
        .contestaciones-config-instructions {
          border: 0 !important;
          border-top: 1px solid #edf1f5 !important;
          border-radius: 0 !important;
          padding: 12px 0 0 !important;
        }
        .contestaciones-checklist-card {
          padding: 0;
          overflow: hidden;
          gap: 0;
        }
        .contestaciones-checklist-card > summary {
          list-style: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 15px 16px;
          color: var(--contestaciones-primary);
          font-size: 13px;
          font-weight: 800;
        }
        .contestaciones-checklist-card > summary::-webkit-details-marker { display: none; }
        .contestaciones-checklist-card > summary::after { content: '+'; color: var(--contestaciones-muted); font-size: 18px; font-weight: 400; }
        .contestaciones-checklist-card[open] > summary { border-bottom: 1px solid #edf1f5; }
        .contestaciones-checklist-card[open] > summary::after { content: '−'; }
        .contestaciones-checklist-card > summary span { display: block; color: var(--contestaciones-muted); font-size: 10px; font-weight: 500; margin-top: 2px; }
        .contestaciones-checklist-body { padding: 0 16px 16px; }
        .contestaciones-action-card { gap: 10px; }
        @media (max-width: 1100px) {
          .contestaciones-col-left, .contestaciones-col-right {
            grid-column: span 12;
          }
        }
        .contestaciones-card {
          background: var(--contestaciones-surface);
          border: 1px solid var(--border-slate);
          border-radius: var(--contestaciones-radius);
          padding: 20px;
          box-shadow: var(--contestaciones-shadow);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .contestaciones-card-title {
          margin: 0;
          font-size: 14px;
          font-weight: 800;
          color: #0f172a;
        }
        .contestaciones-dropzone {
          border: 2px dashed #cbd5e1;
          border-radius: 12px;
          padding: 36px 16px;
          text-align: center;
          background: #f8fafc;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }
        .contestaciones-dropzone:hover {
          border-color: var(--primary-color);
          background: #f1f5f9;
        }
        .contestaciones-dropzone:focus-visible {
          outline: 3px solid rgba(0, 122, 255, 0.26);
          outline-offset: 3px;
          border-color: var(--primary-color);
        }
        .contestaciones-dropzone.is-dragging {
          border-color: var(--contestaciones-accent);
          background: #fffaf2;
          box-shadow: 0 0 0 4px rgba(181, 138, 90, .12);
        }
        .contestaciones-document-summary {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          padding: 12px 14px;
          border: 1px solid var(--border-slate);
          border-radius: 12px;
          background: #fbfcfd;
        }
        .contestaciones-document-summary-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .contestaciones-document-summary-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #0f172a;
          font-size: 13px;
          font-weight: 800;
        }
        .contestaciones-document-summary-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 12px;
          color: var(--contestaciones-muted);
          font-size: 11px;
        }
        .contestaciones-document-summary-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .contestaciones-section-kicker {
          color: var(--contestaciones-muted);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .doc-icon-container {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .doc-icon {
          padding: 3px 6px;
          border-radius: 6px;
          font-size: 9px;
          font-weight: 700;
          font-family: monospace;
          border: 1px solid;
        }
        .doc-icon.pdf { background: #fef2f2; color: #ef4444; border-color: #fca5a5; }
        .doc-icon.docx { background: #eff6ff; color: #3b82f6; border-color: #93c5fd; }
        .doc-icon.doc { background: #eff6ff; color: #2563eb; border-color: #93c5fd; }
        .doc-icon.txt { background: #f8fafc; color: #64748b; border-color: #cbd5e1; }
        .doc-icon.img { background: #ecfdf5; color: #10b981; border-color: #6ee7b7; }
        .contestaciones-upload-limit {
          color: var(--contestaciones-muted);
          font-size: 10px;
          line-height: 1.4;
          text-align: center;
        }

        .contestaciones-badge-green {
          background: #dcfce7;
          color: #15803d;
          border: 1px solid #bbf7d0;
          border-radius: 9999px;
          padding: 2px 10px;
          font-size: 11px;
          font-weight: 700;
        }
        .contestaciones-badge-amber {
          background: #fef3c7;
          color: #d97706;
          border: 1px solid #fde68a;
          border-radius: 9999px;
          padding: 2px 10px;
          font-size: 11px;
          font-weight: 700;
        }
        .contestaciones-table {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
        }
        .contestaciones-pills-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .contestaciones-pill-btn {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 12px;
          font-weight: 600;
          color: #334155;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s;
        }
        .contestaciones-pill-btn:hover {
          background: #f1f5f9;
        }
        .contestaciones-pill-btn.is-active {
          background: #0F172A;
          color: #ffffff;
          border-color: #0F172A;
        }
        .contestaciones-btn-primary {
          background: #0B2545;
          color: #ffffff;
          border: none;
          border-radius: 12px;
          padding: 12px 24px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s;
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
        }
        .contestaciones-btn-primary:hover {
          background: #081d39;
        }
        .contestaciones-btn-primary:focus-visible,
        .contestaciones-btn-outline:focus-visible,
        .contestaciones-pill-btn:focus-visible,
        .contestaciones-stepper button:focus-visible {
          outline: 3px solid rgba(0, 122, 255, .24);
          outline-offset: 2px;
        }
        .contestaciones-btn-outline {
          background: #ffffff;
          color: #334155;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 12px 24px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s;
          width: 100%;
          text-align: center;
        }
        .contestaciones-btn-outline:hover {
          background: #f8fafc;
        }
        .contestaciones-stepper {
          display: grid;
          grid-template-columns: 1fr auto 1fr auto 1fr;
          align-items: center;
          gap: 10px;
          margin: 18px 24px 0;
          padding: 12px 16px;
          border: 1px solid var(--border-slate);
          border-radius: 14px;
          background: rgba(255,255,255,.72);
          box-shadow: var(--contestaciones-shadow);
        }
        .contestaciones-step {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #64748b;
        }
        .contestaciones-step-index {
          width: 30px;
          height: 30px;
          flex: 0 0 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #cbd5e1;
          border-radius: 9999px;
          background: #ffffff;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
        }
        .contestaciones-step-copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .contestaciones-step-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #334155;
          font-size: 12px;
          font-weight: 800;
        }
        .contestaciones-step-state {
          color: #94a3b8;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .03em;
          text-transform: uppercase;
        }
        .contestaciones-step[data-status='COMPLETED'] .contestaciones-step-index {
          border-color: #bbf7d0;
          background: #ecfdf5;
          color: #15803d;
        }
        .contestaciones-step[data-status='COMPLETED'] .contestaciones-step-state { color: #15803d; }
        .contestaciones-step[data-status='ACTIVE'] .contestaciones-step-index {
          border-color: var(--contestaciones-primary);
          background: var(--contestaciones-primary);
          color: #ffffff;
          box-shadow: 0 0 0 4px rgba(11, 37, 69, .10);
        }
        .contestaciones-step[data-status='ACTIVE'] .contestaciones-step-label { color: var(--contestaciones-primary); }
        .contestaciones-step[data-status='ACTIVE'] .contestaciones-step-state { color: var(--contestaciones-primary); }
        .contestaciones-step[data-status='BLOCKED'] .contestaciones-step-index {
          border-color: #fecaca;
          background: #fef2f2;
          color: #b91c1c;
        }
        .contestaciones-step[data-status='BLOCKED'] .contestaciones-step-state { color: #b91c1c; }
        .contestaciones-step-line {
          height: 1px;
          min-width: 24px;
          background: #dbe2ea;
        }
        .contestaciones-readiness-panel {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 16px;
          border: 1px solid var(--border-slate);
          border-radius: 14px;
          background: #fbfcfd;
        }
        .contestaciones-readiness-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }
        .contestaciones-readiness-title {
          margin: 0;
          color: #0f172a;
          font-size: 14px;
          font-weight: 800;
        }
        .contestaciones-readiness-subtitle {
          margin: 3px 0 0;
          color: var(--contestaciones-muted);
          font-size: 11px;
          line-height: 1.45;
        }
        .contestaciones-readiness-badge {
          flex: 0 0 auto;
          border-radius: 9999px;
          padding: 5px 9px;
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
        }
        .contestaciones-readiness-badge.success { background: #ecfdf5; color: #166534; border: 1px solid #bbf7d0; }
        .contestaciones-readiness-badge.warning { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
        .contestaciones-readiness-badge.danger { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
        .contestaciones-readiness-badge.neutral { background: #f1f5f9; color: #475569; border: 1px solid #dbe2ea; }
        .contestaciones-readiness-list { display: flex; flex-direction: column; gap: 8px; }
        .contestaciones-readiness-row {
          display: grid;
          grid-template-columns: 20px minmax(0, 1fr);
          gap: 8px;
          align-items: start;
          color: #334155;
          font-size: 11px;
          line-height: 1.4;
        }
        .contestaciones-readiness-icon {
          width: 20px;
          height: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 900;
        }
        .contestaciones-readiness-row[data-status='COMPLETED'] .contestaciones-readiness-icon { background: #dcfce7; color: #15803d; }
        .contestaciones-readiness-row[data-status='ACTIVE'] .contestaciones-readiness-icon { background: #dbeafe; color: #1d4ed8; }
        .contestaciones-readiness-row[data-status='BLOCKED'] .contestaciones-readiness-icon { background: #fee2e2; color: #b91c1c; }
        .contestaciones-readiness-row[data-status='PENDING'] .contestaciones-readiness-icon { background: #f1f5f9; color: #64748b; }
        .contestaciones-readiness-row strong { display: block; color: #1e293b; font-weight: 800; }
        .contestaciones-readiness-row span:last-child { color: #64748b; }
        .contestaciones-action-reason {
          margin: -2px 0 0;
          color: #64748b;
          font-size: 11px;
          line-height: 1.45;
        }
        .contestaciones-action-reason.is-blocked { color: #991b1b; }
        .contestaciones-generation-status {
          border-radius: 12px;
          overflow: hidden;
        }
        .contestaciones-generate-button:disabled {
          background: #e2e8f0 !important;
          color: #64748b !important;
          box-shadow: none;
        }
        @media (max-width: 760px) {
          .contestaciones-header {
            flex-wrap: wrap;
            gap: 12px;
            padding: 14px 16px;
          }
          .contestaciones-header > div:first-child {
            min-width: 0;
            flex: 1 1 220px;
          }
          .contestaciones-header-actions {
            width: 100%;
            justify-content: stretch;
          }
          .contestaciones-header-actions > button {
            flex: 1 1 0;
            min-width: 0;
          }
          .contestaciones-header-title { font-size: 28px; }
          .contestaciones-stepper {
            grid-template-columns: 1fr;
            gap: 8px;
            margin: 14px 14px 0;
          }
          .contestaciones-step-line { display: none; }
          .contestaciones-step { padding: 2px 0; }
          .contestaciones-document-summary { grid-template-columns: 1fr; }
          .contestaciones-document-summary-actions { width: 100%; }
          .contestaciones-document-summary-actions > * { flex: 1; }
          .contestaciones-config-methods { grid-template-columns: 1fr !important; }
          .contestaciones-readiness-header { flex-direction: column; }
          .contestaciones-readiness-badge { align-self: flex-start; }
        }
      `}</style>

      {/* ── ENCABEZADO SUPERIOR ── */}
      <header className="contestaciones-header">
        <div>
          <h1 className="contestaciones-header-title">Contestaciones</h1>
          <p className="contestaciones-header-subtitle">
            Analiza la demanda original y construye la contestación jurídicamente estructurada.
          </p>
        </div>

        <div className="contestaciones-header-actions">
          <button
            type="button"
            onClick={() => setShowSourcePanel((prev) => !prev)}
            className="contestaciones-btn-outline"
            style={{ padding: '8px 16px', fontSize: '12px', width: 'auto' }}
          >
            <span>☰</span> {showSourcePanel ? 'Ocultar documento' : 'Mostrar documento'}
          </button>
          {onUploadNewDocument && (
            <button
              onClick={onUploadNewDocument}
              className="contestaciones-btn-primary"
              style={{ padding: '8px 16px', fontSize: '12px', width: 'auto' }}
            >
              <span>+</span> Nueva contestación
            </button>
          )}
        </div>
      </header>

      <nav className="contestaciones-stepper" aria-label="Progreso de la contestación">
        {contestacionesSteps.map((step, index) => (
          <React.Fragment key={step.id}>
            <div className="contestaciones-step" data-status={step.status}>
              <span className="contestaciones-step-index" aria-hidden="true">{index + 1}</span>
              <span className="contestaciones-step-copy">
                <span className="contestaciones-step-label">{CONTESTACIONES_STEP_LABELS[step.id]}</span>
                <span className="contestaciones-step-state">{CONTESTACIONES_STEP_STATE_LABELS[step.status]}</span>
              </span>
            </div>
            {index < contestacionesSteps.length - 1 && <span className="contestaciones-step-line" aria-hidden="true" />}
          </React.Fragment>
        ))}
      </nav>

      {/* ── CONTENIDO PRINCIPAL EN REJILLA ── */}
      <main className="contestaciones-grid">
        {/* COLUMNA IZQUIERDA: DOCUMENTO FUENTE */}
        {showSourcePanel && (
          <div className="contestaciones-col-left">
            <div className="contestaciones-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                <div>
                  <h2 className="contestaciones-card-title">1. Cargar documento</h2>
                  <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: '11px', lineHeight: 1.4 }}>
                    Sube la demanda original para analizar su contenido y extraer la información relevante.
                  </p>
                </div>
                {selectedDoc && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontFamily: 'monospace' }}>
                    <button
                      onClick={() => setActivePage((p) => Math.max(1, p - 1))}
                      disabled={activePage === 1}
                      style={{ padding: '2px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', background: '#f8fafc' }}
                    >
                      ←
                    </button>
                    <span style={{ fontWeight: 700, color: '#0B2545' }}>
                      Pág. {activePage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setActivePage((p) => Math.min(totalPages, p + 1))}
                      disabled={activePage === totalPages}
                      style={{ padding: '2px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', background: '#f8fafc' }}
                    >
                      →
                    </button>
                  </div>
                )}
              </div>

              {!selectedDoc ? (
                /* DROPZONE PARA SUBIR DOCUMENTOS */
                <div
                  onClick={onUploadNewDocument}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); onUploadNewDocument?.(); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onUploadNewDocument?.();
                    }
                  }}
                  className={`contestaciones-dropzone ${isDragging ? 'is-dragging' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label="Cargar documento fuente"
                >
                  <div style={{ position: 'relative', width: '52px', height: '66px', borderRadius: '8px', background: '#e8eef7', border: '1px solid #d4deec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', color: '#0B2545', margin: '0 auto' }}>
                    📄
                    <span style={{ position: 'absolute', right: '-7px', bottom: '-7px', width: '28px', height: '28px', borderRadius: '50%', background: '#1d73d5', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', fontWeight: 800, border: '3px solid #f8fafc' }}>
                      ↑
                    </span>
                  </div>
                  <strong style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0B2545' }}>
                    Arrastra y suelta tu documento aquí
                  </strong>
                  <span style={{ margin: '-4px 0 0', fontSize: '12px', color: '#64748b' }}>
                    o selecciona un archivo desde tu equipo
                  </span>
                  <div className="doc-icon-container" aria-label="Formatos admitidos">
                    <span className="doc-icon pdf">PDF</span>
                    <span className="doc-icon docx">DOCX</span>
                    <span className="doc-icon doc">DOC</span>
                    <span className="doc-icon img">JPG</span>
                    <span className="doc-icon img">PNG</span>
                    <span className="doc-icon txt">TXT</span>
                    <span className="doc-icon txt">RTF</span>
                  </div>
                  <span className="contestaciones-upload-limit">PDF · DOCX · DOC · JPG · PNG · TXT · RTF · hasta 15 MB</span>
                  <button
                    type="button"
                    className="contestaciones-btn-primary"
                    style={{ padding: '8px 18px', fontSize: '12px', width: 'auto' }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onUploadNewDocument?.();
                    }}
                  >
                    Seleccionar archivo
                  </button>
                </div>
              ) : (
                /* VISOR DE DOCUMENTO RENDERIZADO */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="contestaciones-document-summary">
                    <div className="contestaciones-document-summary-main">
                      <span className="contestaciones-section-kicker">Documento cargado</span>
                      <strong className="contestaciones-document-summary-name" title={selectedDoc.name}>{selectedDoc.name}</strong>
                      <div className="contestaciones-document-summary-meta">
                        <span>{(selectedDoc.type || selectedSourceDoc?.type || 'Documento').toUpperCase()}</span>
                        <span>{totalPages} página{totalPages === 1 ? '' : 's'}</span>
                        {formatContestacionesFileSize(selectedSourceDoc?.fileSizeBytes) && (
                          <span>{formatContestacionesFileSize(selectedSourceDoc?.fileSizeBytes)}</span>
                        )}
                        <span className={selectedDoc.status === 'READY' ? 'text-emerald-700' : 'text-amber-700'}>
                          {selectedDoc.status === 'READY' ? 'Extracción verificada' : 'Extracción pendiente de revisión'}
                        </span>
                      </div>
                    </div>
                    {onUploadNewDocument && (
                      <div className="contestaciones-document-summary-actions">
                        <button
                          type="button"
                          className="contestaciones-btn-outline"
                          style={{ width: 'auto', padding: '8px 12px', fontSize: '11px' }}
                          onClick={onUploadNewDocument}
                        >
                          Cambiar documento
                        </button>
                      </div>
                    )}
                  </div>
                  {selectedDoc.fileUrl && (selectedDoc.type?.toLowerCase().includes('pdf') || selectedDoc.name.toLowerCase().endsWith('.pdf')) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '6px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '11px' }}>
                      <span style={{ fontWeight: 700, color: '#475569' }}>Visualización:</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => setViewMode('original')}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: 'none',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: viewMode === 'original' ? '#0B2545' : 'transparent',
                            color: viewMode === 'original' ? '#ffffff' : '#475569',
                          }}
                        >
                          📄 Documento Original (PDF)
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode('structure')}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: 'none',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: viewMode === 'structure' ? '#0B2545' : 'transparent',
                            color: viewMode === 'structure' ? '#ffffff' : '#475569',
                          }}
                        >
                          📑 Estructura
                        </button>
                      </div>
                    </div>
                  )}

                  {viewMode === 'original' && selectedDoc.fileUrl && (selectedDoc.type?.toLowerCase().includes('pdf') || selectedDoc.name.toLowerCase().endsWith('.pdf')) ? (
                    <div style={{ background: '#f8fafc', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', minHeight: '420px' }}>
                      <object
                        data={`${selectedDoc.fileUrl}#page=${activePage}&toolbar=0&navpanes=0`}
                        type="application/pdf"
                        className="w-full h-[420px] rounded-xl"
                        style={{ width: '100%', height: '420px', border: '0' }}
                      >
                        <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
                          <p>Tu navegador no puede previsualizar este PDF directamente en línea.</p>
                          <a href={selectedDoc.fileUrl} target="_blank" rel="noreferrer" style={{ color: '#0B2545', fontWeight: 700, textDecoration: 'underline' }}>
                            [Abrir documento en nueva pestaña]
                          </a>
                        </div>
                      </object>
                    </div>
                  ) : (
                    <div
                      onMouseUp={handleTextSelection}
                      style={{ background: '#f1f5f9', borderRadius: '12px', padding: '16px', maxHeight: '420px', overflowY: 'auto' }}
                    >
                      <div
                        style={{
                          fontFamily: 'Georgia, serif',
                          lineHeight: '1.6',
                          background: '#ffffff',
                          padding: '30px',
                          borderRadius: '8px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                          fontSize: '13px',
                          color: '#1e293b',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '12px', fontFamily: 'sans-serif' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{selectedDoc.name}</span>
                          <span>FOJA {activePage} DE {totalPages}</span>
                        </div>

                        {activePageBlocks.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {activePageBlocks.map((block, bIdx) => {
                              if (block.type === 'Section-header' || block.type === 'header') {
                                return (
                                  <h3 key={block.id || bIdx} style={{ margin: '12px 0 4px', fontSize: '14px', fontWeight: 700, color: '#0f172a', fontFamily: 'sans-serif' }}>
                                    {block.text}
                                  </h3>
                                );
                              }
                              if (block.type === 'Table' && block.tableData) {
                                return (
                                  <div key={block.id || bIdx} style={{ margin: '10px 0', padding: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', overflowX: 'auto', fontFamily: 'sans-serif', fontSize: '11px' }}>
                                    {block.tableData.headers && (
                                      <div style={{ fontWeight: 700, borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', marginBottom: '4px', color: '#0B2545' }}>
                                        {block.tableData.headers.join(' | ')}
                                      </div>
                                    )}
                                    {block.tableData.rows?.map((row, rIdx) => (
                                      <div key={rIdx} style={{ padding: '3px 0', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>
                                        {row.join(' | ')}
                                      </div>
                                    ))}
                                  </div>
                                );
                              }
                              if (block.type === 'Metadata') {
                                return (
                                  <div key={block.id || bIdx} style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic', background: '#f8fafc', padding: '6px', borderRadius: '4px', margin: '4px 0', border: '1px solid #f1f5f9', fontFamily: 'sans-serif' }}>
                                    🔒 {block.text}
                                  </div>
                                );
                              }
                              return (
                                <p key={block.id || bIdx} style={{ margin: 0, textAlign: 'justify', textIndent: '20px' }}>
                                  {block.text}
                                </p>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {paragraphs.map((par, pIdx) => (
                              <p key={pIdx} style={{ margin: 0, textAlign: 'justify', textIndent: '20px' }}>
                                {par}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* DOCUMENTOS RECIENTES: sólo se muestra con datos reales */}
              {documents.length > 1 && <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Documentos recientes</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '144px', overflowY: 'auto' }}>
                  {documents.map((doc) => {
                      const isSel = doc.id === selectedDoc?.id;
                      const isPdf = doc.type?.toLowerCase().includes('pdf') || doc.name.toLowerCase().endsWith('.pdf');

                      return (
                        <button
                          key={doc.id}
                          onClick={() => {
                            onSelectDocument(doc);
                            setActivePage(1);
                          }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 12px',
                            borderRadius: '10px',
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            border: '1px solid',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            background: isSel ? '#eff6ff' : '#f8fafc',
                            borderColor: isSel ? '#bfdbfe' : '#e2e8f0',
                            color: isSel ? '#1e3a8a' : '#475569',
                            fontWeight: isSel ? 700 : 500,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span>{isPdf ? '📄' : '📝'}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                          </div>
                          <span style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>
                            {doc.pageCount} pág{doc.pageCount === 1 ? '' : 's'}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>}
            </div>
          </div>
        )}

        {/* COLUMNA DERECHA: ANÁLISIS Y ACCIONES */}
        <div className={showSourcePanel ? 'contestaciones-col-right' : 'contestaciones-col-full'}>
          <div className="contestaciones-context-stack">
            <section data-section="summary" className="contestaciones-context-card contestaciones-summary-card">
            <div className="contestaciones-context-heading">
              <h2>Resumen del expediente</h2>
              {selectedDoc && (
                <span className={selectedDoc.status === 'READY' ? 'contestaciones-badge-green' : 'contestaciones-badge-amber'}>
                  {selectedDoc.status === 'READY' ? 'Documento analizado ✓' : 'Revisión manual requerida'}
                </span>
              )}
            </div>

            {/* Metadatos Procesales */}
            <div className="contestaciones-table">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
                <div>
                  <span style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Partes</span>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                    <span style={{ color: '#64748b' }}>Actor:</span> {actor || '—'}
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
                    <span style={{ color: '#64748b' }}>Demandado:</span> {demandado || '—'}
                  </p>
                </div>
                <div>
                  <span style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Expediente</span>
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', color: '#0B2545' }}>
                    {expediente || 'No identificado'}
                  </p>
                </div>
              </div>

              {/* Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                  <span style={{ color: '#64748b', fontSize: '9px', fontWeight: 600, display: 'block' }}>Prestaciones detectadas</span>
                  <strong style={{ fontSize: '16px', color: '#0B2545', display: 'block', marginTop: '2px' }}>
                    {caseAnalysis.claims.length || 0}
                  </strong>
                </div>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                  <span style={{ color: '#64748b', fontSize: '9px', fontWeight: 600, display: 'block' }}>Hechos detectados</span>
                  <strong style={{ fontSize: '16px', color: '#0B2545', display: 'block', marginTop: '2px' }}>
                    {caseAnalysis.proceduralTimeline.length || 0}
                  </strong>
                </div>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                  <span style={{ color: '#64748b', fontSize: '9px', fontWeight: 600, display: 'block' }}>Autoridad</span>
                  <strong style={{ fontSize: '11px', color: '#0B2545', display: 'block', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {juzgado || 'Pendiente de revisión'}
                  </strong>
                </div>
              </div>
            </div>
            </section>

            {/* Análisis jurídico */}
            <section data-section="analysis" className="contestaciones-context-card contestaciones-analysis-card">
            <div className="contestaciones-context-heading">
              <div>
                <h2>Análisis de la demanda</h2>
                <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: '11px' }}>
                  Revisa los hallazgos disponibles antes de generar.
                </p>
              </div>
              <span className={selectedDoc?.status === 'READY' ? 'contestaciones-badge-green' : 'contestaciones-badge-amber'}>
                {selectedDoc?.status === 'READY' ? 'Completado' : 'Pendiente'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Análisis jurídico</span>
              <div className="contestaciones-pills-grid">
                {analysisPills.map((pill) => {
                  const isSelected = selectedAnalysisPill === pill.id;
                  return (
                    <button
                      key={pill.id}
                      onClick={() => setSelectedAnalysisPill(pill.id)}
                      className={`contestaciones-pill-btn ${isSelected ? 'is-active' : ''}`}
                    >
                      {pill.label}
                    </button>
                  );
                })}
                {/* 8ª celda del grid: Aportaciones del abogado (antes vacía) */}
                <button
                  onClick={() => setSelectedAnalysisPill('aportaciones')}
                  className={`contestaciones-pill-btn ${selectedAnalysisPill === 'aportaciones' ? 'is-active' : ''} flex items-center justify-between gap-2`}
                  title="Hechos, argumentos, defensas o instrucciones adicionales que la IA considerará"
                >
                  <span>Aportaciones del abogado</span>
                  {aportaciones.length > 0 && (
                    <span
                      style={{
                        background: selectedAnalysisPill === 'aportaciones' ? '#ffffff' : '#0B2545',
                        color: selectedAnalysisPill === 'aportaciones' ? '#0B2545' : '#ffffff',
                        borderRadius: '9999px',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '1px 7px',
                      }}
                    >
                      {aportaciones.length}
                    </span>
                  )}
                </button>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', fontSize: '12px', color: '#334155', minHeight: '100px' }}>
                <span style={{ color: '#0B2545', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
                  {selectedAnalysisPill === 'aportaciones'
                    ? 'Aportaciones del abogado'
                    : analysisPills.find(p => p.id === selectedAnalysisPill)?.label}
                </span>

                {/* ── GESTOR DE APORTACIONES DEL ABOGADO ── */}
                {selectedAnalysisPill === 'aportaciones' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: 1.5 }}>
                      Agrega hechos, argumentos, defensas, excepciones o instrucciones adicionales que quieras que la IA considere.
                    </p>

                    {!apFormOpen && (
                      <button
                        onClick={startAddAportacion}
                        className="w-full py-2 rounded-lg border border-dashed border-slate-300 hover:border-[#0B2545] text-[#0B2545] text-xs font-bold transition"
                        style={{ background: '#ffffff' }}
                      >
                        + Agregar
                      </button>
                    )}

                    {apFormOpen && (
                      <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#0B2545', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {apEditId ? 'Editar aportación' : 'Aportación del abogado'}
                        </span>
                        <div>
                          <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>Título:</label>
                          <input
                            value={apTitulo}
                            onChange={(e) => setApTitulo(e.target.value)}
                            placeholder="Ej. Excepción de falta de acción"
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-[#0B2545]"
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>Detalle:</label>
                          <textarea
                            value={apDetalle}
                            onChange={(e) => setApDetalle(e.target.value)}
                            rows={3}
                            placeholder="Describe el hecho, argumento, defensa o instrucción específica..."
                            className="w-full p-2.5 text-xs border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-[#0B2545] resize-none"
                          />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            onClick={() => { setApFormOpen(false); setApEditId(null); }}
                            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={saveAportacion}
                            disabled={!apTitulo.trim() || !apDetalle.trim()}
                            className="px-4 py-1.5 rounded-lg bg-[#0B2545] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold hover:bg-[#081d39] transition"
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    )}

                    {aportaciones.length === 0 && !apFormOpen && (
                      <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                        Sin aportaciones registradas todavía.
                      </p>
                    )}

                    {aportaciones.map((a) => (
                      <div key={a.id} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '11px' }}>{a.titulo}</span>
                          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                            <button
                              onClick={() => startEditAportacion(a)}
                              title="Editar aportación"
                              className="text-slate-400 hover:text-[#0B2545] text-xs px-1 transition"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => deleteAportacion(a.id)}
                              title="Eliminar aportación"
                              className="text-slate-400 hover:text-red-500 text-xs px-1 transition"
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#475569', lineHeight: 1.5 }}>{a.detalle}</p>
                      </div>
                    ))}
                  </div>
                )}

                {selectedAnalysisPill === 'prestaciones' && (
                  <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {caseAnalysis.claims.length > 0 ? caseAnalysis.claims.join('\n\n') : 'No se detectaron prestaciones en el documento.'}
                  </p>
                )}
                {selectedAnalysisPill === 'hechos' && (
                  <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: 1.5 }}>
                    {caseAnalysis.proceduralTimeline.length > 0 ? (
                      caseAnalysis.proceduralTimeline.map((ev, i) => (
                        <li key={i} style={{ marginBottom: '4px' }}>
                          <strong>{ev.date ? `${ev.date}: ` : ''}</strong>{ev.event}
                        </li>
                      ))
                    ) : (
                      <li>No se detectaron hechos relevantes.</li>
                    )}
                  </ul>
                )}
                {selectedAnalysisPill === 'puntos' && (
                  <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {caseAnalysis.proceduralPosture.constitutionalIssues.length > 0 
                      ? caseAnalysis.proceduralPosture.constitutionalIssues.map(issue => `${issue.title} · ${issue.parameter || ''}`).join('\n\n')
                      : 'No se detectaron puntos controvertidos.'}
                  </p>
                )}
                {selectedAnalysisPill === 'excepciones' && (
                  <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: 1.5 }}>
                    {caseAnalysis.caseTheory?.vulnerabilities?.length > 0 ? (
                      caseAnalysis.caseTheory.vulnerabilities.map((v, i) => <li key={i} style={{ marginBottom: '4px' }}>{v}</li>)
                    ) : (
                      <li>No se detectaron excepciones procesales relevantes.</li>
                    )}
                  </ul>
                )}
                {selectedAnalysisPill === 'defensas' && (
                  <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {caseAnalysis.argumentAxes.length > 0 
                      ? caseAnalysis.argumentAxes.map(axis => `${axis.title}: ${axis.reasoning || axis.rebuttal}`).join('\n\n')
                      : 'No se definió estrategia de defensa.'}
                  </p>
                )}
                {selectedAnalysisPill === 'pruebas' && (
                  <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: 1.5 }}>
                    {caseAnalysis.evidence.length > 0 ? (
                      caseAnalysis.evidence.map((ev, i) => <li key={i} style={{ marginBottom: '4px' }}>{ev.description}</li>)
                    ) : (
                      <li>No se especificaron pruebas necesarias en esta etapa.</li>
                    )}
                  </ul>
                )}
                {selectedAnalysisPill === 'fundamentos' && (
                  <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {caseAnalysis.citations.length > 0 
                      ? caseAnalysis.citations.map(c => `${c.rubro || ''} (Registro: ${c.registro || ''})`).join('\n\n')
                      : 'No se encontraron fundamentos o tesis aplicables.'}
                  </p>
                )}
              </div>
            </div>
            </section>

            {/* ── 3. ¿QUÉ ESCRITO DESEAS PREPARAR? (Combobox seleccionable) ── */}
            <section ref={comboboxRef} data-section="configuration" className="contestaciones-context-card contestaciones-config-card">
              <div className="contestaciones-config-heading">
                <h2>Configuración de la contestación</h2>
                <p>Define el tipo de escrito, método y las indicaciones opcionales.</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                <label htmlFor="contestacion-search-input" style={{ color: '#0B2545', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  ¿Qué escrito deseas preparar?
                </label>
                {suggestedDocOption && (
                  <button
                    type="button"
                    onClick={() => {
                      userHasManuallyChangedDocTypeRef.current = true;
                      setSelectedResponseType(suggestedDocType);
                      setDocumentSearchQuery('');
                      setIsComboboxOpen(false);
                    }}
                    title="Hacer clic para autoseleccionar la opción sugerida para este expediente"
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      background: selectedResponseType === suggestedDocType ? '#dcfce7' : '#f0fdf4',
                      color: selectedResponseType === suggestedDocType ? '#15803d' : '#166534',
                      border: '1px solid #bbf7d0',
                      borderRadius: '9999px',
                      padding: '2px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>⭐ Sugerido para este expediente:</span>
                    <strong style={{ textDecoration: 'underline' }}>{suggestedDocOption.label}</strong>
                  </button>
                )}
              </div>

              {/* Input buscador */}
              <div style={{ position: 'relative' }}>
                <input
                  id="contestacion-search-input"
                  type="text"
                  value={isComboboxOpen ? documentSearchQuery : selectedDocOption.label}
                  placeholder="Buscar escrito jurídico (ej. contestación civil, laboral, recurso…)"
                  onFocus={() => {
                    setIsComboboxOpen(true);
                    setDocumentSearchQuery('');
                  }}
                  onChange={(e) => {
                    setDocumentSearchQuery(e.target.value);
                    if (!isComboboxOpen) setIsComboboxOpen(true);
                  }}
                  disabled={isGenerating}
                  style={{
                    width: '100%',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '8px 30px 8px 10px',
                    fontSize: '12px',
                    color: '#0f172a',
                    background: '#ffffff',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setIsComboboxOpen(!isComboboxOpen)}
                  disabled={isGenerating}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '11px',
                    color: '#64748b',
                  }}
                >
                  {isComboboxOpen ? '▲' : '▼'}
                </button>
              </div>

              {/* Lista desplegable filtrada */}
              {isComboboxOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    marginTop: '4px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    maxHeight: '260px',
                    overflowY: 'auto',
                  }}
                >
                  {filteredOptions.length === 0 ? (
                    <div style={{ padding: '12px', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
                      No se encontraron tipos de escrito compatibles con la búsqueda.
                    </div>
                  ) : (
                    filteredOptions.map((opt) => {
                      const compat = checkDocCompatibility(opt.value);
                      const isSelected = opt.value === selectedResponseType;
                      const isSuggested = opt.value === suggestedDocType;

                      return (
                        <div
                          key={opt.value}
                          onClick={() => {
                            if (!compat.compatible) return;
                            userHasManuallyChangedDocTypeRef.current = true;
                            setSelectedResponseType(opt.value);
                            setIsComboboxOpen(false);
                            setDocumentSearchQuery('');
                          }}
                          style={{
                            padding: '8px 12px',
                            borderBottom: '1px solid #f1f5f9',
                            cursor: compat.compatible ? 'pointer' : 'not-allowed',
                            background: isSelected
                              ? '#eff6ff'
                              : !compat.compatible
                                ? '#f8fafc'
                                : '#ffffff',
                            opacity: compat.compatible ? 1 : 0.6,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            transition: 'background 0.1s',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '12px', fontWeight: isSelected ? 700 : 500, color: isSelected ? '#1e3a8a' : '#0f172a' }}>
                                {opt.label}
                              </span>
                              {isSuggested && (
                                <span style={{ fontSize: '9px', fontWeight: 700, background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: '9999px' }}>
                                  Sugerido
                                </span>
                              )}
                              {opt.areaId && (
                                <span style={{ fontSize: '9px', textTransform: 'capitalize', background: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: '4px' }}>
                                  {opt.areaId.replace(/_/g, ' ')}
                                </span>
                              )}
                            </div>
                            {isSelected && <span style={{ color: '#1e3a8a', fontWeight: 700, fontSize: '12px' }}>✓</span>}
                          </div>

                          {!compat.compatible && (
                            <span style={{ fontSize: '10px', color: '#dc2626', fontStyle: 'italic', marginTop: '2px' }}>
                              Este escrito pertenece a otra materia y no corresponde al expediente analizado.
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              <p style={{ margin: '7px 0 0', color: '#64748b', fontSize: '10px', lineHeight: 1.4 }}>
                La sentencia o demanda cargada es la fuente de contexto; este tipo canónico define la estructura jurídica de salida.
              </p>

            {/* ── 4. ¿CÓMO QUIERES PREPARAR ESTE ESCRITO? (Nuevo vs Machote) ── */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ color: '#0B2545', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ¿Cómo quieres preparar este escrito?
              </span>
              <div className="contestaciones-config-methods" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {/* Opción 1: Crear un escrito nuevo */}
                <div
                  onClick={() => setPreparationMethod('new')}
                  style={{
                    border: `2px solid ${preparationMethod === 'new' ? '#0B2545' : '#e2e8f0'}`,
                    background: preparationMethod === 'new' ? '#f0f4f8' : '#ffffff',
                    borderRadius: '10px',
                    padding: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="radio"
                      name="preparationMethod"
                      checked={preparationMethod === 'new'}
                      onChange={() => setPreparationMethod('new')}
                      style={{ accentColor: '#0B2545', cursor: 'pointer' }}
                    />
                    <strong style={{ fontSize: '12px', color: '#0f172a' }}>Crear un escrito nuevo</strong>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#64748b', lineHeight: 1.4 }}>
                    Genera la contestación desde cero usando el análisis del expediente y las indicaciones jurídicas.
                  </p>
                </div>

                {/* Opción 2: Usar uno de mis machotes */}
                <div
                  onClick={() => setPreparationMethod('machote')}
                  style={{
                    border: `2px solid ${preparationMethod === 'machote' ? '#0B2545' : '#e2e8f0'}`,
                    background: preparationMethod === 'machote' ? '#f0f4f8' : '#ffffff',
                    borderRadius: '10px',
                    padding: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="radio"
                      name="preparationMethod"
                      checked={preparationMethod === 'machote'}
                      onChange={() => setPreparationMethod('machote')}
                      style={{ accentColor: '#0B2545', cursor: 'pointer' }}
                    />
                    <strong style={{ fontSize: '12px', color: '#0f172a' }}>Usar uno de mis machotes</strong>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#64748b', lineHeight: 1.4 }}>
                    Aplica la estructura y estilo de tu machote pero llenándolo con los hechos y partes de este expediente.
                  </p>
                </div>
              </div>

              {/* 5. Selector de machotes compatibles (cuando se elige "Usar machote") */}
              {preparationMethod === 'machote' && (
                <div style={{ marginTop: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label htmlFor="contestacion-machote-select" style={{ color: '#0B2545', fontWeight: 700, fontSize: '11px' }}>
                    Selecciona el machote compatible a utilizar
                  </label>
                  {compatibleMachotes.length > 0 ? (
                    <select
                      id="contestacion-machote-select"
                      value={effectiveMachoteId}
                      onChange={(e) => setSelectedMachoteId(e.target.value)}
                      disabled={isGenerating}
                      style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: '#0f172a', background: '#ffffff' }}
                    >
                      {compatibleMachotes.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.category ? `(${m.category})` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <p style={{ margin: 0, fontSize: '11px', color: '#92400e', lineHeight: 1.4 }}>
                        No tienes machotes compatibles con este tipo de escrito. Puedes crearlo como escrito nuevo.
                      </p>
                      <button
                        type="button"
                        onClick={() => setPreparationMethod('new')}
                        style={{
                          alignSelf: 'flex-start',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#0B2545',
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          cursor: 'pointer',
                        }}
                      >
                        Cambiar a crear escrito nuevo
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── 6. INDICACIONES PARA LA REDACCIÓN ── */}
            <div className="contestaciones-config-instructions" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="contestacion-lawyer-instructions" style={{ color: '#0B2545', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Indicaciones para la redacción
              </label>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: 1.4 }}>
                Opcional. Indica excepciones, estrategia de defensa, hechos que quieras destacar o cualquier instrucción que deba considerar al preparar el escrito.
              </p>
              <textarea
                id="contestacion-lawyer-instructions"
                rows={3}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                disabled={isGenerating}
                placeholder="Ej. Oponer la excepción de falta de legitimación pasiva; insistir en que el demandado cubrió la totalidad de los adeudos según recibo de fecha..."
                style={{
                  width: '100%',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  fontSize: '12px',
                  color: '#0f172a',
                  background: '#ffffff',
                  resize: 'vertical',
                  minHeight: '64px',
                  fontFamily: 'inherit',
                  marginTop: '4px',
                }}
              />
            </div>
            </section>

            {/* ── 7. LISTA DE VERIFICACIÓN ── */}
            <details data-section="checklist" className="contestaciones-context-card contestaciones-checklist-card">
              <summary>
                <div>
                  <strong>Lista de verificación</strong>
                  <span>Revisa los elementos incluidos antes de generar.</span>
                </div>
              </summary>
              <div className="contestaciones-checklist-body">
                <span style={{ color: '#0B2545', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {isContestacion ? 'La contestación tomará en cuenta' : 'El escrito tomará en cuenta'}
                </span>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: 1.45 }}>
                  Resumen verificado de los elementos jurídicos e instrucciones que se integrarán en el documento.
                </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                {/* 1. Documentos del expediente */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#166534', fontWeight: 600 }}>
                  <span>✓</span>
                  <span>Documentos del expediente cargados ({totalPages} foja{totalPages === 1 ? '' : 's'})</span>
                </div>

                {/* 2. Prestaciones, hechos y puntos analizados */}
                {(caseAnalysis.claims.length > 0 || caseAnalysis.proceduralTimeline.length > 0) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#166534', fontWeight: 600 }}>
                    <span>✓</span>
                    <span>Prestaciones, hechos y puntos controvertidos analizados ({caseAnalysis.claims.length} pretensiones, {caseAnalysis.proceduralTimeline.length} hechos)</span>
                  </div>
                )}

                {/* 3. Indicaciones para la redacción */}
                {customPrompt.trim() && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#166534', fontWeight: 600 }}>
                    <span>✓</span>
                    <span>Indicaciones para la redacción ({customPrompt.trim().length} caracteres)</span>
                  </div>
                )}

                {/* 4. Plantilla seleccionada */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#166534', fontWeight: 600 }}>
                  <span>✓</span>
                  <span>
                    Plantilla seleccionada: {preparationMethod === 'machote' && selectedMachote
                      ? `${selectedMachote.name} (Machote personal)`
                      : `Plantilla canónica del sistema (${selectedDocOption.label})`}
                  </span>
                </div>

                {/* 5. Partes del juicio */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#166534', fontWeight: 600 }}>
                  <span>✓</span>
                  <span>
                    Partes del juicio: Actor ({actor || 'Sin especificar'}) vs Demandado ({demandado || 'Sin especificar'})
                  </span>
                </div>

                {/* Aportaciones adicionales */}
                {aportaciones.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#166534', fontWeight: 600 }}>
                    <span>✓</span>
                    <span>Aportaciones del abogado ({aportaciones.length} registradas)</span>
                  </div>
                )}
              </div>

              {/* Categorías con contenido actualmente DESACTIVADAS (control explícito del abogado) */}
              {analysisPills.some((p) => analysisConfig[p.id] === false && categoryContent(p.id).trim().length > 0) && (
                <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', width: '100%' }}>
                    Excluidas del análisis:
                  </span>
                  {analysisPills
                    .filter((p) => analysisConfig[p.id] === false && categoryContent(p.id).trim().length > 0)
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => toggleAnalysisCategory(p.id)}
                        title="Volver a incluir en el análisis"
                        style={{
                          fontSize: '10px',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          color: '#64748b',
                          textDecoration: 'line-through',
                          cursor: 'pointer',
                        }}
                      >
                        {p.label} ✕
                      </button>
                    ))}
                </div>
              )}
              </div>
            </details>

            <section data-section="readiness" className="contestaciones-context-card contestaciones-readiness-panel" aria-labelledby="contestaciones-readiness-title">
              <div className="contestaciones-readiness-header">
                <div>
                  <span className="contestaciones-section-kicker">Control de salida</span>
                  <h2 id="contestaciones-readiness-title" className="contestaciones-readiness-title">Readiness del documento</h2>
                  <p className="contestaciones-readiness-subtitle">
                    Estado derivado de la fuente, el análisis y el Job real; una generación completada no implica por sí sola que esté lista.
                  </p>
                </div>
                <span className={`contestaciones-readiness-badge ${readinessSummary.tone}`}>
                  {readinessSummary.label}
                </span>
              </div>

              <div className="contestaciones-readiness-list">
                {readinessRows.map((row) => (
                  <div key={row.label} className="contestaciones-readiness-row" data-status={row.status}>
                    <span className="contestaciones-readiness-icon" aria-hidden="true">
                      {row.status === 'COMPLETED' ? '✓' : row.status === 'BLOCKED' ? '!' : row.status === 'ACTIVE' ? '•' : '○'}
                    </span>
                    <span>
                      <strong>{row.label}</strong>
                      {row.detail}
                    </span>
                  </div>
                ))}
              </div>

              {generationJob?.documentReadiness && generationJob.documentReadiness !== 'READY' && (
                <p className="contestaciones-action-reason is-blocked">
                  {generationJob.stage || `La salida del Job requiere atención: ${readinessSummary.label}.`}
                </p>
              )}
            </section>

            {/* ── 8. ACCIÓN PRINCIPAL: GENERACIÓN ── */}
            <section data-section="action" className="contestaciones-context-card contestaciones-action-card">
              {/* Alerta visible si es incompatible */}
              {!currentDocCompatibility.compatible && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'start', gap: '8px' }}>
                  <span style={{ fontSize: '14px', lineHeight: 1 }}>⚠️</span>
                  <div style={{ fontSize: '11px', color: '#991b1b', lineHeight: 1.4 }}>
                    <strong>Escrito incompatible con el expediente:</strong>
                    <p style={{ margin: '2px 0 0' }}>{currentDocCompatibility.reason || 'Este escrito pertenece a otra materia y no corresponde al expediente analizado.'}</p>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  if (!currentDocCompatibility.compatible) return;
                  const activeMachote = preparationMethod === 'machote'
                    ? selectedMachote
                    : undefined;
                  onGenerateResponse?.({
                    userInstructions: buildContestacionInstruction(),
                    selectedDocumentType: selectedDocOption.value,
                    documentTypeLabel: selectedDocOption.label,
                    generationMode: preparationMethod === 'machote' && activeMachote ? 'personal_template' : 'automatic',
                    referenceDocumentId: preparationMethod === 'machote' && activeMachote ? activeMachote.id : undefined,
                    referenceDocumentText: preparationMethod === 'machote' && activeMachote ? (activeMachote.content || '') : undefined,
                  });
                }}
                disabled={!selectedDoc || isGenerating || !currentDocCompatibility.compatible || (preparationMethod === 'machote' && compatibleMachotes.length === 0)}
                className={`contestaciones-generate-button w-full py-3.5 px-4 rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center gap-2 ${
                  !selectedDoc || isGenerating || !currentDocCompatibility.compatible || (preparationMethod === 'machote' && compatibleMachotes.length === 0)
                    ? 'bg-slate-300 cursor-not-allowed opacity-60 text-white'
                    : 'bg-[#0B2545] hover:bg-[#081d39] text-white cursor-pointer active:scale-[0.99]'
                }`}
              >
                {isGenerating ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Iniciando generación…</span>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">→</span>
                    <span>{isContestacion ? 'Generar contestación' : 'Generar escrito'}</span>
                  </>
                )}
              </button>

              {!isGenerating && generationBlockReason && (
                <p className={`contestaciones-action-reason ${selectedDoc && !currentDocCompatibility.compatible ? 'is-blocked' : ''}`}>
                  {generationBlockReason}
                </p>
              )}

              <div className="contestaciones-generation-status">
                <GenerationStatusBar job={generationJob} />
              </div>

              {onOpenEditor && (
                <button
                  onClick={onOpenEditor}
                  className="contestaciones-btn-outline"
                >
                  Continuar al editor jurídico
                </button>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
