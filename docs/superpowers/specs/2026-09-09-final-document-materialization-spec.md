# FASE 7 — Materialización del documento final y exportación DOCX

**Fecha:** 2026-09-09  
**Estado:** SPEC corregido; listo para aprobación final; no implementado  
**Dependencias:** FASE 5B y FASE 6 cerradas y preservadas  
**Alcance primario:** materialización determinista hacia DOCX  
**Alcance PDF:** únicamente consumidor de compatibilidad/paridad  
**Regla de esta entrega:** solo se modifica este SPEC y su Implementation Plan. No se modifica producción, tests, dependencias, FASE 5B ni FASE 6. No se ejecuta Task 1.

## 1. Decisión ejecutiva

FASE 7 debe agregar una sola frontera de materialización semántica entre el documento jurídico preparado y los renderizadores binarios. Esa frontera no vuelve a decidir Coverage, no vuelve a ejecutar FASE 6, no genera contenido y no transforma sustantivamente el texto.

La materialización rich solo se permite cuando existe evidencia ya producida por FASE 6:

```text
DocumentAssemblyReadiness.READY
+ DocumentAssemblyQualityGateResult.passed === true
+ DocumentAssemblyQualityGateResult.canMarkAsReady === true
+ assembly trace íntegra
+ export guard PASS
→ final materialization allowed
```

`READY_TO_EXPORT` o `FINAL_DOCUMENT` del lifecycle, por sí solos, no bastan. Cualquier estado `INCOMPLETE`, `BLOCKED`, `REQUIRES_REVIEW`, `INVALID`, evidencia ausente o trace rota bloquea en fail-closed.

La arquitectura corregida es:

```text
prepared UniversalLegalDocument
        + verified FASE 6 exportability
        + export guard PASS
                 │
                 ▼
materializePreparedFinalDocument(verifiedInput)
                 │
                 ▼
FORMAT-NEUTRAL ExportRenderModel
                 │
          ┌──────┴──────┐
          ▼             ▼
renderDocx(model,   renderPdf(model,
  docxOptions)        pdfOptions)
          │             │
          ▼             ▼
 DOCX artifact     PDF artifact
          └──────┬──────┘
                 ▼
       validation + manifest/trace
```

El `ExportRenderModel` no contiene `format` ni geometría de página. El mismo documento preparado produce un solo modelo semántico; DOCX y PDF consumen los mismos nodos, orden, texto y provenance. El layout y el page profile se resuelven dentro de cada renderer y pueden diferir por formato.

## 2. Inspección read-only y arquitectura actual

La inspección se hizo contra el código actual, usando CodeGraph y lectura directa. La arquitectura relevante es la siguiente.

### 2.1 Flujo universal actual

```text
POST /api/legal-engine/export/{docx|pdf}
  → requireLawyerAccess
  → prepareUniversalDocumentForExport
      → validateForExport
      → sanitizeLegalDocument(..., { dedupeBlocks: false })
      → validación posterior
      → runQualityGateCheck / validateDocument / lifecycle
  → exportUniversalTo{Docx|Pdf}
  → Buffer binario + headers
```

Evidencia relevante:

| Frontera | Archivo/función | Situación actual |
|---|---|---|
| API DOCX | `app/api/legal-engine/export/docx/route.ts:11-63` | Auth, preparación común, `exportUniversalToDocx`, validación `PK`, nombre canónico |
| API PDF | `app/api/legal-engine/export/pdf/route.ts:11-72` | Rechaza `renderedSections`, usa preparación común y no hace fallback HTML |
| Guard | `lib/legal-engine/exportGuards.ts:625+` y `prepareUniversalDocumentForExport` | Valida texto, secciones, campos, QualityGate, lifecycle y sanitización |
| Lifecycle | `lib/legal-engine/documentLifecycle.ts:14-15, 362+` | Define `DRAFT`, `REVIEW_REQUIRED`, `READY_TO_EXPORT`, `FINAL_DOCUMENT` |
| DOCX | `lib/legal-engine/exportDocxUniversal.ts:56+` | Lee directamente secciones/bloques, crea `Paragraph`, header/footer y trace |
| PDF | `lib/legal-engine/exportPdfUniversal.ts:21-26, 7+` | Motor PDF 1.4 manual, tamaño fijo y WinAnsi |
| Nombre | `lib/legal-engine/outputFilename.ts` | Resuelve nombre desde tipo/estrategia, no desde archivo fuente |
| Trace | `lib/legal-engine/generationTrace.ts` | Ya tiene assembly metadata y export metadata |

