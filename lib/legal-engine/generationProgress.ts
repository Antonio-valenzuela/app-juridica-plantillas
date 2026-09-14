export interface GenerationDocumentLike {
  sections?: unknown;
  blockPlan?: { totalBlocks?: unknown };
}

/**
 * El contador visible representa secciones jurídicas del documento.
 * blockPlan.totalBlocks es una métrica interna de extracción y no puede
 * reemplazar el total que la persona ve en el flujo de redacción.
 */
export function resolveGenerationTotal(
  document: GenerationDocumentLike,
  fallback = 0
): number {
  if (Array.isArray(document.sections) && document.sections.length > 0) {
    return document.sections.length;
  }

  const blockTotal = typeof document.blockPlan?.totalBlocks === 'number'
    ? document.blockPlan.totalBlocks
    : 0;
  return blockTotal > 0 ? blockTotal : Math.max(0, fallback);
}
