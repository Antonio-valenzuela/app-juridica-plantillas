/**
 * markdownNormalizer.ts
 *
 * Punto ÚNICO de normalización de sintaxis Markdown proveniente de la IA.
 *
 * Distinción crítica que este módulo garantiza:
 *   A) Datos REDACTADOS del expediente (p. ej. `*****`, `**********`, líneas
 *      compuestas únicamente por asteriscos) → SE PRESERVAN tal cual.
 *   B) Sintaxis Markdown generada por el modelo (`**negrita**`, `*cursiva*`,
 *      `### encabezado`, `- viñeta`) → se elimina como sintaxis SIN perder
 *      el contenido textual.
 *
 * Idempotente: aplicar dos veces produce el mismo resultado que una.
 */

/** Línea compuesta solo por asteriscos (marcador de redacción del expediente). */
function isRedactionLine(line: string): boolean {
  return /^\s*\*{3,}\s*$/.test(line);
}

/** Elimina pares de énfasis Markdown conservando el contenido interno. */
function stripInlineEmphasis(text: string): string {
  let out = text;
  // Negrita+cursiva (***x***) — DEBE ir antes que la doble para no dejar residuos.
  out = out.replace(/(?<!\*)\*\*\*([^*]+?)\*\*\*(?!\*)/g, '$1');
  // Negrita (**x**). Los lookaround impiden que un par "robe" bordes de una
  // corrida pura de redacción (***** ) ni empareje dos corridas vecinas.
  out = out.replace(/(?<!\*)\*\*([^*]+?)\*\*(?!\*)/g, '$1');
  // Cursiva (*x*).
  out = out.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '$1');
  // Subrayado __x__ y código `x`.
  out = out.replace(/__([^_]+)__/g, '$1');
  out = out.replace(/`([^`]+)`/g, '$1');
  return out;
}

/**
 * Normaliza un texto multi-línea:
 *  - preserva líneas de redacción (`*****`);
 *  - elimina encabezados Markdown (#, ##, ###…);
 *  - elimina cercos de código (``` / ```json);
 *  - convierte viñetas Markdown (- x, * x) en viñeta tipográfica (• x);
 *  - elimina énfasis **…** / *…** sin perder contenido.
 */
export function normalizeMarkdownFormatting(raw: string): string {
  if (!raw) return raw;

  const outLines: string[] = [];
  let inCodeFence = false;

  for (const line of raw.split('\n')) {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue; // el cerco mismo nunca se imprime
    }
    if (inCodeFence) {
      outLines.push(line);
      continue;
    }
    if (isRedactionLine(line)) {
      outLines.push(line); // dato redactado del expediente: intocado
      continue;
    }

    let l = line;
    // Encabezados Markdown: ### Título → Título
    l = l.replace(/^\s*#{1,6}\s+/, '');
    // Viñetas Markdown: "- x" o "* x" → "• x"
    l = l.replace(/^(\s*)[-*]\s+(?=\S)/, '$1• ');
    // Énfasis inline
    l = stripInlineEmphasis(l);

    outLines.push(l);
  }

  return outLines.join('\n').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '');
}

/** Normaliza un título/encabezado corto (sin lógica de redacción multilínea). */
export function normalizeTitleText(title: string): string {
  if (!title) return title;
  return stripInlineEmphasis(title.replace(/^\s*#{1,6}\s+/, '')).trim();
}

/**
 * Detecta si una línea ya limpia funciona como ENCABEZADO jurídico
 * (p. ej. "DEMANDA", "CONTESTACIÓN", "PRUEBAS", "PRIMERO.", "RESUELVE").
 * Reglas: solo mayúsculas/espacios/puntuación básica, 4–60 caracteres,
 * sin terminar en coma o punto y coma.
 */
export function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 4 || t.length > 60) return false;
  if (/[a-záéíóúüñ]/.test(t)) return false; // cualquier minúscula lo invalida
  if (/[,\.;:]$/.test(t.replace(/\.$/, ''))) return false;
  if (!/[A-ZÁÉÍÓÚÜÑ]/.test(t)) return false;
  // Debe ser mayormente letras/dígitos/espacios (evita fechas largas, folios, etc.)
  const letters = (t.match(/[A-ZÁÉÍÓÚÜÑ0-9]/g) || []).length;
  return letters >= Math.max(3, Math.floor(t.length * 0.5));
}
