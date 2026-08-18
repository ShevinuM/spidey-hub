<script lang="ts">
  // Dashboard-only toast stack (design/Homepage.dc.html lines 120-141).
  // Dismissal state (offToast0/offToast1) is owned by Terminal.svelte for
  // the whole session, not by this component — Toasts stays mounted across
  // every view switch, and local $state would forget the dismissal and
  // resurrect the toast on the next visit (see Component.state in the
  // prototype: offDanger/offInfo lived at the top level for the same
  // reason; renamed here since the two slots no longer carry fixed
  // danger/tracker content — PLAN.md Iteration 3 Phase 2 item 2.3).
  //
  // Content is now a seeded 2-of-pool pick (Locked decision #12) instead of
  // 2 fixed toasts: on mount, pick() below draws 2 DISTINCT entries from
  // the >=48-entry src/data/notifications.yaml pool via mulberry32
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
  import { onMount } from "svelte";
  import { pickToastPair, resolveToastSeed } from "../lib/notifications";

  interface Props {
    toasts: DashboardData["toasts"];
    notifications: NotificationsData;
    view: ViewId;
    offToast0: boolean;
    offToast1: boolean;
    onHideToast0: () => void;
    onHideToast1: () => void;
  }

  const { toasts, notifications, view, offToast0, offToast1, onHideToast0, onHideToast1 }: Props = $props();

  let pair = $state<[NotificationEntry, NotificationEntry] | null>(null);

  onMount(() => {
    pair = pickToastPair(notifications.pool, resolveToastSeed());
  });

  const alertsVisible = $derived(view === "home" && pair !== null && !(offToast0 && offToast1));
</script>

{#if alertsVisible && pair}
  <div
    style="flex:none;display:flex;flex-direction:column;align-items:stretch;gap:14px;width:min(420px,calc(100% - 44px));margin:clamp(12px,2.5vh,22px) 22px 0 auto"
  >
    {#if !offToast0}
      <div
        data-testid="toast-0"
        style="position:relative;min-width:0;box-sizing:border-box;border:1.5px solid #e5484d;border-radius:9px;background:rgba(11,16,22,.92);padding:14px 34px 12px 20px"
      >
        <div
          style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;background:#0b0f14;padding:0 10px;font-size:14px;color:#e5484d"
        >
          <span
            style="width:16px;height:16px;border-radius:50%;background:#e5484d;color:#0b0f14;font-size:11px;display:flex;align-items:center;justify-content:center;font-weight:700"
            >{pair[0].icon}</span
          >{pair[0].badge}
        </div>
        <span
          onclick={onHideToast0}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") onHideToast0();
          }}
          role="button"
          tabindex="0"
          data-testid="toast-0-dismiss"
          class="toast-close toast-close--danger"
          style="position:absolute;top:8px;right:10px;cursor:pointer;font-size:12px;line-height:1"
          >{toasts.closeIcon}</span
        >
        <div style="font-size:14px;line-height:1.5;color:#e8e0dc">{pair[0].text}</div>
      </div>
    {/if}

    {#if !offToast1}
      <div
        data-testid="toast-1"
        style="position:relative;min-width:0;box-sizing:border-box;border:1.5px solid #4a9fe0;border-radius:9px;background:rgba(11,16,22,.92);padding:14px 34px 12px 20px"
      >
        <div
          style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;background:#0b0f14;padding:0 10px;font-size:14px;color:#4a9fe0"
        >
          <span
            style="width:16px;height:16px;border-radius:50%;background:#4a9fe0;color:#0b0f14;font-size:11px;display:flex;align-items:center;justify-content:center;font-weight:700"
            >{pair[1].icon}</span
          >{pair[1].badge}
        </div>
        <span
          onclick={onHideToast1}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") onHideToast1();
          }}
          role="button"
          tabindex="0"
          data-testid="toast-1-dismiss"
          class="toast-close toast-close--info"
          style="position:absolute;top:8px;right:10px;cursor:pointer;font-size:12px;line-height:1"
          >{toasts.closeIcon}</span
        >
        <div style="font-size:14px;line-height:1.5;color:#cfd8de">{pair[1].text}</div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .toast-close--danger {
    color: rgba(232, 224, 220, 0.45);
  }
  .toast-close--danger:hover {
    color: #ff6b6f;
  }
  .toast-close--info {
    color: rgba(207, 216, 222, 0.45);
  }
  .toast-close--info:hover {
    color: #8fc7f0;
  }
</style>
