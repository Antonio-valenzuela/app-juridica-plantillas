import { defineConfig } from 'vitest/config';
import base from './vitest.config';

/**
 * Regeneración DELIBERADA de la evidencia funcional del catálogo:
 *
 *   npx vitest run --config vitest.evidence.config.ts
 *
 * Reescribe lib/catalog/writingTypeEvidence.generated.ts comparando contra el
 * snapshot anterior. Usa la guarda offline (sin claves de proveedores, sin red).
 *
 * No usa mergeConfig: mergeConfig CONCATENA los arreglos y `include` terminaría
 * sumando tests/**, con lo que se ejecutaría la suite completa (incluidas las
 * pruebas en vivo). Aquí `include` se reemplaza explícitamente.
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tests/catalog/writingTypeEvidence.test.ts'],
    setupFiles: ['tests/setup/offlineNetworkGuard.ts'],
  },
});
