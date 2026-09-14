import {
  DocumentNode,
  SectionType,
  UniversalLegalDocument,
  createDocumentNode,
  ContentBlock,
} from './types';
import type { CaseAnalysis } from './caseAnalysis';
import { DocumentTemplate, isContestacionType, isContestacionRevisionAmparoDirectoType } from './documentTemplates';
import { buildCivilMercantileEvidenceArgumentSkeleton, buildCivilMercantileResponseSkeleton, buildContestacionSkeleton, buildRevisionAmparoDirectoSkeleton } from './contestacionStructure';
import { isCivilMercantileResponseDocumentType } from './responseContext';
import { isCivilMercantileEvidenceArgumentDocumentType } from './evidenceArgumentContext';
import { extractMachoteStructure } from './structureBuilder';
import { formatCaseContextField } from './caseContext';
import { hasSeedMarkers, stripSeedMarkers } from './seedMarkers';
import { buildCoverageMatrix, type CoverageMatrix } from './coverageMatrix';
import { bindCoverageToSections } from './richCoverage';
import { buildLegalIssueMatrix, type LegalIssueMatrix } from './legalIssueMatrix';

/**
 * documentPlan.ts — PLAN DOCUMENTAL ÚNICO (FASES 4, 7, 10, 11)
 *
 * Regla arquitectónica:
 *   UN DOCUMENTO → UN PLAN → UNA SECCIÓN CANÓNICA POR FUNCIÓN
 *
 * - La ESTRUCTURA de salida proviene de UNA sola identidad documental
 *   (templateId). Nunca se concatena un segundo plan ni se reutiliza un
 *   builder anterior.
 * - El expediente fuente es REFERENCE_ONLY: alimenta análisis/prompts;
 *   JAMÁS crea secciones (_provenance 'SOURCE' queda prohibido en escritos
 *   de parte; solo un machote elegido expresamente por el abogado puede
 *   moldear la estructura, marcado como 'MACHOTE').
 * - La unicidad de títulos se garantiza EN EL PLAN (no en el sanitizer).
 */

export interface DocumentPlanResult {
  sections: DocumentNode[];
  planSource: Extract<NonNullable<DocumentNode['_provenance']>, 'GENERATED' | 'MACHOTE'>;
  templateId: string;
  coverageMatrix?: CoverageMatrix;
  legalIssueMatrix?: LegalIssueMatrix;
  orphanCoverageItemIds?: string[];
}

/** Normaliza títulos para comparaciones canónicas. */
export function normalizeTitleKey(title: string): string {
  return (title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * FASE 11 — Deduplicación a NIVEL DE PLAN: una sola sección canónica por
 * función/título. Si el plan generara dos secciones con el mismo título,
 * la segunda se fusiona dentro de la primera (el contenido nunca se pierde).
 */
export function ensureCanonicalSections(sections: DocumentNode[]): DocumentNode[] {
  const byKey = new Map<string, DocumentNode>();
  const out: DocumentNode[] = [];
  for (const sec of sections) {
    const key = normalizeTitleKey(sec.title);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, sec);
      out.push(sec);
      continue;
    }
    // Fusión canónica: el contenido de la duplicada pasa a la canónica.
    existing.content = [...existing.content, ...sec.content];
    existing.isManuallyEdited = existing.isManuallyEdited || sec.isManuallyEdited;
    existing.validationWarnings = Array.from(
      new Set([...existing.validationWarnings, `Sección duplicada "${sec.title}" fusionada en el plan.`])
    );
  }
  return out.map((s, i) => ({ ...s, order: i * 10 }));
}

/** Inferencia determinística de SectionType desde el título canónico. */
const ARGUMENT_TITLE_RE =
  /conceptos? de violaci|agravio|excepciones y defensas|alegatos|argumentos?|argumentacion|bloque de constitucionalidad|inconformidad|motivos de reclamacion|replica|duplica|contestacion a las excepciones/;
const BACKGROUND_TITLE_RE =
  /antecedentes|hechos\b|acto reclamado|sentencia impugnada|sentencia recurrida|sentencia apelada|resolucion impugnada|resolucion apelada|resolucion reclamada|resolucion recurrida|acuerdo reclamado|cuestion incidente|manifiesto de cumplimiento|ejecutoria recurrida/;
const LEGAL_GROUNDS_TITLE_RE =
  /procedencia|oportunidad|interes excepcional|fundamento|via procesal|via procedimental|precepto|suspension|parametro/;

