// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceModulesView } from '@/app/machotes/components/WorkspaceModulesView';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Workspace settings profile feedback', () => {
  it('shows an accessible failure and keeps the loaded profile when saving loses the server', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/workspace/lawyer-profile' && init?.method === 'PUT') {
        throw new TypeError('Network unavailable');
      }
      if (url === '/api/workspace/lawyer-profile') {
        return { ok: true, json: async () => ({ ok: true, isDefault: false, profile: { lawyerName: 'Abogado local' } }) };
      }
      if (url.startsWith('/api/workspace/analytics')) {
        return { ok: false, status: 503, json: async () => ({ ok: false, error: 'WORKSPACE_UNAVAILABLE' }) };
      }
      if (url === '/api/operational-manual') {
        return { ok: false, status: 503, json: async () => ({ ok: false }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WorkspaceModulesView mode="configuracion" onNavigate={() => undefined} />);

    const lawyerName = await screen.findByDisplayValue('Abogado local');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));

    const saveError = await screen.findByText('No fue posible guardar el perfil (sin respuesta del servidor).');
    expect(saveError.closest('[role="alert"]')).not.toBeNull();
    expect(lawyerName).toHaveValue('Abogado local');
    expect(fetchMock).toHaveBeenCalledWith('/api/workspace/lawyer-profile', expect.objectContaining({ method: 'PUT' }));
  });
});
