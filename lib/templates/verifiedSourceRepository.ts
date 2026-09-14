import { isOfficialLegalSourceUrl } from '@/lib/legal/officialSourceUrl';
import type { VerifiedTemplateSource } from './aiAssist';

interface IndexedNormRecord {
  id: string;
  nombre: string;
  urlBase: string | null;
  verificationStatus: string;
  lastVerifiedAt: Date | null;
  versions: Array<{ text: string | null }>;
}

interface VerifiedJurisprudenciaRecord {
  id: string;
  rubro: string;
  text: string;
  officialUrl: string | null;
  verificationStatus: string;
  lastVerifiedAt: Date | null;
}

const excerpt = (value: string): string => value.trim().slice(0, 2_500);

export const collectVerifiedTemplateSources = (
  normas: IndexedNormRecord[],
  jurisprudencia: VerifiedJurisprudenciaRecord[]
): VerifiedTemplateSource[] => {
  const normSources = normas.flatMap<VerifiedTemplateSource>((norma) => {
    const text = norma.versions[0]?.text?.trim();
    if (
      norma.verificationStatus !== 'verified' ||
      !norma.lastVerifiedAt ||
      !norma.urlBase ||
      !text ||
      !isOfficialLegalSourceUrl(norma.urlBase)
    ) {
      return [];
    }
    return [
      {
        id: `norma:${norma.id}`,
        title: norma.nombre,
        url: norma.urlBase,
        type: 'ley',
        excerpt: excerpt(text),
      },
    ];
  });

  const jurisprudenciaSources = jurisprudencia.flatMap<VerifiedTemplateSource>(
    (criterion) => {
      if (
        criterion.verificationStatus !== 'verified' ||
        !criterion.lastVerifiedAt ||
        !criterion.officialUrl ||
        !criterion.text.trim() ||
        !isOfficialLegalSourceUrl(criterion.officialUrl)
      ) {
        return [];
      }
      return [
        {
          id: `jurisprudencia:${criterion.id}`,
          title: criterion.rubro,
          url: criterion.officialUrl,
          type: 'jurisprudencia',
          excerpt: excerpt(criterion.text),
        },
      ];
    }
  );

  return [...normSources, ...jurisprudenciaSources];
};
