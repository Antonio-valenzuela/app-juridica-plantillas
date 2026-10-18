import type { UploadedSourceDocument } from './types';

/**
 * Una página es ilegible si no tiene texto o solo ruido de escaneo. Una página breve pero legible
 * («NOTIFÍQUESE.», «Foja 3. Constancia») no lo es: se mide por palabras reales, no por longitud.
 */
export function isUnreadablePageText(text: string | undefined): boolean {
  const value = (text ?? '').trim();
  if (!value) return true;
  const words = value.match(/\p{L}{3,}/gu) ?? [];
  if (words.length === 0) return true;
  const letters = (value.match(/\p{L}/gu) ?? []).length;
  const visible = value.replace(/\s/g, '').length;
  return words.length < 3 && letters / visible < 0.5;
}

/** Páginas sin texto legible por documento fuente (solo documentos con paginación). */
export function unreadableSourcePages(sources: readonly UploadedSourceDocument[]): Array<{ sourceId: string; name: string; totalPages: number; pages: number[] }> {
  return sources.flatMap((source) => {
    const pages = source.pages ?? [];
    const unreadable = pages.filter((page) => isUnreadablePageText(page.text)).map((page) => page.page);
    return unreadable.length ? [{ sourceId: source.id, name: source.name || source.id, totalPages: pages.length, pages: unreadable }] : [];
  });
}
