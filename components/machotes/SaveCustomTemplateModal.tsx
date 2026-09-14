'use client';

import React, { useState, useRef } from 'react';
import { TemplateCategory, ProfessionalTemplate } from '@/lib/templates/templateTypes';
import { normalizeLegalDocumentText } from '@/lib/text/normalizeLegalDisplayText';
import { markTemplateAsUserOwned } from '@/lib/templates/templateOrigin';
import {
  analyzePersonalTemplateText,
  PersonalTemplateAnalysis,
} from '@/lib/templates/personalTemplateBuilder';
import {
  saveTemplateWithPersistenceStatus,
  SaveTemplateWithPersistenceStatusResult,
} from '@/lib/templates/customTemplateStore';

interface SaveCustomTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTemplateCreated: (newTemplate: ProfessionalTemplate) => void;
}

export function SaveCustomTemplateModal({
  isOpen,
  onClose,
  onTemplateCreated,
}: SaveCustomTemplateModalProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('Amparo');
  const [legalBasis, setLegalBasis] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showRawText, setShowRawText] = useState(false);
  const [extractedTextClean, setExtractedTextClean] = useState('');
  const [pageCount, setPageCount] = useState<number>(1);
  const [templateAnalysis, setTemplateAnalysis] = useState<PersonalTemplateAnalysis | null>(null);
  const [analysis, setAnalysis] = useState<{
    es_juridico: boolean;
    tipo_documento: string;
    confianza: number;
    razon?: string;
    secciones_detectadas: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const [persistenceResult, setPersistenceResult] = useState<SaveTemplateWithPersistenceStatusResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisRequestIdRef = useRef(0);
  const pendingTemplateIdRef = useRef<string | null>(null);

  if (!isOpen) return null;

  const sanitizeClean = (raw: string) => {
    return normalizeLegalDocumentText(raw);
  };

  const processSelectedFile = async (selected: File) => {
    const analysisRequestId = ++analysisRequestIdRef.current;
    setFile(selected);
    setAnalysis(null);
    setTemplateAnalysis(null);
    setExtractedTextClean('');
    setAnalysisFailed(false);
    setPageCount(1);
    setError(null);
    setPersistenceResult(null);
    setShowRawText(false);
    pendingTemplateIdRef.current = null;

    if (!title) {
      setTitle(selected.name.replace(/\.[^/.]+$/, ''));
    }

    // Análisis en segundo plano: NO bloquea ni condiciona la validez del archivo original
    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', selected, selected.name);
      const response = await fetch('/api/templates/analyze-upload', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json();
      if (analysisRequestId !== analysisRequestIdRef.current) return;

      if (response.ok && payload.ok !== false) {
        const pCount = payload.pages?.length || payload.qualityScore?.pageCount || 1;
        setPageCount(pCount);

        if (payload.classification) {
          setAnalysis({
            es_juridico: payload.classification.es_juridico ?? true,
            tipo_documento: payload.classification.tipo_documento || 'Documento Oficial',
            confianza: payload.classification.confianza || 100,
            razon: payload.classification.razon,
            secciones_detectadas: payload.classification.secciones_detectadas || [
              'Hechos',
              'Antecedentes',
              'Fundamentos',
              'Puntos petitorios',
              'Pruebas',
              'Firma',
            ],
          });
        }

        if (payload.templateAnalysis) {
          const analyzedTemplate = payload.templateAnalysis as PersonalTemplateAnalysis;
          setTemplateAnalysis(analyzedTemplate);
          setExtractedTextClean(analyzedTemplate.parameterizedText || '');
          if (analyzedTemplate.category) setCategory(analyzedTemplate.category);
        } else if (payload.extractedText) {
          setExtractedTextClean(sanitizeClean(payload.extractedText));
        }
      } else {
        throw new Error(payload.error || 'No fue posible analizar el archivo.');
      }
    } catch {
      // Si la extracción auxiliar no responde o tiene encoding especial, el archivo original permanece 100% válido
      if (analysisRequestId === analysisRequestIdRef.current) {
        setPageCount(1);
        setAnalysisFailed(true);
        setError('No fue posible analizar el archivo. Puedes reintentar el análisis.');
      }
    } finally {
      if (analysisRequestId === analysisRequestIdRef.current) setIsAnalyzing(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      processSelectedFile(selected);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processSelectedFile(droppedFile);
    }
  };

  const buildExplicitTemplate = (finalAnalysis: PersonalTemplateAnalysis): ProfessionalTemplate => {
    const timestamp = new Date().toISOString();
    const id = pendingTemplateIdRef.current || `custom-${Date.now()}`;
    pendingTemplateIdRef.current = id;

    return {
      id,
      lifecycle: {
        entityKind: 'TEMPLATE',
        originClass: 'user',
        creationIntent: 'EXPLICIT_TEMPLATE',
      },
      title: title.trim(),
      description: file
        ? `Plantilla personal revisada (${finalAnalysis.documentTypeLabel})`
        : 'Plantilla personal revisada',
      category,
      legalBasis: legalBasis.trim() || 'Fundamento normativo definido por el litigante.',
      documentType: finalAnalysis.documentType,
      applicableLaws: [],
      warnings: [],
      disclaimer: 'Plantilla personalizada. Requiere revisión profesional antes de presentarse.',
      exportFormats: ['docx', 'pdf', 'text'],
      originalText: finalAnalysis.parameterizedText,
      sourceFileName: file?.name,
      variables: finalAnalysis.variables,
      structureJson: markTemplateAsUserOwned(finalAnalysis.structureJson) as ProfessionalTemplate['structureJson'],
      sections: finalAnalysis.sections.map((section) => ({
        id: section.id,
        title: section.title,
        type: section.type === 'list' ? 'repeatable' : section.type === 'paragraph' ? 'textarea' : 'text',
        required: false,
        placeholder: section.preview,
      })),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  };

  const handleSave = async () => {
    if (isAnalyzing) return;
    if (file && !extractedTextClean.trim()) {
      await processSelectedFile(file);
      return;
    }
    if (!title.trim()) {
      setError('Por favor ingresa un nombre para el machote.');
      return;
    }
    if (!file && !extractedTextClean.trim()) {
      setError('Por favor selecciona un archivo de machote o escribe su contenido.');
      return;
    }

    setLoading(true);
    setError(null);
    setPersistenceResult(null);
    try {
      const finalAnalysis = analyzePersonalTemplateText(extractedTextClean, file
        ? { sourceFileName: file.name, pageCount }
        : undefined);
      if (!finalAnalysis.parameterizedText.trim()) {
        throw new Error('El archivo no produjo contenido reutilizable después de la revisión.');
      }

      const result = await saveTemplateWithPersistenceStatus(buildExplicitTemplate(finalAnalysis), {
        requestBody: {
          practiceArea: category.toLowerCase(),
          content: finalAnalysis.parameterizedText,
        },
      });
      setPersistenceResult(result);

      if (result.status === 'GUARDADO' && result.template) {
        onTemplateCreated(result.template);
        onClose();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No fue posible guardar el machote.';
      setPersistenceResult({
        ok: false,
        status: 'NO GUARDADO',
        persistence: 'not_persisted',
        message: `${message} Puedes reintentar.`,
        retryable: true,
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const canClose = !loading && !isAnalyzing && !persistenceResult?.retryable;
  const requestClose = () => {
    if (canClose) onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[1050] flex items-center justify-center p-4 select-none font-sans"
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-custom-template-title"
    >
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado Profesional */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-[#fbf9f5]">
          <div className="space-y-0.5">
            <h2 id="save-custom-template-title" className="text-base font-bold text-[#0B2545] tracking-tight">
              Subir y Guardar Mi Propio Machote
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Guarda un documento oficial para reutilizarlo en cualquier momento.
            </p>
          </div>
          <button
            onClick={requestClose}
            aria-label="Cerrar diálogo"
            disabled={!canClose}
            className="w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center font-bold text-xs transition shadow-xs"
          >
            ✕
          </button>
        </div>

        {/* Cuerpo del Formulario */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-800">
          {/* Nombre del Machote */}
          <div className="space-y-1">
            <label htmlFor="custom-template-title" className="font-bold text-slate-700 block">
              Nombre del machote <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="custom-template-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Demanda familiar de alimentos"
              className="w-full px-3.5 py-2 bg-white border border-[#ded8c9] rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-[#0B2545] focus:ring-1 focus:ring-[#0B2545] transition"
            />
          </div>

          {/* Materia y Fundamento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="custom-template-category" className="font-bold text-slate-700 block">Materia</label>
              <select
                id="custom-template-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                className="w-full px-3.5 py-2 bg-white border border-[#ded8c9] rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-[#0B2545] transition"
              >
                <option value="Amparo">Amparo</option>
                <option value="Civil">Civil</option>
                <option value="Familiar">Familiar</option>
                <option value="Mercantil">Mercantil</option>
                <option value="Administrativo/Fiscal">Administrativo/Fiscal</option>
                <option value="Laboral">Laboral</option>
                <option value="General">General</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="custom-template-legal-basis" className="font-bold text-slate-700 block">Fundamento opcional</label>
              <input
                type="text"
                id="custom-template-legal-basis"
                value={legalBasis}
                onChange={(e) => setLegalBasis(e.target.value)}
                placeholder="Ej. Arts. 107 y 108 Ley de Amparo"
                className="w-full px-3.5 py-2 bg-white border border-[#ded8c9] rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-[#0B2545] transition"
              />
            </div>
          </div>

          {/* ARCHIVO DEL MACHOTE */}
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <label className="font-bold text-slate-700 block">
              ARCHIVO DEL MACHOTE
            </label>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition flex flex-col items-center justify-center space-y-2 ${
                isDragging
                  ? 'border-[#0B2545] bg-blue-50/50'
                  : file
                  ? 'border-emerald-300 bg-emerald-50/30'
                  : 'border-[#ded8c9] bg-[#fbf9f5] hover:border-slate-400'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt,.rtf,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,application/rtf,image/*"
                onChange={handleFileInputChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 rounded-xl bg-[#0B2545] hover:bg-[#081d39] text-white font-bold text-xs shadow-sm transition flex items-center gap-2"
              >
                <span>📄</span>
                <span>Seleccionar archivo</span>
              </button>

              <span className="text-[11px] text-slate-400 font-medium">
                PDF, DOCX, DOC, TXT, RTF, imagen
              </span>
            </div>

            {isAnalyzing && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-[#0B2545] font-semibold flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-[#0B2545] border-t-transparent animate-spin" />
                <span>Analizando estructura documental del archivo...</span>
              </div>
            )}

            {/* Archivo Seleccionado y Estado de Preservación */}
            {file && (
              <div className="p-3.5 bg-emerald-50/80 border border-emerald-300 rounded-2xl space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between text-emerald-900 font-bold">
                  <div className="flex items-center gap-1.5">
                    <span>✓</span>
                    <span className="truncate max-w-xs">{file.name}</span>
                  </div>
                  <span className="text-[10px] text-emerald-700 font-mono">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </div>

                <div className="text-[11px] text-emerald-800 font-medium">
                  Archivo analizado • {pageCount} {pageCount === 1 ? 'página' : 'páginas'} • {file.name.split('.').pop()?.toUpperCase()}
                </div>
              </div>
            )}

            {/* Análisis Limpio del Documento */}
            {analysis && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 space-y-2">
                <div className="flex items-center justify-between font-bold text-[#0B2545]">
                  <span>Tipo: {analysis.tipo_documento}</span>
                  <span>Confianza: {analysis.confianza}%</span>
                </div>

                {analysis.secciones_detectadas?.length > 0 && (
                  <div className="text-[11px] text-slate-600 space-y-1">
                    <span className="font-bold text-slate-700 block">Secciones detectadas:</span>
                    <div className="flex flex-wrap gap-1">
                      {analysis.secciones_detectadas.map((sec, i) => (
                        <span key={i} className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[10px] text-slate-700">
                          {sec}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {templateAnalysis && (
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl text-xs text-slate-700 space-y-3">
                <div>
                  <p className="font-bold text-[#0B2545]">Revisión de plantilla personal</p>
                  <p className="text-[11px] text-blue-900 mt-1">
                    La estructura y el estilo se conservarán; los datos del asunto original se reemplazaron por campos semánticos.
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="font-bold text-slate-700 block">Estructura detectada:</span>
                  <div className="flex flex-wrap gap-1">
                    {templateAnalysis.sections.map((section) => (
                      <span key={section.id} className="px-2 py-0.5 bg-white border border-blue-200 rounded-md text-[10px] text-slate-700">
                        {section.title}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="font-bold text-slate-700 block">Variables detectadas:</span>
                  <div className="flex flex-wrap gap-1">
                    {templateAnalysis.variables.length > 0 ? templateAnalysis.variables.map((variable) => (
                      <span key={variable.id} className="px-2 py-0.5 bg-white border border-emerald-200 rounded-md text-[10px] text-emerald-800">
                        {variable.label} · {variable.placeholder}
                      </span>
                    )) : <span className="text-[10px] text-slate-500">No se detectaron datos variables.</span>}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white border border-amber-200 text-[10px] text-amber-900">
                  <strong>Datos eliminados o parametrizados:</strong>{' '}
                  {templateAnalysis.removedData.length > 0
                    ? templateAnalysis.removedData.map((item) => `${item.label} (${item.occurrences})`).join(' · ')
                    : 'No se identificaron datos específicos.'}
                  <div className="mt-1 font-semibold">Los datos del documento original no se guardarán.</div>
                </div>
              </div>
            )}

            {/* Opción Colapsada para Ver / Editar Texto Extraído */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowRawText(!showRawText)}
                className="text-[11px] font-bold text-[#0B2545] hover:underline flex items-center gap-1"
              >
                <span>{showRawText ? '▾' : '▸'}</span>
                <span>{showRawText ? 'Ocultar contenido parametrizado' : 'Revisar contenido parametrizado'}</span>
              </button>

              {showRawText && (
                <div className="mt-2 space-y-1 animate-in fade-in">
                  <label htmlFor="custom-template-content" className="sr-only">Contenido parametrizado de la plantilla</label>
                  <textarea
                    id="custom-template-content"
                    value={extractedTextClean}
                    onChange={(e) => setExtractedTextClean(e.target.value)}
                    rows={4}
                    placeholder="Contenido parametrizado de la plantilla..."
                    className="w-full p-2.5 bg-white border border-[#ded8c9] rounded-xl text-xs text-slate-800 font-sans focus:outline-none focus:border-[#0B2545]"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Estado de persistencia UX */}
          {persistenceResult ? (
            <div
              className={`p-3 border rounded-xl text-xs space-y-0.5 animate-in fade-in ${
                persistenceResult.status === 'CONSERVADO TEMPORALMENTE'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-red-50 border-red-300 text-red-800'
              }`}
              role="status"
            >
              <p className="font-bold">{persistenceResult.status}</p>
              <p className="text-[11px]">{persistenceResult.message}</p>
            </div>
          ) : error && (
            <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-red-800 text-xs space-y-0.5 animate-in fade-in">
              <p className="font-bold">No fue posible guardar el machote.</p>
              <p className="text-[11px] text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Pie del Modal */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-[#fbf9f5]">
          <button
            type="button"
            onClick={requestClose}
            disabled={!canClose}
            className="px-4 py-2 rounded-xl bg-white border border-[#ded8c9] hover:bg-slate-100 text-slate-700 text-xs font-bold transition shadow-xs"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || isAnalyzing}
            className="px-5 py-2 rounded-xl bg-[#0B2545] hover:bg-[#081d39] disabled:opacity-50 text-white text-xs font-bold transition shadow-sm flex items-center gap-1.5"
          >
            <span>💾</span>
            <span>{loading ? 'Guardando...' : analysisFailed ? 'Reintentar análisis' : persistenceResult?.retryable ? 'Reintentar guardado' : 'Guardar como Machote'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
