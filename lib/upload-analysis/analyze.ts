import { extractDocument, type ExtractDocumentInput } from '@/lib/pdf/documentExtractor';
import { parseDocumentWithNemotron } from '@/lib/ai/nemotronParser';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { readDocumentLifecycle, type DocumentLifecycleMetadata } from '@/lib/legal-engine/documentLifecycle';
import { analyzePersonalTemplateText } from '@/lib/templates/personalTemplateBuilder';
import {
  inferSourceMatterForDocuments,
  inferSourceOutputType,
} from '@/lib/legal-engine/sourceOutputCompatibility';
import { buildSourceGrounding, type SourceGrounding } from '@/lib/legal-engine/sourceGrounding';

export interface AnalyzeResult {
  ok: boolean;
  lifecycle: DocumentLifecycleMetadata;
  extractedText: string;
  needsOcr: boolean;
  sourceFileName: string;
  mimeType: string;
  sourceValidated: boolean;
  sourceQualityStatus: 'READY' | 'NEEDS_SOURCE_REVIEW';
  sourceValidationMethod: string;
  ocrProvider: string | null;
  ocrStatus?: 'OCR_COMPLETED' | 'OCR_NOT_REQUIRED' | 'OCR_AVAILABLE_AND_FAILED' | 'OCR_PROVIDER_NOT_CONFIGURED';
  qualityScore: {
    confidence: number;
    qualityLabel: string;
    pageCount: number;
    textLength: number;
    avgCharsPerPage: number;
    status: 'READY' | 'NEEDS_OCR' | 'LOW_QUALITY' | 'FAILED';
    ocrUsed: boolean;
    emptyPages: number;
  };
  sourceQuality: {
    pageCount: number;
    characterCount: number;
    charactersPerPage: number;
    emptyPageRatio: number;
    extractionMethod: string;
    ocrUsed: boolean;
    confidence: number;
  };
  extractionSteps: Array<{
    step: number;
    label: string;
    done: boolean;
    status: 'pending' | 'ok' | 'warn' | 'error' | 'running';
    detail?: string;
  }>;
  pages: Array<{ page: number; text: string; chars: number }>;
  classification: {
    es_juridico: boolean;
    tipo_documento: string;
    sourceDocumentType?: string;
    materia?: string;
    confianza: number;
    razon: string;
    secciones_detectadas: string[];
  };
  sourceGrounding: SourceGrounding;
  analysis: ReturnType<typeof reconstructCaseAnalysis>;
  templateAnalysis: ReturnType<typeof analyzePersonalTemplateText>;
  generationEligibility: 'eligible' | 'blocked';
  structureJson: any;
  warnings: string[];
  pipelineStatus: 'READY' | 'NEEDS_MANUAL_REVIEW' | 'FAILED';
  analysisMetrics: {
    documentAnalysisDurationMs: number;
    nativeExtractionDurationMs: number;
    ocrPreparationDurationMs: number;
    ocrDurationMs: number;
    ocrPages: number;
    totalPages: number;
    cacheHit: boolean;
    extractionStatus: string;
    concurrency: number;
  };
  error?: string;
}

const SOURCE_CLASSIFICATION_LABELS: Readonly<Record<string, string>> = {
  DEMANDA: 'Demanda',
  DEMANDA_CIVIL: 'Demanda civil',
  DEMANDA_MERCANTIL: 'Demanda mercantil',
  DEMANDA_LABORAL: 'Demanda laboral',
  DEMANDA_AMPARO: 'Demanda de amparo',
  DEMANDA_AMPARO_DIRECTO: 'Demanda de amparo directo',
  SENTENCIA_O_RESOLUCION: 'Sentencia o resolución',
  SENTENCIA_AMPARO: 'Sentencia de amparo',
  SENTENCIA_AMPARO_DIRECTO: 'Sentencia de amparo directo',
  RESOLUCION_ADMINISTRATIVA: 'Resolución administrativa',
  LAUDO: 'Laudo',
  ACUERDO: 'Acuerdo',
  ACTO_DE_AUTORIDAD: 'Acto de autoridad',
  INFORME_JUSTIFICADO: 'Informe justificado',
  INFORME_PREVIO: 'Informe previo',
};

function classifyLegalText(text: string): AnalyzeResult['classification'] {
  const lower = text.toLowerCase();
  const keywords = [
    'considerando', 'por tanto', 'quejoso', 'demandado', 'actor', 'demandante',
    'juzgado', 'tribunal', 'juicio', 'amparo', 'expediente', 'notifíquese',
    'resuelve', 'visible', 'autos', 'promovente', 'accionante', 'magistrado',
    'contrato', 'convenio', 'obligación', 'cláusula', 'testamento', 'herencia',
    'código civil', 'código de comercio', 'ley de amparo', 'constitución',
    'artículo', 'fracción', 'párrafo', 'diario oficial', 'semanario judicial',
  ];
  const matches = keywords.filter((kw) => lower.includes(kw));
  const ratio = matches.length / keywords.length;
  const secciones: string[] = [];
  if (/antecedentes|hechos/i.test(text)) secciones.push('Hechos / Antecedentes');
  if (/considerando|fundamentos|derecho/i.test(text)) secciones.push('Fundamentos jurídicos');
  if (/por tanto|resuelve|petitorio/i.test(text)) secciones.push('Puntos petitorios');
  if (/pruebas|evidencias/i.test(text)) secciones.push('Pruebas');
  if (/firma|atentamente|promovente/i.test(text)) secciones.push('Firma');
  const tipos: Record<string, RegExp> = {
    'Demanda de amparo': /amparo/i,
    'Demanda civil': /demanda.{0,30}(civil|mercan)/i,
    'Contrato': /contrato|convenio/i,
    'Testamento': /testamento/i,
    'Escrito jurídico general': /juzgado|tribunal|autoridad/i,
  };
  let tipo_documento = 'Documento jurídico';
  for (const [nombre, re] of Object.entries(tipos)) {
    if (re.test(text)) { tipo_documento = nombre; break; }
  }
  return {
    es_juridico: ratio >= 0.08 || matches.length >= 3,
    tipo_documento,
    confianza: Math.round(Math.min(ratio * 4, 1) * 100),
    razon: matches.length >= 3
      ? `Encontradas ${matches.length} palabras clave jurídicas: ${matches.slice(0, 5).join(', ')}.`
      : 'No se detectaron suficientes indicios jurídicos.',
    secciones_detectadas: secciones,
  };
}

