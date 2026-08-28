<script lang="ts">
  // Panel [4]: commit rows / all-projects local-only text — moved out of
  // Repositories.svelte during the folder+state-class relocation refactor. Pure
  // relocation: same DOM, testids, classes, and inline styles as the
  // original inline markup.
  //
  // Selection highlight (mockup Builds.dc.html:236, the "4 · Commits"
  // panel's own red variant — a THIRD gradient distinct from both the repo
  // list's and the files tree's): a horizontal red fade only, no left
  // accent bar — the mockup never gives commit rows one, selected or not,
  // so there is no alignment shift to guard against here.
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
        <!-- Spine graph (Decision 3): a plain vertical line + one node per
             REAL visible commit row below — deliberately NOT the mockup's
             fake merge/branch topology (curved forks, HEAD/tag pills), which
             has no basis in our actual commit data. Lives in the SAME
             scrolling container as the rows (not a sibling positioned
             outside it) so the graph scrolls in lockstep with them instead
             of drifting once the list is taller than the panel. -->
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
    /* Fixed height AND matching line-height (not display:flex — the
       existing markup joins its three spans with plain inline whitespace,
       not a flex gap) so the spine SVG's node `cy` math (`i*22+11`) lands
       exactly on each row's own vertical center regardless of glyph
       metrics. */
    height: 22px;
    line-height: 22px;
  }
  .repositories-row:hover {
    background: rgba(224, 69, 60, 0.12);
  }
</style>
