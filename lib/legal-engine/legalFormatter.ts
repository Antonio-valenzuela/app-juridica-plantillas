import {
  UniversalLegalDocument,
  DocumentNode,
  ContentBlock,
  BlockStyle,
  SectionType,
  UploadedSourceDocument,
  createEmptyDocument,
} from './types';
import { LegalFormatAnalysis, LegalFormatElement } from './legalFormatAnalyzer';
import { LawyerProfile } from '../workspace/lawyerProfileTypes';

/**
 * CAPA 2 — Formateador determinístico.
 * NVIDIA aporta SOLO estructura (tipo, jerarquía, número, heading).
 * El contenido textual proviene SIEMPRE del documento original.
 */

const SERIF = "'Times New Roman', Garamond, 'Liberation Serif', serif";
const MONO = "'Courier New', 'Consolas', monospace";

const STYLE: Record<string, BlockStyle> = {
  docTitle: { fontFamily: SERIF, fontSize: '14pt', fontWeight: '700', textAlign: 'center', lineHeight: '1.35' },
  authority: { fontFamily: SERIF, fontSize: '13pt', fontWeight: '700', textAlign: 'center', lineHeight: '1.4' },
  sectionHeading: { fontFamily: SERIF, fontSize: '13pt', fontWeight: '700', textAlign: 'left', lineHeight: '1.4' },
  subheading: { fontFamily: SERIF, fontSize: '12pt', fontWeight: '700', textAlign: 'left', lineHeight: '1.5' },
  paragraph: { fontFamily: SERIF, fontSize: '12pt', textAlign: 'justify', lineHeight: '1.6' },
  headerMeta: { fontFamily: SERIF, fontSize: '11pt', textAlign: 'justify', lineHeight: '1.5' },
  quote: { fontFamily: SERIF, fontSize: '11pt', fontStyle: 'normal', textAlign: 'justify', lineHeight: '1.5', indent: '3em' },
  table: { fontFamily: MONO, fontSize: '10pt', textAlign: 'left', lineHeight: '1.4' },
  internalNote: { fontFamily: SERIF, fontSize: '9pt', fontStyle: 'italic', textAlign: 'left', lineHeight: '1.4' },
  signature: { fontFamily: SERIF, fontSize: '12pt', textAlign: 'right', lineHeight: '1.8' },
};

function mkBlock(text: string, style: BlockStyle): ContentBlock {
  return {
    id: `blk-fmt-${Math.random().toString(36).slice(2, 10)}`,
    layer: 'SOURCE_FACT',
    trustLevel: 'VERIFIED',
    text,
    style,
    isManuallyEdited: false,
  };
}

function mkSection(id: string, title: string, type: SectionType, order: number, blocks: ContentBlock[], warnings: string[]): DocumentNode {
  return {
    id,
    type,
    title,
    order,
    content: blocks,
    isRepeatable: false,
    isEditable: true,
    isGenerated: false,
    isManuallyEdited: false,
    variables: [],
    validationErrors: [],
    validationWarnings: warnings,
  };
}

function sectionTypeForElement(el: LegalFormatElement): SectionType {
  const hay = `${el.number || ''} ${el.heading || ''}`.toLowerCase();
  if (/petitor/.test(hay)) return 'petition';
  if (/protesto|firma|suscrib/.test(hay)) return 'signature';
  if (/antecedente|proemio|comparecen|antecedentes procesales/.test(hay)) return 'background';
  if (/hechos?|expone/.test(hay)) return 'facts';
  if (/concepto de violaci|agravio/.test(hay)) return 'argument';
  if (/fundament|base constitucional|derecho/.test(hay)) return 'legal_grounds';
  if (/pruebas?/.test(hay)) return 'evidence';
  if (/anexo/.test(hay)) return 'annex';
  return 'custom';
}

