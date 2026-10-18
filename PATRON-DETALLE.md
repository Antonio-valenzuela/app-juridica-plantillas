# Patrón de detalle — Paso 1: inventario (sin cambios de código)

Recorrido automatizado (Playwright + Chrome, 1440×900) contra `localhost:3200` en solo lectura: toda petición no-GET y las rutas de generación/proveedores/IA se interceptaron con 405. Capturas en `audit/patron-detalle/` (`<Pestaña>.png` = estado inicial, `<Pestaña>__<Botón>.png` = tras el clic). Los botones que solo aparecen con datos (resultados de búsqueda, documento cargado, modo escritorio) se completaron leyendo el código.

Pestañas encontradas en la barra lateral: **12** (Inicio, Motor Jurídico, Escritos Iniciales, Contestaciones, Mis Plantillas, Expedientes, Cómputo de Términos, Jurisprudencia SCJN, Biblioteca, Alertas DOF y Boletín, Configuración, Ayuda). La 13.ª superficie global es el botón flotante ⚖️ (Asistente Legal), presente en todas. Si cuentas otra pestaña, indícala.

## Inventario

| Pestaña | Botón | Dónde aparece hoy | Patrón que le toca | Fuente |
|---|---|---|---|---|
| Todas | ⚖️ Asistente Legal | Panel `role=dialog` fijo, abajo a la derecha, con fondo | ✅ ya es overlay (revisar Esc/foco en Paso 2) | captura `*___.png` |
| Expedientes | **Abrir ficha** | «FICHA PERSISTIDA» **al final de la tabla** (y≈1122 px, fuera de vista; clic en y≈400) | **Drawer** | `WorkspaceModulesView.tsx:301`, `Expedientes__Abrir_ficha.png` |
| Expedientes (escritorio) | Nuevo expediente local / Editar expediente y asociar documentos | Formulario inline arriba de la tabla | **Drawer** | `DesktopWorkspaceManagers.tsx:42-45` |
| Cómputo de Términos (escritorio) | Editar evento | Formulario encima de la lista de eventos | **Drawer** | `DesktopWorkspaceManagers.tsx:78,86` |
| Cómputo de Términos | Agregar suspensión | Fila de campos inline en el formulario | ✅ inline correcto | `C_mputo...Agregar_suspensi_n.png` |
| Mis Plantillas | Vista previa (miniatura) | Modal centrado propio (`bg-black/50`) — **3.er estilo de modal** | **Drawer** (detalle de plantilla) | `TemplateLibraryManager.tsx:255,322` |
| Mis Plantillas | Editar plantilla | Abre el editor (navega de vista) | Sin cambio (es una vista completa) | `TemplateLibraryManager.tsx:275` |
| Mis Plantillas | Crear Machote / Plantilla | Modal `role=dialog` a pantalla completa | **Modal** con estilo `lex-modal` | `Mis_Plantillas__Crear_Machote_Plantilla.png` |
| Mis Plantillas | + Agregar perfil | Tarjeta de perfil en su sitio (arriba) | ✅ inline correcto | `Mis_Plantillas___Agregar_perfil.png` |
| Contestaciones | Opciones de redacción | Modal `lex-modal` centrado | ✅ **referencia de estilo** | `ContestacionesConfigPanel.tsx:238` |
| Contestaciones | Ver hechos y prestaciones | `<details>` inline en la tarjeta | ✅ inline correcto | `ContestacionesAnalysisPanel.tsx:84` |
| Contestaciones | Editar Respuesta | Abre el editor | Sin cambio (vista completa) | `ContestacionesView.tsx:231` |
| Motor Jurídico / Contestaciones | Expediente del caso (dossier) | Bloque inline al final del lector de documentos | **Drawer** | `CaseDocumentsReader.tsx:1099` |
| Editor (desde varias pestañas) | Revisión / Pendientes | Modales centrados propios (`bg-slate-900/40`) | **Modal** con estilo `lex-modal` | `WorkspaceDocumentEditor.tsx:1276,1321` |
| Barra de generación | Ver detalle (error) | `<details>` inline en la barra | ✅ inline correcto | `GenerationStatusBar.tsx:107` |
| Escritos Iniciales | Detalles técnicos / borradores no certificados | Inline bajo el aviso | ✅ inline correcto | `WritingAvailabilityNotice.tsx:72,106,111` |
| Jurisprudencia SCJN | Abrir fuente consultada / oficial → | Enlace externo (pestaña nueva) | Sin cambio | `WorkspaceModulesView.tsx:122,139` |
| Alertas DOF y Boletín | Abrir publicación oficial → | Enlace externo | Sin cambio | `WorkspaceModulesView.tsx:234,246` |
| Biblioteca | Mostrar más (277 restantes) | Añade tarjetas justo debajo | ✅ correcto (paginación) | `Biblioteca__Mostrar_m_s...png` |
| Configuración | Ver documento (guía operativa) | Enlace a PDF en pestaña nueva | Sin cambio | `WorkspaceModulesView.tsx:157,165` |
| Inicio, Ayuda | Accesos a módulos | Navegan de pestaña | Sin cambio | — |

