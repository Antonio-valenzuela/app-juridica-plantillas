$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$base = 'http://127.0.0.1:3200'
$uploadUrl = "$base/api/templates/analyze-upload"
$generateUrl = "$base/api/legal-engine/generate"
$statusUrl = "$base/api/legal-engine/generate/status"
$sourcePath = 'C:\Users\yahir\Documents\DOC092126-09212026150739,papa.pdf'
$sourceFileName = [IO.Path]::GetFileName($sourcePath)
$sourceId = 'source-1152-2013-real'
$outDir = 'audit/legal-generation-quality-recovery/real-appeal-1152-2013'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$transportPath = Join-Path $env:TEMP ('appeal-1152-' + [Guid]::NewGuid().ToString('N') + '.pdf')

function W([string]$m) { Write-Output "[TRACE] $m"; [Console]::Out.Flush() }

W "Inicio=$(Get-Date -Format o)"
W "Fuente=$sourcePath ($((Get-Item -LiteralPath $sourcePath).Length) bytes)"

Copy-Item -LiteralPath $sourcePath -Destination $transportPath -Force
try {
  W 'UPLOAD POST /api/templates/analyze-upload'
  $formArg = "file=@$transportPath;type=application/pdf"
  $cargs = @('--silent','--show-error','--max-time','900','-X','POST','--form',$formArg,'-H','x-request-id: appeal-1152-2013',$uploadUrl)
  $uploadRaw = (& curl.exe @cargs | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "curl upload exit $LASTEXITCODE" }
  $upload = $uploadRaw | ConvertFrom-Json
  if ($upload.ok -ne $true) { throw "carga rechazada: $($uploadRaw.Substring(0,[Math]::Min(400,$uploadRaw.Length)))" }
  W "UPLOAD pages=$($upload.qualityScore.pageCount) chars=$($upload.qualityScore.textLength) ocr=$($upload.ocrProvider)/$($upload.ocrStatus) sourceType=$($upload.classification.sourceDocumentType) validated=$($upload.sourceValidated)"

  $pages = @($upload.pages | ForEach-Object { @{ page=[int]$_.page; text=[string]$_.text; chars=[int]$_.chars } })
  $source = [ordered]@{
    id = $sourceId; filename = $sourceFileName; name = $sourceFileName; type = 'application/pdf'
    pages = $pages; sourceValidated = $true
    sourceQualityStatus = [string]$upload.sourceQualityStatus
    sourceValidationMethod = [string]$upload.sourceValidationMethod
    sourceQuality = $upload.sourceQuality; qualityScore = $upload.qualityScore
    warnings = @($upload.warnings)
    fileSizeBytes = (Get-Item -LiteralPath $sourcePath).Length
    lifecycle = @{ entityKind='SOURCE_DOCUMENT'; sourceId=$sourceId }
    __juridicoRadar = @{ entityKind='SOURCE_DOCUMENT'; sourceId=$sourceId }
  }

  $instruction = 'crea una apelacion de esta sentencia'
  $idempotencyKey = 'appeal-1152-2013-' + [Guid]::NewGuid().ToString()
  $body = [ordered]@{
    userInstruction = $instruction
    sourceDocuments = @($source)
    matter = 'Civil'
    documentTypeLabel = 'Apelación Civil'
    selectedDocumentType = 'apelacion_civil'
    draftDepth = 'EXTENSIVE_40'
    externalProviderOptIn = $true
    workflow = @{ flow='DOCUMENT_ANALYSIS'; selection=@{ mode='automatic' }; updatedAt=(Get-Date).ToUniversalTime().ToString('o') }
    idempotencyKey = $idempotencyKey
  }
  $json = $body | ConvertTo-Json -Depth 100 -Compress
  $json | Set-Content -LiteralPath "$outDir/request.json" -Encoding UTF8
  W "GENERATE instruction='$instruction' selectedDocumentType=apelacion_civil draftDepth=EXTENSIVE_40"

  $client = [System.Net.Http.HttpClient]::new()
  $client.Timeout = [TimeSpan]::FromMinutes(5)
  $req = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, $generateUrl)
  $req.Headers.Add('x-request-id','appeal-1152-2013-generate')
  $req.Headers.Add('x-idempotency-key',$idempotencyKey)
  $req.Content = [System.Net.Http.StringContent]::new($json, [Text.Encoding]::UTF8, 'application/json')
  $resp = $client.SendAsync($req).GetAwaiter().GetResult()
  $respBody = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  W "GENERATE HTTP $([int]$resp.StatusCode)"
  if (-not $resp.IsSuccessStatusCode) { throw "generate falló: $($respBody.Substring(0,[Math]::Min(600,$respBody.Length)))" }
  $job = $respBody | ConvertFrom-Json
  $jobId = [string]$job.jobId
  W "jobId=$jobId stage=$($job.stage)"

  $last=''; $state=$null
  $deadline = [DateTime]::UtcNow.AddMinutes(50)
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Seconds 15
    $s = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, "$statusUrl`?jobId=$([Uri]::EscapeDataString($jobId))")
    $sr = $client.SendAsync($s).GetAwaiter().GetResult()
    $sb = $sr.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $sr.IsSuccessStatusCode) { W "POLL HTTP-$([int]$sr.StatusCode)"; continue }
    $state = $sb | ConvertFrom-Json
    $line = "status=$($state.status) phase=$($state.phase) pct=$($state.percentage) stage=$($state.stage)"
    if ($line -ne $last) { W $line; $last = $line }
    if ($state.status -in @('completed','failed','cancelled')) { break }
  }
  if ($null -eq $state -or $state.status -notin @('completed','failed','cancelled')) { throw 'tiempo agotado sin estado terminal' }
  W "TERMINAL status=$($state.status) terminalStatus=$($state.terminalStatus) documentId=$($state.documentId)"
  if ($state.error) { W "ERROR $($state.error)" }

  $sb | Set-Content -LiteralPath "$outDir/status.json" -Encoding UTF8
  if ($state.document) { $state.document | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath "$outDir/generated-document.json" -Encoding UTF8 }
  if ($state.documentId) { $state.documentId | Set-Content -LiteralPath "$outDir/document-id.txt" -Encoding UTF8 }
  $client.Dispose()
  W "artefactos en $outDir"
}
finally { Remove-Item -LiteralPath $transportPath -Force -ErrorAction SilentlyContinue; W 'copia temporal eliminada' }