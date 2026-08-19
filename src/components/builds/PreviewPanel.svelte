<script lang="ts">
  // Panel [0]: file/doc preview + commit-fetch error line — moved out of
  // Builds.svelte during the folder+state-class relocation refactor. Pure
  // relocation: same DOM, testids, and inline styles as the original inline
  // markup.
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
  testid="builds-panel-0"
  copySource={isFocused && state.focusedPanel === 0}
  flex="2.4"
  minHeight
  padding="12px 14px 10px"
  columnBody
  border={state.panelBorder(0)}
  titleColor={state.panelTitleColor(0)}
>
  {#snippet title()}
    {builds.panels.changes.title}
    <span style="color:rgba(196,216,232,.4)">{state.changesSubtitle}</span>
  {/snippet}
  {#snippet children()}
    <div data-testid="builds-changes-body" style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:2px">
      {#if state.commitFetchError}
        <div data-testid="builds-commit-error" style="color:#e0453c">{state.commitFetchError}</div>
      {/if}
      {#if state.repoTree}
        {#if !state.preview}
          <!-- nothing selected in the tree yet -->
        {:else if state.preview.status === "loading"}
          <div style="color:rgba(196,216,232,.5)">{builds.filePreview.loadingText}</div>
        {:else if state.preview.status === "error"}
          <div style="color:#e0453c">{builds.filePreview.errorText}</div>
        {:else if state.preview.status === "binary"}
          <div style="color:#e0453c">{builds.filePreview.binaryText}</div>
        {:else}
          {#each state.previewLines as l, i (i)}
            <div data-testid="builds-preview-line" style="display:flex;gap:12px">
              {#if l.n !== null}<span style="flex:none;width:26px;text-align:right;color:rgba(224,69,60,.4)"
                  >{l.n}</span
                >{/if}<span style={l.style}>{l.t}</span>
            </div>
          {/each}
        {/if}
      {:else}
        {#each state.renderedDoc as l, i (i)}
          <div style={l.style}>{l.t}</div>
        {/each}
      {/if}
    </div>
  {/snippet}
</BuildsPanel>
