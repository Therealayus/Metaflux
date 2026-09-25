import { logger } from "@socialflux/observability";
import { registerAutomationHandlers } from "./automation.js";
import { registerCoreHandlersPublic, runLoop } from "./processor.js";

registerCoreHandlersPublic();
registerAutomationHandlers();

logger.info({
  msg: "socialflux worker starting",
  queueDriver: process.env.QUEUE_DRIVER ?? (process.env.REDIS_URL ? "redis" : "memory"),
  storeDriver: process.env.STORE_DRIVER ?? "prisma",
});

runLoop({
  group: process.env.QUEUE_GROUP ?? "socialflux",
  consumer: process.env.QUEUE_CONSUMER ?? `worker-${process.pid}`,
}).catch((err) => {
  logger.error({ err, msg: "worker loop crashed" });
  process.exit(1);
});
