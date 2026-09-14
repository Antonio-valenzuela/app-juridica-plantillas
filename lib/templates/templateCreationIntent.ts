export const TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT =
  'TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT';

export type TemplateCreationPayloadValidation =
  | { ok: true }
  | { ok: false; code: typeof TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT };

export function validateTemplateCreationPayload(
  input: unknown,
): TemplateCreationPayloadValidation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, code: TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT };
  }

  const payload = input as Record<string, unknown>;
  return payload.entityKind === 'TEMPLATE' && payload.creationIntent === 'EXPLICIT_TEMPLATE'
    ? { ok: true }
    : { ok: false, code: TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT };
}
