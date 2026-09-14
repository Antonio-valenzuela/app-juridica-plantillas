# RELEASE 1.0 — APP-plantillas

**Versión:** 1.0.0
**Fecha:** 2026-08-28
**Estado:** READY WITH CONDITIONS (single-node) / READY (multi-pod con Redis)

## NVIDIA

* **Provider:** `nvidia` único externo, `local` fallback determinístico
* **Modelo:** `meta/llama-3.2-11b-vision-instruct` (verificado 200 OK, EOL `meta/llama-3.1-8b-instruct` reemplazado; alternativo `deepseek-ai/deepseek-v4-flash-0731` timeout 32s no usado)
* **Endpoint:** `https://integrate.api.nvidia.com/v1/chat/completions`
* **Latencia:** `runLegalAI` 1-frase 8.2s, pipeline bloque 28s (30s timeout), 9 secciones ≈252s async
* **Fallback:** solo `nvidia→local`, registrado `fallbackReason`, no `gemini/groq/openrouter`

## PIPELINE REAL

* **Total secciones:** 9 (demanda_amparo_indirecto)
* **Con 15s:** 0 nvidia, 9 fallback (timeout 15s)
* **Con 30s:** 9 nvidia (estimado 252s) — verificado 1 bloque 28s PASS, 9 bloques async tolerado
* **Metadata:** `generationMetadata:{provider:nvidia, model:meta/llama-3.2-11b-vision-instruct, generationId:uuid, taxonomy:{matterCustom}}` sin key

## JOBSTORE

* **Single-node:** `InMemoryJobStore` (`globalThis`, TTL30m, MAX300) + `localStorage jr_active_gen_job` → sobrevive cambio pestaña/reload, se pierde al restart (log warn prod)
* **Multi-pod:** `REDIS_URL+USE_REDIS_JOBSTORE=true → RedisJobStore` requerido (abstracto listo, no instalado por falta de infra)

## SEGURIDAD

* `x-user-id/x-org-id` solo con `x-admin-token`/`Bearer` + DB check → 401, `DEMO_MODE_ENABLED=false` prod, `organizationId` scope estricto, 11 IDOR tests PASS

## LIMITACIONES CONOCIDAS

* InMemory no persistente multi-pod/restart
* `page.tsx` ~2700 líneas aún monolito (hooks extraídos)
* `router.ts` dead branches `gemini/groq/openrouter` no ejecutadas pero código presente (no runtime)
* Pipeline 9 secciones real no ejecutado sync completo en CI (solo 1 bloque real)

## REQUISITOS PRODUCCIÓN

* `DEMO_MODE_ENABLED=false`
* `ADMIN_TOKEN` seguro (no `dev-admin-token`)
* `NVIDIA_API_KEY` válida, `NVIDIA_BASE_URL`, `NVIDIA_MODEL`, `NVIDIA_PRIMARY_PROVIDER=true`, `AI_PROVIDER_CHAIN=nvidia,local`, `SECTION_AI_TIMEOUT_MS=30000`
* `REDIS_URL` para multi-pod
* No subir `.env`

## TESTS/BUILD

* `typecheck PASS`, `lint PASS`, `test 33 suites 261 PASS 1 SKIPPED`, `build PASS 7/7 static`
* `nvidiaReal` SKIPPED sin red (MOCK PASS 5/5)

## PROVIDERS ELIMINADOS

* `lib/ai/providers/gemini.ts`, `groq.ts`, `openrouter.ts`, `lib/ai/geminiProvider.ts` etc. borrados; `lib/ai/orchestrator.ts` ya no importa secundarios; `grep` runtime 0 en `app/`/`components`/`lib/legal-engine`.

## NO VALIDADO

* Pipeline 9 secciones real 252s completo (solo 1 bloque)
* Redis real
* Manual tablet/móvil + lector pantalla
* PDF impreso `Otro` 80
