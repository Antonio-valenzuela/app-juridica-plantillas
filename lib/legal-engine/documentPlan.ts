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
import { renderRequestLedSection } from './generationRequestContract';
import { AGRAVIOS_PLACEHOLDER_TITLE, agravioInstruction, agravioSectionTitle, renderAgravioFallback } from './contestacionAgraviosStructure';
import { hasSeedMarkers, stripSeedMarkers } from './seedMarkers';
import { buildCoverageMatrix, type CoverageMatrix } from './coverageMatrix';
import { bindCoverageToSections } from './richCoverage';
import { buildLegalIssueMatrix, type LegalIssueMatrix } from './legalIssueMatrix';
import { factsPolicyFor } from './factsPolicy';
import { injectNarrativeFacts } from './factsSeed';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';

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
  planSource: Extract<NonNullable<DocumentNode['_provenance']>, 'GENERATED' | 'CANONICAL_GENERATED' | 'MACHOTE'>;
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
  if (/protesto|lugar (?:y )?fecha/.test(t)) return 'closing';
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
  const requestLedText = renderRequestLedSection(doc, type, title);
  if (requestLedText !== undefined) {
    return { text: requestLedText, generationRequirement: 'DETERMINISTIC', generationStatus: 'generated', generationInstruction: `Conservar la solicitud y datos confirmados: ${requestLedText}` };
  }
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
    // Los hechos CONFIRMADOS por el abogado se conservan de forma determinista (sin proveedor no se pierden).
    const confirmedFacts = type === 'background'
      ? (commercial?.facts || []).filter((fact) => fact.status === 'CONFIRMED' && fact.text.value)
      : [];
    return {
      text: confirmedFacts.map((fact, index) => `${index + 1}. ${fact.text.value}`).join('\n'),
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
/**
 * ¿La estructura declarada del tipo tiene la forma de una contestación de
 * demanda (la que construye `buildContestacionSkeleton`)? Las contestaciones
 * especializadas (nulidad fiscal/administrativa, agraria, proveedor, seguridad
 * social…) declaran estructura propia: no pueden recibir secciones de una
 * contestación civil ni perder las suyas (identidad del escrito, no etiqueta).
 */
function declaresDemandContestacionShape(template: DocumentTemplate): boolean {
  return template.estructura.some((title) => normalizeTitleKey(title) === 'comparecencia y personalidad');
}

/**
 * Toda sección que el tipo DECLARA debe existir en el plan. Las que el
 * constructor no emitió se insertan en su posición declarada con la semilla
 * de plantilla (pendiente de redacción/postura): no se inventa contenido.
 */
function reconcileDeclaredSections(
  sections: DocumentNode[],
  template: DocumentTemplate,
  doc: UniversalLegalDocument,
): DocumentNode[] {
  // Coincidencia por prioridad (exacta > comienza con > contiene) para anclar
  // cada sección declarada a la sección correcta y no a la primera que la mencione.
  const findSection = (declared: string) => {
    const wanted = normalizeTitleKey(declared);
    const keys = result.map((section) => normalizeTitleKey(section.title));
    const exact = keys.findIndex((key) => key === wanted);
    if (exact >= 0) return exact;
    const starts = keys.findIndex((key) => key.startsWith(wanted) || wanted.startsWith(key));
    if (starts >= 0) return starts;
    return keys.findIndex((key) => key.includes(wanted) || wanted.includes(key));
  };
  const seeded = buildTemplateSkeleton(template, doc);
  const result = [...sections];
  let anchorIndex = -1;
  template.estructura.forEach((declared, declaredIndex) => {
    const found = findSection(declared);
    if (found >= 0) {
      anchorIndex = found;
      return;
    }
    const node = seeded[declaredIndex];
    // Una sección sin texto no sobrevive al ensamblado; el marcador deja explícito
    // que la redacción queda a cargo del abogado (no se inventa contenido).
    const firstBlock = node.content[0];
    const inserted = firstBlock && !firstBlock.text.trim()
      ? { ...node, content: [{ ...firstBlock, text: `${declared}:
[REQUIERE POSTURA DEL ABOGADO]` }, ...node.content.slice(1)] }
      : node;
    result.splice(anchorIndex + 1, 0, inserted);
    anchorIndex += 1;
  });
  return result;
}

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
 * Contestación de agravios (parte apelada): estructura FIJA y un bloque por cada agravio del apelante. Los
 * agravios salen de la ficha confirmada; sin ellos queda una sola sección que lo indica (no se inventan).
 */
function buildContestacionAgraviosSkeleton(tpl: DocumentTemplate, doc: UniversalLegalDocument): DocumentNode[] {
  const base = buildTemplateSkeleton(tpl, doc);
  const agravios = doc.generationMetadata.caseDossier?.agravios || [];
  const typeOverride: Record<string, SectionType> = { 'constancias invocadas': 'evidence' };
  const out: DocumentNode[] = [];
  for (const node of base) {
    const key = normalizeTitleKey(node.title);
    if (key === normalizeTitleKey(AGRAVIOS_PLACEHOLDER_TITLE) && agravios.length > 0) {
      for (const agravio of agravios) {
        out.push(createDocumentNode({
          id: `sec-${tpl.tipo}-agravio-${agravio.number}`,
          type: 'argument',
          title: agravioSectionTitle(agravio.number),
          order: 0,
          isRepeatable: true,
          generationInstruction: agravioInstruction(agravio),
          generation: { provider: null, model: null, fallbackUsed: false, generationReason: 'ISSUE_SCOPED_AGRAVIO_ANSWER', status: 'pending' },
          content: [{
            id: `blk-${tpl.tipo}-agravio-${agravio.number}`,
            layer: 'USER_POSITION' as const,
            trustLevel: 'VERIFIED' as const,
            text: renderAgravioFallback(agravio),
            isManuallyEdited: false,
            generationRequirement: 'AI_REQUIRED' as const,
            generationStatus: 'pending' as const,
          }],
          _templateId: tpl.tipo,
          _provenance: 'GENERATED',
        }));
      }
      continue;
    }
    out.push(typeOverride[key] ? { ...node, type: typeOverride[key] } : node);
  }
  return out.map((node, index) => ({ ...node, order: index * 10 }));
}

/**
 * Registro canónico mínimo para apelación civil cuando no existe machote.
 * Solo define arquitectura reusable; los hechos, normas y agravios concretos
 * siguen dependiendo de las fuentes y de la posición confirmada por el abogado.
 */
const CANONICAL_APPEAL_CIVIL_STRUCTURE = [
  'PROEMIO',
  'RUBRO / AUTORIDAD',
  'IDENTIFICACIÓN DEL ASUNTO',
  'COMPARECENCIA Y PERSONALIDAD',
  'OBJETO: INTERPOSICIÓN DEL RECURSO',
  'PROCEDENCIA Y OPORTUNIDAD',
  'RESOLUCIÓN RECURRIDA',
  'RESOLUCIÓN IMPUGNADA',
  'ANTECEDENTES PROCESALES',
  'CONSIDERACIONES COMBATIDAS',
  'AGRAVIOS',
  'FUNDAMENTACIÓN / CRITERIOS VERIFICADOS',
  'EFECTOS SOLICITADOS A LA ALZADA',
  'PUNTOS PETITORIOS',
  'PROTESTO',
  'LUGAR / FECHA',
  'FIRMA',
] as const;

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
  if (template.tipo === 'apelacion_civil') {
    const canonicalTemplate = { ...template, estructura: [...CANONICAL_APPEAL_CIVIL_STRUCTURE] };
    sections = buildTemplateSkeleton(canonicalTemplate, doc).map((section) => ({
      ...section,
      _provenance: 'CANONICAL_GENERATED' as const,
    }));
    const agraviosSection = sections.find((section) => normalizeTitleKey(section.title) === 'agravios');
    // Rich drafting units already represent these source decisions. Adding
    // the legacy projection too creates an orphan, empty second grievance.
    // Keep the legacy path unchanged if prior child sections have human edits.
    const hasManualChild = previous.some(s => /agravio/i.test(s.title)
      && (s.isManuallyEdited || s.content.some(b => b.isManuallyEdited)
        || s.children?.some(c => c.isManuallyEdited || c.content.some(b => b.isManuallyEdited))));
    const appealAxes = caseAnalysis?.richCaseAnalysis?.draftingProjection?.challenges.length && !hasManualChild
      ? [] : caseAnalysis?.argumentAxes || [];
    if (agraviosSection && appealAxes.length > 0) {
      agraviosSection.children = appealAxes.map((axis, index) => ({
        ...createDocumentNode({
          id: `sec-apelacion_civil-agravio-${axis.id || index + 1}`,
          type: 'argument',
          title: `AGRAVIO ${index + 1 === 1 ? 'PRIMERO' : index + 1 === 2 ? 'SEGUNDO' : `${index + 1}°`}`,
          order: index * 10,
          isRepeatable: true,
          generationInstruction: `Desarrollar el agravio con base exclusiva en el Issue/AgravioPlan "${axis.title}" y sus sourceRefs.`,
          generation: {
            provider: null,
            model: null,
            fallbackUsed: false,
            generationReason: 'ISSUE_SCOPED_APPEAL_GRIEVANCE',
            status: 'pending',
          },
          content: [{
            id: `blk-apelacion_civil-agravio-${axis.id || index + 1}`,
            layer: 'USER_POSITION' as const,
            trustLevel: 'VERIFIED' as const,
            text: '',
            isManuallyEdited: false,
            generationRequirement: 'AI_REQUIRED' as const,
            generationStatus: 'pending' as const,
          }],
          _templateId: template.tipo,
          _provenance: 'CANONICAL_GENERATED' as const,
        }),
        _provenance: 'CANONICAL_GENERATED' as const,
      }));
    }
    planSource = 'CANONICAL_GENERATED';
  } else if (template.tipo === 'contestacion_agravios') {
    sections = buildContestacionAgraviosSkeleton(template, doc);
    planSource = 'GENERATED';
  } else if (isContestacionRevisionAmparoDirectoType(template.tipo, doc.documentTypeLabel)) {
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
    if (isContestacionFlow && declaresDemandContestacionShape(template)) {
      sections = reconcileDeclaredSections(sections, template, doc);
    }
    planSource = 'GENERATED';
  } else if (isCivilMercantileEvidenceArgumentDocumentType(template.tipo)) {
    sections = buildCivilMercantileEvidenceArgumentSkeleton(doc, template.tipo);
    planSource = 'GENERATED';
  } else if (isContestacionFlow && declaresDemandContestacionShape(template)) {
    sections = reconcileDeclaredSections(
      buildContestacionSkeleton(doc, caseAnalysis, savedParties, template.tipo),
      template,
      doc,
    );
    planSource = 'GENERATED';
  } else {
    sections = buildTemplateSkeleton(template, doc);
    planSource = 'GENERATED';
  }

  // Hechos del análisis → sección de hechos de los escritos sustantivos
  // (clase NARRATIVE_REQUIRED). Solo sustituye una semilla puramente pendiente;
  // la demanda ejecutiva mercantil se excluye (solo admite su contexto confirmado).
  if (caseAnalysis?.facts?.length && template.tipo !== 'demanda_ejecutiva_mercantil') {
    const entry = getCatalogDocument(template.tipo);
    const familyId = entry && entry.kind === 'DOCUMENT_TYPE' ? entry.familyId : '';
    const { policy } = factsPolicyFor({ id: template.tipo, familyId, requiredSections: template.estructura });
    if (policy === 'NARRATIVE_REQUIRED') sections = injectNarrativeFacts(sections, caseAnalysis.facts);
  }
  // FASE 11 — canonicidad garantizada EN EL PLAN.
  sections = ensureCanonicalSections(sections);
  // FASE 12 — herencia de IDs y ediciones manuales.
  sections = inheritFromPrevious(sections, previous);

  // La parte apelada responde agravios: el análisis del caso (hechos, «actos impugnados») es el de quien apela y no
  // debe generar cobertura ni asuntos jurídicos propios; sus bloques salen de la ficha confirmada.
  if (caseAnalysis && template.tipo !== 'contestacion_agravios') {
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
