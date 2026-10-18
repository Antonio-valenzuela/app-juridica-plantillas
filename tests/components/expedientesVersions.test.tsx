// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceModulesView } from '@/app/machotes/components/WorkspaceModulesView';
import { caseWritingName, groupCaseVersions } from '@/app/machotes/lib/caseVersions';
import type { WorkspaceCaseSummary } from '@/lib/workspace/cases';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const base = { jurisdiction: 'federal', status: 'DRAFT', sourceCount: 1, actor: null, counterparty: null };
const draft = (id: string, title: string, expediente: string | null, updatedAt: string, matter = 'Constitucional_amparo'): WorkspaceCaseSummary =>
  ({ ...base, id, title, expediente, matter, createdAt: updatedAt, updatedAt });

const cases = [
  draft('rev-3', 'Recurso de Revisión en Amparo Directo - 16/10/2026', '999/2099', '2026-10-17T03:48:58.801Z'),
  draft('rev-2', 'Recurso de Revisión en Amparo Directo - 16/10/2026', '999/2099', '2026-10-17T03:47:48.878Z'),
  draft('otro', 'Contestación de Demanda Civil - 16/10/2026', '994/2099', '2026-10-16T10:00:00.000Z', 'Civil'),
  draft('rev-1', 'Recurso de Revisión en Amparo Directo - 14/10/2026', '999/2099', '2026-10-14T16:10:40.322Z'),
  draft('sin-exp-a', 'Contestación de Demanda Laboral - 16/10/2026', null, '2026-10-16T09:00:00.000Z', 'Laboral'),
  draft('sin-exp-b', 'Contestación de Demanda Laboral - 16/10/2026', null, '2026-10-16T08:00:00.000Z', 'Laboral'),
];

describe('groupCaseVersions (solo presentación)', () => {
  it('quita la fecha de generación del nombre del escrito', () => {
    expect(caseWritingName('Recurso de Revisión en Amparo Directo - 14/10/2026')).toBe('Recurso de Revisión en Amparo Directo');
  });

  it('agrupa mismo escrito + expediente + materia, la más reciente al frente, sin perder ni alterar ningún borrador', () => {
    const snapshot = JSON.stringify(cases);
    const groups = groupCaseVersions(cases);
    const amparo = groups.find((group) => group.latest.expediente === '999/2099')!;
    expect(amparo.versions.map((item) => item.id)).toEqual(['rev-3', 'rev-2', 'rev-1']);
    expect(amparo.latest.id).toBe('rev-3');
    expect(groups.flatMap((group) => group.versions).map((item) => item.id).sort()).toEqual(cases.map((item) => item.id).sort());
    expect(JSON.stringify(cases)).toBe(snapshot);
  });

  it('nunca agrupa borradores sin expediente ni expedientes locales', () => {
    const local = { ...draft('local-1', 'Caso local', '45/2026', '2026-10-17T00:00:00.000Z'), kind: 'LOCAL_CASE' as const };
    const local2 = { ...local, id: 'local-2' };
    const groups = groupCaseVersions([...cases, local, local2]);
    expect(groups.filter((group) => group.latest.expediente === null)).toHaveLength(2);
    expect(groups.filter((group) => group.latest.kind === 'LOCAL_CASE')).toHaveLength(2);
  });
});

describe('Expedientes: fila agrupada con «N versiones»', () => {
  function renderView(onOpenCase = vi.fn()) {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, cases })));
    render(<WorkspaceModulesView mode="expedientes" onNavigate={() => undefined} onOpenCase={onOpenCase} />);
    return onOpenCase;
  }

  it('muestra una sola fila por escrito y expediente con el número de versiones', async () => {
    renderView();
    await screen.findByText('3 versiones');
    expect(screen.getAllByRole('row', { name: /Recurso de Revisión en Amparo Directo/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Abrir ficha' })).toHaveLength(4);
    expect(screen.getByText('6 asuntos persistidos')).toBeInTheDocument();
  });

  it('la ficha lista las versiones con fecha y permite ver o abrir cualquiera', async () => {
    const onOpenCase = renderView();
    await screen.findByText('3 versiones');
    fireEvent.click(within(screen.getByRole('row', { name: /Recurso de Revisión/ })).getByRole('button', { name: 'Abrir ficha' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('ID real: rev-3');
    const list = within(dialog).getByRole('region', { name: 'Versiones del borrador' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('más reciente');
    expect(items[0]).toHaveAttribute('aria-current', 'true');

    // Ver la ficha de la versión más antigua sin cerrar el panel.
    fireEvent.click(within(items[2]).getByRole('button', { name: /^Ver ficha de la versión del/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('ID real: rev-1');

    // Abrir una versión concreta entrega exactamente ese borrador.
    const again = within(screen.getByRole('region', { name: 'Versiones del borrador' })).getAllByRole('listitem');
    fireEvent.click(within(again[1]).getByRole('button', { name: /^Abrir la versión del/ }));
    expect(onOpenCase).toHaveBeenCalledWith(expect.objectContaining({ id: 'rev-2' }));
  });

  it('un escrito con una sola versión no muestra contador ni lista de versiones', async () => {
    renderView();
    await screen.findByText('3 versiones');
    fireEvent.click(within(screen.getByRole('row', { name: /Contestación de Demanda Civil/ })).getByRole('button', { name: 'Abrir ficha' }));
    expect(within(screen.getByRole('dialog')).queryByRole('region', { name: 'Versiones del borrador' })).not.toBeInTheDocument();
  });
});
