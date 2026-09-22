/**
 * Contrato explícito para generaciones jurídicas extensas.
 *
 * El modo normal conserva los límites históricos. El modo extended-legal añade
 * profundidad por sección, continuaciones acotadas y una comprobación de
 * páginas basada en el mismo renderer PDF que se entrega al usuario.
 */

export type GenerationExtensionMode = 'standard' | 'extended-legal' | 'extended';

export interface GenerationExtensionInput {
  generationMode?: GenerationExtensionMode;
  targetPages?: number;
  minPages?: number;
  maxPages?: number;
  targetWords?: number;
  maxCallsPerDocument?: number;
  maxContinuationsPerSection?: number;
  maxExpansionPasses?: number;
  maxGeneratedTokens?: number;
}

export interface GenerationExtensionContract {
  generationMode: GenerationExtensionMode;
  targetPages: number;
  minPages: number;
  maxPages: number;
  targetWords: number;
  maxCallsPerDocument: number;
  maxContinuationsPerSection: number;
  maxExpansionPasses: number;
  maxGeneratedTokens: number;
  actualPages?: number;
  wordCount?: number;
  characterCount?: number;
  extensionTargetUnmet?: boolean;
  sectionWordTargets?: Record<string, number>;
  metrics: {
    llmCalls: number;
    continuationCalls: number;
    expansionCalls: number;
    rejectedDuplicateChunks: number;
    providerCalls: Record<string, number>;
  };
}

const STANDARD_LIMITS = {
  targetPages: 0,
  minPages: 0,
  maxPages: 0,
  targetWords: 0,
  maxCallsPerDocument: 0,
  maxContinuationsPerSection: 2,
  maxExpansionPasses: 0,
  maxGeneratedTokens: 7000,
} as const;

const EXTENDED_DEFAULTS = {
  targetPages: 40,
  minPages: 36,
  maxPages: 44,
  targetWords: 16000,
  maxCallsPerDocument: 48,
  maxContinuationsPerSection: 6,
  maxExpansionPasses: 3,
  maxGeneratedTokens: 7000,
} as const;

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function resolveGenerationExtensionContract(
  input?: GenerationExtensionInput | null,
): GenerationExtensionContract {
  const mode = (input?.generationMode === 'extended-legal' || input?.generationMode === 'extended') ? 'extended-legal' : 'standard';
  const defaults = mode === 'extended-legal' ? EXTENDED_DEFAULTS : STANDARD_LIMITS;
  const targetPages = mode === 'extended-legal'
    ? boundedInteger(input?.targetPages, defaults.targetPages, 1, 200)
    : defaults.targetPages;
  const minPages = mode === 'extended-legal'
    ? boundedInteger(input?.minPages, Math.max(1, targetPages - 4), 1, targetPages)
    : defaults.minPages;
  const maxPages = mode === 'extended-legal'
    ? boundedInteger(input?.maxPages, targetPages + 4, targetPages, 240)
    : defaults.maxPages;

  return {
    generationMode: mode,
    targetPages,
    minPages,
    maxPages,
    targetWords: mode === 'extended-legal'
      ? boundedInteger(input?.targetWords, defaults.targetWords, 4000, 100000)
      : defaults.targetWords,
    maxCallsPerDocument: mode === 'extended-legal'
      ? boundedInteger(input?.maxCallsPerDocument, defaults.maxCallsPerDocument, 1, 100)
      : defaults.maxCallsPerDocument,
    maxContinuationsPerSection: mode === 'extended-legal'
      ? boundedInteger(input?.maxContinuationsPerSection, defaults.maxContinuationsPerSection, 3, 12)
      : defaults.maxContinuationsPerSection,
    maxExpansionPasses: mode === 'extended-legal'
      ? boundedInteger(input?.maxExpansionPasses, defaults.maxExpansionPasses, 1, 6)
      : defaults.maxExpansionPasses,
    maxGeneratedTokens: mode === 'extended-legal'
      ? boundedInteger(input?.maxGeneratedTokens, defaults.maxGeneratedTokens, 1800, 7000)
      : defaults.maxGeneratedTokens,
    metrics: {
      llmCalls: 0,
      continuationCalls: 0,
      expansionCalls: 0,
      rejectedDuplicateChunks: 0,
      providerCalls: {},
    },
  };
}

export function isExtendedGeneration(contract?: GenerationExtensionContract | null): boolean {
  return contract?.generationMode === 'extended-legal';
}

function sectionWeight(section: { title?: string; type?: string }): number {
  const key = `${section.title || ''} ${section.type || ''}`.toLowerCase();
  if (/comparec|presentaci|identificaci|firma|cierre|conclusi|petitori|punto.*pet|protesta/.test(key)) return 0.45;
  if (/anteced|histori|proced|hecho|hechos|prueba|probatori/.test(key)) return 1.15;
  if (/agravio|excepci|defensa|argument|derecho|concepto|contestaci|prestaci/.test(key)) return 1.55;
  return 1;
}

