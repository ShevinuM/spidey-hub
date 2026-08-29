<script lang="ts">
  // Left pane: query prompt + result list — moved out of GrepOverlay.svelte
  // during the folder+state-class relocation refactor. Pure relocation:
  // same DOM, testids, classes, and inline styles as the original inline
  // markup.
  import type { GrepData } from "../../common/lib/data";
  import type { GrepOverlayState, Row } from "./grepOverlayState.svelte";

  interface Props {
    grep: GrepData;
    state: GrepOverlayState;
    onPickRow: (row: Row) => void;
  }

  const { grep, state, onPickRow }: Props = $props();
</script>

<!-- Left pane -->
<div
  style="position:relative;width:48%;min-width:0;box-sizing:border-box;display:flex;flex-direction:column;border:1px solid rgba(224,69,60,.55);border-radius:4px;background:rgba(9,13,18,.9);padding:10px 2px 6px"
>
  <div
    style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:7px;background:#0a0e13;padding:0 10px;color:#e0453c;letter-spacing:.16em"
  >
    {grep.leftPane.titlePrefix}<span style="color:#5fc6b4">{grep.leftPane.titleTilde}</span>
  </div>
  <div
    style="flex:none;display:flex;align-items:baseline;gap:8px;padding:2px 10px 6px;border-bottom:1px solid rgba(224,69,60,.28)"
  >
    <span style="color:#5fc6b4">{grep.leftPane.promptIcon}</span>
    <span data-testid="grep-query" style="flex:1;min-width:0;color:#f4ece9;white-space:pre;overflow:hidden"
      >{state.query}<span style="animation:blk 1.05s steps(1) infinite;color:#e0453c">{grep.leftPane.cursorGlyph}</span
      ></span
    >
    <span data-testid="grep-counter" style="flex:none;color:rgba(217,176,74,.9)">{state.countText}</span>
  </div>
  <div bind:this={state.listEl} data-testid="grep-list" style="flex:1;min-height:0;overflow:hidden;padding:0 2px">
    {#if state.grepRows.length > 0}
      {#each state.grepRows as r (r.idx)}
        <div
          role="button"
          tabindex="0"
          data-testid="grep-row"
          data-path={r.path}
          data-selected={r.selected}
          onclick={() => onPickRow(r)}
          onkeydown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") onPickRow(r);
          }}
          style={r.style}
        >
          <span style="width:14px;height:14px;flex:none;display:inline-flex" aria-hidden="true">{@html r.icon}</span>
          <span style={`flex:none;color:${r.pathColor}`}>{r.path}</span>
          <span style="flex:none;color:#5fc6b4">{r.pos}</span>
          <span style="min-width:0;overflow:hidden;text-overflow:ellipsis"
            >{r.pre}<span style="background:rgba(95,198,180,.35);color:#eafaf6">{r.mat}</span>{r.post}</span
          >
        </div>
      {/each}
    {:else if state.showLoading}
      <div data-testid="grep-loading" style="padding:10px;color:rgba(196,216,232,.45)">{grep.loadingText}</div>
    {:else if state.showError}
      <div data-testid="grep-error" style="padding:10px;color:rgba(196,216,232,.45)">{grep.errorText}</div>
    {:else}
      <div data-testid="grep-empty" style="padding:10px;color:rgba(196,216,232,.45)">{state.emptyStateText}</div>
    {/if}
  </div>
  <div
    data-testid="grep-mode"
    style="flex:none;padding:4px 10px 0;border-top:1px solid rgba(224,69,60,.18);color:rgba(196,216,232,.42);font-size:12px"
  >
    {state.modeLine}
  </div>
</div>
