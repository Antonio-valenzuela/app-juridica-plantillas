import { describe, expect, it } from 'vitest';
import {
  CURRENT_DOCUMENT_SCHEMA_VERSION,
  CURRENT_GENERATION_METADATA_SCHEMA_VERSION,
  stampDocumentVersions,
  upgradeDocumentVersions,
} from '@/lib/legal-engine/documentVersioning';

describe('document versioning', () => {
  it('stamps current document and generation metadata versions deterministically', () => {
    const result = stampDocumentVersions({
      id: 'doc-versioned',
      generationMetadata: { pipelineState: {} },
    });

    expect(result.documentSchemaVersion).toBe(CURRENT_DOCUMENT_SCHEMA_VERSION);
    expect(result.generationMetadata.schemaVersion).toBe(CURRENT_GENERATION_METADATA_SCHEMA_VERSION);
  });

  it('upgrades a legacy artifact without changing its identity or fields', () => {
    const result = upgradeDocumentVersions({ id: 'doc-legacy', title: 'Fuente', generationMetadata: {} });

    expect(result).toMatchObject({
      id: 'doc-legacy',
      title: 'Fuente',
      documentSchemaVersion: CURRENT_DOCUMENT_SCHEMA_VERSION,
      generationMetadata: { schemaVersion: CURRENT_GENERATION_METADATA_SCHEMA_VERSION },
    });
  });

  it('fails closed for a future artifact version', () => {
    expect(() => upgradeDocumentVersions({
      id: 'doc-future',
      documentSchemaVersion: CURRENT_DOCUMENT_SCHEMA_VERSION + 1,
      generationMetadata: {},
    })).toThrowError(/DOCUMENT_VERSION_UNSUPPORTED/);
  });
});
