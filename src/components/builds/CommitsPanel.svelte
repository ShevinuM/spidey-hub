<script lang="ts">
  // Panel [4]: commit rows / all-projects local-only text — moved out of
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
  testid="builds-panel-4"
  copySource={isFocused && state.focusedPanel === 4}
  flex="1.3"
  minHeight
  padding="12px 12px 9px"
  columnBody
  border={state.panelBorder(4)}
  titleColor={state.panelTitleColor(4)}
>
  {#snippet title()}
    {builds.panels.commits.title}
    <span style="color:rgba(196,216,232,.4)">{builds.panels.commits.subtitle}</span>
  {/snippet}
  {#snippet children()}
    <div style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:3px">
      {#if state.selectedRepo?.isAllProjects}
        <div style="color:rgba(196,216,232,.5)">{builds.panels.commits.localOnlyText}</div>
        <div style="color:rgba(196,216,232,.35)">{builds.allProjects.description}</div>
      {:else}
        {#each state.commits as c, i (c.sha8)}
          <div
            role="button"
            tabindex="0"
            class="builds-row"
            data-testid="builds-commit-row"
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
              >{builds.panels.commits.authorInitials}</span
            > <span style="color:rgba(196,216,232,.7)">{c.msg}</span>
          </div>
        {/each}
      {/if}
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
