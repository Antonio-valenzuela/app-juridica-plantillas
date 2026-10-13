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
function stubViewport(narrow: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: narrow, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }));
}
it('has real destinations for the 12 navigation items and opens/closes the mobile menu', () => {
  stubViewport(true);
  mount();
  const destinations = [
    ['Inicio','inicio'],['Motor Jurídico','universal'],['Escritos Iniciales','initial_writings'],['Contestaciones','responses_resources'],
    ['Mis Plantillas','my-templates'],['Expedientes','expedientes'],['Cómputo de Términos','terminos'],['Jurisprudencia SCJN','jurisprudencia'],
    ['Biblioteca','biblioteca'],['Alertas DOF y Boletín','alertas'],['Configuración','configuracion'],['Ayuda','ayuda'],
  ];
  for (const [name, tab] of destinations) expect(screen.getByRole('link',{name})).toHaveAttribute('href',`/machotes?tab=${tab}`);
  expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('button',{name:'Mostrar menú de navegación'}));
  expect(screen.getByRole('complementary')).toHaveClass('is-mobile-open');
  fireEvent.keyDown(window,{key:'Escape'});
  expect(screen.getByRole('complementary')).not.toHaveClass('is-mobile-open');
});
it('desktop: el botón de menú siempre está disponible y colapsa/expande la navegación para ampliar el espacio de trabajo', () => {
  stubViewport(false);
  window.localStorage.removeItem('lex.sidebar.collapsed');
  mount();
  const toggle = screen.getByRole('button', { name: 'Ocultar menú de navegación' });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(toggle).toHaveAttribute('aria-controls', 'lex-sidebar');
  fireEvent.click(toggle);
  expect(document.documentElement.dataset.sidebar).toBe('collapsed');
  expect(screen.getByRole('button', { name: 'Mostrar menú de navegación' })).toHaveAttribute('aria-expanded', 'false');
  expect(window.localStorage.getItem('lex.sidebar.collapsed')).toBe('1');
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar menú de navegación' }));
  expect(document.documentElement.dataset.sidebar).toBe('expanded');
  expect(window.localStorage.getItem('lex.sidebar.collapsed')).toBe('0');
});
it('desktop: recuerda la preferencia de menú oculto entre visitas', () => {
  stubViewport(false);
  window.localStorage.setItem('lex.sidebar.collapsed', '1');
  mount();
  expect(screen.getByRole('button', { name: 'Mostrar menú de navegación' })).toBeInTheDocument();
  expect(document.documentElement.dataset.sidebar).toBe('collapsed');
  window.localStorage.removeItem('lex.sidebar.collapsed');
});