/** Agrupa elementos lineales del análisis en secciones del documento con estilos determinísticos. */
export function buildFormattedDocument(
  analysis: LegalFormatAnalysis,
  sources: UploadedSourceDocument[],
  opts?: { lawyerProfile?: LawyerProfile; aiUsed?: boolean; aiProvider?: string; aiModel?: string }
): UniversalLegalDocument {
  const sections: DocumentNode[] = [];
  let currentBlocks: ContentBlock[] = [];
  let currentTitle = '';
  let currentType: SectionType = 'header';
  let currentWarnings: string[] = [];
  let order = 0;

  const flush = () => {
    if (currentBlocks.length === 0) return;
    order += 1;
    sections.push(mkSection(`sec-fmt-${order}`, currentTitle || `Apartado ${order}`, currentType, order, currentBlocks, currentWarnings));
    currentBlocks = [];
    currentWarnings = [];
  };

  const pushHeading = (text: string) => mkBlock(text, STYLE.sectionHeading);

  for (const el of analysis.sections) {
    switch (el.type) {
      case 'title': {
        flush();
        currentTitle = el.text || analysis.title || '';
        currentType = 'header';
        currentBlocks.push(mkBlock(el.text || '', STYLE.docTitle));
        break;
      }
      case 'section': {
        flush();
        const headingText = [el.number, el.heading].filter(Boolean).join('. ').replace(/\.\s*\./g, '.').trim();
        currentTitle = headingText;
        currentType = sectionTypeForElement(el);
        currentBlocks.push(pushHeading(headingText));
        break;
      }
      case 'subheading': {
        const headingText = [el.number, el.heading].filter(Boolean).join(' ').trim();
        currentBlocks.push(mkBlock(headingText, STYLE.subheading));
        break;
      }
      case 'paragraph': {
        currentBlocks.push(mkBlock(el.text || '', STYLE.paragraph));
        break;
      }
      case 'quote': {
        currentBlocks.push(mkBlock(el.text || '', STYLE.quote));
        break;
      }
      case 'enumeration': {
        // Cada ítem conserva su numeración original literal; un bloque por ítem (lista real).
        for (const item of el.items || []) {
          currentBlocks.push(mkBlock(item, STYLE.paragraph));
        }
        break;
      }
      case 'table': {
        const rows = el.rows || [];
        if (rows.length >= 2) {
          const headers = rows[0];
          const dataRows = rows.slice(1);
          const structuredParts: string[] = [];
          for (const row of dataRows) {
            const titleCol = row[0] || '';
            const fields: string[] = [];
            for (let i = 1; i < row.length; i++) {
              const headerLabel = headers[i] || `Columna ${i + 1}`;
              const val = row[i] || '';
              if (val) fields.push(`**${headerLabel}:** ${val}`);
            }
            const blockTitle = titleCol.startsWith('###') ? titleCol : `### ${titleCol}`;
            structuredParts.push(`${blockTitle}\n${fields.join('\n')}`);
          }
          const structuredText = structuredParts.join('\n\n');
          currentBlocks.push(mkBlock(structuredText, STYLE.paragraph));
        } else {
          const text = rows.map((r) => r.join(' | ')).join('\n');
          if (text.trim()) currentBlocks.push(mkBlock(text, STYLE.table));
        }
        break;
      }
      case 'internal_note': {
        currentBlocks.push(mkBlock(el.text || '', STYLE.internalNote));
        currentWarnings.push(`Nota editorial detectada (no forma parte del escrito final): "${(el.text || '').slice(0, 120)}"`);
        break;
      }
      case 'petition': {
        flush();
        currentTitle = [el.number, el.heading].filter(Boolean).join('. ').trim() || 'PETITORIOS';
        currentType = 'petition';
        currentBlocks.push(pushHeading(currentTitle));
        break;
      }
      case 'signature': {
        flush();
        currentTitle = 'Firma';
        currentType = 'signature';
        currentBlocks.push(mkBlock(el.text || '', STYLE.signature));
        break;
      }
      default:
        break;
    }
  }
  flush();

  const parties = analysis.parties || [];
  const roleValue = (...roles: string[]): string | undefined => {
    for (const r of roles) {
      const found = parties.find((p) => p.role.toLowerCase().includes(r));
      if (found?.name) return found.name;
    }
    return undefined;
  };

  const doc = createEmptyDocument({
    title: analysis.title || sources[0]?.name?.replace(/\.[^/.]+$/, '') || 'Escrito jurídico formateado',
    documentType: analysis.documentType || 'escrito_juridico',
    documentTypeLabel: analysis.title || 'Escrito jurídico formateado',
    matter: analysis.header.matter || undefined,
    jurisdiction: (analysis.header as any).jurisdiction || analysis.header.court || undefined,
    defaultFontFamily: SERIF,
    defaultFontSize: '12pt',
    defaultLineHeight: '1.6',
    sourceDocuments: sources,
    status: 'draft',
    originalFormat: sources[0]?.type === 'pdf' ? 'pdf' : undefined,
  });

  doc.sections = sections.length > 0 ? sections : [mkSection('sec-fmt-empty', 'Documento sin contenido', 'custom', 1, [], [])];

  doc.parties = {
    quejoso: roleValue('quejoso', 'actor'),
    actor: roleValue('actor'),
    demandado: roleValue('demandado'),
    terceroInteresado: roleValue('tercero_interesado', 'tercero'),
    autoridadResponsable: roleValue('autoridad'),
  };
  doc.caseRefs = {
    expediente: analysis.header.caseNumber || undefined,
    tribunal: analysis.header.court || analysis.header.authority || undefined,
  };

  doc.generationMetadata.aiUsed = Boolean(opts?.aiUsed);
  doc.generationMetadata.aiProvider = opts?.aiProvider || null;
  doc.generationMetadata.aiModel = opts?.aiModel || null;
  doc.generationMetadata.pipelineState.isComplete = true;
  doc.generationMetadata.pipelineState.hasErrors = false;
  doc.generationMetadata.trace = [
    {
      step: 1,
      stage: 'format_legal_document',
      query: 'Formatear documento (sin reescritura)',
      references: [],
      note: `Estructura: ${analysis.source === 'ai' ? `NVIDIA (${opts?.aiModel || 'ia'})` : 'fallback determinístico'} · Perfil de estilo aplicado como referencia: ${opts?.lawyerProfile ? opts.lawyerProfile.preferredTone : 'default'} · Contenido: 100% original`,
    },
  ];

  // Advertencias editoriales a nivel documento
  const noteWarnings = sections.flatMap((s) => s.validationWarnings);
  if (noteWarnings.length > 0) {
    doc.validation.warnings.push(...noteWarnings.map((w) => ({ checkId: 'format_internal_note', message: w })));
  }

  return doc;
}

