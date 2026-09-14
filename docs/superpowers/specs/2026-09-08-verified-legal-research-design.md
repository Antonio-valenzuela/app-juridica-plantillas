# FASE 5 — Verified Legal Research & Authority Grounding

## Estado del documento

- **Fase:** FASE 5.
- **Alcance elegido:** FASE 5A, investigación jurídica, recuperación trazable, verificación y bundles. No incluye reentrada de generación.
- **Fuente de verdad:** la evidencia recuperada de una fuente jurídica confiable y trazable. El modelo de IA puede ayudar a formular consultas futuras, pero no verifica autoridades.
- **Compatibilidad:** diseño aditivo respecto de FASE 4; no sustituye `LegalIssueMatrix`, `IssueDraftResult`, `GenerationTask` ni el flujo de generación existente.
- **Deuda registrada:** `TECH_DEBT_LINT_DELTA_PHASE4`. No se investiga en esta fase salvo dependencia directa de un error de FASE 5.

## A. Estado actual

La inspección se limitó a los archivos y áreas solicitados. El estado observable es:

1. `LegalIssueMatrix` ya modela `NEEDS_RESEARCH`, `SOURCE_CITED_UNVERIFIED`, relaciones explícitas, conflictos, postura del cliente y provenance. La ruta rich-first se activa cuando existe `caseAnalysis.richCaseAnalysis`; el fallback legacy permanece separado.
2. `enrichIssueDependencies` marca como investigación requerida una `AUTHORITY_RESEARCH` con autoridades vinculadas y un `SOURCE_ARGUMENT` que conserva una autoridad `SOURCE_CITED`. La matriz canónica no contiene todavía una resolución de régimen ni un bundle de investigación.
3. `SourceAuthorityMention` conserva solo el tipo reducido, el texto de cita, el estado `SOURCE_CITED | LEGALLY_VERIFIED` y provenance. No separa identidad, fuente recuperada, vigencia, jurisdicción ni proposición soportada.
4. `buildLegalResearchTaskForIssue` ya existe y produce una tarea `LEGAL_RESEARCH`, pero su ejecución es deliberadamente plan-only, crea un marcador determinista y no consulta proveedores. Además, no tiene callers observados.
5. `IssueContextPack` ya es un contexto allowlisted por issue y `IssueDraftResult` ya exige IDs acotados y valida `authorityMentionIds`; todavía no existe un campo de autoridades verificadas scoped a la issue.
6. `GenerationTask` ya contiene `LEGAL_RESEARCH`, `authorityIds`, `legalIssueIds` y hashes/estados de ejecución. No debe reutilizarse para disparar generación final durante el modo research-only.
7. `GenerationTrace` registra tareas, intentos de issue, hashes, coverage, evaluaciones y exportación, pero no el grafo `issue → request → query → adapter → candidate → verification → authority → proposition`.
8. `LegalTaxonomySelection` aporta materia, jurisdicción, tipo, procedimiento, vía y autoridad; las taxonomías actuales no son por sí mismas prueba de que un régimen temporal o procesal esté resuelto. En particular, un valor default de documento no debe convertirse silenciosamente en una resolución legal.
9. `multiStep.ts` recupera chunks de documentos cargados y produce un trace de consultas, pero no es un adapter de fuente oficial ni una verificación de autoridad.
10. `AIRequest.retrievedSources` y el consolidator local son interfaces de transporte de fuentes para IA, no evidencia de verificación. La salida local que marque una fuente como verificada no será reutilizada como autoridad de FASE 5.

## B. Alternativas

### Alternativa 1 — FASE 5A: núcleo de dominio + ports/adapters (recomendada)

Separar el dominio de investigación de la IA y de la red mediante contratos puros:

```text
LegalIssueMatrix
  → LegalResearchRequestBuilder
  → LegalRegimeResolver
  → LegalResearchProvider.search/retrieve
  → AuthorityCandidate
  → AuthorityVerifier
  → VerifiedAuthority | RejectedAuthorityCandidate
  → LegalResearchBundle
  → derived research readiness
```

El primer vertical slice usa fixtures sintéticos offline y un adapter de prueba que implementa el mismo port que los adapters oficiales. Los adapters SCJN, legislación federal, DOF y fuente estatal se incorporan después, sin cambiar el núcleo. La generación FASE 4 permanece intacta.

**Ventajas:** contratos deterministas, pruebas sin internet, separación fuerte entre cita y verificación, fallos aislados por adapter, bajo riesgo de regresión y sin DB nueva. **Costo:** el primer slice no prueba aún disponibilidad real de los portales.

