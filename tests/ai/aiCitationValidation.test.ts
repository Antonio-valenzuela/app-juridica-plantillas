import { describe, expect, it } from 'vitest';
import {
  filterVerifiedAiSources,
  isAllowedTemplateAiSection,
  parseAiAssistResponse,
  sanitizeTemplateCaseContext,
  type VerifiedTemplateSource,
} from '@/lib/templates/aiAssist';

const verifiedSources: VerifiedTemplateSource[] = [
  {
    id: 'norm-fixture',
    title: 'Fuente normativa verificada de prueba',
    url: 'https://www.diputados.gob.mx/',
    type: 'ley',
    excerpt: 'Contenido indexado de prueba sin afirmaciones jurídicas.',
  },
  {
    id: 'juris-fixture',
    title: 'Criterio verificado de prueba',
    url: 'https://sjf2.scjn.gob.mx/',
    type: 'jurisprudencia',
    excerpt: 'Texto indexado de prueba sin registro digital ficticio.',
  },
];

describe('Asistencia de IA con fuentes verificadas', () => {
  it('limita la asistencia a secciones de desarrollo jurídico', () => {
    expect(isAllowedTemplateAiSection('hechos')).toBe(true);
    expect(isAllowedTemplateAiSection('conceptos_violacion')).toBe(true);
    expect(isAllowedTemplateAiSection('agravios')).toBe(true);
    expect(isAllowedTemplateAiSection('pruebas')).toBe(true);
    expect(isAllowedTemplateAiSection('puntos_petitorios')).toBe(true);
    expect(isAllowedTemplateAiSection('firma')).toBe(false);
    expect(isAllowedTemplateAiSection('autoridad_competente')).toBe(false);
  });

  it('canonicaliza una cita por id y coincidencia exacta de URL oficial', () => {
    const result = filterVerifiedAiSources(
      [
        {
          sourceId: 'norm-fixture',
          title: 'Título alterado por el modelo',
          url: 'https://www.diputados.gob.mx/',
          type: 'ley',
        },
      ],
      verifiedSources
    );

    expect(result.sources).toEqual([
      {
        sourceId: 'norm-fixture',
        title: 'Fuente normativa verificada de prueba',
        url: 'https://www.diputados.gob.mx/',
        type: 'ley',
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('rechaza citas ausentes de la base aunque usen un dominio oficial', () => {
    const result = filterVerifiedAiSources(
      [
        {
          sourceId: 'not-indexed',
          title: 'Fuente no indexada',
          url: 'https://www.diputados.gob.mx/',
          type: 'ley',
        },
      ],
      verifiedSources
    );

    expect(result.sources).toEqual([]);
    expect(result.warnings[0]).toContain('no corresponde a una fuente verificada');
  });

  it('rechaza incluso una fuente disponible si su URL no es oficial', () => {
    const result = filterVerifiedAiSources(
      [
        {
          sourceId: 'external-fixture',
          title: 'Fuente externa',
          url: 'https://example.com/fuente',
          type: 'ley',
        },
      ],
      [
        {
          id: 'external-fixture',
          title: 'Fuente externa',
          url: 'https://example.com/fuente',
          type: 'ley',
          excerpt: 'Texto externo.',
        },
      ]
    );

    expect(result.sources).toEqual([]);
    expect(result.warnings[0]).toContain('URL oficial');
  });

  it('filtra citas inventadas y degrada la confianza de la respuesta', () => {
    const parsed = parseAiAssistResponse(
      JSON.stringify({
        proposedText: 'Propuesta de prueba.',
        sourcesUsed: [
          {
            sourceId: 'norm-fixture',
            title: 'Fuente normativa verificada de prueba',
            url: 'https://www.diputados.gob.mx/',
            type: 'ley',
          },
          {
            sourceId: 'invented',
            title: 'Fuente inventada',
            url: 'https://www.diputados.gob.mx/',
            type: 'ley',
          },
        ],
        pendingElements: [],
        warnings: [],
        confidenceLevel: 'alto',
      }),
      verifiedSources
    );

    expect(parsed.sourcesUsed).toHaveLength(1);
    expect(parsed.sourcesUsed[0].sourceId).toBe('norm-fixture');
    expect(parsed.warnings.some((warning) => warning.includes('invented'))).toBe(true);
    expect(parsed.confidenceLevel).toBe('bajo');
  });

  it('acepta JSON cercado pero rechaza una estructura incompleta', () => {
    const parsed = parseAiAssistResponse(
      '```json\n{"proposedText":"Texto","sourcesUsed":[],"pendingElements":[],"warnings":[],"confidenceLevel":"medio"}\n```',
      verifiedSources
    );
    expect(parsed.proposedText).toBe('Texto');

    expect(() =>
      parseAiAssistResponse('{"sourcesUsed":[]}', verifiedSources)
    ).toThrow(/respuesta estructurada válida/i);
  });

  it('conserva el contexto repetible como texto acotado para el servidor', () => {
    expect(
      sanitizeTemplateCaseContext({
        actor: '  Persona promovente  ',
        hechos: ['Primer hecho', '   ', 'Segundo hecho'],
        objetoAnidado: { no: 'permitido' },
      })
    ).toEqual({
      actor: 'Persona promovente',
      hechos: 'Primer hecho\nSegundo hecho',
    });
  });
});
