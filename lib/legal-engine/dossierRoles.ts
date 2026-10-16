/**
 * Roles procesales de las partes mencionadas en la fuente cuyo nombre no se puede leer (testado con asteriscos o
 * ausente) y órgano que dictó la resolución fuente. Solo DETECTA y ETIQUETA: no decide a quién representa el
 * abogado ni a qué órgano se dirige el escrito.
 */
import { extractAnonymizedField, extractPartyField, extractResolvingCourt, isAnonymizedValue } from './partyExtraction';

/** Rol procesal de una parte mencionada en la fuente. Amplía el modelo sin tocar actor | demandado | otro. */
export const PROCEDURE_ROLES = ['quejoso', 'tercero_interesado', 'demandado', 'autoridad_responsable'] as const;
export type ProcedureRole = (typeof PROCEDURE_ROLES)[number];

export const PROCEDURE_ROLE_LABEL: Record<ProcedureRole, string> = {
  quejoso: 'quejoso',
  tercero_interesado: 'tercero interesado',
  demandado: 'demandado',
  autoridad_responsable: 'autoridad responsable',
};

export interface DetectedRole {
  role: ProcedureRole;
  /** El nombre aparece testado (asteriscos) o no consta; el abogado debe escribirlo. */
  nameStatus: 'REDACTED' | 'ABSENT';
  /** Texto del desplegable, p. ej. «Quejoso (nombre testado en la fuente)». */
  label: string;
}

const MASK = String.raw`\*{2,}(?:\s+\*{2,})*`;
// Mismos patrones de etiqueta que caseAnalysis.ts (quejoso / tercero interesado); aquí solo sirven para detectar el ROL.
const QUEJOSO_PATTERNS = [
  /(?:quejoso|persona\s+quejosa|parte\s+quejosa|promovente|accionante)\s*[:\-]\s*([^;,\n]{2,90})/i,
  /(?:recurr(?:ente|ido))\s*[:\-]\s*([^;,\n]{2,90})/i,
];
const TERCERO_LABEL = [/(?:tercero\s+interesado|tercera\s+interesada)\s*[:\-]\s*([^;,\n]{2,90})/i];
const DEMANDADO_LABEL = [/(?:demandado|demandada|parte\s+demandada)\s*[:\-]\s*([^;,\n]{2,90})/i];
const ENTITY_DEMANDADO_RE = new RegExp(String.raw`\b(ayuntamiento|municipio|patr[oó]n|empresa)\s+(?:constitucional\s+)?demandad[oa]\s+(${MASK})`, 'i');

const capitalized = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

/** Roles mencionados en la fuente cuyo nombre NO se puede leer. Si el nombre es legible, la parte ya figura en `parties`. */
export function detectUnnamedRoles(corpus: string): DetectedRole[] {
  const roles: DetectedRole[] = [];
  const push = (role: DetectedRole) => { if (!roles.some((item) => item.role === role.role)) roles.push(role); };

  if (!extractPartyField(corpus, QUEJOSO_PATTERNS) && extractAnonymizedField(corpus, QUEJOSO_PATTERNS)) {
    push({ role: 'quejoso', nameStatus: 'REDACTED', label: 'Quejoso (nombre testado en la fuente)' });
  }
  if (!extractPartyField(corpus, TERCERO_LABEL)) {
    if (extractAnonymizedField(corpus, TERCERO_LABEL)) push({ role: 'tercero_interesado', nameStatus: 'REDACTED', label: 'Tercero interesado (nombre testado en la fuente)' });
    else if (/\btercer[oa]\s+interesad[oa]\b/i.test(corpus)) push({ role: 'tercero_interesado', nameStatus: 'ABSENT', label: 'Tercero interesado (nombre no consta)' });
  }
  if (!extractPartyField(corpus, DEMANDADO_LABEL)) {
    const entity = corpus.match(ENTITY_DEMANDADO_RE);
    if (entity && isAnonymizedValue(entity[2])) push({ role: 'demandado', nameStatus: 'REDACTED', label: `${capitalized(entity[1])} demandado (nombre testado en la fuente)` });
    else if (extractAnonymizedField(corpus, DEMANDADO_LABEL)) push({ role: 'demandado', nameStatus: 'REDACTED', label: 'Demandado (nombre testado en la fuente)' });
  }
  return roles;
}

/** Órgano que dictó la resolución fuente (sentencia, acuerdo, ejecutoria). Independiente de la autoridad responsable. */
export const extractIssuingCourt = (corpus: string): string => extractResolvingCourt(corpus) || '';
