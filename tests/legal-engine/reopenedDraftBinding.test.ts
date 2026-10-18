import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Execute the existing legacy page handler in isolation rather than mounting its
// provider/upload graph. The browser test independently exercises the whole UI.
function harness() {
  const page = readFileSync('app/machotes/page.tsx', 'utf8');
  const start = page.indexOf('  const handleReopenDraft =');
  const end = page.indexOf('  // Mantener la ref del scheduler', start);
  if (start < 0 || end < 0) throw new Error('Reopen handler boundary missing');
  const script = ts.transpileModule(page.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  const doc = { id: 'document-b', sections: [{ id: 's', content: [] }], generationMetadata: {} };
  const dependencies = {
    localStorage: storage, fetch: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, draft: { id: 'saved-b', title: 'B', structuredDoc: doc } }) })),
    notify: vi.fn(), latestDocRef: { current: null }, lastSavedSignatureRef: { current: '' }, computeDraftSignature: () => 'signature-b',
    setUniversalDoc: vi.fn(), setActiveSection: vi.fn(), setUploadedSourceDocs: vi.fn(), setCaseAnalysis: vi.fn(), setInitialForm: vi.fn(),
    setGenerationMode: vi.fn(), setUniversalViewMode: vi.fn(), setActiveNavTab: vi.fn(), setHasSavedDraft: vi.fn(),
  };
  const reopen = new Function(...Object.keys(dependencies), `${script}\nreturn handleReopenDraft;`)(...Object.values(dependencies)) as (id?: string) => Promise<boolean>;
  return { reopen, storage, dependencies };
}
describe('reopened draft persistence binding', () => {
  it('binds the explicitly reopened record instead of leaving the previous case as save target', async () => {
    const { reopen, storage } = harness();
    storage.setItem('jr_last_draft_id', 'saved-a');
    expect(await reopen('saved-b')).toBe(true);
    expect(storage.getItem('jr_last_draft_id')).toBe('saved-b');
  });
  it('does not change the save target when reopening fails', async () => {
    const { reopen, storage, dependencies } = harness();
    storage.setItem('jr_last_draft_id', 'saved-a');
    dependencies.fetch.mockRejectedValueOnce(new Error('offline'));
    expect(await reopen('saved-b')).toBe(false);
    expect(storage.getItem('jr_last_draft_id')).toBe('saved-a');
    expect(dependencies.setUniversalDoc).not.toHaveBeenCalled();
  });
});