export function allocateSectionWordTargets(
  sections: Array<{ id: string; title?: string; type?: string }>,
  totalWords: number,
): Record<string, number> {
  if (sections.length === 0) return {};
  const safeTotal = Math.max(sections.length * 120, Math.round(totalWords));
  const weights = sections.map(sectionWeight);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const raw = sections.map((section, index) => ({
    id: section.id,
    value: (safeTotal * weights[index]!) / weightTotal,
  }));
  const floors = raw.map(({ id, value }) => ({ id, value: Math.max(120, Math.floor(value)) }));
  let remainder = safeTotal - floors.reduce((sum, item) => sum + item.value, 0);
  const ranked = raw
    .map((item, index) => ({ index, fraction: item.value - Math.floor(item.value) }))
    .sort((left, right) => right.fraction - left.fraction);
  let cursor = 0;
  while (remainder > 0) {
    floors[ranked[cursor % ranked.length]!.index]!.value += 1;
    remainder -= 1;
    cursor += 1;
  }
  return Object.fromEntries(floors.map((item) => [item.id, item.value]));
}

export function calculateExtensionTokenBudget(
  sectionTargetWords: number,
  taskCount: number,
  baseBudget = 3600,
): number {
  const wordsPerTask = Math.max(250, sectionTargetWords / Math.max(1, taskCount));
  const estimatedTokens = Math.round(wordsPerTask * 1.45) + Math.max(0, baseBudget - 2600);
  return Math.min(7000, Math.max(1800, estimatedTokens));
}

function normalizeParagraph(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9áéíóúüñ ]/gi, '')
    .trim();
}

function shingles(value: string): Set<string> {
  const words = normalizeParagraph(value).split(' ').filter(Boolean);
  const set = new Set<string>();
  for (let index = 0; index < words.length - 2; index += 1) {
    set.add(words.slice(index, index + 3).join(' '));
  }
  return set;
}

export function paragraphSimilarity(left: string, right: string): number {
  const a = shingles(left);
  const b = shingles(right);
  if (a.size === 0 || b.size === 0) return normalizeParagraph(left) === normalizeParagraph(right) ? 1 : 0;
  let intersection = 0;
  a.forEach((item) => { if (b.has(item)) intersection += 1; });
  return intersection / (a.size + b.size - intersection);
}

export function hasDuplicateContent(previousText: string, nextText: string): boolean {
  const previousParagraphs = previousText.split(/\n{2,}|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])/).map(normalizeParagraph).filter((p) => p.length >= 40);
  const nextParagraphs = nextText.split(/\n{2,}|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])/).map(normalizeParagraph).filter((p) => p.length >= 40);
  if (nextParagraphs.some((paragraph) => previousParagraphs.includes(paragraph))) return true;
  return nextParagraphs.some((next) => previousParagraphs.some((previous) => paragraphSimilarity(previous, next) >= 0.84));
}

export interface ContinuationPromptInput {
  sectionTitle: string;
  previousText: string;
  outline: string[];
  coveredPoints: string[];
  pendingPoints: string[];
  factIds: string[];
  sourceIds: string[];
}

export function buildContinuationPrompt(input: ContinuationPromptInput): string {
  return [
    `SECCIÓN: ${input.sectionTitle}`,
    'CONTEXTO DE CONTINUACIÓN:',
    input.previousText.slice(-6000),
    '',
    `ESQUEMA COMPLETO: ${input.outline.join(' | ') || 'No disponible'}`,
    `PUNTOS YA CUBIERTOS: ${input.coveredPoints.join(' | ') || 'Ninguno'}`,
    `PUNTOS PENDIENTES: ${input.pendingPoints.join(' | ') || 'Ninguno'}`,
    `HECHOS VINCULADOS: ${input.factIds.join(', ') || 'Ninguno'}`,
    `FUENTES VINCULADAS: ${input.sourceIds.join(', ') || 'Ninguna'}`,
    '',
    'INSTRUCCIÓN: Continúa con desarrollo jurídico sustantivamente nuevo y concluye los puntos pendientes.',
    'NO REPITAS párrafos, encabezados, premisas ni citas ya presentes. No inventes hechos, fuentes ni autoridades.',
    'Si ya no existe un punto pendiente que pueda desarrollarse con el expediente, responde únicamente [SECCIÓN_COMPLETA].',
  ].join('\n');
}

export function deduplicateNewContent(
  existingText: string,
  incomingText: string,
): { cleanText: string; removedParagraphs: number; isDuplicate: boolean } {
  if (!incomingText || !incomingText.trim()) {
    return { cleanText: '', removedParagraphs: 0, isDuplicate: false };
  }
  const existingParagraphs = existingText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const incomingParagraphs = incomingText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  let removedParagraphs = 0;
  const cleanParagraphs: string[] = [];

  for (const paragraph of incomingParagraphs) {
    const normParagraph = normalizeParagraph(paragraph);
    if (!normParagraph) continue;

    const isDup = existingParagraphs.some((existing) => {
      const normExisting = normalizeParagraph(existing);
      if (normExisting === normParagraph) return true;
      const sim = paragraphSimilarity(existing, paragraph);
      return sim >= 0.75;
    });

    if (isDup) {
      removedParagraphs += 1;
    } else {
      cleanParagraphs.push(paragraph);
    }
  }

  const cleanText = cleanParagraphs.join('\n\n');
  const isDuplicate = removedParagraphs > 0 && cleanParagraphs.length === 0;

  return { cleanText, removedParagraphs, isDuplicate };
}

