import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extractAppealResolutionReview } from '../../lib/legal-engine/case-extraction/appealResolutionReview';
export function replayAppealResolution(pdfPath: string, cachePath: string) {
const pdfHash = createHash('sha256').update(readFileSync(pdfPath)).digest('hex');
if (!cachePath.includes(pdfHash)) throw new Error('SOURCE_CACHE_HASH_MISMATCH');
const cacheBytes = readFileSync(cachePath);
const cacheHash = createHash('sha256').update(cacheBytes).digest('hex');
const cache = JSON.parse(cacheBytes.toString('utf8'));
if (!Array.isArray(cache.value?.pages)) throw new Error('NO_PAGE_LEVEL_OCR');
const review = extractAppealResolutionReview([{ id: 'real-source-offline', pages: cache.value.pages }]);
const result = {
  pdfHash, cacheConfigKey: cache.configKey, pageCount: cache.value.pages.length,
  status: review.status, opportunity: review.opportunity,
  resolutions: review.resolutions.map(r => ({ type: r.type, startPage: r.startPage, endPage: r.endPage, date: r.date, court: r.court,
    actorCount: r.parties.filter(p => p.role === 'actor').length, defendantCount: r.parties.filter(p => p.role === 'demandado').length,
    suspiciousPartyCount: r.parties.filter(p => /AHORA\s*1|COLEGIADO|CIRCUITO|^que\b/i.test(p.name)).length,
    hasNotificationReason: Boolean(r.notification), dateStatus: r.dateStatus,
    originalSpansValid: [r.dateOrigin, r.courtOrigin, ...r.parties.map(p => p.origin)].filter(Boolean).every(o => {
      const page = cache.value.pages.find((p: { page: number }) => p.page === o!.page);
      return page && o!.start >= 0 && page.text.slice(o!.start, o!.end) === o!.excerpt;
    }),
    partiesFromHeader: r.parties.every(p => /^.*(?:ACTORES|DEMANDADOS)\s*:/im.test(p.origin.excerpt)),
  })),
  cacheHash,
  sourceUnchanged: pdfHash === createHash('sha256').update(readFileSync(pdfPath)).digest('hex'),
  cacheUnchanged: cacheHash === createHash('sha256').update(readFileSync(cachePath)).digest('hex'),
  warning: 'Offline replay of existing OCR, not a new extraction, current cache-hit proof, UI E2E or visual verification of the scan. No personal names recorded.',
};
writeFileSync('audit/apelaciones-fase-1/real-source-replay.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
return result;
}
if (process.env.APPEAL_REPLAY_CLI === 'true') replayAppealResolution(process.argv[2], process.argv[3]);
