# APP-plantillas (LexPlantillas) 1.0 — Sistema Jurídico Profesional

**APP-plantillas** es una aplicación de escritorio (Windows) para abogados: genera, revisa, edita y exporta escritos jurídicos. La redacción usa los proveedores de IA configurados, solo con consentimiento expreso del abogado para enviar el expediente, y un respaldo local determinístico. Todo borrador sale como **DRAFT** y requiere revisión del abogado.

## Pestañas

**Generación**
* **Motor Jurídico (Universal)** — `¿Qué necesitas hacer? [Analizar/Investigar/Redactar]` → materia, jurisdicción y tipo (taxonomía centralizada, `Otro → Especifica`, máx. 80) → pregunta → fuentes → extensión objetivo → generar.
* **Escritos Iniciales** — asistente de 6 pasos (1. Qué presentar, 2. Quién interviene, 3. Qué ocurrió, 4. Qué solicitas, 5. Pruebas, 6. Instrucciones y extensión). Valida los datos esenciales **antes** de pedir el consentimiento y lleva al paso que falta.
* **Contestaciones y Recursos** — `PDF → extracción → ficha del caso → análisis → generación → editor → exportación`. Incluye contestaciones de demanda, apelaciones, recursos y la contestación de agravios (parte apelada).
* **Mis Plantillas** — biblioteca para buscar, filtrar, previsualizar (variables `{{}}`), usar y guardar machotes.

**Despacho**
* **Inicio**, **Expedientes** (borradores agrupados por escrito con «N versiones»), **Cómputo de Términos**, **Jurisprudencia SCJN** (búsqueda manual con enlace oficial), **Biblioteca**, **Alertas DOF y Boletín**, **Configuración**, **Ayuda** y **Firma Electrónica** (próximamente).

Cada pestaña tiene estados de carga, vacío y error honestos: nunca muestra datos de ejemplo como si fueran reales. Los detalles (fichas, eventos, vistas previas) se abren en un **panel lateral** o en un **modal**, nunca al final de la página.

## Cómo se redacta un escrito

1. **Ficha del caso.** Antes de redactar se extrae del expediente: órgano, lugar, número de expediente, partes con su rol, resolución impugnada, notificaciones y agravios numerados. El abogado la revisa, la corrige y **elige a quién representa** (nunca se infiere). El redactor solo usa datos de la ficha (`lib/legal-engine/caseDossier.ts`, `CaseDossierPanel.tsx`).
2. **Contrato del tipo** (`writingContract.ts`). Cada tipo declara quién firma, el documento fuente obligatorio, las secciones fijas y lo que no debe contener. Si falta la fuente (por ejemplo, la apelación del contrario), el sistema la pide en lugar de inventar.
3. **Rol procesal.** La postura de cada prompt depende del rol del escrito (actor, demandado, apelante, recurrente, promovente, no contencioso): una demanda nunca hereda una postura defensiva (`posturePrompt.ts`). La ampliación respeta la función de cada sección y no toca las secciones estructurales (respuesta individual a cada hecho y prestación, proemio, petitorios, firma).
4. **Extensión objetivo (meta, no tope).** La extensión elegida (5/10/20/40 o personalizada de 2 a 60) es una meta en todas las pantallas. El motor planifica, mide el **PDF renderizado** y amplía con análisis respaldado. Si el material no alcanza sin repetir ni inventar, el resultado se marca `BELOW_TARGET` con el motivo; nunca se presenta como cumplido (ver [docs/extension-del-escrito.md](docs/extension-del-escrito.md)).
5. **Control fáctico por bloque.** Antes de aceptar un bloque, se rechazan fechas, montos, actos y pruebas que no consten en las fuentes ni hayan sido confirmados por el abogado. Se detectan contradicciones entre secciones (por ejemplo, «existió contrato» frente a «nunca existió contrato»).
6. **Citas y fundamentos.** Artículos, leyes, tesis y jurisprudencia (claves `1a./J.`, `2a./J.`, `P./J.`, aisladas, registro digital, contradicciones), criterios atribuidos a la SCJN y plazos se detectan y se marcan `[NO VERIFICADO: …]` sin mutilar la oración. La regla atribuida a una cita no verificada pasa al anexo de revisión. La jurisprudencia del Semanario Judicial es siempre de verificación **manual** (la SCJN no permite automatizarla).
7. **Investigación oficial (opcional).** Con consentimiento, `/api/legal-engine/research` consulta fuentes oficiales (DOF, leyes federales, Jalisco) y guarda los resultados verificados en el servidor, ligados al trabajo; el cliente no puede inyectarlos. Sin investigación, el escrito lleva el aviso global «fundamentos no verificados».
8. **Anexo de revisión.** Notas, riesgos, citas no verificadas y datos pendientes se listan fuera del escrito (`reviewAnnex.ts`, `ReviewAnnexPanel.tsx`).
9. **Validador posterior** (`writingContractValidator.ts`). Detecta encabezados repetidos, firma incoherente con el rol, exceso de marcadores, fecha o lugar ajenos a la ficha, texto que defiende la postura contraria y vocabulario impropio del tipo de escrito.

