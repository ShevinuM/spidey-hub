<script lang="ts">
  // Dashboard-only notification overlay (design/Homepage.dc.html lines
  // 120-141 originally; PLAN.md Iteration 4 item 12 rewrote the PRESENTATION
  // to be tmux `display-message`-faithful: a fixed overlay anchored just
  // above the status bar, right-aligned, stacked upward, one-line
  // amber-background strips with dark mono text, no manual dismiss — real
  // tmux messages auto-expire, they are never clicked away).
  //
  // Dismissal state (offToast0/offToast1) is still owned by Terminal.svelte
  // for the whole session, not by this component — Toasts stays mounted
  // across every view switch, and local $state would forget the dismissal
  // and resurrect the toast on the next visit (see Component.state in the
  // prototype: offDanger/offInfo lived at the top level for the same
  // reason). Item 12 just changes WHO calls onHideToast0/onHideToast1 (an
  // internal auto-dismiss timer instead of a click handler) — the props
  // contract Terminal.svelte mounts this with is untouched.
  //
  // Content is a seeded 2-of-pool pick (Locked decision #12) instead of 2
  // fixed toasts: on mount, pick() below draws 2 DISTINCT entries from the
  // >=48-entry src/data/notifications.yaml pool via mulberry32
  // (src/lib/notifications.ts), seeded from Date.now() in prod or
  // sessionStorage's edith:toast-seed key (test fixtures). The pick
  // deliberately happens in onMount, not a $state initializer or top-level
  // computation: this component is SSR'd (Astro prerenders the "home"
  // route), and picking eagerly would bake a build-time Date.now() pick
  // into the static HTML that then mismatches the client's real hydration
  // pick. onMount is client-only, so SSR renders no toasts and the real
  // pair appears once hydration runs — gotoReady()'s wait for
  // data-terminal-ready already accounts for that same hydration gap.
  import type { DashboardData, NotificationEntry, NotificationsData } from "../lib/data";
  import type { ViewId } from "../lib/views";
  import { onDestroy, onMount } from "svelte";
  import { pickToastPair, resolveToastSeed, TOAST_AUTO_DISMISS_MS } from "../lib/notifications";
  import { STATUS_BAR_HEIGHT_PX } from "../lib/layout";

  interface Props {
    // `toasts` (the old closeIcon glyph) is unused now that item 12 removed
    // the manual ✕ dismiss button, but stays in the prop contract so
    // Terminal.svelte's mount call site (owned by a different executor's
    // region this wave) needs no edit.
    toasts: DashboardData["toasts"];
    notifications: NotificationsData;
    view: ViewId;
    offToast0: boolean;
    offToast1: boolean;
    onHideToast0: () => void;
    onHideToast1: () => void;
  }

  const { notifications, view, offToast0, offToast1, onHideToast0, onHideToast1 }: Props = $props();

  let pair = $state<[NotificationEntry, NotificationEntry] | null>(null);

  onMount(() => {
    pair = pickToastPair(notifications.pool, resolveToastSeed());
  });

  const alertsVisible = $derived(view === "home" && pair !== null && !(offToast0 && offToast1));

  // Auto-dismiss (PLAN.md item 12): arms a SINGLE `setTimeout` the first
  // time the pair actually becomes visible (not a bare `onMount` — this
  // component mounts on every view, not just "home", so an onMount timer
  // could expire before the user ever lands on the dashboard to see it).
  // Plain `setTimeout` (not a rAF loop) is what makes this work under
  // Playwright's `page.clock` fake timers, same contract every other
  // faked-time e2e spec in this repo relies on. Once armed, the timer keeps
  // running even if the user navigates to another view before it fires —
  // real tmux messages expire on their own schedule regardless of what's
  // focused, they don't pause.
  let armed = false;
  let dismissTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (alertsVisible && !armed) {
      armed = true;
      dismissTimer = setTimeout(() => {
        onHideToast0();
        onHideToast1();
      }, TOAST_AUTO_DISMISS_MS);
    }
  });

  onDestroy(() => {
    if (dismissTimer !== undefined) clearTimeout(dismissTimer);
  });

  const TOAST_MARGIN_PX = 10;
</script>

{#if alertsVisible && pair}
  <div
    data-testid="toast-stack"
    style="position:fixed;right:16px;bottom:{STATUS_BAR_HEIGHT_PX +
      TOAST_MARGIN_PX}px;z-index:30;display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:none"
  >
    {#if !offToast0}
      <div
        data-testid="toast-0"
        style="box-sizing:border-box;width:min(420px,calc(100vw - 32px));background:#e8b34d;color:#1a1408;padding:4px 12px;font-size:12px;line-height:1.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600"
      >
        <span style="font-weight:700">{pair[0].icon} {pair[0].badge}:</span>
        {pair[0].text}
      </div>
    {/if}

    {#if !offToast1}
      <div
        data-testid="toast-1"
        style="box-sizing:border-box;width:min(420px,calc(100vw - 32px));background:#e8b34d;color:#1a1408;padding:4px 12px;font-size:12px;line-height:1.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600"
      >
        <span style="font-weight:700">{pair[1].icon} {pair[1].badge}:</span>
        {pair[1].text}
      </div>
    {/if}
  </div>
{/if}
