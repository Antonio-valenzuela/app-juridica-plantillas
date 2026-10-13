'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { CaseDocument, UploadedSourceDocument } from '@/lib/legal-engine/types';
import { reconstructCaseAnalysis, CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { TemplateItem } from './TemplateLibraryManager';
import type { DraftDepth } from '@/lib/legal-engine/draftDepth';
import { DEFAULT_PAGE_TARGET, tryParsePageTarget, type PageTarget } from '@/lib/legal-engine/pageTarget';
import { canGenerateDocumentDraft, getCatalogDocument, getContestacionesDocumentOptions, getFunctionalDocumentStatus } from '@/lib/catalog/legalCatalog';
import {
  evaluateSourceOutputCompatibility,
  inferSourceMatterForDocuments,
  inferSourceOutputType,
} from '@/lib/legal-engine/sourceOutputCompatibility';

import { ContestacionesExpedienteCard, type ExpedienteFichaData, type ExpedienteFieldStatus } from './ContestacionesExpedienteCard';
import { ContestacionesAnalysisPanel } from './ContestacionesAnalysisPanel';
import { ContestacionesConfigPanel } from './ContestacionesConfigPanel';
import { ContestacionesChecklist } from './ContestacionesChecklist';
import { AppealResolutionReviewPanel } from './AppealResolutionReviewPanel';
import { AppealReasoningAiReview } from './AppealReasoningCandidatesPanel';
import { extractAppealReasoningCandidates } from '@/lib/legal-engine/case-extraction/appealReasoningCandidates';
import { deriveProvisionalAppealConfirmation, extractAppealResolutionReview, isCivilFamilyAppeal, resolveAppealGeneration, selectPrimaryAppealResolution, validateAppealConfirmation, type AppealConfirmation } from '@/lib/legal-engine/case-extraction/appealResolutionReview';

export interface CaseDocumentsReaderProps {
  documents: CaseDocument[];
  sourceDocs?: UploadedSourceDocument[];
  selectedDocId?: string | null;
  onSelectDocument: (doc: CaseDocument) => void;
  onUploadNewDocument?: () => void;
  /** Abre el modal existente para subir y guardar una plantilla (machote) del abogado. */
  onUploadTemplate?: () => void;
  onGenerateResponse?: (request?: string | {
    userInstructions: string;
    selectedDocumentType: string;
    documentTypeLabel: string;
    referenceDocumentId?: string;
    referenceDocumentText?: string;
    generationMode?: 'automatic' | 'personal_template' | 'reference_document';
    generationExtension?: { generationMode: 'standard' | 'extended-legal'; targetPages?: number; minPages?: number; maxPages?: number };
    draftDepth?: DraftDepth;
    /** Meta de extensión elegida (5/10/20/40/personalizada); el servidor la vuelve a validar. */
    pageTarget?: PageTarget;
    appealConfirmation?: AppealConfirmation;
    uncertifiedDraftAcknowledged?: boolean;
  }) => void;
  onOpenEditor?: () => void;
  isGenerating?: boolean;
  generationJob?: {
    total: number;
    completed: number;
    percentage: number;
    currentBlock: string | null;
    status: string;
    stage?: string;
    documentReadiness?: string | null;
  } | null;
  customTemplates?: TemplateItem[];
  caseFicha?: ExpedienteFichaData | null;
}

export type ContestacionesStepStatus = 'COMPLETED' | 'ACTIVE' | 'PENDING' | 'BLOCKED';

export interface ContestacionesUiSignals {
  hasDocument: boolean;
  analysisAvailable: boolean;
  analysisRequiresReview: boolean;
  generationStatus?: string | null;
  readiness?: string | null;
  configDefined?: boolean;
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
    { id: 'upload' as const, status: (signals.hasDocument ? 'COMPLETED' : 'ACTIVE') as ContestacionesStepStatus },
    { id: 'analysis' as const, status: analysisStatus },
    { id: 'generation' as const, status: generationStatusValue },
  ];
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  DEMANDA: 'Demanda',
  DEMANDA_CIVIL: 'Demanda civil',
  DEMANDA_MERCANTIL: 'Demanda mercantil',
  DEMANDA_LABORAL: 'Demanda laboral',
  DEMANDA_AMPARO: 'Demanda de amparo',
  DEMANDA_AMPARO_DIRECTO: 'Demanda de amparo directo',
  CONTESTACION_DEMANDA: 'Contestación de demanda',
  SENTENCIA_O_RESOLUCION: 'Sentencia o resolución',
  SENTENCIA_AMPARO: 'Sentencia de amparo',
  SENTENCIA_AMPARO_DIRECTO: 'Sentencia de amparo directo',
  RECURSO: 'Recurso',
  REPLICA: 'Réplica',
  LAUDO: 'Laudo',
  ACUERDO: 'Acuerdo',
};

