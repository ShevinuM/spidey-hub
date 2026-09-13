<script lang="ts">
  import type { CollectionEntry } from "astro:content";
  import type { RepositoriesData } from "../../../common/lib/data";
  import type { Commit } from "../../../common/lib/commits";
  import Editor from "../../../common/components/editor/Editor.svelte";
  import { RepositoriesState } from "./repositoriesState.svelte";
  import StatusPanel from "./StatusPanel.svelte";
  import FilesPanel from "./FilesPanel.svelte";
  import ReposPanel from "./ReposPanel.svelte";
  import CommitsPanel from "./CommitsPanel.svelte";
  import PreviewPanel from "./PreviewPanel.svelte";

  interface Props {
    repositories: RepositoriesData;
    projects: CollectionEntry<"repositories">[];
    commitsByRepo: Record<string, Commit[]>;
    /** Same multi-instance data-copy-source gating as PaneTree.svelte; ANDed with each panel's own `focusedPanel === N` check below. */
    isFocused: boolean;
  }

  const { repositories, projects, commitsByRepo, isFocused }: Props = $props();

  const state = new RepositoriesState(
    () => repositories,
    () => projects,
    () => commitsByRepo,
  );

  // ---------------------------------------------------------------------
  // Keymap
  // ---------------------------------------------------------------------

  /** True while the vim editor is open — lets Terminal route `handleKey()` here before GrepOverlay's, so `/` searches the buffer instead of opening grep. */
  export function isEditorOpen(): boolean {
    return !!state.editorFile;
  }

  /** Forwards to the open editor's `runExCommand`; returns `recognized: false` when no editor is open so Terminal's site-wide command set can still handle the ex command. */
  export function runEditorExCommand(cmd: string): { recognized: boolean; error?: string } {
    if (!state.editorFile || !state.editorRef) return { recognized: false };
    return state.editorRef.runExCommand(cmd);
  }

  export function handleKey(e: KeyboardEvent): boolean {
    if (state.editorFile) {
      return state.editorRef ? state.editorRef.handleKey(e) : false;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return false;

    if (e.key === "0" || e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") {
      const n = Number(e.key) as 0 | 1 | 2 | 3 | 4;
      state.focusedPanel = n;
      return true;
    }

    const k = e.key.toLowerCase();

    if (state.focusedPanel === 2) {
      if (!state.repoTree) {
        return false;
      }
      if (e.key === "ArrowDown") {
        state.moveTreeSelection(1);
        return true;
      }
      if (e.key === "ArrowUp") {
        state.moveTreeSelection(-1);
        return true;
      }
      if (e.key === "Enter") {
        const entry = state.currentRows[state.repoTree.selectedIdx];
        if (entry) state.activateEntry(entry, { openEditor: true });
        return true;
      }
      // The whole tree renders at once, expand/collapse in place — h/
      // Backspace/ArrowLeft have no "go up a level" to perform here.
      return false;
    }

    if (state.focusedPanel === 1) {
      if (e.key === "ArrowDown") {
        state.selectRepo(1);
        return true;
      }
      if (e.key === "ArrowUp") {
        state.selectRepo(-1);
        return true;
      }
      if (e.key === "Enter") {
        state.activateRepo(state.selectedRepoIdx);
        return true;
      }
      return false;
    }

    if (state.focusedPanel === 4) {
      if (e.key === "ArrowDown") {
        state.selectCommit(1);
        return true;
      }
      if (e.key === "ArrowUp") {
        state.selectCommit(-1);
        return true;
      }
      if (e.key === "Enter") {
        void state.activateCommit(state.clampedCommitIdx);
        return true;
      }
      if (k === "o") {
        state.openSelectedCommitOnGithub();
        return true;
      }
      return false;
    }

    return false;
  }
</script>

{#if state.editorFile}
  <Editor
    bind:this={state.editorRef}
    fileName={state.editorFileName}
    lines={state.editorLines}
    palette={state.editorPalette}
    labels={repositories.editor}
    breadcrumbLeft={state.editorFile.repoName}
    breadcrumbRight={state.editorFile.path}
    {isFocused}
    onClose={() => state.closeEditor()}
  />
{:else}
  <div style="flex:1;min-height:0;display:flex">
    <div
      data-testid="repositories-panels-root"
      style="flex:1;min-height:0;display:flex;flex-direction:column;gap:20px;padding:20px;font-size:13px"
    >
      <StatusPanel {repositories} {state} {isFocused} />

      <div style="flex:1;min-height:0;display:flex;gap:20px">
        <div style="width:31%;min-width:0;display:flex;flex-direction:column;gap:20px">
          <!-- [1] Repositories (flat list + all-projects) -->
          <ReposPanel {repositories} {state} {isFocused} />

          <!-- [2] Files (tree browser) -->
          <FilesPanel {repositories} {state} {isFocused} />
        </div>

        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:20px">
          <!-- [3] Content (preview) -->
          <PreviewPanel {repositories} {state} {isFocused} />

          <!-- [4] Commits (tracks ONLY the panel [1] selection) -->
          <CommitsPanel {repositories} {state} {isFocused} />
        </div>
      </div>
    </div>
  </div>
{/if}
