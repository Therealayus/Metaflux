/**
 * Tenant-safe persistence boundary for the API.
 * Every method takes organizationId explicitly — route handlers pass it from
 * the session-derived TenantContext, never from client input.
 */

export interface WorkspaceRecord {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
}

export interface ConnectionRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  product: string;
  status: string;
  scopes: string[];
  encryptedToken: string | null;
  tokenExpiresAt: string | null;
  metaUserId: string | null;
  webhookStatus: string | null;
  lastEventAt: string | null;
  lastHealthAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetInput {
  metaId: string;
  type: string;
  product: string;
  name: string;
  parentMetaId?: string;
  encryptedToken?: string;
}

export interface AssetRecord {
  id: string;
  connectionId: string;
  organizationId: string;
  workspaceId: string;
  type: string;
  product: string;
  name: string;
  metaId: string;
  parentId: string | null;
  healthy: boolean;
  encryptedToken: string | null;
}

export interface ConnectionUpsert {
  organizationId: string;
  workspaceId: string;
  product: string;
  status: string;
  scopes: string[];
  encryptedToken: string;
  tokenExpiresAt: string | null;
  metaUserId: string | null;
}

export interface Store {
  // Workspaces
  createWorkspace(organizationId: string, name: string): Promise<WorkspaceRecord>;
  getWorkspace(id: string, organizationId: string): Promise<WorkspaceRecord | null>;

  // Connections
  upsertConnection(input: ConnectionUpsert): Promise<ConnectionRecord>;
  getConnection(id: string, organizationId: string): Promise<ConnectionRecord | null>;
  listConnections(organizationId: string, workspaceId?: string): Promise<ConnectionRecord[]>;
  updateConnection(
    id: string,
    organizationId: string,
    patch: Partial<Pick<ConnectionRecord, "status" | "scopes" | "webhookStatus" | "lastEventAt" | "lastHealthAt">>,
  ): Promise<ConnectionRecord>;
  deleteConnection(id: string, organizationId: string): Promise<void>;

  // Assets
  replaceAssets(connectionId: string, organizationId: string, assets: AssetInput[]): Promise<AssetRecord[]>;
  listAssets(organizationId: string, workspaceId?: string): Promise<AssetRecord[]>;

  // Audit
  audit(organizationId: string, userId: string | null, action: string, target?: string): Promise<void>;

  // AI usage (cost control)
  recordAiUsage(
    organizationId: string,
    usage: { model: string; tokensIn: number; tokensOut: number; costCents: number; requestType: string; latencyMs: number },
  ): Promise<void>;
  sumAiUsageCostSince(organizationId: string, sinceIso: string): Promise<number>;

  // Webhook event store
  createEvent(input: EventInput): Promise<{ record: EventRecord; created: boolean }>;
  getEvent(id: string, organizationId: string): Promise<EventRecord | null>;
  listEvents(
    organizationId: string,
    opts: { cursor?: string; limit?: number; product?: string; status?: string; workspaceId?: string },
  ): Promise<EventList>;
  updateEvent(id: string, organizationId: string, patch: EventPatch): Promise<EventRecord>;
  /** Retention: delete events received before `beforeIso`. Returns deleted count. */
  deleteEventsBefore(beforeIso: string): Promise<number>;

  // System-level routing: Meta object id -> owning connection (result re-scoped by caller).
  findConnectionByAssetMetaId(metaId: string): Promise<{
    connection: ConnectionRecord;
    organizationId: string;
    workspaceId: string;
  } | null>;

  // Workflows
  createWorkflow(input: { organizationId: string; workspaceId: string; name: string; definition: unknown }): Promise<WorkflowRecord>;
  getWorkflow(id: string, organizationId: string): Promise<WorkflowRecord | null>;
  listWorkflows(
    organizationId: string,
    opts: { workspaceId?: string; status?: string; cursor?: string; limit?: number },
  ): Promise<{ items: WorkflowRecord[]; nextCursor?: string }>;
  updateWorkflow(
    id: string,
    organizationId: string,
    patch: { name?: string; definition?: unknown; status?: string },
  ): Promise<WorkflowRecord>;
  deleteWorkflow(id: string, organizationId: string): Promise<void>;

  // Executions (idempotent)
  createExecution(input: {
    workflowId: string;
    organizationId: string;
    idempotencyKey: string;
    input?: unknown;
  }): Promise<{ record: ExecutionRecord; created: boolean }>;
  getExecution(id: string, organizationId: string): Promise<ExecutionRecord | null>;
  listExecutions(
    workflowId: string,
    organizationId: string,
    opts: { cursor?: string; limit?: number },
  ): Promise<{ items: ExecutionRecord[]; nextCursor?: string }>;
  updateExecution(
    id: string,
    organizationId: string,
    patch: { status?: string; output?: unknown; error?: string | null },
  ): Promise<ExecutionRecord>;

  // Leads
  createLead(input: {
    organizationId: string;
    workspaceId: string;
    workflowId?: string;
    name?: string;
    phone?: string;
    email?: string;
    source?: string;
    attributes?: unknown;
  }): Promise<LeadRecord>;
  listLeads(
    organizationId: string,
    opts: { workspaceId?: string; cursor?: string; limit?: number },
  ): Promise<{ items: LeadRecord[]; nextCursor?: string }>;

