[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$InputRoot,

  [Parameter(Mandatory = $true)]
  [string]$OutputRoot
)

$ErrorActionPreference = 'Stop'
$inputPath = [System.IO.Path]::GetFullPath($InputRoot)
$outputPath = [System.IO.Path]::GetFullPath($OutputRoot)
if (-not (Test-Path -LiteralPath $inputPath -PathType Container)) { throw "No existe InputRoot: $inputPath" }
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$word = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  foreach ($docx in Get-ChildItem -LiteralPath $inputPath -Recurse -Filter '*.docx' | Sort-Object FullName) {
    $caseName = Split-Path (Split-Path $docx.DirectoryName -Parent) -Leaf
    $caseOutput = Join-Path $outputPath $caseName
    New-Item -ItemType Directory -Force -Path $caseOutput | Out-Null
    $pdf = Join-Path $caseOutput ([System.IO.Path]::GetFileNameWithoutExtension($docx.Name) + '-word-render.pdf')
    $document = $null
    try {
      $document = $word.Documents.Open($docx.FullName, $false, $true, $false)
      $document.ExportAsFixedFormat($pdf, 17, $false, 0, 0, 1, 1, 0, $true, $false, 0, $true, $true, $false)
      Write-Output ("RENDERED {0} {1} bytes={2}" -f $docx.FullName,$pdf,(Get-Item -LiteralPath $pdf).Length)
    } finally {
      if ($null -ne $document) { $document.Close($false) }
      if ($null -ne $document) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
    }
  }
} finally {
  if ($null -ne $word) {
    $word.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
