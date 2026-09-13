// Behavioral e2e suite for the boot sequence (BootSequence.svelte).
// Deliberately imports the RAW `@playwright/test`, not the shared `context`
// fixture — that fixture pre-seeds the boot-seen sessionStorage flag
// specifically so boot never runs during every OTHER spec's tests; this
// file exists to exercise the real thing.
//
// pct/phase expectations are computed via lib/boot.ts's own pure functions
// rather than hardcoded numbers, so this suite keeps passing against a
// deliberate tuning of the easing/threshold constants and fails loudly
// against an accidental one.
import { expect, test, type Page } from "@playwright/test";
import { pct, phaseLabel, progress } from "../../../lib/boot";
import { BOOT_SEEN_STORAGE_KEY } from "../../../lib/boot-state";

// Must match content/boot.yaml's bootMs / phaseLabels — no runtime import of
// that file is possible here (its `?raw` imports are Vite-only syntax), so
// this is the same hand-mirrored literal every other e2e spec uses for its
// view's yaml copy.
const BOOT_MS = 4600;
const HARD_STOP_MS = BOOT_MS + 60;
const OUT_MS = 760;
const PHASE_LABELS = { init: "INIT", scan: "SCAN", link: "LINK", lock: "LOCK", ready: "READY" };

const CLOCK_TIME = "2026-08-15T23:34:00";

const BOOT_SEQUENCE = '[data-testid="boot-sequence"]';
const BOOT_OUTRO = '[data-testid="boot-outro"]';
const BOOT_PCT = '[data-testid="boot-pct"]';
const BOOT_PHASE = '[data-testid="boot-phase"]';
const REBOOT_CONTROL = '[data-testid="status-bar-reboot"]';

async function terminalReady(page: Page) {
  await page.locator('[data-terminal-ready="true"]').waitFor({ state: "attached" });
}

/** Fresh context, fake clock installed before navigation, no sessionStorage
 * flag pre-seeded — a genuine first-load boot plays. Waits for
 * `data-boot-running="true"`, not just the overlay's own visibility: a
 * `clock.runFor()` issued before `run()` has captured `t0` is a no-op from
 * the timer's perspective, which this wait eliminates. */
async function freshBoot(page: Page, path = "/") {
  await page.clock.install({ time: CLOCK_TIME });
  await page.goto(path);
  await terminalReady(page);
  await page.locator('[data-testid="boot-sequence"][data-boot-running="true"]').waitFor({ state: "attached" });
}

/** Pre-seeds the boot-seen flag (as a real completed boot would have) so
 * the page loads straight into the ready dashboard — used by tests whose
 * subject is what happens AFTER boot (replay, reboot control, the r/other-
 * view interaction), not the fresh-load sequence itself. */
async function skipToReady(page: Page, path = "/") {
  await page.addInitScript((key) => {
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }, BOOT_SEEN_STORAGE_KEY);
  await page.clock.install({ time: CLOCK_TIME });
  await page.goto(path);
  await terminalReady(page);
}

