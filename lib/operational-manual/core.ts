import { createHash } from 'node:crypto';

export const MANUAL_MATTERS = ['GENERAL', 'CIVIL', 'FAMILIAR', 'MERCANTIL', 'PENAL', 'ADMINISTRATIVO', 'AMPARO', 'FEDERAL', 'PROCESAL', 'PROBATORIO', 'INVESTIGACION', 'JURISPRUDENCIA', 'REDACCION', 'AUDITORIA', 'FUENTES'] as const;
export type ManualMatter = typeof MANUAL_MATTERS[number];
export type ManualCategory = ManualMatter | 'UNCLASSIFIED';
export interface ManualPage { physicalPage: number; text: string }
export interface ManualFragment {
  manualVersion: string; sourceHash: string; physicalPage: number; section: string;
  subsection: string; originalText: string; matter: ManualMatter; stage: string;
  category: ManualCategory; stableRuleId: string; sourceDocumentId: string;
  alwaysActive: boolean;
}
export interface ManualManifest {
  manualId: string; name: string; version: string; sourceHash: string; originalFile: string;
  importedAt: string; status: 'CANONICAL' | 'INACTIVE'; active: boolean;
  detectedPages: number; processedPages: number; emptyPages: number[];
  fragmentCount: number; errors: string[]; warnings: string[]; unclassifiedCount: number;
}
export interface ManualIndex { manifest: ManualManifest; fragments: ManualFragment[]; pages: ManualPage[] }
export interface RetrievalQuery { matter: ManualMatter; caseType?: string; action?: string; stage?: string; task?: string; category?: ManualCategory; budgetChars?: number; measureContext?: (fragments: ManualFragment[]) => number }

export function formatManualTaskContext(rules: ManualFragment[]): string {
  return rules.length ? '\n\nGUÍA OPERATIVA INTERNA LEX PLANTILLAS (NO ES AUTORIDAD JURÍDICA NI FUENTE DE HECHOS):\n' + rules.map((rule) => `[${rule.stableRuleId} | página física ${rule.physicalPage}] ${rule.originalText.trim()}`).join('\n') : '';
}

