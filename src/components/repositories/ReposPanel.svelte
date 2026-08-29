<script lang="ts">
  // Panel [1]: flat repo list rows + fetch spinner — moved out of
  // Repositories.svelte during the folder+state-class relocation refactor. Pure
  // relocation: same DOM, testids, classes, and inline styles as the
  // original inline markup.
  //
  // Selection highlight (mockup Builds.dc.html:94, the "1 · Repositories"
  // panel's red variant): a 2px left accent bar + a horizontal red fade,
  // not a flat fill. Every row — selected or not — carries the same 2px
  // `border-left` (transparent when unselected) so selecting a row never
  // shifts its text 2px to the right.
  import type { RepositoriesData } from "../../common/lib/data";
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
  testid="repositories-panel-1"
  copySource={isFocused && state.focusedPanel === 1}
  flex="1.1"
  minHeight
  padding="18px 10px 8px"
  columnBody
  border={state.panelBorder(1)}
  n={1}
  label={repositories.panels.repos.label}
>
  {#snippet children()}
    <div style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:3px">
      {#each state.flatRepos as repo, i (repo.key)}
        <div
          role="button"
          tabindex="0"
          class="repositories-row"
          data-testid="repositories-repo-row"
          data-repo-name={repo.key}
          data-all-projects={repo.isAllProjects ? "true" : "false"}
          onclick={() => {
            state.focusedPanel = 1;
            state.activateRepo(i);
          }}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") state.activateRepo(i);
          }}
          style="cursor:pointer;display:flex;align-items:center;gap:6px;border-left:2px solid {i ===
          state.selectedRepoIdx
            ? '#e0453c'
            : 'transparent'};{i === state.selectedRepoIdx
            ? 'background:linear-gradient(90deg,rgba(224,69,60,.30),rgba(224,69,60,.04));color:#f4ece9'
            : 'color:rgba(196,216,232,.75)'}"
        >
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            <span style="color:#5fc6b4">{repo.mark}</span> {repo.key}
            <span style="color:rgba(217,176,74,.75)">{repo.branch}</span>
          </span>
          <!-- Fixed right-hand slot: the status dot (or fetch spinner) sits
               here so its right edge lands at the row's own right edge —
               the row's left span already consumes all remaining space via
               flex:1, so this slot's content never drifts with name/branch
               length. Every row gets a dot, the virtual all-projects row
               included — gold/pulsing while it's the open repo (same as any
               other row), otherwise the idle two-tone dot. -->
          <span style="flex:none;display:flex;align-items:center;justify-content:flex-end">
            {#if state.isFetching(repo.key)}
              <span
                data-testid="repositories-repo-spinner"
                role="status"
                aria-label={repositories.spinner.ariaLabel}
                style="color:#5fc6b4"
              >
                {repositories.spinner.label} {repositories.spinner.frames[state.spinnerFrame]}
              </span>
            {:else if state.repoTree?.source.repoName === repo.key}
              <span
                data-testid="repositories-repo-open-dot"
                style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#ffca28;animation:pls 1.6s ease-in-out infinite"
              ></span>
            {:else}
              <span
                data-testid="repositories-repo-idle-dot"
                style="display:inline-block;width:6px;height:6px;border-radius:50%;background:{state.idleDotColor(
                  repo.key,
                )}"
              ></span>
            {/if}
          </span>
        </div>
      {/each}
    </div>
  {/snippet}
</RepositoriesPanel>

<style>
  .repositories-row {
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
  .repositories-row:hover {
    background: rgba(224, 69, 60, 0.12);
  }
</style>