### Alternativa 2 — FASE 5B: retrieval oficial real + reentrada inmediata de generación

Implementar desde el inicio los adapters reales, resolver régimen, recuperar autoridades y reingresar automáticamente a `IssueScopedGeneration` para las issues desbloqueadas.

**Ventajas:** camino visible de extremo a extremo más corto. **Costos y riesgos:** dependencia de red y cambios de portales, mayor dificultad para reproducir fallos, posible contaminación de FASE 4, ambigüedad sobre suficiencia y mayor superficie de seguridad. No se recomienda para el primer slice.

## C. Recomendación y límites

Se recomienda la Alternativa 1 y el alcance **A: research + verification + bundles**.

FASE 5 producirá resultados de investigación y readiness derivada, pero no generará argumentos finales, no invocará NVIDIA/local, no modificará DOCX y no actualizará silenciosamente la matriz canónica. La futura generación podrá consumir un `LegalResearchBundle` verificado y scoped cuando exista una decisión aprobada sobre el contrato de reentrada.

## D. `LegalResearchRequest`

El request representa una pregunta abierta de investigación; no debe contener la conclusión que se pretende alcanzar.

```ts
type LegalResearchRequestStatus =
  | 'PENDING'
  | 'READY_FOR_RETRIEVAL'
  | 'RETRIEVAL_PARTIAL'
  | 'VERIFICATION_PENDING'
  | 'COMPLETED'
  | 'BLOCKED';

interface LegalResearchRequest {
  id: string;
  legalIssueId: string;
  coverageItemIds: string[];
  question: string;
  jurisdiction?: string;
  matter?: string;
  procedure?: string;
  relevantDate?: string;
  temporalPrecision?: 'DAY' | 'MONTH' | 'YEAR' | 'UNKNOWN';
  requestedAuthorityTypes: AuthorityType[];
  sourceAuthorityMentionIds: string[];
  contextHash: string;
  regimeResolutionId: string;
  status: LegalResearchRequestStatus;
  createdAt: string;
}
```

El ID se calcula sobre una representación canónica ordenada de `legalIssueId`, `coverageItemIds`, `question`, régimen resuelto, fecha relevante, tipos solicitados, menciones citadas y `contextHash`. No se genera con `randomUUID` ni con el resultado de retrieval.

Una issue `NEEDS_RESEARCH` produce request. Una issue con `researchStatus = NOT_REQUIRED` no produce request. Una `SOURCE_CITED` crea una necesidad de verificación de la mención, pero la mención permanece no verificada hasta completar el pipeline.

## E. `LegalRegimeResolution`

La resolución de régimen es una decisión auditable sobre el marco en el que debe buscarse Derecho. No es una inferencia libre del modelo.

```ts
type LegalRegimeResolutionStatus =
  | 'RESOLVED'
  | 'PARTIALLY_RESOLVED'
  | 'LEGAL_REGIME_UNRESOLVED';

type LegalScope =
  | 'FEDERAL'
  | 'STATE'
  | 'LOCAL'
  | 'MUNICIPAL'
  | 'ADMINISTRATIVE'
  | 'ELECTORAL'
  | 'MILITARY'
  | 'OTHER'
  | 'UNKNOWN';

interface LegalRegimeResolution {
  id: string;
  status: LegalRegimeResolutionStatus;
  country?: string;
  scope: LegalScope;
  federativeEntity?: string;
  matter?: string;
  procedure?: string;
  proceduralStage?: string;
  instance?: string;
  issuingOrAdjudicatingBody?: string;
  relevantDate?: string;
  temporalPrecision: 'DAY' | 'MONTH' | 'YEAR' | 'UNKNOWN';
  fieldEvidence: Array<{
    field: string;
    value: string;
    source: 'EXPLICIT_TAXONOMY' | 'EXPLICIT_SOURCE' | 'MANUAL_INPUT' | 'RESOLVED_METADATA';
    provenanceIds: string[];
  }>;
  unresolvedFields: string[];
  resolutionHash: string;
}
```

La entrada combina únicamente datos explícitos de taxonomy, metadata documental, `legalContext`, fuentes y datos manuales confirmados. El resolver puede normalizar valores, pero no convertir un default técnico en dato confirmado. Para este diseño, un régimen suficiente requiere como mínimo país, ámbito, materia y procedimiento cuando sean materialmente necesarios para distinguir la fuente; además exige preservar cualquier fecha relevante. Si alguno de esos campos impide seleccionar fuentes o vigencia, el estado es `LEGAL_REGIME_UNRESOLVED`.

