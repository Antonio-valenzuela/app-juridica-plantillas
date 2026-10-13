# Extensión del escrito (meta de páginas)

La interfaz de «Contestaciones y recursos» ofrece **Breve ≈ 5 · Intermedio ≈ 10 · Detallado ≈ 20 · Extenso ≈ 40 · Personalizado** (entero de 2 a 60). Es una meta aproximada: **el sistema no añade contenido para llenar páginas**.

## Cómo viaja el parámetro

```
PageTargetSelector (UI)  →  CaseDocumentsReader  →  app/machotes/page.tsx  →  POST /api/legal-engine/generate
   {preset, pages}            (localStorage por           (body.pageTarget)        parsePageTarget() ⇒ 400 INVALID_PAGE_TARGET
                               expediente / sesión)                                            │
                                                                                               ▼
runGenerationPipeline({ pageTarget })  →  pageTargetToGenerationExtension()  →  presupuesto por sección
        │                                      (extended-legal, tolerancia ±15 %)   (secciones estructurales excluidas)
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

`pageTargetResult` registra `requestedPages`, `actualPages` (**medido sobre el PDF renderizado**, no estimado), `outcome` (`MET`, `BELOW_TARGET`, `ABOVE_TARGET`) y, si no se alcanzó, el aviso: «No se alcanzó la extensión solicitada… la información, la evidencia y las reglas disponibles no sostienen más contenido sin redundancia. No se añadió texto de relleno.» También se registra `redundancyRatio`; por encima de **3 %** de párrafos casi idénticos (similitud de n-gramas ≥ 0,85) se emite el aviso `REDUNDANCY_THRESHOLD_EXCEEDED`. La higiene final elimina duplicados exactos y casi duplicados (≥ 0,92).

## DOCX

Word/LibreOffice no están instalados en el entorno de desarrollo, por lo que las páginas del DOCX no se pueden medir sin conexión. `estimateDocxPages` las **estima** desde el PDF según la relación de área útil de los perfiles de página (el DOCX usa margen izquierdo de 1,2″). Debe leerse como estimación, no como medición.
