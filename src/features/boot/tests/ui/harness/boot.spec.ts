// Harness spec — proves BootSequence.svelte itself works, mounted alone (no
// Terminal kernel, no tmux chrome, no Terminal-owned onReady/bind:this
// routing) against `/harness/boot` (fixture build only, seeded fixture
// props). This is deliberately NOT a copy of
// src/features/boot/tests/ui/e2e/boot.spec.ts/cold-boot.spec.ts: those
// suites exercise boot through the real kernel (the dashboard it hands off
// to, the status-bar reboot control, window switching after "ready"), and
// exist specifically because the shared e2e `context` fixture pre-seeds the
// boot-seen flag for every OTHER spec — this file instead covers boot's own
// self-contained behavior in isolation: mount, a genuine unskipped run
// advancing under a driven clock, reaching "ready", and the absence of
// kernel chrome.
//
// Deliberately imports the RAW `@playwright/test` (not the shared e2e
// `context` fixture, and not any harness-fixture equivalent): the shared
// fixture pre-seeds the boot-seen sessionStorage flag specifically so boot
// never runs during every OTHER spec's tests, and `hasBootPlayed()` is read
// inside BootSequence.svelte's own `$state` initializer on this harness
// mount exactly the same as on the real app — a fixture-seeded flag here
// would make the component mount straight to "ready" and this file would
// prove nothing.
//
// Owns the fake clock via BootPage (`install()` + `pauseAt()` BEFORE
// `page.goto()`, then staged `pauseAt()` jumps) — the same ordering and
// two-stage-past-hard-stop rule `captureBootState()` (pipeline.mjs) uses,
// necessary because boot's pct/phase/log/handshake math reads exact elapsed
// milliseconds. See BootPage's own header comment for the full mechanism.
import { expect, test } from "@playwright/test";
import { BootPage } from "../pages/BootPage";
import { pct, phaseLabel } from "../../../lib/boot";
import { BOOT_HARD_STOP_MS, BOOT_MS, BOOT_OUT_MS } from "../../../../../../common/tests/ui/support/recipes";

// Hand-mirrored from src/features/boot/content/boot.yaml — same "no runtime
// import of that file is possible here" convention
// src/features/boot/tests/ui/e2e/boot.spec.ts already uses for its own
// literals (its `?raw` imports are Vite-only syntax).
const PHASE_LABELS = { init: "INIT", scan: "SCAN", link: "LINK", lock: "LOCK", ready: "READY" };

test.describe("Boot harness: mounts standalone with seeded fixture props", () => {
  test("a genuine boot starts immediately — no kernel required", async ({ page }) => {
    const boot = new BootPage(page);
    await boot.openHarness();

    await expect(boot.bootSequence).toBeVisible();
    await expect(boot.pct).toBeVisible();
    await expect(boot.phase).toBeVisible();
  });

  test("pct/phase advance under the driven clock, tracking src/features/boot/lib/boot.ts's own formula", async ({ page }) => {
    const boot = new BootPage(page);
    await boot.openHarness();

    await boot.advanceTo(2000);

    // A single evaluate() reads elapsed/pct/phase from one consistent DOM
    // snapshot, same convention as boot.spec.ts's own intermediate-value
    // test, so the values being compared are never read at different
    // instants relative to each other.
    const observed = await page.evaluate(() => ({
      elapsed: Number(document.querySelector('[data-testid="boot-sequence"]')?.getAttribute("data-elapsed")),
      pctText: document.querySelector('[data-testid="boot-pct"]')?.textContent ?? null,
      phaseText: document.querySelector('[data-testid="boot-phase"]')?.textContent ?? null,
    }));

    expect(observed.elapsed).toBeGreaterThan(0);
    expect(observed.elapsed).toBeLessThan(BOOT_MS);

    const expectedPct = pct(observed.elapsed, BOOT_MS);
    const expectedPhase = phaseLabel(expectedPct, PHASE_LABELS);
    expect(observed.pctText).toBe(`${expectedPct}%`);
    expect(observed.phaseText).toBe(expectedPhase);
  });

  test("reaches 100%/READY and shows the outro bloom once the hard-stop timeout has fired", async ({ page }) => {
    const boot = new BootPage(page);
    await boot.openHarness();

    await boot.advanceTo(BOOT_HARD_STOP_MS + 10);

    await expect(boot.pct).toHaveText("100%");
    await expect(boot.phase).toHaveText("READY");
    await expect(boot.bootSequence).toBeVisible();
    await expect(boot.bootOutro).toBeVisible();
  });

  test("unmounts once the outro hold clears — no infinite overlay", async ({ page }) => {
    const boot = new BootPage(page);
    await boot.openHarness();

    await boot.advanceTo(BOOT_HARD_STOP_MS + 10 + BOOT_OUT_MS + 200);

    await expect(boot.bootSequence).toHaveCount(0);
  });

  test("no Terminal kernel chrome mounts alongside it (no status bar, no window switching)", async ({ page }) => {
    const boot = new BootPage(page);
    await boot.openHarness();
    await expect(boot.statusBar.windows).toHaveCount(0);
  });
});
