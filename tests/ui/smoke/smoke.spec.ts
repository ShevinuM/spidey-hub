// Root-level smoke tier (`e2e-testing.md` R016): broad, shallow, whole-app
// health checks — every route loads with no console error, and the terminal
// boots.
//
// Never a feature-specific behavioral assertion; that belongs in the owning
// feature's own `tests/ui/e2e/`.
//
// Cheap enough to run on every PR regardless of what changed — the pre-merge
// gate.
//
// Deliberately imports the raw `@playwright/test`, not the shared
// `src/common/tests/ui/support/fixtures.ts` boot-skip helper — this suite exists
// specifically to prove the real (unskipped) boot sequence completes on a
// fresh tab for every route, not just that the app renders past it.
import { test, expect } from "@playwright/test";
import { TerminalPage } from "../../../src/common/tests/ui/pages/TerminalPage";

const ROUTES = ["/", "/repositories", "/employment", "/retina-v", "/profile", "/help"];

for (const route of ROUTES) {
  test(`${route || "/"} loads, boots with no console error`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto(route);
    // The boot overlay swallows all input and plays a full ~4.6s unskippable
    // sequence on a fresh tab (see src/common/tests/ui/support/fixtures.ts's own
    // header comment) — wait it out for real rather than pre-seeding the
    // skip flag, since "the terminal boots" is exactly what this check
    // proves.
    //
    // Generous timeout: this is the real (non-fixture) build, and a
    // slow CI runner shouldn't flake a broad health check.
    await new TerminalPage(page).waitUntilBooted();

    expect(consoleErrors, `console errors on ${route}: ${JSON.stringify(consoleErrors)}`).toEqual(
      [],
    );
    expect(pageErrors, `page errors on ${route}: ${JSON.stringify(pageErrors)}`).toEqual([]);
  });
}
