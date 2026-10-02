// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceModulesView } from '@/app/machotes/components/WorkspaceModulesView';
afterEach(() => vi.unstubAllGlobals());
it('offers actual local cases as import destinations without inventing a case', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.includes('cases')
    ? { ok: true, storage: 'DESKTOP_LOCAL', cases: [{ id: '11111111-1111-4111-8111-111111111111', kind: 'LOCAL_CASE', title: 'CASO REAL DEL FIXTURE' }] }
    : { ok: true, items: [] })));
  render(<LocalImportPanel />);
  expect(await screen.findByLabelText('Expediente de destino')).toHaveTextContent('CASO REAL DEL FIXTURE');
});
it('exposes case creation when the backend explicitly declares desktop local storage', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.includes('legal-drafts') ? { ok: true, drafts: [] } : { ok: true, storage: 'DESKTOP_LOCAL', cases: [] })));
  render(<WorkspaceModulesView mode="expedientes" onNavigate={() => undefined} />);
  const create = await screen.findByRole('button', { name: 'Nuevo expediente local' });
  fireEvent.click(create);
  expect(screen.getByLabelText('Título del expediente')).toBeInTheDocument();
});
it('exposes manual agenda CRUD only for a confirmed local backend', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.includes('cases') ? { ok: true, cases: [] } : { ok: true, storage: 'DESKTOP_LOCAL', events: [] })));
  render(<WorkspaceModulesView mode="terminos" onNavigate={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Nuevo evento' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo evento' }));
  expect(screen.getByLabelText('Título del evento')).toBeInTheDocument();
});
import { LocalImportPanel } from '@/app/machotes/components/LocalImportPanel';
