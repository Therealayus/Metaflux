import { PrismaClient } from "@prisma/client";

let cached: PrismaClient | undefined;
let replicaCached: PrismaClient | undefined;

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

/**
 * Read-replica client for heavy list paths. Without REPLICA_DATABASE_URL it
 * returns the primary — same behavior, zero config. With a replica, reads
 * scale horizontally while writes stay on the primary.
 */
export function getReplicaPrisma(): PrismaClient {
  const url = process.env.REPLICA_DATABASE_URL;
  if (!url) return getPrisma();
  if (!replicaCached) {
    replicaCached = new PrismaClient({ log: ["error", "warn"], datasourceUrl: url });
  }
  return replicaCached;
}
