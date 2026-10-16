import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ContestacionesConfigPanel } from '@/app/machotes/components/ContestacionesConfigPanel';
import { DEFAULT_PAGE_TARGET, PAGE_TARGET_HELP_TEXT } from '@/lib/legal-engine/pageTarget';

// Fase 3 (2026-10-13): la «profundidad» de dos opciones (Profesional 18–24 / Extensa 35–45) fue
// sustituida por el selector de extensión (5/10/20/40/personalizada), que además es visible sin
// abrir «Más opciones». Se conserva la intención: opción por defecto y aviso de que no se rellena.
describe('selector de extensión de la contestación', () => {
  const render = (pageTarget = DEFAULT_PAGE_TARGET) => renderToStaticMarkup(React.createElement(ContestacionesConfigPanel, {
    selectedDocumentType: 'contestacion_demanda_civil',
    onDocumentTypeChange: vi.fn(),
    documentTypeOptions: [{ value: 'contestacion_demanda_civil', label: 'Contestación civil' }],
    generationMode: 'automatic',
    onGenerationModeChange: vi.fn(),
    pageTarget,
    onPageTargetChange: vi.fn(),
    userInstructions: '',
    onUserInstructionsChange: vi.fn(),
  }));

  it('muestra las cinco opciones, «Detallado» por defecto y el texto de ayuda sin relleno', () => {
    const html = render();
    for (const label of ['Breve', 'Intermedio', 'Detallado', 'Extenso', 'Personalizado']) expect(html).toContain(label);
    expect(html).toContain(PAGE_TARGET_HELP_TEXT);
    // Contrato cambiado (2026-10-16): la extensión es un objetivo de generación, sin relleno ni invención.
    expect(html).toContain('objetivo de generación');
    expect(html).toContain('sin repetir ni inventar');
    expect(html).toContain('Extensión objetivo del escrito');
    expect(html).toMatch(/checked=""[^>]*value="DETALLADO"|value="DETALLADO"[^>]*checked=""/);
    expect(html).not.toMatch(/checked=""[^>]*value="EXTENSO"|value="EXTENSO"[^>]*checked=""/);
    expect(html).not.toContain('name="draftDepth"');
  });

  it('el selector está fuera de «Más opciones» (visible antes de Generar)', () => {
    const html = render();
    expect(html.indexOf('data-testid="page-target-selector"')).toBeGreaterThan(-1);
    // «Más opciones» ahora abre un panel superpuesto; el selector queda antes del botón que lo abre.
    expect(html.indexOf('data-testid="contestaciones-more-options"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-testid="page-target-selector"')).toBeLessThan(html.indexOf('data-testid="contestaciones-more-options"'));
  });

  it('con «Personalizado» aparece un campo numérico acotado y accesible', () => {
    const html = render({ preset: 'PERSONALIZADO', pages: 33 });
    expect(html).toMatch(/type="number"[^>]*min="2"[^>]*max="60"/);
    expect(html).toContain('value="33"');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-describedby');
  });
});
