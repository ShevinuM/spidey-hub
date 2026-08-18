// Behavioral e2e suite for the Profile ("Agent Profile") view — PLAN.md
// Phase 7. Against the real-content build (pnpm build -> astro preview,
// same as every other tests/e2e spec — see nav.spec.ts's header comment).
//
// Uses real timers throughout (no `page.clock.install`): the live meter's
// rAF loop and 2500ms probe interval are exactly the thing under test here,
// and the visual suite (tests/visual/identical.spec.ts) already covers the
// pixel-frozen path via the faked clock + SIGNAL-row mask.
import { expect, test, type Page } from "./fixtures.ts";
// PLAN.md Phase 5B item 5B.5: this spec's `context` fixture (imported
// from ./fixtures.ts, not raw "@playwright/test") pre-seeds the boot-seen
// sessionStorage flag before every navigation, so BootSequence.svelte's
// ~4.6s unskippable sequence never runs for these tests — see that
// file's header comment for why this is a context-fixture override
// rather than a per-goto-helper change.

const STATUS_BAR = '[data-testid="status-bar-windows"]';

async function statusBarText(page: Page) {
  return (await page.locator(STATUS_BAR).innerText()).replace(/\s+/g, " ").trim();
}

const WINDOWS = ["dashboard", "builds", "personnel", "retina-v", "profile", "help"];
/** `lastId` (PLAN.md Iteration 3 Phase 4 item 4.3 tmux fidelity reference)
 * is the real tmux `-` flag on the session's PREVIOUSLY active window —
 * omit it for assertions made before any in-test window switch. */
function winText(activeId: string, lastId?: string): string {
  return WINDOWS.map((id, i) => `${i}:${id}${id === activeId ? "*" : id === lastId ? "-" : ""}`).join(" ");
}

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

async function openProfile(page: Page) {
  await gotoReady(page, "/");
  await page.keyboard.press("i");
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.locator('[data-testid="profile-signal-row"]')).toBeVisible();
}

test.describe("Profile: resume hotkey + CV link", () => {
  test("r opens the resume PDF in a new tab", async ({ page }) => {
    await openProfile(page);
    // Record `window.open` calls instead of asserting on the resulting
    // popup's navigated URL: headless Chromium in this sandbox never
    // commits a navigation for `window.open()`-opened PDFs (reproduced
    // even for a bare `page.evaluate(() => window.open(...))` with no app
    // code involved at all — the popup page exists but its `url()` stays
    // "" indefinitely), so the popup's own `url()`/load events are not a
    // reliable signal here. Overriding `window.open` and asserting on its
    // call arguments directly tests the same contract ("r opens
    // /assets/resume.pdf via window.open, matching the prototype") without
    // depending on that environment quirk.
    await page.evaluate(() => {
      (window as unknown as { __opened: unknown[] }).__opened = [];
      window.open = ((url?: string | URL, target?: string) => {
        (window as unknown as { __opened: unknown[] }).__opened.push({ url, target });
        return null;
      }) as typeof window.open;
    });
    await page.keyboard.press("r");
    const opened = await page.evaluate(() => (window as unknown as { __opened: unknown[] }).__opened);
    expect(opened).toEqual([{ url: "/assets/resume.pdf", target: "_blank" }]);
  });

  test("CV link has a download attribute and points at the resume", async ({ page }) => {
    await openProfile(page);
    const cv = page.locator('[data-testid="profile-cv-link"]');
    await expect(cv).toHaveAttribute("href", "/assets/resume.pdf");
    await expect(cv).toHaveAttribute("download", "");
  });
});

test.describe("Profile: contact rows", () => {
  // PLAN.md Locked #7: contact data taken from the resume, verbatim — no
  // phone number is published on the site.
  test("github/linkedin/mail hrefs are exact (resume values); discord is not a link", async ({ page }) => {
    await openProfile(page);
    const links = page.locator('[data-testid="profile-contact-link"]');
    await expect(links).toHaveCount(3);

    const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    expect(hrefs).toEqual([
      "https://github.com/ShevinuM",
      "https://linkedin.com/in/shevinum",
      "mailto:shevinu2002@gmail.com",
    ]);

    const nonLink = page.locator('[data-testid="profile-contact-nonlink"]');
    await expect(nonLink).toHaveCount(1);
    await expect(nonLink).toContainText("shevinum");
    expect(await nonLink.evaluate((el) => el.tagName)).toBe("SPAN");
    // Belt-and-suspenders: no anchor's *exact* accessible name is the bare
    // "shevinum" discord handle (github/linkedin links legitimately contain
    // "shevinum" as a substring of their full URL text, e.g.
    // "github.com/ShevinuM" — a substring-based has-text check would false
    // -positive on those, so this matches the full text exactly instead).
    expect(await page.getByRole("link", { name: "shevinum", exact: true }).count()).toBe(0);
  });

  test("no phone number is published anywhere on the page", async ({ page }) => {
    await openProfile(page);
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/709-219-3095/);
  });
});

