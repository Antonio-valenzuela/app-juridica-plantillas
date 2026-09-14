# Separación de documentos, borradores y plantillas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantizar que las fuentes, borradores, documentos finales y referencias nunca aparezcan como plantillas salvo mediante una acción explícita de creación, eliminar de forma dirigida el registro de prueba asociado al PDF de `800/2024` cuando Neon esté disponible y demostrarlo con pruebas y navegador.

**Architecture:** Se reutilizarán `LegalTemplate`, `LegalDraft`, `UploadedSourceDocument` y los metadatos JSON existentes. Un contrato pequeño de ciclo documental definirá `SOURCE_DOCUMENT`, `DRAFT`, `FINAL_DOCUMENT`, `TEMPLATE` y `REFERENCE_DOCUMENT`, además de clasificar plantillas como `system`, `user`, `legacy` o `test_demo`. La API de plantillas exigirá una intención explícita y será la última barrera de privacidad; la carga normal de fuentes seguirá pasando por `/api/templates/analyze-upload` sin escribir en `LegalTemplate`.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Prisma/PostgreSQL existente, Vitest, localStorage y navegador integrado.

---

### Task 1: Definir el contrato de ciclo documental

**Files:**
- Create: `lib/legal-engine/documentLifecycle.ts`
- Modify: `lib/legal-engine/types.ts`
- Modify: `lib/templates/templateTypes.ts`
- Test: `tests/legal-engine/documentLifecycle.test.ts`

- [ ] **Step 1: Escribir las pruebas fallidas del contrato**

Crear pruebas para que:

```ts
expect(DOCUMENT_ENTITY_KINDS).toEqual([
  'SOURCE_DOCUMENT',
  'DRAFT',
  'FINAL_DOCUMENT',
  'TEMPLATE',
  'REFERENCE_DOCUMENT',
]);

const source = markDocumentEntity({ id: 'source-1' }, 'SOURCE_DOCUMENT');
const draft = markDocumentEntity({ id: 'draft-1' }, 'DRAFT');
const finalDoc = markDocumentEntity(draft, 'FINAL_DOCUMENT');
const template = markTemplateEntity({ id: 'template-1' }, 'user');

expect(readDocumentEntityKind(source)).toBe('SOURCE_DOCUMENT');
expect(readDocumentEntityKind(draft)).toBe('DRAFT');
expect(readDocumentEntityKind(finalDoc)).toBe('FINAL_DOCUMENT');
expect(readDocumentEntityKind(template)).toBe('TEMPLATE');
expect(canCreateTemplate({ entityKind: 'SOURCE_DOCUMENT' })).toBe(false);
expect(canCreateTemplate({ entityKind: 'DRAFT' })).toBe(false);
expect(canCreateTemplate({ entityKind: 'FINAL_DOCUMENT' })).toBe(false);
expect(canCreateTemplate({ entityKind: 'TEMPLATE', creationIntent: 'EXPLICIT_TEMPLATE' })).toBe(true);
```

La prueba también debe verificar que `markTemplateEntity` no copie el contenido de un caso y que el metadata de una plantilla explícita contenga `originClass: 'user'` y `creationIntent: 'EXPLICIT_TEMPLATE'`.

- [ ] **Step 2: Ejecutar la prueba y confirmar RED**

Run:

```powershell
npm test -- --run tests/legal-engine/documentLifecycle.test.ts
```

Expected: fallo porque todavía no existen el contrato y sus funciones.

- [ ] **Step 3: Implementar el contrato mínimo**

En `lib/legal-engine/documentLifecycle.ts` definir:

```ts
export const DOCUMENT_ENTITY_KINDS = [
  'SOURCE_DOCUMENT',
  'DRAFT',
  'FINAL_DOCUMENT',
  'TEMPLATE',
  'REFERENCE_DOCUMENT',
] as const;

export type DocumentEntityKind = (typeof DOCUMENT_ENTITY_KINDS)[number];
export type TemplateOriginClass = 'system' | 'user' | 'legacy' | 'test_demo';
export type TemplateCreationIntent = 'EXPLICIT_TEMPLATE';

export interface DocumentLifecycleMetadata {
  entityKind: DocumentEntityKind;
  originClass?: TemplateOriginClass;
  creationIntent?: TemplateCreationIntent;
  sourceId?: string;
}

export const LIFECYCLE_METADATA_KEY = '__juridicoRadar';

export function markDocumentEntity<T extends Record<string, unknown>>(
  value: T,
  entityKind: DocumentEntityKind,
  extra: Omit<DocumentLifecycleMetadata, 'entityKind'> = {},
): T & { [LIFECYCLE_METADATA_KEY]: DocumentLifecycleMetadata } {
  return {
    ...value,
    [LIFECYCLE_METADATA_KEY]: { entityKind, ...extra },
  } as T & { [LIFECYCLE_METADATA_KEY]: DocumentLifecycleMetadata };
}

export function readDocumentEntityKind(value: unknown): DocumentEntityKind | null;
export function readDocumentLifecycle(value: unknown): DocumentLifecycleMetadata | null;
export function markTemplateEntity<T extends Record<string, unknown>>(
  value: T,
  originClass: Exclude<TemplateOriginClass, 'legacy'>,
): T & { [LIFECYCLE_METADATA_KEY]: DocumentLifecycleMetadata };
export function canCreateTemplate(input: {
  entityKind?: DocumentEntityKind | null;
  creationIntent?: string | null;
}): boolean;
export function isPersistableLocalTemplate(value: unknown): boolean;
```

`isPersistableLocalTemplate` solo devolverá `true` para metadata `entityKind: 'TEMPLATE'` y origen `system`, `user` o `test_demo`; una fila sin metadata será legacy y no será considerada plantilla local seleccionable.

Agregar los campos opcionales de metadata a los tipos existentes sin crear modelos Prisma: `lifecycle?: DocumentLifecycleMetadata` en documentos/fuentes y `lifecycle?: DocumentLifecycleMetadata` en `ProfessionalTemplate`.

- [ ] **Step 4: Ejecutar pruebas GREEN y typecheck**

Run:

```powershell
npm test -- --run tests/legal-engine/documentLifecycle.test.ts
npm run typecheck
```

Expected: la prueba del contrato y TypeScript pasan.

---

### Task 2: Separar la clasificación de plantillas legacy, system, user y test/demo

**Files:**
- Modify: `lib/templates/templateOrigin.ts`
- Modify: `app/api/templates/custom/route.ts`
- Modify: `app/api/templates/custom/[id]/route.ts`
- Test: `tests/templates/templateOrigin.test.ts`

- [ ] **Step 1: Escribir pruebas de clasificación sin mirar el texto**

Extender `templateOrigin.test.ts` para verificar:

```ts
expect(classifyTemplateOrigin({ id: 'unmarked', structureJson: null })).toBe('legacy');
expect(classifyTemplateOrigin({
  id: 'user',
  structureJson: markTemplateAsUserOwned({}),
})).toBe('user');
expect(classifyTemplateOrigin({
  id: 'system',
  structureJson: markTemplateAsSystem({}),
})).toBe('system');
expect(classifyTemplateOrigin({
  id: 'test',
  structureJson: markTemplateAsTestDemo({}),
})).toBe('test_demo');

const visible = filterVisibleTemplates(
  [unmarked800, userTemplate, systemTemplate, testTemplate],
  { includeLegacy: false, includeTestDemo: false },
);
expect(visible.map((item) => item.id)).toEqual(['user', 'system']);
```

La prueba debe mantener un `800/2024` en una fila legacy para demostrar que la decisión se toma por metadata/origen, no por número de expediente.

- [ ] **Step 2: Ejecutar pruebas y confirmar RED**

Run:

```powershell
npm test -- --run tests/templates/templateOrigin.test.ts
```

Expected: fallo porque no existe la clasificación separada.

