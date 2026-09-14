# LOOP 8B — FASE 2A: Demanda Ordinaria Civil Profesional

> Blueprint generado por The Architect el 2026-09-02.
> Proyecto existente: APP-plantillas. Archetype: SaaS web app jurídica.
> Alcance: habilitar únicamente `demanda_ordinaria_civil` como `IMPLEMENTED` cuando
> cumpla el criterio de aceptación de soporte real (`IMPLEMENTED_REAL`).

La revisión independiente detectó y corrigió ambigüedades sobre estados,
exportación, roles de fuente, resolución de inferencias y secciones obligatorias.
`IMPLEMENTED_REAL` es un criterio de aceptación de esta fase, no un segundo
literal del registry.

## 1. Objetivo y límites

La aplicación producirá un borrador profesional de demanda ordinaria civil a
partir de datos manuales o documentos auxiliares civiles. Conservará provenance,
expondrá faltantes y bloqueará cualquier documento incompleto como
`FINAL_DOCUMENT`.

No se implementarán otros `CATALOG_ONLY`, nuevas materias, legislación de una
entidad específica, expedientes, PDFs reales, secretos, Neon ni un segundo
pipeline. El ID canónico único será `demanda_ordinaria_civil`.

## 2. Auditoría CodeGraph incorporada

CodeGraph indexó 255 archivos, 2,665 nodos y 6,095 relaciones. La ruta principal
identificada es:

```text
/api/legal-engine/generate
  -> runGenerationPipeline
  -> buildCaseContext / runDocumentPreflight
  -> resolveDocumentRouting
  -> buildDocumentPlan
  -> generateSection
  -> sanitizeLegalDocument
  -> runQualityGateCheck
  -> /api/legal-engine/export/{docx,pdf}
```

Hallazgos obligatorios:

1. P0: el payload PDF legacy `renderedSections` puede ir directo a HTML/Chromium
   sin `validateForExport`, sanitización ni quality gate.
2. P1: `PROFESSIONAL_TEMPLATES` contiene una identidad paralela con guion.
3. P1: `CaseContext` carece de contexto civil tipado y `documentPreflight` lee
   algunas referencias desde el contenedor equivocado.
4. P1: la extracción no conserva una cadena completa de provenance para
   evidencia y puede agregar fuentes de familias distintas por orden.
5. P1: el pipeline puede conservar `generated` aunque falle el quality gate.
6. P1: los exporters de bajo nivel dependen de que la ruta HTTP invoque guards.
7. P2: `ai-assist`, `ai-fill`, `analyze-upload` y `templateRenderer` son rutas
   auxiliares/legacy y no pueden decidir el tipo final.

No se usarán documentos reales ni se modificó código durante la auditoría.

## 3. Identidad, catálogo y aliases

| Concepto | Decisión |
|---|---|
| Canonical ID | `demanda_ordinaria_civil` |
| Alias de entrada | `demanda-ordinaria-civil` |
| Alias de salida | Ninguno; siempre canonical |
| Strategy ID | `demanda_ordinaria_civil` |
| Template ID | `demanda_ordinaria_civil` |
| Estado inicial | `CATALOG_ONLY` |
| Estado al cierre | `IMPLEMENTED` solo si todos los gates pasan; `IMPLEMENTED_REAL` es el criterio de aceptación, no un estado adicional |
| Familia | Demandas civiles declarativas |
| Materia | Civil |
| Procedimiento | Ordinario civil; no determina por sí solo la vía local |

La normalización ocurre en el borde de entrada antes de routing, strategy,
template, quality gates, filename, lifecycle y export. El alias no aparecerá como
resultado duplicado. `PROFESSIONAL_TEMPLATES` será únicamente adaptador o fuente
de componentes migrables; no será una ruta de generación.

## 4. `CivilDemandContext`

Se añadirá un contexto civil opcional dentro de `CaseContext`, compatible con los
consumidores existentes:

