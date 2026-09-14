/**
 * blockPlanner.ts — NIVEL 4 - 6: Planificador de Bloques Jurídicos + Clasificación IA
 *
 * Convierte la estructura detectada en bloques jerárquicos.
 * Decide dinámicamente qué bloques requieren IA y cuáles se preservan.
 * Evita que fragmentos como "AARON...", "- 6 -", "FIRMA" generen llamadas aisladas.
 */
import type { DocumentIndex, DocumentElement } from './documentIndex';
import type { DetectedSection, StructuralSectionKind } from './structuralParser';
import type { SectionType } from './types';
import { hasSeedMarkers } from './seedMarkers';

// ── Bloque jurídico ──────────────────────────────────────────────────────────

export type BlockAiNeed = 'REQUIRES_AI' | 'PRESERVE_DIRECT' | 'CONDITIONAL';

export interface LegalBlock {
  id: string;
  kind: StructuralSectionKind;
  sectionType: SectionType;
  title: string;
  level: number;
  order: number;
  text: string;
  /** Fragmentos fuente que componen el bloque (para trazabilidad) */
  sourceElementIndices: number[];
  pages: { start: number; end: number };
  /** Clasificación de necesidad de IA */
  aiNeed: BlockAiNeed;
  requiresAi: boolean;
  /** Razón de la clasificación */
  classificationReason: string;
  /** Cantidad de elementos absorbidos */
  elementCount: number;
  /** Longitud en caracteres */
  charCount: number;
  /** Si fue editado manualmente por el usuario */
  isManuallyEdited?: boolean;
  /** Metadatos de contexto del bloque */
  context?: BlockContext;
}

export interface BlockContext {
  facts: string[];
  norms: string[];
  jurisprudence: string[];
  previousBlockTitle?: string;
  nextBlockTitle?: string;
  caseNumbers: string[];
  authorities: string[];
}

export interface BlockPlan {
  blocks: LegalBlock[];
  totalBlocks: number;
  aiBlocks: LegalBlock[];
  preserveBlocks: LegalBlock[];
  /** Resumen legible del plan */
  summary: string;
  /** Estadísticas de eficiencia: cuántas llamadas se ahorran vs. modelo sección por sección */
  efficiency: {
    originalElementCount: number;
    blockCount: number;
    aiCallCount: number;
    savedCalls: number;
    savedRatio: number;
  };
}

// ── Heurísticas de preservación (NO IA) ───────────────────────────────────

function isPageNumberText(text: string): boolean {
  const t = text.trim();
  if (t.length <= 8 && /^[-–—\s]*\d{1,4}\s*[-–—]*$/.test(t)) return true;
  if (/^-?\s*\d+\s*-?$/i.test(t) && t.replace(/\D/g, '').length <= 4) return true;
  if (/^p[áa]gina\s*\d+/i.test(t)) return true;
  return false;
}

