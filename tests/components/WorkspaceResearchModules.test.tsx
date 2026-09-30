// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceModulesView } from '@/app/machotes/components/WorkspaceModulesView';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('jurisprudence, library and official alerts workspaces', () => {
  it('keeps secondary jurisprudence explicitly pending official confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, status: 'PASS', results: [{
        id: 'thesis-demo', registroDigital: '2021456', rubro: 'Criterio de prueba', tipo: 'THESIS',
        source: 'CORPUS_IURIS', verificationStatus: 'REQUIRES_OFFICIAL_CONFIRMATION',
        officialUrl: 'https://sjf.scjn.gob.mx/SJFDetalle/2021456', retrievedAt: '2026-09-29T00:00:00.000Z',
      }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WorkspaceModulesView mode="jurisprudencia" onNavigate={() => undefined} />);
    fireEvent.change(screen.getByPlaceholderText('Buscar rubro, registro o texto…'), { target: { value: 'prueba ilícita' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('Criterio de prueba')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Criterio de prueba'));
    expect(screen.getByText('Estado: Requiere confirmar fuente oficial')).toBeInTheDocument();
    expect(screen.getByText('Fuente: Fuente secundaria de investigación')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/workspace/research?q=prueba%20il%C3%ADcita');
  });

  it('filters the fetched local library and retains the official publication URL', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/workspace/library') return { ok: true, json: async () => ({ ok: true, items: [
        { id: 'LAmp', title: 'Ley de Amparo', abbreviation: 'LAmp', lastReform: '2025-10-16', officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAmp.pdf' },
        { id: 'CPEUM', title: 'Constitución Política', abbreviation: 'CPEUM', officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/CPEUM.pdf' },
      ] }) };
      if (url === '/api/workspace/local-import') return { ok: true, json: async () => ({ ok: true, items: [] }) };
      if (url === '/api/operational-manual') return { ok: false, status: 503, json: async () => ({ ok: false }) };
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WorkspaceModulesView mode="biblioteca" onNavigate={() => undefined} />);
    const search = screen.getByPlaceholderText('Buscar ley, código o sigla…');
    await screen.findByText('Ley de Amparo');
    fireEvent.change(search, { target: { value: 'amparo' } });

    expect(screen.getByText('Ley de Amparo')).toBeInTheDocument();
    expect(screen.queryByText('Constitución Política')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir publicación oficial →' })).toHaveAttribute('href', 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAmp.pdf');
  });

  it('submits the alerts query to the DOF route and displays retrieved official notices', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, source: 'DOF/SIDOF', status: 'PASS', results: [{
        id: 'dof-1', rubro: 'Acuerdo de publicación', snippet: 'Aviso oficial', source: 'DOF',
        officialUrl: 'https://dof.gob.mx/nota_detalle.php?codigo=554433', verificationStatus: 'VERIFIED',
        tipo: 'OFFICIAL_AGREEMENT', retrievedAt: '2026-09-29T00:00:00.000Z',
      }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WorkspaceModulesView mode="alertas" onNavigate={() => undefined} />);
    fireEvent.change(screen.getByPlaceholderText('Filtrar por título de publicación…'), { target: { value: 'acuerdo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar publicaciones' }));

    expect(await screen.findByText('Acuerdo de publicación')).toBeInTheDocument();
    expect(screen.getByText('Fuente oficial')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir publicación oficial →' })).toHaveAttribute('href', 'https://dof.gob.mx/nota_detalle.php?codigo=554433');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/workspace/alerts?q=acuerdo', { cache: 'no-store' }));
  });
});
