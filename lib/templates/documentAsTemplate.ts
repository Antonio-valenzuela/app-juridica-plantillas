import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

export interface DocumentTemplateSource {
  item: {
    id: string;
    name: string;
    category: string;
    documentType?: string;
    version: number;
    description: string;
    updatedAt: string;
    content: string;
  };
  text: string;
}

/**
 * «Generar con Machote» sobre un escrito abierto: el escrito pasa por la misma experiencia
 * «Usar mi plantilla (diseño y estructura)» que una plantilla guardada. Su texto es el
 * original que el filtro anti-arrastre usa para detectar datos del caso anterior.
 */
export function documentAsTemplateSource(doc: UniversalLegalDocument): DocumentTemplateSource {
  const text = doc.sections
    .map((section) => [section.title, ...section.content.map((block) => block.text)].filter((part) => part?.trim()).join('\n'))
    .join('\n\n');
  const name = doc.title?.trim() || doc.documentTypeLabel || 'Escrito abierto';
  return {
    text,
    item: {
      id: doc.id,
      name,
      category: doc.documentTypeLabel || 'Escrito',
      documentType: doc.documentType,
      version: 1,
      description: 'Escrito abierto usado como plantilla.',
      updatedAt: new Date().toISOString(),
      content: text,
    },
  };
}
