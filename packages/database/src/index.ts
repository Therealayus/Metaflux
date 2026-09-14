import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __metafluxPrisma: PrismaClient | undefined;
}

/** Singleton Prisma client with connection pooling via DATABASE_URL. */
export const prisma: PrismaClient =
  globalThis.__metafluxPrisma ?? new PrismaClient({ log: ["error", "warn"] });

if (process.env.NODE_ENV !== "production") {
  globalThis.__metafluxPrisma = prisma;
}
