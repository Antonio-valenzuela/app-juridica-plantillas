const fs = require('node:fs');
const path = require('node:path');

const reportPath = path.resolve('audit/final-generator-validation/run-2026-09-29T02-39-12/validation-report.json');
const markdownPath = path.resolve('FINAL_LEGAL_READINESS_REPORT.md');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const marker = '## 12. Resultado de la última ejecución Caso 01';

const esc = (value) => String(value ?? '-').replace(/\|/g, '\\|').replace(/[\r\n]+/g, '<br>');
const fmtObj = (obj) => Object.entries(obj || {}).map(([key, value]) => `${key}: ${value}`).join('<br>') || '-';
const fmtReasons = (reasons) => Object.entries(reasons || {}).map(([reason, data]) =>
  `${reason} (${data.occurrences} ocurrencias; ${data.words} palabras)`
).join('<br>') || '-';
const formatUtc = (value) => value ? new Date(value).toISOString() : 'No registrado';
const durationSeconds = Number(report.meta.generationDurationMs) / 1000;
const outputDir = path.join(report.meta.runDir, 'outputs');
const accountingRows = report.wordAccounting.rows.map((row) => [
  row.sectionTitle || row.sectionId,
  row.plannedWords,
  row.providerGeneratedWords,
  row.validatedWords,
  row.rejectedWords,
  row.dedupRemovedWords,
  row.materializedWords,
  row.admittedWords,
  row.assembledWords,
  row.exportedWords,
  fmtReasons(row.lossReasonSummary),
].map(esc).join(' | '));
const coverageRows = report.coverage.trace.map((item) => [
  item.coverageItemId,
  item.category,
  item.targetSectionIds.join(', ') || '-',
  item.required ? 'Sí' : 'No',
  item.pipelineStage,
  item.generationTaskIds.join(', ') || '-',
  item.providerAttemptCount,
  item.providerGeneratedWords,
  item.assembledBlockIds.join(', ') || '-',
  item.finalCoverageStatus,
  item.finalCoverageReason || item.dropReason || '-',
].map(esc).join(' | '));
const source = report.meta.sourcePath
  ? `- Ruta de la fuente extraída: \`${report.meta.sourcePath}\`\n`
  : '';
const outputBytes = report.files.evidenceSizes || {};
const providerDistribution = fmtObj(report.providerInfo.providerDistributionByGenerationTask);
const issueProviderDistribution = fmtObj(report.providerInfo.issueAttemptProviderCounts);
const extensionMetricsDisplay = Object.entries(report.providerInfo.extensionMetrics || {}).map(([key, value]) =>
  `${key}: ${value && typeof value === 'object' ? fmtObj(value) : value}`
).join('<br>') || '-';
const modelDistribution = Object.entries(report.providerInfo.issueAttemptModelsByProvider || {}).map(([provider, models]) =>
  `${provider}: ${fmtObj(models)}`
).join('<br>') || '-';
const fallbackSections = (report.providerInfo.deterministicDraftBlockSections || []).map((id) => id || '(sin sección registrada)').join(', ');
const lossGap = Number(report.wordAccounting.totals.providerGeneratedWords) - Number(report.wordAccounting.totals.assembledWords);
const reasonWords = report.wordAccounting.rows.reduce((sum, row) => sum + Object.values(row.lossReasonSummary || {}).reduce((n, item) => n + Number(item.words || 0), 0), 0);
const dedupTotal = Number(report.wordAccounting.totals.dedupRemovedWords || 0);
const reconciliationDelta = reasonWords - lossGap;
const uniqueReasonWords = reasonWords - dedupTotal;
const unassignedNetGap = lossGap - uniqueReasonWords;

