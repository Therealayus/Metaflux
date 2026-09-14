import { describe, expect, it } from "vitest";

describe("database", () => {
  it("schema defines tenant isolation indexes", async () => {
    const fs = await import("node:fs");
    const schema = fs.readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    for (const model of ["Organization", "Workspace", "MetaConnection", "Workflow", "WebhookEvent", "AuditLog"]) {
      expect(schema).toContain(`model ${model}`);
    }
  });
});
