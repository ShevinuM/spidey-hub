<script lang="ts">
  // Dashboard-only toast stack (design/Homepage.dc.html lines 120-141).
  // Dismissal state (offDanger/offInfo) is owned by Terminal.svelte for the
  // whole session, not by this component — Toasts unmounts whenever the
  // view leaves "home", and local $state would forget the dismissal and
  // resurrect the toast on the next visit (see Component.state in the
  // prototype: offDanger/offInfo live at the top level for the same
  // reason).
  import type { DashboardData } from "../lib/data";
  import type { ViewId } from "../lib/views";

  interface Props {
    toasts: DashboardData["toasts"];
    view: ViewId;
    offDanger: boolean;
    offInfo: boolean;
    onHideDanger: () => void;
    onHideInfo: () => void;
  }

  const { toasts, view, offDanger, offInfo, onHideDanger, onHideInfo }: Props = $props();

  const alertsVisible = $derived(view === "home" && !(offDanger && offInfo));
</script>

{#if alertsVisible}
  <div
    style="flex:none;display:flex;flex-direction:column;align-items:stretch;gap:14px;width:min(420px,calc(100% - 44px));margin:clamp(12px,2.5vh,22px) 22px 0 auto"
  >
    {#if !offDanger}
      <div
        data-testid="toast-danger"
        style="position:relative;min-width:0;box-sizing:border-box;border:1.5px solid #e5484d;border-radius:9px;background:rgba(11,16,22,.92);padding:14px 34px 12px 20px"
      >
        <div
          style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;background:#0b0f14;padding:0 10px;font-size:14px;color:#e5484d"
        >
          <span
            style="width:16px;height:16px;border-radius:50%;background:#e5484d;color:#0b0f14;font-size:11px;display:flex;align-items:center;justify-content:center;font-weight:700"
            >{toasts.danger.icon}</span
          >{toasts.danger.badge}
        </div>
        <span
          onclick={onHideDanger}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") onHideDanger();
          }}
          role="button"
          tabindex="0"
          data-testid="toast-danger-dismiss"
          class="toast-close toast-close--danger"
          style="position:absolute;top:8px;right:10px;cursor:pointer;font-size:12px;line-height:1"
          >{toasts.closeIcon}</span
        >
        <div style="font-size:14px;line-height:1.5;color:#e8e0dc">
          {toasts.danger.prefix}<span style="color:#ff6b6f;font-weight:700">{toasts.danger.emphasis}</span
          >{toasts.danger.suffix}
        </div>
      </div>
    {/if}

    {#if !offInfo}
      <div
        data-testid="toast-tracker"
        style="position:relative;min-width:0;box-sizing:border-box;border:1.5px solid #4a9fe0;border-radius:9px;background:rgba(11,16,22,.92);padding:14px 34px 12px 20px"
      >
        <div
          style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;background:#0b0f14;padding:0 10px;font-size:14px;color:#4a9fe0"
        >
          <span
            style="width:16px;height:16px;border-radius:50%;background:#4a9fe0;color:#0b0f14;font-size:11px;display:flex;align-items:center;justify-content:center;font-weight:700"
            >{toasts.tracker.icon}</span
          >{toasts.tracker.badge}
        </div>
        <span
          onclick={onHideInfo}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") onHideInfo();
          }}
          role="button"
          tabindex="0"
          data-testid="toast-tracker-dismiss"
          class="toast-close toast-close--info"
          style="position:absolute;top:8px;right:10px;cursor:pointer;font-size:12px;line-height:1"
          >{toasts.closeIcon}</span
        >
        <div style="font-size:14px;line-height:1.5;color:#cfd8de">
          {toasts.tracker.prefix}<span style="color:#8fc7f0">{toasts.tracker.emphasis}</span
          >{toasts.tracker.suffix}
        </div>
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
