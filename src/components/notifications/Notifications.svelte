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
  import type { NotificationsData } from "../../common/lib/data";
  import type { ViewId } from "../../common/lib/views";
  import { NotificationsState } from "./notificationsState.svelte";
  import NotificationBell from "./NotificationBell.svelte";
  import NotificationsPanel from "./NotificationsPanel.svelte";
  import ToastStack from "./ToastStack.svelte";

  interface Props {
    notifications: NotificationsData;
    view: ViewId;
    /** Server-computed PORTFOLIO_FIXTURES flag (Terminal.svelte's own prop
     * comment) — a fixed, hand-authored state with no localStorage, no
     * per-visit injection, no toasts, and every infinite CSS animation
     * disabled, for deterministic golden capture. */
    fixtureMode: boolean;
    /** Terminal.svelte's `bootRef?.isActive?.()` closure — passed through
     * unchanged to NotificationsState so a toast's dismiss timer never arms
     * while the boot overlay is still hiding it. Optional so a caller with
     * no boot concept (none exists today) gets today's un-gated behavior. */
    bootActive?: () => boolean;
  }

  const { notifications, view, fixtureMode, bootActive }: Props = $props();

  const state = new NotificationsState(
    () => notifications,
    () => view,
    () => fixtureMode,
    bootActive,
  );

  export function close(): void {
    state.open = false;
  }

  export function handleKey(e: KeyboardEvent): boolean {
    if (e.key === "Escape") {
      if (!state.open) return false;
      state.open = false;
      return true;
    }
    if (e.key === "n" || e.key === "N") {
      state.open = !state.open;
      return true;
    }
    return false;
  }
</script>

{#if view === "home"}
<NotificationBell {state} />

{#if state.open}
  <NotificationsPanel {state} />
{/if}

  <ToastStack {state} />
{/if}