/* ── Validación de integridad en DOS NIVELES ─────────────────────────────── */

export interface FormatIntegrityReport {
  ok: boolean;
  sequentialOk: boolean;
  missingTokens: string[];
  checkedTokens: number;
  coveragePct: number;
}

function normalizeForComparison(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokenizeOrdered(text: string): string[] {
  return normalizeForComparison(text)
    .replace(/\s+/g, ' ')
    .match(/[a-z0-9]+/g)
    ?.filter((t) => t.length >= 2) || [];
}

/**
 * Nivel 1: comparación SECUENCIAL — la secuencia ordenada de tokens del texto
 * original debe aparecer completa y en orden dentro del texto formateado.
 * Nivel 2: conteo de frecuencias — ningún token puede perder apariciones.
 */
export function validateFormattingIntegrity(originalText: string, formatted: UniversalLegalDocument): FormatIntegrityReport {
  const formattedText = [
    formatted.title || '',
    ...formatted.sections.flatMap((s) => [s.title || '', ...s.content.map((b) => b.text)]),
  ].join('\n');

  const originalTokens = tokenizeOrdered(originalText);
  const formattedTokens = tokenizeOrdered(formattedText);

  // Nivel 1 — subsecuencia ordenada (greedy two-pointer)
  let i = 0;
  for (let j = 0; j < formattedTokens.length && i < originalTokens.length; j++) {
    if (formattedTokens[j] === originalTokens[i]) i++;
  }
  const sequentialOk = i >= originalTokens.length;

  // Nivel 2 — frecuencias
  const origCounts = new Map<string, number>();
  for (const t of originalTokens) origCounts.set(t, (origCounts.get(t) || 0) + 1);
  const fmtCounts = new Map<string, number>();
  for (const t of formattedTokens) fmtCounts.set(t, (fmtCounts.get(t) || 0) + 1);

  const missingTokens: Array<{ token: string; deficit: number }> = [];
  for (const [token, count] of origCounts) {
    const deficit = count - (fmtCounts.get(token) || 0);
    if (deficit > 0) missingTokens.push({ token, deficit });
  }
  missingTokens.sort((a, b) => b.deficit - a.deficit);
  const topMissing = missingTokens.slice(0, 25).map((m) => m.token);

  const totalWeight = originalTokens.length || 1;
  const lostWeight = missingTokens.reduce((acc, m) => acc + m.deficit, 0);
  const coveragePct = Math.max(0, Math.round(((totalWeight - lostWeight) / totalWeight) * 100));

  return {
    ok: sequentialOk && missingTokens.length === 0,
    sequentialOk,
    missingTokens: topMissing,
    checkedTokens: originalTokens.length,
    coveragePct,
  };
}