function isAdministrativeText(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return true;
  if (t.length <= 4) return true;
  if (/^[-–—_\.]{3,}$/.test(t)) return true;
  if (/^folio\s*[:#]?/i.test(t)) return true;
  if (/^exp(\.|ediente)?\s*[:\-]/i.test(t) && t.length < 60) return true;
  if (isPageNumberText(t)) return true;
  // Nombres aislados: 2-5 palabras en mayúsculas sin puntuación jurídica
  if (/^[A-ZÁÉÍÓÚÑ ]{6,60}$/.test(t) && t.split(/\s+/).length >= 2 && t.split(/\s+/).length <= 5 && t.length < 50) {
    // Pero no confundir con títulos jurídicos
    if (!/(CONCEPTO|AGRAVIO|CONSIDERANDO|RESUELVE|RESULTANDO|ANTECEDENTES|PRIMERO|SEGUNDO)/i.test(t)) return true;
  }
  if (/^-?\s*\d+\s*-?\s*$/.test(t) && t.replace(/\D/g, '').length <= 3) return true;
  return false;
}

function isSignatureBlock(text: string): boolean {
  const t = text.trim();
  if (/^_{3,}/.test(t)) return true;
  if (/^FIRMA$/i.test(t)) return true;
  if (/^R[ÚU]BRICA/i.test(t)) return true;
  if (/^A T E N T A M E N T E$/i.test(t) && t.length < 120) return true;
  return false;
}

function isRepetitiveHeader(text: string, index: DocumentIndex): boolean {
  // Si el mismo texto aparece en >40% de las páginas, es encabezado/pie repetido
  if (text.trim().length < 15 || text.trim().length > 80) return false;
  const pagesContaining = index.pages.filter((p) => p.text.includes(text.trim().slice(0, 30))).length;
  return pagesContaining > index.pageCount * 0.4;
}

// ── Clasificación de necesidad de IA por tipo de bloque ─────────────────────

const ALWAYS_PRESERVE_KINDS: Set<StructuralSectionKind> = new Set(['firmas', 'header']);
const ALWAYS_AI_KINDS: Set<StructuralSectionKind> = new Set(['concepto_violacion', 'agravio', 'argument', 'consideraciones', 'estudio']);
const CONDITIONAL_KINDS: Set<StructuralSectionKind> = new Set(['antecedentes', 'demanda', 'contestacion', 'resolucion', 'resolutivos', 'pruebas', 'petitorios', 'cierre']);

export interface ClassifyBlockOptions {
  isManuallyEdited?: boolean;
  generationRequirement?: 'AI_REQUIRED' | 'DETERMINISTIC' | 'PRESERVED_HUMAN' | 'OPTIONAL';
}

export function classifyBlockAiNeed(
  section: DetectedSection,
  blockText: string,
  index: DocumentIndex,
  options?: ClassifyBlockOptions
): { aiNeed: BlockAiNeed; reason: string; requiresAi: boolean } {
  const kind = section.kind;
  const charCount = blockText.trim().length;

  // 0. MARCADORES DE SEMILLA E INSTRUCCIONES INTERNAS (PRIORIDAD SUPREMA):
  // Si contiene placeholders como "[Desarrollar por la IA...]", NUNCA se preserva directo,
  // sin importar su longitud o tipo de sección.
  if (hasSeedMarkers(blockText)) {
    return {
      aiNeed: 'REQUIRES_AI',
      reason: 'El bloque contiene marcadores de semilla o instrucciones de IA pendientes de desarrollo',
      requiresAi: true,
    };
  }

  // 0b. CONTENIDO HUMANO MANUAL VÁLIDO:
  // Si fue editado manualmente por el abogado y NO tiene marcadores de semilla, se respeta intacto.
  if (options?.isManuallyEdited) {
    return {
      aiNeed: 'PRESERVE_DIRECT',
      reason: 'Contenido editado manualmente por el abogado — preservación prioritaria',
      requiresAi: false,
    };
  }

  // 0c. REQUERIMIENTO EXPLÍCITO DE IA (AI_REQUIRED):
  if (options?.generationRequirement === 'AI_REQUIRED') {
    return {
      aiNeed: 'REQUIRES_AI',
      reason: 'Bloque con requerimiento explícito AI_REQUIRED — requiere generación por IA',
      requiresAi: true,
    };
  }

  // 0d. PRESERVACIÓN EXPLÍCITA (PRESERVED_HUMAN):
  if (options?.generationRequirement === 'PRESERVED_HUMAN') {
    return {
      aiNeed: 'PRESERVE_DIRECT',
      reason: 'Bloque marcado como PRESERVED_HUMAN — preservación obligatoria',
      requiresAi: false,
    };
  }

  // 1. DATOS REDACTADOS (PRIORIDAD sobre ALWAYS_AI_KINDS): fragmentos
  // con corridas de asteriscos (***** ) contienen información redactada del
  // expediente. JAMÁS se regeneran con IA — el modelo parafrasea y destruye/u
  // omite los marcadores. Se preservan VERBATIM, sin importar el tipo de bloque.
  if (/\*{3,}/.test(blockText)) {
    return { aiNeed: 'PRESERVE_DIRECT', reason: `Bloque contiene datos REDACTADOS del expediente (asteriscos) — preservación verbatim obligatoria`, requiresAi: false };
  }

  // 2. Firmas / header puros → preservar
  if (ALWAYS_PRESERVE_KINDS.has(kind)) {
    return { aiNeed: 'PRESERVE_DIRECT', reason: `Bloque tipo "${kind}" — contenido documental, se preserva directo`, requiresAi: false };
  }

  // 3. Argumentos jurídicos siempre requieren IA si tienen sustancia
  if (ALWAYS_AI_KINDS.has(kind)) {
    if (charCount < 30 && isAdministrativeText(blockText)) {
      return { aiNeed: 'PRESERVE_DIRECT', reason: `Bloque "${kind}" vacío / solo administrativo (${charCount} chars) — se preserva`, requiresAi: false };
    }
    return { aiNeed: 'REQUIRES_AI', reason: `Bloque "${kind}" — argumentación jurídica que requiere razonamiento`, requiresAi: true };
  }

  // 4. Resolución / consideraciones genéricas: revisar sustancia
  if (CONDITIONAL_KINDS.has(kind as StructuralSectionKind)) {
    if (charCount < 60) {
      return { aiNeed: 'PRESERVE_DIRECT', reason: `Bloque "${kind}" breve (${charCount} chars) — se preserva`, requiresAi: false };
    }
    if (kind === 'antecedentes' || kind === 'demanda' || kind === 'contestacion' || kind === 'resolucion') {
      // Antecedentes procesales: normalmente requiere síntesis jurídica
      return { aiNeed: 'REQUIRES_AI', reason: `Bloque "${kind}" — antecedentes que pueden requerir síntesis`, requiresAi: true };
    }
    if (kind === 'pruebas' || kind === 'petitorios' || kind === 'resolutivos' || kind === 'cierre') {
      // Pueden generarse determinísticamente si son cortos / estándar
      if (charCount < 200) {
        return { aiNeed: 'PRESERVE_DIRECT', reason: `Bloque "${kind}" estándar y breve — se preserva / determinístico`, requiresAi: false };
      }
      return { aiNeed: 'REQUIRES_AI', reason: `Bloque "${kind}" extenso — requiere generación`, requiresAi: true };
    }
  }

  // 5. Fallback por heurísticas de contenido
  if (isSignatureBlock(blockText) || isAdministrativeText(blockText)) {
    return { aiNeed: 'PRESERVE_DIRECT', reason: `Contenido administrativo / firma detectado`, requiresAi: false };
  }
  if (isRepetitiveHeader(blockText, index)) {
    return { aiNeed: 'PRESERVE_DIRECT', reason: `Encabezado/pie repetido detectado`, requiresAi: false };
  }
  if (charCount < 40) {
    return { aiNeed: 'PRESERVE_DIRECT', reason: `Bloque muy breve (${charCount} chars) — preservado`, requiresAi: false };
  }

  // 6. Unknown con contenido sustantivo → tratar como condicional IA
  if (kind === 'unknown' || kind === 'encabezado') {
    if (charCount < 200) return { aiNeed: 'PRESERVE_DIRECT', reason: `Bloque "${kind}" breve en documento sin estructura clara — preservado`, requiresAi: false };
    return { aiNeed: 'REQUIRES_AI', reason: `Bloque "${kind}" con contenido sustantivo — requiere IA`, requiresAi: true };
  }

  return { aiNeed: 'PRESERVE_DIRECT', reason: `Clasificación por defecto: preservar`, requiresAi: false };
}

// ── Construcción del plan de bloques ───────────────────────────────────────

export function buildBlockPlan(index: DocumentIndex, sections: DetectedSection[]): BlockPlan {
  const blocks: LegalBlock[] = [];
  const elements = index.elements;

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];

    // Recolectar textos de todos los elementos del rango
    const blockElements: DocumentElement[] = [];
    for (const elIdx of sec.elementIndices) {
      const el = elements[elIdx];
      if (el) blockElements.push(el);
    }

    // Dentro del bloque, NO fragmentar en sub-bloques administrativos: se preserva todo junto
    // Filtro: sólo se excluyen page_number aislados si son el único contenido, pero si están mezclados se preservan dentro
    const blockText = blockElements
      .map((e) => e.text)
      .join('\n\n')
      .trim();

    if (blockText.length === 0 && blockElements.length === 0) continue;

    // Si el bloque está compuesto ÚNICAMENTE por números de página / separadores, absorberlo al bloque anterior si existe
    const onlyAdministrative = blockElements.length > 0 && blockElements.every((e) => isPageNumberText(e.text) || isAdministrativeText(e.text) || e.type === 'page_number');
    if (onlyAdministrative && blocks.length > 0) {
      // Absorber al bloque anterior (evita crear bloque dedicado para "- 6 -" aislado)
      const prev = blocks[blocks.length - 1];
      prev.text = `${prev.text}\n\n${blockText}`.trim();
      prev.sourceElementIndices.push(...sec.elementIndices);
      prev.elementCount += blockElements.length;
      prev.charCount = prev.text.length;
      // Actualizar páginas
      prev.pages.end = sec.pageEnd;
      continue;
    }

    const classification = classifyBlockAiNeed(sec, blockText, index);

    const block: LegalBlock = {
      id: `block-${sIdx + 1}-${String(sec.kind).slice(0, 12)}`,
      kind: sec.kind,
      sectionType: sec.sectionType,
      title: sec.title,
      level: sec.level,
      order: sIdx * 10,
      text: blockText,
      sourceElementIndices: [...sec.elementIndices],
      pages: { start: sec.pageStart, end: sec.pageEnd },
      aiNeed: classification.aiNeed,
      requiresAi: classification.requiresAi,
      classificationReason: classification.reason,
      elementCount: blockElements.length,
      charCount: blockText.length,
      context: {
        facts: [],
        norms: [],
        jurisprudence: [],
        previousBlockTitle: sIdx > 0 ? sections[sIdx - 1].title : undefined,
        nextBlockTitle: sIdx < sections.length - 1 ? sections[sIdx + 1].title : undefined,
        caseNumbers: index.caseNumbers.slice(0, 5),
        authorities: index.authorities.slice(0, 5),
      },
    };

    // Enriquecer contexto con elementos relevantes del índice cercanos
    // Normas cercanas: si el bloque menciona artículos
    const blockLower = blockText.toLowerCase();
    const nearbyNorms = index.legalReferences.filter((r) => blockLower.includes(r.slice(0, 20).toLowerCase()));
    block.context!.norms = nearbyNorms.slice(0, 3);
    const nearbyCits = index.citations.filter((c) => blockLower.includes(c.slice(0, 25).toLowerCase()));
    block.context!.jurisprudence = nearbyCits.slice(0, 3);

    blocks.push(block);
  }

  // Post-procesamiento: fusionar bloques preservados consecutivos muy pequeños (<80 chars) entre sí
  const mergedBlocks: LegalBlock[] = [];
  for (const b of blocks) {
    const last = mergedBlocks[mergedBlocks.length - 1];
    if (last && !last.requiresAi && !b.requiresAi && last.charCount < 120 && b.charCount < 200) {
      last.text = `${last.text}\n\n${b.text}`.trim();
      // Título compuesto SOLO si difiere (evita "PRUEBAS / PRUEBAS").
      const tA = last.title.trim();
      const tB = b.title.trim();
      last.title = tA.toLowerCase() === tB.toLowerCase() ? tA : `${tA} / ${tB}`;
      last.sourceElementIndices.push(...b.sourceElementIndices);
      last.elementCount += b.elementCount;
      last.charCount = last.text.length;
      last.pages.end = b.pages.end;
      last.classificationReason += ` + fusionado con "${b.title}"`;
    } else {
      mergedBlocks.push(b);
    }
  }

  // Reordenar
  mergedBlocks.forEach((b, i) => (b.order = i * 10));

  const aiBlocks = mergedBlocks.filter((b) => b.requiresAi);
  const preserveBlocks = mergedBlocks.filter((b) => !b.requiresAi);

  const savedCalls = Math.max(0, index.elements.length - aiBlocks.length);
  const savedRatio = index.elements.length > 0 ? savedCalls / index.elements.length : 0;

  const summary = `Documento: ${index.pageCount} páginas / ${index.elements.length} elementos → ${mergedBlocks.length} bloques jurídicos (${aiBlocks.length} requieren IA, ${preserveBlocks.length} preservados). Ahorro: ${savedCalls} llamadas (${Math.round(savedRatio * 100)}%).`;

  return {
    blocks: mergedBlocks,
    totalBlocks: mergedBlocks.length,
    aiBlocks,
    preserveBlocks,
    summary,
    efficiency: {
      originalElementCount: index.elements.length,
      blockCount: mergedBlocks.length,
      aiCallCount: aiBlocks.length,
      savedCalls,
      savedRatio,
    },
  };
}

