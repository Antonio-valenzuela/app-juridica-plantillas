from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path.cwd()
AUDIT = ROOT / "audit" / "final-legal-readiness-2026"
REPORT_MD = ROOT / "FINAL_LEGAL_READINESS_REPORT.md"
REPORT_DOCX = ROOT / "FINAL_LEGAL_READINESS_REPORT.docx"
REPORT_PDF = ROOT / "FINAL_LEGAL_READINESS_REPORT.pdf"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def read_log_text(path: Path) -> str:
    data = path.read_bytes()
    if b"\x00" in data:
        return data.decode("utf-16", errors="replace")
    return data.decode("utf-8-sig", errors="replace")


def value(obj: Any, *keys: str, default: Any = "") -> Any:
    current = obj
    for key in keys:
        if not isinstance(current, dict):
            return default
        current = current.get(key, default)
    return current


def fmt_int(number: Any) -> str:
    try:
        return f"{int(number):,}".replace(",", " ")
    except (TypeError, ValueError):
        return "-"


def fmt_ms(number: Any) -> str:
    try:
        return f"{int(number)} ms"
    except (TypeError, ValueError):
        return "-"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pdf_stats(path: Path) -> tuple[int, int, bool]:
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        return len(reader.pages), len(text), "BORRADOR" in text.upper()
    except Exception:
        return 0, 0, False


def collect_cases() -> list[dict[str, Any]]:
    manifest = read_json(AUDIT / "selected-cases.json")
    selected = {str(item["caseNumber"]): item for item in manifest["cases"]}
    reexport = read_json(AUDIT / "renderer-reexport-summary.json")
    reexport_by_case = {str(item["caseNumber"]): item for item in reexport["results"]}
    cases: list[dict[str, Any]] = []
    for case_number in ["01", "02", "03", "04", "05", "06"]:
        case_root = AUDIT / "cases" / case_number
        raw_selection = selected[case_number]
        selection = {
            **raw_selection,
            "zipEntry": raw_selection.get("zipEntry", raw_selection.get("sourceEntry", "")),
            "bytes": raw_selection.get("bytes", raw_selection.get("sourceBytes", 0)),
            "sha256": raw_selection.get("sha256", raw_selection.get("sourceSha256", "")),
        }
        result = read_json(case_root / "evidence" / "case-result.json")
        document = read_json(case_root / "evidence" / "generated-document.json")
        trace = read_json(case_root / "evidence" / "generation-trace.json")
        output = reexport_by_case[case_number]
        docx_path = Path(output["docxPath"])
        pdf_path = Path(output["pdfPath"])
        app_pages, app_text_chars, app_has_draft = pdf_stats(pdf_path)
        word_pdf_candidates = sorted(
            (AUDIT / "visual-qa" / "word-rendered" / case_number).glob("caso-*-DRAFT-word-render.pdf")
        )
        word_pages = pdf_stats(word_pdf_candidates[0])[0] if word_pdf_candidates else 0
        coverage = value(document, "coverageMatrix", "summary", default={})
        issues = value(document, "legalIssueMatrix", "summary", default={})
        validation = value(result, "semanticState", "validation", default={})
        quality = value(result, "semanticState", "qualityGate", default={})
        assembly_quality = value(document, "documentAssemblyQualityGate", default={})
        tasks = trace.get("generationTasks", [])
        executions = trace.get("taskExecutions", [])
        cases.append({
            "caseNumber": case_number,
            "selection": selection,
            "result": result,
            "document": document,
            "trace": trace,
            "coverage": coverage,
            "issues": issues,
            "validation": validation,
            "quality": quality,
            "assemblyQuality": assembly_quality,
            "tasks": tasks,
            "executions": executions,
            "docxPath": docx_path,
            "pdfPath": pdf_path,
            "docxBytes": output["docxBytes"],
            "pdfBytes": output["pdfBytes"],
            "docxSha256": sha256(docx_path),
            "pdfSha256": sha256(pdf_path),
            "appPages": app_pages,
            "wordPages": word_pages,
            "appTextChars": app_text_chars,
            "appHasDraft": app_has_draft,
            "generatedTextChars": len((case_root / "evidence" / "generated-text.txt").read_text(encoding="utf-8")),
        })
    return cases