const masterPatterns = [
  /no\s+inventar/i, /no\s+mezcl(?:ar|es)\s+(?:hechos|expedientes)/i, /trazabilidad/i,
  /distingue\s+siempre/i, /nunca\s+presentes\s+una\s+inferencia/i,
  /separar\s+hechos\s+acreditados/i,
  /verificar\s+(?:la\s+)?vigencia/i, /analizar\s+antes\s+de\s+redactar/i,
  /todo\s+escrito\s+debe\s+ser\s+consecuencia\s+del\s+an[aá]lisis\s+previo/i,
  /audit(?:ar|or[ií]a)\s+antes/i,
];
const matterPatterns: Array<[ManualMatter, RegExp]> = [
  ['PENAL', /\bpenal(?:es)?\b|imputaci[oó]n|delito|acusaci[oó]n/i],
  ['AMPARO', /\bamparo\b|acto reclamado|conceptos? de violaci[oó]n/i],
  ['FAMILIAR', /\bfamiliar\b|alimentos|custodia|patria potestad/i],
  ['MERCANTIL', /\bmercantil\b|t[ií]tulo de cr[eé]dito/i],
  ['ADMINISTRATIVO', /\badministrativ[oa]\b/i],
  ['CIVIL', /\bcivil(?:es)?\b|pretensiones? civiles/i],
  ['JURISPRUDENCIA', /jurisprudencia|precedente|tesis aislada/i],
  ['PROBATORIO', /\bprueb[as]\b|probatori[oa]/i],
  ['INVESTIGACION', /investigaci[oó]n jur[ií]dica/i],
  ['REDACCION', /redacci[oó]n|escrito jur[ií]dico/i],
  ['AUDITORIA', /auditor[ií]a/i],
  ['FUENTES', /fuentes? oficiales|citas? jur[ií]dicas/i],
  ['PROCESAL', /\bprocesal\b/i],
  ['FEDERAL', /\bfederal\b/i],
];
const stagePatterns: Array<[string, RegExp]> = [
  ['AUDITORIA', /auditor[ií]a|checklist|revisi[oó]n final/i],
  ['REDACCION', /redacci[oó]n|antes de redactar|escritos? jur[ií]dicos?/i],
  ['INVESTIGACION', /investigaci[oó]n jur[ií]dica|b[uú]squeda de fuentes/i],
  ['ANALISIS_PROBATORIO', /an[aá]lisis probatorio|valoraci[oó]n de pruebas/i],
  ['ANALISIS', /an[aá]lisis integral|an[aá]lisis adversarial|an[aá]lisis del expediente/i],
  ['ETAPA_PROCESAL', /etapa procesal|plazo|notificaci[oó]n|audiencia/i],
];
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export function buildManualIndex(pages: ManualPage[], source: { manualId: string; version: string; sourceHash: string; originalFile?: string; importedAt?: string }): ManualIndex {
  const errors: string[] = [];
  if (pages.length !== 212) errors.push(`PAGE_COUNT:${pages.length}`);
  const seen = new Set<number>();
  const fragments: ManualFragment[] = [];
  let section = 'Sin sección identificada';
  let subsection = '';
  let stage = 'GENERAL';
  for (const page of pages) {
    let masterList: 'NO_INVENTAR' | 'DISTINGUIR' | null = null;
    if (!Number.isInteger(page.physicalPage) || page.physicalPage < 1 || page.physicalPage > 212 || seen.has(page.physicalPage)) errors.push(`INVALID_PAGE:${page.physicalPage}`);
    seen.add(page.physicalPage);
    // Los separadores permanecen dentro del texto original; concatenar fragmentos reconstruye la página.
    const chunks = page.text.match(/[^\n]*\n|[^\n]+$/g) || [];
    for (let ordinal = 0; ordinal < chunks.length; ordinal++) {
      const originalText = chunks[ordinal];
      const line = originalText.trim();
      if (/^Nunca inventes:/i.test(line)) masterList = 'NO_INVENTAR';
      else if (/^Distingue siempre:/i.test(line)) masterList = 'DISTINGUIR';
      else if (masterList === 'NO_INVENTAR' && !/^●/.test(line) && !/^Nunca inventes:/i.test(line)) masterList = null;
      else if (masterList === 'DISTINGUIR' && !/^[A-F][.)]\s/.test(line) && !/^Distingue siempre:/i.test(line)) masterList = null;
      if (/^(?:\d+[.)]\s*)?[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s,–—-]{7,}$/.test(line) && line.length < 125) {
        if (/^(?:\d+[.)]\s*)?[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s,–—-]{7,}$/.test(line)) { section = line; subsection = ''; }
      }
      if (/^\d+(?:\.\d+)+\.?\s+\S/.test(line) && line.length < 140) subsection = line;
      stage = stagePatterns.find(([, pattern]) => pattern.test(section))?.[0]
        || stagePatterns.find(([, pattern]) => pattern.test(line))?.[0]
        || stage;
      const direct = matterPatterns.find(([, pattern]) => pattern.test(line));
      const inherited = matterPatterns.find(([, pattern]) => pattern.test(section));
      const matter = direct?.[0] || inherited?.[0] || 'GENERAL';
      const alwaysActive = Boolean(masterList) || masterPatterns.some((pattern) => pattern.test(line));
      fragments.push({
        manualVersion: source.version, sourceHash: source.sourceHash, physicalPage: page.physicalPage,
        section, subsection, originalText, matter, stage,
        category: line ? (direct?.[0] || inherited?.[0] || 'UNCLASSIFIED') : 'UNCLASSIFIED',
        stableRuleId: `lex-manual-${source.version}-p${String(page.physicalPage).padStart(3, '0')}-${String(ordinal + 1).padStart(3, '0')}-${hash(originalText).slice(0, 10)}`,
        sourceDocumentId: source.manualId, alwaysActive,
      });
    }
  }
  for (let n = 1; n <= 212; n++) if (!seen.has(n)) errors.push(`MISSING_PAGE:${n}`);
  const emptyPages = pages.filter((page) => !page.text.trim()).map((page) => page.physicalPage);
  if (emptyPages.length) errors.push(`EMPTY_PAGES:${emptyPages.join(',')}`);
  for (const page of pages) {
    const rebuilt = fragments.filter((fragment) => fragment.physicalPage === page.physicalPage).map((fragment) => fragment.originalText).join('');
    if (rebuilt !== page.text) errors.push(`TEXT_LOSS:${page.physicalPage}`);
  }
  return {
    manifest: { manualId: source.manualId, name: 'LEX PLANTILLAS — Manual Operativo Jurídico', version: source.version,
      sourceHash: source.sourceHash, originalFile: source.originalFile || '', importedAt: source.importedAt || new Date().toISOString(),
      status: 'CANONICAL', active: errors.length === 0, detectedPages: pages.length,
      processedPages: seen.size, emptyPages, fragmentCount: fragments.length, errors, warnings: [],
      unclassifiedCount: fragments.filter((fragment) => fragment.category === 'UNCLASSIFIED').length },
    fragments, pages,
  };
}

