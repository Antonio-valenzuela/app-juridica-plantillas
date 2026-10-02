import { expect, it } from 'vitest';
import { controlledSource } from '../fixtures/controlledLegalQuality';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';

// Exact instructions from controlledLegalJourneys: no easier fixture substituted.
import { instructions } from '../fixtures/draftingInstructions';
function projection(matter: keyof typeof instructions, instruction = instructions[matter]) {
  return (reconstructCaseAnalysis([controlledSource(matter)], instruction).richCaseAnalysis as any)?.draftingProjection;
}
it('explicit partial posture survives canonical projection, without admitting other facts', () => {
  const p = projection('contestacion');
  expect(p?.factResponses).toHaveLength(4);
  expect(p.factResponses[0].responseType).toBe('ADMIT');
  expect(p.factResponses[0].clientPosition.text).toContain('admitir la celebración del convenio');
  expect(p.factResponses[1].responseType).toBe('UNKNOWN_REQUIRES_CLIENT_POSITION');
  expect(p.factResponses[2].responseType).toBe('UNKNOWN_REQUIRES_CLIENT_POSITION');
  expect(p.factResponses[3].responseScope).toBe('PROOF_ONLY');
  expect(p.claimResponses).toHaveLength(2);
  expect(p.claimResponses.every((c: any) => c.status === 'MISSING_CLIENT_POSITION')).toBe(true);
  const rich = reconstructCaseAnalysis([controlledSource('contestacion')],instructions.contestacion).richCaseAnalysis!;
  expect(rich.clientPosition.status).toBe('CONFIRMED');
  expect(rich.clientPosition.propositionIds).toContain(p.factResponses[0].sourceFactId);
  expect(rich.clientPosition.propositionIds).not.toContain(p.factResponses[3].sourceFactId);
  expect(rich.facts.every(f => f.assertionStatus !== 'ESTABLISHED_FACT')).toBe(true);
});
for (const matter of ['apelacion','amparo'] as const) it(`${matter}: explicit effect survives canonical projection`, () => {
  const p = projection(matter);
  expect(p?.challenges).toHaveLength(1);
  expect(p.challenges[0].requestedEffect.text).toContain(matter === 'apelacion' ? 'nueva decisión motivada' : 'reciba y resuelva');
  expect(p.challenges[0].legalRuleIds).toEqual([]);
  expect(p.challenges[0].missingData).toContain('UNVERIFIED_AUTHORITY');
  expect(p.challenges[0].recordSupportIds).toHaveLength(1);
  expect(p.challenges[0].prejudice).toBeTruthy();
});
it('absent effect remains missing, no default revocation or grant', () => {
  const p = projection('amparo', 'Preparar amparo indirecto.');
  expect(p?.challenges[0].requestedEffect).toBeNull();
  expect(p.challenges[0].missingData).toContain('MISSING_REQUESTED_EFFECT');
});
it('penal procedural act is represented with missing crime and exact source spans', () => {
  const p = projection('penal');
  expect(p?.challenges).toHaveLength(1);
  expect(p.challenges[0].crimeClassification).toBe('MISSING');
  expect(p.challenges[0].personRole.text).toContain('imputada');
  expect(p.challenges[0].proceduralStage.text).toBe('investigación complementaria');
  const span = p.challenges[0].sourceSpan;
  expect(controlledSource('penal').extractedText!.slice(span.start,span.end)).toBe(span.text);
});
it('roles and writing type do not fabricate posture', () => {
  const p = projection('contestacion', 'Preparar contestación para PERSONA B, demandado.');
  expect(p?.factResponses.every((f: any) => f.responseType === 'UNKNOWN_REQUIRES_CLIENT_POSITION')).toBe(true);
});
it('conflicting explicit instructions cannot become a factual admission', () => {
  const p = projection('contestacion', 'Postura: admitir la celebración del convenio; negar la celebración del convenio.');
  expect(p.factResponses[0].responseType).toBe('UNKNOWN_REQUIRES_CLIENT_POSITION');
});
