# LOOP 8B — FASE 2B: Demanda Ejecutiva Mercantil Profesional

> Blueprint de The Architect generado el 2026-09-02 para APP-plantillas.
> Alcance: convertir únicamente `demanda_ejecutiva_mercantil` de `CATALOG_ONLY`
> a `IMPLEMENTED` cuando el flujo completo cumpla los criterios de cierre.

## 1. Objetivo y límites

La aplicación producirá un borrador profesional de demanda ejecutiva mercantil
solo cuando exista un documento base o información equivalente suficientemente
confirmada. Podrá crear un `DRAFT` desde cero para capturar faltantes, pero
nunca lo marcará `READY_TO_EXPORT` sin instrumento, obligación, exigibilidad,
cantidades y decisión profesional suficientes.

No se reabrirán Fase 1 ni Fase 2A. No se modificarán otros estados del catálogo,
no se usarán expedientes, PDFs, documentos, secretos o casos reales, no se
introducirá Neon y no se creará un segundo pipeline productivo.

## 2. Arquitectura existente reutilizable

La ruta única conservará el flujo:

```text
source/data
  -> CaseContext
  -> documentRouting
  -> sourceOutputCompatibility
  -> documentPreflight
  -> dedicated strategy/template
  -> documentPlan / renderer
  -> quality gates
  -> DRAFT / REVIEW_REQUIRED / READY_TO_EXPORT
  -> common export guard
  -> DOCX/PDF
```

Se reutilizarán `CaseContextField`, `ProvenanceRef`, `CaseAnalysis`, los roles
de fuente, las primitivas de plan/render, `markDocumentAsDraft`,
`markDocumentAsReviewRequired`, `markDocumentAsReadyToExport`,
`prepareUniversalDocumentForExport` y los exporters existentes. Solo se
añadirán contratos mercantiles donde el modelo civil no expresa el instrumento,
obligación, saldo, exigibilidad o intereses sin perder trazabilidad.

## 3. Identidad y catálogo

| Concepto | Decisión |
|---|---|
| Canonical output | `demanda_ejecutiva_mercantil` |
| Alias de entrada | `demanda-ejecutiva-mercantil`, si el registry lo necesita |
| Outputs alternos | Ninguno |
| Strategy ID | `demanda_ejecutiva_mercantil` |
| Template ID | `demanda_ejecutiva_mercantil` |
| Materia | Mercantil |
| Procedimiento | Ejecutivo mercantil |
| Familia | Demandas mercantiles |
| Estado actual | `CATALOG_ONLY` |
| Estado de cierre | `IMPLEMENTED` solo después de todos los gates |

El alias se normalizará al borde de entrada. Jamás será filename, `documentType`,
template o resultado de salida. Las cadenas genéricas `demanda` y
`demanda_mercantil` no podrán sustituir al canonical mediante fallback.

## 4. SourceDocumentTypes y source policy

El registry actual no contiene tipos mercantiles específicos. Se añadirán de
forma explícita, sin renombrar silenciosamente tipos existentes:

```ts
type CommercialSourceDocumentType =
  | 'PAGARE'
  | 'TITULO_CREDITO'
  | 'CONVENIO_MERCANTIL'
  | 'DOCUMENTO_MERCANTIL_BASE'
  | 'REQUERIMIENTO_MERCANTIL'
  | 'ESTADO_CUENTA_MERCANTIL'
  | 'COMUNICACION_MERCANTIL'
  | 'PAGO_MERCANTIL'
  | 'DOCUMENTO_MERCANTIL_AUXILIAR';
```

Los cuatro primeros son candidatos a documento base; los demás solo pueden
ser `SUPPORTING` o `REFERENCE` salvo que el abogado confirme su función y el
modelo de instrumento lo permita. Los aliases de entrada podrán normalizar
acentos, espacios y guiones, pero los desconocidos no se convertirán en un
tipo inventado.

La política de salida será explícita:

```ts
{
  selectedDocumentType: 'demanda_ejecutiva_mercantil',
  status: 'EXPLICIT_COMPATIBILITY',
  sourceRequired: true,
  acceptedSourceTypes: [
    'PAGARE', 'TITULO_CREDITO', 'CONVENIO_MERCANTIL',
    'DOCUMENTO_MERCANTIL_BASE', 'REQUERIMIENTO_MERCANTIL',
    'ESTADO_CUENTA_MERCANTIL', 'COMUNICACION_MERCANTIL',
    'PAGO_MERCANTIL', 'DOCUMENTO_MERCANTIL_AUXILIAR'
  ],
  optionalSourceTypes: [],
  incompatibleMatterIds: ['civil', 'laboral', 'penal', 'amparo', 'administrativo']
}
```

