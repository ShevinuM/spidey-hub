import { defineConfig, devices } from "@playwright/test";
import { viewports } from "./tests/visual/recipes.ts";

// Two viewport projects (PLAN.md "Visual-regression harness"), used by
// tests/visual/identical.spec.ts (Phase 3+) and tests/e2e (later phases).
// tests/visual/capture-goldens.mjs is a standalone script (not run through
// the Playwright test runner) and manages its own browser/server, so it
// does not go through this config.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    trace: "on-first-retry",
  },
  projects: viewports.map((viewport) => ({
    name: viewport.name,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    },
  })),
  webServer: [
    {
      // Serves the vendored, network-independent prototype reference for
      // tests/visual/identical.spec.ts. Port 4400 per PLAN.md.
      command: "node tests/visual/static-server.mjs tests/visual/reference 4400",
      url: "http://localhost:4400/Homepage.dc.html",
      port: 4400,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Real implementation build, previewed for tests/visual +
      // tests/e2e. Port 4322 per PLAN.md (4321 is `astro dev`, unused by
      // the test suite). The impl spec itself lands in Phase 3 — this
      // entry only needs `dist/` to exist once that phase wires
      // `pnpm build:fixtures` into the test:visual script.
      command: "pnpm exec astro preview --port 4322",
      url: "http://localhost:4322",
      port: 4322,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
