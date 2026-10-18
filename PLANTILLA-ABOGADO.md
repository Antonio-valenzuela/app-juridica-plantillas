# Plantilla del abogado: diseño exacto + datos nuevos + argumentos nuevos

Estado: **PROPUESTA — espera OK del abogado. No hay código modificado.**
Constitution leída: no se relajan gates (admisión por proposición, control fáctico, citas, DRAFT/FINAL); no se toca Prisma, proveedores, `functionalStatus` ni `humanReview`.

## 0. Hallazgos verificados

| Hallazgo | Evidencia |
|---|---|
| `personal_template` **no usa IA**: renderiza el texto de la plantilla y sustituye solo 8 variables (actor, promovente, quejoso, demandado, autoridad, juzgado, expediente, domicilio; `fecha: undefined`). Hechos, montos, pruebas y argumentos viejos pasan intactos. | `lib/legal-engine/pipeline.ts:3309-3355` (usa `renderPersonalTemplateText`, `personalTemplateBuilder.ts:377`) |
| `reference_document` / `useReferenceStructure`: solo toma estructura de secciones del texto; la IA redacta. Se desactiva para familias mercantil canónicas. | `documentPlan.ts:470-490`, `pipeline.ts:4485` |
| El **DOCX original del abogado sí se guarda en disco** al subirlo (`storage.filePath`, URL `/api/templates/files/<archivo>`), pero solo se extrae texto de PDF; del DOCX no se lee estilo. | `app/api/templates/custom/route.ts:252-300` |
| Existe `analyzePersonalTemplateText` que ya detecta secciones, variables y `removedData` (datos eliminados al parametrizar). Es la base del filtro anti-arrastre. | `lib/templates/personalTemplateBuilder.ts:260` |
| Exportación DOCX: `new Document` con un solo `section`, perfil de página genérico, header/footer de la app. PDF: renderer propio (`renderPdf`). Ninguno lee el diseño del abogado. | `exportDocxUniversal.ts:253-274`, `exportPdfUniversal.ts:668` |
| Dependencias ya presentes: `docx@9`, `mammoth`. **No hay JSZip/XML parser en `package.json`** (habrá que verificar si llega transitivo; si no, agregar una dependencia local, sin red). | `package.json:32-34` |

## 1. Puntos de entrada

| # | Entrada (UI) | Archivo:línea | Modo que usa hoy |
|---|---|---|---|
| E1 | **Mis Plantillas → «Usar plantilla»** | `TemplateLibraryManager.tsx:275`, `:369` → `page.tsx:1351 handleUseTemplate` (fija modo en `:1361`) | `personal_template` (workflow en `page.tsx:1476-1477`) |
| E2 | **Subir plantilla** (guardar como machote) | `SaveCustomTemplateModal.tsx:362` → `api/templates/custom/route.ts:236-300` (guarda archivo + texto) | Alta; luego E1 |
| E3 | **Modal generador de borradores** (elige plantilla ranqueada) | `WorkspaceDraftGeneratorModal.tsx:95-105,142`; abierto en `page.tsx:3691` | `personal_template` si hay plantilla; si no, `automatic` |
| E4 | **Contestaciones y Recursos** («Con mi plantilla») | `ContestacionesConfigPanel.tsx:61,97`; envío en `CaseDocumentsReader.tsx:712-713`; workflow `page.tsx:1842-1845` | `personal_template` (envía `referenceDocumentId/Text`) |
| E5 | **Escritos Iniciales / Universal** (generar desde documento existente) | `page.tsx:1341-1346 handleGenerateFromMachote` | `reference_document` (solo estructura) |
| E6 | Restauración de modo guardado | `page.tsx:2048` | cualquiera de los 3 |
| E7 | Subida de apoyo en el modal/lector (PDF/DOCX/imagen como *fuente del caso*, no plantilla) | `WorkspaceDraftGeneratorModal.tsx:267`, `page.tsx:3683` | n/a — **no** debe confundirse con plantilla |

Backend único de decisión: `caseWorkflow.ts:28-40 chooseGenerationSource`. Es el punto donde unificar.

## 2. Diseño propuesto