`sourceRequired: true` significa que no existe un camino `NEW_WRITING` listo
para exportar. La redacción sin fuente puede producir `DRAFT/NEEDS_INPUT`, pero
no `READY_TO_EXPORT`.

## 5. Roles y múltiples fuentes

Cada fuente conservará individualmente `sourceType`, materia, role, estado y
provenance:

```ts
interface CommercialSourceDescriptor extends CivilSourceDescriptor {
  sourceType: SourceDocumentTypeValue;
  role: 'PRIMARY' | 'SUPPORTING' | 'REFERENCE' | 'UNSPECIFIED';
}
```

Reglas:

1. Debe existir una fuente `PRIMARY` confirmada como documento base o una
   decisión profesional equivalente.
2. `SUPPORTING` puede aportar requerimientos, pagos, estados de cuenta o
   comunicaciones, pero no cambia por sí sola el tipo documental.
3. `REFERENCE` nunca controla la clasificación ni agrega hechos confirmados.
4. Role omitido se normaliza a `UNSPECIFIED/NEEDS_INPUT`, nunca a `PRIMARY`.
5. Las fuentes civil, laboral, penal, amparo o administrativo usadas como
   principal o apoyo incompatible producen `SOURCE_DOCUMENT_INCOMPATIBLE`.
6. La compatibilidad se evalúa por fuente, no por posición ni por el primer
   archivo.

## 6. `CommercialEnforcementContext`

Se añadirá como contexto opcional compatible con `CaseContext`, sin romper el
`civil` existente:

```ts
interface CommercialEnforcementContext {
  documentType: 'demanda_ejecutiva_mercantil';
  sources: CommercialSourceDescriptor[];
  parties: {
    creditor: CaseContextField;
    debtor: CaseContextField;
    representatives: CaseContextField[];
    addresses: CaseContextField[];
  };
  personality: CaseContextField;
  procedural: {
    court: CaseContextField;
    jurisdiction: CaseContextField;
    procedure: CaseContextField;
    action: CaseContextField;
    enforceabilityDecision: CaseContextField;
  };
  instrument?: EnforcementInstrument;
  obligations: CommercialObligation[];
  claims: CommercialClaim[];
  facts: CommercialFact[];
  evidence: CommercialEvidence[];
  requests: CommercialRequest[];
  legalBasis: LegalBasisItem[];
  signature: CaseContextField;
  missingFields: string[];
  anonymizedFields: string[];
}
```

Cada `CaseContextField` mantiene `CONFIRMED`, `MISSING` o `ANONYMIZED`, además
de `CONFIRMED`, `INFERRED` o `REQUIRES_LAWYER_DECISION` como resolución. No se
derivará acreedor de roles civiles o constitucionales incompatibles.

## 7. Documento base e instrumento

El documento fuente y el instrumento jurídico serán entidades distintas:

```ts
type EnforcementInstrumentType =
  | 'PAGARE'
  | 'LETRA_DE_CAMBIO'
  | 'CHEQUE'
  | 'TITULO_CREDITO'
  | 'CONVENIO_MERCANTIL'
  | 'DOCUMENTO_MERCANTIL_BASE'
  | 'UNKNOWN';

type EnforcementInstrumentStatus =
  | 'CONFIRMED_EXECUTABLE'
  | 'REQUIERE_DEFINICION_ABOGADO'
  | 'INCOMPLETE'
  | 'NOT_ESTABLISHED';

interface EnforcementInstrument {
  id: string;
  sourceDocumentId: string;
  instrumentType: EnforcementInstrumentType;
  status: EnforcementInstrumentStatus;
  formalCompleteness: CaseContextField;
  enforceabilityAssessment: CaseContextField;
  maturityAndExigibility: CaseContextField;
  lawyerDecision: CaseContextField;
  provenance: ProvenanceRef[];
  parties: { creditor: CaseContextField; debtor: CaseContextField };
  amount?: MonetaryValue;
  currency?: CaseContextField;
  issueDate?: CaseContextField;
  dueDate?: CaseContextField;
  paymentStatus?: CaseContextField;
  signatures?: CaseContextField[];
  endorsements?: CaseContextField[];
  obligations: string[];
}
```

