<script lang="ts">
  import type { NotificationsData } from "../../../common/lib/data";
  import type { ViewId } from "../../../common/lib/views";
  import { untrack } from "svelte";
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
    /** Passed straight through, unmodified, to `NotificationsState`'s `bootActiveFn` (see there for the default-fallback behavior). */
    bootActive?: () => boolean;
  }

  const { notifications, view, fixtureMode, bootActive }: Props = $props();

  const state = new NotificationsState(
    () => notifications,
    () => view,
    () => fixtureMode,
    // `bootActive` is already typed `?: () => boolean` — a thunk, not a
    // value. `untrack` documents that it is deliberately captured once
    // rather than re-read; wrapping it as `() => bootActive` would change
    // the type to `() => (() => boolean)` and break the callee.
    untrack(() => bootActive),
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
