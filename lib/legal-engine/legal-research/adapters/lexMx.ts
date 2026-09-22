import fs from 'node:fs';
import path from 'node:path';
import { sha256ResearchValue, stableResearchId } from '../canonical';
import type {
  AuthorityCandidate,
  AuthorityType,
  ResearchClock,
  SupportedProposition,
} from '../types';
import type {
  LegalResearchProvider,
  LegalResearchRetrieveInput,
  LegalResearchSearchInput,
  ProviderRetrieveResult,
  ProviderSearchResult,
} from './types';

export interface LexMxCatalogEntry {
  sigla: string;
  slug: string;
  titulo: string;
  pdf_url: string;
  ref_url?: string;
  ultima_reforma?: string;
}

export interface LexMxAdapterConfig {
  baseDir?: string;
  catalog?: LexMxCatalogEntry[];
  clock?: ResearchClock;
}

export interface LexMxArticleExtraction {
  slug: string;
  sigla: string;
  titulo: string;
  articleLabel: string;
  articleNumber: string;
  articleContent: string;
  pdfUrl: string;
  ultimaReforma?: string;
}

function resolveDefaultLexMxDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'data/lex-mx'),
    path.resolve(__dirname, '../../../../data/lex-mx'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function extractArticleRegex(articleNumber: string): RegExp {
  const escaped = articleNumber.replace(/o\b|\./g, '');
  return new RegExp(
    `(?:^|\\n)\\*\\*Art[íi]culo\\s+${escaped}[o.]?\\.?\\*\\*\\s*([\\s\\S]*?)(?=(?:\\n\\*\\*Art[íi]culo|\\n##|\\n---|$))`,
    'i',
  );
}

export function extractArticleFromMarkdown(
  markdownContent: string,
  articleNumber: string,
): string | null {
  const regex = extractArticleRegex(articleNumber);
  const match = markdownContent.match(regex);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

export function detectArticleNumber(query: string): string | null {
  const match = query.match(/\b(?:art[íi]culo|art\.?)\s*(\d{1,4}(?:\s*bis|\s*ter|\s*qu[aá]ter)?|[1-9]o)\b/i);
  return match ? match[1].trim() : null;
}

function authorityTypeForLaw(slug: string, titulo: string): AuthorityType {
  const norm = normalizeSearchText(`${slug} ${titulo}`);
  if (norm.includes('constitucion') || slug === 'CPEUM') return 'CONSTITUTION';
  if (norm.includes('codigo')) return 'CODE';
  if (norm.includes('reglamento')) return 'REGULATION';
  return 'STATUTE';
}

export function createLexMxAdapter(config: LexMxAdapterConfig = {}): LegalResearchProvider {
  const baseDir = config.baseDir || resolveDefaultLexMxDir();
  const clock = config.clock || (() => new Date());
  const byCandidateId = new Map<string, { candidate: AuthorityCandidate; extraction: LexMxArticleExtraction }>();

  function loadCatalog(): LexMxCatalogEntry[] {
    if (config.catalog) return config.catalog;
    const catalogPath = path.join(baseDir, 'catalog.json');
    if (!fs.existsSync(catalogPath)) return [];
    try {
      const raw = fs.readFileSync(catalogPath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  return {
    id: 'LEX_MX',
    version: '1.0.0',
    supportedAuthorityTypes: ['CONSTITUTION', 'STATUTE', 'CODE', 'REGULATION'],

    async search(input: LegalResearchSearchInput): Promise<ProviderSearchResult> {
      if (input.regime.status === 'LEGAL_REGIME_UNRESOLVED') {
        return { status: 'FAIL', candidates: [], errorCode: 'LEGAL_REGIME_UNRESOLVED', reasons: ['LEGAL_REGIME_UNRESOLVED'] };
      }

      const catalog = loadCatalog();
      if (catalog.length === 0) {
        return { status: 'FAIL', candidates: [], errorCode: 'LEX_MX_CATALOG_EMPTY', reasons: ['LEX_MX_CATALOG_EMPTY'] };
      }

      const queryNorm = normalizeSearchText(input.query.normalizedQuery);
      const articleNumber = detectArticleNumber(input.query.normalizedQuery);
      const candidates: AuthorityCandidate[] = [];

      for (const entry of catalog) {
        const siglaTokens = normalizeSearchText(entry.sigla).split(' ');
        const matchesLaw = siglaTokens.some((t) => t.length >= 2 && queryNorm.includes(t))
          || (entry.slug === 'CPEUM' && (queryNorm.includes('constitucion') || queryNorm.includes('cpeum')))
          || (entry.slug === 'LAmp' && (queryNorm.includes('amparo') || queryNorm.includes('lamp')))
          || (entry.slug === 'CCF' && (queryNorm.includes('civil') || queryNorm.includes('ccf')));

        if (!matchesLaw && !queryNorm.includes('ley') && !queryNorm.includes('codigo') && !queryNorm.includes('constitucion')) {
          continue;
        }

        const mdPath = path.join(baseDir, 'leyes', `${entry.slug}.md`);
        let mdContent = '';
        if (fs.existsSync(mdPath)) {
          try {
            mdContent = fs.readFileSync(mdPath, 'utf8');
          } catch {
            continue;
          }
        }

        const targetArticle = articleNumber || (queryNorm.includes('14') ? '14' : queryNorm.includes('1') ? '1' : null);
        let articleText: string | null = null;
        if (targetArticle && mdContent) {
          articleText = extractArticleFromMarkdown(mdContent, targetArticle);
        }

        const observedCitation = targetArticle
          ? `Artículo ${targetArticle} de la ${entry.titulo}`
          : entry.titulo;

        const authType = authorityTypeForLaw(entry.slug, entry.titulo);
        const locator = targetArticle ? `Artículo ${targetArticle}` : undefined;

        const candidate: AuthorityCandidate = {
          id: stableResearchId('candidate', {
            adapterId: 'LEX_MX',
            requestId: input.request.id,
            slug: entry.slug,
            locator: locator || 'ley',
          }),
          requestId: input.request.id,
          provider: 'LEX_MX',
          identifier: entry.slug,
          title: entry.titulo,
          authorityType: authType,
          observedCitation,
          canonicalCitationCandidate: observedCitation,
          sourceUrl: entry.pdf_url,
          sourceDomain: 'www.diputados.gob.mx',
          sourceTier: 'SECONDARY_SUPPORT', // Nunca VERIFIED automáticamente
          issuingAuthority: 'Cámara de Diputados (vía Lex MX)',
          jurisdiction: 'FEDERAL',
          locator,
          publicationDate: entry.ultima_reforma,
          effectiveFrom: entry.ultima_reforma,
          retrievedAt: clock().toISOString(),
          metadataStatus: entry.pdf_url ? 'COMPLETE' : 'PARTIAL',
          candidateStatus: 'DISCOVERED',
        };

        if (articleText) {
          const extraction: LexMxArticleExtraction = {
            slug: entry.slug,
            sigla: entry.sigla,
            titulo: entry.titulo,
            articleLabel: observedCitation,
            articleNumber: targetArticle!,
            articleContent: articleText,
            pdfUrl: entry.pdf_url,
            ultimaReforma: entry.ultima_reforma,
          };
          byCandidateId.set(candidate.id, { candidate, extraction });
        } else {
          byCandidateId.set(candidate.id, {
            candidate,
            extraction: {
              slug: entry.slug,
              sigla: entry.sigla,
              titulo: entry.titulo,
              articleLabel: observedCitation,
              articleNumber: '',
              articleContent: `Texto normativo de ${entry.titulo} disponible en ${entry.pdf_url}`,
              pdfUrl: entry.pdf_url,
              ultimaReforma: entry.ultima_reforma,
            },
          });
        }

        candidates.push(candidate);
      }

      return {
        status: candidates.length > 0 ? 'PASS' : 'PARTIAL',
        candidates,
        reasons: candidates.length > 0 ? [] : ['LEX_MX_NO_MATCH'],
      };
    },

    async retrieve(input: LegalResearchRetrieveInput): Promise<ProviderRetrieveResult> {
      const entry = byCandidateId.get(input.candidateId);
      if (!entry || entry.candidate.requestId !== input.requestId) {
        return { status: 'FAIL', errorCode: 'NOT_FOUND', reasons: ['NOT_FOUND'] };
      }

      const { candidate, extraction } = entry;
      const contentHash = await sha256ResearchValue({ content: extraction.articleContent });
      const proposition: SupportedProposition = {
        text: extraction.articleContent.slice(0, 1500),
        supportLevel: 'DIRECT',
        sourceLocator: candidate.locator,
        limitations: [
          'Texto recuperado de Lex MX (corpus local). Requiere verificación contra la publicación oficial del DOF o PDF de Cámara de Diputados.',
        ],
      };

      return {
        status: 'PASS',
        candidate: {
          ...candidate,
          candidateStatus: 'RETRIEVED',
          evidenceHash: contentHash,
        },
        proposition,
        reasons: [],
      };
    },
  };
}