**A migrar en el Paso 2:** drawer → Abrir ficha, editar/crear expediente local, editar evento, vista previa de plantilla, dossier del caso; modal `lex-modal` → Crear Machote, modales de revisión/pendientes del editor. Verificar Esc/foco en el Asistente ⚖️.

## Expedientes duplicados

Son **borradores distintos** (IDs distintos), no filas duplicadas en la base. Hoy la API devuelve 5 con `800/2024` (la tabla muestra 3 en la primera pantalla) y 2 con `1152/2013`:

| Título | ID | Creado (UTC) |
|---|---|---|
| Recurso de Revisión en Amparo Directo - 16/10/2026 | `cmvbuxfm2004ij8zkw0dm0syn` | 2026-10-17 03:48:58 |
| Recurso de Revisión en Amparo Directo - 16/10/2026 | `cmvbuvvi2004ej8zky78lmutt` | 2026-10-17 03:47:46 |
| Recurso de Revisión en Amparo Directo - 14/10/2026 | `cmv8b3nfv004pj8dgm9smlbdq` | 2026-10-14 16:10:38 |
| Recurso de Revisión en Amparo Directo - 14/10/2026 | `cmv8acqte0024j8dgr4us6mph` | 2026-10-14 15:49:42 |
| Recurso de Revisión en Amparo Directo - 14/10/2026 | `cmv8ac7h80020j8dgqxw4hfe7` | 2026-10-14 15:49:17 |
| recurso de apelación civil - 14/10/2026 | `cmv7ei480002wj8wkvlcnog5m` | 2026-10-14 00:58:05 |
| recurso de apelación civil - 14/10/2026 | `cmv7ehn5f002uj8wktrmoubcp` | 2026-10-14 00:57:43 |

**Origen:** cada ejecución de generación crea un `LegalDraft` nuevo (`saveGenerationArtifact` → `prisma.legalDraft.create`, `lib/legal-engine/generationPersistence.ts:218`) con el mismo documento fuente (mismo expediente, partes y `sourceCount`). Los pares creados con 20 s–2 min de diferencia corresponden a regeneraciones/reintentos sobre la misma fuente durante las pruebas. No se borró nada.

---

# Paso 2 — Plan de migración (aprobado; ver «Resultado» al final)

## 1. Qué es la migración

| Origen | Destino | Qué cambia |
|---|---|---|
| Bloque condicional en el flujo (`{selected && <div className="mt-4 …">}`) al final de la lista/tabla | **Drawer** lateral derecho (`DetailDrawer`, nuevo): portal, fondo atenuado, `role="dialog"`, `aria-modal`, `aria-labelledby`, Esc, clic fuera, foco atrapado y devuelto | Markup y CSS, más un `ref` al botón que abre el drawer para devolverle el foco. |
| Modales propios (`fixed inset-0 bg-black/50 …`, `bg-slate-900/40 …`) | **Modal** con las clases `lex-modal-backdrop` / `lex-modal` / `lex-modal-header` de «Opciones de redacción» (`ContestacionesConfigPanel.tsx:232-240`, `globals.css:6464+`) | Solo clases y estructura del contenedor. Se suman Esc y foco donde falten. |

