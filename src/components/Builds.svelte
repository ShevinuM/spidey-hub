<script lang="ts">
  // Builds (lazygit clone) view — design/Homepage.dc.html lines 338-397
  // (five-panel layout: [1] Status, [2] Files, [3] Local Repositories,
  // [4] Commits, [0] Changes, plus the unnumbered Command log panel).
  // PLAN.md Phase 5.
  //
  // Panel focus (0-4, bright #e0453c border + title), repo file-tree
  // browsing in pane [0], the full-screen file Editor, and the commit
  // refresh/link behavior are all a PLAN.md "Builds interactivity
  // extension" — the prototype itself has no keyboard state beyond
  // project j/k (Homepage.dc.html lines 1001-1005). Default focus is panel
  // [2] specifically because that's the one panel the prototype already
  // draws with a bright border unconditionally (line 348) — keeping that as
  // the "focused" look means the unfocused-default screenshot (02-builds)
  // needs no visual change at all from the prototype's own markup.
  //
  // Keymap entry point: Terminal.svelte drives a single global keydown
  // listener and, while `view === "builds"`, delegates to this component's
  // exported `handleKey()` via `bind:this` *before* its own generic
  // q/Esc-to-dashboard fallback — so q/Esc here is only special-cased while
  // the file editor is open (closing the editor, not leaving Builds); every
  // other q/Esc press returns `false` and falls through to Terminal's
  // fallback. The same `bind:this` + `handleKey(): boolean` shape is reused
  // one level down for the Editor (see Editor.svelte) — Phase 6 inherits
  // this exact chain for personnel role docs.
  import type { CollectionEntry } from "astro:content";
  import type { BuildsData } from "../lib/data";
  import type { Commit } from "../lib/commits";
  import { classifyBody, classifyDoc, colorFor, docColors } from "../lib/docline";
  import { listDir, findFile, joinPath, type RepoIndex } from "../lib/repoTree";
  import { fetchLiveCommits } from "../lib/githubCommits";
  import Editor, { type EditorLine } from "./Editor.svelte";

  interface Props {
    builds: BuildsData;
    projects: CollectionEntry<"projects">[];
    commitsByRepo: Record<string, Commit[]>;
    onTracker: () => void;
  }

  const { builds, projects, commitsByRepo, onTracker }: Props = $props();

  const sortedProjects = $derived([...projects].sort((a, b) => a.data.order - b.data.order));

  let selectedProjectIdx = $state(0);
  let selectedRepoIdx = $state(0);
  let selectedCommitIdx = $state(0);
  /** 0-4, matching the five panel numbers (0 = Changes, 1 = Status, etc.). */
  let focusedPanel = $state<0 | 1 | 2 | 3 | 4>(2);

  type RepoIndexState = { status: "loading" } | { status: "error" } | { status: "ready"; index: RepoIndex };
  let repoIndexCache = $state<Record<string, RepoIndexState>>({});

  interface RepoTreeState {
    repoName: string;
    path: string[];
    selectedIdx: number;
  }
  let repoTree = $state<RepoTreeState | null>(null);

  interface EditorFileState {
    repoName: string;
    path: string;
    lines: string[];
  }
  let editorFile = $state<EditorFileState | null>(null);
  let editorRef = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);

  /** Live commit refresh results, keyed by repo name — overrides the
   * build-time snapshot (`commitsByRepo`) once a fetch succeeds. Starts
   * empty so first paint always renders the snapshot synchronously (PLAN.md
   * "no loading state anywhere in panel [4]"). */
  let liveCommits = $state<Record<string, Commit[]>>({});

  const activeProject = $derived(sortedProjects[selectedProjectIdx]);
  const activeRepos = $derived(
    (activeProject?.data.repos ?? []).map((r, i) => ({ name: r.name, branch: r.branch, mark: i === 0 ? "*" : "•" })),
  );
  const primaryRepoName = $derived(activeRepos[0]?.name);
  const commits = $derived(primaryRepoName ? (liveCommits[primaryRepoName] ?? commitsByRepo[primaryRepoName] ?? []) : []);
  const clampedCommitIdx = $derived(commits.length ? Math.min(selectedCommitIdx, commits.length - 1) : 0);

  const projectCount = $derived(sortedProjects.length);
  const repoCount = $derived(sortedProjects.reduce((n, p) => n + p.data.repos.length, 0));
  const filePos = $derived(
    builds.filePosTemplate.replace("{n}", String(selectedProjectIdx + 1)).replace("{total}", String(sortedProjects.length)),
  );

  const renderedDoc = $derived(
    activeProject?.body
      ? classifyBody(activeProject.body, "project").map((l) => ({ t: l.t, style: colorFor(l.kind, "project") }))
      : [],
  );

  const changesSubtitleValue = $derived(
    repoTree
      ? repoTree.path.length
        ? `${repoTree.repoName}/${joinPath(repoTree.path)}`
        : repoTree.repoName
      : activeProject
        ? `${activeProject.id}.md`
        : "",
  );
  const changesSubtitle = $derived(builds.panels.changes.subtitleTemplate.replace("{value}", changesSubtitleValue));

  // ---------------------------------------------------------------------
  // Repo file-tree browsing (panel [3] -> pane [0])
  // ---------------------------------------------------------------------

  interface TreeRow {
    type: "up" | "dir" | "file";
    name: string;
    path: string;
  }

  const currentIndexState = $derived(repoTree ? repoIndexCache[repoTree.repoName] : undefined);

  const currentEntries = $derived.by((): TreeRow[] => {
    if (!repoTree || !currentIndexState || currentIndexState.status !== "ready") return [];
    const dirPath = joinPath(repoTree.path);
    const listed: TreeRow[] = listDir(currentIndexState.index.files, dirPath).map((e) => ({
      type: e.type,
      name: e.name,
      path: e.path,
    }));
    if (repoTree.path.length > 0) {
      return [{ type: "up", name: builds.repoBrowser.upEntry.name, path: "" }, ...listed];
    }
    return listed;
  });

  async function ensureRepoIndex(repoName: string) {
    const existing = repoIndexCache[repoName];
    if (existing && existing.status !== "error") return;
    repoIndexCache = { ...repoIndexCache, [repoName]: { status: "loading" } };
    try {
      const res = await fetch(`/generated/repos/${repoName}.json`);
      if (!res.ok) throw new Error(String(res.status));
      const index = (await res.json()) as RepoIndex;
      repoIndexCache = { ...repoIndexCache, [repoName]: { status: "ready", index } };
    } catch {
      repoIndexCache = { ...repoIndexCache, [repoName]: { status: "error" } };
    }
  }

  function openRepo(repoName: string) {
    repoTree = { repoName, path: [], selectedIdx: 0 };
    void ensureRepoIndex(repoName);
  }

  function goUpDir() {
    if (!repoTree) return;
    if (repoTree.path.length === 0) {
      repoTree = null;
      return;
    }
    repoTree = { ...repoTree, path: repoTree.path.slice(0, -1), selectedIdx: 0 };
  }

  function openEditorFile(repoName: string, path: string) {
    const state = repoIndexCache[repoName];
    if (!state || state.status !== "ready") return;
    const file = findFile(state.index.files, path);
    if (!file) return;
    editorFile = { repoName, path, lines: file.lines };
  }

  function activateEntry(entry: TreeRow) {
    if (!repoTree) return;
    if (entry.type === "up") {
      goUpDir();
    } else if (entry.type === "dir") {
      repoTree = { ...repoTree, path: [...repoTree.path, entry.name], selectedIdx: 0 };
    } else {
      openEditorFile(repoTree.repoName, entry.path);
    }
  }

  function iconFor(entry: TreeRow): string {
    if (entry.type === "up") return builds.repoBrowser.upEntry.icon;
    return entry.type === "file" ? builds.repoBrowser.fileIcon : builds.repoBrowser.dirIcon;
  }

  const editorLines = $derived.by((): EditorLine[] => {
    if (!editorFile) return [];
    const isMd = editorFile.path.toLowerCase().endsWith(".md");
    if (isMd) {
      const kinds = classifyDoc(editorFile.lines, "project");
      return editorFile.lines.map((raw, i) => ({
        n: i + 1,
        t: raw === "" ? " " : raw,
        style: colorFor(kinds[i], "project"),
      }));
    }
    return editorFile.lines.map((raw, i) => ({ n: i + 1, t: raw === "" ? " " : raw, style: docColors.p }));
  });

  const editorFileName = $derived(editorFile ? editorFile.path.split("/").pop()! : "");

  function closeEditor() {
    editorFile = null;
    editorRef = null;
  }

  // ---------------------------------------------------------------------
  // Selection (project / repo / commit)
  // ---------------------------------------------------------------------

  function setActiveProject(idx: number) {
    const n = sortedProjects.length;
    if (n === 0) return;
    selectedProjectIdx = ((idx % n) + n) % n;
    selectedRepoIdx = 0;
    selectedCommitIdx = 0;
    repoTree = null;
  }

  function selectProject(delta: number) {
    setActiveProject(selectedProjectIdx + delta);
  }

  // ---------------------------------------------------------------------
  // gg/G in panel [2]'s project list (PLAN.md Phase 9 "Vim extras" — the
  // Editor's own gg/G, Phase 5, is the precedent this mirrors: same ~500ms
  // double-tap window, single "g" alone does nothing visible).
  // ---------------------------------------------------------------------
  let gPending = false;
  let gTimer: ReturnType<typeof setTimeout> | undefined;

  function selectRepo(delta: number) {
    const n = activeRepos.length;
    if (n === 0) return;
    selectedRepoIdx = ((selectedRepoIdx + delta) % n + n) % n;
  }

  function selectCommit(delta: number) {
    const n = commits.length;
    if (n === 0) return;
    selectedCommitIdx = ((clampedCommitIdx + delta) % n + n) % n;
  }

  function moveTreeSelection(delta: number) {
    if (!repoTree) return;
    const n = currentEntries.length;
    if (n === 0) return;
    repoTree = { ...repoTree, selectedIdx: ((repoTree.selectedIdx + delta) % n + n) % n };
  }

  function openSelectedCommit() {
    const c = commits[clampedCommitIdx];
    if (c?.html_url) window.open(c.html_url, "_blank");
  }

  // ---------------------------------------------------------------------
  // Live commit refresh (PLAN.md "Client commit refresh")
  // ---------------------------------------------------------------------

  $effect(() => {
    const repoName = primaryRepoName;
    if (!repoName || liveCommits[repoName]) return;
    let cancelled = false;
    fetchLiveCommits(repoName).then((result) => {
      if (cancelled || !result) return;
      liveCommits = { ...liveCommits, [repoName]: result };
    });
    return () => {
      cancelled = true;
    };
  });

  // ---------------------------------------------------------------------
  // Command log rendering (emphasized words / real links inline)
  // ---------------------------------------------------------------------

  interface LogToken {
    text: string;
    kind: "plain" | "emphasis" | "link";
    href?: string;
  }

  function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function tokenizeLogLine(line: BuildsData["commandLog"][number]): LogToken[] {
    const specials: { match: string; kind: "emphasis" | "link"; href?: string }[] = [
      ...(line.emphasize ?? []).map((m) => ({ match: m, kind: "emphasis" as const })),
      ...(line.links ?? []).map((l) => ({ match: l.text, kind: "link" as const, href: l.href })),
    ];
    if (specials.length === 0) return [{ text: line.text, kind: "plain" }];
    // `\b...\b` so single-letter emphasize tokens ("t", "q", "j", "k") only
    // match as whole words — a bare substring match would also catch, e.g.,
    // the "j" inside "project" or the "t" inside "Retina-V"/"returns"/"the",
    // wrapping them in an emphasis <span> the prototype's own hand-authored
    // markup never has there (Homepage.dc.html lines 390/392 emphasize only
    // the standalone "j"/"k"/"t"/"q"), which is exactly the kind of stray
    // markup difference that shows up as a pixel diff at that one glyph.
    const pattern = new RegExp(`\\b(${specials.map((s) => escapeRegExp(s.match)).join("|")})\\b`, "g");
    return line.text
      .split(pattern)
      .filter((s) => s.length > 0)
      .map((s) => {
        const special = specials.find((sp) => sp.match === s);
        return special ? { text: s, kind: special.kind, href: special.href } : { text: s, kind: "plain" as const };
      });
  }

  const commandLogColors = ["#5fc6b4", "rgba(196,216,232,.6)", "rgba(196,216,232,.45)"];

  // ---------------------------------------------------------------------
  // Focus styling helpers
  // ---------------------------------------------------------------------

  function panelBorder(n: 0 | 1 | 2 | 3 | 4): string {
    return focusedPanel === n ? "#e0453c" : "rgba(224,69,60,.35)";
  }
  function panelTitleColor(n: 0 | 1 | 2 | 3 | 4): string {
    return focusedPanel === n ? "#e0453c" : "rgba(224,69,60,.85)";
  }

  // ---------------------------------------------------------------------
  // Keymap
  // ---------------------------------------------------------------------

  /** Exposed for Terminal.svelte's delegation-order flip (PLAN.md Phase 3
   * item 10): while a file is open in the vim editor, Terminal must give
   * this component's `handleKey()` (which just forwards to `editorRef`) a
   * turn BEFORE GrepOverlay's, so `/` searches the buffer instead of
   * opening grep. */
  export function isEditorOpen(): boolean {
    return !!editorFile;
  }

  export function handleKey(e: KeyboardEvent): boolean {
    if (editorFile) {
      return editorRef ? editorRef.handleKey(e) : false;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return false;

    if (e.key === "0" || e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") {
      focusedPanel = Number(e.key) as 0 | 1 | 2 | 3 | 4;
      gPending = false;
      return true;
    }

    const k = e.key.toLowerCase();

    if (k === "t") {
      onTracker();
      return true;
    }

    if (focusedPanel === 2) {
      if (k === "j" || e.key === "ArrowDown") {
        selectProject(1);
        gPending = false;
        return true;
      }
      if (k === "k" || e.key === "ArrowUp") {
        selectProject(-1);
        gPending = false;
        return true;
      }
      if (e.key === "G") {
        setActiveProject(sortedProjects.length - 1);
        gPending = false;
        return true;
      }
      if (e.key === "g") {
        if (gPending) {
          clearTimeout(gTimer);
          gPending = false;
          setActiveProject(0);
        } else {
          gPending = true;
          gTimer = setTimeout(() => (gPending = false), 500);
        }
        return true;
      }
      gPending = false;
      return false;
    }

    if (focusedPanel === 3) {
      if (repoTree) {
        if (k === "j" || e.key === "ArrowDown") {
          moveTreeSelection(1);
          return true;
        }
        if (k === "k" || e.key === "ArrowUp") {
          moveTreeSelection(-1);
          return true;
        }
        if (e.key === "Enter") {
          const entry = currentEntries[repoTree.selectedIdx];
          if (entry) activateEntry(entry);
          return true;
        }
        if (k === "h" || e.key === "Backspace" || e.key === "ArrowLeft") {
          goUpDir();
          return true;
        }
        return false;
      }
      if (k === "j" || e.key === "ArrowDown") {
        selectRepo(1);
        return true;
      }
      if (k === "k" || e.key === "ArrowUp") {
        selectRepo(-1);
        return true;
      }
      if (e.key === "Enter") {
        const r = activeRepos[selectedRepoIdx];
        if (r) openRepo(r.name);
        return true;
      }
      return false;
    }

    if (focusedPanel === 4) {
      if (k === "j" || e.key === "ArrowDown") {
        selectCommit(1);
        return true;
      }
      if (k === "k" || e.key === "ArrowUp") {
        selectCommit(-1);
        return true;
      }
      if (e.key === "Enter") {
        openSelectedCommit();
        return true;
      }
      return false;
    }

    return false;
  }
</script>

{#if editorFile}
  <Editor
    bind:this={editorRef}
    fileName={editorFileName}
    lines={editorLines}
    labels={builds.editor}
    breadcrumbLeft={editorFile.repoName}
    breadcrumbRight={editorFile.path}
    onClose={closeEditor}
  />
{:else}
  <div style="flex:1;min-height:0;display:flex;padding:18px 22px 14px">
    <div
      style="flex:1;min-height:0;display:flex;gap:12px;background:rgba(9,13,18,.6);backdrop-filter:blur(3px);border:1px solid rgba(224,69,60,.35);border-radius:6px;padding:16px 16px 14px;font-size:13px;box-shadow:0 24px 80px rgba(0,0,0,.5)"
    >
      <div style="width:38%;min-width:0;display:flex;flex-direction:column;gap:14px">
        <!-- [1] Status -->
        <div
          data-testid="builds-panel-1"
          style="position:relative;flex:none;border:1px solid {panelBorder(1)};border-radius:4px;padding:10px 12px 9px"
        >
          <div
            style="position:absolute;top:-8px;left:10px;background:#0a0e13;padding:0 6px;font-size:12px;color:{panelTitleColor(
              1,
            )}"
          >
            {builds.panels.status.title}
          </div>
          <div style="color:#5fc6b4">
            {builds.statusLine.prefix}
            <span style="color:rgba(196,216,232,.5)">{builds.statusLine.arrow}</span>
            <span style="color:#e0453c">{repoCount} {builds.statusLine.reposSuffix}</span>
            <span style="color:rgba(196,216,232,.5)"
              >{builds.statusLine.separator} {projectCount} {builds.statusLine.projectsSuffix}</span
            >
          </div>
        </div>

        <!-- [2] Files -->
        <div
          data-testid="builds-panel-2"
          style="position:relative;flex:1.1;min-height:0;border:1px solid {panelBorder(
            2,
          )};border-radius:4px;padding:12px 12px 9px;display:flex;flex-direction:column"
        >
          <div
            style="position:absolute;top:-8px;left:10px;background:#0a0e13;padding:0 6px;font-size:12px;color:{panelTitleColor(
              2,
            )}"
          >
            {builds.panels.files.title}
            <span style="color:rgba(196,216,232,.4)">{builds.panels.files.subtitle}</span>
          </div>
          <div style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:3px">
            {#each sortedProjects as project, i (project.id)}
              <div
                role="button"
                tabindex="0"
                class="builds-row"
                data-testid="builds-file-row"
                data-project-id={project.id}
                onclick={() => {
                  focusedPanel = 2;
                  setActiveProject(i);
                }}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setActiveProject(i);
                }}
                style="cursor:pointer;border-radius:2px;padding:1px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;{i ===
                selectedProjectIdx
                  ? 'background:rgba(224,69,60,.18);color:#f0e7e4'
                  : 'color:rgba(196,216,232,.7)'}"
              >
                <span style="color:#5fc6b4">{builds.panels.files.statusLetter}</span> <span
                  style="color:rgba(196,216,232,.45)">{builds.panels.files.filler}</span
                > {project.id}.md
              </div>
            {/each}
            <div style="margin-top:auto;text-align:right;font-size:11px;color:rgba(224,69,60,.6)">{filePos}</div>
          </div>
        </div>

        <!-- [3] Local Repositories -->
        <div
          data-testid="builds-panel-3"
          style="position:relative;flex:1;min-height:0;border:1px solid {panelBorder(
            3,
          )};border-radius:4px;padding:12px 12px 9px;display:flex;flex-direction:column"
        >
          <div
            style="position:absolute;top:-8px;left:10px;background:#0a0e13;padding:0 6px;font-size:12px;color:{panelTitleColor(
              3,
            )}"
          >
            {builds.panels.repos.title}
          </div>
          <div style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:3px">
            {#each activeRepos as repo, i (repo.name)}
              <div
                role="button"
                tabindex="0"
                class="builds-row"
                data-testid="builds-repo-row"
                data-repo-name={repo.name}
                onclick={() => {
                  focusedPanel = 3;
                  selectedRepoIdx = i;
                }}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") openRepo(repo.name);
                }}
                style="cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(196,216,232,.75);{focusedPanel ===
                  3 && i === selectedRepoIdx
                  ? 'background:rgba(224,69,60,.22)'
                  : ''}"
              >
                <span style="color:#5fc6b4">{repo.mark}</span> {repo.name}
                <span style="color:rgba(217,176,74,.75)">{repo.branch}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- [4] Commits -->
        <div
          data-testid="builds-panel-4"
          style="position:relative;flex:1.3;min-height:0;border:1px solid {panelBorder(
            4,
          )};border-radius:4px;padding:12px 12px 9px;display:flex;flex-direction:column"
        >
          <div
            style="position:absolute;top:-8px;left:10px;background:#0a0e13;padding:0 6px;font-size:12px;color:{panelTitleColor(
              4,
            )}"
          >
            {builds.panels.commits.title}
            <span style="color:rgba(196,216,232,.4)">{builds.panels.commits.subtitle}</span>
          </div>
          <div style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:3px">
            {#each commits as c, i (c.sha8)}
              <a
                href={c.html_url}
                target="_blank"
                rel="noreferrer"
                class="builds-row"
                data-testid="builds-commit-row"
                onclick={() => {
                  focusedPanel = 4;
                  selectedCommitIdx = i;
                }}
                style="text-decoration:none;color:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;{focusedPanel ===
                  4 && i === clampedCommitIdx
                  ? 'background:rgba(224,69,60,.22)'
                  : ''}"
              >
                <span style="color:rgba(217,176,74,.85)">{c.sha8}</span> <span style="color:#9a7fd4"
                  >{builds.panels.commits.authorInitials}</span
                > <span style="color:rgba(196,216,232,.7)">{c.msg}</span>
              </a>
            {/each}
          </div>
        </div>
      </div>

      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:14px">
        <!-- [0] Changes -->
        <div
          data-testid="builds-panel-0"
          style="position:relative;flex:2.4;min-height:0;border:1px solid {panelBorder(
            0,
          )};border-radius:4px;padding:12px 14px 10px;display:flex;flex-direction:column"
        >
          <div
            style="position:absolute;top:-8px;left:10px;background:#0a0e13;padding:0 6px;font-size:12px;color:{panelTitleColor(
              0,
            )}"
          >
            {builds.panels.changes.title}
            <span style="color:rgba(196,216,232,.4)">{changesSubtitle}</span>
          </div>
          <div data-testid="builds-changes-body" style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:2px">
            {#if repoTree}
              {#if !currentIndexState || currentIndexState.status === "loading"}
                <div style="color:rgba(196,216,232,.5)">{builds.repoBrowser.loadingText}</div>
              {:else if currentIndexState.status === "error"}
                <div style="color:#e0453c">{builds.repoBrowser.errorText}</div>
              {:else}
                {#each currentEntries as entry, i (entry.type + ":" + entry.path)}
                  <div
                    role="button"
                    tabindex="0"
                    class="builds-row"
                    data-testid="builds-tree-row"
                    data-entry-type={entry.type}
                    data-entry-name={entry.name}
                    onclick={() => {
                      if (!repoTree) return;
                      repoTree = { ...repoTree, selectedIdx: i };
                      activateEntry(entry);
                    }}
                    onkeydown={(e) => {
                      if (e.key === "Enter" || e.key === " ") activateEntry(entry);
                    }}
                    style="cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:1px 4px;border-radius:2px;{i ===
                    repoTree.selectedIdx
                      ? 'background:rgba(224,69,60,.18);color:#f0e7e4'
                      : 'color:rgba(196,216,232,.7)'}"
                  >
                    <span style="color:#5fc6b4">{iconFor(entry)}</span> {entry.name}
                  </div>
                {/each}
              {/if}
            {:else}
              {#each renderedDoc as l, i (i)}
                <div style={l.style}>{l.t}</div>
              {/each}
            {/if}
          </div>
        </div>

        <!-- Command log -->
        <div
          style="position:relative;flex:1;min-height:0;border:1px solid rgba(224,69,60,.35);border-radius:4px;padding:12px 14px 10px;display:flex;flex-direction:column"
        >
          <div
            style="position:absolute;top:-8px;left:10px;background:#0a0e13;padding:0 6px;font-size:12px;color:rgba(224,69,60,.85)"
          >
            {builds.panels.commandLog.title}
          </div>
          <div style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:6px">
            {#each builds.commandLog as line, li (li)}
              <div style="color:{commandLogColors[li] ?? commandLogColors[commandLogColors.length - 1]}">
                {#each tokenizeLogLine(line) as token, ti (ti)}
                  {#if token.kind === "emphasis"}<span style="color:rgba(217,176,74,.9)">{token.text}</span
                    >{:else if token.kind === "link"}<a href={token.href} target="_blank" rel="noreferrer"
                      >{token.text}</a
                    >{:else}{token.text}{/if}
                {/each}
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .builds-row:hover {
    background: rgba(224, 69, 60, 0.12);
  }
</style>
