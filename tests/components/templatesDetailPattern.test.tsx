// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TemplateLibraryManager } from '@/app/machotes/components/TemplateLibraryManager';
import { SaveCustomTemplateModal } from '@/components/machotes/SaveCustomTemplateModal';

afterEach(() => cleanup());

const template = { id: 'tpl-demo', name: 'Contestación civil de prueba', category: 'Civil', version: 1, updatedAt: '2026-09-30T12:00:00.000Z', description: 'Plantilla de prueba.', content: 'Contenido de prueba del machote.' };

function renderLibrary(onUseTemplate = vi.fn()) {
  render(<TemplateLibraryManager templates={[template] as any} onUseTemplate={onUseTemplate} onEditTemplate={vi.fn()} onDeleteTemplate={vi.fn()} onCreateNewTemplate={vi.fn()} />);
  return onUseTemplate;
}

it('Mis Plantillas: la vista previa abre en panel lateral con el contenido y se cierra con Esc devolviendo el foco', () => {
  renderLibrary();
  const trigger = screen.getAllByRole('button').find((button) => button.textContent?.includes('Vista previa'))!;
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Contestación civil de prueba' });
  expect(dialog).toHaveTextContent('Vista Previa del Machote');
  expect(dialog).toHaveTextContent('Contenido de prueba del machote.');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('Mis Plantillas: «Usar en el Editor Jurídico» conserva su acción y cierra la vista previa; clic fuera también cierra', () => {
  const onUse = renderLibrary();
  const trigger = screen.getAllByRole('button').find((button) => button.textContent?.includes('Vista previa'))!;
  fireEvent.click(trigger);
  fireEvent.mouseDown(screen.getByTestId('detail-drawer-backdrop'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(trigger);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Usar en el Editor Jurídico/ }));
  expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ id: 'tpl-demo' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('Crear Machote: usa el modal estándar (.lex-modal) y se cierra con Esc y con clic fuera', () => {
  const onClose = vi.fn();
  const { container } = render(<SaveCustomTemplateModal isOpen onClose={onClose} onTemplateCreated={vi.fn()} />);
  const dialog = screen.getByRole('dialog', { name: 'Subir y Guardar Mi Propio Machote' });
  expect(dialog).toHaveClass('lex-modal');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.mouseDown(dialog);
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.mouseDown(container.querySelector('.lex-modal-backdrop')!);
  expect(onClose).toHaveBeenCalledTimes(2);
});
