// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CaseDossierPanel, type CaseDossierState } from '@/app/machotes/components/CaseDossierPanel';
import { expedienteApelacion, soloSentenciaApelada } from '../fixtures/apelacionContrariaSintetica';

afterEach(cleanup);

// La extracción conserva el nombre sin el punto final de «C.V.».
const APELADA = 'CONSTRUCTORA LOS OLIVOS FICTICIA, S.A. DE C.V';
const last = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.at(-1)![0] as CaseDossierState;

describe('ficha del caso (panel)', () => {
  it('no infiere a quién representa: sin elección no hay ficha confirmada', () => {
    const onChange = vi.fn();
    render(<CaseDossierPanel sources={[expedienteApelacion()]} documentType="contestacion_agravios" onChange={onChange} />);
    expect((screen.getByLabelText('Parte que representas') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Confirmar ficha del caso') as HTMLInputElement).disabled).toBe(true);
    expect(last(onChange).dossier).toBeUndefined();
    expect(last(onChange).problems.join(' ')).toMatch(/a quién representas/i);
  });

  it('rechaza representar al apelante al contestar agravios y acepta a la parte apelada', () => {
    const onChange = vi.fn();
    render(<CaseDossierPanel sources={[expedienteApelacion()]} documentType="contestacion_agravios" onChange={onChange} />);
    const select = screen.getByLabelText('Parte que representas') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'LAURA MENDOZA FICTICIA' } });
    expect(screen.getByRole('status').textContent).toMatch(/parte apelada|lado/i);
    expect((screen.getByLabelText('Confirmar ficha del caso') as HTMLInputElement).disabled).toBe(true);

    fireEvent.change(select, { target: { value: APELADA } });
    fireEvent.click(screen.getByLabelText('Confirmar ficha del caso'));
    const state = last(onChange);
    expect(state.problems).toEqual([]);
    expect(state.dossier).toMatchObject({ confirmed: true, representedSide: 'demandado', expediente: '5521/2024' });
    expect(state.dossier!.agravios).toHaveLength(3);
  });

  it('editar la ficha anula la confirmación: hay que volver a confirmar', () => {
    const onChange = vi.fn();
    render(<CaseDossierPanel sources={[expedienteApelacion()]} documentType="contestacion_agravios" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Parte que representas'), { target: { value: APELADA } });
    fireEvent.click(screen.getByLabelText('Confirmar ficha del caso'));
    expect(last(onChange).dossier).toBeDefined();
    fireEvent.change(screen.getByLabelText('Lugar de presentación'), { target: { value: 'Tlaquepaque, Jalisco' } });
    expect(last(onChange).dossier).toBeUndefined();
    fireEvent.click(screen.getByLabelText('Confirmar ficha del caso'));
    expect(last(onChange).dossier!.city).toBe('Tlaquepaque, Jalisco');
  });

  it('pide la apelación del contrario en lugar de inventar agravios', () => {
    const onChange = vi.fn();
    render(<CaseDossierPanel sources={[soloSentenciaApelada()]} documentType="contestacion_agravios" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Parte que representas'), { target: { value: APELADA } });
    expect(screen.getByRole('status').textContent).toMatch(/apelaci[óo]n/i);
    expect((screen.getByLabelText('Confirmar ficha del caso') as HTMLInputElement).disabled).toBe(true);
    expect(last(onChange).dossier).toBeUndefined();
  });
});
