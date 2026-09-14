import { logger } from "@metaflux/observability";
import { runLoop } from "./processor.js";

logger.info({
  msg: "metaflux worker starting",
  queueDriver: process.env.QUEUE_DRIVER ?? (process.env.REDIS_URL ? "redis" : "memory"),
  storeDriver: process.env.STORE_DRIVER ?? "prisma",
});

runLoop({
  group: process.env.QUEUE_GROUP ?? "metaflux",
  consumer: process.env.QUEUE_CONSUMER ?? `worker-${process.pid}`,
}).catch((err) => {
  logger.error({ err, msg: "worker loop crashed" });
  process.exit(1);
});