### 2a. Molde visual DOCX (local)
- **Extracción** (nuevo `lib/templates/docxMold.ts`, solo servidor, sin red): abrir el `.docx` guardado como ZIP y leer `word/styles.xml`, `numbering.xml`, `settings.xml`, `theme`, `fontTable`, `header*.xml`/`footer*.xml` + sus `_rels` y `media/*`, y el último `w:sectPr` (tamaño, márgenes, orientación, headers/footers referenciados, `titlePg`).
- **Generación**: copiar el paquete completo, **vaciar `w:body`** (conservando el `sectPr` final) e insertar los párrafos nuevos mapeados al **estilo de párrafo de la sección equivalente** de la plantilla (`w:pStyle`, `w:numPr`, sangrías vía su estilo; si el abogado usó formato directo en vez de estilos, se clona el `w:pPr` del párrafo modelo de esa sección). Run properties: se heredan del estilo; no se inyecta formato nuevo.
- Mapeo sección→estilo: cada sección detectada guarda `{ headingStyleId, bodyStyleId, pPr modelo }` capturado al analizar. Secciones nuevas sin equivalente usan el estilo del cuerpo dominante.
- Header/footer: se conservan tal cual (texto + imágenes). Si contienen datos del caso viejo (nombre, expediente), pasan por el filtro 2d y se sustituyen; si no se puede sustituir con seguridad → se **vacía ese campo y se avisa**.
- Si el DOCX es `.doc` o está corrupto/protegido → degrada a «aproximado» (abajo).

### 2b. PDF
- No se manipula el PDF del abogado. Se renderiza con `renderPdf` usando **perfil derivado del molde**: tamaño de página y márgenes del `sectPr`, fuente/tamaño/interlineado/sangría del estilo `Normal`/cuerpo.
- Fuentes: solo se igualan las que el renderer PDF pueda cargar (hoy fuentes estándar). Si la fuente del molde no está disponible → se sustituye por la más cercana y se **avisa explícitamente**.
- **No se puede igualar**: imágenes de membrete/logo en PDF (se omiten salvo que el renderer soporte imagen: se evaluará reutilizar la de `media/` del DOCX; si no, aviso), numeración compleja de Word, tablas anidadas, marcas de agua.
- Plantilla subida como **PDF o texto**: solo se infieren márgenes (por bounding box del texto, vía el extractor local ya usado) y tipografía dominante; texto plano → perfil por defecto. Siempre con el aviso: «Diseño aproximado: tu plantilla no es DOCX».

### 2c. Clasificación de contenido por sección
Se extiende `PersonalTemplateSection` con `kind: 'FORMULA' | 'SUSTANTIVA'` y `source: 'auto' | 'lawyer'`.

- **FÓRMULA** (se conserva el texto y se sustituyen datos): encabezado/rubro, proemio, comparecencia («Comparezco…»), personería, domicilio para notificaciones, cierre («PROTESTO LO NECESARIO»), lugar y fecha, firma, «Bajo protesta de decir verdad». Detección: título normalizado + palabras clave + posición (primera/última) + brevedad + alta repetición en `recurringFormulas`.
- **SUSTANTIVA** (IA redacta de nuevo con datos del caso nuevo, imitando estilo): hechos, prestaciones, agravios, excepciones y defensas, pruebas, derecho/fundamentos, puntos petitorios, conceptos de violación, antecedentes.
- Ambigua ⇒ **SUSTANTIVA** (más seguro: no arrastrar contenido viejo). El abogado puede cambiarla en la vista previa (paso 5).
- Las fórmulas se sustituyen con las 8 variables actuales + fecha. Si una fórmula contiene entidades viejas **no cubiertas por variable** → pasa por 2d (se bloquea o se marca `[DATO PENDIENTE]`, nunca se deja el dato viejo).
- Las SUSTANTIVAS se generan **por la ruta existente** (`generateSectionContent` normal, como `automatic` + `useReferenceStructure`), de modo que admisión jurídica, control fáctico, citas y DRAFT/FINAL aplican sin cambios. `styleHints` + `recurringFormulas` se pasan como guía de estilo (solo texto parametrizado, nunca el original).

