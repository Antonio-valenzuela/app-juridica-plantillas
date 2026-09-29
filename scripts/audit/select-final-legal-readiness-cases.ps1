[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ZipPath,

  [Parameter(Mandatory = $true)]
  [string]$SelectionJsonPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputRoot
)

$ErrorActionPreference = 'Stop'

function Write-AuditLine {
  param([string]$Message)
  $timestamp = (Get-Date).ToString('o')
  Write-Output "$timestamp $Message"
}

function Get-SafeFileName {
  param([string]$Value)
  $invalid = [System.IO.Path]::GetInvalidFileNameChars()
  $builder = [System.Text.StringBuilder]::new()
  foreach ($character in $Value.ToCharArray()) {
    if ($invalid -contains $character) {
      [void]$builder.Append('_')
    } else {
      [void]$builder.Append($character)
    }
  }
  return $builder.ToString()
}

if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) {
  throw "No existe el ZIP de pruebas: $ZipPath"
}
if (-not (Test-Path -LiteralPath $SelectionJsonPath -PathType Leaf)) {
  throw "No existe la selección de casos: $SelectionJsonPath"
}

$selection = Get-Content -LiteralPath $SelectionJsonPath -Raw | ConvertFrom-Json
$selectedCases = @($selection.cases)
if ($selectedCases.Count -ne 6) {
  throw "La selección debe contener exactamente 6 casos; contiene $($selectedCases.Count)."
}

$caseNumbers = [System.Collections.Generic.HashSet[string]]::new()
$sourceEntries = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($selectedCase in $selectedCases) {
  $caseNumber = ([string]$selectedCase.caseNumber).Trim()
  $sourceEntry = ([string]$selectedCase.sourceEntry).Trim()
  if ([string]::IsNullOrWhiteSpace($caseNumber) -or [string]::IsNullOrWhiteSpace($sourceEntry)) {
    throw 'Cada selección requiere caseNumber y sourceEntry.'
  }
  if (-not $caseNumbers.Add($caseNumber)) {
    throw "Número de caso duplicado: $caseNumber"
  }
  if (-not $sourceEntries.Add($sourceEntry)) {
    throw "Entrada del ZIP duplicada: $sourceEntry"
  }
}

$resolvedOutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Force -Path $resolvedOutputRoot | Out-Null
$logPath = Join-Path $resolvedOutputRoot 'selection.log'
if (Test-Path -LiteralPath $logPath) {
  Remove-Item -LiteralPath $logPath -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ZipPath).Path)
$manifestCases = [System.Collections.Generic.List[object]]::new()

try {
  foreach ($selectedCase in ($selectedCases | Sort-Object { [int]$_.caseNumber })) {
    $caseNumber = ([string]$selectedCase.caseNumber).Trim().PadLeft(2, '0')
    $sourceEntryName = ([string]$selectedCase.sourceEntry).Trim().Replace('\', '/')
    if ($sourceEntryName.StartsWith('/') -or $sourceEntryName.Contains('../')) {
      throw "Entrada insegura del ZIP: $sourceEntryName"
    }

    $entry = $archive.GetEntry($sourceEntryName)
    if ($null -eq $entry) {
      throw "La entrada no existe en el ZIP: $sourceEntryName"
    }
    if ($entry.FullName.EndsWith('/')) {
      throw "La selección apunta a una carpeta, no a un archivo: $sourceEntryName"
    }
    if (-not $entry.FullName.EndsWith('.docx', [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "La selección debe usar fuentes DOCX: $sourceEntryName"
    }

    $caseRoot = Join-Path $resolvedOutputRoot ("cases\$caseNumber")
    $sourceRoot = Join-Path $caseRoot 'source'
    New-Item -ItemType Directory -Force -Path $sourceRoot | Out-Null
    $fileName = Get-SafeFileName -Value ([System.IO.Path]::GetFileName($entry.FullName))
    $targetPath = Join-Path $sourceRoot $fileName

    $inputStream = $entry.Open()
    try {
      $outputStream = [System.IO.File]::Create($targetPath)
      try {
        $inputStream.CopyTo($outputStream)
      } finally {
        $outputStream.Dispose()
      }
    } finally {
      $inputStream.Dispose()
    }

    $hash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $sourceRelativePath = "cases/$caseNumber/source/$fileName"
    $manifestCases.Add([ordered]@{
      caseNumber = $caseNumber
      sourceEntry = $sourceEntryName
      sourceRelativePath = $sourceRelativePath
      sourceFileName = $fileName
      sourceSha256 = $hash
      sourceBytes = (Get-Item -LiteralPath $targetPath).Length
      matter = [string]$selectedCase.matter
      sourceDocumentType = [string]$selectedCase.sourceDocumentType
      outputDocumentType = [string]$selectedCase.outputDocumentType
      rationale = [string]$selectedCase.rationale
      expectedReviewState = [string]$selectedCase.expectedReviewState
      extractedSourcePath = $targetPath
    })

    Write-AuditLine "CASE $caseNumber source=$sourceEntryName bytes=$($entry.Length) sha256=$hash" | Tee-Object -FilePath $logPath -Append
  }
} finally {
  $archive.Dispose()
}

$manifest = [ordered]@{
  generatedAt = (Get-Date).ToString('o')
  testBankZip = [System.IO.Path]::GetFullPath($ZipPath)
  productionDatabaseExcluded = $true
  cases = $manifestCases
}
$manifestPath = Join-Path $resolvedOutputRoot 'selected-cases.json'
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-AuditLine "MANIFEST $manifestPath" | Tee-Object -FilePath $logPath -Append
Write-AuditLine "CASES $($manifestCases.Count)" | Tee-Object -FilePath $logPath -Append
