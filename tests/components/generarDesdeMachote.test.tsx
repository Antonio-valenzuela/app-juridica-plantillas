// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceDraftGeneratorModal } from '@/app/machotes/components/WorkspaceDraftGeneratorModal';
import { buildCarryoverBlocklist, findCarryover } from '@/lib/templates/carryoverFilter';
import { documentAsTemplateSource } from '@/lib/templates/documentAsTemplate';
import { USE_MY_TEMPLATE_LABEL } from '@/lib/templates/templateDesignCopy';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';

function block(id: string, text: string) {
  return { id, layer: 'USER_POSITION' as const, trustLevel: 'VERIFIED' as const, text };
}

const openDocument = createEmptyDocument({
  id: 'doc-abierto',
  title: 'Contestación Juan Pérez',
  documentType: 'escrito_libre',
  documentTypeLabel: 'Escrito libre',
  sections: [
    createDocumentNode({ id: 's1', order: 10, title: 'HECHOS', type: 'facts', content: [block('b1', 'El 18 de agosto de 2021 Juan Pérez pagó $85,000.00 en el expediente 345/2022.')] }),
    createDocumentNode({ id: 's2', order: 20, title: 'PROTESTO LO NECESARIO', type: 'closing', content: [block('b2', 'Atentamente.')] }),
  ],
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: false }) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderModal(onGenerate = vi.fn(async (_payload: Record<string, unknown>) => true)) {
  const source = documentAsTemplateSource(openDocument);
  render(
    <WorkspaceDraftGeneratorModal
      isOpen
      onClose={vi.fn()}
      tabMode="universal"
      onGenerate={onGenerate}
      templates={[]}
      uploadedSources={[]}
      onUploadFiles={vi.fn()}
      onRemoveUploadedSource={vi.fn()}
      caseFicha={null}
      onAnalyzeCase={vi.fn()}
      isGenerating={false}
      onOpenUploadCustomTemplateModal={vi.fn()}
      initialTemplate={source.item as never}
      initialTemplateText={source.text}
    />,
  );
  return onGenerate;
}

describe('«Generar con Machote» usa «Usar mi plantilla (diseño y estructura)»', () => {
  it('el escrito abierto se convierte en fuente de plantilla con su texto original', () => {
    const source = documentAsTemplateSource(openDocument);
    expect(source.item.id).toBe('doc-abierto');
    expect(source.text).toContain('HECHOS');
    expect(source.text).toContain('Juan Pérez');
  });

  it('muestra el aviso, la vista previa de secciones y envía personal_template con las correcciones', async () => {
    const onGenerate = renderModal();
    await waitFor(() => expect(screen.getByTestId('template-design-notice')).toBeTruthy());
    expect(screen.getByRole('button', { name: USE_MY_TEMPLATE_LABEL })).toBeTruthy();
    expect(screen.getByTestId('template-section-preview')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Tratamiento de HECHOS'), { target: { value: 'FORMULA' } });
    fireEvent.click(screen.getByRole('button', { name: /Generar Escrito Completo/ }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalledOnce());
    expect(onGenerate.mock.calls[0][0]).toMatchObject({
      writingMode: 'template',
      selectedTemplate: { id: 'doc-abierto' },
      templateRefText: expect.stringContaining('Juan Pérez'),
      templateSectionKinds: { hechos: 'FORMULA' },
    });
  });

  it('el texto del escrito abierto alimenta el filtro anti-arrastre', () => {
    const source = documentAsTemplateSource(openDocument);
    const blocklist = buildCarryoverBlocklist(source.text, ['María López', '812/2026']);
    expect(findCarryover('Juan Pérez reclama $85,000 en el expediente 345/2022.', blocklist).length).toBeGreaterThan(0);
    expect(findCarryover('María López reclama el pago en el expediente 812/2026.', blocklist)).toEqual([]);
  });
});
