// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceModulesView } from '@/app/machotes/components/WorkspaceModulesView';

describe('WorkspaceSettings', () => {
  it('shows the HTTP failure for the persisted lawyer profile instead of hiding it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockRejectedValue(new Error('Unexpected token <')),
    }));

    render(<WorkspaceModulesView mode="configuracion" onNavigate={() => undefined} />);

    expect(await screen.findByText('No fue posible cargar el perfil (HTTP 404).')).toBeInTheDocument();
  });

  it('explains that the persisted profile is unavailable when the workspace database is disconnected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ ok: false, error: 'WORKSPACE_UNAVAILABLE' }),
    }));

    render(<WorkspaceModulesView mode="configuracion" onNavigate={() => undefined} />);

    expect(await screen.findByText('No fue posible cargar el perfil: la base de datos del despacho no está disponible (HTTP 503).')).toBeInTheDocument();
  });
});
