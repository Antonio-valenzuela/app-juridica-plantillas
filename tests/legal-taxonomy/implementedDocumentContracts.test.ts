import { describe, expect, it } from 'vitest';
import { CANONICAL_DOCUMENT_TYPES, getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { DocumentTemplates } from '@/lib/legal-engine/documentTemplates';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';

const declaredImplemented = CANONICAL_DOCUMENT_TYPES.filter(
  (document) => document.status === 'IMPLEMENTED' && document.implemented,
);

describe('catalog-generated implemented document structural contracts', () => {
  it('keeps every canonical document identifier unique', () => {
    const ids = CANONICAL_DOCUMENT_TYPES.map((document) => document.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(declaredImplemented)('$id has an explicit non-fallback route and document contract', (document) => {
    const catalogEntry = getCatalogDocument(document.id);
    const template = DocumentTemplates[document.id];
    const route = resolveDocumentRouting({ selectedDocumentType: document.id });

    expect(catalogEntry?.kind).toBe('DOCUMENT_TYPE');
    expect(catalogEntry?.status).toBe('IMPLEMENTED');
    expect(document.sourceCompatibility).not.toBeNull();
    expect(Array.isArray(document.sourceCompatibility?.acceptedSourceTypes)).toBe(true);
    expect(template, `${document.id} must resolve to a template`).toBeDefined();
    expect(template?.tipo).toBe(document.id);
    expect(template?.estructura.length, `${document.id} must have sections`).toBeGreaterThan(0);
    expect(template?.camposObligatorios.length, `${document.id} must declare required fields`).toBeGreaterThan(0);
    expect(route.resolvedTemplate).toBe(document.id);
    expect(route.resolvedStrategy).toBe(document.id);
    expect(route.fallbackUsed).toBe(false);
  });
});