No se fija México ni una legislación federal como universal. Tampoco se asume que el CNPCF, un código actual o la vigencia de hoy sean aplicables a todos los expedientes.

## F. `AuthorityType` y `AuthorityCandidate`

La taxonomía conceptual mínima es:

```ts
type AuthorityType =
  | 'CONSTITUTION'
  | 'STATUTE'
  | 'CODE'
  | 'REGULATION'
  | 'JURISPRUDENCE'
  | 'THESIS'
  | 'PRECEDENT'
  | 'OFFICIAL_AGREEMENT'
  | 'OTHER_OFFICIAL_SOURCE';
```

`SourceAuthorityMention.authorityType` se conserva como tipo observado. La conversión de `ARTICLE`, `LAW`, `CODE`, `THESIS`, `JURISPRUDENCE`, `PRECEDENT` u `OTHER` a la taxonomía FASE 5 debe ser explícita y no puede elevar el estado de verificación.

```ts
interface AuthorityCandidate {
  id: string;
  requestId: string;
  sourceAuthorityMentionId?: string;
  authorityType: AuthorityType;
  observedCitation: string;
  canonicalCitationCandidate?: string;
  sourceUrl?: string;
  sourceDomain?: string;
  sourceTier: 'OFFICIAL_PRIMARY' | 'SECONDARY_SUPPORT' | 'UNKNOWN';
  issuingAuthority?: string;
  jurisdiction?: string;
  publicationDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  locator?: string;
  retrievedAt: string;
  evidenceHash?: string;
  evidenceExcerptHash?: string;
  metadataStatus: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT';
  candidateStatus: 'DISCOVERED' | 'RETRIEVED' | 'REJECTED';
}
```

Un candidate es un resultado observado, no una autoridad aceptada. Su existencia nunca permite citarlo como Derecho verificado.

## G. `VerifiedAuthority` y rechazo

La autoridad verificada separa identidad, evidencia de fuente, validez temporal, validez jurisdiccional y proposición.

```ts
interface AuthorityIdentity {
  canonicalCitation: string;
  authorityType: AuthorityType;
  issuingAuthority: string;
  identityKey: string;
}

interface AuthoritySourceEvidence {
  sourceUrl: string;
  sourceDomain: string;
  sourceTier: 'OFFICIAL_PRIMARY';
  retrievedAt: string;
  locator?: string;
  sourceHash: string;
  excerptHash?: string;
}

interface AuthorityTemporalValidity {
  status:
    | 'CURRENT_AND_APPLICABLE'
    | 'HISTORICALLY_APPLICABLE'
    | 'CURRENT_BUT_TEMPORAL_REVIEW_REQUIRED'
    | 'REPEALED'
    | 'SUPERSEDED'
    | 'UNKNOWN_EFFECTIVE_DATE';
  relevantDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  checkedAt: string;
  basis: string[];
}

interface AuthorityJurisdictionValidity {
  status: 'APPLICABLE' | 'WRONG_JURISDICTION' | 'REVIEW_REQUIRED' | 'UNKNOWN';
  country?: string;
  scope?: LegalScope;
  federativeEntity?: string;
  matter?: string;
  procedure?: string;
  issuingBody?: string;
  bindingCharacter?: 'BINDING_WHEN_APPLICABLE' | 'PERSUASIVE' | 'NON_BINDING' | 'UNKNOWN';
  basis: string[];
}

interface SupportedProposition {
  text: string;
  supportLevel: 'DIRECT' | 'LIMITED' | 'CONTEXT_ONLY';
  sourceLocator?: string;
  limitations: string[];
}

interface VerifiedAuthority {
  id: string;
  identity: AuthorityIdentity;
  source: AuthoritySourceEvidence;
  temporalValidity: AuthorityTemporalValidity;
  jurisdictionValidity: AuthorityJurisdictionValidity;
  proposition: SupportedProposition;
  verificationStatus: 'VERIFIED';
  supportsLegalIssueIds: string[];
  sourceAuthorityMentionIds: string[];
  verificationHash: string;
}

type AuthorityRejectionReason =
  | 'NOT_FOUND'
  | 'MISMATCH'
  | 'OUTDATED'
  | 'WRONG_JURISDICTION'
  | 'INSUFFICIENT_METADATA'
  | 'NON_OFFICIAL_ONLY'
  | 'NO_PROPOSITION_SUPPORT'
  | 'ADAPTER_ERROR';

interface RejectedAuthorityCandidate {
  candidate: AuthorityCandidate;
  reasons: AuthorityRejectionReason[];
  detail: string[];
  rejectedAt: string;
}
```

