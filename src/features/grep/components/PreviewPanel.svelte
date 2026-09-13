<script lang="ts">
  // Right pane: matched-file preview.
  import type { GrepOverlayState } from "./grepOverlayState.svelte";

  interface Props {
    state: GrepOverlayState;
  }

  const { state }: Props = $props();
</script>

<!-- overflow:visible (not hidden) is deliberate: hidden would clip the
     two negative-offset absolutely-positioned labels below (grep-file /
     grep-file-pos, top:-9px) at every viewport size. -->
<div
  style="position:relative;flex:1;min-width:0;box-sizing:border-box;display:flex;flex-direction:column;border:1px solid rgba(224,69,60,.4);border-radius:4px;background:rgba(9,13,18,.9);padding:12px 12px 8px;overflow:visible"
>
  <div
    data-testid="grep-file"
    style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#0a0e13;padding:0 10px;color:rgba(196,216,232,.85)"
  >
    {state.grepFile}
  </div>
  <div
    data-testid="grep-file-pos"
    style="position:absolute;top:-9px;right:14px;background:#0a0e13;padding:0 8px;color:#5fc6b4;font-size:12px"
  >
    {state.grepFilePos}
  </div>
  <div bind:this={state.previewEl} data-testid="grep-preview" style="flex:1;min-height:0;overflow:hidden">
    {#each state.previewLines as l (l.n)}
      <div style={l.style}>
        <span style={l.nStyle}>{l.n}</span>
        <span style="min-width:0;overflow:hidden"
          >{l.pre}<span style="background:rgba(95,198,180,.38);color:#eafaf6">{l.mat}</span>{l.post}</span
        >
      </div>
    {/each}
  </div>
</div>