export function retrieveManualRules(index: ManualIndex, query: RetrievalQuery): { selected: ManualFragment[]; discardedRulesByContextLimit: string[]; usedChars: number } {
  if (!index.manifest.active) return { selected: [], discardedRulesByContextLimit: [], usedChars: 0 };
  const terms = normalize([query.caseType, query.action, query.stage, query.task].filter(Boolean).join(' ')).split(/\W+/).filter((term) => term.length >= 4);
  // El índice conserva incluso el índice histórico del PDF; sus identidades anteriores
  // no se inyectan en escritos nuevos como si describieran al despacho actual.
  const legacyIdentity = /\bPB\s+JUR[IÍ]DICO\b|\bEDGARDO\s+PALACIOS\b|\basistente\s+jur[ií]dico\s+pb\b/i;
  const candidates = index.fragments.filter((item) => item.originalText.trim() && !legacyIdentity.test(item.originalText) && (item.alwaysActive || item.matter === query.matter || item.matter === 'GENERAL') && (!query.category || item.alwaysActive || item.category === query.category));
  const ranked = candidates.map((item) => ({ item, score: (item.alwaysActive ? 100 : 0) + (item.matter === query.matter ? 30 : 0) + (query.stage && normalize(item.stage) === normalize(query.stage) ? 12 : 0) + terms.reduce((n, term) => n + (normalize(item.originalText).includes(term) ? 8 : 0), 0) })).sort((a, b) => b.score - a.score || a.item.physicalPage - b.item.physicalPage);
  const selected: ManualFragment[] = []; const discardedRulesByContextLimit: string[] = [];
  let usedChars = 0; const budget = Math.max(0, query.budgetChars ?? 5000);
  for (const { item, score } of ranked) {
    if (score === 0) continue;
    const candidateChars = query.measureContext ? query.measureContext([...selected, item]) : usedChars + item.originalText.length;
    if (candidateChars > budget) { discardedRulesByContextLimit.push(item.stableRuleId); continue; }
    selected.push(item); usedChars += item.originalText.length;
  }
  return { selected, discardedRulesByContextLimit, usedChars };
}

export interface ManualFinding { ruleId: string; physicalPage: number; status: 'PASS' | 'WARNING' | 'REVIEW_REQUIRED' | 'NOT_APPLICABLE'; code: string }
export function auditOperationalManual(index: ManualIndex, documentText: string, query: Pick<RetrievalQuery, 'matter'>): ManualFinding[] {
  const selected = retrieveManualRules(index, { ...query, task: documentText.slice(0, 500), budgetChars: 6000 }).selected;
  return selected.filter((item) => item.alwaysActive).map((item) => ({
    ruleId: item.stableRuleId, physicalPage: item.physicalPage,
    status: /jurisprudencia|precedente|art[ií]culo/i.test(documentText) && /no\s+inventar|verific/i.test(item.originalText) ? 'REVIEW_REQUIRED' as const : 'WARNING' as const,
    code: 'MANUAL_REVIEW_REQUIRES_SOURCE_CHECK',
  }));
}
