# Persistencia local (SQLite)

Desde la Fase 1 (2026-10-13) expedientes, partes, borradores, plantillas del usuario y preferencias se guardan en un archivo SQLite local. Neon/Postgres ya no forma parte de la ruta principal, de los scripts de arranque ni de `.env.example`.

## Ubicación

| Elemento | Ruta |
|---|---|
| Carpeta de datos | `%LOCALAPPDATA%\LexPlantillas` (Windows) · `$XDG_DATA_HOME/LexPlantillas` o `~/.local/share/LexPlantillas` (otros) |
| Base de datos | `<carpeta de datos>\data\lexplantillas.db` (+ `-wal` / `-shm` mientras la app corre) |
| Copias de recuperación | `<carpeta de datos>\data\recovery\drafts\*.json` |
| Respaldos | `<carpeta de datos>\backups\<fecha>\` |

Se puede cambiar con `LEXPLANTILLAS_STORAGE_ROOT` (carpeta) o `LEXPLANTILLAS_DATABASE_PATH` (archivo). El código rechaza una ruta dentro de `node_modules`; nunca se usa el directorio de instalación ni temporales.

## Modelo de datos

Esquema en `prisma/schema.prisma` (provider `sqlite`), migración base `prisma/migrations/202610130001_sqlite_local_baseline`. Tablas: `Organization`, `User`, `LegalTemplate`, `LegalDraft`, `workspace_case_party`, `LawyerStyleProfile`, `GenerationJob`, `AiUsageLog`, `AiUsageEvent`, `AiProviderHealth`.

Cambios respecto al esquema de Postgres:

- Se quitaron `@db.Text` y `@db.Decimal` (SQLite no los distingue). `Json` se guarda como texto JSON; `Decimal` como numérico.
- `LegalDraft.idempotencyKey` + índice único `(organizationId, userId, idempotencyKey)`: reintentar un guardado no crea duplicados.
- `workspace_case_party` tiene índice único `(organizationId, caseKey, role)`: una parte por rol y expediente (ya era la regla lógica del endpoint).
- `enum TemplateVisibility` se conserva (Prisma lo guarda como texto en SQLite). No había arrays ni extensiones de Postgres en el esquema. Lo incompatible estaba en consultas: SQL crudo con `->`, `->>`, `jsonb_array_length` y `$1` (ahora `json_extract`, `json_array_length`, `?`), `mode: 'insensitive'` (`contains` de SQLite ya ignora mayúsculas ASCII; **no** ignora acentos: «Pérez» ≠ «PEREZ») y el filtro por ruta JSON en `templates/files` (ahora filtra en JavaScript).

## Migraciones

`lib/db/localDatabase.ts` aplica en orden las carpetas de `prisma/migrations` y las registra en `_prisma_migrations` con checksum. Es idempotente, transaccional por migración y falla si una migración ya aplicada fue modificada. Corre sola en la primera operación; `npm run db:migrate` la ejecuta explícitamente. Las migraciones históricas de Postgres están en `prisma/migrations-postgres-historical/` (solo referencia, no se aplican).

## Guardado seguro

- WAL activado y espera de bloqueo de 10 s.
- `POST /api/legal-drafts` es idempotente: clave = header `Idempotency-Key`, o `idempotencyKey` del cuerpo, o el `id` del documento. Un reintento devuelve el borrador existente (200) y lo actualiza con el contenido más reciente.
- Si la escritura falla (disco lleno, archivo bloqueado, esquema dañado), la ruta responde 503 `DRAFT_SAVE_FAILED` con un mensaje claro y escribe antes una copia en `data\recovery\drafts`. El editor conserva el documento en memoria y muestra «NO GUARDADO… Puedes reintentar».

## Protección real (y lo que falta)

**Medido/inspeccionado:** el archivo vive en la carpeta de datos del usuario de Windows, cuya ACL por defecto solo permite acceso a ese usuario, SYSTEM y administradores.

**No existe cifrado.** SQLite no cifra por defecto; el contenido (expedientes, nombres de partes) está en claro en disco. Cualquiera con acceso al perfil de Windows o a un respaldo puede leerlo. Los modos de archivo `0o600` solo tienen efecto en POSIX.

Pendiente y opciones: (a) cifrado de disco BitLocker (la medida más simple); (b) SQLCipher (requiere reemplazar el motor de Prisma, trabajo mayor); (c) cifrar los campos sensibles con una clave protegida por DPAPI desde el shell de escritorio. Decisión para el titular.

## Respaldo y restauración

```bash
npm run db:backup                 # VACUUM INTO + manifiesto con hashes (Node >= 22.5)
npm run db:validate-backup -- <ruta\lexplantillas.db>
npm run db:restore -- --backup=<ruta\lexplantillas.db> --confirm-target=YES   # cierre la app antes
npm run db:backup-restore-smoke   # prueba con base temporal sintética
```

La restauración conserva la base anterior como `lexplantillas.db.antes-de-restaurar-<fecha>`.

## Importar un respaldo exportado de Neon (opcional)

No se conecta a Neon. Exporte las tablas a un JSON con la forma:

```json
{ "format": "lexplantillas-neon-export-v1",
  "tables": { "Organization": [], "User": [], "LegalTemplate": [], "LegalDraft": [], "workspace_case_party": [], "LawyerStyleProfile": [] } }
```

y llame `importNeonExport(prisma, json)` de `lib/db/importNeonBackup.ts`. Es idempotente y transaccional; las partes que repiten rol/expediente se omiten y se reportan. La telemetría de IA no se importa. Un error 503 de Neon no demuestra que esté vacío: confirme con una exportación real antes de dar los datos por perdidos.

## Shell de escritorio (decisión pendiente)

No existe Electron ni Tauri en el repositorio. Hoy la app corre como servidor Next.js standalone en Node, lanzado por `scripts/desktop/local-launcher.mjs` (loopback + capacidad por sesión) y se usa desde el navegador. La capa de datos funciona en ese proceso Node y es reutilizable por cualquier shell.

| Opción | A favor | En contra |
|---|---|---|
| **Electron** | Incluye Node: el servidor, Prisma y SQLite actuales corren sin reescribir; empaquetado Windows maduro (`electron-builder`); `safeStorage` (DPAPI) para cifrado de campos. | Instalador grande (~150 MB+); hay que mantener Chromium actualizado. |
| **Tauri** | Instalador pequeño, WebView2 nativo, buena superficie de seguridad. | Requiere Rust y empaquetar Node como *sidecar* (el backend es Next/Prisma); más piezas para el instalador. |
| **Sin shell (script + navegador)** | Cero trabajo adicional; ya funciona. | Sin icono ni instalador propios; el usuario ve un servidor local; peor percepción de privacidad. |
