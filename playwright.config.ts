import { defineConfig, devices } from "@playwright/test";
import { viewports } from "./src/common/tests/ui/support/recipes";

// Two viewport projects, used by tests/visual/identical.spec.ts and its
// per-context splits (e.g. common-visual-<viewport>).
//
// src/common/tests/ui/support/capture-goldens.mjs is a standalone script,
// not run through the Playwright test runner -- it manages its own
// browser/server, so it does not go through this config.
export default defineConfig({
  testDir: "./tests",
  // test:e2e (real build) and test:visual (fixture build) share the
  // port-4322 webServer entry below with `reuseExistingServer: true`, so a
  // stale server left over from the other suite would otherwise serve the
  // wrong PORTFOLIO_FIXTURES mode with no signal -- see check-fixture-flag.ts.
  globalSetup: "./src/common/tests/ui/support/check-fixture-flag.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  // tests/visual/identical.spec.ts uses `expect(png).toMatchSnapshot({name})`
  // instead of `toHaveScreenshot`, keeping pipeline.mjs the single source
  // of truth for how the screenshot is taken.
  //
  // This template points snapshot lookup at the already-committed goldens
  // (tests/visual/goldens/<viewport>/<recipe>.png, matching
  // capture-goldens.mjs's own output layout) instead of Playwright's
  // default per-spec `-snapshots/` directory; per-context splits (e.g.
  // `common-visual-<viewport>` below) override this with their own
  // `snapshotPathTemplate`.
  snapshotPathTemplate: "tests/visual/goldens/{projectName}/{arg}{ext}",
  use: {
    trace: "on-first-retry",
    // The app's `dist/` build, used by the visual specs and every
    // context/feature e2e project — the vendored reference (port 4400) is
    // only ever addressed by its own full URL.
    baseURL: "http://localhost:4322",
  },
  projects: [
    // Root smoke tier: broad, shallow, whole-app health checks run as the
    // pre-merge gate, at the same primary viewport/device config as every
    // context/feature project below.
    {
      name: "smoke",
      testDir: "./tests/ui/smoke",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
      },
    },
    // Visual-regression harness: `{projectName}` must stay exactly the
    // viewport name for the existing goldens to resolve (see the
    // `snapshotPathTemplate` comment above).
    ...viewports.map((viewport) => ({
      name: viewport.name,
      testDir: "./tests/visual",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `common`: the 12 kernel+editor specs, one project per viewport -- a
    // Playwright project is 1:1 with one `use` config, so two viewports
    // can't share one project name.
    ...viewports.map((viewport) => ({
      name: `common-${viewport.name}`,
      testDir: "./src/common/tests/ui/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `common-visual`: owns recipes "06-editor", "15-cmdline", "18-split",
    // "19-choose-tree", and "08-tracker" (whose sole renderer is
    // src/common/components/Wallpaper.svelte, not Dashboard.svelte).
    //
    // Because `{projectName}` here is `common-visual-<viewport>` rather
    // than the bare viewport, it can't feed `snapshotPathTemplate`'s
    // `{projectName}` token the way the un-split visual projects above do,
    // so each project sets its own `snapshotPathTemplate` with the
    // viewport hardcoded as a literal to reproduce
    // `.../goldens/<viewport>/<recipe>.png` byte-identically; every later
    // context/feature's `<context>-visual-<viewport>` project reuses this
    // same per-project-template shape.
    ...viewports.map((viewport) => ({
      name: `common-visual-${viewport.name}`,
      testDir: "./src/common/tests/ui/visual",
      snapshotPathTemplate: `src/common/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `profile`: the 1 spec (profile.spec.ts), one project per viewport.
    ...viewports.map((viewport) => ({
      name: `profile-${viewport.name}`,
      testDir: "./src/features/profile/tests/ui/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `profile-visual`: owns recipe "07-profile" (excluded from the
    // un-split visual projects above via
    // tests/visual/identical.spec.ts's SPLIT_OWNED_RECIPE_NAMES filter);
    // reuses common-visual's per-project snapshotPathTemplate shape, with
    // only the path prefix differing since feature tests nest under
    // `src/features/<f>/tests/` rather than `src/common/tests/`.
    ...viewports.map((viewport) => ({
      name: `profile-visual-${viewport.name}`,
      testDir: "./src/features/profile/tests/ui/visual",
      snapshotPathTemplate: `src/features/profile/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `profile-harness`: fixture-build-only (the route's own
    // `getStaticPaths` returns `[]` otherwise), functional assertions only
    // (mount + core interactions), no goldens -- one project at the primary
    // viewport, not a per-viewport pair, same as `smoke` above.
    {
      name: "profile-harness",
      testDir: "./src/features/profile/tests/ui/harness",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
      },
    },
    // `help`: the 3 specs (help.spec.ts, help-layout.spec.ts,
    // help-search.spec.ts), one project per viewport.
    ...viewports.map((viewport) => ({
      name: `help-${viewport.name}`,
      testDir: "./src/features/help/tests/ui/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `help-visual`: owns recipes "11-help" and "20-help-search" (excluded
    // from the un-split visual projects via SPLIT_OWNED_RECIPE_NAMES);
    // reuses common-visual's per-project snapshotPathTemplate shape.
    ...viewports.map((viewport) => ({
      name: `help-visual-${viewport.name}`,
      testDir: "./src/features/help/tests/ui/visual",
      snapshotPathTemplate: `src/features/help/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `help-harness`: fixture-build-only, functional assertions only, no
    // goldens -- one project at the primary viewport, same shape as
    // `profile-harness` above.
    {
      name: "help-harness",
      testDir: "./src/features/help/tests/ui/harness",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
      },
    },
    // `boot`: the 2 specs (boot.spec.ts, cold-boot.spec.ts), one project
    // per viewport.
    ...viewports.map((viewport) => ({
      name: `boot-${viewport.name}`,
      testDir: "./src/features/boot/tests/ui/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `boot-visual`: owns recipes "13-boot-mid" and "14-boot-ready"
    // (excluded from the un-split visual projects via
    // SPLIT_OWNED_RECIPE_NAMES); reuses common-visual's per-project
    // snapshotPathTemplate shape.
    ...viewports.map((viewport) => ({
      name: `boot-visual-${viewport.name}`,
      testDir: "./src/features/boot/tests/ui/visual",
      snapshotPathTemplate: `src/features/boot/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `boot-harness`: fixture-build-only, functional assertions only, no
    // goldens -- one project at the primary viewport, same shape as
    // `profile-harness` above.
    {
      name: "boot-harness",
      testDir: "./src/features/boot/tests/ui/harness",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
      },
    },
    // `notifications`: the 3 specs (notifications.spec.ts,
    // notifications-boot.spec.ts, toast-drain-arm.spec.ts), one project per
    // viewport.
    ...viewports.map((viewport) => ({
      name: `notifications-${viewport.name}`,
      testDir: "./src/features/notifications/tests/ui/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `notifications-visual`: owns recipe "21-notifications-panel-open"
    // (excluded from the un-split visual projects via
    // SPLIT_OWNED_RECIPE_NAMES); reuses common-visual's per-project
    // snapshotPathTemplate shape.
    ...viewports.map((viewport) => ({
      name: `notifications-visual-${viewport.name}`,
      testDir: "./src/features/notifications/tests/ui/visual",
      snapshotPathTemplate: `src/features/notifications/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `notifications-harness`: fixture-build-only, functional assertions
    // only, no goldens -- one project at the primary viewport, same shape as
    // `profile-harness` above.
    {
      name: "notifications-harness",
      testDir: "./src/features/notifications/tests/ui/harness",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
      },
    },
    // `dashboard`: the 1 spec (dashboard.spec.ts), one project per
    // viewport.
    ...viewports.map((viewport) => ({
      name: `dashboard-${viewport.name}`,
      testDir: "./src/features/dashboard/tests/ui/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `dashboard-visual`: owns recipe "01-dashboard" (excluded from the
    // un-split visual projects via SPLIT_OWNED_RECIPE_NAMES); reuses
    // common-visual's per-project snapshotPathTemplate shape.
    //
    // "08-tracker" is owned by `common-visual` instead, not here -- see
    // src/common/tests/ui/visual/ under the `common-visual-<viewport>`
    // projects.
    ...viewports.map((viewport) => ({
      name: `dashboard-visual-${viewport.name}`,
      testDir: "./src/features/dashboard/tests/ui/visual",
      snapshotPathTemplate: `src/features/dashboard/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `dashboard-harness`: fixture-build-only, functional assertions only,
    // no goldens -- one project at the primary viewport, same shape as
    // `profile-harness` above.
    {
      name: "dashboard-harness",
      testDir: "./src/features/dashboard/tests/ui/harness",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
      },
    },
    // `employment`: the 2 specs (employment.spec.ts,
    // employment-layout.spec.ts), one project per viewport.
    ...viewports.map((viewport) => ({
      name: `employment-${viewport.name}`,
      testDir: "./src/features/employment/tests/ui/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `employment-visual`: owns recipes "04-employment-l0" and
    // "05-employment-l1" (excluded from the un-split visual projects via
    // SPLIT_OWNED_RECIPE_NAMES); reuses common-visual's per-project
    // snapshotPathTemplate shape.
    ...viewports.map((viewport) => ({
      name: `employment-visual-${viewport.name}`,
      testDir: "./src/features/employment/tests/ui/visual",
      snapshotPathTemplate: `src/features/employment/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `employment-harness`: fixture-build-only, functional assertions
    // only, no goldens -- one project at the primary viewport, same shape
    // as `profile-harness` above.
    {
      name: "employment-harness",
      testDir: "./src/features/employment/tests/ui/harness",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
      },
    },
    // `repositories`: the 4 specs (repositories.spec.ts,
    // repositories-preview-highlight.spec.ts,
    // repositories-preview-scroll.spec.ts, repositories-status-dots.spec.ts),
    // one project per viewport.
    ...viewports.map((viewport) => ({
      name: `repositories-${viewport.name}`,
      testDir: "./src/features/repositories/tests/ui/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `repositories-visual`: owns recipes "02-repositories",
    // "03-repositories-arrow", and "12-all-projects" (excluded from the
    // un-split visual projects via SPLIT_OWNED_RECIPE_NAMES); reuses
    // common-visual's per-project snapshotPathTemplate shape.
    ...viewports.map((viewport) => ({
      name: `repositories-visual-${viewport.name}`,
      testDir: "./src/features/repositories/tests/ui/visual",
      snapshotPathTemplate: `src/features/repositories/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `repositories-harness`: fixture-build-only, functional assertions
    // only, no goldens -- one project at the primary viewport, same shape
    // as `profile-harness` above.
    {
      name: "repositories-harness",
      testDir: "./src/features/repositories/tests/ui/harness",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
      },
    },
    // `grep`: grep.spec.ts, one project per viewport.
    ...viewports.map((viewport) => ({
      name: `grep-${viewport.name}`,
      testDir: "./src/features/grep/tests/ui/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `grep-visual`: owns recipes "09-grep-empty" and "10-grep-query"
    // (excluded from the un-split visual projects via
    // SPLIT_OWNED_RECIPE_NAMES); reuses common-visual's per-project
    // snapshotPathTemplate shape.
    ...viewports.map((viewport) => ({
      name: `grep-visual-${viewport.name}`,
      testDir: "./src/features/grep/tests/ui/visual",
      snapshotPathTemplate: `src/features/grep/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `grep-harness`: fixture-build-only, functional assertions only, no
    // goldens -- one project at the primary viewport, same shape as
    // `profile-harness` above.
    {
      name: "grep-harness",
      testDir: "./src/features/grep/tests/ui/harness",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
      },
    },
    // `shell-fs-harness`: fixture-build-only, functional assertions only
    // (mount + core pane-mode interactions), no goldens -- one project at
    // the primary viewport, same shape as `profile-harness` above.
    {
      name: "shell-fs-harness",
      testDir: "./src/features/shell-fs/tests/ui/harness",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
      },
    },
    // `shell-fs`: shell.spec.ts, one project per viewport.
    ...viewports.map((viewport) => ({
      name: `shell-fs-${viewport.name}`,
      testDir: "./src/features/shell-fs/tests/ui/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `shell-fs-visual`: owns recipes "16-shell" and "17-host-shell"
    // (excluded from the un-split visual projects via
    // SPLIT_OWNED_RECIPE_NAMES); reuses common-visual's per-project
    // snapshotPathTemplate shape.
    ...viewports.map((viewport) => ({
      name: `shell-fs-visual-${viewport.name}`,
      testDir: "./src/features/shell-fs/tests/ui/visual",
      snapshotPathTemplate: `src/features/shell-fs/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
  ],
  webServer: [
    {
      // Serves the vendored, network-independent prototype reference on
      // port 4400, using `url` rather than `port` so the readiness check
      // hits the actual page path -- the two are mutually exclusive in
      // Playwright's webServer schema.
      //
      // Not fetched by tests/visual/identical.spec.ts (or its
      // common-visual split), which compares the port-4322 build directly
      // against committed goldens via `toMatchSnapshot` +
      // `snapshotPathTemplate` instead; this entry only serves
      // capture-goldens.mjs's guarded vendored-prototype regeneration path
      // (not run in normal development), started unconditionally because
      // Playwright's `webServer` array has no per-project conditional
      // wiring.
      command: "node src/common/tests/ui/support/static-server.mjs reference 4400",
      url: "http://localhost:4400/Homepage.dc.html",
      reuseExistingServer: !process.env.CI,
    },
    {
      // Serves the app's `dist/` build for the visual and e2e specs on port
      // 4322 -- each suite runs its own build first (`build:fixtures` /
      // `build`) so this entry serves whichever `dist/` was most recently
      // produced; 4321 is `astro dev`, unused by the test suite.
      //
      // Uses the same static server as the reference (static-server.mjs),
      // not `astro preview`, because Astro 7.2.2's `astro preview`
      // daemonizes -- the launching process Playwright monitors exits
      // within ~1s, which it treats as a crash.
      command: "node src/common/tests/ui/support/static-server.mjs dist 4322",
      url: "http://localhost:4322",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
