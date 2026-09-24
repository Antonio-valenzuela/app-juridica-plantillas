import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';
import { GenerationStatusBar } from '@/app/machotes/components/GenerationStatusBar';
import {
  buildWorkspacePageModel,
  canSwitchWorkspaceMode,
  deriveGenerationDisplayPercentage,
} from '@/lib/legal-engine/generationUi';

describe('generation runtime regressions', () => {
  it('never reports 100% while the generation job is still processing', () => {
    expect(deriveGenerationDisplayPercentage({ status: 'processing', percentage: 100, completed: 17, total: 17 })).toBe(99);
    expect(deriveGenerationDisplayPercentage({ status: 'processing', percentage: 35, completed: 17, total: 17 })).toBe(35);
    expect(deriveGenerationDisplayPercentage({ status: 'completed', percentage: 100, completed: 17, total: 17 })).toBe(100);
  });

  it('keeps the visible item count aligned with an in-flight percentage', () => {
    const markup = renderToStaticMarkup(React.createElement(GenerationStatusBar, {
      job: { status: 'processing', percentage: 99, completed: 17, total: 17 },
    }));
    expect(markup).toContain('99%');
    expect(markup).toContain('16/17');
    expect(markup).not.toContain('17/17');
  });

  it('keeps the generation in its origin panel until it ends', () => {
    expect(canSwitchWorkspaceMode(true, 'responses_resources', 'universal')).toBe(false);
    expect(canSwitchWorkspaceMode(true, 'responses_resources', 'responses_resources')).toBe(true);
    expect(canSwitchWorkspaceMode(false, 'responses_resources', 'universal')).toBe(true);
  });

  it('uses one canonical page model instead of originalPageCount as a rendering shortcut', () => {
    const document = createEmptyDocument({
      id: 'pagination-regression',
      originalPageCount: 12,
      sections: [
        createDocumentNode({
          id: 'sec-page-1',
          title: 'Página 1',
          type: 'background',
          content: [{ id: 'b-1', text: 'Primera página' } as any],
        }),
        createDocumentNode({
          id: 'sec-page-2',
          title: 'Página 2',
          type: 'background',
          content: [{ id: 'b-2', text: 'Segunda página' } as any],
        }),
        createDocumentNode({
          id: 'generated-section',
          title: 'Sección generada',
          type: 'argument',
          content: [{ id: 'b-3', text: 'Contenido generado después de la fuente.' } as any],
        }),
      ],
    });

    const model = buildWorkspacePageModel(document);
    expect(model.totalPages).toBe(model.pages.length);
    expect(model.totalPages).toBe(2);
    expect(model.pages[1]?.sections[1]?.section.id).toBe('generated-section');
  });
});
