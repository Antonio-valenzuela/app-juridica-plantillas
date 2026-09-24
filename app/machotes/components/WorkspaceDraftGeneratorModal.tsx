'use client';

import React, { useEffect, useState, useRef } from 'react';
import type { UploadedSourceDocument, TemplateVersion } from '@/lib/legal-engine/types';
import type { TemplateItem } from './TemplateLibraryManager';
import { type GenerationStatusData } from './GenerationStatusBar';
import { analyzeWritingRequest, getDynamicIntakeFields } from '@/lib/legal-engine/writingIntake';
import { rankTemplateCandidates } from '@/lib/templates/templateCompatibility';

interface WorkspaceDraftGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  tabMode: 'universal' | 'initial_writings' | 'responses_resources';
  onGenerate: (payload: {
    userInstruction: string;
    intentLabel?: string;
    documentType?: string;
    sourceDocs: UploadedSourceDocument[];
    selectedTemplate?: TemplateItem | null;
    templateRefText?: string;
    writingMode?: 'analyze' | 'new' | 'template' | 'continue';
  }) => Promise<void | boolean>;
  templates: TemplateItem[];
  uploadedSources: UploadedSourceDocument[];
  onUploadFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveUploadedSource: (id: string) => void;
  caseFicha: any | null;
  onAnalyzeCase: () => void;
  isGenerating: boolean;
  onOpenUploadCustomTemplateModal: () => void;
  generationJob?: GenerationStatusData | null;
  initialTemplate?: TemplateItem | null;
  initialTemplateText?: string;
}

const UNIVERSAL_PRESETS = [
  { label: 'Contestación de demanda laboral', documentType: 'contestacion_demanda_laboral', prompt: 'Contestar demanda laboral oponiendo excepciones y defensas, contestando hechos, ofreciendo pruebas y petitorios.' },
  { label: 'Recurso de revisión', documentType: 'recurso_revision_amparo_directo', prompt: 'Interponer recurso de revisión y formular agravios contra la sentencia recurrida con fundamentación y doctrina.' },
  { label: 'Recurso de queja', documentType: 'recurso_queja', prompt: 'Interponer recurso de queja contra el auto o resolución que desecha o no admite la demanda o prueba.' },
  { label: 'Amparo directo', documentType: 'demanda_amparo_directo', prompt: 'Formular demanda de amparo directo señalando acto reclamado, autoridad responsable, conceptos de violación y petitorios.' },
  { label: 'Amparo indirecto', documentType: 'demanda_amparo_indirecto', prompt: 'Formular demanda de amparo indirecto con suspensión del acto reclamado y conceptos de violación.' },
  { label: 'Escrito de cumplimiento', documentType: 'escrito_cumplimiento_sentencia', prompt: 'Promover escrito de cumplimiento de requerimiento judicial acreditando los extremos solicitados.' },
  { label: 'Expresión de agravios', documentType: 'escrito_agravios', prompt: 'Expresar agravios en segunda instancia combatiendo la falta de exhaustividad y congruencia.' },
];

const INITIAL_WRITING_PRESETS = [
  { label: 'Demanda de Amparo Indirecto', documentType: 'demanda_amparo_indirecto', prompt: 'Demanda de amparo indirecto contra acto de autoridad que vulnera garantías individuales y debido proceso.' },
  { label: 'Demanda Laboral Inicial', prompt: 'Demanda ordinaria laboral por despido injustificado, reclamando indemnización constitucional, salarios caídos y prestaciones.' },
  { label: 'Demanda Mercantil Ejecutiva', prompt: 'Demanda ejecutiva mercantil fundada en pagaré o título de crédito con solicitud de embargo.' },
  { label: 'Demanda Civil Ordinaria', prompt: 'Demanda ordinaria civil por incumplimiento de contrato y rescisión.' },
];

const RESPONSE_RESOURCE_PRESETS = [
  { label: 'Contestación Laboral', documentType: 'contestacion_demanda_laboral', prompt: 'Contestación a la demanda laboral negando el despido y oponiendo excepciones de falta de acción y prescripción.' },
  { label: 'Contestación Civil', documentType: 'contestacion_demanda_civil', prompt: 'Contestación de demanda civil y reconvención conforme a derecho.' },
  { label: 'Contestación Mercantil', documentType: 'contestacion_demanda_mercantil', prompt: 'Contestación de demanda mercantil y excepciones conforme a derecho.' },
  { label: 'Recurso de Revisión en Amparo', documentType: 'recurso_revision_amparo_directo', prompt: 'Recurso de revisión contra la ejecutoria del Tribunal Colegiado por interpretación constitucional.' },
  { label: 'Contestación / Revisión extraordinaria de Amparo Directo', documentType: 'contestacion_revision_extraordinaria_amparo_directo', prompt: 'Preparar la respuesta post-sentencia seleccionada frente a una sentencia de amparo directo; validar procedencia y detenerse si faltan datos requeridos.' },
  { label: 'Recurso de Reclamación', documentType: 'recurso_reclamacion', prompt: 'Recurso de reclamación contra el acuerdo de presidencia que desechó el trámite.' },
  { label: 'Incidente de Nulidad', documentType: 'incidente_procesal', prompt: 'Incidente de nulidad de notificaciones por falta de emplazamiento legal.' },
];

