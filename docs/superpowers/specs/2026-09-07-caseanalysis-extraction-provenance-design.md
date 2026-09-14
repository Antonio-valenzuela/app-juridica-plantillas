# FASE 1 — CaseAnalysis Extraction + Provenance

**Fecha:** 2026-09-07  
**Proyecto:** `C:\Users\yahir\Desktop\APP-plantillas`  
**Fase:** 1 — extracción jurídica robusta y `CaseAnalysis` con provenance  
**Estado:** diseño aprobado en conversación; pendiente de revisión escrita antes de `writing-plans`

## 1. Problema y resultado esperado

La FASE 0 hizo observable la generación, pero la entrada jurídica todavía llega a `CaseAnalysis` mediante una mezcla de expresiones regulares, strings heredados y estructuras parciales. La extracción actual puede perder pruebas enumeradas, tratar una alegación como hecho, mezclar un documento con una prueba ofrecida, perder el rol de quien afirma una proposición, deduplicar sin conservar todas las fuentes o convertir datos faltantes en valores implícitos.

El resultado de esta fase será un subsistema de extracción por capas que transforme documentos fuente heterogéneos en un `CaseAnalysis` rico, normalizado y trazable, sin generar todavía defensas, excepciones, argumentos nuevos, posturas procesales ni conclusiones de procedencia jurídica.

El flujo objetivo es:

`raw pages/elements → candidate segmentation → classification → normalization → deduplication → conflict detection → provenance → rich CaseAnalysis → legacy compatibility projection`

La fuente conservará prioridad semántica. Una afirmación de una parte seguirá siendo una afirmación atribuida a esa parte; una mención de prueba seguirá siendo una mención; una cita seguirá siendo una cita no verificada; y un dato ausente seguirá ausente.

## 2. Alcance aprobado

La fase cubre:

- un subsistema reutilizable bajo `lib/legal-engine/case-extraction/`;
- extracción por candidatos antes de normalizar;
- clasificación determinística por tipo y estado;
- normalización de valores y relaciones cuando la fuente lo permita;
- deduplicación conservando todas las referencias de provenance;
- detección de conflictos estructurales sin resolverlos automáticamente;
- modelos ricos para partes, afirmaciones, claims, hechos, documentos, pruebas, argumentos, autoridades, fechas, cantidades, conflictos y datos faltantes;
- separación explícita entre posición de la fuente y posición del cliente;
- integración aditiva con `GenerationTrace` para registrar candidatos, decisiones y estadísticas de extracción;
- proyección temporal hacia los campos existentes de `CaseAnalysis`;
- reutilización de `buildDocumentIndex` para páginas, elementos y tablas existentes;
- cinco fixtures sintéticos reproducibles;
- los 30 contratos de prueba definidos en esta especificación.

## 3. Fuera de alcance

Esta fase no hará lo siguiente:

- generar defensas, excepciones, agravios, argumentos jurídicos nuevos o teoría del caso nueva;
- elegir pruebas para ofrecer o marcar pruebas como `CLIENT_CONFIRMED` sin confirmación expresa;
- convertir alegaciones en hechos establecidos;
- verificar online artículos, tesis, jurisprudencia o precedentes;
- crear `LegalIssueMatrix`;
- reescribir completamente `DocumentPlan`;
- generar múltiples llamadas por controversia;
- ampliar artificialmente el texto, las palabras o las páginas del DOCX;
- modificar el renderer DOCX o el formato Word salvo una integración estrictamente necesaria para conservar provenance ya existente;
- hacer migraciones de base de datos;
- añadir persistencia de extracción en base de datos;
- depender de NVIDIA para que la extracción básica funcione;
- sustituir la extracción determinística por una llamada única a un LLM.

## 4. Evidencia de la arquitectura existente

La exploración del repositorio identificó estos puntos de integración:

