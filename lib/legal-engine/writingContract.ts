import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { getDocumentTemplate } from './documentTemplates';

/**
 * Contrato de cada tipo de escrito.
 *
 * Cada tipo declara: quién firma, qué documentos fuente exige, qué secciones fijas lleva (en orden) y qué NO
 * debe contener. El pipeline lo usa para (1) pedir la ficha y la fuente que falte en lugar de inventarla,
 * (2) dar al redactor reglas de voz y de contenido, y (3) validar el borrador al terminar.
 *
 * Los contratos explícitos cubren las familias con roles propios (apelante/apelado, quejoso, tercero…); el
 * resto se DERIVA del identificador, de la plantilla y de la fuente declarada en el catálogo, de modo que
 * ningún tipo queda sin contrato.
 */

export type SignerRole =
  | 'actor' | 'demandado' | 'apelante' | 'apelado' | 'quejoso' | 'tercero_interesado'
  | 'recurrente' | 'promovente' | 'otro';

export const SIGNER_ROLE_LABEL: Record<SignerRole, string> = {
  actor: 'parte actora',
  demandado: 'parte demandada',
  apelante: 'parte apelante',
  apelado: 'parte apelada',
  quejoso: 'parte quejosa',
  tercero_interesado: 'tercero interesado',
  recurrente: 'parte recurrente',
  promovente: 'promovente',
  otro: 'parte',
};

export interface RequiredInput {
  id: string;
  label: string;
  /** Tipos de documento fuente que lo satisfacen (cualquiera). */
  sourceTypes: readonly string[];
  /** Cómo se satisface además de por tipo de fuente (datos ya extraídos en la ficha). */
  dossierKey?: 'agravios' | 'resolucion';
  /** Qué se le pide al abogado si falta. */
  ask: string;
}

export interface ContractRule {
  id: string;
  message: string;
  pattern: RegExp;
}

export interface WritingContract {
  documentType: string;
  signerRole: SignerRole;
  signerLabel: string;
  counterpartRole: SignerRole;
  counterpartLabel: string;
  /** El abogado debe elegir expresamente a quién representa (no se infiere). */
  needsRepresentation: boolean;
  requiredInputs: readonly RequiredInput[];
  /** Secciones de la plantilla, en orden. */
  fixedSections: readonly string[];
  /** Si es true, el documento solo puede llevar estas secciones y en este orden. */
  strictStructure: boolean;
  /** Qué NO debe contener (además de las reglas generales). */
  forbidden: readonly ContractRule[];
  /** Texto que defiende la postura contraria a la del firmante. */
  oppositeStance: readonly ContractRule[];
  /** Máximo de marcadores de dato pendiente tolerados dentro del cuerpo. */
  maxInlineMarkers: number;
  /** El texto narrativo no puede traer fechas ni lugares que no consten en la ficha o la fuente. */
  datesOnlyFromDossier: true;
}

/* ── Reglas generales (todos los tipos) ───────────────────────────────────── */

/**
 * Meta-texto: comentarios sobre el propio escrito, consejos al abogado o a «la parte», o apertura genérica
 * de relleno. Son notas para el abogado, no texto del escrito: van al anexo de revisión.
 */
export const META_TEXT_RULES: readonly ContractRule[] = [
  { id: 'META_ARGUMENTABLE', message: 'Comentario estratégico dentro del escrito («podría argumentarse…»).', pattern: /\bpodr[ií]a(?:n)?\s+(?:argumentarse|sostenerse|alegarse|plantearse|aprovecharse|argumentar|sostener|alegar|plantear)\b/i },
  { id: 'META_ADVICE', message: 'Consejo dirigido a la parte o al abogado dentro del escrito.', pattern: /\b(?:la\s+parte\s+(?:recurrente|apelante|apelada|actora|demandada|quejosa)|el\s+abogado|la\s+defensa)\s+(?:debe|deber[aá]|deben|conviene|tendr[aá])\s+(?:asegurar|cuidar|verificar|considerar|evitar|procurar|tener\s+presente)\b/i },
  { id: 'META_SELF_REFERENCE', message: 'El escrito habla de sí mismo como «ampliación», «sección» o «nota».', pattern: /\bla\s+presente\s+(?:ampliaci[oó]n|secci[oó]n|redacci[oó]n|nota|extensi[oó]n|continuaci[oó]n)\b/i },
  { id: 'META_FILLER_OPENING', message: 'Apertura genérica de relleno.', pattern: /\ben\s+el\s+contexto\s+(?:del|de\s+la|de\s+este|de\s+esta)\s+(?:recurso|apelaci[oó]n|juicio|procedimiento|asunto|controversia)\b[^.]{0,80}\bes\s+(?:fundamental|importante|relevante|indispensable|necesario)\b/i },
  { id: 'META_PRECISAR', message: 'Nota interna sobre lo que «resulta indispensable precisar».', pattern: /\bresulta\s+indispensable\s+precisar\s+si\b/i },
  { id: 'META_LAGUNA', message: 'Análisis de riesgo procesal propio de una nota para el abogado.', pattern: /\blaguna\s+probatoria\s+que\s+(?:la\s+parte|el\s+contrario|la\s+contraria)\b/i },
];

