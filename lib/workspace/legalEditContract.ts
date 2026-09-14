import type {
  UniversalLegalDocument,
  DocumentNode,
  ContentBlock,
} from '@/lib/legal-engine/types';
import { extractPendingFieldMarkers, normalizeUnresolvedFieldMarkers } from '@/lib/legal-engine/pendingFields';

/* ============================================================================
   CONTRATO DE EDICIÓN DEL ASISTENTE LEGAL IA (burbuja ↔ borrador actual)

   Ruta real de mutación:
   IA → operaciones tipadas → applyLegalEdits() (puro)
      → estado del editor (onUpdateDocument) → persistencia (/api/legal-drafts)

   Este módulo es PURO: sin acceso a red, DOM ni Prisma, testeable en aislamiento.
   No altera el motor jurídico ni la identidad documental del borrador.
   ========================================================================== */

export type LegalEditOperationType =
  | 'replace_text'
  | 'replace_field'
  | 'replace_section'
  | 'insert_after'
  | 'insert_before';

export interface LegalEditOperation {
  documentId?: string;
  sectionId?: string;
  operation: LegalEditOperationType;
  target: string;
  replacement: string;
  reason?: string;
}

export interface AppliedLegalEdit {
  sectionId: string;
  sectionTitle: string;
  blockId: string;
  operation: LegalEditOperationType;
  replacement: string;
  reason?: string;
}

export interface FailedLegalEdit {
  reason:
    | 'document_mismatch'
    | 'target_not_found'
    | 'section_not_found'
    | 'duplicate_skipped'
    | 'empty_replacement';
  detail: string;
  operation: LegalEditOperation;
}

export interface LegalEditApplicationResult {
  document: UniversalLegalDocument | null;
  applied: AppliedLegalEdit[];
  failed: FailedLegalEdit[];
}

/** Marcador obligatorio cuando un dato no puede confirmarse desde el contexto. */
export const UNCONFIRMED_PLACEHOLDER = '[DATO NO CONFIRMADO]';

/** Metadata interna prohibida dentro del contenido jurídico (Fase 14 del protocolo). */
const FORBIDDEN_INTERNAL_MARKERS = [
  'OBJETIVO DEL BLOQUE',
  'TIPO DE BLOQUE',
  'CONTEXTO ANTERIOR',
  'CONTEXTO POSTERIOR',
  'TEORÍA DEL CASO',
  'HECHOS RELEVANTES PARA ESTE BLOQUE',
  'TEXTO ORIGINAL DEL BLOQUE',
  'CONTENIDO ORIGINAL DEL BLOQUE',
  'FRAGMENTOS DEL EXPEDIENTE RECUPERADOS',
];

export function containsForbiddenInternalMetadata(text: string): boolean {
  if (!text) return false;
  const upper = text.toUpperCase();
  return FORBIDDEN_INTERNAL_MARKERS.some((m) => upper.includes(m));
}

/* ---------------------------------------------------------------------------
   CLASIFICADOR DE INTENCIÓN (consulta / propuesta / edición)
   Determinista; orden de evaluación: EDICIÓN > PROPUESTA > CONSULTA.
   --------------------------------------------------------------------------- */

export type AssistantIntent = 'consulta' | 'propuesta' | 'edicion';

const EDIT_RE =
  /\b(rellena\w*|completa\w*|llena\w*|edita\w*|corrige\w*|aplica\w*|modifica\w*|reemplaza\w*|sustituy[ee]\w*|inserta\w*|actualiza\w*|guarda\w*|haz\s+los?\s+cambios|hazlo\s+en\s+el\s+documento|escribe\w*\s+(ese|este|el|la|los|las)\s+.+\s+en\s+el\s+documento)\b/i;

const PROPOSE_RE =
  /\b(prop[oó]n\w*|propuesta\w*|propo[nr]\w*|sug[ie]{1,2}r\w*|sugerencia\w*|qu[eé]\s+pondr[ií]as|muestra\s+c[oó]mo\s+quedar[ií]a|c[oó]mo\s+quedar[ií]a)\b/i;