Una `THESIS` permanece tesis; una tesis no se etiqueta como `JURISPRUDENCE` por similitud textual. La palabra jurisprudencia se reserva al tipo y metadata que realmente lo acrediten.

## H. `LegalResearchBundle`

```ts
interface LegalResearchBundle {
  legalIssueId: string;
  requestId: string;
  regimeResolution: LegalRegimeResolution;
  verifiedAuthorities: VerifiedAuthority[];
  rejectedCandidates: RejectedAuthorityCandidate[];
  unresolvedQuestions: string[];
  researchStatus:
    | 'VERIFIED_SUFFICIENT'
    | 'VERIFIED_PARTIAL'
    | 'NO_AUTHORITY_FOUND'
    | 'REGIME_UNRESOLVED'
    | 'REQUIRES_HUMAN_REVIEW';
  researchHash: string;
}
```

`VERIFIED_SUFFICIENT` significa únicamente que existen autoridades verificadas, pertinentes, con proposición explícita y suficientes para que una etapa posterior pueda argumentar. No significa que la conclusión jurídica del caso sea correcta.

La suficiencia se determina por calidad y relación: régimen resuelto, fuente primaria oficial, identidad comprobada, vigencia/jurisdicción compatibles, proposición scoped a la issue y ausencia de preguntas imprescindibles. No se determina por cantidad de resultados, artículos, palabras o páginas.

## I. Source adapters

El port no conoce HTTP, HTML, SDKs ni prompts:

```ts
interface LegalResearchProvider {
  id: 'SCJN' | 'FEDERAL_LEGISLATION' | 'DOF' | 'STATE_OFFICIAL' | 'FIXTURE_OFFICIAL';
  supportedAuthorityTypes: AuthorityType[];
  search(input: LegalResearchQuery): Promise<ProviderSearchResult>;
  retrieve(input: ProviderRetrieveRequest): Promise<ProviderRetrieveResult>;
}

interface LegalResearchQuery {
  requestId: string;
  normalizedQuery: string;
  question: string;
  regime: LegalRegimeResolution;
  requestedAuthorityTypes: AuthorityType[];
  relevantDate?: string;
}
```

Adapters propuestos:

- **SCJN/Semanario Judicial:** jurisprudencia, tesis, precedentes y metadata judicial; debe distinguir la clase del resultado, registro, órgano, época y obligatoriedad solo cuando la fuente lo exponga.
- **Legislación federal:** Cámara de Diputados para textos y estructura de leyes/códigos federales; no sustituye por sí sola la comprobación histórica de publicación o reformas.
- **DOF:** publicación, reformas, decretos y datos temporales; ayuda a verificar vigencia e historial cuando sea necesario.
- **Fuente oficial estatal:** adapter parametrizado por entidad federativa y órgano oficial; no se activa sin régimen estatal/local resuelto.
- **Fixture oficial:** adapter sintético offline, marcado como fixture, para TDD. Prueba el contrato y el pipeline; no constituye evidencia jurídica de un caso real.

Una fuente secundaria puede existir como adapter de descubrimiento/contexto, pero su `sourceTier` nunca produce `VERIFIED` si la primaria accesible no fue comprobada.

## J. Verification pipeline

```text
LegalIssue
  → request estructurado
  → resolución de régimen
  → query normalizada
  → adapter seleccionado
  → candidate(s)
  → evidencia oficial recuperada
  → identidad exacta
  → jurisdicción/materia/procedimiento
  → vigencia temporal
  → proposición soportada
  → accept VerifiedAuthority / reject con razones
  → bundle scoped a la issue
```

Reglas de aceptación:

1. Debe existir evidencia recuperada, URL oficial, dominio, timestamp y hash de fuente; el conocimiento interno del modelo no cuenta.
2. Para una `SOURCE_CITED`, la cita observada debe corresponder a la identidad recuperada. Similitud de texto no es match.
3. Un resultado descubierto sin cita previa puede aceptarse solo si su identidad, fuente, régimen, vigencia y proposición están comprobados y la relación con la issue es explícita.
4. La fuente secundaria no verifica por sí sola una autoridad primaria accesible.
5. La proposición debe poder escribirse como soporte limitado: `esta autoridad sostiene X`; nunca se transforma automáticamente en `por tanto la parte gana/pierde`.
6. Cada fallo se materializa como rechazo o pregunta no resuelta; no se convierte en una autoridad parcialmente verificada.