Un contrato, factura, comunicación, estado de cuenta o palabra como “pagaré”
no basta para marcar `CONFIRMED_EXECUTABLE`. El modelo separará integridad
formal, identificación de partes, obligación, vencimiento/exigibilidad y la
decisión profesional sobre la procedencia de la vía. Una etiqueta de documento
no producirá por sí misma una conclusión jurídica. Si cualquiera de esas
dimensiones no puede determinarse, el estado es
`REQUIERE_DEFINICION_ABOGADO`/`NEEDS_INPUT`.

## 8. Obligaciones, cantidades, pagos e intereses

El dinero se representará como decimal textual normalizado, nunca como cálculo
implícito de texto libre:

```ts
interface MonetaryValue {
  amount: string;
  currency: CaseContextField;
  status: CaseFieldStatus;
  resolution: CaseFieldResolution;
  sources: ProvenanceRef[];
}

interface PaymentRecord {
  id: string;
  amount: MonetaryValue;
  date?: CaseContextField;
  allocation?: CaseContextField;
  source: ProvenanceRef[];
  status: CaseFieldStatus;
}

interface BalanceCalculation {
  id: string;
  cutoffDate?: CaseContextField;
  originalAmount: MonetaryValue;
  payments: string[];
  allocationMethod: CaseContextField;
  formula: CaseContextField;
  rounding: CaseContextField;
  confirmedBalance: MonetaryValue;
  sources: ProvenanceRef[];
}

interface CommercialObligation {
  id: string;
  creditor: CaseContextField;
  debtor: CaseContextField;
  concept: CaseContextField;
  principalAmount?: MonetaryValue;
  currency?: CaseContextField;
  issueDate?: CaseContextField;
  dueDate?: CaseContextField;
  paymentStatus?: CaseContextField;
  payments: PaymentRecord[];
  balance?: MonetaryValue;
  balanceCalculation?: BalanceCalculation;
  source: ProvenanceRef[];
  status: CaseFieldStatus;
  interest: InterestSpec[];
}

interface InterestSpec {
  interestType: 'LEGAL' | 'CONVENTIONAL' | 'MORATORY' | 'NONE' | 'UNKNOWN';
  rate?: CaseContextField;
  period?: CaseContextField;
  basis?: CaseContextField;
  source: ProvenanceRef[];
  status: CaseFieldStatus;
}
```

El contexto distinguirá `originalAmount`, pagos, `confirmedBalance` y
`claimedAmount`. Un saldo solo se calcula si todos los inputs necesarios están
confirmados y el cálculo determinista queda trazado a sus fuentes. El cálculo
debe definir fecha de corte, asignación de pagos, fórmula, redondeo y deduplicar
pagos por ID/provenance. No se inventan capital, intereses, tasas, fechas,
comisiones, penas ni saldos. Sin tasa confirmada no se calcula interés; sin
saldo confirmado queda `NEEDS_INPUT`.

## 9. Facts, claims, evidence y requests

Se reutilizará la semántica de hechos de Fase 2A, especializada al vínculo:

```text
instrument -> obligation -> fact -> claim -> evidence -> request
```

Los hechos solo provienen de documentos validados con provenance suficiente,
datos confirmados o `MANUAL_INPUT` confirmado por abogado. Las cláusulas no se
convierten automáticamente en hechos. `REFERENCE` no alimenta hechos,
obligaciones, claims ni evidencia confirmados. `CommercialClaim` distinguirá
principal, intereses, costas y cumplimiento, pero ningún claim será agregado
por defecto. Cada claim tendrá `relatedObligations`, `relatedFacts`, amount
opcional y provenance. La evidencia solo podrá ser ofrecida si existe y
mantiene `ProvenanceRef`; no se inventarán testigos, periciales, inspecciones ni
anexos.

## 10. Required fields por nivel

| Nivel | Campos |
|---|---|
| `CRITICAL_REQUIRED` | acreedor/actor, deudor/demandado, documento base, instrumento, obligación, una prestación y evidencia del instrumento |
| `REQUIRED_FOR_FINAL` | personalidad, órgano, jurisdicción, procedimiento, vía, decisión sobre ejecutividad, exigibilidad/vencimiento cuando aplique, cantidad reclamada y saldo confirmado cuando se reclame dinero, hechos, pruebas, petitorios, firma y fundamento revisado |
| `OPTIONAL` | representantes, domicilios, pagos, garantías, endosos, comunicaciones, estado de cuenta, fechas adicionales e información auxiliar no necesaria para el cálculo |
| `LAWYER_DECISION` | procedencia de la vía ejecutiva, acción, competencia, instrumento aplicable, intereses, saldo reclamable, garantías y teoría jurídica |