```ts
interface CivilDemandContext {
  documentType: 'demanda_ordinaria_civil';
  sources: CivilSourceDescriptor[];
  parties: {
    actor: CaseContextField;
    demandado: CaseContextField;
    representatives: CaseContextField[];
    addresses: CaseContextField[];
  };
  personality: CaseContextField;
  procedural: {
    court: CaseContextField;
    jurisdiction: CaseContextField;
    procedure: CaseContextField;
    action: CaseContextField;
  };
  claims: CivilClaim[];
  facts: CivilFact[];
  evidence: CivilEvidence[];
  contracts: CaseContextField[];
  obligations: CaseContextField[];
  amounts: CaseContextField[];
  dates: CaseContextField[];
  requests: CivilRequest[];
  legalBasis: LegalBasisItem[];
  signature: CaseContextField;
}
```

Cada dato conserva `value`, `status` (`CONFIRMED`, `MISSING`, `ANONYMIZED`) y
`provenance`. Además conservará una resolución separada:
`CONFIRMED`, `INFERRED` o `REQUIRES_LAWYER_DECISION`. Una inferencia nunca se
marca como `CONFIRMED`; una decisión jurídica no se resuelve automáticamente.
En el mapping civil, `claims` representa prestaciones reclamadas y `requests`
representa puntos petitorios. `actor` no se deriva de `quejoso`; los roles
civiles se llenan desde fuente civil o entrada manual confirmada.

## 5. Fuentes, múltiples fuentes y provenance

Cada fuente conservará su clasificación individual:

```ts
interface CivilSourceDescriptor {
  id: string;
  sourceType: SourceDocumentTypeValue;
  matter?: string;
  role: 'PRIMARY' | 'SUPPORTING' | 'REFERENCE' | 'UNSPECIFIED';
  status: 'VALIDATED' | 'UNVALIDATED' | 'ANALYSIS_PENDING' | 'INCOMPATIBLE';
  provenance: 'KNOWN_PROVENANCE' | 'PARTIAL_PROVENANCE' | 'MANUAL_INPUT';
}

interface ProvenanceRef {
  documentId?: string;
  page?: number;
  fragmentId?: string;
  excerpt?: string;
  confirmedByLawyer?: boolean;
  kind: 'KNOWN_PROVENANCE' | 'PARTIAL_PROVENANCE' | 'MANUAL_INPUT';
}
```

Se tiparán como auxiliares civiles: contrato, convenio, requerimiento,
comunicación, prueba documental y documento civil auxiliar. Se usarán como apoyo
sin convertir automáticamente obligaciones en prestaciones, texto contractual
en hechos ni adjuntos en pruebas ofrecidas.

Para `PRIMARY` y `SUPPORTING`, el preflight evalúa cada fuente de forma
independiente. Una fuente `REFERENCE` no controla el output ni se mezcla con
hechos confirmados. Una fuente laboral, penal, de amparo o mercantil incompatible
produce `SOURCE_DOCUMENT_INCOMPATIBLE` cuando se usa como principal o apoyo. Si
no hay página o fragmento, se conserva solo la provenance disponible. Una fuente
sin `role` se normaliza a `UNSPECIFIED/NEEDS_INPUT`, nunca a `PRIMARY`; no podrá
participar como fuente principal hasta que el abogado confirme su función.

`MANUAL_INPUT` solo puede respaldar un hecho, claim, evidencia o petición cuando
`confirmedByLawyer: true`; de lo contrario conserva estado pendiente y bloquea
`FINAL_DOCUMENT`. El arreglo `CivilDemandContext.sources` es la única fuente de
verdad para la clasificación individual; no se agregará un corpus por posición
ni se permitirá que la primera fuente determine el tipo de las demás.

## 6. Entidades estructuradas

