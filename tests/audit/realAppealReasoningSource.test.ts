import { expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { extractAppealResolutionReview, extractAppealReasoningCandidates, lineView } from '@/lib/legal-engine/case-extraction/appealResolutionReview';
import { redactAppealReplayText } from '@/scripts/audit/appealReplayRedaction';
const pdfPath = process.env.APPEAL_SOURCE_PDF, cachePath = process.env.APPEAL_OCR_CACHE;
const available = Boolean(pdfPath && cachePath && existsSync(pdfPath) && existsSync(cachePath));
if (!available) console.warn('SKIP realAppealReasoningSource: faltan APPEAL_SOURCE_PDF / APPEAL_OCR_CACHE o sus archivos; no se ejecutó replay de fase 2b.');
  it.skipIf(!available)('replays real heading-delimited reasoning blocks offline, preserving originals and never verifying cited authorities', () => {
  const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
  const pdfHash = sha(readFileSync(pdfPath!)); const cacheHash = sha(readFileSync(cachePath!));
  const cache = JSON.parse(readFileSync(cachePath!, 'utf8'));
  const source = { id: 'real-phase2-offline', pages: cache.value.pages };
  expect(source.pages).toHaveLength(44);
  expect(cache.value.qualityScore?.pageCount).toBe(44);
  expect(cache.value.sourceFileName).toBe(basename(pdfPath!));
  const review = extractAppealResolutionReview([source]);
  const resolution = review.resolutions.find(r => r.type === 'SENTENCIA_DEFINITIVA' && r.startPage === 5)!;
  expect(resolution).toBeDefined();
  // Offline fixture binding only. No live confirmation is fabricated or persisted.
  // The user previously confirmed representation of the four actors.
  const result = extractAppealReasoningCandidates([source], { documentType: 'apelacion_civil', resolution, parties: resolution.parties, representedNames: resolution.parties.filter(p => p.role === 'actor').map(p => p.name), sourceFingerprint: review.sourceFingerprint });
  const spans = [...result.blocks.flatMap(b => [b.origin, ...b.decisionOrigins]), ...result.statements.map(r => r.origin), ...result.reasonings.flatMap(r => [r.origin, r.decisionOrigin]), ...result.candidates.flatMap(r => [r.origin, r.decisionOrigin]), ...result.globalOutcome.findings.map(f => f.origin)];
  const spansValid = spans.every(o => source.pages.find((p: any) => p.page === o.page)?.text.slice(o.start, o.end) === o.excerpt);
  const page40AdverseBlocks = result.blocks.filter(block => block.pages.includes(40) && block.impact === 'ADVERSE');
  expect(page40AdverseBlocks.length).toBeGreaterThan(0);
  expect(page40AdverseBlocks.every(block => block.unrecognizedContinuation)).toBe(true);
  const redact = (text: string) => redactAppealReplayText(text, resolution.parties.filter(p => p.name).map(p => p.name));
  const shortQuote = (text: string) => { const clean = redact(text).replace(/\s+/g, ' ').trim(); return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean; };
  const categories = ['ADVERSE', 'BENEFICIAL', 'NEUTRAL', 'UNDETERMINED'];
  const reasoningCounts = Object.fromEntries(categories.map(impact => [impact, result.reasonings.filter(r => r.impact === impact).length]));
  const blockCounts = Object.fromEntries(categories.map(impact => [impact, result.blocks.filter(b => b.impact === impact).length]));
  const expectedMissing = ['I', 'II', 'III', 'IV', 'VIII', 'IX', 'XI', 'XIV', 'XV', 'XVII', 'XVIII', 'XXI', 'XXII', 'XXV', 'XXVI', 'XXVII', 'XXVIII'];
  const foldHeader = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const romanHeadingTitle = (text: string) => {
    const match = text.trim().match(/^(?:[IVXLCDM1LY]\s*){1,12}[.):\-]\s*(.+)$/i);
    if (!match) return false;
    let title = match[1].trim();
    const terminal = title.lastIndexOf('.');
    if (terminal > 2) title = title.slice(0, terminal + 1);
    const letters = [...title].filter(char => /\p{L}/u.test(char));
    return letters.length >= 5 && title.split(/\s+/).length >= 2
      && letters.filter(char => char === char.toUpperCase()).length / letters.length >= 0.78;
  };
  const marginPrefixes = [
    /^(?:Ñ|N)\s*-\s*1\s+/i, /^ÓN\s+E\s*-\s+/i, /^UE\s*[:.)-]\s*-\s+/i,
    /^1\s+(?=[IVXLCDM1LY]{1,12}\s*[.):\-])/i, /^TO\s+(?=[IVXLCDM1LY]{1,12}\s*[.):\-])/i,
    /^MA\s+(?=[IVXLCDM1LY]{1,12}\s*[.):\-])/i, /^ES\s*-\s+(?=[IVXLCDM1LY]{1,12}\s*[.):\-])/i,
  ];
  const stripObservedMargin = (text: string) => {
    for (const prefix of marginPrefixes) {
      if (!prefix.test(text)) continue;
      const candidate = text.replace(prefix, '');
      if (romanHeadingTitle(candidate)) return candidate;
    }
    return text.trim();
  };
  const romanValue = (token: string) => {
    const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    const canonical = token.toUpperCase().replace(/1/g, 'I').replace(/L/g, 'I').replace(/Y/g, 'V');
    if (!/^[IVXLCDM]+$/.test(canonical)) return undefined;
    let total = 0;
    for (let i = 0; i < canonical.length; i++) total += (values[canonical[i]] || 0) < (values[canonical[i + 1]] || 0) ? -(values[canonical[i]] || 0) : values[canonical[i]] || 0;
    return total > 0 ? total : undefined;
  };
  const headerLines: Array<{ page: number; raw: string; text: string; token: string; title: string; marginNoise: boolean; parsedBySegmenter: boolean; canonicalSection?: string; readingDoubtful: boolean }> = [];
  for (const page of source.pages.filter((candidate: any) => candidate.page >= resolution.startPage && candidate.page <= resolution.endPage)) {
    for (const line of lineView(String(page.text))) {
      const text = stripObservedMargin(line.text), key = foldHeader(text);
      const match = key.match(/^([IVXLCDM1LY]{1,8})\s*[.):\-]\s*(.{5,})$/i);
      if (!match || /^([LEI1])\s*(?:[:.)-]\s*)?(?:[-|]\s*)?PODER JUDICIAL\b/i.test(foldHeader(line.text))) continue;
      if (!romanHeadingTitle(text) || match[2].trim().split(/\s+/).length < 2) continue;
      const parsed = result.blocks.find(block => block.origin.page === page.page && block.origin.excerpt === line.raw && block.kind === 'REASONING');
      const canonicalSection = parsed?.canonicalSection || parsed?.section;
      const canonicalToken = canonicalSection?.match(/\b([IVXLCDM]+)$/)?.[1];
      headerLines.push({ page: page.page, raw: line.raw, text, token: match[1], title: match[2], marginNoise: text !== line.text.trim(), parsedBySegmenter: Boolean(parsed), canonicalSection, readingDoubtful: Boolean(parsed?.ocrReadingDoubtful) || /[1Y]/i.test(match[1]) || match[1].toUpperCase() === 'VIL' || (canonicalToken !== undefined && canonicalToken !== match[1].toUpperCase()) });
    }
  }
  let previousRoman: number | undefined;
  const assignedHeaders = headerLines.map(header => {
    let value = romanValue(header.canonicalSection?.match(/\b([IVXLCDM]+)$/)?.[1] || header.token);
    let sequenceAdjusted = false;
    const sequenceMismatch = value !== undefined && previousRoman !== undefined && value !== previousRoman + 1;
    if (value !== undefined && previousRoman !== undefined && value === previousRoman) {
      value++;
      sequenceAdjusted = true;
    }
    if (value !== undefined) previousRoman = value;
    const readingDoubtful = header.readingDoubtful || sequenceAdjusted || sequenceMismatch;
    return { ...header, value, sequenceAdjusted, readingDoubtful };
  });
  const missingHeaderDiagnostics = expectedMissing.map(expected => {
    const expectedValue = romanValue(expected);
    const matches = assignedHeaders.filter(header => header.value === expectedValue || (expected === 'XXV' && header.page === 38 && header.token.toUpperCase() === 'XV'));
    const baselineReason = matches.length === 0 ? 'NO_FORMED_HEADER_CANDIDATE_IN_CACHE' : matches.some(header => header.marginNoise)
      ? 'OCR_MARGIN_PREFIX_PREVENTED_START_ANCHOR'
      : matches.some(header => /[1Y]/i.test(header.token) || header.token.toUpperCase() === 'VIL') ? 'OCR_ROMAN_GLYPH_CONFUSION'
      : matches.some(header => header.sequenceAdjusted || header.token.toUpperCase() !== expected) ? 'SEQUENCE_DUPLICATE_OR_MISMATCH'
      : 'OLD_SEGMENTER_DID_NOT_ADMIT_FORMED_HEADER';
    return { expected, candidates: matches.map(header => ({ page: header.page, rawOcrLine: shortQuote(header.raw), literalToken: header.token, recognizedAfterFix: header.parsedBySegmenter, canonicalSection: header.canonicalSection || null, sequenceReadingDoubtful: header.readingDoubtful })), baselineReason };
  });
  const p14HeaderChecks = assignedHeaders.filter(header => header.page === 14).map(header => ({ rawOcrLine: shortQuote(header.raw), literalToken: header.token, sequenceReading: header.value ? `ROMAN_${header.value}` : 'UNRESOLVED', canonicalSection: header.canonicalSection || null, parsedBySegmenter: header.parsedBySegmenter, sequenceReadingDoubtful: header.readingDoubtful }));
  const p38HeaderChecks = assignedHeaders.filter(header => header.page === 38).map(header => ({ rawOcrLine: shortQuote(header.raw), literalToken: header.token, sequenceReading: header.value ? `ROMAN_${header.value}` : 'UNRESOLVED', canonicalSection: header.canonicalSection || null, parsedBySegmenter: header.parsedBySegmenter, sequenceReadingDoubtful: header.readingDoubtful }));
  const discardReasonCounts = missingHeaderDiagnostics.reduce<Record<string, number>>((counts, row) => {
    counts[row.baselineReason] = (counts[row.baselineReason] || 0) + 1;
    return counts;
  }, {});
  const letterheadChecks = source.pages.filter((page: any) => [28, 31, 38, 41].includes(page.page)).flatMap((page: any) => lineView(String(page.text))
    .filter(line => /^[LEI1]\s*(?:[:.)-]\s*)?(?:[-|]\s*)?PODER JUDICIAL\s+DEL\s+ESTADO\s+DE\s+JALISCO\b/i.test(line.key))
    .map(line => ({ page: page.page, rawOcrLine: redact(line.raw) })));
  const previousReplay = { blockCount: 27, reasoningBlockCount: 11, operativeBlockCount: 13, otherBlockCount: 3 };
  const reasoningBlockCount = result.blocks.filter(block => block.kind === 'REASONING').length;
  const operativeBlockCount = result.blocks.filter(block => block.kind === 'OPERATIVE').length;
  const otherBlockCount = result.blocks.filter(block => block.kind === 'OTHER').length;
  const recognizedRomanHeaderCount = headerLines.filter(header => header.parsedBySegmenter).length;
  const summary = { pdfHash, cacheHash, startPage: resolution.startPage, endPage: resolution.endPage, representedCount: 4,
    previousReplay,
    afterReplay: { blockCount: result.blocks.length, reasoningBlockCount, operativeBlockCount, otherBlockCount, recognizedRomanHeaderCount, classifiedReasoningCount: result.reasonings.length, candidateCount: result.candidates.length,
      undeterminedBlockCount: blockCounts.UNDETERMINED, undeterminedReasoningCount: reasoningCounts.UNDETERMINED, blockCounts, reasoningCounts },
    p14HeaderChecks,
    p38HeaderChecks,
    discardReasonCounts,
    blockCount: result.blocks.length, reasoningCount: result.reasonings.length, candidateCount: result.candidates.length, statementCount: result.statements.length,
    missingHeaderDiagnostics,
    letterheadChecks: letterheadChecks.map((row: { page: number; rawOcrLine: string }) => ({ ...row, parsedAsHeading: false, reason: 'INSTITUTIONAL_LETTERHEAD_NOT_NUMERATED_HEADING' })),
    p40Attribution: result.blocks.filter(block => block.pages.includes(40)).map(block => ({ page: 40, headingPage: block.origin.page, section: redact(block.section), canonicalSection: block.canonicalSection ? redact(block.canonicalSection) : null, kind: block.kind, impact: block.impact, decisionSpanHashes: block.decisionOrigins.map(origin => sha(origin.excerpt)), ocrReadingDoubtful: Boolean(block.ocrReadingDoubtful), unrecognizedContinuation: Boolean(block.unrecognizedContinuation) })),
    blocks: result.blocks.map(block => {
      const quoteHashes = block.decisionOrigins.length ? block.decisionOrigins.map(origin => ({ page: origin.page, sha256: sha(origin.excerpt) }))
        : [{ page: block.origin.page, sha256: sha(block.origin.excerpt) }];
      return { section: redact(block.section), canonicalSection: block.canonicalSection ? redact(block.canonicalSection) : null, ocrReadingDoubtful: Boolean(block.ocrReadingDoubtful), unrecognizedContinuation: Boolean(block.unrecognizedContinuation), kind: block.kind, impact: block.impact, appliedRule: block.appliedRule,
        page: quoteHashes[0].page, headingPage: block.origin.page, quoteType: block.decisionOrigins.length ? 'CONCLUSION_SPANS_HASHED' : 'HEADING_HASHED', quoteHashes,
        classificationReason: redact(block.classificationReason) };
    }),
    counts: reasoningCounts,
    globalOutcome: { impact: result.globalOutcome.impact, appliedRule: 1, findings: result.globalOutcome.findings.map(f => ({ impact: f.impact, role: f.affectedRole, page: f.origin.page, quoteSha256: sha(f.origin.excerpt) })) },
    classifications: result.reasonings.map(r => ({ impact: r.impact, appliedRule: r.appliedRule, reason: redact(r.classificationReason), page: r.decisionOrigin.page, section: redact(r.section), quoteSha256: sha(r.decisionOrigin.excerpt) })),
    beneficialReasoningCount: result.reasonings.filter(r => r.impact === 'BENEFICIAL').length,
    unknownImpactCount: result.reasonings.filter(r => r.impact === 'UNDETERMINED').length,
    weakCount: result.candidates.filter(c => c.weakness).length, verifiedAuthorityCount: 0,
    spansValid, unchanged: pdfHash === sha(readFileSync(pdfPath!)) && cacheHash === sha(readFileSync(cachePath!)),
    candidates: result.candidates.map(c => ({ id: c.id, page: c.origin.page, section: c.section, excerptHash: sha(c.origin.excerpt), legalSupport: c.legalSupport, weakness: c.weakness, sourceCitationCount: c.authorities.length })),
    warning: 'Replay offline de OCR existente, sin OCR nuevo, confirmación UI real, proveedor, ni verificación oficial. Citas/personas originales no se publican en esta evidencia.' };
  const foldText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es-MX');
  const publishedSummary = foldText(JSON.stringify(summary));
  expect(resolution.parties.filter(p => p.name).every(p => !publishedSummary.includes(foldText(p.name)))).toBe(true);
  mkdirSync('audit/apelaciones-fase-2b', { recursive: true });
  writeFileSync('audit/apelaciones-fase-2b/real-replay.json', JSON.stringify(summary, null, 2));
  console.log('PHASE2_REAL_REPLAY', JSON.stringify(summary));
  expect(summary.unchanged && spansValid).toBe(true);
  expect(result.globalOutcome.impact).toBe('ADVERSE');
  expect(result.reasonings.some(r => /RESOLUTIVOS|RESUELVE/i.test(r.section))).toBe(false);
  expect(result.candidates.length).toBeGreaterThan(0);
  expect(result.candidates.every(c => c.legalSupport === 'sin soporte' && c.authorities.every(a => a.status === 'SOURCE_CITED' && !a.officiallyVerified))).toBe(true);
});
