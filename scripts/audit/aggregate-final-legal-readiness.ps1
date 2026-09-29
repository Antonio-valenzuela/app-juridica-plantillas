[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$AuditRoot
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = [System.IO.Path]::GetFullPath($AuditRoot)
$manifestPath = Join-Path $resolvedRoot 'selected-cases.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$selectedCases = @($manifest.cases | Sort-Object { [int]$_.caseNumber })
if ($selectedCases.Count -ne 6) { throw "El manifiesto final no contiene exactamente 6 casos: $($selectedCases.Count)" }

$results = foreach ($selectedCase in $selectedCases) {
  $caseNumber = ([string]$selectedCase.caseNumber).PadLeft(2, '0')
  $resultPath = Join-Path $resolvedRoot "cases\$caseNumber\evidence\case-result.json"
  if (-not (Test-Path -LiteralPath $resultPath)) { throw "Falta evidencia de resultado para el caso $caseNumber" }
  Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
}

$missingDocx = @($results | Where-Object { [string]::IsNullOrWhiteSpace([string]$_.files.docx) })
$missingPdf = @($results | Where-Object { [string]::IsNullOrWhiteSpace([string]$_.files.pdf) })
$summary = [ordered]@{
  generatedAt = (Get-Date).ToString('o')
  purpose = 'Consolidación final de las seis pruebas E2E reales del banco Datos.zip, sin incorporar el ZIP a la base productiva.'
  sourceManifest = $manifestPath
  testBankZip = $manifest.testBankZip
  productionDatabaseExcluded = $true
  executionBatches = @(
    [ordered]@{ name = 'configured-provider-full-run'; evidence = 'cases/01, cases/02, cases/04, cases/05'; note = 'Corrida completa inicial después del ajuste DRAFT; casos 03 y 06 tuvieron bloqueos documentados.' }
    [ordered]@{ name = 'civil-structure-remediation-rerun'; evidence = 'cases/03'; note = 'Repetición posterior a corregir la sección canónica DERECHO rich-first.' }
    [ordered]@{ name = 'amparo-source-selection-remediation-rerun'; evidence = 'attempts/case-06-amparo-revision y cases/06'; note = 'Se conservó el bloqueo de amparo y se probó Marco C4 como sexta fuente compatible.' }
  )
  counts = [ordered]@{
    total = $results.Count
    passReviewable = @($results | Where-Object status -eq 'PASS_REVIEWABLE').Count
    blockedReview = @($results | Where-Object status -eq 'BLOCKED_REVIEW').Count
    failed = @($results | Where-Object status -eq 'FAILED').Count
    docx = @($results | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.files.docx) }).Count
    pdf = @($results | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.files.pdf) }).Count
  }
  gate = [ordered]@{
    allSixHaveDraftDocx = ($missingDocx.Count -eq 0)
    allSixHaveDraftPdf = ($missingPdf.Count -eq 0)
    finalExportExpectedBlocked = $true
    finalExportBlockEvidence = @($results | ForEach-Object { [ordered]@{ caseNumber = $_.caseNumber; docx = $_.semanticState.finalDocxBlock; pdf = $_.semanticState.finalPdfBlock } })
  }
  results = $results
}
$summary | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $resolvedRoot 'run-summary.json') -Encoding UTF8
Write-Output ($summary.counts | ConvertTo-Json)
if ($summary.counts.total -ne 6 -or $summary.counts.docx -ne 6 -or $summary.counts.pdf -ne 6 -or $summary.counts.failed -ne 0) {
  throw 'La consolidación final no cumple seis resultados PASS_REVIEWABLE con DOCX y PDF.'
}
