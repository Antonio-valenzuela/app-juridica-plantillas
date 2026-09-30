// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({usePathname:()=>'/machotes',useSearchParams:()=>new URLSearchParams('tab=inicio')}));
vi.mock('@/context/LegalWorkspaceContext', () => ({useLegalWorkspaceContext:()=>({activeCase:null})}));
import AppShell from '@/components/layout/AppShell';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mount() {
  vi.stubGlobal('fetch',vi.fn(() => new Promise<Response>(() => {})));
  render(<AppShell><div>Contenido de prueba</div></AppShell>);
}
it('does not advertise a global search or keyboard shortcut without an implemented search workflow', () => {
  mount();
  expect(screen.queryByRole('searchbox',{name:'Buscar expedientes, documentos y plantillas'})).not.toBeInTheDocument();
  expect(screen.queryByText('Ctrl K')).not.toBeInTheDocument();
});
it('has real destinations for the 12 navigation items and opens/closes the mobile menu', () => {
  mount();
  const destinations = [
    ['Inicio','inicio'],['Motor Jurídico','universal'],['Escritos Iniciales','initial_writings'],['Contestaciones','responses_resources'],
    ['Mis Plantillas','my-templates'],['Expedientes','expedientes'],['Cómputo de Términos','terminos'],['Jurisprudencia SCJN','jurisprudencia'],
    ['Biblioteca','biblioteca'],['Alertas DOF y Boletín','alertas'],['Configuración','configuracion'],['Ayuda','ayuda'],
  ];
  for (const [name, tab] of destinations) expect(screen.getByRole('link',{name})).toHaveAttribute('href',`/machotes?tab=${tab}`);
  fireEvent.click(screen.getByRole('button',{name:'Abrir menú'}));
  expect(screen.getByRole('complementary')).toHaveClass('is-mobile-open');
  fireEvent.keyDown(window,{key:'Escape'});
  expect(screen.getByRole('complementary')).not.toHaveClass('is-mobile-open');
});
