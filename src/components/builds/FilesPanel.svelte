<script lang="ts">
  // Panel [2]: tree browser rows — moved out of Builds.svelte during the
  // folder+state-class relocation refactor. Pure relocation: same DOM,
  // testids, classes, and inline styles as the original inline markup.
  import type { BuildsData } from "../../lib/data";
  import type { BuildsState } from "./buildsState.svelte";
  import { iconSvgForPath } from "../../lib/fileIcons";
  import BuildsPanel from "./BuildsPanel.svelte";

  interface Props {
    builds: BuildsData;
    state: BuildsState;
    isFocused: boolean;
  }

  const { builds, state, isFocused }: Props = $props();
</script>

<BuildsPanel
  testid="builds-panel-2"
  copySource={isFocused && state.focusedPanel === 2}
  flex="1.1"
  minHeight
  padding="12px 12px 9px"
  columnBody
  border={state.panelBorder(2)}
  titleColor={state.panelTitleColor(2)}
>
  {#snippet title()}
    {builds.panels.files.title}
    {#if state.repoTree}<span style="color:rgba(196,216,232,.4)">{state.filesSubtitle}</span>{/if}
  {/snippet}
  {#snippet children()}
    <div style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:3px">
      {#if !state.repoTree}
        <div style="color:rgba(196,216,232,.5)">{builds.repoBrowser.emptyText}</div>
      {:else if state.workingTreeStatus === "loading"}
        <div style="color:rgba(196,216,232,.5)">{builds.repoBrowser.loadingText}</div>
      {:else if state.workingTreeStatus === "error"}
        <div style="color:#e0453c">{builds.repoBrowser.errorText}</div>
      {:else}
        {#each state.currentRows as entry, i (entry.type + ":" + entry.path)}
          <div
            role="button"
            tabindex="0"
            class="builds-row"
            data-testid="builds-tree-row"
            data-entry-type={entry.type}
            data-entry-name={entry.name}
            data-depth={entry.depth}
            data-expanded={entry.type === "dir" ? String(entry.expanded) : undefined}
            onclick={() => {
              if (!state.repoTree) return;
              state.repoTree = { ...state.repoTree, selectedIdx: i };
              state.activateEntry(entry, { openEditor: false });
            }}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") state.activateEntry(entry, { openEditor: true });
            }}
            style="cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:1px 4px 1px {4 +
              entry.depth * 14}px;border-radius:2px;{i === state.repoTree.selectedIdx
              ? 'background:rgba(224,69,60,.18);color:#f0e7e4'
              : 'color:rgba(196,216,232,.7)'}"
          >
            {#if entry.type === "dir"}
              <span class="builds-caret" data-testid="builds-tree-caret" aria-hidden="true"
                >{entry.expanded ? "▾" : "▸"}</span
              >
              <span class="builds-icon" data-testid="builds-tree-icon" style="color:#5fc6b4" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"
                  ><path
                    d="M1.5 3.5a1 1 0 0 1 1-1h3.379a1 1 0 0 1 .707.293L7.914 4.12a1 1 0 0 0 .707.293H13.5a1 1 0 0 1 1 1v7.086a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V3.5Z"
                    fill="currentColor"
                  /></svg
                >
              </span>
            {:else}
              <span class="builds-caret builds-caret-spacer" aria-hidden="true"></span>
              <span
                class="builds-icon"
                data-testid="builds-tree-icon"
                style="width:12px;height:12px"
                aria-hidden="true">{@html iconSvgForPath(entry.name)}</span
              >
            {/if}
            {entry.name}
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
  /* Fixed-width caret slot so dir/file rows' icons+names line up in a
     column regardless of whether a row is a dir (▾/▸) or a file (blank
     spacer of the same width). */
  .builds-caret {
    display: inline-block;
    width: 10px;
    text-align: center;
  }
  .builds-icon {
    display: inline-flex;
    align-items: center;
    margin: 0 3px 0 1px;
    vertical-align: -1px;
  }
</style>
