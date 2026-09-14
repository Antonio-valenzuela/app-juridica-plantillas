import { normalizeLegalDocumentText } from '@/lib/text/normalizeLegalDisplayText';
import type { TemplateCategory } from './templateTypes';

export type PersonalTemplateVariableId =
  | 'actor'
  | 'demandado'
  | 'expediente'
  | 'juzgado'
  | 'domicilio'
  | 'fecha'
  | 'promovente'
  | 'quejoso'
  | 'autoridad'
  | 'menor'
  | 'monto'
  | 'contrato'
  | (string & {});

export interface PersonalTemplateVariable {
  id: PersonalTemplateVariableId;
  label: string;
  placeholder: string;
  required: boolean;
  source: 'detected' | 'inferred';
  occurrences: number;
}

export interface PersonalTemplateSection {
  id: string;
  title: string;
  type: 'heading' | 'paragraph' | 'list';
  order: number;
  preview: string;
}

export interface PersonalTemplateStyleHints {
  paragraphLength: 'breve' | 'medio' | 'extenso';
  recurringFormulas: string[];
  headingStyle: 'mayusculas' | 'mixto' | 'no_detectado';
  depth: 'basica' | 'intermedia' | 'extensa';
}

export interface PersonalTemplateStructure {
  schemaVersion: 1;
  kind: 'personal-template';
  templateOrigin: 'user';
  sections: PersonalTemplateSection[];
  variables: PersonalTemplateVariable[];
  styleHints: PersonalTemplateStyleHints;
  sourceMetadata: {
    fileName?: string;
    pageCount?: number;
    originalDataRemoved: true;
  };
}

export interface RemovedTemplateData {
  label: string;
  variableId: PersonalTemplateVariableId;
  occurrences: number;
}

export interface PersonalTemplateAnalysis {
  category: TemplateCategory;
  documentType: string;
  documentTypeLabel: string;
  parameterizedText: string;
  sections: PersonalTemplateSection[];
  variables: PersonalTemplateVariable[];
  removedData: RemovedTemplateData[];
  styleHints: PersonalTemplateStyleHints;
  structureJson: PersonalTemplateStructure;
}

export interface PersonalTemplateAnalysisOptions {
  sourceFileName?: string;
  pageCount?: number;
  knownValues?: Partial<Record<PersonalTemplateVariableId, string>>;
}

const VARIABLE_LABELS: Record<string, string> = {
  actor: 'Actor / Demandante',
  demandado: 'Demandado',
  expediente: 'Expediente',
  juzgado: 'Juzgado / Tribunal',
  domicilio: 'Domicilio',
  fecha: 'Fecha',
  promovente: 'Promovente',
  quejoso: 'Quejoso',
  autoridad: 'Autoridad responsable',
  menor: 'Menor / Hija o hijo',
  monto: 'Monto',
  contrato: 'Contrato / Convenio',
};

const LABEL_PATTERNS: Array<{
  id: PersonalTemplateVariableId;
  pattern: RegExp;
}> = [
  { id: 'actor', pattern: /\b(?:actor(?:a)?|parte\s+actora|demandante)\s*[:\-]\s*([^\n;]+)/gi },
  { id: 'demandado', pattern: /\b(?:demandado(?:a)?|parte\s+demandada|contraparte)\s*[:\-]\s*([^\n;]+)/gi },
  { id: 'quejoso', pattern: /\b(?:quejoso(?:a)?|persona\s+quejosa)\s*[:\-]\s*([^\n;]+)/gi },
  { id: 'promovente', pattern: /\bpromovente\s*[:\-]\s*([^\n;]+)/gi },
  { id: 'expediente', pattern: /\b(?:expediente|exp\.?|n[uú]mero\s+de\s+expediente)\s*[:\-]\s*([^\n;]+)/gi },
  { id: 'juzgado', pattern: /\b(?:juzgado|tribunal|sala)\s*[:\-]\s*([^\n;]+)/gi },
  { id: 'autoridad', pattern: /\b(?:autoridad\s+responsable|autoridad\s+emisora)\s*[:\-]\s*([^\n;]+)/gi },
  { id: 'domicilio', pattern: /\b(?:domicilio(?:\s+procesal|\s+para\s+notificaciones)?|domicilio\s+fiscal)\s*[:\-]\s*([^\n;]+)/gi },
  { id: 'fecha', pattern: /\bfecha\s*[:\-]\s*([^\n;]+)/gi },
  { id: 'menor', pattern: /\b(?:menor|hija\s+o\s+hijo|hijo(?:a)?)\s*[:\-]\s*([^\n;]+)/gi },
  { id: 'monto', pattern: /\b(?:monto|cantidad|suma\s+reclamada)\s*[:\-]\s*([^\n;]+)/gi },
  { id: 'contrato', pattern: /\b(?:contrato|convenio)\s*[:\-]\s*([^\n;]+)/gi },
];