### 2.2 Evidencia FASE 6 ya existente

FASE 6 produce y adjunta evidencia rich durante el pipeline:

- `pipeline.ts:3811-3848` construye `DocumentAssemblyResult`, calcula la readiness y ejecuta el `DocumentAssemblyQualityGate`.
- `pipeline.ts:3859-3865` adjunta `documentAssemblyResult` y `documentAssemblyQualityGate` al documento en memoria.
- `documentAssemblyTypes.ts:18-29` define `READY`, `INCOMPLETE`, `BLOCKED`, `REQUIRES_REVIEW`, `INVALID`.
- `documentAssemblyTypes.ts:122-160` define resultado y gate.
- `documentReadiness.ts:119-165` verifica integridad de trace y decide readiness.
- `documentAssemblyQualityGate.ts:53-82` ya determina `passed` y `canMarkAsReady`.

FASE 7 debe consumir esa evidencia. No debe llamar de nuevo a `evaluateDocumentAssemblyChecks`, `decideDocumentAssemblyReadiness`, `runDocumentAssemblyQualityGate`, `assembleLegalDraft` ni a ningún validator de FASE 6.

### 2.3 Flujo legacy actual

```text
ProfessionalTemplate
  → renderToDocument()
  → RenderedDocument
       ├─ exportToDocx()
       └─ generatePrintHtml()
```

`lib/templates/exportDocx.ts` y `lib/templates/exportPdf.ts` aceptan otro DTO y usan `assertLegacyRenderedDocumentExportable`. El renderer legacy puede conservar `[PENDIENTE: ...]` y no tiene la evidencia rich de FASE 6. Se mantiene separado; no fabrica `DocumentAssemblyResult`, `DocumentAssemblyQualityGateResult`, Coverage ni trace rich.

## 3. Gap analysis corregido

| ID | Gap | Evidencia | Resolución de diseño |
|---|---|---|---|
| G-01 | Lifecycle exportable no demuestra readiness rich | `exportGuards.ts` valida lifecycle, pero no exige evidencia adjunta de FASE 6 | Crear un verificador de evidencia que consuma, sin recalcular, resultado y gate de FASE 6 |
| G-02 | `ExportRenderModel` tenía `format` | Diseño anterior mezclaba semántica y renderer | Quitar `format` del modelo y de la función de materialización |
| G-03 | Tipos shared no deben depender de `Buffer` | Render actual devuelve `Buffer` en frontera Node | Shared usa tipos sin Node; artifact/render server puede usar `Uint8Array` y convertir a `Buffer` solo en la ruta |
| G-04 | El renderer actual vuelve a transformar contenido | `applyStyleToSectionText` puede insertar fórmulas de apertura/cierre; `normalizeLegalDocumentText` se ejecuta después del guard | Definir inventario de transformaciones: sanitización sustantiva solo en prepare; materialización solo serializa/segmenta y nunca inyecta texto |
| G-05 | El DOCX aplana contenido y mezcla recorrido con escritura | `exportDocxUniversal.ts` recorre directamente `sections[].content` | Una IR única conserva nodos, orden, children y provenance antes del renderer |
| G-06 | Pruebas actuales prueban principalmente firma/tamaño/extracción | `exportUniversal.acceptance.test.ts` y pruebas de trace | Agregar contratos de `word/document.xml`, round trip, manifest, macros/relationships y paridad semántica |
| G-07 | PDF tiene motor propio | `exportPdfUniversal.ts` construye PDF manual | No reescribir PDF; consumir la misma secuencia semántica y probar paridad/no fallback |
| G-08 | Legacy no tiene gate rich | `RenderedDocument` usa guard más estrecho | Aislarlo; no adaptarlo implícitamente ni crear evidence rich falsa |
| G-09 | Perfil y página no son una entrada determinista común | DOCX y PDF tienen constantes separadas; la ruta DOCX pasa profile `undefined` | Congelar profile de compatibilidad, validarlo y registrar su resolución sin cambiar el default |
| G-10 | Trace puede confundirse con payload binario | `exportMetadata` actual registra hash y tamaños | Manifest/trace solo metadata y hashes no binarios; nunca `Buffer`, base64 crudo o bytes |

