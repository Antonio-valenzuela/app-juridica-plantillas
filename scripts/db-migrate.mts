// Crea/migra la base SQLite local (equivalente reproducible a `prisma migrate deploy`).
// Uso: npm run db:migrate   (ruta: LEXPLANTILLAS_DATABASE_PATH o %LOCALAPPDATA%\LexPlantillas\data)
import { createLocalPrismaClient, applyLocalMigrations, resolveMigrationsDir } from '../lib/db/localDatabase';

const client = createLocalPrismaClient();
try {
  const applied = await applyLocalMigrations(client as never, resolveMigrationsDir());
  console.log(`DB_MIGRATE_OK path=${client.$databasePath} applied=${applied.length ? applied.join(',') : 'none'}`);
} finally {
  await client.$disconnect();
}
