import { expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extractAppealResolutionReview, extractAppealReasoningCandidates } from '@/lib/legal-engine/case-extraction/appealResolutionReview';
import { redactAppealReplayText } from '@/scripts/audit/appealReplayRedaction';
const pdfPath = process.env.APPEAL_SOURCE_PDF, cachePath = process.env.APPEAL_OCR_CACHE;
const available = Boolean(pdfPath && cachePath && existsSync(pdfPath) && existsSync(cachePath));
if (!available) console.warn('SKIP realAppealReasoningSource: faltan APPEAL_SOURCE_PDF / APPEAL_OCR_CACHE o sus archivos; no se ejecutó replay de fase 2b.');
  it.skipIf(!available)('replays real heading-delimited reasoning blocks offline, preserving originals and never verifying cited authorities', () => {
  const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
  const pdfHash = sha(readFileSync(pdfPath!)); const cacheHash = sha(readFileSync(cachePath!));
  expect(cachePath).toContain(pdfHash);
  const cache = JSON.parse(readFileSync(cachePath!, 'utf8'));
  const source = { id: 'real-phase2-offline', pages: cache.value.pages };
  const review = extractAppealResolutionReview([source]);
  const resolution = review.resolutions.find(r => r.type === 'SENTENCIA_DEFINITIVA' && r.startPage === 5)!;
  expect(resolution).toBeDefined();
  // Offline fixture binding only. No live confirmation is fabricated or persisted.
  // The user previously confirmed representation of the four actors.
  const result = extractAppealReasoningCandidates([source], { documentType: 'apelacion_civil', resolution, parties: resolution.parties, representedNames: resolution.parties.filter(p => p.role === 'actor').map(p => p.name), sourceFingerprint: review.sourceFingerprint });
  const spans = [...result.blocks.flatMap(b => [b.origin, ...b.decisionOrigins]), ...result.statements.map(r => r.origin), ...result.reasonings.flatMap(r => [r.origin, r.decisionOrigin]), ...result.candidates.flatMap(r => [r.origin, r.decisionOrigin]), ...result.globalOutcome.findings.map(f => f.origin)];
  const spansValid = spans.every(o => source.pages.find((p: any) => p.page === o.page)?.text.slice(o.start, o.end) === o.excerpt);
  const redact = (text: string) => redactAppealReplayText(text, resolution.parties.filter(p => p.name).map(p => p.name));
  const shortQuote = (text: string) => { const clean = redact(text).replace(/\s+/g, ' ').trim(); return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean; };
  const categories = ['ADVERSE', 'BENEFICIAL', 'NEUTRAL', 'UNDETERMINED'];
  const reasoningCounts = Object.fromEntries(categories.map(impact => [impact, result.reasonings.filter(r => r.impact === impact).length]));
  const blockCounts = Object.fromEntries(categories.map(impact => [impact, result.blocks.filter(b => b.impact === impact).length]));
  const previousReplay = { reasoningCount: 11, candidateCount: 1, undeterminedReasoningCount: 10 };
  const summary = { pdfHash, cacheHash, startPage: resolution.startPage, endPage: resolution.endPage, representedCount: 4,
    previousReplay,
    afterReplay: { blockCount: result.blocks.length, reasoningCount: result.reasonings.length, candidateCount: result.candidates.length,
      undeterminedBlockCount: blockCounts.UNDETERMINED, undeterminedReasoningCount: reasoningCounts.UNDETERMINED, blockCounts, reasoningCounts },
    blockCount: result.blocks.length, reasoningCount: result.reasonings.length, candidateCount: result.candidates.length, statementCount: result.statements.length,
    blocks: result.blocks.map(block => {
      const quotes = block.decisionOrigins.length ? block.decisionOrigins.map(origin => ({ page: origin.page, quote: shortQuote(origin.excerpt) }))
        : [{ page: block.origin.page, quote: shortQuote(block.origin.excerpt) }];
      return { section: block.section, kind: block.kind, impact: block.impact, appliedRule: block.appliedRule,
        page: quotes[0].page, quoteType: block.decisionOrigins.length ? 'CONCLUSION_SPANS' : 'HEADING_ONLY', quotes,
        classificationReason: block.classificationReason };
    }),
    counts: reasoningCounts,
    globalOutcome: { impact: result.globalOutcome.impact, appliedRule: result.globalOutcome.appliedRule, findings: result.globalOutcome.findings.map(f => ({ impact: f.impact, role: f.affectedRole, page: f.origin.page, quote: shortQuote(f.origin.excerpt) })) },
    classifications: result.reasonings.map(r => ({ impact: r.impact, appliedRule: r.appliedRule, reason: r.classificationReason, page: r.decisionOrigin.page, section: r.section, quote: shortQuote(r.decisionOrigin.excerpt) })),
    beneficialReasoningCount: result.reasonings.filter(r => r.impact === 'BENEFICIAL').length,
    unknownImpactCount: result.reasonings.filter(r => r.impact === 'UNDETERMINED').length,
    weakCount: result.candidates.filter(c => c.weakness).length, verifiedAuthorityCount: 0,
    spansValid, unchanged: pdfHash === sha(readFileSync(pdfPath!)) && cacheHash === sha(readFileSync(cachePath!)),
    candidates: result.candidates.map(c => ({ id: c.id, page: c.origin.page, section: c.section, excerptHash: sha(c.origin.excerpt), legalSupport: c.legalSupport, weakness: c.weakness, sourceCitationCount: c.authorities.length })),
    warning: 'Replay offline de OCR existente, sin OCR nuevo, confirmación UI real, proveedor, ni verificación oficial. Citas/personas originales no se publican en esta evidencia.' };
  mkdirSync('audit/apelaciones-fase-2b', { recursive: true });
  writeFileSync('audit/apelaciones-fase-2b/real-replay.json', JSON.stringify(summary, null, 2));
  console.log('PHASE2_REAL_REPLAY', JSON.stringify(summary));
  expect(summary.unchanged && spansValid).toBe(true);
  expect(result.globalOutcome.impact).toBe('ADVERSE');
  expect(result.reasonings.some(r => /RESOLUTIVOS|RESUELVE/i.test(r.section))).toBe(false);
  expect(result.candidates.length).toBeGreaterThan(0);
  expect(result.candidates.every(c => c.legalSupport === 'sin soporte' && c.authorities.every(a => a.status === 'SOURCE_CITED' && !a.officiallyVerified))).toBe(true);
});
