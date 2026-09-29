from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "audit" / "professional-drafting-phase3"
SUMMARY_PATH = AUDIT / "run-summary.json"
GLOBAL_TESTS_PATH = AUDIT / "qa" / "vitest-global-isolated-final5.json"
ESLINT_REPORT_PATH = AUDIT / "qa" / "eslint-final5.json"
VISUAL_QA_PATH = AUDIT / "qa" / "visual-artifacts" / "phase3-final-review-final5" / "visual-qa-summary.json"
FINAL_MD = ROOT / "FINAL_LEGAL_READINESS_REPORT.md"
PHASE3_MD = AUDIT / "PHASE3_PROFESSIONAL_DRAFTING_REPORT.md"
REPORT_DOCX = ROOT / "FINAL_LEGAL_READINESS_REPORT.docx"
REPORT_PDF = ROOT / "FINAL_LEGAL_READINESS_REPORT.pdf"

NAVY = "20364F"
TEAL = "167D8D"
PALE = "EAF2F5"
LIGHT = "F4F7F9"
GRAY = "5E6B75"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def relative(path_value: str | None) -> str:
    if not path_value:
        return "No generado"
    path = Path(path_value)
    try:
        return path.resolve().relative_to(ROOT.resolve()).as_posix()
    except (ValueError, OSError):
        return path.as_posix()


def safe_text(value: object) -> str:
    return str(value if value is not None else "-").replace("|", "\\|").replace("\r", " ").replace("\n", " ")


def pct(value: object) -> str:
    try:
        return f"{float(value) * 100:.1f}%"
    except (TypeError, ValueError):
        return "0.0%"


def cell_shading(cell, fill: str) -> None:
    properties = cell._tc.get_or_add_tcPr()
    shading = OxmlElement("w:shd")
    shading.set(qn("w:fill"), fill)
    properties.append(shading)


def set_repeat_table_header(row) -> None:
    tr_properties = row._tr.get_or_add_trPr()
    repeat = OxmlElement("w:tblHeader")
    repeat.set(qn("w:val"), "true")
    tr_properties.append(repeat)


def set_cell(cell, text: object, *, bold: bool = False, color: str | None = None, size: float = 8.0) -> None:
    cell.text = ""
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    paragraph = cell.paragraphs[0]
    paragraph.paragraph_format.space_after = Pt(0)
    run = paragraph.add_run(str(text if text is not None else "-"))
    run.bold = bold
    run.font.name = "Aptos"
    run.font.size = Pt(size)
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def add_table(document: Document, headers: list[str], rows: list[list[object]], *, size: float = 7.5):
    table = document.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    table.autofit = True
    header = table.rows[0]
    set_repeat_table_header(header)
    for index, label in enumerate(headers):
        set_cell(header.cells[index], label, bold=True, color="FFFFFF", size=size)
        cell_shading(header.cells[index], NAVY)
    for row_index, values in enumerate(rows):
        cells = table.add_row().cells
        fill = "FFFFFF" if row_index % 2 == 0 else LIGHT
        for index, value in enumerate(values):
            set_cell(cells[index], value, size=size)
            cell_shading(cells[index], fill)
    document.add_paragraph().paragraph_format.space_after = Pt(1)
    return table


def add_heading(document: Document, text: str, level: int = 1) -> None:
    paragraph = document.add_paragraph(style=f"Heading {level}")
    paragraph.paragraph_format.keep_with_next = True
    paragraph.add_run(text)


def add_body(document: Document, text: str, *, bold_prefix: str | None = None) -> None:
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.space_after = Pt(5)
    paragraph.paragraph_format.line_spacing = 1.08
    if bold_prefix and text.startswith(bold_prefix):
        paragraph.add_run(bold_prefix).bold = True
        paragraph.add_run(text[len(bold_prefix):])
    else:
        paragraph.add_run(text)


def add_bullets(document: Document, items: list[str]) -> None:
    for item in items:
        paragraph = document.add_paragraph(style="List Bullet")
        paragraph.paragraph_format.space_after = Pt(2)
        paragraph.add_run(item)


def global_test_summary() -> dict:
    if not GLOBAL_TESTS_PATH.is_file():
        return {"available": False}
    data = json.loads(GLOBAL_TESTS_PATH.read_text(encoding="utf-8"))
    failures = []
    for suite in data.get("testResults", []):
        for assertion in suite.get("assertionResults", []):
            if assertion.get("status") == "failed":
                failures.append({
                    "suite": Path(suite.get("name", "")).name,
                    "test": assertion.get("fullName", assertion.get("title", "")),
                    "message": (assertion.get("failureMessages") or [""])[0],
                })
    fields = (
        "numTotalTestSuites", "numPassedTestSuites", "numFailedTestSuites",
        "numPendingTestSuites", "numTotalTests", "numPassedTests",
        "numFailedTests", "numPendingTests", "success", "startTime",
    )
    return {"available": True, **{key: data.get(key, 0) for key in fields}, "failures": failures}


def lint_summary() -> dict:
    if not ESLINT_REPORT_PATH.is_file():
        return {"available": False}
    data = json.loads(ESLINT_REPORT_PATH.read_text(encoding="utf-8"))
    return {
        "available": True,
        "files": len(data),
        "errors": sum(int(item.get("errorCount", 0)) for item in data),
        "warnings": sum(int(item.get("warningCount", 0)) for item in data),
        "fatal": sum(int(item.get("fatalErrorCount", 0)) for item in data),
    }


def visual_qa_summary() -> dict:
    if not VISUAL_QA_PATH.is_file():
        return {"available": False}
    data = json.loads(VISUAL_QA_PATH.read_text(encoding="utf-8"))
    return {"available": True, **data}


def compare_depth_outputs(results: list[dict]) -> list[dict]:
    by_case: dict[str, dict[str, dict]] = {}
    for result in results:
        by_case.setdefault(result["caseNumber"], {})[result["draftDepth"]] = result
    comparisons = []
    for case, profiles in sorted(by_case.items()):
        professional = profiles["PROFESSIONAL_20"]
        extensive = profiles["EXTENSIVE_40"]
        p_text = Path(professional["files"]["generatedText"]).read_text(encoding="utf-8")
        e_text = Path(extensive["files"]["generatedText"]).read_text(encoding="utf-8")
        p_norm = re.sub(r"\s+", " ", p_text).strip().casefold()
        e_norm = re.sub(r"\s+", " ", e_text).strip().casefold()
        p_words = set(re.findall(r"[\w]+", p_norm, flags=re.UNICODE))
        e_words = set(re.findall(r"[\w]+", e_norm, flags=re.UNICODE))
        union = p_words | e_words
        comparisons.append({
            "case": case,
            "pages20": professional.get("exports", {}).get("actualPdfPages", 0),
            "pages40": extensive.get("exports", {}).get("actualPdfPages", 0),
            "words20": professional.get("exports", {}).get("pdfWords", 0),
            "words40": extensive.get("exports", {}).get("pdfWords", 0),
            "normalizedTextEqual": p_norm == e_norm,
            "uniqueWordJaccard": (len(p_words & e_words) / len(union)) if union else 1.0,
            "stop20": professional.get("quality", {}).get("issues", []),
            "stop40": extensive.get("quality", {}).get("issues", []),
        })
    return comparisons


def setup_document() -> Document:
    document = Document()
    section = document.sections[0]
    section.top_margin = Inches(0.65)
    section.bottom_margin = Inches(0.62)
    section.left_margin = Inches(0.72)
    section.right_margin = Inches(0.72)

    normal = document.styles["Normal"]
    normal.font.name = "Aptos"
    normal.font.size = Pt(9.2)
    normal.font.color.rgb = RGBColor.from_string("243746")
    normal.paragraph_format.space_after = Pt(4)
    title_style = document.styles["Title"]
    title_style.font.name = "Aptos Display"
    title_style.font.size = Pt(22)
    title_style.font.bold = True
    title_style.font.color.rgb = RGBColor.from_string("17212B")
    for style_name, size, color in [("Heading 1", 15, "17212B"), ("Heading 2", 11.5, "17212B"), ("Heading 3", 10, "17212B")]:
        style = document.styles[style_name]
        style.font.name = "Aptos Display"
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor.from_string(color)

    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.paragraph_format.space_before = Pt(3)
    run = footer.add_run("CONFIDENCIAL | Auditoría local | APP-plantillas  |  ")
    run.font.name = "Aptos"
    run.font.size = Pt(8)
    run.font.color.rgb = RGBColor.from_string(GRAY)
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    footer._p.append(field)
    return document


