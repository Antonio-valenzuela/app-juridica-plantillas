/** Texto único de la experiencia «Usar mi plantilla» (cliente y servidor). */
export const USE_MY_TEMPLATE_LABEL = 'Usar mi plantilla (diseño y estructura)';

export const TEMPLATE_DESIGN_KEPT = 'el diseño de tu plantilla (estilos, márgenes, membrete, encabezado y pie), su estructura, títulos y fórmulas';
export const TEMPLATE_DESIGN_REWRITTEN = 'hechos, prestaciones, agravios, excepciones, pruebas, derecho y petitorios, con los datos de tu caso nuevo';

export function templateDesignNotice(): string {
  return `Se conserva: ${TEMPLATE_DESIGN_KEPT}. Se reescribe: ${TEMPLATE_DESIGN_REWRITTEN}. `
    + 'No se copia ningún dato de la plantilla anterior. '
    + 'El Word copia tu diseño; el PDF lo aproxima (sin imágenes del membrete) y solo los archivos .docx permiten copiar el diseño.';
}