Los errores son aislados por adapter. Si SCJN falla y Cámara/DOF entregan resultados válidos, estos se conservan. El bundle no puede ser `VERIFIED_SUFFICIENT` si el adapter que era imprescindible para el tipo de autoridad solicitado falló o si la ausencia de ese resultado deja una pregunta esencial abierta.

## K. Temporal validity

La fecha relevante viaja intacta desde la issue/request. `temporalPrecision` evita inventar día o mes. El verificador compara fecha de publicación, entrada en vigor, reformas, derogación y sustitución cuando la fuente lo permita.

- `CURRENT_AND_APPLICABLE`: régimen y fecha relevante compatibles y comprobados.
- `HISTORICALLY_APPLICABLE`: ya no es vigente hoy, pero fue aplicable al momento relevante comprobado.
- `CURRENT_BUT_TEMPORAL_REVIEW_REQUIRED`: existe autoridad actual, pero la fecha del caso o la cadena temporal no permite cerrar aplicabilidad.
- `REPEALED`: no puede aceptarse como autoridad actual; puede conservarse como evidencia histórica si el bundle lo declara y la issue lo necesita.
- `SUPERSEDED`: la fuente fue reemplazada; se rechaza para el régimen actual salvo tratamiento histórico explícito.
- `UNKNOWN_EFFECTIVE_DATE`: falta un dato temporal imprescindible y requiere revisión.

No se inventa vigencia por ausencia de una reforma conocida ni se usa la fecha de retrieval como fecha de aplicabilidad.

## L. Jurisdiction validation

La validación compara país, ámbito federal/estatal/local, entidad federativa, materia, procedimiento, órgano, instancia y carácter vinculante cuando sea relevante. Una tesis o sentencia no se convierte en jurisprudencia obligatoria solo porque provenga de un tribunal.

La lista existente de taxonomía sirve para normalización y selección, pero el resultado necesita evidencia de la fuente o metadata explícita. Si una fuente federal se encuentra para una issue estatal sin justificación, se rechaza como `WRONG_JURISDICTION`. Si el órgano o el carácter vinculante no pueden verificarse, se conserva la incertidumbre y se evita sobreafirmar.

## M. Proposition-level grounding

Cada `VerifiedAuthority` debe enlazar:

```text
authority identity
  → proposition.text
  → proposition.sourceLocator
  → legalIssueId
  → limitations
```

El texto de la proposición describe lo que la autoridad soporta directamente y su nivel (`DIRECT`, `LIMITED`, `CONTEXT_ONLY`). No contiene hechos del expediente, postura del cliente ni conclusión procesal. Una autoridad no crea `FactItem`, `EvidenceMention`, `EvidenceOffer`, `ClaimItem` ni `ClientPosition`.

La relación a otra issue no se infiere por materia o coincidencia de cita. Cada `supportsLegalIssueIds` se construye desde la request y la validación explícita de la proposición; el bundle de una issue no expone autoridades de otra.

## N. Derived research readiness

La matriz canónica no se muta silenciosamente. Se añade una proyección derivada:

```ts
type IssueResearchReadiness =
  | 'NOT_REQUIRED'
  | 'RESEARCH_REQUIRED'
  | 'LEGAL_REGIME_UNRESOLVED'
  | 'RESEARCH_PARTIAL'
  | 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH';

interface DerivedIssueReadiness {
  legalIssueId: string;
  canonicalStatus: LegalIssueStatus;
  researchReadiness: IssueResearchReadiness;
  researchBundleHash?: string;
  blockers: string[];
}
```

La transición a `READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH` exige simultáneamente:

- régimen suficientemente resuelto;
- al menos una autoridad verificada pertinente o la suficiencia explícitamente satisfecha por el tipo de issue;
- relación proposition-level;
- ningún blocker anterior de relación, conflicto o postura;
- ninguna pregunta imprescindible pendiente;
- ningún conflicto sin resolver.

La precedencia es estricta: `BLOCKED_BY_CONFLICT` + research verificado sigue bloqueada; `NEEDS_CLIENT_POSITION` + research excelente sigue requiriendo postura. Research solo resuelve la dependencia de research.

## O. Reentrada futura en IssueScopedGeneration

Esta fase no la implementa. El contrato futuro debe extender `IssueContextPack` aditivamente con:

```ts
verifiedResearch?: {
  requestId: string;
  researchHash: string;
  authorities: Array<Pick<VerifiedAuthority,
    'id' | 'identity' | 'source' | 'temporalValidity' |
    'jurisdictionValidity' | 'proposition'>>;
};
```

