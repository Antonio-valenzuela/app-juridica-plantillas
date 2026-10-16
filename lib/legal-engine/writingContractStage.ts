import type { ContentBlock, DocumentNode, UniversalLegalDocument, UploadedSourceDocument } from './types';
import { buildCaseDossier, dossierMatchesSources, dossierSummaryText, missingRequiredInputs, validateDossierForContract, type CaseDossier } from './caseDossier';
import { buildWritingContractPrompt, getWritingContract, type WritingContract } from './writingContract';
import { dedupeReviewAnnex, emptyReviewAnnex, reviewAnnexHasItems, separateReviewMaterial, type ReviewAnnex } from './reviewAnnex';
import { validateWritingContract, type ContractFinding } from './writingContractValidator';
import { closingText, signatureText } from './contestacionAgraviosStructure';
import { inferSourceOutputType } from './sourceOutputCompatibility';

/**
 * Etapa del contrato del escrito dentro del pipeline:
 *   1. antes de redactar: ficha confirmada, representación elegida y documentos fuente obligatorios;
 *   2. durante: reglas de voz/contenido en cada solicitud al redactor;
 *   3. después: separa del cuerpo las notas y marcadores, valida contra el contrato, repara lo formal
 *      (firma, cierre) y regenera una vez las secciones que lo necesiten. Nunca baja un gate: lo que no puede
 *      corregirse queda como hallazgo y bloquea FINAL.
 */

export interface PreparedWritingContract {
  contract: WritingContract;
  dossier?: CaseDossier;
  prompt: string;
}

export interface WritingContractInputFlags {
  caseDossier?: CaseDossier;
  requireCaseDossier?: boolean;
  separateReviewAnnex?: boolean;
}

/** Tipos que siempre pasan por el contrato aunque quien llame no lo pida (no existen sin su fuente). */
const ALWAYS_ENFORCED = new Set(['contestacion_agravios']);

export class WritingContractError extends Error {
  readonly code: 'CASE_DOSSIER_REQUIRED' | 'REQUIRED_SOURCE_MISSING';
  readonly metadata: unknown;
  constructor(code: WritingContractError['code'], message: string, metadata?: unknown) {
    super(`${code}: ${message}`);
    this.name = 'WritingContractError';
    this.code = code;
    this.metadata = metadata;
  }
}

function safeContract(documentType: string): WritingContract | undefined {
  try { return getWritingContract(documentType); } catch { return undefined; }
}

export function prepareWritingContract(args: {
  documentType: string;
  flags: WritingContractInputFlags;
  suppliedSources: UploadedSourceDocument[];
  /** Extensión máxima elegida (páginas), si la hay. */
  targetPages?: number;
}): PreparedWritingContract | undefined {
  const { documentType, flags, suppliedSources } = args;
  if (!documentType) return undefined;
  const enforce = Boolean(flags.requireCaseDossier || flags.separateReviewAnnex || flags.caseDossier || ALWAYS_ENFORCED.has(documentType));
  if (!enforce) return undefined;
  const contract = safeContract(documentType);
  if (!contract) return undefined;

  const hasSources = suppliedSources.some((source) => (source.pages?.length || source.extractedText || source.content));
  const dossier = flags.caseDossier || (hasSources ? buildCaseDossier(suppliedSources) : undefined);
  const sourceTypeOf = (source: UploadedSourceDocument) => String(inferSourceOutputType([source]));

  // Documentos fuente obligatorios con contrato propio (p. ej. la apelación del contrario): se piden, no se inventan.
  const missingInputs = missingRequiredInputs(dossier, contract, suppliedSources, { sourceTypeOf })
    .filter((problem) => contract.requiredInputs.find((input) => input.id === problem.inputId)?.dossierKey);
  if (missingInputs.length) throw new WritingContractError('REQUIRED_SOURCE_MISSING', missingInputs.map((problem) => problem.message).join(' '), missingInputs);

  if (flags.requireCaseDossier) {
    const problems = validateDossierForContract(dossier, contract, suppliedSources, { sourceTypeOf })
      .filter((problem) => problem.code !== 'REQUIRED_INPUT_MISSING');
    if (dossier && dossier.confirmed && !dossierMatchesSources(dossier, suppliedSources)) {
      problems.push({ code: 'DOSSIER_NOT_CONFIRMED', message: 'La ficha corresponde a otro documento: vuelve a revisarla y confirmarla.' });
    }
    if (problems.length) throw new WritingContractError('CASE_DOSSIER_REQUIRED', problems.map((problem) => problem.message).join(' '), problems);
  }

  return { contract, dossier, prompt: buildWritingContractPrompt(contract, dossier ? dossierSummaryText(dossier, { documentType }) : undefined, args.targetPages) };
}

/** Vuelca la ficha confirmada en el documento (órgano, expediente, partes) y registra el contrato. */
export function applyDossierToDocument(doc: UniversalLegalDocument, prepared: PreparedWritingContract): void {
  const { dossier, prompt } = prepared;
  doc.generationMetadata.writingContractPrompt = prompt;
  if (!dossier) return;
  doc.generationMetadata.caseDossier = dossier;
  if (!dossier.confirmed) return;
  if (dossier.expediente) doc.caseRefs = { ...doc.caseRefs, expediente: dossier.expediente };
  if (dossier.court) doc.parties = { ...doc.parties, autoridadDestinataria: dossier.court };
}

