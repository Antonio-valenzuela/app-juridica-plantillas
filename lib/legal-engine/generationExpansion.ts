import { runFastMode } from '../ai/orchestrator';
import type { AIProviderResult, AIRequest } from '../ai/providers/types';
import type { CaseAnalysis } from './caseAnalysis';
import { hasDuplicateContent, isExtendedGeneration, type GenerationExtensionContract } from './generationExtension';
import { measureRenderedDocumentPages, type RenderedDocumentPageMetrics } from './documentPageMetrics';
import type { ContentBlock, DocumentNode, UniversalLegalDocument } from './types';
import type { GenerationTraceContext } from './generationTrace';

export interface ExtendedExpansionOptions {
  invokeProvider?: (request: AIRequest) => Promise<AIProviderResult>;
  measure?: (document: UniversalLegalDocument) => Promise<RenderedDocumentPageMetrics>;
  trace?: GenerationTraceContext;
}

export interface ExtendedExpansionResult {
  metrics: RenderedDocumentPageMetrics;
  expansionPasses: number;
  calls: number;
  warnings: string[];
}

function sectionPriority(section: DocumentNode): number {
  const key = `${section.title} ${section.type}`.toLowerCase();
  if (/agravio|excepci|defensa|argument|derecho|contestaci|prestaci/.test(key)) return 4;
  if (/hecho|anteced|proced|prueba|evidencia/.test(key)) return 3;
  if (/petitori|conclusi|cierre|firma|comparec/.test(key)) return 1;
  return 2;
}

function sourceContext(document: UniversalLegalDocument, caseAnalysis?: CaseAnalysis): {
  factIds: string[];
  sourceIds: string[];
  facts: string[];
  authorities: string[];
} {
  const rich = caseAnalysis?.richCaseAnalysis;
  const facts = rich?.facts || caseAnalysis?.facts || [];
  const authorities = rich?.authorities || caseAnalysis?.authorities || [];
  return {
    factIds: facts.map((fact: any) => String(fact.id || '')).filter(Boolean),
    sourceIds: document.sourceDocuments.map((source) => source.id).filter(Boolean),
    facts: facts.slice(0, 80).map((fact: any) => `${fact.id || 'hecho'}: ${fact.proposition || fact.text || fact.description || ''}`),
    authorities: authorities.slice(0, 40).map((authority: any) => typeof authority === 'string'
      ? authority
      : `${authority.id || authority.citation || authority.rubro || 'autoridad'}: ${authority.topic || authority.citationText || ''}`),
  };
}

function buildExpansionPrompt(
  document: UniversalLegalDocument,
  section: DocumentNode,
  caseAnalysis: CaseAnalysis | undefined,
  contract: GenerationExtensionContract,
): string {
  const context = sourceContext(document, caseAnalysis);
  const existingText = section.content.map((block) => block.text).join('\n\n');
  const pending = [
    'delimitación del problema',
    'hechos y prueba estrictamente vinculados',
    'regla jurídica aplicable y su interpretación',
    'subsunción de los hechos acreditados',
    'refutación de la postura contraria',
    'conclusión y efecto procesal',
  ];
  return [
    'Eres redactor jurídico mexicano especializado en contestaciones extensas y source-grounded.',
    'Genera una ampliación sustantiva para una sección existente. No rellenes espacio.',
    'Usa únicamente los hechos, pruebas, autoridades y fuentes identificadas abajo. Si algo no consta, formula una reserva jurídica prudente sin inventarlo.',
    'No repitas texto, encabezados, premisas o citas ya existentes; escribe prosa forense continua sin Markdown.',
    `DOCUMENTO: ${document.documentTypeLabel || document.documentType}`,
    `SECCIÓN: ${section.title}`,
    `OBJETIVO APROXIMADO DE LA SECCIÓN: ${contract.sectionWordTargets?.[section.id] || 0} palabras`,
    `FUENTES: ${context.sourceIds.join(', ') || 'Ninguna identificada'}`,
    `HECHOS VINCULADOS: ${context.factIds.join(', ') || 'Ninguno identificado'}`,
    context.facts.length ? `DETALLE DE HECHOS:\n${context.facts.join('\n')}` : 'DETALLE DE HECHOS: No hay detalle estructurado adicional.',
    context.authorities.length ? `AUTORIDADES IDENTIFICADAS:\n${context.authorities.join('\n')}` : 'AUTORIDADES IDENTIFICADAS: No se proporcionaron autoridades verificadas.',
    `PUNTOS DE PROFUNDIZACIÓN POSIBLES: ${pending.join(' | ')}`,
    'TEXTO EXISTENTE DE LA SECCIÓN (solo para evitar repetición):',
    existingText.slice(-14000),
    '',
    'Entrega únicamente la ampliación nueva. Debe desarrollar razonamiento, relación prueba-hecho, regla-aplicación y consecuencia procesal cuando el expediente lo permita.',
  ].join('\n');
}

function isUsableLegalResponse(response: AIProviderResult): boolean {
  return Boolean(response.success
    && response.content?.trim()
    && response.origin !== 'LOCAL_PLACEHOLDER'
    && response.isLegalAiContent !== false);
}