test.describe("fresh boot", () => {
  test("boot overlay is visible immediately and the dashboard is not interactive yet", async ({ page }) => {
    await freshBoot(page);
    await expect(page.locator(BOOT_SEQUENCE)).toBeVisible();

    // Unskippable — global key handling is inert while booting (no
    // navigation, no grep overlay opens, the tmux prefix never even arms).
    await page.keyboard.down("Control");
    await page.keyboard.press("b");
    await page.keyboard.up("Control");
    await page.keyboard.press("1");
    await page.keyboard.press("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-testid="grep-overlay"]')).toHaveCount(0);
    await expect(page.locator(BOOT_SEQUENCE)).toBeVisible();

    await page.locator(BOOT_SEQUENCE).click({ position: { x: 5, y: 5 } });
    await expect(page.locator(BOOT_SEQUENCE)).toBeVisible();
  });

  test("pct and phase track elapsed time against src/features/boot/lib/boot.ts's own formula", async ({ page }) => {
    // Deliberately no `page.clock` here, unlike every other test in this
    // file: Playwright's fake clock resumes ticking in real time after any
    // control call, so reading an intermediate (still-ticking) value needs
    // real elapsed time instead — every other test below only reads a
    // terminal state, where the fake clock stays reliable.
    await page.goto("/");
    await terminalReady(page);
    await page.locator(`${BOOT_SEQUENCE}[data-boot-running="true"]`).waitFor({ state: "attached" });

    await page.waitForTimeout(1500);

    // A single `page.evaluate()` reads elapsed/pct/phase from one
    // consistent DOM snapshot so the three values are never read at
    // different instants relative to each other.
    const observed = await page.evaluate(() => ({
      elapsed: Number(document.querySelector('[data-testid="boot-sequence"]')?.getAttribute("data-elapsed")),
      pctText: document.querySelector('[data-testid="boot-pct"]')?.textContent ?? null,
      phaseText: document.querySelector('[data-testid="boot-phase"]')?.textContent ?? null,
    }));

    // Sanity bounds — real scheduling jitter means this won't land on an
    // exact millisecond, but it must be meaningfully into the sequence and
    // nowhere near its end.
    expect(observed.elapsed).toBeGreaterThan(500);
    expect(observed.elapsed).toBeLessThan(BOOT_MS - 200);

    const expectedPct = pct(observed.elapsed, BOOT_MS);
    const expectedPhase = phaseLabel(expectedPct, PHASE_LABELS);
    expect(observed.pctText).toBe(`${expectedPct}%`);
    expect(observed.phaseText).toBe(expectedPhase);
  });

  test("reaches 100%/READY once the hard-stop timeout has fired", async ({ page }) => {
    await freshBoot(page);
    // finish() explicitly snaps `elapsed = dur()` before flipping to phase
    // "out", so once it has definitely fired, pct()/phaseLabel() are exact
    // (progress===1), not dependent on interval-tick rounding.
    await page.clock.runFor(HARD_STOP_MS + 10);

    expect(progress(BOOT_MS, BOOT_MS)).toBe(1);
    await expect(page.locator(BOOT_PCT)).toHaveText("100%");
    await expect(page.locator(BOOT_PHASE)).toHaveText("READY");
  });

  test("outro bloom fires after the boot duration, then hands off to the dashboard", async ({ page }) => {
    await freshBoot(page);

    // Just past the hard-stop: phase is "out" — the outro bloom is visible
    // and the boot overlay (with its rings/log/etc.) is STILL mounted
    // (booting = phase !== "ready" covers "out" too).
    await page.clock.runFor(HARD_STOP_MS + 10);
    await expect(page.locator(BOOT_SEQUENCE)).toBeVisible();
    await expect(page.locator(BOOT_OUTRO)).toBeVisible();

    // Past the 760ms outro hold: phase flips to "ready" — the whole
    // overlay unmounts and the dashboard beneath is now interactive.
    await page.clock.runFor(OUT_MS + 100);
    await expect(page.locator(BOOT_SEQUENCE)).toHaveCount(0);
    await expect(page.locator('[data-testid="dashboard-wordmark"]')).toBeVisible();

    await page.keyboard.down("Control");
    await page.keyboard.press("b");
    await page.keyboard.up("Control");
    await page.keyboard.press("1");
    await expect(page).toHaveURL(/\/repositories$/);
  });
});

test.describe("session-once skip", () => {
  test("sessionStorage flag skips boot entirely on a same-tab reload", async ({ page }) => {
    await skipToReady(page);
    await expect(page.locator(BOOT_SEQUENCE)).toHaveCount(0);
    await expect(page.locator('[data-testid="dashboard-wordmark"]')).toBeVisible();

    // No fake-clock advance needed at all — the dashboard is immediately
    // interactive, proving the skip is functional, not merely "eventually
    // finishes fast".
    await page.keyboard.down("Control");
    await page.keyboard.press("b");
    await page.keyboard.up("Control");
    await page.keyboard.press("2");
    await expect(page).toHaveURL(/\/employment$/);
  });

  test("a deep link also skips boot when the flag is already set", async ({ page }) => {
    await skipToReady(page, "/repositories");
    await expect(page.locator(BOOT_SEQUENCE)).toHaveCount(0);
    await expect(page).toHaveURL(/\/repositories$/);
  });
});

test.describe("replay", () => {
  test("r on the ready dashboard replays boot, independent of the session flag", async ({ page }) => {
    await skipToReady(page);
    await expect(page.locator(BOOT_SEQUENCE)).toHaveCount(0);

    await page.keyboard.press("r");
    await expect(page.locator(BOOT_SEQUENCE)).toBeVisible();
    // Checked as "well under halfway" rather than pinning an exact "0%":
    // real time still passes between the keypress and this read, so a few
    // milliseconds of setup/assertion overhead can legitimately put it at
    // 1-2% rather than literally 0 under load.
    const pctAfterReplay = Number((await page.locator(BOOT_PCT).textContent())?.replace("%", ""));
    expect(pctAfterReplay).toBeLessThan(50);

    await page.clock.runFor(HARD_STOP_MS + OUT_MS + 100);
    await expect(page.locator(BOOT_SEQUENCE)).toHaveCount(0);
  });

  test("r in a non-dashboard view does not reboot — Profile's own r still downloads the resume", async ({ page }) => {
    await skipToReady(page);
    await page.keyboard.down("Control");
    await page.keyboard.press("b");
    await page.keyboard.up("Control");
    await page.keyboard.press("4");
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.locator('[data-testid="profile-signal-row"]')).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as { __opened: unknown[] }).__opened = [];
      window.open = ((url?: string | URL, target?: string) => {
        (window as unknown as { __opened: unknown[] }).__opened.push({ url, target });
        return null;
      }) as typeof window.open;
    });
    await page.keyboard.press("r");

    await expect(page.locator(BOOT_SEQUENCE)).toHaveCount(0);
    const opened = await page.evaluate(() => (window as unknown as { __opened: unknown[] }).__opened);
    expect(opened).toEqual([{ url: "/assets/resume.pdf", target: "_blank" }]);
  });

  test("status-bar ↻ reboot control replays boot from any view", async ({ page }) => {
    await skipToReady(page, "/repositories");
    await expect(page).toHaveURL(/\/repositories$/);

    await page.locator(REBOOT_CONTROL).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(BOOT_SEQUENCE)).toBeVisible();

    await page.clock.runFor(HARD_STOP_MS + OUT_MS + 100);
    await expect(page.locator(BOOT_SEQUENCE)).toHaveCount(0);
    await expect(page.locator('[data-testid="dashboard-wordmark"]')).toBeVisible();
  });

  test("reboot cancels an open status-bar prompt first", async ({ page }) => {
    await skipToReady(page, "/repositories");

    await page.keyboard.down("Control");
    await page.keyboard.press("b");
    await page.keyboard.up("Control");
    await page.keyboard.press(",");
    await expect(page.locator('[data-testid="status-prompt"]')).toBeVisible();

    await page.locator(REBOOT_CONTROL).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(BOOT_SEQUENCE)).toBeVisible();

    await page.clock.runFor(HARD_STOP_MS + OUT_MS + 100);
    await expect(page.locator('[data-testid="status-prompt"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="status-bar-windows"]')).toBeVisible();
  });

  test("reboot closes an open copy-mode overlay first", async ({ page }) => {
    await skipToReady(page, "/repositories");

    // Ctrl-b [ — copy-mode's overlay stops above the status bar (unlike
    // grep/the status-line prompts), so its z-index would otherwise sit on
    // top of the freshly-replayed boot overlay with stale captured text.
    await page.keyboard.down("Control");
    await page.keyboard.press("b");
    await page.keyboard.up("Control");
    await page.keyboard.press("[");
    await expect(page.locator('[data-testid="copy-mode-overlay"]')).toBeVisible();

    await page.locator(REBOOT_CONTROL).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-testid="copy-mode-overlay"]')).toHaveCount(0);
    await expect(page.locator(BOOT_SEQUENCE)).toBeVisible();

    await page.clock.runFor(HARD_STOP_MS + OUT_MS + 100);
    await expect(page.locator('[data-testid="copy-mode-overlay"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="dashboard-wordmark"]')).toBeVisible();
  });
});