1. `lib/legal-engine/caseAnalysis.ts:581` expone `reconstructCaseAnalysis` como punto público y recibe `UploadedSourceDocument[]`.
2. `reconstructCaseAnalysis` convierte páginas o texto completo en entradas con `documentId`, `filename` y `page`, y después invoca helpers para partes, hechos, claims, pruebas, actos, considerandos y resolutivos.
3. `CaseAnalysis` en `lib/legal-engine/caseAnalysis.ts` contiene actualmente partes como strings, `claims: string[]`, `claimResponses?: AnalyzedClaim[]`, `facts: AnalyzedFact[]`, `evidence` con forma ad hoc, `arguments: string[]`, `citations` y `missingData: string[]`.
4. `AnalyzedFact`, `AnalyzedClaim`, `SourceReference`, `ProvenanceKind`, `UploadedSourceDocument` y `DocumentPage` están definidos en `lib/legal-engine/types.ts`.
5. `lib/legal-engine/documentIndex.ts` ya construye páginas, elementos, headings, paragraphs, signatures, tables, fechas, authorities, citations y legal references mediante `buildDocumentIndex`.
6. `lib/pdf/documentExtractor.ts` entrega texto y páginas ordenadas desde PDF, DOCX, texto y otros formatos admitidos.
7. `app/api/templates/analyze-upload/route.ts` ejecuta `extractDocument`, crea un `UploadedSourceDocument`, llama a `reconstructCaseAnalysis` y devuelve el análisis estructurado.
8. `app/machotes/components/CaseDocumentsReader.tsx` consume `reconstructCaseAnalysis` para mostrar categorías de análisis en la interfaz.
9. `lib/legal-engine/caseWorkflow.ts` normaliza hechos y claims y conserva aliases legacy, por lo que la nueva estructura debe pasar por una proyección segura antes de llegar a ese contrato.
10. `lib/legal-engine/generationTrace.ts` ya dispone de snapshots genéricos de `CaseAnalysis` y debe extenderse sin romper la trazabilidad de la FASE 0.

### 4.1. Limitaciones actuales que esta fase corrige

- `extractNumberedFacts` solo reconoce principalmente hechos numerados; no representa átomos de un párrafo con varios acontecimientos.
- `extractClaims` crea objetos individuales cuando encuentra líneas separadas, pero no ofrece un modelo completo de claimant, relief, bases fácticas, evidencia, monto y estado.
- `extractEvidenceFromSources` reconoce ciertos encabezados, exige patrones de línea y establece `confirmed: true`, lo que no distingue mención de prueba ofrecida.
- `CaseAnalysis.citations` queda vacío en la reconstrucción actual aunque el documento fuente pueda contener artículos o jurisprudencia.
- `arguments` se deriva de issues generados, no de argumentos atribuidos extraídos de la fuente.
- `missingData` se limita a strings genéricos.
- `SourceReference` conserva document/page/snippet, pero no existe una referencia uniforme con sección, párrafo, hash de excerpt, rol del hablante, método y nivel de inferencia.

## 5. Arquitectura elegida

Se adopta un subsistema modular de extracción por capas. `reconstructCaseAnalysis` seguirá siendo la función pública compatible, pero delegará la extracción a un orquestador del nuevo directorio.

### 5.1. Módulos nuevos propuestos

Los nombres son parte del diseño y podrán ajustarse durante `writing-plans` únicamente si se conserva la responsabilidad indicada:

- `lib/legal-engine/case-extraction/types.ts` — tipos de candidatos, provenance y entidades ricas.
- `lib/legal-engine/case-extraction/sourceUnits.ts` — adaptación de `UploadedSourceDocument` y `DocumentIndex` a unidades ordenadas de página, elemento, párrafo, línea y tabla.
- `lib/legal-engine/case-extraction/candidateSegmentation.ts` — segmentación por encabezados, listas, numeración, viñetas, comas, punto y coma, tablas y párrafos corridos.
- `lib/legal-engine/case-extraction/classification.ts` — clasificación determinística de candidatos y atribución de rol/estado.
- `lib/legal-engine/case-extraction/normalization.ts` — normalización segura de nombres, aliases, fechas, cantidades, autoridades, estados y relaciones.
- `lib/legal-engine/case-extraction/deduplication.ts` — claves canónicas prudentes y fusión que conserva todas las provenance.
- `lib/legal-engine/case-extraction/conflicts.ts` — comparación de hechos, fechas, cantidades, roles e identidades sin elegir ganador.
- `lib/legal-engine/case-extraction/legacyProjection.ts` — proyección explícita y documentada a los campos legacy.
- `lib/legal-engine/case-extraction/orchestrator.ts` — flujo completo y estadísticas de extracción.

