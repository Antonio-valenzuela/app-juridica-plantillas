$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$uploadUrl = 'http://localhost:3200/api/templates/analyze-upload'
$generateUrl = 'http://localhost:3200/api/legal-engine/generate'
$statusUrl = 'http://localhost:3200/api/legal-engine/generate/status'
$sourcePath = 'C:\Users\yahir\Documents\DOC092126-09212026150739,papa.pdf'
$sourceFileName = [IO.Path]::GetFileName($sourcePath)
$sourceId = 'source-papa-real-20260924'
$transportPath = Join-Path $env:TEMP ('app-plantillas-papa-' + [Guid]::NewGuid().ToString('N') + '.pdf')
$started = [Diagnostics.Stopwatch]::StartNew()
$startedAt = (Get-Date).ToUniversalTime()
$upload = $null
$generation = $null
$state = $null
$jobId = ''
$documentId = ''
$sourcePages = $null
$ocrStatus = $null
$sourceQualityStatus = $null
$terminalStatus = $null
$documentReadiness = $null
$actualPages = $null
$targetPages = 40
$minPages = 40
$maxPages = 44
$qualityGate = $null
$validation = $null
$extensionTargetUnmet = $null

function Number-OrNull([object]$Value) {
  if ($null -eq $Value) { return $null }
  $parsed = 0.0
  if ([double]::TryParse([string]$Value, [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
    return [int]$parsed
  }
  return $null
}

function Write-Trace([string]$Message) {
  Write-Output "[TRACE] $Message"
}

function Send-JsonRequest([System.Net.Http.HttpMethod]$Method, [string]$Url, [string]$Json, [string]$RequestId, [string]$IdempotencyKey) {
  $request = [System.Net.Http.HttpRequestMessage]::new($Method, $Url)
  $request.Headers.Add('x-request-id', $RequestId)
  if ($IdempotencyKey) { $request.Headers.Add('x-idempotency-key', $IdempotencyKey) }
  if ($Json) { $request.Content = [System.Net.Http.StringContent]::new($Json, [Text.Encoding]::UTF8, 'application/json') }
  $response = $script:client.SendAsync($request).GetAwaiter().GetResult()
  $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $request.Dispose()
  return [pscustomobject]@{ Response = $response; Body = $body }
}

if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
  throw "No existe el PDF fuente: $sourcePath"
}

Write-Trace "Inicio=$(Get-Date -Format o)"
Write-Trace "Archivo=$sourcePath"
Write-Trace "Tamano=$((Get-Item -LiteralPath $sourcePath).Length) bytes"

$client = [System.Net.Http.HttpClient]::new()
try {
  Copy-Item -LiteralPath $sourcePath -Destination $transportPath
  Write-Trace "Copia temporal de transporte creada fuera del repo; nombre multipart=$sourceFileName"

  Write-Trace 'UPLOAD POST /api/templates/analyze-upload'
  # curl.exe on this Windows build parses a comma inside its multipart
  # filename option as a form token. The bytes are identical; omit the
  # transport filename and restore the original filename in the generation
  # source object below.
  $formArg = "file=@$transportPath;type=application/pdf"
  $uploadArgs = @('--silent', '--show-error', '--max-time', '300', '-X', 'POST', '--form', $formArg, '-H', 'x-request-id: powershell-full-trace', $uploadUrl)
  $uploadRaw = (& curl.exe @uploadArgs | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "curl upload exit code $LASTEXITCODE" }
  $upload = $uploadRaw | ConvertFrom-Json
  if ($upload.ok -ne $true) { throw "La carga fue rechazada: $uploadRaw" }
  $sourcePages = Number-OrNull $upload.qualityScore.pageCount
  if ($null -eq $sourcePages) { $sourcePages = @($upload.pages).Count }
  $ocrStatus = [string]$upload.ocrStatus
  $sourceQualityStatus = [string]$upload.sourceQualityStatus
  Write-Trace "UPLOAD HTTP 200 elapsedMs=$($started.ElapsedMilliseconds)"
  Write-Trace "UPLOAD pages=$($upload.qualityScore.pageCount) chars=$($upload.qualityScore.textLength) ocr=$($upload.ocrProvider) ocrStatus=$($upload.ocrStatus) quality=$($upload.sourceQualityStatus)"
  Write-Trace "CLASSIFICATION sourceType=$($upload.classification.sourceDocumentType) matter=$($upload.classification.materia) label=$($upload.classification.tipo_documento)"
  if ($upload.warnings) { Write-Trace "UPLOAD WARN $(@($upload.warnings) -join ' | ')" }
  if ($upload.sourceValidated -ne $true) { throw 'La fuente real quedó sin validar; no se genera.' }

  $pages = @($upload.pages | ForEach-Object {
    @{ page = [int]$_.page; text = [string]$_.text; chars = [int]$_.chars }
  })
  $source = [ordered]@{
    id = $sourceId
    filename = $sourceFileName
    name = $sourceFileName
    type = 'application/pdf'
    pages = $pages
    sourceValidated = $true
    sourceQualityStatus = [string]$upload.sourceQualityStatus
    sourceValidationMethod = [string]$upload.sourceValidationMethod
    sourceQuality = $upload.sourceQuality
    qualityScore = $upload.qualityScore
    warnings = @($upload.warnings)
    fileSizeBytes = (Get-Item -LiteralPath $sourcePath).Length
    lifecycle = @{ entityKind = 'SOURCE_DOCUMENT'; sourceId = $sourceId }
    __juridicoRadar = @{ entityKind = 'SOURCE_DOCUMENT'; sourceId = $sourceId }
  }

  $instruction = 'Genera un borrador profesional de apelación civil de más de 40 páginas, usando exclusivamente los hechos, resoluciones, agravios y datos rastreables al documento fuente. No inventes nombres, fechas, autoridades, normas, jurisprudencia, agravios ni peticiones. Cuando falte una decisión o dato, conserva [DATO PENDIENTE] y márcalo para revisión humana. Desarrolla únicamente agravios reales derivados de la resolución fuente, fundamentación sólo con autoridades verificables y petitorios que se desprendan con seguridad del planteamiento.'
  $idempotencyKey = 'powershell-real-appeal-' + [Guid]::NewGuid().ToString()
  $bodyObject = [ordered]@{
    userInstruction = $instruction
    sourceDocuments = @($source)
    matter = 'Civil'
    documentTypeLabel = 'Apelación Civil'
    selectedDocumentType = 'apelacion_civil'
    jurisdiction = 'Jalisco'
    generationExtension = @{ generationMode = 'extended-legal'; targetPages = $targetPages; minPages = $minPages; maxPages = $maxPages }
    # Igual que la UI: el workflow sólo lleva selección/estado pequeño; la
    # fuente canónica viaja una vez en sourceDocuments y sólo con páginas.
    workflow = @{ flow = 'DOCUMENT_ANALYSIS'; selection = @{ mode = 'automatic' }; updatedAt = (Get-Date).ToUniversalTime().ToString('o') }
    idempotencyKey = $idempotencyKey
  }
  $bodyJson = $bodyObject | ConvertTo-Json -Depth 100 -Compress
  Write-Trace "GENERATE payloadChars=$($bodyJson.Length) selectedDocumentType=apelacion_civil target=40 min=40 max=44"
  $generation = Send-JsonRequest ([System.Net.Http.HttpMethod]::Post) $generateUrl $bodyJson 'powershell-generation-trace' $idempotencyKey
  if (-not $generation.Response.IsSuccessStatusCode) {
    Write-Trace "GENERATE FAIL HTTP $([int]$generation.Response.StatusCode) body=$($generation.Body)"
    throw 'La creación del job falló.'
  }
  $job = $generation.Body | ConvertFrom-Json
  $jobId = [string]$job.jobId
  Write-Trace "GENERATE HTTP $([int]$generation.Response.StatusCode) jobId=$jobId stage=$($job.stage) elapsedMs=$($started.ElapsedMilliseconds)"

  $last = ''
  $deadline = [DateTime]::UtcNow.AddMinutes(30)
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Seconds 5
    $status = Send-JsonRequest ([System.Net.Http.HttpMethod]::Get) "$statusUrl`?jobId=$([Uri]::EscapeDataString($jobId))" $null 'powershell-generation-poll' $null
    if (-not $status.Response.IsSuccessStatusCode) {
      Write-Trace "POLL HTTP-$([int]$status.Response.StatusCode) $($status.Body)"
      continue
    }
    $state = $status.Body | ConvertFrom-Json
    $line = "status=$($state.status) phase=$($state.phase) pct=$($state.percentage) stage=$($state.stage) block=$($state.currentBlock)"
    if ($line -ne $last) {
      Write-Trace "POLL $line elapsedMs=$($started.ElapsedMilliseconds)"
      $last = $line
    }
    if ($state.status -in @('completed', 'failed', 'cancelled')) {
      $terminalStatus = [string]$state.terminalStatus
      $documentId = [string]$state.documentId
      $documentReadiness = [string]$state.documentReadiness
      $actualPages = Number-OrNull $state.document.originalPageCount
      if ($null -eq $actualPages) { $actualPages = Number-OrNull $state.document.generationMetadata.actualPages }
      if ($null -eq $actualPages) { $actualPages = Number-OrNull $state.document.generationMetadata.generationExtension.actualPages }
      $qualityGate = if ($null -ne $state.document.generationMetadata.qualityGate) { [bool]$state.document.generationMetadata.qualityGate } elseif ($null -ne $state.document.generationMetadata.qualityState) { [string]$state.document.generationMetadata.qualityState } else { $null }
      $validation = if ($null -ne $state.document.generationMetadata.validation) { [bool]$state.document.generationMetadata.validation } elseif ($null -ne $state.document.validation.isValid) { [bool]$state.document.validation.isValid } else { $null }
      $extensionTargetUnmet = if ($null -ne $actualPages) { $actualPages -lt $targetPages } else { $null }
      Write-Trace "TERMINAL status=$($state.status) terminalStatus=$($state.terminalStatus) documentId=$($state.documentId) errorCode=$($state.errorCode) warnings=$(@($state.warnings) -join ' | ')"
      if ($state.error) { Write-Trace "TERMINAL ERROR $($state.error)" }
      break
    }
  }
  Write-Trace "Fin=$(Get-Date -Format o) elapsedMs=$($started.ElapsedMilliseconds)"
}
finally {
  $client.Dispose()
  Remove-Item -LiteralPath $transportPath -Force -ErrorAction SilentlyContinue
  $artifactRoot = Join-Path $PSScriptRoot '..\artifacts\test-runs'
  New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
  $artifactPath = Join-Path $artifactRoot ("real-appeal-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  $safeArtifact = [ordered]@{
    schemaVersion = 1
    startedAt = $startedAt.ToString('o')
    finishedAt = (Get-Date).ToUniversalTime().ToString('o')
    durationMs = $started.ElapsedMilliseconds
    sourceFile = 'real-appeal.pdf'
    sourcePages = $sourcePages
    ocrStatus = $ocrStatus
    sourceQualityStatus = $sourceQualityStatus
    sourceValidated = if ($null -ne $upload) { [bool]$upload.sourceValidated } else { $null }
    classification = if ($null -ne $upload) { [ordered]@{ sourceDocumentType = [string]$upload.classification.sourceDocumentType; matter = [string]$upload.classification.materia; documentType = [string]$upload.classification.tipo_documento } } else { $null }
    selectedDocumentType = 'apelacion_civil'
    generationMode = 'extended-legal'
    targetPages = $targetPages
    minPages = $minPages
    maxPages = $maxPages
    actualPages = $actualPages
    terminalStatus = $terminalStatus
    documentReadiness = $documentReadiness
    qualityGate = $qualityGate
    validation = $validation
    extensionTargetUnmet = $extensionTargetUnmet
    jobId = $jobId
    documentId = $documentId
    warningCount = if ($null -ne $state) { @($state.warnings).Count } else { 0 }
    errorCode = if ($null -ne $state) { [string]$state.errorCode } elseif ($null -ne $generation) { [string]$generation.Response.StatusCode } else { $null }
    providerAttempts = Number-OrNull $state.document.generationMetadata.providerAttempts
    providerFallbacks = Number-OrNull $state.document.generationMetadata.providerFallbacks
  }
  $safeArtifact | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $artifactPath -Encoding UTF8
  Write-Trace "Artefacto técnico=$artifactPath"
  Write-Trace 'Copia temporal eliminada'
}