const section = `

${marker}

**Dictamen vigente:** \`${report.meta.result}\`. Esta corrida sustituye la conclusión de readiness anterior para el generador. No acredita uso productivo ni compatibilidad Windows.

El pipeline terminó, pero el preflight DRAFT rechazó la exportación porque faltan auditoría factual trazable y verificación/aplicación de autoridades. Por ello no existe DOCX/PDF jurídico final para inspección visual; no se estima una paginación ni se omite el guard.

### Identificación y fuente

| Campo | Evidencia |
|---|---|
| runId | \`${report.meta.runId}\` |
| Carpeta inmutable del run | \`${report.meta.runDir}\` |
| Inicio UTC | ${formatUtc(report.meta.startedAt)} |
| Fin UTC | ${formatUtc(report.meta.completedAt)} |
| Duración de generación | ${durationSeconds.toFixed(3)} s (${(durationSeconds / 60).toFixed(2)} min) |
| Caso / perfil | ${report.meta.caseNumber} / ${report.meta.draftDepth} |
| Archivo fuente | \`${report.meta.sourceFileName}\` |
| Bytes / SHA-256 | ${report.meta.sourceBytes} / \`${report.meta.sourceSha256}\` |
| Fuente validada / páginas extraídas | ${report.sourceAnalysis.sourceValidated} / ${report.sourceAnalysis.sourcePages} |
| Texto extraído | ${report.sourceAnalysis.extractedCharacters.toLocaleString('es-MX')} caracteres |
| Hechos / pretensiones / pruebas extraídas | ${report.sourceAnalysis.facts} / ${report.sourceAnalysis.claims} / ${report.sourceAnalysis.evidence} |

${source}-Manifiesto de casos: \`audit/final-legal-readiness-2026/selected-cases.json\`.
- Base productiva: excluida por el manifiesto; el ZIP de pruebas no se incorporó a Prisma.
- Consentimiento para esta prueba externa: \`privateCaseContext=${report.meta.privateCaseContext}\`, \`externalProviderOptIn=${report.meta.externalProviderOptIn}\`.

### Providers y resultados de generación

| Medición | Resultado |
|---|---|
| Cadena configurada | ${report.providerInfo.configuredChain.join(' → ')} |
| Distribución por tarea final | ${providerDistribution} |
| Tareas con provider externo | ${report.providerInfo.providerBackedGenerationTasks}/${report.providerInfo.generationTaskExecutions} |
| Estado de tarea final | ${fmtObj(report.providerInfo.providerTaskStatusCounts)} |
| Registros de intentos issue-generation | ${report.providerInfo.issueGenerationAttemptRecords} |
| Intentos por provider | ${issueProviderDistribution} |
| Modelos por provider en los intentos | ${modelDistribution} |
| Intentos con texto de provider | ${report.providerInfo.externalProviderAttemptsWithGeneratedText} |
| Resultado de intentos | ${fmtObj(report.providerInfo.issueAttemptOutcomeCounts)} |
| Estado de validación por intento | ${fmtObj(report.providerInfo.issueAttemptsByValidationStatus)} |
| Llamadas HTTP crudas | No registradas en el trace; no se reporta un total inventado |
| Métricas de extensión | ${extensionMetricsDisplay} |
| Bloques determinísticos en trace | ${report.providerInfo.deterministicDraftBlockCount}; secciones: ${esc(fallbackSections)} |

Interpretación: los 49 registros tienen texto producido por un provider, pero solo 8 finalizaron con outcome \`PROVIDER_SUCCESS\`; 34 fueron \`SEMANTIC_FAILED\` y 7 \`VALIDATION_FAILED\`. En el resumen por tarea, 8 acabaron \`VALID_NON_FINAL\` y 23 \`FAILED\`. Por tanto, texto recibido no equivale a respuesta jurídicamente aprobada.

La cadena permaneció \`Groq → NVIDIA → Gemini → local\`; no se restauró Ollama. El trace distingue intentos y tareas, no cada petición HTTP interna ni sus reintentos.

### Palabras y pérdidas por sección

| Sección | Plan | Provider generó | Validado | Rechazado | Dedupe | Materializado | Admitido | Ensamblado | Exportado trace | Razón de pérdida registrada |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
${accountingRows.map((row) => `| ${row} |`).join('\n')}

#### Reconciliación de contadores

- El texto guardado contiene ${report.document.generatedTextWords.toLocaleString('es-MX')} palabras según el contador Unicode del runner; la métrica interna del Quality Gate registra ${report.document.qualityGateWordCount.toLocaleString('es-MX')}. La diferencia de 23 palabras entre ambos métodos queda visible, no se normaliza.
- El trace registra ${report.wordAccounting.totals.providerGeneratedWords.toLocaleString('es-MX')} palabras generadas y ${report.wordAccounting.totals.assembledWords.toLocaleString('es-MX')} ensambladas; la diferencia es ${lossGap.toLocaleString('es-MX')}.
- Las razones por sección suman ${reasonWords.toLocaleString('es-MX')} palabras, ${reconciliationDelta.toLocaleString('es-MX')} más que la brecha neta. Incluyen ${dedupTotal.toLocaleString('es-MX')} palabras de rechazo por duplicación, que también aparecen en el contador separado \`dedupRemovedWords\`; sumarlos vuelve a contar esa pérdida.
- Si se retira ese doble conteo, las razones únicas suman ${uniqueReasonWords.toLocaleString('es-MX')} palabras y quedan ${unassignedNetGap.toLocaleString('es-MX')} palabras de la brecha generación-ensamblado sin una razón única reconciliable. Los campos del trace agregan reintentos y pérdidas semánticas; no constituyen una ecuación de conservación por palabra.
- Motivos que sí aparecen en el trace: \`ISSUE_DRAFT_BELOW_TARGET\`, \`SOURCE_ENTITY_ID_OUT_OF_SCOPE\`, \`PROVIDER_OUTPUT_TRUNCATED\` y \`EXTENSION_DUPLICATE_REJECTED\`. La tabla informa cada motivo por sección y las ocurrencias/palabras reportadas.
- Exportadas reales: 0. El trace conserva \`exportedWords=0\`; la extracción DOCX/PDF no aplica porque los artefactos no fueron creados.

El plan interno llevaba \`targetWords=${report.document.extensionPlan.targetWords}\`, \`maxGeneratedTokens=${report.document.extensionPlan.maxGeneratedTokens}\`, ${report.document.extensionPlan.maxCallsPerDocument} llamadas máximas, ${report.providerInfo.extensionMetrics.expansionCalls} expansiones y ${report.providerInfo.extensionMetrics.continuationCalls} continuaciones. El motivo final de stop fue \`${report.document.draftContentStopReason}\`. El contador interno señala ${report.document.extensionPlan.internalEstimatedPages} páginas estimadas, pero no es un PDF ni una medición real; queda descartado como resultado de paginación.

### Estructura y calidad del documento ensamblado

| Sección | Palabras ensambladas |
|---|---:|
${report.document.sections.map((item) => `| ${esc(item.title)} | ${item.words} |`).join('\n')}

Proemio, comparecencia, objeto, hechos, prestaciones, excepciones, pruebas, derecho, petitorios y firma están presentes. \`ALEGATOS\` está vacío. Comparecencia y objeto conservan dependencias fácticas sin resolver; aparecen ${report.document.placeholderCount} instancias de placeholders, con estos valores únicos: ${report.document.placeholders.map((value) => `\`${esc(value)}\``).join(', ')}.

