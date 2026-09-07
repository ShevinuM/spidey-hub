// Harness spec (00-phases.md D24) — proves Profile.svelte itself works,
// mounted alone (no Terminal kernel, no tmux chrome, no keydown
// delegation) against `/harness/profile` (fixture build only, seeded
// fixture props). This is deliberately NOT a copy of
// src/features/profile/tests/ui/e2e/profile.spec.ts: that suite exercises
// Profile through the real kernel (window switching, the `r` hotkey routed
// through Terminal.svelte's own keydown delegation — Profile exports
// `handleKey()` but never listens for keydown itself, so `r` does nothing
// here). This spec instead covers mount + the component's own
// self-contained behavior: content rendering and the live meter's
// independent rAF loop.
import { expect, test } from "@playwright/test";

test.describe("Profile harness: mounts standalone with seeded fixture props", () => {
  test("renders the dossier, CV link, and contact rows from real content — no kernel required", async ({ page }) => {
    await page.goto("/harness/profile");
    await expect(page.locator('[data-testid="profile-dossier"]')).toBeVisible();
    await expect(page.locator('[data-testid="profile-dossier"]')).toContainText("vim and tmux obsession");

    const cv = page.locator('[data-testid="profile-cv-link"]');
    await expect(cv).toHaveAttribute("href", "/assets/resume.pdf");
    await expect(cv).toHaveAttribute("download", "");

    const links = page.locator('[data-testid="profile-contact-link"]');
    await expect(links).toHaveCount(3);
  });

  test("the SIGNAL meter's own rAF loop runs independent of any kernel", async ({ page }) => {
    await page.goto("/harness/profile");
    const bars = page.locator('[data-testid="signal-meter-bars"] > div');
    await expect(bars).toHaveCount(60);

    const heightAt = () => bars.first().evaluate((el) => (el as HTMLElement).style.height);
    const h1 = await heightAt();
    await page.waitForTimeout(120);
    const h2 = await heightAt();
    await page.waitForTimeout(120);
    const h3 = await heightAt();
    expect(new Set([h1, h2, h3]).size).toBeGreaterThan(1);
  });

  test("no Terminal kernel chrome mounts alongside it (no status bar, no window switching)", async ({ page }) => {
    await page.goto("/harness/profile");
    await expect(page.locator('[data-testid="status-bar-windows"]')).toHaveCount(0);
  });
});