La implementación deberá reutilizar `buildDocumentIndex` como fuente de elementos y tablas. No se creará un segundo parser de páginas o tablas paralelo. Si una fuente todavía no tiene `DocumentIndex`, `sourceUnits` podrá construir una adaptación mínima a partir de `pages` y `extractedText`, identificándola como de menor granularidad.

### 5.2. Uso opcional de clasificación semántica

La clasificación básica será determinística. Una futura clasificación LLM podrá actuar como señal complementaria para lenguaje natural ambiguo, pero:

- no podrá ser la única fuente de un dato material;
- deberá devolver IDs de candidatos existentes;
- deberá conservar la provenance original;
- deberá pasar validadores determinísticos;
- no podrá cambiar `SOURCE_ASSERTION` a `ESTABLISHED_FACT` por sí sola;
- no podrá marcar `CLIENT_CONFIRMED`, `PARTY_OFFERED` o `LEGALLY_VERIFIED` sin evidencia explícita.

La fase funcionará completamente sin NVIDIA.

## 6. Modelo de provenance

Se definirá un tipo equivalente a `SourceProvenance` con esta semántica:

```ts
interface SourceProvenance {
  sourceId: string;
  sourceType?: string;
  sourceName?: string;
  page?: number;
  section?: string;
  paragraphIndex?: number;
  elementIndex?: number;
  excerptHash: string;
  excerpt?: string;
  speakerRole?: SpeakerRole;
  extractionMethod: ExtractionMethod;
  confidence: number;
  inferenceLevel: InferenceLevel;
}
```

Campos y reglas:

- `sourceId` será obligatorio y se tomará del documento fuente.
- `page`, `section`, `paragraphIndex` y `elementIndex` se conservarán cuando el extractor los proporcione.
- `excerptHash` será obligatorio para cada dato material.
- `excerpt` será un fragmento limitado y sanitizado, nunca el documento completo.
- `speakerRole` identificará quién afirma o presenta el dato cuando la fuente lo permita.
- `extractionMethod` distinguirá al menos `HEADING`, `NUMBERED_LIST`, `BULLET_LIST`, `TABLE`, `PARAGRAPH`, `PATTERN`, `NORMALIZATION` y `MANUAL_INPUT`.
- `confidence` expresará confianza de extracción, no verdad jurídica.
- `inferenceLevel` será `LITERAL`, `NORMALIZED`, `RELATION_INFERRED` o `UNKNOWN`.

La estructura podrá incluir un alias compatible con `SourceReference`, pero `SourceProvenance` será la representación canónica de esta fase. Al fusionar dos menciones se conservará un array con las dos provenance completas.

## 7. Candidatos y estados de extracción

Todo dato material pasará primero por un candidato explícito:

```ts
interface ExtractionCandidate {
  candidateId: string;
  kind: CandidateKind;
  rawText: string;
  sourceProvenance: SourceProvenance[];
  speakerRole?: SpeakerRole;
  classification?: CandidateClassification;
  normalized?: unknown;
  decision: 'ACCEPTED' | 'MERGED' | 'REJECTED' | 'REQUIRES_REVIEW';
  decisionReason?: string;
}
```

El candidato se mantendrá separado del objeto final para poder registrar cuántos fueron detectados, aceptados, fusionados, rechazados o enviados a revisión.

## 8. Modelo de partes e identidades

La representación rica será equivalente a:

```ts
interface CaseParty {
  id: string;
  name?: string;
  role: PartyRole;
  aliases: string[];
  provenance: SourceProvenance[];
  confidence: number;
  confirmed: boolean;
}
```