export function classifyAssistantIntent(message: string): AssistantIntent {
  const msg = (message || '').trim();
  if (!msg) return 'consulta';
  // La interrogativa pura nunca edita, aunque contenga verbos de cambio.
  const isQuestionOnly = /^(¿|que\b|qu[eé]\b)/i.test(msg) && /\?/.test(msg) && !/rellena|completa|aplica|guarda/i.test(msg);
  if (!isQuestionOnly && EDIT_RE.test(msg)) return 'edicion';
  if (PROPOSE_RE.test(msg)) return 'propuesta';
  return 'consulta';
}

/* ---------------------------------------------------------------------------
   EXTRACCIÓN DE PLACEHOLDERS ([CAMPO PENDIENTE...])
   --------------------------------------------------------------------------- */

const PLACEHOLDER_RE = /\[[A-ZÁÉÍÓÚÑÜ0-9_\-.,:\s]{2,80}\]/g;

export function extractPlaceholders(doc: UniversalLegalDocument): string[] {
  const found = new Set<string>();
  doc.sections.forEach((sec) => {
    sec.content.forEach((b) => {
      const normalizedText = normalizeUnresolvedFieldMarkers(b.text);
      extractPendingFieldMarkers(normalizedText).forEach((marker) => found.add(marker));
      const matches = normalizedText.match(PLACEHOLDER_RE);
      if (matches) matches.forEach((m) => found.add(m.trim()));
    });
  });
  return Array.from(found).slice(0, 120);
}

export function fullDocumentText(doc: UniversalLegalDocument): string {
  return doc.sections
    .map((s) => s.content.map((b) => b.text).join('\n\n'))
    .join('\n\n');
}

