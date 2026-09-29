import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ContestacionesConfigPanel } from '@/app/machotes/components/ContestacionesConfigPanel';

describe('selector de profundidad de contestación', () => {
  it('muestra la opción profesional por defecto y explica el límite de soporte', () => {
    const html = renderToStaticMarkup(React.createElement(ContestacionesConfigPanel, {
      selectedDocumentType: 'contestacion_demanda_civil',
      onDocumentTypeChange: vi.fn(),
      documentTypeOptions: [{ value: 'contestacion_demanda_civil', label: 'Contestación civil' }],
      generationMode: 'automatic',
      onGenerationModeChange: vi.fn(),
      draftDepth: 'PROFESSIONAL_20',
      onDraftDepthChange: vi.fn(),
      userInstructions: '',
      onUserInstructionsChange: vi.fn(),
    }));

    expect(html).toContain('Profesional (18 a 24 páginas)');
    expect(html).toContain('Extensa (35 a 45 páginas)');
    expect(html).toContain('no una meta para rellenar páginas');
    expect(html).toMatch(/name="draftDepth" checked="" value="PROFESSIONAL_20"/);
    expect(html).not.toMatch(/name="draftDepth" checked="" value="EXTENSIVE_40"/);
  });
});
