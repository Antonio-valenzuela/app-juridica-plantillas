# LexPlantillas Global UI/UX Implementation Plan

> Plan de ejecución inline sobre el working tree actual; sin ramas, commits ni cambios del motor jurídico.

**Goal:** Hacer que las 12 pestañas reales de LexPlantillas compartan un sistema visual premium y una UX clara, preservando por completo el comportamiento funcional existente.

**Architecture:** Mantener Next.js App Router, `components/layout/AppShell.tsx` y la selección de modos en `app/machotes/page.tsx`. Centralizar el lenguaje visual en tokens semánticos y el shell activo; extender los patrones existentes (`WorkspaceFrame`, visor y paneles) en vez de montar los componentes legacy o reescribir flujos.

**Tech Stack:** Next.js 16.3.4, React 19.2.3, TypeScript, Tailwind CSS 4, CSS global existente, Vitest/Testing Library y Playwright.

**Spec:** `docs/blueprints/2026-10-01-lexplantillas-global-ui-ux-blueprint.md`

## Global Constraints

- Solo interfaz, UX writing y estilos; no tocar APIs, handlers de negocio, Prisma, auth, cálculo, providers, guards, Coverage, QualityGate ni estados legales.
- Mantener los 12 destinos `?tab=` existentes; ningún buscador visible hasta que exista búsqueda real.
- Mantener todos los callbacks, props, mutations, queries, eventos, textos de fuente y ayudas jurídicas verificables.
- No quitar funciones por motivos visuales. Quitar solo duplicación visual confirmada en DOM.
- Preservar todos los cambios existentes del working tree; no checkout/reset/stash/commit/push/pull.
- Tests primero para cada contrato nuevo; no eliminar assertions ni flexibilizar criterios existentes.
- Inspeccionar UI solo con expediente vacío o datos sintéticos; no ejecutar generación ni providers.

## Mapa de archivos por responsabilidad

- Shell/tokens: `app/globals.css`, `components/layout/AppShell.tsx`.
- Flujo principal, headings, modo de formulario, editor y visor: `app/machotes/page.tsx`, `app/machotes/components/WorkspaceDocumentEditor.tsx`, `PaginatedDocumentEditor.tsx`, `GenerationStatusBar.tsx`.
- Ocho vistas modulares: `app/machotes/components/WorkspaceModulesView.tsx`, `AnalyticsPanel.tsx`, `DesktopWorkspaceManagers.tsx`, `LocalImportPanel.tsx`.
- Contestaciones: `CaseDocumentsReader.tsx`, `ContestacionesAnalysisPanel.tsx`, `ContestacionesConfigPanel.tsx`, `ContestacionesChecklist.tsx`.
- Plantillas: `TemplateLibraryManager.tsx`, `LawyerStyleProfileCard.tsx`.
- Regresiones focales: `tests/components/AppShellNavigation.test.tsx`, `tests/ui/desktopResponsiveContract.test.ts`, `tests/ui/workspaceModulesContract.test.ts`, `tests/ui/contestacionesUi.test.ts`, `tests/components/WorkspaceDocumentEditorBehavior.test.tsx` y `tests/components/AnalyticsPanel.test.tsx`.

## Tasks

### Task 1: Baseline protegido y contrato del sistema visual

**Files:**
- Test: `tests/ui/desktopResponsiveContract.test.ts`
- Test: `tests/components/AppShellNavigation.test.tsx`
- Read-only baseline: `git status --short --branch`, `npm run typecheck`, suites de UI enumeradas abajo.

- [ ] Añadir primero assertions para tokens semánticos borgoña/neutral, foco visible, targets y breakpoints de escritorio; mantener los checks actuales de ancho fluido.
- [ ] Ejecutar `npx vitest run tests/ui/desktopResponsiveContract.test.ts tests/components/AppShellNavigation.test.tsx`; observar RED por los tokens/contratos aún ausentes.
- [ ] No cambiar el test que prohíbe anunciar la búsqueda global sin workflow real.

### Task 2: Tokens semánticos y shell activo

**Files:** `app/globals.css`, `components/layout/AppShell.tsx`.

- [ ] Implementar el token map del blueprint con fondo neutro, texto alto contraste, vino de acento, navy, superficies, bordes, estados y foco.
- [ ] Aplicar una jerarquía única de sidebar/topbar, agrupar visualmente navegación sin cambiar labels, `href`, `isActive`, provider health, active case, notifications o escape móvil.
- [ ] Quitar únicamente overrides visuales contradictorios del shell cuando se demuestre que solo duplican estilos; no borrar los componentes legacy.
- [ ] Volver a ejecutar las dos suites del Task 1 y comprobar que los 12 links y el drawer siguen intactos.

### Task 3: Marco compartido y módulos informativos

