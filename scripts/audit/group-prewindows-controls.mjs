import { readFile, writeFile } from 'node:fs/promises';
const root = 'audit/final-pre-windows-readiness';
const source = JSON.parse(await readFile(`${root}/controls-classified.json`, 'utf8'));
const rules = [
  [/CaseDocumentsReader/, 'UPLOAD_READER', 'upload → extracción → vista de fuente'],
  [/Contestaciones/, 'GENERATE_RESPONSE', 'análisis → partes → postura → generación'],
  [/GenerationStatusBar/, 'JOB_RECOVERY', 'job activo → checkpoint → interrupción → reapertura'],
  [/LawyerStyleProfile/, 'PROFILE', 'perfil → guardar → reiniciar'],
  [/WorkspaceDocumentEditor/, 'EDITOR', 'documento A → editar → guardar → documento B → aislamiento → export DRAFT'],
  [/LocalImport/, 'LOCAL_IMPORT', 'analizar → clasificar → importar → asociar → reiniciar'],
  [/Template|Machote/, 'TEMPLATES', 'crear plantilla → guardar → reabrir'],
  [/Analytics/, 'ANALYTICS', 'actividad real → rango → métricas conocidas/desconocidas'],
  [/WorkspaceModulesView/, 'WORKSPACE_MODULES', 'inicio → expediente → agenda → persistencia'],
];
const secondary = /Copiar texto|Descargar texto|Asistente|Analizar mis escritos|zoom|Buscar|Ampliar|Reducir|Formatear|Anterior|Siguiente|Cerrar perfil/i;
const rows = source.controls.map(control => {
  const rule = rules.find(([match]) => match.test(control.COMPONENT || ''));
  const flow = rule?.[1] || 'OTHER';
  const secondaryAction = secondary.test(`${control.LABEL || ''} ${control.EXPECTED_ACTION || ''}`);
  const critical = !!rule && !secondaryAction && control.REMAINING_CATEGORY !== 'C' && control.STATUS !== 'NOT_APPLICABLE';
  const classification = control.REMAINING_CATEGORY === 'C' ? 'C' : control.STATUS === 'NOT_APPLICABLE' ? 'N/A'
    : control.STATUS === 'PASS' ? 'A2' : secondaryAction ? 'A4' : critical ? 'A1' : 'A3';
  return { control: control.inventoryId, module: control.COMPONENT, action: control.LABEL,
    flow, e2eContract: rule?.[2] || 'Contrato específico pendiente de atribución', classification, critical,
    status: control.STATUS, existingEvidence: control.TEST || 'Sin evidencia atribuida',
    missingEvidence: control.STATUS === 'PASS' ? 'Ninguna dentro del alcance original certificado; no extrapolar.'
      : 'Ejercicio runtime del contrato exacto, resultado observable y aislamiento; el flujo general no demuestra automáticamente esta fila.' };
});
const groups = [...new Set(rows.map(row => row.flow))].map(flow => ({ flow, controls: rows.filter(row => row.flow === flow).map(row => row.control),
  evidenceShared: flow === 'JOB_RECOVERY' ? 'inflight/run-2026-10-02T01-55-22.320Z/report.json (preservación solamente)' : 'FINAL_DESKTOP_LOCAL_JOURNEY_REPORT.md; pruebas y delta UI relacionados, sujeto al contrato de cada fila' }));
const tally = list => list.reduce((sum, row) => ({ ...sum, [row.status]: (sum[row.status] || 0) + 1 }), {});
const report = { counts: tally(rows), criticalCounts: tally(rows.filter(row => row.critical)), classifications: rows.reduce((sum, row) => ({ ...sum, [row.classification]: (sum[row.classification] || 0) + 1 }), {}),
  noncriticalPending: rows.filter(row => !row.critical && row.status === 'PARTIAL').length,
  scope: 'Contract-based triage, not a new audit or PASS promotion. A2 includes previously proven original PASS; no previously PARTIAL row auto-promoted.', groups, rows };
await writeFile(`${root}/controls-by-flow.json`, JSON.stringify(report, null, 2));
const safe = value => String(value).replaceAll('|', '/').replaceAll('\n', ' ');
await writeFile(`${root}/controls-by-flow.md`, `# Controles por flujo\n\n${JSON.stringify({ counts: report.counts, criticalCounts: report.criticalCounts, classifications: report.classifications, noncriticalPending: report.noncriticalPending })}\n\nA1=crítico sin evidencia completa; A2=evidencia original certificada; A3=contrato runtime no ejercitado/atribución pendiente; A4=secundario, nunca N/A automático. Clasificación conservadora; la lista de filas es revisable.\n\n| Control | Módulo | Acción | Flujo | Clase | Evidencia existente | Evidencia faltante | Estado |\n|---|---|---|---|---|---|---|---|\n${rows.map(row => `| ${[row.control,row.module,row.action,row.flow,row.classification,row.existingEvidence,row.missingEvidence,row.status].map(safe).join(' | ')} |`).join('\n')}\n`);
console.log(JSON.stringify({ counts: report.counts, criticalCounts: report.criticalCounts, classifications: report.classifications, noncriticalPending: report.noncriticalPending }));
