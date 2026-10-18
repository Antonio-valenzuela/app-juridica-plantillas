/**
 * Compuerta de las pruebas que llaman a proveedores reales (Groq, NVIDIA, Gemini), usan
 * externalProviderOptIn = true o leen documentos de audit/ o de clientes.
 *
 * Se saltan (skip) salvo que se pida de forma explícita:
 *
 *   LIVE_PROVIDER_TESTS=1 npx vitest run <archivo>
 *
 * También se acepta la variable histórica RUN_LIVE_PROVIDER_TESTS=true. Con la variable puesta,
 * esas pruebas pueden enviar texto de expedientes a proveedores externos: úsala solo a propósito.
 */
export const LIVE_PROVIDER_TESTS =
  process.env.LIVE_PROVIDER_TESTS === '1' || process.env.RUN_LIVE_PROVIDER_TESTS === 'true';
