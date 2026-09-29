# Fase 3 del motor profesional de redacción jurídica

> Ejecutar en el working tree existente. No crear rama, no hacer commit ni push y no iniciar empaquetado de Windows.

## Objetivo y límites

Mejorar la generación de contestaciones jurídicas mediante dos perfiles verificables (`PROFESSIONAL_20` y `EXTENSIVE_40`), planes y matrices trazables, desarrollo por pasadas con soporte real, medición de repetición y gates de revisión. Mantener Prisma y la persistencia actuales; el ZIP `C:\Users\yahir\Desktop\Datos.zip` es exclusivamente un banco E2E, con artefactos de prueba en `audit/professional-drafting-phase3/`, nunca datos permanentes ni productivos. La versión continúa siendo local y para un abogado individual. Diseñar límites internos que no impidan una futura ampliación; no crear cuentas, roles, equipos, facturación ni permisos multiusuario.

No usar los expedientes o hechos de los dos recursos de apelación de referencia. Usarlos únicamente para observar presentación y densidad profesional. No inventar hechos, posturas, pruebas, actos procesales, autoridades o peticiones; las posiciones del abogado que falten se consolidan como preguntas pendientes y conservan `NEEDS_REVIEW`/bloqueo de exportación final.

## Línea base observada antes del código

Se inspeccionaron visualmente los seis DOCX/PDF de Fase 2, sin modificarlos. PDF páginas: caso 01, 19; 02, 24; 03, 2; 04, 2; 05, 10; 06, 27. Los tres outputs largos repiten bloques o premisas entre páginas; los casos civiles/familiar 03/04 son escuetos y dejan respuestas y postura en etiquetas provisionales. La métrica inicial por `Document.paragraphs` no cubre texto alojado en tablas/estructuras, por lo que no debe usarse como métrica final. Los documentos de referencia fueron exportados a PDF de solo lectura mediante Microsoft Word, ya que `render_docx.py` informó que `soffice.exe` no está instalado; se registrará esta sustitución y se inspeccionarán las páginas rasterizadas.

## Diseño de aceptación

- `draftDepth` es un contrato enum validado, persistido dentro de metadata/traza existentes y propagado UI → API → pipeline → artefactos. Default compatible, explícito y visible; `PROFESSIONAL_20` y `EXTENSIVE_40` nunca son instrucciones de rellenar páginas.
- Resolver un perfil con intervalos objetivo aproximados 18–24 y 35–45 páginas, límites de llamadas/tokens y motivo de parada. La suficiencia probatoria, no el número, manda: al agotarse hechos, pruebas, autoridades verificadas y cobertura aprovechables, detener expansión y emitir `CONTENT_LIMIT_REACHED`; nunca alterar márgenes/tamaño para aparentar páginas.
- Construir `LegalDocumentPlan` y `FactResponseMatrix` desde el análisis ya persistido, `CoverageMatrix`/`LegalIssueMatrix` y sus IDs canónicos. Asignar cada cuestión/hecho/pretensión a una sola respuesta primaria y referencias relacionadas sin duplicar desarrollo.
- Generar paquetes de contexto por sección/cuestionamiento con hechos y evidencia enlazados, autoridad con procedencia/estado de verificación, argumento contrario solo si consta y conclusión procesal condicionada a hechos confirmados. Reusar la generación existente y sus timeouts, trazas, providers y recuperación; no debilitar gates de origen, cobertura, readiness ni exportación.
- Pasadas siguientes consumen únicamente requisitos pendientes y material de fuente aún no utilizado. Deduplicar exacta y semánticamente entre todo el documento, excluir copia extensa de la fuente y detener ante repetición, ausencia de soporte o proveedor no legal; reintentos/calls acotados y diagnóstico visible.
- Medir cada DOCX/PDF final: páginas y palabras reales; palabras sustantivas; razones de duplicación exacta/semántica y copia de fuente; placeholders/preguntas del abogado; autoridades verificadas/aplicadas; cobertura de hechos, pretensiones, prueba y secciones; incoherencias y errores de procedencia; calls/provider, duración, errores/correcciones y estado final.
- Exportar las 12 corridas completas (6 expedientes distintos × ambos perfiles) como 12 DOCX y 12 PDF en directorios por expediente/perfil. Registrar hash, origen, metadata, readiness y métricas. Visualizar páginas inicial, intermedia y final de los 24 artefactos. `CONTENT_LIMIT_REACHED` o `REVIEW_REQUIRED` son resultados informativos, no falsos “listo para presentar”.
- Regresión: typecheck, lint, suites enfocadas y flujo E2E actual; después build y suite completa si el entorno permite. Clasificar las 59 fallas históricas conocidas; corregir toda falla reproducible que impacte generación, grounding, edición, exportación o persistencia; no atribuir errores de proveedores/base remota a calidad verificada.
- Entregar `audit/professional-drafting-phase3/PHASE3_PROFESSIONAL_DRAFTING_REPORT.md`, `FINAL_LEGAL_READINESS_REPORT.md`, `.docx` y `.pdf`. El principal conserva detalle técnico, rutas, datos de prueba, comandos, tiempos, errores, fixes, resultados y evidencia; DOCX/PDF legibles preservan todos los hallazgos importantes.