- [ ] **Step 3: Implementar la clasificación**

Actualizar `templateOrigin.ts` para reutilizar `LIFECYCLE_METADATA_KEY` y devolver `system`, `user`, `legacy` o `test_demo`. `markTemplateAsUserOwned` debe escribir `entityKind: 'TEMPLATE'`, `originClass: 'user'` y `creationIntent: 'EXPLICIT_TEMPLATE'`. Agregar marcadores equivalentes para system y test/demo.

Actualizar el GET de `/api/templates/custom`:

- sin parámetros de diagnóstico: devolver solo `system` y `user` del workspace autorizado;
- `includeLegacy=true`: incluir legacy para diagnóstico, sin renombrarlo demo;
- `includeTestDemo=true`: incluir test/demo explícitamente;
- mantener `includeDemo=true` como alias de compatibilidad únicamente para diagnósticos, sin cambiar la clasificación interna;
- conservar el scoping actual de organización/usuario;
- normalizar texto antes de responder.

Actualizar `/api/templates/custom/[id]` para aplicar la misma clasificación y no entregar una fila legacy como plantilla seleccionable en la UI normal.

- [ ] **Step 4: Ejecutar pruebas focalizadas**

Run:

```powershell
npm test -- --run tests/templates/templateOrigin.test.ts tests/templates/customTemplatesApi.test.ts
```

Expected: clasificación y API pasan sin depender de una coincidencia de `800/2024`.

---

### Task 3: Hacer explícita y obligatoria la creación de una plantilla en la API

**Files:**
- Modify: `app/api/templates/custom/route.ts`
- Modify: `app/api/templates/custom/[id]/route.ts`
- Modify: `components/machotes/SaveCustomTemplateModal.tsx`
- Modify: `app/machotes/page.tsx`
- Modify: `lib/templates/customTemplateStore.ts`
- Test: `tests/templates/customTemplateCreationIntent.test.ts`

- [ ] **Step 1: Escribir pruebas RED del contrato de creación**

Crear una prueba de contrato que cubra el payload que llega a la API:

```ts
expect(validateTemplateCreationPayload({
  entityKind: 'SOURCE_DOCUMENT',
})).toMatchObject({ ok: false, code: 'TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT' });

expect(validateTemplateCreationPayload({
  entityKind: 'DRAFT',
})).toMatchObject({ ok: false, code: 'TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT' });

expect(validateTemplateCreationPayload({
  entityKind: 'FINAL_DOCUMENT',
})).toMatchObject({ ok: false, code: 'TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT' });

expect(validateTemplateCreationPayload({
  entityKind: 'TEMPLATE',
  creationIntent: 'EXPLICIT_TEMPLATE',
})).toMatchObject({ ok: true });
```

La prueba debe comprobar que no se escribe un registro cuando falta la intención o cuando la entidad de origen no es `TEMPLATE`.

- [ ] **Step 2: Ejecutar prueba y confirmar RED**

Run:

```powershell
npm test -- --run tests/templates/customTemplateCreationIntent.test.ts
```

Expected: fallo porque el endpoint actual permite payloads sin intención explícita.

- [ ] **Step 3: Implementar la barrera server-side**

Agregar al contrato JSON los campos:

```ts
entityKind: z.literal('TEMPLATE'),
creationIntent: z.literal('EXPLICIT_TEMPLATE'),
```

En el modo multipart validar `formData.get('entityKind') === 'TEMPLATE'` y `formData.get('creationIntent') === 'EXPLICIT_TEMPLATE'` antes de guardar archivo o crear `LegalTemplate`. Responder `400` con `TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT` si falta cualquiera de ellos.

Al crear una fila, escribir `structureJson` con metadata `entityKind: 'TEMPLATE'`, `originClass: 'user'`, `creationIntent: 'EXPLICIT_TEMPLATE'` y conservar la sanitización/parametrización vigente. No aceptar `SOURCE_DOCUMENT`, `DRAFT`, `FINAL_DOCUMENT` ni `REFERENCE_DOCUMENT` como sustitutos.

