<script lang="ts">
  // Panel [3]: flat repo list rows + fetch spinner — moved out of
  // Builds.svelte during the folder+state-class relocation refactor. Pure
  // relocation: same DOM, testids, classes, and inline styles as the
  // original inline markup.
  import type { BuildsData } from "../../lib/data";
  import type { BuildsState } from "./buildsState.svelte";
  import BuildsPanel from "./BuildsPanel.svelte";

  interface Props {
    builds: BuildsData;
    state: BuildsState;
    isFocused: boolean;
  }

  const { builds, state, isFocused }: Props = $props();
</script>

<BuildsPanel
  testid="builds-panel-3"
  copySource={isFocused && state.focusedPanel === 3}
  flex="1"
  minHeight
  padding="12px 12px 9px"
  columnBody
  border={state.panelBorder(3)}
  titleColor={state.panelTitleColor(3)}
>
  {#snippet title()}
    {builds.panels.repos.title}
  {/snippet}
  {#snippet children()}
    <div style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:3px">
      {#each state.flatRepos as repo, i (repo.key)}
        <div
          role="button"
          tabindex="0"
          class="builds-row"
          data-testid="builds-repo-row"
          data-repo-name={repo.key}
          data-all-projects={repo.isAllProjects ? "true" : "false"}
          onclick={() => {
            state.focusedPanel = 3;
            state.activateRepo(i);
          }}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") state.activateRepo(i);
          }}
          style="cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(196,216,232,.75);{state.focusedPanel ===
            3 && i === state.selectedRepoIdx
            ? 'background:rgba(224,69,60,.22)'
            : ''}"
        >
          <span style="color:#5fc6b4">{repo.mark}</span> {repo.key}
          <span style="color:rgba(217,176,74,.75)">{repo.branch}</span>
          {#if state.isFetching(repo.key)}
            <span
              data-testid="builds-repo-spinner"
              role="status"
              aria-label={builds.spinner.ariaLabel}
              style="color:#5fc6b4"
            >
              {builds.spinner.label} {builds.spinner.frames[state.spinnerFrame]}
            </span>
          {/if}
        </div>
      {/each}
    </div>
  {/snippet}
</BuildsPanel>

<style>
  .builds-row {
    /* Rows are flex children of an overflow-y:auto column; without this
       they flex-shrink below their own line box under a full 15-commit
       live list (only 1 commit ships in the committed snapshot, so this
       doesn't show up there) — glyphs render vertically clipped and rows
       overlap. Pairs with the containers above using overflow-y:auto so a
       genuinely-too-long list scrolls instead of compressing. An explicit
       line-height (rather than the initial "normal", which resolves
       through getComputedStyle() as the literal string "normal" —
       unparseable as a number) also gives the row a concrete, measurable
       full-glyph height for the e2e assertion that checks commit-row
       bounding-box heights are >= the computed line-height. */
    flex-shrink: 0;
    line-height: 1.6;
  }
  .builds-row:hover {
    background: rgba(224, 69, 60, 0.12);
  }
</style>
