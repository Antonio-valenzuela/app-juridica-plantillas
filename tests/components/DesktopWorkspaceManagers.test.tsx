// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
it('escritorio: «Abrir ficha» abre el panel lateral con los datos y «Editar expediente…»; el formulario de edición vive dentro del panel', async () => {
  const localCase = { id: '22222222-2222-4222-8222-222222222222', kind: 'LOCAL_CASE', title: 'CASO LOCAL DEL FIXTURE', expediente: '45/2026', jurisdiction: 'Jalisco', sourceCount: 2, updatedAt: '2026-10-17T00:00:00.000Z', draftIds: [] };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.includes('legal-drafts') ? { ok: true, drafts: [] } : { ok: true, storage: 'DESKTOP_LOCAL', cases: [localCase] })));
  render(<WorkspaceModulesView mode="expedientes" onNavigate={() => undefined} />);
  const open = await screen.findByRole('button', { name: 'Abrir ficha' });
  open.focus();
  fireEvent.click(open);
  const dialog = screen.getByRole('dialog', { name: 'CASO LOCAL DEL FIXTURE' });
  expect(dialog).toHaveTextContent(`ID real: ${localCase.id}`);
  expect(dialog).toHaveTextContent('Expediente: 45/2026 · Jurisdicción: Jalisco');
  expect(dialog).toHaveTextContent('Fuentes asociadas: 2');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Editar expediente y asociar documentos' }));
  expect(within(dialog).getByLabelText('Título del expediente')).toHaveValue('CASO LOCAL DEL FIXTURE');
  // Fuera del panel solo queda la creación, sin un segundo botón de edición.
  expect(screen.getAllByRole('button', { name: 'Editar expediente y asociar documentos' })).toHaveLength(1);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(open).toHaveFocus();
});
it('escritorio: «Nuevo expediente local» abre su propio panel lateral y Esc lo cierra devolviendo el foco', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.includes('legal-drafts') ? { ok: true, drafts: [] } : { ok: true, storage: 'DESKTOP_LOCAL', cases: [] })));
  render(<WorkspaceModulesView mode="expedientes" onNavigate={() => undefined} />);
  const create = await screen.findByRole('button', { name: 'Nuevo expediente local' });
  create.focus();
  fireEvent.click(create);
  const dialog = screen.getByRole('dialog', { name: 'Nuevo expediente local' });
  expect(within(dialog).getByLabelText('Título del expediente')).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByTestId('detail-drawer-backdrop'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(create).toHaveFocus();
});
it('web: la ficha abre en el panel lateral sin controles de escritorio', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, cases: [{ id: 'cweb1', title: 'ASUNTO WEB', expediente: '800/2024', jurisdiction: 'federal', sourceCount: 1, updatedAt: '2026-10-17T00:00:00.000Z' }] })));
  render(<WorkspaceModulesView mode="expedientes" onNavigate={() => undefined} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha' }));
  const dialog = screen.getByRole('dialog', { name: 'ASUNTO WEB' });
  expect(dialog).toHaveTextContent('ID real: cweb1');
  expect(screen.queryByRole('button', { name: 'Nuevo expediente local' })).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