## 4. Contrato de entrada: gate obligatorio de FASE 6

La futura frontera de materialización debe leer del `UniversalLegalDocument` preparado, o de su wrapper de ejecución, los valores ya producidos por FASE 6:

```ts
type RichAssemblyEvidence = {
  documentAssemblyResult: DocumentAssemblyResult;
  documentAssemblyQualityGate: DocumentAssemblyQualityGateResult;
};

type RichVerifiedInput = {
  document: UniversalLegalDocument;
  assembly: DocumentAssemblyResult;
  assemblyGate: DocumentAssemblyQualityGateResult;
  exportValidation: ExportValidationResult;
};
```

La verificación es de lectura y no ejecuta validators:

1. `assembly.readiness === 'READY'`.
2. `assembly.validationStatus === 'VALID'`.
3. `assembly.assemblyStatus === 'ASSEMBLED'`.
4. `assemblyGate.passed === true`.
5. `assemblyGate.canMarkAsReady === true`.
6. `assemblyGate.readiness === 'READY'`.
7. `assembly.trace` existe, tiene `outputFingerprint`, sus `orderedBlockIds` coinciden con `assembly.orderedBlocks` y sus `blockLinks` cubren todos los bloques.
8. `exportValidation.ok === true` después del guard común.
9. No existen findings `BLOCKER`, `INVALID`, `SCHEMA`, `TRACE_INTEGRITY_FAILED` o estados de revisión que invaliden la evidencia.
10. El lifecycle sigue siendo explícito: `READY_TO_EXPORT` o `FINAL_DOCUMENT` es necesario, pero nunca sustituye los puntos anteriores.

Ante evidencia ausente, serialización incompleta del resultado, discrepancia de fingerprint/order o estado no permitido, la función falla cerrado con un error tipado de no materialización. No reconstruye el assembly ni “corrige” la evidencia.

### 4.1 Política explícita para input compatibility no-rich

La inspección del código no demuestra hoy un productor universal final no-rich que pueda declararse automáticamente exportable:

- `documentReadiness.ts:156-165` devuelve `REQUIRES_REVIEW` cuando `legalIssueMatrix.sourceMode !== 'RICH'` o falta `richCaseAnalysis`.
- El pipeline conserva el camino legacy explícitamente (`pipeline.ts:3090-3116`) y no mezcla un snapshot rich nuevo con un input legacy.
- `RenderedDocument` (`lib/templates/templateTypes.ts:81-97`) no contiene lifecycle ni evidencia rich.

Por tanto, un `LEGACY_FALLBACK`, un `RenderedDocument` o cualquier non-rich genérico no es un `VerifiedCompatibilityInput` válido. Se rechaza.

El contrato queda definido para un único envelope de compatibilidad explícitamente aprobado, si una futura integración demuestra que un tipo/path existente cumple todos los checks sin FASE 6 rich:

```ts
type VerificationMode = 'RICH_ASSEMBLY' | 'COMPATIBILITY';

interface VerifiedCompatibilityInput {
  verificationMode: 'COMPATIBILITY';
  document: UniversalLegalDocument;
  compatibility: {
    status: 'COMPATIBLE';
    compatibilityStatus:
      | 'EXPLICIT_COMPATIBILITY'
      | 'ACCEPTS_ANY_SOURCE_INTENTIONALLY'
      | 'NO_SOURCE_REQUIRED';
    selectedDocumentType: string;
  };
  exportValidation: ExportValidationResult;
  lifecycleValid: true;
  requiredStructuralChecksPass: true;
  richEvidence?: never;
}

type VerifiedMaterializationInput =
  | (RichVerifiedInput & { verificationMode: 'RICH_ASSEMBLY' })
  | VerifiedCompatibilityInput;
```

El `VerifiedCompatibilityInput` exige: tipo/path reconocido por la matriz de compatibilidad existente, resultado `COMPATIBLE`, export guard PASS, lifecycle válido, checks estructurales requeridos PASS y ausencia de placeholders técnicos. No puede contener ni fabricar `Coverage`, `LegalIssueMatrix`, `DocumentAssemblyResult` o `DocumentAssemblyQualityGateResult` rich. Su provenance debe indicar `verificationMode: 'COMPATIBILITY'`.

Ambos modos pueden alimentar el mismo `materializePreparedFinalDocument(verified)`. La materialización no tendrá dos renderers universales ni un bypass: cambia únicamente el provenance de verificación. Un compatibility input nunca puede reportar `RICH_ASSEMBLY`, `DocumentAssemblyReadiness.READY` ni `FASE 6 QualityGate PASS`. Si no existe un productor aprobado que satisfaga este envelope, el único input habilitado en producción será `RICH_ASSEMBLY`.

## 5. Única IR format-neutral

### 5.1 Separación de tipos

Los siguientes contratos son de diseño. `finalDocumentMaterializationTypes.ts` debe ser shared/runtime-safe:

```ts
export interface RenderProvenance {
  documentId: string;
  verificationMode: 'RICH_ASSEMBLY' | 'COMPATIBILITY';
  sectionId?: string;
  parentSectionId?: string;
  blockId?: string;
  generationTaskId?: string;
  coverageItemIds: readonly string[];
  legalIssueIds: readonly string[];
  sourceDocumentIds: readonly string[];
  sourceRefs: readonly string[];
  manualEdit: boolean;
}

export interface RenderRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface RenderParagraph {
  id: string;
  text: string;
  runs: readonly RenderRun[];
  role: 'TITLE' | 'BODY' | 'LIST' | 'SIGNATURE' | 'HEADER' | 'FOOTER' | 'SPACER';
  style: BlockStyle;
  orderPath: readonly number[];
  keepNext: boolean;
  keepTogether: boolean;
  pageBreakBefore: boolean;
  provenance: RenderProvenance;
}

export interface RenderSection {
  id: string;
  parentId?: string;
  title: string;
  type: string;
  depth: number;
  orderPath: readonly number[];
  paragraphs: readonly RenderParagraph[];
}

export interface ExportRenderModel {
  schemaVersion: 'fase7-v1';
  documentId: string;
  documentType?: string;
  title: string;
  header: readonly RenderParagraph[];
  sections: readonly RenderSection[];
  footer: readonly RenderParagraph[];
  documentFingerprint: string;
  materializationFingerprint: string;
}
```

`ExportRenderModel` no tiene `format`, page profile, `Buffer`, `Uint8Array`, renderer options ni filename. La materialización tampoco recibe `format` ni geometría:

```ts
materializePreparedFinalDocument(
  verified: VerifiedMaterializationInput,
): ExportRenderModel;
```

### 5.2 Frontera renderer/server

El formato vive únicamente en opciones y artefactos de renderer:

```ts
type ExportFormat = 'docx' | 'pdf';

interface DocxRenderOptions {
  format: 'docx';
  pageProfile: DocxPageProfile;
  lawyerProfile: LawyerProfile;
}

interface PdfRenderOptions {
  format: 'pdf';
  pageProfile: PdfPageProfile;
  lawyerProfile: LawyerProfile;
}

interface DocxPageProfile {
  id: string;
  unit: 'twip';
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number };
  source: 'DOCUMENT_METADATA' | 'SERVER_OPTION' | 'COMPATIBILITY_DEFAULT';
}

interface PdfPageProfile {
  id: string;
  unit: 'pt';
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number };
  source: 'DOCUMENT_METADATA' | 'SERVER_OPTION' | 'COMPATIBILITY_DEFAULT';
}

interface ExportManifest {
  schemaVersion: 'fase7-v1';
  format: ExportFormat;
  documentFingerprint: string;
  materializationFingerprint: string;
  exportFingerprint: string;
  pageProfileId: string;
  sectionCount: number;
  paragraphCount: number;
  omittedParagraphCount: number;
  renderedBlockIds: readonly string[];
  omittedBlockIds: readonly string[];
  traceStatus: 'RECORDED' | 'NOT_AVAILABLE';
}

interface ExportArtifact {
  format: ExportFormat;
  mediaType: string;
  fileName: string;
  bytes: Uint8Array;
  manifest: ExportManifest;
}
```

`bytes: Uint8Array` mantiene neutral la representación binaria del artifact. La conversión a `Buffer` queda en `renderDocx`/`renderPdf` o en la ruta Node, no en el contrato shared de materialización. En consecuencia:

```text
shared FASE 7 materialization modules:
  Node builtin imports = 0
  Buffer dependency in public materialization contract = 0

renderer/server boundary:
  Buffer allowed only where docx/PDF library or NextResponse requires it
```

## 6. Content fidelity y transformaciones permitidas

### 6.1 Inventario obligatorio

`prepareUniversalDocumentForExport` ya ejecuta `sanitizeLegalDocument(..., { dedupeBlocks: false })`. Dentro de esa preparación se ejecutan, entre otras, estas operaciones:

- `stripTrustMarkers`;
- `normalizeMarkdownFormatting`;
- `normalizeUnresolvedFieldMarkers`;
- `formatTabularStructures`;
- eliminación de prompts, metadata, watermarks y crypto garbage;
- manejo de placeholders y proofreading;
- limpieza de líneas decorativas y whitespace técnico;
- `normalizeTitleText` sobre títulos de sección;
- filtrado de bloques vacíos según el contrato existente;
- sin deduplicación de bloques/secciones porque `dedupeBlocks: false`.

No se debe ejecutar de nuevo `sanitizeLegalDocument` en FASE 7.

La inspección del código muestra que `normalizeLegalDocumentText` no forma parte de `sanitizeBlockText`; actualmente se usa en el exporter. El plan debe elegir una sola frontera técnica para normalización de encoding/control characters y probarla. Nunca se debe aplicar dos veces una transformación potencialmente destructiva.

### 6.2 Permitido en materialización

- escaping XML/OOXML o literal PDF;
- rechazo o eliminación de caracteres de control XML no representables, con conteo técnico en manifest;
- normalización técnica de `CRLF` a `LF` si la comparación usa la misma representación canónica;
- segmentación de párrafos/runs sin cambiar la concatenación de texto sustantivo;
- mapping de heading/list/indentación sin cambiar el texto;
- serialización Unicode segura.

### 6.3 Prohibido en materialización

- `sanitizeLegalDocument` o cualquier deduplicación;
- resumen, paráfrasis, reescritura o eliminación por similitud;
- agregar hechos, authorities, evidence, petitions, fórmulas o fechas;
- `applyStyleToSectionText` si puede insertar fórmulas de apertura/cierre;
- volver a ejecutar `stripTrustMarkers`, `normalizeTitleText` o Markdown normalization como limpieza sustantiva;
- crear un encabezado jurídico, `PROTESTO`, firma, fecha o sección que no esté en el modelo preparado.