`REQUIRED_FOR_FINAL` se interpreta según el tipo de instrumento: no se exigirá
un endoso a un pagaré que no lo requiera, pero tampoco se asumirá que no aplica.

## 11. Required sections canónicas

La strategy tendrá exactamente estas 13 secciones, validadas por ID:

```text
destinatario
comparecencia
personalidad
identificacion_partes
via_accion
documento_base
obligaciones_y_cantidades
prestaciones
hechos
derecho
pruebas
petitorios
firma
```

Contenido mínimo:

| ID | Fuente |
|---|---|
| `destinatario` | `procedural.court` |
| `comparecencia` | acreedor y calidad procesal |
| `personalidad` | personalidad y representantes |
| `identificacion_partes` | acreedor/deudor |
| `via_accion` | procedimiento, vía y decisión profesional |
| `documento_base` | instrumento y provenance, sin conclusión inventada |
| `obligaciones_y_cantidades` | obligaciones, pagos, saldo e intereses confirmados |
| `prestaciones` | claims mercantiles explícitos |
| `hechos` | hechos ordenados y vinculados a fuentes |
| `derecho` | fundamento revisado o placeholder de abogado |
| `pruebas` | evidencia existente con provenance |
| `petitorios` | requests explícitos |
| `firma` | firma o pendiente explícito |

## 12. Strategy, template y renderer

Se creará una strategy dedicada `demanda_ejecutiva_mercantil` con sus propios
required fields, sections, rol acreedor y reglas de documento base. El template
dedicado no será una copia del template civil ni del genérico `demanda`.

El renderer reutilizará solamente estilos, paginación, sanitización y binarios
del pipeline común, pero recibirá como fuente estructurada primaria
`CaseContext.commercialEnforcement`, no el contenedor civil ni texto agregado
por posición. Las instrucciones de generación prohibirán afirmar que el
documento trae aparejada ejecución, que existe saldo, que proceden intereses o
que una vía es procedente salvo confirmación profesional o regla implementada.
Sin fundamento confirmado se mostrará:

```text
[REQUIERE FUNDAMENTACIÓN JURÍDICA DEL ABOGADO]
```

## 13. Preflight

`runDocumentPreflight` delegará al preflight mercantil cuando el canonical sea
`demanda_ejecutiva_mercantil`. Comprobará:

1. source policy y compatibilidad individual;
2. fuente `PRIMARY` y documento base;
3. tipo e integridad del instrumento;
4. acreedor/deudor y personalidad;
5. obligación y vínculo con claims;
6. vencimiento, exigibilidad y pagos cuando apliquen;
7. cantidades y saldo sin inferencias no confirmadas;
8. hechos, evidencia y provenance;
9. procedimiento, vía, jurisdicción y decisión profesional;
10. required fields y source roles.

Para este canonical, la ausencia de un resultado ejecutado de preflight o de un
quality gate mercantil aprobado es un fallo cerrado. No se permite inferir
`READY` por ausencia de errores, metadata incompleta o un estado legado.

Estados: `READY`, `NEEDS_INPUT`, `EXTRACTION_INCOMPLETE`,
`SOURCE_DOCUMENT_INCOMPATIBLE` y `DOCUMENT_TYPE_NOT_IMPLEMENTED`. El preflight
no decide por sí mismo la procedencia jurídica de la vía.

## 14. Quality gates mercantiles

Además de los gates universales:

1. instrumento base presente, identificado y con provenance;
2. ejecutividad confirmada o decisión profesional explícita;
3. partes del instrumento coherentes con acreedor/deudor;
4. obligación vinculada a instrumento y fuente;
5. original, pagos, saldo y cantidad reclamada coherentes;
6. vencimiento y exigibilidad confirmados cuando correspondan;
7. intereses separados y nunca inventados;
8. claims vinculados a obligaciones y hechos;
9. evidence vinculada a hechos y provenance;
10. materia mercantil y rol procesal coherentes;
11. 13 required sections únicas por ID;
12. ausencia de placeholders, faltantes o anonimizados;
13. ausencia de lenguaje civil, laboral, amparo o recursos incompatibles;
14. no afirmar ejecutividad, intereses, saldo, artículos o jurisprudencia sin soporte;
15. ningún dato `INFERRED` o `REQUIRES_LAWYER_DECISION` satisface el cierre;
16. integridad formal, exigibilidad y decisión profesional están separadas;
17. preflight y quality gate mercantiles existen, fueron ejecutados y pasan;
18. filename y canonical ID corresponden a la salida.

