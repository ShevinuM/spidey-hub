// Regression gate for PLAN.md F1 (Iteration 7, Phase 1): Svelte scopes a
// `@keyframes` block declared inside a component `<style>` block by
// renaming it (`svelte-<hash>-<name>`), but it does NOT rewrite an
// `animation:` value written in an inline `style="..."` attribute in
// markup. Every animation ported verbatim from this codebase's inline-style
// `.dc.html` mockups therefore referenced a keyframe name that no longer
// existed anywhere — the browser created no animation object at all.
//
// `getComputedStyle(el).animationName` is USELESS for detecting this: it
// returns the declared name whether or not it resolves to a real
// `@keyframes` rule. This suite's primary assertion instead cross-checks
// every element's live `animation-name` against the actual
// `CSSKeyframesRule`s registered in `document.styleSheets` — deterministic,
// and correct even for one-shot entrance animations that may have already
// finished (unlike `el.getAnimations()`, which only reports animations
// currently in effect).
//
// Runs against the REAL (non-fixture) build, invoked directly
// (`pnpm exec playwright test tests/e2e/animations.spec.ts`) against a
// `pnpm build` + `node tests/visual/static-server.mjs dist 4322`, never via
// `pnpm test:e2e`/`pnpm test:visual`. This is no longer required to dodge a
// fixture-mode animation gate — as of Phase 7b.1 a fixture build renders
// every `infinite` animation live too — it's simply this spec's own
// standing invocation convention.
import { expect, test, E2E_NOTIFICATIONS_INJECT_SEED, E2E_TOAST_DURATION_SCALE, type Page } from "./fixtures.ts";
import { BOOT_SEEN_STORAGE_KEY } from "../../src/lib/bootState.ts";
import { NOTIFICATIONS_INJECT_SEED_STORAGE_KEY, TOAST_DURATION_SCALE_STORAGE_KEY } from "../../src/lib/notificationStore.ts";

async function gotoReady(page: Page, path = "/") {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

const ROUTES = ["/", "/repositories", "/employment", "/retina-v", "/profile", "/help"];

/** Every currently-applied `animation-name` (split on `,`) that has no
 * matching `CSSKeyframesRule` anywhere in `document.styleSheets`. Walks
 * `@media`-nested rule lists too, even though none of this repo's
 * `-global-` keyframes are nested — cheap and future-proof. */
async function findUnresolvedAnimationNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const known = new Set<string>();
    const collect = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSKeyframesRule) known.add(rule.name);
        else if (rule instanceof CSSMediaRule) collect(rule.cssRules);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        collect(sheet.cssRules);
      } catch {
        // Cross-origin stylesheet — none exist in this build, but skip
        // defensively rather than throw.
      }
    }
    const unresolved = new Set<string>();
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const name = getComputedStyle(el).animationName;
      if (!name || name === "none") continue;
      for (const part of name.split(",").map((n) => n.trim())) {
        if (part && part !== "none" && !known.has(part)) unresolved.add(part);
      }
    }
    return Array.from(unresolved);
  });
}

test.describe("Phase 1: every animation-name resolves to a real @keyframes rule (PLAN.md F1)", () => {
  for (const route of ROUTES) {
    test(`no dead animation-name on ${route}`, async ({ page }) => {
      await gotoReady(page, route);
      const unresolved = await findUnresolvedAnimationNames(page);
      expect(unresolved, `dead animation-name(s) on ${route}: ${unresolved.join(", ")}`).toEqual([]);
    });
  }

  test("no dead animation-name with the notifications panel open (panelIn, sweep)", async ({ page }) => {
    await gotoReady(page, "/");
    await page.locator('[data-testid="notifications-bell"]').click();
    await page.locator('[data-testid="notifications-panel"]').waitFor({ state: "visible" });
    const unresolved = await findUnresolvedAnimationNames(page);
    expect(unresolved, `dead animation-name(s) with panel open: ${unresolved.join(", ")}`).toEqual([]);
  });

  test("no dead animation-name once a real repo is opened in Repositories (pls open-dot)", async ({ page }) => {
    await gotoReady(page, "/repositories");
    // Row 0 is the pinned `all-projects` virtual repo (never carries a
    // pulse dot — see ReposPanel.svelte); row 1 is the first real repo.
    const secondRow = page.locator('[data-testid="repositories-repo-row"]').nth(1);
    await secondRow.click();
    await page
      .locator('[data-testid="repositories-repo-open-dot"]')
      .first()
      .waitFor({ state: "visible" });
    const unresolved = await findUnresolvedAnimationNames(page);
    expect(unresolved, `dead animation-name(s) with a repo open: ${unresolved.join(", ")}`).toEqual([]);
  });
});

/** Testids of every element carrying one of the 6 currently-infinite
 * animations this phase repairs (`pls` excluded — it was never dead; its two
 * component-scoped duplicates are just removed, not repaired). None of these
 * are fixtureMode-gated as of Phase 7b.1 — they run live in every build.
 * Used by both the motion assertion below and the prefers-reduced-motion
 * assertion. */