**Files:** `app/machotes/components/WorkspaceModulesView.tsx`, `AnalyticsPanel.tsx`, `DesktopWorkspaceManagers.tsx`, `LocalImportPanel.tsx`; tests `workspaceModulesContract.test.ts`, `workspaceAgendaContract.test.ts`, `settingsMetricsContract.test.ts`, `WorkspaceAgenda.test.tsx`, `AnalyticsPanel.test.tsx`, `DesktopWorkspaceManagers.test.tsx`.

- [ ] Añadir una regresión de clases/patrones compartidos antes de editar `WorkspaceFrame`; confirmar RED.
- [ ] Uniformar títulos, descripción, superficie de sección, campos, empty/loading/error y estado de recuperación dentro de `WorkspaceFrame`.
- [ ] Aplicar la jerarquía por módulo a Inicio, Expedientes, Términos, Jurisprudencia, Biblioteca, Alertas, Configuración y Ayuda sin mover fetches, calendario, `onNavigate`, importación, persistencia o textos de verificación.
- [ ] Correr las pruebas del grupo y confirmar que su salida aún diferencia vacío, error, fuente no disponible y dato persistido.

### Task 4: Mis Plantillas

**Files:** `TemplateLibraryManager.tsx`, `LawyerStyleProfileCard.tsx`; los tests de plantilla/componentes existentes.

- [ ] Añadir una regresión que monte el catálogo con callbacks create/use/edit/delete y verifique que siguen accesibles.
- [ ] Ajustar toolbar, filtros, densidad de resultados, preview, acciones y perfil a una lista comparativa compacta; no fusionar funciones distintas.
- [ ] Ejecutar tests y verificar una fila seleccionable, estados vacíos y acciones keyboard-focusable.

### Task 5: Contestaciones y Recursos

**Files:** `CaseDocumentsReader.tsx`, `ContestacionesAnalysisPanel.tsx`, `ContestacionesConfigPanel.tsx`, `ContestacionesChecklist.tsx`; tests `contestacionesUi.test.ts`, `contestacionesUploadRegression.test.ts`, `contestacionesRuntimeRegression.test.ts`, `contestacionesConfigPanelPhase3.test.tsx`, `Contestaciones...` existentes.

- [ ] Antes de estilos, cubrir con prueba los pasos, CTA real y callbacks upload/select/generate/open-editor existentes.
- [ ] Observar RED para el nuevo contrato de jerarquía/desktop 60/40 y una CTA claramente primaria.
- [ ] Aplicar el layout: visor centrado dominante, análisis/configuración/contexto en panel derecho que se adapta abajo en anchos menores, barra de pasos compacta, progreso y errores con recovery.
- [ ] Mantener documentos fuente, texto extraído, página, expediente, checklist, readiness y exportación con los datos/callbacks actuales.
- [ ] Ejecutar suites focales y confirmar contratos de upload, revisión y generación.

### Task 6: Escritos Iniciales, Motor Jurídico y edición/exportación

**Files:** `app/machotes/page.tsx`, `WorkspaceDocumentEditor.tsx`, `PaginatedDocumentEditor.tsx`, `GenerationStatusBar.tsx`; tests `workspaceDocumentEditorToolbar.test.ts`, `WorkspaceDocumentEditorBehavior.test.tsx`, `generationProgressSingleSurface.test.tsx`, `documentPagination.test.ts`, `exportPersistence.test.ts`, `generationRuntimeRegression.test.ts`.

- [ ] Añadir/ajustar primero assertions de composición visual para formulario, barra de progreso única, editor y toolbar; preservar todos los estados `DRAFT`, `REVIEW_REQUIRED`, `FINAL`.
- [ ] Ajustar encabezado, stepper, agrupación de campos, feedback de autosave, toolbar, panel inspector, páginas y export menu; mantener funciones y request payloads byte/semánticamente iguales.
- [ ] Ejecutar las suites del grupo; no ejecutar generación real ni abrir un expediente con datos productivos.

### Task 7: Microcopy y accesibilidad transversal

**Files:** etiquetas visibles de los archivos ya listados y `app/globals.css`; pruebas de contrato correspondientes.

- [ ] Revisar cada CTA/empty/loading/error y cambiar solo frases vagas o redundantes por el resultado observable, sin prometer verificación, persistencia o automatización no existente.
- [ ] Confirmar `aria-label`, `aria-current`, labels de campos, focus-visible, texto más icono para estados, cierre Escape y mensajes de error/recuperación.
- [ ] Confirmar `prefers-reduced-motion`, estados disabled y contraste AA calculado para pares usados.

### Task 8: QA de resolución, regresión y entrega

**Files:** actualizar solo tests visuales intencionales; registrar aquí el resultado de verificación y cualquier limitación ambiental.