`LawyerProfile` en FASE 7 será presentación: fuente, tamaño, alineación, márgenes y roles. No podrá inyectar contenido. Si una fórmula de estilo debe existir, debe haber sido producida y validada antes de `prepareUniversalDocumentForExport`.

### 6.4 Contratos de fidelidad

```text
prepared substantive text
→ materialization
→ same substantive text
```

```text
materialization
→ DOCX
→ extracted text
→ same normalized substantive text
```

```text
same text + different blockIds/issues
→ both survive materialization
→ both survive DOCX
```

El texto manual recibe el mismo tratamiento: su contenido y su `manualEdit` sobreviven; no se reemplaza por texto generado ni se descarta por parecer duplicado.

## 7. Orden, children y provenance

1. Se recorren secciones por orden contractual ya existente.
2. `DocumentNode.children` se recorre recursivamente por `order`, conservando `parentId`, `depth` y `orderPath`.
3. Dentro de cada nodo se conserva el orden de `content`; el completion order nunca participa.
4. Cada párrafo recibe identidad estable derivada de IDs semánticos, no solo de su texto.
5. Dos bloques con el mismo texto pero distintos `blockId`, `legalIssueIds` o `coverageItemIds` son dos párrafos/provenances distintos; no se deduplican.
6. Se preservan `sectionId`, `blockId`, task, issue, Coverage, source refs, source documents y edición manual como provenance no visible.
7. Los headings ya modelados no se duplican al recorrer children o al interpretar el primer párrafo del bloque.
8. Un bloque omitido por preparación se registra como omitido; no se reemplaza por un párrafo vacío que parezca contenido jurídico.

## 8. Página, perfil y seguridad de filename

La geometría no pertenece al `ExportRenderModel`. Cada renderer tiene una única fuente de verdad, resuelta una vez en sus propias opciones:

```text
ExportRenderModel
  ├─ renderDocx(model, DocxRenderOptions)
  │    └─ resolvedDocxPageProfile: width/height/margins en twips
  └─ renderPdf(model, PdfRenderOptions)
       └─ resolvedPdfPageProfile: width/height/margins en puntos
```

`resolveDocxPageProfile` y `resolvePdfPageProfile` no pueden recibir overrides desde el modelo. Cada uno resuelve metadata explícita y validada, opción server-side aprobada o su default de compatibilidad actual. FASE 7 no cambia silenciosamente Letter por Oficio ni viceversa.

La `materializationFingerprint` no depende de format ni de geometría. El `exportFingerprint` sí depende de format y del profile resuelto de esa instancia. Esto permite demostrar que dos artifacts pueden tener layout distinto sin haber cambiado el contenido materializado.

Se rechazan dimensiones no finitas, negativas, excesivas, márgenes que consumen el área útil o perfiles con unidades ambiguas. `LawyerProfile` se resuelve en servidor/contexto autenticado; el cliente no puede inyectar provenance, hechos o reglas de estilo no validadas.

`resolveDocumentOutputFilename` sigue siendo la única fuente de nombre. El resultado debe:

- eliminar separadores de ruta, control characters, reserved device names y caracteres inválidos de Windows;
- conservar la extensión elegida por el renderer;
- no usar source filename ni `originalFileUrl`;
- rechazar path traversal aun si llega mediante metadata o título.

## 9. DOCX y PDF

### 9.1 DOCX

El renderer DOCX futuro consume exclusivamente `ExportRenderModel` y `DocxRenderOptions`. Debe producir:

- ZIP OOXML válido;
- `word/document.xml` presente y bien formado;
- texto extraíble igual al texto sustantivo normalizado;
- headers/footers solo con datos autorizados del modelo;
- sin macros, OLE, external active relationships o targets externos;
- fallos de serialización fail-closed;
- trace/manifest sin bytes ni base64.

### 9.2 PDF

PDF permanece **IN FASE 7 solo como compatibility/parity consumer**:

- no se reescribe el motor PDF manual;
- no HTML;
- no Chromium;
- no external converter;
- no fallback desde PDF a legacy;
- consume la misma secuencia semántica format-neutral;
- mantiene `%PDF`, WinAnsi/cp1252, paginación y errores honestos actuales.

