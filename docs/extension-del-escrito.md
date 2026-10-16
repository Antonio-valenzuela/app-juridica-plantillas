# Extensión del escrito (meta de páginas)

La interfaz ofrece **Breve 5 · Intermedio 10 · Detallado 20 · Extenso 40 · Personalizado** (entero de 2 a 60) para **todos los tipos de escrito del catálogo** (demandas, contestaciones, recursos, promociones y plantillas derivadas). Es un **objetivo de generación, no un máximo** (cambio de contrato del 2026-10-16; del 2026-10-14 a esa fecha funcionó como techo, y por eso una selección de 40 páginas terminaba en ≈ 8): el motor planifica las secciones con la meta, redacta, **mide el PDF renderizado** y **amplía las secciones pertinentes con análisis respaldado** hasta alcanzarla.

La ampliación nunca rellena: cada bloque nuevo pasa por la admisión jurídica por proposición (`evaluateGeneratedLegalAdmission`), por la deduplicación contra todo el documento y por la higiene final. Si el material no sostiene más contenido, el resultado es **`BELOW_TARGET`** con el motivo (`contentStopReason`) y lo que haría falta. Alcanzar las páginas **no** valida jurídicamente el escrito: FINAL sigue dependiendo de la revisión humana y de los gates.

## Cómo viaja el parámetro

```
PageTargetSelector (UI)  →  CaseDocumentsReader  →  app/machotes/page.tsx  →  POST /api/legal-engine/generate
   {preset, pages}            (localStorage por           (body.pageTarget)        parsePageTarget() ⇒ 400 INVALID_PAGE_TARGET
                               expediente / sesión)                                            │
                                                                                               ▼
runGenerationPipeline({ pageTarget })  →  pageTargetToGenerationExtension()  →  presupuesto por sección  →  prompt «extensión objetivo»
        │                              (minPages = meta, maxPages = meta + 15 %)   (secciones estructurales excluidas)
        ▼
expandDocumentToPageTarget(): mide el PDF → amplía (1º cobertura pendiente respaldada; 2º secciones sustantivas por enfoque)
        │                        → reintento único si la higiene final retiró texto y quedó por debajo
        ▼
borrador.generationMetadata.pageTarget (lo pedido) + pageTargetResult (lo medido) → «Objetivo: N páginas · Resultado: M páginas»
```

- Módulo único: `lib/legal-engine/pageTarget.ts` (presets, rango, validación, conversión, evaluación del resultado).
- El servidor **siempre** vuelve a validar la meta; un valor manipulado devuelve 400 antes de iniciar la generación.
- La meta forma parte de la huella de la generación: dos metas distintas del mismo caso no se deduplican como un solo trabajo.
- `draftDepth` (Profesional/Extensa) sigue aceptándose en la API por compatibilidad, pero la interfaz ya no lo envía.

## Por qué 2–60

Una página no admite proemio, cuerpo y petitorios con legibilidad. Por encima de 40 páginas el motor no puede sostener el contenido sin redundancia con una sola fuente, y cada página adicional multiplica las llamadas al proveedor (tope de 100 por documento).

## Presupuesto por sección

`allocateSectionBudgets(..., { discretionaryOnly: true })` reparte las palabras objetivo **solo entre secciones discrecionales** (excepciones, objeción y pruebas, derecho, agravios…). Las secciones estructurales —proemio, comparecencia, firma, petitorios y, en contestaciones, la respuesta individual a cada hecho y prestación— no reciben presupuesto y su tamaño ya ocupado se descuenta de la meta. Antes el presupuesto se repartía también entre ellas, que nunca lo consumen: una meta de 40 páginas terminaba en ≈ 20.

Factor de conversión: **340 palabras por página** renderizada (medido con el generador PDF del proyecto; los perfiles heredados asumían 500).

## Piso estructural

Una contestación responde cada hecho y cada prestación individualmente. Ese contenido obligatorio fija un mínimo de páginas que ninguna meta puede reducir (p. ej. 4 hechos + 2 prestaciones ≈ 7 páginas). Si la meta es menor, el resultado se marca **ABOVE_TARGET** con el aviso «incluye la estructura obligatoria del escrito… No se omitió ninguna respuesta ni sección».

## Resultado y honestidad

`pageTargetResult` registra `requestedPages`, `actualPages` (**medido sobre el PDF renderizado**, no estimado), `outcome` (`MET` si el PDF alcanza la meta sin rebasar +15 %, `BELOW_TARGET`, `ABOVE_TARGET`), `stopReason` y, si no se alcanzó, el aviso `PAGE_TARGET_UNMET`: «No se alcanzó la extensión solicitada (N páginas; resultado: M). Motivo: … No se añadió texto de relleno… hace falta más material: documentos fuente adicionales, la postura del abogado o fuentes jurídicas oficiales verificadas.» Un fallo del proveedor, una respuesta truncada o el agotamiento del presupuesto se registran como `PROVIDER_UNAVAILABLE` / `RESOURCE_LIMIT` y **nunca** como meta cumplida. También se registra `redundancyRatio`; por encima de **3 %** de párrafos casi idénticos (similitud de n-gramas ≥ 0,85) se emite el aviso `REDUNDANCY_THRESHOLD_EXCEEDED`. La higiene final elimina duplicados exactos y casi duplicados (≥ 0,92).

## DOCX

Word/LibreOffice no están instalados en el entorno de desarrollo, por lo que las páginas del DOCX no se pueden medir sin conexión. `estimateDocxPages` las **estima** desde el PDF según la relación de área útil de los perfiles de página (el DOCX usa margen izquierdo de 1,2″). Debe leerse como estimación, no como medición.
