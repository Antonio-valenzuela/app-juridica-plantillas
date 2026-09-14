import type { DocumentLifecycleMetadata } from '../legal-engine/documentLifecycle';

export type TemplateCategory = 'Amparo' | 'Civil' | 'Familiar' | 'Mercantil' | 'Administrativo/Fiscal' | 'General';

export type TemplateFieldType = 'text' | 'textarea' | 'select' | 'repeatable' | 'list' | 'date' | 'number';

export interface TemplateFieldDefinition {
  id: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  repeatLabel?: string;
  legalBasis?: string;
}

export interface TemplateStructure {
  nombre: string;
  tipo_documento: string;
  campos: Array<{
    id: string;
    etiqueta: string;
    tipo: TemplateFieldType;
    obligatorio: boolean;
    placeholder?: string;
    helpText?: string;
    options?: string[];
    repeatLabel?: string;
  }>;
}

export interface TemplateSection {
  id: string;
  title: string;
  type: TemplateFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  repeatLabel?: string;
  legalBasis?: string;
}

export interface ProfessionalTemplate {
  id: string;
  lifecycle?: DocumentLifecycleMetadata;
  category: TemplateCategory;
  title: string;
  description: string;
  legalBasis: string;
  documentType?: string;
  applicableLaws: string[];
  warnings: string[];
  disclaimer: string;
  exportFormats: string[];
  structureJson?: TemplateStructure;
  /** Semantic variables for a personal template; kept alongside the legacy schema. */
  variables?: unknown;
  sections: TemplateSection[];
  originalText?: string;
  sourceFileName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AIAssistResult {
  proposedText: string;
  sourcesUsed: {
    sourceId: string;
    title: string;
    url: string;
    type: 'ley' | 'jurisprudencia';
  }[];
  pendingElements: string[];
  warnings: string[];
  confidenceLevel: 'alto' | 'medio' | 'bajo';
}

export interface RenderedDocument {
  title: string;
  /** Optional identity used to reject universal canonical IDs on this legacy DTO. */
  documentType?: string;
  header: string;
  expediente?: string;
  body: string;
  sections: {
    title: string;
    content: string | string[];
    numbered?: boolean;
  }[];
  footer: string;
  warnings: string[];
  disclaimer: string;
  generatedAt: string;
}