export function inferSectionType(title: string): SectionType {
  const t = normalizeTitleKey(title);
  if (/petitorio|peticion/.test(t)) return 'petition';
  if (/firma/.test(t)) return 'signature';
  if (/protesto|lugar y fecha/.test(t)) return 'closing';
  if (/anexo/.test(t)) return 'annex';
  if (/prueba|instrumental|evidencia/.test(t)) return 'evidence';
  if (ARGUMENT_TITLE_RE.test(t)) return 'argument';
  if (BACKGROUND_TITLE_RE.test(t)) return 'background';
  if (LEGAL_GROUNDS_TITLE_RE.test(t)) return 'legal_grounds';
  if (/proemio|comparecencia|identificaci|personalidad/.test(t)) return 'identity';
  if (/destinatari|encabezado|rubro/.test(t)) return 'header';
  return 'custom';
}

export interface SectionSeed {
  text: string;
  generationRequirement: NonNullable<ContentBlock['generationRequirement']>;
  generationStatus: NonNullable<ContentBlock['generationStatus']>;
  generationInstruction?: string;
}

/** Semilla contextual mínima por tipo de sección (guía al prompt de IA). */
function seedForSection(
  tpl: DocumentTemplate,
  title: string,
  type: SectionType,
  doc: UniversalLegalDocument
): SectionSeed {
  const commercial = doc.caseContext?.commercialEnforcement;
  if (tpl.tipo === 'demanda_ejecutiva_mercantil') {
    if (type === 'header') {
      return {
        text: `${commercial?.procedural.court.value || '[DATO PENDIENTE: Órgano jurisdiccional mercantil]'}\nEXPEDIENTE: ${doc.caseRefs?.expediente || '[DATO PENDIENTE: Número de expediente]'}\nASUNTO: ${doc.documentTypeLabel}`,
        generationRequirement: 'DETERMINISTIC',
        generationStatus: 'generated',
      };
    }
    if (type === 'identity') {
      return {
        text: `${commercial?.parties.creditor.value || '[DATO PENDIENTE: Acreedor]'}, en carácter de parte actora, frente a ${commercial?.parties.debtor.value || '[DATO PENDIENTE: Deudor]'}, ante Usted comparezco y expongo:`,
        generationRequirement: 'DETERMINISTIC',
        generationStatus: 'generated',
      };
    }
    if (type === 'signature') {
      return {
        text: `PROTESTO LO NECESARIO.\nLUGAR Y FECHA: [DATO PENDIENTE: Lugar y fecha de presentación]\n\n_________________________________________\n${commercial?.parties.creditor.value || '[DATO PENDIENTE: Firma de la parte actora]'}`,
        generationRequirement: 'DETERMINISTIC',
        generationStatus: 'generated',
      };
    }
    if (type === 'petition') {
      return {
        text: '',
        generationRequirement: 'AI_REQUIRED',
        generationStatus: 'pending',
        generationInstruction: 'Formular peticiones mercantiles ejecutivas confirmadas por el abogado y congruentes con el título ejecutivo.',
      };
    }
    return {
      text: '',
      generationRequirement: 'AI_REQUIRED',
      generationStatus: 'pending',
      generationInstruction: `Desarrollar únicamente con el CommercialEnforcementContext confirmado para ${title}.`,
    };
  }
  const expediente = doc.caseRefs?.expediente || '[DATO PENDIENTE DE EXPEDIENTE: Número de expediente]';
  const signatureField = isContestacionType(tpl.tipo, doc.documentTypeLabel) ? 'demandado' : 'promovente';
  switch (type) {
    case 'header': {
      const targetAuthority = doc.proceduralIdentity?.autoridadDestinataria
        || doc.parties?.autoridadDestinataria
        || tpl.destinatario
        || (doc.parties?.autoridadResponsable && !tpl.destinatario
          ? doc.parties.autoridadResponsable
          : `[${(tpl.destinatario || 'AUTORIDAD').toUpperCase()}: DATO PENDIENTE DE EXPEDIENTE]`);
      const filingThrough = doc.proceduralIdentity?.organoPresentacion;
      return {
        text: `${targetAuthority}${filingThrough ? `\nPOR CONDUCTO DE: ${filingThrough}` : ''}\nEXPEDIENTE: ${expediente}\nASUNTO: ${doc.documentTypeLabel}`,
        generationRequirement: 'DETERMINISTIC',
        generationStatus: 'generated',
      };
    }
    case 'identity':
      return {
        text: `${formatCaseContextField(
          doc.caseContext,
          'promovente',
          doc.parties?.actor || doc.parties?.quejoso || doc.parties?.demandado || '[DATO PENDIENTE DE EXPEDIENTE: Nombre de quien promueve]',
        )}, en carácter de ${tpl.rolAutor}, ante Usted con el debido respeto comparezco y expongo:`,
        generationRequirement: 'DETERMINISTIC',
        generationStatus: 'generated',
      };
    case 'signature':
      return {
        text: `PROTESTO LO NECESARIO.\nLUGAR Y FECHA: [DATO PENDIENTE DE EXPEDIENTE: Lugar y fecha de presentación]\n\n_________________________________________\n${
          formatCaseContextField(
            doc.caseContext,
            signatureField,
            doc.parties?.demandado || doc.parties?.quejoso || doc.parties?.actor || `[DATO PENDIENTE DE EXPEDIENTE: Nombre del ${tpl.rolAutor}]`,
          )
        }`,
        generationRequirement: 'DETERMINISTIC',
        generationStatus: 'generated',
      };
    case 'petition':
      return {
        text: '',
        generationRequirement: 'AI_REQUIRED',
        generationStatus: 'pending',
        generationInstruction: `Completar puntos petitorios congruentes con el objetivo procesal de ${tpl.tipo}.`,
      };
    default:
      return {
        text: '',
        generationRequirement: 'AI_REQUIRED',
        generationStatus: 'pending',
        generationInstruction: `Desarrollar por la IA conforme a las fuentes permitidas y las reglas del tipo ${tpl.tipo}.`,
      };
  }
}

