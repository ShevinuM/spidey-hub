<script lang="ts">
  // Right panel: selected record's role.md body, syntax-colored the same
  // way src/common/lib/docline.ts colors every other doc pane on the site
  // ("personnel" mode). The line container scrolls vertically when the
  // body is taller than the panel, and each line wraps instead of clipping
  // so no character is ever hidden.
  import PanelBadge from "../../../common/components/PanelBadge.svelte";
  import type { EmploymentRecordsState } from "./employmentRecordsState.svelte";

  interface Props {
    state: EmploymentRecordsState;
  }

  const { state }: Props = $props();

  const filePath = $derived(state.selected ? `${state.selected.org}/${state.selected.name}` : "");
  const fileSizeLabel = $derived(state.selected ? `${state.selected.sizeBytes} B` : "");
  const lineCountLabel = $derived(state.personnel.previewLineCountTemplate.replace("{n}", String(state.docLines.length)));
</script>

<div style="position:relative;flex:1;min-width:0;display:flex;flex-direction:column;gap:8px">
  <PanelBadge left={state.personnel.badge.previewLeft} right={state.personnel.badge.previewRight} />

  <div
    style="position:relative;flex:1;min-height:0;overflow:hidden;border:1px solid rgba(224,69,60,.4);border-radius:3px;padding:14px 12px 9px;display:flex;flex-direction:column"
  >
    <div
      style="flex:none;display:flex;align-items:center;gap:12px;font-size:11.5px;white-space:nowrap;overflow:hidden;padding-bottom:7px;margin-bottom:7px;border-bottom:1px solid rgba(224,69,60,.15)"
    >
      <span style="color:rgba(196,216,232,.5);flex:none">{state.personnel.filePerms}</span>
      <span style="color:rgba(196,216,232,.35);flex:none">{state.personnel.fileOwner}</span>
      <span data-testid="employment-preview-size" style="color:rgba(217,176,74,.85);flex:none">{fileSizeLabel}</span>
      <span data-testid="employment-preview-path" style="color:rgba(196,216,232,.4);min-width:0;overflow:hidden;text-overflow:ellipsis;flex:1"
        >{filePath}</span
      >
      <span style="color:rgba(95,198,180,.8);flex:none">{lineCountLabel}</span>
    </div>
    <div
      data-testid="employment-preview"
      style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;line-height:1.5;font-size:11.5px"
    >
      {#each state.docLines as l, i (i)}
        <div data-testid="employment-doc-line" style="display:flex;gap:11px">
          <span style="width:20px;text-align:right;flex:none;color:rgba(196,216,232,.24)">{i + 1}</span>
          <span style="min-width:0;{l.style}">{l.t}</span>
        </div>
      {/each}
    </div>
  </div>
</div>
