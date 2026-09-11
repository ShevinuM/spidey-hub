<script lang="ts">
  import type { NotificationsState } from "./notificationsState.svelte";

  interface Props {
    state: NotificationsState;
  }

  const { state }: Props = $props();
</script>

<div style="position:fixed;top:14px;right:16px;z-index:60;display:flex;align-items:center;gap:10px">
  {#if state.hasUnread}
    <div style="font:500 10px/1 'JetBrains Mono',monospace;letter-spacing:.14em;color:#ff5c66;text-transform:uppercase;opacity:.85">
      inbox
    </div>
  {/if}
  <button
    class="eh-bell"
    data-testid="notifications-bell"
    data-unread-count={state.unreadCount}
    onclick={() => state.togglePanel()}
    title={state.ui.bellTitle}
    style="position:relative;width:44px;height:44px;display:grid;place-items:center;border-radius:0;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.6),0 8px 24px rgba(0,0,0,.6)"
  >
    {#if state.hasUnread}
      <span
        data-testid="notifications-sense-ring"
        style="position:absolute;inset:-1px;border:1px solid rgba(255,92,102,.7);pointer-events:none;animation:senseRing 1.9s ease-out infinite"
      ></span>
    {/if}
    <span style="font-size:17px;line-height:1;color:#ff5c66;text-shadow:0 0 12px rgba(255,92,102,.7)">✉</span>
    {#if state.hasUnread}
      <span
        style="position:absolute;top:-7px;right:-7px;min-width:18px;height:18px;padding:0 4px;display:grid;place-items:center;background:#e5484d;color:#0a0a0a;font:800 10px/1 'JetBrains Mono',monospace;box-shadow:0 0 14px rgba(229,72,77,.8)"
        >{state.unreadBadge}</span
      >
    {/if}
  </button>
</div>

<style>
  /* -global- keeps this keyframe resolvable from the inline `animation:`
     reference above: Svelte scopes a plain `@keyframes` declared in a
     component <style> block by renaming it, but never rewrites an
     `animation:` value written in markup, so the inline reference would
     otherwise point at a name that no longer exists. */
  @keyframes -global-senseRing {
    0% {
      transform: scale(0.7);
      opacity: 0.85;
    }
    100% {
      transform: scale(2.1);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    [data-testid="notifications-sense-ring"] {
      animation: none !important;
    }
  }
  /* Base declarations for properties a :hover rule below also sets are kept
     out of each element's inline `style` on purpose — an inline style
     declaration always wins the cascade over a stylesheet rule for the same
     property (short of `!important`), so a hover rule can only ever take
     effect on a property the inline style never touches. This mirrors the
     row/tab hover convention already used in Repositories.svelte, Dashboard.svelte
     and EmploymentRecords.svelte. */
  .eh-bell {
    background: rgba(13, 15, 18, 0.85);
    border: 1px solid rgba(229, 72, 77, 0.45);
  }
  .eh-bell:hover {
    border-color: #ff5c66;
    background: rgba(24, 12, 14, 0.95);
  }
</style>
