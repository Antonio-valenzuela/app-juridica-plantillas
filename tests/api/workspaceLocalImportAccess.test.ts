import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireLawyerAccess: vi.fn(),
  scanLocalImportSource: vi.fn(),
  saveScan: vi.fn(),
  importSelected: vi.fn(),
  listImportedRecords: vi.fn(),
}));

vi.mock('@/lib/security/lawyerAuth', () => ({ requireLawyerAccess: mocks.requireLawyerAccess }));
vi.mock('@/lib/workspace/localImportSource', () => ({ scanLocalImportSource: mocks.scanLocalImportSource }));
vi.mock('@/lib/workspace/localImportStore', () => ({
  LocalImportStore: class {
    saveScan = mocks.saveScan;
    importSelected = mocks.importSelected;
    listImportedRecords = mocks.listImportedRecords;
  },
}));

import { GET, POST } from '@/app/api/workspace/local-import/route';

function request(method: 'GET' | 'POST', body?: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/workspace/local-import', {
    method,
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
}

describe('/api/workspace/local-import access boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireLawyerAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 }),
    });
    mocks.scanLocalImportSource.mockResolvedValue({ source: { kind: 'DIRECTORY', path: 'C:\\fixture', limited: false }, inventory: { summary: {}, records: [] } });
    mocks.saveScan.mockResolvedValue({ scanId: 'scan-fixture', source: { kind: 'DIRECTORY', path: 'C:\\fixture', limited: false }, inventory: { summary: {}, records: [] } });
    mocks.importSelected.mockResolvedValue({ imported: [], skipped: [] });
    mocks.listImportedRecords.mockResolvedValue([]);
  });

  it('rejects unauthenticated listing before reading private imported-document metadata', async () => {
    const response = await GET(request('GET'));

    expect(response.status).toBe(401);
    expect(mocks.requireLawyerAccess).toHaveBeenCalledOnce();
    expect(mocks.listImportedRecords).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated scans before touching the requested filesystem path', async () => {
    const response = await POST(request('POST', { action: 'analyze', sourcePath: 'C:\\private-fixture' }));

    expect(response.status).toBe(401);
    expect(mocks.requireLawyerAccess).toHaveBeenCalledOnce();
    expect(mocks.scanLocalImportSource).not.toHaveBeenCalled();
    expect(mocks.saveScan).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated imports before copying any selected records', async () => {
    const response = await POST(request('POST', { action: 'import', scanId: 'scan-fixture', recordIds: ['record-fixture'] }));

    expect(response.status).toBe(401);
    expect(mocks.requireLawyerAccess).toHaveBeenCalledOnce();
    expect(mocks.importSelected).not.toHaveBeenCalled();
  });

  it('keeps authenticated local scan and import paths available', async () => {
    mocks.requireLawyerAccess.mockResolvedValue({ ok: true, context: { organizationId: 'org-fixture', lawyerId: 'lawyer-fixture' } });

    const analyzed = await POST(request('POST', { action: 'analyze', sourcePath: 'C:\\fixture' }));
    const imported = await POST(request('POST', { action: 'import', scanId: 'scan-fixture', recordIds: ['record-fixture'] }));

    expect(analyzed.status).toBe(200);
    expect(imported.status).toBe(200);
    expect(mocks.scanLocalImportSource).toHaveBeenCalledOnce();
    expect(mocks.importSelected).toHaveBeenCalledWith('scan-fixture', ['record-fixture']);
  });
});
