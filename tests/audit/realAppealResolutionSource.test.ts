import { it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { replayAppealResolution } from '../../scripts/audit/replay-appeal-resolution';
const available = Boolean(process.env.APPEAL_SOURCE_PDF && process.env.APPEAL_OCR_CACHE && existsSync(process.env.APPEAL_SOURCE_PDF) && existsSync(process.env.APPEAL_OCR_CACHE));
if (!available) console.warn('SKIP realAppealResolutionSource: faltan APPEAL_SOURCE_PDF / APPEAL_OCR_CACHE o sus archivos; no se ejecutó el replay real.');
it.skipIf(!available)('real existing OCR separates auto/sentence and source identities without regeneration', () => {
  const result = replayAppealResolution(process.env.APPEAL_SOURCE_PDF!, process.env.APPEAL_OCR_CACHE!);
  expect(result.resolutions.map(r => [r.type, r.startPage])).toEqual([['AUTO', 1], ['SENTENCIA_DEFINITIVA', 5]]);
  expect(result.resolutions[1].actorCount).toBe(4);
  expect(result.resolutions[1].defendantCount).toBe(4);
  expect(result.resolutions[1].court).toContain('JUZGADO QUINTO EN MATERIA FAMILIAR DEL PRIMER PARTIDO JUDICIAL');
  expect(result.resolutions.every(r => r.suspiciousPartyCount === 0)).toBe(true);
  expect(result.resolutions.every(r => r.originalSpansValid && r.partiesFromHeader)).toBe(true);
  expect(result.resolutions[0].dateStatus).toBe('CONFIRM_DATE');
  expect(result.resolutions[0].date).toContain('2926');
  expect(result.resolutions.every(r => !r.hasNotificationReason)).toBe(true);
  expect(result.sourceUnchanged && result.cacheUnchanged).toBe(true);
});
