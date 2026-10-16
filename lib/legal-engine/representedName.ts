/**
 * Validación del nombre de la parte que el abogado dice representar.
 *
 * Función pura (sin red ni estado): la usan la ficha del caso (interfaz) y el servidor, para que la regla no se pueda
 * saltar enviando la petición sin pasar por el diálogo. Solo descarta lo que no puede ser el nombre de una parte; no
 * exige dos palabras porque hay partes de una sola palabra (siglas como IMSS, SAT, CFE).
 */

export type RepresentedNameIssueCode = 'EMPTY' | 'TOO_SHORT' | 'NO_LETTERS' | 'REPEATED_CHAR' | 'REPEATED_BLOCK';

/** Mensaje único que ve el abogado ante cualquier nombre bloqueado. */
export const REPRESENTED_NAME_INVALID_MESSAGE = 'Escribe el nombre completo de la parte';

export interface InvalidRepresentedName {
  ok: false;
  code: RepresentedNameIssueCode;
  message: string;
}

export interface RepresentedNameWarning {
  code: 'NOT_A_DETECTED_PARTY';
  message: string;
}

export interface ValidRepresentedName {
  ok: true;
  /** Aviso NO bloqueante: el nombre es válido pero no coincide con ninguna parte detectada en el documento. */
  warning?: RepresentedNameWarning;
}

export type RepresentedNameCheck = ValidRepresentedName | InvalidRepresentedName;

const MIN_LENGTH = 3;
/** Una sola palabra de hasta 8 letras hecha de un bloque de 1-2 letras repetido (xcxc, abab). */
const MAX_REPEATED_BLOCK_LETTERS = 8;

const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const invalid = (code: RepresentedNameIssueCode): InvalidRepresentedName => ({ ok: false, code, message: REPRESENTED_NAME_INVALID_MESSAGE });

/**
 * Bloquea: vacío, menos de 3 caracteres, sin letras, un mismo carácter repetido y una sola palabra de 8 letras o menos
 * formada por un bloque de 1-2 letras repetido. Acepta siglas de 3 o más letras, nombres cortos como «Ana» y nombres
 * compuestos. `detectedNames` son las partes detectadas en la fuente: si hay y ninguna coincide, devuelve un aviso.
 */
export function validateRepresentedName(raw: string | null | undefined, detectedNames: readonly string[] = []): RepresentedNameCheck {
  const value = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!value) return invalid('EMPTY');
  if (value.length < MIN_LENGTH) return invalid('TOO_SHORT');
  const letters = fold(value.replace(/[^\p{L}]/gu, ''));
  if (!letters) return invalid('NO_LETTERS');
  if (new Set(letters).size === 1) return invalid('REPEATED_CHAR');
  if (!/\s/.test(value) && letters.length <= MAX_REPEATED_BLOCK_LETTERS && /^(.{1,2})\1+$/.test(letters)) return invalid('REPEATED_BLOCK');

  const known = detectedNames.map((name) => fold(String(name || '').trim())).filter(Boolean);
  if (known.length) {
    const key = fold(value);
    if (!known.some((name) => name.includes(key) || key.includes(name))) {
      return { ok: true, warning: { code: 'NOT_A_DETECTED_PARTY', message: 'Este nombre no coincide con ninguna parte detectada en el documento; verifica que sea el correcto.' } };
    }
  }
  return { ok: true };
}