**No cambia:** el estado ni su forma (`selected`, `previewTemplate`, `editing`, `showReviewModal`… quedan iguales), los handlers (`selectCase`, `closeCase`, `onOpenCase`, `save`), las rutas `/api/*`, los fetch, los datos, los textos, los `data-testid`, `functionalStatus` y `humanReview`. Fuera de alcance: `lib/legal-engine`, `app/api`, `lib/catalog`, `prisma/` y `package.json`.

## 2. Archivos por pestaña

| Lote | Pestaña | Archivos | Compartido |
|---|---|---|---|
| 0 | (base) | `app/machotes/components/DetailDrawer.tsx` (nuevo), `app/globals.css` (bloque `.lex-drawer*` añadido al final), `tests/components/detailDrawer.test.tsx` (nuevo) | `DetailDrawer` y `globals.css` los usan todas las pestañas |
| 1 · **piloto** | Expedientes («Abrir ficha») | `WorkspaceModulesView.tsx` (solo la función de Expedientes, l.~258-301) | ⚠ `WorkspaceModulesView.tsx` también contiene Inicio, Jurisprudencia, Biblioteca, Alertas, Cómputo, Configuración y Ayuda; el diff se limita a esa función |
| 2 | Expedientes y Cómputo (modo escritorio) | `DesktopWorkspaceManagers.tsx` | Usado por Expedientes y por Cómputo de Términos |
| 3 | Mis Plantillas | `TemplateLibraryManager.tsx` (vista previa → drawer; «Crear Machote» → `lex-modal`; hay que ubicar este modal, probablemente en `page.tsx`) | Posible `page.tsx` (compartido por todas) |
| 4 | Motor Jurídico / Contestaciones (dossier y «Confirmar ficha del caso») | `CaseDocumentsReader.tsx`, posiblemente `CaseDossierPanel.tsx` solo como contenido | Lector compartido por Motor Jurídico, Escritos Iniciales y Contestaciones |
| 5 | Editor (revisión, pendientes, exportación) | `WorkspaceDocumentEditor.tsx` (l.1276, 1321) | Editor compartido por todas las pestañas que generan |
| 6 | Diálogos globales | `ExternalProviderConsentDialog.tsx`, `WorkspaceDraftGeneratorModal.tsx` → clases `lex-modal` | Globales |

## 3. Controles que el primer inventario no incluyó

El recorrido automático solo encontraba botones visibles sin datos ni documento cargado y con mutaciones bloqueadas, y además filtraba por palabras clave (Ver/Abrir/Editar/Detalle). Faltaron:

| Control | Ubicación | Hoy | Propuesta |
|---|---|---|---|
| Generar contestación / apelación / escrito / recurso | `CaseDocumentsReader.tsx:561-564`, `ContestacionesView.tsx:781,801`, `page.tsx:3063,3269,3472`, `InicioView.tsx:108` | Acción; abre el consentimiento (`ExternalProviderConsentDialog`) y la barra de estado | Sin cambio de flujo; el consentimiento pasa al estilo `lex-modal` (lote 6) |
| Diálogo de consentimiento a proveedor externo | `ExternalProviderConsentDialog.tsx:87` | Modal propio `fixed inset-0 bg-slate-900/50` | Modal `lex-modal` |
| Generador «Generar Contestación o Recurso» | `WorkspaceDraftGeneratorModal.tsx:189` | Modal propio | Modal `lex-modal` |
| Generar con Machote | `WorkspaceDocumentEditor.tsx:761`, `page.tsx:1342,1739` | Acción en el editor | Sin cambio |
| Exportar ▸ (borrador / final, DOCX y PDF) | `WorkspaceDocumentEditor.tsx:838-881` (`showExportMenu`) | Menú desplegable anclado al botón | ✅ correcto (es un menú, no un detalle); solo se revisa Esc |
| Exportar DOCX/PDF como borrador / pendientes de exportación | `WorkspaceDocumentEditor.tsx:1321-1412` | Modal propio `bg-slate-900/50` | Modal `lex-modal` (lote 5) |
| Revisión antes de exportar | `WorkspaceDocumentEditor.tsx:1276` | Modal propio | Modal `lex-modal` (lote 5) |
| Plantillas y archivo / Más acciones | `WorkspaceDocumentEditor.tsx:718`, `CaseDocumentsReader.tsx:889` | `<details class="lex-menu">` anclado | ✅ correcto |
| Confirmar ficha del caso | `CaseDossierPanel.tsx:146`, dentro de `CaseDocumentsReader.tsx:1099` | Bloque inline al final del lector | Drawer (lote 4); la acción de confirmar no cambia |
| Confirmar actuación propuesta | `ActuacionProposalCard.tsx:84-102` | Inline bajo la tarjeta | ✅ correcto |
| Confirmar datos de resolución (apelación) | `AppealResolutionReviewPanel.tsx:108` | Panel inline del flujo | ✅ correcto (es un paso del flujo, no un detalle) |
| Confirmar puntos petitorios | `WorkspaceDocumentEditor.tsx:176` | Aviso inline en el editor | ✅ correcto |
| Validación del editor paginado | `PaginatedDocumentEditor.tsx:779` | Panel inline | Revisar en el lote 5; no se cambia sin captura |
| Exportar para chat — texto | `CaseDocumentsReader.tsx:242` | Acción | Sin cambio |
| Barra de generación: Ver detalle / Cancelar | `GenerationStatusBar.tsx:107` | Inline en la barra | ✅ correcto |

Se completa durante cada lote con el recorrido real de esa pestaña con documento sintético cargado (rutas interceptadas, sin proveedores).

## 4. Plan por lotes

1. **Lote 0 + Lote 1 (piloto: Expedientes «Abrir ficha»).** Bajo riesgo: solo lectura, sin generación ni exportación y una sola función. Entrego capturas antes/después en 1440 y 1024 px, el diff y los resultados. **Me detengo hasta tu aprobación.**
2. Los lotes 2-6, uno por vez, cada uno con su aprobación. El orden va de menor a mayor riesgo; el editor y los diálogos de generación van al final.

## 5. Reversión por lote (sin reset, checkout, restore, stash, clean, add ni commit)

- Antes de cada lote guardo un patch con tus cambios actuales en los archivos que tocaré: `git diff -- <archivos> > audit/patron-detalle/lote-N.pre.patch` (solo lectura).
- Al terminar guardo el patch del lote: diff del archivo antes del lote contra el estado posterior, en `audit/patron-detalle/lote-N.patch`, generado con `git diff --no-index` sobre una copia previa en el scratchpad.
- **Revertir un lote:** `git apply -R audit/patron-detalle/lote-N.patch`, que deshace solo esos hunks, y borrar los archivos nuevos del lote 0 si se revierte la base. No modifica tus otros cambios ni el índice.
- Los lotes no se solapan en archivos salvo `globals.css` (solo se añade al final) y `DetailDrawer.tsx`. Por eso se revierten en orden inverso.

## 6. Verificación por lote

- `npx tsc --noEmit`, sin errores nuevos.
- `npx vitest run --config vitest.offline.config.ts tests/components/detailDrawer.test.tsx` más las pruebas de componente del área (lote 1: las de WorkspaceModulesView/Expedientes; lote 4: `caseDossierPanel*`, `caseDossierRoles*`; lote 3: plantillas; lote 5: editor). Al final, la suite offline completa.
- Pruebas del drawer: abrir, cerrar con Esc, cerrar con clic en el fondo, foco devuelto al botón y foco atrapado (Tab/Shift+Tab).
- Navegador: `tests/browser/workspaceFlows.spec.ts` y `tests/browser/draftGenerationExports.spec.ts`. Ambas interceptan `/api/legal-engine/generate` y el escaneo ZIP, y se ejecutan contra el **servidor aislado en :3201** (copia en `%TEMP%`, `.env` vacío, `AI_PROVIDER_CHAIN=local`), nunca contra tu `:3200` ni con proveedores reales. Primero una corrida base antes del lote, para separar fallos previos de los nuevos.
- Capturas antes/después en 1440 y 1024 px de cada control migrado, en `audit/patron-detalle/lote-N/`.

