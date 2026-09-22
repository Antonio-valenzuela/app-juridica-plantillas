'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WorkspaceDocumentEditor } from './components/WorkspaceDocumentEditor';
import { WorkspaceDraftGeneratorModal } from './components/WorkspaceDraftGeneratorModal';
import { TemplateLibraryManager, TemplateItem } from './components/TemplateLibraryManager';
import { CaseDocumentsReader } from './components/CaseDocumentsReader';
import { LawyerStyleProfileCard } from './components/LawyerStyleProfileCard';
import { GenerationStatusBar, GenerationStatusData } from './components/GenerationStatusBar';
type GenerationFlowLabel = 'documento' | 'contestacion' | 'recurso' | 'escrito_inicial' | 'universal';
import { SaveCustomTemplateModal } from '@/components/machotes/SaveCustomTemplateModal';
import { EditCustomTemplateModal } from '@/components/machotes/EditCustomTemplateModal';

import type {
  UniversalLegalDocument,
  UploadedSourceDocument,
  CaseDocument,
  TemplateVersion,
  DocumentPage,
  DocumentNode,
  ContentBlock,
  GenerationMode,
  WritingIntake,
} from '@/lib/legal-engine/types';
import { reconstructCaseAnalysis, type CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { markDocumentAsDraft, markDocumentAsSource, markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { analyzeWritingRequest, buildWritingWorkflow } from '@/lib/legal-engine/writingIntake';
import { extractPartyField, extractAuthorityLabeled, extractInstitutionalAuthority } from '@/lib/legal-engine/partyExtraction';
import { useLegalWorkspaceContext } from '@/context/LegalWorkspaceContext';
import { buildWorkspaceSnapshot, applyLegalEdits } from '@/lib/workspace/legalEditContract';
import { MATTERS, JURISDICTIONS, DOCUMENT_TYPES, CUSTOM_VALUE_MAX_LENGTH, sanitizeCustomValue } from '@/lib/legal-taxonomy';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { TaxonomySelect } from '@/components/legal-taxonomy/TaxonomySelect';
import { LegalCatalogNavigator } from '@/components/legal-taxonomy/LegalCatalogNavigator';
import {
  classifyGenerationStatusException,
  parseGenerationStatusResponse,
} from '@/lib/legal-engine/generationPolling';
import { normalizeLegalDocumentText } from '@/lib/text/normalizeLegalDisplayText';
import { formatExportIssues } from '@/lib/legal-engine/exportErrors';
import { extractDownloadFilename, resolveDocumentOutputFilename } from '@/lib/legal-engine/outputFilename';
import { analyzePersonalTemplateText } from '@/lib/templates/personalTemplateBuilder';
import { markTemplateAsUserOwned } from '@/lib/templates/templateOrigin';
import type { ProfessionalTemplate } from '@/lib/templates/templateTypes';
import { resolveSelectedDocumentType } from '@/lib/legal-taxonomy/pipelineSelection';
import {
  deleteCustomTemplate,
  getCustomTemplates,
  saveTemplateWithPersistenceStatus,
} from '@/lib/templates/customTemplateStore';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { createGenerationIdentityFactory } from '@/lib/legal-engine/generationIdentity';

export type LegalWorkspaceMode =
  | 'universal'
  | 'initial_writings'
  | 'responses_resources'
  | 'my-templates';

interface CaseFicha {
  expediente: string;
  actor: string;
  demandado: string;
  abogado: string;
  autoridad: string;
  fechas: string;
  materia: string;
  tipo: string;
  confianza: number;
}

type CasePartyRole =
  | 'actor'
  | 'demandado'
  | 'apoderado'
  | 'abogado_defensor'
  | 'autoridad'
  | 'tercero_interesado'
  | 'quejoso'
  | 'firmante';

interface CasePartyItem {
  id: string;
  role: string;
  name: string;
  source?: string;
  confidence?: number | null;
}

// Marca temporal para IDs de subida. Definida a nivel de módulo (fuera del ciclo de render);
// se invoca dentro de handleFileUpload en tiempo de EVENTO, una sola vez por sesión de subida.
const newUploadStampMs = () => Date.now();

const STAGES = [
  { id: 'classify', label: 'Clasificación' },
  { id: 'extract', label: 'Extracción' },
  { id: 'analyze', label: 'Análisis' },
  { id: 'structure', label: 'Estructura' },
  { id: 'identify_issues', label: 'Problemas jurídicos' },
  { id: 'generate_sections', label: 'Redacción por apartados' },
  { id: 'review_coherence', label: 'Revisión de coherencia' },
  { id: 'validate', label: 'Validación y calidad' },
];

function sanitizeClean(raw: string): string {
  if (!raw) return '';
  return normalizeLegalDocumentText(raw);
}

/** P1-2: firma ligera basada SOLO en contenido editable (sin serializar todo el doc). */
function computeDraftSignature(doc: UniversalLegalDocument): string {
  return doc.sections
    .map((section) => section.content.map((block) => block.text).join('\u001F'))
    .join('\u001E');
}

function firstMatch(text: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1] && m[1].trim().length > 1) {
      return m[1].trim().replace(/[.;:,]*$/, '');
    }
  }
  return '';
}

function detectCaseFicha(texts: string[]): CaseFicha {
  const full = texts.join('\n\n');

  const expediente =
    firstMatch(full, [
      /(?:expediente|juicio|toca|amparo\s+directo|amparo\s+indirecto|proceso)\s*[:\-]?\s*([0-9]{1,6}\s*[\/\-\.]\s*[0-9]{2,4})/i,
    ]) || firstMatch(full, [/\b(\d{1,6}\/\d{4})\b/i]);

  // Criterios COMPARTIDOS con el motor (partyExtraction.ts): mismos validadores
  // anti-fecha / anti-frase-preposicional / anti-cruce-de-oración para que la
  // ficha y el motor nunca diverjan sobre las mismas partes.
  const actor =
    extractPartyField(full, [
      /(?:actor|parte\s+actora|demandante)\s*[:\-]\s*([^;,\n]{2,90})/i,
      /(?:quejoso|persona\s+quejosa|parte\s+quejosa|promovente|accionante)\s*[:\-]\s*([^;,\n]{2,90})/i,
    ]) ||
    firstMatch(full, [/\b(?:C\.)\s+([A-ZÁÉÍÓÚÑ][a-zÁÉÍÓÚÜÑ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-zÁÉÍÓÚÜÑ]+)+)/i]) ||
    '';

  const demandado =
    extractPartyField(full, [
      /(?:demandado|parte\s+demandada|tercero\s+interesado)\s*[:\-]\s*([^;,\n]{2,90})/i,
    ]) || '';

  const abogado =
    extractPartyField(full, [
      /(?:abogado\s+(?:patrono|defensor)|apoderado\s+legal|autorizado|representante\s+legal)\s*[:\-]\s*([^;,\n]{2,90})/i,
    ]) ||
    firstMatch(full, [/\b(?:Lic\.)\s+([A-ZÁÉÍÓÚÑ][a-zÁÉÍÓÚÜÑ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-zÁÉÍÓÚÜÑ]+)+)/i]) ||
    '';

  const autoridad =
    extractAuthorityLabeled(full) ||
    extractInstitutionalAuthority(full) ||
    '';

  const fechasMatch = full.match(/(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4})|\b(\d{1,2}\/\d{1,2}\/\d{4})\b/gi);
  const fechas = fechasMatch ? Array.from(new Set(fechasMatch.map((f) => f.replace(/^,?\s*/, '')))).slice(0, 3).join(' · ') : '';

  let materia = 'Amparo';
  if (/laboral|trabajador|patr[oó]n|laudo|junta|burocr[áa]tico/i.test(full)) materia = 'Laboral';
  else if (/amparo|constitucional/i.test(full)) materia = 'Amparo';
  else if (/mercantil|comercio|cheque|pagar[ée]|t[ií]tulos\s+de\s+cr[ée]dito/i.test(full)) materia = 'Mercantil';
  else if (/civil|herencia|sucesi[oó]n|obligaciones|contrato/i.test(full)) materia = 'Civil';

  let tipo = 'Amparo Directo';
  if (/recurso\s+de\s+revisi[oó]n/i.test(full)) tipo = 'Recurso de Revisión';
  else if (/recurso\s+de\s+queja/i.test(full)) tipo = 'Recurso de Queja';
  else if (/contestaci[oó]n/i.test(full) && /demanda/i.test(full)) tipo = 'Contestación de Demanda';
  else if (/amparo\s+directo/i.test(full)) tipo = 'Amparo Directo';
  else if (/amparo\s+indirecto/i.test(full)) tipo = 'Amparo Indirecto';

  const foundCount = [expediente, actor, demandado, abogado, autoridad, fechas].filter(Boolean).length;
  const confianza = Math.min(100, Math.round(35 + foundCount * 11));

  return { expediente, actor, demandado, abogado, autoridad, fechas, materia, tipo, confianza };
}

