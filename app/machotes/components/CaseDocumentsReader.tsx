'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { CaseDocument, UploadedSourceDocument } from '@/lib/legal-engine/types';
import { reconstructCaseAnalysis, CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { TemplateItem } from './TemplateLibraryManager';
import type { DraftDepth } from '@/lib/legal-engine/draftDepth';
import { canGenerateDocumentDraft, getCatalogDocument, getContestacionesDocumentOptions, getFunctionalDocumentStatus } from '@/lib/catalog/legalCatalog';
import {
  evaluateSourceOutputCompatibility,
  inferSourceMatterForDocuments,
  inferSourceOutputType,
} from '@/lib/legal-engine/sourceOutputCompatibility';

import { ContestacionesExpedienteCard, type ExpedienteFichaData } from './ContestacionesExpedienteCard';
import { ContestacionesAnalysisPanel } from './ContestacionesAnalysisPanel';
import { ContestacionesConfigPanel } from './ContestacionesConfigPanel';
import { ContestacionesChecklist } from './ContestacionesChecklist';
import { WritingAvailabilityNotice } from './WritingAvailabilityNotice';
import { AppealResolutionReviewPanel } from './AppealResolutionReviewPanel';
import { AppealReasoningAiReview } from './AppealReasoningCandidatesPanel';
import { extractAppealReasoningCandidates } from '@/lib/legal-engine/case-extraction/appealReasoningCandidates';
import { extractAppealResolutionReview, isCivilFamilyAppeal, validateAppealConfirmation, type AppealConfirmation } from '@/lib/legal-engine/case-extraction/appealResolutionReview';

export interface CaseDocumentsReaderProps {
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
    generationExtension?: { generationMode: 'standard' | 'extended-legal'; targetPages?: number; minPages?: number; maxPages?: number };
    draftDepth?: DraftDepth;
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
  const [draftDepth, setDraftDepth] = useState<DraftDepth>('PROFESSIONAL_20');
  const [selectedMachoteId, setSelectedMachoteId] = useState<string>('');
  const [appealConfirmation, setAppealConfirmation] = useState<AppealConfirmation>();
  const appealReview = useMemo(() => isCivilFamilyAppeal(selectedResponseType) ? extractAppealResolutionReview(sourceDocs) : undefined, [sourceDocs, selectedResponseType]);
  useEffect(() => { setAppealConfirmation(undefined); }, [selectedResponseType, appealReview?.sourceFingerprint]);
  const confirmedAppeal = appealReview ? validateAppealConfirmation(appealReview, appealConfirmation) : undefined;
  const appealCandidates = useMemo(() => appealReview && appealConfirmation && validateAppealConfirmation(appealReview, appealConfirmation).eligible
    ? extractAppealReasoningCandidates(sourceDocs, { documentType: selectedResponseType, resolution: validateAppealConfirmation(appealReview, appealConfirmation).selected!, parties: appealConfirmation.parties, representedNames: appealConfirmation.representedNames, sourceFingerprint: appealReview.sourceFingerprint }) : undefined,
  [appealReview, appealConfirmation, sourceDocs, selectedResponseType]);
  const pendingAppealField = 'Pendiente de confirmar en el paso 1';
  const appealFicha = appealReview ? {
    expediente: pendingAppealField,
    actor: confirmedAppeal?.eligible ? appealConfirmation!.parties.filter(p => p.role === 'actor').map(p => p.name).join('; ') || pendingAppealField : pendingAppealField,
    demandado: confirmedAppeal?.eligible ? appealConfirmation!.parties.filter(p => p.role === 'demandado').map(p => p.name).join('; ') || pendingAppealField : pendingAppealField,
    autoridad: confirmedAppeal?.eligible ? confirmedAppeal.selected!.court : pendingAppealField,
    materia: confirmedAppeal?.eligible ? selectedResponseType.includes('familiar') ? 'Familiar' : 'Civil' : pendingAppealField,
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
    return undefined;
  }, [inferredSourceType, inferredMatter, isJudgmentSource]);

  useEffect(() => {
    if (suggestedDocType && getFunctionalDocumentStatus(suggestedDocType) === 'PASS' && !userHasManuallyChangedDocTypeRef.current) {
      setSelectedResponseType(suggestedDocType);
    }
  }, [suggestedDocType]);

  const checkDocCompatibility = useCallback(
    (docType: string): { compatible: boolean; reason?: string } => {
      // Redacción Libre acepta cualquier fuente intencionalmente
      if (docType === 'redaccion_libre') {
        return { compatible: true };
      }
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
    },
    [sourceDocs]
  );

  const currentDocCompatibility = useMemo(() => {
    return checkDocCompatibility(selectedResponseType);
  }, [checkDocCompatibility, selectedResponseType]);

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
    if (selectedMachoteId && compatibleMachotes.some((m) => m.id === selectedMachoteId)) {
      return compatibleMachotes.find((m) => m.id === selectedMachoteId) || null;
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
  const requestedResponseType = selectedResponseType === 'redaccion_libre' ? suggestedDocType || 'escrito_libre' : selectedResponseType;
  const responseFunctionalStatus = getFunctionalDocumentStatus(requestedResponseType);
  // ¿La resolución a impugnar ya fue seleccionada y confirmada en el paso 1?
  const appealResolutionConfirmed = Boolean(confirmedAppeal?.eligible);
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
    // Requisitos EXCLUSIVOS de Apelación.
    if (!appealReview) {
      generationBlockers.push({
        code: 'APPEAL_RESOLUTION_NOT_DETECTED', flow: 'appeal', actionable: true, step: 1,
        label: 'Selecciona la resolución que deseas impugnar.',
      });
    } else if (!appealResolutionConfirmed) {
      generationBlockers.push({
        code: 'APPEAL_CONFIRMATION_PENDING', flow: 'appeal', actionable: true, step: 1,
        label: 'Confirma las partes, el destinatario y la fecha de notificación de la resolución a impugnar.',
      });
    }
  } else {
    // Requisitos EXCLUSIVOS de Contestación. La fuente judicial no aparece
    // aquí: se reporta como aviso con opción de cambiar a Apelación.
    const contestacionReason = getContestacionesGenerationBlockReason({
      hasDocument: Boolean(selectedDoc),
      // Con una fuente judicial el veto de compatibilidad se muestra como aviso
      // con opción de cambiar a Apelación; la incompatibilidad real la sigue
      // aplicando el gate de servidor (sourceOutputCompatibility), que es
      // fail-closed. La UI no duplica ese bloqueo.
      compatible: judgmentSourceNeedsAppeal ? true : currentDocCompatibility.compatible,
      compatibilityReason: currentDocCompatibility.reason,
      generationMode,
      hasCompatibleTemplate: compatibleMachotes.length > 0,
      hasReferenceDocument: false,
    });
    if (contestacionReason) {
      generationBlockers.push({
        code: 'CONTESTACION_REQUIREMENT', flow: 'contestacion', actionable: true, step: 1,
        label: contestacionReason,
      });
    }
  }

  const generationBlockReason = generationBlockers.length ? generationBlockers.map(b => b.label).join(' ') : null;
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
      draftDepth,
      uncertifiedDraftAcknowledged: showUncertifiedDrafts && responseFunctionalStatus !== 'PASS',
      ...(appealReview ? { appealConfirmation } : {}),
      referenceDocumentId: generationMode === 'personal_template' && effectiveMachote ? effectiveMachote.id : undefined,
      referenceDocumentText: generationMode === 'personal_template' && effectiveMachote ? effectiveMachote.content || '' : undefined,
    });
  };

  return (
    <div className="w-full min-w-0 px-3 py-3 sm:px-4 lg:px-0 xl:py-4 space-y-3 lg:space-y-4">
      {/* Header */}
      <section className="space-y-3">
        <div className="contestaciones-page-header flex flex-col gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 lg:text-[28px]">
              Contestaciones y recursos
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Analiza el documento fuente, configura la respuesta y genera un borrador profesional.
            </p>
          </div>

          <div className="hidden md:flex items-center gap-2 pt-2 text-xs font-medium text-slate-400">
            <span>La tecnología al servicio de la justicia</span>
            <span className="h-[1px] w-6 bg-amber-400" />
          </div>
        </div>

        {/* Stepper horizontal inline */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {/* Step 1 */}
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0B2545] text-sm font-bold text-white shadow-xs">
                1
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900">1. Documento fuente</p>
                <p className="text-[11px] text-slate-400">Carga y revisa el documento</p>
              </div>
            </div>

            <div className="hidden sm:block h-[1px] w-8 md:w-12 bg-slate-200" />

            {/* Step 2 */}
            <div className="flex items-center gap-2.5">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                contestacionesSteps[1].status === 'COMPLETED'
                  ? 'bg-[#0B2545] text-white'
                  : contestacionesSteps[1].status === 'ACTIVE'
                    ? 'border-2 border-[#0B2545] bg-white text-[#0B2545]'
                    : 'border border-slate-200 bg-white text-slate-400'
              }`}>
                2
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">2. Análisis</p>
                <p className="text-[11px] text-slate-400">IA analiza el contenido</p>
              </div>
            </div>

            <div className="hidden sm:block h-[1px] w-8 md:w-12 bg-slate-200" />

            {/* Step 3 */}
            <div className="flex items-center gap-2.5">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                contestacionesSteps[2].status === 'COMPLETED'
                  ? 'bg-emerald-600 text-white'
                  : contestacionesSteps[2].status === 'ACTIVE'
                    ? 'border-2 border-[#0B2545] bg-white text-[#0B2545]'
                    : 'border border-slate-200 bg-white text-slate-400'
              }`}>
                3
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">3. Generación</p>
                <p className="text-[11px] text-slate-400">Configura y genera tu escrito</p>
              </div>
            </div>
        </div>
      </section>

      {/* Main Grid: Left Column & Right Column */}
      <div className="contestaciones-layout-grid grid items-start gap-4 lg:gap-5">
        {/* LEFT COLUMN */}
        <main className="contestaciones-main-column min-w-0 space-y-4">
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
                <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${
                      isPdfDoc ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                    }`}>
                      {isPdfDoc ? 'PDF' : 'DOC'}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold text-slate-800" title={selectedDoc.name}>
                          {selectedDoc.name}
                        </p>
                        <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                          {isPdfDoc ? 'PDF' : 'DOCX'}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                          {formatContestacionesFileSize(selectedSourceDoc?.fileSizeBytes)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Cargado el {formatDocDate(selectedDoc.uploadedAt || (selectedSourceDoc as any)?.uploadedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setViewMode('original')}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                        viewMode === 'original'
                          ? 'bg-[#0B2545] text-white shadow-xs'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Vista original
                    </button>

                    <button
                      type="button"
                      onClick={() => setViewMode('structure')}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                        viewMode === 'structure'
                          ? 'bg-[#0B2545] text-white shadow-xs'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Texto extraído
                    </button>

                    {onUploadNewDocument && (
                      <button
                        type="button"
                        onClick={onUploadNewDocument}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 shadow-2xs"
                      >
                        <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <span>Reemplazar documento</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Viewer Body */}
                <div className="min-w-0 bg-white">
                  {/* Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActivePage((prev) => Math.max(1, prev - 1))}
                        disabled={safeActivePage <= 1}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                      >
                        ← Anterior
                      </button>

                      <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
                        Página {safeActivePage} de {totalPages}
                      </span>

                      <button
                        type="button"
                        onClick={() => setActivePage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={safeActivePage >= totalPages}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                      >
                        Siguiente →
                      </button>

                      <span className="ml-1 text-sm text-slate-400">
                        ({totalPages} página{totalPages === 1 ? '' : 's'})
                      </span>
                    </div>

                    {hasFileUrl && isPdfDoc && (
                      <a
                        href={selectedDoc.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 transition hover:text-[#0B2545]"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        <span>Abrir aparte</span>
                      </a>
                    )}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopyForChat}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                        title="Copiar texto extraído para pegar en ChatGPT/Asistente"
                      >
                        📋 Copiar
                      </button>
                      <button
                        type="button"
                        onClick={handleExportTxtForChat}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                        title="Descargar texto extraído como .txt para chat"
                      >
                        ⬇ TXT
                      </button>
                      <button
                        type="button"
                        onClick={handleSendToChat}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#0B2545] px-2.5 py-2 text-xs font-bold text-white hover:bg-slate-900 transition"
                        title="Enviar texto al Asistente Jurídico interno"
                      >
                        💬 Chat
                      </button>
                    </div>
                    {copyFeedback && <span className="text-xs font-medium text-emerald-600">{copyFeedback}</span>}
                  </div>

                  <div className="contestaciones-document-preview h-[62vh] min-h-[440px] max-h-[820px] bg-white lg:h-[74vh] lg:min-h-[600px]">
                    {viewMode === 'original' && hasFileUrl && isPdfDoc ? (
                      <object
                        data={`${selectedDoc.fileUrl}#page=${safeActivePage}&toolbar=0&navpanes=0&view=FitH`}
                        type="application/pdf"
                        className="block h-full w-full"
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
                      <div className="h-full overflow-y-auto bg-slate-50/70 p-5">
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

          {/* Documentos recientes */}
          <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs transition hover:border-slate-300/80">
            <div className="mb-3 flex items-center border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Documentos recientes
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
        </main>

        {/* RIGHT COLUMN */}
        <aside className="contestaciones-side-column min-w-0 space-y-3.5">
          <div className="contestaciones-assistance-banner flex items-start gap-3 rounded-xl border border-amber-200/80 bg-[#FFFBEB] px-3.5 py-3 shadow-xs">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l1.9 5.8L20 10.7l-6.1 1.9L12 18.5l-1.9-5.9L4 10.7l6.1-1.9L12 3z" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-900">Asistencia jurídica</p>
              <p className="mt-0.5 text-xs leading-snug text-amber-800/90">
                Obtén análisis, sugerencias y borradores con base en la legislación mexicana y criterios jurisprudenciales.
              </p>
            </div>
          </div>

        <ContestacionesExpedienteCard
            caseFicha={appealFicha || caseFicha}
            caseAnalysis={appealReview ? null : caseAnalysis}
            inferredMatter={appealReview ? null : inferredMatter}
          />

          <WritingAvailabilityNotice
            surface="Contestaciones"
            showUncertifiedDrafts={showUncertifiedDrafts}
            onShowUncertifiedDraftsChange={setShowUncertifiedDrafts}
          />

          {appealReview ? <section className="rounded-xl border border-slate-200 bg-white p-3.5"><h2 className="text-base font-bold">Análisis de la apelación</h2><p className="text-sm text-slate-600">No aplica todavía: se construirá en la fase de razonamientos y agravios</p></section> : <ContestacionesAnalysisPanel
            hasDocument={Boolean(selectedDoc)}
            analysisAvailable={analysisAvailable}
            caseAnalysis={caseAnalysis}
          />}

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
            draftDepth={draftDepth}
            onDraftDepthChange={setDraftDepth}
            customTemplates={customTemplates}
            selectedTemplateId={selectedMachoteId}
            onSelectTemplateId={setSelectedMachoteId}
            userInstructions={customPrompt}
            onUserInstructionsChange={setCustomPrompt}
            disabled={isGenerating}
          />

          {isJudgmentSource && !selectedOutputIsAppeal && (
            <section role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-bold">La fuente es una sentencia o resolución, no una demanda.</p>
              <p className="mt-1">Para contestar, carga la demanda. Si buscas impugnar esta resolución, cambia a Apelación y confirma sus datos antes de generar.</p>
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

          {appealReview && <AppealResolutionReviewPanel key={`${selectedResponseType}:${appealReview.sourceFingerprint}`} review={appealReview} onChange={setAppealConfirmation} disabled={isGenerating} />}
          {appealCandidates && <AppealReasoningAiReview key={appealCandidates.bindingKey} review={appealCandidates} />}
          <ContestacionesChecklist
            appealMode={Boolean(appealReview)}
            hasDocument={Boolean(selectedDoc)}
            analysisCompleted={analysisAvailable || hasDirectInstruction}
            configDefined={Boolean(selectedResponseType)}
            isGenerating={isGenerating}
            generationJob={generationJob}
            blockReason={generationBlockReason}
            // ÚNICA fuente de bloqueo: el botón depende de `generationBlockers`.
            // Una incompatibilidad que ya se reporta como aviso (p. ej. fuente
            // judicial en Contestación, con opción de cambiar a Apelación) no
            // puede seguir deshabilitando por la vía oculta.
            isIncompatible={!effectiveCompatible && !judgmentSourceNeedsAppeal}
            onGenerate={handleTriggerGenerate}
            onOpenEditor={onOpenEditor}
          />
        </aside>
      </div>

    </div>
  );
}
