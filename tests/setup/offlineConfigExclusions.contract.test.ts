/**
 * La configuración offline excluye suites de proveedor real, recorridos con
 * expedientes reales y la regeneración de evidencia, y carga la guarda de red.
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import offlineConfig from '../../vitest.offline.config';

describe('guarda offline: exclusiones de la configuración', () => {
  const excludes = (offlineConfig.test?.exclude ?? []) as string[];
  const excluded = (file: string) => excludes.some((pattern) => path.matchesGlob(file, pattern));

  it.each([
    'tests/e2e/smoke_test_preproduction.test.ts',
    'tests/ai/nvidiaReal.test.ts',
    'tests/ai/providerLive.test.ts',
    'tests/runtime/anything.test.ts',
    'tests/acceptance/anything.test.ts',
    'tests/audit/generatorFamilyReplay.test.ts',
    'tests/browser/appealDirectFlow.spec.ts',
    'tests/ai/providers.network.test.ts',
    'tests/catalog/writingTypeEvidence.test.ts',
  ])('excluye %s', (file) => {
    expect(excluded(file)).toBe(true);
  });

  it('carga la guarda como setup antes de cada archivo de prueba', () => {
    expect(offlineConfig.test?.setupFiles).toContain('tests/setup/offlineNetworkGuard.ts');
  });
});