Modificar el modal, `handleSaveAsTemplate` y `customTemplateStore` para enviar esos dos campos solo desde las acciones explícitas `Guardar como plantilla`, `Crear plantilla desde documento` o creación manual. La carga normal de fuentes no llamará a `/api/templates/custom`.

Actualizar PATCH para conservar la marca `TEMPLATE` y rechazar intentos de convertir otra entidad; DELETE seguirá operando por ID de plantilla.

- [ ] **Step 4: Ejecutar pruebas y verificar el flujo explícito**

Run:

```powershell
npm test -- --run tests/templates/customTemplateCreationIntent.test.ts tests/templates/customTemplatesApi.test.ts
npm run typecheck
```

Expected: payloads no explícitos rechazados; payload explícito sanitizado y aceptado.

---

### Task 4: Impedir que localStorage sea un fallback genérico

**Files:**
- Modify: `lib/templates/customTemplateStore.ts`
- Modify: `app/machotes/page.tsx`
- Test: `tests/templates/customTemplateStore.test.ts`

- [ ] **Step 1: Escribir pruebas RED para el caché local**

Usar un `localStorage` de prueba con tres entradas: una fuente, un borrador y una plantilla explícita. Verificar:

```ts
localStorage.setItem('juridico_custom_templates', JSON.stringify([
  { id: 'source', lifecycle: { entityKind: 'SOURCE_DOCUMENT' } },
  { id: 'draft', lifecycle: { entityKind: 'DRAFT' } },
  { id: 'template', ...markTemplateAsUserOwned({}) },
]));

expect(readLocalCustomTemplates().map((item) => item.id)).toEqual(['template']);
```

También probar que una respuesta fallida de `/api/templates/custom` no convierte arbitrariamente un objeto recibido en una plantilla local y que una plantilla explícita puede conservarse como caché reconocible sin que la interfaz afirme que fue persistida en Neon.

- [ ] **Step 2: Ejecutar prueba y confirmar RED**

Run:

```powershell
npm test -- --run tests/templates/customTemplateStore.test.ts
```

Expected: fallo porque el lector actual acepta cualquier JSON del storage y el catch guarda el objeto sin validar.

- [ ] **Step 3: Implementar el aislamiento**

Cambiar `getLocalCustomTemplates` para parsear y filtrar con `isPersistableLocalTemplate`. Reescribir una sola vez el storage con los elementos seguros para retirar entradas legacy no clasificadas, sin revisar ni borrar por contenido del expediente.

Cambiar `saveCustomTemplateLocally` para rechazar fuentes, borradores, documentos finales y entradas sin marca de plantilla. En `saveCustomTemplate`, si falla la API, conservar únicamente una plantilla que ya tenga `TEMPLATE + EXPLICIT_TEMPLATE`; devolver un estado local explícito o propagar el error para que la UI no diga “guardado en Mis Plantillas” cuando Neon no guardó nada. `getCustomTemplates` solo usará el caché filtrado.

No usar `juridico_custom_templates` desde `uploadFilesInternal`, `analyze-upload`, generación, guardado de borrador ni reapertura.

- [ ] **Step 4: Ejecutar la prueba y typecheck**

Run:

```powershell
npm test -- --run tests/templates/customTemplateStore.test.ts
npm run typecheck
```

Expected: solo las plantillas explícitas permanecen en el caché.

---

### Task 5: Etiquetar fuentes, borradores, finales y referencias sin crear tablas

**Files:**
- Modify: `lib/pdf/documentExtractor.ts`
- Modify: `lib/pdf/pdfExtractor.ts`
- Modify: `app/api/templates/analyze-upload/route.ts`
- Modify: `app/machotes/page.tsx`
- Modify: `lib/legal-engine/pipeline.ts`
- Modify: `lib/legal-engine/types.ts`
- Test: `tests/templates/documentVsTemplate.test.ts`

- [ ] **Step 1: Escribir la regresión documento ≠ plantilla**

