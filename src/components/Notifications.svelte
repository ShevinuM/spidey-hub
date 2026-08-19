<script lang="ts">
  // Signal-inbox bell/panel/toast layer (Mockup B — "SpideyHub Notifications
  // .dc.html"). The bell/panel/toasts are dashboard-only: every element
  // below is gated behind `view === "home"`, but the component stays
  // mounted regardless of view so its internal state (open panel, queued
  // toasts) survives a view switch away and back rather than resetting.
  //
  // State lives in localStorage (`NOTIFICATIONS_STORAGE_KEY`,
  // src/lib/notificationStore.ts) — this component owns the ONE `$state`
  // array wrapping that module's pure transitions; every mutation re-derives
  // through `mutate()` below and persists immediately.
  //
  // Two deliberate deviations from the mockup: a third per-row action (mark
  // as spam, since real persistence needs a way to move an item into
  // web·trap); the footer hint drops the mockup's unwired "x dismiss" (this
  // build's dismissal is a per-row button, not a bare key).
  import { onDestroy, onMount } from "svelte";
  import type { NotificationsData } from "../lib/data";
  import type { ViewId } from "../lib/views";
  import {
    agoLabel,
    alertItems,
    buildFixtureState,
    dismiss,
    folderItems,
    injectVisit,
    loadState,
    markAllRead,
    markSpam,
    remainingOnHold,
    resolveInjectRand,
    resolveToastDurationScale,
    saveState,
    SEVERITY_META,
    toastDurationMs,
    toggleRead,
    TOAST_HOVER_MIN_REMAINDER_MS,
    TOAST_STACK_CAP,
    unreadInboxCount,
    type NotificationFolder,
    type NotificationItem,
    type NotificationState,
  } from "../lib/notificationStore";
  import { STATUS_BAR_HEIGHT_PX } from "../lib/layout";

  interface Props {
    notifications: NotificationsData;
    view: ViewId;
    /** Server-computed PORTFOLIO_FIXTURES flag (Terminal.svelte's own prop
     * comment) — a fixed, hand-authored state with no localStorage, no
     * per-visit injection, no toasts, and every infinite CSS animation
     * disabled, for deterministic golden capture. */
    fixtureMode: boolean;
  }

  const { notifications, view, fixtureMode }: Props = $props();

  const ui = $derived(notifications.ui);

  type Tab = "inbox" | "alerts" | "archive" | "spam";

  let open = $state(false);
  let tab = $state<Tab>("inbox");
  let items = $state<NotificationItem[]>([]);
  let nowTick = $state(Date.now());

  interface ToastVM {
    id: string;
    sev: NotificationItem["sev"];
    title: string;
    body: string;
    src: string;
    durationMs: number;
  }

  let toasts = $state<ToastVM[]>([]);

  // Timer bookkeeping is deliberately NOT `$state` — consulted on
  // hover/timeout callbacks, never rendered through the template, same
  // non-reactive-Map convention PaneTree.svelte's `refs` registry uses.
  const timers = new Map<string, { handle: ReturnType<typeof setTimeout> | undefined; endAt: number; remaining?: number }>();

  function mutate(fn: (s: NotificationState) => NotificationState) {
    const next = fn({ items });
    items = next.items;
    if (!fixtureMode) saveState(next);
  }

  function spawnToast(item: NotificationItem) {
    const scale = resolveToastDurationScale();
    const durationMs = toastDurationMs(item.sev, scale);
    toasts = [...toasts, { id: item.id, sev: item.sev, title: item.title, body: item.body, src: item.src, durationMs }].slice(
      -TOAST_STACK_CAP,
    );
  }

  function armTimer(id: string, ms: number) {
    const endAt = Date.now() + ms;
    const handle = setTimeout(() => dismissToast(id), ms);
    timers.set(id, { handle, endAt });
  }

  function dismissToast(id: string) {
    const t = timers.get(id);
    if (t?.handle !== undefined) clearTimeout(t.handle);
    timers.delete(id);
    toasts = toasts.filter((t) => t.id !== id);
  }

  function holdToast(id: string) {
    const t = timers.get(id);
    if (!t || t.handle === undefined) return;
    clearTimeout(t.handle);
    const remaining = remainingOnHold(t.endAt, Date.now());
    timers.set(id, { handle: undefined, endAt: t.endAt, remaining });
  }

  function releaseToast(id: string) {
    const t = timers.get(id);
    if (!t) return;
    const ms = t.remaining ?? TOAST_HOVER_MIN_REMAINDER_MS;
    armTimer(id, ms);
  }

  // Timers only ARM once a toast is actually visible (view === "home") —
  // same "don't count down a toast the visitor never had a chance to see"
  // reasoning the old Toasts.svelte's own armed-effect documented. A toast
  // injected while browsing Builds, say, keeps its full duration until the
  // visitor actually reaches the dashboard.
  $effect(() => {
    if (view !== "home" || fixtureMode) return;
    for (const t of toasts) {
      if (!timers.has(t.id)) armTimer(t.id, t.durationMs);
    }
  });

  let tickInterval: ReturnType<typeof setInterval> | undefined;

  $effect(() => {
    if (!open) return;
    tickInterval = setInterval(() => {
      nowTick = Date.now();
    }, 15000);
    return () => clearInterval(tickInterval);
  });

  onMount(() => {
    if (fixtureMode) {
      items = buildFixtureState(Date.now()).items;
      return;
    }
    const loaded = loadState();
    const rand = resolveInjectRand();
    const { state: next, injected } = injectVisit(loaded, notifications.pool, Date.now(), rand);
    items = next.items;
    saveState(next);
    for (const it of injected) spawnToast(it);
  });

  onDestroy(() => {
    for (const t of timers.values()) if (t.handle !== undefined) clearTimeout(t.handle);
  });

  // ---------------------------------------------------------------------
  // Derived read models
  // ---------------------------------------------------------------------

  const inboxItems = $derived(folderItems({ items }, "inbox"));
  const archiveItems = $derived(folderItems({ items }, "archive"));
  const spamItems = $derived(folderItems({ items }, "spam"));
  const alertsInInbox = $derived(alertItems({ items }));
  const unreadCount = $derived(unreadInboxCount({ items }));
  const hasUnread = $derived(unreadCount > 0);

  const activeItems = $derived.by((): NotificationItem[] => {
    if (tab === "alerts") return alertsInInbox;
    if (tab === "archive") return archiveItems;
    if (tab === "spam") return spamItems;
    return inboxItems;
  });

  interface RowVM {
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

  /** Keys the dismiss affordance off the item's actual folder (not the
   * active tab): the alerts tab is a derived filter of inbox, so a TAB-keyed
   * affordance would disagree with `dismissItem()`'s own folder-keyed
   * transition for items shown there. */
  function dismissAffordance(folder: NotificationFolder): { glyph: string; title: string } {
    if (folder === "inbox") return { glyph: ui.dismissGlyphArchive, title: ui.dismissTitleArchive };
    return { glyph: ui.dismissGlyphDelete, title: ui.dismissTitleDelete };
  }

  const rows = $derived(
    activeItems.map((i): RowVM => {
      const meta = SEVERITY_META[i.sev];
      const dismissAff = dismissAffordance(i.folder);
      return {
        id: i.id,
        sev: i.sev,
        color: meta.color,
        glyph: meta.glyph,
        sevLabel: meta.label,
        title: i.title,
        body: i.body,
        src: i.src,
        ago: agoLabel(i.ts, nowTick),
        bar: i.read ? "rgba(255,255,255,.06)" : meta.color,
        rowBg: i.read ? "transparent" : "rgba(255,255,255,.022)",
        dim: i.read ? 0.62 : 1,
        titleWeight: i.read ? 400 : 700,
        readGlyph: i.read ? "○" : "●",
        readTitle: i.read ? ui.readTitleMarkUnread : ui.readTitleMarkRead,
        dismissGlyph: dismissAff.glyph,
        dismissTitle: dismissAff.title,
        showSpamAction: i.folder !== "spam",
      };
    }),
  );

  const tabDefs = $derived(
    (
      [
        ["inbox", ui.tabs.inbox, inboxItems.length],
        ["alerts", ui.tabs.alerts, alertsInInbox.length],
        ["archive", ui.tabs.archive, archiveItems.length],
        ["spam", ui.tabs.spam, spamItems.length],
      ] as [Tab, string, number][]
    ).map(([id, label, count]) => ({ id, label, count })),
  );

  const emptyLine = $derived(ui.empty[tab]);

  const feedStatus = $derived(hasUnread ? ui.feedStatusUnread.replace("{n}", String(unreadCount)) : ui.feedStatusClear);
  const unreadBadge = $derived(unreadCount > 99 ? "99+" : String(unreadCount));

  function togglePanel() {
    open = !open;
  }

  export function close(): void {
    open = false;
  }

  export function handleKey(e: KeyboardEvent): boolean {
    if (e.key === "Escape") {
      if (!open) return false;
      open = false;
      return true;
    }
    if (e.key === "n" || e.key === "N") {
      open = !open;
      return true;
    }
    return false;
  }
</script>

{#if view === "home"}
<div style="position:fixed;top:14px;right:16px;z-index:60;display:flex;align-items:center;gap:10px">
  {#if hasUnread}
    <div style="font:500 10px/1 'JetBrains Mono',monospace;letter-spacing:.14em;color:#ff5c66;text-transform:uppercase;opacity:.85">
      inbox
    </div>
  {/if}
  <button
    class="eh-bell"
    data-testid="notifications-bell"
    data-unread-count={unreadCount}
    onclick={togglePanel}
    title={ui.bellTitle}
    style="position:relative;width:44px;height:44px;display:grid;place-items:center;border-radius:0;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.6),0 8px 24px rgba(0,0,0,.6)"
  >
    {#if hasUnread}
      <span
        style="position:absolute;inset:-1px;border:1px solid rgba(255,92,102,.7);pointer-events:none;animation:{fixtureMode
          ? 'none'
          : 'senseRing 1.9s ease-out infinite'}"
      ></span>
    {/if}
    <span style="font-size:17px;line-height:1;color:#ff5c66;text-shadow:0 0 12px rgba(255,92,102,.7)">✉</span>
    {#if hasUnread}
      <span
        style="position:absolute;top:-7px;right:-7px;min-width:18px;height:18px;padding:0 4px;display:grid;place-items:center;background:#e5484d;color:#0a0a0a;font:800 10px/1 'JetBrains Mono',monospace;box-shadow:0 0 14px rgba(229,72,77,.8)"
        >{unreadBadge}</span
      >
    {/if}
  </button>
</div>

{#if open}
  <div
    data-testid="notifications-panel"
    style="position:fixed;top:66px;right:16px;z-index:70;width:452px;max-height:calc(100vh - 130px);display:flex;flex-direction:column;background:rgba(9,10,13,.94);backdrop-filter:blur(16px) saturate(1.15);border:1px solid rgba(229,72,77,.4);box-shadow:0 0 0 1px rgba(0,0,0,.7),0 26px 70px rgba(0,0,0,.75),0 0 60px rgba(229,72,77,.10);animation:panelIn .18s cubic-bezier(.2,.9,.3,1) both"
  >
    <div
      style="position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px 9px 12px;border-bottom:1px solid rgba(229,72,77,.28);background:linear-gradient(180deg,rgba(229,72,77,.10),rgba(229,72,77,.02)),repeating-linear-gradient(45deg,rgba(255,255,255,.028) 0 1px,transparent 1px 9px),repeating-linear-gradient(-45deg,rgba(255,255,255,.028) 0 1px,transparent 1px 9px);overflow:hidden"
    >
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        <span style="display:inline-block;padding:2px 6px;background:#e5484d;color:#0a0a0a;font:800 10px/1.4 'JetBrains Mono',monospace;letter-spacing:.06em"
          >{ui.badge}</span
        >
        <span style="font:700 11px/1.4 'JetBrains Mono',monospace;letter-spacing:.16em;color:#ffd9db;text-transform:uppercase">{ui.title}</span>
        <span style="font:400 10px/1.4 'JetBrains Mono',monospace;color:rgba(255,255,255,.32)">{ui.version}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font:400 10px/1.4 'JetBrains Mono',monospace;color:#4fd1c5;opacity:.75">{feedStatus}</span>
        <button
          class="eh-close"
          data-testid="notifications-close"
          onclick={togglePanel}
          style="width:20px;height:20px;display:grid;place-items:center;background:transparent;font:700 10px/1 'JetBrains Mono',monospace;cursor:pointer"
          >{ui.closeGlyph}</button
        >
      </div>
      <span
        style="position:absolute;left:0;bottom:0;width:34%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,92,102,.85),transparent);pointer-events:none;animation:{fixtureMode
          ? 'none'
          : 'sweep 3.6s linear infinite'}"
      ></span>
    </div>

    <div style="display:flex;align-items:stretch;gap:1px;padding:6px 8px 0;background:rgba(255,255,255,.015)">
      {#each tabDefs as t (t.id)}
        <button
          class="eh-tab"
          data-testid="notifications-tab"
          data-tab={t.id}
          data-active={tab === t.id}
          onclick={() => (tab = t.id)}
          style="flex:1;padding:6px 4px;background:{tab === t.id
            ? '#e5484d'
            : 'rgba(255,255,255,.03)'};color:{tab === t.id
            ? '#0a0a0a'
            : 'rgba(255,255,255,.45)'};border:1px solid {tab === t.id
            ? '#e5484d'
            : 'rgba(255,255,255,.10)'};border-bottom:none;font:700 9.5px/1.3 'JetBrains Mono',monospace;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px"
        >
          <span>{t.label}</span>
          <span style="opacity:.75;font-weight:400">{t.count}</span>
        </button>
      {/each}
    </div>

    <div style="flex:1;min-height:120px;overflow-y:auto;border-top:1px solid rgba(255,255,255,.08)">
      {#if tab === "spam"}
        <div
          style="display:flex;align-items:center;gap:8px;padding:7px 12px;background:rgba(232,176,75,.07);border-bottom:1px solid rgba(232,176,75,.18);font:400 10px/1.4 'JetBrains Mono',monospace;color:#e8b04b"
        >
          <span>⌗</span><span>{ui.spamBanner}</span>
        </div>
      {/if}
      {#each rows as r (r.id)}
        <div
          class="eh-row"
          data-testid="notification-row"
          data-severity={r.sev}
          data-notification-id={r.id}
          style="position:relative;display:flex;align-items:stretch;border-bottom:1px solid rgba(255,255,255,.05);--row-bg:{r.rowBg}"
        >
          <div style="width:2px;background:{r.bar}"></div>
          <div style="width:26px;display:flex;align-items:flex-start;justify-content:center;padding-top:11px;font:700 10px/1 'JetBrains Mono',monospace;color:{r.color};opacity:{r.dim}">
            {r.glyph}
          </div>
          <div style="flex:1;min-width:0;padding:9px 8px 10px 0;display:flex;flex-direction:column;gap:3px;opacity:{r.dim}">
            <div style="display:flex;align-items:center;gap:7px">
              <span style="padding:1px 5px;border:1px solid {r.color};color:{r.color};font:700 8.5px/1.5 'JetBrains Mono',monospace;letter-spacing:.1em"
                >{r.sevLabel}</span
              >
              <span style="font:{r.titleWeight} 12px/1.35 'JetBrains Mono',monospace;color:#eef1f3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                >{r.title}</span
              >
            </div>
            <div style="font:400 10.5px/1.5 'JetBrains Mono',monospace;color:rgba(230,232,234,.55);text-wrap:pretty">{r.body}</div>
            <div style="display:flex;align-items:center;gap:8px;font:400 9.5px/1.4 'JetBrains Mono',monospace;color:rgba(255,255,255,.3)">
              <span>{r.src}</span><span>·</span><span>{r.ago}</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;justify-content:center;gap:4px;padding:0 8px 0 4px">
            <button
              class="eh-toggle-read"
              data-testid="notification-toggle-read"
              onclick={() => mutate((s) => toggleRead(s, r.id))}
              title={r.readTitle}
              style="width:22px;height:22px;display:grid;place-items:center;background:transparent;color:{r.color};font:700 10px/1 'JetBrains Mono',monospace;cursor:pointer"
              >{r.readGlyph}</button
            >
            {#if r.showSpamAction}
              <button
                class="eh-mark-spam"
                data-testid="notification-mark-spam"
                onclick={() => mutate((s) => markSpam(s, r.id))}
                title={ui.spamActionTitle}
                style="width:22px;height:22px;display:grid;place-items:center;background:transparent;color:#e8b04b;font:700 10px/1 'JetBrains Mono',monospace;cursor:pointer"
                >{ui.spamActionGlyph}</button
              >
            {/if}
            <button
              class="eh-dismiss"
              data-testid="notification-dismiss"
              onclick={() => mutate((s) => dismiss(s, r.id))}
              title={r.dismissTitle}
              style="width:22px;height:22px;display:grid;place-items:center;background:transparent;font:700 10px/1 'JetBrains Mono',monospace;cursor:pointer"
              >{r.dismissGlyph}</button
            >
          </div>
        </div>
      {/each}
      {#if rows.length === 0}
        <div data-testid="notifications-empty" style="padding:38px 16px;display:flex;flex-direction:column;align-items:center;gap:7px;text-align:center">
          <span style="font-size:18px;opacity:.35">{ui.emptyGlyph}</span>
          <span style="font:400 11px/1.5 'JetBrains Mono',monospace;color:rgba(255,255,255,.35)">{emptyLine}</span>
        </div>
      {/if}
    </div>

    <div
      style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-top:1px solid rgba(229,72,77,.24);background:rgba(229,72,77,.05)"
    >
      <div style="display:flex;align-items:center;gap:9px;font:400 9.5px/1.4 'JetBrains Mono',monospace;color:rgba(255,255,255,.34)">
        {#each ui.footerHints as hint (hint.key)}
          <span><span style="color:#4fd1c5">{hint.key}</span> {hint.label}</span>
        {/each}
      </div>
      <button
        class="eh-mark-all-read"
        data-testid="notifications-mark-all-read"
        onclick={() => mutate((s) => markAllRead(s))}
        style="padding:4px 9px;border:1px solid rgba(79,209,197,.4);font:700 9.5px/1.3 'JetBrains Mono',monospace;letter-spacing:.1em;text-transform:uppercase;cursor:pointer"
        >{ui.markAllRead}</button
      >
    </div>
  </div>
{/if}

  <div
    style="position:fixed;right:16px;bottom:{STATUS_BAR_HEIGHT_PX +
      18}px;z-index:50;width:392px;display:flex;flex-direction:column-reverse;gap:9px;pointer-events:none"
  >
    {#each toasts as t (t.id)}
      {@const meta = SEVERITY_META[t.sev]}
      <div
        data-testid="toast"
        data-severity={t.sev}
        data-toast-id={t.id}
        class="eh-toast"
        role="status"
        onmouseenter={() => holdToast(t.id)}
        onmouseleave={() => releaseToast(t.id)}
        style="position:relative;pointer-events:auto;background:rgba(10,11,14,.95);border:1px solid {meta.color};box-shadow:0 0 0 1px rgba(0,0,0,.65),0 12px 34px rgba(0,0,0,.6),0 0 26px {meta.glow};animation:toastIn .34s cubic-bezier(.2,1.35,.4,1) both"
      >
        <span
          style="position:absolute;left:26px;top:-13px;width:1px;height:13px;transform-origin:top;background:linear-gradient(180deg,rgba(255,255,255,0),{meta.color});animation:strand .3s ease both"
        ></span>
        <div style="display:flex;align-items:stretch">
          <div style="width:26px;display:grid;place-items:center;background:{meta.color};color:#0a0a0a;font:800 11px/1 'JetBrains Mono',monospace">
            {meta.glyph}
          </div>
          <div style="flex:1;min-width:0;padding:8px 9px 8px 10px;display:flex;flex-direction:column;gap:3px">
            <div style="display:flex;align-items:center;gap:7px">
              <span style="font:800 9px/1.4 'JetBrains Mono',monospace;letter-spacing:.14em;color:{meta.color}">{meta.label}</span>
              <span style="font:400 9px/1.4 'JetBrains Mono',monospace;color:rgba(255,255,255,.3)">{t.src}</span>
            </div>
            <div style="font:700 12px/1.4 'JetBrains Mono',monospace;color:#eef1f3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{t.title}</div>
            <div style="font:400 10.5px/1.45 'JetBrains Mono',monospace;color:rgba(230,232,234,.5);text-wrap:pretty">{t.body}</div>
          </div>
        </div>
        <div style="height:2px;background:rgba(255,255,255,.06)">
          <div
            class="eh-toast-drain"
            style="height:2px;background:{meta.color};box-shadow:0 0 10px {meta.color};--drain-ms:{t.durationMs}ms"
          ></div>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  @keyframes toastIn {
    from {
      opacity: 0;
      transform: translateY(-18px) scaleY(0.9);
    }
    60% {
      opacity: 1;
      transform: translateY(3px) scaleY(1);
    }
    to {
      opacity: 1;
      transform: translateY(0) scaleY(1);
    }
  }
  @keyframes strand {
    from {
      transform: scaleY(0);
    }
    to {
      transform: scaleY(1);
    }
  }
  @keyframes drain {
    from {
      width: 100%;
    }
    to {
      width: 0%;
    }
  }
  @keyframes senseRing {
    0% {
      transform: scale(0.7);
      opacity: 0.85;
    }
    100% {
      transform: scale(2.1);
      opacity: 0;
    }
  }
  @keyframes panelIn {
    from {
      opacity: 0;
      transform: translateY(-10px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  @keyframes sweep {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(220%);
    }
  }
  /* Base declarations for properties a :hover rule below also sets are kept
     out of each element's inline `style` on purpose — an inline style
     declaration always wins the cascade over a stylesheet rule for the same
     property (short of `!important`), so a hover rule can only ever take
     effect on a property the inline style never touches. This mirrors the
     row/tab hover convention already used in Builds.svelte, Dashboard.svelte
     and Personnel.svelte. */
  .eh-bell {
    background: rgba(13, 15, 18, 0.85);
    border: 1px solid rgba(229, 72, 77, 0.45);
  }
  .eh-bell:hover {
    border-color: #ff5c66;
    background: rgba(24, 12, 14, 0.95);
  }
  .eh-tab:hover {
    filter: brightness(1.25);
  }
  .eh-row {
    background: var(--row-bg);
  }
  .eh-row:hover {
    background: rgba(255, 255, 255, 0.045);
  }
  .eh-close {
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.55);
  }
  .eh-close:hover {
    border-color: #e5484d;
    color: #ff5c66;
  }
  .eh-toggle-read {
    border: 1px solid rgba(255, 255, 255, 0.12);
    opacity: 0.55;
  }
  .eh-toggle-read:hover {
    opacity: 1;
    border-color: rgba(255, 255, 255, 0.4);
  }
  .eh-mark-spam {
    border: 1px solid rgba(255, 255, 255, 0.12);
    opacity: 0.55;
  }
  .eh-mark-spam:hover {
    opacity: 1;
    border-color: rgba(255, 255, 255, 0.4);
  }
  .eh-dismiss {
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.6);
    opacity: 0.55;
  }
  .eh-dismiss:hover {
    opacity: 1;
    border-color: #e5484d;
    color: #ff5c66;
  }
  .eh-mark-all-read {
    background: transparent;
    color: #4fd1c5;
  }
  .eh-mark-all-read:hover {
    background: #4fd1c5;
    color: #06110f;
  }
  .eh-toast-drain {
    animation: drain var(--drain-ms) linear forwards;
  }
  .eh-toast:hover .eh-toast-drain {
    animation-play-state: paused;
  }
</style>