function makeAiBlock(text: string): ContentBlock {
  return {
    id: `blk-ai-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    layer: 'AI_ANALYSIS',
    trustLevel: 'AI_INFERENCE',
    trust: 'AI_INFERENCE',
    text,
    isManuallyEdited: false,
    createdAt: new Date().toISOString(),
  };
}

function resolveSection(
  doc: UniversalLegalDocument,
  sectionId?: string
): DocumentNode | null {
  if (!sectionId) return null;
  const byId = doc.sections.find((s) => s.id === sectionId);
  if (byId) return byId;
  const byTitle = doc.sections.find(
    (s) => s.title.trim().toLowerCase() === sectionId.trim().toLowerCase()
  );
  return byTitle || null;
}

function sectionsToProcess(doc: UniversalLegalDocument, sectionId?: string): DocumentNode[] {
  const sec = resolveSection(doc, sectionId);
  return sec ? [sec] : doc.sections;
}

function cloneSections(sections: DocumentNode[]): DocumentNode[] {
  return sections.map((s) => ({ ...s, content: s.content.map((b) => ({ ...b })) }));
}

function isDuplicateText(sections: DocumentNode[], candidate: string): boolean {
  const c = candidate.trim();
  if (!c) return false;
  return sections.some((s) => s.content.some((b) => b.text.trim() === c));
}

/* ---------------------------------------------------------------------------
   APLICADOR DE OPERACIONES SOBRE EL DOCUMENTO REAL
   ------------------------------------------------------------------------- */

export function applyLegalEdits(
  baseDoc: UniversalLegalDocument,
  operations: LegalEditOperation[],
  opts?: { expectedDraftId?: string }
): LegalEditApplicationResult {
  const applied: AppliedLegalEdit[] = [];
  const failed: FailedLegalEdit[] = [];

  // Identidad válida dual: id interno del documento Y draft persistido (si se conoce).
  const validDocumentIds = new Set(
    [baseDoc.id, opts?.expectedDraftId].filter(Boolean) as string[]
  );

  const sections = cloneSections(baseDoc.sections);

  for (const op of operations || []) {
    if (
      op.documentId &&
      !validDocumentIds.has(op.documentId)
    ) {
      failed.push({ reason: 'document_mismatch', detail: `documentId ${op.documentId} ≠ ${[...validDocumentIds].join(' | ')}`, operation: op });
      continue;
    }
    if (!op.replacement || !op.replacement.trim()) {
      failed.push({ reason: 'empty_replacement', detail: op.target, operation: op });
      continue;
    }
    if (containsForbiddenInternalMetadata(op.replacement)) {
      failed.push({ reason: 'target_not_found', detail: 'replacement con metadata interna prohibida', operation: op });
      continue;
    }

    const targets = sectionsToProcess({ ...baseDoc, sections }, op.sectionId);
    let done = false;

    if (op.operation === 'replace_field') {
      const raw = op.target.trim();
      const tokenized = raw.startsWith('[') ? raw : `[${raw}]`;
      const patterns = [tokenized];
      if (raw !== tokenized) patterns.push(raw);
      for (const sec of targets) {
        for (let bi = 0; bi < sec.content.length; bi++) {
          const block = sec.content[bi];
          let next = block.text;
          for (const p of patterns) next = next.split(p).join(op.replacement);
          if (next !== block.text) {
            sec.content[bi] = { ...block, text: next, isManuallyEdited: true, provenance: 'USER_EDITED', layer: 'USER_POSITION', trustLevel: 'VERIFIED' };
            applied.push({ sectionId: sec.id, sectionTitle: sec.title, blockId: block.id, operation: op.operation, replacement: op.replacement, reason: op.reason });
            done = true;
          }
        }
      }
      if (!done) {
        // Último recurso: variable nombrada del documento.
        const varKey = Object.keys(baseDoc.variables || {}).find(
          (k) => k.toLowerCase() === raw.toLowerCase().replace(/[\[\]]/g, '')
        );
        if (varKey && (baseDoc.variables[varKey].value == null)) {
          failed.push({ reason: 'target_not_found', detail: `${op.target} no presente en bloques; variable declarada sin valor`, operation: op });
        } else {
          failed.push({ reason: 'target_not_found', detail: op.target, operation: op });
        }
      }
      continue;
    }

    if (op.operation === 'replace_text') {
      for (const sec of targets) {
        for (let bi = 0; bi < sec.content.length; bi++) {
          const block = sec.content[bi];
          if (block.text.includes(op.target)) {
            sec.content[bi] = {
              ...block,
              text: block.text.replace(op.target, op.replacement),
              isManuallyEdited: true,
              provenance: 'USER_EDITED',
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
            };
            applied.push({ sectionId: sec.id, sectionTitle: sec.title, blockId: block.id, operation: op.operation, replacement: op.replacement, reason: op.reason });
            done = true;
            break;
          }
        }
        if (done) break;
      }
      if (!done) failed.push({ reason: 'target_not_found', detail: op.target.slice(0, 80), operation: op });
      continue;
    }

    if (op.operation === 'replace_section') {
      const sec = resolveSection({ ...baseDoc, sections }, op.sectionId);
      if (!sec) {
        failed.push({ reason: 'section_not_found', detail: op.sectionId || '(sin sectionId)', operation: op });
        continue;
      }
      if (isDuplicateText([sec], op.replacement)) {
        failed.push({ reason: 'duplicate_skipped', detail: sec.id, operation: op });
        continue;
      }
      const style = sec.content[0]?.style;
      const newBlock = makeAiBlock(op.replacement);
      newBlock.provenance = 'USER_EDITED';
      newBlock.layer = 'USER_POSITION';
      newBlock.trustLevel = 'VERIFIED';
      newBlock.trust = 'VERIFIED';
      if (style) newBlock.style = style;
      sec.content = [newBlock];
      sec.isManuallyEdited = true;
      applied.push({ sectionId: sec.id, sectionTitle: sec.title, blockId: newBlock.id, operation: op.operation, replacement: op.replacement.slice(0, 200), reason: op.reason });
      done = true;
      continue;
    }

    if (op.operation === 'insert_after' || op.operation === 'insert_before') {
      const anchorSecs = op.sectionId
        ? [resolveSection({ ...baseDoc, sections }, op.sectionId)].filter(Boolean as unknown as (v: DocumentNode | null) => v is DocumentNode)
        : sections;
      outer: for (const sec of anchorSecs) {
        for (let bi = 0; bi < sec.content.length; bi++) {
          const block = sec.content[bi];
          if (!op.target || block.text.includes(op.target)) {
            if (isDuplicateText([sec], op.replacement)) {
              failed.push({ reason: 'duplicate_skipped', detail: sec.id, operation: op });
              done = true;
              break outer;
            }
            const newBlock = makeAiBlock(op.replacement);
            newBlock.provenance = 'USER_EDITED';
            newBlock.layer = 'USER_POSITION';
            newBlock.trustLevel = 'VERIFIED';
            newBlock.trust = 'VERIFIED';
            const at = op.operation === 'insert_after' ? bi + 1 : bi;
            sec.content.splice(at, 0, newBlock);
            sec.isManuallyEdited = true;
            applied.push({ sectionId: sec.id, sectionTitle: sec.title, blockId: newBlock.id, operation: op.operation, replacement: op.replacement.slice(0, 200), reason: op.reason });
            done = true;
            break outer;
          }
        }
      }
      if (!done) failed.push({ reason: 'target_not_found', detail: op.target?.slice(0, 80) || '(ancla vacía)', operation: op });
      continue;
    }

    failed.push({ reason: 'target_not_found', detail: `operación desconocida: ${(op as any).operation}`, operation: op });
  }

  if (applied.length === 0) {
    return { document: null, applied, failed };
  }

  const updatedDoc: UniversalLegalDocument = {
    ...baseDoc,
    sections,
    updatedAt: new Date().toISOString(),
  };
  return { document: updatedDoc, applied, failed };
}

/* ---------------------------------------------------------------------------
   SNAPSHOT ESTRUCTURADO PARA EL CONTEXTO DE LA BURBUJA (FASE 4)
   Entrega al modelo lo mínimo suficiente para localizar y editar el target.
   --------------------------------------------------------------------------- */

export interface WorkspaceDraftSnapshot {
  draftId: string;
  templateId?: string;
  documentId: string;
  documentType: string;
  templateName: string;
  matter?: string;
  jurisdiction?: string;
  previewText: string;
  pendingMarkers: string[];
  fields: Record<string, string>;
  sectionsIndex: Record<string, string>;
}

export function buildWorkspaceSnapshot(
  doc: UniversalLegalDocument,
  draftId: string
): WorkspaceDraftSnapshot {
  const fields: Record<string, string> = {};
  const push = (k: string, v: unknown) => {
    const val = typeof v === 'string' ? v.trim() : v != null ? String(v) : '';
    if (val && val.toUpperCase() !== UNCONFIRMED_PLACEHOLDER) fields[k] = val;
  };
  Object.entries(doc.parties || {}).forEach(([k, v]) => push(`partie_${k}`, v));
  Object.entries(doc.caseRefs || {}).forEach(([k, v]) => push(`case_${k}`, v));
  Object.entries(doc.variables || {}).forEach(([k, v]) => {
    if (v && typeof v === 'object' && 'value' in v) push(k, (v as any).value);
  });

  const sectionsIndex: Record<string, string> = {};
  doc.sections.forEach((s) => {
    sectionsIndex[s.id] = s.title;
  });

  return {
    draftId,
    templateId: doc.templateId,
    documentId: draftId || doc.id,
    documentType: doc.documentType,
    templateName: doc.title,
    matter: doc.matter,
    jurisdiction: doc.jurisdiction,
    previewText: fullDocumentText(doc).slice(0, 24000),
    pendingMarkers: extractPlaceholders(doc),
    fields,
    sectionsIndex,
  };
}
