type ApiErrorPayload = {
  errorCode?: unknown;
  code?: unknown;
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
  DRAFT_PERSISTENCE_REQUIRED: 'No se pudo guardar el borrador; la exportación se detuvo y el archivo no fue solicitado. Reintenta cuando el guardado esté disponible.',
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

/** Presentation only: never show raw exception text, metadata, paths or client data. */
export function getGenerationErrorPresentation(payload: unknown) {
  const candidate = payload && typeof payload === 'object' ? payload as ApiErrorPayload : {};
  const suppliedCode = typeof candidate.errorCode === 'string' ? candidate.errorCode : typeof candidate.code === 'string' ? candidate.code : '';
  const messageCode = typeof candidate.message === 'string' ? candidate.message.match(/^([A-Z][A-Z0-9_]+)(?=[:\s]|$)/)?.[1] || candidate.message.match(/\bCódigo: ([A-Z][A-Z0-9_]+)\./)?.[1] || '' : '';
  const rawCode = suppliedCode || messageCode;
  const safeCode = /^(?:NEEDS_SOURCE_REVIEW|NEEDS_USER_INPUT|MATTER_DOCUMENT_MISMATCH|SOURCE_DOCUMENT_INCOMPATIBLE|SECTION_GENERATION_FAILED|GENERATION_FAILED|GENERATION_TIMEOUT|PROVIDER_[A-Z0-9_]{1,50}|LEGAL_ADMISSION_[A-Z0-9_]{1,50})$/.test(rawCode) ? rawCode : 'GENERATION_FAILED';
  let category = 'Error interno';
  let cause = 'No pudo completarse la generación. Conserva el borrador y comparte el código con soporte antes de reintentar.';
  if (safeCode === 'NEEDS_SOURCE_REVIEW') { category = 'Problema con el documento subido'; cause = 'Revisa y confirma el texto extraído u OCR antes de generar.'; }
  else if (safeCode === 'SOURCE_DOCUMENT_INCOMPATIBLE') { category = 'Problema con el documento subido'; cause = 'El documento no corresponde al tipo de escrito seleccionado. Si parece una sentencia, una contestación requiere la demanda: sube la demanda o cambia el tipo de escrito.'; }
  else if (safeCode === 'NEEDS_USER_INPUT' || safeCode.startsWith('LEGAL_ADMISSION_')) { category = 'Falta información por confirmar'; cause = 'Revisa los datos y requisitos pendientes con el abogado. No se aprobará contenido sin soporte.'; }
  else if (safeCode.startsWith('PROVIDER_')) { category = 'Proveedor de IA no disponible'; cause = 'No se obtuvo una respuesta válida del proveedor. Conserva tus datos y reintenta cuando el servicio esté disponible.'; }
  else if (safeCode === 'MATTER_DOCUMENT_MISMATCH') { cause = 'El contexto y el documento no pertenecen al mismo contrato de generación. Conserva tus datos y comparte este código con soporte.'; }
  return { code: safeCode, category, cause, message: `${category}: ${cause} Código: ${safeCode}.`, detail: safeCode };
}