const CANARY_PATTERNS: Array<{ id: PersonalTemplateVariableId; pattern: RegExp }> = [
  { id: 'actor', pattern: /\bPERSONA_CANARIO_[A-Z0-9_-]+\b/gi },
  { id: 'expediente', pattern: /\bEXP-CANARIO-[A-Z0-9_-]+\b/gi },
  { id: 'domicilio', pattern: /\bDOMICILIO_CANARIO_[A-Z0-9_-]+\b/gi },
];

const FORMULAS = [
  'Por lo anteriormente expuesto',
  'A usted C. Juez',
  'Protesto lo necesario',
  'Bajo protesta de decir verdad',
  'Por tanto',
  'En mérito de lo expuesto',
];

const KNOWN_HEADINGS = /^(?:HECHOS?|ANTECEDENTES?|FUNDAMENTO(?:S)?(?:\s+Y\s+MOTIVACI[ÓO]N)?(?:\s+Y\s+DERECHO)?|DERECHO|CONCEPTOS?(?:\s+DE\s+VIOLACI[ÓO]N)?|AGRAVIOS?|PRUEBAS?|PRESTACIONES?|PETITORIOS?|PUNTOS\s+PETITORIOS?|SOLICITUD(?:ES)?|FIRMA|CLAUSULAS?|CL[ÁA]USULAS?|RESUELVE|CONSIDERANDO)/i;

function labelFor(id: PersonalTemplateVariableId): string {
  return VARIABLE_LABELS[id] || String(id).replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function cleanCapturedValue(value: string): string {
  return value.trim().replace(/[\s.;,]+$/, '').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function placeholderFor(id: PersonalTemplateVariableId): string {
  return `{{${id}}}`;
}

function isPlaceholder(value: string): boolean {
  return /^\{\{\s*[a-z0-9_-]+\s*\}\}$/i.test(value.trim());
}

function canonicalizePlaceholder(id: string): string {
  const normalized = id.trim().toLowerCase().replace(/-/g, '_');
  if (/^(?:nombre|name)(?:_?1)?$/.test(normalized)) return 'actor';
  if (/^(?:nombre|name)2$/.test(normalized)) return 'demandado';
  if (/^(?:exp|numero_expediente)$/.test(normalized)) return 'expediente';
  if (/^(?:juzgado|tribunal_destino)$/.test(normalized)) return 'juzgado';
  return normalized;
}

function inferCategory(text: string): TemplateCategory {
  if (/amparo|quejoso|conceptos?\s+de\s+violaci[oó]n|autoridad\s+responsable/i.test(text)) return 'Amparo';
  if (/laboral|trabajador|patr[oó]n|despido|salarios/i.test(text)) return 'General';
  if (/familiar|guarda\s+y\s+custodia|alimentos|divorcio|menor/i.test(text)) return 'Familiar';
  if (/mercantil|pagar[eé]|t[ií]tulo\s+de\s+cr[eé]dito|comercio/i.test(text)) return 'Mercantil';
  if (/civil|contrato|arrendamiento|incumplimiento/i.test(text)) return 'Civil';
  return 'General';
}

function inferDocumentType(text: string): { value: string; label: string } {
  const rules: Array<[RegExp, string, string]> = [
    [/contestaci[oó]n.{0,50}demanda/i, 'contestacion_demanda', 'Contestación de demanda'],
    [/demanda.{0,50}amparo\s+indirecto/i, 'demanda_amparo_indirecto', 'Demanda de amparo indirecto'],
    [/demanda.{0,50}amparo/i, 'demanda_amparo_directo', 'Demanda de amparo'],
    [/recurso\s+de\s+revisi[oó]n/i, 'recurso_revision', 'Recurso de revisión'],
    [/recurso\s+de\s+queja/i, 'recurso_queja', 'Recurso de queja'],
    [/contrato|convenio/i, 'contrato', 'Contrato o convenio'],
    [/demanda/i, 'demanda', 'Demanda'],
    [/promoci[oó]n|escrito/i, 'promocion', 'Promoción o escrito jurídico'],
  ];
  for (const [pattern, value, label] of rules) {
    if (pattern.test(text)) return { value, label };
  }
  return { value: 'documento_juridico', label: 'Documento jurídico' };
}

function sectionType(title: string): PersonalTemplateSection['type'] {
  return /^(?:HECHOS?|ANTECEDENTES?|PRUEBAS?|PETITORIOS?|PUNTOS\s+PETITORIOS?|PRESTACIONES?|AGRAVIOS?)/i.test(title)
    ? 'list'
    : 'heading';
}

function detectSections(text: string): PersonalTemplateSection[] {
  const lines = text.split(/\r?\n/);
  const starts: Array<{ line: number; title: string; inlineBody?: string }> = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 100) return;
    const normalized = trimmed.replace(/[.:]+$/, '').trim();
    const separator = normalized.indexOf(':');
    const prefix = separator > 0 ? normalized.slice(0, separator).trim() : normalized;
    const inlineBody = separator > 0 && KNOWN_HEADINGS.test(prefix) ? normalized.slice(separator + 1).trim() : undefined;
    const title = inlineBody ? prefix : normalized;
    const looksUppercase = title.length >= 3 && title === title.toLocaleUpperCase('es-MX') && /[A-ZÁÉÍÓÚÑ]/.test(title);
    if (looksUppercase || KNOWN_HEADINGS.test(title)) {
      starts.push({ line: index, title, inlineBody });
    }
  });

  if (starts.length === 0) {
    const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
    return paragraphs.map((preview, index) => ({
      id: index === 0 ? 'introduccion' : `apartado-${index + 1}`,
      title: index === 0 ? 'Introducción' : `Apartado ${index + 1}`,
      type: 'paragraph',
      order: index + 1,
      preview: preview.slice(0, 500),
    }));
  }

  return starts.map((start, index) => {
    const end = starts[index + 1]?.line ?? lines.length;
    const body = [start.inlineBody, ...lines.slice(start.line + 1, end)].filter(Boolean).join('\n').trim();
    return {
      id: start.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `seccion-${index + 1}`,
      title: start.title,
      type: sectionType(start.title),
      order: index + 1,
      preview: body.slice(0, 500),
    };
  });
}