/**
 * FASE 5/7 — Esqueleto genérico GENERATED derivado del DocumentTemplate.
 * Determinístico: los IDs son estables entre generaciones
 * (`sec-{tipo}-{n}`), lo que preserva referencias externas y ediciones.
 */
export function buildTemplateSkeleton(tpl: DocumentTemplate, doc: UniversalLegalDocument): DocumentNode[] {
  return tpl.estructura.map((title, i) => {
    const secType = inferSectionType(title);
    const seed = seedForSection(tpl, title, secType, doc);
    return createDocumentNode({
      id: tpl.tipo === 'demanda_ordinaria_civil' || tpl.tipo === 'demanda_ejecutiva_mercantil'
        ? title
        : `sec-${tpl.tipo}-${i + 1}`,
      type: secType,
      title,
      order: i * 10,
      isRepeatable: secType === 'argument',
      generationInstruction: seed.generationInstruction,
      generation: {
        provider: null,
        model: null,
        fallbackUsed: false,
        generationReason: '',
        status: seed.generationStatus,
      },
      content: [
        {
          id: `blk-sec-${tpl.tipo}-${i + 1}`,
          layer: 'USER_POSITION' as const,
          trustLevel: 'VERIFIED' as const,
          text: seed.text,
          isManuallyEdited: false,
          generationRequirement: seed.generationRequirement,
          generationStatus: seed.generationStatus,
        },
      ],
      _templateId: tpl.tipo,
      _provenance: 'GENERATED',
    });
  });
}

/**
 * FASE 12 — Herencia sobre documento existente: por título normalizado se
 * conserva el ID previo (estabilidad de referencias) y el contenido editado
 * manualmente por el abogado. Las secciones generadas se regeneran bajo el
 * MISMO plan (una sola plantilla, jamás mezclada con otra).
 */
function inheritFromPrevious(fresh: DocumentNode[], previous: DocumentNode[]): DocumentNode[] {
  if (!previous.length) return fresh;
  const prevByKey = new Map<string, DocumentNode>();
  for (const p of previous) prevByKey.set(normalizeTitleKey(p.title), p);
  return fresh.map((sec) => {
    const prev = prevByKey.get(normalizeTitleKey(sec.title));
    if (!prev) return sec;
    // Una sección editada manualmente solo puede heredarse dentro del mismo
    // template. Cambiar de estrategia no autoriza mezclar texto de la
    // plantilla anterior aunque el título formal coincida.
    if (prev._templateId && prev._templateId !== sec._templateId) return sec;
    const manual =
      prev.isManuallyEdited || (prev.content || []).some((b) => b.isManuallyEdited);
    
    // Normalizar bloques heredados: si alguno contenía marcadores legacy de semilla,
    // convertirlos a AI_REQUIRED y no tratarlos como texto manual terminado
    const normalizedContent = (prev.content || []).map((block) => {
      if (hasSeedMarkers(block.text)) {
        return {
          ...block,
          text: stripSeedMarkers(block.text),
          generationRequirement: 'AI_REQUIRED' as const,
          generationStatus: 'pending' as const,
          isManuallyEdited: false,
        };
      }
      return {
        ...block,
        provenance: block.isManuallyEdited ? ('USER_EDITED' as const) : block.provenance,
      };
    });

    const hasPendingAiBlock = normalizedContent.some(
      (b) => b.generationRequirement === 'AI_REQUIRED' && !b.text.trim()
    );

    return {
      ...sec,
      id: prev.id || sec.id,
      isManuallyEdited: manual && !hasPendingAiBlock ? true : sec.isManuallyEdited,
      isGenerated: manual && !hasPendingAiBlock ? prev.isGenerated : sec.isGenerated,
      content: manual ? normalizedContent : sec.content,
      _templateId: sec._templateId, // la identidad SIEMPRE es la del plan nuevo
      _provenance: manual ? ('GENERATED' as const) : sec._provenance,
    };
  });
}