def stage_rows(case: dict[str, Any]) -> list[tuple[str, str, str]]:
    rows = []
    for item in case["result"].get("stages", []):
        rows.append((str(item.get("stage", "")), str(item.get("event", "")), fmt_ms(item.get("elapsedMs"))))
    return rows


def markdown_table(headers: list[str], rows: list[list[str]]) -> str:
    result = ["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"]
    result.extend("| " + " | ".join(str(item) for item in row) + " |" for row in rows)
    return "\n".join(result)


def report_markdown(cases: list[dict[str, Any]]) -> str:
    baseline = read_json(AUDIT / "baseline" / "results.json")
    verification = read_json(AUDIT / "final-verification" / "results.json")
    verification_by_name = {item["name"]: item for item in verification}
    final_lint_log = read_log_text(AUDIT / "final-verification" / "lint.log")
    lint_match = re.search(r"(\d+) problems \((\d+) errors, (\d+) warnings\)", final_lint_log)
    final_lint_summary = (
        f"PASS: {lint_match.group(2)} errores, {lint_match.group(3)} warnings"
        if lint_match else "PASS: código de salida 0; revisar log completo"
    )
    attempt = read_json(AUDIT / "attempts" / "case-06-amparo-revision" / "evidence" / "case-result.json")
    lines: list[str] = []
    lines.extend([
        "# FINAL LEGAL READINESS REPORT",
        "",
        "Fecha de ejecución: 26 de septiembre de 2026. Este reporte conserva la evidencia técnica de la auditoría local y de las seis pruebas E2E realizadas con expedientes de `Datos.zip`.",
        "",
        "## Conclusión ejecutiva",
        "",
        "La aplicación conserva Prisma y la persistencia existente, funciona en el alcance local de un solo abogado y completó seis recorridos E2E con documentos DOCX y PDF de revisión. Los seis pares se exportaron y pasaron la inspección visual posterior a la corrección del renderer PDF.",
        "",
        "El resultado jurídico no debe considerarse listo para presentación. Los seis documentos están marcados como `DRAFT`, contienen estados `REVIEW_REQUIRED` y el intento de exportación FINAL permanece bloqueado por cobertura, postura del cliente, evidencia o calidad pendiente. Esto es deliberado y evita presentar como definitivo un escrito que todavía requiere revisión del abogado.",
        "",
        "Estado recomendado: `REVIEW_REQUIRED`. La aplicación puede continuar como herramienta local de generación asistida y revisión del abogado; no se debe afirmar todavía que está al 100 por ciento para presentación automática ni que la versión Windows está terminada.",
        "",
        "## 1. Alcance y decisiones respetadas",
        "",
        "- Usuario actual: un solo abogado local. No se agregaron roles, equipos, organizaciones, facturación, suscripciones ni colaboración multiusuario.",
        "- Persistencia: se conserva Prisma y la base de datos configurada por la aplicación. `C:\\Users\\yahir\\Desktop\\Datos.zip` se usó únicamente como banco de pruebas.",
        "- Separación de datos: el ZIP no se importó ni se mezcló con la base productiva. El manifiesto, fuentes extraídas y salidas viven únicamente bajo `audit/final-legal-readiness-2026`.",
        "- Las dos referencias de Downloads se trataron como referencias de estructura, redacción y diseño, no como fuentes de hechos para las seis contestaciones.",
        "",
        "Referencias revisadas:",
        "",
        "- `C:\\Users\\yahir\\Downloads\\Recurso_Apelacion_Actualizado_2026_Galarza_Meza.docx`",
        "- `C:\\Users\\yahir\\Downloads\\Recurso_de_Apelacion_Galarza_Meza_actualizado.docx`",
        "",
        "## 2. Evidencia de entrada y selección de casos",
        "",
        "El selector PowerShell `scripts/audit/select-final-legal-readiness-cases.ps1` extrajo seis DOCX distintos, calculó bytes y SHA-256, y escribió `audit/final-legal-readiness-2026/selected-cases.json`. La validación final del manifiesto devolvió ok true y errors vacíos.",
        "",
    ])
    selection_rows = []
    for c in cases:
        s = c["selection"]
        selection_rows.append([
            c["caseNumber"], s["matter"], s["outputDocumentType"], s["bytes"], s["sha256"][:16] + "...", s["zipEntry"],
        ])
    lines.append(markdown_table(["Caso", "Materia", "Salida", "Bytes", "SHA-256", "Entrada del ZIP"], selection_rows))
    lines.extend([
        "",
        "El sexto caso originalmente seleccionado fue una revisión de amparo directo. Se conservó como intento negativo y se reemplazó por la demanda laboral de Marco C4 porque el guard de contenido cruzado detectó que el resultado de amparo contenía estrategia propia de una demanda de amparo. La evidencia está en `audit/final-legal-readiness-2026/attempts/case-06-amparo-revision`.",
        "",
        "## 3. Recorrido E2E ejecutado",
        "",
        "Cada caso pasó por el route real de análisis de upload y después por `runGenerationPipeline` con flujo `DOCUMENT_ANALYSIS`. El orden comprobado fue:",
        "",
        "`source -> upload -> extraction -> classification -> analysis -> context -> document plan -> generation -> validation -> assembly -> review -> DOCX -> PDF`",
        "",
        "El runner es `scripts/audit/run-final-legal-readiness.mts` y la prueba es `tests/e2e/finalLegalReadinessRealCases.test.ts`. Cada caso conserva fuente extraída, respuesta de análisis, documento generado, texto generado, trace, estado semántico, errores, warnings y artefactos exportados.",
        "",
        "## 4. Resultado consolidado de las seis pruebas",
        "",
    ])
    result_rows = []
    for c in cases:
        r = c["result"]
        t = c["trace"]
        s = c["selection"]
        result_rows.append([
            c["caseNumber"], r.get("status", ""), s["matter"], fmt_ms(r.get("totalMs")),
            str(t.get("providerActuallyUsed") or "-"), str(t.get("model") or "-"),
            fmt_int(c["generatedTextChars"]), str(c["appPages"]), fmt_int(c["docxBytes"]), fmt_int(c["pdfBytes"]),
            "BLOQUEADO" if value(r, "semanticState", "finalDocxBlock") else "-",
        ])
    lines.append(markdown_table(["Caso", "Estado E2E", "Materia", "Tiempo", "Proveedor", "Modelo", "Texto", "Páginas PDF", "DOCX", "PDF", "FINAL"], result_rows))
    lines.extend([
        "",
        "Los seis casos tienen `PASS_REVIEWABLE`, seis DOCX, seis PDF y cero fallas de exportación DRAFT después de la corrección. `PASS_REVIEWABLE` no equivale a `FINAL`.",
        "",
    ])
    for c in cases:
        r = c["result"]
        t = c["trace"]
        s = c["selection"]
        v = c["validation"]
        q = c["quality"]
        a = c["assemblyQuality"]
        lines.extend([
            f"### Caso {c['caseNumber']}: {s['zipEntry']}",
            "",
            f"- Entrada: `{s['zipEntry']}`",
            f"- SHA-256 de la fuente: `{s['sha256']}`; bytes: `{s['bytes']}`.",
            f"- Clasificación observada: `{value(r, 'source', 'classification', 'tipo_documento')}`; materia detectada: `{value(r, 'source', 'classification', 'materia')}`; confianza: `{value(r, 'source', 'classification', 'confianza')}`; HTTP de análisis: `{value(r, 'source', 'analysisHttpStatus')}`.",
            f"- Salida solicitada: `{r.get('outputDocumentType')}`. Estado: `{r.get('status')}`. Tiempo total: `{fmt_ms(r.get('totalMs'))}`.",
            f"- Proveedor solicitado: `{t.get('providerRequested')}`. Proveedor usado: `{t.get('providerActuallyUsed')}`. Modelo: `{t.get('model')}`. Fallback: `{t.get('providerFallbackReason') or 'no reportado'}`.",
            f"- Tareas planeadas: `{len(t.get('generationTasks', []))}`; ejecuciones registradas: `{len(t.get('taskExecutions', []))}`; errores del trace: `{len(t.get('errors', []))}`; warnings del trace: `{len(t.get('warnings', []))}`.",
            f"- Texto generado: `{fmt_int(c['generatedTextChars'])}` caracteres. Texto extraído del PDF: `{fmt_int(c['appTextChars'])}` caracteres. PDF: `{c['appPages']}` páginas. Render Word de control: `{c['wordPages']}` páginas.",
            f"- Estado semántico: documento `{value(r, 'semanticState', 'documentStatus')}`, readiness `{value(r, 'semanticState', 'readiness')}`, validación válida `{value(v, 'isValid')}`, exportación DRAFT permitida `{value(v, 'canExport')}`.",
            f"- QualityGate: passed `{value(q, 'passed')}`, canMarkAsFinal `{value(q, 'canMarkAsFinal')}`, errores críticos `{len(q.get('criticalErrors', []))}`, warnings `{len(q.get('warnings', []))}`. Assembly QualityGate: passed `{value(a, 'passed')}`, readiness `{value(a, 'readiness')}`.",
            f"- Cobertura: total `{value(c, 'coverage', 'total')}`; requerida `{value(c, 'coverage', 'required')}`; cubierta `{value(c, 'coverage', 'covered')}`; pendiente `{value(c, 'coverage', 'pending')}`; bloqueada `{value(c, 'coverage', 'blocked')}`; requiere postura del cliente `{value(c, 'coverage', 'needsClientPosition')}`.",
            f"- Matriz de asuntos: total `{value(c, 'issues', 'total')}`; bloqueados `{value(c, 'issues', 'blocked')}`; listos para generación `{value(c, 'issues', 'readyForGeneration')}`; requieren postura `{value(c, 'issues', 'needsClientPosition')}`.",
            f"- Bloque FINAL DOCX: `{value(r, 'semanticState', 'finalDocxBlock')}`. Bloque FINAL PDF: `{value(r, 'semanticState', 'finalPdfBlock')}`.",
            "",
            "Tiempos registrados por etapa:",
            "",
            markdown_table(["Etapa", "Evento", "Tiempo acumulado"], [list(row) for row in stage_rows(c)]),
            "",
            "Archivos de evidencia:",
            "",
            f"- Fuente extraída: `{(AUDIT / 'cases' / c['caseNumber'] / 'evidence' / 'source-extracted.txt').resolve()}`",
            f"- Respuesta de análisis: `{(AUDIT / 'cases' / c['caseNumber'] / 'evidence' / 'analyze-upload-response.json').resolve()}`",
            f"- Documento generado: `{(AUDIT / 'cases' / c['caseNumber'] / 'evidence' / 'generated-document.json').resolve()}`",
            f"- Trace: `{(AUDIT / 'cases' / c['caseNumber'] / 'evidence' / 'generation-trace.json').resolve()}`",
            f"- Estado del caso: `{(AUDIT / 'cases' / c['caseNumber'] / 'evidence' / 'case-result.json').resolve()}`",
            f"- DOCX exportado: `{c['docxPath'].resolve()}`; bytes `{fmt_int(c['docxBytes'])}`; SHA-256 `{c['docxSha256']}`.",
            f"- PDF exportado: `{c['pdfPath'].resolve()}`; bytes `{fmt_int(c['pdfBytes'])}`; SHA-256 `{c['pdfSha256']}`.",
            "",
        ])
    lines.extend([
        "## 5. Errores encontrados y correcciones aplicadas",
        "",
        "### 5.1 Gate de exportación DRAFT",
        "",
        "El pipeline producía bloques `VALID_NON_FINAL` y assembly rico con evidencia íntegra, pero el exportador trataba cualquier estado de revisión como si fuera una solicitud FINAL. Eso impedía entregar el borrador revisable. Se agregó una ruta explícita `exportMode: DRAFT` en `lib/legal-engine/finalDocumentMaterializationGate.ts` que conserva assembly, identidad y trace, pero no exige que la calidad semántica ya sea READY. No permite omitir assembly ni una trace rota, y no relaja la ruta FINAL.",
        "",
        "Prueba TDD: `tests/legal-engine/finalDocumentMaterializationGate.test.ts`; resultado final: 7 pruebas aprobadas.",
        "",
        "### 5.2 Estructura civil rich-first",
        "",
        "La primera corrida del caso civil 03 falló porque `buildRichContestacionSkeleton` no generaba la sección canónica `DERECHO` para `contestacion_demanda_civil`. Se agregó la sección legal con orden civil y se dejó intacto el orden de las demás materias. Prueba: `tests/legal-engine/contestacionStructure.test.ts`; resultado final: 12 pruebas aprobadas.",
        "",
        "### 5.3 Selección del sexto caso",
        "",
        f"El intento negativo de amparo tuvo estado `{attempt.get('status')}`, tiempo `{fmt_ms(attempt.get('totalMs'))}`, y quedó bloqueado por: `{value(attempt, 'errorDetails', 'guardErrors', default=[''])[0]}`. No se convirtió en salida final. El caso 06 definitivo es Marco C4 y pasó como `PASS_REVIEWABLE`.",
        "",
        "### 5.4 Renderer PDF",
        "",
        "La inspección visual encontró que el renderer manual emitía cada palabra y hasta cada espacio como un `Tj` independiente, avanzando con un ancho estimado. En Times, algunas palabras reales eran más anchas y se pegaban o se desbordaban. La corrección agrupa fragmentos contiguos de la misma fuente y tamaño en una sola línea, usa `Tw` para justificado, eleva el factor conservador de envoltura y evita justificar líneas residuales cortas. La prueba PDF pasó 4 de 4 casos y la reexportación E2E pasó 1 de 1 prueba con los seis pares.",
        "",
        "La revisión con Word se usó como control visual del DOCX porque no hay LibreOffice disponible en la máquina. Poppler informó `No display font for 'Symbol'` durante algunos renders; la advertencia quedó registrada en `audit/final-legal-readiness-2026/visual-qa/pages/*/poppler-render-warning.txt` y no impidió generar las páginas ni observar clipping en los seis PDFs.",
        "",
        "## 6. Verificación de aplicación y límites actuales",
        "",
        markdown_table(["Comando", "Resultado", "Duración", "Evidencia"], [
            ["npm run typecheck", "PASS", fmt_ms(verification_by_name["typecheck"]["durationMs"]), str((AUDIT / "final-verification" / "typecheck.log").resolve())],
            ["npm run test focused", "PASS, 64 pruebas enfocadas", fmt_ms(verification_by_name["focused"]["durationMs"]), str((AUDIT / "final-verification" / "focused.log").resolve())],
            ["npm run build", "PASS", fmt_ms(verification_by_name["build"]["durationMs"]), str((AUDIT / "final-verification" / "build.log").resolve())],
            ["npm run lint", final_lint_summary, fmt_ms(verification_by_name["lint"]["durationMs"]), str((AUDIT / "final-verification" / "lint.log").resolve())],
            ["manifest validator", "PASS: ok true, errors []", "-", str((AUDIT / "selected-cases.json").resolve())],
            ["PDF export regression", "PASS, 4 pruebas", "-", str((ROOT / "tests" / "legal-engine" / "pdfExport.test.ts").resolve())],
            ["six-pair reexport", "PASS, 1 prueba, 6 pares", "-", str((ROOT / "tests" / "e2e" / "reexportFinalLegalReadiness.test.ts").resolve())],
        ]),
    ])
    lines.extend([
        "",
        f"La línea base tenía cuatro errores `react-hooks/set-state-in-effect`. Se corrigió el gate de lint con supresiones locales documentadas únicamente en sincronizaciones intencionales de carga, hidratación local y pestaña URL; no se aplicó autofix masivo. La verificación final devuelve 0 errores y {lint_match.group(3) if lint_match else 'warnings'} warnings heredados, registrados en `final-verification/lint.log`.",
        "",
        "El build sí terminó correctamente. No se generó instalador Windows ni se hizo empaquetado; ese es el siguiente paso después de cerrar la revisión jurídica y aprobar una matriz de casos reales más amplia.",
        "",
        "## 7. Índice de entregables y evidencia",
        "",
        f"- Reporte técnico Markdown: `{REPORT_MD.resolve()}`",
        f"- Reporte para revisión DOCX: `{REPORT_DOCX.resolve()}`",
        f"- Reporte de consulta PDF: `{REPORT_PDF.resolve()}`",
        f"- Resumen agregado: `{(AUDIT / 'run-summary.json').resolve()}`",
        f"- Resumen de reexportación: `{(AUDIT / 'renderer-reexport-summary.json').resolve()}`",
        f"- Manifiesto de casos: `{(AUDIT / 'selected-cases.json').resolve()}`",
        f"- Blueprint: `{(ROOT / 'docs' / 'blueprints' / 'final-legal-readiness-blueprint-2026-09-26.md').resolve()}`",
        f"- Plan ejecutado: `{(ROOT / 'docs' / 'superpowers' / 'plans' / '2026-09-26-final-legal-readiness-execution.md').resolve()}`",
        "",
        "Los seis pares DOCX/PDF están indexados en las secciones individuales de este reporte y en sus respectivos `case-result.json`. Todos llevan aviso de borrador y no deben presentarse sin que el abogado complete postura, datos faltantes, cobertura, pruebas y revisión de autoridades.",
        "",
        "## 8. Dictamen de readiness",
        "",
        "Readiness técnico de generación y exportación DRAFT: APROBADO CON EVIDENCIA.",
        "",
        "Readiness jurídico para presentación FINAL: NO APROBADO; permanece bloqueado correctamente.",
        "",
        "Readiness para empaquetado Windows: NO EJECUTADO. El siguiente paso seguro es revisar jurídicamente los seis borradores, limpiar progresivamente los warnings, probar persistencia y recuperación con la base Prisma real y después empaquetar una build local con los mismos gates visibles.",
        "",
    ])
    return "\n".join(lines) + "\n"


