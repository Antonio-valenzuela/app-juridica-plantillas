// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsPanel } from '@/app/machotes/components/AnalyticsPanel';

const payload = {
  ok: true,
  rangeDays: 30,
  totals: { total: 5, documentsGenerated: 4, completed: 2, needsReview: 2, failed: 1, cancelled: 0, averageGenerationMs: 12500, generatedPages: 69 },
  daily: [{ date: '2026-09-23', count: 5 }],
  statuses: [{ status: 'COMPLETED', count: 2 }, { status: 'NEEDS_REVIEW', count: 2 }, { status: 'FAILED', count: 1 }],
  byType: [{ label: 'Apelación civil', count: 5 }],
  byMatter: [{ label: 'Civil', count: 5 }],
  extension: { achieved: 1, unmet: 1, withoutTarget: 3 },
  quality: { qualityGatePass: 3, qualityGateFail: 2, validationPass: 3, validationFail: 2 },
  recent: [{ status: 'NEEDS_REVIEW', documentType: 'apelacion_civil', matter: 'Civil', targetPages: 40, actualPages: 27, extensionTargetUnmet: true }],
  advanced: { ocrSuccessRate: null, extractionFailures: 0, providerAttempts: 0, providerFallbacks: 0, timeoutCount: 0, httpErrors: 0, averageStageDurationsMs: {} },
};

describe('AnalyticsPanel', () => {
  it('renders real KPI/chart values and distinguishes NEEDS_REVIEW from FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    render(<AnalyticsPanel />);

    expect(screen.getByText('Cargando analíticas…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Documentos generados')).toBeInTheDocument());
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Requieren revisión')).toBeInTheDocument();
    expect(screen.getByText('Fallidos')).toBeInTheDocument();
    expect(screen.getByText('Objetivo de extensión no alcanzado')).toBeInTheDocument();
    expect(screen.queryByText('Falló la generación')).not.toBeInTheDocument();
    expect(screen.getByTestId('analytics-daily-bar-2026-09-23')).toHaveAttribute('aria-label', '2026-09-23: 5 generaciones');
  });

  it('changes between 7, 30 and 90 days using the requested range', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal('fetch', fetchMock);
    render(<AnalyticsPanel />);
    await waitFor(() => expect(screen.getByText('Documentos generados')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '7 días' }));
    fireEvent.click(screen.getByRole('button', { name: '90 días' }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/workspace/analytics?rangeDays=90', { cache: 'no-store' }));
  });

  it('renders honest empty and error states without fake metrics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, rangeDays: 30, totals: { total: 0 }, daily: [], statuses: [], byType: [], byMatter: [], extension: { achieved: 0, unmet: 0, withoutTarget: 0 }, quality: { qualityGatePass: 0, qualityGateFail: 0, validationPass: 0, validationFail: 0 }, recent: [], advanced: {} }) }));
    render(<AnalyticsPanel />);
    await waitFor(() => expect(screen.getByText('Aún no hay suficiente actividad.')).toBeInTheDocument());
    expect(screen.queryByText('42%')).not.toBeInTheDocument();

    cleanup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    render(<AnalyticsPanel />);
    await waitFor(() => expect(screen.getByText('No fue posible cargar las analíticas.')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByText('No fue posible cargar las analíticas.')).toBeInTheDocument());
    expect(screen.queryByText('Cargando analíticas…')).not.toBeInTheDocument();
  });

  it('identifies an unavailable analytics route without trying to parse its HTML 404 page', async () => {
    const json = vi.fn().mockRejectedValue(new Error('Unexpected token <'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json }));

    render(<AnalyticsPanel />);

    expect(await screen.findByText('El servidor local devolvió HTTP 404 al solicitar las analíticas. Reinicia la aplicación y vuelve a intentarlo.')).toBeInTheDocument();
    expect(json).not.toHaveBeenCalled();
  });

  it('explains that real metrics are unavailable when workspace persistence is disconnected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ ok: false, error: 'WORKSPACE_UNAVAILABLE' }),
    }));

    render(<AnalyticsPanel />);

    expect(await screen.findByText('Las métricas reales no se cargaron porque la base de datos del despacho no está disponible (HTTP 503). No se mostrarán datos de ejemplo.')).toBeInTheDocument();
  });

  it('describes an expired or unauthorized session in grammatically correct Spanish', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: vi.fn() }));

    render(<AnalyticsPanel />);

    expect(await screen.findByText('La sesión no permite consultar las analíticas (HTTP 401).')).toBeInTheDocument();
  });
});
