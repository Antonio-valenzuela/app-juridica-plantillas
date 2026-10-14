// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WorkspaceModulesView } from '@/app/machotes/components/WorkspaceModulesView';

const manual = { manifest: { version: '1.0', detectedPages: 212, sourceHash: 'test-full-sha', importedAt: '2026-09-29', status: 'READY', active: true }, distribution: { civil: 10 }, sections: ['Introducción'] };
function responses(active = true) {
  vi.stubGlobal('fetch', async (url: string) => new Response(JSON.stringify(
    url === '/api/operational-manual' ? { ...manual, manifest: { ...manual.manifest, active } } :
    url === '/api/workspace/lawyer-profile' ? { ok: true, profile: {}, isDefault: true } : { ok: false }
  ), { headers: { 'content-type': 'application/json' } }));
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Configuración: guía operativa compacta', () => {
  it('prioriza Analíticas y Perfil antes de la documentación interna sin metadata invasiva', async () => {
    responses();
    render(<WorkspaceModulesView mode="configuracion" onNavigate={() => undefined} />);
    const resources = await screen.findByRole('region', { name: 'Recursos internos' });
    expect(await within(resources).findByText('Versión 1.0 · Activa')).toBeInTheDocument();
    const analytics = screen.getByRole('heading', { name: 'Analíticas' });
    const profile = screen.getByRole('heading', { name: 'Perfil del despacho' });
    expect(analytics.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(profile.compareDocumentPosition(resources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Guía Operativa LEX PLANTILLAS' })).not.toBeInTheDocument();
    expect(resources).not.toHaveTextContent(/SHA|212|Importada|Materias|Secciones identificadas/);
    expect(within(resources).getByRole('link', { name: 'Ver documento' })).toHaveAttribute('href', '/api/operational-manual/original');
  });

  it('no anuncia Activa cuando el manifiesto está inactivo', async () => {
    responses(false);
    render(<WorkspaceModulesView mode="configuracion" onNavigate={() => undefined} />);
    expect(await screen.findByText('Versión 1.0 · Inactiva')).toBeInTheDocument();
  });

  it('en Biblioteca la guía es una línea discreta con su enlace original, sin ficha técnica', async () => {
    responses();
    render(<WorkspaceModulesView mode="biblioteca" onNavigate={() => undefined} />);
    expect(await screen.findByText(/Metodología interna · Versión/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Guía operativa del despacho' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver documento' })).toHaveAttribute('href', '/api/operational-manual/original');
    expect(screen.queryByText(/SHA-256/)).toBeNull();
  });
});