## Secuencia de ejecución TDD

### 1. Registrar la línea base y reproducir defectos (RED)

- Capturar `git status --short`, versión de runtime/scripts y hashes/rutas de entradas y outputs existentes; dejar el ZIP fuera de Prisma y de rutas de datos permanentes.
- Añadir tests de perfil inválido/default/ambos targets; tests del plan/matriz sobre los seis análisis existentes; medidas de duplicación, placeholders, cobertura y procedencia; y un caso de soporte insuficiente que exija `CONTENT_LIMIT_REACHED`.
- Ejecutar los tests antes de código productivo. Incluir aserciones contra DRAFT 01–06 existentes: documentación/prosa repetida en 01/02/05/06 y respuesta somera en 03/04. Registrar conteos por el extractor completo, incluyendo tablas y celdas, no solamente párrafos del body.
- Guardar resultado RED con comando, duración, causa y salida resumida sin sobrescribir la evidencia Fase 2.

### 2. Definir el contrato de profundidad, plan y matriz

- Añadir tipos/resolvedor determinista de `draftDepth`, target bands, presupuesto de recursos y resultado/motivo de suficiencia.
- Construir `LegalDocumentPlan` desde secciones, coverage/issues canónicos y selección de documento actual; construir `FactResponseMatrix` con afirmación fuente, respuesta/posición conocida o pendiente, evidencia y regla/autoridad vinculada.
- Validar unicidad/relaciones, sin convertir inferencias o datos de documento de referencia en hechos. Agrupar preguntas pendientes del abogado una vez por tema y enlazarlas a las respuestas que bloquean.
- GREEN para las pruebas del contrato y las matrices; mantener compatibilidad con callers/Flujo A/B existentes.

### 3. Integrar pases profesionales con soporte y anti-repetición

- Encapsular contexto por tarea con límites que mantengan procedencia de hechos, prueba, autoridades y claims; respetar las entradas existentes (`caseAnalysis`, `CoverageMatrix`, `LegalIssueMatrix`, `SectionSourceManifest`, `GenerationTrace`).
- Sustituir la expansión por páginas como objetivo aislado por progresión sobre coverage/IDs/material no usado. Compartir deduplicación entre bloques/secciones, medir texto fuente copiado y evitar redistribuir el mismo contexto como fundamento de contenido nuevo.
- Implementar cierre explícito por falta de soporte, proveedor fallido/no jurídico, repetición, límites de recursos y cobertura completa; registrar causa en documento y traza. Ningún cierre convierte automáticamente un DRAFT en FINAL.
- Validar coherencia de hechos, cronología, nombres/roles/expediente, alcance de pretensiones, secciones y peticiones. Gate fail-closed ante contradicción o procedencia faltante.
- Añadir/ajustar pruebas RED-GREEN para continuación útil, duplicada, falta de fuente, timeout/fallback, límite, matriz incompleta, outputs largos y casos de poco soporte.

