// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React, { useState, type ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
it('labels text-based editor pagination as an estimate rather than measured PDF pages', () => {
  render(<Harness />);
  expect(screen.getByText('Paginación estimada; el PDF puede variar')).toBeInTheDocument();
});
it('export popup escapes the scrollable toolbar so it is not clipped', () => {
  render(<Harness onExportDocx={() => undefined} />);
  fireEvent.click(screen.getByTitle('Elegir exportación de borrador o final'));
  const button = screen.getByRole('button', { name: '📄 DOCX borrador' });
  expect(button.closest('[data-testid="editor-toolbar"]')).toBeNull();
});
it('never offers FINAL exports for a type that is not functionally certified', () => {
  const uncertified = { ...original, documentType: 'contestacion_demanda_civil' };
  render(<WorkspaceDocumentEditor document={uncertified} onUpdateDocument={vi.fn()} onExportDocx={vi.fn()} onExportPdf={vi.fn()} />);
  fireEvent.click(screen.getByTitle('Elegir exportación de borrador o final'));
  expect(screen.queryByRole('button', { name: '📄 DOCX final' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '🖨️ PDF final' })).not.toBeInTheDocument();
  expect(screen.getByText(/Exportación FINAL no disponible: tipo en desarrollo/i)).toBeInTheDocument();
});
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
it('switching case while editing cannot show or save the previous unsaved block in another case', async () => {
  const update = vi.fn();
  const view = render(<WorkspaceDocumentEditor document={original} onUpdateDocument={update} />);
  fireEvent.click(screen.getByRole('button', { name: /Editar contestación/ }));
  fireEvent.click(screen.getByTitle('Editar texto directamente'));
  fireEvent.change(screen.getByDisplayValue('Texto original controlado'), { target: { value: 'Edición sin guardar del caso anterior' } });
  const second = { ...original, id: 'another-case', sections: original.sections.map(section => ({ ...section,
    content: section.content.map(block => ({ ...block, text: 'Contenido del segundo caso' })),
  })) };
  view.rerender(<WorkspaceDocumentEditor document={second} onUpdateDocument={update} />);
  await waitFor(() => expect(screen.queryByDisplayValue('Edición sin guardar del caso anterior')).not.toBeInTheDocument());
  expect(screen.getByText('Contenido del segundo caso')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
});
it('cancel and discard restore content and locking removes block editors', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: /Editar contestación/ }));
  fireEvent.click(screen.getByTitle('Editar texto directamente'));
  fireEvent.change(screen.getByDisplayValue('Texto original controlado'), { target: { value: 'No guardar esta edición' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.getByText('Texto original controlado')).toBeInTheDocument();
  fireEvent.click(screen.getByTitle('Editar texto directamente'));
  fireEvent.change(screen.getByDisplayValue('Texto original controlado'), { target: { value: 'Edición descartable' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  fireEvent.click(screen.getByTitle('Descartar todos los cambios de esta sesión de edición'));
  expect(screen.getByText('Texto original controlado')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Bloquear edición/ }));
  expect(screen.queryByTitle('Editar texto directamente')).not.toBeInTheDocument();
});
it('pages, thumbnails, arrows and document search change the actual rendered sheet', () => {
  const multi = { ...original, sections: [0, 1, 2].map(index => createDocumentNode({ id: `section-${index}`, title: `APARTADO ${index}`, type: 'facts', order: index,
    content: [{ id: `block-${index}`, text: `Marca ${index}. ` + 'Texto de prueba. '.repeat(180), layer: 'USER_POSITION' }],
  })) };
  const view = render(<WorkspaceDocumentEditor document={multi} onUpdateDocument={vi.fn()} />);
  expect(view.container.querySelector('#page-sheet-1')).not.toBeNull();
  fireEvent.click(screen.getByTitle('Página siguiente (Flecha derecha →)'));
  expect(view.container.querySelector('#page-sheet-2')).not.toBeNull();
  fireEvent.click(screen.getByTitle('Página anterior (Flecha izquierda ←)'));
  expect(view.container.querySelector('#page-sheet-1')).not.toBeNull();
  fireEvent.click(screen.getByTitle('Mostrar panel de páginas'));
  const thumbnails = within(view.container.querySelector('aside')!).getAllByRole('button');
  expect(thumbnails.length).toBeGreaterThan(3);
  fireEvent.click(thumbnails[3]);
  expect(view.container.querySelector('#page-sheet-3')).not.toBeNull();
  fireEvent.click(screen.getByTitle('Ocultar panel de páginas (‹)'));
  expect(view.container.querySelector('aside')).toBeNull();
  fireEvent.change(screen.getByPlaceholderText('Buscar...'), { target: { value: 'Marca 0' } });
  expect(view.container.querySelector('#page-sheet-1')).not.toBeNull();
});
it('all zoom presets and fit commands update the sheet scale without changing document text', () => {
  const view = render(<Harness />);
  const canvas = view.container.querySelector('.legal-document-canvas')!;
  Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 896 });
  Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 1136 });
  const selector = screen.getByTitle('Seleccionar nivel de zoom');
  for (const value of ['75', '100', '125', '150']) {
    fireEvent.change(selector, { target: { value } });
    expect(canvas.firstElementChild).toHaveStyle({ transform: `scale(${Number(value) / 100})` });
  }
  for (const value of ['fit-width', 'fit-page']) {
    fireEvent.change(selector, { target: { value } });
    expect(selector).toHaveValue(value);
    expect(canvas.firstElementChild).toHaveStyle({ transform: 'scale(1)' });
  }
  expect(screen.getByText('Texto original controlado')).toBeInTheDocument();
});
it('quality and pending dialogs expose real review blockers while only draft exports are available', async () => {
  const exported: string[] = [];
  render(<Harness onExportDocx={mode => exported.push(`DOCX:${mode}`)} onExportPdf={mode => exported.push(`PDF:${mode}`)} />);
  fireEvent.click(screen.getByTitle('Revisión de calidad jurídica del documento'));
  expect(screen.getByText('⚠️ REQUIERE REVISIÓN')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
  fireEvent.click(screen.getByTitle('Ver aspectos pendientes antes de exportar'));
  expect(screen.getByText('Documento en Revisión')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
  for (const name of ['📄 DOCX borrador', '🖨️ PDF borrador']) {
    fireEvent.click(screen.getByTitle('Elegir exportación de borrador o final'));
    expect(screen.queryByRole('button', { name: 'DOCX final' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name }));
  }
  expect(exported).toEqual(['DOCX:DRAFT', 'PDF:DRAFT']);
  expect(screen.queryByText('Marcar listo para exportar')).not.toBeInTheDocument();
});