test.describe("Profile: EDUCATION section (PLAN.md Iteration 3 Phase 1 item 1.4)", () => {
  test("both resume entries render (degree, school, location, dates)", async ({ page }) => {
    await openProfile(page);
    const rows = page.locator('[data-testid="profile-education-row"]');
    await expect(rows).toHaveCount(2);

    await expect(rows.nth(0)).toContainText("BSc. Computer Science");
    await expect(rows.nth(0)).toContainText("Memorial University of Newfoundland");
    await expect(rows.nth(0)).toContainText("St. John's, NL");
    await expect(rows.nth(0)).toContainText("Sep 2021");
    await expect(rows.nth(0)).toContainText("Jun 2026");

    await expect(rows.nth(1)).toContainText("International Visiting Student");
    await expect(rows.nth(1)).not.toContainText("International Visiting Student, Computer Science");
    await expect(rows.nth(1)).toContainText("Tecnológico de Monterrey");
    await expect(rows.nth(1)).toContainText("Guadalajara, Mexico");
    await expect(rows.nth(1)).toContainText("Feb 2026");
    await expect(rows.nth(1)).toContainText("Jun 2026");
  });
});

test.describe("Profile: live meter (SIGNAL row)", () => {
  test("bar heights change across frames, fill is a repeating-linear-gradient, readout matches the expected shape", async ({
    page,
  }) => {
    await openProfile(page);
    const bars = page.locator('[data-testid="signal-meter-bars"] > div');
    await expect(bars).toHaveCount(60);

    const heightAt = () => bars.first().evaluate((el) => (el as HTMLElement).style.height);

    const h1 = await heightAt();
    await page.waitForTimeout(120);
    const h2 = await heightAt();
    await page.waitForTimeout(120);
    const h3 = await heightAt();
    expect(new Set([h1, h2, h3]).size).toBeGreaterThan(1);

    const background = await bars.first().evaluate((el) => (el as HTMLElement).style.background);
    expect(background).toContain("repeating-linear-gradient");

    const readout = page.locator('[data-testid="signal-net-readout"]');
    await expect(readout).toHaveText(/^(measuring…|offline|\d+(\.\d)? Mb\/s · \d+ ms · [A-Z0-9-]+)$/, {
      timeout: 10000,
    });
  });

  test("goes offline: readout eventually reads exactly \"offline\"", async ({ page, context }) => {
    await openProfile(page);
    await context.setOffline(true);
    await expect(page.locator('[data-testid="signal-net-readout"]')).toHaveText("offline", { timeout: 10000 });
    await context.setOffline(false);
  });
});

// PLAN.md Iteration 4 item 21 removed the separate SUMMARY box entirely —
// the dossier below is the only bio block left.
test.describe("Profile: summary section removed (Iteration 4 item 21)", () => {
  test("profile-summary testid no longer exists", async ({ page }) => {
    await openProfile(page);
    await expect(page.locator('[data-testid="profile-summary"]')).toHaveCount(0);
  });
});

test.describe("Profile: DOSSIER panel (PLAN.md Iteration 3 Phase 1 item 1.4)", () => {
  test("renders the data file's real bio, from profile.yaml (not hardcoded)", async ({ page }) => {
    await openProfile(page);
    const dossier = page.locator('[data-testid="profile-dossier"]');
    await expect(dossier).toBeVisible();
    // Distinctive substrings from the user's own data file, near-verbatim
    // — enough to confirm this is the real bio, not a paraphrase.
    await expect(dossier).toContainText("vim and tmux obsession");
    await expect(dossier).toContainText("Mexico");
    await expect(dossier).toContainText("Brand New Day");
    await expect(dossier).toContainText("system design and architecture");
  });

  test("scrolls (overflow-y: auto)", async ({ page }) => {
    await openProfile(page);
    const dossier = page.locator('[data-testid="profile-dossier"]');
    const overflowY = await dossier.evaluate((el) => getComputedStyle(el).overflowY);
    expect(overflowY).toBe("auto");
  });

  // PLAN.md Iteration 4 item 21: the paragraphs used to render with no
  // visible gap between them (a 5px flex `gap`, easy to mistake for line-
  // height) — bumped to a clearly-visible 12px.
  test("paragraphs have visible spacing between them", async ({ page }) => {
    await openProfile(page);
    const dossier = page.locator('[data-testid="profile-dossier"]');
    const rowGap = await dossier.evaluate((el) => parseFloat(getComputedStyle(el).rowGap));
    expect(rowGap).toBeGreaterThanOrEqual(10);
  });
});

test.describe("Profile: q/Esc never navigate, no close pill (PLAN.md Phase 1 items 15/16)", () => {
  test("q does nothing — stays on profile", async ({ page }) => {
    await openProfile(page);
    await page.keyboard.press("q");
    await expect(page).toHaveURL(/\/profile$/);
  });

  test("Esc does nothing — stays on profile", async ({ page }) => {
    await openProfile(page);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/profile$/);
  });

  test("the [q] close pill no longer exists — navigation is status-bar clicks / tmux prefix / dashboard menu only", async ({
    page,
  }) => {
    await openProfile(page);
    await expect(page.locator('[data-testid="profile-close"]')).toHaveCount(0);
    // The mouse path off of Profile is the status bar, same as every view.
    await page.locator('[data-testid="status-bar-window"][data-window-id="dashboard"]').click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("status bar shows windows 0-5 in numeric order with profile active", async ({ page }) => {
    await openProfile(page);
    expect(await statusBarText(page)).toBe(winText("profile", "dashboard"));
  });
});