La paridad exigida es semántica: texto normalizado, orden, IDs/provenance y omisiones. No se exige identidad pixel a pixel entre DOCX y PDF.

## 10. Legacy y compatibilidad

`RenderedDocument` continúa aislado. No produce evidencia rich y no entra a la ruta universal. La política completa de input es:

```text
RichVerifiedInput
  → rich gate: FASE 6 READY + assembly QualityGate PASS + trace + export guard
  → materializePreparedFinalDocument

approved VerifiedCompatibilityInput
  → compatibility gate: tipo/path reconocido + export guard + lifecycle + checks estructurales
  → mismo materializePreparedFinalDocument
  → provenance verificationMode=COMPATIBILITY

unknown/non-approved non-rich input o legacy inválido
  → reject
```

- `legacy export` no puede satisfacer el gate FASE 6.
- `renderedSections` no puede convertirse en documento universal.
- No se borra el renderer legacy ni se cambian sus tests en esta fase de diseño.
- Si un documento non-labor o formal-only ya trae evidencia FASE 6 válida, entra como `RICH_ASSEMBLY`, no como compatibility.
- El camino legacy actual no satisface el envelope compatibility porque carece de lifecycle y evidencia de export final; no se habilita por inferencia.
- Solo un compatibility envelope explícito y aprobado puede entrar al mismo materializer sin evidence rich. Nunca puede fingir readiness rich.

## 11. Efectos laterales prohibidos

La materialización y ambos renderers deben demostrar cero llamadas a:

- providers;
- research, web, RAG o adapters;
- DB, Prisma o persistencia;
- generación de hechos, authorities, evidence o petitions.

El input preparado, el resultado de FASE 6, Coverage, legal issues, trace de entrada y bloques originales deben permanecer estructuralmente inmutables. La metadata de exportación puede ser un snapshot nuevo o un campo aditivo controlado, nunca una mutación del texto fuente.

## 12. Cierre de baseline obligatorio

La última Task del plan no es condicional. Después de estabilizar los focales debe ejecutar:

```text
npm test
npm run typecheck
npm run lint
npm run build
npm audit
npm run release-gate
```

El baseline protegido es el baseline histórico PRE-FASE 7:

```text
170 test files
2321 tests PASS
0 failed
2 skipped
typecheck PASS
lint 0 errors
1032 warnings baseline
build PASS
release-gate GO
HIGH 0
CRITICAL 0
FASE 5B behavior regressions 0
FASE 6 contracts 42/42
FASE 6 behavior regressions 0
```

`170 files / 2321 tests` es el baseline PRE-FASE 7; no es un conteo final obligatorio después de agregar tests. La regla final es:

```text
all pre-FASE7 baseline tests remain PASS
+ all new FASE7 contracts/tests PASS
+ 0 failed
```

Al cerrar FASE 7 se medirán y reportarán los conteos reales, sin forzar valores históricos:

```text
final test files passed: X
final test files failed: 0
final tests passed: Y
final tests failed: 0
skipped: Z
```

No se permiten skips nuevos sin justificación explícita.

Los 1,032 warnings generales no se limpian como parte de FASE 7. Solo se admite `new FASE 7 attributable lint warnings: 0`; además: zero lint errors, zero test failures, typecheck PASS, build PASS, HIGH 0, CRITICAL 0, release-gate GO y cero regresiones FASE 5B/6.

## 13. Estado de cierre del diseño

**previous proposed contracts:** `43`  
**final proposed contracts:** `49`  
**delta:** `+6`

La lista numerada y su mapeo a Tasks, archivos de prueba y nombres exactos están congelados en el Implementation Plan. El plan está escrito para `superpowers:executing-plans`, pero no se ejecuta en esta entrega.

**Estado:** `FASE 7 SPEC + PLAN FINAL · APPROVAL REQUESTED`