function buildStyleHints(text: string, sections: PersonalTemplateSection[]): PersonalTemplateStyleHints {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const averageWords = paragraphs.length
    ? paragraphs.reduce((sum, paragraph) => sum + paragraph.split(/\s+/).filter(Boolean).length, 0) / paragraphs.length
    : 0;
  const formulas = FORMULAS.filter((formula) => new RegExp(escapeRegExp(formula), 'i').test(text));
  const headingLines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && (KNOWN_HEADINGS.test(line) || line === line.toLocaleUpperCase('es-MX')));
  const uppercaseHeadings = headingLines.filter((line) => line === line.toLocaleUpperCase('es-MX')).length;

  return {
    paragraphLength: averageWords < 35 ? 'breve' : averageWords < 85 ? 'medio' : 'extenso',
    recurringFormulas: formulas,
    headingStyle: headingLines.length === 0 ? 'no_detectado' : uppercaseHeadings / headingLines.length >= 0.6 ? 'mayusculas' : 'mixto',
    depth: text.length < 1500 || sections.length <= 3 ? 'basica' : text.length < 7000 || sections.length <= 8 ? 'intermedia' : 'extensa',
  };
}

function replaceAllLiteral(text: string, value: string, replacement: string): string {
  if (!value.trim() || isPlaceholder(value)) return text;
  return text.replace(new RegExp(escapeRegExp(value.trim()), 'gi'), replacement);
}

/**
 * Converts a lawyer's real document into a reviewable, reusable template.
 * The returned text is the only text that should be persisted for a personal
 * template; it intentionally contains semantic placeholders instead of case data.
 */
