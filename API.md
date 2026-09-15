# API

Versioned under `/api/v1`. Zod validation, typed DTOs, structured errors
`{code,message,requestId}`, cursor pagination (`?cursor&limit`, max 100),
idempotency keys on sends/executions/replays.

## Auth

- `POST /auth/signup|/signin|/signout`, `GET /auth/me` (httpOnly session cookie)
- `POST /auth/password-reset/request|/redeem` (single-use hashed tokens)
- `GET /auth/google|github/start|/callback` (501 unless provider env is set)
- API keys: `POST|GET /keys`, `POST /keys/:id/revoke` (session-only, raw key
  shown once, stored as hash). Keys authenticate via `Bearer mf_…` or
  `x-api-key` with scopes: `messages:send events:read workflows:read
  workflows:write leads:read assets:read ai:use`.
- Tenant: API key → session cookie (+ `x-org-id` membership) → dev headers
  (non-production only). Destructive calls need `x-confirm: true`.

## Resources

- `GET /connections/meta/start`, `GET /connections/meta/callback` (Meta OAuth)
- `GET|POST /connections`, `GET|DELETE /connections/:id`,
  `POST /connections/:id/discover|/subscribe`, `GET /connections/:id/health|/permissions`
- `GET /assets` (relationship graph), `GET /capabilities`, `GET /permissions`
- `POST|GET /workflows`, `GET|PATCH|DELETE /workflows/:id`,
  `GET /workflows/:id/executions`, `GET /executions/:id`, `POST /executions/:id/retry`
- `GET /leads`
- `POST /webhooks/meta` (Meta ingress), `POST /webhooks/meta/test` (synthetic)
- `GET /events`, `GET /events/:id` (payload resolved inline/S3), `POST /events/:id/replay`
- `POST /ai/plan|/explain|/diagnose`, `GET /ai/usage`
- `POST /messages` (unified send: `{channel, recipient, message, idempotencyKey?}`)
- `GET /requests`, `GET /requests/:id` (inspector), `GET /usage`, `GET /developer/scopes`
- Billing: `GET /billing/subscription`, `POST /billing/checkout|/plan|/webhook`
- Ops: `GET /live`, `/api/v1/live|/ready|/metrics` (Prometheus; bearer-gated by `METRICS_TOKEN`)
- Admin (`ADMIN_API_KEY` bearer, disabled when unset): `GET /admin/overview|/dlq|/flags`,
  `PUT|DELETE /admin/flags/:name`
