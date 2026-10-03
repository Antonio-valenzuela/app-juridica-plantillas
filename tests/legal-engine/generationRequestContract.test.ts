import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';
import { buildGenerationRequestContract, validateGenerationRequestContract } from '@/lib/legal-engine/generationRequestContract';

// Replay the exact fixture used in the closure report, not a more convenient replacement.
const harness = readFileSync('scripts/audit/verify-desktop-eligible-draft-journey.mjs', 'utf8');
const sourceText = harness.match(/const text = '([^']+)';/)![1];
const instruction = harness.match(/const instruction = '([^']+)';/)![1];
let document: UniversalLegalDocument;
const sectionText = (type: string) => document.sections.filter(s => s.type === type).flatMap(s => s.content.map(b => b.text)).join('\n');

describe('request → confirmed data → formal writing contract', () => {
  beforeAll(async () => {
    for (const key of ['NVIDIA_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY']) vi.stubEnv(key, '');
    document = await runGenerationPipeline({
      selectedDocumentType: 'escrito_libre', matter: 'civil', jurisdiction: 'local',
      expediente: 'SYN-LIBRE-001', userInstruction: instruction,
      savedParties: [{ role: 'promovente', name: 'PERSONA SINTETICA A', source: 'SOURCE' }],
      sourceDocuments: [createSourceDocument({ id: 'synthetic-http-source', filename: 'constancia.txt', content: sourceText, sourceValidated: true } as any)],
    });
  }, 30000);
  afterAll(() => vi.unstubAllEnvs());

  it('keeps the requested relief without inventing a defense or judgment', () => {
    const text = sectionText('petition');
    expect(text).toMatch(/tener por presentada la constancia e incorporarla/i);
    expect(text).not.toMatch(/medio de defensa|resolución favorable|fundadas las pretensiones/i);
  });
  it('preserves confirmed applicant and explicitly supplied capacity in the proemio', () => {
    expect(document.parties.actor).toBe('PERSONA SINTETICA A');
    expect(sectionText('identity')).toContain('PERSONA SINTETICA A');
    expect(sectionText('identity')).toMatch(/por (?:su |mi )?propio derecho/i);
    expect(sectionText('identity')).not.toMatch(/DATO PENDIENTE.*(?:Nombre|personalidad)/i);
  });
  it('does not replace an explicitly supplied destination with a pending field', () => {
    expect(document.sections.filter(s => s.type === 'header').flatMap(s => s.content.map(b => b.text)).join('\n')).toContain('JUZGADO CIVIL SINTETICO DE PRUEBA');
    expect(document.parties.autoridadDestinataria).toBe('JUZGADO CIVIL SINTETICO DE PRUEBA');
  });
  it('rejects an unrequested merits outcome in the body even with compatible petitions', async () => {
    const bad = await runGenerationPipeline({
      selectedDocumentType: 'escrito_libre', matter: 'civil', userInstruction: instruction,
      savedParties: [{ role: 'promovente', name: 'PERSONA SINTETICA A', source: 'manual' }],
      sourceDocuments: [createSourceDocument({ id: 'same-source', filename: 'constancia.txt', content: sourceText, sourceValidated: true } as any)],
      generateSection: () => 'Solicito dictar resolución favorable declarando fundadas las pretensiones de esta parte.',
    });
    expect(bad.validation.errors.some(e => e.checkId === 'REQUEST_CONTRACT_UNREQUESTED_RELIEF')).toBe(true);
    expect(bad.status).not.toBe('final');
  });
  it('does not let an unrelated denial hide an affirmative invented remedy', () => {
    const bad = structuredClone(document);
    bad.sections.find(s => s.type === 'argument')!.content[0].text = 'No existe controversia, pero solicito condenar a la contraparte.';
    expect(validateGenerationRequestContract(bad).some(e => e.checkId === 'REQUEST_CONTRACT_UNREQUESTED_RELIEF')).toBe(true);
  });
  it('detects loss of confirmed formal data without inventing missing capacity', () => {
    const bad = structuredClone(document);
    bad.sections.find(s => s.type === 'identity')!.content[0].text = 'Comparezco ante Usted.';
    expect(validateGenerationRequestContract(bad).map(e => e.checkId)).toEqual(expect.arrayContaining(['REQUEST_CONTRACT_FORMAL_NAME_LOST', 'REQUEST_CONTRACT_FORMAL_CAPACITY_LOST']));
    const missing = buildGenerationRequestContract(document, 'Petición: entregar copia del documento.');
    expect(missing?.capacity).toBeUndefined();
    expect(missing?.requests[0].text).toBe('entregar copia del documento');
  });
  it('preserves a civil appeal and its explicitly supplied revocation relief through the real pipeline', async () => {
    const appeal = await runGenerationPipeline({
      flow: 'NEW_WRITING', selectedDocumentType: 'apelacion_civil', matter: 'civil',
      userInstruction: 'Interponer apelación civil. Petitorio: revocar la resolución impugnada.',
      intake: { flow: 'NEW_WRITING', requestedRelief: 'revocar la resolución impugnada', objective: 'revocar la resolución impugnada' } as any,
      sourceDocuments: [], allowUnvalidatedSource: true,
    });
    expect(appeal.documentType).toBe('apelacion_civil');
    expect(appeal.sections.filter(s => s.type === 'petition').flatMap(s => s.content.map(b => b.text)).join('\n')).toContain('revocar la resolución impugnada');
    expect(appeal.generationMetadata.requestContract).toBeUndefined();
    expect(appeal.validation.errors.some(e => e.checkId.startsWith('REQUEST_CONTRACT_'))).toBe(false);
    expect(appeal.status).not.toBe('final');
  });
});