/** Tipo del documento fuente en lenguaje del abogado; sin rótulo si no está clasificado. */
export function humanSourceDocumentType(type?: string | null): string | undefined {
  if (!type || type === 'DOCUMENTO_JURIDICO_NO_CLASIFICADO') return undefined;
  if (SOURCE_TYPE_LABELS[type]) return SOURCE_TYPE_LABELS[type];
  const words = type.toLowerCase().split('_').filter(Boolean).join(' ');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : undefined;
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

export type GenerationFlow = 'appeal' | 'contestacion' | 'both';

/**
 * Bloqueo de generación: único motivo por el que el botón no habilita.
 * Cada bloqueo es visible y accionable; nada más puede deshabilitarlo.
 */
export interface GenerationBlocker {
  code: string;
  flow: GenerationFlow;
  actionable: boolean;
  step: number;
  label: string;
}

export function getContestacionesGenerationBlockReason(input: {
  hasDocument: boolean;
  compatible: boolean;
  compatibilityReason?: string;
  generationMode: 'automatic' | 'personal_template' | 'reference_document';
  hasCompatibleTemplate: boolean;
  hasReferenceDocument: boolean;
}) {
  if (!input.hasDocument) return 'Carga un documento fuente para habilitar la generación.';
  if (!input.compatible) return input.compatibilityReason || 'El tipo de escrito no corresponde al expediente.';
  if (input.generationMode === 'reference_document' && !input.hasReferenceDocument) {
    return 'Selecciona un documento de referencia antes de generar con ese método.';
  }
  if (input.generationMode === 'personal_template' && !input.hasCompatibleTemplate) {
    return 'No tienes un machote compatible guardado para este tipo de escrito.';
  }
  return null;
}

export const CONTESTACIONES_SECTION_ORDER = [
  'summary',
  'analysis',
  'configuration',
  'readiness',
  'action',
] as const;

export const RESPONSE_DOCUMENT_TYPES = getContestacionesDocumentOptions();

function formatContestacionesFileSize(bytes?: number) {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDocDate(isoDate?: string) {
  if (!isoDate) return 'Reciente';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return 'Reciente';
    return d.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Reciente';
  }
}

export function CaseDocumentsReader({
  documents,
  sourceDocs = [],
  selectedDocId,
  onSelectDocument,
  onUploadNewDocument,
  onUploadTemplate,
  onGenerateResponse,
  onOpenEditor,
  isGenerating = false,
  generationJob = null,
  customTemplates = [],
  caseFicha,
}: CaseDocumentsReaderProps) {
  const selectedDoc = documents.find((d) => d.id === selectedDocId) || documents[0];
  const selectedSourceDoc = sourceDocs.find((source) => source.id === selectedDoc?.id) || sourceDocs[0];

  const [activePage, setActivePage] = useState(1);
  const [viewMode, setViewMode] = useState<'original' | 'structure'>('original');
  const [isDragging, setIsDragging] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  // Exportar para chat — texto extraído completo
  const getFullExtractedText = useCallback(() => {
    const source = selectedSourceDoc || sourceDocs[0];
    if (source?.extractedText) return source.extractedText;
    if (source?.content) return source.content;
    if (selectedDoc?.pages?.length) return selectedDoc.pages.map((p) => `--- Página ${p.page} ---\n${p.text}`).join('\n\n');
    return '';
  }, [selectedSourceDoc, sourceDocs, selectedDoc]);

  const handleCopyForChat = useCallback(async () => {
    const text = getFullExtractedText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback('Copiado — pégalo en el chat');
      setTimeout(() => setCopyFeedback(null), 2500);
    } catch {
      setCopyFeedback('No se pudo copiar');
      setTimeout(() => setCopyFeedback(null), 2500);
    }
  }, [getFullExtractedText]);

  const handleExportTxtForChat = useCallback(() => {
    const text = getFullExtractedText();
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (selectedDoc?.name?.replace(/\.[^/.]+$/, '') || 'documento') + '_para_chat.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [getFullExtractedText]);

  const handleSendToChat = useCallback(() => {
    const text = getFullExtractedText().slice(0, 8000);
    if (!text) return;
    try {
      window.dispatchEvent(new CustomEvent('open-legal-chat', { detail: { query: `Revisa este documento y dame un análisis breve:\n\n${text.slice(0, 4000)}` } }));
    } catch {}
  }, [getFullExtractedText]);

  // Estados de configuración de contestación
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedResponseType, setSelectedResponseType] = useState<string>(RESPONSE_DOCUMENT_TYPES[0]?.value || '');
  const [showUncertifiedDrafts, setShowUncertifiedDrafts] = useState(false);
  const userHasManuallyChangedDocTypeRef = useRef(false);
  const [generationMode, setGenerationMode] = useState<'automatic' | 'personal_template' | 'reference_document'>('automatic');
  // Extensión del escrito: se recuerda por expediente (y por sesión si aún no hay expediente).
  const pageTargetStorageKey = `lex:page-target:${String(caseFicha?.expediente || '').trim().toLowerCase().replace(/\s+/g, '') || 'sesion'}`;
  const [pageTarget, setPageTarget] = useState<PageTarget>(DEFAULT_PAGE_TARGET);
  useEffect(() => {
    try {
      const stored = tryParsePageTarget(JSON.parse(window.localStorage.getItem(pageTargetStorageKey) || window.sessionStorage.getItem('lex:page-target:sesion') || 'null'));
      if (stored) setPageTarget(stored);
    } catch { /* almacenamiento no disponible: se usa el valor por defecto */ }
  }, [pageTargetStorageKey]);
  const changePageTarget = (target: PageTarget) => {
    setPageTarget(target);
    try {
      const serialized = JSON.stringify(target);
      window.localStorage.setItem(pageTargetStorageKey, serialized);
      window.sessionStorage.setItem('lex:page-target:sesion', serialized);
    } catch { /* la elección sigue vigente en esta pantalla aunque no pueda persistirse */ }
  };
  const [selectedMachoteId, setSelectedMachoteId] = useState<string>('');
  const [appealConfirmation, setAppealConfirmation] = useState<AppealConfirmation>();
  const appealReview = useMemo(() => isCivilFamilyAppeal(selectedResponseType) ? extractAppealResolutionReview(sourceDocs) : undefined, [sourceDocs, selectedResponseType]);
  useEffect(() => { setAppealConfirmation(undefined); }, [selectedResponseType, appealReview?.sourceFingerprint]);
  const confirmedAppeal = appealReview ? validateAppealConfirmation(appealReview, appealConfirmation) : undefined;
  // Sin formulario obligatorio: si el abogado no ratifica datos se usa la confirmación provisional
  // derivada de la resolución principal; lo no verificado queda marcado en el borrador.
  const provisionalAppeal = useMemo(() => appealReview ? deriveProvisionalAppealConfirmation(appealReview, { expediente: caseFicha?.expediente }) : undefined, [appealReview, caseFicha?.expediente]);
  const effectiveAppealConfirmation = appealConfirmation ?? provisionalAppeal;
  const appealCandidates = useMemo(() => appealReview && appealConfirmation && validateAppealConfirmation(appealReview, appealConfirmation).eligible
    ? extractAppealReasoningCandidates(sourceDocs, { documentType: selectedResponseType, resolution: validateAppealConfirmation(appealReview, appealConfirmation).selected!, parties: appealConfirmation.parties, representedNames: appealConfirmation.representedNames, sourceFingerprint: appealReview.sourceFingerprint }) : undefined,
  [appealReview, appealConfirmation, sourceDocs, selectedResponseType]);
  const pendingAppealField = 'Por confirmar';
  const soleDetectedResolution = appealReview ? selectPrimaryAppealResolution(appealReview.resolutions).primary : undefined;
  const detectedActors = soleDetectedResolution?.parties.filter(p => p.role === 'actor').map(p => p.name).join('; ');
  const detectedDefendants = soleDetectedResolution?.parties.filter(p => p.role === 'demandado').map(p => p.name).join('; ');
  // `caseFicha` es estado global de la página y puede provenir de otro expediente: en apelación la
  // identidad se proyecta SOLO desde la resolución actual (o queda por confirmar).
  const detectedCourt = soleDetectedResolution && !soleDetectedResolution.court.startsWith('[') ? soleDetectedResolution.court : undefined;
  const appealFichaStatuses: Partial<Record<'expediente' | 'actor' | 'demandado' | 'autoridad' | 'materia' | 'estadoProcesal', ExpedienteFieldStatus>> | undefined = appealReview ? {
    expediente: confirmedAppeal?.eligible ? 'CONFIRMED' : (soleDetectedResolution?.expediente || caseFicha?.expediente) ? 'DETECTED_UNCONFIRMED' : 'PENDING',
    actor: confirmedAppeal?.eligible ? 'CONFIRMED' : detectedActors ? 'DETECTED_UNCONFIRMED' : 'PENDING',
    demandado: confirmedAppeal?.eligible ? 'CONFIRMED' : detectedDefendants ? 'DETECTED_UNCONFIRMED' : 'PENDING',
    autoridad: confirmedAppeal?.eligible ? 'CONFIRMED' : detectedCourt ? 'DETECTED_UNCONFIRMED' : 'PENDING',
    materia: 'PENDING',
    estadoProcesal: 'PENDING',
  } : undefined;
  const appealFicha = appealReview ? {
    expediente: confirmedAppeal?.eligible ? appealConfirmation!.expediente : soleDetectedResolution?.expediente || caseFicha?.expediente || pendingAppealField,
    actor: confirmedAppeal?.eligible ? appealConfirmation!.parties.filter(p => p.role === 'actor').map(p => p.name).join('; ') || pendingAppealField : detectedActors || pendingAppealField,
    demandado: confirmedAppeal?.eligible ? appealConfirmation!.parties.filter(p => p.role === 'demandado').map(p => p.name).join('; ') || pendingAppealField : detectedDefendants || pendingAppealField,
    autoridad: confirmedAppeal?.eligible ? confirmedAppeal.selected!.court : detectedCourt || pendingAppealField,
    // La materia se conserva pendiente: ni la detección general ni el tipo elegido la confirman.
    materia: pendingAppealField,
    estadoProcesal: caseFicha?.estadoProcesal || pendingAppealField,
  } : undefined;

  // Reconstrucción del análisis del caso
  const caseAnalysis: CaseAnalysis = useMemo(() => {
    return reconstructCaseAnalysis(sourceDocs, selectedDoc?.name || '');
  }, [sourceDocs, selectedDoc]);

  const totalPages = selectedDoc?.pageCount || selectedDoc?.pages?.length || 1;
  const safeActivePage = Math.min(Math.max(1, activePage), totalPages);

  const activePageObj = useMemo(() => {
    if (!selectedDoc || !selectedDoc.pages || selectedDoc.pages.length === 0) return null;
    return selectedDoc.pages.find((p) => p.page === safeActivePage) || selectedDoc.pages[safeActivePage - 1];
  }, [selectedDoc, safeActivePage]);

  const isPdfDoc = Boolean(
    selectedDoc &&
      (selectedDoc.type?.toLowerCase().includes('pdf') || selectedDoc.name?.toLowerCase().endsWith('.pdf'))
  );
  const hasFileUrl = Boolean(selectedDoc?.fileUrl);

  const inferredSourceType = useMemo(() => {
    if (!sourceDocs || sourceDocs.length === 0) return null;
    return inferSourceOutputType(sourceDocs);
  }, [sourceDocs]);

  const inferredMatter = useMemo(() => {
    if (!inferredSourceType || inferredSourceType === 'DOCUMENTO_JURIDICO_NO_CLASIFICADO') return null;
    return inferSourceMatterForDocuments(sourceDocs);
  }, [inferredSourceType, sourceDocs]);

  const isJudgmentSource = Boolean(inferredSourceType && (
    inferredSourceType === 'SENTENCIA_O_RESOLUCION'
    || inferredSourceType === 'SENTENCIA_AMPARO'
    || inferredSourceType.startsWith('SENTENCIA_')
  ));
  const selectedOutputIsAppeal = /^(?:apelacion_|recurso_(?:revision|queja|reclamacion))/i.test(selectedResponseType);

  const suggestedDocType = useMemo(() => {
    if (inferredSourceType === 'SENTENCIA_AMPARO_DIRECTO') {
      return 'recurso_revision_amparo_directo';
    }
    if (isJudgmentSource && inferredMatter === 'CIVIL') return 'apelacion_civil';
    if (isJudgmentSource && inferredMatter === 'FAMILIAR') return 'apelacion_familiar';
    if (inferredMatter === 'LABORAL' || inferredSourceType === 'DEMANDA_LABORAL') {
      return 'contestacion_demanda_laboral';
    }
    if (inferredMatter === 'MERCANTIL' || inferredSourceType === 'DEMANDA_MERCANTIL') {
      return 'contestacion_demanda_mercantil';
    }
    if (inferredMatter === 'FAMILIAR') {
      return 'contestacion_divorcio';
    }
    // El clasificador de materia devuelve la forma femenina (ADMINISTRATIVA/AGRARIA).
    if (inferredMatter === 'ADMINISTRATIVA' || inferredMatter === 'ADMINISTRATIVO') {
      return 'contestacion_nulidad_administrativa';
    }
    if (inferredMatter === 'FISCAL') {
      return 'contestacion_nulidad_fiscal';
    }
    if (inferredMatter === 'AGRARIA' || inferredMatter === 'AGRARIO') {
      return 'contestacion_demanda_agraria';
    }
    if (inferredMatter === 'AMPARO') {
      return 'recurso_revision_amparo_directo';
    }
    if (inferredMatter === 'CIVIL' || inferredSourceType === 'DEMANDA_CIVIL') {
      return 'contestacion_demanda_civil';
    }
    return undefined;
  }, [inferredSourceType, inferredMatter, isJudgmentSource]);

  const checkDocCompatibility = useCallback(
    (docType: string): { compatible: boolean; reason?: string; advisories?: Array<{ code: string; message: string }> } => {
      // Redacción Libre acepta cualquier fuente intencionalmente
      if (docType === 'redaccion_libre') {
        return { compatible: true };
      }
      if (!sourceDocs || sourceDocs.length === 0) {
        return { compatible: true };
      }
      try {
        const evaluation = evaluateSourceOutputCompatibility({
          selectedDocumentType: docType,
          sourceDocuments: sourceDocs,
        });
        return { compatible: true, ...(evaluation.advisories?.length ? { advisories: evaluation.advisories } : {}) };
      } catch (err: any) {
        return {
          compatible: false,
          reason: err?.message || 'Este escrito pertenece a otra materia y no corresponde al expediente analizado.',
        };
      }
    },
    [sourceDocs]
  );

  const currentDocCompatibility = useMemo(() => {
    return checkDocCompatibility(selectedResponseType);
  }, [checkDocCompatibility, selectedResponseType]);

  // La sugerencia automática solo puede llevar a un tipo que la fuente admite.
  // Antes se aplicaba sin esa verificación: una materia mal inferida (p. ej. un
  // escrito de amparo → recurso de revisión) cambiaba el tipo elegido por uno
  // incompatible y dejaba deshabilitado «Generar».
  const suggestedDocTypeIsUsable = Boolean(
    suggestedDocType
    && getFunctionalDocumentStatus(suggestedDocType) === 'PASS'
    && checkDocCompatibility(suggestedDocType).compatible,
  );
  useEffect(() => {
    if (suggestedDocType && suggestedDocTypeIsUsable && !userHasManuallyChangedDocTypeRef.current) {
      setSelectedResponseType(suggestedDocType);
    }
  }, [suggestedDocType, suggestedDocTypeIsUsable]);

  const documentTypeOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();

    for (const item of getContestacionesDocumentOptions({ includeUncertifiedDrafts: showUncertifiedDrafts })) {
      map.set(item.value, { value: item.value, label: item.label });
    }

    return Array.from(map.values());
  }, [showUncertifiedDrafts]);

  const selectedDocOption = useMemo(() => {
    return (
      documentTypeOptions.find((opt) => opt.value === selectedResponseType) || {
        value: selectedResponseType,
        label: selectedResponseType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      }
    );
  }, [documentTypeOptions, selectedResponseType]);

  const selectedCatalogDoc = useMemo(() => {
    return getCatalogDocument(selectedResponseType);
  }, [selectedResponseType]);

  const selectedAreaId =
    selectedCatalogDoc && selectedCatalogDoc.kind === 'DOCUMENT_TYPE'
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
        if (
          (selectedAreaId.includes('amparo') || selectedAreaId.includes('constitucional')) &&
          (tplMatter.includes('amparo') || tplMatter.includes('constitucional'))
        ) {
          return true;
        }
        return false;
      }
      return true;
    });
  }, [customTemplates, selectedResponseType, selectedAreaId]);

  const effectiveMachote = useMemo(() => {
    // Elección expresa del abogado: se usa su plantilla aunque el filtro de
    // compatibilidad por materia no la habría propuesto.
    if (selectedMachoteId) {
      const chosen = (customTemplates || []).find((m) => m.id === selectedMachoteId);
      if (chosen) return chosen;
    }
    return compatibleMachotes[0] || null;
  }, [selectedMachoteId, compatibleMachotes]);

  // Señales UI y Pasos del Wizard
  const analysisAvailable = Boolean(selectedDoc && sourceDocs.length > 0 && selectedDoc.status === 'READY');
  const conflictCount = caseAnalysis.richCaseAnalysis?.conflicts?.length || 0;
  const analysisRequiresReview = Boolean(
    selectedDoc?.status === 'NEEDS_MANUAL_REVIEW' ||
      caseAnalysis.missingData.length > 0 ||
      conflictCount > 0
  );

  const contestacionesSteps = deriveContestacionesSteps({
    hasDocument: Boolean(selectedDoc),
    analysisAvailable,
    analysisRequiresReview,
    generationStatus: generationJob?.status,
    readiness: generationJob?.documentReadiness,
    configDefined: Boolean(selectedResponseType),
  });

  const hasDirectInstruction = customPrompt.trim().length >= 10;
  const generateActionLabel = /^contestacion/.test(selectedResponseType)
    ? 'Generar contestación'
    : /^apelacion/.test(selectedResponseType)
      ? 'Generar apelación'
      : /^recurso/.test(selectedResponseType) ? 'Generar recurso' : 'Generar escrito';
  const requestedResponseType = selectedResponseType === 'redaccion_libre' ? suggestedDocType || 'escrito_libre' : selectedResponseType;
  const responseFunctionalStatus = getFunctionalDocumentStatus(requestedResponseType);
  // ¿Puede generarse el borrador de apelación? Basta la resolución principal detectada o la ratificada.
  const appealResolutionConfirmed = Boolean(appealReview && resolveAppealGeneration(appealReview, effectiveAppealConfirmation).canGenerate);
  // Flujo activo: cada workflow evalúa ÚNICAMENTE sus propios requisitos.
  // Apelación y Contestación no comparten blockers, checklist ni compatibleMachotes.
  const isAppealFlow = selectedOutputIsAppeal;
  // Una fuente judicial en Contestación es ASESOR, no bloqueo: se informa y se
  // ofrece cambiar a Apelación (afordance en la sección de fuente), pero el
  // usuario que eligió conscientemente contestación no queda atrapado. Para
  // Apelación sí es requisito implícito haber detectado la resolución.
  const judgmentSourceNeedsAppeal = isJudgmentSource && !isAppealFlow;
  const effectiveCompatible = currentDocCompatibility.compatible;

  const generationBlockers: GenerationBlocker[] = [];
  if (!selectedDoc) {
    generationBlockers.push({
      code: 'SOURCE_DOCUMENT_MISSING', flow: 'both', actionable: true, step: 1,
      label: 'Carga un documento fuente para habilitar la generación.',
    });
  }
  if (!canGenerateDocumentDraft(requestedResponseType, showUncertifiedDrafts)) {
    generationBlockers.push({
      code: 'TYPE_NOT_DRAFT_CAPABLE', flow: 'both', actionable: true, step: 2,
      label: responseFunctionalStatus === 'PASS'
        ? 'El tipo de escrito seleccionado no tiene una ruta de borrador disponible.'
        : 'Activa “En desarrollo (sin certificar)” para generar este tipo únicamente como borrador asistido.',
    });
  }
  if (isAppealFlow) {
    // Requisitos EXCLUSIVOS de Apelación. La revisión de la resolución impugnada
    // solo existe para apelaciones civiles y familiares; los recursos de amparo
    // (revisión, queja, reclamación) no pueden cumplirla y no deben bloquearse.
    if (isCivilFamilyAppeal(selectedResponseType) && !appealReview) {
      generationBlockers.push({
        code: 'APPEAL_RESOLUTION_NOT_DETECTED', flow: 'appeal', actionable: true, step: 1,
        label: 'Selecciona la resolución que deseas impugnar.',
      });
    } else if (appealReview && !appealResolutionConfirmed) {
      generationBlockers.push({
        code: 'APPEAL_CONFIRMATION_PENDING', flow: 'appeal', actionable: true, step: 1,
        label: 'No se pudo preparar la resolución a impugnar. Vuelve a cargar el documento.',
      });
    }
  } else {
    // Requisitos EXCLUSIVOS de Contestación.
    // Una resolución judicial NO permite contestar una demanda: es una fuente
    // incompatible y por tanto un blocker real y visible. El mensaje ofrece
    // cambiar a Apelación, que es la vía correcta para impugnar.
    if (judgmentSourceNeedsAppeal) {
      generationBlockers.push({
        code: 'SOURCE_DOCUMENT_INCOMPATIBLE', flow: 'contestacion', actionable: true, step: 1,
        label: 'Este documento parece ser una resolución judicial, no una demanda. Para elaborar una contestación carga la demanda. Si deseas impugnar esta resolución, cambia a Apelación.',
      });
    }
    const contestacionReason = getContestacionesGenerationBlockReason({
      hasDocument: Boolean(selectedDoc),
      compatible: effectiveCompatible,
      compatibilityReason: currentDocCompatibility.reason,
      generationMode,
      hasCompatibleTemplate: Boolean(effectiveMachote),
      hasReferenceDocument: false,
    });
    if (contestacionReason) {
      generationBlockers.push({
        code: 'CONTESTACION_REQUIREMENT', flow: 'contestacion', actionable: true, step: 1,
        label: contestacionReason,
      });
    }
  }

  const generationBlockReason = generationBlockers.length ? Array.from(new Set(generationBlockers.map(b => b.label))).join(' ') : null;
  // Aviso (no bloqueo) cuando la fuente es una resolución judicial y el
  // usuario está en Contestación.
  const judgmentSourceAdvisory = judgmentSourceNeedsAppeal
    ? 'El documento parece ser una resolución judicial, no una demanda. Para impugnarla puedes continuar como Apelación.'
    : null;

  /* Instrucción enriquecida para el motor jurídico */
  const buildContestacionInstruction = (): string => {
    if (appealReview) return customPrompt.trim(); // No inherited demand/labor findings in appeal requests.
    const parts: string[] = [];
    if (customPrompt.trim()) {
      parts.push(`INSTRUCCIONES DE DEFENSA DEL ABOGADO:\n${customPrompt.trim()}`);
    }
    if (caseAnalysis.claims.length > 0) {
      parts.push(`PRESTACIONES IDENTIFICADAS EN LA DEMANDA:\n${caseAnalysis.claims.join('\n')}`);
    }
    if (caseAnalysis.facts.length > 0) {
      parts.push(`HECHOS IDENTIFICADOS EN LA DEMANDA:\n${caseAnalysis.facts.map((f) => `${f.number}. ${f.text}`).join('\n')}`);
    }
    return parts.join('\n\n');
  };

  const handleTriggerGenerate = () => {
    if (generationBlockReason) return;
    const effectiveDocType = selectedDocOption.value === 'redaccion_libre' ? (inferredSourceType === 'SENTENCIA_AMPARO_DIRECTO' ? 'recurso_revision_amparo_directo' : (suggestedDocType || 'escrito_libre')) : selectedDocOption.value;
    const effectiveLabel = selectedDocOption.value === 'redaccion_libre' ? 'Redacción Libre — Instrucción directa' : selectedDocOption.label;
    onGenerateResponse?.({
      userInstructions: buildContestacionInstruction(),
      selectedDocumentType: effectiveDocType,
      documentTypeLabel: effectiveLabel,
      generationMode,
      pageTarget,
      uncertifiedDraftAcknowledged: showUncertifiedDrafts && responseFunctionalStatus !== 'PASS',
      ...(appealReview ? { appealConfirmation: effectiveAppealConfirmation } : {}),
      referenceDocumentId: generationMode === 'personal_template' && effectiveMachote ? effectiveMachote.id : undefined,
      referenceDocumentText: generationMode === 'personal_template' && effectiveMachote ? effectiveMachote.content || '' : undefined,
    });
  };

  const handleReviewGenerationRequirements = () => {
    const firstBlocker = generationBlockers[0];
    if (firstBlocker?.code === 'SOURCE_DOCUMENT_MISSING') {
      onUploadNewDocument?.();
      return;
    }

    const target = isAppealFlow
      ? document.querySelector<HTMLElement>('[aria-label="Resolución a impugnar"]')
      : firstBlocker?.code === 'SOURCE_DOCUMENT_INCOMPATIBLE'
        ? document.querySelector<HTMLElement>('[data-testid="source-incompatible-notice"]')
        : firstBlocker?.code === 'TYPE_NOT_DRAFT_CAPABLE'
          ? document.querySelector<HTMLElement>('[aria-label="En desarrollo (sin certificar)"]')
          : document.querySelector<HTMLElement>('[data-testid="contestaciones-config-panel"]');

    target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    const firstControl = target?.matches('input, select, textarea, button')
      ? target
      : target?.querySelector<HTMLElement>('input:not([type="checkbox"]), select, textarea, button');
    firstControl?.focus({ preventScroll: true });
  };

  return (
    <div className="contestaciones-desktop-workspace w-full min-w-0" data-testid="legal-desktop-workspace">
      {/* Header */}
      <header className="lex-page-header">
        <div className="lex-page-heading">
          <h1 className="lex-page-title">Contestaciones y recursos</h1>
          <p className="lex-page-subtitle">Analiza el documento oficial y genera el escrito jurídico para revisión profesional.</p>
        </div>
        <div className="lex-page-actions">
          <button type="button" className="lex-button lex-button-secondary" onClick={() => window.dispatchEvent(new CustomEvent('open-legal-chat'))}>
            Asistente legal
          </button>
          <button
            type="button"
            className="lex-button lex-button-secondary"
            data-testid="toggle-document-inspector"
            aria-controls="document-inspector"
            aria-expanded={isInspectorOpen}
            onClick={() => setIsInspectorOpen((open) => !open)}
          >
            {isInspectorOpen ? 'Ocultar panel de datos' : 'Mostrar panel de datos'}
          </button>
        </div>
      </header>

      {/* Pasos del flujo con su estado real */}
      <ol className="lex-stepper" aria-label="Progreso">
        {[
          {
            title: 'Documento fuente',
            detail: selectedDoc ? 'Cargado' : 'Carga el documento',
            status: contestacionesSteps[0].status,
          },
          {
            title: 'Análisis',
            detail: !selectedDoc ? 'Pendiente' : analysisAvailable ? 'Información extraída' : 'Analizando…',
            status: contestacionesSteps[1].status === 'BLOCKED' && analysisAvailable ? 'COMPLETED' : contestacionesSteps[1].status,
          },
          {
            title: 'Generación',
            detail: isGenerating
              ? 'Generando borrador…'
              : generationJob?.status === 'completed'
                ? 'Borrador listo'
                : selectedDoc ? 'Elige la actuación y genera' : 'Pendiente',
            status: generationJob?.status === 'completed' ? 'COMPLETED' : contestacionesSteps[2].status,
          },
        ].map((step, index) => (
          <li key={step.title} className={`lex-step is-${String(step.status).toLowerCase()}`} aria-current={step.status === 'ACTIVE' ? 'step' : undefined}>
            <span className="lex-step-number">{step.status === 'COMPLETED' ? '✓' : index + 1}</span>
            <span className="lex-step-text">
              <span className="lex-step-title">{step.title}</span>
              <span className="lex-step-detail">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* Main Grid: Left Column & Right Column */}
      <div className="contestaciones-layout-grid grid items-start gap-4 lg:gap-5" data-testid="legal-workspace-grid" data-inspector-open={isInspectorOpen}>
        {/* LEFT COLUMN */}
        <main className="contestaciones-main-column min-w-0 space-y-4" data-testid="document-canvas" aria-label="Documento fuente">
          {/* Documento fuente */}
          <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs transition hover:border-slate-300/80">
            {!selectedDoc ? (
                <div className="p-4">
                  <div className="flex min-h-[560px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-[#F8FAFC] p-8 text-center transition hover:bg-slate-50 lg:min-h-[620px]">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 shadow-xs">
                    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <h3 className="mt-4 text-base md:text-lg font-bold text-slate-900">
                    Arrastra o selecciona el documento base
                  </h3>
                    <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
                    Sube una demanda, acuerdo, notificación o escrito inicial en PDF o DOCX para iniciar el análisis jurídico automático.
                  </p>

                  {onUploadNewDocument && (
                    <button
                      type="button"
                      onClick={onUploadNewDocument}
                      className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#0B2545] px-5 py-3 text-sm font-bold text-white shadow-xs transition hover:bg-slate-900"
                    >
                      <span>Subir documento</span>
                      <span>→</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Document Metadata sub-bar */}
                <div className="lex-doc-bar">
                  <div className="lex-doc-identity">
                    <span className={`lex-doc-badge ${isPdfDoc ? 'is-pdf' : 'is-doc'}`} aria-hidden="true">{isPdfDoc ? 'PDF' : 'DOC'}</span>
                    <div className="min-w-0">
                      <p className="lex-doc-name" title={selectedDoc.name}>{selectedDoc.name}</p>
                      <p className="lex-doc-meta">
                        {totalPages} página{totalPages === 1 ? '' : 's'} · {formatContestacionesFileSize(selectedSourceDoc?.fileSizeBytes)} · Cargado el {formatDocDate(selectedDoc.uploadedAt || (selectedSourceDoc as any)?.uploadedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="lex-doc-actions">
                    <div className="lex-segmented" role="group" aria-label="Vista del documento">
                      <button type="button" aria-pressed={viewMode === 'original'} onClick={() => setViewMode('original')}>Vista original</button>
                      <button type="button" aria-pressed={viewMode === 'structure'} onClick={() => setViewMode('structure')}>Texto extraído</button>
                    </div>
                    {onUploadNewDocument && (
                      <button type="button" onClick={onUploadNewDocument} className="lex-button lex-button-secondary">
                        Reemplazar documento
                      </button>
                    )}
                  </div>
                </div>

                {/* Viewer Body */}
                <div className="contestaciones-document-viewer min-w-0 bg-white">
                  {/* Toolbar */}
                  <div className="contestaciones-document-toolbar lex-viewer-toolbar">
                    <div className="lex-pager" role="group" aria-label="Páginas">
                      <button
                        type="button"
                        onClick={() => setActivePage((prev) => Math.max(1, prev - 1))}
                        disabled={safeActivePage <= 1}
                        className="lex-icon-button"
                        aria-label="Página anterior"
                      >
                        ←
                      </button>
                      <span className="lex-pager-label">Página {safeActivePage} de {totalPages}</span>
                      <button
                        type="button"
                        onClick={() => setActivePage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={safeActivePage >= totalPages}
                        className="lex-icon-button"
                        aria-label="Página siguiente"
                      >
                        →
                      </button>
                    </div>

                    <details className="lex-menu">
                      <summary className="lex-button lex-button-secondary" aria-label="Más acciones del documento">Más acciones</summary>
                      <div className="lex-menu-list" role="menu">
                        {hasFileUrl && isPdfDoc && (
                          <a role="menuitem" href={selectedDoc.fileUrl} target="_blank" rel="noreferrer">Abrir en otra pestaña</a>
                        )}
                        <button type="button" role="menuitem" onClick={handleCopyForChat}>Copiar texto extraído</button>
                        <button type="button" role="menuitem" onClick={handleExportTxtForChat}>Descargar texto (.txt)</button>
                        <button type="button" role="menuitem" onClick={handleSendToChat}>Enviar al asistente jurídico</button>
                      </div>
                    </details>
                    {copyFeedback && <span className="lex-feedback" role="status">{copyFeedback}</span>}
                  </div>

                  <div className="contestaciones-document-preview h-[62vh] min-h-[440px] max-h-[820px] bg-white lg:h-[74vh] lg:min-h-[600px]">
                    {viewMode === 'original' && hasFileUrl && isPdfDoc ? (
                      <object
                        key={`${selectedDoc.id}:${safeActivePage}`}
                        data={`${selectedDoc.fileUrl}#page=${safeActivePage}&toolbar=0&navpanes=0&view=FitH`}
                        type="application/pdf"
                        className="contestaciones-document-pdf-viewport"
                      >
                        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                          <p className="text-sm font-semibold text-slate-700">
                            Tu navegador no puede previsualizar este PDF directamente.
                          </p>
                          <a
                            href={selectedDoc.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-xl bg-[#0B2545] px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-900"
                          >
                            Abrir documento
                          </a>
                        </div>
                      </object>
                    ) : (
                      <div className="contestaciones-document-text-viewport h-full overflow-y-auto bg-slate-50/70 p-5">
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
                          <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
                            <p className="text-xs font-bold text-slate-700">
                              Texto extraído - Página {safeActivePage}
                            </p>
                            {activePageObj?.chars ? (
                              <span className="text-[11px] font-mono text-slate-400">
                                {activePageObj.chars.toLocaleString()} caracteres
                              </span>
                            ) : null}
                          </div>

                          <div className="whitespace-pre-wrap font-serif text-[13px] leading-7 text-slate-800">
                            {activePageObj?.text || 'Sin texto disponible en esta página.'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Documentos del expediente: solo cuando hay más de uno entre los que elegir */}
          {documents.length > 1 && (
          <section className="lex-card">
            <div className="mb-3 flex items-center border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="lex-card-title">
                  Documentos del expediente
                </h3>
              </div>

            </div>

            {documents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-xs text-slate-400">
                Aún no has cargado documentos para este expediente.
              </div>
            ) : (
                <div className="space-y-1.5">
                {documents.map((doc) => {
                  const isSelected = doc.id === selectedDoc?.id;
                  const isPdf =
                    doc.type?.toLowerCase().includes('pdf') ||
                    doc.name.toLowerCase().endsWith('.pdf');
                  const source = sourceDocs.find((s) => s.id === doc.id);
                  const sizeStr = formatContestacionesFileSize(source?.fileSizeBytes);
                  const dateStr = formatDocDate(doc.uploadedAt || (source as any)?.uploadedAt);

                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => {
                        onSelectDocument(doc);
                        setActivePage(1);
                      }}
                      className={`flex w-full items-center justify-between gap-4 rounded-lg border px-3.5 py-3 text-left transition ${
                        isSelected
                          ? 'border-blue-200 bg-blue-50/60 shadow-2xs'
                          : 'border-slate-200/80 bg-white hover:bg-slate-50/70'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${
                            isPdf
                              ? 'bg-red-50 text-red-700 border border-red-100'
                              : 'bg-blue-50 text-blue-700 border border-blue-100'
                          }`}
                        >
                          {isPdf ? 'PDF' : 'DOC'}
                        </div>

                        <div className="min-w-0">
                          <p
                            className="truncate text-sm font-bold text-slate-800"
                            title={doc.name}
                          >
                            {doc.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            {sizeStr} • {dateStr}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-500">
                          {doc.documentType || 'Documento jurídico'}
                        </span>
                        {isSelected ? (
                          <span className="rounded-md bg-[#0B2545] px-2 py-0.5 text-[10px] font-bold text-white">
                            Activo
                          </span>
                        ) : (
                          <span className="text-slate-300 text-sm">⋮</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
          )}

        </main>

        {/* RIGHT COLUMN */}
        <aside id="document-inspector" className="contestaciones-side-column min-w-0 space-y-3.5" data-testid="document-inspector" aria-label="Inspector del expediente" aria-hidden={!isInspectorOpen} hidden={!isInspectorOpen}>
          <div className="contestaciones-inspector-scroll">
          <ContestacionesConfigPanel
            selectedDocumentType={selectedResponseType}
            onDocumentTypeChange={(val) => {
              setAppealConfirmation(undefined);
              userHasManuallyChangedDocTypeRef.current = true;
              setSelectedResponseType(val);
            }}
            documentTypeOptions={documentTypeOptions}
            generationMode={generationMode}
            onGenerationModeChange={setGenerationMode}
            pageTarget={pageTarget}
            onPageTargetChange={changePageTarget}
            customTemplates={customTemplates}
            selectedTemplateId={selectedMachoteId}
            onSelectTemplateId={setSelectedMachoteId}
            userInstructions={customPrompt}
            onUserInstructionsChange={setCustomPrompt}
            disabled={isGenerating}
            showUncertifiedDrafts={showUncertifiedDrafts}
            onShowUncertifiedDraftsChange={setShowUncertifiedDrafts}
            onUploadTemplate={onUploadTemplate}
          />
          <ContestacionesChecklist
            appealMode={Boolean(appealReview)}
            hasDocument={Boolean(selectedDoc)}
            analysisCompleted={analysisAvailable || hasDirectInstruction}
            configDefined={Boolean(selectedResponseType)}
            isGenerating={isGenerating}
            generationJob={generationJob}
            blockReason={generationBlockReason}
            // ÚNICA fuente de bloqueo: el botón depende de `generationBlockers`.
            isIncompatible={false}
            onReviewRequirements={handleReviewGenerationRequirements}
            onGenerate={handleTriggerGenerate}
            onOpenEditor={selectedDoc ? onOpenEditor : undefined}
            actionLabel={generateActionLabel}
          />
          {appealReview && <AppealResolutionReviewPanel key={`${selectedResponseType}:${appealReview.sourceFingerprint}`} review={appealReview} detectedExpediente={caseFicha?.expediente} onChange={setAppealConfirmation} disabled={isGenerating} />}
          {!selectedDoc && (
            <section className="lex-card lex-empty-state" aria-label="Sin documento">
              <h2 className="lex-card-title">Sin documento cargado</h2>
              <p>Carga la demanda o resolución en PDF o DOCX. Aquí verás el expediente, las partes, el órgano y lo que requiere revisión.</p>
            </section>
          )}
          {selectedDoc && (
            <ContestacionesExpedienteCard
              caseFicha={appealFicha || caseFicha}
              fieldStatuses={appealFichaStatuses}
              caseAnalysis={appealReview ? null : caseAnalysis}
              inferredMatter={appealReview ? null : inferredMatter}
              documentTypeLabel={humanSourceDocumentType(inferredSourceType)}
              readiness={generationBlockReason
                ? { label: 'Requiere revisión', tone: 'warning' }
                : analysisAvailable ? { label: 'Listo para generar', tone: 'success' } : undefined}
            />
          )}

          {currentDocCompatibility.compatible && currentDocCompatibility.advisories?.map((advisory) => (
            <p key={advisory.code} role="note" data-testid="compatibility-advisory" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950">
              {advisory.message}
            </p>
          ))}

          {judgmentSourceNeedsAppeal && (
            <section role="alert" data-testid="source-incompatible-notice" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-bold">Este documento parece ser una resolución judicial, no una demanda.</p>
              <p className="mt-1">Para elaborar una contestación carga la demanda. Si deseas impugnar esta resolución, cambia a Apelación.</p>
              <button
                type="button"
                className="mt-2 rounded-lg border border-amber-400 bg-white px-3 py-1.5 font-semibold"
                onClick={() => {
                  setShowUncertifiedDrafts(true);
                  if (suggestedDocType && /^(?:apelacion_|recurso_(?:revision|queja|reclamacion))/i.test(suggestedDocType)) {
                    userHasManuallyChangedDocTypeRef.current = true;
                    setSelectedResponseType(suggestedDocType);
                  }
                }}
              >
                Cambiar a Apelación
              </button>
            </section>
          )}

          {appealReview ? <section className="lex-card"><h2 className="lex-card-title">Análisis de la apelación</h2><p className="lex-empty-note">No aplica todavía: se construirá en la fase de razonamientos y agravios</p></section> : selectedDoc && <ContestacionesAnalysisPanel
            hasDocument={Boolean(selectedDoc)}
            analysisAvailable={analysisAvailable}
            caseAnalysis={caseAnalysis}
            pageCount={totalPages}
          />}


          {appealCandidates && <AppealReasoningAiReview key={appealCandidates.bindingKey} review={appealCandidates} />}
          </div>
        </aside>
      </div>

    </div>
  );
}
