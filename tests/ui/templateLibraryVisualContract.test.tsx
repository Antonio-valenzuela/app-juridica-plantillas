import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TemplateLibraryManager } from '@/app/machotes/components/TemplateLibraryManager';

describe('Mis Plantillas — acciones visibles y accesibles', () => {
  it('conserva las acciones reales con etiquetas claras y sin glifos decorativos', () => {
    const markup = renderToStaticMarkup(React.createElement(TemplateLibraryManager, {
      templates: [{
        id: 'tpl-demo',
        name: 'Contestación civil de prueba',
        category: 'Civil',
        version: 1,
        updatedAt: '2026-09-30T12:00:00.000Z',
        description: 'Plantilla de prueba.',
        content: 'Contenido de prueba.',
      }],
      onUseTemplate: vi.fn(),
      onEditTemplate: vi.fn(),
      onDeleteTemplate: vi.fn(),
      onCreateNewTemplate: vi.fn(),
    }));

    expect(markup.includes('Usar plantilla')).toBe(true);
    expect(markup.includes('Editar Contestación civil de prueba')).toBe(true);
    expect(markup.includes('Eliminar Contestación civil de prueba')).toBe(true);
    expect(/[▤▥◷⚡✎🗑⌕]/u.test(markup)).toBe(false);
  });
});
