import {
  LIFECYCLE_METADATA_KEY,
  markTemplateEntity,
  readDocumentLifecycle,
  type TemplateOriginClass,
} from '@/lib/legal-engine/documentLifecycle';

const TEMPLATE_ORIGIN_KEY = LIFECYCLE_METADATA_KEY;

export interface TemplateOriginRecord {
  entityKind?: 'TEMPLATE';
  originClass?: TemplateOriginClass;
  creationIntent?: 'EXPLICIT_TEMPLATE';
  version?: number;
}

export interface TemplateOriginCandidate {
  id: string;
  structureJson?: unknown;
}

export interface TemplateVisibilityContext {
  includeLegacy?: boolean;
  includeTestDemo?: boolean;
  /** Alias de diagnóstico para compatibilidad con consumidores anteriores. */
  includeDemo?: boolean;
  /** Compatibilidad con el filtro histórico del workspace demo. */
  defaultDemoWorkspace?: boolean;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function markTemplateAsUserOwned(structureJson: unknown): Record<string, any> {
  return markTemplateAsOrigin(structureJson, 'user');
}

function markTemplateAsOrigin(
  structureJson: unknown,
  originClass: Exclude<TemplateOriginClass, 'legacy'>,
): Record<string, any> {
  const base = isRecord(structureJson) ? { ...structureJson } : {};
  const existingMeta = isRecord(base[TEMPLATE_ORIGIN_KEY]) ? base[TEMPLATE_ORIGIN_KEY] : {};
  const marked = markTemplateEntity(base, originClass);

  return {
    ...marked,
    [TEMPLATE_ORIGIN_KEY]: {
      ...existingMeta,
      ...marked[TEMPLATE_ORIGIN_KEY],
      version: typeof existingMeta.version === 'number' ? existingMeta.version : 1,
    } as TemplateOriginRecord,
  };
}

export function markTemplateAsSystem(structureJson: unknown): Record<string, any> {
  return markTemplateAsOrigin(structureJson, 'system');
}

export function markTemplateAsTestDemo(structureJson: unknown): Record<string, any> {
  return markTemplateAsOrigin(structureJson, 'test_demo');
}

export function classifyTemplateOrigin(template: TemplateOriginCandidate): TemplateOriginClass {
  const lifecycle = readDocumentLifecycle(template.structureJson);
  if (lifecycle?.entityKind === 'TEMPLATE' && lifecycle.originClass) {
    return lifecycle.originClass;
  }
  return 'legacy';
}

export function isLegacyDemoTemplate(
  template: TemplateOriginCandidate,
  context: TemplateVisibilityContext
): boolean {
  if (!context.defaultDemoWorkspace || context.includeDemo || context.includeLegacy) return false;
  return classifyTemplateOrigin(template) === 'legacy';
}

export function filterVisibleTemplates<T extends TemplateOriginCandidate>(
  templates: T[],
  context: TemplateVisibilityContext = {}
): T[] {
  const includeLegacy = context.includeLegacy === true || context.includeDemo === true;
  const includeTestDemo = context.includeTestDemo === true || context.includeDemo === true;

  return templates.filter((template) => {
    const originClass = classifyTemplateOrigin(template);
    if (originClass === 'legacy') return includeLegacy;
    if (originClass === 'test_demo') return includeTestDemo;
    return originClass === 'system' || originClass === 'user';
  });
}
