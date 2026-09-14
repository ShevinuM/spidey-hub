<script lang="ts">
  // Home/dashboard card (reference/Homepage.dc.html lines 142-169).
  import type { DashboardData } from "../../../common/lib/data";
  import type { ViewId } from "../../../common/lib/views";
  import { menuIdToView, viewToTmuxBinding } from "../../../common/lib/views";
  import { wordmarkChars } from "../lib/wordmark";

  interface Props {
    dashboard: DashboardData;
    /** Whether this mounted instance is the window's focused pane — gates `data-copy-source` so `Ctrl-b [`'s untargeted `document.querySelector` only ever matches the focused instance, never a non-focused sibling when multiple dashboard panes are mounted. */
    isFocused: boolean;
    /** See `windowNumberById` on `TerminalState` (src/bootstrap/terminalState.svelte.ts). */
    windowNumbers: Record<string, number>;
    /** See `totalPaneCount` on `TerminalState` (src/bootstrap/terminalState.svelte.ts). */
    paneCount: number;
    onSelect: (view: ViewId) => void;
  }

  const { dashboard, isFocused, windowNumbers, paneCount, onSelect }: Props = $props();

  const syncLine = $derived(dashboard.footer.syncLineTemplate.replaceAll("{n}", String(paneCount)));

  function pick(menuId: string) {
    const view = menuIdToView(menuId);
    if (view) onSelect(view);
  }

  /** The row's hotkey-column text: the live tmux binding for whatever window `item.id` maps to (empty if that window isn't in the current session), never a hardcoded per-row letter. */
  function binding(menuId: string): string {
    const view = menuIdToView(menuId);
    if (!view) return "";
    return viewToTmuxBinding(view, windowNumbers) ?? "";
  }

  // `aria-hidden` on each letter span plus one `aria-label` on the container
  // keeps the wordmark one accessible/testable string despite the
  // per-character markup.
  const wordmarkCharsList = $derived(wordmarkChars(dashboard.plate.title));
</script>

<div style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center">
  <div
    style="width:min(940px,100%);box-sizing:border-box;padding:clamp(14px,4vh,54px) 46px clamp(10px,2.6vh,34px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(10px,2.6vh,38px);max-height:100%;min-height:min(100%,560px);overflow:hidden"
  >
    <div
      data-testid="dashboard-wordmark"
      aria-label={dashboard.plate.title}
      style="font-family:'Webslinger','JetBrains Mono',ui-monospace,monospace;font-size:clamp(26px,5.2vh,38px);font-weight:700;letter-spacing:.03em;color:#fff;-webkit-text-stroke:1.75px #e0453c;display:flex;justify-content:center;padding-top:6px;text-shadow:2px 3px 0 rgba(0,0,0,.55)"
    >
      {#each wordmarkCharsList as { ch, style }, i (i)}
        <span aria-hidden="true" style="display:inline-block;{style}">{ch}</span>
      {/each}
    </div>

    <div data-copy-source={isFocused ? "" : undefined} style="width:min(560px,100%);display:flex;flex-direction:column;gap:2px">
      {#each dashboard.menu as item (item.id)}
        <div
          class="dash-row"
          role="button"
          tabindex="0"
          data-testid="dashboard-menu-row"
          data-menu-id={item.id}
          onclick={() => pick(item.id)}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") pick(item.id);
          }}
          style="display:grid;grid-template-columns:26px 1fr auto;align-items:center;padding:clamp(1px,.55vh,7px) 12px;border-radius:4px;cursor:pointer;font-size:clamp(12px,2.5vh,17px);line-height:1.35;color:#e0453c"
        >
          {#if item.icon === "spider-mask"}
            <span
              style="width:14px;height:18px;background:#ff4a4a;-webkit-mask:url(/assets/spiderman.svg) center/contain no-repeat;mask:url(/assets/spiderman.svg) center/contain no-repeat;display:block"
            ></span>
          {:else}
            <span style="opacity:.85">{item.icon}</span>
          {/if}
          <span>
            {item.label}
          </span>
          <span style="color:#5fc6b4">{binding(item.id)}</span>
        </div>
      {/each}
    </div>

    <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
      <div style="font-size:clamp(11px,2.2vh,14px);color:rgba(224,69,60,.9)">{syncLine}</div>
    </div>
  </div>
</div>

<style>
  .dash-row:hover {
    background: rgba(224, 69, 60, 0.1);
  }
</style>