/**
 * Helper para diagnóstico rápido sin construir plan completo.
 * Aplica la MISMA política de prioridad que classifyBlockAiNeed:
 * cualquier texto con redacción explícita (\*{3,}) es PRESERVE_DIRECT,
 * sin importar el tipo de bloque.
 */
export function quickClassifyText(
  text: string,
  kind?: StructuralSectionKind,
  options?: ClassifyBlockOptions
): BlockAiNeed {
  // 0. MARCADORES DE SEMILLA (PRIORIDAD MÁXIMA): si contiene placeholders, NUNCA preservar directo
  if (hasSeedMarkers(text)) return 'REQUIRES_AI';

  // 0b. Manual o preservación explícita
  if (options?.isManuallyEdited || options?.generationRequirement === 'PRESERVED_HUMAN') return 'PRESERVE_DIRECT';

  // 0c. Requerimiento explícito de IA
  if (options?.generationRequirement === 'AI_REQUIRED') return 'REQUIRES_AI';

  // 1. Redacción explícita con asteriscos
  if (/\*{3,}/.test(text)) return 'PRESERVE_DIRECT';

  // 2. Elementos documentales / administrativos / firmas
  if (isPageNumberText(text) || isSignatureBlock(text) || isAdministrativeText(text)) return 'PRESERVE_DIRECT';
  if (kind && ALWAYS_PRESERVE_KINDS.has(kind)) return 'PRESERVE_DIRECT';
  if (kind && ALWAYS_AI_KINDS.has(kind)) return 'REQUIRES_AI';

  // 3. Texto humano breve legítimo (< 200 chars) sin marcadores seed
  if (text.trim().length < 200) return 'PRESERVE_DIRECT';

  return 'REQUIRES_AI';
}
