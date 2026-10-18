import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { evaluateGeneratedLegalAdmission } from '@/lib/legal-engine/generatedLegalAdmission';
import { stitchTruncatedText } from '@/lib/legal-engine/generationTasks';
import { prepareUniversalDocumentForExport } from '@/lib/legal-engine/exportGuards';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { readDocxPackage, extractWordDocumentParagraphs } from '../helpers/docxPackageReader';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

const run = 'audit/final-contestaciones-validation/run-2026-10-02T21-56-42-990Z/laboral';
const output = 'audit/legal-generation-quality-recovery/offline-replay';
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

describe('offline replay of captured laboral output, not a new legal generation', () => {
  it('keeps immutable source artifacts and admits no unsupported offered testimony in the review copy', async () => {
    const originalBytes = readFileSync(`${run}/generated-document.json`);
    const traceBytes = readFileSync(`${run}/generation-trace.json`);
    const document = JSON.parse(originalBytes.toString()) as UniversalLegalDocument;
    const fixture = JSON.parse(readFileSync(`${run}/fixture.json`, 'utf8'));
    const section = document.sections.find(item => item.id === 'sec-con-pruebas')!;
    expect(document.sections.filter(item => item.id === section.id)).toHaveLength(1);
    const original = section.content[0].text;
    const restart = original.indexOf('PRUEBAS');
    const merged = stitchTruncatedText(`PRUEBAS\n\n${original.slice(0, restart).trim()}`, original.slice(restart));
    expect(merged.match(/PRUEBAS/g)).toHaveLength(1);
    const admission = evaluateGeneratedLegalAdmission({ text: merged, sectionType: 'evidence', document, analysis: document.caseAnalysis, instruction: fixture.instruction });
    expect(admission.accepted).toBe(false);
    expect(admission.reasons).toContain('UNCONFIRMED_EVIDENCE');
    expect(admission.reasons).toContain('ABSOLUTE_EVIDENCE_VALUATION');
    section.content[0].text = admission.pendingText;
    section.content[0].generatedBy = 'DETERMINISTIC';
    section.content[0].generationStatus = 'partial';
    section.content[0].issueDraftValidationStatus = 'VALID_NON_FINAL';
    // No finding, Coverage item or authority is resolved by this replay.
    expect(section.content[0].text).not.toContain('TESTIMONIAL DE LOS TESTIGOS');
    expect(section.content[0].text).not.toContain('valor probatorio pleno');
    expect(section.content[0].text).toContain('Registro de asistencia firmado de fecha 16 de septiembre de 2026');
    const prepared = await prepareUniversalDocumentForExport(document, { exportMode: 'DRAFT' });
    expect(prepared.qualityGate.canMarkAsFinal).toBe(false);
    await expect(prepareUniversalDocumentForExport(document, { exportMode: 'FINAL' })).rejects.toThrow();
    const docx = await exportUniversalToDocx(document, undefined, undefined, { exportMode: 'DRAFT' });
    const pdf = await exportUniversalToPdf(document, undefined, { exportMode: 'DRAFT' });
    const zip = await readDocxPackage(docx);
    const text = [...extractWordDocumentParagraphs(await zip.readText('word/document.xml')),
      ...extractWordDocumentParagraphs(await zip.readText('word/header1.xml'))].join('\n');
    expect(text).toContain('PENDIENTE DE DESARROLLO');
    expect(text).toContain('BORRADOR');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const sourceHash = sha(originalBytes), traceHash = sha(traceBytes);
    expect(sha(readFileSync(`${run}/generated-document.json`))).toBe(sourceHash);
    expect(sha(readFileSync(`${run}/generation-trace.json`))).toBe(traceHash);
    mkdirSync(output, { recursive: true });
    writeFileSync(`${output}/review-copy.docx`, docx);
    writeFileSync(`${output}/review-copy.pdf`, pdf);
    writeFileSync(`${output}/review-copy.json`, JSON.stringify(document, null, 2));
    writeFileSync(`${output}/result.json`, JSON.stringify({
      scope: 'PRUEBAS_ONLY_OFFLINE_REPLAY_NOT_GENERATION', originalRun: run,
      hashesBefore: { generatedDocument: sourceHash, trace: traceHash },
      hashesAfter: { generatedDocument: sha(readFileSync(`${run}/generated-document.json`)), trace: sha(readFileSync(`${run}/generation-trace.json`)) },
      canonicalEvidenceSections: 1, restartOffset: restart,
      replaySource: 'reconstructed continuation boundary in assembled block; raw trace is capped at 4000 characters',
      rejectedCandidateWords: admission.rejectedWords, reasons: admission.reasons,
      finalBlocked: true, qualityGate: prepared.qualityGate,
      artifacts: { docx: { bytes: docx.length, sha256: sha(docx) }, pdf: { bytes: pdf.length, sha256: sha(pdf) } },
      residual: 'Other original sections/findings intentionally retained. Not a legally approved new document.',
    }, null, 2));
  });
});