/** Marcadores de verificación/desarrollo: no se imprimen dentro del escrito. */
export const INLINE_VERIFICATION_MARKER = /\[\s*(?:NO\s+VERIFICADO|POR\s+VERIFICAR|PENDIENTE\s+DE\s+DESARROLLO|PENDIENTE\s+DE\s+REVISI[ÓO]N|REQUIERE\s+REVISI[ÓO]N|REQUIERE\s+DESARROLLO)\b[^\]]*\]/i;

const GENERAL_FORBIDDEN: readonly ContractRule[] = [
  ...META_TEXT_RULES,
  { id: 'INLINE_VERIFICATION_MARKER', message: 'Marcador de verificación dentro del cuerpo: va al anexo de revisión.', pattern: INLINE_VERIFICATION_MARKER },
];

/* ── Postura contraria por rol ────────────────────────────────────────────── */

const OPPOSITE_FOR_APELADO: readonly ContractRule[] = [
  { id: 'STANCE_INTERPONE', message: 'El escrito interpone el recurso: la parte apelada no recurre.', pattern: /\b(?:interpon(?:emos|go|e)|promov(?:emos|emos|o))\s+(?:el\s+presente\s+)?recurso\s+de\s+apelaci[oó]n\b/i },
  { id: 'STANCE_REVOQUE', message: 'Pide revocar o modificar la sentencia: es la postura del apelante.', pattern: /\b(?:se\s+)?(?:revoque|modifique|deje\s+sin\s+efectos?)\s+(?:la\s+)?(?:sentencia|resoluci[oó]n)\b/i },
  { id: 'STANCE_ERROR_SENTENCIA', message: 'Atribuye errores a la sentencia: es la postura del apelante.', pattern: /\bla\s+sentencia\s+(?:recurrida|apelada|definitiva)?\s*(?:incurre|adolece|viola|vulnera|carece\s+de\s+fundamentaci[oó]n|no\s+se\s+ajusta)\b/i },
  { id: 'STANCE_AGRAVIOS_PROPIOS', message: 'Habla de «sus» agravios como propios.', pattern: /\bagravios\s+que\s+se\s+desarrollan\s+m[aá]s\s+adelante\b/i },
];

const OPPOSITE_FOR_APELANTE: readonly ContractRule[] = [
  { id: 'STANCE_CONFIRMAR', message: 'Pide confirmar la sentencia: es la postura de la parte apelada.', pattern: /\b(?:se\s+)?confirme\s+(?:en\s+sus\s+t[eé]rminos\s+)?la\s+sentencia\b/i },
  { id: 'STANCE_INFUNDADO', message: 'Califica agravios de infundados o inoperantes: es la postura de la parte apelada.', pattern: /\b(?:agravios?|motivos?\s+de\s+inconformidad)\s+(?:resulta(?:n)?|es|son)?\s*(?:totalmente\s+)?(?:infundados?|inoperantes?|inatendibles?)\b/i },
];

/* ── Derivación por tipo ──────────────────────────────────────────────────── */

function deriveSignerRole(type: string, templateRole?: string): SignerRole {
  if (/^contestacion_agravios\b/.test(type)) return 'apelado';
  if (/^contestacion_reconvencion/.test(type)) return 'actor';
  if (/^contestacion_/.test(type)) return 'demandado';
  if (/^apelacion_/.test(type)) return 'apelante';
  if (/^(?:revocacion|queja|reclamacion|aclaracion|recurso_)/.test(type)) return 'recurrente';
  if (/^demanda_amparo|^amparo_/.test(type)) return 'quejoso';
  if (/tercero_interesado/.test(type)) return 'tercero_interesado';
  if (/^(?:demanda|reconvencion)_?/.test(type)) return 'actor';
  switch (templateRole) {
    case 'actor': return 'actor';
    case 'demandado': return 'demandado';
    case 'quejoso': return 'quejoso';
    case 'recurrente': case 'impugnante': return 'recurrente';
    default: return 'promovente';
  }
}

function counterpartOf(role: SignerRole): SignerRole {
  switch (role) {
    case 'actor': return 'demandado';
    case 'demandado': return 'actor';
    case 'apelante': return 'apelado';
    case 'apelado': return 'apelante';
    case 'recurrente': return 'otro';
    default: return 'otro';
  }
}

