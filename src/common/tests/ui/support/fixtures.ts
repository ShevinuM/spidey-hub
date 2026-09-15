// Overrides Playwright's `context` fixture so every page opened by a spec
// importing this module gets the boot-skip and deterministic-notification
// sessionStorage flags set via `addInitScript` before any navigation happens,
// regardless of which goto helper the spec uses — the single choke point
// that keeps a spec from silently eating the ~4.6s unskippable boot sequence
// or real notification/toast timers.
//
// `src/features/boot/tests/ui/e2e/boot.spec.ts` deliberately imports the raw
// `@playwright/test` instead of this module, since it exercises the real
// (non-skipped) boot sequence.
//
// Also pre-seeds two notification-store sessionStorage overrides: which two
// unseen pool entries get injected per visit (`E2E_NOTIFICATIONS_INJECT_SEED`,
// so a spec can compute the exact expected picks via
// `pickRandomUnseen(pool, seenIds, 2, mulberry32(seed))` instead of
// hardcoding notification copy), and a scale factor that shrinks every
// toast's dismiss timer so a spec can observe an auto-dismissal without
// waiting out the real duration.
import { test as base, expect, type Page, type BrowserContext } from "@playwright/test";
import { BOOT_SEEN_STORAGE_KEY } from "../../../../features/boot/lib/boot-state";
import {
  NOTIFICATIONS_INJECT_SEED_STORAGE_KEY,
  TOAST_DURATION_SCALE_STORAGE_KEY,
} from "../../../../features/notifications/lib/notification-store";

export const E2E_NOTIFICATIONS_INJECT_SEED = 424242;
// Must keep even the shortest severity's scaled duration comfortably longer than the toast's own fixed entrance animation, or a dismiss fires mid-transition and flakes Playwright's hover() actionability check.
export const E2E_TOAST_DURATION_SCALE = 0.3;

export const test = base.extend<{ context: BrowserContext }>({
  context: async ({ context }, use) => {
    await context.addInitScript(
      ({ bootKey, injectSeedKey, injectSeed, durationScaleKey, durationScale }) => {
        try {
          sessionStorage.setItem(bootKey, "1");
          sessionStorage.setItem(injectSeedKey, String(injectSeed));
          sessionStorage.setItem(durationScaleKey, String(durationScale));
        } catch {
          // ignore — same best-effort contract as src/features/boot/lib/boot-state.ts
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
    await use(context);
  },
});

export { expect, type Page, type BrowserContext };
// Re-exported so specs that need only the boot-skip sessionStorage key (not
// this module's wrapped `test`/`context`) can import it through this
// common/ surface instead of reaching into a feature's own lib directly.
export { BOOT_SEEN_STORAGE_KEY };
