// Behavioral e2e suite for the Profile ("Agent Profile") view — PLAN.md
// Phase 7. Against the real-content build (pnpm build -> astro preview,
// same as every other tests/e2e spec — see nav.spec.ts's header comment).
//
// Uses real timers throughout (no `page.clock.install`): the live meter's
// rAF loop and 2500ms probe interval are exactly the thing under test here,
// and the visual suite (tests/visual/identical.spec.ts) already covers the
// pixel-frozen path via the faked clock + SIGNAL-row mask.
import { expect, test, type Page } from "@playwright/test";

const STATUS_BAR = '[data-testid="status-bar-windows"]';

async function statusBarText(page: Page) {
  return (await page.locator(STATUS_BAR).innerText()).replace(/\s+/g, " ").trim();
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
  test("github/linkedin/mail hrefs are exact; discord is not a link", async ({ page }) => {
    await openProfile(page);
    const links = page.locator('[data-testid="profile-contact-link"]');
    await expect(links).toHaveCount(3);

    const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    expect(hrefs).toEqual([
      "https://github.com/shevinum",
      "https://ca.linkedin.com/in/shevinum",
      "mailto:shev@shevinum.dev",
    ]);

    const nonLink = page.locator('[data-testid="profile-contact-nonlink"]');
    await expect(nonLink).toHaveCount(1);
    await expect(nonLink).toContainText("shevinum");
    expect(await nonLink.evaluate((el) => el.tagName)).toBe("SPAN");
    // Belt-and-suspenders: no anchor's *exact* accessible name is the bare
    // "shevinum" discord handle (github/linkedin links legitimately contain
    // "shevinum" as a substring of their full URL text, e.g.
    // "github.com/shevinum" — a substring-based has-text check would false
    // -positive on those, so this matches the full text exactly instead).
    expect(await page.getByRole("link", { name: "shevinum", exact: true }).count()).toBe(0);
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

test.describe("Profile: SUMMARY panel", () => {
  test("scrolls (overflow-y: auto)", async ({ page }) => {
    await openProfile(page);
    const summary = page.locator('[data-testid="profile-summary"]');
    await expect(summary).toBeVisible();
    const overflowY = await summary.evaluate((el) => getComputedStyle(el).overflowY);
    expect(overflowY).toBe("auto");
  });
});

test.describe("Profile: close + status bar", () => {
  test("q returns to the dashboard", async ({ page }) => {
    await openProfile(page);
    await page.keyboard.press("q");
    await expect(page).toHaveURL(/\/$/);
  });

  test("Esc returns to the dashboard", async ({ page }) => {
    await openProfile(page);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/$/);
  });

  test("clicking [q] close returns to the dashboard", async ({ page }) => {
    await openProfile(page);
    await page.locator('[data-testid="profile-close"]').click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("status bar shows windows 1-4 in numeric order with profile active", async ({ page }) => {
    await openProfile(page);
    expect(await statusBarText(page)).toBe("1:builds 2:personnel 3:retina-v 4:profile*");
  });
});
