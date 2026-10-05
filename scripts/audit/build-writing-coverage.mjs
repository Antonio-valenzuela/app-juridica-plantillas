import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CANONICAL_DOCUMENT_TYPES, LEGAL_CATALOG_REGISTRY, getCatalogDocument, getCatalogStats, getContestacionesDeclaredDocumentTypes, getContestacionesDocumentOptions, getFunctionalDocumentStatus, getInitialWritingDocumentOptions, getUniversalDocumentTypes } from '@/lib/catalog/legalCatalog';
import { DOCUMENT_TYPES } from '@/lib/legal-taxonomy/documentTypes';
import { DocumentTemplates } from '@/lib/legal-engine/documentTemplates';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';

const root = process.cwd();
const testRoot = path.join(root, 'tests');
const responseNamePattern = /contestaci[oó]n|recurso|incidente|excepci[oó]n|reconvenci[oó]n/i;

function listTestFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTestFiles(fullPath);
    return /\.test\.(?:ts|tsx|mts|js|jsx|mjs)$/.test(entry.name) ? [fullPath] : [];
  });
}

const testFiles = listTestFiles(testRoot).map((fullPath) => ({
  relativePath: path.relative(root, fullPath).replaceAll(path.sep, '/'),
  content: fs.readFileSync(fullPath, 'utf8'),
}));

