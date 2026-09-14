import { adminFetch } from '@/lib/client/adminToken';
import {
  LIFECYCLE_METADATA_KEY,
  isPersistableLocalTemplate,
  markTemplateEntity,
  readDocumentLifecycle,
} from '@/lib/legal-engine/documentLifecycle';
import { markTemplateAsUserOwned } from './templateOrigin';
import { ProfessionalTemplate, TemplateCategory, TemplateFieldDefinition, TemplateStructure } from './templateTypes';

const STORAGE_KEY = 'juridico_custom_templates';

export type CustomTemplatePersistence = 'server' | 'local_cache' | 'not_persisted';
export type CustomTemplatePersistenceStatus = 'GUARDADO' | 'CONSERVADO TEMPORALMENTE' | 'NO GUARDADO';
export type SavedCustomTemplate = ProfessionalTemplate & {
  persistence?: CustomTemplatePersistence;
};
export type CustomTemplatePost = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type LocalCustomTemplatePersistence = (template: ProfessionalTemplate) => boolean;

export interface SaveTemplateWithPersistenceStatusOptions {
  post?: CustomTemplatePost;
  persistLocally?: LocalCustomTemplatePersistence;
  requestBody?: Record<string, unknown>;
}

export interface SaveTemplateWithPersistenceStatusResult {
  ok: boolean;
  status: CustomTemplatePersistenceStatus;
  persistence: CustomTemplatePersistence;
  template?: ProfessionalTemplate;
  message: string;
  retryable: boolean;
}

export type DeleteCustomTemplateResult = ProfessionalTemplate[] & {
  readonly persistence: 'server' | 'not_persisted';
  readonly message?: string;
};

function normalizeFieldType(type: string): TemplateFieldDefinition['type'] {
  const normalized = String(type || '').trim().toLowerCase();
  if (['lista', 'list', 'repeatable'].includes(normalized)) return 'repeatable';
  if (['texto', 'text', 'string'].includes(normalized)) return 'text';
  if (['textarea', 'area', 'paragraph', 'texto_largo'].includes(normalized)) return 'textarea';
  if (['select', 'dropdown', 'opcion'].includes(normalized)) return 'select';
  if (normalized === 'date') return 'date';
  if (normalized === 'number' || normalized === 'numeric') return 'number';
  return 'text';
}

function buildSectionsFromStructure(structure: TemplateStructure) {
  return structure.campos.map((field) => ({
    id: field.id,
    title: field.etiqueta,
    type: normalizeFieldType(field.tipo),
    required: field.obligatorio,
    placeholder: field.placeholder,
    helpText: field.helpText,
    options: field.options,
    repeatLabel: field.repeatLabel,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function lifecycleCandidates(value: unknown): unknown[] {
  if (!isRecord(value)) return [value];

  const candidates: unknown[] = [value, value.structureJson];
  if (value.lifecycle && isRecord(value.lifecycle)) {
    candidates.push({ [LIFECYCLE_METADATA_KEY]: value.lifecycle });
  }
  return candidates;
}

function isExplicitPersistableLocalTemplate(value: unknown): value is ProfessionalTemplate {
  const recognizedLifecycles = lifecycleCandidates(value)
    .map((originalCandidate) => {
      const candidate = originalCandidate;
      const hasLifecycle = isRecord(originalCandidate)
        && (hasOwn(originalCandidate, LIFECYCLE_METADATA_KEY) || hasOwn(originalCandidate, 'lifecycle'));
      return { candidate, hasLifecycle, lifecycle: readDocumentLifecycle(candidate) };
    });

  if (recognizedLifecycles.length === 0 || recognizedLifecycles.some(({ hasLifecycle, lifecycle }) => hasLifecycle && !lifecycle)) return false;
  const validLifecycles = recognizedLifecycles.filter((entry): entry is { candidate: unknown; hasLifecycle: true; lifecycle: NonNullable<ReturnType<typeof readDocumentLifecycle>> } => Boolean(entry.lifecycle));
  if (validLifecycles.length === 0) return false;
  return validLifecycles.every(({ candidate, lifecycle }) =>
    isPersistableLocalTemplate(candidate)
    && lifecycle.entityKind === 'TEMPLATE'
    && lifecycle.creationIntent === 'EXPLICIT_TEMPLATE'
  );
}

export function readLocalCustomTemplates(): ProfessionalTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const safeTemplates = parsed.filter(isExplicitPersistableLocalTemplate);
    if (safeTemplates.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeTemplates));
    }
    return safeTemplates;
  } catch {
    return [];
  }
}

