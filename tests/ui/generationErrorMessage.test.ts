import { describe, expect, it } from 'vitest';
import { getSafeApiErrorMessage } from '@/lib/apiErrorMessage';

describe('getSafeApiErrorMessage', () => {
  it('usa el mensaje seguro del contrato de API', () => {
    expect(
      getSafeApiErrorMessage(
        {
          errorCode: 'GENERATION_CAPACITY_UNAVAILABLE',
          message: 'La capacidad de generación no está disponible.',
          requestId: 'req-123',
        },
        'Error al iniciar generación',
      ),
    ).toBe('La capacidad de generación no está disponible.');
  });

  it('no expone el campo legacy error ni el requestId', () => {
    expect(
      getSafeApiErrorMessage(
        {
          error: 'PrismaClientKnownRequestError: relation does not exist',
          requestId: 'req-123',
        },
        'Error al iniciar generación',
      ),
    ).toBe('Error al iniciar generación');
  });

  it('conserva un fallback comprensible para el código conocido sin message', () => {
    expect(
      getSafeApiErrorMessage(
        { errorCode: 'GENERATION_CAPACITY_UNAVAILABLE', requestId: 'req-123' },
        'Error al iniciar generación',
      ),
    ).toBe('La capacidad de generación no está disponible.');
  });

  it('no expone mensajes arbitrarios de una excepción local', () => {
    expect(
      getSafeApiErrorMessage(new Error('PrismaClientKnownRequestError: relation does not exist'), 'No fue posible completar la operación.'),
    ).toBe('No fue posible completar la operación.');
  });
});