export function WorkspaceDraftGeneratorModal({
  isOpen,
  onClose,
  tabMode,
  onGenerate,
  templates,
  uploadedSources,
  onUploadFiles,
  onRemoveUploadedSource,
  caseFicha,
  onAnalyzeCase,
  isGenerating,
  onOpenUploadCustomTemplateModal,
  initialTemplate = null,
  initialTemplateText = '',
}: WorkspaceDraftGeneratorModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [selectedDocumentType, setSelectedDocumentType] = useState<string | undefined>(undefined);
  const [userPrompt, setUserPrompt] = useState<string>('');
  const [selectedTpl, setSelectedTpl] = useState<TemplateItem | null>(null);
  const [templateRefText, setTemplateRefText] = useState<string>('');
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const [writingMode, setWritingMode] = useState<'analyze' | 'new' | 'template' | 'continue'>('analyze');
  const [aiDisclosure, setAiDisclosure] = useState<{ externalTransfer: boolean; contentNotice: string; retentionNotice: string; providers: Array<{ provider: string; mode: string; configured: boolean; active: boolean; functions: string[] }> } | null>(null);
  const [disclosureAcknowledged, setDisclosureAcknowledged] = useState(false);

  useEffect(() => {
    if (!isOpen || !initialTemplate) return;
    const timer = window.setTimeout(() => {
      setSelectedTpl(initialTemplate);
      setTemplateRefText(initialTemplateText || initialTemplate.content || '');
      setWritingMode('template');
      setSelectedPreset(null);
      setSelectedDocumentType(initialTemplate.documentType);
      setUserPrompt((current) => current.trim() || `Crear un nuevo escrito usando la plantilla "${initialTemplate.name}". Indica la materia, el tipo de escrito, la parte representada, la contraparte, el objetivo y los hechos del nuevo asunto.`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, initialTemplate, initialTemplateText]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch('/api/workspace/lawyer-profile', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled || !payload?.ok) return;
        setAiDisclosure(payload.aiDisclosure || null);
        setDisclosureAcknowledged(Boolean(payload.profile?.aiDisclosureAcknowledgedAt));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  const presets =
    tabMode === 'initial_writings'
      ? INITIAL_WRITING_PRESETS
      : tabMode === 'responses_resources'
      ? RESPONSE_RESOURCE_PRESETS
      : UNIVERSAL_PRESETS;
  const writingPreview = uploadedSources.length === 0 && userPrompt.trim()
    ? analyzeWritingRequest(userPrompt)
    : null;
  const orderedTemplates = rankTemplateCandidates(
    templates,
    writingPreview?.matter,
    writingPreview?.documentType
  );
  const requiresDisclosure = aiDisclosure?.externalTransfer === true && !disclosureAcknowledged;
  const generationDisabled = isGenerating || requiresDisclosure || (uploadedSources.length === 0 && !selectedTpl && !userPrompt);

  const acknowledgeDisclosure = async () => {
    const response = await fetch('/api/workspace/lawyer-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiDisclosureAcknowledged: true }),
    });
    if (response.ok) setDisclosureAcknowledged(true);
  };

  const handleSelectPreset = (p: { label: string; prompt: string; documentType?: string }) => {
    setSelectedPreset(p.label);
    setSelectedDocumentType(p.documentType);
    setUserPrompt(p.prompt);
  };

  const handleSelectTemplate = async (tpl: TemplateItem) => {
    setSelectedTpl(tpl);
    setSelectedDocumentType(tpl.documentType);
    try {
      const res = await fetch(`/api/templates/custom/${tpl.id}`);
      const data = await res.json();
      if (data.ok && data.template) {
        setTemplateRefText(data.template.originalText || data.template.content || '');
      }
    } catch {
      // Ignorar fallback
    }
  };

  const handleStartGeneration = async () => {
    if (requiresDisclosure) return;
    try {
      const result = await onGenerate({
        userInstruction: userPrompt || 'Redactar escrito jurídico formal con fundamentación y apartados completos.',
        intentLabel: selectedPreset || undefined,
        documentType: selectedDocumentType,
        sourceDocs: uploadedSources,
        selectedTemplate: selectedTpl,
        templateRefText: templateRefText || undefined,
        writingMode,
      });
      if (result !== false) onClose();
    } catch (err: any) {
      console.error('[Modal] Error en handleStartGeneration:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[1001] flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 font-sans">
        {/* Cabecera del Modal */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-[#fbf9f5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0B2545] text-white flex items-center justify-center text-xl shadow-md">
              {tabMode === 'initial_writings' ? '📝' : tabMode === 'responses_resources' ? '⚖️' : '⚙️'}
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#0B2545]">
                {tabMode === 'initial_writings'
                  ? 'Redactar Escrito Inicial / Demanda'
                  : tabMode === 'responses_resources'
                  ? 'Generar Contestación o Recurso'
                  : 'Motor Universal de Redacción Jurídica'}
              </h2>
              <p className="text-xs text-slate-500">
                Sube expediente → Selecciona estrategia y machote → Genera borrador adaptado
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center font-bold text-sm"
          >
            ✕
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {aiDisclosure?.externalTransfer && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
              <p className="font-extrabold">Aviso operativo sobre proveedores de IA</p>
              <p className="mt-2 leading-relaxed">{aiDisclosure.contentNotice}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {aiDisclosure.providers.filter((provider) => provider.active).map((provider) => (
                  <span key={provider.provider} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold">{provider.provider} · {provider.mode}</span>
                ))}
              </div>
              <p className="mt-3 leading-relaxed text-[11px]">{aiDisclosure.retentionNotice}</p>
              {!disclosureAcknowledged && (
                <button type="button" onClick={() => void acknowledgeDisclosure()} className="mt-3 rounded-xl bg-[#0B2545] px-3 py-2 text-[11px] font-bold text-white">Entiendo y continuar</button>
              )}
            </section>
          )}
          {/* PASO 1: Expediente / Fuentes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#0B2545] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#0B2545] text-white text-[10px] flex items-center justify-center font-bold">1</span>
                <span>{writingMode === 'new' ? 'Documentos del expediente (opcionales)' : 'Documentos del expediente'}</span>
              </h3>
              <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded-full">
                {writingMode === 'new' ? 'Puedes comenzar sin archivos' : 'PDF · DOCX · JPG · PNG'}
              </span>
            </div>

            {/* Zona de Dropzone */}
            <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-300 hover:border-[#0B2545] rounded-2xl cursor-pointer bg-[#fbf9f5] transition group text-center">
              <span className="text-2xl mb-1 group-hover:scale-110 transition">📥</span>
              <span className="text-xs font-bold text-[#0B2545]">Seleccionar o arrastrar archivos del caso</span>
              <span className="text-[10px] text-slate-400 mt-0.5">Extracción OCR y procesamiento 100% local</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.txt"
                onChange={onUploadFiles}
                disabled={isGenerating}
                className="hidden"
              />
            </label>

            {/* Lista de archivos cargados */}
            {uploadedSources.length > 0 && (
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {uploadedSources.map((doc) => (
                  <div key={doc.id} className="p-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <span>📄</span>
                      <span className="font-bold text-slate-800 truncate">{doc.filename || doc.name}</span>
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-semibold">
                        ✓ {doc.pages?.length || 1} pág(s)
                      </span>
                    </div>
                    <button
                      onClick={() => onRemoveUploadedSource(doc.id)}
                      className="text-slate-400 hover:text-red-500 text-xs px-1"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}

            {caseFicha && (
              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs space-y-1">
                <div className="flex items-center justify-between font-bold text-[#0B2545]">
                  <span>Ficha del caso detectada ({caseFicha.confianza}% confianza)</span>
                  <span>{caseFicha.materia} · {caseFicha.tipo}</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Expediente: <strong className="text-slate-800">{caseFicha.expediente || 'N/D'}</strong> · Partes: <strong className="text-slate-800">{caseFicha.actor || 'N/D'}</strong> vs <strong className="text-slate-800">{caseFicha.demandado || 'N/D'}</strong>
                </p>
              </div>
            )}
          </div>

          {/* PASO 2: ¿Qué necesitas elaborar? */}
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#0B2545] flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#0B2545] text-white text-[10px] flex items-center justify-center font-bold">2</span>
              <span>¿Qué necesitas elaborar?</span>
            </h3>

            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 space-y-2">
              <p className="text-[11px] font-extrabold text-[#0B2545]">¿Qué quieres hacer?</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {([
                  ['analyze', 'Analizar expediente'],
                  ['new', 'Crear desde cero'],
                  ['template', 'Usar plantilla'],
                  ['continue', 'Continuar borrador'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setWritingMode(value);
                      if (value === 'new' && !userPrompt) setUserPrompt('Quiero crear un escrito jurídico desde cero. Describe el tipo de escrito, el asunto, la parte representada, la contraparte, el objetivo y los hechos disponibles.');
                      if (value === 'continue' && !userPrompt) setUserPrompt('Continuar y revisar el borrador guardado, conservando las ediciones manuales.');
                    }}
                    className={`rounded-lg border px-2 py-2 text-[10px] font-bold transition ${writingMode === value ? 'border-[#0B2545] bg-[#0B2545] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {writingMode === 'new' && <p className="text-[10px] text-blue-800">El motor pedirá únicamente los datos relevantes y marcará lo que falte como pendiente.</p>}
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handleSelectPreset(preset)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                    selectedPreset === preset.label
                      ? 'bg-[#0B2545] text-white border-[#0B2545] shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-[#0B2545]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Textarea */}
            <textarea
              rows={3}
              value={userPrompt}
              onChange={(e) => {
                if (!isGenerating) {
                  setUserPrompt(e.target.value);
                  setSelectedPreset(null);
                }
              }}
              disabled={isGenerating}
              placeholder="Describe el problema jurídico, estrategia o requerimientos específicos..."
              className="w-full bg-[#fbf9f5] border border-slate-300 focus:border-[#0B2545] rounded-xl p-3 text-xs text-slate-800 focus:outline-none leading-relaxed font-sans"
            />

            {writingPreview && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-amber-900">Resumen previo a generación</span>
                  <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${writingPreview.readiness.status === 'BLOCKED' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>{writingPreview.readiness.status}</span>
                </div>
                <p className="text-[10px] text-amber-900">{writingPreview.documentTypeLabel} · {writingPreview.matter} · {writingPreview.objective || 'Objetivo pendiente'}</p>
                <p className="text-[10px] text-slate-700">Hechos capturados: {writingPreview.facts.length} · Campos relevantes: {getDynamicIntakeFields(writingPreview).filter((field) => field.relevant).length}</p>
                {writingPreview.pending.length > 0 && <p className="text-[10px] text-amber-800">Pendientes: {writingPreview.pending.join(' · ')}</p>}
                <p className="text-[10px] text-slate-500">Corrige la descripción si el resumen no refleja tu instrucción.</p>
              </div>
            )}
          </div>

          {/* PASO 3: Selección de Machote del Abogado */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#0B2545] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#0B2545] text-white text-[10px] flex items-center justify-center font-bold">3</span>
                <span>Seleccionar Machote (Plantilla)</span>
              </h3>
              <button
                onClick={onOpenUploadCustomTemplateModal}
                className="text-[11px] font-bold text-[#0B2545] hover:underline"
              >
                ➕ Subir machote
              </button>
            </div>

            {templates.length === 0 ? (
              <div className="p-4 border border-dashed border-slate-300 rounded-xl text-center text-xs text-slate-500 space-y-1.5">
                <p>No tienes machotes personalizados guardados.</p>
                <button
                  onClick={onOpenUploadCustomTemplateModal}
                  className="py-1 px-3 rounded-lg bg-[#0B2545] text-white text-[11px] font-bold"
                >
                  Subir primer machote
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {orderedTemplates.map((tpl) => {
                  const isSelected = selectedTpl?.id === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => handleSelectTemplate(tpl)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        isSelected
                          ? 'bg-blue-50 border-[#0B2545] shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="truncate">
                        <p className="text-xs font-bold text-slate-800 truncate">{tpl.name}</p>
                        <p className="text-[10px] text-slate-400">{tpl.category} · v{tpl.version}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${isSelected ? 'bg-[#0B2545] text-white' : 'bg-slate-100 text-slate-600'}`}>
                        {isSelected ? '✓ Seleccionado' : 'Elegir'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Pie del Modal: progreso real + Botón Generar */}
        <div className="p-5 border-t border-slate-100 bg-[#fbf9f5] space-y-3">
          <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="py-2 px-4 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition"
          >
            Cancelar
          </button>

          <button
            onClick={handleStartGeneration}
            disabled={generationDisabled}
            className={`py-2.5 px-6 rounded-xl text-white text-xs font-bold shadow-md transition flex items-center gap-2 ${
              generationDisabled
                ? 'bg-slate-300 cursor-not-allowed opacity-60'
                : 'bg-[#0B2545] hover:bg-[#081d39]'
            }`}
          >
            {isGenerating ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                <span>Generando…</span>
              </>
            ) : (
              <span>⚡ Generar Escrito Completo</span>
            )}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
