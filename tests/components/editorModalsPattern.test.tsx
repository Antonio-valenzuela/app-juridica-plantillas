// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { WorkspaceDocumentEditor } from '@/app/machotes/components/WorkspaceDocumentEditor';
import { makeDocumentFixture } from '@/lib/legal-engine/documentAssemblyTypes';
import { createDocumentNode } from '@/lib/legal-engine/types';

const original = makeDocumentFixture({
  id: 'modal-pattern-case', title: 'Documento de prueba',
  sections: [createDocumentNode({ id: 'section-test', title: 'HECHOS', type: 'facts', order: 0, content: [{ id: 'block-test', text: 'Texto original', layer: 'USER_POSITION' }] })],
});
function Harness() {
  const [document, update] = useState(original);
  return <WorkspaceDocumentEditor document={document} onUpdateDocument={update} onExportDocx={() => undefined} onExportPdf={() => undefined} />;
}
afterEach(cleanup);

function openOptional(title: string) {
  const trigger = screen.queryByTitle(title);
  if (!trigger) return null;
  fireEvent.click(trigger);
  return trigger;
}

it('pendientes antes de exportar: modal estándar .lex-modal; Esc y clic fuera cierran; las acciones siguen presentes', () => {
  render(<Harness />);
  expect(openOptional('Ver aspectos pendientes antes de exportar')).not.toBeNull();
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveClass('lex-modal');
  expect(within(dialog).getByRole('button', { name: 'Continuar editando' })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  openOptional('Ver aspectos pendientes antes de exportar');
  fireEvent.mouseDown(screen.getByRole('dialog'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('revisión de calidad: usa .lex-modal con título accesible y se cierra con Esc', () => {
  render(<Harness />);
  if (!openOptional('Revisión de calidad jurídica del documento')) throw new Error('SIN_BOTON_CALIDAD');
  const dialog = screen.queryByRole('dialog', { name: 'Revisión de Calidad Jurídica' });
  if (!dialog) throw new Error('SIN_MODAL_CALIDAD');
  expect(dialog).toHaveClass('lex-modal');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