---

## Lote 1 (piloto) — histórico: se aprobó «Solo web» y después se pidió incluir escritorio en el mismo lote (hecho)

- **Web** (`storage` ≠ `DESKTOP_LOCAL`): «Abrir ficha» abre `DetailDrawer`, un panel modal con fondo atenuado. El fondo modal es **intencional** según la regla 1 de este documento («por encima del contenido, con fondo atenuado, cierre con clic fuera»). Mientras la ficha está abierta, la lista no es interactiva: para abrir otra fila primero se cierra la actual.
- **Escritorio** (`DESKTOP_LOCAL`): se conserva el bloque actual sin cambios, porque `DesktopCaseManager` depende de `selected` para mostrar «Editar expediente y asociar documentos».
- `tests/browser/phase3Flow.spec.ts:296-300` se actualiza: tras cada «Abrir ficha» que no corresponde al borrador buscado, pulsa Esc antes de abrir la siguiente fila.

### ✅ Condición de escritorio: cumplida en el lote 1 (commit d9e2d3f)

La app final es de Windows (escritorio), así que el modo escritorio debe quedar migrado y verificado **antes de empezar cualquier otro lote**.

Qué se agregará (se presentará como diff y esperará aprobación):

| Archivo | Cambio |
|---|---|
| `app/machotes/components/WorkspaceModulesView.tsx` (`RealExpedientesView`) | En escritorio también se usa `DetailDrawer`. Se elimina la rama `selected && desktop` del bloque inline. El `DesktopCaseManager` de arriba recibe `selected={null}` (solo «Nuevo expediente local»), y dentro del drawer se renderiza `<DesktopCaseManager selected={selected} onSaved={…} />`, con «Editar expediente y asociar documentos». |
| `app/machotes/components/DesktopWorkspaceManagers.tsx` (`DesktopCaseManager`) | El formulario «Nuevo expediente local» se abre en un `DetailDrawer` en lugar del bloque inline. El de edición queda dentro del drawer de la ficha. No cambian campos, validación, `save` ni `onSaved`. |
| `tests/components/DesktopWorkspaceManagers.test.tsx` | Casos nuevos: en escritorio, «Abrir ficha» abre el drawer con «Editar expediente…»; guardar llama al mismo endpoint y cierra la ficha; Esc y clic fuera cierran con el foco devuelto. |

Comportamiento esperado en escritorio: «Abrir ficha» abre el drawer con los mismos datos que en la web, más «Editar expediente y asociar documentos» (solo en `LOCAL_CASE`). Editar muestra el formulario dentro del mismo drawer. Guardar ejecuta `onSaved`, que limpia `selected` y recarga, como hoy, y cierra el drawer. «Nuevo expediente local» abre su propio drawer.

Verificación: `tsc`, las pruebas de componente anteriores, y capturas a 1440 y 1024 px con `/api/workspace/cases` interceptado y respondiendo `storage: 'DESKTOP_LOCAL'` (solo lectura, sin escribir en la base).

---

# Resultado de la migración (2026-10-17)

Componente nuevo: `app/machotes/components/DetailDrawer.tsx`. Usa el sistema visual de `.lex-modal` (el de «Opciones de redacción») anclado a la derecha (`.lex-drawer`). Incluye `role="dialog"`, `aria-modal`, `aria-labelledby`, cierre con Esc, con clic fuera y con «Cerrar» (×), foco atrapado y foco devuelto al botón que lo abrió. Se monta dentro de `.machotes-shell` para que el contenido conserve sus utilidades (fuera de él, el reset global `* { margin:0; padding:0 }` las anula). Los modales migrados usan las clases `.lex-modal*` existentes, así que no hay un tercer estilo.