- [ ] Ejecutar suites UI/componentes focales y toda la batería disponible no-LLM: `npm run test:components` y `npm run test:integration` si las dependencias/DB local lo permiten.
- [ ] Ejecutar `npm run typecheck`; reportar resultado exacto.
- [ ] Ejecutar `npm run build`; reportar resultado exacto y distinguir fallos ambientales o del working tree previo.
- [ ] Abrir la app local y revisar capturas en 1366×768, 1440×900 y 1920×1080; recorrer Inicio, Plantillas, Contestaciones, Escritos, Editor, Expedientes, Términos, Jurisprudencia, Biblioteca, Alertas y Configuración/Ayuda con datos sintéticos/estado vacío.
- [ ] Confirmar navegación, scroll, preview, inputs, CTA, modales, hover/focus y estado de generación sin activar provider.
- [ ] Informar archivos modificados exactos, pruebas, typecheck, build, QA visual y limitaciones reales; no commit.

## Ejecución

Se ejecuta inline en esta sesión. Cada grupo conserva su RED → GREEN y verificación focalizada; ante cualquier regresión funcional o fallo imposible de aislar, se reporta el bloqueo sin relajar la prueba ni modificar lógica jurídica.

## Resultado de implementación y verificación — 2026-10-01

### Cambios realizados

- `app/globals.css`: tokens semánticos; shell borgoña/azul marino sobrio; foco y movimiento reducido; marco común para los ocho módulos; proporción desktop para Contestaciones; patrones de Plantillas, Escritos Iniciales, progreso y editor.
- `components/layout/AppShell.tsx`: `aria-current="page"` para el destino activo y chevron SVG en vez de glifo de texto. No cambiaron rutas ni callbacks.
- `app/machotes/components/WorkspaceModulesView.tsx`: clase de marco visual compartido para títulos, formularios y paneles de las ocho vistas.
- `app/machotes/components/GenerationStatusBar.tsx`: `data-status` deriva del estado existente del job; no cambia el ciclo ni el porcentaje.
- `app/machotes/components/TemplateLibraryManager.tsx`: iconos SVG y nombres visibles para usar/editar/eliminar; se conservaron sus handlers.
- `app/machotes/components/WorkspaceDocumentEditor.tsx`: superficie neutral de editor y SVG en el estado de generación; solo cambios visuales.
- Pruebas nuevas: `tests/ui/lexDesignSystemContract.test.ts`, `tests/ui/templateLibraryVisualContract.test.tsx`. Se ampliaron contratos del shell/progreso/módulos.

### Ciclos RED → GREEN

- Tokens/foco: RED, 2 pruebas fallaron por tokens y foco ausentes; GREEN, shell + responsive + accesibilidad: 5/5.
- Composición de módulos/estado activo/progreso: RED, faltaban `aria-current`, `data-status`, el marco y los selectores comunes. GREEN focalizado: 22 passed, 1 skipped (la prueba desfasada que se documenta abajo quedó excluida del filtro; no se alteró su criterio).
- Plantillas: RED, no existía la etiqueta visible “Usar plantilla”; GREEN luego del cambio de iconos/etiquetas, integrado en 12/12 pruebas focalizadas.
- Progreso: RED al exigir color sólido semántico; GREEN tras reemplazar el gradiente por el token de estado; incluido en 12/12 pruebas focalizadas.
- Editor: RED por ausencia de superficie común; GREEN en prueba del sistema visual y regresiones del editor.

### Validación

- `npm run typecheck`: PASS (`tsc --noEmit`).
- CSS PostCSS parse: PASS.
- Contratos de sistema visual, navegación, responsive, plantilla y progreso: 5 archivos, 12/12 pruebas PASS.
- Editor, toolbar y Contestaciones: 3 archivos, 28/28 pruebas PASS.
- `npm run test:components -- --reporter=dot`: 30 archivos PASS y 1 archivo FAIL; 125 pruebas PASS, 1 FAIL (126 totales). La falla está en `tests/ui/workspaceModulesContract.test.ts:69`, que busca literalmente `handleReopenDraft(summary.id)` en `app/machotes/page.tsx`; esta tarea no modificó esa página ni el flujo de reapertura. No se modificó la prueba ni el comportamiento para encubrir la divergencia.
- `npm run build`: BLOQUEADO antes de Next build, durante `prisma generate`, por `EPERM` al renombrar `node_modules/.prisma/client/query_engine-windows.dll.node.tmp18772` sobre `query_engine-windows.dll.node`. Había un proceso ocupando el puerto 3200; no se terminó un proceso que esta sesión no pudo identificar ni se borró ningún archivo/lock. Build queda NO VERIFICADO.
- QA visual real: BLOQUEADO. El navegador de Codex rechazó explícitamente navegar a `http://localhost:3200/`; no se intentó sortear su política ni se declara PASS visual. La app continuó respondiendo HTTP en la prueba local realizada, pero eso no sustituye revisión visual.
- No se ejecutaron generación documental, E2E, providers ni cambios jurídicos.

### Estado honesto

La capa común y sus contratos focalizados están implementados. La tarea no se certifica como rediseño visual terminado en navegador: falta revisar capturas reales en las tres resoluciones del plan. También queda pendiente repetir `npm run build` cuando Prisma pueda reemplazar su cliente generado sin el bloqueo de archivo. El working tree y las modificaciones jurídicas preexistentes fueron preservados; no se creó commit.
