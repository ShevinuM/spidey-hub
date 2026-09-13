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
  testid="repositories-panel-4"
  copySource={isFocused && state.focusedPanel === 4}
  flex="0.95"
  minHeight
  padding="18px 14px 9px"
  columnBody
  border={state.panelBorder(4)}
  n={4}
  label={repositories.panels.commits.label}
>
  {#snippet children()}
    {#if !state.selectedRepo?.isAllProjects}
      <div
        data-testid="repositories-commits-caption"
        style="color:rgba(143,208,245,.6);font-size:11px;padding-bottom:6px;margin-bottom:2px;border-bottom:1px solid rgba(224,69,60,.14)"
      >
        {state.commitsSubtitle}
      </div>
    {/if}
    <div style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden">
      {#if state.selectedRepo?.isAllProjects}
        <div style="color:rgba(196,216,232,.5)">{repositories.panels.commits.localOnlyText}</div>
        <div style="color:rgba(196,216,232,.35)">{repositories.allProjects.description}</div>
      {:else}
        <!-- Spine graph: one node per real commit row, no fake merge/branch topology, in the same scrolling container as the rows so it scrolls in lockstep with them. -->
        <div style="position:relative">
          {#if state.commits.length > 0}
            <svg
              width="28"
              height={state.commits.length * 22}
              style="position:absolute;left:0;top:0;overflow:visible"
              aria-hidden="true"
            >
              {#if state.commits.length > 1}
                <path
                  d="M14 11 V {(state.commits.length - 1) * 22 + 11}"
                  stroke="#4a9fe0"
                  stroke-width="2"
                  fill="none"
                />
              {/if}
              {#each state.commits as c, i (c.sha8)}
                <circle cx="14" cy={i * 22 + 11} r="4.5" fill="#4a9fe0" />
              {/each}
            </svg>
          {/if}
          {#each state.commits as c, i (c.sha8)}
            <div
              role="button"
              tabindex="0"
              class="repositories-row"
              data-testid="repositories-commit-row"
              data-sha8={c.sha8}
              data-sha={c.sha ?? ""}
              data-html-url={c.html_url}
              onclick={() => void state.activateCommit(i)}
              onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") void state.activateCommit(i);
              }}
              style="cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:34px;{state.focusedPanel ===
                4 && i === state.clampedCommitIdx
                ? 'background:linear-gradient(90deg,rgba(224,69,60,.26),rgba(224,69,60,.03))'
                : ''}"
            >
              <span style="color:rgba(217,176,74,.85)">{c.sha8}</span> <span style="color:#9a7fd4"
                >{repositories.panels.commits.authorInitials}</span
              > <span style="color:rgba(196,216,232,.7)">{c.msg}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/snippet}
</RepositoriesPanel>

<style>
  .repositories-row {
    /* Fixed height and matching line-height (not flex — these spans join with plain whitespace) so the spine SVG's `cy` math (`i*22+11`) lands on each row's vertical center. */
    height: 22px;
    line-height: 22px;
  }
  .repositories-row:hover {
    background: rgba(224, 69, 60, 0.12);
  }
</style>