```ts
interface CivilFact {
  id: string;
  order: number;
  text: string;
  status: CaseFieldStatus;
  sources: ProvenanceRef[];
}

interface CivilClaim {
  id: string;
  description: string;
  amount?: CaseContextField;
  basis?: CaseContextField;
  relatedFacts: string[];
  sources: ProvenanceRef[];
  status: CaseFieldStatus;
}

interface CivilEvidence {
  id: string;
  type: string;
  description: string;
  purpose?: string;
  relatedFacts: string[];
  source?: ProvenanceRef;
  status: CaseFieldStatus;
}

interface CivilRequest {
  id: string;
  description: string;
  relatedClaims: string[];
  status: CaseFieldStatus;
  sources: ProvenanceRef[];
}

interface LegalBasisItem {
  id: string;
  text: string;
  status: CaseFieldStatus;
  sources: ProvenanceRef[];
}
```

Los IDs serán estables dentro del documento. La extracción solo acepta hechos,
claims, evidencia, fundamentos y peticiones explícitos. No agregará testigos,
periciales, confesionales, inspecciones, cantidades o peticiones por defecto.
Los datos introducidos manualmente sin confirmación expresa del abogado se
conservarán como pendientes y no se presentarán como hechos confirmados.

## 7. Strategy y renderer canónicos

Se creará una strategy civil dedicada integrada al `documentPlan` único. No
invocará `PROFESSIONAL_TEMPLATES`, `templateRenderer` ni el template genérico
`demanda` como ruta productiva.

El template canónico tendrá esta estructura propia:

```text
DESTINATARIO
COMPARECENCIA
PERSONALIDAD
IDENTIFICACIÓN DE LAS PARTES
VÍA Y ACCIÓN
PRESTACIONES
HECHOS
DERECHO
PRUEBAS
PUNTOS PETITORIOS
FIRMA
```

Cada sección tendrá un ID canónico estable. El renderer común podrá reutilizar
formato, estilos y binarios, pero la estructura, roles, campos, reglas y
prohibiciones pertenecerán a `demanda_ordinaria_civil`.

La IA recibirá únicamente facts, claims, evidence, requests y fundamentos
permitidos. Sin fundamento jurídico validado, `DERECHO` mostrará
`[REQUIERE FUNDAMENTACIÓN JURÍDICA DEL ABOGADO]` y el documento no será final.

## 8. Source policy

```ts
{
  selectedDocumentType: 'demanda_ordinaria_civil',
  status: 'EXPLICIT_COMPATIBILITY',
  sourceRequired: false,
  acceptedSourceTypes: [
    'CONTRATO_CIVIL', 'CONVENIO_CIVIL', 'REQUERIMIENTO_CIVIL',
    'COMUNICACION_CIVIL', 'PRUEBA_DOCUMENTAL_CIVIL',
    'DOCUMENTO_CIVIL_AUXILIAR'
  ],
  optionalSourceTypes: []
}
```

`acceptedSourceTypes` enumera todas las fuentes permitidas; `sourceRequired: false`
indica que todas son opcionales y que también existe `NEW_WRITING`. No se usará
`acceptedSourceTypes: []` para expresar opcionalidad. Con fuentes, se validan una
por una y se conserva el role. La fuente nunca reemplaza
`selectedDocumentType`; cualquier tipo fuera de esta lista bloquea el preflight.

## 9. Preflight y `requiredFields`

| Nivel | Campos |
|---|---|
| `CRITICAL_REQUIRED` | actor, demandado, una prestación y un hecho |
| `REQUIRED_FOR_FINAL` | court, jurisdiction, vía/procedure confirmada, action confirmada o decisión del abogado, requests, firma y fundamentos revisados |
| `OPTIONAL` | representantes, domicilios, contratos, obligaciones, cantidades, fechas, evidence y fuentes auxiliares |
| `LAWYER_DECISION` | acción, competencia, órgano, vía y teoría jurídica no confirmadas |

El preflight dedicado devolverá `READY`, `NEEDS_INPUT`,
`SOURCE_DOCUMENT_INCOMPATIBLE` o `EXTRACTION_INCOMPLETE`. Nunca elegirá
competencia, órgano, acción o vía. Usará `REQUIERE_DEFINICION_ABOGADO` para
decisiones profesionales.

## 10. Lifecycle

```text
GENERATING -> DRAFT / REVIEW_REQUIRED -> READY_TO_EXPORT -> FINAL_DOCUMENT
```