const INFINITE_ANIMATION_TESTIDS = [
  "notifications-sense-ring",
  "notifications-sweep",
  "employment-timeline-spark",
  "employment-timeline-dash",
  "employment-timeline-ring-spin",
  "employment-timeline-ring-rspin",
] as const;

async function sampleTransformTwice(locator: ReturnType<Page["locator"]>): Promise<[string, string]> {
  const first = await locator.evaluate((el) => getComputedStyle(el).transform);
  await new Promise((r) => setTimeout(r, 400));
  const second = await locator.evaluate((el) => getComputedStyle(el).transform);
  return [first, second];
}

test.describe("Phase 1: infinite animations actually move (secondary, motion-based)", () => {
  test("senseRing + sweep move on the dashboard with the panel open", async ({ page }) => {
    await gotoReady(page, "/");
    await page.locator('[data-testid="notifications-bell"]').click();
    await page.locator('[data-testid="notifications-panel"]').waitFor({ state: "visible" });

    const ring = page.locator('[data-testid="notifications-sense-ring"]').first();
    await expect(ring).toBeVisible();
    expect(await ring.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);
    const [ringA, ringB] = await sampleTransformTwice(ring);
    expect(ringB).not.toBe(ringA);

    const sweep = page.locator('[data-testid="notifications-sweep"]').first();
    expect(await sweep.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);
    const [sweepA, sweepB] = await sampleTransformTwice(sweep);
    expect(sweepB).not.toBe(sweepA);
  });

  test("spin/rspin/spark/dash move on the employment timeline", async ({ page }) => {
    await gotoReady(page, "/employment");

    const spin = page.locator('[data-testid="employment-timeline-ring-spin"]').first();
    const rspin = page.locator('[data-testid="employment-timeline-ring-rspin"]').first();
    const spark = page.locator('[data-testid="employment-timeline-spark"]').first();
    const dash = page.locator('[data-testid="employment-timeline-dash"]').first();

    for (const el of [spin, rspin, spark, dash]) {
      expect(await el.evaluate((e) => e.getAnimations().length)).toBeGreaterThan(0);
    }

    const [spinA, spinB] = await sampleTransformTwice(spin);
    expect(spinB).not.toBe(spinA);
    const [rspinA, rspinB] = await sampleTransformTwice(rspin);
    expect(rspinB).not.toBe(rspinA);
  });
});

test.describe("Phase 1: prefers-reduced-motion suppresses the repaired infinite animations", () => {
  // `test.use({ reducedMotion: "reduce" })` doesn't type-check against the
  // `test` exported by ./fixtures.ts — that module overrides the `context`
  // fixture, and the resulting merged Fixtures type drops
  // `PlaywrightTestOptions` (so `reducedMotion` reads as an unknown
  // property). Building the context by hand sidesteps that entirely, and
  // lets this test mirror fixtures.ts's own addInitScript (boot-seen +
  // notification inject seed + toast duration scale) explicitly, since we
  // aren't going through its `context` fixture override here.
  async function assertSuppressed(page: Page, testid: string) {
    const el = page.locator(`[data-testid="${testid}"]`).first();
    await expect(el).toBeVisible();
    expect(await el.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
    expect(await el.evaluate((e) => e.getAnimations().length)).toBe(0);
  }

  test(`${INFINITE_ANIMATION_TESTIDS.join(", ")} carry no live animation under reduced motion`, async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    await context.addInitScript(
      ({ bootKey, injectSeedKey, injectSeed, durationScaleKey, durationScale }) => {
        try {
          sessionStorage.setItem(bootKey, "1");
          sessionStorage.setItem(injectSeedKey, String(injectSeed));
          sessionStorage.setItem(durationScaleKey, String(durationScale));
        } catch {
          // best-effort — same contract as tests/e2e/fixtures.ts
        }
      },
      {
        bootKey: BOOT_SEEN_STORAGE_KEY,
        injectSeedKey: NOTIFICATIONS_INJECT_SEED_STORAGE_KEY,
        injectSeed: E2E_NOTIFICATIONS_INJECT_SEED,
        durationScaleKey: TOAST_DURATION_SCALE_STORAGE_KEY,
        durationScale: E2E_TOAST_DURATION_SCALE,
      },
    );
    const page = await context.newPage();
    try {
      await gotoReady(page, "/");
      await page.locator('[data-testid="notifications-bell"]').click();
      await page.locator('[data-testid="notifications-panel"]').waitFor({ state: "visible" });
      await assertSuppressed(page, "notifications-sense-ring");
      await assertSuppressed(page, "notifications-sweep");

      await gotoReady(page, "/employment");
      await assertSuppressed(page, "employment-timeline-ring-spin");
      await assertSuppressed(page, "employment-timeline-ring-rspin");
      await assertSuppressed(page, "employment-timeline-spark");
      await assertSuppressed(page, "employment-timeline-dash");
    } finally {
      await context.close();
    }
  });
});