function canonicalClassificationLabel(sourceDocumentType: string, fallback: string): string {
  return SOURCE_CLASSIFICATION_LABELS[sourceDocumentType] || fallback;
}

export async function analyzeUploadedDocument(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  cacheHit?: boolean;
  onProgress?: ExtractDocumentInput['onProgress'];
}): Promise<AnalyzeResult> {
  const analysisStartedAt = Date.now();
  const result = await extractDocument({
    buffer: input.buffer,
    fileName: input.fileName,
    mimeType: input.mimeType,
    cacheHit: input.cacheHit,
    onProgress: input.onProgress,
  });
  const sourceDocument = createSourceDocument({
    id: input.fileName,
    filename: input.fileName,
    name: input.fileName,
    type: input.mimeType || 'application/octet-stream',
    extractedText: result.text,
    pages: result.pages,
    sourceValidated: result.sourceValidated,
    sourceQualityStatus: result.sourceQualityStatus,
  });
  const sourceLifecycle = readDocumentLifecycle(sourceDocument);
  if (!sourceLifecycle) throw new Error('La fuente recibida no tiene metadata de ciclo de vida válida.');

  let structureJson: any = null;
  try {
    const nemotronResult = await parseDocumentWithNemotron({
      buffer: input.buffer,
      fileName: input.fileName,
      mimeType: input.mimeType,
      pages: result.pages.map((p) => ({ pageNumber: p.page, text: p.text })),
    });
    if (nemotronResult.ok && nemotronResult.structuredDocument) {
      structureJson = { ...nemotronResult.structuredDocument, lifecycle: sourceLifecycle };
    }
  } catch (e: any) {
    console.warn('[analyze-upload] Nemotron structural parsing fallback:', e?.message || e);
  }

  input.onProgress?.({ phase: 'NORMALIZATION', processedPages: result.pageCount, totalPages: result.pageCount, ocrPages: result.analysisMetrics.ocrPages, percentage: 90 });
  const sourceGrounding = buildSourceGrounding(sourceDocument);
  const classificationBase = result.text.length > 50
    ? classifyLegalText(sourceGrounding.caseText)
    : { es_juridico: false, tipo_documento: 'Sin texto suficiente para clasificar', confianza: 0, razon: 'Texto insuficiente.', secciones_detectadas: [] };
  const sourceDocumentType = sourceGrounding.container.documentType !== 'DOCUMENTO_JURIDICO_NO_CLASIFICADO'
    ? sourceGrounding.container.documentType
    : inferSourceOutputType([sourceDocument]);
  const materia = sourceGrounding.container.matter !== 'NO_IDENTIFICADA'
    ? sourceGrounding.container.matter
    : inferSourceMatterForDocuments([sourceDocument]);
  const classification = {
    ...classificationBase,
    sourceDocumentType,
    materia,
    tipo_documento: canonicalClassificationLabel(sourceDocumentType, classificationBase.tipo_documento),
  };
  const analysis = reconstructCaseAnalysis([sourceDocument]);
  const templateAnalysis = analyzePersonalTemplateText(result.text, {
    sourceFileName: input.fileName,
    pageCount: result.pageCount,
  });
  input.onProgress?.({ phase: 'QUALITY_VALIDATION', processedPages: result.pageCount, totalPages: result.pageCount, ocrPages: result.analysisMetrics.ocrPages, percentage: 96 });

  return {
    ok: true,
    lifecycle: sourceLifecycle,
    extractedText: result.text,
    needsOcr: result.ocrUsed || !result.sourceValidated,
    sourceFileName: input.fileName,
    mimeType: input.mimeType,
    sourceValidated: result.sourceValidated,
    sourceQualityStatus: result.sourceQualityStatus,
    sourceValidationMethod: result.sourceValidationMethod,
    ocrProvider: result.ocrProvider,
    ocrStatus: result.ocrStatus,
    qualityScore: {
      confidence: result.qualityScore.confidence,
      qualityLabel: result.qualityScore.qualityLabel,
      pageCount: result.pageCount,
      textLength: result.textLength,
      avgCharsPerPage: result.avgCharsPerPage,
      status: result.qualityScore.status,
      ocrUsed: result.ocrUsed,
      emptyPages: result.qualityScore.emptyPages,
    },
    sourceQuality: result.sourceQuality,
    extractionSteps: result.extractionSteps,
    pages: result.pages,
    classification,
    sourceGrounding,
    analysis,
    templateAnalysis,
    generationEligibility: result.sourceValidated ? 'eligible' : 'blocked',
    structureJson,
    warnings: result.warnings,
    pipelineStatus: result.status,
    analysisMetrics: {
      ...result.analysisMetrics,
      documentAnalysisDurationMs: Date.now() - analysisStartedAt,
      cacheHit: input.cacheHit === true,
    },
  };
}