Roles mínimos: actor, demandado, promovente, quejoso, tercero, autoridad, representante, autorizado y apoderado.

Reglas:

- nombres parecidos no se fusionarán automáticamente;
- un alias se agregará solo si la fuente o una regla determinística explícita lo permite;
- dos candidatos con posible identidad común podrán producir `CaseConflict` en vez de una fusión;
- `confirmed` solo será verdadero cuando exista confirmación explícita del cliente, abogado o metadata de revisión humana; una etiqueta de rol en la fuente aumenta la evidencia y la confianza, pero nunca confirma por sí sola la identidad;
- los campos legacy `parties.actor`, `parties.demandado`, etc. serán una proyección segura y no la fuente canónica.

## 9. Afirmaciones y hechos

### 9.1. Afirmación atribuida

Se definirá `SourceAssertion` para conservar actor, proposición y estado:

```ts
interface SourceAssertion {
  id: string;
  actorPartyId?: string;
  actorRole?: SpeakerRole;
  proposition: string;
  status: 'ALLEGED' | 'DENIED' | 'ADMITTED' | 'REPORTED' | 'UNKNOWN';
  provenance: SourceProvenance[];
}
```

La frase “la actora afirma que el demandado incumplió” conservará como actor a la parte actora y no se proyectará como incumplimiento establecido.

### 9.2. Hecho atómico

Se definirá `FactItem` equivalente a:

```ts
interface FactItem {
  id: string;
  proposition: string;
  date?: NormalizedDate;
  participants: string[];
  amount?: NormalizedAmount;
  location?: string;
  sourceRole?: SpeakerRole;
  assertionStatus: 'SOURCE_ASSERTION' | 'ESTABLISHED_FACT' | 'UNKNOWN';
  provenance: SourceProvenance[];
  relatedDocumentIds: string[];
}
```

La segmentación será prudente. Un párrafo con dos acontecimientos podrá producir dos hechos si existen límites semánticos claros; ambos conservarán la referencia al mismo párrafo y excerpt original. Cuando la separación no sea segura, se conservará un solo candidato y se registrará `REQUIRES_REVIEW`.

`ESTABLISHED_FACT` no se asignará por presencia de una oración en la demanda. Solo se podrá usar si la fuente lo presenta como establecido por una resolución, admisión u otra base explícita, conservando esa atribución.

## 10. Claims o pretensiones

Cada pretensión individual será un `ClaimItem`:

```ts
interface ClaimItem {
  id: string;
  claimantPartyId?: string;
  requestedRelief: string;
  factualBasisIds: string[];
  evidenceMentionIds: string[];
  amount?: NormalizedAmount;
  provenance: SourceProvenance[];
  status: 'SOURCE_MENTIONED' | 'SOURCE_ASSERTED' | 'NEEDS_REVIEW' | 'UNKNOWN';
}
```

La fase entenderá qué se reclama, pero no determinará procedencia jurídica. Una frase con “cumplimiento del contrato y pago de daños y perjuicios” producirá dos claims cuando la segmentación sea inequívoca; cada uno conservará el mismo párrafo de origen y sus relaciones disponibles.

## 11. Documentos, pruebas y objeto probatorio

Los conceptos quedarán separados:

```ts
interface DocumentItem {
  id: string;
  title: string;
  documentType?: string;
  status: 'SOURCE_MENTIONED' | 'SOURCE_ATTACHED' | 'EXTRACTED' | 'NEEDS_REVIEW';
  provenance: SourceProvenance[];
}

interface EvidenceMention {
  id: string;
  documentItemId?: string;
  type?: string;
  description: string;
  relatedFactIds: string[];
  relatedClaimIds: string[];
  statedPurpose?: string;
  status: 'SOURCE_MENTIONED' | 'SOURCE_ATTACHED' | 'EXTRACTED' | 'POTENTIALLY_RELEVANT' | 'NEEDS_REVIEW';
  provenance: SourceProvenance[];
}

interface EvidenceOffer {
  id: string;
  evidenceMentionId: string;
  status: 'PARTY_OFFERED' | 'CLIENT_CONFIRMED' | 'NEEDS_REVIEW';
  provenance: SourceProvenance[];
}
```

