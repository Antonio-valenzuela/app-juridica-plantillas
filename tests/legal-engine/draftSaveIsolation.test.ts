import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { markDocumentAsDraft, markDocumentAsSource } from '@/lib/legal-engine/documentLifecycle';

function harness(existingDocumentId: string, readStatus = 200) {
  const page = readFileSync('app/machotes/page.tsx', 'utf8');
  const start = page.indexOf('  const handleSaveDraft =');
  const end = page.indexOf('  const handleReopenDraft =', start);
  if (start < 0 || end < 0) throw new Error('Save handler boundary missing');
  const script = ts.transpileModule(page.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const document = { id: 'document-b', title: 'B', matter: 'Civil', sourceDocuments: [], generationMetadata: {} };
  const storage = new Map([['jr_last_draft_id', 'saved-a']]);
  const fetch = vi.fn(async (_url: string, options?: { method?: string }) => {
    if (!options?.method) return { ok: readStatus === 200, status: readStatus, json: async () => ({ ok: true, draft: { id: 'saved-a', structuredDoc: { id: existingDocumentId } } }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, draft: { id: options.method === 'POST' ? 'saved-b' : 'saved-a', title: 'B' } }) };
  });
  const deps = { fetch, universalDoc: document, isSavingDraftRef: { current: false }, setDraftSaveState: vi.fn(), markDocumentAsDraft, markDocumentAsSource,
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    computeDraftSignature: JSON.stringify, lastSavedSignatureRef: { current: '' }, setHasSavedDraft: vi.fn(), window: { setTimeout: vi.fn() }, notify: vi.fn(),
  };
  const save = new Function(...Object.keys(deps), `${script}\nreturn handleSaveDraft;`)(...Object.values(deps)) as () => Promise<boolean>;
  return { save, fetch, storage };
}
it('a new document cannot overwrite the previous case merely because its saved pointer remains', async () => {
  const { save, fetch, storage } = harness('document-a');
  expect(await save()).toBe(true);
  expect(fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
  expect(fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(true);
  expect(storage.get('jr_last_draft_id')).toBe('saved-b');
});
it('the same document updates its existing record', async () => {
  const { save, fetch } = harness('document-b');
  expect(await save()).toBe(true);
  expect(fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(true);
  expect(fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
});
it('a failed ownership-record read does not overwrite or create a phantom replacement', async () => {
  const { save, fetch } = harness('document-a', 503);
  expect(await save()).toBe(false);
  expect(fetch.mock.calls.some(([, options]) => options?.method === 'PATCH' || options?.method === 'POST')).toBe(false);
});
