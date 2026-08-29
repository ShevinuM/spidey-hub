<script lang="ts">
  // Repositories (lazygit clone) view — design/Homepage.dc.html lines 338-397
  // (five-panel layout: [1] Status, [2] Files, [3] Local Repositories,
  // [4] Commits, [0] Changes).
  //
  // This view uses a lazygit-style flat-repo-list flow, fixing two live
  // user bug reports along the way:
  //   - Panel [1] "Local Repositories" is now a FLAT list of every repo
  //     across every project, plus a virtual "all-projects" entry (every
  //     project's .md doc, browsable like a repo — see repositories.yaml's
  //     `allProjects` key and scripts/generate.mjs's all-projects.json).
  //     A single click OR Enter loads that repo's working tree into panel
  //     [2] — no more separate "select" vs "open" step.
  //   - Panel [2] "Files" is the tree browser for whatever's selected in
  //     [3] (its title reads "<repo>" or "<repo> @<sha8>" while browsing a
  //     commit snapshot instead of the working tree). Selecting/clicking a
  //     FILE previews it in panel [3]; Enter opens the full-screen vim
  //     Editor. Dirs/`../` navigate the same way on click or Enter.
  //   - Panel [4] "Commits" tracks ONLY the panel [1] selection — moving
  //     through files/dirs in [2]/[0] must never change it: panel [4]'s
  //     repo comes from panel [1]'s own selection state, never from
  //     whatever panel [2]/[0] happen to be browsing. Commit rows are
  //     not `<a target="_blank">`: click/Enter fetches that commit's
  //     tree (src/lib/githubTrees.ts) into panel [2] instead, with a
  //     lazygit-style braille spinner on the panel [1] repo row while any
  //     fetch for that repo is in flight; `o` opens the commit on GitHub
  //     (the only surviving external-link path, documented in the Help
  //     window's Repositories scope).
  //     Selecting the all-projects entry shows a data-driven "local only"
  //     line instead (it isn't a real remote).
  //
  // Terminal.svelte drives a single global keydown listener and, while
  // `view === "repositories"`, delegates to this component's exported
  // `handleKey()` via `bind:this` *before* its own generic q/Esc-to-dashboard
  // fallback (removed sitewide) — this is what lets the file editor get
  // first refusal over GrepOverlay while it's open.
  import type { CollectionEntry } from "astro:content";
  import type { RepositoriesData } from "../../common/lib/data";
  import type { Commit } from "../../lib/commits";
  import Editor from "../../common/components/editor/Editor.svelte";
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
    /** See PaneTree.svelte's own header comment (multi-instance
     * data-copy-source gating); ANDed with each panel's own
     * `focusedPanel === N` check below (both must hold: this pane is the
     * window's focused one, AND this is its focused panel). */
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

  /** Exposed for Terminal.svelte's delegation-order flip: while a file is
   * open in the vim editor, Terminal must give this component's
   * `handleKey()` (which just forwards to `editorRef`) a turn BEFORE
   * GrepOverlay's, so `/` searches the buffer instead of opening grep. */
  export function isEditorOpen(): boolean {
    return !!state.editorFile;
  }

  /** Forwards to the embedded Editor's own `runExCommand` — Terminal.svelte's
   * site-wide Cmdline box calls this when its ex-mode Enter fires, and only
   * falls through to the site-wide
   * command set when the result comes back `recognized: false`. A no-op
   * (unrecognized) when the editor isn't actually open — shouldn't happen
   * in practice since Terminal only opens ex mode while `isEditorOpen()` is
   * true, but keeps this safe to call unconditionally regardless. */
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
      <!-- [0] Status — full-width bar above the two-column row (UI v2) -->
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
