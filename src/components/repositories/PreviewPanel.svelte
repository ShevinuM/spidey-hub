<script lang="ts">
  // Panel [3]: file/doc preview + commit-fetch error line — moved out of
  // Repositories.svelte during the folder+state-class relocation refactor. Pure
  // relocation: same DOM, testids, and inline styles as the original inline
  // markup.
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
  testid="repositories-panel-3"
  copySource={isFocused && state.focusedPanel === 3}
  flex="1.95"
  minHeight
  padding="18px 14px 9px"
  columnBody
  border={state.panelBorder(3)}
  n={3}
  label={repositories.panels.changes.label}
>
  {#snippet children()}
    <div
      data-testid="repositories-content-caption"
      style="color:rgba(143,208,245,.6);font-size:11px;padding-bottom:6px;margin-bottom:4px;border-bottom:1px solid rgba(224,69,60,.14);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
    >
      {state.changesSubtitle}
    </div>
    <div data-testid="repositories-changes-body" style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:2px">
      {#if state.commitFetchError}
        <div data-testid="repositories-commit-error" style="color:#e0453c">{state.commitFetchError}</div>
      {/if}
      {#if state.repoTree}
        {#if !state.preview}
          <!-- nothing selected in the tree yet -->
        {:else if state.preview.status === "loading"}
          <div style="color:rgba(196,216,232,.5)">{repositories.filePreview.loadingText}</div>
        {:else if state.preview.status === "error"}
          <div style="color:#e0453c">{repositories.filePreview.errorText}</div>
        {:else if state.preview.status === "binary"}
          <div style="color:#e0453c">{repositories.filePreview.binaryText}</div>
        {:else}
          {#each state.previewLines as l, i (i)}
            <div data-testid="repositories-preview-line" style="display:flex;gap:12px">
              {#if l.n !== null}<span style="flex:none;width:26px;text-align:right;color:rgba(224,69,60,.4)">{l.n}</span>{/if}{#if typeof l.t === "string"}<span data-testid="repositories-preview-text" style={l.style}>{l.t}</span>{:else}<span data-testid="repositories-preview-text">{#each l.t as [idx, text]}<span style={`color:${state.previewPalette[idx] ?? ""}`}>{text}</span>{/each}</span>{/if}
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
</RepositoriesPanel>
