import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceResearchInput,
  filterWorkspaceLibrary,
  mapAuthorityCandidateToWorkspaceResult,
  mapLexMxCatalogToWorkspaceLibraryItem,
} from '@/lib/workspace/research';

describe('workspace research normalization', () => {
  it('preserves authority identity, source provenance, and secondary verification state', () => {
    const result = mapAuthorityCandidateToWorkspaceResult({
      id: 'candidate-1',
      requestId: 'request-1',
      provider: 'CORPUS_IURIS',
      identifier: '2021456',
      locator: '2021456',
      title: 'Prueba ilícita',
      observedCitation: 'Prueba ilícita. Su exclusión...',
      canonicalCitationCandidate: 'Prueba ilícita. Su exclusión...',
      authorityType: 'THESIS',
      sourceUrl: 'https://sjf.scjn.gob.mx/SJFDetalle/2021456',
      sourceTier: 'SECONDARY_SUPPORT',
      issuingAuthority: 'Suprema Corte de Justicia de la Nación',
      retrievedAt: '2026-09-23T00:00:00.000Z',
      metadataStatus: 'COMPLETE',
      candidateStatus: 'DISCOVERED',
    }, { text: 'Fragmento real' });

    expect(result).toMatchObject({
      id: 'candidate-1',
      registroDigital: '2021456',
      rubro: 'Prueba ilícita. Su exclusión...',
      tipo: 'THESIS',
      snippet: 'Fragmento real',
      source: 'CORPUS_IURIS',
      officialUrl: 'https://sjf.scjn.gob.mx/SJFDetalle/2021456',
      verificationStatus: 'REQUIRES_OFFICIAL_CONFIRMATION',
    });
  });

  it('maps local lex-mx catalog entries without inventing article content', () => {
    expect(mapLexMxCatalogToWorkspaceLibraryItem({
      sigla: 'LAmp',
      slug: 'LAmp',
      titulo: 'Ley de Amparo',
      pdf_url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAmp.pdf',
      ref_url: 'https://www.diputados.gob.mx/LeyesBiblio/ref/lamp.htm',
      ultima_reforma: '2025-10-16',
    })).toEqual({
      id: 'LAmp',
      title: 'Ley de Amparo',
      abbreviation: 'LAmp',
      lastReform: '2025-10-16',
      source: 'LEX_MX',
      officialUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAmp.pdf',
      referenceUrl: 'https://www.diputados.gob.mx/LeyesBiblio/ref/lamp.htm',
    });
  });

  it('builds an abstract Mexican-law research request without case facts', async () => {
    const input = await buildWorkspaceResearchInput('prueba ilícita', ['JURISPRUDENCE', 'THESIS']);

    expect(input.request.requestedAuthorityTypes).toEqual(['JURISPRUDENCE', 'THESIS']);
    expect(input.query.normalizedQuery).toContain('prueba ilícita');
    expect(input.query.normalizedQuery).not.toMatch(/expediente|domicilio|actor|demandado/i);
    expect(input.regime.status).toBe('RESOLVED');
    expect(input.regime.country?.code).toBe('MX');
  });

  it('filters real library metadata by title or abbreviation', () => {
    const items = [
      mapLexMxCatalogToWorkspaceLibraryItem({ sigla: 'CPEUM', slug: 'CPEUM', titulo: 'Constitución Política', pdf_url: 'https://www.diputados.gob.mx/CPEUM.pdf' }),
      mapLexMxCatalogToWorkspaceLibraryItem({ sigla: 'LAmp', slug: 'LAmp', titulo: 'Ley de Amparo', pdf_url: 'https://www.diputados.gob.mx/LAmp.pdf' }),
    ];

    expect(filterWorkspaceLibrary(items, 'amparo')).toHaveLength(1);
    expect(filterWorkspaceLibrary(items, 'cpeum')[0].id).toBe('CPEUM');
    expect(filterWorkspaceLibrary(items, 'inexistente')).toEqual([]);
  });
});
