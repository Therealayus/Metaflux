# SocialFlux — Talk to Meta. We'll handle the APIs.

![CI](https://github.com/Therealayus/Metaflux/actions/workflows/ci.yml/badge.svg?branch=main)
![Node](https://img.shields.io/badge/node-20-339933?logo=node.js&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-9.7.1-F69220?logo=pnpm&logoColor=white)
![Turbo](https://img.shields.io/badge/turborepo-2.x-EF4444?logo=turborepo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5-black?logo=fastify&logoColor=white)
![Postgres](https://img.shields.io/badge/Postgres-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

> Flagship project of [@Therealayus](https://github.com/Therealayus) — see profile for system deep-dive.

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