const OPPOSITE_BY_ROLE: Partial<Record<SignerRole, readonly ContractRule[]>> = {
  apelado: OPPOSITE_FOR_APELADO,
  apelante: OPPOSITE_FOR_APELANTE,
};

/** Contratos con documentos fuente obligatorios propios (además de lo que declara el catálogo). */
const EXPLICIT_REQUIRED_INPUTS: Readonly<Record<string, readonly RequiredInput[]>> = {
  contestacion_agravios: [
    {
      id: 'apelacion_contraria',
      label: 'La apelación del contrario (escrito de agravios)',
      sourceTypes: ['RECURSO'],
      dossierKey: 'agravios',
      ask: 'Sube la apelación (escrito de agravios) de la parte contraria. Sin ella no se pueden contestar agravios: el sistema no los inventa.',
    },
  ],
};

/** Tipos cuya estructura es estricta: solo estas secciones y en este orden. */
const STRICT_STRUCTURE_TYPES = new Set(['contestacion_agravios']);

const cache = new Map<string, WritingContract>();

export function getWritingContract(documentType: string): WritingContract {
  const type = (documentType || '').trim();
  const cached = cache.get(type);
  if (cached) return cached;

  const catalog = getCatalogDocument(type);
  const template = getDocumentTemplate(type, catalog && 'label' in catalog ? catalog.label : type);
  const signerRole = deriveSignerRole(type, template?.rolAutor);
  const counterpartRole = counterpartOf(signerRole);

  const explicit = EXPLICIT_REQUIRED_INPUTS[type] || [];
  const declared = catalog && catalog.kind === 'DOCUMENT_TYPE' ? catalog.sourceCompatibility : null;
  const generic: RequiredInput[] = !explicit.length && declared?.sourceRequired
    ? [{
      id: 'documento_fuente',
      label: 'Documento fuente',
      sourceTypes: [...(declared.acceptedSourceTypes || []), ...(declared.optionalSourceTypes || [])],
      ask: 'Sube el documento oficial que este escrito requiere.',
    }]
    : [];

  const contract: WritingContract = Object.freeze({
    documentType: type,
    signerRole,
    signerLabel: SIGNER_ROLE_LABEL[signerRole],
    counterpartRole,
    counterpartLabel: SIGNER_ROLE_LABEL[counterpartRole],
    needsRepresentation: signerRole !== 'otro',
    requiredInputs: Object.freeze([...explicit, ...generic]),
    fixedSections: Object.freeze([...(template?.estructura || [])]),
    strictStructure: STRICT_STRUCTURE_TYPES.has(type),
    forbidden: GENERAL_FORBIDDEN,
    oppositeStance: OPPOSITE_BY_ROLE[signerRole] || [],
    maxInlineMarkers: 12,
    datesOnlyFromDossier: true as const,
  });
  cache.set(type, contract);
  return contract;
}

/** Instrucciones de voz y de contenido que se anteponen a cada solicitud al redactor. */
export function buildWritingContractPrompt(contract: WritingContract, dossierSummary?: string, targetPages?: number): string {
  return [
    'REGLAS OBLIGATORIAS DEL ESCRITO',
    `- Quien firma y habla es la ${contract.signerLabel}${contract.counterpartLabel !== 'parte' ? `; la contraparte (${contract.counterpartLabel}) nunca es quien habla ni se defiende su postura` : ''}.`,
    '- Usa únicamente los datos de la FICHA DEL CASO para nombres, órgano jurisdiccional, lugar, fechas y número de expediente. No inventes ninguno.',
    '- Cada sección contiene solo su contenido: no escribas encabezados, firmas, «lugar y fecha», ni el escrito completo dentro de una sección.',
    '- Escribe solo lo que el expediente sostiene. No rellenes ni repitas: si el material no alcanza, el texto es más corto.',
    ...(targetPages ? [`- La extensión objetivo del escrito completo es de ${targetPages} páginas: cada sección debe desarrollar a fondo su función (análisis de hechos, valoración de pruebas, regla aplicable y su aplicación concreta, refutación y efecto procesal) con material del expediente. La extensión nunca autoriza repetir, parafrasear en bucle ni inventar hechos o fundamentos.`] : []),
    '- No escribas notas, riesgos ni consejos al abogado dentro del escrito (nada de «podría argumentarse», «la parte debe asegurar», «la presente ampliación»).',
    '- No cites artículos, tesis, jurisprudencia ni órganos jurisdiccionales que no aparezcan en las fuentes provistas. Si falta fundamento, no lo cites.',
    ...(dossierSummary ? ['', 'FICHA DEL CASO (única fuente de datos permitida):', dossierSummary] : []),
  ].join('\n');
}
