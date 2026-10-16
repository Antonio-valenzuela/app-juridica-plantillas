// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CaseDossierPanel, type CaseDossierState } from '@/app/machotes/components/CaseDossierPanel';
import { REPRESENTED_NAME_INVALID_MESSAGE } from '@/lib/legal-engine/representedName';
import { expedienteApelacion } from '../fixtures/apelacionContrariaSintetica';
import { sentenciaVersionPublica } from '../fixtures/sentenciaAmparoDirectoSintetica';

afterEach(cleanup);

const last = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.at(-1)![0] as CaseDossierState;
const confirmBox = () => screen.getByLabelText('Confirmar ficha del caso') as HTMLInputElement;
const nameInput = () => screen.getByLabelText('Nombre de la parte representada') as HTMLInputElement;

/** Sentencia con partes testadas: no hay partes detectadas, así que se escribe la parte a mano. */
function renderWithOtherParty() {
  const onChange = vi.fn();
  render(<CaseDossierPanel sources={[sentenciaVersionPublica()]} documentType="recurso_revision_amparo_directo" onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('Parte que representas'), { target: { value: '__otra__' } });
  return onChange;
}

describe('nombre de la parte que se representa (ficha del caso)', () => {
  it.each(['xcxc', 'aaa', '123', ''])('con «%s» la casilla queda deshabilitada y no hay ficha confirmada', (name) => {
    const onChange = renderWithOtherParty();
    // Se escribe algo antes para que «vacío» sea un borrado y no un campo sin tocar.
    fireEvent.change(nameInput(), { target: { value: 'xcxc' } });
    fireEvent.change(nameInput(), { target: { value: name } });
    expect(confirmBox().disabled).toBe(true);
    fireEvent.click(confirmBox());
    expect(last(onChange).dossier).toBeUndefined();
    expect(screen.getByTestId('dossier-name-error').textContent).toBe(REPRESENTED_NAME_INVALID_MESSAGE);
    expect(nameInput().getAttribute('aria-invalid')).toBe('true');
    expect(last(onChange).problems.length).toBeGreaterThan(0);
  });

  it.each(['IMSS', 'María López Pérez'])('con «%s» la casilla se habilita y la ficha se confirma', (name) => {
    const onChange = renderWithOtherParty();
    fireEvent.change(nameInput(), { target: { value: name } });
    expect(confirmBox().disabled).toBe(false);
    expect(screen.queryByTestId('dossier-name-error')).toBeNull();
    fireEvent.click(confirmBox());
    expect(last(onChange).dossier).toMatchObject({ confirmed: true, representedName: name });
  });

  it('avisa sin bloquear cuando el nombre no coincide con ninguna parte detectada', () => {
    const onChange = vi.fn();
    render(<CaseDossierPanel sources={[expedienteApelacion()]} documentType="contestacion_agravios" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Parte que representas'), { target: { value: '__otra__' } });
    fireEvent.change(nameInput(), { target: { value: 'Persona Distinta Ficticia' } });
    expect(screen.getByTestId('dossier-name-warning').textContent).toMatch(/no coincide con ninguna parte detectada/i);
    expect(screen.queryByTestId('dossier-name-error')).toBeNull();
    expect(confirmBox().disabled).toBe(false);
    fireEvent.click(confirmBox());
    expect(last(onChange).dossier).toMatchObject({ confirmed: true, representedName: 'Persona Distinta Ficticia' });
  });
});
