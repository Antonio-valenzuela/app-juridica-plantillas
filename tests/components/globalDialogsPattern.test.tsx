// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceDraftGeneratorModal } from '@/app/machotes/components/WorkspaceDraftGeneratorModal';
import { useExternalProviderConsent } from '@/app/machotes/components/ExternalProviderConsentDialog';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderGenerator(onClose = vi.fn()) {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false })));
  render(<WorkspaceDraftGeneratorModal {...({ isOpen: true, onClose, tabMode: 'universal', onGenerate: vi.fn(), templates: [], uploadedSources: [], onUploadFiles: vi.fn(), onRemoveUploadedSource: vi.fn(), caseFicha: null, onAnalyzeCase: vi.fn(), isGenerating: false, onOpenUploadCustomTemplateModal: vi.fn() } as any)} />);
  return onClose;
}

it('generador: modal estándar con título accesible; Esc, clic fuera y «Cerrar» llaman al mismo onClose', () => {
  const onClose = renderGenerator();
  const dialog = screen.getByRole('dialog', { name: 'Motor Universal de Redacción Jurídica' });
  expect(dialog).toHaveClass('lex-modal');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.mouseDown(dialog);
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.mouseDown(dialog.parentElement!);
  expect(onClose).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(onClose).toHaveBeenCalledTimes(3);
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
});

function ConsentHarness() {
  const [requestConsent, dialog] = useExternalProviderConsent();
  return <><button type="button" onClick={() => void requestConsent()}>Generar</button>{dialog}</>;
}

it('consentimiento de proveedor externo: usa el modal estándar y conserva sus botones', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, chain: ['local'], providers: [] }) })));
  render(<ConsentHarness />);
  fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
  const dialog = await screen.findByTestId('external-provider-consent');
  expect(dialog).toHaveClass('lex-modal');
  expect(dialog).toHaveAttribute('role', 'dialog');
  expect(screen.getByRole('button', { name: 'No enviar' })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByTestId('external-provider-consent')).not.toBeInTheDocument();
});