function makeExpansionBlock(
  document: UniversalLegalDocument,
  section: DocumentNode,
  text: string,
  response: AIProviderResult,
  sequence: number,
  contract: GenerationExtensionContract,
): ContentBlock {
  const context = sourceContext(document, document.caseAnalysis);
  const taskId = `extended-expansion-${section.id}-${sequence}`;
  return {
    id: `blk-${taskId}`,
    text: text.trim(),
    layer: 'GENERATED_ARGUMENT',
    trustLevel: 'AI_INFERENCE',
    provenance: 'AI_GENERATED',
    generationStatus: 'generated',
    generationRequirement: 'AI_REQUIRED',
    isManuallyEdited: false,
    generatedBy: 'AI',
    provider: response.provider,
    model: response.model || null,
    generationId: document.generationMetadata.generationId,
    generationTaskId: taskId,
    generationTaskType: 'EXTENSION',
    coverageItemIds: (document.coverageMatrix?.items || [])
      .filter((item) => item.targetSectionIds?.includes(section.id))
      .map((item) => item.id),
    factIds: context.factIds,
    sources: context.sourceIds.map((documentId) => ({ documentId })),
    issueDraftValidationStatus: 'VALID_NON_FINAL',
    revisionNumber: 0,
    fallbackReason: null,
    semanticScore: undefined,
    genericityClass: 'SPECIFIC',
    ...(contract.generationMode === 'extended-legal' ? {} : {}),
  };
}

export async function expandDocumentToPageTarget(
  document: UniversalLegalDocument,
  caseAnalysis: CaseAnalysis | undefined,
  contract: GenerationExtensionContract,
  options: ExtendedExpansionOptions = {},
): Promise<ExtendedExpansionResult> {
  const measure = options.measure || measureRenderedDocumentPages;
  let metrics = await measure(document);
  const warnings: string[] = [];
  let expansionPasses = 0;
  let calls = 0;
  const invokeProvider = options.invokeProvider || runFastMode;

  if (!isExtendedGeneration(contract)) {
    contract.actualPages = metrics.actualPages;
    contract.wordCount = metrics.wordCount;
    contract.characterCount = metrics.characterCount;
    contract.extensionTargetUnmet = false;
    return { metrics, expansionPasses, calls, warnings };
  }

  const candidates = document.sections
    .filter((section) => !['header', 'footer', 'page-header', 'page-footer', 'signature', 'closing'].includes(section.type))
    .sort((left, right) => sectionPriority(right) - sectionPriority(left) || left.order - right.order);

  while (
    metrics.actualPages < contract.minPages
    && expansionPasses < contract.maxExpansionPasses
    && calls < contract.maxCallsPerDocument
  ) {
    expansionPasses += 1;
    let addedThisPass = false;
    for (const section of candidates) {
      if (metrics.actualPages >= contract.minPages || calls >= contract.maxCallsPerDocument) break;
      const existingText = section.content.map((block) => block.text).join('\n\n');
      const response = await invokeProvider({
        systemPrompt: 'Redacción jurídica extensa, profesional y estrictamente fundada en el expediente. No inventes datos ni repitas contenido.',
        userMessage: buildExpansionPrompt(document, section, caseAnalysis, contract),
        mode: 'fast',
        maxTokens: Math.min(contract.maxGeneratedTokens, 5600),
        maxProviderRetries: 1,
      });
      calls += 1;
      contract.metrics.llmCalls += 1;
      contract.metrics.expansionCalls += 1;
      contract.metrics.providerCalls[response.provider] = (contract.metrics.providerCalls[response.provider] || 0) + 1;

      if (!isUsableLegalResponse(response)) {
        warnings.push(`EXTENSION_PROVIDER_UNAVAILABLE:${section.id}:${response.errorCode || response.fallbackReason || 'NO_LEGAL_CONTENT'}`);
        continue;
      }
      const generated = response.content.trim();
      if (generated.includes('[SECCIÓN_COMPLETA]')) continue;
      if (hasDuplicateContent(existingText, generated)) {
        contract.metrics.rejectedDuplicateChunks += 1;
        warnings.push(`EXTENSION_DUPLICATE_REJECTED:${section.id}`);
        continue;
      }

      section.content.push(makeExpansionBlock(document, section, generated, response, calls, contract));
      addedThisPass = true;
      options.trace?.addWarning(`EXTENDED_EXPANSION_ADDED:${section.id}:${response.provider}`);
      options.trace?.recordDraftBlock(section.content[section.content.length - 1]!);
      metrics = await measure(document);
    }
    if (!addedThisPass) break;
  }

  contract.actualPages = metrics.actualPages;
  contract.wordCount = metrics.wordCount;
  contract.characterCount = metrics.characterCount;
  contract.extensionTargetUnmet = metrics.actualPages < contract.minPages;
  if (contract.extensionTargetUnmet) {
    warnings.push(`EXTENSION_TARGET_UNMET:${metrics.actualPages}/${contract.minPages}`);
  }
  return { metrics, expansionPasses, calls, warnings };
}

