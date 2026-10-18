import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
vi.mock('@/lib/security/lawyerAuth', () => ({
  requireLawyerAccess: async () => ({ ok: true, context: { userId: 'test-only' } }),
}));
import { GET } from '../../app/api/operational-manual/route';
import { GET as original } from '../../app/api/operational-manual/original/route';

describe('manual API metadata contract (test-only authorized boundary)', () => {
  it('exposes physical pageCount without changing the imported manifest', async () => {
    const response = await GET(new NextRequest('http://localhost/api/operational-manual'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.manifest.pageCount).toBe(212);
    expect(body.manifest.version).toBe('1.0');
    expect(body.manifest.fragmentCount).toBe(6860);
    expect(body.manifest.active).toBe(true);
  });
  it('serves byte-identical canonical PDF with private inline headers', async () => {
    const response = await original(new NextRequest('http://localhost/api/operational-manual/original'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('inline;');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    expect(digest(new Uint8Array(await response.arrayBuffer()))).toBe(digest(readFileSync('data/documents/operational-manual/v1.0/LEX_PLANTILLAS_MANUAL_OPERATIVO.pdf')));
  });
});
