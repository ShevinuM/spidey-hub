<script lang="ts">
  // Status/ex-command line — moved out of Editor.svelte during the
  // folder+state-class relocation refactor. Pure relocation: same DOM,
  // testids, classes, and inline styles as the original inline markup.
  import type { EditorLabels } from "../../common/lib/data";
  import type { EditorState } from "./editorState.svelte";

  interface Props {
    state: EditorState;
    labels: EditorLabels;
    breadcrumbLeft: string;
    breadcrumbRight: string;
    onClose: () => void;
  }

  const { state, labels, breadcrumbLeft, breadcrumbRight, onClose }: Props = $props();
</script>

<div
  data-testid="editor-statusline"
  style="flex:none;flex-wrap:nowrap;display:flex;align-items:center;background:#0e1a20;font-size:12px"
>
  <span data-testid="editor-mode" style="flex:none;background:#e0453c;color:#0b0f14;font-weight:700;padding:3px 12px"
    >{state.modeOrPromptText}</span
  >
  <span style="flex:none;background:rgba(224,69,60,.22);color:#f0d9d4;padding:3px 12px">{labels.branch}</span>
  <span
    style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(196,216,232,.6);padding:3px 12px"
    >{breadcrumbLeft} {labels.breadcrumbSeparator} {breadcrumbRight}</span
  >
  {#if state.message}
    <span data-testid="editor-message" style="flex:none;white-space:nowrap;color:#e0453c;padding:3px 12px"
      >{state.message}</span
    >
  {/if}
  <span style="flex:1;min-width:0"></span>
  <span data-testid="editor-position" style="flex:none;white-space:nowrap;color:#5fc6b4;padding:3px 12px"
    >{state.scrollLabel} {state.positionText}</span
  >
  <button
    type="button"
    onclick={onClose}
    data-testid="editor-close-pill"
    style="flex:none;white-space:nowrap;background:rgba(95,198,180,.2);color:#5fc6b4;padding:3px 12px;border:none;font:inherit;cursor:pointer"
    >{labels.closePillLabel}</button
  >
  <span data-testid="paste-buffer" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"
    >{state.pasteBufferText}</span
  >
</div>
