// playwright.config.ts's `globalSetup`. `pnpm test:e2e` and `pnpm test:visual`
// share one webServer on port 4322, so a stray or wrong-mode `dist/` would
// otherwise serve the wrong PORTFOLIO_FIXTURES dataset with no signal.
//
// Checks the served `data-fixture-mode` attribute on `<html>` rather than
// just "is a process listening": static-server.mjs reads `dist/` fresh off
// disk per request, so the on-disk build is the real hazard, not the process.
//
// A single unretried fetch is safe here because Playwright's `webServer`
// is confirmed ready before `globalSetup` runs.
//
// `E2E_EXPECT_FIXTURES` is set by the `test:e2e`/`test:visual` package.json
// scripts and is left unset for an ad-hoc `playwright test <file>` run, which
// only warns rather than failing since it has no expectation to check.
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
        "is dist/ built from a version of src/bootstrap/Layout.astro that predates the " +
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