def build_markdown(summary: dict, results: list[dict], artifact_rows: list[dict], elapsed_sum_ms: int, global_tests: dict, lint: dict, visual_qa: dict) -> str:
    counts = summary["counts"]
    comparisons = compare_depth_outputs(results)
    lines = [
        "# Informe final de preparación legal — Fase 3",
        "",
        f"**Fecha de ejecución:** {summary['generatedAt']}  ",
        "**Estado:** NO LISTA PARA USO JURÍDICO PRODUCTIVO; no se inicia empaquetado Windows.  ",
        "**Unidad de trabajo:** un abogado local; Prisma se conserva; no se implementa multiusuario.",
        "",
        "> Las 12 salidas son borradores de revisión, no escritos presentables. El E2E técnico de la fase pasó; la calidad jurídica y la completitud del expediente no alcanzaron readiness.",
        "",
        "## 1. Dictamen ejecutivo",
        "",
        "La matriz ejecutó seis fuentes distintas, cada una con los perfiles `PROFESSIONAL_20` y `EXTENSIVE_40`. Se generaron 12 DOCX y 12 PDF de revisión, se verificaron sus hashes y se comprobó que la exportación FINAL sigue bloqueada en los 24 intentos. No hubo fallos técnicos de análisis/exportación en esta matriz.",
        "",
        f"| Indicador | Resultado |\n|---|---:|\n| Casos distintos | {summary['requestedCaseCount']} |\n| Ejecuciones | {counts['total']} |\n| DOCX de revisión | {counts['docx']} |\n| PDF de revisión | {counts['pdf']} |\n| Exportaciones con fallo técnico | {counts['failed']} |\n| Gate de calidad PASS | {counts['qualityPass']} |\n| Gate REVIEW_REQUIRED | {counts['qualityReviewRequired']} |\n| Gate FAIL | {counts['qualityFail']} |\n| Duración acumulada de pipelines | {elapsed_sum_ms:,} ms |\n| Escrituras Prisma en el runner | 0; autenticación sí intentó lectura al datasource aislado no enrutable |\n| Proveedor remoto en los 12 E2E Phase 3 | No; credenciales vaciadas en el proceso E2E |",
        "",
        "No se declara la aplicación al 100%. Tras corregir el falso negativo semántico, 8 salidas quedaron `FAIL` por renglones boilerplate y 4 `REVIEW_REQUIRED`; ninguna pasó el gate. Persisten de 2 a 45 posturas fácticas pendientes por fuente, cobertura reconocida de hechos/prestaciones/prueba en cero, cero autoridades oficiales verificadas/aplicadas y entre 1 y 2 páginas y 70-461 palabras por borrador, lejos de los rangos indicativos de 18-24 y 35-45 páginas. La expansión se detuvo con `CONTENT_LIMIT_REACHED` por falta de soporte confirmado; no se añadió relleno.",
        "",
        "## 2. Alcance y salvaguardas",
        "",
        "- El único usuario de esta versión es un abogado local. No se añadieron usuarios, roles, equipos ni cuentas.",
        "- Se conserva la persistencia/arquitectura Prisma existente. El runner no escribe datos en Prisma ni llama a `saveGenerationArtifact`; el handler de análisis sí ejecuta una lectura de identidad `prisma.organization.findUnique()` durante autenticación. En estas corridas `DATABASE_URL` apuntó al host aislado `127.0.0.1:1`, la conexión fue rechazada y la aplicación siguió con fallback local. No se intentó conectar al datasource productivo en la corrida aislada.",
        f"- El ZIP `C:\\Users\\yahir\\Desktop\\Datos.zip` se usó solo como banco de prueba. El manifiesto `{relative(str(ROOT / 'audit/final-legal-readiness-2026/selected-cases.json'))}` declara `productionDatabaseExcluded: true`; sus seis fuentes tienen hashes distintos.",
        "- Los datos de prueba no se insertaron en la base productiva ni se usaron como datos permanentes.",
        "- Para la matriz Phase 3 y las corridas finales aisladas se vaciaron las claves `NVIDIA_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, se fijó `NVIDIA_REAL_TEST=false` y `DATABASE_URL` apuntó a `127.0.0.1:1/isolated_test`; la matriz E2E no importó Prisma ni hizo escrituras. No se imprimieron valores secretos.",
        "- **Incidente de privacidad que no debe ocultarse:** una corrida focalizada previa, antes de aislar el proceso, heredó credenciales. Los logs confirman solicitudes reales a Gemini y Groq (algunas exitosas y otras con 429) y una solicitud iniciada a NVIDIA. Fueron pruebas con fixtures sintéticos/en código, no el E2E del ZIP `Datos.zip`. Esa primera invocación tampoco fijó la URL de base de datos de prueba; la evidencia no permite afirmar que no hubiera consulta o escritura de BD. No se registraron valores de claves. Se recomienda revisar el historial de uso/retención de los proveedores y auditar el datasource si aplica.",
        "- Los proveedores externos no se deben reactivar con expedientes reales hasta documentar autorización y tratamiento/retención; las corridas posteriores de esta auditoría sí usaron aislamiento explícito.",
        "- Los nombres originales de fuentes se omiten de este reporte; cada caso se identifica por número y SHA-256 para limitar exposición de datos personales.",
        "- No se compiló ni empaquetó Windows. Se respeta el límite expreso de no pasar todavía a Windows.",
        "",
        "## 3. Método E2E, ruta y límites de cobertura",
        "",
        f"- Manifiesto de selección: `{relative(str(ROOT / 'audit/final-legal-readiness-2026/selected-cases.json'))}`.",
        f"- Runner: `{relative(str(ROOT / 'scripts/audit/run-professional-drafting-phase3.ts'))}`.",
        f"- Test: `{relative(str(ROOT / 'tests/e2e/professionalDraftingPhase3.test.ts'))}`.",
        "- Ruta recorrida por cada fuente: extracción `mammoth` -> `POST /api/templates/analyze-upload` -> `createSourceDocument` -> `runGenerationPipeline` -> DOCX `DRAFT` -> PDF `DRAFT` -> lectura del PDF para páginas/palabras -> intentos DOCX/PDF `FINAL` y comprobación del bloqueo.",
        "- La ejecución invoca handler, motor y exportadores en el mismo proceso; no inicia navegador/UI. Por ello es E2E de ruta/pipeline/exportación, no una prueba visual automatizada de interfaz.",
        "- Se comprueba SHA-256 de cada fuente extraída frente al manifiesto antes de procesarla y se almacenan el documento estructurado, texto generado, trazas y resultado por ejecución.",
        "- El gate FINAL verifica `FINAL_DOCUMENT_MATERIALIZATION_NOT_VERIFIED` por falta de postura, campos, cobertura y estado listo; ninguna exportación FINAL pasa.",
        "",
        "### Inspección visual de las 24 salidas",
        "",
        (f"Los 12 DOCX se abrieron en Word en modo de solo lectura y se exportaron a PDF de QA; los 12 PDF emitidos por la app se rasterizaron con Poppler a 144 dpi. Se produjeron {visual_qa.get('renderedPages', 0)} imágenes para {visual_qa.get('renderedArtifacts', 0)} artefactos y se inspeccionaron visualmente todas las páginas; no se detectaron caracteres U+FFFD. "
         f"El PDF del motor suma {visual_qa.get('appPdfPages', 0)} páginas y el DOCX abierto/renderizado en Word {visual_qa.get('docxPagesInWord', 0)}. "
         f"La cuenta de páginas difiere en {visual_qa.get('pageCountMismatches', 0)}/12 pares; el vocabulario único coincide (Jaccard 100% en los pares), pero las secuencias/conteos extraídos no son idénticos y la paridad de paginación no pasa. Poppler registró {visual_qa.get('popplerMissingSymbolWarnings', 0)} avisos `No display font for Symbol`; el rasterizado terminó y las páginas fueron inspeccionadas." if visual_qa.get("available") else "No hay resumen final de la inspección visual; no se declara revisada la paridad de los 24 artefactos."),
        "Hallazgo visual: se inspeccionaron las 34 páginas renderizadas. El cuerpo de varias contestaciones es una lista de renglones `Hecho N - Fuente: fuente documental 1, página 1`, sin el contenido o resumen del hecho. En expedientes con muchas filas, la última página conserva solo algunas líneas y deja amplio espacio vacío. La salida Word/DOCX también difiere en tipografía/estilo y paginación respecto del PDF de la aplicación. Es evidencia de que el borrador no tiene desarrollo jurídico suficiente aunque el DOCX/PDF abra sin caracteres de reemplazo.",
        "La guía `render_docx.py` no pudo convertir porque falta `soffice.exe`; se usó Microsoft Word instalado, abriendo los DOCX generados en solo lectura y exportando copias de QA, sin alterar los 12 DOCX de prueba.",
        "",
        "## 4. Matriz de las 12 ejecuciones",
        "",
        "`Requeridos/Cubiertos` cuenta cobertura reconocida por el motor, no el número de hechos mencionados. El motor no recibió posturas del abogado ni un proveedor jurídico remoto en esta ejecución.",
        "",
        "| Caso | Perfil | Fuente SHA-256 (prefijo) | Validada | Páginas | Palabras | ms | Posturas pendientes | Hechos req./cub. | Prestaciones req./cub. | Pruebas req./cub. | Secciones cub./req. | Repetición | Párrafo duplicado | Duplicación exacta | Semántica | Copia fuente | Gate |",
        "|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    for result in results:
        cov = result.get("coverage", {})
        quality = result.get("quality") or {}
        required_sections = int(cov.get("requiredSectionCount") or 0)
        rendered_sections = int(cov.get("renderedSectionCount") or 0)
        section_value = f"{rendered_sections}/{required_sections}" if required_sections else "0/0"
        lines.append(
            f"| {result['caseNumber']} | {result['draftDepth']} | `{result['sourceSha256'][:16]}…` | "
            f"{str(bool(result.get('source', {}).get('sourceValidated'))).lower()} | "
            f"{result.get('exports', {}).get('actualPdfPages', 0)} | {result.get('exports', {}).get('pdfWords', 0)} | {result.get('totalMs', 0)} | "
            f"{cov.get('attorneyFactPositionsPending', 0)} | {cov.get('factItemsCovered', 0)}/{cov.get('requiredFactItems', 0)} | "
            f"{cov.get('claimItemsCovered', 0)}/{cov.get('requiredClaimItems', 0)} | "
            f"{cov.get('evidenceItemsCovered', 0)}/{cov.get('requiredEvidenceItems', 0)} | {section_value} | "
            f"{pct(quality.get('repetitionRatio', 0))} | {pct(quality.get('duplicateParagraphRatio', 0))} | "
            f"{pct(quality.get('exactDuplicateRatio', 0))} | {pct(quality.get('semanticDuplicateRatio', 0))} | "
            f"{pct(quality.get('sourceCopyRatio', 0))} | {quality.get('qualityGate', '-')} |"
        )
    lines.extend([
        "",
        "### Métricas adicionales de sustancia y seguridad por salida",
        "",
        "| Caso | Perfil | Palabras sustantivas | Palabras duplicadas | Placeholders | Preguntas pendientes | Autoridades verificadas/aplicadas | Hechos cubiertos | Pretensiones cubiertas | Cobertura de prueba | Cobertura de secciones | Errores coherencia | Errores provenance |",
        "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ])
    for result in results:
        quality = result.get("quality") or {}
        lines.append(
            f"| {result['caseNumber']} | {result['draftDepth']} | {quality.get('substantiveWords', 0)} | {quality.get('duplicatedWords', 0)} | "
            f"{quality.get('placeholderCount', 0)} | {quality.get('unresolvedAttorneyQuestions', 0)} | "
            f"{quality.get('verifiedAuthorityCount', 0)}/{quality.get('appliedAuthorityCount', 0)} | "
            f"{quality.get('factsCovered', 0)} | {quality.get('claimsCovered', 0)} | {pct(quality.get('evidenceCoverage', 0))} | "
            f"{pct(quality.get('sectionCoverage', 0))} | {quality.get('coherenceErrors', 0)} | {quality.get('provenanceErrors', 0)} |"
        )
    lines.extend([
        "",
        "### Comparación directa de profundidad por caso",
        "",
        "La comparación normaliza espacios y mayúsculas del texto generado por perfil y calcula Jaccard sobre palabras únicas. Una igualdad exacta se informa como hallazgo, no se presenta como diferenciación exitosa.",
        "",
        "| Caso | Páginas 20/40 | Palabras 20/40 | Texto normalizado idéntico | Jaccard léxico | Parada 20 / 40 |",
        "|---:|---:|---:|---:|---:|---|",
    ])
    for item in comparisons:
        lines.append(
            f"| {item['case']} | {item['pages20']}/{item['pages40']} | {item['words20']}/{item['words40']} | "
            f"{str(item['normalizedTextEqual']).lower()} | {pct(item['uniqueWordJaccard'])} | "
            f"{', '.join(item['stop20'])} / {', '.join(item['stop40'])} |"
        )
    identical_count = sum(bool(item["normalizedTextEqual"]) for item in comparisons)
    lines.extend([
        "",
        f"**Hallazgo comparativo:** texto normalizado idéntico en {identical_count}/{len(comparisons)} pares; el Jaccard léxico y las páginas/palabras coinciden. Como todas las salidas detuvieron la expansión por falta de postura/soporte (`CONTENT_LIMIT_REACHED`), la igualdad evita fabricar contenido, pero la auditoría NO demuestra profundidad incremental de `EXTENSIVE_40`. Ese criterio de aceptación sigue abierto.",
    ])
    lines.extend([
        "",
        f"**Resultado común 12/12:** `aiUsed=false`; `contentStopReason=CONTENT_LIMIT_REACHED`; autoridades verificadas/aplicadas `0/0`; exportaciones DOCX/PDF no vacías; `FINAL_DOCUMENT_MATERIALIZATION_NOT_VERIFIED` en ambas exportaciones finales. Quality gates: {summary['counts']['qualityFail']} FAIL, {summary['counts']['qualityReviewRequired']} REVIEW_REQUIRED, {summary['counts']['qualityPass']} PASS. La autenticación intentó una lectura Prisma al host de prueba no enrutable, falló con conexión rechazada y continuó en fallback; el runner registró 0 escrituras y el resumen no reportó errores de generación/exportación.",
        "",
        "## 5. Salidas, rutas, tamaños y hashes",
        "",
        "Las 24 salidas son borradores restringidos de revisión. Los hashes se recalcularon desde los bytes escritos por el runner.",
        "",
        "| Caso | Perfil | Formato | Bytes | SHA-256 | Ruta relativa al proyecto |",
        "|---:|---|---|---:|---|---|",
    ])
    for item in artifact_rows:
        lines.append(f"| {item['case']} | {item['depth']} | {item['format']} | {item['bytes']:,} | `{item['sha256']}` | `{item['path']}` |")
    lines.extend([
        "",
        "**Evidencia adicional por caso/perfil:** `evidence/generation-request-summary.json`, `evidence/generated-document.json`, `evidence/generated-text.txt`, `evidence/run-result.json`; trazas JSON/Markdown se escriben cuando el motor las produce. `audit/professional-drafting-phase3/run-summary.json` consolida la ejecución. Los directorios `cases/01` a `cases/06` guardan la fuente extraída y la respuesta de análisis; contienen material de expediente y no se deben publicar.",
        "",
        "## 6. Hallazgo reproducible y corrección TDD",
        "",
        "### Hallazgo inicial",
        "",
        "La primera matriz local generó texto mecánico por cada hecho sin postura: dos marcadores repetidos de `REQUIERE DEFINIR POSTURA DEL ABOGADO`, una respuesta idéntica y la referencia. Aunque no copiaba los hechos fuente ni inventaba admisiones, la repetición hacía que ocho salidas reprobaran el detector de duplicación. La línea base observada antes de reparar fue:",
        "",
        "| Caso (PROFESSIONAL_20, línea base) | Páginas | Palabras PDF | Dup. exacta | Resultado calidad |",
        "|---:|---:|---:|---:|---|",
        "| 01 | 4 | 540 | 32.6% | FAIL |",
        "| 02 | 5 | 672 | 32.3% | FAIL |",
        "| 03 | 2 | 130 | 14.0% | REVIEW_REQUIRED |",
        "| 04 | 1 | 64 | 9.1% | REVIEW_REQUIRED |",
        "| 05 | 3 | 358 | 25.2% | FAIL |",
        "| 06 | 5 | 768 | 33.1% | FAIL |",
        "",
        "En el primer conjunto de 12 perfiles hubo 8 `FAIL` y 4 `REVIEW_REQUIRED`. La repetición estructural del marcador fue la causa confirmada del exceso de n-gramas; el crecimiento de páginas no tenía contenido jurídico adicional ni soporte habilitante.",
        "",
        "### Hipótesis, RED y cambio mínimo",
        "",
        "Hipótesis: `buildFactResponseText` repetía una advertencia idéntica por cada hecho pendiente y el medidor de shingles de 10 palabras contaba esas repeticiones. Se añadió una prueba con tres posturas no confirmadas y referencias distintas. RED: falló como se esperaba; encontró 6 apariciones del marcador frente a 1 permitida. GREEN: una única advertencia explica que la cita de fuente no supone admisión/negación; una lista compacta conserva número de hecho y fuente/página; el contenido fuente no se presenta como admitido; los hechos con `lawyerPosition` explícita conservan su respuesta manual y referencia.",
        "",
        "Post-corrección de marcador y con el medidor semántico ampliado: duplicación exacta `0.0%` en 12/12, pero duplicación semántica entre `16.7%` y `89.8%`. Ocho salidas (casos 01, 02, 05 y 06, ambos perfiles) quedan `FAIL`; las cuatro de casos 03/04 quedan `REVIEW_REQUIRED`; `PASS=0`. El nuevo RED había detectado `0.0%` ante 12 filas `Hecho N - Fuente...`; GREEN reemplazó ordinales y contó la repetición estructural, elevando los casos extensos a 56.0-89.8%. La corrección no fabrica una postura y evita presentar una métrica falsamente limpia.",
        "",
        "### Por qué ambos perfiles se detienen con longitud similar",
        "",
        "`PROFESSIONAL_20` y `EXTENSIVE_40` modifican presupuestos y objetivos máximos (18–24 frente a 35–45 páginas, 10,000 frente a 20,000 palabras y distintos límites de llamadas/pases). No autorizan rellenar. El camino Phase 3 solo amplía secciones si queda cobertura requerida con hechos cuya postura `lawyerPosition` fue confirmada, evidencia con procedencia de la fuente o autoridad oficial vigente/aplicable/verificada. En los 12 runs, no hubo una postura confirmada ni autoridad aplicable/verificada; la evaluación de soporte detuvo la expansión. Igualdad de tamaño en este escenario es un resultado seguro, pero la salida no satisface la meta profesional.",
        "",
        "## 7. Correcciones y archivos de implementación",
        "",
        "| Ruta | Cambio |",
        "|---|---|",
        "| `lib/legal-engine/draftDepth.ts` | Perfiles con límites, rango indicativo y evaluación de soporte no consumido. |",
        "| `lib/legal-engine/legalDocumentPlan.ts` | Matriz canónica de respuesta fáctica; distingue postura del abogado de propuesta/inferencia. |",
        "| `lib/legal-engine/professionalDraftQuality.ts` | Medición de páginas/palabras, shingles, copia fuente, placeholders, cobertura, coherencia y procedencia. |",
        "| `lib/legal-engine/generationExtension.ts` | Mapea los perfiles a presupuestos existentes sin remover compatibilidad legacy. |",
        "| `lib/legal-engine/generationExpansion.ts` | Expansión focalizada solo en soporte verificable; deduplicación y límites explícitos; sin rellenar cuando falta soporte. |",
        "| `lib/legal-engine/pipeline.ts` | Propaga profundidad, plan/matriz y motivo de detención; el fallback reúne hechos pendientes y solo reconoce `lawyerPosition`/respuesta manual explícitas. |",
        "| `lib/legal-engine/generationLock.ts`, `lib/legal-engine/types.ts` | Profundidad en huella de idempotencia y metadata con compatibilidad legacy. |",
        "| `app/api/legal-engine/generate/route.ts` | Valida la profundidad y la propaga a ruta síncrona/asíncrona; valor inválido devuelve `400 INVALID_DRAFT_DEPTH`. |",
        "| `app/machotes/components/CaseDocumentsReader.tsx`, `ContestacionesConfigPanel.tsx`, `app/machotes/page.tsx` | Selector por caso: profesional o extensa; advierte que el rango es aproximado y el soporte tiene prioridad. |",
        "| `scripts/audit/run-professional-drafting-phase3.ts`, `tests/e2e/professionalDraftingPhase3.test.ts` | Banco ZIP aislado, seis fuentes hash-pinned, 12 ejecuciones, evidencia y validación de gates de revisión/final. |",
        "| `tests/legal-engine/*Phase3*`, `tests/api/legalEngineDraftDepthRoute.test.ts`, `tests/components/contestacionesConfigPanelPhase3.test.tsx` | Regresiones para perfiles, contenido no inventado, soporte, deduplicación, selector y API. |",
        "",
        "### OCR: control de confianza y geometría de fixtures",
        "",
        "La prueba RED reprodujo un falso `sourceValidated=true`: el OCR tenía confianza 55 aunque el puntaje de calidad de texto era 100. La confianza OCR no estaba participando en la decisión de elegibilidad. Ahora una confianza menor a 70 conserva el texto extraído para revisión, pero fija `sourceValidated=false`, `sourceQualityStatus=NEEDS_SOURCE_REVIEW` y `NEEDS_MANUAL_REVIEW`; no se envía como fuente autorizada a generación. La prueba mock reprodujo y luego verificó el bloqueo.",
        "También se corrigió el generador de PDFs sintéticos: fijaba dimensiones 850x300 aunque el JPEG medía 850x360 y lo estiraba en página carta. Ahora lee el tamaño real con Sharp, conserva proporción y centra la imagen; se corrigieron fixtures multipágina. La aceptación OCR final fue 10/10 en 7.18 s; la carga local de un scan ejercitó el pipeline, y el caso de confianza baja permaneció en revisión manual.",
        "Archivos relevantes: `lib/pdf/documentExtractor.ts`, `tests/acceptance/ocrAcceptance.test.ts`, `tests/acceptance/helpers/syntheticFixtures.ts`.",
        "",
        "## 8. Comandos y verificación",
        "",
        "| Comando | Resultado observado |",
        "|---|---|",
        "| `npm run typecheck` | Exit 0 después de la corrección semántica; `tsc --noEmit` sin errores. |",
        "| Vitest focalizado Phase 3 | 13/13; 0 fallas; 2.96 s después de incluir el caso de boilerplate numerado. Antes de ese último test, 5 archivos/21 pruebas pasaron en 3.94 s. |",
        f"| `npm run test:e2e:phase3 -- --silent --reporter=dot` | 1/1 test; 12 runs; 12 DOCX + 12 PDF; 0 fallas técnicas; 6.27 s en la repetición aprobada. El primer intento tras cambiar el gate falló por la aserción antigua de REVIEW_REQUIRED; el contrato se actualizó a 8 FAIL/4 REVIEW_REQUIRED y luego pasó. Pipeline acumulado {elapsed_sum_ms:,} ms. |",
        f"| `npm run lint -- --format json` | {lint.get('files', 'sin dato')} archivos, {lint.get('errors', 'sin dato')} errores, {lint.get('fatal', 'sin dato')} fatales, {lint.get('warnings', 'sin dato')} warnings. |",
        "| Test RED de marcador repetido | Falló por el motivo esperado: 6 apariciones del marcador frente a 1 permitida. |",
        "| Test RED de boilerplate semántico | Falló con `semanticDuplicateRatio=0` (esperado >0.7) ante 12 líneas que solo cambian el número; 2.69 s. |",
        "| Test GREEN de boilerplate semántico | 13/13 del archivo `professionalDraftingPhase3.red.test.ts` pasan; la matriz real eleva la duplicación semántica y bloquea 8 salidas. |",
        "",
        "### Suite global aislada (corrida final posterior a las métricas de calidad)",
        "",
        (f"`npm test -- --reporter=json --outputFile={relative(str(GLOBAL_TESTS_PATH))}`: "
         f"{global_tests.get('numPassedTestSuites', 0)}/{global_tests.get('numTotalTestSuites', 0)} suites aprobadas, "
         f"{global_tests.get('numFailedTestSuites', 0)} con falla; "
         f"{global_tests.get('numPassedTests', 0)} pruebas aprobadas, {global_tests.get('numFailedTests', 0)} fallidas, "
         f"{global_tests.get('numPendingTests', 0)} omitidas/pendientes. "
         "Claves de proveedores vacías y DATABASE_URL aislada/no enrutable. "
         "Los seis smoke tests de proveedores reales se omiten deliberadamente sin credenciales; cuatro skips adicionales pertenecen a la suite existente." if global_tests.get("available") else "No hay resumen global final disponible; no se declara la suite aprobada."),
        "",
        "Las dos fallas del resumen final se concentran en `tests/legal-engine/testamentoContestacionStructure.test.ts`: dos aserciones esperan al menos seis hechos extraídos y reciben cinco. Es un límite de extracción/cobertura del flujo de contestación familiar, no debe “arreglarse” bajando el umbral sin evidencia. No se reproduce información personal del fixture. Las suites previas que habían mostrado resultados parciales ya fueron sustituidas por esta medición global completa; sus logs históricos se conservan como evidencia, no se suman otra vez al conteo final.",
        "",
        "### Clasificación de los 59 fallos históricos informados en Fase 2",
        "",
        f"La corrida de Fase 2 registró 2,965 PASS, 59 FAIL, 3 skipped y 4 errores no manejados en 300 archivos. La clasificación conservada en `PHASE2_SOURCE_GROUNDING_REPORT.md` fue: (1) cuotas/HTTP 429 de proveedores reales, ahora omitidos si faltan claves, por lo que el flujo real sigue sin validarse; (2) cuota de BD remota Prisma, que esta corrida no prueba porque se usó URL aislada y no demuestra por sí sola que la configuración productiva esté corregida; (3) errores de worker Tesseract en fixtures sintéticos, mitigados por corrección de geometría y OCR acceptance 10/10; (4) aserción obsoleta de catálogo 305 frente a 306, que pasa en el resumen global actual; (5) expectativas antiguas de mensajes de exportación y (6) otros flujos con fixtures/tamaños distintos. No se afirma que todos los 59 históricos estén corregidos; el estado actual verificable son las dos fallas familiares descritas arriba, {global_tests.get('numPendingTests', 0)} pendientes y {lint.get('warnings', 0)} warnings de lint.",
        "",
        "### Incidente previo de proveedor y datasource",
        "",
        "En una ejecución focalizada anterior a este aislamiento, los logs confirmaron llamadas reales a Gemini y Groq, incluidas respuestas exitosas y 429, y una solicitud iniciada a NVIDIA. El incidente no usó el banco `Datos.zip`; usó fixtures de tests sintéticos/en código. En esa primera invocación no se había fijado `DATABASE_URL` aislada; no puede afirmarse que no hubiera acceso a BD. No se observaron valores secretos en los logs. Revisar usage/request logs, retención y auditoría del datasource antes de uso real.",
        "",
        "### Lint, TypeScript y build",
        "",
        (f"`npm run lint -- --format json --output-file={relative(str(ESLINT_REPORT_PATH))}`: "
         f"{lint.get('files', 0)} archivos, {lint.get('errors', 0)} errores, {lint.get('fatal', 0)} fatales y "
         f"{lint.get('warnings', 0)} warnings." if lint.get("available") else "No hay resumen JSON final de ESLint disponible."),
        "`npm run typecheck`: pasó al final tras agregar `repetitionRatio`, `duplicateParagraphRatio` y detección semántica de boilerplate numerado (exit 0).",
        "`node node_modules/next/dist/bin/next build --webpack`: terminó con exit 0; Next 16.3.4 compiló, typecheck interno y páginas estáticas 7/7. No se ejecutó empaquetado Windows.",
        "Incidencia de verificación de servidor: después del build, el chequeo HTTP a `http://localhost:3200/` falló con conexión no disponible y no se encontró proceso Next activo. No hay evidencia para atribuir causalidad al build ni se inició/terminó proceso adicional. `.next` fue generado por el build estándar. Un `.next-phase3-audit-20260927` temporal de una tentativa inconclusa sigue en el workspace; se comprobó que no hay proceso Next usándolo y se excluyó del lint. Las órdenes de borrado explícito fueron bloqueadas por la política del entorno, por lo que se conserva y se deja anotado, sin afectar las salidas ni el build.",
        "",
        "",
        "## 9. Incidencias, límites y riesgos abiertos",
        "",
        "1. **No hay borradores jurídicamente completos.** Los 12 resultados son 8 `FAIL` por duplicación semántica y 4 `REVIEW_REQUIRED`; 0% de hechos, pretensiones y prueba reconocidos como cubiertos y 0 autoridades verificadas/aplicadas. No usar expedientes en producción.",
        "2. **Faltan decisiones del abogado.** Por caso hay 2, 4, 16, 31, 39 o 45 hechos sin postura explícita (el mismo conteo aplica a ambos perfiles). No se deriva una admisión/negación desde `position`, observaciones ni propuestas de modelo.",
        "3. **Proveedor real no validado con expedientes reales.** La corrida de aceptación final tuvo proveedores apagados. Una ejecución focalizada previa sí hizo llamadas Gemini/Groq y comenzó una solicitud NVIDIA con fixtures sintéticos; el detalle y los límites de evidencia se documentan arriba. No se midieron calidad, latencia, privacidad contractual, retención ni recuperación con datos autorizados.",
        "4. **Objetivos de páginas no alcanzados.** Los resultados tienen 1–2 páginas finales y 70–461 palabras; no se fuerza longitud si no existe soporte, postura o autoridad.",
        f"5. **La suite global tiene fallas conocidas.** {global_tests.get('numFailedTests', 'sin dato')} tests fallan en `{global_tests.get('numFailedTestSuites', 'sin dato')}` suite(s), por extracción de hechos testamentarios (se esperan >=6 y se obtienen 5). No se declara verde; hay {global_tests.get('numPendingTests', 'sin dato')} tests omitidos/pendientes.",
        f"6. **Lint con advertencias.** {lint.get('warnings', 'sin dato')} warnings y {lint.get('errors', 'sin dato')} errores en {lint.get('files', 'sin dato')} archivos; requiere revisión posterior antes de release.",
        f"7. **Paridad DOCX/PDF pendiente.** Word visualizó {visual_qa.get('docxPagesInWord', 0)} páginas frente a {visual_qa.get('appPdfPages', 0)} del exportador; {visual_qa.get('pageCountMismatches', 0)}/12 pares difieren en páginas.",
        "8. **Empaquetado Windows pendiente.** No se abrió esa fase ni se afirma compatibilidad/distribución Windows.",
        "",
        "## 10. Decisión y siguientes condiciones",
        "",
        "**Decisión de readiness:** el harness de selección, ejecución en memoria, trazabilidad de archivos y exportación DRAFT pasó la prueba acotada. El producto completo no está listo para uso jurídico productivo ni para empaque Windows.",
        "",
        "Para reabrir readiness se requieren, en este orden: (a) abogado confirma postura y respuestas para cada hecho y define pretensiones/defensas; (b) enriquecer la cobertura de pruebas y secciones desde el expediente; (c) autorizar o rechazar de manera informada el uso de proveedor externo con estos datos, o usar fixtures desidentificados; (d) repetir seis E2E y QA visual de cada salida con contenido suficiente; (e) resolver la suite heredada de Prisma en una base de prueba aislada; (f) eliminar/revisar warnings de lint; (g) solo entonces considerar Windows, sin saltarse gates de exportación FINAL.",
        "",
        "## 11. Índice de evidencia y reportes relacionados",
        "",
        f"- Resumen JSON de fase 3: `{relative(str(SUMMARY_PATH))}`.",
        f"- Manifiesto hash-pinned de seis fuentes: `{relative(str(ROOT / 'audit/final-legal-readiness-2026/selected-cases.json'))}`.",
        f"- Evidencia generada: `{relative(str(AUDIT / 'cases'))}`.",
        f"- Reporte técnico específico de esta fase: `{relative(str(PHASE3_MD))}`.",
        f"- Reporte DOCX: `{relative(str(REPORT_DOCX))}`; reporte PDF: `{relative(str(REPORT_PDF))}`.",
        "- Reporte histórico de Fase 2, preservado sin sobrescribir: `PHASE2_SOURCE_GROUNDING_REPORT.md`.",
        "- Blueprint vigente de alcance y salvaguardas: `docs/blueprints/final-legal-readiness-blueprint-2026-09-26.md`.",
        "- Plan de ejecución Phase 3: `docs/superpowers/plans/2026-09-27-professional-legal-drafting-phase3.md`.",
        "",
        "---",
        "",
        "Reporte técnico generado desde `run-summary.json`. Se omiten nombres de las fuentes y valores de credenciales; los originales permanecen únicamente en el área local de auditoría.",
        "",
    ])
    return "\n".join(lines)


def build_docx(summary: dict, results: list[dict], artifact_rows: list[dict], elapsed_sum_ms: int, global_tests: dict, lint: dict, visual_qa: dict) -> None:
    document = setup_document()
    comparisons = compare_depth_outputs(results)
    qualities = [result.get("quality") or {} for result in results]
    semantic_ratios = [float(item.get("semanticDuplicateRatio") or 0) for item in qualities]
    semantic_range = f"{pct(min(semantic_ratios))}–{pct(max(semantic_ratios))}" if semantic_ratios else "sin dato"
    title = document.add_paragraph(style="Title")
    title.paragraph_format.space_after = Pt(2)
    run = title.add_run("INFORME FINAL DE PREPARACIÓN LEGAL")
    subtitle = document.add_paragraph()
    subtitle.paragraph_format.space_after = Pt(8)
    run = subtitle.add_run(f"Fase 3 - Redacción profesional - {summary['generatedAt'][:10]} - Auditoría local")
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor.from_string(GRAY)

    add_body(document, f"DICTAMEN: NO LISTA PARA USO JURÍDICO PRODUCTIVO. {summary['counts']['qualityFail']} salidas quedaron en FAIL y {summary['counts']['qualityReviewRequired']} en REVIEW_REQUIRED; 0 pasaron calidad y ninguna exportación FINAL fue habilitada. No se inicia Windows.", bold_prefix="DICTAMEN:")

    add_heading(document, "Resumen ejecutivo", 1)
    add_body(document, "Se probaron seis fuentes distintas en dos profundidades (12 ejecuciones). Se generaron 12 DOCX y 12 PDF de revisión, se validaron hashes y se verificó el bloqueo FINAL. La matriz Phase 3 pasó técnicamente; el contenido jurídico no alcanzó readiness.")
    add_table(document, ["Indicador", "Resultado"], [
        ["Fuentes / ejecuciones", "6 distintas / 12"],
        ["DOCX / PDF de revisión", "12 / 12"],
        ["Fallos técnicos de la matriz", "0"],
        ["Calidad PASS / REVIEW_REQUIRED / FAIL", f"{summary['counts']['qualityPass']} / {summary['counts']['qualityReviewRequired']} / {summary['counts']['qualityFail']}"],
        ["Cobertura hechos / prestaciones / pruebas", "0% / 0% / 0%"],
        ["Autoridad oficial verificada/aplicada", "0 / 0"],
        ["Repetición / párrafo duplicado", "0.0% / 0.0% en 12/12"],
        ["Exacta / semántica / copia fuente", f"0.0% / {semantic_range} / 0.0%"],
        ["Tiempo de pipeline acumulado", f"{elapsed_sum_ms:,} ms"],
    ])
    add_body(document, "No se declara 100% listo: los resultados tienen 1-2 páginas y 70-461 palabras. Ocho borradores fallan por duplicación semántica de renglones; cuatro permanecen en revisión por falta de postura, cobertura y soporte. La expansión se detuvo cuando ya no existía soporte confirmado; no se añadió texto para aparentar longitud.")

    add_heading(document, "Alcance, privacidad y persistencia", 1)
    add_bullets(document, [
        "Versión local para un abogado. No se añadieron roles, equipos ni administración multiusuario.",
        "Prisma se conserva. El runner no escribe en Prisma ni persiste artefactos de generación. La autenticación del handler intentó leer identidad con prisma.organization.findUnique() contra la URL de prueba aislada; la conexión fue rechazada y se usó el fallback local.",
        "C:\\Users\\yahir\\Desktop\\Datos.zip fue solo banco E2E. Manifiesto con productionDatabaseExcluded=true y seis SHA-256 distintos; no se insertaron fuentes en la base productiva.",
        "En los E2E y corridas finales las claves de proveedores se vaciaron y DATABASE_URL apuntó a una URL de prueba aislada/no enrutable. El handler intentó leer identidad con prisma.organization.findUnique(), recibió conexión rechazada en 127.0.0.1:1 y continuó con fallback local. El runner registró cero escrituras Prisma.",
        "Incidente previo que debe considerarse: una corrida focalizada anterior heredó credenciales y los logs confirman solicitudes a Gemini/Groq (algunas exitosas, otras 429) y una solicitud iniciada a NVIDIA; fueron fixtures sintéticos/en código, no `Datos.zip`. No se había fijado URL de BD aislada en esa invocación, por lo que no se puede descartar acceso a base de datos. No se imprimieron claves. Revisar logs de uso/retención de proveedores y auditoría de datasource.",
        "No se empaquetó Windows por instrucción expresa.",
    ])

    add_heading(document, "Método E2E y decisiones de seguridad", 1)
    add_body(document, "Ruta: mammoth -> POST /api/templates/analyze-upload -> createSourceDocument -> runGenerationPipeline -> exportUniversalToDocx(DRAFT) -> exportUniversalToPdf(DRAFT) -> conteo desde PDF -> ambos intentos FINAL. El E2E es de handler/pipeline/exportación en proceso, no automatización de navegador.")
    add_body(document, "Cada fuente se verificó contra el manifiesto antes de analizar. Para cada salida FINAL se observó FINAL_DOCUMENT_MATERIALIZATION_NOT_VERIFIED, con causas de procedencia, identidad/datos faltantes, preflight y quality gate. No se permitió una presentación final no revisada.")

    add_heading(document, "Resultados por caso y profundidad", 1)
    result_rows = []
    for result in results:
        coverage = result.get("coverage", {})
        quality = result.get("quality") or {}
        result_rows.append([
            result["caseNumber"],
            "Profesional" if result["draftDepth"] == "PROFESSIONAL_20" else "Extensa",
            result.get("exports", {}).get("actualPdfPages", 0),
            result.get("exports", {}).get("pdfWords", 0),
            result.get("totalMs", 0),
            coverage.get("attorneyFactPositionsPending", 0),
            quality.get("qualityGate", "-"),
        ])
    add_table(document, ["Caso", "Perfil", "Págs.", "Palabras", "ms", "Posturas pendientes", "Gate"], result_rows, size=7.6)
    quality_rows = []
    for result in results:
        quality = result.get("quality") or {}
        quality_rows.append([
            result["caseNumber"], "Profesional" if result["draftDepth"] == "PROFESSIONAL_20" else "Extensa",
            pct(quality.get("repetitionRatio", 0)), pct(quality.get("duplicateParagraphRatio", 0)),
            pct(quality.get("exactDuplicateRatio", 0)), pct(quality.get("semanticDuplicateRatio", 0)),
            pct(quality.get("sourceCopyRatio", 0)),
        ])
    add_table(document, ["Caso", "Perfil", "Repetición", "Párrafo duplicado", "Exacta", "Semántica", "Copia fuente"], quality_rows, size=7.2)
    substance_rows = []
    coverage_rows = []
    for result in results:
        quality = result.get("quality") or {}
        profile = "Profesional" if result["draftDepth"] == "PROFESSIONAL_20" else "Extensa"
        substance_rows.append([
            result["caseNumber"], profile, quality.get("substantiveWords", 0), quality.get("duplicatedWords", 0),
            quality.get("placeholderCount", 0), quality.get("unresolvedAttorneyQuestions", 0),
            f"{quality.get('verifiedAuthorityCount', 0)}/{quality.get('appliedAuthorityCount', 0)}",
        ])
        coverage_rows.append([
            result["caseNumber"], profile, quality.get("factsCovered", 0), quality.get("claimsCovered", 0),
            pct(quality.get("evidenceCoverage", 0)), pct(quality.get("sectionCoverage", 0)),
            quality.get("coherenceErrors", 0), quality.get("provenanceErrors", 0),
        ])
    add_table(document, ["Caso", "Perfil", "Palabras sustantivas", "Duplicadas", "Placeholders", "Preguntas pendientes", "Autoridades ver./aplic."], substance_rows, size=7.0)
    add_table(document, ["Caso", "Perfil", "Hechos", "Pretensiones", "Pruebas %", "Secciones %", "Errores coherencia", "Errores provenance"], coverage_rows, size=7.0)

    add_heading(document, "Comparación PROFESSIONAL_20 vs EXTENSIVE_40", 1)
    comparison_rows = [[
        item["case"], f"{item['pages20']}/{item['pages40']}", f"{item['words20']}/{item['words40']}",
        "Sí" if item["normalizedTextEqual"] else "No", pct(item["uniqueWordJaccard"]),
    ] for item in comparisons]
    add_table(document, ["Caso", "Páginas 20/40", "Palabras 20/40", "Texto igual", "Jaccard"], comparison_rows, size=7.2)
    identical_count = sum(bool(item["normalizedTextEqual"]) for item in comparisons)
    add_body(document, f"Resultado: texto normalizado idéntico en {identical_count}/{len(comparisons)} expedientes, mismo número de páginas/palabras y Jaccard léxico coincidente. La causa segura es que no había posturas/soporte para ampliar y los 12 pipelines se detuvieron con CONTENT_LIMIT_REACHED; esto evita inventar, pero NO acredita que EXTENSIVE_40 agregue profundidad. El criterio de diferenciación de modos queda abierto.")

    add_heading(document, "Inspección visual y paridad de exportación", 1)
    add_body(document, f"Se renderizaron y revisaron visualmente todas las páginas de los 12 PDF de la aplicación y los 12 DOCX abiertos en Word en solo lectura: {visual_qa.get('renderedPages', 0)} páginas/imágenes en total a 144 dpi. El exportador PDF produjo {visual_qa.get('appPdfPages', 0)} páginas y Word {visual_qa.get('docxPagesInWord', 0)}; {visual_qa.get('pageCountMismatches', 0)}/12 pares discrepan en paginación. El Jaccard de vocabulario único fue 100% por par, pero la secuencia y el conteo de tokens extraídos no fueron idénticos; 0 caracteres de reemplazo. Poppler registró {visual_qa.get('popplerMissingSymbolWarnings', 0)} avisos `No display font for Symbol`; el rasterizado concluyó. No se declara paridad visual. La guía render_docx.py no encontró `soffice.exe`; se usó Word instalado sin modificar los DOCX originales.")
    add_body(document, "En las páginas inspeccionadas, varias salidas repiten filas del tipo `Hecho N - Fuente: fuente documental 1, página 1` sin exponer el texto o resumen fuente del hecho. Los documentos de dos páginas dejan pocas líneas en la última y mucho espacio en blanco. Esto confirma que el contenido sigue siendo un checklist pobre, no una contestación desarrollada.")

    add_heading(document, "Causa y corrección de la repetición", 1)
    add_body(document, "En la primera corrida, buildFactResponseText repetía por cada hecho no resuelto la misma advertencia de postura del abogado y una respuesta genérica. El detector de shingles de 10 palabras elevó duplicación a 9.1–33.1%; 8 de 12 perfiles quedaron en FAIL y 4 en REVIEW_REQUIRED. Después, el análisis visual y una nueva regresión revelaron un falso negativo: filas `Hecho N - Fuente...` solo diferían por número y la duplicación semántica se reportaba como 0%.")
    add_body(document, "TDD: una prueba con tres hechos pendientes falló como se esperaba (6 marcadores, debía haber 1). La corrección agrupa una sola advertencia, conserva número y fuente/página por hecho, no reproduce el relato fuente como admisión y solo utiliza lawyerPosition/manualResponse explícitos cuando existen. Se amplió el detector semántico para normalizar ordinales; el caso RED de 12 filas dio 0.0% frente al esperado >70%, luego GREEN pasó 13/13. Resultado final: duplicación exacta 0.0%, pero semántica 16.7–89.8%; 8 FAIL, 4 REVIEW_REQUIRED y 0 PASS.")
    add_table(document, ["Caso inicial - Profesional", "Páginas", "Palabras", "Dup. exacta", "Gate inicial"], [
        ["01", 4, 540, "32.6%", "FAIL"], ["02", 5, 672, "32.3%", "FAIL"],
        ["03", 2, 130, "14.0%", "REVIEW_REQUIRED"], ["04", 1, 64, "9.1%", "REVIEW_REQUIRED"],
        ["05", 3, 358, "25.2%", "FAIL"], ["06", 5, 768, "33.1%", "FAIL"],
    ])
    add_body(document, "Los perfiles cambian límites de llamadas/pases y rangos indicativos, no el deber de soporte. Como ninguno de los casos tenía posturas fácticas explícitas ni autoridades oficiales verificadas, el expander no tenía paquetes admisibles. Ambos perfiles se detuvieron con CONTENT_LIMIT_REACHED.")

    add_heading(document, "OCR: confianza y corrección de fixtures", 1)
    add_body(document, "La prueba RED reprodujo una fuente con confianza OCR 55 y calidad de texto 100 que, incorrectamente, quedaba `sourceValidated=true`. El umbral de confianza 70 ahora participa en la validación: por debajo de él se conserva el texto pero `sourceValidated=false`, estado NEEDS_SOURCE_REVIEW y NEEDS_MANUAL_REVIEW. Se corrigió también el fixture PDF escaneado: la imagen JPEG medía 850x360 aunque el PDF declaraba 850x300, y se estiraba en carta; ahora Sharp obtiene dimensiones reales, conserva proporción y centra la imagen, incluidas páginas múltiples. `tests/acceptance/ocrAcceptance.test.ts`: 10/10 en 7.18 s; el scan sintético válido ejercitó la carga local y el caso de confianza baja quedó en revisión.")

    add_heading(document, "Cambios de software incluidos", 1)
    add_table(document, ["Área", "Cambio"], [
        ["Profundidad", "Perfiles PROFESSIONAL_20/EXTENSIVE_40, contratos y validación de entrada.",],
        ["Plan legal", "Matriz de postura fáctica y plan con IDs canónicos; propuestas del modelo no equivalen a instrucción.",],
        ["Expansión", "Sólo hechos con postura confirmada, evidencia trazable y autoridad oficial aplicable; stop reason y deduplicación.",],
        ["Calidad", "Métricas de páginas, palabras, duplicación, placeholders, cobertura, coherencia y procedencia.",],
        ["Interfaz/API", "Selector de profundidad por caso; validación API y propagación síncrona/asíncrona.",],
        ["Pruebas", "Regresiones para no invención, postura, soporte, repetición, selector, endpoint y E2E de seis fuentes.",],
    ])

    add_heading(document, "Verificación ejecutada", 1)
    add_table(document, ["Comando", "Resultado"], [
        ["npm run typecheck", "Exit 0; tsc --noEmit sin errores."],
        ["Vitest focalizado (métricas finales)", "13/13 regresiones; 0 fallas; 2.96 s. La corrida previa de cinco archivos fue 21/21 en 3.94 s."],
        ["npm run test:e2e:phase3", "1/1 test; 12 corridas; 12 DOCX + 12 PDF; 0 fallas técnicas; 6.27 s en la repetición aprobada; pipeline acumulado consignado arriba."],
        ["npm test global", f"{global_tests.get('numPassedTests', 0)} aprobadas; {global_tests.get('numFailedTests', 0)} fallidas; {global_tests.get('numPendingTests', 0)} omitidas; JSON aislado."],
        ["npm run lint", f"{lint.get('files', 'sin dato')} archivos; {lint.get('errors', 'sin dato')} errores; {lint.get('warnings', 'sin dato')} warnings; se excluyó salida temporal generada de Next."],
        ["Next production build", "Exit 0; Next 16.3.4, webpack compile, typecheck, páginas estáticas 7/7. No es empaquetado Windows."],
    ])
    add_heading(document, "Fallas globales confirmadas", 2)
    add_body(document, f"La corrida final aislada contabilizó {global_tests.get('numTotalTestSuites', 0)} suites ({global_tests.get('numPassedTestSuites', 0)} aprobadas, {global_tests.get('numFailedTestSuites', 0)} fallidas) y {global_tests.get('numTotalTests', 0)} tests ({global_tests.get('numPassedTests', 0)} aprobados, {global_tests.get('numFailedTests', 0)} fallidos, {global_tests.get('numPendingTests', 0)} pendientes/omitidos). Las dos fallas están en `testamentoContestacionStructure.test.ts`: dos aserciones piden al menos seis hechos y la extracción obtiene cinco. No se baja el criterio sin evidencia. Se omitieron seis pruebas de proveedores reales al faltar claves y cuatro casos adicionales ya marcados como pendientes en la suite.")
    add_body(document, "Aislamiento: claves de Gemini, Groq, NVIDIA y OpenRouter vacías; `NVIDIA_REAL_TEST=false`; `DATABASE_URL=postgresql://test:test@127.0.0.1:1/isolated_test?connect_timeout=1`. Los tests de Prisma que intentaron conexión al host de prueba no pudieron conectar y siguieron su fallback local. El incidente focalizado con llamadas reales a proveedores se documenta por separado; no se confunde con esta corrida.")
    add_body(document, "Build verificado; en una comprobación posterior `http://localhost:3200/` no respondió y no se encontró proceso Next activo. No hay evidencia que permita atribuir la indisponibilidad al build; no se levantó ni terminó un servidor adicional. `.next` fue escrito por el build estándar. Un directorio temporal de una tentativa incompleta sigue presente en el workspace y se excluyó del lint porque los comandos de eliminación fueron bloqueados por política del entorno.")

    add_heading(document, "Bloqueos para readiness", 1)
    add_bullets(document, [
        "8/12 salidas FAIL por duplicación semántica y 4/12 REVIEW_REQUIRED; ninguna calidad PASS. No presentar ni tratar como versión final.",
        "Entre 2 y 45 posturas fácticas por caso requieren decisión expresa del abogado; cobertura reconocida de hechos, pretensiones y pruebas es cero.",
        "Cero autoridades oficiales verificadas/aplicadas; el camino de proveedor real no se validó de forma autorizada.",
        "1-2 páginas (70-461 palabras) frente a rangos indicativos; la longitud no se aumenta sin soporte jurídico.",
        "Suite global: dos fallas en extracción de hechos testamentarios (5 extraídos frente al umbral >=6), más diez omitidos/pendientes.",
        f"Lint: {lint.get('warnings', 'sin dato')} warnings, {lint.get('errors', 'sin dato')} errores en {lint.get('files', 'sin dato')} archivos; requieren revisión antes de release.",
        "Build/empaque de Windows no realizado; queda fuera de este ciclo.",
    ])
    add_body(document, "Condiciones para reabrir: instrucciones del abogado sobre hechos y pretensiones; resolver cobertura y prueba desde fuente; decidir uso autorizado de proveedor externo o usar datos desidentificados; repetir matriz y QA visual; aislar las pruebas Prisma; revisar warnings; después evaluar Windows y mantener los gates FINAL.")

    add_heading(document, "Índice de salidas y evidencia", 1)
    for item in artifact_rows:
        add_body(document, f"Caso {item['case']} | {item['depth']} | {item['format']} | {item['bytes']:,} bytes | SHA-256 {item['sha256']}\n{item['path']}")
    add_heading(document, "Fallas históricas de la auditoría Phase 2", 1)
    add_body(document, "La corrida Phase 2 informó 2,965 PASS, 59 FAIL, 3 skipped y 4 errores no manejados en 300 archivos. Sus categorías: (1) cuotas/429 de proveedores; ahora los smoke tests reales se omiten sin claves, por lo que no hay validación real; (2) cuota Prisma remota; el uso de URL aislada en esta corrida no prueba que el datasource productivo se haya corregido; (3) errores de worker Tesseract en scans sintéticos; se ajustaron fixtures y el acceptance OCR actual pasó 10/10; (4) expectativa de catálogo obsoleta 305/306; tests globales actuales pasan ese caso; (5) contratos antiguos de texto de errores de exportación; (6) otros fixtures/tamaños de documento no coincidentes. No se presume que todos los 59 hayan quedado corregidos: el estado global actual tiene dos fallas familiares ya descritas. Véase `PHASE2_SOURCE_GROUNDING_REPORT.md` para el detalle original.")
    add_body(document, f"Resumen y trazas: {relative(str(SUMMARY_PATH))}; suite global: {relative(str(GLOBAL_TESTS_PATH))}; lint: {relative(str(ESLINT_REPORT_PATH))}; casos: {relative(str(AUDIT / 'cases'))}; manifiesto: {relative(str(ROOT / 'audit/final-legal-readiness-2026/selected-cases.json'))}; reporte histórico Phase 2: PHASE2_SOURCE_GROUNDING_REPORT.md; versiones de este reporte: {relative(str(FINAL_MD))}, {relative(str(REPORT_DOCX))}, {relative(str(REPORT_PDF))}.")
    add_body(document, "Se omiten nombres originales de expedientes y valores secretos. Las fuentes y borradores de evidencia permanecen en el área local de auditoría; no publicar ni subirlos a un repositorio.")

    document.save(REPORT_DOCX)


def main() -> None:
    summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
    global_tests = global_test_summary()
    lint = lint_summary()
    visual_qa = visual_qa_summary()
    if not global_tests.get("available") or not lint.get("available") or not visual_qa.get("available"):
        raise SystemExit("Falta evidencia final aislada de Vitest, ESLint o QA visual; no se generan reportes con datos incompletos.")
    results = sorted(summary["results"], key=lambda item: (item["caseNumber"], item["draftDepth"]))
    if len(results) != 12 or len({item["sourceSha256"] for item in results}) != 6:
        raise SystemExit("La evidencia no contiene seis fuentes distintas y doce ejecuciones.")

    artifact_rows: list[dict] = []
    for item in results:
        if item.get("status") != "EXPORTED_REVIEW_DRAFT":
            raise SystemExit(f"Ejecución fallida: caso {item['caseNumber']} {item['draftDepth']}.")
        for format_key, extension in (("docx", "DOCX"), ("pdf", "PDF")):
            raw_path = item.get("files", {}).get(format_key)
            if not raw_path:
                raise SystemExit(f"Falta ruta {extension}: caso {item['caseNumber']}.")
            path = Path(raw_path)
            if not path.is_file() or path.stat().st_size <= 0:
                raise SystemExit(f"Archivo ausente/vacío: {path}.")
            actual_hash = sha256_file(path)
            expected_hash = item.get("exports", {}).get(f"{format_key}Sha256")
            if actual_hash != expected_hash:
                raise SystemExit(f"Hash divergente: {relative(str(path))}.")
            artifact_rows.append({
                "case": item["caseNumber"],
                "depth": item["draftDepth"],
                "format": extension,
                "bytes": path.stat().st_size,
                "sha256": actual_hash,
                "path": relative(str(path)),
            })

    elapsed_sum_ms = sum(int(item.get("totalMs") or 0) for item in results)
    phase3_md = build_markdown(summary, results, artifact_rows, elapsed_sum_ms, global_tests, lint, visual_qa)
    PHASE3_MD.write_text(phase3_md, encoding="utf-8", newline="\n")
    final_prefix = f"""# Informe final de preparación legal\n\n## Dictamen\n\n**No lista para uso jurídico productivo. No se inicia Windows.** La matriz E2E de Fase 3 pasó su contrato técnico: seis fuentes distintas por dos perfiles, 12 DOCX y 12 PDF de revisión, cero fallos técnicos y gates FINAL bloqueados. Sin embargo, ninguna salida superó la calidad: {summary['counts']['qualityFail']} quedaron en `FAIL` y {summary['counts']['qualityReviewRequired']} en `REVIEW_REQUIRED`; 0 `PASS`.\n\n## Alcance preservado\n\nVersión para un abogado local. Se conserva Prisma. `C:\\Users\\yahir\\Desktop\\Datos.zip` se usó sólo como banco de pruebas y no se incorporó a la base productiva. No se implementaron roles ni multiusuario. Los proveedores externos se desactivaron para las corridas E2E aisladas.\n\n## Antecedentes\n\nEl reporte histórico `PHASE2_SOURCE_GROUNDING_REPORT.md` y la evidencia Phase 2 se preservan sin alteración. Este dictamen integra el resultado fresco de Phase 3 y prevalece únicamente para la decisión actual de readiness. La parte técnica completa, la matriz de 12 ejecuciones, rutas, hashes, tiempos, errores, correcciones TDD y límites se conserva abajo y en `audit/professional-drafting-phase3/PHASE3_PROFESSIONAL_DRAFTING_REPORT.md`.\n\n---\n\n"""
    FINAL_MD.write_text(final_prefix + phase3_md, encoding="utf-8", newline="\n")
    build_docx(summary, results, artifact_rows, elapsed_sum_ms, global_tests, lint, visual_qa)
    print(json.dumps({
        "finalMarkdown": str(FINAL_MD),
        "phase3Markdown": str(PHASE3_MD),
        "docx": str(REPORT_DOCX),
        "pdfExpected": str(REPORT_PDF),
        "globalTests": global_tests,
        "lint": lint,
        "visualQa": {key: value for key, value in visual_qa.items() if key != "files"},
        "runs": len(results),
        "artifacts": len(artifact_rows),
        "elapsedPipelineMs": elapsed_sum_ms,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