| Indicador de integridad | Resultado |
|---|---:|
| factsTotal / factsWithResponse | ${report.quality.factsTotal} / ${report.quality.factsWithResponse} |
| claimsTotal / claimsWithResponse | ${report.quality.claimsTotal} / ${report.quality.claimsWithResponse} |
| factualUnsupportedClaims | ${report.quality.factualUnsupportedClaims} |
| unverifiedFactualClaims | ${report.quality.unverifiedFactualClaims} |
| verifiedAuthorityCount | ${report.quality.verifiedAuthorityCount} |
| appliedAuthorityCount | ${report.quality.appliedAuthorityCount} |
| unsupportedLegalAuthorities | ${report.quality.unsupportedLegalAuthorities} |
| provenanceErrors / status | ${report.quality.provenanceErrors} / ${report.quality.provenanceStatus} |
| coherenceErrors | ${report.quality.coherenceErrors} |
| unsupportedEvidenceCount | ${report.quality.unsupportedEvidenceCount} |
| inappropriateSectionCount | ${report.quality.inappropriateSectionCount} |
| exact / semantic duplicate ratio | ${Number(report.quality.exactDuplicateRatio).toFixed(4)} / ${Number(report.quality.semanticDuplicateRatio).toFixed(4)} |
| sourceCopyRatio | ${Number(report.quality.sourceCopyRatio).toFixed(4)} |
| Quality Gate | ${report.quality.gate} |

Errores críticos guardados: ${report.quality.documentQualityCriticalChecks.map((id) => `\`${esc(id)}\``).join(', ')}. En particular, el hecho de que existan respuestas ligadas a hechos/pretensiones no resuelve la postura del cliente; los 85 requisitos obligatorios permanecen en estado no cubierto.

### Traza individual de Coverage

Resumen del modelo: ${report.coverage.covered}/${report.coverage.required} requisitos obligatorios cubiertos; ${report.coverage.totalItems} elementos en total, ${report.coverage.required} requeridos. Estados: ${fmtObj(report.coverage.statusCounts)}. Etapas: ${fmtObj(report.coverage.pipelineStageCounts)}.

