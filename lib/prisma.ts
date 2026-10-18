import type { PrismaClient } from "@prisma/client";
import { createLocalPrismaClient } from "@/lib/db/localDatabase";

// Persistencia 100 % local (SQLite en la carpeta de datos del usuario).
// No lee DATABASE_URL: una URL heredada de Neon/Postgres en .env ya no se usa.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? (createLocalPrismaClient() as unknown as PrismaClient);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
