/**
 * QA-F1: mapea cada dato esencial del intake de Escritos Iniciales al paso del asistente donde se captura,
 * para llevar al abogado al campo exacto que falta en lugar de solo avisarle con un toast.
 */
export function initialWritingStepForMissingEssential(missing: readonly string[]): number {
  if (missing.some((item) => /tipo de escrito|materia o asunto/i.test(item))) return 1;
  if (missing.some((item) => /objetivo o pretensi/i.test(item))) return 4;
  return 1;
}
