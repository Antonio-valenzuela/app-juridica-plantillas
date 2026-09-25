import { beforeEach, describe, expect, it, vi } from 'vitest';

const { countMock } = vi.hoisted(() => ({ countMock: vi.fn() }));

vi.mock('@/lib/prisma', () => ({
  prisma: { generationJob: { count: countMock } },
}));

import { checkGenerationAdmission, maxGenerationInputChars } from '@/lib/security/aiCostControls';

describe('AI cost controls', () => {
  beforeEach(() => {
    countMock.mockReset();
    delete (process.env as any).MAX_CONCURRENT_GENERATIONS;
  });

  it('bloquea el exceso de generaciones concurrentes por workspace/usuario', async () => {
    countMock.mockResolvedValue(3);
    const result = await checkGenerationAdmission({ organizationId: 'org-a', userId: 'user-a' }, 3);
    expect(result).toMatchObject({ ok: false, errorCode: 'GENERATION_CONCURRENCY_LIMIT', active: 3, limit: 3 });
    expect(countMock).toHaveBeenCalledWith({ where: { organizationId: 'org-a', userId: 'user-a', status: 'processing' } });
  });

  it('permite jobs efímeros del workspace local sin consultar la tabla remota', async () => {
    const result = await checkGenerationAdmission({
      organizationId: 'org-local-document-analysis',
      userId: 'user-local-document-analysis',
    }, 3);

    expect(result).toMatchObject({ ok: true, active: 0, limit: 3 });
    expect(countMock).not.toHaveBeenCalled();
  });

  it('mantiene límites configurables de entrada sin permitir valores absurdos', () => {
    (process.env as any).MAX_GENERATION_INPUT_CHARS = '50000';
    expect(maxGenerationInputChars()).toBe(50000);
  });
});