FINAL sigue bloqueado por los gates de calidad, cobertura, autoridad, citas no verificadas y aprobación humana (`humanReview`). Un `PASS` técnico no es una certificación jurídica.

## Plantilla del abogado

En Contestaciones y Recursos, Escritos Iniciales, Universal, el modal generador y Mis Plantillas existe la opción **«Usar mi plantilla (diseño y estructura)»**:

* **Diseño:** el Word se genera usando el `.docx` del abogado como molde (estilos, márgenes, membrete, encabezado y pie, numeración). El PDF iguala tamaño de página, márgenes, interlineado e imágenes del membrete (PNG/JPEG); usa fuentes estándar, o la más cercana con aviso. Las plantillas PDF o de texto usan el diseño estándar, con aviso.
* **Estructura:** cada sección se clasifica como **fórmula** (se conserva el texto y se sustituyen los datos) o **sustantiva** (se redacta de nuevo con el caso nuevo, sin pasar el texto viejo al generador). Hay una vista previa antes de generar, y el abogado puede cambiar la clasificación.
* **Anti-arrastre:** cualquier nombre, fecha, monto o expediente del caso anterior que aparezca en el resultado se bloquea y pasa al anexo con el motivo «dato de la plantilla anterior»; mientras haya pendientes, FINAL queda bloqueado.
* La plantilla se procesa solo en local; nunca se envía a servicios externos.

Detalle: [PLANTILLA-ABOGADO.md](PLANTILLA-ABOGADO.md).

## Arquitectura IA

```
UI → /api/legal-engine/generate → pipeline → runLegalAI() → providerChain → proveedor(es) autorizados → respaldo local
```

* `lib/ai/providerChain.ts` es la única fuente del orden de proveedores (`AI_PROVIDER_CHAIN`; `.env.example` trae `nvidia,gemini,groq,local`). Acepta `gemini`, `groq`, `nvidia` y `local`.
* **Respaldo en cadena:** `lib/ai/providerRouter.ts` prueba los proveedores en orden; `local` determinístico es siempre el último recurso. Solo se consideran los proveedores con clave y autorizados por el abogado.
* **Degradación transparente:** en tareas de redacción, si un proveedor responde 429 y solo queda un modelo no apto, la generación se detiene con `PROVIDER_DEGRADED` en lugar de redactar con un modelo débil.
* **Cancelación y tiempo límite:** el plazo se calcula con la meta de páginas. La cancelación o el timeout abortan las llamadas en curso (0 llamadas posteriores) y el borrador queda en `NEEDS_REVIEW` con `BELOW_TARGET/TIMEOUT`; nunca se presenta como completo.
* El expediente solo se envía a un proveedor externo con consentimiento explícito (`externalProviderOptIn` y proveedores autorizados); cada envío queda en `lib/ai/externalEgressLedger.ts`.
* `lib/ai/orchestrator.ts`: `runLegalAI`, `runFastMode` y `runDeepReviewMode`.
* `lib/catalog/legalCatalog.ts`: catálogo único (278 tipos: 266 generables con evidencia funcional y 12 que requieren formato oficial o están restringidos). El estado PASS sale de la evidencia generada (`lib/catalog/writingTypeEvidence.generated.ts`), no de una lista. Ningún tipo tiene todavía `humanReview: APPROVED`.
* `lib/legal-taxonomy/`: taxonomía de materias y jurisdicciones.

## Requisitos

* Node.js ≥ 20 (≥ 22.5 para los scripts de respaldo `db:*`) y npm ≥ 10. Sin base de datos externa: los datos viven en SQLite local.

## Instalación

```powershell
Copy-Item .env.example .env
# Editar .env con tus valores (ver abajo)
npm ci
npm run db:generate
npm run db:migrate   # opcional: la base también se crea y migra sola al primer uso
npm run dev          # http://localhost:3200 (desarrollo)
```

Para uso diario en la PC del abogado, ejecuta la versión de producción (`npm run build` y luego `npm run start`): es mucho más rápida y consume menos memoria que `npm run dev`.

## Variables de entorno

| Variable | Valor | Notas |
|---|---|---|
| `LEXPLANTILLAS_DATABASE_PATH` | *(opcional)* | Ruta del SQLite; por defecto `%LOCALAPPDATA%\LexPlantillas\data\lexplantillas.db` |
| `NVIDIA_API_KEY` | `nvapi-…` | **Secreto**, no subir a Git |
| `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` |  |
| `NVIDIA_MODEL` | ver `.env.example` |  |
| `NVIDIA_PRIMARY_PROVIDER` | `true` | Pone NVIDIA al frente de la cadena |
| `AI_PROVIDER_CHAIN` | `nvidia,gemini,groq,local` | Orden de respaldo |
| `GEMINI_API_KEY` | `AIza…` | **Secreto**; opcional. `GEMINI_MODEL` por defecto `gemini-2.5-flash` |
| `GROQ_API_KEY` | `gsk_…` | **Secreto**; opcional. `GROQ_MODEL` opcional |
| `SECTION_AI_TIMEOUT_MS` | `30000` |  |
| `GENERATION_JOB_DEADLINE_MS` | *(opcional)* | Si no se define, el plazo se calcula según la meta de páginas |
| `DEMO_MODE_ENABLED` | `false` | Producción → 401 sin identidad |
| `ADMIN_TOKEN` | `<generar seguro>` | Nunca `dev-admin-token` en producción |
| `LIVE_PROVIDER_TESTS` | *(no definir)* | Solo para pruebas en vivo autorizadas (ver abajo) |

