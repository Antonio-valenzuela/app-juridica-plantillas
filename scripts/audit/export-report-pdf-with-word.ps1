[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$inputFile = [System.IO.Path]::GetFullPath($InputPath)
$outputFile = [System.IO.Path]::GetFullPath($OutputPath)
if (-not (Test-Path -LiteralPath $inputFile -PathType Leaf)) { throw "No existe el DOCX: $inputFile" }
$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($inputFile, $false, $true, $false)
  $document.ExportAsFixedFormat($outputFile, 17, $false, 0, 0, 1, 1, 0, $true, $false, 0, $true, $true, $false)
  Write-Output ("EXPORTED {0} bytes={1}" -f $outputFile, (Get-Item -LiteralPath $outputFile).Length)
} finally {
  if ($null -ne $document) {
    $document.Close($false)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document)
  }
  if ($null -ne $word) {
    $word.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
