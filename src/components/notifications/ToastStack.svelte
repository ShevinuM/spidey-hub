<script lang="ts">
  import type { NotificationsState } from "./notificationsState.svelte";
  import { SEVERITY_META } from "../../lib/notificationStore";
  import { STATUS_BAR_HEIGHT_PX } from "../../lib/layout";

  interface Props {
    state: NotificationsState;
  }

  const { state }: Props = $props();
</script>

<div
  style="position:fixed;right:16px;bottom:{STATUS_BAR_HEIGHT_PX +
    18}px;z-index:50;width:392px;display:flex;flex-direction:column-reverse;gap:9px;pointer-events:none"
>
  {#each state.toasts as t (t.id)}
    {@const meta = SEVERITY_META[t.sev]}
    <div
      data-testid="toast"
      data-severity={t.sev}
      data-toast-id={t.id}
      class="eh-toast"
      role="status"
      onmouseenter={() => state.holdToast(t.id)}
      onmouseleave={() => state.releaseToast(t.id)}
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
  /* Base declarations for properties a :hover rule below also sets are kept
     out of each element's inline `style` on purpose — an inline style
     declaration always wins the cascade over a stylesheet rule for the same
     property (short of `!important`), so a hover rule can only ever take
     effect on a property the inline style never touches. This mirrors the
     row/tab hover convention already used in Builds.svelte, Dashboard.svelte
     and Personnel.svelte. */
  .eh-toast-drain {
    animation: drain var(--drain-ms) linear forwards;
  }
  .eh-toast:hover .eh-toast-drain {
    animation-play-state: paused;
  }
</style>
