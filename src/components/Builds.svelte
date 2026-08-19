<script lang="ts">
  // Builds (lazygit clone) view — design/Homepage.dc.html lines 338-397
  // (five-panel layout: [1] Status, [2] Files, [3] Local Repositories,
  // [4] Commits, [0] Changes, plus the unnumbered Command log panel).
  //
  // PLAN.md Phase 4 ("Builds rework") replaces the Phase 5 interaction model
  // with a lazygit-style flat-repo-list flow, fixing two live user bug
  // reports along the way:
  //   - Panel [3] "Local Repositories" is now a FLAT list of every repo
  //     across every project, plus a virtual "all-projects" entry (every
  //     project's .md doc, browsable like a repo — see builds.yaml's
  //     `allProjects` key and scripts/generate.mjs's all-projects.json).
  //     A single click OR Enter loads that repo's working tree into panel
  //     [2] — no more separate "select" vs "open" step.
  //   - Panel [2] "Files" is the tree browser for whatever's selected in
  //     [3] (its title reads "<repo>" or "<repo> @<sha8>" while browsing a
  //     commit snapshot instead of the working tree). Selecting/clicking a
  //     FILE previews it in panel [0]; Enter opens the full-screen vim
  //     Editor. Dirs/`../` navigate the same way on click or Enter.
  //   - Panel [4] "Commits" tracks ONLY the panel [3] selection — moving
  //     through files/dirs in [2]/[0] must never change it (2026-08-17 bug
  //     report: "commits change dynamically when I move across files"; the
  //     root cause was panel [4] deriving its repo from the same
  //     project-list selection panel [2] used to double as). Commit rows are
  //     no longer `<a target="_blank">`: click/Enter fetches that commit's
  //     tree (src/lib/githubTrees.ts) into panel [2] instead, with a
  //     lazygit-style braille spinner on the panel [3] repo row while any
  //     fetch for that repo is in flight; `o` opens the commit on GitHub
  //     (the only surviving external-link path, documented in help.yaml).
  //     Selecting the all-projects entry shows a data-driven "local only"
  //     line instead (it isn't a real remote).
  //
  // Keymap entry point unchanged from Phase 5: Terminal.svelte drives a
  // single global keydown listener and, while `view === "builds"`, delegates
  // to this component's exported `handleKey()` via `bind:this` *before* its
  // own generic q/Esc-to-dashboard fallback (removed sitewide in Phase 1
  // anyway) — see PLAN.md Phase 3's delegation-flip note for how the file
  // editor gets first refusal over GrepOverlay while it's open.
  import type { CollectionEntry } from "astro:content";
  import type { BuildsData } from "../lib/data";
  import type { Commit } from "../lib/commits";
  import { untrack } from "svelte";
  import { classifyBody, classifyDoc, colorFor, docColors } from "../lib/docline";
  import {
    findFile,
    buildTree,
    flattenVisible,
    repoFileText,
    type RepoFile,
    type RepoIndex,
    type FlatTreeRow,
    type TokenSpan,
  } from "../lib/repoTree";
  import { fetchLiveCommits } from "../lib/githubCommits";
  import { fetchCommitTree, fetchCommitFileContent } from "../lib/githubTrees";
  import { iconSvgForPath } from "../lib/fileIcons";
  import Editor, { type EditorLine } from "./Editor.svelte";

  interface Props {
    builds: BuildsData;
    projects: CollectionEntry<"projects">[];
    commitsByRepo: Record<string, Commit[]>;
    /** PLAN.md Iteration 3 Phase 6 item 6.1 — see PaneTree.svelte's own
     * header comment (multi-instance data-copy-source gating); ANDed with
     * each panel's own `focusedPanel === N` check below (both must hold:
     * this pane is the window's focused one, AND this is its focused
     * panel). */
    isFocused: boolean;
  }

  const { builds, projects, commitsByRepo, isFocused }: Props = $props();

  const sortedProjects = $derived([...projects].sort((a, b) => a.data.order - b.data.order));

  /** The doc panel [0] shows before anything has been browsed (PLAN.md
   * Phase 4 panel model: "Panel [0] = preview pane (project doc initially;
   * selected file's content while browsing)"). There is no more
   * per-project selection UI — panel [2] is the tree browser now — so this
   * is simply the first project by frontmatter `order`. */
  const defaultProject = $derived(sortedProjects[0]);

  const renderedDoc = $derived(
    defaultProject?.body
      ? classifyBody(defaultProject.body, "project").map((l) => ({ t: l.t, style: colorFor(l.kind, "project") }))
      : [],
  );

  // ---------------------------------------------------------------------
  // Panel [3]: flat repo list (every project's repos, in frontmatter
  // `order`) + the virtual all-projects entry.
  // ---------------------------------------------------------------------

  interface RepoRow {
    /** Repo name — also the fetch key (`/generated/repos/{key}.json`) and
     * the GitHub repo name for commit/tree/content requests. */
    key: string;
    branch: string;
    mark: string;
    isAllProjects: boolean;
  }

  // PLAN.md Iteration 4 item 5: all-projects is pinned FIRST (not appended
  // last) and is the default selection (`selectedRepoIdx = $state(0)` below
  // now points at it) — the Files pane loads its tree on mount too (see the
  // mount effect further down).
  const flatRepos = $derived.by((): RepoRow[] => {
    const rows: RepoRow[] = [
      { key: builds.allProjects.name, branch: builds.allProjects.branch, mark: "•", isAllProjects: true },
    ];
    for (const p of sortedProjects) {
      p.data.repos.forEach((r, i) => {
        rows.push({ key: r.name, branch: r.branch, mark: i === 0 ? "*" : "•", isAllProjects: false });
      });
    }
    return rows;
  });

  let selectedRepoIdx = $state(0);
  let selectedCommitIdx = $state(0);
  /** 0-4, matching the five panel numbers (0 = Changes, 1 = Status, etc.). */
  let focusedPanel = $state<0 | 1 | 2 | 3 | 4>(2);

  const selectedRepo = $derived(flatRepos[selectedRepoIdx]);

  const projectCount = $derived(sortedProjects.length);
  const repoCount = $derived(sortedProjects.reduce((n, p) => n + p.data.repos.length, 0));

  // ---------------------------------------------------------------------
  // In-flight fetch tracking -> panel [3] spinner (PLAN.md Phase 4 item 2).
  // A counter (not a Set) per repo name: a repo can have more than one fetch
  // overlapping (its live-commit refresh alongside a commit-tree fetch, or a
  // tree fetch alongside a file-content fetch), and the spinner must stay up
  // until every one of them has settled.
  // ---------------------------------------------------------------------

  let fetchingRepos = $state<Record<string, number>>({});

  // `untrack()` is load-bearing here, not decorative: beginFetch/endFetch
  // are called from inside two $effects (the live-commit refresh below and
  // the file-preview effect further down). Reading `fetchingRepos` to
  // spread it (even via this helper, several calls deep) registers it as a
  // dependency of whichever effect is CURRENTLY running when the helper is
  // called — so writing it right back would immediately re-trigger that
  // same effect, which calls beginFetch/endFetch again, forever. Confirmed
  // by reproduction: without untrack(), the live-commits effect fired in a
  // sub-millisecond loop (dozens of duplicate fetches per test) — read and
  // write both need to happen outside the caller's reactive tracking scope.
  function beginFetch(repoName: string) {
    untrack(() => {
      fetchingRepos = { ...fetchingRepos, [repoName]: (fetchingRepos[repoName] ?? 0) + 1 };
    });
  }
  function endFetch(repoName: string) {
    untrack(() => {
      const current = fetchingRepos[repoName] ?? 0;
      const next = { ...fetchingRepos };
      if (current <= 1) delete next[repoName];
      else next[repoName] = current - 1;
      fetchingRepos = next;
    });
  }
  function isFetching(repoName: string): boolean {
    return (fetchingRepos[repoName] ?? 0) > 0;
  }

  let spinnerFrame = $state(0);
  $effect(() => {
    if (Object.keys(fetchingRepos).length === 0) return;
    const id = setInterval(() => {
      spinnerFrame = (spinnerFrame + 1) % builds.spinner.frames.length;
    }, 220);
    return () => clearInterval(id);
  });

  // ---------------------------------------------------------------------
  // Panel [2]: tree browsing — either a repo's working tree (fetched once,
  // lines already loaded) or a commit snapshot (paths only; each file's
  // content is fetched lazily when previewed/opened).
  // ---------------------------------------------------------------------

  type RepoIndexState = { status: "loading" } | { status: "error" } | { status: "ready"; index: RepoIndex };
  let repoIndexCache = $state<Record<string, RepoIndexState>>({});

  type TreeSource =
    | { kind: "working"; repoName: string }
    | { kind: "commit"; repoName: string; sha: string; sha8: string; paths: string[] };

  // PLAN.md Iteration 4 item 4: the Files pane is now a lazygit-style tree —
  // the FULL nested tree renders at once (no more cwd-style `path` descent),
  // ALL dirs expanded by default, and collapse state is opt-in per dir path
  // (`collapsedDirs`, cloned-on-write to stay a fresh Set for Svelte's
  // reactivity, matching this file's existing `{...spread}` convention for
  // plain objects). `selectedIdx` indexes into the FLATTENED visible-rows
  // list (`currentRows` below), not any one directory's children.
  interface RepoTreeState {
    source: TreeSource;
    collapsedDirs: Set<string>;
    selectedIdx: number;
  }
  let repoTree = $state<RepoTreeState | null>(null);

  /** Set when a commit-tree fetch fails — PLAN.md Phase 4 item 4: "on
   * failure show a transient, data-driven error line ... and keep current
   * tree" (whatever panel [2] already had stays exactly as it was; this is
   * a one-off status line in panel [0], not a panel takeover). Cleared at
   * the start of the next commit-tree attempt. */
  let commitFetchError = $state<string | null>(null);

  const currentFiles = $derived.by((): RepoFile[] | null => {
    if (!repoTree) return null;
    if (repoTree.source.kind === "working") {
      const st = repoIndexCache[repoTree.source.repoName];
      if (!st || st.status !== "ready") return null;
      return st.index.files;
    }
    return repoTree.source.paths.map((p) => ({ path: p, lines: [] }));
  });

  /** Only meaningful for a "working" source — a commit source's `paths` are
   * only ever installed into repoTree once already fetched successfully
   * (see openCommitTree below), so there's no separate loading/error state
   * to render for it. */
  const workingTreeStatus = $derived.by((): "loading" | "error" | "ready" | null => {
    if (!repoTree || repoTree.source.kind !== "working") return null;
    const st = repoIndexCache[repoTree.source.repoName];
    if (!st) return "loading";
    return st.status;
  });

  // Split into two deriveds (rather than one that rebuilds+flattens
  // together) so toggling a single dir's collapse state re-flattens without
  // rebuilding the whole tree from the flat file list.
  const currentTree = $derived(currentFiles ? buildTree(currentFiles) : null);
  const currentRows = $derived.by((): FlatTreeRow[] => {
    if (!repoTree || !currentTree) return [];
    return flattenVisible(currentTree, repoTree.collapsedDirs);
  });

  const filesSubtitleValue = $derived(
    repoTree
      ? repoTree.source.kind === "commit"
        ? `${repoTree.source.repoName} @${repoTree.source.sha8}`
        : repoTree.source.repoName
      : "",
  );
  const filesSubtitle = $derived(builds.panels.files.subtitleTemplate.replace("{value}", filesSubtitleValue));

  async function ensureRepoIndex(repoName: string) {
    const existing = repoIndexCache[repoName];
    if (existing && existing.status !== "error") return;
    repoIndexCache = { ...repoIndexCache, [repoName]: { status: "loading" } };
    beginFetch(repoName);
    try {
      const res = await fetch(`/generated/repos/${repoName}.json`);
      if (!res.ok) throw new Error(String(res.status));
      const index = (await res.json()) as RepoIndex;
      repoIndexCache = { ...repoIndexCache, [repoName]: { status: "ready", index } };
    } catch {
      repoIndexCache = { ...repoIndexCache, [repoName]: { status: "error" } };
    } finally {
      endFetch(repoName);
    }
  }

  /** Single click OR Enter on a panel [3] row loads that repo's working
   * tree into panel [2] (PLAN.md Phase 4 item 2 — no more separate
   * select-then-open step). */
  function openRepo(r: RepoRow) {
    repoTree = { source: { kind: "working", repoName: r.key }, collapsedDirs: new Set(), selectedIdx: 0 };
    commitFetchError = null;
    void ensureRepoIndex(r.key);
  }

  /**
   * Fetch a commit's tree and, on success, swap panel [2] over to it.
   * On failure, panel [2] is left exactly as it was (working tree, a
   * different commit, or empty) and `commitFetchError` carries a transient
   * message for panel [0] instead — PLAN.md Phase 4 item 4's "keep current
   * tree" requirement.
   */
  async function openCommitTree(repoName: string, commit: Commit) {
    commitFetchError = null;
    beginFetch(repoName);
    const paths = await fetchCommitTree(repoName, commit.sha, commit.sha8);
    endFetch(repoName);
    if (!paths) {
      commitFetchError = builds.commitBrowser.errorText;
      return;
    }
    repoTree = {
      source: { kind: "commit", repoName, sha: commit.sha ?? commit.sha8, sha8: commit.sha8, paths },
      collapsedDirs: new Set(),
      selectedIdx: 0,
    };
  }

  // ---------------------------------------------------------------------
  // Panel [0]: file preview (working-tree files resolve synchronously;
  // commit-tree files are fetched lazily per selection).
  // ---------------------------------------------------------------------

  interface PreviewState {
    repoName: string;
    path: string;
    status: "loading" | "error" | "binary" | "ready";
    lines: string[];
  }
  let preview = $state<PreviewState | null>(null);

  $effect(() => {
    if (!repoTree) {
      preview = null;
      return;
    }
    const entry = currentRows[repoTree.selectedIdx];
    if (!entry || entry.type !== "file") {
      preview = null;
      return;
    }
    const source = repoTree.source;
    const repoName = source.repoName;
    const path = entry.path;

    if (source.kind === "working") {
      const st = repoIndexCache[repoName];
      if (!st || st.status !== "ready") {
        preview = null;
        return;
      }
      const file = findFile(st.index.files, path);
      preview = file ? { repoName, path, status: "ready", lines: repoFileText(file) } : null;
      return;
    }

    preview = { repoName, path, status: "loading", lines: [] };
    let cancelled = false;
    beginFetch(repoName);
    fetchCommitFileContent(repoName, path, source.sha, source.sha8).then((result) => {
      endFetch(repoName);
      if (cancelled) return;
      if (!result) {
        preview = { repoName, path, status: "error", lines: [] };
      } else if (result.kind === "binary") {
        preview = { repoName, path, status: "binary", lines: [] };
      } else {
        preview = { repoName, path, status: "ready", lines: result.lines };
      }
    });
    return () => {
      cancelled = true;
    };
  });

  const previewLines = $derived.by((): { n: number | null; t: string; style: string }[] => {
    if (!preview || preview.status !== "ready") return [];
    const isMd = preview.path.toLowerCase().endsWith(".md");
    if (isMd) {
      const kinds = classifyDoc(preview.lines, "project");
      return preview.lines.map((raw, i) => ({ n: null, t: raw === "" ? " " : raw, style: colorFor(kinds[i], "project") }));
    }
    return preview.lines.map((raw, i) => ({ n: i + 1, t: raw === "" ? " " : raw, style: docColors.p }));
  });

  const changesSubtitleValue = $derived(
    preview ? `${preview.repoName}/${preview.path}` : defaultProject ? `${defaultProject.id}.md` : "",
  );
  const changesSubtitle = $derived(builds.panels.changes.subtitleTemplate.replace("{value}", changesSubtitleValue));

  // ---------------------------------------------------------------------
  // Editor (full-screen, opened only by Enter on a file — clicking a file
  // just previews it in panel [0], per PLAN.md Phase 4 item 3).
  // ---------------------------------------------------------------------

  interface EditorFileState {
    repoName: string;
    path: string;
    lines: string[];
    /** Present only for a working-tree file generate.mjs tokenized —
     * commit-tree/GitHub-fetched content is never tokenized (no build step
     * runs over it), so it always falls back to flat `lines` rendering. */
    tokens?: TokenSpan[][];
    palette?: string[];
  }
  let editorFile = $state<EditorFileState | null>(null);
  let editorRef = $state<{
    handleKey: (e: KeyboardEvent) => boolean;
    runExCommand: (cmd: string) => { recognized: boolean; error?: string };
  } | null>(null);

  async function openFileInEditor(entry: FlatTreeRow) {
    if (!repoTree || entry.type !== "file") return;
    const source = repoTree.source;
    const repoName = source.repoName;
    const path = entry.path;

    if (source.kind === "working") {
      const st = repoIndexCache[repoName];
      if (!st || st.status !== "ready") return;
      const file = findFile(st.index.files, path);
      if (!file) return;
      editorFile = {
        repoName,
        path,
        lines: repoFileText(file),
        tokens: file.tok ? (file.lines as TokenSpan[][]) : undefined,
        palette: file.tok ? st.index.palette : undefined,
      };
      return;
    }

    if (preview && preview.repoName === repoName && preview.path === path) {
      if (preview.status === "ready") {
        editorFile = { repoName, path, lines: preview.lines };
        return;
      }
      if (preview.status === "binary") return; // can't open a binary file in the text editor
    }

    beginFetch(repoName);
    const result = await fetchCommitFileContent(repoName, path, source.sha, source.sha8);
    endFetch(repoName);
    if (!result) {
      preview = { repoName, path, status: "error", lines: [] };
    } else if (result.kind === "binary") {
      preview = { repoName, path, status: "binary", lines: [] };
    } else {
      editorFile = { repoName, path, lines: result.lines };
    }
  }

  /** Enter/click on a dir toggles its collapse state (PLAN.md Iteration 4
   * item 4); Enter/click on a file previews/opens it, exactly as before.
   * There is no more "up" entry type — the whole tree renders at once. */
  function activateEntry(entry: FlatTreeRow, opts: { openEditor: boolean }) {
    if (!repoTree) return;
    if (entry.type === "dir") {
      toggleCollapse(entry.path);
      return;
    }
    if (opts.openEditor) void openFileInEditor(entry);
  }

  function toggleCollapse(dirPath: string) {
    if (!repoTree) return;
    const next = new Set(repoTree.collapsedDirs);
    if (next.has(dirPath)) next.delete(dirPath);
    else next.add(dirPath);
    repoTree = { ...repoTree, collapsedDirs: next };
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
    if (editorFile.tokens) {
      const tokens = editorFile.tokens;
      return editorFile.lines.map((raw, i) => ({
        n: i + 1,
        // A blank line reconstructs to an empty token line ([]); keep the
        // same "render blank lines as a single space" convention flat text
        // already uses, so the cursor cell and vim column math never see an
        // empty string only tokenized files could produce.
        t: raw === "" ? " " : tokens[i],
        style: docColors.p,
      }));
    }
    return editorFile.lines.map((raw, i) => ({ n: i + 1, t: raw === "" ? " " : raw, style: docColors.p }));
  });

  const editorPalette = $derived(editorFile?.palette ?? []);

  const editorFileName = $derived(editorFile ? editorFile.path.split("/").pop()! : "");

  function closeEditor() {
    editorFile = null;
    editorRef = null;
  }

  // ---------------------------------------------------------------------
  // Panel [3] / [4] selection
  // ---------------------------------------------------------------------

  function selectRepo(delta: number) {
    const n = flatRepos.length;
    if (n === 0) return;
    selectedRepoIdx = ((selectedRepoIdx + delta) % n + n) % n;
    selectedCommitIdx = 0;
  }

  function activateRepo(i: number) {
    const r = flatRepos[i];
    if (!r) return;
    selectedRepoIdx = i;
    selectedCommitIdx = 0;
    openRepo(r);
  }

  // PLAN.md Iteration 4 item 5: all-projects is pinned first AND selected by
  // default, so the Files pane must show its tree on mount rather than
  // waiting for a click/Enter on panel [3]. `untrack()` (this file already
  // relies on it for beginFetch/endFetch above) keeps this a one-shot
  // mount-time effect with no tracked dependencies — it must not re-fire
  // every time `flatRepos` is recomputed. Runs client-side only (an
  // `$effect`, not top-level script) since this is an Astro island and a
  // top-level `fetch("/generated/...")` call would execute during SSR.
  $effect(() => {
    untrack(() => {
      activateRepo(0);
    });
  });

  /** Panel [4] tracks ONLY this — the repo highlighted in panel [3] — never
   * anything from panel [2]/[0]'s own navigation (PLAN.md Phase 4 item 4,
   * fixing the "commits change while browsing files" bug report). */
  const commits = $derived.by((): Commit[] => {
    const repo = selectedRepo;
    if (!repo || repo.isAllProjects) return [];
    return liveCommits[repo.key] ?? commitsByRepo[repo.key] ?? [];
  });
  const clampedCommitIdx = $derived(commits.length ? Math.min(selectedCommitIdx, commits.length - 1) : 0);

  function selectCommit(delta: number) {
    const n = commits.length;
    if (n === 0) return;
    selectedCommitIdx = ((clampedCommitIdx + delta) % n + n) % n;
  }

  async function activateCommit(i: number) {
    focusedPanel = 4;
    selectedCommitIdx = i;
    const repo = selectedRepo;
    if (!repo || repo.isAllProjects) return;
    const c = commits[i];
    if (!c) return;
    await openCommitTree(repo.key, c);
  }

  function openSelectedCommitOnGithub() {
    const repo = selectedRepo;
    if (!repo || repo.isAllProjects) return;
    const c = commits[clampedCommitIdx];
    if (c?.html_url) window.open(c.html_url, "_blank");
  }

  function moveTreeSelection(delta: number) {
    if (!repoTree) return;
    const n = currentRows.length;
    if (n === 0) return;
    repoTree = { ...repoTree, selectedIdx: ((repoTree.selectedIdx + delta) % n + n) % n };
  }

  // ---------------------------------------------------------------------
  // Live commit refresh (PLAN.md "Client commit refresh"), rekeyed to the
  // panel [3] selection (was the active-project derivation pre-Phase-4 —
  // exactly the coupling that caused the commits-change-on-file-move bug).
  // Skipped for the virtual all-projects entry: it isn't a real GitHub
  // repo, so a fetch for it would only fail and waste one of the 60
  // unauthenticated requests/hour.
  // ---------------------------------------------------------------------

  let liveCommits = $state<Record<string, Commit[]>>({});

  $effect(() => {
    const repo = selectedRepo;
    if (!repo || repo.isAllProjects) return;
    const repoName = repo.key;
    if (liveCommits[repoName]) return;
    let cancelled = false;
    beginFetch(repoName);
    fetchLiveCommits(repoName).then((result) => {
      endFetch(repoName);
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

  /** Forwards to the embedded Editor's own `runExCommand` (PLAN.md Phase 5C
   * "lift the Phase-3 command state machine from Editor.svelte, do NOT
   * rebuild parsing") — Terminal.svelte's site-wide Cmdline box calls this
   * when its ex-mode Enter fires, and only falls through to the site-wide
   * command set when the result comes back `recognized: false`. A no-op
   * (unrecognized) when the editor isn't actually open — shouldn't happen
   * in practice since Terminal only opens ex mode while `isEditorOpen()` is
   * true, but keeps this safe to call unconditionally regardless. */
  export function runEditorExCommand(cmd: string): { recognized: boolean; error?: string } {
    if (!editorFile || !editorRef) return { recognized: false };
    return editorRef.runExCommand(cmd);
  }

  export function handleKey(e: KeyboardEvent): boolean {
    if (editorFile) {
      return editorRef ? editorRef.handleKey(e) : false;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return false;

    if (e.key === "0" || e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") {
      const n = Number(e.key) as 0 | 1 | 2 | 3 | 4;
      focusedPanel = n;
      return true;
    }

    const k = e.key.toLowerCase();

    if (focusedPanel === 2) {
      if (!repoTree) {
        return false;
      }
      if (e.key === "ArrowDown") {
        moveTreeSelection(1);
        return true;
      }
      if (e.key === "ArrowUp") {
        moveTreeSelection(-1);
        return true;
      }
      if (e.key === "Enter") {
        const entry = currentRows[repoTree.selectedIdx];
        if (entry) activateEntry(entry, { openEditor: true });
        return true;
      }
      // The whole tree renders at once, expand/collapse in place — h/
      // Backspace/ArrowLeft have no "go up a level" to perform here.
      return false;
    }

    if (focusedPanel === 3) {
      if (e.key === "ArrowDown") {
        selectRepo(1);
        return true;
      }
      if (e.key === "ArrowUp") {
        selectRepo(-1);
        return true;
      }
      if (e.key === "Enter") {
        activateRepo(selectedRepoIdx);
        return true;
      }
      return false;
    }

    if (focusedPanel === 4) {
      if (e.key === "ArrowDown") {
        selectCommit(1);
        return true;
      }
      if (e.key === "ArrowUp") {
        selectCommit(-1);
        return true;
      }
      if (e.key === "Enter") {
        void activateCommit(clampedCommitIdx);
        return true;
      }
      if (k === "o") {
        openSelectedCommitOnGithub();
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
    palette={editorPalette}
    labels={builds.editor}
    breadcrumbLeft={editorFile.repoName}
    breadcrumbRight={editorFile.path}
    {isFocused}
    onClose={closeEditor}
  />
{:else}
  <div style="flex:1;min-height:0;display:flex">
    <div style="flex:1;min-height:0;display:flex;gap:12px;padding:16px 16px 14px;font-size:13px">
      <div style="width:38%;min-width:0;display:flex;flex-direction:column;gap:14px">
        <!-- [1] Status -->
        <div
          data-testid="builds-panel-1"
          data-copy-source={isFocused && focusedPanel === 1 ? "" : undefined}
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

        <!-- [2] Files (tree browser) -->
        <div
          data-testid="builds-panel-2"
          data-copy-source={isFocused && focusedPanel === 2 ? "" : undefined}
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
            {#if repoTree}<span style="color:rgba(196,216,232,.4)">{filesSubtitle}</span>{/if}
          </div>
          <div style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:3px">
            {#if !repoTree}
              <div style="color:rgba(196,216,232,.5)">{builds.repoBrowser.emptyText}</div>
            {:else if workingTreeStatus === "loading"}
              <div style="color:rgba(196,216,232,.5)">{builds.repoBrowser.loadingText}</div>
            {:else if workingTreeStatus === "error"}
              <div style="color:#e0453c">{builds.repoBrowser.errorText}</div>
            {:else}
              {#each currentRows as entry, i (entry.type + ":" + entry.path)}
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
                    if (!repoTree) return;
                    repoTree = { ...repoTree, selectedIdx: i };
                    activateEntry(entry, { openEditor: false });
                  }}
                  onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") activateEntry(entry, { openEditor: true });
                  }}
                  style="cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:1px 4px 1px {4 +
                    entry.depth * 14}px;border-radius:2px;{i === repoTree.selectedIdx
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
        </div>

        <!-- [3] Local Repositories (flat list + all-projects) -->
        <div
          data-testid="builds-panel-3"
          data-copy-source={isFocused && focusedPanel === 3 ? "" : undefined}
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
          <div style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:3px">
            {#each flatRepos as repo, i (repo.key)}
              <div
                role="button"
                tabindex="0"
                class="builds-row"
                data-testid="builds-repo-row"
                data-repo-name={repo.key}
                data-all-projects={repo.isAllProjects ? "true" : "false"}
                onclick={() => {
                  focusedPanel = 3;
                  activateRepo(i);
                }}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") activateRepo(i);
                }}
                style="cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(196,216,232,.75);{focusedPanel ===
                  3 && i === selectedRepoIdx
                  ? 'background:rgba(224,69,60,.22)'
                  : ''}"
              >
                <span style="color:#5fc6b4">{repo.mark}</span> {repo.key}
                <span style="color:rgba(217,176,74,.75)">{repo.branch}</span>
                {#if isFetching(repo.key)}
                  <span
                    data-testid="builds-repo-spinner"
                    role="status"
                    aria-label={builds.spinner.ariaLabel}
                    style="color:#5fc6b4"
                  >
                    {builds.spinner.label} {builds.spinner.frames[spinnerFrame]}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </div>

        <!-- [4] Commits (tracks ONLY the panel [3] selection) -->
        <div
          data-testid="builds-panel-4"
          data-copy-source={isFocused && focusedPanel === 4 ? "" : undefined}
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
          <div style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:3px">
            {#if selectedRepo?.isAllProjects}
              <div style="color:rgba(196,216,232,.5)">{builds.panels.commits.localOnlyText}</div>
              <div style="color:rgba(196,216,232,.35)">{builds.allProjects.description}</div>
            {:else}
              {#each commits as c, i (c.sha8)}
                <div
                  role="button"
                  tabindex="0"
                  class="builds-row"
                  data-testid="builds-commit-row"
                  data-sha8={c.sha8}
                  data-sha={c.sha ?? ""}
                  data-html-url={c.html_url}
                  onclick={() => void activateCommit(i)}
                  onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") void activateCommit(i);
                  }}
                  style="cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;{focusedPanel ===
                    4 && i === clampedCommitIdx
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
        </div>
      </div>

      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:14px">
        <!-- [0] Changes (preview) -->
        <div
          data-testid="builds-panel-0"
          data-copy-source={isFocused && focusedPanel === 0 ? "" : undefined}
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
            {#if commitFetchError}
              <div data-testid="builds-commit-error" style="color:#e0453c">{commitFetchError}</div>
            {/if}
            {#if repoTree}
              {#if !preview}
                <!-- nothing selected in the tree yet -->
              {:else if preview.status === "loading"}
                <div style="color:rgba(196,216,232,.5)">{builds.filePreview.loadingText}</div>
              {:else if preview.status === "error"}
                <div style="color:#e0453c">{builds.filePreview.errorText}</div>
              {:else if preview.status === "binary"}
                <div style="color:#e0453c">{builds.filePreview.binaryText}</div>
              {:else}
                {#each previewLines as l, i (i)}
                  <div data-testid="builds-preview-line" style="display:flex;gap:12px">
                    {#if l.n !== null}<span style="flex:none;width:26px;text-align:right;color:rgba(224,69,60,.4)"
                        >{l.n}</span
                      >{/if}<span style={l.style}>{l.t}</span>
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
  .builds-row {
    /* PLAN.md Phase 4 item 4.6: rows are flex children of an
       overflow-y:auto column; without this they were flex-shrinking below
       their own line box under a full 15-commit live list (only 1 commit
       ships in the committed snapshot, so this never showed up pre-Phase-4)
       — glyphs rendered vertically clipped and rows overlapped. Pairs with
       the containers above switching from overflow:hidden to
       overflow-y:auto so a genuinely-too-long list scrolls instead of
       compressing. An explicit line-height (rather than the initial
       "normal", which resolves through getComputedStyle() as the literal
       string "normal" — unparseable as a number) also gives the row a
       concrete, measurable full-glyph height for the e2e assertion this
       fix shipped with (PLAN.md 4.6: "measuring commit-row bounding-box
       heights >= computed line-height"). */
    flex-shrink: 0;
    line-height: 1.6;
  }
  .builds-row:hover {
    background: rgba(224, 69, 60, 0.12);
  }
  /* PLAN.md Iteration 4 item 1 (builds part): fixed-width caret slot so
     dir/file rows' icons+names line up in a column regardless of whether a
     row is a dir (▾/▸) or a file (blank spacer of the same width). */
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
