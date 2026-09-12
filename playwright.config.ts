import { defineConfig, devices } from "@playwright/test";
import { viewports } from "./common/tests/ui/support/recipes";

// Two viewport projects (PLAN.md "Visual-regression harness"), used by
// tests/visual/identical.spec.ts (and its per-context splits, e.g.
// common-visual-<viewport> — 00-phases.md D21) and tests/e2e (later
// phases). common/tests/ui/support/capture-goldens.mjs is a standalone
// script (not run through the Playwright test runner) and manages its own
// browser/server, so it does not go through this config.
export default defineConfig({
  testDir: "./tests",
  // test:e2e (real
  // build) and test:visual (fixture build) share the port-4322 webServer
  // entry below with `reuseExistingServer: true`, so a stale server left
  // over from the other suite would otherwise serve the wrong
  // PORTFOLIO_FIXTURES mode with no signal. See common/tests/ui/support/check-fixture-flag.ts.
  globalSetup: "./common/tests/ui/support/check-fixture-flag.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  // tests/visual/identical.spec.ts uses `expect(png).toMatchSnapshot({name})`
  // (not `toHaveScreenshot`, so the capture pipeline contract in
  // common/tests/ui/support/pipeline.mjs stays the single source of truth
  // for how the screenshot itself is taken) — this points its lookup at the
  // already-committed goldens (tests/visual/goldens/<viewport>/<recipe>.png),
  // where <viewport> is each project's own name (see `viewports` above:
  // "1512x945" / "1920x1080", matching the original
  // capture-goldens.mjs output layout exactly) instead of Playwright's
  // default per-spec `-snapshots/` directory. Per-context splits (e.g.
  // `common-visual-<viewport>` below) override this with their own
  // `snapshotPathTemplate` instead (D21(a)).
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
    // `common` (D10/D20): the 12 kernel+editor specs phase 02 ported out of
    // `legacy` — one project per viewport, same reasoning as `legacy-<viewport>`
    // above (a Playwright project is 1:1 with one `use` config, so two
    // viewports can't share one project name).
    ...viewports.map((viewport) => ({
      name: `common-${viewport.name}`,
      testDir: "./common/tests/ui/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `common-visual` (D21): the 4 recipes phase 02 owns per
    // Instructions/01-pre-phase/recipe-feature-map.md ("06-editor",
    // "15-cmdline", "18-split", "19-choose-tree"), plus "08-tracker" (joined
    // late via phase 07's R1 ruling — its sole renderer is
    // common/components/Wallpaper.svelte, not Dashboard.svelte, so it never
    // belonged to the dashboard feature phase), moved out of the
    // viewport-named visual projects above. `{projectName}` here is
    // `common-visual-<viewport>`, not the bare viewport, so it can no longer
    // feed `snapshotPathTemplate`'s `{projectName}` token the way the
    // pre-split viewport-named projects still do — each project instead
    // gets its own `snapshotPathTemplate` with the viewport hardcoded as a
    // literal, which is what actually reproduces
    // `.../goldens/<viewport>/<recipe>.png` byte-identically (D21(a)). Every
    // later context/feature's own `<context>-visual-<viewport>` project
    // reuses this same per-project-template shape, not `{projectName}`.
    ...viewports.map((viewport) => ({
      name: `common-visual-${viewport.name}`,
      testDir: "./common/tests/ui/visual",
      snapshotPathTemplate: `common/tests/ui/visual/goldens/${viewport.name}/{arg}{ext}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `profile` (D20): the 1 spec (profile.spec.ts) phase 03 ported out of
    // `legacy` — one project per viewport, same reasoning as `common-<viewport>`
    // above.
    ...viewports.map((viewport) => ({
      name: `profile-${viewport.name}`,
      testDir: "./src/features/profile/tests/ui/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `profile-visual` (D21): the 1 recipe phase 03 owns per
    // Instructions/01-pre-phase/recipe-feature-map.md ("07-profile"), moved
    // out of the viewport-named visual projects above (and out of
    // tests/visual/identical.spec.ts's SPLIT_OWNED_RECIPE_NAMES filter).
    // Reuses common's split-project shape verbatim (D21(a)): its own
    // `snapshotPathTemplate` with the viewport hardcoded as a literal, not
    // derived from `{projectName}` — only the path prefix differs, since
    // feature tests nest under `src/features/<f>/tests/` rather than
    // common's top-level `common/tests/`.
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
    // `profile-harness` (D24): the feature-harness mechanism phase 03
    // settles for every later feature phase (04-11) to reuse verbatim.
    // Fixture-build-only (the route's own `getStaticPaths` returns `[]`
    // otherwise); functional assertions only (mount + core interactions),
    // no goldens — so one project at the primary viewport suffices, same
    // as `smoke` above, not a per-viewport pair.
    {
      name: "profile-harness",
      testDir: "./src/features/profile/tests/ui/harness",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
      },
    },
    // `help` (D20): the 3 specs (help.spec.ts, help-layout.spec.ts,
    // help-search.spec.ts) phase 04 ported out of `legacy` — one project per
    // viewport, same reasoning as `profile-<viewport>` above.
    ...viewports.map((viewport) => ({
      name: `help-${viewport.name}`,
      testDir: "./src/features/help/tests/ui/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `help-visual` (D21): the 2 recipes phase 04 owns per
    // Instructions/01-pre-phase/recipe-feature-map.md ("11-help",
    // "20-help-search"), moved out of the viewport-named visual projects
    // above (and out of tests/visual/identical.spec.ts's
    // SPLIT_OWNED_RECIPE_NAMES filter). Reuses common's/profile's split-project
    // shape verbatim (D21(a)): its own `snapshotPathTemplate` with the
    // viewport hardcoded as a literal, not derived from `{projectName}`.
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
    // `help-harness` (D24): help's own harness route + spec, reusing
    // phase 03's settled mechanism verbatim. Fixture-build-only; functional
    // assertions only (mount + core interactions), no goldens — one project
    // at the primary viewport, same as `profile-harness` above.
    {
      name: "help-harness",
      testDir: "./src/features/help/tests/ui/harness",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
      },
    },
    // `boot` (D20): the 2 specs (boot.spec.ts, cold-boot.spec.ts) phase 05
    // ported out of `legacy` — one project per viewport, same reasoning as
    // `help-<viewport>` above.
    ...viewports.map((viewport) => ({
      name: `boot-${viewport.name}`,
      testDir: "./src/features/boot/tests/ui/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `boot-visual` (D21): the 2 recipes phase 05 owns per
    // Instructions/01-pre-phase/recipe-feature-map.md ("13-boot-mid",
    // "14-boot-ready"), moved out of the viewport-named visual projects above
    // (and out of tests/visual/identical.spec.ts's SPLIT_OWNED_RECIPE_NAMES
    // filter). Reuses common's/profile's/help's split-project shape verbatim
    // (D21(a)): its own `snapshotPathTemplate` with the viewport hardcoded as
    // a literal, not derived from `{projectName}`.
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
    // `boot-harness` (D24): boot's own harness route + spec, reusing
    // phase 03's settled mechanism verbatim. Fixture-build-only; functional
    // assertions only (mount + core interactions), no goldens — one project
    // at the primary viewport, same as `profile-harness`/`help-harness`
    // above.
    {
      name: "boot-harness",
      testDir: "./src/features/boot/tests/ui/harness",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
      },
    },
    // `notifications` (D20): the 3 specs (notifications.spec.ts,
    // notifications-boot.spec.ts, toast-drain-arm.spec.ts) phase 06 ported
    // out of `legacy` — one project per viewport, same reasoning as
    // `boot-<viewport>` above.
    ...viewports.map((viewport) => ({
      name: `notifications-${viewport.name}`,
      testDir: "./src/features/notifications/tests/ui/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `notifications-visual` (D21): the 1 recipe phase 06 owns
    // ("21-notifications-panel-open"), moved out of the viewport-named
    // visual projects above (and out of tests/visual/identical.spec.ts's
    // SPLIT_OWNED_RECIPE_NAMES filter). Reuses common's/profile's/help's/
    // boot's split-project shape verbatim (D21(a)): its own
    // `snapshotPathTemplate` with the viewport hardcoded as a literal, not
    // derived from `{projectName}`.
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
    // `notifications-harness` (D24): notifications' own harness route +
    // spec, reusing phase 03's settled mechanism verbatim. Fixture-build-only;
    // functional assertions only (mount + core interactions), no goldens —
    // one project at the primary viewport, same as
    // `profile-harness`/`help-harness`/`boot-harness` above.
    {
      name: "notifications-harness",
      testDir: "./src/features/notifications/tests/ui/harness",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
      },
    },
    // `dashboard` (D20): the 1 spec (dashboard.spec.ts) phase 07 ported out
    // of `legacy` — one project per viewport, same reasoning as
    // `notifications-<viewport>` above.
    ...viewports.map((viewport) => ({
      name: `dashboard-${viewport.name}`,
      testDir: "./src/features/dashboard/tests/ui/e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      },
    })),
    // `dashboard-visual` (D21): the 1 recipe phase 07 owns ("01-dashboard"),
    // moved out of the viewport-named visual projects above (and out of
    // tests/visual/identical.spec.ts's SPLIT_OWNED_RECIPE_NAMES filter).
    // Reuses common's/profile's/help's/boot's/notifications' split-project
    // shape verbatim (D21(a)): its own `snapshotPathTemplate` with the
    // viewport hardcoded as a literal, not derived from `{projectName}`.
    // "08-tracker" (also owned by this phase's original goal line) is NOT
    // here — phase-07 R1 ruled it common's; it moved into
    // common/tests/ui/visual/ instead, under the existing
    // `common-visual-<viewport>` projects.
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
    // `dashboard-harness` (D24): dashboard's own harness route + spec,
    // reusing phase 03's settled mechanism verbatim. Fixture-build-only;
    // functional assertions only (mount + core interactions), no goldens —
    // one project at the primary viewport, same as
    // `profile-harness`/`help-harness`/`boot-harness`/
    // `notifications-harness` above.
    {
      name: "dashboard-harness",
      testDir: "./src/features/dashboard/tests/ui/harness",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: [
    {
      // Serves the vendored, network-independent prototype reference. Port
      // 4400 per PLAN.md. `url` (not `port`) so the readiness check hits the
      // actual page path — the two options are mutually exclusive in
      // Playwright's webServer schema.
      //
      // NOT used by tests/visual/identical.spec.ts (or its common-visual
      // split): that suite compares the real/fixture implementation build
      // (port 4322 below) directly against the committed goldens via
      // `expect(png).toMatchSnapshot(...)` + `snapshotPathTemplate` — it
      // never fetches this server. This entry only serves
      // common/tests/ui/support/capture-goldens.mjs's historical/guarded
      // vendored-prototype regeneration path (see that script's own header
      // comment), which is not run as part of normal development; it is
      // started here regardless (unconditionally, alongside the port-4322
      // entry) because Playwright's `webServer` array has no per-project
      // conditional wiring — confirmed empirically in phase 02's D21(b)
      // read of identical.spec.ts/adversarial-fixtures.spec.ts.
      command: "node common/tests/ui/support/static-server.mjs common/tests/ui/support/reference 4400",
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
      // (common/tests/ui/support/static-server.mjs), not `astro preview`:
      // Astro 7.2.2's `astro preview` daemonizes (forks a detached
      // background process; the launching process exits within ~1s), which
      // Playwright's `webServer` treats as a crash ("Process from
      // config.webServer exited early") since it monitors that launching
      // process. The build output is fully static, so a plain file server
      // (with directory→index.html resolution) serves it identically.
      command: "node common/tests/ui/support/static-server.mjs dist 4322",
      url: "http://localhost:4322",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
