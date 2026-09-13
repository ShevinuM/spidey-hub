// Harness spec: proves BootSequence.svelte works mounted alone (no Terminal
// kernel) at /harness/boot. Imports the raw `@playwright/test`, not the
// shared e2e `context` fixture — that fixture pre-seeds the boot-seen
// sessionStorage flag, which would make this mount skip straight to "ready"
// and prove nothing. Owns the fake clock via BootPage
// (`install()`/`pauseAt()` before `page.goto()`); see BootPage's own header
// for the mechanism.
import { expect, test } from "@playwright/test";
import { BootPage } from "../pages/BootPage";
import { pct, phaseLabel } from "../../../lib/boot";
import { BOOT_HARD_STOP_MS, BOOT_MS, BOOT_OUT_MS } from "../../../../../common/tests/ui/support/recipes";

// Hand-mirrored from content/boot.yaml — no runtime import is possible here
// (Vite-only `?raw` syntax), same convention as boot.spec.ts's own literals.
const PHASE_LABELS = { init: "INIT", scan: "SCAN", link: "LINK", lock: "LOCK", ready: "READY" };

test.describe("Boot harness: mounts standalone with seeded fixture props", () => {
  test("a genuine boot starts immediately — no kernel required", async ({ page }) => {
    const boot = new BootPage(page);
    await boot.openHarnessAndAwaitBootRunning();

    await expect(boot.bootSequence).toBeVisible();
    await expect(boot.pct).toBeVisible();
    await expect(boot.phase).toBeVisible();
  });

  test("pct/phase advance under the driven clock, tracking src/features/boot/lib/boot.ts's own formula", async ({ page }) => {
    const boot = new BootPage(page);
    await boot.openHarnessAndAwaitBootRunning();

    await boot.advanceTo(2000);

    // advanceTo() leaves the fake clock paused, so a plain locator read and
    // separate web-first assertions carry no race between them.
    // `getAttribute()` is a one-shot read used only to derive the expected
    // pct/phase from the same formula lib/boot.ts uses; the actual
    // assertions below are web-first through BootPage's own getters
    // (`e2e-testing.md` R003, `playwright.md` R002/R005 — no CSS
    // selectors, no raw `page.locator`).
    const elapsedAttr = await boot.bootSequence.getAttribute("data-elapsed");
    const elapsed = Number(elapsedAttr);

    expect(elapsed).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(BOOT_MS);

    const expectedPct = pct(elapsed, BOOT_MS);
    const expectedPhase = phaseLabel(expectedPct, PHASE_LABELS);
    await expect(boot.pct).toHaveText(`${expectedPct}%`);
    await expect(boot.phase).toHaveText(expectedPhase);
  });

  test("reaches 100%/READY and shows the outro bloom once the hard-stop timeout has fired", async ({ page }) => {
    const boot = new BootPage(page);
    await boot.openHarnessAndAwaitBootRunning();

    await boot.advanceTo(BOOT_HARD_STOP_MS + 10);

    await expect(boot.pct).toHaveText("100%");
    await expect(boot.phase).toHaveText("READY");
    await expect(boot.bootSequence).toBeVisible();
    await expect(boot.bootOutro).toBeVisible();
  });

  test("unmounts once the outro hold clears — no infinite overlay", async ({ page }) => {
    const boot = new BootPage(page);
    await boot.openHarnessAndAwaitBootRunning();

    await boot.advanceTo(BOOT_HARD_STOP_MS + 10 + BOOT_OUT_MS + 200);

    await expect(boot.bootSequence).toHaveCount(0);
  });

  test("no Terminal kernel chrome mounts alongside it (no status bar, no window switching)", async ({ page }) => {
    const boot = new BootPage(page);
    await boot.openHarnessAndAwaitBootRunning();
    await expect(boot.statusBar.windows).toHaveCount(0);
  });
});
