import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { createIsolatedAuditRoot } from '@/scripts/audit/run-professional-drafting-phase3';

describe('phase 3 audit output isolation', () => {
  it('never reuses an existing audit root or another run output', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'phase3-output-isolation-'));
    try {
      const oldSummary = path.join(root, 'run-summary.json');
      await writeFile(oldSummary, 'historical-evidence', 'utf8');
      const first = await createIsolatedAuditRoot(root);
      const second = await createIsolatedAuditRoot(root);
      expect(first).not.toBe(root);
      expect(second).not.toBe(root);
      expect(first).not.toBe(second);
      expect(path.dirname(first)).toBe(path.join(root, 'runs'));
      expect(await readFile(oldSummary, 'utf8')).toBe('historical-evidence');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
