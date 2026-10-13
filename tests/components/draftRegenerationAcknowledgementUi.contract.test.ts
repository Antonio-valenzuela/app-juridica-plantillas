import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../../app/machotes/page.tsx', import.meta.url), 'utf8');

describe('contrato UI para acknowledgement de regeneración DRAFT', () => {
  it('envía acknowledgement booleano en reformular/ampliar/reducir y regenerar apartado', () => {
    const refineStart = page.indexOf('const handleRefineSection =');
    const regenerateStart = page.indexOf('const handleRegenerateSection =', refineStart);
    const contestationsStart = page.indexOf('const handleGenerateContestacion =', regenerateStart);
    expect(refineStart).toBeGreaterThanOrEqual(0);
    const refinementControls = page.slice(refineStart, contestationsStart);
    expect(refinementControls.match(/uncertifiedDraftAcknowledged\s*:/g)).toHaveLength(2);
    expect(refinementControls).toMatch(/uncertifiedDraftAcknowledged\s*:\s*sectionAcknowledgement/);
    expect(refinementControls).toMatch(/window\.confirm\([^)]*\)\s*===\s*true/);
  });

  it('no normaliza acknowledgement ausente a true', () => {
    const refineStart = page.indexOf('const handleRefineSection =');
    const contestationsStart = page.indexOf('const handleGenerateContestacion =', refineStart);
    const refinementControls = page.slice(refineStart, contestationsStart);
    expect(refinementControls).not.toMatch(/uncertifiedDraftAcknowledged\s*:\s*true\b/);
    const acknowledgementBuilders = refinementControls.match(/const sectionAcknowledgement = buildUncertifiedDraftAcknowledgement\([\s\S]*?: false\);/g);
    expect(acknowledgementBuilders).toHaveLength(2);
    expect(acknowledgementBuilders!.every((expression) => /window\.confirm\([\s\S]*?\) === true/.test(expression))).toBe(true);
  });
});
