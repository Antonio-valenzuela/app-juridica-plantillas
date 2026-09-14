# Diseño: Flujo A de contestación de documentos

Fecha: 2026-08-29  
Proyecto: APP-plantillas / Jurídico Radar  
Estado: aprobado por el usuario para planificación de implementación

## Objetivo y alcance

Completar el primer flujo jurídico de extremo a extremo:

`subir documento → extraer y validar → analizar → elegir modelo/referencia/automático → generar contestación → editar → exportar DOCX`

El alcance incluye PDF, DOCX, TXT, RTF e imágenes en los formatos que ya admite la aplicación, preservando el soporte por página y los estados de calidad. Incluye integración real entre análisis, generación, persistencia, editor y exportación. No incluye Electron/Tauri, sincronización cloud, RAG masivo, agentes autónomos, entrenamiento de modelos ni nuevos flujos independientes para escritos desde cero o conversión avanzada de plantillas.

## Reglas de producto

- Reutilizar módulos existentes; extender antes de crear.
- Mantener un solo motor de generación y un solo editor.
- Una plantilla o documento histórico aporta estructura, orden, fórmulas y estilo, nunca hechos privados del expediente anterior.
- Los hechos y datos del asunto nuevo deben proceder de fuentes cargadas, datos confirmados por el abogado o marcadores visibles como `[DATO PENDIENTE]`.
- Distinguir origen y confianza: fuente extraída, dato confirmado, inferencia, texto generado y estructura de plantilla.
- Todo resultado se presenta como `BORRADOR PARA REVISIÓN DEL ABOGADO`.
- Las ediciones manuales no se sobrescriben silenciosamente.

## Auditoría del estado existente

| Funcionalidad | Ya existe | Estado observado | Acción |
|---|---:|---|---|
| Subida PDF/DOCX/TXT/RTF/imagen | Sí | Ruta y UI admiten formatos y límite de 15 MB | Extender integración |
| Extracción por páginas | Sí | `extractDocument` conserva páginas, calidad, método y advertencias | Reutilizar |
| OCR | Sí | Proveedores configurables y estados de revisión | Extender verificación de producción |
| Partes, expediente, fechas, hechos, pruebas y peticiones | Sí | `reconstructCaseAnalysis` determinista, con cobertura heurística | Extender análisis visible y confianza |
| Índice y trazabilidad | Sí | `documentIndex`, páginas y referencias existen | Reutilizar; evitar truncamiento silencioso |
| Generación universal | Sí | `runGenerationPipeline` genera por secciones, con fallback y validación | Extender contrato de entrada/salida |
| Plantillas y documentos de referencia | Sí | Prisma, store, renderer y endpoints existen | Extender selección y aislamiento de datos |
| Perfil de estilo | Sí | `LawyerStyleProfile`, store y `styleEngine` existen | Reutilizar; conectar al modo elegido |
| Editor | Sí | Editor paginado, guardado y marca manual existen | Reutilizar |
| Chat localizado | Sí | Contrato atómico y mutador del documento existen | Reutilizar; verificar integración |
| Persistencia/reapertura | Sí | `LegalDraft` y rutas existentes tienen campos JSON suficientes | Extender cierre automático y reapertura |
| DOCX | Sí | Exportador universal y ruta existentes | Reutilizar; validar antes de entregar |
| PDF | Sí | Exportador existente | Mantener como secundaria |

El checkout no tiene historial Git utilizable ni `.codegraph` inicializado. El baseline ejecutado durante la auditoría fue TypeScript correcto y 326 tests correctos en 39 archivos; ESLint terminó con 0 errores y 593 warnings preexistentes, principalmente `any` explícitos y variables no usadas.

## Arquitectura propuesta

Se conservará `app/machotes/page.tsx` como coordinador de pantalla durante esta fase, pero la normalización del flujo se extraerá a funciones pequeñas y tipadas. El contrato lógico será un caso de contestación compuesto por:

