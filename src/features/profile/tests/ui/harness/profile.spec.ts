// Mounts Profile.svelte standalone (no Terminal kernel), so `r` does
// nothing here — the hotkey is routed through Terminal.svelte's keydown
// delegation, exercised instead by profile.spec.ts's e2e suite.
import { expect, test } from "@playwright/test";
import { ProfilePage } from "../pages/ProfilePage";

test.describe("Profile harness: mounts standalone with seeded fixture props", () => {
  test("renders the dossier, CV link, and contact rows from real content — no kernel required", async ({
    page,
  }) => {
    const profile = new ProfilePage(page);
    await profile.openHarness();

    await expect(profile.dossier).toBeVisible();
    await expect(profile.dossier).toContainText("vim and tmux obsession");

    await expect(profile.cvLink).toHaveAttribute("href", "/assets/resume.pdf");
    await expect(profile.cvLink).toHaveAttribute("download", "");

    await expect(profile.contactLinks).toHaveCount(3);
  });

  test("the SIGNAL meter's own rAF loop runs independent of any kernel", async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.openHarness();
    await expect(profile.meterBars).toHaveCount(60);

    const h1 = await profile.firstBarHeight();
    await expect.poll(() => profile.firstBarHeight(), { timeout: 2000 }).not.toBe(h1);
    const h2 = await profile.firstBarHeight();
    await expect.poll(() => profile.firstBarHeight(), { timeout: 2000 }).not.toBe(h2);
    const h3 = await profile.firstBarHeight();

    expect(new Set([h1, h2, h3]).size).toBeGreaterThan(1);
  });

  test("no Terminal kernel chrome mounts alongside it (no status bar, no window switching)", async ({
    page,
  }) => {
    const profile = new ProfilePage(page);
    await profile.openHarness();
    await expect(profile.statusBar.windows).toHaveCount(0);
  });
});