function exactTestReferences(id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`, 'i');
  return testFiles.filter((file) => pattern.test(file.content)).map((file) => file.relativePath);
}

function resolveExplicitRoute(id, aliasTarget) {
  const requestedId = aliasTarget || id;
  try {
    const route = resolveDocumentRouting({ selectedDocumentType: requestedId });
    return {
      supported: route.resolvedTemplate === requestedId && !route.fallbackUsed,
      resolvedId: route.resolvedTemplate,
      fallbackUsed: route.fallbackUsed,
      errorCode: null,
    };
  } catch (error) {
    return {
      supported: false,
      resolvedId: null,
      fallbackUsed: null,
      errorCode: typeof error?.code === 'string' ? error.code : 'ROUTE_ERROR',
    };
  }
}

export function buildWritingCoverageMatrix() {
  const stats = getCatalogStats();
  const responseOptions = getContestacionesDocumentOptions();
  const declaredResponseTypes = getContestacionesDeclaredDocumentTypes();
  const responseDeclaredIds = new Set(declaredResponseTypes.map((option) => option.id));
  const responseOptionIds = new Set(responseOptions.filter((option) => option.value !== 'redaccion_libre').map((option) => option.value));
  const responseModeIds = new Set(responseOptions.filter((option) => option.value === 'redaccion_libre').map((option) => option.value));
  const initialDeclaredIds = new Set(DOCUMENT_TYPES.filter((entry) => ['inicial', 'promocion', 'otro'].includes(entry.category || '')).map((entry) => entry.value));
  const initialOptionIds = new Set(getInitialWritingDocumentOptions().map((option) => option.value));
  const universalOptionIds = new Set(getUniversalDocumentTypes().map((option) => option.value));
  const legacyById = new Map(DOCUMENT_TYPES.map((entry) => [entry.value, entry]));
  const canonicalById = new Map(CANONICAL_DOCUMENT_TYPES.map((entry) => [entry.id, entry]));
  const identifiersById = new Map(LEGAL_CATALOG_REGISTRY.documentIdentifiers.map((entry) => [entry.id, entry]));
  const allIds = new Set([
    ...LEGAL_CATALOG_REGISTRY.documents.map((entry) => entry.id),
    ...LEGAL_CATALOG_REGISTRY.aliases.map((entry) => entry.id),
    ...DOCUMENT_TYPES.map((entry) => entry.value),
    ...Object.keys(DocumentTemplates),
    ...responseOptions.map((option) => option.value),
  ]);

  const rows = [...allIds].sort((a, b) => a.localeCompare(b)).map((id) => {
    const identifier = identifiersById.get(id);
    const legacy = legacyById.get(id);
    const aliasTarget = identifier?.kind === 'LEGACY_ALIAS' ? identifier.targetId : undefined;
    const canonicalId = aliasTarget || id;
    const catalog = canonicalById.get(canonicalId);
    const canonicalIdentifier = identifiersById.get(canonicalId);
    const functionalStatus = identifier?.kind === 'FAMILY' ? 'NOT_APPLICABLE' : getFunctionalDocumentStatus(id) || 'FAIL';
    const humanReview = canonicalIdentifier?.kind === 'DOCUMENT_TYPE'
      ? canonicalIdentifier.humanReview
      : canonicalIdentifier?.kind === 'FAMILY' ? 'NOT_REQUIRED' : 'PENDING';
    const template = DocumentTemplates[canonicalId] || DocumentTemplates[id];
    const route = resolveExplicitRoute(id, aliasTarget);
    const matchingTests = [
      ...exactTestReferences(id),
      ...(catalog?.status === 'IMPLEMENTED' && catalog.implemented
        ? ['tests/legal-taxonomy/implementedDocumentContracts.test.ts']
        : []),
    ];
    const responseRegexCandidate = Boolean(catalog && catalog.implemented && responseNamePattern.test(`${catalog.id} ${catalog.label}`));
    const surfaces = [];

    if (responseOptionIds.has(id)) surfaces.push('Contestaciones (selectable por functionalStatus PASS)');
    else if (responseDeclaredIds.has(id)) surfaces.push('Contestaciones (declarado; no seleccionable mientras functionalStatus no sea PASS)');
    if (responseModeIds.has(id)) surfaces.push('Contestaciones (modo libre; no equivale a tipo acreditado)');
    if (universalOptionIds.has(id)) surfaces.push('Universal (legacy canónico generable)');
    if (initialOptionIds.has(id)) surfaces.push('Escritos Iniciales (selectable por functionalStatus PASS)');
    else if (initialDeclaredIds.has(id)) surfaces.push('Escritos Iniciales (legacy; oculto mientras no acredite functionalStatus PASS)');
    if (identifier?.uiVisibility === 'VISIBLE') surfaces.push('Navegador del catálogo (visible; tipos FAIL deshabilitados)');
    if (template && !identifier) surfaces.push('Registro de plantillas (sin tipo canónico)');

    const structuralChecks = [];
    if (!catalog || identifier?.kind !== 'DOCUMENT_TYPE') structuralChecks.push('no existe contrato canónico de tipo documental');
    if (!catalog?.sourceCompatibility) structuralChecks.push('falta compatibilidad declarada de fuente');
    if (!template) structuralChecks.push('no existe DocumentTemplate');
    if (template && template.tipo !== canonicalId) structuralChecks.push('template.tipo no coincide con el ID canónico');
    if (!template?.estructura?.length) structuralChecks.push('no hay secciones declaradas');
    if (!template?.camposObligatorios?.length) structuralChecks.push('no hay campos obligatorios declarados');
    if (!route.supported) structuralChecks.push(`routing explícito no acreditado${route.errorCode ? ` (${route.errorCode})` : ''}`);

    // Current audit tree has no per-type ledger demonstrating all 36 acceptance criteria.
    // Matching a test filename or finding an ID in a test is only a pointer, never a PASS.
    const fullAcceptanceEvidence = functionalStatus === 'PASS';
    const declaredUsable = Boolean(catalog?.status === 'IMPLEMENTED' || surfaces.length > 0);
    const status = functionalStatus === 'BLOCKED_EXTERNAL' ? 'BLOCKED_EXTERNAL' : fullAcceptanceEvidence && structuralChecks.length === 0 ? 'PASS' : 'FAIL';
    const statusReason = status === 'PASS'
      ? 'Acreditación completa del contrato de 36 puntos.'
      : [
        structuralChecks.length ? structuralChecks.join('; ') : null,
        catalog?.functionalStatusReason || (!fullAcceptanceEvidence ? 'sin evidencia E2E por tipo que demuestre el contrato funcional completo de 36 puntos' : null),
      ].filter(Boolean).join('; ');

    const catalogVisible = identifier?.uiVisibility === 'VISIBLE';
    const selectableInCatalogNavigator = catalogVisible && identifier?.kind === 'DOCUMENT_TYPE' && functionalStatus === 'PASS';
    const selectableInContestaciones = responseOptionIds.has(id);
    const selectableInInitialWritings = initialOptionIds.has(id);
    const selectableInUniversal = universalOptionIds.has(id);
    const previousRegexCandidate = Boolean(catalog?.status === 'IMPLEMENTED' && catalog.implemented
      && !responseDeclaredIds.has(canonicalId)
      && responseNamePattern.test(`${canonicalId} ${catalog?.label || legacy?.label || ''}`));
    const customPresetCompatibility = {
      selector: 'Plantillas/machotes de usuario; no es un selector de tipo documental.',
      matchRule: 'Contestaciones: documentType exacto o coincidencia de materia/categoría; disponibilidad real depende del inventario local del abogado.',
      availability: 'NOT_ENUMERATED_IN_STATIC_AUDIT',
    };

    return {
      id,
      label: catalog?.label || legacy?.label || identifier?.label || template?.tipo || id,
      matter: catalog?.areaId?.toUpperCase() || template?.materia?.toUpperCase() || 'NO_CLASIFICADA',
      family: catalog?.familyId || (identifier?.kind === 'FAMILY' ? identifier.id : 'LEGACY_OR_UNMAPPED'),
      uiSurface: surfaces,
      visible: surfaces.length > 0,
      declaredUsable,
      implementedFlag: Boolean(identifier?.kind === 'DOCUMENT_TYPE' && catalog?.status === 'IMPLEMENTED' && catalog?.implemented),
      selectable: selectableInContestaciones || selectableInInitialWritings || selectableInUniversal || selectableInCatalogNavigator,
      selectableInContestaciones,
      contestacionesCapabilityDeclared: responseDeclaredIds.has(id),
      selectableInInitialWritings,
      initialWritingLegacyDeclared: initialDeclaredIds.has(id),
      selectableInUniversal,
      catalogNavigatorVisible: catalogVisible,
      selectableInCatalogNavigator,
      responseFreeMode: responseModeIds.has(id),
      previousRegexCandidate,
      presetCompatibility: customPresetCompatibility,
      aliasTarget: aliasTarget || null,
      catalogStatus: catalog?.status || identifier?.status || 'NOT_IN_CANONICAL_REGISTRY',
      templateExists: Boolean(template),
      sourceCompatibility: catalog?.sourceCompatibility || null,
      builtInTemplateId: template?.tipo || null,
      customTemplateInventory: 'NOT_ENUMERATED_IN_STATIC_AUDIT',
      requiredFields: template?.camposObligatorios || [],
      requiredSections: template?.estructura || [],
      pipelineSupported: route.supported,
      specializedGeneration: template && template.tipo === canonicalId && template.vozPrompt && template.estructura?.length
        ? 'DECLARED_IN_TEMPLATE; CONTENT NOT YET VERIFIED PER TYPE'
        : 'NOT DECLARED',
      fallbackUsed: route.fallbackUsed,
      routedId: route.resolvedId,
      docxExport: 'NOT VERIFIED PER TYPE',
      pdfExport: 'NOT VERIFIED PER TYPE',
      testFiles: matchingTests,
      status,
      functionalStatus,
      humanReview,
      statusReason,
      evidenceLimit: 'An ID reference in a test does not prove that the test passed or covers this type end-to-end.',
    };
  });

  const implementedRows = CANONICAL_DOCUMENT_TYPES.filter((entry) => entry.status === 'IMPLEMENTED' && entry.implemented);
  const currentRegexCandidates = rows.filter((row) => row.previousRegexCandidate);
  const regexMatchInventory = rows.filter((row) => responseNamePattern.test(`${row.id} ${row.label}`));
  const summariesByMatter = Object.groupBy(rows, (row) => row.matter);
  const summariesByFamily = Object.groupBy(rows, (row) => row.family);
  const summary = {
    canonicalDocumentCount: CANONICAL_DOCUMENT_TYPES.length,
    allCatalogIdentifiers: LEGAL_CATALOG_REGISTRY.documentIdentifiers.length,
    catalogStats: stats,
    legacySelectableIds: DOCUMENT_TYPES.length,
    documentTemplateCount: Object.keys(DocumentTemplates).length,
    explicitResponseOptions: responseOptions.filter((option) => option.value !== 'redaccion_libre').length,
    responseModeOptions: responseOptions.length,
    declaredContestacionesOptions: declaredResponseTypes.length,
    currentlySelectableContestacionesOptions: responseOptionIds.size,
    currentlySelectableInitialWritingOptions: initialOptionIds.size,
    currentlySelectableUniversalOptions: universalOptionIds.size,
    currentlySelectableCatalogNavigatorTypes: rows.filter((row) => row.selectableInCatalogNavigator).length,
    responseOptionsAddedByNameMatching: 0,
    priorResponseNameMatchCandidatesNoLongerSelected: currentRegexCandidates.length,
    currentImplementedCount: implementedRows.length,
    implementedClaimWithoutFullAcceptanceEvidence: implementedRows.length,
    rows: rows.length,
    pass: rows.filter((row) => row.status === 'PASS').length,
    fail: rows.filter((row) => row.status === 'FAIL').length,
    blockedExternal: rows.filter((row) => row.status === 'BLOCKED_EXTERNAL').length,
    byMatter: Object.fromEntries(Object.entries(summariesByMatter).map(([matter, entries]) => [matter, {
      count: entries.length,
      pass: entries.filter((row) => row.status === 'PASS').length,
      fail: entries.filter((row) => row.status === 'FAIL').length,
    }])),
    byFamily: Object.fromEntries(Object.entries(summariesByFamily).map(([family, entries]) => [family, {
      count: entries.length,
      pass: entries.filter((row) => row.status === 'PASS').length,
      fail: entries.filter((row) => row.status === 'FAIL').length,
    }])),
  };

  return {
    generatedAt: new Date().toISOString(),
    branch: execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(),
    summary,
    previousRegexCandidateIds: currentRegexCandidates.map((row) => row.id).sort((a, b) => a.localeCompare(b)),
    previousRegexMatchInventory: regexMatchInventory.map((row) => ({
      id: row.id,
      label: row.label,
      matter: row.matter,
      family: row.family,
      wouldHaveBeenAdmittedByBroadImplementedRegex: row.previousRegexCandidate,
      explicitlyDeclaredForContestaciones: row.contestacionesCapabilityDeclared,
      exceptionalDisposition: row.previousRegexCandidate ? 'BROADER_LEGACY_CANDIDATE_NOW_NOT_SELECTABLE_UNLESS_PASS' : row.statusReason || row.catalogStatus,
      functionalStatus: row.functionalStatus,
    })),
    findings: [
      'Catalog implementation still uses template presence for ordinary entries; official-form and assisted-draft declarations now take precedence. Template presence is not end-to-end proof.',
      `Contestaciones declares ${declaredResponseTypes.length} canonical output types but currently exposes ${responseOptionIds.size}; the remaining declared types fail the end-to-end evidence criterion and appear only in the development inventory.`,
      `Universal and Escritos Iniciales expose ${universalOptionIds.size} and ${initialOptionIds.size} catalog types respectively; the catalog navigator disables every type without functionalStatus PASS.`,
      `The prior broad name regex would have matched ${currentRegexCandidates.length} IMPLEMENTED identifiers outside the explicit response capability; their IDs are listed in previousRegexCandidateIds.`,
      'The existing 33-item legacy support matrix reports SUPPORTED for template presence; it is not the 36-point functional contract.',
      'This matrix conservatively marks rows FAIL until per-type evidence demonstrates the complete acceptance contract; it does not mean every row has a reproduced runtime defect.',
    ],
    rows,
  };
}

export function renderWritingCoverageMarkdown(matrix) {
  const lines = [
    '# Writing Coverage Matrix',
    '',
    `- Rama inspeccionada: \`${matrix.branch}\``,
    `- Generada: ${matrix.generatedAt}`,
    `- Tipos canónicos: ${matrix.summary.canonicalDocumentCount}`,
    `- Identificadores de catálogo (incluye alias/familia): ${matrix.summary.allCatalogIdentifiers}`,
    `- IDs legacy seleccionables: ${matrix.summary.legacySelectableIds}`,
    `- Plantillas: ${matrix.summary.documentTemplateCount}`,
    `- IMPLEMENTED canónicos al inicio (excluye alias): ${matrix.summary.currentImplementedCount}`,
    `- PASS demostrado con contrato E2E por tipo: ${matrix.summary.pass}`,
    `- FAIL (incluye no demostrado; ver motivo por fila): ${matrix.summary.fail}`,
    `- BLOCKED_EXTERNAL: ${matrix.summary.blockedExternal}`,
    `- Opciones Contestaciones declaradas por capacidad: ${matrix.summary.declaredContestacionesOptions}; hoy seleccionables con PASS: ${matrix.summary.currentlySelectableContestacionesOptions}; modo libre: ${matrix.summary.responseModeOptions}`,
    `- Tipos seleccionables por PASS — Contestaciones / Escritos Iniciales / Universal / navegador catálogo: ${matrix.summary.currentlySelectableContestacionesOptions} / ${matrix.summary.currentlySelectableInitialWritingOptions} / ${matrix.summary.currentlySelectableUniversalOptions} / ${matrix.summary.currentlySelectableCatalogNavigatorTypes}`,
    `- Opciones agregadas por coincidencia de nombre: ${matrix.summary.responseOptionsAddedByNameMatching}`,
    `- Candidatos que antes coincidían por nombre y ya no se agregan automáticamente: ${matrix.summary.priorResponseNameMatchCandidatesNoLongerSelected}`,
    '- Tabla ID por selector, machote/plantilla, source compatibility, pipeline, functionalStatus y humanReview: ver `SELECTOR_TRACEABILITY.md` y `selector-traceability.json`.',
    '',
    '> PASS requiere evidencia del contrato completo de 36 puntos. Una plantilla, un alias o una referencia a un ID dentro de un test no son prueba E2E. FAIL significa que el criterio no está demostrado o tiene una carencia estructural; no implica por sí solo un defecto reproducido.',
    '',
    '## Hallazgos de catálogo y selección',
    '',
    ...matrix.findings.map((finding) => `- ${finding}`),
    '',
    '## Conteo por materia',
    '',
    '| Materia | Tipos/IDs | PASS | FAIL |',
    '|---|---:|---:|---:|',
    ...Object.entries(matrix.summary.byMatter).sort(([a], [b]) => a.localeCompare(b)).map(([matter, entry]) => `| ${matter} | ${entry.count} | ${entry.pass} | ${entry.fail} |`),
    '',
    '## Conteo por familia documental',
    '',
    '| Familia | Tipos/IDs | PASS | FAIL |',
    '|---|---:|---:|---:|',
    ...Object.entries(matrix.summary.byFamily).sort(([a], [b]) => a.localeCompare(b)).map(([family, entry]) => `| ${family} | ${entry.count} | ${entry.pass} | ${entry.fail} |`),
    '',
    '## Detalle',
    '',
    '| id | label | materia | familia | uiSurface | visible | selectable | implementedFlag | templateExists | sourceCompatibility | requiredFields | requiredSections | pipelineSupported | specializedGeneration | fallbackUsed | docxExport | pdfExport | tests | status | motivo |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...matrix.rows.map((row) => `| ${row.id} | ${row.label.replaceAll('|', '\\|')} | ${row.matter} | ${row.family} | ${row.uiSurface.join('<br>').replaceAll('|', '\\|')} | ${row.visible} | ${row.selectable} | ${row.implementedFlag} (${row.catalogStatus}) | ${row.templateExists} | ${row.sourceCompatibility ? 'DECLARED' : 'MISSING'} | ${row.requiredFields.join(', ').replaceAll('|', '\\|')} | ${row.requiredSections.join(', ').replaceAll('|', '\\|')} | ${row.pipelineSupported} | ${row.specializedGeneration} | ${row.fallbackUsed ?? 'NO_ROUTE'} | ${row.docxExport} | ${row.pdfExport} | ${row.testFiles.slice(0, 4).join('<br>') || 'NO_DIRECT_ID_REFERENCE'} | ${row.status} | ${row.statusReason.replaceAll('|', '\\|')} |`),
    '',
    '## Límites de esta generación',
    '',
    '- El inventario es estático y determinista: no invoca providers ni modifica documentos de usuario.',
    '- `implementedDocumentContracts.test.ts` verifica estructura declarada y routing explícito para cada tipo marcado IMPLEMENTED; NO acredita contenido generado, gates, persistencia, editor ni exportación por tipo.',
    '- DOCX/PDF y calidad semántica requieren pruebas de ejecución por familia; la existencia de código común no acredita cada tipo.',
    '- La ruta completa de exportación se medirá con fixtures anonimizados y gates intactos antes de elevar cualquier fila a PASS.',
  ];
  return `${lines.join('\n')}\n`;
}