### 2d. Filtro anti-arrastre
- **Origen de entidades viejas**: texto original de la plantilla (en servidor, ya guardado) → extractor determinista por reglas (reutilizar `removedData` de `analyzePersonalTemplateText` y extenderlo): nombres propios de personas/empresas (patrones de comparecencia, «C.», «actor», «demandado»), fechas, montos (`$`, «pesos»), expedientes (`\d+/\d{4}`, «amparo/juicio»), CURP/RFC/INE, domicilios (calle/número/colonia/CP), teléfonos/correos, números de prueba/anexo con su descripción, nombres de juzgado/autoridad del caso viejo.
- **Excepciones (allowlist)**: lo que el caso nuevo comparte legítimamente (misma autoridad, mismo abogado, mismo despacho, citas legales y artículos). Se calcula como `entidadesViejas − entidadesNuevas(caso)`; solo se bloquea lo exclusivo de la plantilla. Normas/artículos y jurisprudencia no se tratan como arrastre.
- **Comparación**: normalizada (sin acentos, mayúsculas, espacios, números a dígitos, montos 85,000 = 85000 = «ochenta y cinco mil»), con coincidencia aproximada para nombres (apellidos ≥4 letras).
- **Punto de aplicación**: sobre **cada bloque** del resultado antes de ensamblar/exportar, tanto fórmulas como sustantivas, y también header/footer del molde. Bloque con coincidencia ⇒ **bloqueado**, enviado al **anexo de revisión** con motivo «dato de la plantilla anterior» (+ qué dato y de qué sección), sin entrar al texto final. Es un gate adicional, estricto, que no afloja ninguno existente.
- Falsos positivos (p. ej. el actor nuevo se llama igual): lo resuelve la resta de entidades nuevas; el abogado puede liberar un bloque en la vista previa (queda registrado).

### 2e. Experiencia única y vista previa
- Una sola opción **«Usar mi plantilla (diseño y estructura)»** en E1, E3, E4, E5, con aviso: *Se conserva: diseño, estructura, títulos y fórmulas. Se reescribe: hechos, prestaciones, agravios, excepciones, pruebas, derecho y petitorios, con los datos de tu caso nuevo. No se copia ningún dato de la plantilla anterior.*
- Vista previa previa a generar: lista de secciones con etiqueta Fórmula/Reescribir editable + alertas de diseño aproximado. Un único componente reutilizado por las 4 entradas; `chooseGenerationSource` sigue siendo el punto de decisión (se unifica E5 `reference_document` a este flujo cuando la fuente es una plantilla del abogado).

### 2f. Privacidad
Todo el análisis y el molde se procesan **en local** (ZIP/XML en Node). Ninguna plantilla ni su diseño se envía a proveedores. Al IA solo llegan: estructura parametrizada, `styleHints` y fórmulas parametrizadas (sin datos viejos), igual que hoy en `reference_document`.

## 3. Plan de implementación (tras OK) — un commit por punto
1. **Filtro anti-arrastre** + tests (`Juan Pérez`, `345/2022`, `$85,000` no aparecen en el resultado; header/footer incluidos; allowlist de coincidencias legítimas).
2. **Clasificación FÓRMULA/SUSTANTIVA** + redacción nueva de sustantivas en `personal_template` (pipeline.ts:3309), reutilizando la ruta de generación.
3. **Molde DOCX** (+ perfil PDF aproximado) con plantillas **sintéticas** generadas en test (membrete, márgenes, estilos, numeración propios): el DOCX resultante conserva `sectPr`, `styles.xml`, header/footer; su texto es solo el nuevo.
4. **Experiencia única** en E1/E3/E4/E5.
5. **Vista previa** editable.
Cierre: `tsc`, suite **offline** (`vitest.offline.config.ts`, línea base 5.039 sin fallos nuevos), capturas del Word y PDF resultantes junto a la plantilla original. Sin IA real ni documentos de clientes (provider simulado).

## 4. Riesgos y lo que no se puede garantizar
- **Fidelidad total de Word**: se conserva el paquete, pero campos (`fldSimple`), controles de contenido, tablas complejas y numeración con reinicio pueden requerir ajuste; se prueba contra plantillas sintéticas, no contra cualquier .docx real.
- **PDF**: aproximado por definición. Sin membrete de imagen si el renderer no lo soporta; fuentes sustituidas se avisan.
- **Plantillas PDF/imagen/texto/.doc**: sin molde real; solo márgenes/tipografía inferidos.
- **Anti-arrastre**: determinista y conservador; puede bloquear de más (falso positivo → anexo) y no garantiza detectar un dato viejo parafraseado, ni una afirmación fáctica vieja sin entidad reconocible. Los hechos nuevos siguen sujetos al control fáctico existente.
- **Clasificación automática** puede errar secciones atípicas; mitigado con regla «ambigua = reescribir» y vista previa editable.
- **Datos en header/footer del molde** no sustituibles con seguridad se vacían (aviso).
- **Dependencia ZIP/XML**: si no existe transitiva, requiere añadir una librería local (decisión menor; se confirmará antes de instalar).
- **Alcance de paridad**: unificar E5 (`reference_document`) en el mismo flujo cambia el comportamiento de «Generar basado en este machote»; se hará sin tocar mercantil canónico (`documentPlan.ts:485-490`).
