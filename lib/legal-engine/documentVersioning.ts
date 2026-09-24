export const CURRENT_DOCUMENT_SCHEMA_VERSION = 1;
export const CURRENT_GENERATION_METADATA_SCHEMA_VERSION = 1;

export type VersionedDocument = Record<string, unknown> & {
  documentSchemaVersion: number;
  generationMetadata: Record<string, unknown> & { schemaVersion: number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertSupportedVersion(value: unknown, label: string, current: number): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > current) {
    throw new Error(`DOCUMENT_VERSION_UNSUPPORTED: ${label}`);
  }
}

export function upgradeDocumentVersions(input: unknown): VersionedDocument {
  if (!isRecord(input)) throw new Error('DOCUMENT_VERSION_UNSUPPORTED: document');

  const generationMetadata = isRecord(input.generationMetadata)
    ? input.generationMetadata
    : {};
  assertSupportedVersion(input.documentSchemaVersion, 'document', CURRENT_DOCUMENT_SCHEMA_VERSION);
  assertSupportedVersion(
    generationMetadata.schemaVersion,
    'generationMetadata',
    CURRENT_GENERATION_METADATA_SCHEMA_VERSION,
  );

  return {
    ...input,
    documentSchemaVersion: CURRENT_DOCUMENT_SCHEMA_VERSION,
    generationMetadata: {
      ...generationMetadata,
      schemaVersion: CURRENT_GENERATION_METADATA_SCHEMA_VERSION,
    },
  };
}

export function stampDocumentVersions<T extends Record<string, unknown>>(input: T): T & VersionedDocument {
  return upgradeDocumentVersions(input) as T & VersionedDocument;
}