| Pestaña | Caso | Antes | Ahora | Commit |
|---|---|---|---|---|
| Expedientes | Abrir ficha | Bloque al final de la tabla (y≈1120 px, fuera de vista) | Drawer (web y escritorio), mismos datos (comparado con `lote-1/antes-datos.json`) | `d9e2d3f` |
| Expedientes (escritorio) | Editar expediente y asociar documentos | Formulario arriba de la tabla | Dentro del drawer de la ficha | `d9e2d3f` |
| Expedientes (escritorio) | Nuevo expediente local | Formulario en línea | Drawer propio | `d9e2d3f` |
| Cómputo de Términos (escritorio) | Nuevo evento / Editar evento | Formulario encima de la lista | Drawer, con los mismos valores | `5689e7b` |
| Mis Plantillas | Vista previa | Modal propio `bg-black/50` | Drawer | `40d70f2` |
| Mis Plantillas | Crear Machote / Plantilla | Modal propio | `.lex-modal`, más Esc y clic fuera | `40d70f2` |
| Editor | Revisión de Calidad Jurídica / Documento en Revisión (exportación) | Modales propios | `.lex-modal`, más Esc, clic fuera y título accesible | `90d0bba` |
| Global | Consentimiento de proveedor externo | Modal Tailwind propio | `.lex-modal` (mismo comportamiento) | `71d9179` |
| Global | Generador de borradores (Usar plantilla / Generar con machote) | Modal propio | `.lex-modal`, más Esc, clic fuera y título | `71d9179` |
| Motor Jurídico / Contestaciones | Ficha del caso / Confirmar ficha | Ya estaba en `RequirementsDialog` (`.lex-modal`, `a4e6aa2`) | Sin cambio | — |
| Varios | Ver hechos y prestaciones, Ver detalle, Agregar suspensión, Mostrar más, menús Exportar / Más acciones | Inline o menú anclado | Sin cambio (ya cumplían) | — |

Capturas antes/después a 1440 y 1024 px: `audit/patron-detalle/{lote-1,computo,mis-plantillas,editor,dialogos}/`. El servidor aislado en `:3201` sirvió el código previo para las capturas «antes». La ficha web se capturó con los datos reales de `:3200` en solo lectura. Las demás capturas usan datos sintéticos interceptados.

**Fuera de alcance (hallazgos):**
- `tests/browser/phase3Flow.spec.ts` (9 de 11 pruebas) ya fallaba **sin estos cambios**: tras subir el PDF se abre automáticamente `RequirementsDialog` («Confirma los datos del caso»), que intercepta los clics de la prueba. Se verificó ejecutando la prueba «44 páginas» con los archivos previos al lote.
- Barra lateral inaccesible entre 981 y 1180 px: el diff propuesto está en `audit/barra-1180/nav.proposed.diff` y **no se aplicó**.

## Expedientes: versiones agrupadas (solo presentación)

- `app/machotes/lib/caseVersions.ts` (`groupCaseVersions`) agrupa los borradores que comparten el escrito (el título sin la fecha final), el expediente y la materia. La fila muestra la versión más reciente y la etiqueta «N versiones». Nunca agrupa borradores sin expediente ni expedientes locales.
- Al abrir la ficha aparece «Versiones (N)», con fecha y hora de cada versión: «Ver ficha» cambia la ficha mostrada y «Abrir» abre ese borrador (`onOpenCase` con su ID). No se borra, une ni modifica ningún dato; el contador «N asuntos persistidos» sigue contando todos.
- Con los datos actuales de `:3200`, 12 borradores quedan en 6 filas: 800/2024 con 5 versiones, 287/2007 con 2 y 1152/2013 con 2. Capturas en `audit/patron-detalle/versiones/` (antes y después, a 1440 y 1024 px).

## phase3Flow

Se actualizó la prueba, sin tocar la app. Ahora confirma «Confirma los datos del caso» tras cargar la fuente o cambiar de actuación, y localiza el campo numérico por rol, porque el radio «Personalizado» también menciona «objetivo de páginas». Resultado: 11/11.