### 4. Propagar la selección sin romper la experiencia existente

- Añadir un selector claro de profundidad a la pantalla/modal existente, por defecto documentado y con explicación de que no garantiza páginas si el expediente no da soporte.
- Propagar/validar `draftDepth` por solicitud y trabajo asíncrono. Conservar en metadata/trace de Prisma existente; no añadir tablas o entidades multiusuario innecesarias.
- Presentar progreso por etapas, límites y estado manual-review/contenido insuficiente con texto comprensible; mantener cancelación, reintento idempotente y fallos de proveedor visibles.
- Probar en UI/API persistencia, reload, compatibilidad con documentos anteriores y fail-closed en campos manipulados.

### 5. Ejecutar 12 pruebas E2E y revisar artefactos

- Usar exactamente los seis expedientes ya seleccionados de Datos.zip, validando ID/hash y leyendo los documentos desde el árbol de auditoría; no escribir filas productivas. Mantener DB/fixtures E2E aislados si la ruta de aplicación necesita Prisma.
- Correr una vez por expediente en cada perfil, conservando log completo, request/response, traza, origen de proveedor, tiempo por fase, warnings, límites y hashes.
- Exportar DOCX y PDF reales mediante exportadores actuales. Extraer texto del DOCX completo/OOXML y del PDF final con herramientas disponibles; comprobar páginas/metadata/validez, placeholders raros, caracteres de control y páginas vacías.
- Revisar página 1, página media y página final de cada par DOCX/PDF; contrastar portada/encabezados, jerarquía, cuerpo legible, citas/listas, pies/numeración, firmas y cierre. No copiar la apariencia de la apelación si el tipo de escrito requiere otra estructura.
- Si una corrida reproduce repetición, error, fuente no trazable o formato defectuoso: añadir regresión, fix mínimo, repetir esa prueba y cualquier suite afectada; regenerar artefactos cambiados y evidencias visuales.

### 6. Regresión, reporte y decisión de readiness

- Ejecutar typecheck, lint enfocado/total, pruebas unitarias/de integración/browser aplicables, build y suite completa en ambiente determinista; separar fallas actuales de proveedor, cuota/base remota, OCR y supuestos históricos, usando evidencia fresca.
- Reconciliar manifiestos y matrices de métricas: 12 corridas, 24 archivos, hashes, cantidad de páginas reales, tamaños y tiempos; explicar faltantes o `CONTENT_LIMIT_REACHED` sin maquillar.
- Escribir primero reporte técnico Markdown con baseline, arquitectura, fixes, comandos PowerShell, seis fuentes anonimizadas por ID/hash, resultados completos, incidencias y límites. Convertir a DOCX y PDF, validar texto/páginas y revisar visualmente cada página del reporte; conservar todos los hallazgos.
- Cerrar con readiness veraz para revisión por el abogado individual y lista de hallazgos pendientes; no iniciar Windows, empaquetado o despliegue.

## Checklist de autocomprobación

- La secuencia cubre los 38 bloques de la especificación adjunta y sus 24 criterios de terminado: baseline, arquitectura, 2 profundidades, plan/matriz, agrupación de posiciones, pases, seguridad factual/jurídica, calidad, coherencia, editor/UI, Prisma, cobertura, exportaciones, 6×2 E2E, medición, evidencia visual, regresión, reportes y prohibición Windows.
- Los objetivos de página son bandas aproximadas subordinadas a soporte real; las pruebas no exigen rellenar o inventar contenido para alcanzarlas.
- `Datos.zip` y las muestras son inputs de prueba/referencia, no datos permanentes ni contenido fuente del escrito generado.
- Las rutas y nombres `draftDepth`, `LegalDocumentPlan`, `FactResponseMatrix`, `CONTENT_LIMIT_REACHED` y las rutas de reportes son consistentes en pruebas, metadata y documentación.
