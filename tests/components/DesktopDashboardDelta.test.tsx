// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceModulesView } from '@/app/machotes/components/WorkspaceModulesView';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const dashboard = { ok: true, source: 'DESKTOP_LOCAL', stats: { generated: 0, review: 1, failed: 0, totalDocuments: 1, pendingReview: 1, averageGenerationMs: 1000 }, daily: [{ date: '2026-10-01', count: 1 }], recentDocuments: [], health: { status: 'operativo', persistedDocuments: 1, persistedJobs: 1 } };
function backend(value = dashboard) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.includes('dashboard') ? value : url.includes('providers') ? { providers: [] } : { components: { database: { status: 'NOT_CONFIGURED' } } })));
}
it('shows available local storage without suggesting a remote database repair', async () => {
  backend(); render(<WorkspaceModulesView mode="inicio" onNavigate={() => undefined} />);
  expect(await screen.findByText('Almacenamiento local disponible')).toBeVisible();
  expect(screen.queryByText('Base de datos')).not.toBeInTheDocument();
});
it('gives a measured dashboard activity bar a non-collapsing height', async () => {
  backend(); render(<WorkspaceModulesView mode="inicio" onNavigate={() => undefined} />);
  const date = await screen.findByTitle('2026-10-01: 1');
  expect((date.firstElementChild as HTMLElement).style.height).toMatch(/^[1-9]\d*px$/);
});
it('does not give zero activity days a positive bar', async () => {
  backend({ ...dashboard, daily: [{ date: '2026-10-01', count: 1 }, { date: '2026-09-30', count: 0 }] });
  render(<WorkspaceModulesView mode="inicio" onNavigate={() => undefined} />);
  const date = await screen.findByTitle('2026-09-30: 0');
  expect((date.firstElementChild as HTMLElement).style.height).toBe('0px');
});
it('distinguishes empty local data from unavailable storage', async () => {
  backend({ ...dashboard, stats: { ...dashboard.stats, totalDocuments: 0 }, daily: [], health: { ...dashboard.health, persistedDocuments: 0, persistedJobs: 0 } });
  render(<WorkspaceModulesView mode="inicio" onNavigate={() => undefined} />);
  expect(await screen.findByText('Almacenamiento local disponible')).toBeVisible();
  expect(await screen.findByText(/Datos vacíos/)).toBeVisible();
});