Crear una prueba con el nombre requerido y una fuente no persistida:

```ts
const sourceName = 'PRUEBA_EXPEDIENTE_800_2024.pdf';
const source = markDocumentEntity({
  id: 'source-test-800',
  filename: sourceName,
  extractedText: 'EXPEDIENTE: PRUEBA_EXPEDIENTE_800_2024. ACTOR: Persona de prueba.',
}, 'SOURCE_DOCUMENT');

const draft = markDocumentEntity({
  id: 'draft-test-800',
  sourceDocuments: [source],
  structuredDoc: { sections: [] },
}, 'DRAFT');
const finalDoc = markDocumentEntity(draft, 'FINAL_DOCUMENT');

const templateRows: unknown[] = [];
expect(templateRows).toHaveLength(0);
expect(readDocumentEntityKind(source)).toBe('SOURCE_DOCUMENT');
expect(readDocumentEntityKind(draft)).toBe('DRAFT');
expect(readDocumentEntityKind(finalDoc)).toBe('FINAL_DOCUMENT');
```

Agregar el caso explícito:

```ts
const explicitTemplate = prepareExplicitTemplate(source, {
  title: 'Plantilla de prueba aislada',
  creationIntent: 'EXPLICIT_TEMPLATE',
});

expect(readDocumentEntityKind(explicitTemplate)).toBe('TEMPLATE');
expect(explicitTemplate.content).not.toContain('PRUEBA_EXPEDIENTE_800_2024');
expect(explicitTemplate.content).toContain('{{expediente}}');
```

La prueba debe cubrir también `REFERENCE_DOCUMENT` y comprobar que una referencia estructural no se agrega a la colección de plantillas.

- [ ] **Step 2: Ejecutar la prueba y confirmar RED**

Run:

```powershell
npm test -- --run tests/templates/documentVsTemplate.test.ts
```

Expected: fallo hasta que las rutas asignen las entidades y el helper de preparación explícita exista.

- [ ] **Step 3: Etiquetar cada entrada en los límites existentes**

Asignar `SOURCE_DOCUMENT` a las páginas/fuentes creadas por extracción y a la respuesta de `/api/templates/analyze-upload`. Asignar `DRAFT` a los documentos creados por `createEmptyDocument`, al pipeline y al guardado/reapertura de `LegalDraft`. Añadir `markDocumentAsFinal` como transición explícita de metadata para uso posterior, sin activarla automáticamente al guardar. Marcar referencias estructurales como `REFERENCE_DOCUMENT` cuando se usen como apoyo sin persistirlas en `LegalTemplate`.

No cambiar el esquema Prisma ni crear tablas. `LegalDraft` continuará almacenando `structuredDoc`, `sourceDocuments`, `pipelineState`, `generationMetadata` y edición manual; `LegalTemplate` continuará almacenando únicamente modelos reutilizables explícitos.

- [ ] **Step 4: Ejecutar pruebas relacionadas**

Run:

```powershell
npm test -- --run tests/templates/documentVsTemplate.test.ts tests/templates/personalTemplateBuilder.test.ts tests/templates/templateOrigin.test.ts
npm run typecheck
```

Expected: la cadena fuente → borrador → final permanece fuera de plantillas; solo la acción explícita crea una plantilla parametrizada.

---

### Task 6: Limpiar exactamente el registro accidental cuando Neon esté disponible

**Files:**
- No crear archivo de migración ni borrar el PDF.
- Test: `tests/templates/identifiedAccidentalTemplate.test.ts`

- [ ] **Step 1: Añadir una prueba de selección por identidad, no por expediente**

La prueba usará una lista simulada de registros y verificará que la función de selección requiere un ID confirmado o el nombre exacto del archivo, nunca `content.includes('800/2024')`:

```ts
const candidates = [
  { id: 'real-test-row', sourceFileName: 'Recurso_Revision_Amparo_Directo_800-2024_Version_Ampliada__1_.pdf', title: 'Recurso de Revision Amparo Directo 800-2024 Version Ampliada' },
  { id: 'real-template', sourceFileName: 'demanda-civil.docx', title: 'Demanda civil' },
  { id: 'unrelated-800', sourceFileName: 'oficio.docx', title: 'Oficio del expediente 800/2024' },
];

expect(selectIdentifiedAccidentalTemplate(candidates, {
  sourceFileName: 'Recurso_Revision_Amparo_Directo_800-2024_Version_Ampliada__1_.pdf',
})).toEqual(['real-test-row']);
expect(selectIdentifiedAccidentalTemplate(candidates, {
  sourceFileName: 'oficio.docx',
})).toEqual([]);
```

- [ ] **Step 2: Ejecutar prueba y confirmar RED**

Run:

```powershell
npm test -- --run tests/templates/identifiedAccidentalTemplate.test.ts
```

Expected: fallo hasta contar con la selección dirigida.

- [ ] **Step 3: Consultar Neon sin modificar datos**

Cuando responda la conexión, ejecutar una consulta de solo lectura limitada a la identidad del archivo:

```ts
await prisma.legalTemplate.findMany({
  where: {
    sourceFileName: 'Recurso_Revision_Amparo_Directo_800-2024_Version_Ampliada__1_.pdf',
  },
  select: { id: true, title: true, sourceFileName: true, organizationId: true, createdBy: true, createdAt: true, structureJson: true },
});
```

Si el flujo antiguo guardó otro nombre (`machote-real.pdf` o `800/2024`), usar el ID/título mostrado por la consulta previa y revisar el `structureJson.storage.originalFileName`, fecha, organización y contenido antes de borrar. No usar una consulta de borrado por texto del contenido ni tocar `data/uploads/templates`.

- [ ] **Step 4: Borrar solo el ID confirmado y verificar**

Después de confirmar que el ID corresponde al PDF de prueba, ejecutar una única eliminación por clave primaria:

```ts
await prisma.legalTemplate.delete({ where: { id: CONFIRMED_TEST_TEMPLATE_ID } });
const remaining = await prisma.legalTemplate.findUnique({ where: { id: CONFIRMED_TEST_TEMPLATE_ID }, select: { id: true } });
if (remaining) throw new Error('El registro de prueba no fue eliminado');
```

Registrar el ID eliminado, mantener intacto el PDF original y no eliminar las plantillas reales ni filas que solo compartan el número `800/2024`.

- [ ] **Step 5: Limpiar localStorage solo por el registro identificado**

Si el caché contiene el mismo ID confirmado, retirar únicamente esa entrada de `juridico_custom_templates`. Si no puede verificarse el ID en el caché, no borrar por texto: el filtro de Task 4 impedirá que entradas no clasificadas sean seleccionables y se reportará la limpieza local como pendiente de inspección del navegador.

---

### Task 7: Regresión ambiental de Neon y mensajes de persistencia

**Files:**
- Modify: `lib/templates/customTemplateStore.ts`
- Modify: `app/machotes/page.tsx`
- Modify: `components/machotes/SaveCustomTemplateModal.tsx`
- Test: `tests/templates/neonUnavailablePersistence.test.ts`

- [ ] **Step 1: Escribir pruebas RED para una API caída**

Verificar que un fallo de `/api/templates/custom` no devuelve éxito falso:

```ts
const result = await saveTemplateWithPersistenceStatus(explicitTemplate, {
  post: async () => new Response(JSON.stringify({ ok: false, error: 'WORKSPACE_UNAVAILABLE' }), { status: 503 }),
});

expect(result.ok).toBe(false);
expect(result.persistence).toBe('not_persisted');
expect(result.message).toContain('workspace');
```

Verificar por separado que un borrador conserva el `structuredDoc`/estado actual local y que el mensaje permite reintentar, sin crear una plantilla local a partir del borrador.

- [ ] **Step 2: Ejecutar prueba y confirmar RED**

Run:

