// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DetailDrawer } from '@/app/machotes/components/DetailDrawer';

function Harness() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Abrir ficha</button>
    <DetailDrawer open={open} eyebrow="Ficha persistida" title="Asunto de prueba" onClose={() => setOpen(false)}>
      <button type="button">Abrir borrador asociado</button>
    </DetailDrawer>
  </>;
}

function openDrawer() {
  const trigger = screen.getByRole('button', { name: 'Abrir ficha' });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

it('abre como diálogo modal accesible con título y foco dentro', () => {
  render(<Harness />);
  openDrawer();
  const dialog = screen.getByRole('dialog', { name: 'Asunto de prueba' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByText('Ficha persistida')).toBeInTheDocument();
  expect(dialog).toContainElement(document.activeElement as HTMLElement);
});

it('cierra con Esc y devuelve el foco al botón que lo abrió', () => {
  render(<Harness />);
  const trigger = openDrawer();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('cierra con clic fuera (fondo) y devuelve el foco; un clic dentro no cierra', () => {
  render(<Harness />);
  const trigger = openDrawer();
  fireEvent.mouseDown(screen.getByRole('dialog'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByTestId('detail-drawer-backdrop'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('cierra con «Cerrar» y atrapa el foco con Tab y Shift+Tab', () => {
  render(<Harness />);
  const trigger = openDrawer();
  const close = screen.getByRole('button', { name: 'Cerrar' });
  const last = screen.getByRole('button', { name: 'Abrir borrador asociado' });
  last.focus();
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(close).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(last).toHaveFocus();
  fireEvent.click(close);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
