type WorkspaceRequestResource = 'analíticas' | 'perfil';

export async function describeWorkspaceHttpError(
  response: Response,
  resource: WorkspaceRequestResource,
): Promise<string> {
  const resourceLabel = resource === 'analíticas' ? 'las analíticas' : 'el perfil';

  if (response.status === 404) {
    return resource === 'analíticas'
      ? 'El servidor local devolvió HTTP 404 al solicitar las analíticas. Reinicia la aplicación y vuelve a intentarlo.'
      : `No fue posible cargar el perfil (HTTP ${response.status}).`;
  }

  if (response.status === 401 || response.status === 403) {
    return `La sesión no permite consultar ${resourceLabel} (HTTP ${response.status}).`;
  }

  if (response.status === 503) {
    const payload = await response.json().catch(() => null) as { error?: unknown } | null;
    if (payload?.error === 'WORKSPACE_UNAVAILABLE') {
      return resource === 'analíticas'
        ? 'Las métricas reales no se cargaron porque la base de datos del despacho no está disponible (HTTP 503). No se mostrarán datos de ejemplo.'
        : 'No fue posible cargar el perfil: la base de datos del despacho no está disponible (HTTP 503).';
    }
  }

  return `El servidor respondió HTTP ${response.status} al solicitar ${resourceLabel}.`;
}
