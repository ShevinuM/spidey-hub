// NotificationsState — the notifications bell/panel/toast layer's reactive
// core, extracted from Notifications.svelte during the folder+state-class
// relocation refactor. See Notifications.svelte's own header comment for
// the view's behavior; every `$state`/`$derived`/`$effect` here (and its
// accompanying comment) is moved verbatim from the original monolith — no
// reactivity, timing, or behavior change. The keymap itself
// (close/handleKey) stays on Notifications.svelte, the orchestrator — see
// that file's own comment.
import { onDestroy, onMount } from "svelte";
import type { NotificationsData } from "../../lib/data";
import type { ViewId } from "../../lib/views";
import {
  agoLabel,
  alertItems,
  buildFixtureState,
  folderItems,
  injectVisit,
  loadState,
  remainingOnHold,
  resolveInjectRand,
  resolveToastDurationScale,
  saveState,
  SEVERITY_META,
  toastDurationMs,
  TOAST_HOVER_MIN_REMAINDER_MS,
  TOAST_STACK_CAP,
  unreadInboxCount,
  type NotificationFolder,
  type NotificationItem,
  type NotificationState,
} from "../../lib/notificationStore";

export type Tab = "inbox" | "alerts" | "archive" | "spam";

export interface ToastVM {
  id: string;
  sev: NotificationItem["sev"];
  title: string;
  body: string;
  src: string;
  durationMs: number;
}

export interface RowVM {
  id: string;
  sev: NotificationItem["sev"];
  color: string;
  glyph: string;
  sevLabel: string;
  title: string;
  body: string;
  src: string;
  ago: string;
  bar: string;
  rowBg: string;
  dim: number;
  titleWeight: number;
  readGlyph: string;
  readTitle: string;
  dismissGlyph: string;
  dismissTitle: string;
  showSpamAction: boolean;
}

export class NotificationsState {
  constructor(
    private readonly notificationsFn: () => NotificationsData,
    private readonly viewFn: () => ViewId,
    private readonly fixtureModeFn: () => boolean,
  ) {
    // Timers only ARM once a toast is actually visible (view === "home") —
    // same "don't count down a toast the visitor never had a chance to see"
    // reasoning the old Toasts.svelte's own armed-effect documented. A toast
    // injected while browsing Builds, say, keeps its full duration until the
    // visitor actually reaches the dashboard.
    $effect(() => {
      if (this.view !== "home" || this.fixtureMode) return;
      for (const t of this.toasts) {
        if (!this.timers.has(t.id)) this.armTimer(t.id, t.durationMs);
      }
    });

    $effect(() => {
      if (!this.open) return;
      this.tickInterval = setInterval(() => {
        this.nowTick = Date.now();
      }, 15000);
      return () => clearInterval(this.tickInterval);
    });

    onMount(() => {
      if (this.fixtureMode) {
        this.items = buildFixtureState(Date.now()).items;
        return;
      }
      const loaded = loadState();
      const rand = resolveInjectRand();
      const { state: next, injected } = injectVisit(loaded, this.notifications.pool, Date.now(), rand);
      this.items = next.items;
      saveState(next);
      for (const it of injected) this.spawnToast(it);
    });

    onDestroy(() => {
      for (const t of this.timers.values()) if (t.handle !== undefined) clearTimeout(t.handle);
    });
  }

  get notifications(): NotificationsData {
    return this.notificationsFn();
  }
  get view(): ViewId {
    return this.viewFn();
  }
  get fixtureMode(): boolean {
    return this.fixtureModeFn();
  }

  ui = $derived(this.notifications.ui);

  open = $state(false);
  tab = $state<Tab>("inbox");
  items = $state<NotificationItem[]>([]);
  nowTick = $state(Date.now());

  toasts = $state<ToastVM[]>([]);

  // Timer bookkeeping is deliberately NOT `$state` — consulted on
  // hover/timeout callbacks, never rendered through the template, same
  // non-reactive-Map convention PaneTree.svelte's `refs` registry uses.
  timers = new Map<string, { handle: ReturnType<typeof setTimeout> | undefined; endAt: number; remaining?: number }>();

  mutate(fn: (s: NotificationState) => NotificationState) {
    const next = fn({ items: this.items });
    this.items = next.items;
    if (!this.fixtureMode) saveState(next);
  }

