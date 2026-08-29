import { defineConfig, devices } from "@playwright/test";
import { viewports } from "./tests/visual/recipes.ts";

// Two viewport projects (PLAN.md "Visual-regression harness"), used by
// tests/visual/identical.spec.ts (Phase 3+) and tests/e2e (later phases).
// tests/visual/capture-goldens.mjs is a standalone script (not run through
// the Playwright test runner) and manages its own browser/server, so it
// does not go through this config.
export default defineConfig({
  testDir: "./tests",
  // test:e2e (real
  // build) and test:visual (fixture build) share the port-4322 webServer
  // entry below with `reuseExistingServer: true`, so a stale server left
  // over from the other suite would otherwise serve the wrong
  // PORTFOLIO_FIXTURES mode with no signal. See tests/checkFixtureFlag.ts.
  globalSetup: "./tests/checkFixtureFlag.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  // tests/visual/identical.spec.ts uses `expect(png).toMatchSnapshot({name})`
  // (not `toHaveScreenshot`, so the capture pipeline contract in
  // tests/visual/pipeline.mjs stays the single source of truth for how the
  // screenshot itself is taken) — this points its lookup at the already-
  // committed goldens (tests/visual/goldens/<viewport>/<recipe>.png), where
  // <viewport> is each project's own name (see `viewports` above:
  // "1512x945" / "1920x1080", matching tests/visual/capture-goldens.mjs's
  // output layout exactly) instead of Playwright's default per-spec
  // `-snapshots/` directory.
  snapshotPathTemplate: "tests/visual/goldens/{projectName}/{arg}{ext}",
  use: {
    trace: "on-first-retry",
    // The real implementation build (astro preview), used by both
    // tests/visual/identical.spec.ts and tests/e2e — the vendored reference
    // (port 4400) is only ever addressed by its own full URL.
    baseURL: "http://localhost:4322",
  },
  projects: [
    // Root smoke tier (e2e-testing.md R016/R017): broad, shallow,
    // whole-app health checks — the pre-merge gate. Runs at the same
    // primary viewport/device config as the legacy e2e projects below.
    {
      name: "smoke",
      testDir: "./tests/ui/smoke",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
      },
    },
    // `legacy` (D6): v1's entire bulk-imported tests/e2e/ spec set, pinned
    // as-is — one project per viewport, preserving v1's current behavior of
    // running every e2e spec at BOTH viewports (empirically 1006 tests =
    // ~503 specs x 2), not a single collapsed viewport. Each phase moves its
    // own specs out of this project into its own `<context>`/`<feature>`
    // project entry (architecture R002); `legacy` is deleted once it empties
    // (phase 11). Named `legacy-<viewport>` rather than a single bare
    // `legacy` — Playwright projects are 1:1 with one `use` config, so two
    // viewports can't share one project name; `--project=legacy-1512x945
    // --project=legacy-1920x1080` is the two-project equivalent of a single
    // `--project=legacy` invocation.
    ...viewports.map((viewport) => ({
      name: `legacy-${viewport.name}`,
      testDir: "./tests/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // Visual-regression harness (unchanged names/config — see the
    // `snapshotPathTemplate` comment above: `{projectName}` must stay
    // exactly the viewport name for the existing goldens to resolve; D21
    // owns any future change to this convention, not pre-phase).
    ...viewports.map((viewport) => ({
      name: viewport.name,
      testDir: "./tests/visual",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
  ],
  webServer: [
    {
      // Serves the vendored, network-independent prototype reference for
      // tests/visual/identical.spec.ts. Port 4400 per PLAN.md. `url` (not
      // `port`) so the readiness check hits the actual page path — the two
      // options are mutually exclusive in Playwright's webServer schema.
      command: "node tests/visual/static-server.mjs tests/visual/reference 4400",
      url: "http://localhost:4400/Homepage.dc.html",
      reuseExistingServer: !process.env.CI,
    },
    {
      // Real implementation build, served for tests/visual + tests/e2e.
      // Port 4322 per PLAN.md (4321 is `astro dev`, unused by the test
      // suite). Each of those two scripts (package.json `test:visual` /
      // `test:e2e`) runs its own build first (`build:fixtures` / `build`
      // respectively) so this entry only needs to serve whichever `dist/`
      // was most recently produced.
      //
      // Uses the same dependency-free static server as the reference
      // (tests/visual/static-server.mjs), not `astro preview`: Astro
      // 7.2.2's `astro preview` daemonizes (forks a detached background
      // process; the launching process exits within ~1s), which
      // Playwright's `webServer` treats as a crash ("Process from
      // config.webServer exited early") since it monitors that launching
      // process. The build output is fully static, so a plain file server
      // (with directory→index.html resolution) serves it identically.
      command: "node tests/visual/static-server.mjs dist 4322",
      url: "http://localhost:4322",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
