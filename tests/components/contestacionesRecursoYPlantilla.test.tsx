// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaseDocumentsReader } from '@/app/machotes/components/CaseDocumentsReader';
import { confirmCaseDossierInUi } from '../helpers/confirmCaseDossier';
import { sourceFromText } from '../helpers/syntheticCaseDocuments';
import { CIVIL_ARRENDAMIENTO_DEMAND, demandToText } from '../helpers/syntheticDemandPdf';

afterEach(cleanup);

// Sentencia de amparo directo SINTÉTICA (sin datos reales).
const SENTENCIA_AMPARO_DIRECTO = [
  'PODER JUDICIAL DE LA FEDERACIÓN',
  'AMPARO DIRECTO: 501/2025',
  'QUEJOSO: PERSONA SINTÉTICA UNO',
  'MAGISTRADO PONENTE: PERSONA SINTÉTICA DOS',
  'TRIBUNAL COLEGIADO EN MATERIA CIVIL DEL TERCER CIRCUITO',
  'VISTO para resolver el juicio de amparo directo 501/2025.',
  'RESULTANDO',
  'PRIMERO. La parte quejosa promovió amparo contra la sentencia definitiva.',
  'CONSIDERANDO',
  'PRIMERO. Este tribunal es competente.',
  'RESUELVE',
  'ÚNICO. La Justicia de la Unión no ampara ni protege a la parte quejosa.',
].join('\n');

function renderWith(text: string, extra: Record<string, unknown> = {}) {
  const source = sourceFromText(text, 'sint-fuente');
  const document = { id: source.id, name: 'fuente-sintetica.pdf', type: 'pdf', status: 'READY', pages: source.pages } as any;
  return render(<CaseDocumentsReader documents={[document]} sourceDocs={[source]} onSelectDocument={vi.fn()} {...extra as any} />);
}

function chooseType(value: string) {
  fireEvent.change(screen.getByLabelText('Tipo de escrito'), { target: { value } });
}

describe('recursos de amparo: sin el bloqueo de "resolución a impugnar"', () => {
  it('el recurso de revisión en amparo directo puede generarse y su botón dice «Generar recurso»', () => {
    const generate = vi.fn();
    renderWith(SENTENCIA_AMPARO_DIRECTO, { onGenerateResponse: generate });
    chooseType('recurso_revision_amparo_directo');
    expect(screen.queryByText(/Selecciona la resolución que deseas impugnar/)).toBeNull();
    confirmCaseDossierInUi();
    const button = screen.getByRole('button', { name: /Generar recurso/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][0].selectedDocumentType).toBe('recurso_revision_amparo_directo');
  });
});

describe('redacción con la plantilla del abogado', () => {
  it('usa la plantilla elegida aunque su materia no coincida con el tipo de escrito', () => {
    const generate = vi.fn();
    const template = { id: 'tpl-propia', name: 'Mi machote', category: 'Laboral', matterId: 'laboral', content: 'ESTRUCTURA PROPIA DEL DESPACHO' };
    renderWith(demandToText(CIVIL_ARRENDAMIENTO_DEMAND), { onGenerateResponse: generate, customTemplates: [template] });
    chooseType('contestacion_demanda_civil');
    fireEvent.click(screen.getByRole('radio', { name: 'Con mi plantilla' }));
    fireEvent.change(screen.getByLabelText('Plantilla (machote)'), { target: { value: 'tpl-propia' } });
    confirmCaseDossierInUi();
    fireEvent.click(screen.getByRole('button', { name: /Generar contestación/ }));
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][0]).toMatchObject({
      generationMode: 'personal_template',
      referenceDocumentId: 'tpl-propia',
      referenceDocumentText: 'ESTRUCTURA PROPIA DEL DESPACHO',
    });
  });

  it('ofrece subir una plantilla desde la configuración', () => {
    const upload = vi.fn();
    renderWith(demandToText(CIVIL_ARRENDAMIENTO_DEMAND), { onUploadTemplate: upload });
    fireEvent.click(screen.getByRole('radio', { name: 'Con mi plantilla' }));
    fireEvent.click(screen.getByRole('button', { name: 'Subir plantilla' }));
    expect(upload).toHaveBeenCalledOnce();
  });
});
