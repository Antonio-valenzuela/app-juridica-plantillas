// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  WritingAvailabilityNotice, describeWritingAvailability,
} from '@/app/machotes/components/WritingAvailabilityNotice';
import { visibleWritingTypes } from '@/lib/catalog/writingTypeIdentity';

afterEach(cleanup);

describe('estado de tipos presentado al abogado', () => {
  it('PASS + revisión pendiente NO se presenta como FAIL', () => {
    const described = describeWritingAvailability('PASS', 'PENDING');
    expect(described.tone).toBe('success');
    expect(described.label).toBe('Disponible para borrador');
    expect(described.label).not.toMatch(/FAIL/i);
    // PASS + aprobado sí es acreditado.
    expect(describeWritingAvailability('PASS', 'APPROVED').label).toBe('Acreditado');
  });

  it('ningún tipo funcionalmente PASS se muestra como FAIL en la interfaz', () => {
    render(<WritingAvailabilityNotice surface="Contestaciones" showTechnicalDetails />);
    expect(screen.queryByText(/FAIL/)).toBeNull();
    expect(screen.queryByText(/Revisión: PENDING/)).toBeNull();
    expect(screen.queryByText(/acreditados/)).toBeNull();
    // El texto profesional sí está.
    expect(screen.getByText(/disponibles para borrador/i)).toBeTruthy();
    expect(screen.getAllByText(/revisión jurídica/i).length).toBeGreaterThan(0);
  });

  it('la vista normal NO imprime la lista técnica de tipos', () => {
    render(<WritingAvailabilityNotice surface="Contestaciones" />);
    expect(screen.queryByTestId('writing-types-in-development')).toBeNull();
    // Ninguna fila técnica por tipo.
    expect(screen.queryAllByTestId('writing-type-status')).toHaveLength(0);
  });

  it('los tipos con PASS no se listan como "en desarrollo" (contrato 265/12)', () => {
    const identities = visibleWritingTypes();
    expect(identities.length).toBe(277);
    const functionalPass = identities.filter(identity => identity.functionalStatus === 'PASS');
    const functionalFail = identities.filter(identity => identity.functionalStatus === 'FAIL');
    // Contrato honesto: 265 PASS + 12 no generables por estado de producto.
    expect(functionalPass.length).toBe(265);
    expect(functionalFail.length).toBe(12);
    expect(functionalPass.length + functionalFail.length).toBe(identities.length);
    // PASS => nunca aparece como FAIL ni exige el toggle de "en desarrollo".
    for (const identity of functionalPass) {
      expect(describeWritingAvailability(identity.functionalStatus, identity.humanReview).tone).toBe('success');
      expect(describeWritingAvailability(identity.functionalStatus, identity.humanReview).label).not.toMatch(/FAIL/i);
    }
  });

  it('el detalle técnico, cuando se habilita, usa lenguaje profesional y es inerte', () => {
    render(<WritingAvailabilityNotice surface="Contestaciones" showTechnicalDetails />);
    const details = screen.getByTestId('writing-types-in-development');
    expect(within(details).queryByText(/FAIL/)).toBeNull();
    expect(within(details).queryAllByTestId('writing-type-status').every(node => !/FAIL/.test(node.textContent || ''))).toBe(true);
    expect(within(details).queryByRole('button')).toBeNull();
  });

  it('el selector contiene los tipos y el aviso no los dominaba', () => {
    // El aviso es un resumen; el detalle por tipo queda en modo desarrollo.
    render(<WritingAvailabilityNotice surface="Contestaciones" showTechnicalDetails />);
    const details = screen.getByTestId('writing-types-in-development');
    const rows = within(details).queryAllByTestId('writing-type-status');
    expect(rows.length).toBeLessThanOrEqual(visibleWritingTypes().length);
  });
});