Solo se envían authorities verificadas y scoped a la issue. No se envían candidatos rechazados, resultados secundarios, corpus completo ni bundles de otras issues. `IssueDraftResult` futuro debe conservar `authorityMentionIds` para menciones de la fuente y añadir una relación explícita a IDs de `VerifiedAuthority`; no debe aceptar una cita creada por el modelo.

La ruta de reentrada deberá ser opt-in y compatible con la barrera existente de `isFinalGenerationEligible`. En FASE 5A no se cambia esa barrera, no se llama `executeReadyIssueTasks` y no se realiza ninguna llamada de proveedor final como efecto colateral de research-only.

## P. Evidence y facts

Research aporta Derecho, no hechos. No puede cambiar `FactItem`, `ClientPosition`, `EvidenceMention`, `EvidenceOffer`, `ClaimItem`, conflictos ni provenance de las entidades del caso. Si una proposición jurídica requiere un hecho faltante, se registra en `unresolvedQuestions` o como dependencia de la issue; no se materializa el hecho ni se ofrece prueba automáticamente.

## Q. Trace

Se propone una extensión aditiva de `GenerationTrace`, sin romper traces existentes:

```ts
interface LegalResearchTrace {
  requestId: string;
  legalIssueId: string;
  coverageItemIds: string[];
  regimeResolutionId: string;
  queryHash: string;
  attempts: Array<{
    adapterId: string;
    startedAt: string;
    completedAt?: string;
    outcome: 'PASS' | 'PARTIAL' | 'FAIL';
    candidateIds: string[];
    acceptedAuthorityIds: string[];
    rejectedCandidateIds: string[];
    officialUrls: string[];
    sourceHashes: string[];
    reasons: string[];
  }>;
  researchHash?: string;
  status: string;
}
```

El trace debe reconstruir request, query, adapter, cada attempt, candidates, verificaciones, accepted authorities, proposiciones y bundle mediante IDs, URLs oficiales, hashes, statuses, timestamps y razones. No guarda corpus completo ni texto de fuente innecesario. Las excepciones se sanitizan y se limitan como el trace existente.

## R. Caching

Se prepara una abstracción en memoria, sin Prisma, Neon ni migración:

```ts
interface ResearchCacheKey {
  normalizedQuery: string;
  regimeHash: string;
  adapterId: string;
  relevantDate?: string;
  temporalPrecision: string;
}
```

La entrada almacena resultados con `retrievedAt`, `sourceHash`, adapter/version, estado temporal y una política de revalidación. No se cachea indefinidamente legislación cambiante. El cache no sustituye verification: cada hit debe volver a pasar comprobaciones de hash, vigencia y régimen cuando corresponda. La key y los hashes son deterministas; la política de TTL queda como parámetro del adapter, no como una fecha inventada por el modelo.

## S. Testing y vertical slice

Los contratos principales son offline y mockeados. Las respuestas fixture son sintéticas y recortadas, con metadata suficiente para probar exact match, vigencia, jurisdicción, proposición y rechazo. Tests web reales de adapters quedan separados, opcionales y nunca son requisito de los contratos TDD principales.

El vertical slice recomendado comprende el resolver de régimen, request determinista, port de adapter, fixture oficial, verificador, bundle, readiness derivada y trace. Debe demostrar un caso federal resuelto, un caso estatal resuelto, un régimen no resuelto, una cita `SOURCE_CITED` que permanece no verificada y un match oficial que se acepta, sin generación final.

## T. Contratos TDD mínimos

