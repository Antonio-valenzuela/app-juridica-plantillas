/**
 * lib/legal-engine/legalGenerationContext.ts
 * G5 — Contexto jurídico canónico (único objeto conceptual).
 * Reúne todo lo que llega a generación sin inventar datos faltantes.
 * No asume CDMX, materia, jurisdicción, tipo, autoridad si el usuario no los proporcionó.
 */

import type { LegalTaxonomySelection } from '@/lib/legal-taxonomy';
import type { LawyerProfile } from '@/lib/workspace/lawyerProfileTypes';
import type { UploadedSourceDocument } from './types';

export interface LegalGenerationContext {
  // Taxonomía centralizada (efectiva, con custom Otro ya resuelto)
  taxonomy?: LegalTaxonomySelection | null;
  matter?: string | null; // effective label
  jurisdiction?: string | null;
  documentType?: string | null;
  procedure?: string | null;
  authority?: string | null;

  // Expediente
  parties?: Record<string, string | null>;
  caseNumber?: string | null;
  sourceDocuments?: UploadedSourceDocument[];
  selectedFragments?: string[];

  // Perfil y plantilla
  lawyerProfile?: LawyerProfile | null;
  templateId?: string | null;
  templateText?: string | null;

  // Instrucciones
  instructions?: string | null;
  userInstruction?: string | null;

  // Metadata técnica (no inventar)
  generationId?: string;
  requestId?: string;
}

export function buildLegalGenerationContext(input: {
  taxonomy?: LegalTaxonomySelection | null;
  matter?: string | null;
  jurisdiction?: string | null;
  documentType?: string | null;
  procedure?: string | null;
  authority?: string | null;
  parties?: Record<string, string | null>;
  caseNumber?: string | null;
  sourceDocuments?: UploadedSourceDocument[];
  selectedFragments?: string[];
  lawyerProfile?: LawyerProfile | null;
  templateId?: string | null;
  templateText?: string | null;
  instructions?: string | null;
  userInstruction?: string | null;
  generationId?: string;
  requestId?: string;
}): LegalGenerationContext {
  // No inventar: solo pasar lo recibido, sanitizado
  const sanitize = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 500) || null : (v as any) ?? null);
  return {
    taxonomy: input.taxonomy || null,
    matter: sanitize(input.matter),
    jurisdiction: sanitize(input.jurisdiction),
    documentType: sanitize(input.documentType),
    procedure: sanitize(input.procedure),
    authority: sanitize(input.authority),
    parties: input.parties || undefined,
    caseNumber: sanitize(input.caseNumber),
    sourceDocuments: input.sourceDocuments || [],
    selectedFragments: input.selectedFragments || [],
    lawyerProfile: input.lawyerProfile || null,
    templateId: input.templateId || null,
    templateText: input.templateText ? sanitize(input.templateText.slice(0, 8000)) : null,
    instructions: sanitize(input.instructions),
    userInstruction: sanitize(input.userInstruction),
    generationId: input.generationId || undefined,
    requestId: input.requestId || undefined,
  };
}

/**
 * Distingue FUENTE / INFERENCIA / REDACCIÓN (G6)
 * Ninguna inferencia debe presentarse como cita verificada.
 */
export type LegalProvenance = 'FUENTE' | 'INFERENCIA' | 'REDACCION';

export function labelWithProvenance(text: string, provenance: LegalProvenance): string {
  if (provenance === 'FUENTE') return text;
  if (provenance === 'INFERENCIA') return `${text} [INFERENCIA — verificar con fuente oficial]`;
  return `${text} [REDACCIÓN IA]`;
}