export interface BuildPlanInput {
  doc: UniversalLegalDocument;
  template: DocumentTemplate;
  caseAnalysis?: CaseAnalysis;
  savedParties?: Array<{ role: string; name: string }>;
  /** Machote elegido EXPRESAMENTE por el abogado (única excepción estructural) */
  referenceText?: string;
  useReferenceStructure?: boolean;
}

/**
 * Constructor ÚNICO del plan documental. Prioridad:
 *   1. MACHOTE  — el abogado aportó expresamente un machote estructural
 *                 (y el documento no tiene secciones previas que respetar).
 *   2. TEMPLATE — esqueleto GENERATED del DocumentTemplate
 *                 (contestaciones usan su constructor especializado).
 * El resultado SIEMPRE pasa por ensureCanonicalSections y hereda
 * IDs/ediciones del documento previo cuando existe.
 */
export function buildDocumentPlan(input: BuildPlanInput): DocumentPlanResult {
  const { doc, template, caseAnalysis, savedParties, referenceText, useReferenceStructure = false } = input;
  const previous = doc.sections || [];

  let sections: DocumentNode[];
  let planSource: DocumentPlanResult['planSource'];

  // Personal templates may be intentionally concise (for example a one-page
  // promotion). A selected personal template is usable once it has enough
  // text to contain a real heading/body pair; keep the historical threshold
  // for unclassified reference text to avoid mistaking a sentence for a plan.
  const hasUsableMachote = Boolean(
    referenceText &&
    (referenceText.trim().length > 500 || (useReferenceStructure && referenceText.trim().length >= 100))
  );
  const isContestacionFlow = isContestacionType(template.tipo, doc.documentTypeLabel);
  // El output mercantil profesional siempre conserva su estructura canónica:
  // un machote de otra familia no puede cambiar sus secciones requeridas.
  const allowsReferenceStructure = useReferenceStructure
    && template.tipo !== 'demanda_ejecutiva_mercantil'
    && !isCivilMercantileResponseDocumentType(template.tipo)
    && !isCivilMercantileEvidenceArgumentDocumentType(template.tipo);
  if (isContestacionRevisionAmparoDirectoType(template.tipo, doc.documentTypeLabel)) {
    sections = buildRevisionAmparoDirectoSkeleton(doc, caseAnalysis, template.tipo);
    planSource = 'GENERATED';
  } else if (hasUsableMachote && previous.length === 0 && allowsReferenceStructure) {
    sections = extractMachoteStructure(referenceText!, doc.classification);
    sections = sections.map((s) => ({
      ...s,
      _templateId: template.tipo,
      _provenance: 'MACHOTE' as const,
      content: (s.content || []).map((b) => {
        if (hasSeedMarkers(b.text)) {
          return {
            ...b,
            text: stripSeedMarkers(b.text),
            generationRequirement: 'AI_REQUIRED' as const,
            generationStatus: 'pending' as const,
            isManuallyEdited: false,
          };
        }
        return b;
      }),
    }));
    planSource = 'MACHOTE';

  } else if (isCivilMercantileResponseDocumentType(template.tipo)
    && template.tipo !== 'contestacion_demanda_civil'
    && template.tipo !== 'contestacion_demanda_mercantil') {
    sections = buildCivilMercantileResponseSkeleton(doc, caseAnalysis, template.tipo);
    planSource = 'GENERATED';
  } else if (isCivilMercantileEvidenceArgumentDocumentType(template.tipo)) {
    sections = buildCivilMercantileEvidenceArgumentSkeleton(doc, template.tipo);
    planSource = 'GENERATED';
  } else if (isContestacionFlow) {
    sections = buildContestacionSkeleton(doc, caseAnalysis, savedParties, template.tipo);
    planSource = 'GENERATED';
  } else {
    sections = buildTemplateSkeleton(template, doc);
    planSource = 'GENERATED';
  }

  // FASE 11 — canonicidad garantizada EN EL PLAN.
  sections = ensureCanonicalSections(sections);
  // FASE 12 — herencia de IDs y ediciones manuales.
  sections = inheritFromPrevious(sections, previous);

  if (caseAnalysis) {
    const matrix = buildCoverageMatrix(caseAnalysis, { ...doc, sections }, sections);
    const legalIssueMatrix = buildLegalIssueMatrix({ caseAnalysis, coverageMatrix: matrix });
    const binding = caseAnalysis.richCaseAnalysis
      ? bindCoverageToSections(sections, matrix)
      : { sections, orphanCoverageItemIds: [] };
    return {
      sections: binding.sections,
      planSource,
      templateId: template.tipo,
      coverageMatrix: matrix,
      legalIssueMatrix,
      orphanCoverageItemIds: binding.orphanCoverageItemIds,
    };
  }

  return { sections, planSource, templateId: template.tipo };
}