Reglas obligatorias:

- `EvidenceMention.status = SOURCE_MENTIONED` nunca se proyectará como `confirmed: true` en la capa rica ni como `CLIENT_CONFIRMED`.
- Un `DocumentItem` mencionado o adjunto no será automáticamente `EvidenceOffer`.
- `PARTY_OFFERED` solo se asignará cuando la fuente lo afirme explícitamente y atribuya quién lo ofreció.
- `CLIENT_CONFIRMED` requiere confirmación expresa del cliente o abogado.
- Si la fuente dice que una prueba se relaciona con el hecho tercero para acreditar el pago, se conservarán `relatedFactIds` y `statedPurpose`.
- Si la fuente no expresa el propósito, `statedPurpose` quedará ausente.

La extracción por capas soportará headings como `PRUEBAS`, `DOCUMENTALES`, `ANEXOS` y `MEDIOS DE CONVICCIÓN`; listas numeradas, romanas, letras, viñetas, comas, punto y coma, párrafos corridos y tablas provenientes de `DocumentIndex`.

## 12. Fechas y cantidades

Se definirán valores normalizados sin perder el raw:

```ts
interface NormalizedDate {
  rawValue: string;
  normalizedValue?: string;
  precision: 'DAY' | 'MONTH' | 'YEAR' | 'UNKNOWN';
  provenance: SourceProvenance[];
}

interface NormalizedAmount {
  rawValue: string;
  normalizedValue?: number;
  currency?: string;
  unit?: string;
  provenance: SourceProvenance[];
}
```

Reglas:

- `3 de enero de 2026` podrá normalizarse a `2026-01-03`.
- `enero de 2026` conservará precisión mensual sin inventar día.
- `$20,000.00 (veinte mil pesos 00/100 M.N.)` podrá normalizarse a `20000 MXN` si la evidencia es inequívoca.
- una cantidad o fecha contradictoria no se resolverá; producirá `CaseConflict`.

## 13. Argumentos y autoridades citadas

Los argumentos se extraerán como `ArgumentItem` y no como hechos:

```ts
interface ArgumentItem {
  id: string;
  speakerRole?: SpeakerRole;
  proposition: string;
  supportingFactIds: string[];
  citedAuthorityIds: string[];
  provenance: SourceProvenance[];
}
```

Las normas y jurisprudencia citadas en la fuente se representarán como `SourceAuthorityMention`:

```ts
interface SourceAuthorityMention {
  id: string;
  authorityType: 'ARTICLE' | 'LAW' | 'CODE' | 'THESIS' | 'JURISPRUDENCE' | 'PRECEDENT' | 'OTHER';
  citationText: string;
  verificationStatus: 'SOURCE_CITED' | 'LEGALLY_VERIFIED';
  provenance: SourceProvenance[];
}
```

En esta fase solo se asignará `SOURCE_CITED`. `LEGALLY_VERIFIED` queda reservado para una fase posterior.

## 14. Conflictos y datos faltantes

### 14.1. Conflictos

Se definirá `CaseConflict`:

```ts
interface CaseConflict {
  conflictId: string;
  type: 'DATE' | 'AMOUNT' | 'IDENTITY' | 'ROLE' | 'OPPOSING_ASSERTION' | 'OTHER';
  itemIds: string[];
  sourceIds: string[];
  description: string;
  requiresReview: true;
}
```

Los conflictos quedarán abiertos. La deduplicación podrá agrupar candidatos equivalentes, pero no podrá escoger qué documento es correcto cuando existan valores incompatibles.

### 14.2. Datos faltantes

`missingData` rico será equivalente a:

```ts
interface MissingDataItem {
  field: string;
  reason: string;
  importance: 'LOW' | 'MEDIUM' | 'HIGH';
  sectionAffected?: string;
  blocking: boolean;
  sourceSearched: string[];
  requiresClientInput: boolean;
}
```