Un gate fallido produce `REVIEW_REQUIRED`; nunca deja el documento como
`generated` listo para exportación.

## 15. Source-to-output y routing

El routing resolverá primero el canonical o su alias de entrada y nunca
convertirá un contrato, factura, comunicación o fuente genérica en un título
ejecutivo. Una selección explícita prevalece sobre la clasificación del texto.
Si falta mapping, se devuelve `MISSING_TEMPLATE_MAPPING` o
`DOCUMENT_TYPE_NOT_IMPLEMENTED`; no se cae a `demanda` ni a otro tipo.

## 16. Lifecycle y exportación

Se reutiliza el contrato cerrado de Fase 2A:

```text
GENERATING -> DRAFT / REVIEW_REQUIRED -> READY_TO_EXPORT -> FINAL_DOCUMENT
```

`DRAFT` sin fuente, `DRAFT` con instrumento incompleto y `REVIEW_REQUIRED` son
editables, pero no exportables. Solo una transición explícita posterior a
todos los preflight, quality gates, provenance y validaciones permite
`READY_TO_EXPORT`. Para este canonical, el guard común exigirá además la
presencia y aprobación verificable de los resultados mercantiles de preflight y
quality gate; si faltan, fallará cerrado. DOCX directo, PDF directo y PDF
legacy pasan por el guard común; no habrá rutas especiales ni bypass por
`renderedSections`.

## 17. Filename

El nombre determinista será:

```text
Demanda Ejecutiva Mercantil.docx
Demanda Ejecutiva Mercantil.pdf
```

Se deriva del canonical/registry y nunca del filename de la fuente.

## 18. UI

El catálogo mostrará:

```text
Mercantil -> Juicios mercantiles -> Demandas mercantiles
  -> Demanda Ejecutiva Mercantil -> Disponible
```

La captura de faltantes se agrupará en Partes, Documento base, Obligación,
Cantidades y pagos, Fechas y exigibilidad, Vía/procedimiento, Hechos,
Prestaciones, Pruebas, Fundamentación y Firma. La UI mostrará la diferencia
entre `NEEDS_INPUT`, `REQUIERE_DEFINICION_ABOGADO` y `REVIEW_REQUIRED`, y
deshabilitará exportar si el guard del servidor no permite la transición.

## 19. Tests TDD sintéticos

Antes de modificar producción se crearán tests rojos para al menos:

1. pagaré sintético completo con confirmación profesional;
2. documento base parcial;
3. documento mercantil sin certeza de ejecutividad;
4. contrato mercantil que no se convierte en título;
5. múltiples fuentes con roles individuales;
6. `REFERENCE` no controla;
7. `UNSPECIFIED` produce `NEEDS_INPUT`;
8. fuentes civil y laboral incompatibles;
9. cantidad faltante;
10. vencimiento faltante;
11. pago parcial;
12. saldo no inventado;
13. intereses no inventados;
14. hechos y claims no inventados;
15. evidence con provenance;
16. `MANUAL_INPUT` sin confirmar;
17. `MANUAL_INPUT` confirmado;
18. required fields y las 13 sections;
19. quality gate y lifecycle;
20. DRAFT/REVIEW_REQUIRED no exportan;
21. DOCX, PDF y legacy pasan el guard;
22. filename y alias canónico;
23. no cross-family fallback;
24. no hallucination;
25. source compatible correctamente propagado por API/pipeline;
26. generación sin archivo solo produce DRAFT/NEEDS_INPUT;
27. cálculo determinista de saldo solo con inputs confirmados;
28. intereses con tasa ausente permanecen pendientes;
29. `generate-section` no evita el guard;
30. edición manual y provenance se conservan;
31. integridad formal, exigibilidad y decisión profesional no se confunden;
32. cálculo de saldo con fecha de corte, pagos, fórmula y redondeo es
    determinista y trazable;
