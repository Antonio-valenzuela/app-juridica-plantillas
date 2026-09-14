import { describe, expect, it } from 'vitest';
import { createFederalLegislationAdapter } from '@/lib/legal-engine/legal-research/adapters/federalLegislation';
import { createScjnAdapter } from '@/lib/legal-engine/legal-research/adapters/scjn';
import { verifyAuthorityCandidate } from '@/lib/legal-engine/legal-research/authorityVerification';
import type { LegalRegimeResolution, LegalResearchRequest, NormalizedResearchQuery } from '@/lib/legal-engine/legal-research/types';

const regime: LegalRegimeResolution = {
  id: 'mx-federal-labor-2024',
  status: 'RESOLVED',
  country: { code: 'MX', displayName: 'México' },
  scope: 'FEDERAL',
  matter: { code: 'laboral', displayName: 'Laboral' },
  procedure: { code: 'amparo_directo', displayName: 'Amparo directo' },
  relevantDate: '2024-06-12',
  temporalPrecision: 'DAY',
  fieldEvidence: [],
  unresolvedFields: [],
  resolutionHash: 'regime-hash',
};

const request: LegalResearchRequest = {
  id: 'official-surface-request',
  legalIssueId: 'issue-1',
  coverageItemIds: [],
  question: '¿Qué regla oficial sustenta la proposición jurídica?',
  requestedAuthorityTypes: ['STATUTE'],
  sourceAuthorityMentionIds: [],
  contextHash: 'context',
  regimeResolutionId: regime.id,
  status: 'READY_FOR_RETRIEVAL',
  createdAt: '2026-09-14T00:00:00.000Z',
};

const query: NormalizedResearchQuery = {
  requestId: request.id,
  normalizedQuery: 'ley federal del trabajo',
  queryHash: 'query-hash',
  explicitTerms: ['ley', 'federal', 'trabajo'],
  regimeHash: regime.resolutionHash,
};

function html(body: string, status = 200, headers: Record<string, string> = { 'content-type': 'text/html; charset=UTF-8' }): Response {
  return new Response(body, { status, headers });
}

function withUrl(response: Response, url: string): Response {
  Object.defineProperty(response, 'url', { value: url, configurable: true });
  return response;
}

function diputadosIndex(): string {
  return '<a href="/LeyesBiblio/pdf/LFT.pdf" data-authority-type="STATUTE" data-citation="Ley Federal del Trabajo" data-locator="artículo 1" data-issuing-authority="Cámara de Diputados" data-jurisdiction="FEDERAL" data-effective-from="2019-05-01">Ley Federal del Trabajo</a>';
}

function scjnIndex(identifier = '1234567'): string {
  return `<a href="/detalle/tesis/${identifier}">Registro digital ${identifier}</a>`;
}

function scjnDetail(identifier = '1234567', title = 'Principio de exhaustividad'): string {
  return [
    `<meta name="registro-digital" content="${identifier}">`,
    '<meta name="tipo" content="Tesis aislada">',
    `<meta property="og:title" content="${title}">`,
    `<div data-field="rubro">La autoridad debe examinar la cuestión planteada.</div>`,
    '<div data-field="texto">El órgano jurisdiccional debe examinar la cuestión planteada de manera exhaustiva.</div>',
    '<time data-field="publicacion" datetime="2024-01-15">15 de enero de 2024</time>',
    '<div data-field="organo">Primera Sala de la Suprema Corte de Justicia de la Nación</div>',
  ].join('');
}

async function verifyRetrieved(adapter: ReturnType<typeof createFederalLegislationAdapter> | ReturnType<typeof createScjnAdapter>, req = request) {
  const found = await adapter.search({ request: req, query, regime });
  const candidate = found.candidates[0];
  const retrieved = candidate ? await adapter.retrieve({ candidateId: candidate.id, requestId: req.id }) : undefined;
  const verified = retrieved?.candidate && retrieved.evidence
    ? await verifyAuthorityCandidate({ candidate: retrieved.candidate, evidence: retrieved.evidence, proposition: retrieved.proposition, request: req, regime })
    : undefined;
  return { found, retrieved, verified };
}

