# LEX PLANTILLAS Constitution

Rama: `codex/version-2`. Stack: Next.js 16 (App Router, webpack), React, TypeScript,
Prisma + Neon (Postgres), Vitest, Playwright. Workspace legal de escritorio (Windows).

Principios núcleo, ordenados por prioridad. Si dos principios chocan, gana el primero.

---

## I. Seguridad jurídica por encima de utilidad (NON-NEGOTIABLE)

En el motor legal **jamás** se relajan estos gates para que algo "pase":

- `QualityGate` / `qualityGate.ts`
- `Coverage` / `documentCoverage.ts`, `coveragePolicy.ts`, `richCoverage.ts`
- Verificación de autoridad y `provenance` / `authorityVerificationGate.ts`,
  `authorityPropositionGate.ts`, `authorityReferenceAudit.ts`
- `factualClaimGate.ts` (auditoría factual)
- Ciclo de vida `DRAFT` / `FINAL` / `exportGuards.ts`
- `requestContract` (peticiones)

Prohibido lowering de umbrales, borrado de checks, o "marcar PASS manualmente".

## II. Final es fail-closed y siempre por documento

`FINAL` **nunca** se habilita por el tipo. Depende del documento concreto:
`pendingFields`, autoridades, `provenance`, coverage, `qualityGate`, `preflight`,
`lifecycle`.

`functionalStatus = PASS` acredita que el **motor** funciona de punta a punta
(contrato → pipeline → generación determinista → secciones → DOCX → PDF →
lifecycle fail-closed). **NO autoriza FINAL**: mientras `humanReview` siga
`PENDING`, FINAL continúa bloqueado.

## III. La admisión es por proposición, nunca por sección

Lección costosa (commit `1b530c7`): un gate que rechaza la sección completa
convierte una violación puntual en un documento vacío.

- Unidad de admisión = **proposición / cláusula / claim**, no `SECTION`.
- Una sección con N párrafos válidos + 1 proposición insegura →
  N párrafos **conservados** + 1 marcador puntual.
- Los marcadores emitidos siguen siendo *seed markers* (bloquean FINAL).
- Los marcadores `[DATO PENDIENTE: …]` existentes **sobreviven** a la remediación:
  son parte del contrato de completitud (`hasUnresolvedFactualDependencies`).

## IV. No inventar derecho ni hechos; sí razonar

Debe permitirse: inferencia, subsunción, contraste, argumentación, explicación,
identificación del error, afectación, conexión hechos↔resolución.

Exige soporte verificable: número de artículo, contenido concreto de norma,
jurisprudencia, regla específica de carga de prueba, presunción, plazo,
procedencia, competencia, efecto procesal atribuido a una norma, prueba que se
afirma existente, hechos, fechas, peticiones sustantivas no autorizadas.

Falta soporte → se marca **solo ese elemento**, nunca se destruye el razonamiento.

## V. La Guía Operativa es metodología interna, nunca autoridad

Manual: `data/documents/operational-manual/v1.0/` (212 págs, v1.0, hash
`b3910bb8…`). Entra al prompt **acotado** (≈4500 chars) y etiquetado como no
autoridad.

- **NO** verifica leyes ni jurisprudencia.
- **NO** satisface `CitationVerification` por sí sola.
- **NO** puede citarse al usuario como fundamento jurídico.
- **NO** debeermarkers de "formato de respuesta del asistente" ni
  "Estilo y Conocimiento Operativo del Despacho" (práctica local, no
  metodología transferible).

## VI. El tipo de escrito seleccionado sobrevive todo el pipeline

```
UI → selectedType → request → API → generationContext → taskBuilder → strategy
   → blueprint → documentType → editor → persistence → DOCX/PDF
```

Prohibido que un tipo catalogado termine en silencio como `escrito_libre` /
`generic`. Fallback genérico para un tipo implementado = **FAIL**.

`escrito_libre` sólo si el usuario lo eligió, el clasificador lo determinó, o hay
regla de negocio explícita y documentada.

## VII. Ningún tipo visible es una etiqueta

Cada tipo visible resuelve a: `canonicalType → family → matter →
proceduralPurpose → compatibleSources → blueprint → generationStrategy →
sections → capabilities`.

Cero huérfanos, cero IDs duplicados, cero blueprints/strategies faltantes.
Un solo tipo canónico por familia; las variantes de configuración se resuelven
por **motor de familias** (blueprint por familia + config por tipo), no por
copia/pega de plantillas.

## VIII. `functionalStatus` por evidencia, no por lista

`FUNCTIONAL_STATUS_OVERRIDES` queda vacío y reservado a excepciones
justificadas. El estado se **computa** desde evidencia producida por un recorrido
determinista (`tests/catalog/writingTypeEvidence.test.ts`), que es lo que lo
genera en `lib/catalog/writingTypeEvidence.generated.ts`.

## IX. TDD y verificación honesta

- Test RED antes de implementar; GREEN después.
- No se modifica un test para que pase si el defecto es real; si el contrato
  cambió legítimamente, el test se actualiza **declarando por qué**.
- Baseline antes de afirmar "no hay regresión": comparar contra el estado previo
  (stash o JSON), no suponer.
- Prohibido inflar métricas: un PASS sin evidencia no es PASS.

## X. Integridad de codificación

El proyecto es UTF-8. **Nunca** usar `Set-Content -Encoding utf8` / `Out-File`
para reescribir archivos: en PowerShell 5.1 corrompe acentos (`mojibake`).
Usar las herramientas de edición, o `[IO.File]::WriteAllText(path, text,
[Text.UTF8Encoding]::new($false))`. Verificar con un escaneo de mojibake tras
escribir.

---

## Restricciones técnicas permanentes

- **No** tocar `persistence`/Prisma sin autorización explícita.
- **No** cambiar providers.
- **No** hacer commit/push/pull/reset/checkout/switch sin instrucción.
- **No** matar procesos que retengan DLLs (p. ej. `query_engine-windows.dll.node`)
  sin autorización; si se detecta, reportar el bloqueo y seguir.
- **No** mantener `npm run dev` abierto durante `npm run build`.
- Si el workspace remoto no responde (cuota/DB), es bloqueo **ambiental**: no se
  sortea parcheando auth ni persistencia.
- Prisma: los objetos `Organization`/`User` se consultan con `select` explícito
  (el schema compartido tiene columnas distintas); jamás inventar un
  `organizationId` que no existe.

## Estado del proyecto al ratificar

- Motor de tipos: 277 tipos visibles, 0 huérfanos, 0 fallbacks incorrectos.
- Admisión granular implementada; regresión de generación del recurso civil
  resuelta (proemio duplicado, contaminación amparo/civil, profundidad Extensa).
- Spec Kit instalado: `.specify/` + `.opencode/commands/` (integración `opencode`).

## Gobierno

Esta constitución prevalece sobre cualquier otra práctica del repo.
Toda amending requiere: (1) documentar el porqué, (2) listar los archivos
afectados, (3) actualizar la versión y la fecha, (4) re-validar los gates del
principio afectado.

**Versión**: 1.0.0 | **Ratificada**: 2026-10-05 | **Última modificación**: 2026-10-05