Los estados \`ASSEMBLED\` de esta tabla significan que hay al menos un bloque final enlazado al Coverage ID. No significan \`covered\`: la columna de estado final y su razón conservan la evaluación semántica del motor. Así se distingue una respuesta materializada de una respuesta jurídicamente suficiente.

| Coverage ID | Categoría | Sección destino | Requerido | Última etapa | Task IDs | Intentos | Palabras provider | DraftBlock IDs ensamblados | Estado final | Razón de no cobertura o descarte |
|---|---|---|---|---|---|---:|---:|---|---|---|
${coverageRows.map((row) => `| ${row} |`).join('\n')}

### Exportación, errores del runner y recuperación de evidencia

- Preflight DRAFT: bloqueado. Errores: \`${esc(report.export.preflightError)}\`.
- DOCX/PDF jurídicos esperados: \`${outputDir}\caso-${report.meta.caseNumber}-${report.meta.draftDepth}-DRAFT.docx\` y \`${outputDir}\caso-${report.meta.caseNumber}-${report.meta.draftDepth}-DRAFT.pdf\`; ambos no existen. Páginas PDF reales: no disponibles, no cero calculado a partir de un archivo.
- En Fase D el runner falló después de terminar el pipeline: \`ReferenceError: providerAttemptRecords is not defined\`, en \`scripts/run-final-generator-validation.mts:453\`. El preflight sí había bloqueado antes la exportación por \`FACTUAL_CLAIM_AUDIT_MISSING\` y \`AUTHORITY_VERIFICATION_FAILED\`.
- Corrección al runner: el conteo ahora deriva de \`trace.issueGenerationAttempts\` mediante \`countIssueGenerationAttemptRecords\`, con resultado no disponible si falta el arreglo. Prueba RED observada y GREEN posterior.
- Para preservar este único run, \`scripts/rebuild-final-generator-validation-report.mts\` reconstruyó \`validation-report.json\` desde artefactos locales. Esa operación no invocó providers ni volvió a ejecutar generación.
- Pruebas focalizadas tras la corrección: 3 archivos, 10 pruebas aprobadas. \`npx tsc --noEmit\`: exit 0.
- Evidencia conservada en \`${report.meta.runDir}\`. DOCX/PDF jurídicos no se abrieron visualmente porque no fueron exportados; el guard no se omitió.

### Incidentes observados en esta corrida

${report.runtimeIncidents.map((item) => `- ${item}`).join('\n')}

Los proveedores registraron rate limit 429 en Groq. Un mensaje de cuota mostró límite diario de 200,000 tokens, 199,511 usados y 2,793 solicitados, con espera indicada de 16m35s. También hubo un timeout NVIDIA de 120s antes del fallback a Gemini. Los eventos Prisma de autenticación/uso no pudieron persistirse debido al error TLS de Windows SChannel. Estos incidentes no se convierten en estimaciones de costo, persistencia ni éxito jurídico.

### Evidencia y tamaños

| Archivo relativo al run | Bytes |
|---|---:|
${Object.entries(outputBytes).map(([name, size]) => `| \`${esc(name)}\` | ${size ?? 'No disponible'} |`).join('\n')}

Reporte JSON reconstruido: \`${report.files.validationReport}\`.

### Resultado frente a los siete bloqueos planteados

1. **Coverage:** sigue roto para readiness. 0/85 requeridos están cubiertos, aunque 84 alcanzan una etapa de ensamblado. 44 exigen postura del cliente; 39 siguen pendientes; 1 débil; 1 bloqueado. No se debe convertir un bloque ensamblado en cobertura cubierta por heurística.
2. **VALID_NON_FINAL:** ya no desaparece automáticamente en hechos; hay 22/22 respuestas de hechos reconocidas por el Quality Gate y bloques enlazados. Sin embargo, el estado final sigue pendiente cuando falta postura del demandado y hay 23 tareas finales \`FAILED\`.
3. **Continuations:** hubo 25 expansiones y 0 continuaciones pese a \`extensionTargetUnmet=true\` y a contenido incompleto. El stop fue \`RESOURCE_LIMIT\`; el requisito de continuación no se satisfizo.
4. **Derecho:** la sección existe (599 palabras), pero tiene 0 autoridades verificadas, 0 aplicadas y 2 no sustentadas. Presencia estructural no equivale a fundamentación válida.
5. **Secciones formales:** están presentes en el modelo; Proemio 9 palabras, Comparecencia 43, Objeto 520, Petitorios 60 y Firma 7. Comparecencia/Objeto aún tienen dependencias del expediente y número de expediente pendiente.
6. **Contabilidad:** hay tabla y motivos de pérdida por sección, pero el trace no reconcilia exactamente generación con ensamblado; el propio reporte conserva el delta no asignado de 234 palabras y el doble conteo de deduplicación.
7. **Stop reason:** el run no terminó con \`CONTENT_LIMIT_REACHED\`; terminó con \`RESOURCE_LIMIT\`, que describe el límite técnico observado. Aun así, 0 continuaciones y cobertura pendiente impiden PASS.

**Conclusión:** \`CASE_01_GENERATOR_FAIL\`. No se inició ninguna de las otras cinco pruebas, porque Caso 01 no pasó. Tampoco se ejecutó otro run ni se cambió el generador después de este resultado.
`;

let current = fs.readFileSync(markdownPath, 'utf8');
if (current.includes(marker)) {
  current = current.slice(0, current.indexOf(marker)).trimEnd();
}
fs.writeFileSync(markdownPath, `${current}${section}\n`, 'utf8');
console.log(`Actualizado ${markdownPath} con ${report.coverage.trace.length} filas de Coverage y ${accountingRows.length} filas de contabilidad.`);
