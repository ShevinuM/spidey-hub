<script lang="ts">
  // Panel [0]: Status — a full-width bar above the two-column row (UI v2;
  // Builds-Panel-Changes.md). Left cluster: "{prefix} {arrow} {N} repos"
  // (N = the real repo count, Decision 4). Middle: the GitHub-contribution
  // grid (D4's own scope — scripts/generate.mjs's new contributions step;
  // this file only reserves the flex space for it). Right cluster: real
  // branch label, a real "last push" relative-time segment (rendered only
  // when repositoriesState.svelte.ts's mount effect found at least one real
  // commit date — every frozen fixture snapshot carries none, so fixture
  // builds render no last-push segment at all), and a decorative
  // "connected" pulse matching the site's own always-online narrative
  // conventions elsewhere (boot sequence, dashboard's "synced N/N panes"
  // footer).
  import type { RepositoriesData } from "../../lib/data";
  import type { RepositoriesState } from "./repositoriesState.svelte";
  import RepositoriesPanel from "./RepositoriesPanel.svelte";

  interface Props {
    repositories: RepositoriesData;
    state: RepositoriesState;
    isFocused: boolean;
  }

  const { repositories, state, isFocused }: Props = $props();
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
      <!-- D4 fills this with the contribution grid (7-row grid, 52 weeks). -->
      <div data-testid="repositories-contrib-grid-slot" style="flex:1;min-width:0"></div>
      <div style="display:flex;align-items:center;gap:16px;white-space:nowrap">
        <span style="color:rgba(217,176,74,.85)">{repositories.statusLine.mainLabel}</span>
        {#if state.lastPushLabel}
          <span data-testid="repositories-last-push" style="color:rgba(196,216,232,.45)">{state.lastPushLabel}</span>
        {/if}
        <span style="display:flex;align-items:center;gap:6px;color:#5fc6b4">
          <span
            style="width:7px;height:7px;border-radius:50%;background:#5fc6b4;animation:{state.fixtureMode
              ? 'none'
              : 'pls 2.4s ease-in-out infinite'}"
          ></span>
          {repositories.statusLine.connectedLabel}
        </span>
      </div>
    </div>
  {/snippet}
</RepositoriesPanel>

<style>
  @keyframes pls {
    0%,
    100% {
      opacity: 0.45;
    }
    50% {
      opacity: 1;
    }
  }
</style>
