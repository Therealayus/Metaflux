# SocialFlux — Talk to Meta. We'll handle the APIs.

Premium AI-native Meta API integration & automation platform. Modular monolith
(web / api / worker + packages) with clean boundaries for later extraction.

## Quickstart

```bash
cp .env.example .env
docker compose up -d            # postgres, redis, minio
pnpm install
pnpm --filter @socialflux/database push
pnpm dev                        # web :3000, api :4000, worker
```

## Commands

```bash
pnpm dev | pnpm build | pnpm test | pnpm lint | pnpm typecheck
```

## Structure

```text
apps/web        Next.js 14 landing + auth + app shell + dashboard
apps/api        Fastify versioned API (/api/v1/...)
apps/worker     Async job processor (idempotent, retries, DLQ)
packages/meta   Meta boundaries: client/auth/capabilities/permissions/assets/errors/webhooks/types
packages/ai     Provider-neutral planner + validation gate
packages/*      types, config, auth, database, workflows, queues, observability, security, ui
```

## Rules

- Never claim something is implemented if it is only mocked.
- AI output always passes schema validation → permission check → policy → confirmation → execution.
- Tenant IDs come from the session, never from the client.
