<script lang="ts">
  // Left panel: index block + breadcrumb + flat, newest-first record rows
  // stacked in the bordered box, where only the row list grows/scrolls once
  // content exceeds the box's height.
  import PanelBadge from "../../../common/components/PanelBadge.svelte";
  import type { EmploymentRecordsState } from "./employmentRecordsState.svelte";

  interface Props {
    state: EmploymentRecordsState;
    isFocused: boolean;
  }

  const { state, isFocused }: Props = $props();
</script>

<div style="position:relative;flex:1;min-width:0;display:flex;flex-direction:column;gap:12px">
  <div
    style="position:relative;flex:1;min-height:0;overflow:hidden;border:1px solid #e0453c;border-radius:3px;box-shadow:0 0 30px rgba(224,69,60,.10);padding:16px 12px 18px;display:flex;flex-direction:column;gap:18px"
  >
    <div style="display:flex;flex-direction:column;gap:6px;padding:0 4px;font-size:11px">
      <div style="display:flex;align-items:center;gap:8px;color:rgba(224,69,60,.5);white-space:nowrap">
        ── index <span style="flex:1;height:1px;background:rgba(224,69,60,.18)"></span>
      </div>
      <div style="display:flex;gap:6px;white-space:nowrap;min-width:0">
        <span style="color:rgba(196,216,232,.32);flex:1;overflow:hidden;text-overflow:ellipsis">{state.personnel.index.orgsLabel}</span>
        <span data-testid="employment-index-orgs" style="color:rgba(95,198,180,.72)">{state.indexStats.orgs}</span>
      </div>
      <div style="display:flex;gap:6px;white-space:nowrap;min-width:0">
        <span style="color:rgba(196,216,232,.32);flex:1;overflow:hidden;text-overflow:ellipsis">{state.personnel.index.longestLabel}</span>
        <span data-testid="employment-index-longest" style="color:rgba(95,198,180,.72)"
          >{state.indexStats.longestMonths}{state.personnel.index.longestSuffix}</span
        >
      </div>
      <div style="display:flex;gap:6px;white-space:nowrap;min-width:0">
        <span style="color:rgba(196,216,232,.32);flex:1;overflow:hidden;text-overflow:ellipsis">{state.personnel.index.yearsActiveLabel}</span>
        <span data-testid="employment-index-years" style="color:rgba(217,176,74,.75)"
          >{state.indexStats.yearsStart}{state.personnel.index.yearsActiveSeparator}{state.indexStats.yearsEnd}</span
        >
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:6px;padding:0 4px">
      <div style="display:flex;align-items:center;gap:7px;white-space:nowrap;font-size:11.5px">
        <span data-testid="employment-breadcrumb" style="color:#5fc6b4">{state.personnel.breadcrumb}</span>
        <span style="flex:1;height:1px;background:rgba(224,69,60,.14)"></span>
      </div>
    </div>

    <div
      data-testid="employment-records-list"
      data-copy-source={isFocused ? "" : undefined}
      style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:4px"
    >
      {#each state.records as row, i (row.entry.id)}
        {@const on = i === state.sel}
        <div
          role="button"
          tabindex="0"
          data-testid="employment-row"
          data-row-name={row.name}
          data-selected={on ? "" : undefined}
          onclick={() => state.select(i)}
          onkeydown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") state.select(i);
          }}
          style="display:grid;grid-template-columns:12px 12px minmax(0,1fr) 30px 62px 32px;align-items:center;gap:7px;padding:3px 6px;white-space:nowrap;cursor:pointer;border-left:2px solid {on
            ? '#e0453c'
            : 'transparent'};background:{on
            ? 'linear-gradient(90deg,rgba(224,69,60,.34),rgba(224,69,60,.04))'
            : 'transparent'};color:{on ? '#f4ece9' : 'rgba(196,216,232,.68)'}"
        >
          <span style="color:{on ? '#ff6b6f' : 'transparent'}">{on ? "›" : ""}</span>
          <span style="width:12px;height:12px;display:inline-flex;color:{on ? '#42a5f5' : 'rgba(66,165,245,.6)'}" aria-hidden="true"
            >{@html state.iconFor(row)}</span
          >
          <span style="overflow:hidden;text-overflow:ellipsis">{row.name}</span>
          <span style="font-size:10.5px;color:{on ? 'rgba(244,236,233,.5)' : 'rgba(196,216,232,.32)'}">{row.orgTag}</span>
          <span style="color:{on ? 'rgba(244,236,233,.7)' : 'rgba(196,216,232,.34)'}">{state.personnel.filePerms}</span>
          <span style="text-align:right;color:{on ? 'rgba(244,236,233,.7)' : 'rgba(196,216,232,.34)'}">{row.sizeBytes}</span>
        </div>
      {/each}
    </div>
  </div>

  <PanelBadge left={state.personnel.badge.recordsLeft} right={state.personnel.badge.recordsRight} />
</div>
