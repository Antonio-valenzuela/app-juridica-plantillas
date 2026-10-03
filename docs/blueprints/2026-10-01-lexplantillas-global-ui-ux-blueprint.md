# LexPlantillas — Blueprint global de diseño y UX

> The Architect · 2026-10-01 · Arquetipo: herramienta jurídica de escritorio

## 1. Visión y criterios de éxito

LexPlantillas debe sentirse como un único espacio profesional de trabajo para un abogado: sobrio, rápido de entender, denso sin ser apretado y confiable en los estados que muestra. La prioridad es liberar espacio útil para revisar expedientes y documentos, mantener cada acción cerca de su contexto y hacer evidente qué sigue en un flujo jurídico.

El cambio es de presentación e interacción, no del motor: los handlers, rutas, payloads, persistencia, modelos de datos, estados jurídicos y criterios de exportación permanecen intactos.

Se considerará logrado cuando las 12 pestañas reales compartan jerarquía, espaciado, color, tipografía y estados; los flujos principales muestren una sola acción primaria clara; los paneles contextuales solo ocupen espacio cuando aportan; y navegación, formularios y visor sigan operables en ventanas de escritorio de 1366×768, 1440×900 y 1920×1080 sin cortes ni scroll horizontal accidental.

## 2. Arquitectura actual que se conserva

**Stack observado:** Next.js 16.3.4 App Router, React 19.2.3, TypeScript, Tailwind CSS 4 y CSS global en `app/globals.css`; Vitest y Testing Library para pruebas focalizadas, Playwright disponible para E2E, y Prisma/persistencia existente sin cambios.

**Composición efectiva:**

```text
app/layout.tsx
└── components/layout/AppShell.tsx      navegación persistente, estado de provider/caso, alertas y perfil
    └── app/machotes/page.tsx           selección de tab por ?tab=, flujos y editor
        ├── WorkspaceModulesView.tsx    inicio, expedientes, términos, jurisprudencia,
        │                               biblioteca, alertas, configuración y ayuda
        ├── TemplateLibraryManager.tsx  Mis Plantillas
        ├── CaseDocumentsReader.tsx     Contestaciones y Recursos
        ├── formulario de escritos      Escritos Iniciales
        └── WorkspaceDocumentEditor.tsx / PaginatedDocumentEditor.tsx
```

El sidebar efectivo está declarado dentro de `components/layout/AppShell.tsx`; la página usa doce valores de tab confirmados en `app/machotes/page.tsx`. `WorkspaceModulesView` concentra ocho pantallas con sus lecturas/escrituras actuales. `CaseDocumentsReader` compone análisis, configuración y checklist. El visor, los callbacks y el contexto activo cruzan la página principal y esos componentes.

`components/layout/LexSidebar.tsx`, `LexTopbar.tsx` y `components/lex/*` no aparecen montados en el flujo encontrado. Se conservan intactos y no se convertirán accidentalmente en un segundo shell. Tampoco se agregarán destinos nuevos.

**Cadena funcional congelada:** componentes UI → callbacks existentes → estado local/contexto → APIs existentes → almacenamiento actual. Ningún cambio de estilo puede alterar esa cadena.

## 3. Shell y patrones globales

### Shell

