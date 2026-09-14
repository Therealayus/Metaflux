# Database

Postgres for relational/tenant data, Redis for cache/rate-limit/locks/queues,
object storage for payload archives. Prisma schema in `packages/database/prisma`.

Key tables: User, Organization, Membership, Workspace, Session, MetaConnection
(encrypted token), MetaAsset, Workflow, WorkflowExecution (idempotency unique),
WebhookEvent (eventId unique), AuditLog.