La proyección legacy podrá producir strings legibles, pero no podrá convertir un faltante en un valor supuesto.

## 15. Posición de la fuente y posición del cliente

La representación rica tendrá campos separados:

- `sourcePosition`: lo que una parte o documento afirma.
- `clientPosition`: la posición confirmada por el cliente o abogado.

Cuando solo exista una demanda de la actora:

- la demanda se analizará por completo;
- `clientPosition` permanecerá `UNKNOWN`;
- se generará `MissingDataItem` con `requiresClientInput: true` cuando el dato sea necesario;
- no se inventará contestación, admisión, negación o excepción.

## 16. Proyección legacy y compatibilidad

La capa `legacyProjection.ts` será exclusivamente de compatibilidad. La estructura rica será la fuente canónica de esta fase.

### 16.1. Reglas generales

- La proyección será de una sola dirección: rico → legacy.
- No se reconstruirá la estructura rica desde los strings legacy.
- La proyección conservará la información segura y registrará cualquier pérdida de expresividad en estadísticas o warnings del trace.
- Nunca podrá fortalecer una semántica.
- Si el campo legacy no representa un estado, se omitirá ese estado antes que inferirlo.

### 16.2. Campos proyectados

- `claims[]`: solo el texto de `requestedRelief`; no será la fuente de claimant, estado, relaciones o monto.
- `claimResponses[]`: conservará IDs, texto, provenance y postura pendiente; no convertirá `SOURCE_ASSERTED` en postura del cliente.
- `facts[]`: conservará proposition/texto, referencia y provenance; no convertirá `SOURCE_ASSERTION` en hecho propio.
- `evidence[]`: contendrá descripciones y referencias seguras; un `EvidenceMention` no confirmada se proyectará con `confirmed` ausente o falso según el contrato legacy permitido, nunca como `CLIENT_CONFIRMED`.
- `missingData[]`: contendrá mensajes derivados de `MissingDataItem`; la estructura rica conservará field, blocking, importancia y necesidad de input.
- `arguments[]`: contendrá solo proposiciones extraídas; no se agregarán argumentos generados por esta fase.

La documentación del módulo enumerará cualquier pérdida inevitable, por ejemplo la imposibilidad de expresar `claimantPartyId` o `inferenceLevel` en un string legacy.

## 17. Orquestación del análisis

`reconstructCaseAnalysis` conservará su firma pública. Internamente:

1. Construirá o recibirá un `DocumentIndex` por fuente.
2. Convertirá páginas, elementos y tablas en `SourceUnit[]` ordenadas.
3. Ejecutará segmentación de candidatos por categoría.
4. Clasificará candidatos y atribuirá roles cuando existan.
5. Normalizará únicamente valores inequívocos.
6. Deduplicará por claves prudentes.
7. Detectará conflictos entre candidatos o entidades.
8. Construirá `RichCaseAnalysis`.
9. Proyectará los campos legacy de `CaseAnalysis`.
10. Registrará estadísticas, decisiones y warnings en `GenerationTraceContext` cuando se proporcione.

La extracción será stateless y no escribirá en base de datos. La API de análisis seguirá devolviendo `sourceValidated`, páginas y clasificación existentes, agregando campos ricos de forma aditiva.

## 18. Integración con GenerationTrace

La FASE 0 se ampliará sin reemplazar su cadena existente. El trace registrará un bloque `extraction` o equivalente con:

- `sourceIds` y conteo de `SourceUnit`;
- candidatos por categoría;
- candidatos aceptados, fusionados, rechazados y enviados a revisión;
- razones de descarte;
- conteo de provenance completa, parcial y ausente;
- conteo de partes, assertions, hechos, claims, documentos, evidence mentions, argumentos, authorities, fechas, cantidades, conflictos y datos faltantes;
- relaciones creadas entre claims, hechos, documentos y pruebas;
- pérdida de expresividad durante la proyección legacy;
- hashes de excerpts, sin texto completo sensible.

El flujo observable será:

`SOURCE → EXTRACTED_CANDIDATE → NORMALIZED_ITEM → RICH_CASE_ANALYSIS → LEGACY_PROJECTION → DocumentPlan`

El mismo `generationId` de FASE 0 se reutilizará cuando la extracción ocurra dentro del pipeline. Si el endpoint de análisis se ejecuta fuera de una generación documental, podrá usar un `analysisId` propio y dejar explícita la ausencia de generación posterior.

La sanitización existente de traces será obligatoria para prompts, errores, excerpts y metadatos. No se almacenarán API keys, tokens, cookies, credenciales ni secretos.

## 19. Fixtures sintéticos

Se crearán cinco fixtures, todos sintéticos y sin expedientes reales:

### Fixture A — texto limpio

Demanda estructurada con actor, demandado, autoridad, expediente, claims, hechos numerados, pruebas y artículos citados.

### Fixture B — texto corrido

Texto sin listas perfectas, con afirmaciones atribuidas y dos acontecimientos dentro de un mismo párrafo.

### Fixture C — pruebas separadas por comas

`PRUEBAS: contrato, recibos, requerimiento`, con vínculos explícitos a hechos cuando existan.

### Fixture D — contradicciones

Dos documentos con fechas o cantidades incompatibles y nombres/roles que requieran revisión.

### Fixture E — información incompleta

Demanda sin postura del demandado, sin día exacto en una fecha parcial y sin confirmación de pruebas a ofrecer.

Cada fixture expondrá documentId, páginas y texto suficiente para comprobar provenance sin conservar datos sensibles reales.

## 20. Contratos de prueba obligatorios

Se implementarán como mínimo estos 30 contratos:

1. Extraer actor y demandado.
2. Conservar el rol de quien afirma un hecho.
3. No convertir una alegación en hecho establecido.
4. Separar dos pretensiones de una frase.
5. Segmentar dos hechos de un párrafo cuando exista límite semántico claro.
6. Extraer `PRUEBAS: contrato, comprobantes y requerimiento`.
7. Extraer pruebas separadas por comas.
8. Extraer pruebas numeradas.
9. Extraer pruebas con viñetas.
10. Extraer pruebas desde tabla cuando `DocumentIndex` la exponga.
11. Mantener evidencia mencionada fuera de `CLIENT_CONFIRMED`.
12. Mantener un documento de la contraparte fuera de `EvidenceOffer` automático.
13. Extraer una fecha completa.
14. Conservar una fecha parcial sin inventar día.
15. Extraer una cantidad y conservar raw/normalized.
16. Detectar cantidades contradictorias.
17. Extraer un artículo citado como `SOURCE_CITED`, no verificado.
18. Extraer tesis/jurisprudencia como mención no verificada.
19. Diferenciar argumento de hecho.
20. Detectar missing client position.
21. No inventar postura.
22. Conservar provenance en cada dato material.
23. Deduplicar una mención documental sin perder ambas provenance.
24. Detectar nombres/aliases prudentemente.
25. Registrar extracción en `GenerationTrace`.
26. Mantener secretos fuera del trace.
27. Producir `CaseAnalysis` no vacío con fixture sintético completo.
28. Mantener `caseAnalysis.evidence.length > 0` cuando la fuente enumere pruebas.
29. Mantener `claims.length >= 2` cuando existan dos pretensiones.
30. Mantener ausente un dato que la fuente no proporciona.

Los tests deben incluir assertions sobre la representación rica y sobre la proyección legacy, demostrando que la segunda no fortalece estados ni borra provenance.

## 21. Métricas y reportes

La fase reportará por fixture y por ejecución:

- partes detectadas;
- assertions y hechos establecidos diferenciados;
- claims;
- hechos atómicos;
- documentos;
- evidence mentions y evidence offers explícitas;
- fechas y cantidades;
- autoridades citadas;
- argumentos;
- conflictos abiertos;
- missing data;
- cobertura de provenance;
- candidatos descartados, fusionados y enviados a revisión;
- pérdidas de expresividad en la proyección legacy.

