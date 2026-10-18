import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración de la Fase 3 (flujo de Contestaciones y recursos).
 * Apunta a un servidor AISLADO (copia del árbol de trabajo, sin claves de proveedores y con base temporal):
 *   E2E_BASE_URL=http://localhost:3201 npx playwright test -c playwright.phase3.config.ts
 */
export default defineConfig({
  testDir: './tests/browser',
  testMatch: /phase3.*\.spec\.ts/,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: './test-results/phase3',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3201',
    channel: 'chrome',
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'off',
    video: 'off',
  },
});
