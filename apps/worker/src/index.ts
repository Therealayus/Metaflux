import { logger } from "@metaflux/observability";

logger.info({ msg: "metaflux worker starting (foundation: no queue binding yet — Phase 3 wires Redis streams)" });

setInterval(() => {
  logger.debug({ msg: "worker heartbeat" });
}, 30_000);