Estas métricas describen extracción. No medirán éxito por palabras generadas, páginas DOCX ni longitud de la salida jurídica.

## 22. Validación y baseline

La validación final repetirá:

- tests focalizados de extracción y provenance;
- tests relacionados de `caseWorkflow`, `phase3CoverageMatrix`, Flujo A y extracción de documentos;
- suite completa;
- `npm run typecheck`;
- `npm run lint`;
- `npm run build`.

Baseline de referencia de la FASE 0:

- 115 archivos de tests;
- 1,906 tests aprobados;
- 2 omitidos;
- 0 fallos;
- typecheck correcto;
- lint con 0 errores y 975 warnings;
- build bloqueado antes de Next por `prisma generate` con `EPERM` al renombrar la DLL de Prisma mientras procesos Node/Next la utilizan.

El `EPERM` seguirá clasificándose como ambiental/preexistente mientras no exista evidencia de causalidad de esta fase. No se detendrán procesos, no se cambiará `.env`, no se inicializará Git y no se alterará código para maquillar el resultado.

## 23. Criterios de aceptación

La FASE 1 podrá pasar a `writing-plans` cuando el spec aprobado se traduzca en un plan que mantenga estos criterios:

- `reconstructCaseAnalysis` sigue siendo el punto público compatible;
- la representación rica es la fuente canónica de extracción;
- la proyección legacy es explícitamente unidireccional y segura;
- ningún `EvidenceMention` no confirmado se vuelve `CLIENT_CONFIRMED` o `EvidenceOffer`;
- ninguna `SourceAssertion` se vuelve `ESTABLISHED_FACT` por proyección;
- toda entidad material conserva al menos una `SourceProvenance` o queda marcada para revisión;
- deduplicar conserva todas las fuentes originales;
- conflictos permanecen abiertos y requieren revisión;
- fechas parciales no reciben día inventado;
- nombres parecidos no se fusionan automáticamente;
- artículos y jurisprudencia quedan como `SOURCE_CITED`;
- `clientPosition` permanece desconocida cuando no está en la fuente;
- `DocumentIndex` es reutilizado para páginas, elementos y tablas;
- el trace registra candidatos, decisiones, estadísticas y pérdida de expresividad;
- los 30 contratos y los cinco fixtures quedan definidos en el plan de implementación;
- no se modifica generación jurídica, `DocumentPlan`, DOCX, base de datos ni teoría del caso.

## 24. Riesgos y mitigaciones

- **Pérdida de provenance al fusionar:** la fusión conservará arrays completos de provenance y tests con dos fuentes para el mismo item.
- **Fortalecimiento accidental en legacy:** la proyección tendrá funciones separadas, reglas negativas explícitas y contratos que prueben `confirmed`/posturas.
- **Sobresegmentación de hechos o claims:** se conservará el candidato original y se marcará `REQUIRES_REVIEW` cuando el límite no sea inequívoco.
- **Falsa identidad por aliases:** la similitud será señal de revisión, no criterio automático de fusión.
- **Parser duplicado de tablas:** `sourceUnits` consumirá `DocumentIndex` y fallará de forma explícita si una tabla no está disponible, sin crear un segundo motor silencioso.
- **Dependencia accidental de LLM:** las capas determinísticas producirán el mínimo análisis completo sin NVIDIA; cualquier clasificador semántico será complementario.
- **Excerpts sensibles en trace:** hashes, límites de longitud y sanitización se aplicarán antes de serializar.
- **Regresión de consumidores legacy:** se conservarán campos existentes y se probarán `caseWorkflow`, UI de análisis y contratos de cobertura.

## 25. Gate de revisión

Este documento formaliza el diseño aprobado conversacionalmente para FASE 1. Debe ser revisado por el usuario antes de escribir el plan de implementación. Después de la aprobación del spec se invocará exclusivamente `writing-plans` para descomponer el trabajo, definir TDD, archivos exactos, dependencias y checkpoints.

Hasta esa aprobación no se implementarán tipos, módulos, adaptadores, tests ni cambios de comportamiento.
