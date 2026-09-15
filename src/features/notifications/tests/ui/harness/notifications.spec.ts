import {
  expect,
  test,
  E2E_TOAST_DURATION_SCALE,
} from "../../../../../common/tests/ui/support/fixtures";
import { TOAST_DURATION_MS } from "../../../lib/notification-store";
import { NotificationsPage } from "../pages/NotificationsPage";

const maxScaledMs = Math.round(TOAST_DURATION_MS.alert * E2E_TOAST_DURATION_SCALE);

test.describe("Notifications harness: mounts standalone with seeded fixture props", () => {
  test("a fresh mount injects toasts and shows the unread badge — no kernel required", async ({
    page,
  }) => {
    const notifications = new NotificationsPage(page);
    await notifications.openHarness();

    await expect(notifications.bell).toBeVisible();
    await expect(notifications.bell).toHaveAttribute("data-unread-count", "2");
    await expect(notifications.toasts).toHaveCount(2);
  });

  test("`n` opens the panel via the harness's own keydown routing; `n` again closes it", async ({
    page,
  }) => {
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

  test("no Terminal kernel chrome mounts alongside it (no status bar, no window switching)", async ({
    page,
  }) => {
    const notifications = new NotificationsPage(page);
    await notifications.openHarness();
    await expect(notifications.statusBar.windows).toHaveCount(0);
  });
});
