# Scaling

## Topology

Stateless web/API behind a load balancer; horizontal workers on Redis Streams
consumer groups; Postgres primary + optional read replica (`REPLICA_DATABASE_URL`);
Redis for queue, delays, cache and flags; object storage for large payloads.

## Measured baseline (dev box, memory store)

`node scripts/load/probe.mjs --rps 40 --seconds 15` against a single API
process: 496 requests, 0 errors, p95 22ms. The default rate limit (300/min)
sheds excess load with 429 before latency degrades — raise `RATE_LIMIT_MAX`
behind your own edge protection. k6 profile in `scripts/load/api.js`
(p95 < 500ms @ 100 RPS, errors < 1%).

## Levers

- **Workers**: stateless loop, `QUEUE_CONCURRENCY` per process (default 5),
  scale processes; consumer groups + `XAUTOCLAIM` reclaim crashed work after 30s.
- **Reads**: `getReplicaPrisma()` serves `listEvents`/`listApiRequests` from the
  replica when configured; falls back to primary otherwise.
- **AI cost**: prompt-hash plan cache (`ai.plan_cache` flag, 1h TTL) in front of
  the LLM; per-org monthly budgets enforced pre-spend; model routing
  (cheap vs strong) per task.
- **Hot paths**: per-API-key rate buckets; cursor pagination everywhere (max 100);
  payloads > 32KB go to S3, never Postgres rows.
- **Database**: connection pooling via `DATABASE_URL`; indexes on all tenant +
  time access paths (`organizationId, createdAt/receivedAt`). Partition
  `WebhookEvent`/`AuditLog` by month when a single partition exceeds ~50M rows —
  the event store's cursor pagination and `deleteEventsBefore` retention are
  partition-compatible by design (time-ordered, range-deletable).

## Disaster recovery

- Postgres: daily base backups + WAL archiving (PITR); test restores monthly.
- Redis: AOF persistence; queue depth/DLQ gauges alert before loss matters.
  Streams retain history — replay from the event viewer after incidents.
- Secrets: `TOKEN_ENCRYPTION_KEY` in a KMS-backed store, rotated per
  `SECURITY.md`; losing it requires reconnecting Meta accounts (tokens
  cannot be recovered — by design).
- Probes: `/live` (liveness), `/api/v1/ready` (DB + Redis + queue),
  `/api/v1/metrics` (Prometheus, optional `METRICS_TOKEN` bearer).
