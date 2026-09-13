<script lang="ts">
  import type { RepositoriesData } from "../../../common/lib/data";
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
          <!-- Fixed slot at the row's right edge so the status dot never drifts with name/branch length. -->
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
    /* flex-shrink: 0 and an explicit line-height keep rows from clipping so e2e's row-height assertion has a stable value to check. */
    flex-shrink: 0;
    line-height: 1.6;
  }
  .repositories-row:hover {
    background: rgba(224, 69, 60, 0.12);
  }
</style>
