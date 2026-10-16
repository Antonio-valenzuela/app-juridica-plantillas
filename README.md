# APP-plantillas 1.0 — Sistema Jurídico Profesional

**APP-plantillas** es una aplicación jurídica profesional para abogados: generación, revisión, edición y exportación de escritos jurídicos. La redacción usa los proveedores de IA configurados (solo con consentimiento expreso del abogado para enviar el expediente) y un respaldo local determinístico.

## 4 Pestañas

* **Motor Universal** — `¿Qué necesitas hacer? [Analizar/Investigar/Redactar]` → Materia/Jurisdicción/Tipo (taxonomía centralizada, `Otro→Especifica` max80) → Pregunta → Fuentes → `Configuración avanzada` → Generar.
* **Escritos Iniciales** — Wizard 6 pasos (1.Qué presentar 2.Quién interviene 3.Qué ocurrió 4.Qué solicitas 5.Pruebas 6.Instrucciones) + progreso + `Siguiente/Generar`.
* **Contestaciones** — Flujo especializado `PDF→extracción→ficha del caso→análisis→generación→editor→export`. Incluye contestaciones de demanda, apelaciones, recursos y la **contestación de agravios** (parte apelada).
* **Mis Plantillas** — Biblioteca `buscar/filtrar/preview variables {{}} / usar/guardar` + detección `{{nombre_abogado}}` etc.

## Cómo se redacta un escrito

Para todos los tipos de escrito el flujo es el mismo:

1. **Ficha del caso.** Antes de redactar se extrae del expediente: órgano jurisdiccional, lugar, número de expediente, partes con su rol, resolución impugnada, notificaciones y, si existen, agravios numerados. El abogado la revisa, la corrige y **elige a quién representa** (nunca se infiere). Sin ficha confirmada no se genera. El redactor solo puede usar datos de la ficha (`lib/legal-engine/caseDossier.ts`, `app/machotes/components/CaseDossierPanel.tsx`).
2. **Contrato del tipo** (`lib/legal-engine/writingContract.ts`). Cada tipo declara quién firma (actor, demandado, apelante, apelado, quejoso, tercero…), el documento fuente obligatorio, las secciones fijas en orden y lo que no debe contener. Si falta la fuente (p. ej. la apelación del contrario) el sistema la pide en lugar de inventar agravios.
3. **Contestación de agravios** (`contestacion_agravios`). Un bloque por agravio (infundado, inoperante o inatendible) apoyado en la sentencia y en constancias del expediente; solicita confirmar la sentencia.
4. **Extensión máxima.** La extensión elegida (5/10/20/40/personalizada) es un tope, no una meta: si el material no alcanza, el escrito es más corto y no se regeneran secciones para rellenar (ver [docs/extension-del-escrito.md](docs/extension-del-escrito.md)).
5. **Validador posterior** (`writingContractValidator.ts`). Falla y regenera si detecta encabezados repetidos, firma incoherente con el rol, demasiados marcadores, fecha o lugar ajenos a la ficha, o texto que defiende la postura contraria.
6. **Anexo de revisión.** El cuerpo del escrito no lleva meta-texto ni marcadores de verificación. Las notas, los riesgos y las citas no verificadas (que se omiten del cuerpo) se listan en un anexo para el abogado, fuera del escrito (`reviewAnnex.ts`, `ReviewAnnexPanel.tsx`). Nunca se citan tesis, artículos ni órganos que no estén en fuente verificada.
7. **Fecha y lugar.** El lugar sale del órgano en la ficha; la fecha, si no consta, queda en blanco solo en el cierre.

El borrador sale marcado como DRAFT; FINAL sigue bloqueado por los gates de calidad, cobertura, autoridad y aprobación humana.

## Arquitectura IA

```
UI → /api/legal-engine/generate → pipeline → runLegalAI() → providerChain → proveedor(es) autorizados → respaldo local
```

* `lib/ai/providerChain.ts` única fuente del orden de proveedores (`AI_PROVIDER_CHAIN`; `.env.example` trae `nvidia,gemini,groq,local`). Acepta `gemini`, `groq`, `nvidia` y `local`.
* **Respaldo en cadena:** `lib/ai/providerRouter.ts` prueba los proveedores en orden. Si uno no tiene clave, no responde o falla, pasa al siguiente (NVIDIA → Gemini → Groq); `local` determinístico es siempre el último recurso. Solo se consideran los proveedores con clave y que el abogado autorizó.
* El expediente solo se envía a un proveedor externo con consentimiento explícito del abogado (`externalProviderOptIn` y proveedores autorizados); cada envío queda en un registro (`lib/ai/externalEgressLedger.ts`).
* `lib/ai/orchestrator.ts` `runLegalAI/runFastMode` + `runDeepReviewMode`
* `lib/legal-engine/pipeline.ts` `SECTION_AI_TIMEOUT_MS=30000` async por bloque, `generationMetadata:{provider,model,generationId}` sin keys
* `lib/catalog/legalCatalog.ts` catálogo único de tipos (278 tipos: 266 generables con evidencia funcional y 12 que requieren formato oficial o están restringidos). El estado PASS sale de la evidencia generada (`lib/catalog/writingTypeEvidence.generated.ts`), no de una lista.
* `lib/legal-taxonomy/` taxonomía de materias y jurisdicciones (`Otro` max80)

