import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  buildLocalImportInventory,
  type LocalImportEntryInput,
  type LocalImportInventory,
} from './localImporter';

const execFileAsync = promisify(execFile);

export interface LocalImportSourceInfo {
  kind: 'DIRECTORY' | 'ZIP';
  path: string;
  limited: boolean;
}

export interface LocalImportSourceScan {
  source: LocalImportSourceInfo;
  inventory: LocalImportInventory;
}

export interface LocalImportScanOptions {
  limit?: number;
}

export async function hashLocalFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function collectDirectoryEntries(
  rootPath: string,
  options: LocalImportScanOptions,
): Promise<LocalImportEntryInput[]> {
  const entries: LocalImportEntryInput[] = [];
  const pending = [rootPath];
  const limit = options.limit && options.limit > 0 ? options.limit : Number.POSITIVE_INFINITY;

  while (pending.length > 0 && entries.length < limit) {
    const currentPath = pending.pop()!;
    const children = await readdir(currentPath, { withFileTypes: true });
    for (const child of children) {
      if (entries.length >= limit) break;
      const absolutePath = path.join(currentPath, child.name);
      const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join('/');
      if (child.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }

      const fileStat = await lstat(absolutePath);
      const extension = path.extname(child.name).toLocaleLowerCase();
      let sha256 = '0'.repeat(64);
      let readable = true;
      if (child.isSymbolicLink()) {
        readable = false;
      } else {
        try {
          sha256 = await hashLocalFile(absolutePath);
        } catch {
          readable = false;
        }
      }
      entries.push({
        relativePath,
        name: child.name,
        extension,
        sizeBytes: fileStat.size,
        sha256,
        modifiedAt: fileStat.mtime.toISOString(),
        readable,
      });
    }
  }

  return entries;
}

const POWERSHELL_ZIP_SCAN = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($env:LEXPLANTILLAS_IMPORT_ZIP_PATH)
$sha = [System.Security.Cryptography.SHA256]::Create()
$limit = [int]($env:LEXPLANTILLAS_IMPORT_LIMIT)
$seen = 0
try {
  foreach ($entry in $archive.Entries) {
    if ($entry.FullName.EndsWith('/')) { continue }
    if ($limit -gt 0 -and $seen -ge $limit) { break }
    $seen++
    $readable = $true
    $hash = '0000000000000000000000000000000000000000000000000000000000000000'
    try {
      $stream = $entry.Open()
      try {
        $hash = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
      } finally {
        $stream.Dispose()
      }
    } catch {
      $readable = $false
    }
    [pscustomobject]@{
      relativePath = $entry.FullName.Replace('\', '/')
      name = [System.IO.Path]::GetFileName($entry.FullName)
      extension = [System.IO.Path]::GetExtension($entry.FullName).ToLowerInvariant()
      sizeBytes = [int64]$entry.Length
      sha256 = $hash
      modifiedAt = $entry.LastWriteTime.UtcDateTime.ToString('o')
      readable = $readable
    } | ConvertTo-Json -Compress
  }
} finally {
  $archive.Dispose()
  $sha.Dispose()
}
`;

async function collectZipEntries(
  zipPath: string,
  options: LocalImportScanOptions,
): Promise<LocalImportEntryInput[]> {
  const command = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
  const { stdout } = await execFileAsync(command, ['-NoProfile', '-NonInteractive', '-Command', POWERSHELL_ZIP_SCAN], {
    env: {
      ...process.env,
      LEXPLANTILLAS_IMPORT_ZIP_PATH: zipPath,
      LEXPLANTILLAS_IMPORT_LIMIT: String(options.limit && options.limit > 0 ? options.limit : 0),
    },
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LocalImportEntryInput);
}

export interface LocalImportZipSelection {
  id: string;
  relativePath: string;
  outputName: string;
}

const POWERSHELL_ZIP_EXTRACT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$selection = Get-Content -Raw -LiteralPath $env:LEXPLANTILLAS_IMPORT_SELECTION_PATH | ConvertFrom-Json
$archive = [System.IO.Compression.ZipFile]::OpenRead($env:LEXPLANTILLAS_IMPORT_ZIP_PATH)
try {
  foreach ($item in @($selection)) {
    $entry = $archive.Entries | Where-Object { $_.FullName.Replace('\', '/') -eq $item.relativePath } | Select-Object -First 1
    if ($null -eq $entry) { throw "No se encontró la entrada ZIP: $($item.relativePath)" }
    $destination = Join-Path $env:LEXPLANTILLAS_IMPORT_DESTINATION_PATH $item.outputName
    $input = $entry.Open()
    try {
      $output = [System.IO.File]::Create($destination)
      try { $input.CopyTo($output) } finally { $output.Dispose() }
    } finally {
      $input.Dispose()
    }
    [pscustomobject]@{ id = $item.id; outputName = $item.outputName; ok = $true } | ConvertTo-Json -Compress
  }
} finally {
  $archive.Dispose()
}
`;

export async function extractLocalImportZipEntries(
  zipPath: string,
  destinationRoot: string,
  selections: LocalImportZipSelection[],
): Promise<void> {
  if (selections.length === 0) return;
  const selectionDirectory = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || '.', 'lex-import-selection-'));
  const selectionPath = path.join(selectionDirectory, 'selection.json');
  await writeFile(selectionPath, JSON.stringify(selections), 'utf8');
  try {
    const command = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    await execFileAsync(command, ['-NoProfile', '-NonInteractive', '-Command', POWERSHELL_ZIP_EXTRACT], {
      env: {
        ...process.env,
        LEXPLANTILLAS_IMPORT_ZIP_PATH: zipPath,
        LEXPLANTILLAS_IMPORT_SELECTION_PATH: selectionPath,
        LEXPLANTILLAS_IMPORT_DESTINATION_PATH: destinationRoot,
      },
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
  } finally {
    await rm(selectionDirectory, { recursive: true, force: true });
  }
}

export async function scanLocalImportSource(
  sourcePath: string,
  options: LocalImportScanOptions = {},
): Promise<LocalImportSourceScan> {
  const resolvedPath = path.resolve(sourcePath);
  const sourceStat = await stat(resolvedPath);
  let entries: LocalImportEntryInput[];
  let kind: LocalImportSourceInfo['kind'];

  if (sourceStat.isDirectory()) {
    kind = 'DIRECTORY';
    entries = await collectDirectoryEntries(resolvedPath, options);
  } else if (sourceStat.isFile() && path.extname(resolvedPath).toLocaleLowerCase() === '.zip') {
    kind = 'ZIP';
    entries = await collectZipEntries(resolvedPath, options);
  } else {
    throw new Error('Selecciona una carpeta o un archivo ZIP local.');
  }

  return {
    source: {
      kind,
      path: resolvedPath,
      limited: Boolean(options.limit && options.limit > 0),
    },
    inventory: buildLocalImportInventory(entries),
  };
}