export function analyzePersonalTemplateText(
  rawText: string,
  options: PersonalTemplateAnalysisOptions = {}
): PersonalTemplateAnalysis {
  let parameterizedText = normalizeLegalDocumentText(rawText || '').trim();
  const detected = new Map<PersonalTemplateVariableId, number>();

  const register = (id: PersonalTemplateVariableId, occurrences = 1) => {
    detected.set(id, (detected.get(id) || 0) + occurrences);
  };

  // Normalize existing placeholders before inspecting labeled values. This also
  // prevents {{nombre1}} from becoming a permanent, non-semantic field name.
  parameterizedText = parameterizedText.replace(/\{\{\s*([a-z0-9_-]+)\s*\}\}/gi, (_match, rawId: string) => {
    const id = canonicalizePlaceholder(rawId);
    register(id);
    return placeholderFor(id);
  });

  // Explicit known values are supplied by the generated document save path.
  // Replace longer values first to avoid partial replacements in compound names.
  const knownValues = Object.entries(options.knownValues || {})
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1].trim()) && !isPlaceholder(entry[1]))
    .sort((a, b) => b[1].length - a[1].length);
  for (const [rawId, rawValue] of knownValues) {
    const id = canonicalizePlaceholder(rawId);
    const replacement = placeholderFor(id);
    const before = parameterizedText;
    parameterizedText = replaceAllLiteral(parameterizedText, rawValue, replacement);
    if (before !== parameterizedText) register(id);
  }

  // Labeled data is replaced before generic dates/identifiers so that values
  // inside a labeled field are classified with the right semantic role.
  for (const { id, pattern } of LABEL_PATTERNS) {
    parameterizedText = parameterizedText.replace(pattern, (match, rawValue: string) => {
      const value = cleanCapturedValue(rawValue);
      if (!value || isPlaceholder(value)) return match;
      register(id);
      return match.slice(0, match.length - rawValue.length) + placeholderFor(id);
    });
  }

  for (const { id, pattern } of CANARY_PATTERNS) {
    parameterizedText = parameterizedText.replace(pattern, () => {
      register(id);
      return placeholderFor(id);
    });
  }

  // Many court documents put the destination on a standalone line instead of
  // using "JUZGADO:". Preserve the legal label while parameterizing only the
  // concrete court name.
  parameterizedText = parameterizedText.replace(/^(\s*(?:C\.\s*)?(?:JUZGADO|TRIBUNAL|SALA)\b)\s+([^\n]+)$/gim, (match, label: string, value: string) => {
    if (isPlaceholder(value) || /^\s*(?:familiar|civil|mercantil|laboral|administrativ[oa])/i.test(value) && value.trim().split(/\s+/).length <= 2) return match;
    register('juzgado');
    return `${label} ${placeholderFor('juzgado')}`;
  });

  const genericReplacements: Array<{ id: PersonalTemplateVariableId; pattern: RegExp }> = [
    { id: 'expediente', pattern: /\b(?:EXP[-_ ]?CANARIO[-_ ]?[A-Z0-9_-]+|\d{1,6}\s*[\/]\s*\d{2,4})\b/gi },
    { id: 'fecha', pattern: /\b\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}\b/gi },
    { id: 'fecha', pattern: /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/gi },
    { id: 'domicilio', pattern: /\bDOMICILIO_CANARIO_[A-Z0-9_-]+\b/gi },
  ];
  for (const { id, pattern } of genericReplacements) {
    parameterizedText = parameterizedText.replace(pattern, (value) => {
      if (value.includes('{{')) return value;
      register(id);
      return placeholderFor(id);
    });
  }

  const sections = detectSections(parameterizedText);
  const styleHints = buildStyleHints(parameterizedText, sections);
  const variables = Array.from(detected.entries()).map(([id, occurrences]) => ({
    id,
    label: labelFor(id),
    placeholder: placeholderFor(id),
    required: ['actor', 'demandado', 'promovente', 'quejoso', 'expediente', 'juzgado', 'domicilio'].includes(id),
    source: 'detected' as const,
    occurrences,
  }));
  const removedData = variables.map((variable) => ({
    label: variable.label,
    variableId: variable.id,
    occurrences: variable.occurrences,
  }));
  const category = inferCategory(parameterizedText + '\n' + rawText);
  const documentType = inferDocumentType(parameterizedText + '\n' + rawText);
  const structureJson: PersonalTemplateStructure = {
    schemaVersion: 1,
    kind: 'personal-template',
    templateOrigin: 'user',
    sections,
    variables,
    styleHints,
    sourceMetadata: {
      fileName: options.sourceFileName,
      pageCount: options.pageCount,
      originalDataRemoved: true,
    },
  };

  return {
    category,
    documentType: documentType.value,
    documentTypeLabel: documentType.label,
    parameterizedText,
    sections,
    variables,
    removedData,
    styleHints,
    structureJson,
  };
}

export function renderPersonalTemplateText(
  parameterizedText: string,
  values: Record<string, string | number | null | undefined>
): string {
  return normalizeLegalDocumentText(parameterizedText || '').replace(/\{\{\s*([a-z0-9_-]+)\s*\}\}/gi, (_match, rawId: string) => {
    const id = canonicalizePlaceholder(rawId);
    const value = values[id] ?? values[rawId] ?? '';
    return String(value).trim() || `[DATO PENDIENTE: ${labelFor(id)}]`;
  });
}
