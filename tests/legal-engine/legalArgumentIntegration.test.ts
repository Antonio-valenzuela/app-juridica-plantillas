import { describe, it, expect } from 'vitest';
import { defectiveArgumentDocument } from '@/tests/fixtures/controlledLegalQuality';
import { validateDocument } from '@/lib/legal-engine/validator';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';
const before = (matter: 'apelacion' | 'amparo' | 'penal'): UniversalLegalDocument => defectiveArgumentDocument(matter);
describe('Existing defective documents cannot silently pass structure validation', () => {
  it('identifies the empty appeal grievance', () => {
    expect(validateDocument(before('apelacion')).errors.map(error => error.checkId)).toContain('EMPTY_GRIEVANCE');
  });
  it('identifies the incomplete amparo concept', () => {
    expect(validateDocument(before('amparo')).errors.map(error => error.checkId)).toContain('INCOMPLETE_CONSTITUTIONAL_CONCEPT');
  });
  it('identifies the falsely extracted offence in the produced penal prose', () => {
    expect(validateDocument(before('penal')).errors.map(error => error.checkId)).toContain('UNRESOLVED_SYNTHETIC_PLACEHOLDER');
  });
});
