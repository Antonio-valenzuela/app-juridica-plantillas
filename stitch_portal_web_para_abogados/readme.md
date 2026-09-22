# APP-plantillas 1.0 — Sistema Jurídico Profesional

**APP-plantillas** es una aplicación jurídica profesional para abogados: generación, revisión, edición y exportación de escritos con IA NVIDIA como motor principal y fallback local determinístico.

## 4 Pestañas

* **Motor Universal** — `¿Qué necesitas hacer? [Analizar/Investigar/Redactar]` → Materia/Jurisdicción/Tipo (taxonomía centralizada, `Otro→Especifica` max80) → Pregunta → Fuentes → `Configuración avanzada` → Generar.
* **Escritos Iniciales** — Wizard 6 pasos (1.Qué presentar 2.Quién interviene 3.Qué ocurrió 4.Qué solicitas 5.Pruebas 6.Instrucciones) + progreso + `Siguiente/Generar`.
* **Contestaciones** — Flujo especializado 1:1 `PDF→extracción→análisis→selección fragmentos→aportaciones→generación→editor→export`.
* **Mis Plantillas** — Biblioteca `buscar/filtrar/preview variables {{}} / usar/guardar` + detección `{{nombre_abogado}}` etc.

## Arquitectura IA — NVIDIA ONLY

```
UI → /api/legal-engine/generate → runLegalAI() → providerChain(nvidia) → NVIDIA → local fallback
```

* `lib/ai/providerChain.ts` única fuente `nvidia,local`
* `lib/ai/orchestrator.ts` `runLegalAI/runFastMode(nvidia→local)` + `runDeepReviewMode(nvidia→local)`
* `lib/legal-engine/pipeline.ts` `SECTION_AI_TIMEOUT_MS=30000` async por bloque, `generationMetadata:{provider,model,generationId}` sin keys
* `lib/legal-taxonomy/` central (28 materias, 8 jurisdicciones, 31 tipos, `Otro` max80)

## Requisitos

* Node.js ≥20, npm ≥10, PostgreSQL (opcional, fallback InMemory)

## Instalación

```powershell
Copy-Item .env.example .env
# Editar .env con tus valores (ver abajo)
npm install
npm run db:generate
npm run dev      # http://localhost:3200
```

## Variables de Entorno (producción)

| Variable | Valor prod | Notas |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` | Requerido prod, fallback dev |
| `NVIDIA_API_KEY` | `nvapi-…` | **Secreto**, no subir a Git |
| `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` |  |
| `NVIDIA_MODEL` | `meta/llama-3.2-11b-vision-instruct` | Verificado 2026-08-28 |
| `NVIDIA_PRIMARY_PROVIDER` | `true` |  |
| `AI_PROVIDER_CHAIN` | `nvidia,local` |  |
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
npm test        # 33 suites 261 PASS 1 SKIPPED (nvidiaReal sin red)
npm run build   # 7/7 static
```

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
2. En `Otro` escribir valor personalizado (ej. `Derecho energético`).
3. Agregar perfil `+Agregar perfil` una vez, luego `Editar`.
4. `Generando…` global, puedes cambiar pestaña, volver, recargar → recupera job.
5. `Cancelar` → `Cancelado`.
6. Editar en editor paginado, `✓ Guardado`/`● Cambios`, exportar.

No se sube `.env`, no se loguean keys, no se inventan citas (ver `FUENTE/INFERENCIA/REDACCIÓN`).
