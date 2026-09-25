type ApiErrorPayload = {
  errorCode?: unknown;
  message?: unknown;
  friendlyMessage?: unknown;
  error?: unknown;
};

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  GENERATION_CAPACITY_UNAVAILABLE: 'La capacidad de generación no está disponible.',
  GENERATION_FAILED: 'La generación no pudo completarse. Revisa los datos e inténtalo de nuevo.',
  GENERATION_TIMEOUT: 'La generación tardó demasiado y quedó pendiente de revisión.',
  NEEDS_SOURCE_REVIEW: 'La fuente requiere revisión de extracción u OCR antes de generar.',
  JOB_NOT_FOUND: 'La generación ya no está disponible. Inicia una nueva solicitud.',
  CASES_LOAD_FAILED: 'No fue posible cargar los asuntos persistidos.',
  DASHBOARD_LOAD_FAILED: 'No fue posible cargar las métricas del despacho.',
  REVIEW_APPLICATION_FAILED: 'No fue posible aplicar las respuestas de revisión.',
  SECTION_GENERATION_FAILED: 'No fue posible generar el apartado.',
  DOCX_EXPORT_FAILED: 'No se pudo crear el archivo DOCX. El borrador se conserva para revisión.',
  PDF_EXPORT_FAILED: 'No fue posible exportar el documento PDF.',
  UPLOAD_PROCESSING_FAILED: 'No fue posible procesar el archivo.',
};

export function getSafeApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;

  const candidate = payload as ApiErrorPayload;
  if (typeof candidate.errorCode === 'string') {
    return SAFE_ERROR_MESSAGES[candidate.errorCode] || fallback;
  }

  return fallback;
}