export const getLocalCustomTemplates = readLocalCustomTemplates;

export function saveCustomTemplateLocally(template: ProfessionalTemplate): boolean {
  if (typeof window === 'undefined' || !isExplicitPersistableLocalTemplate(template)) return false;
  try {
    const current = readLocalCustomTemplates();
    const existingIndex = current.findIndex((t) => t.id === template.id);
    const updated = existingIndex >= 0 ? [...current.slice(0, existingIndex), template, ...current.slice(existingIndex + 1)] : [template, ...current];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

export async function getCustomTemplates(): Promise<ProfessionalTemplate[]> {
  if (typeof window === 'undefined') return [];
  try {
    const response = await adminFetch('/api/templates/custom', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'Error al leer las plantillas.');
    }
    const templates = (Array.isArray(payload.templates) ? payload.templates as unknown[] : [])
      .filter(isExplicitPersistableLocalTemplate)
      .map((template) => {
        if ((!template.sections || template.sections.length === 0) && template.structureJson?.campos?.length) {
          return {
            ...template,
            sections: buildSectionsFromStructure(template.structureJson),
          };
        }
        return template;
      });
    return templates;
  } catch {
    return getLocalCustomTemplates();
  }
}

function buildCustomTemplatePostBody(template: ProfessionalTemplate): Record<string, unknown> {
  return {
    entityKind: 'TEMPLATE',
    creationIntent: 'EXPLICIT_TEMPLATE',
    title: template.title,
    category: template.category,
    legalBasis: template.legalBasis,
    documentType: template.documentType || 'documento_juridico',
    description: template.description,
    applicableLaws: template.applicableLaws,
    warnings: template.warnings,
    disclaimer: template.disclaimer,
    exportFormats: template.exportFormats,
    structureJson: template.structureJson,
    variables: template.variables,
    originalText: template.originalText,
    sourceFileName: template.sourceFileName,
    content: template.originalText || '',
  };
}

function noTemplatePersistenceResult(message: string): SaveTemplateWithPersistenceStatusResult {
  return {
    ok: false,
    status: 'NO GUARDADO',
    persistence: 'not_persisted',
    message,
    retryable: false,
  };
}

function tryPersistLocally(
  persistLocally: LocalCustomTemplatePersistence,
  template: ProfessionalTemplate,
): boolean {
  try {
    return persistLocally(template);
  } catch {
    return false;
  }
}

function replaceLocalTemplateAfterServerSave(
  temporaryId: string,
  savedTemplate: ProfessionalTemplate,
): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const current = readLocalCustomTemplates();
    const withoutCopies = current.filter((template) => template.id !== temporaryId && template.id !== savedTemplate.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([savedTemplate, ...withoutCopies]));
    return true;
  } catch {
    return false;
  }
}