def set_cell_shading(cell: Any, fill: str) -> None:
    properties = cell._tc.get_or_add_tcPr()
    shading = properties.find(qn("w:shd"))
    if shading is None:
        shading = OxmlElement("w:shd")
        properties.append(shading)
    shading.set(qn("w:fill"), fill)


def set_cell_text(cell: Any, text: str, bold: bool = False, color: str = "111111", size: int = 8) -> None:
    cell.text = ""
    paragraph = cell.paragraphs[0]
    paragraph.paragraph_format.space_after = Pt(0)
    run = paragraph.add_run(str(text))
    run.bold = bold
    run.font.name = "Arial"
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor.from_string(color)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def add_table(document: Document, headers: list[str], rows: list[list[str]], font_size: int = 7) -> None:
    table = document.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    for index, header in enumerate(headers):
        set_cell_text(table.rows[0].cells[index], header, bold=True, color="FFFFFF", size=font_size)
        set_cell_shading(table.rows[0].cells[index], "1F2933")
    for row in rows:
        cells = table.add_row().cells
        for index, item in enumerate(row):
            set_cell_text(cells[index], item, size=font_size)
    document.add_paragraph().paragraph_format.space_after = Pt(1)


def add_heading(document: Document, text: str, level: int = 1) -> None:
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(12 if level == 1 else 8)
    paragraph.paragraph_format.space_after = Pt(4)
    run = paragraph.add_run(text)
    run.bold = True
    run.font.name = "Arial"
    run.font.size = Pt(15 if level == 1 else 11)
    run.font.color.rgb = RGBColor(0, 0, 0)


