// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GenerationStatusBar } from '@/app/machotes/components/GenerationStatusBar';
import { getGenerationErrorPresentation } from '@/lib/apiErrorMessage';
afterEach(cleanup);
it('preserves the safe error code across the API Error/toast boundary and redacts unknown details', () => {
  const message = getGenerationErrorPresentation({ errorCode: 'SOURCE_DOCUMENT_INCOMPATIBLE' }).message;
  expect(getGenerationErrorPresentation(new Error(message)).code).toBe('SOURCE_DOCUMENT_INCOMPATIBLE');
  expect(getGenerationErrorPresentation({ code: 'MATTER_DOCUMENT_MISMATCH' }).category).toBe('Error interno');
  expect(getGenerationErrorPresentation({ errorCode: 'SECRET_private_path', message: 'client identity' }).message).not.toMatch(/SECRET|private|client identity/);
});
it.each([
  ['NEEDS_SOURCE_REVIEW', 'Problema con el documento subido'],
  ['SOURCE_DOCUMENT_INCOMPATIBLE', 'Problema con el documento subido'],
  ['NEEDS_USER_INPUT', 'Falta información por confirmar'],
  ['LEGAL_ADMISSION_REJECTED', 'Falta información por confirmar'],
  ['PROVIDER_NETWORK_UNAVAILABLE', 'Proveedor de IA no disponible'],
  ['MATTER_DOCUMENT_MISMATCH', 'Error interno'],
])('maps %s safely to %s, with support detail', (errorCode, category) => {
  render(<GenerationStatusBar job={{ status: 'failed', total: 1, completed: 0, errorCode, error: 'C:\\private\\case.pdf API_KEY=secret PERSONA PRIVADA' } as any} />);
  expect(screen.getByText(new RegExp(category))).toBeTruthy();
  expect(screen.getByText('Ver detalle')).toBeTruthy();
  expect(screen.getByText(errorCode)).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/private|secret|PERSONA PRIVADA/);
});
