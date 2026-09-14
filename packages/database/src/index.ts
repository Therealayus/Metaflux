import { PrismaClient } from "@prisma/client";

let cached: PrismaClient | undefined;

/**
 * Lazy singleton Prisma client with connection pooling via DATABASE_URL.
 * Lazy so importing this module never requires a live database (unit tests,
 * CLI tooling). First query will fail honestly if DATABASE_URL is unset.
 */
export function getPrisma(): PrismaClient {
  if (!cached) {
    cached = new PrismaClient({ log: ["error", "warn"] });
  }
  return cached;
}