1. `NEEDS_RESEARCH` crea exactamente un `LegalResearchRequest`.
2. `READY_FOR_GENERATION` sin requisito de research no crea request.
3. `NEEDS_CLIENT_POSITION` no se resuelve por research.
4. `BLOCKED_BY_CONFLICT` no se resuelve por research.
5. El request ID es determinista para el mismo input canónico.
6. Un régimen federal explícito se resuelve como federal.
7. Un régimen estatal con entidad federativa explícita se resuelve como estatal.
8. Un régimen insuficiente produce `LEGAL_REGIME_UNRESOLVED`.
9. La fecha relevante se conserva exactamente con su precisión.
10. No se aplica universalmente el CNPCF.
11. `SOURCE_CITED` crea candidate de verificación.
12. `SOURCE_CITED` permanece no verificada antes de retrieval/verification.
13. Un match oficial exacto se verifica.
14. Una cita con identidad incompatible se rechaza como mismatch.
15. Una autoridad de jurisdicción incorrecta se rechaza.
16. Una autoridad temporalmente incompatible se rechaza.
17. Una autoridad derogada se marca `REPEALED` y no se acepta como vigente.
18. Una tesis no se etiqueta como jurisprudencia.
19. Un candidate sin evidencia oficial no se verifica.
20. La URL de fuente se conserva.
21. `retrievedAt` se conserva.
22. El hash de autoridad es determinista.
23. Una autoridad aceptada requiere relación proposition-level.
24. Una autoridad no relacionada no se enlaza a la issue.
25. Una autoridad verificada no crea hechos.
26. Una autoridad verificada no crea `EvidenceOffer`.
27. Una autoridad verificada no crea `ClientPosition`.
28. El bundle queda scoped a una sola issue.
29. No hay fuga de autoridad entre issues.
30. Un conjunto incompleto produce bundle parcial.
31. Un conjunto suficiente produce `VERIFIED_SUFFICIENT`.
32. Sin autoridad aceptable produce `NO_AUTHORITY_FOUND`.
33. Régimen no resuelto produce `REGIME_UNRESOLVED`.
34. Todo rechazo conserva razones explícitas.
35. Un fallo de adapter no descarta resultados válidos de otros adapters.
36. El trace registra el research request.
37. El trace registra cada candidate.
38. El trace registra cada verification attempt.
39. El trace registra la autoridad aceptada.
40. El trace no contiene corpus completo.
41. El hash del bundle de research es determinista.
42. El sistema no inventa una cita ausente en retrieval.
43. Los adapters oficiales tienen prioridad sobre fuentes secundarias.
44. Una fuente secundaria no verifica por sí sola una autoridad primaria accesible.
45. La readiness derivada transita solo con research verificado suficiente.
46. Los blockers anteriores conservan precedencia sobre readiness de research.
47. Un futuro `IssueContextPack` puede consumir únicamente el bundle verificado scoped.
48. El path legacy permanece sin cambios funcionales.
49. La regresión non-laboral permanece sin cambios funcionales.
50. Research-only no realiza llamada de proveedor de generación final.

## U. Archivos afectados propuestos

### Nuevos módulos de dominio

- `lib/legal-engine/legal-research/types.ts`: contratos de request, régimen, candidate, autoridad, bundle, cache y readiness.
- `lib/legal-engine/legal-research/regimeResolution.ts`: resolución determinista y razones de `LEGAL_REGIME_UNRESOLVED`.
- `lib/legal-engine/legal-research/researchRequest.ts`: construcción y hash determinista del request/query.
- `lib/legal-engine/legal-research/authorityVerification.ts`: pipeline de identidad, fuente, jurisdicción, temporalidad y proposición.
- `lib/legal-engine/legal-research/researchBundle.ts`: agregación, suficiencia, rechazo y hash.
- `lib/legal-engine/legal-research/adapters/types.ts`: port y resultados de adapters.
- `lib/legal-engine/legal-research/adapters/fixtureOfficial.ts`: adapter offline para TDD.
- `lib/legal-engine/legal-research/cache.ts`: abstracción de cache en memoria y revalidación.

### Integraciones aditivas futuras o de la siguiente subfase

- `lib/legal-engine/legalIssueMatrix.ts`: consumir readiness derivada sin reemplazar la matriz canónica; preservar rich-first y fallback legacy.
- `lib/legal-engine/issueScopedGeneration.ts`: extender el pack solo cuando se apruebe la reentrada de generación.
- `lib/legal-engine/issueDraftResult.ts`: validar relaciones a autoridades verificadas en la subfase de generación.
- `lib/legal-engine/generationTasks.ts`: reutilizar `LEGAL_RESEARCH` como marcador de plan; no convertirlo en provider call durante FASE 5A.
- `lib/legal-engine/pipeline.ts`: exponer un modo research-only aislado, sin alterar el flujo final actual.
- `lib/legal-engine/generationTrace.ts`: incorporar trace de research por attempts, IDs, URLs, hashes y razones.
- `lib/legal-engine/case-extraction/types.ts`: conservar `SourceAuthorityMention` como mención observada; solo añadir aliases/mapeos si una implementación lo requiere, sin cambiar `SOURCE_CITED` a verificado.
- `lib/legal-taxonomy/index.ts`, `jurisdictions.ts`, `matters.ts`, `procedures.ts`: reutilizar resolvers y valores existentes; no convertirlos en fuente de vigencia ni agregar defaults implícitos.

### Tests

- `tests/legal-engine/legalResearchRequest.test.ts`
- `tests/legal-engine/legalRegimeResolution.test.ts`
- `tests/legal-engine/authorityVerification.test.ts`
- `tests/legal-engine/legalResearchBundle.test.ts`
- `tests/legal-engine/legalResearchTrace.test.ts`
- `tests/legal-engine/legalResearchLegacyRegression.test.ts`

