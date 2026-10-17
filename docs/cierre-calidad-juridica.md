# Cierre — corrección de calidad jurídica (rama `fix/calidad-juridica`, base `codex/version-2` @ a4e6aa2)

Estado: **cerrado parcialmente**. Lotes 0 a 7 tienen commit, salvo el Lote 8 (pospuesto por decisión del titular y
prerrequisito de cualquier `humanReview`) y el Lote 9, que está parcialmente hecho. Nada de esto sustituye la
muestra con IA real ni la revisión de un abogado (criterios G-9 y G-10).

## Por lote

| Lote | Hallazgos cerrados | Pruebas que lo demuestran | Commit |
|---|---|---|---|
| P0 (previo) | Cancelación cooperativa, meta de páginas, NEEDS_REVIEW en timeout | `generationCancellation`, `generateCancellationRoute`, `providerCancellation` | `ed9b0ef` |
| 0 | Comparador de secciones por título (regresión de `sectionDisplayTitle` en a4e6aa2). Evidencia 266 PASS / 0 FAIL | `evidenceSectionCoverage` (5), `writingTypeEvidence` | `b7440b4` |
| 1 | Citas: «acuerdo» solo como ordenamiento; `\b` sustituido por `\p{L}`; claves de precedente y registro; causas `UNVERIFIED_PRECEDENT_ASSERTION` y `UNVERIFIED_DEADLINE`; regla atribuida a cita no verificada al anexo; respaldo de citas por artículo y ordenamiento | `citationDetectionRegression` (16), `authorityRuleToAnnex` (3), suites de autoridad y admisión | `9a0bc04`, `2627a97` |
| 2 | Cancelación real (`cancelJob` aborta el pipeline); 429 en redacción no degrada a modelo no apto (`PROVIDER_DEGRADED`, solo Groq); causas `TIMEOUT` y `MEASUREMENT_FAILED` | `providerDrafting` (5), `generationCancelRegistry` (2), `providerCancellation` | `a8f95cd` |
| 3 | Directiva de postura según el rol del tipo; foco de HECHOS; roles de apelaciones y recurso administrativo; `contestacion_proveedor` demandado por excepción explícita; petitorio neutro en escritos no contenciosos; vocabulario contencioso como advertencia. **P1-6: la ampliación no añade bloques a la respuesta individual** (contrato cambiado por decisión del titular; las 4 pruebas de fase 3 se actualizaron y se declaró en el commit) | `posturePromptByRole` (15), `expansionResponseSections` (3), `generationExpansion*` (9) | `6ebd6fb`, `6e6c2df`, `1bcf863` |
| 4 | Control fáctico por bloque (fecha o monto ausente de la fuente o de lo confirmado por el abogado ⇒ bloque rechazado con motivo); contradicción de polaridad (contrato, pago, notificación…) | `blockFactualGate` (6), `documentConsistencyPolarity` (4) | `28e54d1`, `6395680` |
| 5 | Pretensiones: fórmulas de transición y textos que terminan en «:» no se extraen; acentos en términos de pretensión; expediente: un «amparo directo N/AAAA» del cuerpo no es expediente; fallback N/AAAA baja la confianza | `claims` (+5), `caseFichaExpediente` (3) | `205ec55`, `97afc10` |
| 6 | Clase por proposición (`LegalPropositionClass`, asignación desde motivos, resumen); FINAL bloquea con `UNVERIFIED_CITATION` y `UNSUPPORTED_OR_CONTRADICTORY` derivadas de marcadores | `propositionClassContract` (5), `finalPropositionGate` (3) | `fc13095`, `825e12c` |
| 7 | Ruta `/research` con consentimiento explícito (403 sin él); bundles guardados en servidor por propietario y expediente; generación los toma de ahí; jurisprudencia SJF siempre MANUAL_ONLY; aviso global «fundamentos no verificados» en las incidencias del documento | `researchBundleStore` (6), `researchRouteConsent` (3), `sjfManualOnly` (3), `generateCaseDossierRoute` (+1) | `69538c8`, `689b6f2` |
| 9 (parcial) | La suite de familias falla ante cualquier error no listado (solo `SOURCE_DOCUMENT_INCOMPATIBLE` y `PROCEDURAL_VIABILITY_FAILED`); mock muerto eliminado. **Paridad editor ↔ DOCX ↔ PDF con una edición manual** (un tipo sintético, comprobación por inclusión del texto normalizado) | `pageTargetAllFamilies` (267 en verde, primer plano), `exportParityManualEdit` (1) | `2cb1057`, (commit de paridad) |

## Verificación

- Suite offline (`vitest.offline.config.ts`), por carpetas en primer plano, sobre el HEAD del Lote 9 anterior a los
  dos últimos commits (`1bcf863` y el de paridad): **4978 pruebas, 4976 en verde, 0 fallos** (2 omitidas).
  Resumen: `audit/suite-final-lote9.json`. Tras esos dos commits no se relanzó la suite completa; las pruebas
  de expansión y de paridad se ejecutaron por separado y pasan.
