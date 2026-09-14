# Contestación / Revisión extraordinaria de Amparo Directo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar soporte explícito, trazable y grounded para `contestacion_revision_extraordinaria_amparo_directo` sin convertirlo en una demanda ni inventar datos.

**Architecture:** Añadir el ID a la única fuente de verdad `DocumentTemplates`, con una estrategia declarativa específica, secciones canónicas y reglas de procedencia/preflight. Reutilizar únicamente infraestructura común ya existente para routing, CaseContext, plan documental, generación, sanitización, validación y exportación; la identidad y la voz serán propias del escrito seleccionado.

**Tech Stack:** TypeScript, Next.js, Vitest, pipeline legal universal y catálogo `DocumentTemplates`.

**Spec:** `C:\Users\yahir\Downloads\Plan_5_Loops_Restantes_APP_Plantillas.docx`, sección LOOP 3.

## Global Constraints

- El ID explícito `contestacion_revision_extraordinaria_amparo_directo` domina cualquier `sourceDocumentType`.
- Nunca reutilizar `demanda_amparo_indirecto` ni `demanda_amparo_directo` como fallback.
- No inventar nombres, fechas, autoridades, expedientes, hechos, pruebas, tesis, artículos ni plazos.
- Los hechos deben proceder del documento fuente, datos del usuario, datos persistidos o reglas deterministas del sistema.
- Campos o secciones requeridos no sustentados producen `needs_input`/`missingFields` y no un FINAL falso.
- La estructura debe incluir identificación del asunto, comparecencia/personería, antecedentes, resolución, agravios/argumentos, fundamentos solo sustentados, petitorios y cierre/firma controlados.
- No comenzar LOOP 4 ni modificar otras familias salvo regresión demostrada.

### Task 1: Declarar la estrategia canónica

**Files:**
- Modify: `lib/legal-engine/documentTemplates.ts`
- Test: `tests/legal-engine/loop3ContestacionRevision.test.ts`

- [ ] Escribir pruebas rojas de mapping, metadata, estructura, voz y no-cross-template.
- [ ] Ejecutar el test y confirmar que falla por ausencia del mapping.
- [ ] Añadir la entrada canónica con campos, secciones, reglas, fuentes y prohibiciones específicas.
- [ ] Ejecutar el test focal.

### Task 2: Construir estructura y generación específica

**Files:**
- Modify: `lib/legal-engine/contestacionStructure.ts`
- Modify: `lib/legal-engine/documentPlan.ts` solo si el constructor común no distingue la estrategia
- Modify: `lib/legal-engine/pipeline.ts` solo si las instrucciones por sección requieren integración
- Test: `tests/legal-engine/loop3ContestacionRevision.test.ts`

- [ ] Añadir pruebas rojas para secciones obligatorias, roles, resolución impugnada y postura grounded.
- [ ] Implementar el esqueleto específico sin copiar la estructura de una demanda.
- [ ] Hacer que la generación determinista y las instrucciones de sección respeten la nueva naturaleza.
- [ ] Validar que el source solo sea referencia y no sustituya el tipo seleccionado.

### Task 3: Preflight, validación y filename

**Files:**
- Modify: `lib/legal-engine/qualityGate.ts` o `lib/legal-engine/validator.ts` solo si falta una regla existente
- Modify: `lib/legal-engine/outputFilename.ts` solo si el metadata real no basta
- Test: `tests/legal-engine/loop3ContestacionRevision.test.ts`

- [ ] Escribir pruebas rojas para falta de datos, estrategia no aplicable, secciones vacías, placeholders y filename.
- [ ] Implementar únicamente reglas específicas que no estén cubiertas por los gates de Loop 2.
- [ ] Confirmar que un documento incompleto no puede exportarse como FINAL.

### Task 4: Verificación y revisión

**Files:**
- Test: `tests/legal-engine/loop3ContestacionRevision.test.ts`

- [ ] Ejecutar tests focales de estrategia, legal-engine y templates.
- [ ] Ejecutar suite completa, typecheck, lint y `next build --webpack`.
- [ ] Revisar routing cerrado, CaseContext, requiredFields/Sections y grounding.
- [ ] Cerrar Loop 3 solo si todos los criterios pasan; de lo contrario reportar `CERRADO: NO` y el bloqueo exacto.
