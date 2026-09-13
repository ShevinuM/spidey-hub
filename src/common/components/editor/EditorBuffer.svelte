<script lang="ts">
  import { segStyle, segTestId, lineText } from "./editor-render";
  import type { EditorState } from "./editorState.svelte";

  interface Props {
    state: EditorState;
  }

  const { state }: Props = $props();
</script>

<div
  bind:this={state.scrollerEl}
  onscroll={() => state.syncScroll()}
  class="editor-scroller"
  data-testid="editor-scroller"
  style="flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:1px;padding:2px 14px"
>
  {#each state.lines as l (l.n)}
    {@const d = state.decorations.get(l.n)}
    <div data-line={l.n} style="display:flex;gap:16px;white-space:pre">
      <span style="flex:none;width:26px;text-align:right;color:rgba(224,69,60,.4)">{l.n}</span
      >{#if !d}{#if typeof l.t === "string"}<span data-testid="editor-line-text" style={l.style}>{l.t}</span
        >{:else}<span data-testid="editor-line-text"
          >{#each l.t as [idx, text]}<span style={`color:${state.palette[idx] ?? ""}`}>{text}</span>{/each}</span
        >{/if}{:else if d.kind === "full-select"}<span
          data-testid="editor-line-text"
          style={`${l.style};background:rgba(224,69,60,.22)`}
          ><span data-testid="editor-selection">{lineText(l.t)}</span></span
        >{:else}<span data-testid="editor-line-text" style={l.style}
          >{#each d.segments as seg}<span style={segStyle(seg.cls, seg.color)} data-testid={segTestId(seg.cls)}
              >{seg.text}</span
            >{/each}</span
        >{/if}
    </div>
  {/each}
</div>

<style>
  .editor-scroller {
    scrollbar-width: none;
  }
  .editor-scroller::-webkit-scrollbar {
    display: none;
  }
</style>
