import { describe, expect, it } from 'vitest';
import {
  canCreateTemplate,
  DOCUMENT_ENTITY_KINDS,
  isPersistableLocalTemplate,
  LIFECYCLE_METADATA_KEY,
  markDocumentEntity,
  markDocumentAsFinal,
  markTemplateEntity,
  readDocumentEntityKind,
  readDocumentLifecycle,
} from '../../lib/legal-engine/documentLifecycle';

describe('document lifecycle contract', () => {
  it('defines the document entity kinds in lifecycle order', () => {
    expect(DOCUMENT_ENTITY_KINDS).toEqual([
      'SOURCE_DOCUMENT',
      'DRAFT',
      'FINAL_DOCUMENT',
      'TEMPLATE',
      'REFERENCE_DOCUMENT',
    ]);
  });

  it('marks and reads source, draft, final, and template entities', () => {
    const source = markDocumentEntity({ id: 'source-1' }, 'SOURCE_DOCUMENT', {
      sourceId: 'source-1',
    });
    const draftInput = { id: 'draft-1' };
    const draft = markDocumentEntity(draftInput, 'DRAFT');
    const finalDoc = markDocumentAsFinal(draft, { explicit: true });
    const template = markTemplateEntity({ id: 'template-1' }, 'user');

    expect(readDocumentEntityKind(source)).toBe('SOURCE_DOCUMENT');
    expect(readDocumentEntityKind(draft)).toBe('DRAFT');
    expect(readDocumentEntityKind(finalDoc)).toBe('FINAL_DOCUMENT');
    expect(readDocumentEntityKind(template)).toBe('TEMPLATE');
    expect(readDocumentLifecycle(source)).toEqual({
      entityKind: 'SOURCE_DOCUMENT',
      sourceId: 'source-1',
    });
    expect(readDocumentLifecycle(template)).toEqual({
      entityKind: 'TEMPLATE',
      originClass: 'user',
      creationIntent: 'EXPLICIT_TEMPLATE',
    });
    expect(draftInput).toEqual({ id: 'draft-1' });
    expect(draft).not.toBe(draftInput);
    expect(draft).not.toBe(finalDoc);
    expect(readDocumentEntityKind(draft)).toBe('DRAFT');
    expect(draft[LIFECYCLE_METADATA_KEY]).toEqual({ entityKind: 'DRAFT' });
    expect(finalDoc[LIFECYCLE_METADATA_KEY]).toEqual({ entityKind: 'FINAL_DOCUMENT' });
  });

  it('validates entity kinds and template metadata at runtime without allowing extra to override the kind', () => {
    expect(() => markDocumentEntity({}, 'INVALID_KIND' as any)).toThrow(TypeError);
    expect(() => markDocumentEntity({}, 'FINAL_DOCUMENT')).toThrow(/expl[ií]cita/i);
    expect(() => markDocumentEntity({}, 'TEMPLATE' as any)).toThrow(TypeError);
    expect(() => markDocumentEntity({}, 'TEMPLATE' as any, { originClass: 'user' })).toThrow(TypeError);
    expect(() => markDocumentEntity({}, 'TEMPLATE' as any, {
      originClass: 'legacy',
      creationIntent: 'EXPLICIT_TEMPLATE',
    } as any)).toThrow(TypeError);

    const draft = markDocumentEntity({ id: 'draft-1' }, 'DRAFT', {
      entityKind: 'FINAL_DOCUMENT',
    } as any);

    expect(readDocumentEntityKind(draft)).toBe('DRAFT');
    expect(draft[LIFECYCLE_METADATA_KEY]).toEqual({ entityKind: 'DRAFT' });
  });

  it('requires an explicit template intent and rejects case documents', () => {
    expect(canCreateTemplate({ entityKind: 'SOURCE_DOCUMENT' })).toBe(false);
    expect(canCreateTemplate({ entityKind: 'DRAFT' })).toBe(false);
    expect(canCreateTemplate({ entityKind: 'FINAL_DOCUMENT' })).toBe(false);
    expect(canCreateTemplate({ entityKind: 'REFERENCE_DOCUMENT' })).toBe(false);
    expect(canCreateTemplate({ entityKind: 'TEMPLATE' })).toBe(false);
    expect(canCreateTemplate({ entityKind: 'TEMPLATE', creationIntent: 'EXPLICIT_TEMPLATE' })).toBe(true);
    expect(canCreateTemplate(null)).toBe(false);
    expect(canCreateTemplate(undefined)).toBe(false);
    expect(canCreateTemplate('TEMPLATE')).toBe(false);
  });

  it('rejects legacy template origins at runtime', () => {
    expect(() => markTemplateEntity({ id: 'legacy-template' }, 'legacy' as any)).toThrow(TypeError);
  });

  it('rejects converting a marked source document into a template', () => {
    const caseDocument = markDocumentEntity({
      id: 'case-1',
      content: 'confidential case content',
      sections: ['case section'],
    }, 'SOURCE_DOCUMENT');

    expect(() => markTemplateEntity(caseDocument, 'user')).toThrow(TypeError);
    expect(readDocumentEntityKind(caseDocument)).toBe('SOURCE_DOCUMENT');
    expect(caseDocument.content).toBe('confidential case content');
    expect(caseDocument.sections).toEqual(['case section']);
  });

  it('rejects marked source documents in top-level and conflicting lifecycle representations', () => {
    const topLevelSource = {
      id: 'top-source-1',
      lifecycle: { entityKind: 'SOURCE_DOCUMENT' as const },
      content: 'top-level source content',
      sections: ['top-level source section'],
    };
    const conflictingDocument = {
      id: 'conflict-1',
      [LIFECYCLE_METADATA_KEY]: {
        entityKind: 'TEMPLATE' as const,
        originClass: 'user' as const,
        creationIntent: 'EXPLICIT_TEMPLATE' as const,
      },
      lifecycle: { entityKind: 'SOURCE_DOCUMENT' as const },
    };

    expect(() => markTemplateEntity(topLevelSource, 'user')).toThrow(TypeError);
    expect(() => markTemplateEntity(conflictingDocument, 'user')).toThrow(TypeError);
    expect(readDocumentEntityKind(topLevelSource)).toBe('SOURCE_DOCUMENT');
    expect(readDocumentLifecycle(conflictingDocument)).toBeNull();
  });

  it('reads top-level lifecycle and fails closed for conflicts or corrupt metadata', () => {
    expect(readDocumentLifecycle({
      lifecycle: { entityKind: 'SOURCE_DOCUMENT' },
    })).toEqual({ entityKind: 'SOURCE_DOCUMENT' });
    expect(readDocumentEntityKind({
      lifecycle: { entityKind: 'DRAFT' },
    })).toBe('DRAFT');
    expect(readDocumentLifecycle({
      [LIFECYCLE_METADATA_KEY]: { entityKind: 'SOURCE_DOCUMENT' },
      lifecycle: { entityKind: 'DRAFT' },
    })).toBeNull();
    expect(readDocumentLifecycle({
      [LIFECYCLE_METADATA_KEY]: { entityKind: 'NOT_A_DOCUMENT_KIND' },
    })).toBeNull();
    expect(readDocumentLifecycle({
      lifecycle: { entityKind: 'DRAFT', creationIntent: 'NOT_EXPLICIT' },
    })).toBeNull();
  });

  it('accepts the numeric template metadata version without returning it', () => {
    const versionedTemplate = {
      [LIFECYCLE_METADATA_KEY]: {
        entityKind: 'TEMPLATE',
        originClass: 'user',
        creationIntent: 'EXPLICIT_TEMPLATE',
        version: 1,
      },
    };

    expect(readDocumentLifecycle(versionedTemplate)).toEqual({
      entityKind: 'TEMPLATE',
      originClass: 'user',
      creationIntent: 'EXPLICIT_TEMPLATE',
    });
    expect(readDocumentEntityKind(versionedTemplate)).toBe('TEMPLATE');
    expect(readDocumentLifecycle({
      [LIFECYCLE_METADATA_KEY]: { ...versionedTemplate[LIFECYCLE_METADATA_KEY], version: '1' },
    })).toBeNull();
    expect(readDocumentLifecycle({
      [LIFECYCLE_METADATA_KEY]: { ...versionedTemplate[LIFECYCLE_METADATA_KEY], unknown: true },
    })).toBeNull();
  });

  it('fails closed for invalid lifecycle versions and ignores version differences semantically', () => {
    const validMetadata = {
      entityKind: 'TEMPLATE' as const,
      originClass: 'user' as const,
      creationIntent: 'EXPLICIT_TEMPLATE' as const,
    };

    for (const version of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1, 0, Number.MAX_SAFE_INTEGER + 1]) {
      expect(readDocumentLifecycle({
        [LIFECYCLE_METADATA_KEY]: { ...validMetadata, version },
      })).toBeNull();
    }

    expect(readDocumentLifecycle({
      [LIFECYCLE_METADATA_KEY]: { ...validMetadata, version: 1 },
      lifecycle: { ...validMetadata, version: 2 },
    })).toEqual(validMetadata);
  });

  it('rejects corrupt or conflicting lifecycle metadata before marking and leaves the root untouched', () => {
    const values = [
      {
        id: 'corrupt-canonical',
        [LIFECYCLE_METADATA_KEY]: { entityKind: 'NOT_A_DOCUMENT_KIND' },
      },
      {
        id: 'corrupt-top-level',
        lifecycle: { entityKind: 'NOT_A_DOCUMENT_KIND' },
      },
      {
        id: 'conflicting-channels',
        [LIFECYCLE_METADATA_KEY]: { entityKind: 'DRAFT' as const },
        lifecycle: { entityKind: 'FINAL_DOCUMENT' as const },
      },
    ];

    for (const value of values) {
      const snapshot = structuredClone(value);

      expect(() => markDocumentEntity(value, 'DRAFT')).toThrow(TypeError);
      expect(value).toEqual(snapshot);

      expect(() => markTemplateEntity(value, 'user')).toThrow(TypeError);
      expect(value).toEqual(snapshot);
    }
  });

  it('rejects already marked templates in either lifecycle channel without mutating the root', () => {
    const values = [
      {
        id: 'canonical-template',
        [LIFECYCLE_METADATA_KEY]: {
          entityKind: 'TEMPLATE' as const,
          originClass: 'user' as const,
          creationIntent: 'EXPLICIT_TEMPLATE' as const,
        },
      },
      {
        id: 'top-level-template',
        lifecycle: {
          entityKind: 'TEMPLATE' as const,
          originClass: 'user' as const,
          creationIntent: 'EXPLICIT_TEMPLATE' as const,
        },
      },
    ];

    for (const value of values) {
      const snapshot = structuredClone(value);

      expect(() => markTemplateEntity(value, 'user')).toThrow(TypeError);
      expect(value).toEqual(snapshot);
    }
  });

  it('marks an untagged template structure without stripping legitimate fields', () => {
    const structureJson = {
      nombre: 'Plantilla aislada',
      tipo_documento: 'escrito_libre',
      campos: [{ id: 'expediente', etiqueta: 'Expediente', tipo: 'text', obligatorio: true }],
    };
    const template = markTemplateEntity(structureJson, 'user');

    expect(template).toMatchObject(structureJson);
    expect(template[LIFECYCLE_METADATA_KEY]).toMatchObject({
      entityKind: 'TEMPLATE',
      originClass: 'user',
      creationIntent: 'EXPLICIT_TEMPLATE',
    });
  });

  it('only treats explicitly marked system, user, and test/demo templates as persistable locally', () => {
    expect(isPersistableLocalTemplate(markTemplateEntity({ id: 'system-1' }, 'system'))).toBe(true);
    expect(isPersistableLocalTemplate(markTemplateEntity({ id: 'user-1' }, 'user'))).toBe(true);
    expect(isPersistableLocalTemplate(markTemplateEntity({ id: 'demo-1' }, 'test_demo'))).toBe(true);
    expect(isPersistableLocalTemplate({
      [LIFECYCLE_METADATA_KEY]: {
        entityKind: 'TEMPLATE',
        originClass: 'legacy',
        creationIntent: 'EXPLICIT_TEMPLATE',
      },
    })).toBe(false);
    expect(isPersistableLocalTemplate({
      [LIFECYCLE_METADATA_KEY]: {
        entityKind: 'TEMPLATE',
        originClass: 'user',
      },
    })).toBe(false);
    expect(isPersistableLocalTemplate({ id: 'unmarked-1' })).toBe(false);
  });
});
