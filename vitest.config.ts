import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * `npx vitest run` es seguro por defecto: no ejecuta las pruebas que llaman a proveedores reales
 * (Groq, NVIDIA, Gemini), usan externalProviderOptIn = true, leen documentos de audit/ o de clientes,
 * ni la regeneración de evidencia del catálogo. Se activan solo con LIVE_PROVIDER_TESTS=1.
 */
export const LIVE_PROVIDER_TESTS = process.env.LIVE_PROVIDER_TESTS === '1';
export const LIVE_ONLY_EXCLUDES = [
  'tests/e2e/**',
  'tests/acceptance/**',
  'tests/audit/**',
  'tests/runtime/**',
  'tests/browser/**',
  '**/*[Rr]eal*',
  '**/*[Ll]ive*',
  '**/*[Ss]moke*',
  '**/*E2E*',
  '**/*e2e*',
  '**/*.network.test.*',
  'tests/catalog/writingTypeEvidence.test.ts',
];

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.{ts,mts,tsx}'],
    exclude: ['node_modules', '.next', ...(LIVE_PROVIDER_TESTS ? [] : LIVE_ONLY_EXCLUDES)],
    // Guarda de red: sin claves de proveedores ni sockets a hosts externos, salvo LIVE_PROVIDER_TESTS=1.
    setupFiles: LIVE_PROVIDER_TESTS ? [] : ['tests/setup/offlineNetworkGuard.ts'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'tests/mocks/server-only.ts'),
    },
  },
});
