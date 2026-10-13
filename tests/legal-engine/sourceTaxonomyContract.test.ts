import { describe, expect, it } from 'vitest';
import { isSourceDocumentType, normalizeSourceDocumentType } from '@/lib/legal-engine/sourceDocumentTypes';
import { visibleWritingTypes } from '@/lib/catalog/writingTypeIdentity';
import { evaluateSourceOutputCompatibility } from '@/lib/legal-engine/sourceOutputCompatibility';
import { createSourceDocument } from '@/lib/legal-engine/context';

describe('contrato catálogo ↔ taxonomía de fuentes', () => {
  it('toda fuente que el catálogo acepta, exige u ofrece existe en la taxonomía', () => {
    const orphans: string[] = [];
    for (const identity of visibleWritingTypes()) {
      const { acceptedSourceTypes, optionalSourceTypes, requiredSourceTypes } = identity.compatibleSources as {
        acceptedSourceTypes: readonly string[]; optionalSourceTypes?: readonly string[]; requiredSourceTypes?: readonly string[];
      };
      for (const type of [...acceptedSourceTypes, ...(optionalSourceTypes || []), ...(requiredSourceTypes || [])]) {
        if (!isSourceDocumentType(type)) orphans.push(`${identity.id} → ${type}`);
      }
    }
    // Una fuente aceptada que el sistema no puede producir deja al tipo sin ruta posible.
    expect(orphans).toEqual([]);
  });

  it('CONTRATO_MERCANTIL se reconoce y no se degrada a CONTRATO_CIVIL ni a desconocido', () => {
    expect(normalizeSourceDocumentType('CONTRATO_MERCANTIL')).toBe('CONTRATO_MERCANTIL');
    expect(normalizeSourceDocumentType('contrato mercantil')).toBe('CONTRATO_MERCANTIL');
  });

  it('una fuente declarada CONTRATO_MERCANTIL es compatible con un instrumento societario que la acepta', () => {
    const source = createSourceDocument({
      id: 'src-1', filename: 'contrato.txt', sourceValidated: true,
      content: 'CONTRATO MERCANTIL. CLÁUSULA PRIMERA. Las partes convienen el objeto social. '.repeat(4),
      classification: { sourceDocumentType: 'CONTRATO_MERCANTIL', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
    } as any);
    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'constitucion_sociedad', sourceDocuments: [source], sourceMatter: 'CORPORATIVO',
    } as any);
    expect(result.status).toBe('COMPATIBLE');
    expect(result.sourceDocumentType).toBe('CONTRATO_MERCANTIL');
  });

  it('una clasificación explícita desconocida SIGUE siendo desconocida (la compuerta no se relaja)', () => {
    const source = createSourceDocument({
      id: 'src-2', filename: 'x.txt', sourceValidated: true, content: 'TEXTO. '.repeat(20),
      classification: { sourceDocumentType: 'TIPO_QUE_NO_EXISTE', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
    } as any);
    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'constitucion_sociedad', sourceDocuments: [source], sourceMatter: 'CORPORATIVO',
    } as any);
    expect(result.status).toBe('NEEDS_INPUT');
    expect(result.code).toBe('SOURCE_TYPE_UNKNOWN');
  });
});