- **Sidebar:** navegación única fija y compacta en escritorio, ancho fluido en el rango actual; separar visualmente Trabajo, Consulta y Preferencias sin cambiar destinos ni `href`. Estado activo con fondo discreto y filete borgoña, además de icono y texto. En tamaños menores conserva el drawer y su cierre con Escape.
- **Topbar:** mantener únicamente datos reales que ya llegan al shell: estado real de generación, expediente activo, notificaciones y perfil mostrado por la app. No agregar buscador hasta que exista un flujo de búsqueda que lo respalde; el test actual lo prohíbe expresamente.
- **Área de trabajo:** fondo neutro cálido, título y descripción compactos, área principal con gutters consistentes y contenido de ancho útil. Evitar una segunda barra de navegación o encabezados repetidos.
- **Panel contextual:** aparece solo en tareas que lo requieren. En Contestaciones/Recursos se conserva el equilibrio aproximado de 60/40 entre documento y contexto, con el visor como superficie dominante; en lectura/investigación sirve para fuente y procedencia. No crear panel vacío en Inicio, Ayuda o pantallas de consulta simple.
- **Visor/editor:** controles agrupados por tarea; el documento conserva prioridad visual. El estado DRAFT, REVIEW_REQUIRED y FINAL mantiene exactamente sus reglas actuales y se diferencia por etiqueta textual, icono y tono semántico.
- **Modales/drawers:** conservar los mecanismos y callbacks actuales; unificar padding, título, cierre, foco visible y botones. No usar modal como navegación primaria.
- **Toasts/errores:** preservar los mensajes y resultados existentes; mejorar ubicación, contraste y acción de recuperación sin modificar la causa ni el código de error.

### Tokens propuestos

| Token | Valor | Uso |
|---|---|---|
| `--lex-ink` | `#17283E` | texto principal y estructura |
| `--lex-navy-950` | `#11243A` | sidebar y superficies profundas |
| `--lex-navy-800` | `#29415B` | hover/selección secundarios |
| `--lex-wine-700` | `#78283A` | acento de marca, foco, acción primaria |
| `--lex-wine-600` | `#963C50` | hover del acento |
| `--lex-bg` | `#F3F5F6` | fondo del espacio de trabajo |
| `--lex-surface` | `#FFFFFF` | paneles y controles elevados |
| `--lex-surface-soft` | `#FAF8F6` | superficies secundarias cálidas |
| `--lex-border` | `#D8DEE4` | divisiones y campos |
| `--lex-text-muted` | `#526173` | información auxiliar legible |
| `--lex-success` | `#176B4B` | éxito real |
| `--lex-warning` | `#885513` | advertencia/revisión |
| `--lex-danger` | `#9A303A` | error/bloqueo |
| `--lex-info` | `#315F7D` | información |
| `--lex-gold-muted` | `#A9865B` | detalle secundario de identidad, no CTA dominante |

Borgoña es acento, no color de fondo para todas las pantallas. Los pares de texto/estado se verificarán con contraste WCAG AA; ningún estado depende exclusivamente del color.

- **Tipografía:** Inter, ya cargada en `app/layout.tsx`. Escala de interfaz 12/14/16/18/24/28 px; texto de documento conserva su tipografía editorial propia. Base de lectura de módulos 14–16 px, metadatos no inferiores a 12 px cuando transmitan estado o datos.
- **Espaciado:** ritmo 4/8 px; gutters principales 20–24 px, separación de secciones 16–24 px.
- **Bordes/radius:** controles 8 px, paneles 10–12 px, contenedores mayores 14 px; evitar exceso de cápsulas.
- **Sombras:** bajas y funcionales; separación primaria mediante superficies y bordes, no tarjetas anidadas.
- **Estados:** hover/focus/active/disabled explícitos, `:focus-visible` visible, controles con labels, carga con texto contextual y recuperación accionable. Movimiento 150–220 ms; respetar `prefers-reduced-motion`.
- **Iconos:** una familia SVG existente (LexIcon); sin emoji, glifos de texto ni ligaduras visibles como iconos.

## 4. Diseño de las vistas reales