  spawnToast(item: NotificationItem) {
    const scale = resolveToastDurationScale();
    const durationMs = toastDurationMs(item.sev, scale);
    this.toasts = [...this.toasts, { id: item.id, sev: item.sev, title: item.title, body: item.body, src: item.src, durationMs }].slice(
      -TOAST_STACK_CAP,
    );
  }

  armTimer(id: string, ms: number) {
    const endAt = Date.now() + ms;
    const handle = setTimeout(() => this.dismissToast(id), ms);
    this.timers.set(id, { handle, endAt });
  }

  dismissToast(id: string) {
    const t = this.timers.get(id);
    if (t?.handle !== undefined) clearTimeout(t.handle);
    this.timers.delete(id);
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  holdToast(id: string) {
    const t = this.timers.get(id);
    if (!t || t.handle === undefined) return;
    clearTimeout(t.handle);
    const remaining = remainingOnHold(t.endAt, Date.now());
    this.timers.set(id, { handle: undefined, endAt: t.endAt, remaining });
  }

  releaseToast(id: string) {
    const t = this.timers.get(id);
    if (!t) return;
    const ms = t.remaining ?? TOAST_HOVER_MIN_REMAINDER_MS;
    this.armTimer(id, ms);
  }

  private tickInterval: ReturnType<typeof setInterval> | undefined;

  // ---------------------------------------------------------------------
  // Derived read models
  // ---------------------------------------------------------------------

  inboxItems = $derived(folderItems({ items: this.items }, "inbox"));
  archiveItems = $derived(folderItems({ items: this.items }, "archive"));
  spamItems = $derived(folderItems({ items: this.items }, "spam"));
  alertsInInbox = $derived(alertItems({ items: this.items }));
  unreadCount = $derived(unreadInboxCount({ items: this.items }));
  hasUnread = $derived(this.unreadCount > 0);

  activeItems = $derived.by((): NotificationItem[] => {
    if (this.tab === "alerts") return this.alertsInInbox;
    if (this.tab === "archive") return this.archiveItems;
    if (this.tab === "spam") return this.spamItems;
    return this.inboxItems;
  });

  /** Keys the dismiss affordance off the item's actual folder (not the
   * active tab): the alerts tab is a derived filter of inbox, so a TAB-keyed
   * affordance would disagree with `dismissItem()`'s own folder-keyed
   * transition for items shown there. */
  dismissAffordance(folder: NotificationFolder): { glyph: string; title: string } {
    if (folder === "inbox") return { glyph: this.ui.dismissGlyphArchive, title: this.ui.dismissTitleArchive };
    return { glyph: this.ui.dismissGlyphDelete, title: this.ui.dismissTitleDelete };
  }

  rows = $derived(
    this.activeItems.map((i): RowVM => {
      const meta = SEVERITY_META[i.sev];
      const dismissAff = this.dismissAffordance(i.folder);
      return {
        id: i.id,
        sev: i.sev,
        color: meta.color,
        glyph: meta.glyph,
        sevLabel: meta.label,
        title: i.title,
        body: i.body,
        src: i.src,
        ago: agoLabel(i.ts, this.nowTick),
        bar: i.read ? "rgba(255,255,255,.06)" : meta.color,
        rowBg: i.read ? "transparent" : "rgba(255,255,255,.022)",
        dim: i.read ? 0.62 : 1,
        titleWeight: i.read ? 400 : 700,
        readGlyph: i.read ? "○" : "●",
        readTitle: i.read ? this.ui.readTitleMarkUnread : this.ui.readTitleMarkRead,
        dismissGlyph: dismissAff.glyph,
        dismissTitle: dismissAff.title,
        showSpamAction: i.folder !== "spam",
      };
    }),
  );

  tabDefs = $derived(
    (
      [
        ["inbox", this.ui.tabs.inbox, this.inboxItems.length],
        ["alerts", this.ui.tabs.alerts, this.alertsInInbox.length],
        ["archive", this.ui.tabs.archive, this.archiveItems.length],
        ["spam", this.ui.tabs.spam, this.spamItems.length],
      ] as [Tab, string, number][]
    ).map(([id, label, count]) => ({ id, label, count })),
  );

  emptyLine = $derived(this.ui.empty[this.tab]);

  feedStatus = $derived(this.hasUnread ? this.ui.feedStatusUnread.replace("{n}", String(this.unreadCount)) : this.ui.feedStatusClear);
  unreadBadge = $derived(this.unreadCount > 99 ? "99+" : String(this.unreadCount));

  togglePanel() {
    this.open = !this.open;
  }
}