`.env.example` no contiene secretos reales.

## Pruebas y build

```powershell
npm run typecheck
npm run lint
npx vitest run --config vitest.offline.config.ts   # suite sin red ni proveedores (la recomendada)
npm run build
```

* **Pruebas en vivo aisladas.** Las pruebas que llaman a proveedores reales o leen documentos de `audit/` se saltan salvo con `LIVE_PROVIDER_TESTS=1` (`tests/helpers/liveProviderGate.ts`), y la configuración por defecto excluye `tests/e2e`, `tests/audit`, `tests/acceptance`, `tests/runtime`, `tests/browser` y los archivos `*Real*`, `*Live*` y `*Smoke*`. Activa la variable solo con autorización expresa y datos de prueba autorizados: esas pruebas pueden enviar documentos a proveedores externos.
* **Evidencia del catálogo** (regeneración deliberada, offline): `npx vitest run --config vitest.evidence.config.ts` reescribe `lib/catalog/writingTypeEvidence.generated.ts`. Úsala al agregar o cambiar un tipo de escrito.
* **Pruebas de navegador:** `npx playwright test` contra un servidor aislado; interceptan la generación y no usan proveedores reales.
* No dejes `npm run dev` corriendo durante `npm run build`.

## Privacidad y datos de clientes

* **El repositorio no contiene datos de clientes.** Nombres, expedientes, juzgados, montos y documentos reales están prohibidos en código, pruebas, fixtures, docs y scripts. `tests/security/noClientDataInRepo.test.ts` falla si aparecen. Las pruebas usan datos sintéticos (`ACTOR SINTÉTICO UNO`, `999/2099`).
* `audit/`, `test-results/`, `.env*`, `*.db`, `*.sqlite`, `*.zip`, `*.pem` y `*.key` están en `.gitignore`.
* El OCR en la nube está deshabilitado; el OCR es local (Tesseract).
* Los finales de línea están fijados en LF (`.gitattributes`).

## Seguridad

* `x-user-id`/`x-org-id` solo con `x-admin-token`/`Bearer ADMIN_TOKEN` y verificación en BD → 401.
* `organizationId` con alcance estricto en `legal-drafts`, `templates` y `parties`.
* Zod en `generate`, `parties` y `format`; el logger no registra claves (`nvapi-` → `[REDACTED]`).
* FINAL se autoriza en el servidor (`finalExportAuthorization.ts`) y el quality gate se recalcula al exportar. **Pendiente antes de aprobar cualquier tipo:** aprobación por documento registrada en el servidor (autor, fecha, hash del contenido).

## Exportación

DOCX y PDF conservan el contenido sustantivo del editor (prueba de paridad con edición manual). Con plantilla del abogado, el DOCX usa su molde. La exportación DRAFT está siempre disponible; FINAL requiere los gates y la aprobación humana.

## Guía del abogado (resumen)

1. Elige la pestaña según el trabajo: Universal para análisis, Escritos Iniciales para demandas, Contestaciones para responder o recurrir, Mis Plantillas para tus machotes.
2. En Contestaciones: carga el expediente, **confirma la ficha y elige a quién representas**, elige la extensión objetivo y genera. Para contestar agravios, carga también la apelación del contrario.
3. Para usar tu formato: «Usar mi plantilla (diseño y estructura)», revisa la vista previa de secciones y genera.
4. Puedes cambiar de pestaña o recargar durante «Generando…»: el trabajo se recupera. «Cancelar» deja el borrador como cancelado, nunca como completado.
5. Revisa el resultado de extensión («Objetivo: N · Resultado: M páginas»), el **anexo de revisión** y el aviso de fundamentos no verificados; edita en el editor paginado y exporta.

No se sube `.env`, no se registran claves y no se inventan citas ni datos del caso: lo que el escrito afirma sale de la ficha confirmada o de fuente verificada, y lo que no se puede verificar queda marcado.

## Datos locales

Expedientes, partes, borradores y preferencias se guardan en SQLite local, sin red. Detalles, protección, respaldo e importación: [docs/persistencia-local.md](docs/persistencia-local.md).

## Estado y pendientes

* Probado con redactor simulado y pruebas offline; **falta** una muestra controlada con la IA real y la revisión de un abogado antes de uso con clientes.
* Pendientes: aprobación por documento en el servidor, confianza OCR por página, vigencia de normas a la fecha del acto, fixtures para 23 tipos y migración del almacén de investigación a la base de datos.