- `sourceDocuments`: archivo, páginas, texto extraído, método, calidad, OCR, validación y advertencias.
- `caseAnalysis`: clasificación, partes, expediente, cronología, pretensiones, hechos, pruebas, fundamentos, peticiones, problemas, datos faltantes y referencias de página.
- `generationMode`: `personal_template`, `reference_document` o `automatic`.
- `templateId` o `referenceDocumentId`: origen estructural seleccionado, cuando aplique.
- `structuredDoc`: documento editable producido por el pipeline.
- `pipelineState`, `validationResults` y `generationMetadata`: ejecución, trazabilidad, proveedor, fallback y resultado.

El análisis se ejecutará una vez después de la extracción y se reutilizará para generar. La UI no reconstruirá un análisis paralelo. `runGenerationPipeline` seguirá siendo el único motor de redacción; el expediente entrante será `REFERENCE_ONLY` y no podrá convertirse directamente en secciones del nuevo escrito.

No se agregará un modelo Prisma inicialmente. Se usarán `LegalDraft.structuredDoc`, `sourceDocuments`, `pipelineState`, `validationResults`, `generationMetadata` y la relación existente con `LegalTemplate`. Solo se propondrá migración si una prueba de reapertura demuestra que esos campos son insuficientes.

## Experiencia del abogado

1. **Recibir documento**: subir uno o varios archivos y ver por archivo formato, páginas, método, calidad y estado (`VERIFICADA`, `REVISIÓN MANUAL`, `FALLÓ`).
2. **Revisar análisis**: consultar partes, expediente, pretensiones, hechos, pruebas, fundamentos, fechas, peticiones y faltantes; confirmar o corregir datos críticos.
3. **Elegir redacción**:
   - `Usar mi modelo`: plantilla personal.
   - `Usar documento de referencia`: escrito histórico.
   - `Generar estructura automática`: taxonomía y análisis del caso.
4. **Generar y revisar**: progreso real por sección, advertencia permanente de borrador y editor existente.
5. **Guardar y exportar**: autoguardado/reapertura y DOCX como acción principal.

## Seguridad y privacidad

- Validar identidad y `organizationId` en análisis, generación, borradores y plantillas.
- No aceptar identidad enviada por headers sin autorización válida.
- Mantener aislamiento por organización y autorización de borrador/plantilla.
- No devolver ni registrar secretos de proveedores.
- Validar extensión, MIME, tamaño y contenido antes de procesar.
- No usar datos no confirmados para reemplazar nombres, fechas, domicilios, cantidades, expedientes, hechos, pruebas o firmas.
- Conservar manualmente editado como capa de usuario verificada y protegerlo en regeneraciones.

## Estados y errores

- Fuente ilegible o sin OCR: `NEEDS_MANUAL_REVIEW`; generación bloqueada salvo confirmación explícita con advertencia.
- OCR no configurado: conservar páginas y advertencia, sin fabricar transcripción.
- Fallo de proveedor IA: fallback local marcado en metadatos y UI.
- Fallo de una sección: conservar el resto, marcar la sección y permitir reintento localizado.
- Fallo de persistencia: no indicar “guardado” y ofrecer reintento.
- Exportación: ejecutar validaciones existentes; bloquear errores críticos y mostrar advertencias no críticas.

## Criterios de aceptación

1. Documento PDF/DOCX válido: análisis visible con páginas, partes y expediente; contestación completa; DOCX válido.
2. Documento escaneado o de baja calidad: advertencia y bloqueo correcto.
3. Plantilla personal: estructura y estilo reutilizados sin arrastre de datos históricos.
4. Documento de referencia: orden y forma reutilizados sin copiar hechos privados.
5. Sin plantilla: contestación con estructura automática del tipo documental.
6. Edición manual de una sección: regenerar otra no la modifica.
7. Chat localizado: cambiar solo la sección solicitada y persistir el cambio.
8. Cerrar y reabrir: conservar análisis, fuentes, borrador y cambios.
9. Aislamiento de organización y autorización probados.
10. TypeScript, lint, tests y recorrido real de UI/exportación verificados; inspección del DOCX resultante.

## Fuera de alcance de esta fase

No se implementará empaquetado de escritorio, sincronización cloud, base vectorial masiva, monitor de disco, agentes autónomos, entrenamiento de modelos, colaboración entre despachos ni el flujo completo de escritos desde cero. Esos flujos deberán consumir posteriormente el mismo contrato y motor, no crear caminos paralelos.