export async function saveTemplateWithPersistenceStatus(
  template: ProfessionalTemplate,
  options: SaveTemplateWithPersistenceStatusOptions = {},
): Promise<SaveTemplateWithPersistenceStatusResult> {
  if (!isExplicitPersistableLocalTemplate(template)) {
    return noTemplatePersistenceResult(
      'Solo se pueden guardar como plantilla documentos con intención explícita TEMPLATE.',
    );
  }
  if (typeof window === 'undefined') {
    return noTemplatePersistenceResult('No fue posible guardar la plantilla fuera del navegador.');
  }

  const post = options.post || adminFetch;
  const persistLocally = options.persistLocally || saveCustomTemplateLocally;

  try {
    const response = await post('/api/templates/custom', {
      method: 'POST',
      body: JSON.stringify({ ...options.requestBody, ...buildCustomTemplatePostBody(template) }),
    });
    const payload: unknown = await response.json();
    if (!response.ok || !isRecord(payload) || payload.ok !== true) {
      const errorMessage = isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `No fue posible guardar la plantilla (HTTP ${response.status}).`;
      throw new Error(errorMessage);
    }
    const saved = payload.template as ProfessionalTemplate;
    if (!isExplicitPersistableLocalTemplate(saved)) {
      throw new Error('La respuesta del servidor no contiene una plantilla explícita reconocible.');
    }
    const templateWithSections = !saved.sections?.length && saved.structureJson?.campos?.length
      ? { ...saved, sections: buildSectionsFromStructure(saved.structureJson) }
      : saved;
    tryPersistLocally(persistLocally, templateWithSections);
    // Sustituir la copia temporal por la identidad canónica del servidor.
    // El reintento puede devolver un id distinto al generado en el navegador.
    replaceLocalTemplateAfterServerSave(template.id, templateWithSections);
    return {
      ok: true,
      status: 'GUARDADO',
      persistence: 'server',
      template: templateWithSections,
      message: 'Plantilla guardada en el workspace.',
      retryable: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error en la respuesta del servidor.';
    if (tryPersistLocally(persistLocally, template)) {
      return {
        ok: false,
        status: 'CONSERVADO TEMPORALMENTE',
        persistence: 'local_cache',
        template,
        message: `${errorMessage} La plantilla se conservó temporalmente; puedes reintentar.`,
        retryable: true,
      };
    }
    return {
      ok: false,
      status: 'NO GUARDADO',
      persistence: 'not_persisted',
      message: `${errorMessage} No fue posible conservar la plantilla; puedes reintentar.`,
      retryable: true,
    };
  }
}

export async function saveCustomTemplate(template: ProfessionalTemplate): Promise<SavedCustomTemplate> {
  if (!isExplicitPersistableLocalTemplate(template)) {
    throw new Error('Solo se pueden guardar como plantilla documentos con intención explícita TEMPLATE.');
  }
  if (typeof window === 'undefined') return template;

  const result = await saveTemplateWithPersistenceStatus(template);
  if (result.template && result.status === 'GUARDADO') {
    return { ...result.template, persistence: 'server' };
  }
  if (result.template && result.status === 'CONSERVADO TEMPORALMENTE') {
    return { ...result.template, persistence: 'local_cache' };
  }
  throw new Error(result.message);
}

export async function updateCustomTemplate(
  templateId: string,
  patchData: Partial<ProfessionalTemplate> & { content?: string }
): Promise<SavedCustomTemplate> {
  if (typeof window === 'undefined') throw new Error('Operación no disponible en servidor.');
  try {
    const response = await adminFetch(`/api/templates/custom/${templateId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        entityKind: 'TEMPLATE',
        creationIntent: 'EXPLICIT_TEMPLATE',
        title: patchData.title,
        category: patchData.category,
        legalBasis: patchData.legalBasis,
        description: patchData.description,
        content: patchData.content || patchData.originalText,
        originalText: patchData.originalText,
        applicableLaws: patchData.applicableLaws,
        warnings: patchData.warnings,
        disclaimer: patchData.disclaimer,
        exportFormats: patchData.exportFormats,
        structureJson: patchData.structureJson,
        variables: patchData.variables,
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'Error al actualizar la plantilla.');
    }
    const updated = payload.template as ProfessionalTemplate;
    if (!isExplicitPersistableLocalTemplate(updated)) {
      throw new Error('La respuesta del servidor no contiene una plantilla explícita reconocible.');
    }
    const templateWithSections = !updated.sections?.length && updated.structureJson?.campos?.length
      ? { ...updated, sections: buildSectionsFromStructure(updated.structureJson) }
      : updated;
    saveCustomTemplateLocally(templateWithSections);
    return { ...templateWithSections, persistence: 'server' };
  } catch (err: unknown) {
    // Local fallback update
    const current = readLocalCustomTemplates();
    const existing = current.find((t) => t.id === templateId);
    if (!existing) throw err;
    const merged: ProfessionalTemplate = {
      ...existing,
      ...patchData,
      updatedAt: new Date().toISOString(),
    };
    if (!saveCustomTemplateLocally(merged)) throw err;
    return { ...merged, persistence: 'local_cache' };
  }
}

function deleteResult(
  templates: ProfessionalTemplate[],
  persistence: DeleteCustomTemplateResult['persistence'],
  message?: string,
): DeleteCustomTemplateResult {
  const result = templates.slice() as DeleteCustomTemplateResult;
  Object.defineProperty(result, 'persistence', { value: persistence, enumerable: false });
  if (message) Object.defineProperty(result, 'message', { value: message, enumerable: false });
  return result;
}

export async function deleteCustomTemplate(templateId: string): Promise<DeleteCustomTemplateResult> {
  if (typeof window === 'undefined') {
    return deleteResult([], 'not_persisted', 'No fue posible eliminar la plantilla fuera del navegador.');
  }
  try {
    const response = await adminFetch(`/api/templates/custom/${templateId}`, {
      method: 'DELETE',
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'Error al eliminar la plantilla.');
    }
    // La ruta DELETE responde { ok: true } sin lista; sincronizar localStorage
    // con la lista local filtrada (el servidor es la fuente de verdad y el
    // llamador recarga desde /api/templates/custom).
    const remaining = readLocalCustomTemplates().filter((template) => template.id !== templateId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    return deleteResult(remaining, 'server');
  } catch {
    const current = readLocalCustomTemplates();
    return deleteResult(
      current,
      'not_persisted',
      'No fue posible eliminar la plantilla en el workspace. La copia local se conserva; puedes reintentar.',
    );
  }
}

export function buildTemplateFromStructure(
  title: string,
  category: TemplateCategory = 'General',
  legalBasis: string = 'Fundamento a definir por el abogado',
  structure: TemplateStructure,
  originalText: string,
  sourceFileName?: string
): ProfessionalTemplate {
  const id = `custom-${Date.now()}`;
  const sections = buildSectionsFromStructure(structure);
  const markedStructure = markTemplateAsUserOwned(structure) as unknown as TemplateStructure;

  return markTemplateEntity({
    id,
    category,
    title,
    description: `Plantilla personalizada generada el ${new Date().toLocaleDateString('es-MX')}`,
    legalBasis: legalBasis || 'Fundamento normativo definido por el litigante.',
    documentType: structure.tipo_documento || 'documento_juridico',
    applicableLaws: ['Legislación aplicable según materia'],
    warnings: ['Revisar formalidades procesales antes de presentar ante la autoridad.'],
    disclaimer: 'Plantilla personalizada del abogado. Requiere revisión profesional antes de presentarse.',
    exportFormats: ['docx', 'pdf', 'text'],
    structureJson: markedStructure,
    sections,
    originalText,
    sourceFileName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, 'user') as ProfessionalTemplate;
}


type SectionDef = {
  id: string;
  title: string;
  type: 'text' | 'textarea' | 'repeatable';
  required: boolean;
  placeholder?: string;
  repeatLabel?: string;
};

const CATEGORY_SECTIONS: Record<TemplateCategory, SectionDef[]> = {
  Amparo: [
    { id: 'autoridad', title: 'Autoridad responsable', type: 'text', required: true, placeholder: 'C. JUEZ DE DISTRITO EN TURNO...' },
    { id: 'quejoso', title: 'Quejoso / Promovente', type: 'text', required: true, placeholder: 'Nombre completo del quejoso o firma' },
    { id: 'domicilio', title: 'Domicilio procesal', type: 'text', required: true, placeholder: 'Domicilio para oír y recibir notificaciones' },
    { id: 'acto_reclamado', title: 'Acto reclamado', type: 'textarea', required: true, placeholder: 'Descripción del acto o actos reclamados' },
    { id: 'garantias_violadas', title: 'Derechos / Garantías violadas', type: 'repeatable', required: true, repeatLabel: 'Agregar garantía violada' },
    { id: 'hechos', title: 'Hechos y antecedentes', type: 'repeatable', required: true, repeatLabel: 'Agregar hecho' },
    { id: 'conceptos_violacion', title: 'Conceptos de violación', type: 'repeatable', required: true, repeatLabel: 'Agregar concepto de violación' },
    { id: 'pruebas', title: 'Pruebas ofrecidas', type: 'repeatable', required: false, repeatLabel: 'Agregar prueba' },
    { id: 'puntos_petitorios', title: 'Puntos petitorios', type: 'repeatable', required: true, repeatLabel: 'Agregar punto petitorio' },
    { id: 'firma', title: 'Lugar, fecha y firma', type: 'text', required: true, placeholder: 'Lugar, fecha y firma del quejoso' },
  ],
  Civil: [
    { id: 'autoridad', title: 'Autoridad / Juzgado', type: 'text', required: true, placeholder: 'C. JUEZ CIVIL EN TURNO...' },
    { id: 'actor', title: 'Actor / Demandante', type: 'text', required: true, placeholder: 'Nombre del actor o firma' },
    { id: 'demandado', title: 'Demandado', type: 'text', required: true, placeholder: 'Nombre del demandado' },
    { id: 'domicilio', title: 'Domicilio procesal', type: 'text', required: true, placeholder: 'Domicilio para notificaciones' },
    { id: 'prestaciones', title: 'Prestaciones reclamadas', type: 'repeatable', required: true, repeatLabel: 'Agregar prestación' },
    { id: 'hechos', title: 'Hechos', type: 'repeatable', required: true, repeatLabel: 'Agregar hecho' },
    { id: 'fundamentos', title: 'Fundamentos de derecho', type: 'repeatable', required: true, repeatLabel: 'Agregar fundamento' },
    { id: 'pruebas', title: 'Pruebas ofrecidas', type: 'repeatable', required: false, repeatLabel: 'Agregar prueba' },
    { id: 'puntos_petitorios', title: 'Puntos petitorios', type: 'repeatable', required: true, repeatLabel: 'Agregar punto petitorio' },
    { id: 'firma', title: 'Lugar, fecha y firma', type: 'text', required: true, placeholder: 'Lugar, fecha y firma' },
  ],
  Familiar: [
    { id: 'autoridad', title: 'Juzgado familiar', type: 'text', required: true, placeholder: 'C. JUEZ FAMILIAR EN TURNO...' },
    { id: 'partes', title: 'Partes', type: 'text', required: true, placeholder: 'Nombres de las partes involucradas' },
    { id: 'domicilio', title: 'Domicilio procesal', type: 'text', required: true, placeholder: 'Domicilio para notificaciones' },
    { id: 'tipo_juicio', title: 'Tipo de juicio / Asunto', type: 'text', required: true, placeholder: 'Divorcio / Guarda y custodia / Alimentos...' },
    { id: 'hechos', title: 'Hechos', type: 'repeatable', required: true, repeatLabel: 'Agregar hecho' },
    { id: 'fundamentos', title: 'Fundamentos de derecho', type: 'repeatable', required: true, repeatLabel: 'Agregar fundamento' },
    { id: 'pruebas', title: 'Pruebas ofrecidas', type: 'repeatable', required: false, repeatLabel: 'Agregar prueba' },
    { id: 'puntos_petitorios', title: 'Puntos petitorios', type: 'repeatable', required: true, repeatLabel: 'Agregar punto petitorio' },
    { id: 'firma', title: 'Lugar, fecha y firma', type: 'text', required: true, placeholder: 'Lugar, fecha y firma' },
  ],
  Mercantil: [
    { id: 'autoridad', title: 'Juzgado mercantil', type: 'text', required: true, placeholder: 'C. JUEZ MERCANTIL EN TURNO...' },
    { id: 'actor', title: 'Actor / Demandante', type: 'text', required: true, placeholder: 'Nombre del actor o empresa' },
    { id: 'demandado', title: 'Demandado', type: 'text', required: true, placeholder: 'Nombre del demandado o empresa' },
    { id: 'domicilio', title: 'Domicilio procesal', type: 'text', required: true, placeholder: 'Domicilio para notificaciones' },
    { id: 'obligacion', title: 'Obligación incumplida', type: 'textarea', required: true, placeholder: 'Descripción de la obligación incumplida o controversia' },
    { id: 'hechos', title: 'Hechos', type: 'repeatable', required: true, repeatLabel: 'Agregar hecho' },
    { id: 'fundamentos', title: 'Fundamentos de derecho', type: 'repeatable', required: true, repeatLabel: 'Agregar fundamento' },
    { id: 'pruebas', title: 'Pruebas ofrecidas', type: 'repeatable', required: false, repeatLabel: 'Agregar prueba' },
    { id: 'puntos_petitorios', title: 'Puntos petitorios', type: 'repeatable', required: true, repeatLabel: 'Agregar punto petitorio' },
    { id: 'firma', title: 'Lugar, fecha y firma', type: 'text', required: true, placeholder: 'Lugar, fecha y firma' },
  ],
  'Administrativo/Fiscal': [
    { id: 'autoridad', title: 'Autoridad administrativa / fiscal', type: 'text', required: true, placeholder: 'Nombre del órgano o autoridad' },
    { id: 'promovente', title: 'Promovente', type: 'text', required: true, placeholder: 'Nombre o razón social del contribuyente / promovente' },
    { id: 'domicilio', title: 'Domicilio fiscal / procesal', type: 'text', required: true, placeholder: 'Domicilio para notificaciones' },
    { id: 'acto_impugnado', title: 'Acto impugnado', type: 'textarea', required: true, placeholder: 'Resolución o acto que se impugna (número, fecha, autoridad emisora)' },
    { id: 'agravios', title: 'Agravios / Conceptos de impugnación', type: 'repeatable', required: true, repeatLabel: 'Agregar agravio' },
    { id: 'pruebas', title: 'Pruebas ofrecidas', type: 'repeatable', required: false, repeatLabel: 'Agregar prueba' },
    { id: 'puntos_petitorios', title: 'Puntos petitorios', type: 'repeatable', required: true, repeatLabel: 'Agregar punto petitorio' },
    { id: 'firma', title: 'Lugar, fecha y firma', type: 'text', required: true, placeholder: 'Lugar, fecha y firma' },
  ],
  General: [
    { id: 'autoridad', title: 'Autoridad / Destinatario', type: 'text', required: true, placeholder: 'Autoridad o persona a quien va dirigido' },
    { id: 'promovente', title: 'Promovente', type: 'text', required: true, placeholder: 'Nombre del promovente o firma' },
    { id: 'domicilio', title: 'Domicilio procesal', type: 'text', required: true, placeholder: 'Domicilio para notificaciones' },
    { id: 'asunto', title: 'Asunto', type: 'textarea', required: true, placeholder: 'Descripción concisa del asunto' },
    { id: 'hechos', title: 'Hechos / Antecedentes', type: 'repeatable', required: true, repeatLabel: 'Agregar hecho' },
    { id: 'fundamentos', title: 'Fundamentos de derecho', type: 'repeatable', required: true, repeatLabel: 'Agregar fundamento' },
    { id: 'pruebas', title: 'Pruebas ofrecidas', type: 'repeatable', required: false, repeatLabel: 'Agregar prueba' },
    { id: 'puntos_petitorios', title: 'Puntos petitorios', type: 'repeatable', required: true, repeatLabel: 'Agregar punto petitorio' },
    { id: 'firma', title: 'Lugar, fecha y firma', type: 'text', required: true, placeholder: 'Lugar, fecha y firma' },
  ],
};

export function createTemplateFromText(
  title: string,
  category: TemplateCategory = 'General',
  legalBasis: string = 'Fundamento a definir por el abogado',
  rawText: string
): ProfessionalTemplate {
  const id = `custom-${Date.now()}`;
  const defs = CATEGORY_SECTIONS[category] ?? CATEGORY_SECTIONS.General;

  const sections = defs.map((d) => ({
    id: d.id,
    title: d.title,
    type: d.type,
    required: d.required,
    placeholder: d.placeholder,
    repeatLabel: d.repeatLabel,
  }));
  const structureJson = markTemplateAsUserOwned({
    nombre: title,
    tipo_documento: 'documento_juridico',
    campos: sections.map((s) => ({
      id: s.id,
      etiqueta: s.title,
      tipo: s.type,
      obligatorio: s.required,
      placeholder: s.placeholder,
      repeatLabel: s.repeatLabel,
    })),
  }) as unknown as TemplateStructure;

  return markTemplateEntity({
    id,
    category,
    title,
    description: `Plantilla personalizada creada el ${new Date().toLocaleDateString('es-MX')}`,
    legalBasis: legalBasis || 'Fundamento normativo definido por el litigante.',
    documentType: 'documento_juridico',
    applicableLaws: ['Legislación aplicable según materia'],
    warnings: ['Revisar formalidades procesales antes de presentar ante la autoridad.'],
    disclaimer: 'Plantilla personalizada del abogado. Requiere revisión profesional antes de presentarse.',
    exportFormats: ['docx', 'pdf', 'text'],
    structureJson,
    sections,
    originalText: rawText,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, 'user') as ProfessionalTemplate;
}
