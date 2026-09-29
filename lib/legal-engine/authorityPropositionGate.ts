/**
 * authorityPropositionGate.ts — Validación Semántica y Normativa de Autoridades Jurídicas
 *
 * Garantiza que toda autoridad legal o jurisprudencial citada en el documento
 * efectivamente respalde y sea coherente con la proposición jurídica que sostiene.
 *
 * Reglas rectoras:
 * 1. El artículo 39-A de la Ley Federal del Trabajo regula EXCLUSIVAMENTE el
 *    periodo a prueba y la capacitación inicial.
 *    PROHIBICIÓN ESTRICTA: Jamás fundar terminación por vencimiento de término
 *    o contratos por tiempo determinado en el artículo 39-A de la LFT.
 * 2. La terminación por vencimiento del término en materia laboral debe fundarse en:
 *    - Artículos 35, 36, 37 y 39 de la Ley Federal del Trabajo.
 *    - Artículo 53 fracción III de la Ley Federal del Trabajo.
 *    - Régimen burocrático/OPD aplicable (e.g. Ley para los Servidores Públicos
 *      del Estado de Jalisco y sus Municipios para el Hospital Civil de Guadalajara).
 * 3. Al argumentar vencimiento del término, es imperativo:
 *    - Analizar si la materia del trabajo subsiste al tenor del artículo 39 de la LFT.
 *    - Argumentar de manera expresa en vía cautelar / condicional
 *      ("de acreditarse la validez de la estipulación del término...", "ad cautelam").
 */

export interface AuthorityPropositionCheck {
  authorityCitation: string;
  proposition: string;
  argumentContext?: string;
  applicableRegime?: 'APARTADO_A' | 'APARTADO_B' | 'BUROCRATICO_ESTATAL_OPD' | 'UNKNOWN';
}

export interface AuthorityPropositionValidationResult {
  status: 'PASS' | 'FAIL';
  authorityCitation: string;
  proposition: string;
  reasons: string[];
  corrections: {
    correctAuthorities: string[];
    requiredConditions: string[];
    regimeNotes: string[];
  };
}

const NORM_ACCENTS = (v: string): string =>
  v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Patrones de invocación indebida de 39-A para contratos determinados / vencimiento de término */
const ART_39_A_RE = /\b(?:art[íi]culos?\s+)?39\s*-\s*a\b/i;
const TIEMPO_DETERMINADO_OR_VENCIMIENTO_RE = /\b(?:tiempo\s+determinado|contrato\s+(?:por\s+)?(?:tiempo\s+)?determinado|vencimiento|llegada\s+del\s+t[eé]rmino|extinci[oó]n\s+(?:natural|del\s+contrato)\s+por\s+t[eé]rmino|terminaci[oó]n\s+(?:natural|por\s+vencimiento))\b/i;

export function evaluateAuthorityProposition(input: AuthorityPropositionCheck): AuthorityPropositionValidationResult {
  const normCitation = NORM_ACCENTS(input.authorityCitation);
  const normProp = NORM_ACCENTS(input.proposition);
  const normContext = NORM_ACCENTS(input.argumentContext || '');
  const reasons: string[] = [];
  const correctAuthorities: string[] = [];
  const requiredConditions: string[] = [];
  const regimeNotes: string[] = [];

  const cites39A = ART_39_A_RE.test(normCitation);
  const assertsTerminationOrTerm = TIEMPO_DETERMINADO_OR_VENCIMIENTO_RE.test(normProp) || TIEMPO_DETERMINADO_OR_VENCIMIENTO_RE.test(normCitation);

  // REGLA 1: 39-A LFT NO fundamenta terminación por vencimiento ni contrato por tiempo determinado
  if (cites39A && assertsTerminationOrTerm) {
    reasons.push('MISAPPLIED_AUTHORITY:ART_39_A_REGULATES_PROBATION_NOT_EXPIRATION');
    correctAuthorities.push('artículo 53 fracción III LFT', 'artículos 35, 37 y 39 LFT');
    requiredConditions.push(
      'Verificar si subsiste la materia del trabajo al tenor del artículo 39 de la LFT',
      'Argumentar expresamente en vía cautelar o condicional ("de acreditarse la validez del término...")'
    );
    regimeNotes.push(
      'Verificar régimen aplicable: Apartado A vs Ley para los Servidores Públicos del Estado de Jalisco y sus Municipios (OPD Hospital Civil)'
    );
  }

  // REGLA 2: Vencimiento de término con 53 frac. III o 35-39 LFT
  const cites53FracIII = /\b53\b.*?\b(?:iii|fracci[oó]n\s+tercera)\b/i.test(normCitation) || /\b53\s+fracci[oó]n\s+iii\b/i.test(normCitation);
  const cites35To39 = /\b(?:35|36|37|39)\b/i.test(normCitation);

  if ((cites53FracIII || cites35To39) && assertsTerminationOrTerm) {
    const hasSubsistenceCheck = /\b(?:subsist[ea]\s+la\s+materia|art[íi]culo\s+39|materia\s+del\s+trabajo)\b/i.test(normContext + ' ' + normProp);
    const hasConditionalArg = /\b(?:de\s+acreditarse|en\s+el\s+supuesto|en\s+v[íi]a\s+cautelar|ad\s+cautelam|condicionalmente|suponiendo\s+sin\s+conceder)\b/i.test(normContext + ' ' + normProp);

    if (!hasSubsistenceCheck && normContext.length > 50) {
      requiredConditions.push('Recomendación técnica: analizar si subsiste la materia del trabajo conforme al artículo 39 LFT.');
    }
    if (!hasConditionalArg && normContext.length > 50) {
      requiredConditions.push('Recomendación técnica: articular la excepción en vía cautelar / condicional para evitar presunción de despido.');
    }
  }

  const status = reasons.length === 0 ? 'PASS' : 'FAIL';
  return {
    status,
    authorityCitation: input.authorityCitation,
    proposition: input.proposition,
    reasons,
    corrections: {
      correctAuthorities,
      requiredConditions,
      regimeNotes,
    },
  };
}