describe('official public-surface adapters', () => {
  it('A: discovers and verifies an official Diputados PDF document', async () => {
    let calls = 0;
    const adapter = createFederalLegislationAdapter({
      searchUrl: 'https://www.diputados.gob.mx/LeyesBiblio/',
      fetch: async () => {
        calls += 1;
        if (calls === 1) return html(diputadosIndex());
        return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]), { headers: { 'content-type': 'application/pdf' } });
      },
      extractText: async () => ({ text: 'Artículo 1. Las disposiciones de esta ley son de observancia general en materia laboral.', locator: 'artículo 1' }),
      clock: () => new Date('2026-09-14T00:00:00.000Z'),
    });
    const result = await verifyRetrieved(adapter);
    expect(result.found.status).toBe('PASS');
    expect(result.retrieved?.status).toBe('PASS');
    expect(result.verified?.verifiedAuthority?.verificationStatus).toBe('VERIFIED');
    expect(result.verified?.verifiedAuthority).toMatchObject({
      provider: 'FEDERAL_LEGISLATION',
      officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf',
      identifier: 'LFT',
    });
    expect(result.verified?.verifiedAuthority?.source.sourceUrl).toContain('/LeyesBiblio/pdf/LFT.pdf');
  });

  it('does not promote an unlocalized official PDF to direct proposition support', async () => {
    const adapter = createFederalLegislationAdapter({
      searchUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf',
      fetch: async () => new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { headers: { 'content-type': 'application/pdf' } }),
      extractText: async () => ({ text: 'Documento oficial completo sin fragmento localizado.', supportLevel: 'LIMITED', limitations: ['Requiere localización del artículo pertinente.'] }),
    });
    const result = await verifyRetrieved(adapter);
    expect(result.retrieved?.proposition).toMatchObject({ supportLevel: 'LIMITED', limitations: ['Requiere localización del artículo pertinente.'] });
  });

  it('preserves a known official document URL without appending a search query', async () => {
    let requestedUrl = '';
    const adapter = createFederalLegislationAdapter({
      searchUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf',
      fetch: async (input) => { requestedUrl = String(input); return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { headers: { 'content-type': 'application/pdf' } }); },
      extractText: async () => ({ text: 'Fragmento normativo localizado.', supportLevel: 'DIRECT' }),
    });
    await adapter.search({ request, query, regime });
    expect(requestedUrl).toBe('https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf');
  });

  it('B: maps a Diputados 404 to OFFICIAL_NOT_FOUND and creates no authority', async () => {
    const adapter = createFederalLegislationAdapter({
      searchUrl: 'https://www.diputados.gob.mx/LeyesBiblio/',
      fetch: async (input) => String(input).includes('LeyesBiblio/pdf') ? html('', 404) : html(diputadosIndex()),
    });
    const result = await verifyRetrieved(adapter);
    expect(result.retrieved?.status).toBe('FAIL');
    expect(result.retrieved?.errorCode).toBe('OFFICIAL_NOT_FOUND');
    expect(result.verified?.verifiedAuthority).toBeUndefined();
  });

  it('C: maps an SCJN 403 to OFFICIAL_ACCESS_BLOCKED and creates no authority', async () => {
    const adapter = createScjnAdapter({
      searchUrl: 'https://sjfsemanal.scjn.gob.mx/',
      fetch: async (input) => String(input).includes('/detalle/') ? html('', 403) : html(scjnIndex()),
    });
    const result = await verifyRetrieved(adapter, { ...request, requestedAuthorityTypes: ['THESIS'] });
    expect(result.retrieved?.status).toBe('FAIL');
    expect(result.retrieved?.errorCode).toBe('OFFICIAL_ACCESS_BLOCKED');
    expect(result.verified?.verifiedAuthority).toBeUndefined();
  });

  it('D: parses and independently verifies an official SCJN thesis detail page', async () => {
    let calls = 0;
    const adapter = createScjnAdapter({
      searchUrl: 'https://sjfsemanal.scjn.gob.mx/',
      fetch: async () => ++calls === 1 ? html(scjnIndex()) : html(scjnDetail()),
      clock: () => new Date('2026-09-14T00:00:00.000Z'),
    });
    const result = await verifyRetrieved(adapter, { ...request, requestedAuthorityTypes: ['THESIS'] });
    expect(result.retrieved?.status).toBe('PASS');
    expect(result.retrieved?.candidate?.locator).toBe('1234567');
    expect(result.retrieved?.candidate?.authorityType).toBe('THESIS');
    expect(result.retrieved?.candidate?.observedCitation).toContain('Principio de exhaustividad');
    expect(result.retrieved?.proposition?.text).toContain('examinar la cuestión planteada');
    expect(result.verified?.verifiedAuthority?.verificationStatus).toBe('VERIFIED');
    expect(result.verified?.verifiedAuthority).toMatchObject({ provider: 'SCJN', identifier: '1234567', title: 'Principio de exhaustividad' });
  });

  it('E: rejects a search hit without a verifiable official document', async () => {
    const adapter = createScjnAdapter({
      searchUrl: 'https://sjfsemanal.scjn.gob.mx/',
      fetch: async (input) => String(input).endsWith('/') ? html(scjnIndex('9999999')) : html('', 404),
    });
    const result = await verifyRetrieved(adapter, { ...request, requestedAuthorityTypes: ['THESIS'] });
    expect(result.found.candidates).toHaveLength(1);
    expect(result.retrieved?.status).toBe('FAIL');
    expect(result.verified?.verifiedAuthority).toBeUndefined();
  });

  it('F: rejects a final document URL outside the official allowlist', async () => {
    let calls = 0;
    const adapter = createScjnAdapter({
      searchUrl: 'https://sjfsemanal.scjn.gob.mx/',
      fetch: async () => ++calls === 1 ? html(scjnIndex()) : withUrl(html(scjnDetail()), 'https://evil.example/tesis/1234567'),
    });
    const result = await verifyRetrieved(adapter, { ...request, requestedAuthorityTypes: ['THESIS'] });
    expect(result.retrieved?.status).toBe('FAIL');
    expect(result.retrieved?.errorCode).toBe('OFFICIAL_DOMAIN_NOT_ALLOWED');
    expect(result.verified?.verifiedAuthority).toBeUndefined();
  });

  it('G: rejects an insecure or downgrade redirect', async () => {
    const adapter = createScjnAdapter({
      searchUrl: 'https://sjfsemanal.scjn.gob.mx/',
      fetch: async (input) => String(input).endsWith('/')
        ? html(scjnIndex())
        : new Response('', { status: 302, headers: { location: 'http://sjfsemanal.scjn.gob.mx/detalle/tesis/1234567' } }),
    });
    const result = await verifyRetrieved(adapter, { ...request, requestedAuthorityTypes: ['THESIS'] });
    expect(result.retrieved?.status).toBe('FAIL');
    expect(result.retrieved?.errorCode).toBe('OFFICIAL_REDIRECT_REJECTED');
    expect(result.verified?.verifiedAuthority).toBeUndefined();
  });

  it('H: rejects content whose registry does not match the requested thesis', async () => {
    let calls = 0;
    const adapter = createScjnAdapter({
      searchUrl: 'https://sjfsemanal.scjn.gob.mx/',
      fetch: async () => ++calls === 1 ? html(scjnIndex('1234567')) : html(scjnDetail('7654321')),
    });
    const result = await verifyRetrieved(adapter, { ...request, requestedAuthorityTypes: ['THESIS'] });
    expect(result.retrieved?.status).toBe('FAIL');
    expect(result.retrieved?.errorCode).toBe('OFFICIAL_VERIFICATION_FAILED');
    expect(result.verified?.verifiedAuthority).toBeUndefined();
  });
});
