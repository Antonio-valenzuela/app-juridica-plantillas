import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const contention = vi.hoisted(() => ({ remaining: 0 }));
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: async (...args: Parameters<typeof actual.rename>) => {
    if (contention.remaining-- > 0) throw Object.assign(new Error('Windows transient sharing violation'), { code: 'EPERM' });
    return actual.rename(...args);
  } };
});
import { DesktopRecordRepository } from '@/lib/workspace/desktopRecordRepository';
let root: string;
afterEach(async () => { contention.remaining = 0; if (root) await rm(root, { recursive: true, force: true }); });
it('retains atomic replacement when a Windows reader briefly blocks rename', async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'lex-contention-'));
  const store = new DesktopRecordRepository<{ id: string; checkpoint: string }>('jobs', row => typeof row.checkpoint === 'string', root);
  const id = '11111111-1111-4111-8111-111111111111';
  await store.put({ id, checkpoint: 'OLD' });
  contention.remaining = 1;
  await expect(store.put({ id, checkpoint: 'NEW' })).resolves.toMatchObject({ checkpoint: 'NEW' });
  expect((await store.find(id))?.checkpoint).toBe('NEW');
  expect(JSON.parse(await readFile(path.join(root, 'desktop-jobs-v1', `${id}.json`), 'utf8')).record.checkpoint).toBe('NEW');
});
it('keeps the previous checkpoint and surfaces a persistent sharing failure', async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'lex-contention-'));
  const store = new DesktopRecordRepository<{ id: string; checkpoint: string }>('jobs', row => typeof row.checkpoint === 'string', root);
  const id = '11111111-1111-4111-8111-111111111111';
  await store.put({ id, checkpoint: 'OLD' });
  contention.remaining = 20;
  await expect(store.put({ id, checkpoint: 'NEW' })).rejects.toMatchObject({ code: 'EPERM' });
  expect((await store.find(id))?.checkpoint).toBe('OLD');
});
