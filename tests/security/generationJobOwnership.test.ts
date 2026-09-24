import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const requireLawyerAccess = vi.hoisted(() => vi.fn());
vi.mock('@/lib/security/lawyerAuth', () => ({ requireLawyerAccess }));

import { createGenerationJob } from '@/lib/legal-engine/generationJobs';
import { GET as getStatus } from '@/app/api/legal-engine/generate/status/route';
import { POST as postCancel } from '@/app/api/legal-engine/generate/cancel/route';

const ownerA = { organizationId: 'org-a', userId: 'user-a', lawyerId: 'user-a', role: 'lawyer' };
const ownerB = { organizationId: 'org-b', userId: 'user-b', lawyerId: 'user-b', role: 'lawyer' };

beforeEach(() => {
  vi.clearAllMocks();
  requireLawyerAccess.mockResolvedValue({ ok: true, context: ownerB });
});

describe('generation job ownership', () => {
  it('does not expose another user job status', async () => {
    const job = createGenerationJob({ organizationId: ownerA.organizationId, userId: ownerA.userId, fingerprint: `job-a-${Date.now()}` });

    const response = await getStatus(new NextRequest(`http://localhost/api/legal-engine/generate/status?jobId=${job.jobId}`));

    expect(response.status).toBe(404);
  });

  it('does not allow another user to cancel a job', async () => {
    const job = createGenerationJob({ organizationId: ownerA.organizationId, userId: ownerA.userId, fingerprint: `job-cancel-a-${Date.now()}` });

    const response = await postCancel(new NextRequest('http://localhost/api/legal-engine/generate/cancel', {
      method: 'POST',
      body: JSON.stringify({ jobId: job.jobId }),
      headers: { 'Content-Type': 'application/json' },
    }));

    expect(response.status).toBe(404);
  });
});
