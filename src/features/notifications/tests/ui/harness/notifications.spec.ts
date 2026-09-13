// Harness spec — proves the notifications feature's own bell/panel/toast
// system (Notifications.svelte, backed by
// src/features/notifications/lib/notification-store.ts) works mounted
// alone via NotificationsHarness.svelte (this same folder), standalone: no
// Terminal kernel, no tmux chrome, no window switching, no other view to
// gate visibility against.
//
// Deliberately NOT a copy of
// src/features/notifications/tests/ui/e2e/notifications.spec.ts: that suite
// exercises the system through the real kernel (view-gated bell
// visibility, window switching, the status-bar reboot control, persistence
// across reload) — this covers mount, the bell's unread badge, the panel's
// own `n` toggle (routed by the harness wrapper, not Terminal), and toast
// appearance/auto-dismiss.
//
// Imports the SHARED e2e fixture (src/common/tests/ui/support/fixtures.ts),
// unlike help/boot's own harness specs: help needs no seeding at all, and
// boot's harness deliberately avoids the shared fixture (a seeded
// boot-seen flag there would skip the very sequence it exists to test).
// This harness needs exactly what the shared fixture already provides — a
// pinned injection seed and a shortened toast-duration scale — so reusing
// it here is the single source of that seeding mechanism rather than a
// second copy of its `addInitScript`.
import { expect, test, E2E_TOAST_DURATION_SCALE } from "../../../../../common/tests/ui/support/fixtures";
import { TOAST_DURATION_MS } from "../../../lib/notification-store";
import { NotificationsPage } from "../pages/NotificationsPage";

// Longest severity (alert, 10s) scaled down the same way
// notifications.spec.ts's own toast-auto-dismiss test derives its bound —
// no literal duration hardcoded here.
const maxScaledMs = Math.round(TOAST_DURATION_MS.alert * E2E_TOAST_DURATION_SCALE);

test.describe("Notifications harness: mounts standalone with seeded fixture props", () => {
  test("a fresh mount injects toasts and shows the unread badge — no kernel required", async ({ page }) => {
    const notifications = new NotificationsPage(page);
    await notifications.openHarness();

    await expect(notifications.bell).toBeVisible();
    await expect(notifications.bell).toHaveAttribute("data-unread-count", "2");
    await expect(notifications.toasts).toHaveCount(2);
  });

  test("`n` opens the panel via the harness's own keydown routing; `n` again closes it", async ({ page }) => {
    const notifications = new NotificationsPage(page);
    await notifications.openHarness();

    await expect(notifications.panel).toHaveCount(0);
    await notifications.toggleViaKey();
    await expect(notifications.panel).toBeVisible();
    await notifications.toggleViaKey();
    await expect(notifications.panel).toHaveCount(0);
  });

  test("both toasts auto-dismiss on their own", async ({ page }) => {
    const notifications = new NotificationsPage(page);
    await notifications.openHarness();

    await expect(notifications.toasts).toHaveCount(2);
    await expect(notifications.toasts).toHaveCount(0, { timeout: maxScaledMs + 2000 });
  });

  test("no Terminal kernel chrome mounts alongside it (no status bar, no window switching)", async ({ page }) => {
    const notifications = new NotificationsPage(page);
    await notifications.openHarness();
    await expect(notifications.statusBar.windows).toHaveCount(0);
  });
});
