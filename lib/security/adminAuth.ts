import { checkRateLimit, extractIp } from "./rateLimit";

export function getExpectedAdminToken() {
  const token = process.env.ADMIN_TOKEN?.trim();

  if (token) return token;

  const allowDevToken = process.env.ALLOW_DEV_ADMIN_TOKEN === "true";

  if (process.env.NODE_ENV !== "production" && allowDevToken) {
    console.warn(
      "⚠️ [SECURITY WARNING] Usando token de administración por defecto ('dev-admin-token'). ADMIN_TOKEN no está configurado. Asegúrate de definir ADMIN_TOKEN y desactivar ALLOW_DEV_ADMIN_TOKEN en ambientes de staging o producción."
    );
    return "dev-admin-token";
  }

  return "";
}

export function requireAdmin(request: Request) {
  const expected = getExpectedAdminToken();
  const provided = request.headers.get("x-admin-token")?.trim();
  const allowDevToken = process.env.ALLOW_DEV_ADMIN_TOKEN === "true";
  const isDev = process.env.NODE_ENV !== "production" && allowDevToken;
  const isDevToken = isDev && provided === "dev-admin-token";

  // Check public bypasses
  const isPublicDemo = process.env.ENABLE_PUBLIC_DEMO === "true";
  const isPublicAI = process.env.ENABLE_PUBLIC_AI === "true" || isPublicDemo;
  const isPublicSearch = process.env.ENABLE_PUBLIC_SEARCH === "true" || isPublicDemo;
  const isPublicDocs = process.env.ENABLE_PUBLIC_DOCUMENTS === "true" || isPublicDemo;

  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  // Allow read-only (GET) to sources if public search or docs are enabled
  if (path.startsWith("/api/admin/sources") && method === "GET" && (isPublicSearch || isPublicDocs)) {
    return { ok: true as const };
  }

  // Endpoints públicos interactivos de consulta de usuario (chat/RAG/radar)
  const isPublicUserAiPath =
    path.startsWith("/api/ai/chat-bubble") ||
    path.startsWith("/api/rag/chat") ||
    path.startsWith("/api/rag/query") ||
    path.startsWith("/api/legal/radar") ||
    path.startsWith("/api/legal/search") ||
    path.startsWith("/api/templates/ai-fill") ||
    path.startsWith("/api/templates/ai-assist") ||
    path.startsWith("/api/templates/analyze-upload");

  // Endpoints de solo lectura (GET)
  const isReadOnlyAiPath =
    method === "GET" &&
    (path.startsWith("/api/legal-reports") ||
      path.startsWith("/api/legal/radar") ||
      path.startsWith("/api/ai/") ||
      path.startsWith("/api/rag/") ||
      path.startsWith("/api/watchlist"));

  if (isPublicAI) {
    if (isReadOnlyAiPath) {
      return { ok: true as const };
    }

    // Para peticiones POST públicas a chat/RAG, aplicar RATE LIMITING ESTRICTO por IP (máx 10 req/min)
    if (isPublicUserAiPath && method === "POST") {
      const clientIp = extractIp(request);
      const rateLimitKey = `public_ai_post:${clientIp}:${path}`;
      const limitResult = checkRateLimit(rateLimitKey, 10); // Límite estricto de 10 peticiones/minuto por IP

      if (!limitResult.ok) {
        return {
          ok: false as const,
          response: new Response(
            JSON.stringify({
              ok: false,
              error: "Límite de peticiones de IA superado en modo público de demostración. Intenta de nuevo en un minuto.",
            }),
            {
              status: 429,
              headers: { "Content-Type": "application/json", ...limitResult.headers },
            }
          ),
        };
      }

      return { ok: true as const };
    }
  }

  if (!expected || !provided || (provided !== expected && !isDevToken)) {
    return {
      ok: false as const,
      response: new Response(
        JSON.stringify({ ok: false, error: "Token de administrador no autorizado." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  return { ok: true as const };
}
