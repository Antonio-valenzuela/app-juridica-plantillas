<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

<!-- SPEC-KIT PROJECT MEMORY (permanent; not managed by the extension) -->

## Spec Kit is the project's memory — read it at the start of EVERY session

**Constitution (obligatorio, leer antes de tocar código):** `.specify/memory/constitution.md`

Contiene los principios no negociables del motor legal: gates que **nunca** se
relajan (QualityGate, Coverage, autoridad/provenance, factual audit, DRAFT/FINAL),
admisión **por proposición y nunca por sección**, la Guía Operativa como
metodología y **no** como autoridad, el tipo de escritor que debe sobrevivir todo
el pipeline, `functionalStatus` por evidencia y no por lista, UTF-8 en este repo,
y las restricciones permanentes (no tocar Prisma, no cambiar providers, no
matar procesos con DLL, no dejar `npm run dev` durante `npm run build`).

Si alguna regla de esta constitution o de este bloque contradice una
instrucción puntual, **pregunta antes de actuar**.

## Workflow (comandos slash en el chat, no en la terminal)

SDD — núcleo:

```
/speckit.constitution   # ya ratificada; revisar si cambian los principios
/speckit.specify        # qué y por qué
/speckit.plan           # cómo
/speckit.tasks          # tareas accionables
/speckit.implement      # implementar
/speckit.converge       # evaluar codebase y anexar trabajo restante
```

Extensiones opt-in:

```
/speckit.bug-assess "síntoma" slug=...     → /speckit.bug-fix → /speckit.bug-test
/speckit.assess-intake "idea" slug=...     → research → define → shape → decide
/speckit.agent-context.update              # refresca el bloque SPECKIT de arriba
```

Regla de continuidad: **no** cierres una tarea sin dejar el estado escrito.
Al empezar, lee `specs/**/plan.md` y `specs/**/tasks.md` más recientes; al
terminar, ejecuta `/speckit.converge` o deja el hallazgo en `audit/`.

## Dónde vive el estado real

- `.specify/` — memoria, constitution, templates, scripts, workflows
- `.opencode/commands/` — comandos slash de Spec Kit
- `specs/` — especificaciones activas por feature
- `audit/` — evidencia y reportes de verificación (artefactos, no fecalización)
