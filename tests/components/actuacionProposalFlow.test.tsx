// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CaseDocumentsReader } from '@/app/machotes/components/CaseDocumentsReader';
import { confirmCaseDossierInUi } from '../helpers/confirmCaseDossier';
import { OFFICIAL_DOCUMENT_MATRIX } from '../fixtures/documentosOficialesSinteticos';

afterEach(cleanup);

/**
 * Contestaciones y recursos con documentos oficiales SINTÉTICOS (catálogo real, sin dobles):
 * carga → actuación propuesta → confirmación o corrección del abogado → la solicitud lleva ESA actuación.
 */
function renderWith(id: string) {
  const source = OFFICIAL_DOCUMENT_MATRIX.find((item) => item.id === id)!.source;
  const generate = vi.fn();
  const row = { id: source.id, name: `${id}.pdf`, type: 'pdf', status: 'READY', pages: source.pages } as never;
  render(<CaseDocumentsReader documents={[row]} sourceDocs={[source]} onSelectDocument={vi.fn()} onGenerateResponse={generate} />);
  return { generate, card: () => within(screen.getByTestId('actuacion-proposal')) };
}

const generateButton = () => screen.getByRole('button', { name: /^Generar (contestación|apelación|recurso|escrito)/ }) as HTMLButtonElement;
const typeSelect = () => screen.getAllByRole('combobox').find((element) => element.querySelector('option[value="redaccion_libre"]')) as HTMLSelectElement;

describe('actuación propuesta en Contestaciones y recursos', () => {
  it('demanda civil: corresponde la contestación, se preselecciona y se genera sin pasos extra', () => {
    const { generate, card } = renderWith('demanda-civil');
    expect(card().getByTestId('actuacion-detected').textContent).toMatch(/demanda.*materia civil/i);
    expect(typeSelect().value).toBe('contestacion_demanda_civil');
    confirmCaseDossierInUi();
    expect(generateButton().disabled).toBe(false);
    fireEvent.click(generateButton());
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][0].selectedDocumentType).toBe('contestacion_demanda_civil');
  });

  it('auto mercantil: no se propone una contestación; varias vías posibles → el abogado debe confirmar', () => {
    const { generate, card } = renderWith('auto-mercantil');
    expect(typeSelect().value).toBe('apelacion_mercantil');
    expect(card().queryByTestId('actuacion-candidate-contestacion_demanda_mercantil')).toBeNull();
    // Antes de confirmar, Generar no envía nada.
    fireEvent.click(generateButton());
    expect(generate).not.toHaveBeenCalled();
    expect(document.body.textContent).toMatch(/Confirma la actuación/);
    fireEvent.click(card().getByTestId('actuacion-confirm'));
    expect(card().getByTestId('actuacion-confirmed')).toBeTruthy();
    confirmCaseDossierInUi();
    fireEvent.click(generateButton());
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][0].selectedDocumentType).toBe('apelacion_mercantil');
  });

  it('corrección manual: elegir otra vía de la lista la confirma y la solicitud lleva esa vía', () => {
    const { generate, card } = renderWith('auto-mercantil');
    fireEvent.click(card().getByTestId('actuacion-candidate-revocacion_mercantil'));
    expect(typeSelect().value).toBe('revocacion_mercantil');
    expect(card().getByTestId('actuacion-to-confirm').textContent).toMatch(/Plazo para interponer/);
    confirmCaseDossierInUi();
    fireEvent.click(generateButton());
    expect(generate.mock.calls[0][0].selectedDocumentType).toBe('revocacion_mercantil');
  });

  it('contestación con reconvención: se propone contestar la reconvención (antes era incompatible)', () => {
    const { generate, card } = renderWith('contestacion-reconvencion');
    expect(typeSelect().value).toBe('contestacion_reconvencion_civil');
    expect(card().getByTestId('actuacion-candidate-replica')).toBeTruthy();
    expect(screen.queryByTestId('source-incompatible-notice')).toBeNull();
    confirmCaseDossierInUi();
    fireEvent.click(generateButton());
    expect(generate.mock.calls[0][0].selectedDocumentType).toBe('contestacion_reconvencion_civil');
  });

  it('PDF con páginas sin leer: lo informa y pide confirmar antes de generar', () => {
    const { generate, card } = renderWith('escaneado-parcial');
    expect(card().getByTestId('actuacion-extraction-notice').textContent).toMatch(/No se pudo leer texto en 2 de 3 páginas/);
    fireEvent.click(generateButton());
    expect(generate).not.toHaveBeenCalled();
    fireEvent.change(typeSelect(), { target: { value: 'contestacion_demanda_civil' } });
    confirmCaseDossierInUi();
    fireEvent.click(generateButton());
    expect(generate).toHaveBeenCalledOnce();
  });

  it('una demanda sigue sin admitir apelación: la compatibilidad bloquea aunque el abogado la elija', () => {
    const { generate } = renderWith('demanda-civil');
    fireEvent.change(typeSelect(), { target: { value: 'apelacion_civil' } });
    fireEvent.click(generateButton());
    expect(generate).not.toHaveBeenCalled();
    // El motivo se explica en lenguaje llano, sin códigos internos.
    const text = document.body.textContent || '';
    expect(text).toMatch(/no contiene una resolución que pueda impugnarse/);
    expect(text).not.toMatch(/SOURCE_DOCUMENT_INCOMPATIBLE|DEMANDA_CIVIL/);
  });
});