## Requisitos

* Node.js ≥20 (≥22.5 para los scripts de respaldo `db:*`), npm ≥10. Sin base de datos externa: los datos viven en SQLite local

## Instalación

```powershell
Copy-Item .env.example .env
# Editar .env con tus valores (ver abajo)
npm install
npm run db:generate
npm run db:migrate   # opcional: la base también se crea y migra sola al primer uso
npm run dev      # http://localhost:3200
```

## Variables de Entorno (producción)

| Variable | Valor prod | Notas |
|---|---|---|
| `LEXPLANTILLAS_DATABASE_PATH` | *(opcional)* | Ruta del archivo SQLite; por defecto `%LOCALAPPDATA%\LexPlantillas\data\lexplantillas.db` |
| `NVIDIA_API_KEY` | `nvapi-…` | **Secreto**, no subir a Git |
| `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` |  |
| `NVIDIA_MODEL` | `nvidia/nemotron-3-super-120b-a12b` | Valor de `.env.example` |
| `NVIDIA_PRIMARY_PROVIDER` | `true` | Pone NVIDIA al frente de la cadena |
| `AI_PROVIDER_CHAIN` | `nvidia,gemini,groq,local` | Orden de respaldo; si falla uno, pasa al siguiente |
| `GEMINI_API_KEY` | `AIza…` | **Secreto**; opcional (respaldo). `GEMINI_MODEL` por defecto `gemini-2.5-flash` |
| `GROQ_API_KEY` | `gsk_…` | **Secreto**; opcional (respaldo). `GROQ_MODEL` opcional |
| `SECTION_AI_TIMEOUT_MS` | `30000` |  |
| `DEMO_MODE_ENABLED` | `false` | prod → 401 sin identidad |
| `ADMIN_TOKEN` | `<generar seguro>` | No `dev-admin-token` en prod |
| `REDIS_URL` | `redis://...` | Requerido multi-pod, opcional single-node |
| `USE_REDIS_JOBSTORE` | `true` | con Redis |

`.env.example` no contiene secretos reales; `ADMIN_TOKEN` queda vacío y los valores inseguros de desarrollo están deshabilitados por defecto.

## Pruebas y Build

```powershell
npm run typecheck
npm run lint
npx vitest run --config vitest.offline.config.ts   # suite sin red ni proveedores de IA (la recomendada)
npm run build
```

* **No uses `npm test` con claves de proveedores en `.env`:** `vitest run` incluye pruebas en vivo que envían documentos a los proveedores. Usa siempre la configuración offline.
* **Evidencia del catálogo** (regeneración deliberada, offline): `npx vitest run --config vitest.evidence.config.ts` reescribe `lib/catalog/writingTypeEvidence.generated.ts`. Úsala al agregar o cambiar un tipo de escrito.
* No dejes `npm run dev` corriendo durante `npm run build`.

## Single-node vs Multi-pod

* **Single-node:** `InMemoryJobStore` (`globalThis`, TTL30m) + `localStorage` → sobrevive cambio pestaña/reload, se pierde al restart.
* **Multi-pod:** `REDIS_URL + USE_REDIS_JOBSTORE=true → RedisJobStore` requerido, log `Implementación activa: Redis`.

## Seguridad

* `x-user-id/x-org-id` solo con `x-admin-token`/`Bearer ADMIN_TOKEN` + verificación DB → 401
* `organizationId` scope estricto en `legal-drafts/templates/parties`
* Zod en `generate/parties/format`, logger sin keys (`nvapi-`→`[REDACTED]`)

## Exportación

DOCX/PDF conservan formato/márgenes/encabezados/numeración/`Otro` custom. Ver `tests/templates/export*`.

## Guía Abogado (resumen)

1. Elegir pestaña según trabajo (Universal para análisis, Inicial para demanda, Contestaciones para PDF, Plantillas para machote).
   En Contestaciones: cargar el expediente, **confirmar la ficha y elegir a quién representas**, elegir la extensión máxima y generar. Para contestar agravios, cargar también la apelación del contrario.
2. En `Otro` escribir valor personalizado (ej. `Derecho energético`).
3. Agregar perfil `+Agregar perfil` una vez, luego `Editar`.
4. `Generando…` global, puedes cambiar pestaña, volver, recargar → recupera job.
5. `Cancelar` → `Cancelado`.
6. Editar en editor paginado, `✓ Guardado`/`● Cambios`, revisar el **anexo de revisión** (fuera del escrito) y exportar.

No se sube `.env`, no se loguean keys, no se inventan citas ni datos del caso: todo lo que el escrito afirma sale de la ficha confirmada o de fuente verificada.

## Datos locales

Expedientes, partes, borradores y preferencias se guardan en SQLite local (sin Neon ni red). Detalles, protección real, respaldo e importación: [docs/persistencia-local.md](docs/persistencia-local.md).
