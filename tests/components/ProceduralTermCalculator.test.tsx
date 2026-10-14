// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ProceduralTermCalculator } from '@/app/machotes/components/ProceduralTermCalculator';

afterEach(() => { cleanup(); localStorage.clear(); });

const select = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });

describe('ProceduralTermCalculator', () => {
  it('sin fecha de notificación no entrega fecha límite y dice qué falta', () => {
    render(<ProceduralTermCalculator caseId="caso-sintetico" />);
    select('Actuación', 'AMPARO_RECURSO_REVISION');
    select('Jurisdicción', 'federal');
    select('Materia', 'civil');
    select('Tipo de notificación', 'PERSONAL');
    fireEvent.click(screen.getByRole('button', { name: 'Calcular conforme a la regla' }));
    const result = screen.getByTestId('procedural-term-result');
    expect(within(result).getByText(/no se entrega fecha límite/)).toBeInTheDocument();
    expect(within(result).getByText(/Fecha de la notificación/)).toBeInTheDocument();
    expect(within(result).queryByText(/^Vence:/)).toBeNull();
  });

  it('con datos completos y calendario confirmado muestra vencimiento, operación y fundamento oficial', () => {
    render(<ProceduralTermCalculator caseId="caso-sintetico" />);
    select('Actuación', 'AMPARO_RECURSO_REVISION');
    select('Jurisdicción', 'federal');
    select('Materia', 'civil');
    select('Tipo de notificación', 'PERSONAL');
    select('Fecha de notificación', '2026-10-09');
    fireEvent.click(screen.getByLabelText(/Revisé el calendario oficial/));
    fireEvent.click(screen.getByRole('button', { name: 'Calcular conforme a la regla' }));
    const result = screen.getByTestId('procedural-term-result');
    expect(within(result).getAllByText(/^Vence:/)[0]).toHaveTextContent('27 de octubre de 2026');
    expect(within(result).getByText('Operación del cálculo')).toBeInTheDocument();
    expect(within(result).getAllByRole('link', { name: 'Texto oficial' })[0]).toHaveAttribute('href', 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAmp.pdf');
  });

  it('una regla sin cotejar (civil/familiar Jalisco) no calcula', () => {
    render(<ProceduralTermCalculator />);
    select('Actuación', 'CIVIL_FAMILIAR_JALISCO');
    select('Jurisdicción', 'local');
    select('Materia', 'familiar');
    select('Fecha de notificación', '2026-10-09');
    fireEvent.click(screen.getByRole('button', { name: 'Calcular conforme a la regla' }));
    expect(screen.getByTestId('procedural-term-result')).toHaveTextContent(/Código Nacional de Procedimientos Civiles y Familiares/);
  });
});
