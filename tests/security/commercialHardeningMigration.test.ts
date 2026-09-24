import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  'prisma/migrations/202609240002_commercial_hardening_runtime/migration.sql',
);

describe('commercial hardening runtime migration', () => {
  it('contains only additive runtime drift repairs', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/ALTER TABLE\s+"LawyerStyleProfile"\s+ADD COLUMN IF NOT EXISTS\s+"aiDisclosureAcknowledgedAt"/);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "GenerationJob"');
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "GenerationJob_organizationId_userId_status_idx"/);
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)|TRUNCATE|DELETE\s+FROM|RECREATE/i);
  });
});