/** Texto de las fuentes y de la ficha: lo único que respalda citas, fechas, lugares y órganos. */
export function supportTextOf(doc: UniversalLegalDocument, dossier?: CaseDossier): string {
  const sources = (doc.sourceDocuments || []).map((source) => source.pages?.length ? source.pages.map((page) => page.text).join('\n') : (source.extractedText || source.content || ''));
  const verified = ((doc.generationMetadata.verifiedAuthorities || []) as Array<{ identity?: { canonicalCitation?: string } }>).map((authority) => authority.identity?.canonicalCitation || '');
  return [...sources, ...verified, dossier ? dossierSummaryText(dossier, { documentType: doc.documentType }) : ''].join('\n');
}

export interface EnforceOptions {
  prepared: PreparedWritingContract;
  annex: ReviewAnnex;
  /** Regenera el texto de una sección con una instrucción de corrección; devuelve el texto nuevo o undefined. */
  regenerateText?: (section: DocumentNode, correction: string) => Promise<string | undefined>;
  maxRegenerations?: number;
}

export interface EnforceResult {
  findings: ContractFinding[];
  regenerated: string[];
  passes: number;
}

function correctionFor(findings: readonly ContractFinding[]): string {
  const lines = findings.map((finding) => `- ${finding.message}${finding.excerpt ? ` (p. ej. «${finding.excerpt}»)` : ''}`);
  return `CORRECCIÓN OBLIGATORIA: la versión anterior de esta sección incumplió el contrato del escrito. Reescríbela sin repetir esos defectos:\n${lines.join('\n')}\nEscribe solo el contenido de esta sección, sin encabezados, firma, lugar ni fecha, sin notas al abogado y con datos únicamente de la ficha y de las fuentes.`;
}

function setSectionText(section: DocumentNode, text: string): void {
  const first = section.content?.[0] as ContentBlock | undefined;
  if (!first) return;
  first.text = text;
  section.content = [first];
}

/** Repara de forma determinista el cierre y la firma a partir de la ficha y el contrato. */
export function rebuildFormalSections(doc: UniversalLegalDocument, prepared: PreparedWritingContract): number {
  const { contract, dossier } = prepared;
  let rebuilt = 0;
  for (const section of doc.sections || []) {
    if (section.isManuallyEdited || section.content?.some((block) => block.isManuallyEdited)) continue;
    if (section.type === 'closing') { setSectionText(section, closingText(dossier?.city)); rebuilt += 1; }
    if (section.type === 'signature') {
      const label = contract.signerLabel.charAt(0).toUpperCase() + contract.signerLabel.slice(1);
      setSectionText(section, signatureText(dossier?.confirmed ? dossier.representedName : undefined, label));
      rebuilt += 1;
    }
  }
  return rebuilt;
}

/**
 * Separa el material de revisión, valida contra el contrato, repara y regenera (una vez) lo que haga falta.
 * Devuelve los hallazgos que persisten.
 */
export async function enforceWritingContract(doc: UniversalLegalDocument, options: EnforceOptions): Promise<EnforceResult> {
  const { prepared, annex } = options;
  const { contract, dossier } = prepared;
  const regenerated: string[] = [];
  let passes = 0;
  const supportText = supportTextOf(doc, dossier);
  const validate = () => validateWritingContract(doc, { contract, dossier, sourceText: supportText });

  // 1. Separación determinista (notas, marcadores, citas sin respaldo, estructura anidada) y cierre/firma.
  separateReviewMaterial(doc, annex, { supportText });
  const formalFindings = validate().filter((finding) => finding.repair);
  if (formalFindings.length) rebuildFormalSections(doc, prepared);
  passes += 1;

  // 2. Lo que la separación no resuelve (postura contraria, datos fuera de la ficha, exceso de marcadores).
  let findings = validate();
  const budget = options.maxRegenerations ?? 1;
  if (options.regenerateText && budget > 0) {
    const bySection = new Map<string, ContractFinding[]>();
    for (const finding of findings) {
      if (!finding.regenerable || !finding.sectionId) continue;
      bySection.set(finding.sectionId, [...(bySection.get(finding.sectionId) || []), finding]);
    }
    for (const [sectionId, sectionFindings] of bySection) {
      const section = (doc.sections || []).find((candidate) => candidate.id === sectionId);
      if (!section || regenerated.includes(sectionId)) continue;
      const text = await options.regenerateText(section, correctionFor(sectionFindings));
      if (text && text.trim()) {
        setSectionText(section, text);
        regenerated.push(sectionId);
      }
    }
    if (regenerated.length) {
      separateReviewMaterial(doc, annex, { supportText });
      rebuildFormalSections(doc, prepared);
      findings = validate();
      passes += 1;
    }
  }

  // 3. Lo que persiste queda registrado (anexo + validación del documento) y bloquea FINAL.
  const unresolved = findings.filter((finding) => finding.severity === 'ERROR');
  for (const finding of unresolved) {
    annex.unresolvedFindings.push({ code: finding.code, section: finding.sectionTitle, message: finding.message });
  }
  return { findings, regenerated, passes };
}

/** Cierra el anexo del documento y registra el resultado en su metadata. */
export function finalizeReviewAnnex(doc: UniversalLegalDocument, annex: ReviewAnnex, result?: EnforceResult): ReviewAnnex {
  const clean = dedupeReviewAnnex(annex);
  doc.generationMetadata.reviewAnnex = clean;
  if (result) {
    doc.generationMetadata.writingContractValidation = {
      findings: result.findings.map((finding) => ({ code: finding.code, severity: finding.severity, sectionTitle: finding.sectionTitle, message: finding.message })),
      regenerated: result.regenerated,
      passes: result.passes,
    };
  }
  return clean;
}

export { emptyReviewAnnex, reviewAnnexHasItems };
