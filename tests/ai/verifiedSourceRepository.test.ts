import { describe, expect, it } from 'vitest';
import { collectVerifiedTemplateSources } from '@/lib/templates/verifiedSourceRepository';

describe('Repositorio de fuentes verificadas para machotes', () => {
  it('sólo expone normas con versión indexada y URL oficial', () => {
    const sources = collectVerifiedTemplateSources(
      [
        {
          id: 'norm-ok',
          nombre: 'Norma verificada de prueba',
          urlBase: 'https://www.diputados.gob.mx/',
          verificationStatus: 'verified',
          lastVerifiedAt: new Date('2026-07-26T00:00:00.000Z'),
          versions: [{ text: 'Texto indexado de prueba.' }],
        },
        {
          id: 'norm-no-version',
          nombre: 'Norma sin versión',
          urlBase: 'https://www.diputados.gob.mx/',
          verificationStatus: 'verified',
          lastVerifiedAt: new Date('2026-07-26T00:00:00.000Z'),
          versions: [],
        },
        {
          id: 'norm-external',
          nombre: 'Norma con URL externa',
          urlBase: 'https://example.com/',
          verificationStatus: 'verified',
          lastVerifiedAt: new Date('2026-07-26T00:00:00.000Z'),
          versions: [{ text: 'Texto.' }],
        },
      ],
      []
    );

    expect(sources).toEqual([
      {
        id: 'norma:norm-ok',
        title: 'Norma verificada de prueba',
        url: 'https://www.diputados.gob.mx/',
        type: 'ley',
        excerpt: 'Texto indexado de prueba.',
      },
    ]);
  });

  it('sólo expone jurisprudencia verificada, fechada y con URL oficial', () => {
    const sources = collectVerifiedTemplateSources(
      [],
      [
        {
          id: 'juris-ok',
          rubro: 'Criterio verificado de prueba',
          text: 'Texto del criterio de prueba.',
          officialUrl: 'https://sjf2.scjn.gob.mx/',
          verificationStatus: 'verified',
          lastVerifiedAt: new Date('2026-07-26T00:00:00.000Z'),
        },
        {
          id: 'juris-pending',
          rubro: 'Criterio pendiente',
          text: 'Texto pendiente.',
          officialUrl: 'https://sjf2.scjn.gob.mx/',
          verificationStatus: 'pending',
          lastVerifiedAt: null,
        },
      ]
    );

    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe('jurisprudencia:juris-ok');
  });

  it('limita los extractos enviados al proveedor de IA', () => {
    const longText = 'x'.repeat(4_000);
    const [source] = collectVerifiedTemplateSources(
      [
        {
          id: 'norm-long',
          nombre: 'Norma larga de prueba',
          urlBase: 'https://www.diputados.gob.mx/',
          verificationStatus: 'verified',
          lastVerifiedAt: new Date('2026-07-26T00:00:00.000Z'),
          versions: [{ text: longText }],
        },
      ],
      []
    );

    expect(source.excerpt.length).toBeLessThanOrEqual(2_500);
  });
});
