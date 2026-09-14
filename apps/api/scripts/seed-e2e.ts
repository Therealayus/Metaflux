/** Phase 3 E2E seed: org + workspace + facebook connection + page asset. */
import { PrismaStore, getPrisma } from "@metaflux/database";

const prisma = getPrisma();
const organization = await prisma.organization.upsert({
  where: { slug: "e2e-acme" },
  create: { name: "E2E Acme", slug: "e2e-acme" },
  update: {},
});
const workspace =
  (await prisma.workspace.findFirst({ where: { organizationId: organization.id } })) ??
  (await prisma.workspace.create({ data: { organizationId: organization.id, name: "Production" } }));

const store = new PrismaStore();
const connection = await store.upsertConnection({
  organizationId: organization.id,
  workspaceId: workspace.id,
  product: "facebook",
  status: "connected",
  scopes: [],
  encryptedToken: "enc",
  tokenExpiresAt: null,
  metaUserId: null,
});
await store.replaceAssets(connection.id, organization.id, [
  { metaId: "e2e_page_1", type: "facebook_page", product: "facebook", name: "E2E Page" },
]);
console.log(JSON.stringify({ organizationId: organization.id, workspaceId: workspace.id, connectionId: connection.id }));
await prisma.$disconnect();