33. pagos duplicados no alteran el saldo;
34. ausencia de preflight/quality gate no permite `READY_TO_EXPORT`.

Todos los fixtures usarán nombres e identificadores sintéticos; no se utilizarán
expedientes, PDFs o asuntos reales.

## 20. Revisión independiente y riesgos

Antes de integrar los cambios se solicitarán dos revisiones independientes:

- **Revisor A:** modelo de instrumento, obligaciones, cantidades, intereses,
  hechos, claims, evidencia y no hallucination.
- **Revisor B:** routing, source types, CaseContext, preflight, quality gates,
  lifecycle, exporters, catálogo y tests.

Riesgos principales: tratar un pagaré solo por su etiqueta como ejecutable,
confundir cantidad original con saldo, agregar intereses por defecto, tomar una
fuente `REFERENCE` como principal, mezclar familias o permitir exportación por
legacy. Las mitigaciones son estados explícitos, provenance, vínculos
instrumento-obligación-claim, default-deny y guard común.

## 21. Orden exacto de implementación

1. Verificar estado de archivos, blueprint aprobado y guía local de Next.js.
2. Confirmar que `demanda_ejecutiva_mercantil` sigue `CATALOG_ONLY` y sin
   strategy/template dedicado.
3. Crear tests rojos sintéticos para identidad, fuente, instrumento, contexto,
   preflight, cantidades, gates, lifecycle y exportación.
4. Extender `SourceDocumentType` con tipos mercantiles explícitos y aliases.
5. Normalizar canonical/alias en routing, strategy, template y filename.
6. Añadir `CommercialEnforcementContext`, instrumento, obligaciones,
   cantidades, pagos, intereses, facts, claims, evidence y requests.
7. Implementar extracción/provenance sin inferir ejecutividad ni saldo.
8. Implementar source policy y evaluación multi-source default-deny.
9. Crear strategy y template dedicados con 13 sections canónicas.
10. Conectar el contexto al plan/renderer común.
11. Añadir preflight mercantil y estados de faltantes.
12. Añadir quality gates mercantiles y transición `REVIEW_REQUIRED`.
13. Conectar DOCX, PDF, legacy y `generate-section` al guard común existente.
14. Integrar UI de estado y faltantes sin habilitar otros catalog-only.
15. Ejecutar las revisiones independientes y corregir solo P0/P1 demostrados.
16. Ejecutar focales, suite, typecheck, lint, `next build --webpack` y QA
   interactivo con fixtures sintéticos.
17. Cambiar únicamente `demanda_ejecutiva_mercantil` a `IMPLEMENTED` si todo
   pasa y no quedan P0/P1 en esta ruta.

## 22. Reglas no negociables del proyecto

1. `demanda_ejecutiva_mercantil` es el único output canonical de esta fase.
2. Ningún documento mercantil se convierte automáticamente en título ejecutivo.
3. No se inventan capital, saldo, intereses, tasas, vencimientos, hechos,
   pruebas, artículos, jurisprudencia, competencia, vía ni peticiones.
4. `MANUAL_INPUT` requiere `confirmedByLawyer: true` para satisfacer un gate.
5. `INFERRED` nunca equivale a `CONFIRMED`.
6. Source role omitido es `UNSPECIFIED/NEEDS_INPUT`, nunca `PRIMARY`.
7. `REFERENCE` no controla clasificación ni hechos.
8. DRAFT y REVIEW_REQUIRED no exportan por ninguna ruta.
9. Todo DOCX/PDF, incluyendo bajo nivel y legacy, usa el guard común.
10. No se crea un segundo pipeline ni se investiga Neon.
11. `.codegraph/` permanece local y fuera de producción/versionado.

## 23. Criterios de cierre

La fase se cierra solo si el canonical y alias convergen, el documento base se
modela explícitamente, la vía no se presume, obligaciones/cantidades/intereses
son trazables, las fuentes incompatibles se bloquean, los 13 IDs se validan,
DRAFT no exporta, READY_TO_EXPORT exporta por DOCX/PDF/legacy con guard y con
preflight/quality gate ejecutados, la UI muestra `Disponible`, pasan focales,
suite, typecheck, lint, build y QA, y solo
`demanda_ejecutiva_mercantil` cambia a `IMPLEMENTED`.

**LOOP 8B — FASE 2B: DEMANDA EJECUTIVA MERCANTIL — CERRADO: SÍ/NO**