Si falla un quality gate, el documento queda en `DRAFT` con readiness
`REVIEW_REQUIRED`; nunca se presenta como `generated`, `READY_TO_EXPORT` o
`FINAL_DOCUMENT`. Todo `DRAFT`, completo o incompleto, puede guardarse y
editarse, pero no puede exportarse. La exportación solo puede comenzar cuando
el sistema haga una transición explícita a `READY_TO_EXPORT`, después de que
todos los gates pasen; el resultado exportado podrá marcarse como
`FINAL_DOCUMENT` únicamente con ese mismo contrato de validación.

## 11. Quality gates civiles

Se registrarán reglas aplicables solo al canonical ID:

1. actor y demandado presentes y no anonimizados;
2. prestaciones no vacías ni inferidas sin confirmación;
3. hechos con IDs estables y provenance disponible;
4. cada claim relacionado con hechos cuando corresponda;
5. evidencia solo si fue aportada y con provenance conocida o parcial;
6. ausencia de lenguaje de amparo, agravios, resolución impugnada, autoridad
   responsable, revocación o conceptos de violación;
7. ausencia de hechos, cantidades, fechas, pruebas, artículos, jurisprudencia o
   peticiones inventados;
8. requiredSections completas por ID, no por palabras;
9. placeholders y anonimizados bloquean FINAL;
10. fundamentos sin fuente válida producen `REVIEW_REQUIRED`;
11. coherencia claims/facts/evidence/requests;
12. materia, rol y filename corresponden al ID canónico.

Las secciones obligatorias se validarán por estos IDs, no por coincidencias de
texto:

| Section ID | Contenido mínimo | Fuente de datos |
|---|---|---|
| `destinatario` | órgano destinatario | `procedural.court` |
| `comparecencia` | comparecencia y calidad | `parties.actor` |
| `personalidad` | personalidad/representación | `personality`, `representatives` |
| `identificacion_partes` | identificación de actor y demandado | `parties` |
| `via_accion` | vía, procedimiento y acción | `procedural` |
| `prestaciones` | prestaciones reclamadas | `claims` |
| `hechos` | hechos ordenados | `facts` |
| `derecho` | fundamentos revisados | `legalBasis` |
| `pruebas` | pruebas aportadas y su finalidad | `evidence` |
| `petitorios` | puntos petitorios | `requests` |
| `firma` | firma o pendiente explícito | `signature` |

## 12. Guard común de exportación

Se creará `assertUniversalDocumentExportable(document)` para DOCX, PDF y
exporters universales:

```text
canonicalizeDocumentType
 -> validateForExport
 -> sanitizeLegalDocument
 -> validateForExport nuevamente
 -> runQualityGateCheck
 -> validateDocument
 -> comprobar lifecycle/readiness
 -> exporter binario
```

El guard será obligatorio tanto en las rutas HTTP como dentro de los exporters
universales de DOCX y PDF; una ruta no podrá obtener un binario llamando al
exporter de bajo nivel directamente. La ruta PDF ya no aceptará
`renderedSections` sin `UniversalLegalDocument`. Ese payload será rechazado con
error de migración; si llega junto con `document`, se ignora y todo se deriva del
documento universal. No habrá bypass por HTML o Chromium.

DOCX y PDF bloquearán gates fallidos, campos críticos pendientes, secciones
faltantes, placeholders, anonimizados, contaminación de fuente, estado
incorrecto o tipo no canónico.

## 13. Rutas legacy

| Ruta | Tratamiento |
|---|---|
| `PROFESSIONAL_TEMPLATES` | Adaptador de alias/componentes; nunca genera directamente |
| `templateRenderer` | Compatibilidad fuera de la ruta civil; no será pipeline paralelo |
| `ai-assist` / `ai-fill` | Adaptadores que delegan tipo, contexto, provenance y gates |
| `analyze-upload` | Adaptador de extracción; no decide output |
| `generate-section` | Opera sobre documento canónico y revalida antes de exportar |
| `api/ai/generate` | No produce el canonical ID sin delegar al pipeline |

