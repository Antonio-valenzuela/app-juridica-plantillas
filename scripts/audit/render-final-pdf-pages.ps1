[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$InputRoot,

  [Parameter(Mandatory = $true)]
  [string]$OutputRoot
)

$ErrorActionPreference = 'Stop'
$popplerRoot = 'C:\Users\yahir\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin'
$pdfInfo = Join-Path $popplerRoot 'pdfinfo.exe'
$pdfToPpm = Join-Path $popplerRoot 'pdftoppm.exe'
$inputPath = [System.IO.Path]::GetFullPath($InputRoot)
$outputPath = [System.IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$rows = foreach ($caseNumber in '01', '02', '03', '04', '05', '06') {
  $inputFile = Join-Path $inputPath "cases\$caseNumber\outputs\caso-$caseNumber-contestacion-DRAFT.pdf"
  $caseOutput = Join-Path $outputPath $caseNumber
  New-Item -ItemType Directory -Force -Path $caseOutput | Out-Null
  $info = & $pdfInfo $inputFile 2>&1
  $pageLine = $info | Where-Object { $_ -match '^Pages:\s+(\d+)' } | Select-Object -First 1
  $pageCount = [int]([regex]::Match([string]$pageLine, '^Pages:\s+(\d+)').Groups[1].Value)
  $renderWarning = Join-Path $caseOutput 'poppler-render-warning.txt'
  $firstPrefix = Join-Path $caseOutput 'app-first'
  $lastPrefix = Join-Path $caseOutput 'app-last'
  $firstCommand = '"{0}" -png -r 120 -f 1 -l 1 -singlefile "{1}" "{2}" 2>> "{3}"' -f $pdfToPpm, $inputFile, $firstPrefix, $renderWarning
  $lastCommand = '"{0}" -png -r 120 -f {1} -l {1} -singlefile "{2}" "{3}" 2>> "{4}"' -f $pdfToPpm, $pageCount, $inputFile, $lastPrefix, $renderWarning
  cmd.exe /d /c $firstCommand | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "pdftoppm first-page render failed for case $caseNumber" }
  cmd.exe /d /c $lastCommand | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "pdftoppm last-page render failed for case $caseNumber" }
  [pscustomobject]@{
    case = $caseNumber
    pages = $pageCount
    pdfBytes = (Get-Item -LiteralPath $inputFile).Length
    firstPage = (Join-Path $caseOutput 'app-first.png')
    lastPage = (Join-Path $caseOutput 'app-last.png')
  }
}

$rows | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outputPath 'pdf-render-summary.json') -Encoding UTF8
$rows | Format-Table -AutoSize
