param([int]$TargetProcessId = 33436, [switch]$StopVerifiedServer)
$ErrorActionPreference = 'Stop'
$targetProcess = Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue
if (-not $targetProcess) { [pscustomobject]@{ processId=$TargetProcessId; exists=$false } | ConvertTo-Json; exit 0 }
# Read-only process query. WMI/CIM is unavailable in this sandbox; class 60 returns
# the command line to a local buffer without injecting into or modifying a process.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LocalProcessCommandLine {
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int id);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr handle, int informationClass, IntPtr buffer, int length, out int returned);
  public static string Read(int id) {
    IntPtr handle = OpenProcess(0x1000, false, id);
    if (handle == IntPtr.Zero) throw new Exception("OpenProcess error " + Marshal.GetLastWin32Error());
    IntPtr buffer = Marshal.AllocHGlobal(65536);
    try {
      int returned;
      int status = NtQueryInformationProcess(handle, 60, buffer, 65536, out returned);
      if (status != 0) throw new Exception("NtQueryInformationProcess status " + status);
      int length = (ushort)Marshal.ReadInt16(buffer);
      IntPtr text = Marshal.ReadIntPtr(buffer, IntPtr.Size == 8 ? 8 : 4);
      return Marshal.PtrToStringUni(text, length / 2);
    } finally { Marshal.FreeHGlobal(buffer); CloseHandle(handle); }
  }
}
'@
$commandLine = [LocalProcessCommandLine]::Read($TargetProcessId)
$commandLine = $commandLine -replace '(?i)(token|secret|password|api[_-]?key)[=: ]+\S+', '$1=[REDACTED]'
$modules = @($targetProcess.Modules | Where-Object { $_.FileName -like '*APP-plantillas*' } | ForEach-Object { $_.FileName })
[pscustomobject]@{ processId=$TargetProcessId; exists=$true; executable=$targetProcess.Path; commandLine=$commandLine; applicationModules=$modules } | ConvertTo-Json -Depth 3
if ($StopVerifiedServer) {
  $expectedServer = Join-Path (Get-Location).Path 'node_modules\next\dist\server\lib\start-server.js'
  $expectedDll = Join-Path (Get-Location).Path 'node_modules\.prisma\client\query_engine-windows.dll.node'
  if (-not $commandLine.Contains($expectedServer) -or -not ($modules -contains $expectedDll)) {
    throw 'REFUSED: process is not the verified Next server holding this project DLL.'
  }
  # Non-forced close of this PID only. No /F, no /T, no other process or terminal.
  & taskkill.exe /PID $TargetProcessId
  if ($LASTEXITCODE -ne 0) { throw 'Non-forced process close failed; no forced termination attempted.' }
  if (-not $targetProcess.WaitForExit(5000)) { throw 'Verified server has not exited; no forced termination attempted.' }
  [pscustomobject]@{ processId=$TargetProcessId; exists=[bool](Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue); action='taskkill without /F or /T' } | ConvertTo-Json
}
