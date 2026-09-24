import { describe, expect, it } from 'vitest';
import { apiErrorResponse } from '@/lib/security/apiErrors';

describe('API error contract', () => {
  it('expone solo errorCode, message y requestId', async () => {
    const response = apiErrorResponse({
      requestId: 'req-test',
      status: 500,
      errorCode: 'INTERNAL_ERROR',
      message: 'No fue posible completar la operación.',
      internalError: new Error('P2024 C:\\Users\\yahir\\secret.db'),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      errorCode: 'INTERNAL_ERROR',
      message: 'No fue posible completar la operación.',
      requestId: 'req-test',
    });
    expect(JSON.stringify(body)).not.toContain('P2024');
    expect(JSON.stringify(body)).not.toContain('secret.db');
  });
});