| Tab | Tarea y patrón propuesto |
|---|---|
| Inicio | Resumen breve derivado de persistencia, salud operativa secundaria, documentos recientes y accesos útiles. Evitar una cuadrícula de tarjetas compitiendo entre sí. |
| Motor Jurídico | Análisis y configuración con jerarquía clara; reducir ruido alrededor del expediente y conservar estados y guardas existentes. |
| Escritos Iniciales | Formulario guiado por pasos, campos agrupados, contexto opcional progresivo y una acción siguiente explícita. Mantener el guardado y flujo actuales. |
| Contestaciones y Recursos | Flujo visible fuente → análisis → configuración → generación → revisión/edición/exportación. Visor dominante (~60%) y panel contextual (~40%); una CTA principal según estado. Sin duplicar controles. |
| Mis Plantillas | Búsqueda/filtros arriba, filas densas y comparables, preview y acciones principales distinguibles; conservar create/use/edit/delete y perfil de estilo. |
| Expedientes | Lista y filtros como espacio de trabajo; selección revela detalles y documentos asociados, sin estética CRM ni datos de muestra. |
| Cómputo de Términos | Mantener cálculo y calendario interactivo conectado a sus fechas/eventos existentes; resultado, fuente y advertencia visibles sin prometer calendario oficial. |
| Jurisprudencia SCJN | Consulta centrada en búsqueda y resultado; distinguir fuente/verificación/pendiente únicamente según estados reales. Separar error de servicio de búsqueda vacía. |
| Biblioteca | Búsqueda y navegación documental, importación ya existente, procedencia y manual operativo; conservar accesibilidad del original y sus estados. |
| Alertas DOF y Boletín | Consulta bajo demanda, fecha de consulta y enlace de fuente oficial; no presentar vigilancia automática que la lógica no hace. |
| Configuración | Secciones compactas y nombradas: analíticas útiles, perfil, manual y estado operativo; preservar persistencia y endpoint actual. |
| Ayuda | Guías cortas agrupadas por flujo y estados; texto directo, sin paneles vacíos ni documentación inventada. |

Las vistas Motor Jurídico, Escritos Iniciales, Contestaciones y el Editor no son equivalentes: mantienen sus modelos y flujos actuales aunque compartan controles visuales.

## 5. Microcopy y principios de marketing transferibles

La referencia de Corey Haines se aplica solo al lenguaje de interfaz. De la skill de copywriting: claridad por encima de ingenio, etiquetas específicas sobre términos vagos, una idea por bloque y CTA que explican el resultado; honestidad por encima de claims persuasivos. En LexPlantillas esto significa describir la acción jurídica o la etapa real —por ejemplo, “Analizar documento fuente” si eso es lo que activa el botón—, explicar errores con causa y recuperación, y escribir estados vacíos que indiquen el siguiente paso.

No se importarán funnels, testimonios, urgencia, SEO, paywalls, campañas, promesas de exactitud ni claims de “IA jurídica” que no sean verificables. El copy jurídico conserva su terminología técnica.

## 6. Alcance de archivos

### Fuentes activas candidatas

- `app/globals.css`: tokens, shell, controles, responsive, estados globales y reglas actualmente duplicadas.
- `components/layout/AppShell.tsx`: jerarquía visual y agrupación de los 12 links conservando destinos, provider real, caso y menú móvil.
- `app/machotes/page.tsx`: wrappers y headings de formularios/generación/editor; solo composición visual y etiquetas, sin reescribir lógica.
- `app/machotes/components/WorkspaceModulesView.tsx`: `WorkspaceFrame` y ocho módulos reales.
- `app/machotes/components/CaseDocumentsReader.tsx`, `ContestacionesAnalysisPanel.tsx`, `ContestacionesConfigPanel.tsx`, `ContestacionesChecklist.tsx`: flujo de contestación, paneles y visibilidad del CTA.
- `app/machotes/components/TemplateLibraryManager.tsx` y `LawyerStyleProfileCard.tsx`: catálogo y edición/uso de plantillas.
- `app/machotes/components/WorkspaceDocumentEditor.tsx`, `PaginatedDocumentEditor.tsx`, `GenerationStatusBar.tsx`: edición, visor, barra de progreso y estados.
- `app/machotes/components/AnalyticsPanel.tsx`: sección analítica que vive dentro de Configuración.
- Tests UI focales que ya existen y regresiones nuevas pequeñas para token/shell/contratos visuales.

