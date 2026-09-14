import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = join(__dirname, "..", "app");

/** Every sidebar href in AppShell must resolve to a real route. Catches dead nav links. */
describe("app routing integrity", () => {
  it("has a page for every sidebar link", () => {
    const shell = readFileSync(join(__dirname, "..", "components", "app-shell.tsx"), "utf8");
    const hrefs = [...shell.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1] as string);
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) {
      expect(existsSync(join(APP_DIR, href.slice(1), "page.tsx")), `missing route for ${href}`).toBe(true);
    }
  });

  it("landing page states the product promise", () => {
    const landing = readFileSync(join(APP_DIR, "page.tsx"), "utf8");
    expect(landing).toContain("MetaFlux speaks Meta APIs");
  });
});
