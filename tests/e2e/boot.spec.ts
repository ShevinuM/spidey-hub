// Behavioral e2e suite for the E.D.I.T.H boot sequence (PLAN.md Phase 5B,
// BootSequence.svelte). Deliberately imports the RAW `@playwright/test`
// (not ./fixtures.ts) — every other spec's shared `context` fixture
// pre-seeds the boot-seen sessionStorage flag specifically so boot never
// runs during THEIR tests; this file exists to exercise the real thing.
//
// Uses `page.clock` (Playwright's fake-timer API), matching the same
// "install before navigation, runFor to advance" contract as
// tests/visual/pipeline.mjs and tests/e2e/nav.spec.ts's live-clock test —
// BootSequence.svelte's own timer is a wall-clock `Date.now()` +
// `setInterval`/`setTimeout` (deliberately not requestAnimationFrame, see
// that component's header comment) specifically so it is controllable this
// way.
//
// pct/phase expectations are computed via src/lib/boot.ts's own pure
// functions rather than hardcoded numbers, so a future tuning of the
// easing/threshold constants only requires updating that one module (and
// tests/unit/boot.test.ts) — this suite would keep passing against a
// deliberate change, and fail loudly against an accidental one (a typo'd
// threshold here would silently duplicate the bug it's supposed to catch).
import { expect, test, type Page } from "@playwright/test";
import { pct, phaseLabel, progress } from "../../src/lib/boot.ts";
import { BOOT_SEEN_STORAGE_KEY } from "../../src/lib/bootState.ts";

// Must match src/data/boot.yaml's bootMs / phaseLabels — no runtime import
// of that file is possible here (its `?raw` imports are Vite-only syntax,
// see src/lib/data.ts), so these are the same kind of hand-mirrored
// literal every other e2e spec already uses for its view's yaml copy
// (e.g. nav.spec.ts's WINDOWS array, tmux.spec.ts's window list).
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
 * `data-boot-running="true"` (not just the overlay's own visibility) before
 * returning: the `{#if booting}` DOM mounts on the very first render (from
 * `phase`'s initial value), strictly BEFORE BootSequence.svelte's own
 * mount effect has necessarily called `run()` and captured `t0` — under
 * heavy parallel-worker load a `clock.runFor()` issued between those two
 * points is a no-op from the timer's perspective (its `t0` gets captured
 * at the ALREADY-ADVANCED fake time once `run()` finally fires), which is
 * exactly the flake this wait eliminates. */
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
    // navigation, no grep overlay opens).
    await page.keyboard.press("b");
    await page.keyboard.press("x");
    await page.keyboard.press("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-testid="grep-overlay"]')).toHaveCount(0);
    await expect(page.locator(BOOT_SEQUENCE)).toBeVisible();

    // Clicking the overlay itself does nothing either (no click handlers on
    // it at all — matches the mock's own unskippable design).
    await page.locator(BOOT_SEQUENCE).click({ position: { x: 5, y: 5 } });
    await expect(page.locator(BOOT_SEQUENCE)).toBeVisible();
  });

  test("pct and phase track elapsed time against src/lib/boot.ts's own formula", async ({ page }) => {
    // Deliberately NO `page.clock` here, unlike every other test in this
    // file. Empirically measured (isolated repro against a bare
    // `setInterval` in the page, outside any app code — not guesswork,
    // injected via `page.evaluate`, independent of BootSequence.svelte
    // entirely): once Playwright's fake clock has processed ANY control
    // call (`runFor`/`fastForward`/`pauseAt`), it RESUMES ticking in
    // lockstep with real wall-clock time immediately afterward, until the
    // next control call — confirmed directly against that bare
    // `setInterval`, so it is a property of the clock API itself, not a
    // BootSequence.svelte bug. (An earlier round of this same debugging
    // also saw `data-elapsed` read back as `null`/0 for several attempts
    // in a row — that turned out to be a stale `dist/` build predating the
    // attribute's addition, a test-environment mistake on my part, NOT a
    // second clock-API failure mode; once rebuilt, `runFor` + a single
    // atomic read was exact every time in isolation. It only stopped being
    // safe to rely on once the earlier "resumes real time" behavior is
    // factored in: a RETRYING assertion, or any second read after the
    // first, reopens that same window.) Every OTHER test below only needs
    // the fake clock to reach a TERMINAL state (after finish()/the outro
    // timer have cleared their own interval/timeout, so no further ticks —
    // real or virtual — can move anything), which is exactly where the
    // fake clock stayed reliable across repeated stress runs; only this
    // test reads an INTERMEDIATE, still-ticking value, which is precisely
    // where it wasn't.
    //
    // Using real elapsed time instead sidesteps the fake-clock's observed
    // unreliability entirely — this test costs ~1.5 real seconds (well
    // under the 4600ms boot window) rather than being instant, which is an
    // acceptable, deliberate trade for a boot-specific test (PLAN.md's
    // "existing suites must not eat 4.6s each" budget targets the *other*
    // ~450 tests via the sessionStorage skip flag, not this file's own).
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
    // Component.finish() (called either by the tick loop crossing `dur()`
    // or, as a backstop, the hard-stop timeout) explicitly snaps
    // `elapsed = dur()` before flipping to phase "out" — so once it has
    // definitely fired (well past HARD_STOP_MS), pct()/phaseLabel() are
    // exact (progress===1), not dependent on interval-tick rounding.
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

    await page.keyboard.press("b");
    await expect(page).toHaveURL(/\/builds$/);
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
    await page.keyboard.press("x");
    await expect(page).toHaveURL(/\/personnel$/);
  });

  test("a deep link also skips boot when the flag is already set", async ({ page }) => {
    await skipToReady(page, "/builds");
    await expect(page.locator(BOOT_SEQUENCE)).toHaveCount(0);
    await expect(page).toHaveURL(/\/builds$/);
  });
});