## 14. UI

El catálogo mostrará `Demanda Ordinaria Civil` como disponible solo cuando el
registry reporte `IMPLEMENTED`:

```text
Civil -> Juicios declarativos -> Demandas civiles -> Demanda Ordinaria Civil
  -> datos manuales o fuentes auxiliares -> faltantes agrupados -> DRAFT
```

Los faltantes se agruparán en Partes, Acción/pretensión, Hechos, Datos
procesales, Pruebas, Fundamentación y Firma. La UI mostrará decisiones
profesionales pendientes, el `role` de cada fuente (`PRIMARY`, `SUPPORTING`,
`REFERENCE` o `UNSPECIFIED`) y su estado de provenance. Deshabilitará
exportación cuando `canMarkAsFinal` sea falso; el servidor repetirá la decisión
con el guard común.

## 15. Tests obligatorios

Todos los fixtures serán sintéticos y no contendrán expedientes, PDFs reales ni
referencias de casos reales.

1. Routing y clasificación al canonical ID.
2. Alias con guion normalizado.
3. No existe template/pipeline paralelo.
4. `NEW_WRITING` sin fuente permitido.
5. Contrato civil auxiliar con provenance.
6. Fuentes laboral y mercantil incompatibles bloqueadas.
7. Fuente `REFERENCE` no controla clasificación.
8. Múltiples fuentes conservan clasificación y role individual.
9. Facts con IDs, orden y provenance.
10. Claims relacionados con facts.
11. No inventa hechos, cantidades, pruebas, artículos ni jurisprudencia.
12. Anonimizados permanecen `ANONYMIZED`.
13. Preflight sin actor/demandado/pretensión devuelve `NEEDS_INPUT`.
14. DRAFT incompleto es editable; FINAL incompleto es rechazado.
15. Quality gate fallido produce `REVIEW_REQUIRED`.
16. Required sections completas por IDs canónicos.
17. Guard común bloquea DOCX y PDF incompletos.
18. Payload PDF legacy sin document universal es bloqueado.
19. Alias y filename producen nombre canónico.
20. DOCX y PDF válidos con documento sintético listo.
21. Ediciones manuales se conservan.
22. `generate-section` revalida antes de exportar.
23. No cross-family fallback.
24. `CaseContext.civil` se consume sin leer referencias desde el contenedor
    genérico equivocado.
25. Cada fuente mantiene `sourceType`, role y provenance sin agregación por
    posición.
26. Role omitido queda `UNSPECIFIED/NEEDS_INPUT`, no `PRIMARY`.
27. `MANUAL_INPUT` sin `confirmedByLawyer` no satisface un gate.
28. Un quality gate fallido no deja lifecycle `generated`.
29. Los exporters de bajo nivel bloquean directamente documentos no exportables.
30. PDF legacy es rechazado con y sin `document` universal.

## 16. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Template incompleto habilita el catálogo | Registry exige strategy, fields, sections, policy y gates |
| Actor confundido con quejoso | Contexto civil y mapping de roles explícito |
| Fuente auxiliar convertida en hechos | Role/provenance y extractor limitado |
| Mezcla por orden de fuentes | Evaluación individual y rechazo incompatible |
| Exportación legacy | Guard común y rechazo de `renderedSections` aislado |
| IA inventa fundamentos | Prompt contract, datos estructurados y gates |
| `generated` tras fallo | Readiness `REVIEW_REQUIRED` |
| Regresión legacy | Alias de entrada y adaptadores sin segundo pipeline |

## 17. Orden exacto de implementación

1. Leer la guía local de Next.js 16 en `node_modules/next/dist/docs/` y verificar
   el estado de archivos sin revertir cambios.
2. Crear tests rojos sintéticos para identidad, contexto, sources, preflight,
   gates, lifecycle y exportación.
