// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React, { useState, type ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceDocumentEditor } from '@/app/machotes/components/WorkspaceDocumentEditor';
import { makeDocumentFixture } from '@/lib/legal-engine/documentAssemblyTypes';
import { createDocumentNode } from '@/lib/legal-engine/types';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';
const original = makeDocumentFixture({
  id: 'controlled-editor-case', title: 'Documento de prueba',
  sections: [createDocumentNode({id:'section-test', title:'HECHOS', type:'facts', order:0,
    content:[{id:'block-test', text:'Texto original controlado', layer:'USER_POSITION'}],
  })],
});
function Harness(props: Partial<ComponentProps<typeof WorkspaceDocumentEditor>> = {}) {
  const [document, update] = useState(original);
  return <WorkspaceDocumentEditor document={document} onUpdateDocument={update} {...props} />;
}
afterEach(cleanup);
it('upload is explicitly unavailable when no upload command is connected', () => {
  render(<Harness />);
  expect(screen.getByRole('button',{name:/Subir Machote/})).toBeDisabled();
});
it('renaming participates in undo and redo without changing case identity', async () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', {name:/Editar contestación/}));
  fireEvent.click(screen.getByTitle('Clic para renombrar documento'));
  fireEvent.change(screen.getByDisplayValue(original.title), {target:{value:'Título corregido'}});
  fireEvent.keyDown(screen.getByDisplayValue('Título corregido'), {key:'Enter'});
  expect(screen.getByTitle('Deshacer')).toBeEnabled();
  fireEvent.click(screen.getByTitle('Deshacer'));
  await waitFor(() => expect(screen.getByTitle('Clic para renombrar documento')).toHaveTextContent(original.title));
  fireEvent.click(screen.getByTitle('Rehacer'));
  await waitFor(() => expect(screen.getByTitle('Clic para renombrar documento')).toHaveTextContent('Título corregido'));
});
it('incremental zoom displays the actual scale, not an empty select', () => {
  render(<Harness />);
  fireEvent.click(screen.getByTitle('Acercar (+10%)'));
  expect(screen.getByTitle('Seleccionar nivel de zoom')).toHaveValue('110');
  expect(screen.getByTitle('Seleccionar nivel de zoom')).toHaveDisplayValue('110%');
  fireEvent.click(screen.getByTitle('Alejar (-10%)'));
  expect(screen.getByTitle('Seleccionar nivel de zoom')).toHaveValue('100');
});
it('template save failures are visible and allow retry', async () => {
  render(<Harness onSaveAsTemplate={async () => {throw new Error('controlled-store-failure');}} />);
  fireEvent.click(screen.getByTitle('Guardar este archivo como plantilla reutilizable'));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la plantilla');
  expect(screen.getByTitle('Guardar este archivo como plantilla reutilizable')).toBeEnabled();
});
it('undo restores the initial document after the first block edit, and redo restores the edit', async () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', {name:/Editar contestación/}));
  fireEvent.click(screen.getByTitle('Editar texto directamente'));
  fireEvent.change(screen.getByDisplayValue('Texto original controlado'), {target:{value:'Texto editado por el abogado'}});
  fireEvent.click(screen.getByRole('button', {name:'Guardar cambios'}));
  expect(screen.getByText('Texto editado por el abogado')).toBeInTheDocument();
  expect(screen.getByTitle('Deshacer')).toBeEnabled();
  fireEvent.click(screen.getByTitle('Deshacer'));
  expect(screen.getByText('Texto original controlado')).toBeInTheDocument();
  fireEvent.click(screen.getByTitle('Rehacer'));
  expect(screen.getByText('Texto editado por el abogado')).toBeInTheDocument();
  await act(async () => {});
});
it('a failed draft save is visible and does not leave the toolbar saving', async () => {
  render(<Harness onSaveDraft={async () => false} />);
  fireEvent.click(screen.getByRole('button', {name:/^💾 Guardar$/}));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el borrador');
  expect(screen.getByRole('button', {name:/^💾 Guardar$/})).toBeEnabled();
});
it('a failed reopen is visible instead of silently keeping the current document', async () => {
  render(<Harness onReopenDraft={async () => false} />);
  fireEvent.click(screen.getByRole('button', {name:/Reabrir guardado/}));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo reabrir el borrador');
  expect(screen.getByRole('button', {name:/Reabrir guardado/})).toBeEnabled();
});
it('undo history from a different document cannot replace the opened case', async () => {
  const update = (document: UniversalLegalDocument) => view.rerender(<WorkspaceDocumentEditor document={document} onUpdateDocument={update} />);
  const view = render(<WorkspaceDocumentEditor document={original} onUpdateDocument={update} />);
  fireEvent.click(screen.getByRole('button', {name:/Editar contestación/}));
  fireEvent.click(screen.getByTitle('Editar texto directamente'));
  fireEvent.change(screen.getByDisplayValue('Texto original controlado'), {target:{value:'Edición del primer expediente'}});
  fireEvent.click(screen.getByRole('button', {name:'Guardar cambios'}));
  expect(screen.getByTitle('Deshacer')).toBeEnabled();
  const second = {...original, id:'second-controlled-case', title:'Segundo expediente'};
  view.rerender(<WorkspaceDocumentEditor document={second} onUpdateDocument={update} />);
  expect(screen.getByTitle('Deshacer')).toBeDisabled();
  expect(screen.queryByRole('button',{name:/Descartar/})).not.toBeInTheDocument();
  await act(async () => {});
});
it('toolbar dispatches formatting, active-section refinement and draft PDF export commands', async () => {
  const format = vi.fn();
  const refine = vi.fn();
  const exportPdf = vi.fn();
  render(<WorkspaceDocumentEditor document={original} onUpdateDocument={vi.fn()} activeSectionId="section-test" onFormatDocument={format} onRefineActive={refine} onExportPdf={exportPdf} />);
  fireEvent.click(screen.getByTitle('Analizar estructura y aplicar formato jurídico'));
  fireEvent.click(screen.getByTitle('Ampliar el apartado activo'));
  fireEvent.click(screen.getByTitle('Elegir exportación de borrador o final'));
  fireEvent.click(screen.getByRole('button',{name:'🖨️ PDF borrador'}));
  await waitFor(() => expect(exportPdf).toHaveBeenCalledWith('DRAFT'));
  expect(format).toHaveBeenCalledTimes(1);
  expect(refine).toHaveBeenCalledWith('ampliar');
});
it('document search shows matching text and can be cleared', () => {
  render(<WorkspaceDocumentEditor document={original} onUpdateDocument={vi.fn()} />);
  const search = screen.getByPlaceholderText('Buscar...');
  fireEvent.change(search,{target:{value:'Texto original'}});
  expect(screen.getByText('1/1')).toBeInTheDocument();
  fireEvent.change(search,{target:{value:''}});
  expect(screen.queryByText('1/1')).not.toBeInTheDocument();
});
