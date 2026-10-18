# Runtime y distribución

## Artefacto esperado

La aplicación se construye como Next.js standalone (`next.config.ts`, `output: "standalone"`) y requiere Node.js 20 o superior. El artefacto debe conservar:

- `.next/standalone/server.js` y `.next/static`.
- Prisma Client generado y el esquema/migraciones de `prisma/`.
- `spa.traineddata` y el worker de `tesseract.js` si se habilita OCR local.
- Un volumen persistente y escribible en `data/uploads/templates`.
- Base de datos local SQLite en la carpeta de datos del usuario (`%LOCALAPPDATA%\LexPlantillas\data`); las migraciones SQL de `prisma/migrations` viajan con el artefacto.

No se deben incluir `.env`, documentos de expedientes, backups locales, `scratch/`, `.tmp/` ni salidas de pruebas en el artefacto.

## Secuencia controlada

```powershell
npm ci
npm run db:generate
npm run db:migrate
npm run build
npm run distribution:validate
npm start
```

`db:migrate` aplica las migraciones a la base local; `db:backup`, `db:validate-backup` y `db:restore` operan sobre el archivo SQLite (ver `docs/persistencia-local.md`). Pruebe respaldos con `npm run db:backup-restore-smoke`, que usa una base temporal sintética.

## Readiness

`GET /api/health/readiness` informa `READY` o `NOT_READY` y expone únicamente estados operativos no secretos. El endpoint no abre ni modifica la base: informa `READY` si el archivo SQLite local existe y es escribible, y `CONFIGURED_NOT_VERIFIED` si todavía no se ha creado (se crea y migra en el primer uso).

Para OCR local, `OCR_PROVIDER=tesseract` o `auto` requiere worker, datos de idioma y `pdftoppm`. Si falta Poppler, las fuentes escaneadas deben quedar en revisión manual; no se genera texto jurídico de sustitución.

## Limpieza y trazabilidad

Los documentos subidos se guardan bajo `data/uploads/templates` con nombre controlado y se eliminan antes de borrar su fila cuando se solicita eliminar una plantilla. Las rutas almacenadas no se usan para limpiar archivos: sólo `savedFileName` validado y contenido dentro del directorio de uploads.

Las notas de terceros están en `THIRD_PARTY_NOTICES.md`. Los archivos de diseño históricos ya trackeados y las pruebas que apuntan a fixtures locales deben revisarse en una tarea de limpieza separada; este paso no los elimina ni altera expedientes.