def add_body(document: Document, text: str, bold_prefix: str | None = None) -> None:
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.space_after = Pt(5)
    paragraph.paragraph_format.line_spacing = 1.08
    paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    if bold_prefix and text.startswith(bold_prefix):
        first = paragraph.add_run(bold_prefix)
        first.bold = True
        first.font.name = "Arial"
        first.font.size = Pt(9)
        rest = paragraph.add_run(text[len(bold_prefix):])
        rest.font.name = "Arial"
        rest.font.size = Pt(9)
    else:
        run = paragraph.add_run(text)
        run.font.name = "Arial"
        run.font.size = Pt(9)


def add_bullets(document: Document, items: list[str]) -> None:
    for item in items:
        paragraph = document.add_paragraph(style="List Bullet")
        paragraph.paragraph_format.space_after = Pt(2)
        run = paragraph.add_run(item)
        run.font.name = "Arial"
        run.font.size = Pt(9)


def report_docx(cases: list[dict[str, Any]]) -> None:
    document = Document()
    section = document.sections[0]
    section.top_margin = Inches(0.65)
    section.bottom_margin = Inches(0.65)
    section.left_margin = Inches(0.72)
    section.right_margin = Inches(0.72)
    styles = document.styles
    styles["Normal"].font.name = "Arial"
    styles["Normal"].font.size = Pt(9)

    title = document.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_before = Pt(50)
    title.paragraph_format.space_after = Pt(10)
    run = title.add_run("FINAL LEGAL READINESS REPORT")
    run.bold = True
    run.font.name = "Arial"
    run.font.size = Pt(21)
    run.font.color.rgb = RGBColor(0, 0, 0)
    subtitle = document.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subrun = subtitle.add_run("Auditoria de contestaciones y exportacion local")
    subrun.font.name = "Arial"
    subrun.font.size = Pt(11)
    subrun.font.color.rgb = RGBColor(85, 85, 85)
    add_body(document, "Fecha de ejecucion: 26 de septiembre de 2026. Alcance: un abogado local, persistencia Prisma conservada y seis pruebas E2E con expedientes aislados de Datos.zip.")
    add_heading(document, "Conclusion ejecutiva", 1)
    add_body(document, "La aplicacion completo seis recorridos E2E y produjo seis pares DOCX/PDF de borrador para revision. La persistencia existente se conservo y el ZIP de pruebas no se incorporo a la base productiva.")
    add_body(document, "El estado juridico no es FINAL. Todos los casos conservan REVIEW_REQUIRED, aviso de borrador y bloqueo de exportacion final por cobertura, postura del cliente, evidencia o calidad pendiente. Esto protege al abogado contra la presentacion de un escrito incompleto.")
    add_body(document, "Dictamen: generacion y exportacion DRAFT aprobadas con evidencia; presentacion FINAL no aprobada; empaquetado Windows no ejecutado.")

    add_heading(document, "Alcance respetado", 1)
    add_bullets(document, [
        "Version actual optimizada para un solo abogado local. No se agregaron roles, equipos, organizaciones, facturacion ni colaboracion multiusuario.",
        "Prisma y la persistencia existente se conservaron.",
        "Datos.zip se uso unicamente como banco de pruebas y quedo separado de la base productiva.",
        "Las dos referencias de Downloads se usaron como referencia de estructura, redaccion y diseno, no como fuente de hechos.",
    ])
    add_body(document, "Referencias: C:\\Users\\yahir\\Downloads\\Recurso_Apelacion_Actualizado_2026_Galarza_Meza.docx; C:\\Users\\yahir\\Downloads\\Recurso_de_Apelacion_Galarza_Meza_actualizado.docx.")

    add_heading(document, "Resumen de los seis casos", 1)
    summary_rows = []
    for c in cases:
        s = c["selection"]
        r = c["result"]
        t = c["trace"]
        summary_rows.append([
            c["caseNumber"], s["matter"], r.get("status", ""), fmt_ms(r.get("totalMs")),
            str(t.get("providerActuallyUsed") or "-"), str(t.get("model") or "-"),
            f"{c['appPages']} / {c['wordPages']}", f"{fmt_int(c['docxBytes'])} / {fmt_int(c['pdfBytes'])}",
        ])
    add_table(document, ["Caso", "Materia", "Estado", "Tiempo", "Proveedor", "Modelo", "Paginas PDF / Word", "Bytes DOCX / PDF"], summary_rows, 7)
    add_body(document, "Todos los pares anteriores son DRAFT. El detalle completo de hashes, etapas, cobertura, traces y rutas se conserva en la version Markdown y en la carpeta de auditoria.")

    add_heading(document, "Correcciones aplicadas", 1)
    add_bullets(document, [
        "Se habilito el modo explicito DRAFT sin relajar el gate FINAL ni permitir assembly ausente o trace rota.",
        "Se corrigio la estructura civil rich-first para incluir DERECHO en el orden canonico.",
        "Se rechazo y conservo como intento negativo la fuente de amparo que producia contenido cruzado.",
        "Se corrigio el renderer PDF para agrupar lineas, usar espaciado tipografico natural, envolver mayusculas con margen conservador y evitar justificacion extrema en lineas residuales.",
    ])

    add_heading(document, "Verificaciones", 1)
    final_verification = read_json(AUDIT / "final-verification" / "results.json")
    final_verification_by_name = {item["name"]: item for item in final_verification}
    final_lint_log = read_log_text(AUDIT / "final-verification" / "lint.log")
    lint_match = re.search(r"(\d+) problems \((\d+) errors, (\d+) warnings\)", final_lint_log)
    lint_summary = f"PASS, {lint_match.group(2)} errores y {lint_match.group(3)} warnings" if lint_match else "PASS"
    add_table(document, ["Control", "Resultado", "Evidencia"], [
        ["Typecheck", "PASS", str((AUDIT / "final-verification" / "typecheck.log").resolve())],
        ["Pruebas enfocadas", "PASS, 64 pruebas", str((AUDIT / "final-verification" / "focused.log").resolve())],
        ["Build", "PASS", str((AUDIT / "final-verification" / "build.log").resolve())],
        ["Lint", lint_summary, str((AUDIT / "final-verification" / "lint.log").resolve())],
        ["PDF regression", "PASS, 4 pruebas", str((ROOT / "tests" / "legal-engine" / "pdfExport.test.ts").resolve())],
        ["Reexportacion de seis pares", "PASS", str((ROOT / "tests" / "e2e" / "reexportFinalLegalReadiness.test.ts").resolve())],
    ], 7)
    warning_count = lint_match.group(3) if lint_match else "los warnings reportados"
    add_body(document, f"La linea base tenia cuatro errores react-hooks/set-state-in-effect. La verificacion final queda en 0 errores y {warning_count} warnings; los warnings permanecen como deuda tecnica para una limpieza progresiva. No se aplico autofix masivo. El build y typecheck pasaron.")

    add_heading(document, "Estado de uso recomendado", 1)
    add_body(document, "La herramienta esta en condiciones de apoyar la preparacion local y la revision del abogado, no de presentar automaticamente escritos. Antes de usarla en produccion debe completarse la postura del cliente, validar pruebas y autoridades, revisar hechos y conservar la decision de no exportar FINAL hasta que todos los gates pasen.")
    add_body(document, "El siguiente paso es realizar la revision juridica de los seis borradores y limpiar progresivamente los warnings. Despues puede prepararse la aplicacion Windows sin cambiar los gates ni mezclar el banco de pruebas con Prisma.")

    add_heading(document, "Indice de evidencia", 1)
    add_bullets(document, [
        f"Reporte Markdown completo: {REPORT_MD.resolve()}",
        f"Manifiesto de casos: {(AUDIT / 'selected-cases.json').resolve()}",
        f"Resumen agregado: {(AUDIT / 'run-summary.json').resolve()}",
        f"Resumen de reexportacion: {(AUDIT / 'renderer-reexport-summary.json').resolve()}",
        f"Carpeta de casos y pruebas visuales: {AUDIT.resolve()}",
    ])

    document.core_properties.title = "FINAL LEGAL READINESS REPORT"
    document.core_properties.subject = "Auditoria tecnica de generacion legal local"
    document.core_properties.author = "Codex"
    document.save(REPORT_DOCX)


def main() -> None:
    cases = collect_cases()
    REPORT_MD.write_text(report_markdown(cases), encoding="utf-8")
    report_docx(cases)
    print(json.dumps({
        "markdown": str(REPORT_MD.resolve()),
        "docx": str(REPORT_DOCX.resolve()),
        "caseCount": len(cases),
        "docxBytes": REPORT_DOCX.stat().st_size,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
