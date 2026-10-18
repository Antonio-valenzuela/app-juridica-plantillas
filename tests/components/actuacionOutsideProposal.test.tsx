// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ActuacionProposalCard } from '@/app/machotes/components/ActuacionProposalCard';
import { proposeActuaciones } from '@/lib/legal-engine/actuacionProposal';
import { OFFICIAL_DOCUMENT_MATRIX } from '../fixtures/documentosOficialesSinteticos';

afterEach(cleanup);

/**
 * Regresión (recorrido real): si el tipo seleccionado no figura entre las actuaciones propuestas para el documento
 * (p. ej. «Contestación» preseleccionada sobre un documento sin clasificar), la tarjeta debe ofrecer confirmarlo; antes
 * no había botón y «Generar» quedaba bloqueado sin salida.
 */
it('un tipo fuera de la propuesta se puede confirmar explícitamente', () => {
  const proposal = proposeActuaciones([OFFICIAL_DOCUMENT_MATRIX.find((item) => item.id === 'ambiguo')!.source]);
  expect(proposal.requiresConfirmation).toBe(true);
  expect(proposal.candidates.some((candidate) => candidate.documentType === 'contestacion_demanda_civil')).toBe(false);
  const onConfirm = vi.fn();
  const { rerender } = render(<ActuacionProposalCard proposal={proposal} selectedDocumentType="contestacion_demanda_civil" confirmed={false} onSelect={vi.fn()} onConfirm={onConfirm} />);
  expect(screen.getByTestId('actuacion-outside-proposal').textContent).toMatch(/no está entre las actuaciones propuestas/);
  fireEvent.click(screen.getByTestId('actuacion-confirm'));
  expect(onConfirm).toHaveBeenCalledOnce();
  rerender(<ActuacionProposalCard proposal={proposal} selectedDocumentType="contestacion_demanda_civil" confirmed onSelect={vi.fn()} onConfirm={onConfirm} />);
  expect(screen.getByTestId('actuacion-confirmed')).toBeTruthy();
  expect(screen.queryByTestId('actuacion-confirm')).toBeNull();
});

it('un tipo propuesto sigue usando el flujo normal (sin el aviso de «fuera de la propuesta»)', () => {
  const proposal = proposeActuaciones([OFFICIAL_DOCUMENT_MATRIX.find((item) => item.id === 'ambiguo')!.source]);
  render(<ActuacionProposalCard proposal={proposal} selectedDocumentType="redaccion_libre" confirmed={false} onSelect={vi.fn()} onConfirm={vi.fn()} />);
  expect(screen.queryByTestId('actuacion-outside-proposal')).toBeNull();
  expect(screen.getByTestId('actuacion-confirm')).toBeTruthy();
});