```powershell
npm test -- --run tests/templates/neonUnavailablePersistence.test.ts
```

Expected: fallo porque el catch actual puede guardar localmente y los llamadores muestran éxito genérico.

- [ ] **Step 3: Implementar el estado de persistencia**

Distinguir `server`, `local_cache` y `not_persisted`. Para una plantilla explícita, un cache local reconocido puede conservar el trabajo, pero la UI debe decir `Conservada localmente; pendiente de sincronización` y ofrecer reintentar. Para fuentes/borradores/finales, no escribir en `juridico_custom_templates`; conservar el documento en el estado/draft existente.

Actualizar los mensajes de `SaveCustomTemplateModal` y guardado de borrador para no mostrar “guardado” cuando la respuesta fue 503. No introducir retries automáticos indefinidos ni cambiar la arquitectura de Prisma por la caída de Neon.

- [ ] **Step 4: Ejecutar prueba y typecheck**

Run:

```powershell
npm test -- --run tests/templates/neonUnavailablePersistence.test.ts
npm run typecheck
```

Expected: fallos de Neon son visibles, reintentables y no mezclan entidades.

---

### Task 8: Validación visual y cierre del Loop 1

**Files:**
- Modify only if a validation issue is found: `app/machotes/page.tsx`, `app/machotes/components/TemplateLibraryManager.tsx`, `components/machotes/SaveCustomTemplateModal.tsx`
- Tests: all affected tests plus full suite

- [ ] **Step 1: Ejecutar pruebas focalizadas completas**

Run:

```powershell
npm test -- --run tests/legal-engine/documentLifecycle.test.ts tests/templates/templateOrigin.test.ts tests/templates/customTemplateCreationIntent.test.ts tests/templates/customTemplateStore.test.ts tests/templates/documentVsTemplate.test.ts tests/templates/identifiedAccidentalTemplate.test.ts tests/templates/neonUnavailablePersistence.test.ts tests/templates/personalTemplateBuilder.test.ts tests/templates/utf8RoundTrip.test.ts tests/legal-engine/generationPolling.test.ts
```

Expected: todos los tests de separación, canario, UTF-8 y polling pasan.

- [ ] **Step 2: Validar desde navegador**

Con el servidor dev en Turbopack:

1. Cargar `PRUEBA_EXPEDIENTE_800_2024.pdf` por el control de fuente/análisis.
2. Confirmar que la red solo llama a `/api/templates/analyze-upload` y que `Mis Plantillas` no cambia.
3. Generar el escrito, observar progreso real, guardar y reabrir el borrador.
4. Confirmar que fuente, borrador y documento final no aparecen en `Mis Plantillas`.
5. Usar la acción explícita `Guardar como plantilla`.
6. Confirmar que ahora aparece una plantilla personal parametrizada y no contiene `PRUEBA_EXPEDIENTE_800_2024`.
7. Revisar `Mis Plantillas`, preview, compatibilidad, Flujo A, Flujo B, Flujo C, reapertura y DOCX de C.
8. Si Neon no responde, registrar solo las acciones dependientes de Neon como `PENDIENTE AMBIENTAL`; no reportarlas como fallo funcional.

- [ ] **Step 3: Ejecutar verificación técnica final**

Run:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: suite completa sin fallos, typecheck y build con exit code 0, lint con cero errores aunque pueda conservar advertencias heredadas.

- [ ] **Step 4: Entregar la tabla de cierre**

Reportar con evidencia los estados de `SOURCE_DOCUMENT ≠ TEMPLATE`, `DRAFT ≠ TEMPLATE`, `FINAL_DOCUMENT ≠ TEMPLATE`, creación explícita, localStorage, registro identificado/eliminado, test canario, A/B/C desde navegador y DOCX C. Si Neon continúa caído, usar `⚠️ PENDIENTE AMBIENTAL` únicamente en registro eliminado y DOCX C.

No iniciar Clientes, Expedientes ni Biblioteca después de marcar `LOOP 1 COMPLETADO`.

