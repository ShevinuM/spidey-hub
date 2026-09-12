<script lang="ts">
  // Panel [0]: Status — a full-width bar above the two-column row (UI v2's
  // own panel layout). Left cluster: "{prefix} {arrow} {N} repos" (N = the
  // real repo count, counted across every project, not the prototype's
  // fixed number). Middle: the GitHub-contribution
  // grid — 52 columns x 7 rows of cells colored from `state.contributionLevels`
  // (oldest-first, populated by repositoriesState.svelte.ts's mount fetch of
  // public/generated/contributions.json; empty array renders zero cells,
  // e.g. before that fetch resolves or on failure). Right cluster: real
  // branch label, a real "last push" relative-time segment (rendered only
  // when repositoriesState.svelte.ts's mount effect found at least one real
  // commit date — every frozen fixture snapshot carries none, so fixture
  // builds render no last-push segment at all), and a decorative
  // "connected" pulse matching the site's own always-online narrative
  // conventions elsewhere (boot sequence, dashboard's "synced N/N panes"
  // footer).
  import type { RepositoriesData } from "../../../common/lib/data";
  import type { RepositoriesState } from "./repositoriesState.svelte";
  import RepositoriesPanel from "./RepositoriesPanel.svelte";

  interface Props {
    repositories: RepositoriesData;
    state: RepositoriesState;
    isFocused: boolean;
  }

  const { repositories, state, isFocused }: Props = $props();

  // Verbatim 5-level contribution palette — index 0-4 maps 1:1 to
  // contributions.json's `level` field.
  const CONTRIB_LEVEL_COLORS = [
    "rgba(196,216,232,.07)",
    "rgba(224,69,60,.24)",
    "rgba(224,69,60,.45)",
    "rgba(224,69,60,.68)",
    "#e0453c",
  ];
</script>

<RepositoriesPanel
  testid="repositories-panel-0"
  copySource={isFocused && state.focusedPanel === 0}
  flex="none"
  padding="10px 12px 9px"
  border={state.panelBorder(0)}
  n={0}
  label={repositories.panels.status.label}
>
  {#snippet children()}
    <div style="display:flex;align-items:center;gap:22px">
      <div style="display:flex;align-items:center;gap:9px;white-space:nowrap">
        <span style="color:#5fc6b4">{repositories.statusLine.prefix}</span>
        <span style="color:rgba(196,216,232,.45)">{repositories.statusLine.arrow}</span>
        <span style="color:#e0453c">{state.repoCount} {repositories.statusLine.reposSuffix}</span>
      </div>
      <div
        data-testid="repositories-contrib-grid-slot"
        style="flex:1;min-width:0;overflow:hidden;display:grid;grid-template-rows:repeat(7,6px);grid-auto-flow:column;grid-auto-columns:6px;gap:2px;justify-content:center"
      >
        {#each state.contributionLevels as level, i (i)}
          <div data-testid="repositories-contrib-cell" style="border-radius:1px;background:{CONTRIB_LEVEL_COLORS[level]}"></div>
        {/each}
      </div>
      <div style="display:flex;align-items:center;gap:16px;white-space:nowrap">
        <span style="color:rgba(217,176,74,.85)">{repositories.statusLine.mainLabel}</span>
        {#if state.lastPushLabel}
          <span data-testid="repositories-last-push" style="color:rgba(196,216,232,.45)">{state.lastPushLabel}</span>
        {/if}
        <span style="display:flex;align-items:center;gap:6px;color:#5fc6b4">
          <span
            style="width:7px;height:7px;border-radius:50%;background:#5fc6b4;animation:pls 2.4s ease-in-out infinite"
          ></span>
          {repositories.statusLine.connectedLabel}
        </span>
      </div>
    </div>
  {/snippet}
</RepositoriesPanel>

