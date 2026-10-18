import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

/**
 * Suite OFFLINE: todo lo que puede ejecutarse sin proveedores externos ni cuotas.
 *
 *   npx vitest run --config vitest.offline.config.ts
 *
 * Excluye las suites que llaman a proveedores reales o leen expedientes reales
 * (e2e, acceptance, runtime, audit, browser y archivos cuyo nombre contiene
 * Real, Live, Smoke o E2E, y las pruebas *.network.test.* que consultan servicios reales)
 * y la regeneración de evidencia del catálogo, que reescribe
 * lib/catalog/writingTypeEvidence.generated.ts y se ejecuta deliberadamente.
 * La guarda de red bloquea cualquier fetch no local que quede.
 */
export default mergeConfig(base, defineConfig({
  test: {
    // La config base ya instala la guarda; aquí se asegura incluso con LIVE_PROVIDER_TESTS=1.
    setupFiles: process.env.LIVE_PROVIDER_TESTS === '1' ? ['tests/setup/offlineNetworkGuard.ts'] : [],
    exclude: [
      'tests/e2e/**',
      'tests/acceptance/**',
      'tests/runtime/**',
      'tests/audit/**',
      'tests/browser/**',
      '**/*[Rr]eal*',
      '**/*[Ll]ive*',
      '**/*[Ss]moke*',
      '**/*E2E*',
      '**/*e2e*',
      '**/*.network.test.*',
      'tests/catalog/writingTypeEvidence.test.ts',
    ],
  },
}));