  // Identity
  createUser(input: { email: string; passwordHash?: string; name?: string }): Promise<UserRecord>;
  getUserByEmail(email: string): Promise<UserRecord | null>;
  getUserById(id: string): Promise<UserRecord | null>;
  createOrganization(input: { name: string; slug: string }): Promise<OrganizationRecord>;
  createMembership(userId: string, organizationId: string, role: string): Promise<MembershipRecord>;
  getMembership(userId: string, organizationId: string): Promise<MembershipRecord | null>;
  listUserMemberships(userId: string): Promise<Array<MembershipRecord & { organization: OrganizationRecord }>>;
  createSession(userId: string, tokenHash: string, expiresAt: string): Promise<SessionRecord>;
  getSessionByTokenHash(tokenHash: string): Promise<(SessionRecord & { user: UserRecord }) | null>;
  deleteSession(id: string): Promise<void>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
  createPasswordReset(userId: string, tokenHash: string, expiresAt: string): Promise<void>;
  consumePasswordReset(tokenHash: string): Promise<string | null>;

  // API keys (hashes only — raw keys never persist)
  createApiKey(input: {
    organizationId: string;
    name: string;
    prefix: string;
    keyHash: string;
    scopes: string[];
    expiresAt?: string | null;
  }): Promise<ApiKeyRecord>;
  listApiKeys(organizationId: string): Promise<ApiKeyPublic[]>;
  getApiKeyByPrefix(prefix: string): Promise<ApiKeyRecord | null>;
  touchApiKey(id: string): Promise<void>;
  revokeApiKey(id: string, organizationId: string): Promise<void>;

  // API request logs
  appendApiRequest(input: {
    organizationId: string;
    keyId?: string | null;
    method: string;
    path: string;
    status: number;
    latencyMs: number;
    requestId?: string;
  }): Promise<void>;
  listApiRequests(
    organizationId: string,
    opts: { keyId?: string; status?: number; cursor?: string; limit?: number },
  ): Promise<{ items: ApiRequestRecord[]; nextCursor?: string }>;
  getApiRequest(id: string, organizationId: string): Promise<ApiRequestRecord | null>;
  countApiRequests(organizationId: string, sinceIso: string): Promise<number>;

  // Billing
  getSubscription(organizationId: string): Promise<SubscriptionRecord | null>;
  upsertSubscription(
    organizationId: string,
    patch: Partial<Pick<SubscriptionRecord, "plan" | "status" | "stripeCustomerId" | "stripeSubscriptionId" | "currentPeriodEnd">>,
  ): Promise<SubscriptionRecord>;
  countWorkflows(organizationId: string): Promise<number>;
  countExecutionsSince(organizationId: string, sinceIso: string): Promise<number>;
  /** System-level Stripe routing lookup (webhook context, result re-scoped by caller). */
  findSubscriptionByStripeId(input: { customerId?: string; subscriptionId?: string }): Promise<SubscriptionRecord | null>;
}

export interface SubscriptionRecord {
  id: string;
  organizationId: string;
  plan: string;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventInput {
  organizationId: string;
  workspaceId?: string | null;
  provider: string;
  product: string;
  eventType: string;
  eventId: string;
  payloadRef?: string | null;
  payload?: unknown;
}

export interface EventRecord {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  provider: string;
  product: string;
  eventType: string;
  eventId: string;
  status: string;
  attemptCount: number;
  payloadRef: string | null;
  payload: unknown | null;
  error: string | null;
  receivedAt: string;
  processedAt: string | null;
}

export interface EventPatch {
  status?: string;
  attemptCount?: number;
  processedAt?: string | null;
  error?: string | null;
}

export interface EventList {
  items: EventRecord[];
  nextCursor?: string;
}

/** Opaque cursor: base64url(receivedAt|id), newest-first. */
export function encodeEventCursor(receivedAt: string, id: string): string {
  return Buffer.from(`${receivedAt}|${id}`).toString("base64url");
}

export function decodeEventCursor(cursor: string): { receivedAt: string; id: string } {
  const [receivedAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (!receivedAt || !id) throw new Error("Invalid cursor");
  return { receivedAt, id };
}

export interface WorkflowRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  definition: unknown;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionRecord {
  id: string;
  workflowId: string;
  organizationId: string;
  status: string;
  idempotencyKey: string;
  input: unknown | null;
  output: unknown | null;
  error: string | null;
  createdAt: string;
}

export interface LeadRecord {
  id: string;
  organizationId: string;
  workspaceId: string;
  workflowId: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  attributes: unknown | null;
  createdAt: string;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface MembershipRecord {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface ApiKeyRecord {
  id: string;
  organizationId: string;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export type ApiKeyPublic = Omit<ApiKeyRecord, "keyHash">;

export interface ApiRequestRecord {
  id: string;
  organizationId: string;
  keyId: string | null;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  requestId: string | null;
  createdAt: string;
}
