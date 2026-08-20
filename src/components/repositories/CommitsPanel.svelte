<script lang="ts">
  // Panel [4]: commit rows / all-projects local-only text — moved out of
  // Repositories.svelte during the folder+state-class relocation refactor. Pure
  // relocation: same DOM, testids, classes, and inline styles as the
  // original inline markup.
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
  flex="1.3"
  minHeight
  padding="12px 12px 9px"
  columnBody
  border={state.panelBorder(4)}
  titleColor={state.panelTitleColor(4)}
>
  {#snippet title()}
    {repositories.panels.commits.title}
    <span style="color:rgba(196,216,232,.4)">{repositories.panels.commits.subtitle}</span>
  {/snippet}
  {#snippet children()}
    <div style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:3px">
      {#if state.selectedRepo?.isAllProjects}
        <div style="color:rgba(196,216,232,.5)">{repositories.panels.commits.localOnlyText}</div>
        <div style="color:rgba(196,216,232,.35)">{repositories.allProjects.description}</div>
      {:else}
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
            style="cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;{state.focusedPanel ===
              4 && i === state.clampedCommitIdx
              ? 'background:rgba(224,69,60,.22)'
              : ''}"
          >
            <span style="color:rgba(217,176,74,.85)">{c.sha8}</span> <span style="color:#9a7fd4"
              >{repositories.panels.commits.authorInitials}</span
            > <span style="color:rgba(196,216,232,.7)">{c.msg}</span>
          </div>
        {/each}
      {/if}
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