### Fuera de alcance

`lib/legal-engine/**`, `app/api/**`, Prisma/schema/migraciones, provider chain, calidad/cobertura/autoridades, contratos/payloads, importación/cálculos, jobs, persistencia, autenticación, empaquetado y datos. Los cambios ya presentes en el working tree se preservan; no se reformatean ni restauran archivos ajenos al UI.

## 7. Orden de construcción

1. Capturar baseline de Git/tests y asegurar que el servidor local de diseño no accede a fuentes productivas ni dispara generación.
2. Escribir tests de contrato visual para tokens, shell/destinos y puntos responsivos antes de tocar estilos.
3. Introducir tokens semánticos y pulir el shell activo (sidebar, topbar, área de trabajo y focus) sin crear búsqueda ficticia ni cambiar callbacks.
4. Uniformar `WorkspaceFrame`, PageHeader, campos, acciones y estados compartidos con el cambio mínimo; no montar shells legacy.
5. Ajustar las pantallas de datos: Inicio, Expedientes, Términos, Jurisprudencia, Biblioteca, Alertas, Configuración y Ayuda; mantener consultas y handlers.
6. Ajustar Mis Plantillas, asegurando cada acción existente y preview en sus lugares.
7. Ajustar Contestaciones y Recursos conservando la secuencia, visor 60/40, upload y preparación existentes.
8. Ajustar Escritos Iniciales, Motor Jurídico y Editor; preservar autosave, navegación, estados de calidad y exportación.
9. Revisión de responsive/teclado/contraste/reduced motion y quitar únicamente redundancias visuales demostradas.
10. Correr suites UI/componentes relevantes, typecheck, build y navegación E2E sin generar escritos jurídicos ni llamar providers.
11. Inspeccionar visualmente escritorio 1366×768, 1440×900 y 1920×1080; corregir overflow, doble scroll, recortes, CTA escondidas y espacio inútil; registrar archivos y pendientes.

## 8. Verificación y límites de aceptación

- Mantener intactas las 12 URLs `?tab=` y todos los callbacks/props/eventos actuales.
- Probar la navegación activa, estado móvil/tecla Escape, layout de 2–3 paneles y las pruebas existentes de contestaciones, importación, agenda, analíticas, editor y estados de generación.
- Probar `npm run typecheck` y `npm run build` sobre el working tree completo; reportar advertencias o fallos preexistentes sin atribuirlos al diseño.
- E2E/inspección visual solo con contenido sintético o estado sin expediente. No ejecutar generación ni providers para esta etapa.
- Verificar el DOM y capturas en las tres resoluciones de escritorio citadas; no afirmar inspección visual si el navegador/local server no se puede abrir.
- No commit, push, pull, reset ni checkout.

## 9. Instrucciones de proyecto incorporadas

1. Código estructural: usar CodeGraph para símbolos/flujo/impacto cuando el MCP esté disponible; si el índice no existe, preguntar antes de inicializarlo. En este run `.codegraph/` existe, pero sus consultas requieren una aprobación inaccesible; la auditoría usó búsqueda local de solo lectura como fallback.
2. Next.js no coincide con APIs asumidas de memoria: antes de escribir código, leer la guía relevante desde `node_modules/next/dist/docs/` de esta instalación. Para esta etapa se revisaron CSS global, layouts y pages de Next 16.3.4.
3. Trabajar en los límites del brief, respetar cambios no confirmados y conservar handlers, endpoints, props, consultas, mutaciones y reglas de negocio.
4. No commit, push, pull, reset, checkout ni instalación de dependencias durante esta tarea.
5. Si el CLI de `ui-ux-pro-max` no está materializado, no inventar su salida ni instalar paquetes a ciegas: seguir la guía `SKILL.md` disponible y documentar esa limitación.