- Baseline del commit del Lote 0 (`b7440b4`): 4922 pruebas, **25 fallos** (`audit/baseline-lote0.json`).
  Los fallos no aumentaron; en el estado actual son 0.
- Evidencia de catálogo: 266 PASS / 0 FAIL (`writingTypeEvidence.generated.ts`).
- `npx tsc --noEmit`: sin errores.

## Pendiente (declarado, no cerrado)

- **Lote 8 (persistencia): pospuesto por decisión del titular.** Debe hacerse **antes de aprobar cualquier
  `humanReview`**. Pendiente: aprobación en servidor de FINAL con autor, fecha y hash; `exportGuards` exige esa
  aprobación y revalida el preflight. Requiere autorización explícita para tocar persistencia.
- **Lote 9, componentes de Escritos iniciales y Universal con `pageTarget: 40`: no hecho.** `app/machotes/page.tsx`
  se renderiza en jsdom con `next/navigation` simulado. Se llega al paso 6 de Escritos iniciales, se elige «Extenso»,
  se pulsa «Generar Escrito Inicial» y se autoriza en el diálogo de privacidad, pero la petición a
  `/api/legal-engine/generate` no sale dentro del harness de prueba. Sin esa petición no hay prueba del payload.
  Pendiente: depurar el paso de consentimiento o extraer el formulario a un componente.
- **Lote 9, fixtures de los 23 tipos no generados.** Son: apelacion_mercantil, revocacion_mercantil,
  aclaracion_sentencia_mercantil, ejecucion_sentencia_mercantil, liquidacion_mercantil, embargo_mercantil,
  providencias_precautorias_mercantiles, desahogo_prevencion_laboral, cumplimiento_laudo_sentencia_laboral,
  ejecucion_sentencia_laboral, demanda_amparo_directo_laboral, demanda_amparo_indirecto_laboral,
  contestacion_revision_extraordinaria_amparo_directo, contestacion_nulidad_administrativa,
  ampliacion_demanda_nulidad, contestacion_ampliacion_nulidad, cumplimiento_sentencia_administrativa,
  recurso_revision_administrativa, contestacion_nulidad_fiscal, ampliacion_demanda_fiscal,
  contestacion_ampliacion_fiscal, recurso_revision_fiscal, cumplimiento_sentencia_fiscal. Veintidós son
  `SOURCE_DOCUMENT_INCOMPATIBLE` y uno `PROCEDURAL_VIABILITY_FAILED`. Cada uno necesita su fuente aceptada; el
  mensaje completo del rechazo no se conservó en el log.
- **Lote 2:** `providerCapabilities` modo `drafting` con lista de modelos aptos (solo se aplicó la regla de Groq);
  registro de proveedor y modelo por bloque sin verificar.
- **Lote 4:** revalidar la consistencia tras el reintento de expansión (exige reconstruir el ensamblado en `pipeline.ts`).
- **Lote 5:** confianza OCR por página (el proveedor OCR solo devuelve confianza global).
- **Lote 6:** la clase no se guarda por bloque; el bloqueo de FINAL deriva de los marcadores del texto. Pendiente:
  resumen visible en el editor y mover la regla al anexo en `exportGuards`.
- **Lote 7:** migrar el almacén de bundles a la persistencia de trabajos (hoy memoria del proceso; no se tocó
  Prisma); vigencia evaluada a la fecha del acto (`regime.relevantDate`); el proveedor de la ruta es el adaptador
  DOF únicamente.
- **Hallazgo de exportación:** el «EXPEDIENTE: …» del destinatario se imprime en el encabezado del DOCX, no en el
  cuerpo. El texto no se pierde, pero el criterio de paridad debe contemplar el encabezado.
- **Contestación en el catálogo:** `contestacion_proveedor` tiene rol demandado por excepción en el catálogo; sin
  plantilla propia, sigue siendo un id sin plantilla dedicada.

## Criterios de producción (informe, sección G)

Ninguno de los criterios G-1 a G-10 queda demostrado por este cierre. En particular:

- **G-2 (citas), G-3 (hechos), G-4 (postura), G-5 (consistencia):** requieren muestra real revisada; las pruebas son sintéticas.
- **G-6 (ejecución):** cubierto con proveedor simulado; los 429 y respuestas vacías de proveedores reales no se probaron.
- **G-7 (exportación):** paridad editor ↔ DOCX ↔ PDF probada en un tipo sintético con una edición manual, no en la
  muestra completa.
- **G-8 (FINAL):** sin el Lote 8, FINAL no tiene aprobación registrada en servidor.
- **G-9 (muestra real controlada)** y **G-10 (valoración jurídica por abogado):** no realizados. No se cambió ningún
  `humanReview` ni `functionalStatus`.
