# Deployment

## Services

Web + API + Worker + Postgres + Redis + object storage + queue. Env from
`.env.example`. Migrate with `pnpm --filter @socialflux/database migrate`
(can be run as `prisma migrate deploy` in CI/CD).

## Checklist

1. `cp .env.example .env` and set: `AUTH_SECRET` (≥32 chars),
   `TOKEN_ENCRYPTION_KEY` (32 random bytes, base64), `DATABASE_URL`,
   `REDIS_URL`, `META_APP_ID/SECRET`, `META_WEBHOOK_VERIFY_TOKEN`,
   `WEB_URL`, `STRIPE_*` (or leave billing manual), `ADMIN_API_KEY`,
   `METRICS_TOKEN`, `ALLOW_DEV_AUTH` (leave unset in production).
2. `docker compose up -d` (local) or provision managed Postgres/Redis/S3.
3. `pnpm install && pnpm --filter @socialflux/database migrate && pnpm build`.
4. Start `apps/web` (3000), `apps/api` (4000), `apps/worker` (loop).
5. Verify `/api/v1/ready` is 200 and `/api/v1/metrics` scrapes.

## Production notes

- `NODE_ENV=production` enables secure cookies and disables dev-header auth.
- Run at least 2 API and 2 worker replicas; one worker group per environment
  (`QUEUE_GROUP`) so staging never steals production jobs (`QUEUE_NAMESPACE`).
- Stripe webhook endpoint: `POST /api/v1/billing/webhook` with
  `STRIPE_WEBHOOK_SECRET`; Meta webhook: `/api/v1/webhooks/meta`.
- Backups per `SCALING.md` (Postgres PITR, Redis AOF, S3 versioning).