export default function MachotesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as LegalWorkspaceMode) || 'universal';
  const validTabs: LegalWorkspaceMode[] = ['universal', 'initial_writings', 'responses_resources', 'my-templates'];
  const [activeNavTab, setActiveNavTab] = useState<LegalWorkspaceMode>(
    validTabs.includes(initialTab) ? initialTab : 'universal'
  );
  const [universalDoc, setUniversalDoc] = useState<UniversalLegalDocument | null>(null);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [activeSection, setActiveSection] = useState<DocumentNode | null>(null);
  const [uploadedSourceDocs, setUploadedSourceDocs] = useState<UploadedSourceDocument[]>([]);
  const [caseDocuments, setCaseDocuments] = useState<CaseDocument[]>([]);
  const [selectedCaseDoc, setSelectedCaseDoc] = useState<CaseDocument | null>(null);
  const [caseFicha, setCaseFicha] = useState<CaseFicha | null>(null);
  const [caseAnalysis, setCaseAnalysis] = useState<CaseAnalysis | null>(null);
  const [savedCaseParties, setSavedCaseParties] = useState<CasePartyItem[]>([]);
  const [customTemplates, setCustomTemplates] = useState<TemplateItem[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [selectedTemplateRefText, setSelectedTemplateRefText] = useState<string>('');
  const [generationMode, setGenerationMode] = useState<GenerationMode>('automatic');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDraftGeneratorOpen, setIsDraftGeneratorOpen] = useState(false);
  const [isSaveCustomOpen, setIsSaveCustomOpen] = useState(false);
  const [editTemplateData, setEditTemplateData] = useState<any>(null);
  const [isEditCustomOpen, setIsEditCustomOpen] = useState(false);
  const [isUniversalGenerating, setIsUniversalGenerating] = useState(false);
  const [generationIdentityFactory] = useState(createGenerationIdentityFactory);
  const [pipelineStageIndex, setPipelineStageIndex] = useState(0);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const fileInputHiddenRef = useRef<HTMLInputElement>(null);
  const [isDraggingDocs, setIsDraggingDocs] = useState(false);
  const [docsUploadError, setDocsUploadError] = useState<string | null>(null);
  // Job asíncrono real X/Y
  const [activeGenJob, setActiveGenJob] = useState<{ jobId: string; total: number; completed: number; percentage: number; currentBlock: string | null; status: string; stage?: string; aiProvider?: string | null; error?: string; errorCode?: string | null; errorMetadata?: Record<string, unknown> | null } | null>(null);
  const [universalViewMode, setUniversalViewMode] = useState<'analysis' | 'editor'>('analysis');
  const genPollRef = useRef<number | null>(null);
  const genJobIdRef = useRef<string | null>(null);
  const genStatusFailureRef = useRef<number>(0);
  const genPollInFlightRef = useRef(false);
  const genIsGeneratingRef = useRef<boolean>(false);
  // Deduplicación del flujo de upload: evita doble GET cuando el efecto de caseKey
  // y el sync post-detección apuntan al mismo expediente.
  const syncedCaseKeyRef = useRef<string>('');

  /* ── P1-2: autosave de borrador (debounced, misma ruta handleSaveDraft) ── */
  const [draftSaveState, setDraftSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const latestDocRef = useRef<UniversalLegalDocument | null>(null);
  const lastSavedSignatureRef = useRef<string>('');
  const draftAutosaveTimerRef = useRef<number | null>(null);
  const isSavingDraftRef = useRef(false);
  // Indirección para que el scheduler (declarado antes) invoque siempre la
  // handleSaveDraft más reciente sin problemas de hoisting.
  const handleSaveDraftRef = useRef<((doc?: UniversalLegalDocument) => Promise<boolean>) | null>(null);

  const notify = useCallback((tone: 'success' | 'error' | 'warning', message: string) => {
    setFeedback({ tone, message });
    window.setTimeout(() => setFeedback(null), 7000);
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      // La biblioteca cambia después de crear/editar una plantilla. Evitar
      // reutilizar una respuesta GET vieja del navegador en esa transición.
      const templates = await getCustomTemplates();
      setCustomTemplates(templates.map((t: any) => ({
          id: t.id,
          name: t.title,
          category: t.category || 'General',
          documentType: typeof t.documentType === 'string' ? t.documentType : undefined,
          matterId: t.practiceArea || t.category?.toLowerCase() || 'amparo',
          version: t.version || 1,
          description: t.description || undefined,
          sourceFileName: t.sourceFileName || undefined,
          variables: Array.isArray(t.variables) ? t.variables : undefined,
          personalStructure: t.structureJson?.kind === 'personal-template' ? t.structureJson : undefined,
          // Contenido real para las previews dominantes (fallback visual del componente si viene vacío)
          content: sanitizeClean(t.content || t.originalText || '') || undefined,
          updatedAt: t.updatedAt,
        })));
    } catch (err) {
      console.warn('[templates] Error al cargar plantillas:', err instanceof Error ? err.message : err);
    }
  }, []);

  useEffect(() => {
    // Diferido un tick: la carga inicial de plantillas no necesita bloquear el commit del mount.
    const t = window.setTimeout(loadTemplates, 0);
    return () => window.clearTimeout(t);
  }, [loadTemplates]);

  /* ── Partes del expediente (CaseParty): carga, sync de detección y guardado manual ── */
  // Fuente única de la regla caseKey: expediente detectado, o id del primer documento subido.
  const getActiveCaseKey = (fichaOverride?: CaseFicha | null, docsOverride?: UploadedSourceDocument[]): string => {
    const ficha = fichaOverride !== undefined ? fichaOverride : caseFicha;
    const docs = docsOverride !== undefined ? docsOverride : uploadedSourceDocs;
    return ficha?.expediente || docs[0]?.id || '';
  };

  const refreshPartiesFromDb = useCallback(async (caseKey: string): Promise<CasePartyItem[]> => {
    if (!caseKey) return [];
    try {
      const res = await fetch(`/api/legal-engine/parties?caseKey=${encodeURIComponent(caseKey)}`);
      const data = await res.json();
      if (!data?.ok || !Array.isArray(data.parties)) return [];
      const parties: CasePartyItem[] = data.parties;
      // Reemplazo completo: el estado local siempre refleja exactamente lo persistido.
      setSavedCaseParties(parties);
      return parties;
    } catch (err) {
      console.warn('[parties] No se pudieron cargar las partes guardadas:', err);
      return [];
    }
  }, []);

  // A3: la detección regex existente sigue siendo el primer filtro; sus resultados
  // se persisten como source 'detected'. El servidor garantiza manual > detected.
  const persistDetectedFicha = async (ficha: CaseFicha, docs: UploadedSourceDocument[]) => {
    const caseKey = getActiveCaseKey(ficha, docs);
    if (!caseKey) return;
    syncedCaseKeyRef.current = caseKey;
    const detected: Array<{ role: CasePartyRole; name: string }> = [];
    if (ficha.actor) detected.push({ role: 'actor', name: ficha.actor });
    if (ficha.demandado) detected.push({ role: 'demandado', name: ficha.demandado });
    if (ficha.abogado) detected.push({ role: 'abogado_defensor', name: ficha.abogado });
    if (ficha.autoridad) detected.push({ role: 'autoridad', name: ficha.autoridad });
    try {
      await Promise.all(detected.map((p) =>
        fetch('/api/legal-engine/parties', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseKey, role: p.role, name: p.name, source: 'detected', confidence: ficha.confianza }),
        }).catch(() => null)
      ));
    } finally {
      await refreshPartiesFromDb(caseKey);
    }
  };

  // A4: al confirmar una edición (blur) la parte queda como source 'manual'.
  const savePartyManual = async (role: CasePartyRole, name: string): Promise<void> => {
    const caseKey = getActiveCaseKey();
    if (!caseKey) return;
    try {
      const res = await fetch('/api/legal-engine/parties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseKey, role, name, source: 'manual' }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'No se pudo guardar la parte.');
      setSavedCaseParties((prev) => {
        if (data.deleted && !data.party) return prev.filter((p) => p.role !== role);
        if (data.party) {
          const others = prev.filter((p) => p.role !== role);
          return [...others, data.party as CasePartyItem];
        }
        return prev;
      });
    } catch (err: any) {
      console.warn('[parties] Error al guardar parte manual:', err?.message);
    }
  };

  // DB gana a la ficha detectada al mostrar los inputs; fallback solo si no hay parte persistida.
  const partyNameFor = (role: CasePartyRole, fallback: string): string => {
    const saved = savedCaseParties.find((p) => p.role === role);
    if (saved && saved.name.trim()) return saved.name;
    return fallback || '';
  };

  const activeCaseKeyValue = getActiveCaseKey();

  // Persistencia al recargar: cuando exista un caseKey válido se cargan sus partes desde DB.
  useEffect(() => {
    if (!activeCaseKeyValue) return;
    // El flujo de upload ya sincronizó y cargó este mismo caseKey (deduplicación).
    if (syncedCaseKeyRef.current === activeCaseKeyValue) return;
    setSavedCaseParties([]);
    refreshPartiesFromDb(activeCaseKeyValue);
  }, [activeCaseKeyValue, refreshPartiesFromDb]);

  const stopGenPolling = useCallback(() => {
    if (genPollRef.current) window.clearInterval(genPollRef.current);
    genPollRef.current = null;
  }, []);

  const [isCancelling, setIsCancelling] = useState(false);
  const handleCancelGeneration = useCallback(async () => {
    const jobId = genJobIdRef.current || activeGenJob?.jobId;
    if (!jobId) return;
    setIsCancelling(true);
    try {
      await fetch('/api/legal-engine/generate/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      notify('warning', 'Cancelando generación…');
    } catch (e) {
      console.warn('[cancel] Error:', e);
      notify('error', 'No se pudo cancelar la generación.');
    } finally {
      window.setTimeout(() => setIsCancelling(false), 2000);
    }
  }, [activeGenJob, notify]);

  const startGenPolling = useCallback((jobId: string) => {
    // Un solo polling por Job — limpiar intervalo previo y resetear errores.
    stopGenPolling();
    genJobIdRef.current = jobId;
    genStatusFailureRef.current = 0;

    const clearStoredGeneration = () => {
      try {
        localStorage.removeItem('jr_active_gen_job');
        localStorage.removeItem('jr_active_gen_flow');
      } catch { /* noop */ }
    };

    const stopWithStatusError = (message: string) => {
      stopGenPolling();
      clearStoredGeneration();
      setIsUniversalGenerating(false);
      genIsGeneratingRef.current = false;
      setActiveGenJob({
        jobId,
        total: 0,
        completed: 0,
        percentage: 0,
        currentBlock: null,
        status: 'failed',
        stage: 'Consulta de progreso detenida',
        error: message,
      });
      notify('error', message);
    };

    genPollRef.current = window.setInterval(async () => {
      if (genPollInFlightRef.current) return;
      genPollInFlightRef.current = true;
      try {
        const r = await fetch(`/api/legal-engine/generate/status?jobId=${encodeURIComponent(jobId)}`);
        const result = parseGenerationStatusResponse(
          r.status,
          await r.text(),
          genStatusFailureRef.current
        );

        if (result.kind === 'retry') {
          genStatusFailureRef.current = result.consecutiveFailures;
          console.warn(`[polling] Consulta de progreso fallida (${result.consecutiveFailures}/3) para jobId:${jobId.slice(0, 8)}`);
          return;
        }

        if (result.kind === 'terminal-error') {
          console.error('[polling] Consulta de progreso detenida:', result.message);
          stopWithStatusError(result.message);
          return;
        }

        genStatusFailureRef.current = 0;
        const j = result.data;
        const pct = j.total > 0 ? Math.round((j.completed / j.total) * 100) : 0;
        const next = { 
          jobId: j.jobId, 
          total: j.total, 
          completed: j.completed, 
          percentage: pct, 
          currentBlock: j.currentBlock, 
          status: j.status, 
          stage: j.stage, 
          aiProvider: j.aiProvider,
          documentReadiness: j.documentReadiness || null,
          errorCode: j.errorCode || null,
          errorMetadata: j.errorMetadata || null,
        };
        setActiveGenJob(next);
        
        try { localStorage.setItem('jr_active_gen_job', JSON.stringify(next)); } catch {}
        
        if (j.status === 'completed') {
          stopGenPolling();
          
          if (j.document && j.document.sections && j.document.sections.length > 0) {
            const doc = j.document as UniversalLegalDocument;
            // BUG16: dejar barra en 100% brevemente para que usuario vea 100%, luego abrir editor
            setUniversalDoc(doc);
            setActiveSection(doc.sections[0]);
            setUniversalViewMode('editor');
            setActiveNavTab('universal');
            
            // Esperar 600ms con 100% visible antes de limpiar estado
            window.setTimeout(() => {
              clearStoredGeneration();
              setIsUniversalGenerating(false);
              genIsGeneratingRef.current = false;
              setActiveGenJob(null);
              if (j.documentReadiness === 'READY') {
                notify('success', '✓ Documento generado y listo para revisión final');
              } else if (j.documentReadiness === 'BLOCKED' || j.documentReadiness === 'INVALID') {
                notify('error', '⚠️ Documento generado con bloqueos estructurales (requiere subsanación)');
              } else {
                notify('warning', `⚠️ Documento generado en borrador · ${j.documentReadiness || 'REQUIRES_REVIEW'} (requiere revisión del abogado)`);
              }
            }, 600);
          } else {
            console.error('[polling] Documento sin secciones');
            clearStoredGeneration();
            setIsUniversalGenerating(false);
            genIsGeneratingRef.current = false;
            setActiveGenJob(null);
            notify('error', '⚠️ Documento vacío');
          }
        } else if (j.status === 'failed') {
          console.error('[polling] Fallo:', j.error);
          stopGenPolling();
          clearStoredGeneration();
          setIsUniversalGenerating(false);
          genIsGeneratingRef.current = false;
          const message = j.error || 'La generación falló en una sección. Revisa los datos e inténtalo de nuevo.';
          setActiveGenJob({ ...next, status: 'failed', error: message });
          notify('error', message);
          window.setTimeout(() => setActiveGenJob(null), 7000);
        } else if (j.status === 'cancelled') {
          stopGenPolling();
          clearStoredGeneration();
          setIsUniversalGenerating(false);
          genIsGeneratingRef.current = false;
          setActiveGenJob({ ...next, status: 'cancelled' } as any);
          // Mostrar cancelled brevemente luego limpiar
          window.setTimeout(() => {
            setActiveGenJob(null);
          }, 2500);
          notify('warning', 'Generación cancelada.');
        }
      } catch (err) {
        const result = classifyGenerationStatusException(genStatusFailureRef.current);
        genStatusFailureRef.current = result.consecutiveFailures;
        console.warn('[polling] Error de red:', err);
        if (result.kind === 'terminal-error') stopWithStatusError(result.message);
      } finally {
        genPollInFlightRef.current = false;
      }
    }, 750);
  }, [notify, stopGenPolling]);

  useEffect(() => {
    return () => stopGenPolling();
  }, [stopGenPolling]);

  // P1-2: limpiar timer de autosave al desmontar (sin ciclos ni saves fantasma)
  useEffect(() => {
    return () => {
      if (draftAutosaveTimerRef.current) window.clearTimeout(draftAutosaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setHasSavedDraft(Boolean(window.localStorage.getItem('jr_last_draft_id'))); } catch { /* noop */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // P1-2: autosave debounced (4s). Única fuente de cambios: handleUpdateDocument
  // (ediciones del usuario en el editor). Generación/formateo/carga usan setUniversalDoc
  // directamente y por tanto NO disparan autosave.
  const scheduleDraftAutosave = useCallback(() => {
    if (draftAutosaveTimerRef.current) window.clearTimeout(draftAutosaveTimerRef.current);
    // Durante generación activa NO se reprograma en cadena: la próxima edición
    // del usuario volverá a agendar (evita cadenas de timers innecesarias).
    if (genIsGeneratingRef.current) {
      draftAutosaveTimerRef.current = null;
      return;
    }
    draftAutosaveTimerRef.current = window.setTimeout(async () => {
      draftAutosaveTimerRef.current = null;
      const doc = latestDocRef.current;
      if (!doc) return;
      if (isSavingDraftRef.current) return;
      const signature = computeDraftSignature(doc);
      if (signature === lastSavedSignatureRef.current) return; // sin cambios desde último guardado
      await handleSaveDraftRef.current?.(doc);
      // En error se conserva lastSavedSignatureRef (firma anterior) para permitir reintento.
    }, 4000);
  }, []);

  // Wrapper único para ediciones del editor jurídico: mantiene latestDocRef fresco
  const handleUpdateDocument = useCallback((updated: UniversalLegalDocument) => {
    latestDocRef.current = updated;
    setUniversalDoc(updated);
    scheduleDraftAutosave();
  }, [scheduleDraftAutosave]);

  // Recuperar job activo tras recarga — BUG15: verificar que Job aún existe antes de reanudar polling
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('jr_active_gen_job') : null;
        if (!saved) return;
        const parsed = JSON.parse(saved);
        if (!parsed?.jobId || parsed?.status !== 'processing') return;
        genIsGeneratingRef.current = true;
        // Verificar con backend que el Job sigue accesible (evita 404 inmediato tras recarga)
        try {
          const r = await fetch(`/api/legal-engine/generate/status?jobId=${encodeURIComponent(parsed.jobId)}`);
          const statusResult = parseGenerationStatusResponse(r.status, await r.text(), 0);
          if (cancelled) return;
          if (statusResult.kind === 'terminal-error') {
            console.warn('[reload] No fue posible verificar el Job guardado:', statusResult.message);
            try { localStorage.removeItem('jr_active_gen_job'); localStorage.removeItem('jr_active_gen_flow'); } catch {}
            genIsGeneratingRef.current = false;
            setIsUniversalGenerating(false);
            setActiveGenJob({ ...parsed, status: 'failed', error: statusResult.message });
            notify('error', statusResult.message);
            return;
          }
          if (statusResult.kind === 'retry') {
            // La primera consulta puede coincidir con una recompilación; se
            // conserva el estado local y el polling posterior queda acotado.
            setActiveGenJob(parsed);
            genJobIdRef.current = parsed.jobId;
            setIsUniversalGenerating(true);
            startGenPolling(parsed.jobId);
            return;
          }
          const d = statusResult.data;
          if (!d.jobId) {
            console.warn('[reload] Job guardado no encontrado en servidor — limpiando storage', parsed.jobId.slice(0,8));
            try { localStorage.removeItem('jr_active_gen_job'); localStorage.removeItem('jr_active_gen_flow'); } catch {}
            genIsGeneratingRef.current = false;
            setIsUniversalGenerating(false);
            return;
          }
          // Si ya completó mientras estábamos fuera, cargar documento directamente (BUG16)
          if (d.status === 'completed' && d.document?.sections?.length) {
            const doc = d.document as UniversalLegalDocument;
            setUniversalDoc(doc);
            setActiveSection(doc.sections[0]);
            setUniversalViewMode('editor');
            setActiveNavTab('universal');
            setActiveGenJob({ jobId: d.jobId, total: d.total, completed: d.total, percentage: 100, currentBlock: null, status: 'completed', stage: 'Documento generado correctamente' } as any);
            setIsUniversalGenerating(true);
            genIsGeneratingRef.current = true;
            // Mostrar 100% brevemente luego limpiar
            window.setTimeout(() => {
              try { localStorage.removeItem('jr_active_gen_job'); localStorage.removeItem('jr_active_gen_flow'); } catch {}
              setIsUniversalGenerating(false);
              genIsGeneratingRef.current = false;
              setActiveGenJob(null);
            }, 800);
            return;
          }
          if (d.status === 'failed') {
            try { localStorage.removeItem('jr_active_gen_job'); localStorage.removeItem('jr_active_gen_flow'); } catch {}
            genIsGeneratingRef.current = false;
            setIsUniversalGenerating(false);
            const message = d.error || 'La generación falló en una sección. Revisa los datos e inténtalo de nuevo.';
            setActiveGenJob({ ...parsed, status: 'failed', error: message, errorCode: d.errorCode || null, errorMetadata: d.errorMetadata || null });
            notify('error', message);
            return;
          }
          // Job sigue en processing — reanudar polling
          const pct = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0;
          const next = { jobId: d.jobId, total: d.total, completed: d.completed, percentage: pct, currentBlock: d.currentBlock, status: d.status, stage: d.stage, aiProvider: d.aiProvider, errorCode: d.errorCode || null, errorMetadata: d.errorMetadata || null };
          setActiveGenJob(next);
          genJobIdRef.current = d.jobId;
          setIsUniversalGenerating(true);
          // Reanudar polling único
          startGenPolling(d.jobId);
        } catch (e) {
          console.warn('[reload] Error verificando job, manteniendo estado local:', e);
          // Fallback: mantener estado local y reintentar polling igualmente (tolerancia 404 lo maneja)
          setActiveGenJob(parsed);
          genJobIdRef.current = parsed.jobId;
          setIsUniversalGenerating(true);
          startGenPolling(parsed.jobId);
        }
      } catch (err) {
        console.warn('[reload] Error parseando job guardado:', err instanceof Error ? err.message : err);
      }
    })();
    return () => { cancelled = true; };
  }, [startGenPolling]);

  const [initialForm, setInitialForm] = useState({
    materia: 'amparo',
    materiaCustom: '',
    jurisdiccion: 'federal',
    jurisdiccionCustom: '',
    tipoEscrito: 'demanda_amparo_indirecto',
    tipoEscritoCustom: '',
    promovente: '',
    demandado: '',
    autoridad: '',
    expediente: '',
    pretensiones: '',
    hechos: '',
    pruebas: '',
    instrucciones: '',
  });
  const [initialViewMode, setInitialViewMode] = useState<'form' | 'editor'>('form');
  const [initialStep, setInitialStep] = useState(1);
  const [initialWritingsSessionDocIds, setInitialWritingsSessionDocIds] = useState<Set<string>>(new Set());

  const [universalForm, setUniversalForm] = useState({
    intent: 'redactar' as 'analizar' | 'investigar' | 'redactar',
    pregunta: '',
    materia: 'amparo',
    materiaCustom: '',
    jurisdiccion: 'federal',
    jurisdiccionCustom: '',
    tipoEscrito: 'escrito_libre',
    tipoEscritoCustom: '',
    expediente: '',
    fuentes: { legislacion: true, jurisprudencia: true, expediente: true },
    showAdvanced: false,
  });

  // Aislar documentos de Escritos Iniciales cuando cambia asunto, materia o tipo.
  const prevInitialExpedienteRef = useRef<string>(initialForm.expediente);
  const prevInitialMateriaRef = useRef<string>(initialForm.materia);
  useEffect(() => {
    const prevExp = prevInitialExpedienteRef.current;
    const prevMat = prevInitialMateriaRef.current;
    const curExp = initialForm.expediente;
    const curMat = initialForm.materia;
    const expChanged = prevExp && curExp && prevExp !== curExp;
    const matChanged = prevMat && curMat && prevMat !== curMat;
    if ((expChanged || matChanged) && initialWritingsSessionDocIds.size > 0) {
      // Solo limpiar si los docs previos no pertenecen al nuevo expediente/materia
      // Evita enviar fuentes de un asunto anterior a una nueva solicitud laboral.
      setInitialWritingsSessionDocIds(new Set());
    }
    prevInitialExpedienteRef.current = curExp;
    prevInitialMateriaRef.current = curMat;
  }, [initialForm.expediente, initialForm.materia, initialForm.tipoEscrito, initialWritingsSessionDocIds.size]);

  const handleSwitchMode = (mode: LegalWorkspaceMode) => {
    setActiveNavTab(mode);
    setIsSidebarOpen(false);
    // Persistir tab en URL (§24)
    try {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', mode);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    } catch (err) {
      console.warn('[tabs] Error persistiendo tab en URL:', err instanceof Error ? err.message : err);
    }
    if (mode === 'universal') {
    } else if (mode === 'initial_writings') {
      const effMatterIW = initialForm.materia === 'otro' ? (initialForm.materiaCustom || 'Otro') : (MATTERS.find((m) => m.value === initialForm.materia)?.label || initialForm.materia || 'Amparo');
      const effJurisIW = initialForm.jurisdiccion === 'otra' ? (initialForm.jurisdiccionCustom || 'Federal') : (JURISDICTIONS.find((j) => j.value === initialForm.jurisdiccion)?.label || 'Federal');
      const effTipoIW = initialForm.tipoEscrito === 'otro' ? (initialForm.tipoEscritoCustom || 'Escrito libre') : (DOCUMENT_TYPES.find((d) => d.value === initialForm.tipoEscrito)?.label || initialForm.tipoEscrito || 'Demanda de Amparo Indirecto');
      const shouldCreateInitialDoc = !universalDoc || universalDoc.documentType !== (initialForm.tipoEscrito || 'demanda_amparo_indirecto') || (universalDoc.matter || '').toLowerCase() !== effMatterIW.toLowerCase();
      if (shouldCreateInitialDoc) {
        // Limpiar la sesión si cambió el expediente o la materia.
        if (universalDoc && universalDoc.documentType !== (initialForm.tipoEscrito || '')) {
          setInitialWritingsSessionDocIds(new Set());
          try { sessionStorage.removeItem('juridico_active_draft'); } catch {}
        }
        const initialDoc: UniversalLegalDocument = createEmptyDocument({
          id: `doc-${Date.now()}`,
          title: effTipoIW,
          documentType: initialForm.tipoEscrito || 'demanda_amparo_indirecto',
          documentTypeLabel: effTipoIW,
          matter: effMatterIW,
          jurisdiction: effJurisIW,
          sections: [
            {
              id: 'sec-proemio',
              type: 'header',
              title: effMatterIW.toLowerCase().includes('laboral') ? 'I. Actor y Acreditación de Personalidad' : 'I. Quejoso y Acreditación de Personalidad',
              order: 1,
              isRepeatable: false,
              isEditable: true,
              isGenerated: false,
              isManuallyEdited: false,
              variables: [],
              validationErrors: [],
              validationWarnings: [],
              content: [
                {
                  id: 'blk-init-1',
                  layer: 'USER_POSITION',
                  trustLevel: 'VERIFIED',
                  text: effMatterIW.toLowerCase().includes('laboral')
                    ? 'H. JUNTA DE CONCILIACIÓN Y ARBITRAJE COMPETENTE.\n\n[DATO PENDIENTE: Nombre del actor], comparezco por mi propio derecho a demandar a [DATO PENDIENTE: Nombre del demandado]...'
                    : effMatterIW.toLowerCase().includes('civil')
                    ? 'C. JUEZ DE LO CIVIL COMPETENTE.\n\n[DATO PENDIENTE: Nombre del actor], comparezco a demandar a [DATO PENDIENTE: Nombre del demandado]...'
                    : 'C. JUEZ DE DISTRITO EN MATERIA DE AMPARO EN TURNO.\n\n[DATO PENDIENTE: Nombre del promovente], comparezco por mi propio derecho a solicitar el amparo y protección de la Justicia Federal...',
                  isManuallyEdited: false,
                  style: { fontFamily: 'inherit', fontSize: '13px', textAlign: 'justify', lineHeight: '1.6' },
                },
              ],
            },
          ],
        });
        setUniversalDoc(initialDoc);
        setActiveSection(initialDoc.sections[0]);
        // Limpiar un borrador previo si pertenecía a otra materia.
        try { sessionStorage.setItem('juridico_active_draft', JSON.stringify({ templateId: initialDoc.templateId, documentType: initialDoc.documentType, matter: initialDoc.matter, jurisdiction: initialDoc.jurisdiction })); } catch {}
      } else {
        // Ya existe doc pero con materia/tipo distinto → actualizar metadatos sin perder contenido del usuario si es misma materia
        // Se deja universalDoc intacto si es misma familia; si no, el bloque anterior ya lo recreó
      }
      notify('success', 'Modo Escritos Iniciales.');
    } else if (mode === 'responses_resources') {
      if (!universalDoc) {
        const effMatterResp = universalForm.materia === 'otro' ? (universalForm.materiaCustom || 'Amparo') : (MATTERS.find((m) => m.value === universalForm.materia)?.label || 'Amparo');
        const effJurisResp = universalForm.jurisdiccion === 'otra' ? (universalForm.jurisdiccionCustom || 'Federal') : (JURISDICTIONS.find((j) => j.value === universalForm.jurisdiccion)?.label || 'Federal');
        const responseDoc: UniversalLegalDocument = createEmptyDocument({
          id: `doc-${Date.now()}`,
          title: 'Recurso de Revisión en Amparo Directo',
          documentType: 'recurso_revision_amparo_directo',
          documentTypeLabel: 'Recurso de Revisión en Amparo Directo',
          matter: effMatterResp,
          jurisdiction: effJurisResp,
          sections: [
            {
              id: 'sec-proemio-resp',
              type: 'header',
              title: 'I. Proemio y Objeto del Recurso',
              order: 1,
              isRepeatable: false,
              isEditable: true,
              isGenerated: false,
              isManuallyEdited: false,
              variables: [],
              validationErrors: [],
              validationWarnings: [],
              content: [
                {
                  id: 'blk-resp-1',
                  layer: 'USER_POSITION',
                  trustLevel: 'VERIFIED',
                  text: 'H. TRIBUNAL COLEGIADO DE CIRCUITO EN TURNO.\n\n[DATO PENDIENTE DE EXPEDIENTE: Nombre del recurrente], comparezco a interponer formal Recurso de Revisión...',
                  isManuallyEdited: false,
                  style: { fontFamily: 'inherit', fontSize: '13px', textAlign: 'justify', lineHeight: '1.6' },
                },
              ],
            },
          ],
        });
        setUniversalDoc(responseDoc);
        setActiveSection(responseDoc.sections[0]);
      }
      notify('success', 'Modo Contestaciones y Recursos.');
    }
  };

  function formatFileSize(bytes?: number | null): string {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const ALLOWED_UPLOAD_EXTS = new Set(['pdf','docx','doc','jpg','jpeg','png','txt','rtf']);

  const uploadFilesInternal = async (fileList: File[]) => {
    if (fileList.length === 0) return;
    setDocsUploadError(null);
    const allowed = fileList.filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      return ALLOWED_UPLOAD_EXTS.has(ext);
    });
    const rejected = fileList.filter((f) => !ALLOWED_UPLOAD_EXTS.has(f.name.split('.').pop()?.toLowerCase() || ''));
    if (rejected.length > 0) {
      const msg = `Formato no admitido: ${rejected.map((f) => f.name).join(', ')}. Admitidos: PDF, DOCX, DOC, JPG, PNG.`;
      setDocsUploadError(msg);
      notify('error', msg);
    }
    if (allowed.length === 0) return;
    // Tamaño máximo 15 MB por archivo
    const oversized = allowed.filter((f) => f.size > 15 * 1024 * 1024);
    if (oversized.length > 0) {
      const msg = `Archivo supera 15 MB: ${oversized.map((f) => f.name).join(', ')}`;
      setDocsUploadError(msg);
      notify('error', msg);
      return;
    }

    const uploadStampMs = newUploadStampMs();
    if (allowed.length === 1) notify('warning', `Cargando "${allowed[0].name}"...`);
    else notify('warning', `Cargando ${allowed.length} documentos...`);

    const sources: UploadedSourceDocument[] = [];
    const caseDocs: CaseDocument[] = [];

    for (let i = 0; i < allowed.length; i++) {
      const file = allowed[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const blobUrl = URL.createObjectURL(file);

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/templates/analyze-upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();

        if (!data.ok) {
          throw new Error(data.error || 'No se pudo procesar el archivo.');
        }

        const sourceValidated = data.sourceValidated !== false;
        if (i === 0 && data.analysis) setCaseAnalysis(data.analysis as CaseAnalysis);
        const pages: DocumentPage[] = data.pages?.length
          ? data.pages.map((p: any) => ({
              page: p.page,
              text: sanitizeClean(p.text || ''),
              chars: p.chars || 0,
            }))
          : [{ page: 1, text: sanitizeClean(data.extractedText || ''), chars: data.extractedText?.length || 0 }];

        const newSource: UploadedSourceDocument = createSourceDocument({
          id: data.fileId || `doc-${uploadStampMs}-${i}`,
          filename: file.name,
          name: file.name,
          type: file.type || ext,
          fileUrl: blobUrl,
          extractedText: sanitizeClean(data.extractedText || ''),
          pages,
          sourceValidated,
          sourceValidationMethod: data.sourceValidationMethod,
          qualityScore: data.qualityScore,
          warnings: data.warnings,
          fileSizeBytes: file.size,
        } as any);

        const newCaseDoc: CaseDocument = {
          id: newSource.id,
          name: file.name,
          type: ext,
          fileUrl: blobUrl,
          pageCount: pages.length,
          pages: pages.map((p) => {
            const pageBlocks = data.structureJson?.pages?.find((sp: any) => sp.pageNumber === p.page)?.blocks;
            return {
              page: p.page,
              text: p.text,
              chars: p.chars,
              ocrStatus: data.needsOcr ? 'OCR' : 'nativo',
              blocks: pageBlocks,
            };
          }),
          structuredDocument: data.structureJson,
          role: 'fuente_general',
          status: sourceValidated ? 'READY' : 'NEEDS_MANUAL_REVIEW',
          uploadedAt: new Date().toISOString(),
        };

        sources.push(newSource);
        caseDocs.push(newCaseDoc);

        if (i === 0) {
          const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');

          const sections: DocumentNode[] = pages.map((p, pIdx) => {
            const nemotronPageBlocks = data.structureJson?.pages?.find(
              (sp: any) => sp.pageNumber === p.page
            )?.blocks as Array<{ id?: string; type?: string; text?: string; style?: any; tableData?: any }> | undefined;

            let blocks: ContentBlock[];

            if (nemotronPageBlocks && nemotronPageBlocks.length > 0) {
              blocks = nemotronPageBlocks
                .filter((nb) => nb.text && nb.text.trim().length > 0 && nb.type !== 'Metadata')
                .map((nb, bIdx) => ({
                  id: `blk-${pIdx + 1}-${bIdx + 1}`,
                  layer: 'USER_POSITION' as const,
                  trustLevel: 'VERIFIED' as const,
                  text: sanitizeClean(nb.text || ''),
                  isManuallyEdited: false,
                  style: nb.style || {
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    textAlign: 'justify' as const,
                    lineHeight: '1.6',
                  },
                }));
              if (blocks.length === 0) {
                blocks = [{
                  id: `blk-${pIdx + 1}-1`,
                  layer: 'USER_POSITION' as const,
                  trustLevel: 'VERIFIED' as const,
                  text: sanitizeClean(p.text || 'Sin texto extraído'),
                  isManuallyEdited: false,
                  style: { fontFamily: 'inherit', fontSize: '13px', textAlign: 'justify' as const, lineHeight: '1.6' },
                }];
              }
            } else {
              const rawParagraphs = (p.text || '').split(/\n\s*\n/).filter((t) => t.trim().length > 0);
              blocks = (rawParagraphs.length > 0 ? rawParagraphs : [p.text || 'Sin texto extraído']).map((parText, bIdx) => {
                const trimmed = sanitizeClean(parText);
                return {
                  id: `blk-${pIdx + 1}-${bIdx + 1}`,
                  layer: 'USER_POSITION' as const,
                  trustLevel: 'VERIFIED' as const,
                  text: trimmed,
                  isManuallyEdited: false,
                  style: {
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    textAlign: 'justify' as const,
                    lineHeight: '1.6',
                  },
                };
              });
            }

            return {
              id: `sec-page-${pIdx + 1}`,
              type: pIdx === 0 ? 'header' : pIdx === pages.length - 1 ? 'closing' : 'argument',
              title: `Página ${p.page || pIdx + 1}`,
              order: pIdx + 1,
              isRepeatable: true,
              isEditable: true,
              isGenerated: false,
              isManuallyEdited: false,
              variables: [],
              validationErrors: [],
              validationWarnings: [],
              content: blocks,
            };
          });

          const uploadedUniversalDoc: UniversalLegalDocument = createEmptyDocument({
            id: `doc-${uploadStampMs}`,
            title: fileNameWithoutExt,
            documentType: data.classification?.tipo_documento || 'machote_real',
            documentTypeLabel: data.classification?.tipo_documento || 'Documento Oficial',
            matter: data.classification?.materia || 'Amparo',
            jurisdiction: (data.classification as any)?.jurisdiccion || (data.classification as any)?.jurisdiction || undefined,
            parties: {
              actor: 'Parte promovente',
              demandado: 'Autoridad o contraparte',
            },
            caseRefs: {
              expediente: file.name,
            },
            sections,
            sourceDocuments: [newSource],
            originalFormat: ext === 'pdf' ? 'pdf' : (ext === 'docx' ? 'docx' : 'custom'),
            originalFileUrl: blobUrl,
            defaultFontFamily: 'Times New Roman, Times, "Liberation Serif", serif',
            defaultFontSize: '12pt',
            defaultLineHeight: '1.6',
            originalPageCount: pages.length,
            generationMetadata: {
              pipelineState: {
                currentStage: null,
                stages: {} as any,
                isComplete: true,
                hasErrors: false,
              },
              aiUsed: false,
            },
            status: 'draft',
          });

          setUniversalDoc(uploadedUniversalDoc);
          setActiveSection(sections[0]);
          setSelectedTemplateRefText(sanitizeClean(data.extractedText || ''));
        }
      } catch (err: any) {
        const msg = `Error en "${file.name}": ${err.message}`;
        setDocsUploadError(msg);
        notify('error', msg);
      }
    }

    if (sources.length > 0) {
      setUploadedSourceDocs((prev) => [...prev, ...sources]);
      setCaseDocsList(caseDocs);
      // Aislar documentos de Escritos Iniciales por sesión para evitar contaminación cruzada.
      if (activeNavTab === 'initial_writings') {
        setInitialWritingsSessionDocIds((prev) => {
          const next = new Set(prev);
          sources.forEach((s) => next.add(s.id));
          return next;
        });
      }
      const ficha = detectCaseFicha(sources.map((s) => s.extractedText || ''));
      setCaseFicha(ficha);
      void persistDetectedFicha(ficha, sources);
      notify('success', `Documento original "${allowed[0].name}" cargado (${caseDocs[0]?.pageCount || 1} pág.).`);
    } else if (allowed.length > 0 && sources.length === 0) {
      setDocsUploadError('No se pudo procesar ningún archivo. Verifique el formato.');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    const list = Array.from(files);
    if (fileInputHiddenRef.current) fileInputHiddenRef.current.value = '';
    await uploadFilesInternal(list);
  };

  const handleDocsDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingDocs(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    await uploadFilesInternal(files);
  };

  const setCaseDocsList = (docs: CaseDocument[]) => {
    setCaseDocuments((prev) => [...prev, ...docs]);
    if (docs.length > 0) setSelectedCaseDoc(docs[docs.length - 1]);
  };

  const handleRemoveUploadedSource = (id: string) => {
    setUploadedSourceDocs((prev) => prev.filter((s) => s.id !== id));
    setCaseDocuments((prev) => {
      const filtered = prev.filter((d) => d.id !== id);
      // Si se eliminó el documento seleccionado, seleccionar el siguiente válido por ID explícito
      if (selectedCaseDoc?.id === id) {
        const nextSelected = filtered[0] || null;
        // Actualizar selectedCaseDoc de forma síncrona para evitar stale
        // Se usa setTimeout 0 para evitar setState durante render si es llamado desde evento
        setTimeout(() => setSelectedCaseDoc(nextSelected), 0);
      }
      return filtered;
    });
    setInitialWritingsSessionDocIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    // Recalcular ficha y análisis materia tras eliminación se hará vía useMemo en siguiente render
  };

  /* ── Usar como Machote / Guardar Plantilla Reutilizable ────────────────── */
  const handleSaveAsTemplate = async (doc: UniversalLegalDocument) => {
    notify('warning', `Guardando "${doc.title}" como machote reutilizable...`);
    try {
      const fullContent = doc.sections.map((s) => s.content.map((b) => b.text).join('\n\n')).join('\n\n---\n\n');
      const templateAnalysis = analyzePersonalTemplateText(fullContent, {
        sourceFileName: `${doc.title}.docx`,
        pageCount: doc.originalPageCount,
        knownValues: {
          actor: doc.parties.actor,
          demandado: doc.parties.demandado,
          quejoso: doc.parties.quejoso,
          autoridad: doc.parties.autoridadResponsable,
          expediente: doc.caseRefs.expediente,
          juzgado: doc.caseRefs.juzgado || doc.caseRefs.tribunal,
        },
      });
      const explicitTemplate: ProfessionalTemplate = {
        id: `custom-${Date.now()}`,
        lifecycle: {
          entityKind: 'TEMPLATE',
          originClass: 'user',
          creationIntent: 'EXPLICIT_TEMPLATE',
        },
        title: doc.title,
        description: `Plantilla personal revisada (${templateAnalysis.documentTypeLabel})`,
        category: templateAnalysis.category,
        legalBasis: 'Fundamento normativo definido por el litigante.',
        documentType: templateAnalysis.documentType,
        applicableLaws: [],
        warnings: [],
        disclaimer: 'Plantilla personalizada. Requiere revisión profesional antes de presentarse.',
        exportFormats: ['docx', 'pdf', 'text'],
        originalText: templateAnalysis.parameterizedText,
        sourceFileName: `${doc.title}.docx`,
        variables: templateAnalysis.variables,
        structureJson: markTemplateAsUserOwned(templateAnalysis.structureJson) as ProfessionalTemplate['structureJson'],
        sections: templateAnalysis.sections.map((section) => ({
          id: section.id,
          title: section.title,
          type: section.type === 'list' ? 'repeatable' : section.type === 'paragraph' ? 'textarea' : 'text',
          required: false,
          placeholder: section.preview,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const result = await saveTemplateWithPersistenceStatus(explicitTemplate);
      await loadTemplates();
      if (result.status === 'GUARDADO') {
        notify('success', `GUARDADO: Machote "${doc.title}" guardado como plantilla reutilizable.`);
      } else if (result.status === 'CONSERVADO TEMPORALMENTE') {
        notify('warning', `CONSERVADO TEMPORALMENTE: Machote "${doc.title}" pendiente de sincronización. ${result.message}`);
      } else {
        notify('error', `NO GUARDADO: ${result.message}`);
      }
    } catch (err: any) {
      notify('error', `Error al guardar como machote: ${err.message}`);
    }
  };

  /* ── Generar Escrito Basado en este Machote ────────────────────────────── */
  const handleGenerateFromMachote = (doc: UniversalLegalDocument) => {
    const fullText = doc.sections.map((s) => s.content.map((b) => b.text).join('\n\n')).join('\n\n');
    setSelectedTemplateRefText(fullText);
    setGenerationMode('reference_document');
    setIsDraftGeneratorOpen(true);
  };

  /* ── Usar Plantilla Existente ──────────────────────────────────────────── */
  const handleUseTemplate = async (template: TemplateItem, version?: TemplateVersion) => {
    notify('warning', `Cargando machote "${template.name}"...`);
    try {
      const tpl = (await getCustomTemplates()).find((candidate) => candidate.id === template.id);
      if (!tpl) throw new Error('No se pudo obtener la plantilla.');
      const templateRecord = tpl as ProfessionalTemplate & { content?: string };
      const refText = sanitizeClean(templateRecord.originalText || templateRecord.content || '');
      const selected = { ...template, version: version?.version || template.version, content: refText };
      setSelectedTemplate(selected);
      setSelectedTemplateRefText(refText);
      setGenerationMode('personal_template');
      // Una plantilla personal se usa como estructura de un nuevo asunto; no
      // se abre como documento del caso anterior ni se copia su contenido al
      // borrador. El modal pedirá los datos del nuevo asunto y el motor los
      // resolverá sobre el texto parametrizado.
      setActiveNavTab('universal');
      setUniversalViewMode('analysis');
      setIsDraftGeneratorOpen(true);
      notify('success', `Plantilla "${tpl.title}" lista. Completa los datos del nuevo asunto.`);
    } catch (err: any) {
      notify('error', `Error al usar plantilla: ${err.message}`);
    }
  };

  const handleEditTemplate = async (template: TemplateItem) => {
    try {
      const editable = (await getCustomTemplates()).find((candidate) => candidate.id === template.id);
      if (!editable) throw new Error('No se pudo abrir plantilla.');
      setEditTemplateData(editable);
      setIsEditCustomOpen(true);
    } catch (err: any) {
      notify('error', `Error: ${err.message}`);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      const result = await deleteCustomTemplate(id);
      if (result.persistence === 'not_persisted') {
        notify('error', result.message || 'No fue posible eliminar la plantilla. Puedes reintentar.');
        return;
      }
      notify('success', 'Plantilla eliminada correctamente.');
      await loadTemplates();
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  /* Generación de Escrito Completo (Con Motor JurÍdico Real) - ASÍNCRONA REAL X/Y */
  const handleRunPipeline = async (payload: {
    userInstruction: string;
    intentLabel?: string;
    documentType?: string;
    sourceDocs: UploadedSourceDocument[];
    selectedTemplate?: TemplateItem | null;
    templateRefText?: string;
    writingMode?: 'analyze' | 'new' | 'template' | 'continue';
    flowLabel?: GenerationFlowLabel;
    taxonomy?: any;
    caseParties?: Array<{ role: string; name: string; source?: string }>;
    expediente?: string;
  }) => {
    // BUG4+14: Bloquear doble submit — un solo flujo activo (sincrónico via ref + estado)
    if (isUniversalGenerating || genIsGeneratingRef.current) {
      console.warn('[handleRunPipeline] Doble click bloqueado — ya hay Job activo', genJobIdRef.current?.slice(0,8));
      notify('warning', 'Ya hay una generación en curso. Por favor espera.');
      return;
    }
    genIsGeneratingRef.current = true;
    // BUG1+2: Determinar etiqueta dinámica para overlay global
    const flow: GenerationFlowLabel = payload.flowLabel || (payload.intentLabel?.toLowerCase().includes('contest') ? 'contestacion' : payload.intentLabel?.toLowerCase().includes('recurso') ? 'recurso' : payload.intentLabel?.toLowerCase().includes('inicial') || payload.intentLabel?.toLowerCase().includes('demanda') ? 'escrito_inicial' : 'universal');
    // BUG1: Asegurar que barra global sea visible sin importar tab actual
    // Si estamos en Contestaciones o Escritos Iniciales, mover a universal/analysis para que overlay sea visible, pero NO ocultar progreso
    // La barra global vive fuera de tabs, así que no necesitamos cambiar de tab, solo asegurar isGenerating
    setIsUniversalGenerating(true);
    // Estado inicial real (no simulado) — BUG11: 0/total real
    setActiveGenJob({ jobId: '', total: 0, completed: 0, percentage: 0, currentBlock: null, status: 'processing', stage: 'Preparando documento…' });
    notify('warning', flow === 'contestacion' ? 'Generando contestación…' : flow === 'recurso' ? 'Generando recurso…' : flow === 'escrito_inicial' ? 'Generando escrito inicial…' : 'Generando documento jurídico…');

    const generationId = generationIdentityFactory.next();
    // A5: las partes confirmadas/editadas viajan en el body (fuente de verdad del frontend);
    // el backend NO consulta CaseParty durante la generación.
    // Si el payload trae partes explícitas, usarlas para evitar reutilizar partes de otra sesión.
    const payloadParties = (payload as any).caseParties as Array<{ role: string; name: string; source?: string }> | undefined;
    const effectiveCaseParties = payloadParties && payloadParties.length > 0
      ? payloadParties.filter((p) => p.name && String(p.name).trim()).map((p) => ({ role: p.role, name: String(p.name).trim(), source: (p as any).source || 'manual' }))
      : savedCaseParties.filter((p) => p.name && p.name.trim()).map((p) => ({ role: p.role, name: p.name.trim(), source: (p as any).source || 'manual' }));
    // P0: sourceDocs aislados — si el payload trae lista explícita (incluso vacía), respetarla; no fallback a global contaminado
    const effectiveSourceDocs = payload.writingMode && payload.writingMode !== 'analyze'
      ? []
      : ((payload as any).sourceDocs !== undefined ? (payload as any).sourceDocs as UploadedSourceDocument[] : uploadedSourceDocs);
    const payloadExpediente = (payload as any).expediente as string | undefined;
    const selectedDocumentType = resolveSelectedDocumentType(payload.documentType, payload.taxonomy);
    const writingIntake: WritingIntake | null = effectiveSourceDocs.length === 0
      ? analyzeWritingRequest(payload.userInstruction)
      : null;
    // Una plantilla seleccionada ya aporta tipo/estructura; los datos faltantes
    // deben quedar como pendientes en el nuevo asunto, no impedir que se genere
    // el borrador reutilizable.
    if (writingIntake && writingIntake.readiness.status === 'BLOCKED' && !payload.selectedTemplate) {
      genIsGeneratingRef.current = false;
      setIsUniversalGenerating(false);
      setActiveGenJob(null);
      notify('warning', `Faltan datos esenciales para generar: ${writingIntake.readiness.missingEssential.join(', ')}.`);
      return;
    }
    const workflowSelection = payload.selectedTemplate && (payload.writingMode === 'template' || generationMode === 'personal_template')
      ? { mode: 'personal_template' as const, templateId: payload.selectedTemplate.id }
      : generationMode === 'reference_document' && payload.selectedTemplate
        ? { mode: 'reference_document' as const, referenceDocumentId: payload.selectedTemplate.id }
        : { mode: 'automatic' as const };
    const requestWorkflow = writingIntake
      ? buildWritingWorkflow(writingIntake, workflowSelection)
      : {
          sourceDocuments: effectiveSourceDocs,
          analysis: (effectiveSourceDocs.length === uploadedSourceDocs.length && matterAnalysis) ? matterAnalysis : (caseAnalysis || { facts: [], missingData: [] }),
          selection: workflowSelection,
          updatedAt: new Date().toISOString(),
        };
    try {
      const res = await fetch('/api/legal-engine/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': generationId },
        body: JSON.stringify({
          userInstruction: payload.userInstruction,
          sourceDocuments: effectiveSourceDocs,
          allowUnvalidatedSource: effectiveSourceDocs.length === 0,
          referenceDocumentText: payload.templateRefText || selectedTemplateRefText || undefined,
          referenceDocumentId: generationMode === 'reference_document' ? payload.selectedTemplate?.id : undefined,
          documentTypeLabel: payload.intentLabel || payload.selectedTemplate?.category || undefined,
          selectedDocumentType,
          caseParties: effectiveCaseParties.length > 0 ? effectiveCaseParties : undefined,
          expediente: payloadExpediente?.trim() || undefined,
          taxonomy: (payload as any).taxonomy || undefined,
          jurisdiction: (payload as any).taxonomy?.jurisdiction || undefined,
          matter: (payload as any).taxonomy?.matter || undefined,
          workflow: requestWorkflow,
          idempotencyKey: generationId,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        // Si reutilizado, tratar como éxito de job existente
        if (data?.jobId) {
          const jid = data.jobId as string;
          setActiveGenJob({ jobId: jid, total: data.total ?? 0, completed: data.completed ?? 0, percentage: data.percentage ?? 0, currentBlock: data.currentBlock ?? null, status: data.status ?? 'processing' });
          try { localStorage.setItem('jr_active_gen_job', JSON.stringify({ jobId: jid, total: data.total ?? 0, completed: data.completed ?? 0, percentage: data.percentage ?? 0, currentBlock: data.currentBlock ?? null, status: data.status ?? 'processing' })); } catch {}
          startGenPolling(jid);
          notify('warning', 'Generación ya en curso — continuando progreso…');
          return;
        }
        throw new Error(data?.error || 'Error al iniciar generación');
      }

      const jobId = data.jobId as string;
      if (!jobId) throw new Error('JobId no recibido del servidor');
      // Guardar para recarga + iniciar polling REAL (único intervalo)
      const initJob = { jobId, total: data.total ?? 0, completed: 0, percentage: 0, currentBlock: null, status: 'processing', stage: data.stage || 'Preparando documento…' };
      setActiveGenJob(initJob as any);
      try { localStorage.setItem('jr_active_gen_job', JSON.stringify(initJob)); } catch {}
      startGenPolling(jobId);
    } catch (err: any) {
      notify('error', `Fallo al iniciar generación: ${err.message}`);
      setIsUniversalGenerating(false);
      genIsGeneratingRef.current = false;
      setActiveGenJob(null);
      stopGenPolling();
      try { localStorage.removeItem('jr_active_gen_job'); localStorage.removeItem('jr_active_gen_flow'); } catch {}
    }
  };

  /* ── FORMATEAR DOCUMENTO (operación independiente: estructura IA + formato determinístico, sin reescritura) ── */
  const [isFormatting, setIsFormatting] = useState(false);
  const handleFormatDocument = async () => {
    const sources = uploadedSourceDocs.length > 0 ? uploadedSourceDocs : universalDoc?.sourceDocuments || [];
    if (!universalDoc || sources.length === 0 || isFormatting) {
      notify('warning', 'Sube un documento antes de formatear.');
      return;
    }
    setIsFormatting(true);
    notify('warning', 'Analizando estructura y aplicando formato jurídico…');
    try {
      const res = await fetch('/api/legal-engine/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocuments: sources }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (data?.error === 'LEGAL_CONTENT_CHANGED') {
          // NO reemplazar universalDoc. Sin segunda llamada automática.
          console.error('[format] Contenido alterado:', data.report);
          notify('error', `LEGAL_CONTENT_CHANGED: el formateo alteró contenido (cobertura ${data.report?.coveragePct ?? 0}%). Documento original intacto.`);
          return;
        }
        throw new Error(data?.error === 'NO_TEXT_CONTENT' ? 'El documento no tiene texto suficiente.' : data?.error || 'Error al formatear');
      }
      const doc = data.document as UniversalLegalDocument;
      setUniversalDoc(doc);
      setActiveSection(doc.sections[0]);
      const notes = data.report?.editorialNotes ? ` · ${data.report.editorialNotes} nota(s) editorial(es) marcadas` : '';
      notify('success', `✓ Formato jurídico aplicado (${data.report?.coveragePct ?? 100}% integridad, ${data.report?.elementsCounted ?? doc.sections.length} elementos${notes}).`);
    } catch (err: any) {
      notify('error', `No se pudo formatear: ${err.message}`);
    } finally {
      setIsFormatting(false);
    }
  };

  /* ── Reformular / Ampliar / Reducir — operaciones SEPARADAS de Formatear ── */
  // Cada modo usa su propia instrucción explícita vía generate-section (nunca comparte
  // prompt con Formatear). El perfil de estilo aporta SOLO tono/extensión.
  const REFINEMENT_INSTRUCTIONS: Record<'reformular' | 'ampliar' | 'reducir', string> = {
    reformular: 'Reformula por completo la redacción de este apartado conservando exactamente los hechos, nombres, fechas, expedientes, artículos, jurisprudencias y citas.',
    ampliar: 'Amplía este apartado desarrollando argumentos y fundamentos adicionales coherentes, sin inventar datos que no consten en las fuentes del expediente.',
    reducir: 'Reduce este apartado resumiéndolo sin perder datos jurídicos esenciales: nombres, fechas, expedientes, artículos, jurisprudencias y citas.',
  };

  const handleRefineSection = async (mode: 'reformular' | 'ampliar' | 'reducir') => {
    if (!universalDoc || !activeSection) {
      notify('warning', 'Abre un apartado del documento primero.');
      return;
    }
    setIsUniversalGenerating(true);
    notify('warning', mode === 'reformular' ? 'Reformulando apartado…' : mode === 'ampliar' ? 'Ampliando apartado…' : 'Reduciendo apartado…');
    try {
      const res = await fetch('/api/legal-engine/generate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: universalDoc,
          sectionId: activeSection.id,
          instruction: REFINEMENT_INSTRUCTIONS[mode],
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Error en el servidor de IA.');
      }
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      const updatedSections = universalDoc.sections.map((sec) => {
        if (sec.id !== activeSection.id) return sec;
        return {
          ...sec,
          content: [
            {
              id: sec.content[0]?.id || crypto.randomUUID(),
              layer: 'GENERATED_ARGUMENT' as const,
              trustLevel: 'VERIFIED' as const,
              text: sanitizeClean(data.text),
              sources: data.sources,
              isManuallyEdited: false,
              style: sec.content[0]?.style || { fontFamily: 'inherit', fontSize: '13px', textAlign: 'justify', lineHeight: '1.6' },
            },
          ],
        };
      });
      const updated = { ...universalDoc, sections: updatedSections, updatedAt: new Date().toISOString() };
      setUniversalDoc(updated);
      const refreshed = updated.sections.find((s) => s.id === activeSection.id) || null;
      if (refreshed) setActiveSection(refreshed);
      notify('success', mode === 'reformular' ? 'Apartado reformulado.' : mode === 'ampliar' ? 'Apartado ampliado.' : 'Apartado reducido.');
    } catch (err: any) {
      notify('error', `Operación fallida: ${err.message}`);
    } finally {
      setIsUniversalGenerating(false);
    }
  };

  /* ── Regenerar Apartado ───────────────────────────────────────────────── */
  const handleRegenerateSection = async (sectionId: string, instruction?: string) => {
    if (!universalDoc) return;
    setIsUniversalGenerating(true);
    notify('warning', 'Actualizando apartado con IA...');

    try {
      const res = await fetch('/api/legal-engine/generate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: universalDoc, sectionId, instruction }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Error en el servidor de IA.');
      }
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      const updatedSections = universalDoc.sections.map((sec) => {
        if (sec.id === sectionId) {
          const blockId = sec.content[0]?.id || crypto.randomUUID();
          return {
            ...sec,
            isManuallyEdited: false,
            content: [
              {
                id: blockId,
                layer: 'GENERATED_ARGUMENT' as const,
                trustLevel: 'VERIFIED' as const,
                text: sanitizeClean(data.text),
                sources: data.sources,
                isManuallyEdited: false,
                style: sec.content[0]?.style || {
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  textAlign: 'justify',
                  lineHeight: '1.6',
                },
              },
            ],
          };
        }
        return sec;
      });

      const updated = { ...universalDoc, sections: updatedSections, updatedAt: new Date().toISOString() };
      setUniversalDoc(updated);
      const updatedActive = updated.sections.find((s) => s.id === sectionId) || null;
      if (updatedActive) setActiveSection(updatedActive);

      notify('success', 'Apartado actualizado correctamente.');
    } catch (err: any) {
      notify('error', `No se pudo regenerar el apartado: ${err.message}`);
    } finally {
      setIsUniversalGenerating(false);
    }
  };

  /* Generar Contestación con Machote - ASÍNCRONO (sin timeout global 30s) */
  const handleGenerateContestacion = async (request: string | {
    userInstructions: string;
    selectedDocumentType?: string;
    documentTypeLabel?: string;
    referenceDocumentId?: string;
    referenceDocumentText?: string;
    generationMode?: 'automatic' | 'personal_template' | 'reference_document';
    generationExtension?: { generationMode: 'standard' | 'extended-legal'; targetPages?: number; minPages?: number; maxPages?: number };
  }) => {
    const userInstructions = typeof request === 'string' ? request : request.userInstructions;
    const selectedDocumentTypeFromUi = typeof request === 'string' ? undefined : request.selectedDocumentType;
    const documentTypeLabelFromUi = typeof request === 'string' ? undefined : request.documentTypeLabel;
    const generationModeFromUi = typeof request === 'string' ? undefined : request.generationMode;
    const generationExtensionFromUi = typeof request === 'string' ? undefined : request.generationExtension;
    const referenceDocumentIdFromUi = typeof request === 'string' ? undefined : request.referenceDocumentId;
    const referenceDocumentTextFromUi = typeof request === 'string' ? undefined : request.referenceDocumentText;
    if (isUniversalGenerating || genIsGeneratingRef.current) {
      console.warn('[handleGenerateContestacion] Doble click bloqueado — Job activo', genJobIdRef.current?.slice(0,8));
      notify('warning', 'Ya hay una generación en curso. Por favor espera.');
      return;
    }
    genIsGeneratingRef.current = true;
    // BUG1+9: Barra GLOBAL + mantener análisis visible (fix solicitado: barra no debe desaparecer)
    // Motor Jurídico muestra barra en universal/analysis y permanece 13/40; Contestaciones debe hacer lo mismo
    // NO cerrar panel de Contestaciones prematuramente — ir a Motor Jurídico/analysis para mostrar progreso estable
    // (antes: solo global overlay; ahora también inner bar de universal como en Image 4)
    setActiveNavTab('universal');
    setUniversalViewMode('analysis');
    // NO onClose() ni setIsDraftGeneratorOpen(false) prematuro para Contestaciones (no hay modal que cerrar)
    setIsUniversalGenerating(true);
    setActiveGenJob({ jobId: '', total: 0, completed: 0, percentage: 0, currentBlock: null, status: 'processing', stage: 'Preparando contestación…' } as any);
    notify('warning', 'Generando contestación…');
    const genId2 = generationIdentityFactory.next();
    // A5: partes confirmadas desde el estado local (sin consulta DB en backend).
    const contestacionCaseParties = savedCaseParties
      .filter((p) => p.name && p.name.trim())
      .map((p) => ({ role: p.role, name: p.name.trim() }));
    const catalogEntry = selectedDocumentTypeFromUi ? getCatalogDocument(selectedDocumentTypeFromUi) : undefined;
    const catalogMatter = catalogEntry && catalogEntry.kind === 'DOCUMENT_TYPE'
      ? (catalogEntry.areaId.charAt(0).toUpperCase() + catalogEntry.areaId.slice(1))
      : undefined;
    const requestedMatter = catalogMatter || (/laboral/i.test(userInstructions) ? 'Laboral' : /mercantil/i.test(userInstructions) ? 'Mercantil' : /amparo/i.test(userInstructions) ? 'Amparo' : /civil/i.test(userInstructions) ? 'Civil' : (selectedFicha?.materia || 'General'));
    const inferredFromContext =
      (/laboral/i.test(userInstructions) ? 'contestacion_demanda_laboral' :
       /mercantil/i.test(userInstructions) ? 'contestacion_demanda_mercantil' :
       /amparo/i.test(userInstructions) ? 'recurso_revision_amparo_directo' :
       /familiar/i.test(userInstructions) ? 'contestacion_divorcio' :
       /agrario/i.test(userInstructions) ? 'contestacion_demanda_agraria' :
       /fiscal/i.test(userInstructions) ? 'contestacion_nulidad_fiscal' :
       /administrativ/i.test(userInstructions) ? 'contestacion_nulidad_administrativa' :
       undefined)
      || (selectedCaseDoc?.documentType && selectedCaseDoc.documentType !== 'DOCUMENTO_JURIDICO_NO_CLASIFICADO' ? selectedCaseDoc.documentType : undefined)
      || (selectedFicha?.materia ? (
          /laboral/i.test(selectedFicha.materia) ? 'contestacion_demanda_laboral' :
          /mercantil/i.test(selectedFicha.materia) ? 'contestacion_demanda_mercantil' :
          /amparo/i.test(selectedFicha.materia) ? 'recurso_revision_amparo_directo' :
          /familiar/i.test(selectedFicha.materia) ? 'contestacion_divorcio' :
          /agrario/i.test(selectedFicha.materia) ? 'contestacion_demanda_agraria' :
          /fiscal/i.test(selectedFicha.materia) ? 'contestacion_nulidad_fiscal' :
          /administrativ/i.test(selectedFicha.materia) ? 'contestacion_nulidad_administrativa' :
          undefined
        ) : undefined);

    const requestedDocumentType = selectedDocumentTypeFromUi || inferredFromContext;
    const requestedDocumentLabel = documentTypeLabelFromUi
      || (requestedDocumentType ? (catalogEntry?.label || requestedDocumentType.replace(/_/g, ' ')) : undefined);

    const effectiveGenMode = generationModeFromUi || generationMode;
    const effectiveRefId = effectiveGenMode === 'automatic'
      ? undefined
      : (referenceDocumentIdFromUi !== undefined ? referenceDocumentIdFromUi : (selectedTemplate?.id || 'machote-contestacion-amparo'));
    const effectiveRefText = effectiveGenMode === 'automatic'
      ? undefined
      : (referenceDocumentTextFromUi !== undefined ? referenceDocumentTextFromUi : selectedTemplateRefText);

    try {
      const res = await fetch('/api/legal-engine/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': genId2 },
        body: JSON.stringify({
          userInstruction: userInstructions || 'Redactar contestación de demanda formal y exhaustiva',
          sourceDocuments: uploadedSourceDocs,
          allowUnvalidatedSource: false,
          referenceDocumentId: effectiveRefId,
          referenceDocumentText: effectiveRefText,
          workflow: {
            sourceDocuments: uploadedSourceDocs,
            analysis: matterAnalysis || caseAnalysis || { facts: [], missingData: [] },
            selection: effectiveGenMode === 'personal_template' && effectiveRefId
              ? { mode: 'personal_template', templateId: effectiveRefId }
              : effectiveGenMode === 'reference_document'
                ? { mode: 'reference_document', referenceDocumentId: effectiveRefId || 'machote-contestacion-amparo' }
                : { mode: 'automatic' },
            flow: 'DOCUMENT_ANALYSIS',
            updatedAt: new Date().toISOString(),
          },
          documentTypeLabel: requestedDocumentLabel,
          selectedDocumentType: requestedDocumentType,
          matter: requestedMatter,
          caseParties: contestacionCaseParties.length > 0 ? contestacionCaseParties : undefined,
          generationExtension: generationExtensionFromUi || { generationMode: 'standard' },
          idempotencyKey: genId2,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        if (data?.jobId) {
          const jid = data.jobId as string;
          const reused = { jobId: jid, total: data.total ?? 0, completed: data.completed ?? 0, percentage: data.percentage ?? 0, currentBlock: data.currentBlock ?? null, status: data.status ?? 'processing', stage: data.stage } as any;
          setActiveGenJob(reused);
          try { localStorage.setItem('jr_active_gen_job', JSON.stringify(reused)); } catch {}
          startGenPolling(jid);
          notify('warning', 'Generación ya en curso — continuando…');
          return;
        }
        throw new Error(data?.error || 'Error al iniciar generación');
      }
      const jobId = data.jobId as string;
      if (!jobId) throw new Error('JobId no recibido del servidor');
      const initJob = { jobId, total: data.total ?? 0, completed: 0, percentage: 0, currentBlock: null, status: 'processing', stage: data.stage || 'Preparando contestación…' } as any;
      setActiveGenJob(initJob);
      try { localStorage.setItem('jr_active_gen_job', JSON.stringify(initJob)); } catch {}
      startGenPolling(jobId);
    } catch (error: any) {
      console.error('[handleGenerateContestacion] Error:', error);
      notify('error', `Fallo en la generación: ${error.message}`);
      setIsUniversalGenerating(false);
      genIsGeneratingRef.current = false;
      setActiveGenJob(null);
      try { localStorage.removeItem('jr_active_gen_job'); localStorage.removeItem('jr_active_gen_flow'); } catch {}
    }
  };

  /* ── Guardar / Exportar ────────────────────────────────────────────────── */
  // P1-2/P1-3: única ruta de persistencia. Acepta el documento a guardar (autosave
  // pasa latestDocRef.current para evitar closures obsoletas).
  const handleSaveDraft = async (sourceDoc?: UniversalLegalDocument): Promise<boolean> => {
    const targetDoc = sourceDoc || universalDoc;
    if (!targetDoc) return false;
    if (isSavingDraftRef.current) return false;
    isSavingDraftRef.current = true;
    setDraftSaveState('saving');
    try {
      const draftDocument = markDocumentAsDraft({
        ...targetDoc,
        sourceDocuments: (targetDoc.sourceDocuments || []).map((source) =>
          markDocumentAsSource({ ...source }, source.id)
        ),
      }) as UniversalLegalDocument;
      // Payload compatible con POST y con PATCH /legal-drafts/[id]
      const sharedPayload = {
        title: draftDocument.title,
        matter: draftDocument.matter,
        structuredDoc: draftDocument,
        sourceDocuments: draftDocument.sourceDocuments,
        generationMetadata: draftDocument.generationMetadata,
        formData: {
          flow: draftDocument.flow,
          intake: draftDocument.intake,
          caseAnalysis: draftDocument.caseAnalysis,
        },
        status: draftDocument.status === 'final' ? 'READY_FOR_PROFESSIONAL_REVIEW' : 'DRAFT',
      };

      // P1-3: reutilizar el draft existente (PATCH); solo POST si no hay id o ya no existe.
      let lastId: string | null = null;
      try { lastId = localStorage.getItem('jr_last_draft_id'); } catch { /* noop */ }

      // P1-2: no-op si el draft existe y el contenido es idéntico al último guardado.
      // La primera persistencia (sin draftId) siempre puede crear el draft vía POST.
      const signature = computeDraftSignature(draftDocument);
      if (lastId && signature === lastSavedSignatureRef.current) {
        setDraftSaveState('idle');
        return true;
      }

      if (lastId) {
        const patchRes = await fetch(`/api/legal-drafts/${encodeURIComponent(lastId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sharedPayload),
        });
        if (patchRes.ok) {
          const patchData = await patchRes.json();
          if (patchData?.ok) {
            try { localStorage.setItem('jr_last_draft_id', patchData.draft.id); } catch { /* noop */ }
            setHasSavedDraft(true);
            lastSavedSignatureRef.current = computeDraftSignature(draftDocument);
            setDraftSaveState('saved');
            window.setTimeout(() => setDraftSaveState('idle'), 2500);
            return true;
          }
          throw new Error(patchData?.error || 'No se pudo actualizar el borrador.');
        }
        // 404: el draft ya no existe → recrear vía POST más abajo.
        // Otro status: propagar como error.
        if (patchRes.status !== 404) {
          const errData = await patchRes.json().catch(() => null);
          throw new Error(errData?.error || `Error ${patchRes.status} al actualizar el borrador.`);
        }
      }

      const res = await fetch('/api/legal-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sharedPayload, documentType: targetDoc.documentType }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      try {
        localStorage.setItem('jr_last_draft_id', data.draft.id);
      } catch { /* noop */ }
      setHasSavedDraft(true);
      lastSavedSignatureRef.current = computeDraftSignature(draftDocument);
      setDraftSaveState('saved');
      window.setTimeout(() => setDraftSaveState('idle'), 2500);
      notify('success', `Borrador guardado: "${data.draft.title}".`);
      return true;
    } catch (err: any) {
      setDraftSaveState('idle');
      notify('error', `NO GUARDADO: ${err.message} Puedes reintentar.`);
      return false;
    } finally {
      isSavingDraftRef.current = false;
    }
  };

  const handleReopenDraft = async (): Promise<boolean> => {
    let lastId = '';
    try { lastId = localStorage.getItem('jr_last_draft_id') || ''; } catch { /* noop */ }
    if (!lastId) {
      notify('warning', 'No hay un borrador guardado para reabrir.');
      return false;
    }

    try {
      const res = await fetch(`/api/legal-drafts/${encodeURIComponent(lastId)}`);
      const data = await res.json();
      if (!res.ok || !data?.ok || !data.draft?.structuredDoc) {
        if (res.status === 404) {
          try { localStorage.removeItem('jr_last_draft_id'); } catch { /* noop */ }
          setHasSavedDraft(false);
        }
        throw new Error(data?.error || 'El borrador guardado no contiene un documento estructurado.');
      }

      const reopened = data.draft.structuredDoc as UniversalLegalDocument;
      if (!Array.isArray(reopened.sections) || reopened.sections.length === 0) {
        throw new Error('El borrador guardado no tiene secciones reabribles.');
      }
      latestDocRef.current = reopened;
      setUniversalDoc(reopened);
      setActiveSection(reopened.sections[0]);
      setUploadedSourceDocs(reopened.sourceDocuments || []);
      setCaseAnalysis(reopened.caseAnalysis || null);
      if (reopened.intake) {
        setInitialForm((previous) => ({
          ...previous,
          materia: reopened.intake?.matter || previous.materia,
          promovente: reopened.intake?.representedParty || previous.promovente,
          demandado: reopened.intake?.counterparty || previous.demandado,
          autoridad: reopened.intake?.authority || previous.autoridad,
          expediente: reopened.intake?.caseNumber || previous.expediente,
          pretensiones: reopened.intake?.objective || previous.pretensiones,
        }));
      }
      const savedMode = reopened.generationMetadata?.generationMode;
      if (savedMode === 'automatic' || savedMode === 'personal_template' || savedMode === 'reference_document') {
        setGenerationMode(savedMode);
      }
      setUniversalViewMode('editor');
      setActiveNavTab('universal');
      setHasSavedDraft(true);
      lastSavedSignatureRef.current = computeDraftSignature(reopened);
      notify('success', `Borrador reabierto: "${data.draft.title}".`);
      return true;
    } catch (err: any) {
      notify('error', `No se pudo reabrir el borrador: ${err.message}`);
      return false;
    }
  };
  // Mantener la ref del scheduler apuntando a la implementación vigente (en efecto, nunca en render)
  useEffect(() => {
    handleSaveDraftRef.current = handleSaveDraft;
  });

  /* ── Puente burbuja IA ↔ borrador actual ─────────────────────────────────
     1) Snapshot estructurado del documento real hacia el contexto de la burbuja.
     2) Registro del ejecutor REAL de ediciones: operaciones tipadas → estado del
        editor → persistencia por la ÚNICA ruta existente (handleSaveDraft).   */
  const { syncActiveDocument, clearActiveDocument, registerDocumentMutator } = useLegalWorkspaceContext();

  useEffect(() => {
    if (!universalDoc) return;
    let draftId = '';
    try { draftId = localStorage.getItem('jr_last_draft_id') || ''; } catch { /* noop */ }
    syncActiveDocument(buildWorkspaceSnapshot(universalDoc, draftId));
  }, [universalDoc, syncActiveDocument]);

  useEffect(() => () => { clearActiveDocument(); }, [clearActiveDocument]);

  useEffect(() => {
    const unregister = registerDocumentMutator(async (operations, opts) => {
      const baseDoc = latestDocRef.current;
      if (!baseDoc) {
        return {
          appliedCount: 0,
          failedCount: operations.length,
          failures: ['NO_DOCUMENT: no hay borrador abierto en el editor.'],
          saved: false,
        };
      }
      let draftId = '';
      try { draftId = localStorage.getItem('jr_last_draft_id') || ''; } catch { /* noop */ }
      const result = applyLegalEdits(baseDoc, operations, { expectedDraftId: draftId || undefined });
      if (!result.document) {
        return {
          appliedCount: 0,
          failedCount: result.failed.length,
          failures: result.failed.map((f) => `${f.reason}: ${f.detail}`),
          saved: false,
        };
      }
      handleUpdateDocument(result.document);
      let saved = false;
      if (opts?.persist !== false) {
        saved = (await handleSaveDraftRef.current?.(result.document)) ?? false;
      }
      return {
        appliedCount: result.applied.length,
        failedCount: result.failed.length,
        failures: result.failed.map((f) => `${f.reason}: ${f.detail}`),
        saved,
        documentId: baseDoc.id,
      };
    });
    return unregister;
  }, [registerDocumentMutator, handleUpdateDocument]);

  const handleMarkReadyToExport = () => {
    if (!universalDoc) return;
    try {
      const readyDoc = markDocumentAsReadyToExport(universalDoc, { explicit: true });
      setUniversalDoc(readyDoc);
      notify('success', 'Documento marcado como listo para exportar.');
    } catch (err: any) {
      notify('warning', `No se puede finalizar la revisión: ${err.message || 'Verifique campos pendientes.'}`);
    }
  };

  const handleExportDocx = async () => {
    if (!universalDoc) return;
    try {
      const res = await fetch('/api/legal-engine/export/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: universalDoc }),
      });
      const ct = res.headers.get('Content-Type') || '';
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        if (res.status === 422) {
          notify('warning', `El documento requiere revisión antes de exportarse: ${formatExportIssues(err.details) || formatExportIssues(err.error) || formatExportIssues(err.friendlyMessage)}`);
          return;
        }
        throw new Error(err.error || 'Error al generar DOCX en servidor.');
      }
      if (!ct.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'DOCX no válido');
      }
      const blob = await res.blob();
      if (blob.size < 500) throw new Error('DOCX vacío');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = extractDownloadFilename(res.headers.get('Content-Disposition'))
        || resolveDocumentOutputFilename(universalDoc, 'docx');
      a.click();
      URL.revokeObjectURL(url);
      notify('success', 'Documento DOCX exportado exitosamente.');
    } catch (err: any) {
      notify('error', `Error al exportar DOCX: ${err.message}`);
    }
  };

  const handleExportPdf = async () => {
    if (!universalDoc) return;
    try {
      const res = await fetch('/api/legal-engine/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: universalDoc }),
      });
      const ct = res.headers.get('Content-Type') || '';
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        if (res.status === 422) {
          notify('warning', `El documento requiere revisión antes de exportarse: ${formatExportIssues(err.details) || formatExportIssues(err.error) || formatExportIssues(err.friendlyMessage)}`);
          return;
        }
        throw new Error(err.error || 'Error al exportar PDF.');
      }
      if (!ct.includes('application/pdf')) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'PDF no generado (servidor sin capacidad PDF real). Intente DOCX.');
      }
      const blob = await res.blob();
      if (blob.size < 500) throw new Error('PDF vacío');
      // Validar cabecera PDF
      const header = new Uint8Array(await blob.slice(0,4).arrayBuffer());
      const headerStr = String.fromCharCode(...header);
      if (headerStr !== '%PDF') throw new Error('Archivo no es PDF válido');

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = extractDownloadFilename(res.headers.get('Content-Disposition'))
        || resolveDocumentOutputFilename(universalDoc, 'pdf');
      a.click();
      URL.revokeObjectURL(url);
      notify('success', 'PDF Real descargado.');
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const generatingStage = STAGES[pipelineStageIndex];
  const hasInitialContext = Boolean(caseFicha) || uploadedSourceDocs.length > 0;
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- detectCaseFicha es pura y determinista para memoización manual del expediente
  const liveCaseFicha = React.useMemo(() => (
    uploadedSourceDocs.length > 0
      ? detectCaseFicha(uploadedSourceDocs.map((s) => s.extractedText || ''))
      : null
  ), [uploadedSourceDocs]);

  // Contrato explícito: contexto seleccionado vs contexto materia
  // selectedFicha: ficha documental del documento actualmente seleccionado (por ID explícito)
  // matterAnalysis: análisis agregado de todos los sourceDocs (materia)
  const selectedSourceForFicha = React.useMemo(() => uploadedSourceDocs.find((s) => s.id === selectedCaseDoc?.id) || null, [uploadedSourceDocs, selectedCaseDoc?.id]);
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- detectCaseFicha pura, evita recalcular ficha en cada render
  const selectedFicha = React.useMemo(() => {
    if (selectedSourceForFicha) return detectCaseFicha([selectedSourceForFicha.extractedText || '']);
    return caseFicha || liveCaseFicha;
  }, [selectedSourceForFicha, caseFicha, liveCaseFicha]);
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- reconstructCaseAnalysis es costosa y determinista, se memoiza por uploadedSourceDocs
  const matterAnalysis = React.useMemo(() => reconstructCaseAnalysis(uploadedSourceDocs, ''), [uploadedSourceDocs]);

  return (
    <div className="machotes-shell h-[calc(100dvh-64px)] flex flex-col font-sans select-none overflow-hidden bg-[#f4f7f9]">
      <style>{`
        /* Machotes: la aplicación usa Vanilla CSS, no Tailwind. Esta capa hace explícitas
           las utilidades que esta pantalla necesita y fija el layout de referencia. */
        .machotes-shell {
          --mach-bg: #f5f4f7;
          --mach-surface: #ffffff;
          --mach-surface-soft: #f7f8fa;
          --mach-border: #d9dde3;
          --mach-text: #1E293B;
          --mach-muted: #64748B;
          --mach-primary: #0B2545;
          --mach-gold: #B58A5A;
          --mach-gold-light: #D6B887;
          --mach-gold-dark: #8F6745;
          min-height: 0;
          color: var(--mach-text);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .machotes-shell, .machotes-shell * { box-sizing: border-box; }
        .machotes-shell .flex { display:flex; }
        .machotes-shell .flex-col { flex-direction:column; }
        .machotes-shell .items-center { align-items:center; }
        .machotes-shell .items-start { align-items:flex-start; }
        .machotes-shell .justify-between { justify-content:space-between; }
        .machotes-shell .justify-center { justify-content:center; }
        .machotes-shell .flex-1 { flex:1 1 0%; }
        .machotes-shell .shrink-0 { flex-shrink:0; }
        .machotes-shell .min-w-0 { min-width:0; }
        .machotes-shell .min-h-0 { min-height:0; }
        .machotes-shell .w-full { width:100%; }
        .machotes-shell .h-full { height:100%; }
        .machotes-shell .overflow-hidden { overflow:hidden; }
        .machotes-shell .overflow-y-auto { overflow-y:auto; }
        .machotes-shell .overflow-x-auto { overflow-x:auto; }
        .machotes-shell .mx-auto { margin-left:auto; margin-right:auto; }
        .machotes-shell .space-y-4 > * + * { margin-top:1rem; }
        .machotes-shell .space-y-3\.5 > * + * { margin-top:.875rem; }
        .machotes-shell .space-y-3 > * + * { margin-top:.75rem; }
        .machotes-shell .space-y-2 > * + * { margin-top:.5rem; }
        .machotes-shell .space-y-1\.5 > * + * { margin-top:.375rem; }
        .machotes-shell .space-y-1 > * + * { margin-top:.25rem; }
        .machotes-shell .gap-2 { gap:.5rem; }
        .machotes-shell .gap-3 { gap:.75rem; }
        .machotes-shell .gap-3\.5 { gap:.875rem; }
        .machotes-shell .gap-4 { gap:1rem; }
        .machotes-shell .gap-6 { gap:1.5rem; }
        .machotes-shell .p-4 { padding:1rem; }
        .machotes-shell .p-5 { padding:1.25rem; }
        .machotes-shell .p-6 { padding:1.5rem; }
        .machotes-shell .px-4 { padding-left:1rem; padding-right:1rem; }
        .machotes-shell .px-5 { padding-left:1.25rem; padding-right:1.25rem; }
        .machotes-shell .px-6 { padding-left:1.5rem; padding-right:1.5rem; }
        .machotes-shell .py-2 { padding-top:.5rem; padding-bottom:.5rem; }
        .machotes-shell .py-2\.5 { padding-top:.625rem; padding-bottom:.625rem; }
        .machotes-shell .py-5 { padding-top:1.25rem; padding-bottom:1.25rem; }
        .machotes-shell .border { border:1px solid var(--mach-border); }
        .machotes-shell .border-b { border-bottom:1px solid var(--mach-border); }
        .machotes-shell .border-slate-100 { border-color:#e7eaee; }
        .machotes-shell .border-slate-200 { border-color:#dce1e7; }
        .machotes-shell .border-slate-300 { border-color:#cbd3dc; }
        .machotes-shell .rounded-xl { border-radius:12px; }
        .machotes-shell .rounded-2xl { border-radius:16px; }
        .machotes-shell .rounded-lg { border-radius:10px; }
        .machotes-shell .bg-white { background:#fff; }
        .machotes-shell .bg-slate-50 { background:#f7f8fa; }
        .machotes-shell .bg-slate-100 { background:#edf1f5; }
        .machotes-shell .text-slate-900 { color:#172230; }
        .machotes-shell .text-slate-800 { color:#263241; }
        .machotes-shell .text-slate-700 { color:#41505f; }
        .machotes-shell .text-slate-600 { color:#536171; }
        .machotes-shell .text-slate-500 { color:#6b7785; }
        .machotes-shell .text-slate-400 { color:#8b95a1; }
        .machotes-shell .text-emerald-700 { color:#167a5c; }
        .machotes-shell .text-white { color:#fff; }
        .machotes-shell .font-bold { font-weight:700; }
        .machotes-shell .font-extrabold { font-weight:800; }
        .machotes-shell .font-semibold { font-weight:600; }
        .machotes-shell .text-xs { font-size:.75rem; line-height:1.4; }
        .machotes-shell .text-sm { font-size:.875rem; line-height:1.4; }
        .machotes-shell .text-xl { font-size:1.55rem; line-height:1.1; }
        .machotes-shell .leading-relaxed { line-height:1.6; }
        .machotes-shell .leading-snug { line-height:1.35; }
        .machotes-shell .text-center { text-align:center; }
        .machotes-shell .text-justify { text-align:justify; }
        .machotes-shell .truncate { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .machotes-shell .shadow-xs { box-shadow:0 2px 8px rgba(15,23,42,.05); }
        .machotes-shell .shadow-2xs { box-shadow:0 1px 4px rgba(15,23,42,.04); }
        .machotes-shell .shadow-sm { box-shadow:0 2px 8px rgba(15,23,42,.05); }
        .machotes-shell .grid { display:grid; }
        .machotes-shell .grid-cols-1 { grid-template-columns:1fr; }
        .machotes-shell .grid-cols-2 { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .machotes-shell .grid-cols-12 { grid-template-columns:repeat(12,minmax(0,1fr)); }
        .machotes-shell .contestaciones-layout-grid { grid-template-columns:1fr; }
        .machotes-shell .contestaciones-main-column, .machotes-shell .contestaciones-side-column { grid-column:auto; }
        .machotes-shell .contestaciones-page-header { display:flex; flex-direction:column; gap:.5rem; }
        .machotes-shell .contestaciones-page-header h1 { margin:0; font-size:28px; line-height:1.15; letter-spacing:-.02em; }
        .machotes-shell .contestaciones-summary-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 16px; }
        .machotes-shell .contestaciones-summary-column { display:flex; flex-direction:column; gap:8px; min-width:0; }
        .machotes-shell .contestaciones-summary-field { display:grid; grid-template-columns:max-content minmax(0,1fr); align-items:baseline; gap:8px; min-width:0; }
        .machotes-shell .contestaciones-summary-field-status { align-items:center; }
        .machotes-shell .contestaciones-layout-grid h2 { margin:0; font-size:16px; line-height:1.25; letter-spacing:0; }
        .machotes-shell .contestaciones-layout-grid h3 { margin:0; font-size:14px; line-height:1.35; letter-spacing:0; }
        .machotes-shell .contestaciones-summary-card { min-height:150px; }
        .machotes-shell .contestaciones-side-column { display:flex; flex-direction:column; gap:14px; }
        .machotes-shell .contestaciones-config-grid { display:grid; grid-template-columns:1fr; gap:10px; }
        .machotes-shell .contestaciones-checklist-grid { display:grid; grid-template-columns:1fr; align-items:center; gap:12px; }
        .machotes-shell .contestaciones-checklist-items, .machotes-shell .contestaciones-checklist-action { min-width:0; }
        .machotes-shell .contestaciones-assistance-banner { min-height:74px; }
        .machotes-shell .lg\:grid-cols-12 { grid-template-columns:1fr; }
        .machotes-shell .lg\:col-span-3 { grid-column:span 12 / span 12; }
        .machotes-shell .lg\:col-span-6 { grid-column:span 12 / span 12; }
        .machotes-shell .lg\:col-span-7 { grid-column:span 12 / span 12; }
        .machotes-shell .lg\:col-span-5 { grid-column:span 12 / span 12; }
        .machotes-shell input, .machotes-shell select, .machotes-shell textarea { font:inherit; }
        .machotes-shell input, .machotes-shell select, .machotes-shell textarea { color:#172230; }
        .machotes-shell input::placeholder, .machotes-shell textarea::placeholder { color:#9aa5b1; }
        .machotes-shell textarea { resize:vertical; }
        .machotes-side { width:232px; min-width:232px; background:#293242; border-right:1px solid #1F2735; padding:20px 12px; display:flex; flex-direction:column; }
        .machotes-side-brand { display:flex; align-items:center; gap:12px; padding:0 10px 24px; font-size:18px; font-weight:800; color:#FFFFFF; }
        .machotes-side-mark { width:34px; height:34px; border-radius:10px; background:linear-gradient(135deg,#2f5f5c,#173b57); box-shadow:0 0 0 2px rgba(181,138,90,.45); }
        .machotes-side-nav { display:flex; flex-direction:column; gap:6px; }
        .machotes-side-btn { display:flex; align-items:center; gap:10px; width:100%; min-height:44px; padding:0 12px; border:0; border-radius:10px; background:transparent; color:#C7CFDB; font-size:14px; font-weight:600; text-align:left; cursor:pointer; transition:background .18s ease, color .18s ease, box-shadow .18s ease; }
        .machotes-side-btn:hover { background:rgba(255,255,255,.06); color:#FFFFFF; }
        .machotes-side-btn.is-active { background:#35415A; color:#FFFFFF; font-weight:800; box-shadow:inset 3px 0 0 var(--mach-gold); }
        .machotes-side-btn.is-active span:first-child { color:var(--mach-gold-light); }
        .machotes-main { flex:1; min-width:0; min-height:0; background:#F5F4F7; overflow:hidden; }
        .machotes-main-scroll { width:100%; height:100%; overflow:auto; padding:16px 28px 24px; }
        .machotes-title { margin:0; color:#111827; font-size:34px; line-height:1.05; letter-spacing:-.02em; font-weight:800; }
        .machotes-subtitle { margin:6px 0 0; color:#334155; font-size:16px; line-height:1.5; }
        .machotes-analysis-grid { display:grid !important; grid-template-columns:minmax(285px, .84fr) minmax(0, 1.55fr) minmax(270px, .82fr) !important; gap:18px; align-items:start; }
        .machotes-analysis-grid > .lg\:col-span-3 { grid-column:auto !important; }
        .machotes-analysis-grid > .lg\:col-span-6 { grid-column:auto !important; }
        .machotes-analysis-card, .machotes-context-card, .machotes-source-card { background:#fff; border:1px solid #d7dce2; border-radius:12px; box-shadow:0 1px 4px rgba(15,23,42,.04); }
        .machotes-context-card, .machotes-analysis-card { padding:16px; }
        .machotes-source-card { padding:14px; }
        .machotes-empty { border:1px dashed #c7cfd7; border-radius:10px; background:#fafbfc; padding:16px; color:#75808d; font-size:12px; line-height:1.5; }
        .machotes-section-title { margin:0; padding-bottom:10px; border-bottom:1px solid #e6eaee; color:#111827; font-size:20px; font-weight:800; }
        .machotes-field-label { display:block; margin-bottom:6px; color:#273444; font-size:13px; font-weight:800; }
        .machotes-shell .machotes-side + .machotes-main .machotes-page-header { margin-bottom:18px; }
        .machotes-shell .machotes-side + .machotes-main button { cursor:pointer; }
        @media (min-width: 1100px) {
          .machotes-shell .contestaciones-page-header { flex-direction:row; align-items:flex-start; justify-content:space-between; }
          .machotes-shell .contestaciones-side-column { margin-top:-55px; }
          .machotes-shell .contestaciones-main-column { margin-top:13px; }
          .machotes-shell .contestaciones-layout-grid { grid-template-columns:minmax(0,3fr) minmax(360px,2fr); }
          .machotes-shell .contestaciones-main-column { grid-column:1; }
          .machotes-shell .contestaciones-side-column { grid-column:2; }
          .machotes-shell .contestaciones-config-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .machotes-shell .contestaciones-checklist-grid { grid-template-columns:minmax(0,7fr) minmax(220px,5fr); }
          .machotes-shell .lg\:grid-cols-12 { grid-template-columns:repeat(12,minmax(0,1fr)); }
          .machotes-shell .lg\:col-span-3 { grid-column:span 3 / span 3; }
          .machotes-shell .lg\:col-span-6 { grid-column:span 6 / span 6; }
          .machotes-shell .lg\:col-span-7 { grid-column:span 7 / span 7; }
          .machotes-shell .lg\:col-span-5 { grid-column:span 5 / span 5; }
          .machotes-shell .sm\:grid-cols-2 { grid-template-columns:repeat(2,minmax(0,1fr)); }
        }
        @media (max-width: 1100px) {
          .machotes-shell .contestaciones-summary-fields { grid-template-columns:1fr; }
          .machotes-analysis-grid { grid-template-columns:1fr !important; }
          .machotes-side { width:72px; min-width:72px; padding:16px 8px; }
          .machotes-side-brand span, .machotes-side-btn span:last-child { display:none; }
          .machotes-side-btn { justify-content:center; padding:0; }
          .machotes-main-scroll { padding:18px; }
        }
        @media (max-width: 700px) {
          .machotes-side { display:none; }
          .machotes-main-scroll { padding:12px; }
        }
        .machotes-shell .templates-page { color:#1E293B; }
        .machotes-shell .templates-hero { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; padding:4px 2px 2px; }
        .machotes-shell .templates-hero-copy { display:flex; align-items:center; gap:14px; min-width:0; }
        .machotes-shell .templates-hero-icon { width:48px; height:48px; flex:0 0 48px; display:flex; align-items:center; justify-content:center; border-radius:16px; background:#EEF4FF; color:#0B5ED7; font-size:25px; font-weight:800; box-shadow:inset 0 0 0 1px #DCE8FA; }
        .machotes-shell .templates-hero h1 { margin:0; color:#0B2545; font-size:30px; line-height:1.15; letter-spacing:-.025em; font-weight:850; }
        .machotes-shell .templates-hero p { margin:4px 0 0; color:#64748B; font-size:15px; line-height:1.4; }
        .machotes-shell .templates-hero-note { display:flex; align-items:center; gap:12px; padding-top:12px; color:#64748B; font-size:12px; white-space:nowrap; }
        .machotes-shell .templates-hero-note span { display:inline-block; width:34px; height:2px; border-radius:999px; background:#B58A5A; }
        .machotes-shell .templates-metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)) minmax(300px,1.65fr); gap:14px; align-items:stretch; }
        .machotes-shell .templates-metric-card { min-height:112px; display:flex; align-items:center; gap:14px; padding:18px; background:#fff; border:1px solid #E2E8F0; border-radius:12px; box-shadow:0 2px 8px rgba(15,23,42,.045); }
        .machotes-shell .templates-metric-icon { width:54px; height:54px; flex:0 0 54px; display:flex; align-items:center; justify-content:center; border-radius:999px; font-size:25px; font-weight:800; }
        .machotes-shell .templates-metric-icon-blue { background:#EAF2FF; color:#0B5ED7; }
        .machotes-shell .templates-metric-icon-green { background:#E8F7F0; color:#15805D; }
        .machotes-shell .templates-metric-icon-slate { background:#EFF3F9; color:#0B2545; }
        .machotes-shell .templates-metric-card strong { display:block; margin:0; color:#0B2545; font-size:22px; line-height:1.05; font-weight:850; }
        .machotes-shell .templates-metric-card span:not(.templates-metric-icon) { display:block; margin-top:5px; color:#64748B; font-size:13px; line-height:1.25; }
        .machotes-shell .templates-profile-slot { min-width:0; }
        .machotes-shell .templates-profile-slot > * { height:100%; }
        .machotes-shell .templates-profile-slot h2 { font-size:16px; }
        .machotes-shell .templates-library-card { padding:18px; background:#fff; border:1px solid #E2E8F0; border-radius:12px; box-shadow:0 2px 10px rgba(15,23,42,.045); }
        .machotes-shell .templates-controls { display:grid; grid-template-columns:minmax(0,1fr) 250px auto; gap:14px; align-items:center; }
        .machotes-shell .templates-search-field, .machotes-shell .templates-filter-field { min-width:0; position:relative; display:flex; align-items:center; }
        .machotes-shell .templates-search-field > span { position:absolute; left:14px; color:#0B2545; font-size:25px; line-height:1; pointer-events:none; transform:translateY(-1px); }
        .machotes-shell .templates-search-field input, .machotes-shell .templates-filter-field select { width:100%; height:46px; border:1px solid #D5DEE9; border-radius:9px; background:#F8FAFD; color:#1E293B; font-size:14px; font-weight:600; outline:none; transition:border-color .18s ease, box-shadow .18s ease, background .18s ease; }
        .machotes-shell .templates-search-field input { padding:0 14px 0 42px; }
        .machotes-shell .templates-filter-field select { appearance:auto; padding:0 36px 0 14px; }
        .machotes-shell .templates-search-field input:focus, .machotes-shell .templates-filter-field select:focus { border-color:#0B5ED7; background:#fff; box-shadow:0 0 0 3px rgba(11,94,215,.1); }
        .machotes-shell .templates-create-button { height:46px; padding:0 18px; border:1px solid #A97822; border-radius:9px; background:linear-gradient(135deg,#C79632,#A97822); color:#fff; font-size:14px; font-weight:800; white-space:nowrap; box-shadow:0 4px 10px rgba(169,120,34,.18); }
        .machotes-shell .templates-create-button:hover { filter:brightness(.96); }
        .machotes-shell .templates-create-button span { font-size:21px; vertical-align:-1px; }
        .machotes-shell .templates-list-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; padding:22px 0 14px; border-bottom:1px solid #E8EDF3; }
        .machotes-shell .templates-list-heading h2 { margin:0; color:#0B2545; font-size:22px; line-height:1.1; font-weight:850; }
        .machotes-shell .templates-list-heading p { margin:5px 0 0; color:#64748B; font-size:14px; }
        .machotes-shell .templates-list { display:flex; flex-direction:column; gap:12px; padding-top:14px; }
        .machotes-shell .templates-row-card { display:grid; grid-template-columns:144px minmax(0,1fr) minmax(260px,.58fr); gap:18px; align-items:center; min-height:158px; padding:14px; border:1px solid #DDE5EE; border-radius:11px; background:#fff; transition:border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
        .machotes-shell .templates-row-card:hover { border-color:#B58A5A; box-shadow:0 6px 18px rgba(15,23,42,.07); transform:translateY(-1px); }
        .machotes-shell .templates-thumbnail { position:relative; width:132px; height:136px; overflow:hidden; display:flex; flex-direction:column; justify-content:space-between; padding:12px 10px 9px; border:1px solid #D8E0EA; border-radius:5px; background:#fff; color:#475569; box-shadow:0 2px 6px rgba(15,23,42,.09); cursor:pointer; text-align:left; }
        .machotes-shell .templates-thumbnail:focus-visible { outline:3px solid rgba(11,94,215,.22); outline-offset:2px; }
        .machotes-shell .templates-thumbnail-text { display:block; overflow:hidden; height:106px; white-space:pre-line; color:#64748B; font-family:Georgia,serif; font-size:6px; line-height:8px; }
        .machotes-shell .templates-thumbnail-lines { display:flex; flex-direction:column; gap:7px; padding-top:8px; }
        .machotes-shell .templates-thumbnail-lines span { display:block; height:4px; border-radius:99px; background:#CBD5E1; }
        .machotes-shell .templates-thumbnail-lines span:nth-child(2) { width:88%; background:#E2E8F0; }
        .machotes-shell .templates-thumbnail-lines span:nth-child(3) { width:72%; background:#E2E8F0; }
        .machotes-shell .templates-thumbnail-lines span:nth-child(4) { width:94%; background:#E2E8F0; }
        .machotes-shell .templates-thumbnail-lines span:nth-child(5) { width:61%; background:#F1F5F9; }
        .machotes-shell .templates-thumbnail-caption { color:#0B2545; font-size:10px; font-weight:800; text-align:center; }
        .machotes-shell .templates-row-main { min-width:0; align-self:stretch; display:flex; flex-direction:column; justify-content:center; }
        .machotes-shell .templates-row-topline { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
        .machotes-shell .templates-matter-tag { display:inline-flex; align-items:center; min-height:24px; padding:3px 10px; border:1px solid currentColor; border-radius:999px; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.02em; }
        .machotes-shell .templates-row-format { color:#64748B; font-size:12px; font-weight:700; }
        .machotes-shell .templates-row-main h3 { margin:0; color:#0B2545; font-size:18px; line-height:1.22; font-weight:850; cursor:pointer; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
        .machotes-shell .templates-row-main h3:hover { color:#0B5ED7; }
        .machotes-shell .templates-row-main > p { margin:6px 0 0; color:#64748B; font-size:13px; line-height:1.42; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
        .machotes-shell .templates-row-meta { display:flex; align-items:center; flex-wrap:wrap; gap:16px; margin-top:12px; color:#64748B; font-size:12px; font-weight:600; }
        .machotes-shell .templates-row-actions { min-width:0; min-height:126px; display:flex; flex-direction:column; justify-content:space-between; padding-left:18px; border-left:1px solid #E3E8EF; }
        .machotes-shell .templates-row-summary { margin:0; color:#64748B; font-size:13px; line-height:1.45; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; }
        .machotes-shell .templates-action-buttons { display:grid; grid-template-columns:minmax(0,1fr) 52px 52px; gap:10px; align-items:center; }
        .machotes-shell .templates-use-button { height:44px; border:1px solid #0B2545; border-radius:8px; background:#0B3567; color:#fff; font-size:14px; font-weight:850; }
        .machotes-shell .templates-use-button:hover { background:#092b54; }
        .machotes-shell .templates-icon-button { width:52px; height:44px; border:1px solid #D6DFEA; border-radius:8px; background:#fff; color:#0B2545; font-size:20px; font-weight:700; }
        .machotes-shell .templates-icon-button:hover { background:#F8FAFD; border-color:#9CB2CC; }
        .machotes-shell .templates-delete-button { color:#D4473E; }
        .machotes-shell .templates-delete-button:hover { background:#FFF4F3; border-color:#F2B6B0; }
        .machotes-shell .templates-empty-state { margin-top:16px; padding:42px 20px; border:1px dashed #C9D4E1; border-radius:10px; background:#FAFCFE; text-align:center; }
        .machotes-shell .templates-empty-icon { color:#0B5ED7; font-size:32px; }
        .machotes-shell .templates-empty-state h3 { margin:10px 0 5px; color:#0B2545; font-size:16px; font-weight:800; }
        .machotes-shell .templates-empty-state p { margin:0 auto 14px; max-width:420px; color:#64748B; font-size:13px; }
        .machotes-shell .templates-reset-button { padding:9px 14px; border:1px solid #D6DFEA; border-radius:8px; background:#fff; color:#0B2545; font-size:12px; font-weight:800; }
        .machotes-shell .templates-reset-button:hover { background:#F8FAFD; }
        .machotes-shell .machotes-side { position:relative; transition:width .2s ease, min-width .2s ease, padding .2s ease, box-shadow .2s ease; }
        .machotes-shell .machotes-side.is-open { width:232px; min-width:232px; padding:20px 12px; }
        .machotes-shell .machotes-side.is-collapsed { width:64px; min-width:64px; padding:16px 8px; }
        .machotes-shell .machotes-side.is-collapsed .machotes-side-brand, .machotes-shell .machotes-side.is-collapsed .machotes-side-footer { display:none; }
        .machotes-shell .machotes-side.is-collapsed .machotes-side-btn { justify-content:center; padding:0; }
        .machotes-shell .machotes-side.is-collapsed .machotes-side-btn span:last-child { display:none; }
        .machotes-shell .machotes-side-toggle { width:100%; min-height:40px; display:flex; align-items:center; justify-content:center; gap:10px; border:1px solid rgba(214,184,135,.32); border-radius:10px; background:rgba(255,255,255,.05); color:#fff; font-size:22px; line-height:1; cursor:pointer; }
        .machotes-shell .machotes-side-toggle:hover { background:rgba(255,255,255,.11); }
        .machotes-shell .machotes-side.is-open .machotes-side-toggle { width:40px; margin-left:auto; margin-bottom:14px; }
        .machotes-shell .machotes-side.is-open .machotes-side-toggle-label { display:none; }
        .machotes-shell .machotes-side.is-collapsed .machotes-side-toggle-label { display:none; }
        .machotes-shell .machotes-side-footer { margin-top:auto; }
        @media (max-width: 1100px) {
          .machotes-shell .templates-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .machotes-shell .templates-profile-slot { grid-column:1 / -1; }
          .machotes-shell .templates-controls { grid-template-columns:minmax(0,1fr) minmax(190px,.45fr); }
          .machotes-shell .templates-create-button { grid-column:1 / -1; justify-self:start; }
          .machotes-shell .templates-row-card { grid-template-columns:118px minmax(0,1fr); }
          .machotes-shell .templates-thumbnail { width:108px; height:124px; }
          .machotes-shell .templates-row-actions { grid-column:2; min-height:0; padding:12px 0 0; border-left:0; border-top:1px solid #E3E8EF; }
          .machotes-shell .templates-row-summary { display:none; }
        }
        @media (max-width: 700px) {
          .machotes-shell .templates-hero { flex-direction:column; }
          .machotes-shell .templates-hero-note { padding-top:0; }
          .machotes-shell .templates-hero h1 { font-size:24px; }
          .machotes-shell .templates-hero p { font-size:13px; }
          .machotes-shell .templates-metrics, .machotes-shell .templates-controls { grid-template-columns:1fr; }
          .machotes-shell .templates-profile-slot, .machotes-shell .templates-create-button { grid-column:auto; width:100%; }
          .machotes-shell .templates-row-card { grid-template-columns:1fr; }
          .machotes-shell .templates-thumbnail { width:100%; height:112px; }
          .machotes-shell .templates-row-actions { grid-column:auto; }
          .machotes-shell .templates-action-buttons { grid-template-columns:minmax(0,1fr) 48px 48px; }
          .machotes-shell .templates-icon-button { width:48px; }
        }
      `}</style>
      <div className="machotes-shell-body flex-1 flex min-h-0 min-w-0 overflow-hidden">
        <aside className={`machotes-side shrink-0 ${isSidebarOpen ? 'is-open' : 'is-collapsed'}`}>
          <button
            type="button"
            className="machotes-side-toggle"
            onClick={() => setIsSidebarOpen((open) => !open)}
            aria-label={isSidebarOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
            aria-expanded={isSidebarOpen}
          >
            <span aria-hidden="true">{isSidebarOpen ? '×' : '☰'}</span>
            <span className="machotes-side-toggle-label">Menú</span>
          </button>
          <div className="machotes-side-brand"><div className="machotes-side-mark" aria-hidden="true" /><span>Radar Jurídico</span></div>
          <nav className="machotes-side-nav" aria-label="Módulos de Machotes">
            <button className={`machotes-side-btn ${activeNavTab === 'universal' ? 'is-active' : ''}`} onClick={() => handleSwitchMode('universal')}><span>⚙</span><span>Motor Jurídico</span></button>
            <button className={`machotes-side-btn ${activeNavTab === 'initial_writings' ? 'is-active' : ''}`} onClick={() => handleSwitchMode('initial_writings')}><span>▤</span><span>Escritos Iniciales</span></button>
            <button className={`machotes-side-btn ${activeNavTab === 'responses_resources' ? 'is-active' : ''}`} onClick={() => handleSwitchMode('responses_resources')}><span>⚖</span><span>Contestaciones</span></button>
            <button className={`machotes-side-btn ${activeNavTab === 'my-templates' ? 'is-active' : ''}`} onClick={() => handleSwitchMode('my-templates')}><span>□</span><span>Mis Plantillas</span></button>
          </nav>
          <div
            className="machotes-side-footer"
            style={{
              marginTop: 'auto',
              paddingTop: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              paddingLeft: 8,
              paddingRight: 8,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '9999px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 800,
                color: '#fff',
                background: 'linear-gradient(135deg,#B58A5A,#8F6745)',
                boxShadow: '0 0 0 2px rgba(214,184,135,.35)',
              }}
            >
              N
            </div>
          </div>
        </aside>
        <section className="machotes-main flex-1 min-w-0 min-h-0 overflow-hidden">
          <div className="machotes-main-scroll">
      {/* ── BANNER DE NOTIFICACIONES / FEEDBACK ────────────────────────────── */}
      {feedback && (
        <div
          className={`machotes-feedback mx-4 mt-2 px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-between border shadow-sm shrink-0 transition-all font-sans ${
            feedback.tone === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : feedback.tone === 'error'
              ? 'bg-red-50 border-red-300 text-red-800'
              : 'bg-amber-50 border-amber-300 text-amber-800'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="hover:opacity-75 font-bold px-2">
            ✕
          </button>
        </div>
      )}

      {/* BARRA GLOBAL DE GENERACIÓN — persiste al cambiar de pestaña (P6) */}
      {isUniversalGenerating && (
        <div className="mx-4 mt-2">
          <GenerationStatusBar job={activeGenJob} onCancel={handleCancelGeneration} cancelling={isCancelling} />
        </div>
      )}

      {/* ── CUERPO PRINCIPAL DEL WORKSPACE ─── */}
      <div className="machotes-workspace-content w-full min-h-0 min-w-0 overflow-hidden">
        {activeNavTab === 'my-templates' ? (
          /* TAB 4: MIS PLANTILLAS */
          <div className="w-full min-h-0 overflow-y-auto font-sans">
            <div className="templates-workspace w-full mx-auto px-5 md:px-7 py-5 md:py-6">
              <TemplateLibraryManager
                templates={customTemplates}
                onUseTemplate={(tpl) => handleUseTemplate(tpl)}
                onEditTemplate={(tpl) => handleEditTemplate(tpl)}
                onDeleteTemplate={(id) => handleDeleteTemplate(id)}
                onCreateNewTemplate={() => setIsSaveCustomOpen(true)}
                profileSlot={
                  <LawyerStyleProfileCard
                    uploadedSourceDocs={uploadedSourceDocs}
                    onRequestFiles={() => fileInputHiddenRef.current?.click()}
                  />
                }
              />
            </div>
          </div>
        ) : activeNavTab === 'responses_resources' ? (
          /* TAB 3: CONTESTACIONES Y RECURSOS (PANEL DE COTEJO DOCUMENTAL 1:1) */
          <div className="min-h-screen min-w-0 w-full overflow-x-hidden overflow-y-auto bg-[#F5F7FA]">
            <CaseDocumentsReader
              documents={caseDocuments}
              sourceDocs={uploadedSourceDocs}
              customTemplates={customTemplates}
              selectedDocId={selectedCaseDoc?.id}
              caseFicha={selectedFicha}
              onSelectDocument={(doc) => setSelectedCaseDoc(doc)}
              onUploadNewDocument={() => fileInputHiddenRef.current?.click()}
               onGenerateResponse={(request) => {
                 handleGenerateContestacion(request || '');
              }}
              onOpenEditor={() => {
                setUniversalViewMode('editor');
                setActiveNavTab('universal');
              }}
              isGenerating={isUniversalGenerating}
              generationJob={activeGenJob}
            />
          </div>
        ) : activeNavTab === 'initial_writings' && initialViewMode === 'form' ? (
          /* TAB 2: ESCRITOS INICIALES - FORMULARIO JURÍDICO ESPECIALIZADO */
          <div className="w-full min-h-0 overflow-y-auto font-sans">
            <div className="w-full max-w-[1800px] mx-auto px-5 md:px-6 py-5 md:py-6 space-y-4">
              {/* Encabezado Superior */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-1">
                <div className="space-y-0.5">
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                    Escritos Iniciales
                  </h1>
                  <p className="text-xs text-slate-500 font-medium">
                    Genera demandas y escritos iniciales con fundamentación procesal y técnica jurídica.
                  </p>
                </div>

                {universalDoc && (
                  <button
                    onClick={() => setInitialViewMode('editor')}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                  >
                    <span>Continuar al editor jurídico</span>
                    <span>→</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4.5 items-start">
                {/* Columna Principal: Formulario Estructurado */}
                <div className={`${hasInitialContext ? 'lg:col-span-7' : 'lg:col-span-12'} bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4`}>
                  <div className="border-b border-slate-100 pb-2.5">
                    <h2 className="text-sm font-bold text-slate-900">
                      Datos procesales del escrito inicial
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-1">Flujo guiado en 6 pasos — avanza a tu ritmo, tus datos se guardan automáticamente.</p>
                  </div>

                  {/* Progress wizard (BLOCK D) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-slate-700">Paso {initialStep} de 6</span>
                      <span className="text-slate-400">{Math.round((initialStep/6)*100)}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#0B2545] transition-all duration-300" style={{ width: `${(initialStep/6)*100}%` }} />
                    </div>
                    <div className="flex gap-1 text-[10px] leading-tight">
                      {[
                        '¿Qué vas a presentar?',
                        '¿Quién interviene?',
                        '¿Qué ocurrió?',
                        '¿Qué solicitas?',
                        'Pruebas',
                        'Instrucciones IA',
                      ].map((label, idx) => (
                        <div key={idx} className={`flex-1 text-center py-1 rounded-md border text-[10px] ${initialStep === idx+1 ? 'bg-[#0B2545] text-white border-[#0B2545]' : initialStep > idx+1 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                          <span className="hidden sm:inline">{idx+1}. {label}</span>
                          <span className="sm:hidden">{idx+1}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3.5 text-xs text-slate-800">
                    {initialStep === 1 && (
                      <div className="space-y-3">
                        <h3 className="text-xs font-black text-[#0B2545] uppercase tracking-widest">Paso 1 · ¿Qué vas a presentar?</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <TaxonomySelect
                            label="Materia"
                            value={initialForm.materia}
                            options={MATTERS.map((m) => ({ value: m.value, label: m.label }))}
                            onChange={(v) => setInitialForm((prev) => ({ ...prev, materia: v }))}
                            customValue={initialForm.materiaCustom}
                            onCustomChange={(v) => setInitialForm((prev) => ({ ...prev, materiaCustom: sanitizeCustomValue(v) || v.slice(0, CUSTOM_VALUE_MAX_LENGTH) }))}
                          />
                          <TaxonomySelect
                            label="Jurisdicción"
                            value={initialForm.jurisdiccion}
                            options={JURISDICTIONS.map((j) => ({ value: j.value, label: j.label }))}
                            onChange={(v) => setInitialForm((prev) => ({ ...prev, jurisdiccion: v }))}
                            customValue={initialForm.jurisdiccionCustom}
                            onCustomChange={(v) => setInitialForm((prev) => ({ ...prev, jurisdiccionCustom: sanitizeCustomValue(v) || v.slice(0, CUSTOM_VALUE_MAX_LENGTH) }))}
                          />
                          <TaxonomySelect
                            label="Tipo de Escrito"
                            value={initialForm.tipoEscrito}
                            options={DOCUMENT_TYPES.filter((d) => d.category === 'inicial' || d.category === 'promocion' || d.value === 'otro').map((d) => ({ value: d.value, label: d.label }))}
                        onChange={(v) => setInitialForm((prev) => ({ ...prev, tipoEscrito: v }))}
                        customValue={initialForm.tipoEscritoCustom}
                        onCustomChange={(v) => setInitialForm((prev) => ({ ...prev, tipoEscritoCustom: sanitizeCustomValue(v) || v.slice(0, CUSTOM_VALUE_MAX_LENGTH) }))}
                      />
                        </div>
                      </div>
                    )}

                    {initialStep === 2 && (
                      <div className="space-y-3">
                        <h3 className="text-xs font-black text-[#0B2545] uppercase tracking-widest">Paso 2 · ¿Quién interviene?</h3>
                    {/* Partes Procesales */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-700 block">Parte Promovente / Quejoso</label>
                        <input
                          type="text"
                          value={initialForm.promovente}
                          onChange={(e) => setInitialForm((prev) => ({ ...prev, promovente: e.target.value }))}
                          placeholder="Nombre completo o razón social"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#0B2545]"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-700 block">Autoridad Responsable / Demandado</label>
                        <input
                          type="text"
                          value={initialForm.demandado}
                          onChange={(e) => setInitialForm((prev) => ({ ...prev, demandado: e.target.value }))}
                          placeholder="Nombre o autoridad señalada"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#0B2545]"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block">Número de Expediente</label>
                      <input
                        type="text"
                        value={initialForm.expediente}
                        onChange={(e) => setInitialForm((prev) => ({ ...prev, expediente: e.target.value }))}
                        placeholder="Ej. LAB-001/2026"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#0B2545]"
                      />
                      <p className="text-[10px] text-slate-400">Se usará como referencia del expediente en el documento generado.</p>
                    </div>

                      </div>
                    )}

                    {initialStep === 3 && (
                      <div className="space-y-3">
                        <h3 className="text-xs font-black text-[#0B2545] uppercase tracking-widest">Paso 3 · ¿Qué ocurrió?</h3>
                        <div className="space-y-1">
                          <label className="font-bold text-slate-700 block">Hechos Fundatorios</label>
                          <textarea
                            rows={4}
                            value={initialForm.hechos}
                            onChange={(e) => setInitialForm((prev) => ({ ...prev, hechos: e.target.value }))}
                            placeholder="Relata cronológicamente los antecedentes y hechos relevantes..."
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#0B2545]"
                          />
                        </div>
                      </div>
                    )}

                    {initialStep === 4 && (
                      <div className="space-y-3">
                        <h3 className="text-xs font-black text-[#0B2545] uppercase tracking-widest">Paso 4 · ¿Qué estás solicitando?</h3>
                        <div className="space-y-1">
                          <label className="font-bold text-slate-700 block">Prestaciones / Acto Reclamado</label>
                          <textarea
                            rows={3}
                            value={initialForm.pretensiones}
                            onChange={(e) => setInitialForm((prev) => ({ ...prev, pretensiones: e.target.value }))}
                            placeholder="Indica qué solicitas o cuál es el acto impugnado..."
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#0B2545]"
                          />
                        </div>
                      </div>
                    )}

                    {initialStep === 5 && (
                      <div className="space-y-4">
                        <h3 className="text-xs font-black text-[#0B2545] uppercase tracking-widest">Paso 5 · Pruebas y documentos</h3>
                        <div className="space-y-1">
                          <label className="font-bold text-slate-700 block">Pruebas a Ofrecer</label>
                          <textarea
                            rows={3}
                            value={initialForm.pruebas}
                            onChange={(e) => setInitialForm((prev) => ({ ...prev, pruebas: e.target.value }))}
                            placeholder="Describe las pruebas, documentos y anexos que acompañan..."
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#0B2545]"
                          />
                        </div>

                        {/* Documentos y anexos — uploader integrado Paso 5 */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black text-[#0B2545] uppercase tracking-widest">Documentos y anexos</h4>
                            <span className="text-[10px] text-slate-500 font-semibold bg-white border border-slate-200 rounded-full px-2 py-0.5">{uploadedSourceDocs.length} archivo(s)</span>
                          </div>

                          <div
                            onDragOver={(e) => { e.preventDefault(); setIsDraggingDocs(true); }}
                            onDragLeave={() => setIsDraggingDocs(false)}
                            onDrop={handleDocsDrop}
                            className={`border-2 border-dashed rounded-xl p-5 text-center transition cursor-pointer ${isDraggingDocs ? 'border-[#0B2545] bg-[#0B2545]/5' : 'border-slate-300 bg-white hover:border-[#0B2545]/40 hover:bg-slate-50'}`}
                            onClick={() => fileInputHiddenRef.current?.click()}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputHiddenRef.current?.click(); } }}
                            aria-label="Zona para subir documentos"
                          >
                            <div className="flex flex-col items-center gap-2">
                              <span className="text-2xl" aria-hidden>📄</span>
                              <p className="text-xs font-bold text-slate-700">Arrastra aquí tus documentos</p>
                              <p className="text-[11px] text-slate-400">PDF, DOCX, DOC, JPG, PNG · Máx. 15 MB por archivo</p>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); fileInputHiddenRef.current?.click(); }}
                                className="mt-1 px-4 py-1.5 rounded-full bg-[#0B2545] hover:bg-[#081d39] text-white text-xs font-bold transition"
                              >
                                + Subir documentos
                              </button>
                              <p className="text-[10px] text-slate-400 mt-1">Se guardarán con tu expediente y se enviarán a la IA al generar.</p>
                            </div>
                          </div>

                          {docsUploadError && (
                            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 font-medium" role="alert">
                              {docsUploadError}
                            </div>
                          )}

                          {uploadedSourceDocs.length > 0 ? (
                            <div className="space-y-1.5">
                              {uploadedSourceDocs.map((doc) => (
                                <div key={doc.id} className="flex items-center justify-between gap-3 p-2.5 bg-white border border-slate-200 rounded-lg">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-slate-800 truncate" title={doc.name || doc.filename || ''}>{doc.name || doc.filename || 'Documento'}</p>
                                    <p className="text-[11px] text-slate-500">
                                      {formatFileSize((doc as any).fileSizeBytes)} · {doc.pages?.length || 1} pág(s) · <span className="text-emerald-600 font-bold">✓ Cargado</span>
                                      {doc.sourceValidated === false && <span className="text-amber-600 font-bold"> · Revisión requerida</span>}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => { setDocsUploadError(null); handleRemoveUploadedSource(doc.id); }}
                                    className="shrink-0 px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-red-50 text-slate-500 hover:text-red-600 text-xs font-bold transition"
                                    aria-label={`Eliminar ${doc.name || doc.filename || 'documento'}`}
                                    title="Eliminar"
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-400 text-center py-1">Sin documentos aún. Sube tu primer archivo.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {initialStep === 6 && (
                      <div className="space-y-3">
                        <h3 className="text-xs font-black text-[#0B2545] uppercase tracking-widest">Paso 6 · Instrucciones para la IA</h3>
                        <div className="space-y-1">
                          <label className="font-bold text-slate-700 block">Instrucción Especial para la IA</label>
                          <textarea
                            rows={3}
                            value={initialForm.instrucciones}
                            onChange={(e) => setInitialForm((prev) => ({ ...prev, instrucciones: e.target.value }))}
                            placeholder="Ej. Énfasis en suplencia de la queja, tono combativo, citar jurisprudencia específica..."
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#0B2545]"
                          />
                        </div>
                      </div>
                    )}

                    {/* Navegación wizard + Acción final */}
                    <div className="pt-3 flex items-center justify-between gap-3 border-t border-slate-100">
                      <button
                        onClick={() => setInitialStep((s) => Math.max(1, s - 1))}
                        disabled={initialStep === 1}
                        className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold disabled:opacity-40 hover:bg-slate-50 transition"
                      >
                        ← Anterior
                      </button>
                      <div className="flex items-center gap-2">
                        {initialStep < 6 ? (
                          <button
                            onClick={() => setInitialStep((s) => Math.min(6, s + 1))}
                            className="px-6 py-2.5 rounded-xl bg-[#0B2545] hover:bg-[#081d39] text-white text-xs font-extrabold shadow-xs transition flex items-center gap-2"
                          >
                            <span>Siguiente</span>
                            <span>→</span>
                          </button>
                        ) : (
                          <button
                            onClick={async () => {
                              const effMatter = initialForm.materia === 'otro' ? (initialForm.materiaCustom || 'Otro') : (MATTERS.find((m) => m.value === initialForm.materia)?.label || initialForm.materia);
                              const effJuris = initialForm.jurisdiccion === 'otra' ? (initialForm.jurisdiccionCustom || 'Otra') : (JURISDICTIONS.find((j) => j.value === initialForm.jurisdiccion)?.label || initialForm.jurisdiccion);
                              const effTipo = initialForm.tipoEscrito === 'otro' ? (initialForm.tipoEscritoCustom || 'Escrito libre') : (DOCUMENT_TYPES.find((d) => d.value === initialForm.tipoEscrito)?.label || initialForm.tipoEscrito);
                              const expedienteVal = initialForm.expediente?.trim() || '';
                              const promptParts = [
                                `Redactar ${effTipo || 'escrito jurídico'}.`,
                                effMatter ? `Materia: ${effMatter}.` : '',
                                effJuris ? `Jurisdicción: ${effJuris}.` : '',
                                expedienteVal ? `Expediente: ${expedienteVal}.` : '',
                                initialForm.promovente.trim() ? `Parte promovente: ${initialForm.promovente.trim()}.` : '',
                                initialForm.demandado.trim() ? `Contraparte o autoridad: ${initialForm.demandado.trim()}.` : '',
                                initialForm.autoridad.trim() ? `Autoridad: ${initialForm.autoridad.trim()}.` : '',
                                initialForm.pretensiones.trim() ? `Objetivo y pretensiones: ${initialForm.pretensiones.trim()}.` : '',
                                initialForm.hechos.trim() ? `Hechos aportados: ${initialForm.hechos.trim()}.` : '',
                                initialForm.pruebas.trim() ? `Pruebas confirmadas: ${initialForm.pruebas.trim()}.` : '',
                                initialForm.instrucciones.trim() ? `Instrucciones: ${initialForm.instrucciones.trim()}.` : '',
                              ].filter(Boolean);
                              const promptText = promptParts.join(' ');
                              const taxonomy = {
                                matter: initialForm.materia,
                                matterCustom: initialForm.materia === 'otro' && initialForm.materiaCustom ? { value: 'otro', label: 'Otro', customValue: initialForm.materiaCustom } : null,
                                jurisdiction: initialForm.jurisdiccion,
                                jurisdictionCustom: initialForm.jurisdiccion === 'otra' && initialForm.jurisdiccionCustom ? { value: 'otra', label: 'Otra', customValue: initialForm.jurisdiccionCustom } : null,
                                documentType: initialForm.tipoEscrito,
                                documentTypeCustom: initialForm.tipoEscrito === 'otro' && initialForm.tipoEscritoCustom ? { value: 'otro', label: 'Otro', customValue: initialForm.tipoEscritoCustom } : null,
                              };
                              // Aislar documentos y partes de esta sesión.
                              const sessionDocs = uploadedSourceDocs.filter((d) => initialWritingsSessionDocIds.has(d.id));
                              const partiesForPipeline: Array<{role:string; name:string}> = [];
                              if (initialForm.promovente.trim()) partiesForPipeline.push({ role: 'actor', name: initialForm.promovente.trim(), source: 'manual' } as any);
                              if (initialForm.demandado.trim()) partiesForPipeline.push({ role: 'demandado', name: initialForm.demandado.trim(), source: 'manual' } as any);
                              await handleRunPipeline({
                                userInstruction: promptText,
                                intentLabel: effTipo || 'Escrito Inicial',
                                sourceDocs: sessionDocs,
                                flowLabel: 'escrito_inicial',
                                taxonomy,
                                caseParties: partiesForPipeline.length > 0 ? partiesForPipeline : undefined,
                                expediente: expedienteVal || undefined,
                              } as any);
                            }}
                            disabled={isUniversalGenerating}
                            className="px-6 py-2.5 rounded-xl bg-[#0B2545] hover:bg-[#081d39] disabled:opacity-50 text-white text-xs font-extrabold shadow-xs transition flex items-center gap-2"
                          >
                            <span>⚡</span>
                            <span>{isUniversalGenerating ? 'Generando...' : 'Generar Escrito Inicial'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 text-center">Tus datos se guardan automáticamente al avanzar entre pasos.</p>
                    {/* Progreso global ahora en barra superior (P6) — evita duplicar */}
                  </div>
                </div>

                {/* Columna Derecha: Contexto real del expediente (solo si existe) */}
                {hasInitialContext && (
                  <div className="lg:col-span-5 space-y-4">
                    {caseFicha && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
                        <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                          <span>📋</span>
                          <span>Ficha del expediente</span>
                        </h3>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-slate-700">
                          {caseFicha.expediente && (
                            <div className="space-y-0.5 col-span-2">
                              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Expediente</span>
                              <p className="font-mono font-semibold text-[#0B2545]">{caseFicha.expediente}</p>
                            </div>
                          )}
                          {caseFicha.materia && (
                            <div className="space-y-0.5">
                              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Materia</span>
                              <p className="font-semibold">{caseFicha.materia}</p>
                            </div>
                          )}
                          {caseFicha.tipo && (
                            <div className="space-y-0.5">
                              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Tipo</span>
                              <p className="font-semibold truncate">{caseFicha.tipo}</p>
                            </div>
                          )}
                          {caseFicha.actor && (
                            <div className="space-y-0.5 col-span-2">
                              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Parte promovente</span>
                              <input
                                key={`party-actor-${activeCaseKeyValue}-${savedCaseParties.find((p) => p.role === 'actor')?.id ?? 'none'}-${savedCaseParties.find((p) => p.role === 'actor')?.name ?? ''}`}
                                type="text"
                                defaultValue={partyNameFor('actor', caseFicha.actor ?? '')}
                                onBlur={(event) => void savePartyManual('actor', event.currentTarget.value)}
                                className="font-semibold"
                              />
                            </div>
                          )}
                          {caseFicha.demandado && (
                            <div className="space-y-0.5 col-span-2">
                              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Demandado / Autoridad</span>
                              <input
                                key={`party-demandado-${activeCaseKeyValue}-${savedCaseParties.find((p) => p.role === 'demandado')?.id ?? 'none'}-${savedCaseParties.find((p) => p.role === 'demandado')?.name ?? ''}`}
                                type="text"
                                defaultValue={partyNameFor('demandado', caseFicha.demandado ?? '')}
                                onBlur={(event) => void savePartyManual('demandado', event.currentTarget.value)}
                                className="font-semibold"
                              />
                            </div>
                          )}
                          {caseFicha.abogado && (
                            <div className="space-y-0.5 col-span-2">
                              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Abogado</span>
                              <input
                                key={`party-abogado_defensor-${activeCaseKeyValue}-${savedCaseParties.find((p) => p.role === 'abogado_defensor')?.id ?? 'none'}-${savedCaseParties.find((p) => p.role === 'abogado_defensor')?.name ?? ''}`}
                                type="text"
                                defaultValue={partyNameFor('abogado_defensor', caseFicha.abogado ?? '')}
                                onBlur={(event) => void savePartyManual('abogado_defensor', event.currentTarget.value)}
                                className="font-semibold"
                              />
                            </div>
                          )}
                          {caseFicha.autoridad && (
                            <div className="space-y-0.5 col-span-2">
                              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Autoridad</span>
                              <input
                                key={`party-autoridad-${activeCaseKeyValue}-${savedCaseParties.find((p) => p.role === 'autoridad')?.id ?? 'none'}-${savedCaseParties.find((p) => p.role === 'autoridad')?.name ?? ''}`}
                                type="text"
                                defaultValue={partyNameFor('autoridad', caseFicha.autoridad ?? '')}
                                onBlur={(event) => void savePartyManual('autoridad', event.currentTarget.value)}
                                className="font-semibold"
                              />
                            </div>
                          )}
                          {caseFicha.fechas && (
                            <div className="space-y-0.5 col-span-2">
                              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Fechas</span>
                              <p className="font-semibold">{caseFicha.fechas}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {caseAnalysis && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
                        <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                          <span>🔎</span>
                          <span>Análisis jurídico del documento</span>
                        </h3>
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700">
                          <div><span className="text-slate-400 font-bold uppercase">Pretensiones</span><p className="font-semibold">{caseAnalysis.claims?.length || 0}</p></div>
                          <div><span className="text-slate-400 font-bold uppercase">Pruebas</span><p className="font-semibold">{caseAnalysis.evidence?.length || 0}</p></div>
                          <div className="col-span-2"><span className="text-slate-400 font-bold uppercase">Hechos numerados</span><p className="font-semibold">{caseAnalysis.facts?.length || 0}</p></div>
                        </div>
                        {caseAnalysis.facts?.length > 0 && (
                          <ol className="space-y-1.5 text-[11px] text-slate-700 max-h-40 overflow-y-auto">
                            {caseAnalysis.facts.map((fact) => (
                              <li key={fact.id} className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                                <span className="font-extrabold text-[#0B2545]">HECHO {fact.number}</span>{' '}
                                <span>{fact.text}</span>
                                <span className="block text-[10px] text-slate-400 mt-0.5">Fuente: {fact.documentId || 'documento'} · página {fact.page || '—'} · confianza {Math.round(fact.confidence * 100)}%</span>
                              </li>
                            ))}
                          </ol>
                        )}
                        {caseAnalysis.missingData?.length > 0 && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
                            <strong>Datos pendientes:</strong> {caseAnalysis.missingData.join(' · ')}
                          </div>
                        )}
                      </div>
                    )}

                    {uploadedSourceDocs.length > 0 && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-2.5">
                        <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                          <span>📄</span>
                          <span>Documentos del expediente</span>
                        </h3>
                        <div className="space-y-1.5">
                          {uploadedSourceDocs.map((doc) => (
                            <div key={doc.id} className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 truncate font-mono">
                              📄 {doc.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeNavTab === 'universal' && universalViewMode === 'analysis' ? (
          /* TAB 1: MOTOR UNIVERSAL — 2 COLUMNAS (Contexto | Análisis jurídico) */
          <div className="w-full min-h-0 overflow-y-auto font-sans">
            <div className="w-full max-w-[1800px] mx-auto px-5 md:px-6 py-5 md:py-6 space-y-4">
              {/* Encabezado Superior */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-1">
                <div className="space-y-0.5">
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                    Motor Jurídico
                  </h1>
                  <p className="text-xs text-slate-500 font-medium">
                    Analiza problemas jurídicos utilizando documentos, legislación, jurisprudencia y fuentes verificables.
                  </p>
                </div>
                {universalDoc ? (
                  <button
                    onClick={() => setUniversalViewMode('editor')}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                  >
                    <span>Continuar al editor jurídico</span>
                    <span>→</span>
                  </button>
                ) : hasSavedDraft ? (
                  <button
                    onClick={() => { void handleReopenDraft(); }}
                    className="px-4 py-2 rounded-xl bg-[#0B2545] hover:bg-[#081d39] text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                  >
                    <span>↩ Reabrir último borrador</span>
                  </button>
                ) : null}
              </div>

              {/* Motor Jurídico: contexto y ejecución en una sola superficie */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4.5 items-start">
                {/* ── CONTEXTO PRINCIPAL (ancho completo) ── */}
                <div className="lg:col-span-12 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                  <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                    Contexto
                  </h2>

                  {/* ¿Qué necesitas hacer? (BLOCK D) */}
                  <div className="space-y-2">
                    <label className="font-black text-[#0B2545] text-xs uppercase tracking-widest block">¿Qué necesitas hacer?</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'analizar', label: 'Analizar', icon: '🔍', desc: 'Revisar expediente' },
                        { value: 'investigar', label: 'Investigar', icon: '📚', desc: 'Buscar criterio' },
                        { value: 'redactar', label: 'Redactar', icon: '✍️', desc: 'Generar escrito' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setUniversalForm((p) => ({ ...p, intent: opt.value as any }))}
                          className={`p-2.5 rounded-xl border text-center transition ${universalForm.intent === opt.value ? 'bg-[#0B2545] text-white border-[#0B2545] shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'}`}
                        >
                          <div className="text-sm">{opt.icon}</div>
                          <div className="text-[11px] font-black">{opt.label}</div>
                          <div className={`text-[9px] ${universalForm.intent === opt.value ? 'text-slate-300' : 'text-slate-400'}`}>{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3.5 text-xs text-slate-800">
                    {/* Pregunta Jurídica */}
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block">Pregunta jurídica</label>
                      <textarea
                        rows={4}
                        value={universalForm.pregunta}
                        onChange={(e) => setUniversalForm((prev) => ({ ...prev, pregunta: e.target.value }))}
                        placeholder="Escribe la consulta o problema procesal a analizar..."
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#0B2545] leading-relaxed"
                      />
                    </div>

                    {/* Documentos */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-700">Documentos</span>
                        <button
                          type="button"
                          onClick={() => fileInputHiddenRef.current?.click()}
                          className="text-[11px] font-bold text-[#0B2545] hover:underline"
                        >
                          [+ Agregar]
                        </button>
                      </div>

                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {uploadedSourceDocs.length === 0 ? (
                          <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-400 italic">
                            Sin documentos adjuntos.
                          </div>
                        ) : (
                          uploadedSourceDocs.map((doc) => (
                            <div key={doc.id} className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 truncate font-mono flex items-center gap-1.5">
                              <span>📄</span>
                              <span className="truncate">{doc.name}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Expediente — opciones REALES derivadas del caso detectado y documentos subidos */}
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block">Expediente</label>
                      <select
                        value={universalForm.expediente}
                        onChange={(e) => setUniversalForm((prev) => ({ ...prev, expediente: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#0B2545]"
                      >
                        <option value="">{caseFicha?.expediente || liveCaseFicha?.expediente ? 'Detectado automáticamente al ejecutar análisis' : 'Sin expediente seleccionado'}</option>
                        {(caseFicha?.expediente ? [caseFicha.expediente] : [])
                          .concat(liveCaseFicha?.expediente && liveCaseFicha.expediente !== caseFicha?.expediente ? [liveCaseFicha.expediente] : [])
                          .concat(uploadedSourceDocs.map((d) => (d.name || '').replace(/\.[^/.]+$/, '')))
                          .filter((opt, idx, arr) => opt && arr.indexOf(opt) === idx)
                          .map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                      </select>
                    </div>

                    {/* Materia + Jurisdicción — taxonomía centralizada */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <TaxonomySelect
                        label="Materia"
                        value={universalForm.materia}
                        options={MATTERS.map((m) => ({ value: m.value, label: m.label }))}
                        onChange={(v) => setUniversalForm((prev) => ({ ...prev, materia: v }))}
                        customValue={universalForm.materiaCustom}
                        onCustomChange={(v) => setUniversalForm((prev) => ({ ...prev, materiaCustom: sanitizeCustomValue(v) || v.slice(0, CUSTOM_VALUE_MAX_LENGTH) }))}
                      />
                      <TaxonomySelect
                        label="Jurisdicción"
                        value={universalForm.jurisdiccion}
                        options={JURISDICTIONS.map((j) => ({ value: j.value, label: j.label }))}
                        onChange={(v) => setUniversalForm((prev) => ({ ...prev, jurisdiccion: v }))}
                        customValue={universalForm.jurisdiccionCustom}
                        onCustomChange={(v) => setUniversalForm((prev) => ({ ...prev, jurisdiccionCustom: sanitizeCustomValue(v) || v.slice(0, CUSTOM_VALUE_MAX_LENGTH) }))}
                      />
                    </div>
                    <TaxonomySelect
                      label="Tipo de escrito"
                      value={universalForm.tipoEscrito}
                      options={[
                        ...DOCUMENT_TYPES.map((d) => ({ value: d.value, label: d.label })),
                        ...(getCatalogDocument(universalForm.tipoEscrito)?.kind === 'DOCUMENT_TYPE'
                          && !DOCUMENT_TYPES.some((d) => d.value === universalForm.tipoEscrito)
                          ? [{ value: universalForm.tipoEscrito, label: getCatalogDocument(universalForm.tipoEscrito)?.label || universalForm.tipoEscrito }]
                          : []),
                      ]}
                      onChange={(v) => setUniversalForm((prev) => ({ ...prev, tipoEscrito: v }))}
                      customValue={universalForm.tipoEscritoCustom}
                      onCustomChange={(v) => setUniversalForm((prev) => ({ ...prev, tipoEscritoCustom: sanitizeCustomValue(v) || v.slice(0, CUSTOM_VALUE_MAX_LENGTH) }))}
                    />
                    <details className="border-t border-slate-100 pt-2">
                      <summary className="cursor-pointer select-none text-xs font-bold text-[#0B2545]">Explorar catálogo profesional</summary>
                      <LegalCatalogNavigator
                        className="mt-3"
                        onSelect={(documentTypeId, context) => setUniversalForm((prev) => ({ ...prev, materia: context?.areaId || prev.materia, tipoEscrito: documentTypeId, tipoEscritoCustom: '' }))}
                      />
                    </details>

                    <details className="pt-1 border-t border-slate-100" open={universalForm.showAdvanced}>
                      <summary
                        onClick={(e) => { e.preventDefault(); setUniversalForm((p) => ({ ...p, showAdvanced: !p.showAdvanced })); }}
                        className="font-bold text-slate-700 block text-xs cursor-pointer select-none list-none flex items-center justify-between"
                      >
                        <span>Configuración avanzada</span>
                        <span className="text-slate-400 text-[11px]">{universalForm.showAdvanced ? '▲' : '▼'}</span>
                      </summary>
                      <div className="space-y-1.5 pt-2">
                        <span className="font-bold text-slate-700 block text-xs">Fuentes</span>
                        <div className="space-y-1.5 text-[11px] text-slate-600">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={universalForm.fuentes.legislacion}
                              onChange={(e) => setUniversalForm((prev) => ({ ...prev, fuentes: { ...prev.fuentes, legislacion: e.target.checked } }))}
                              className="rounded border-slate-300 text-[#0B2545]"
                            />
                            <span>Legislación</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={universalForm.fuentes.jurisprudencia}
                              onChange={(e) => setUniversalForm((prev) => ({ ...prev, fuentes: { ...prev.fuentes, jurisprudencia: e.target.checked } }))}
                              className="rounded border-slate-300 text-[#0B2545]"
                            />
                            <span>Jurisprudencia</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={universalForm.fuentes.expediente}
                              onChange={(e) => setUniversalForm((prev) => ({ ...prev, fuentes: { ...prev.fuentes, expediente: e.target.checked } }))}
                              className="rounded border-slate-300 text-[#0B2545]"
                            />
                            <span>Documentos del expediente</span>
                        </label>
                        </div>
                      </div>
                      </details>

                    {/* Botón Ejecutar Análisis */}
                    <div className="pt-2">
                      <button
                        onClick={async () => {
                          const effMatterU = universalForm.materia === 'otro' ? (universalForm.materiaCustom || 'Otro') : (MATTERS.find((m) => m.value === universalForm.materia)?.label || universalForm.materia);
                          const effJurisU = universalForm.jurisdiccion === 'otra' ? (universalForm.jurisdiccionCustom || 'Otra') : (JURISDICTIONS.find((j) => j.value === universalForm.jurisdiccion)?.label || universalForm.jurisdiccion);
                          const effTipoU = universalForm.tipoEscrito === 'otro' ? (universalForm.tipoEscritoCustom || 'Escrito libre') : (DOCUMENT_TYPES.find((d) => d.value === universalForm.tipoEscrito)?.label || universalForm.tipoEscrito);
                          const contextBits: string[] = [];
                          if (effMatterU) contextBits.push(`Materia: ${effMatterU}`);
                          if (effJurisU) contextBits.push(`Jurisdicción: ${effJurisU}`);
                          if (effTipoU && effTipoU !== 'Escrito libre') contextBits.push(`Tipo: ${effTipoU}`);
                          const expedienteSel = universalForm.expediente || caseFicha?.expediente || liveCaseFicha?.expediente;
                          if (expedienteSel) contextBits.push(`Expediente: ${expedienteSel}`);
                          const fuentesActivas = [
                            universalForm.fuentes.legislacion ? 'legislación' : null,
                            universalForm.fuentes.jurisprudencia ? 'jurisprudencia' : null,
                            universalForm.fuentes.expediente ? 'documentos del expediente' : null,
                          ].filter(Boolean);
                          if (fuentesActivas.length > 0) contextBits.push(`Fuentes a utilizar: ${fuentesActivas.join(', ')}`);
                          const fullInstruction = [
                            universalForm.pregunta || 'Generar documento jurídico completo por secciones con fundamento y apartados exhaustivos',
                            contextBits.length > 0 ? `Contexto del caso — ${contextBits.join('; ')}.` : '',
                          ].filter(Boolean).join(' ');
                          const taxonomyU = {
                            matter: universalForm.materia,
                            matterCustom: universalForm.materia === 'otro' && universalForm.materiaCustom ? { value: 'otro', label: 'Otro', customValue: universalForm.materiaCustom } : null,
                            jurisdiction: universalForm.jurisdiccion,
                            jurisdictionCustom: universalForm.jurisdiccion === 'otra' && universalForm.jurisdiccionCustom ? { value: 'otra', label: 'Otra', customValue: universalForm.jurisdiccionCustom } : null,
                            documentType: universalForm.tipoEscrito,
                            documentTypeCustom: universalForm.tipoEscrito === 'otro' && universalForm.tipoEscritoCustom ? { value: 'otro', label: 'Otro', customValue: universalForm.tipoEscritoCustom } : null,
                          };
                          await handleRunPipeline({
                            userInstruction: fullInstruction,
                            intentLabel: effTipoU || 'Análisis Jurídico',
                            sourceDocs: uploadedSourceDocs,
                            flowLabel: 'universal',
                            taxonomy: taxonomyU,
                          } as any);
                        }}
                        disabled={isUniversalGenerating}
                        className="w-full py-2.5 rounded-xl bg-[#0B2545] hover:bg-[#081d39] disabled:opacity-50 text-white text-xs font-extrabold shadow-xs transition flex items-center justify-center gap-2"
                      >
                        <span>⚡</span>
                        <span>{isUniversalGenerating ? 'Ejecutando análisis...' : 'Ejecutar análisis'}</span>
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

                  ) : (
          /* TAB 1 / ESCRITOS EN MODO EDITOR: VISOR PAGINADO (toolbar consolidada DENTRO del editor) */
          <div className="flex w-full min-h-0 min-w-0 overflow-hidden flex-col">
            <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
              <WorkspaceDocumentEditor
                document={universalDoc}
                onUpdateDocument={handleUpdateDocument}
                onRegenerateSection={(sectionId, instruction) => {
                  // Puente: el editor usa el MISMO handler de refinamiento por IA.
                  return handleRegenerateSection(sectionId, instruction);
                }}
                onExportDocx={handleExportDocx}
                onExportPdf={handleExportPdf}
                onMarkReadyToExport={handleMarkReadyToExport}
                onSaveDraft={handleSaveDraft}
                onReopenDraft={handleReopenDraft}
                onSaveAsTemplate={handleSaveAsTemplate}
                onGenerateFromMachote={handleGenerateFromMachote}
                activeSectionId={activeSection?.id}
                onSelectSection={(sec) => setActiveSection(sec)}
                isGenerating={isUniversalGenerating}
                pipelineStageLabel={generatingStage ? `Fase: ${generatingStage.label}` : undefined}
                onTriggerNewDraftModal={() => setIsDraftGeneratorOpen(true)}
                onTriggerUpload={() => fileInputHiddenRef.current?.click()}
                onFormatDocument={handleFormatDocument}
                isFormatting={isFormatting}
                onRefineActive={(mode) => { void handleRefineSection(mode); }}
                autosaveState={draftSaveState}
                onBackToPanel={() => {
                  if (activeNavTab === 'initial_writings') setInitialViewMode('form');
                  else setUniversalViewMode('analysis');
                }}
                backLabel={activeNavTab === 'initial_writings' ? '‹ Volver al Formulario' : '‹ Volver al Panel de Análisis'}
              />
            </div>
          </div>
        )}
      </div>

          </div>
        </section>
      </div>

      {/* Input oculto para carga de archivos PDF / DOCX */}
      <input
        ref={fileInputHiddenRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.txt,.rtf"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* MODAL 1: Generador de Borrador / Redacción con Machote */}
      {isDraftGeneratorOpen && (
        <WorkspaceDraftGeneratorModal
          isOpen={isDraftGeneratorOpen}
          onClose={() => {
            setIsDraftGeneratorOpen(false);
            setSelectedTemplate(null);
            setSelectedTemplateRefText('');
            setGenerationMode('automatic');
          }}
          tabMode={activeNavTab === 'my-templates' ? 'universal' : activeNavTab}
          onGenerate={handleRunPipeline}
          templates={customTemplates}
          uploadedSources={uploadedSourceDocs}
          onUploadFiles={handleFileUpload}
          onRemoveUploadedSource={handleRemoveUploadedSource}
          caseFicha={caseFicha}
          onAnalyzeCase={() => {
            if (uploadedSourceDocs.length > 0) {
              const ficha = detectCaseFicha(uploadedSourceDocs.map((s) => s.extractedText || ''));
              setCaseFicha(ficha);
              notify('success', `Caso detectado: ${ficha.materia} · ${ficha.tipo}`);
            }
          }}
          isGenerating={isUniversalGenerating}
          onOpenUploadCustomTemplateModal={() => setIsSaveCustomOpen(true)}
          generationJob={activeGenJob}
          initialTemplate={selectedTemplate}
          initialTemplateText={selectedTemplateRefText}
        />
      )}

      {/* MODAL 2: Subir y Guardar Machote Reutilizable */}
      {isSaveCustomOpen && (
        <SaveCustomTemplateModal
          isOpen={isSaveCustomOpen}
          onClose={() => setIsSaveCustomOpen(false)}
          onTemplateCreated={() => {
            loadTemplates();
            notify('success', 'Machote guardado exitosamente en "Mis Plantillas".');
          }}
        />
      )}

      {/* MODAL 3: Editar Plantilla */}
      {isEditCustomOpen && (
        <EditCustomTemplateModal
          template={editTemplateData}
          isOpen={isEditCustomOpen}
          onClose={() => {
            setIsEditCustomOpen(false);
            setEditTemplateData(null);
          }}
          onTemplateUpdated={(updated) => {
            void loadTemplates();
            const persistence = (updated as ProfessionalTemplate & { persistence?: string }).persistence;
            if (persistence === 'local_cache') {
              notify('warning', 'Plantilla actualizada localmente; pendiente de sincronización con el workspace. Puedes reintentar cuando esté disponible.');
            } else {
              notify('success', 'Plantilla actualizada.');
            }
          }}
        />
      )}
    </div>
  );
}
