import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { getRuntimeMode, requireDesktopLocalAccess } from '@/lib/security/desktopLocalAccess';
import { resolveLexPlantillasStoragePaths } from './storagePaths';
import type { AnalyticsDraftProjection } from './analytics';

export const DESKTOP_WORKSPACE_COOKIE = 'lex_desktop_workspace_cap';
export interface DesktopDraft extends AnalyticsDraftProjection {
  id: string;
  title: string;
  documentType: string;
  matter: string | null;
  jurisdiction: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  formData?: unknown;
  [key: string]: unknown;
}

// One launcher/backend per workspace. Serialize mutations across route bundles,
// never cache documents in memory. WEB/Prisma records are never imported implicitly.
const queues = (globalThis as typeof globalThis & { lexDraftWrites?: Map<string, Promise<unknown>> });
queues.lexDraftWrites ??= new Map();

export class DesktopDraftRepository {
  private readonly directory: string;
  constructor(root = resolveLexPlantillasStoragePaths().workspace) {
    this.directory = path.resolve(root, 'desktop-drafts-v1');
  }
  private file(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new TypeError('DESKTOP_DRAFT_ID_INVALID');
    return path.join(this.directory, `${id}.json`);
  }
  private async serialize<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const file = this.file(id);
    const previous = queues.lexDraftWrites!.get(file) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    queues.lexDraftWrites!.set(file, next);
    try { return await next; }
    finally { if (queues.lexDraftWrites!.get(file) === next) queues.lexDraftWrites!.delete(file); }
  }
  private async write(draft: DesktopDraft) {
    await mkdir(this.directory, { recursive: true });
    const file = this.file(draft.id);
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ version: 1, draft }), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, file);
    } finally { await unlink(temporary).catch(() => undefined); }
  }
  async find(id: string): Promise<DesktopDraft | null> {
    try {
      const stored = JSON.parse(await readFile(this.file(id), 'utf8'));
      if (stored.version !== 1 || stored.draft?.id !== id || typeof stored.draft.title !== 'string'
        || !Number.isFinite(Date.parse(stored.draft.createdAt)) || !Number.isFinite(Date.parse(stored.draft.updatedAt))) {
        throw new Error('DESKTOP_DRAFT_CORRUPT');
      }
      return stored.draft;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error; // Corruption is not an empty or successfully loaded workspace.
    }
  }
  async list(): Promise<DesktopDraft[]> {
    let files: string[];
    try { files = await readdir(this.directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const drafts = await Promise.all(files.filter(file => /^[a-f0-9-]{36}\.json$/.test(file)).map(file => this.find(file.slice(0, -5))));
    return drafts.filter((draft): draft is DesktopDraft => draft !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async create(data: Record<string, unknown>): Promise<DesktopDraft> {
    const now = new Date().toISOString();
    const draft = { ...data, id: randomUUID(), createdAt: now, updatedAt: now } as DesktopDraft;
    delete draft.organizationId; delete draft.userId;
    await this.serialize(draft.id, () => this.write(draft));
    return draft;
  }
  async update(id: string, data: Record<string, unknown>): Promise<DesktopDraft | null> {
    return this.serialize(id, async () => {
      const existing = await this.find(id);
      if (!existing) return null;
      const draft: DesktopDraft = { ...existing, ...data, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
      delete draft.organizationId; delete draft.userId;
      await this.write(draft);
      return draft;
    });
  }
  async remove(id: string) {
    return this.serialize(id, async () => {
      if (!await this.find(id)) return false;
      await unlink(this.file(id));
      return true;
    });
  }
}

/** A separate local capability contract, NOT a fabricated WEB identity or fallback. */
export function desktopDraftRepository(request: NextRequest):
  | null | { ok: true; store: DesktopDraftRepository } | { ok: false; response: Response } {
  if (getRuntimeMode() === 'WEB') return null;
  const headers = new Headers(request.headers);
  const header = headers.get('x-lex-desktop-capability');
  const cookie = request.cookies.get(DESKTOP_WORKSPACE_COOKIE)?.value;
  if (!header && cookie) headers.set('x-lex-desktop-capability', cookie);
  const auth = requireDesktopLocalAccess(new NextRequest(request.url, { headers }), { allowCookie: false });
  if (!auth.ok) return auth;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('origin');
    // Next may normalize its internal URL to localhost. Compare the browser's
    // origin with the actual HTTP authority, after restricting it to this
    // launcher's loopback port. Never trust a forwarded/external Host.
    const authority = request.headers.get('host') || request.nextUrl.host;
    const allowedAuthorities = [`127.0.0.1:${process.env.LEX_DESKTOP_PORT}`, `localhost:${process.env.LEX_DESKTOP_PORT}`];
    if (!allowedAuthorities.includes(authority) || (origin && origin !== `http://${authority}`)
      || request.headers.get('sec-fetch-site') === 'cross-site') {
      return { ok: false, response: Response.json({ ok: false, error: 'DESKTOP_ORIGIN_DENIED' }, { status: 403 }) };
    }
  }
  return { ok: true, store: new DesktopDraftRepository() };
}

export function isGeneratedActivity(draft: DesktopDraft): boolean {
  const metadata = draft.generationMetadata as Record<string, unknown> | null;
  const persistence = metadata?.persistence as Record<string, unknown> | null;
  return Boolean(persistence?.jobId || persistence?.terminalStatus || metadata?.terminalStatus);
}
