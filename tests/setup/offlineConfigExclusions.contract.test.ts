/**
 * La configuración offline excluye suites de proveedor real, recorridos con
 * expedientes reales y la regeneración de evidencia, y carga la guarda de red.
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import offlineConfig from '../../vitest.offline.config';
import defaultConfig, { LIVE_ONLY_EXCLUDES } from '../../vitest.config';

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

describe('configuración por defecto: «npx vitest run» es seguro', () => {
  const defaultExcludes = (defaultConfig.test?.exclude ?? []) as string[];
  const excluded = (file: string) => defaultExcludes.some((pattern) => path.matchesGlob(file, pattern));

  it.each([
    'tests/e2e/finalGeneratorValidation.test.ts',
    'tests/audit/generatorFamilyReplay.test.ts',
    'tests/acceptance/exportUniversal.acceptance.test.ts',
    'tests/runtime/anything.test.ts',
    'tests/legal-engine/realExtendedContestacionE2E.test.ts',
    'tests/catalog/writingTypeEvidence.test.ts',
  ])('excluye %s salvo LIVE_PROVIDER_TESTS=1', (file) => {
    // Con la variable explícita puesta, la exclusión se levanta a propósito.
    if (process.env.LIVE_PROVIDER_TESTS === '1') return;
    expect(excluded(file)).toBe(true);
  });

  it('no excluye pruebas normales', () => {
    expect(excluded('tests/templates/docxMold.test.ts')).toBe(false);
  });

  it('la lista de exclusión cubre e2e, audit y acceptance', () => {
    expect(LIVE_ONLY_EXCLUDES).toEqual(expect.arrayContaining(['tests/e2e/**', 'tests/audit/**', 'tests/acceptance/**']));
  });
});
