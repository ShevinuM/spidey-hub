// playwright.config.ts's `globalSetup`. Closes this environment footgun:
// `pnpm test:e2e` (real build) and `pnpm test:visual` (fixture build) share
// ONE webServer definition (port 4322, `reuseExistingServer: true`), so a
// stray server left over from the other suite — or a `dist/` that was
// built by the wrong script, or interrupted mid-build — would otherwise
// serve the wrong PORTFOLIO_FIXTURES mode with no signal anywhere. Fixture
// mode switches the underlying data (repositories/commits/grep/fs-index/
// contributions — see docs/architecture.md's "Fixture mode" section), so an
// e2e run silently served a fixtures build would exercise the wrong dataset
// entirely — real-content assumptions (real repo counts, overflowing
// content, etc.) baked into the e2e suite would silently stop holding.
//
// Deliberately checks the SERVED CONTENT (`data-fixture-mode` on `<html>`,
// set by src/layouts/Shell.astro from the same `process.env
// .PORTFOLIO_FIXTURES` every route page already reads), not just "is a
// process listening on the port": tests/visual/static-server.mjs reads
// `dist/` fresh from disk on every request, so the PROCESS is never the
// real hazard — the on-disk build is. A content-level check catches a
// wrong-mode `dist/` regardless of how it got there (stray process, ad-hoc
// `playwright test` without the `pnpm build` prefix, an interrupted build).
//
// Confirmed empirically (not assumed) that Playwright starts `webServer`
// and waits for it to become ready BEFORE calling `globalSetup` — a
// throwaway probe config with a deliberately-delayed server showed
// `globalSetup`'s fetch always lands after the server's own "listening"
// log line, never racing it — so a single unretried fetch here is safe.
//
// `E2E_EXPECT_FIXTURES` is set by the `test:e2e` ("0") / `test:visual`
// ("1") package.json scripts, the same "env var set once at the npm-script
// choke point" convention as tests/e2e/fixtures.ts's own
// `TOAST_DURATION_SCALE_STORAGE_KEY` / `NOTIFICATIONS_INJECT_SEED_STORAGE_KEY`.
// Left UNSET for an ad-hoc `pnpm exec playwright test <file>` run (e.g.
// iterating on one spec without rebuilding) — that's a deliberate, common
// workflow this check must not break, so it only warns rather than failing
// when there's no explicit expectation to check against.
export default async function globalSetup(): Promise<void> {
  const expected = process.env.E2E_EXPECT_FIXTURES;
  if (expected !== "0" && expected !== "1") {
    console.warn(
      "[checkFixtureFlag] E2E_EXPECT_FIXTURES not set — skipping the fixture-mode " +
        "guard (expected for an ad-hoc `playwright test` run against an existing " +
        "dist/). Run via `pnpm test:e2e` / `pnpm test:visual` for the guarded path.",
    );
    return;
  }

  const res = await fetch("http://localhost:4322/");
  const html = await res.text();
  const match = html.match(/<html[^>]*\bdata-fixture-mode="(true|false)"/);
  const actual = match ? (match[1] === "true" ? "1" : "0") : null;

  if (actual === null) {
    throw new Error(
      "[checkFixtureFlag] could not find data-fixture-mode on the served <html> — " +
        "is dist/ built from a version of src/layouts/Shell.astro that predates the " +
        "PLAN.md Phase 7.4 fixture-mode guard? Rebuild with `pnpm build` or `pnpm build:fixtures`.",
    );
  }

  if (actual !== expected) {
    const expectedLabel = expected === "1" ? "a FIXTURE build (PORTFOLIO_FIXTURES=1)" : "a REAL build (no PORTFOLIO_FIXTURES)";
    const actualLabel = actual === "1" ? "a FIXTURE build" : "a REAL build";
    throw new Error(
      `[checkFixtureFlag] port 4322 is serving ${actualLabel}, but this suite expects ` +
        `${expectedLabel}. This is almost always a stale server left over from the OTHER ` +
        "test command (test:e2e and test:visual share this port) — find and kill it " +
        "(`lsof -iTCP:4322 -sTCP:LISTEN`) and re-run.",
    );
  }
}