export function validateTextAuthorityPropositions(
  text: string,
  context?: { matter?: string; isLaboral?: boolean }
): { isValid: boolean; violations: string[]; details: string[] } {
  const violations: string[] = [];
  const details: string[] = [];

  const isLabor = context?.isLaboral || (context?.matter && /laboral/i.test(context.matter)) || /ley\s+federal\s+del\s+trabajo/i.test(text);

  if (isLabor) {
    // Escaneo de 39-A vinculado a tiempo determinado o terminación por término
    const patterns = [
      /(?:art[íi]culo\s+)?39\s*-\s*a\b[^.\n]{0,120}\b(?:tiempo\s+determinado|vencimiento|llegada\s+del\s+t[eé]rmino|extinci[oó]n\s+del\s+contrato)/i,
      /\b(?:tiempo\s+determinado|vencimiento\s+del\s+t[eé]rmino|llegada\s+del\s+t[eé]rmino)[^.\n]{0,120}(?:art[íi]culo\s+)?39\s*-\s*a\b/i,
    ];

    for (const pat of patterns) {
      if (pat.test(text)) {
        violations.push('MISAPPLIED_AUTHORITY:ART_39_A_FOR_TIEMPO_DETERMINADO');
        details.push('Se detectó el uso del artículo 39-A de la LFT para sostener contratación por tiempo determinado o terminación por vencimiento de término. Dicho artículo regula exclusivamente el periodo a prueba.');
        break;
      }
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
    details,
  };
}

export function correctMisappliedLaborAuthorities(text: string): string {
  let corrected = text;

  // Corrige párrafos que afirman que el 39-A regula contratos por tiempo determinado
  corrected = corrected.replace(
    /(?:El\s+art[íi]culo\s+39-A\s+de\s+la\s+misma\s+ley,\s+que\s+regula\s+espec[íi]ficamente\s+el\s+contrato\s+por\s+tiempo\s+determinado)/gi,
    'Los artículos 35, 37, 39 y 53 fracción III de la misma ley, que regulan la contratación por tiempo determinado y la terminación por vencimiento del término pactado'
  );

  // Corrige referencias aisladas a "artículo 39-A" cuando el contexto es tiempo determinado o vencimiento
  corrected = corrected.replace(
    /\bart[íi]culo\s+39-A\s+de\s+la\s+(?:misma\s+)?(?:ley|LFT)\b(?=[^.\n]*?(?:tiempo\s+determinado|vencimiento|t[eé]rmino))/gi,
    'artículo 53 fracción III y 37 de la Ley Federal del Trabajo'
  );

  // Asegura que mencione la subsistencia de la materia y vía cautelar si habla de terminación por término
  if (/\bextingui[oó]\s+leg[íi]timamente\s+por\s+la\s+llegada\s+del\s+t[eé]rmino\b/i.test(corrected)
    && !/\bsubsist[ea]\s+la\s+materia\b/i.test(corrected)) {
    corrected = corrected.replace(
      /(\bextingui[oó]\s+leg[íi]timamente\s+por\s+la\s+llegada\s+del\s+t[eé]rmino\s+pactado\b)/i,
      '$1 (siempre que no subsista la materia del trabajo conforme al artículo 39 de la Ley Federal del Trabajo, argumentándose en vía cautelar)'
    );
  }

  return corrected;
}
