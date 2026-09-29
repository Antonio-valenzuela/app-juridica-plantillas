[CmdletBinding()]
param(
  [string]$VerificationRoot = 'audit/final-legal-readiness-2026/final-verification'
)

$ErrorActionPreference = 'SilentlyContinue'
$root = [System.IO.Path]::GetFullPath($VerificationRoot)
New-Item -ItemType Directory -Force -Path $root | Out-Null
$env:NVIDIA_API_KEY = ''
$env:NVIDIA_REAL_TEST = 'false'

$commands = @(
  @{ name = 'typecheck'; command = 'npm run typecheck' },
  @{ name = 'lint'; command = 'npm run lint' },
  @{ name = 'focused'; command = 'npm run test -- tests/acceptance/sourceGroundedContestacion.test.ts tests/acceptance/exportUniversal.acceptance.test.ts tests/integration/analyzeUploadAsyncRoute.test.ts tests/integration/uploadAnalysisCache.test.ts tests/legal-engine/contestacionStructure.test.ts tests/legal-engine/finalDocumentMaterializationGate.test.ts tests/legal-engine/pdfExport.test.ts tests/integration/finalLegalReadinessManifest.test.ts tests/e2e/reexportFinalLegalReadiness.test.ts --run' },
  @{ name = 'build'; command = 'npm run build' }
)

$results = foreach ($item in $commands) {
  $logPath = Join-Path $root "$($item.name).log"
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  cmd.exe /d /c $item.command > $logPath 2>&1
  $exitCode = $LASTEXITCODE
  $watch.Stop()
  [pscustomobject]@{
    name = $item.name
    exitCode = $exitCode
    durationMs = $watch.ElapsedMilliseconds
    log = $logPath
  }
  if ($exitCode -ne 0) { throw "Final verification failed: $($item.name) exit $exitCode" }
}

$results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $root 'results.json') -Encoding UTF8
$results | Format-Table -AutoSize