Los adapters oficiales reales y sus pruebas de red deben ser archivos separados de integración opcional, no dependencias del TDD offline.

## V. Riesgos

- **Falsa verificación por metadata incompleta:** mitigación: estado `INSUFFICIENT_METADATA`, rechazo fail-closed y razones trazables.
- **Confundir cita de fuente con autoridad comprobada:** mitigación: mantener `SOURCE_CITED` separado de `VERIFIED` y exigir evidencia primaria.
- **Aplicar el régimen federal o el texto actual por default:** mitigación: resolver solo campos explícitos/evidenciados y bloquear con `LEGAL_REGIME_UNRESOLVED`.
- **Usar una tesis como jurisprudencia obligatoria:** mitigación: `AuthorityType` y `bindingCharacter` separados.
- **Aceptar una autoridad correcta para otra entidad, materia o procedimiento:** mitigación: validación jurisdiccional antes del bundle.
- **Confundir autoridad verificada con corrección de la conclusión:** mitigación: proposición limitada y readiness derivada, sin conclusión automática.
- **Fugas cross-issue:** mitigación: request/bundle/pack con `legalIssueId`, IDs allowlisted y validación de relación explícita.
- **Pérdida de resultados válidos por fallo aislado:** mitigación: attempts por adapter y agregación parcial.
- **Trace con corpus sensible o excesivo:** mitigación: IDs, URLs, hashes y excerpts hashados; no corpus completo.
- **Cache obsoleto:** mitigación: key por régimen/fecha/fuente, hash y revalidación temporal.
- **Scope creep hacia red, RAG, DB o generación:** mitigación: FASE 5A, fixture primero y modo research-only sin provider final.
- **Default técnico de `UniversalLegalDocument` interpretado como resolución jurídica:** mitigación: distinguir valor de construcción de evidencia explícita en `fieldEvidence`.

## W. Fuera de alcance

- DOCX, estilos, render y exportación.
- UI grande o flujo de aprobación visual.
- Embeddings, RAG, vector DB y ranking semántico.
- Prisma, Neon, migraciones y persistencia de producción.
- Windows packaging.
- Generación monolítica o reentrada automática de FASE 4.
- Consultas web reales, scraping real, SCJN real, Cámara real y DOF real dentro del TDD principal.
- Invocaciones NVIDIA o local como parte de research-only.
- Defensas, hechos, posturas, claims o EvidenceOffers inventados.
- Ofrecimiento automático de pruebas.
- Investigación de `TECH_DEBT_LINT_DELTA_PHASE4` salvo dependencia directa.

## X. Decisiones pendientes de aprobación

1. Qué adapter oficial real será el primer despliegue después del fixture: SCJN, legislación federal, DOF o una fuente estatal específica.
2. Qué campos del régimen serán obligatorios por cada combinación de materia/procedimiento y quién podrá confirmar un campo faltante.
3. Si `VERIFIED_SUFFICIENT` exige una autoridad primaria por cada tipo solicitado o permite suficiencia parcial declarada por issue.
4. La codificación canónica de país y entidad federativa para interoperar con las taxonomías actuales.
5. La política de revalidación/TTL por adapter para legislación, jurisprudencia y fuentes estatales.
6. El contrato de reentrada de FASE 4: si se añade un estado explícito al gate o si una capa futura traduce readiness derivada a la elegibilidad existente.
7. Si la aprobación humana puede convertir `REQUIRES_HUMAN_REVIEW` en una autorización de consumo, manteniendo la evidencia y la razón de la decisión.

## Auto-revisión limitada

- **Contradicciones:** no se detectaron. La recomendación A mantiene FASE 4 intacta; la reentrada está descrita solo como contrato futuro.
- **Marcadores incompletos:** no se dejaron marcadores de implementación pendientes; las decisiones abiertas están enumeradas explícitamente en la sección X.
- **Invariantes:** se preservan `SOURCE_CITED ≠ VERIFIED`, no invención de citas, no mutación silenciosa de hechos/posturas/evidencia, precedencia de conflictos y postura del cliente, régimen fail-closed, separación tesis/jurisprudencia, trazabilidad por attempt y ausencia de provider call en research-only.
- **Scope creep:** no se incorporaron DOCX, UI, RAG, DB, scraping real, NVIDIA ni suite completa. El adapter fixture y las abstracciones propuestas están limitados al diseño del vertical slice.