test.describe("replay", () => {
  test("r on the ready dashboard replays boot, independent of the session flag", async ({ page }) => {
    await skipToReady(page);
    await expect(page.locator(BOOT_SEQUENCE)).toHaveCount(0);

    await page.keyboard.press("r");
    await expect(page.locator(BOOT_SEQUENCE)).toBeVisible();
    // Progress resets to (near) the very start — checked as "well under
    // halfway" rather than pinning an exact "0%": no `clock.runFor()` has
    // been issued yet in this test, but real time still passes between the
    // keypress and this read (CDP round-trips are not instantaneous), and
    // BootSequence's interval ticks on genuine `Date.now()` deltas, so a
    // few milliseconds of real setup/assertion overhead can legitimately
    // put it at 1-2% rather than literally 0 under load.
    const pctAfterReplay = Number((await page.locator(BOOT_PCT).textContent())?.replace("%", ""));
    expect(pctAfterReplay).toBeLessThan(50);

    await page.clock.runFor(HARD_STOP_MS + OUT_MS + 100);
    await expect(page.locator(BOOT_SEQUENCE)).toHaveCount(0);
  });

  test("r in a non-dashboard view does not reboot — Profile's own r still downloads the resume", async ({ page }) => {
    await skipToReady(page);
    await page.keyboard.press("i");
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
    await skipToReady(page, "/builds");
    await expect(page).toHaveURL(/\/builds$/);

    await page.locator(REBOOT_CONTROL).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(BOOT_SEQUENCE)).toBeVisible();

    await page.clock.runFor(HARD_STOP_MS + OUT_MS + 100);
    await expect(page.locator(BOOT_SEQUENCE)).toHaveCount(0);
    await expect(page.locator('[data-testid="dashboard-wordmark"]')).toBeVisible();
  });

  test("reboot cancels an open status-bar prompt first", async ({ page }) => {
    await skipToReady(page, "/builds");

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
    await skipToReady(page, "/builds");

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