3. Normalizar el alias con guion y retirar su uso productivo paralelo.
4. Extender `SourceDocumentType` y el descriptor multi-fuente/provenance civil.
5. Implementar `CivilDemandContext` y extracción estructurada compatible.
6. Implementar strategy y template civil dedicado.
7. Conectar facts, claims, evidence y requests al plan/renderer único.
8. Registrar requiredFields, requiredSections y source policy.
9. Implementar preflight civil y `REVIEW_REQUIRED`.
10. Añadir quality gates y prohibiciones civiles.
11. Crear el guard común y cerrar el PDF legacy.
12. Hacer que DOCX, PDF y `generate-section` lo consuman.
13. Integrar intake de faltantes y bloqueo visual de exportación.
14. Ejecutar revisión jurídica y operativa independiente.
15. Corregir únicamente P0/P1 demostrados en la ruta.
16. Ejecutar focales, suite, typecheck, lint, build webpack y QA interactivo.
17. Cambiar solo `demanda_ordinaria_civil` a `IMPLEMENTED` si todo pasa.

## 18. Stack y comandos existentes

| Capa | Tecnología | Decisión |
|---|---|---|
| Framework | Next.js 16.3.4 App Router | Se conserva |
| Lenguaje | TypeScript estricto | Contratos tipados |
| UI | React 19 + Tailwind 4 | Reutilizar componentes |
| Persistencia | Prisma 6.19.x | Sin migración en esta fase |
| DOCX/PDF | Exporters universales existentes | Guard final común |
| Tests | Vitest | TDD sintético |

Comandos:

```powershell
npx vitest run <focales>
npm test
npm run typecheck
npm run lint -- --quiet
npm run build
```

`npm run build` ejecuta `prisma generate && next build --webpack`. Las pruebas
deterministas pueden usar variables de proceso vacías para NVIDIA; nunca se
modifica `.env`.

## 19. Skills de construcción

| Skill | Uso |
|---|---|
| `test-driven-development` | Tests rojos antes de cada cambio productivo |
| `dispatching-parallel-agents` | Auditorías independientes sin scopes solapados |
| `subagent-driven-development` | Tareas con revisión y fix loop |
| `systematic-debugging` | Toda regresión antes de corregir |
| `ui-ux-pro-max` | Intake y estados de faltantes |
| `browser:control-in-app-browser` | QA interactivo final |
| `verification-before-completion` | Evidencia antes del cierre |

## 20. AGENTS.md objetivo

El archivo raíz conservará las reglas actuales de Next.js y añadirá:

```markdown
<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Reglas de Fase 2A

1. No usar documentos, expedientes, PDFs reales, secretos ni casos reales.
2. No hardcodear entidad federativa, artículos o jurisprudencia no confirmados.
3. `demanda_ordinaria_civil` es el único ID productivo; el alias con guion solo es de entrada.
4. No convertir fuentes auxiliares en hechos, claims o pruebas sin provenance y confirmación.
5. No inventar partes, fechas, cantidades, acción, competencia, vía, peticiones o fundamentos.
6. No crear un segundo pipeline desde templates, asistentes o renderers legacy.
7. Todo incompleto queda `DRAFT/REVIEW_REQUIRED` y nunca se exporta como FINAL.
8. DOCX y PDF pasan el guard común después de normalizar y sanitizar.
9. No habilitar otro `CATALOG_ONLY` durante esta fase.
10. Usar TDD y validar completamente antes de declarar cierre.
```

## 21. Criterios de cierre

La fase solo se declara cerrada cuando el alias y el canonical convergen en todos
los puntos; strategy/template/renderer, contexto, provenance, preflight, gates y
lifecycle funcionan; `NEW_WRITING` sin fuente funciona; las fuentes incompatibles
se bloquean; DRAFT es editable y FINAL incompleto es imposible; no existe bypass
PDF/DOCX; focales, suite, typecheck, lint, build y QA pasan; no quedan P0/P1 de
esta ruta; y únicamente `demanda_ordinaria_civil` cambia a `IMPLEMENTED`.

**LOOP 8B — FASE 2A: DEMANDA ORDINARIA CIVIL — CERRADO: SÍ/NO**