export function renderSelectorTraceabilityMarkdown(matrix) {
  const lines = [
    '# Cross-selector traceability — generator capabilities',
    '',
    `- Branch: \`${matrix.branch}\``,
    `- Rows: ${matrix.rows.length}; currently selectable Contestaciones/Initial/Universal: ${matrix.summary.currentlySelectableContestacionesOptions}/${matrix.summary.currentlySelectableInitialWritingOptions}/${matrix.summary.currentlySelectableUniversalOptions}.`,
    `- Template presence remains structural only; PASS requires evidence for the full 36-point acceptance contract.`,
    '',
    '| ID | Label | Matter / family | Catalog / IMPLEMENTED | Contestaciones declared / selectable | Initial declared / selectable | Universal selectable | Catalog navigator visible / selectable | Preset/template | Source compatibility | Pipeline | functionalStatus | humanReview |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...matrix.rows.map((row) => {
      const source = row.sourceCompatibility
        ? `${row.sourceCompatibility.sourceRequired ? 'required' : 'optional'}; accepts=${(row.sourceCompatibility.acceptedSourceTypes || []).join(',') || (row.sourceCompatibility.acceptsAnySource ? 'any' : 'none')}`
        : 'MISSING';
      const preset = `${row.customTemplateInventory}; built-in=${row.builtInTemplateId || 'none'}; ${row.presetCompatibility.matchRule}`;
      return `| ${row.id} | ${row.label.replaceAll('|', '\\|')} | ${row.matter} / ${row.family} | ${row.catalogStatus} / ${row.implementedFlag} | ${row.contestacionesCapabilityDeclared} / ${row.selectableInContestaciones} | ${row.initialWritingLegacyDeclared} / ${row.selectableInInitialWritings} | ${row.selectableInUniversal} | ${row.catalogNavigatorVisible} / ${row.selectableInCatalogNavigator} | ${preset.replaceAll('|', '\\|')} | ${source.replaceAll('|', '\\|')} | ${row.pipelineSupported ? `SUPPORTED (${row.routedId})` : `NO (${row.statusReason})`} | ${row.functionalStatus} | ${row.humanReview} |`;
    }),
    '',
    '## Previous broad name/ID regex candidates',
    '',
    `Potential legacy candidates: ${matrix.previousRegexCandidateIds.length}. They are not automatically selectable; each is subject to explicit capability and PASS evidence.`,
    '',
    '| ID | Label | Matter / family | Would broad regex admit? | Explicit Contestaciones declaration? | Current disposition | functionalStatus |',
    '|---|---|---|---|---|---|---|',
    ...matrix.previousRegexMatchInventory.map((entry) => `| ${entry.id} | ${entry.label.replaceAll('|', '\\|')} | ${entry.matter} / ${entry.family} | ${entry.wouldHaveBeenAdmittedByBroadImplementedRegex} | ${entry.explicitlyDeclaredForContestaciones} | ${String(entry.exceptionalDisposition).replaceAll('|', '\\|')} | ${entry.functionalStatus} |`),
    '',
    '## Preset and evidence limits',
    '',
    '- The custom-template selector is dynamic user-owned data. This static audit does not enumerate local templates or read case data; it records the runtime compatibility rule without claiming an actual preset exists for any ID.',
    '- Built-in `DocumentTemplates`, source compatibility, and pipeline route are structural declarations; they do not upgrade functionalStatus.',
    '- The development inventory retains FAIL types for discovery but offers no action to select them for generation.',
  ];
  return `${lines.join('\n')}\n`;
}

export function writeWritingCoverageArtifacts(matrix) {
  const outputDirectory = path.join(root, 'audit/generator-master');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const jsonPath = path.join(outputDirectory, 'writing-coverage.json');
  const markdownPath = path.join(outputDirectory, 'WRITING_COVERAGE_MATRIX.md');
  const selectorJsonPath = path.join(outputDirectory, 'selector-traceability.json');
  const selectorMarkdownPath = path.join(outputDirectory, 'SELECTOR_TRACEABILITY.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderWritingCoverageMarkdown(matrix), 'utf8');
  fs.writeFileSync(selectorJsonPath, `${JSON.stringify({ summary: matrix.summary, rows: matrix.rows, previousRegexCandidateIds: matrix.previousRegexCandidateIds, previousRegexMatchInventory: matrix.previousRegexMatchInventory }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(selectorMarkdownPath, renderSelectorTraceabilityMarkdown(matrix), 'utf8');
  return { json: jsonPath, markdown: markdownPath, selectorJson: selectorJsonPath, selectorMarkdown: selectorMarkdownPath };
}
