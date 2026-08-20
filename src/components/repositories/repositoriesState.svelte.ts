// RepositoriesState — the Repositories (lazygit clone) view's reactive core, extracted
// from Repositories.svelte during the folder+state-class relocation refactor. See
// Repositories.svelte's own header comment for the view's behavior; every
// `$state`/`$derived`/`$effect` here (and its accompanying comment) is
// moved verbatim from the original monolith — no reactivity, timing, or
// behavior change.
import type { CollectionEntry } from "astro:content";
import type { RepositoriesData } from "../../lib/data";
import type { Commit } from "../../lib/commits";
import { untrack } from "svelte";
import { classifyBody, classifyDoc, colorFor, docColors } from "../../lib/docline";
import {
  findFile,
  buildTree,
  flattenVisible,
  repoFileText,
  type RepoFile,
  type RepoIndex,
  type FlatTreeRow,
  type TokenSpan,
} from "../../lib/repoTree";
import { fetchLiveCommits } from "../../lib/githubCommits";
import { fetchCommitTree, fetchCommitFileContent } from "../../lib/githubTrees";

// Mirrors Editor.svelte's own `EditorLine` export structurally — a plain
// .ts module can't import a named type from a .svelte file under `tsc`
// (only svelte-check's virtual modules allow that, and this file is also
// type-checked by plain tsc via `pnpm check`), so this is kept in sync by
// shape rather than by import. Editor.svelte remains the source of truth.
interface EditorLine {
  n: number;
  t: string | TokenSpan[];
  style: string;
}

export interface RepoRow {
  /** Repo name — also the fetch key (`/generated/repos/{key}.json`) and
   * the GitHub repo name for commit/tree/content requests. */
  key: string;
  branch: string;
  mark: string;
  isAllProjects: boolean;
}

type RepoIndexState = { status: "loading" } | { status: "error" } | { status: "ready"; index: RepoIndex };

type TreeSource =
  | { kind: "working"; repoName: string }
  | { kind: "commit"; repoName: string; sha: string; sha8: string; paths: string[] };

// The Files pane is a lazygit-style tree — the FULL nested tree renders
// at once (not cwd-style `path` descent), ALL dirs expanded by default, and collapse state is opt-in per dir path
// (`collapsedDirs`, cloned-on-write to stay a fresh Set for Svelte's
// reactivity, matching this file's existing `{...spread}` convention for
// plain objects). `selectedIdx` indexes into the FLATTENED visible-rows
// list (`currentRows` below), not any one directory's children.
interface RepoTreeState {
  source: TreeSource;
  collapsedDirs: Set<string>;
  selectedIdx: number;
}

interface PreviewState {
  repoName: string;
  path: string;
  status: "loading" | "error" | "binary" | "ready";
  lines: string[];
}

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

export class RepositoriesState {
  constructor(
    private readonly repositoriesFn: () => RepositoriesData,
    private readonly projectsFn: () => CollectionEntry<"repositories">[],
    private readonly commitsByRepoFn: () => Record<string, Commit[]>,
  ) {
    // ---------------------------------------------------------------------
    // In-flight fetch tracking -> panel [3] spinner.
    // ---------------------------------------------------------------------
    $effect(() => {
      if (Object.keys(this.fetchingRepos).length === 0) return;
      const id = setInterval(() => {
        this.spinnerFrame = (this.spinnerFrame + 1) % this.repositories.spinner.frames.length;
      }, 220);
      return () => clearInterval(id);
    });

    $effect(() => {
      if (!this.repoTree) {
        this.preview = null;
        return;
      }
      const entry = this.currentRows[this.repoTree.selectedIdx];
      if (!entry || entry.type !== "file") {
        this.preview = null;
        return;
      }
      const source = this.repoTree.source;
      const repoName = source.repoName;
      const path = entry.path;

      if (source.kind === "working") {
        const st = this.repoIndexCache[repoName];
        if (!st || st.status !== "ready") {
          this.preview = null;
          return;
        }
        const file = findFile(st.index.files, path);
        this.preview = file ? { repoName, path, status: "ready", lines: repoFileText(file) } : null;
        return;
      }

      this.preview = { repoName, path, status: "loading", lines: [] };
      let cancelled = false;
      this.beginFetch(repoName);
      fetchCommitFileContent(repoName, path, source.sha, source.sha8).then((result) => {
        this.endFetch(repoName);
        if (cancelled) return;
        if (!result) {
          this.preview = { repoName, path, status: "error", lines: [] };
        } else if (result.kind === "binary") {
          this.preview = { repoName, path, status: "binary", lines: [] };
        } else {
          this.preview = { repoName, path, status: "ready", lines: result.lines };
        }
      });
      return () => {
        cancelled = true;
      };
    });

    // all-projects is pinned first AND selected by default, so the Files
    // pane must show its tree on mount rather than
    // waiting for a click/Enter on panel [3]. `untrack()` (this file already
    // relies on it for beginFetch/endFetch above) keeps this a one-shot
    // mount-time effect with no tracked dependencies — it must not re-fire
    // every time `flatRepos` is recomputed. Runs client-side only (an
    // `$effect`, not top-level script) since this is an Astro island and a
    // top-level `fetch("/generated/...")` call would execute during SSR.
    $effect(() => {
      untrack(() => {
        this.activateRepo(0);
      });
    });

    $effect(() => {
      const repo = this.selectedRepo;
      if (!repo || repo.isAllProjects) return;
      const repoName = repo.key;
      if (this.liveCommits[repoName]) return;
      let cancelled = false;
      this.beginFetch(repoName);
      fetchLiveCommits(repoName).then((result) => {
        this.endFetch(repoName);
        if (cancelled || !result) return;
        this.liveCommits = { ...this.liveCommits, [repoName]: result };
      });
      return () => {
        cancelled = true;
      };
    });
  }

  get repositories(): RepositoriesData {
    return this.repositoriesFn();
  }
  get projects(): CollectionEntry<"repositories">[] {
    return this.projectsFn();
  }
  get commitsByRepo(): Record<string, Commit[]> {
    return this.commitsByRepoFn();
  }

  sortedProjects = $derived([...this.projects].sort((a, b) => a.data.order - b.data.order));

  /** The doc panel [0] shows before anything has been browsed ("Panel [0] =
   * preview pane: project doc initially, selected file's content while
   * browsing"). There is no per-project selection UI — panel [2] is the
   * tree browser — so this is simply the first project by frontmatter
   * `order`. */
  defaultProject = $derived(this.sortedProjects[0]);

  renderedDoc = $derived(
    this.defaultProject?.body
      ? classifyBody(this.defaultProject.body, "project").map((l) => ({ t: l.t, style: colorFor(l.kind, "project") }))
      : [],
  );

  // ---------------------------------------------------------------------
  // Panel [3]: flat repo list (every project's repos, in frontmatter
  // `order`) + the virtual all-projects entry.
  // ---------------------------------------------------------------------

  // all-projects is pinned FIRST (not appended last) and is the default
  // selection (`selectedRepoIdx = $state(0)` below points at it) — the
  // Files pane loads its tree on mount too (see the mount effect further
  // down).
  flatRepos = $derived.by((): RepoRow[] => {
    const rows: RepoRow[] = [
      { key: this.repositories.allProjects.name, branch: this.repositories.allProjects.branch, mark: "•", isAllProjects: true },
    ];
    for (const p of this.sortedProjects) {
      p.data.repos.forEach((r, i) => {
        rows.push({ key: r.name, branch: r.branch, mark: i === 0 ? "*" : "•", isAllProjects: false });
      });
    }
    return rows;
  });

  selectedRepoIdx = $state(0);
  selectedCommitIdx = $state(0);
  /** 0-4, matching the five panel numbers (0 = Changes, 1 = Status, etc.). */
  focusedPanel = $state<0 | 1 | 2 | 3 | 4>(2);

  selectedRepo = $derived(this.flatRepos[this.selectedRepoIdx]);

  projectCount = $derived(this.sortedProjects.length);
  repoCount = $derived(this.sortedProjects.reduce((n, p) => n + p.data.repos.length, 0));

  // ---------------------------------------------------------------------
  // In-flight fetch tracking -> panel [3] spinner. A counter (not a Set) per repo name: a repo can have more than one fetch
  // overlapping (its live-commit refresh alongside a commit-tree fetch, or a
  // tree fetch alongside a file-content fetch), and the spinner must stay up
  // until every one of them has settled.
  // ---------------------------------------------------------------------

  fetchingRepos = $state<Record<string, number>>({});

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
  beginFetch(repoName: string) {
    untrack(() => {
      this.fetchingRepos = { ...this.fetchingRepos, [repoName]: (this.fetchingRepos[repoName] ?? 0) + 1 };
    });
  }
  endFetch(repoName: string) {
    untrack(() => {
      const current = this.fetchingRepos[repoName] ?? 0;
      const next = { ...this.fetchingRepos };
      if (current <= 1) delete next[repoName];
      else next[repoName] = current - 1;
      this.fetchingRepos = next;
    });
  }
  isFetching(repoName: string): boolean {
    return (this.fetchingRepos[repoName] ?? 0) > 0;
  }

  spinnerFrame = $state(0);

  // ---------------------------------------------------------------------
  // Panel [2]: tree browsing — either a repo's working tree (fetched once,
  // lines already loaded) or a commit snapshot (paths only; each file's
  // content is fetched lazily when previewed/opened).
  // ---------------------------------------------------------------------

  repoIndexCache = $state<Record<string, RepoIndexState>>({});

  repoTree = $state<RepoTreeState | null>(null);

  /** Set when a commit-tree fetch fails: on failure this shows a
   * transient, data-driven error line and keeps the current tree (whatever
   * panel [2] already had stays exactly as it was; this is a one-off status
   * line in panel [0], not a panel takeover). Cleared at the start of the
   * next commit-tree attempt. */
  commitFetchError = $state<string | null>(null);

  currentFiles = $derived.by((): RepoFile[] | null => {
    if (!this.repoTree) return null;
    if (this.repoTree.source.kind === "working") {
      const st = this.repoIndexCache[this.repoTree.source.repoName];
      if (!st || st.status !== "ready") return null;
      return st.index.files;
    }
    return this.repoTree.source.paths.map((p) => ({ path: p, lines: [] }));
  });

  /** Only meaningful for a "working" source — a commit source's `paths` are
   * only ever installed into repoTree once already fetched successfully
   * (see openCommitTree below), so there's no separate loading/error state
   * to render for it. */
  workingTreeStatus = $derived.by((): "loading" | "error" | "ready" | null => {
    if (!this.repoTree || this.repoTree.source.kind !== "working") return null;
    const st = this.repoIndexCache[this.repoTree.source.repoName];
    if (!st) return "loading";
    return st.status;
  });

  // Split into two deriveds (rather than one that rebuilds+flattens
  // together) so toggling a single dir's collapse state re-flattens without
  // rebuilding the whole tree from the flat file list.
  currentTree = $derived(this.currentFiles ? buildTree(this.currentFiles) : null);
  currentRows = $derived.by((): FlatTreeRow[] => {
    if (!this.repoTree || !this.currentTree) return [];
    return flattenVisible(this.currentTree, this.repoTree.collapsedDirs);
  });

  filesSubtitleValue = $derived(
    this.repoTree
      ? this.repoTree.source.kind === "commit"
        ? `${this.repoTree.source.repoName} @${this.repoTree.source.sha8}`
        : this.repoTree.source.repoName
      : "",
  );
  filesSubtitle = $derived(this.repositories.panels.files.subtitleTemplate.replace("{value}", this.filesSubtitleValue));

  async ensureRepoIndex(repoName: string) {
    const existing = this.repoIndexCache[repoName];
    if (existing && existing.status !== "error") return;
    this.repoIndexCache = { ...this.repoIndexCache, [repoName]: { status: "loading" } };
    this.beginFetch(repoName);
    try {
      const res = await fetch(`/generated/repos/${repoName}.json`);
      if (!res.ok) throw new Error(String(res.status));
      const index = (await res.json()) as RepoIndex;
      this.repoIndexCache = { ...this.repoIndexCache, [repoName]: { status: "ready", index } };
    } catch {
      this.repoIndexCache = { ...this.repoIndexCache, [repoName]: { status: "error" } };
    } finally {
      this.endFetch(repoName);
    }
  }

  /** Single click OR Enter on a panel [3] row loads that repo's working
   * tree into panel [2] — there is no separate select-then-open step. */
  openRepo(r: RepoRow) {
    this.repoTree = { source: { kind: "working", repoName: r.key }, collapsedDirs: new Set(), selectedIdx: 0 };
    this.commitFetchError = null;
    void this.ensureRepoIndex(r.key);
  }

  /**
   * Fetch a commit's tree and, on success, swap panel [2] over to it.
   * On failure, panel [2] is left exactly as it was (working tree, a
   * different commit, or empty) and `commitFetchError` carries a transient
   * message for panel [0] instead.
   */
  async openCommitTree(repoName: string, commit: Commit) {
    this.commitFetchError = null;
    this.beginFetch(repoName);
    const paths = await fetchCommitTree(repoName, commit.sha, commit.sha8);
    this.endFetch(repoName);
    if (!paths) {
      this.commitFetchError = this.repositories.commitBrowser.errorText;
      return;
    }
    this.repoTree = {
      source: { kind: "commit", repoName, sha: commit.sha ?? commit.sha8, sha8: commit.sha8, paths },
      collapsedDirs: new Set(),
      selectedIdx: 0,
    };
  }

  // ---------------------------------------------------------------------
  // Panel [0]: file preview (working-tree files resolve synchronously;
  // commit-tree files are fetched lazily per selection).
  // ---------------------------------------------------------------------

  preview = $state<PreviewState | null>(null);

  previewLines = $derived.by((): { n: number | null; t: string; style: string }[] => {
    if (!this.preview || this.preview.status !== "ready") return [];
    const isMd = this.preview.path.toLowerCase().endsWith(".md");
    if (isMd) {
      const kinds = classifyDoc(this.preview.lines, "project");
      return this.preview.lines.map((raw, i) => ({ n: null, t: raw === "" ? " " : raw, style: colorFor(kinds[i], "project") }));
    }
    return this.preview.lines.map((raw, i) => ({ n: i + 1, t: raw === "" ? " " : raw, style: docColors.p }));
  });

  changesSubtitleValue = $derived(
    this.preview ? `${this.preview.repoName}/${this.preview.path}` : this.defaultProject ? `${this.defaultProject.id}.md` : "",
  );
  changesSubtitle = $derived(this.repositories.panels.changes.subtitleTemplate.replace("{value}", this.changesSubtitleValue));

  // ---------------------------------------------------------------------
  // Editor (full-screen, opened only by Enter on a file — clicking a file
  // just previews it in panel [0]).
  // ---------------------------------------------------------------------

  editorFile = $state<EditorFileState | null>(null);
  editorRef = $state<{
    handleKey: (e: KeyboardEvent) => boolean;
    runExCommand: (cmd: string) => { recognized: boolean; error?: string };
  } | null>(null);

  async openFileInEditor(entry: FlatTreeRow) {
    if (!this.repoTree || entry.type !== "file") return;
    const source = this.repoTree.source;
    const repoName = source.repoName;
    const path = entry.path;

    if (source.kind === "working") {
      const st = this.repoIndexCache[repoName];
      if (!st || st.status !== "ready") return;
      const file = findFile(st.index.files, path);
      if (!file) return;
      this.editorFile = {
        repoName,
        path,
        lines: repoFileText(file),
        tokens: file.tok ? (file.lines as TokenSpan[][]) : undefined,
        palette: file.tok ? st.index.palette : undefined,
      };
      return;
    }

    if (this.preview && this.preview.repoName === repoName && this.preview.path === path) {
      if (this.preview.status === "ready") {
        this.editorFile = { repoName, path, lines: this.preview.lines };
        return;
      }
      if (this.preview.status === "binary") return; // can't open a binary file in the text editor
    }

    this.beginFetch(repoName);
    const result = await fetchCommitFileContent(repoName, path, source.sha, source.sha8);
    this.endFetch(repoName);
    if (!result) {
      this.preview = { repoName, path, status: "error", lines: [] };
    } else if (result.kind === "binary") {
      this.preview = { repoName, path, status: "binary", lines: [] };
    } else {
      this.editorFile = { repoName, path, lines: result.lines };
    }
  }

  /** Enter/click on a dir toggles its collapse state; Enter/click on a
   * file previews/opens it. There is no "up" entry type — the whole tree
   * renders at once. */
  activateEntry(entry: FlatTreeRow, opts: { openEditor: boolean }) {
    if (!this.repoTree) return;
    if (entry.type === "dir") {
      this.toggleCollapse(entry.path);
      return;
    }
    if (opts.openEditor) void this.openFileInEditor(entry);
  }

  toggleCollapse(dirPath: string) {
    if (!this.repoTree) return;
    const next = new Set(this.repoTree.collapsedDirs);
    if (next.has(dirPath)) next.delete(dirPath);
    else next.add(dirPath);
    this.repoTree = { ...this.repoTree, collapsedDirs: next };
  }

  editorLines = $derived.by((): EditorLine[] => {
    if (!this.editorFile) return [];
    const isMd = this.editorFile.path.toLowerCase().endsWith(".md");
    if (isMd) {
      const kinds = classifyDoc(this.editorFile.lines, "project");
      return this.editorFile.lines.map((raw, i) => ({
        n: i + 1,
        t: raw === "" ? " " : raw,
        style: colorFor(kinds[i], "project"),
      }));
    }
    if (this.editorFile.tokens) {
      const tokens = this.editorFile.tokens;
      return this.editorFile.lines.map((raw, i) => ({
        n: i + 1,
        // A blank line reconstructs to an empty token line ([]); keep the
        // same "render blank lines as a single space" convention flat text
        // already uses, so the cursor cell and vim column math never see an
        // empty string only tokenized files could produce.
        t: raw === "" ? " " : tokens[i],
        style: docColors.p,
      }));
    }
    return this.editorFile.lines.map((raw, i) => ({ n: i + 1, t: raw === "" ? " " : raw, style: docColors.p }));
  });

  editorPalette = $derived(this.editorFile?.palette ?? []);

  editorFileName = $derived(this.editorFile ? this.editorFile.path.split("/").pop()! : "");

  closeEditor() {
    this.editorFile = null;
    this.editorRef = null;
  }

  // ---------------------------------------------------------------------
  // Panel [3] / [4] selection
  // ---------------------------------------------------------------------

  selectRepo(delta: number) {
    const n = this.flatRepos.length;
    if (n === 0) return;
    this.selectedRepoIdx = (((this.selectedRepoIdx + delta) % n) + n) % n;
    this.selectedCommitIdx = 0;
  }

  activateRepo(i: number) {
    const r = this.flatRepos[i];
    if (!r) return;
    this.selectedRepoIdx = i;
    this.selectedCommitIdx = 0;
    this.openRepo(r);
  }

  /** Panel [4] tracks ONLY this — the repo highlighted in panel [3] — never
   * anything from panel [2]/[0]'s own navigation (this is what fixes the
   * "commits change while browsing files" bug report). */
  commits = $derived.by((): Commit[] => {
    const repo = this.selectedRepo;
    if (!repo || repo.isAllProjects) return [];
    return this.liveCommits[repo.key] ?? this.commitsByRepo[repo.key] ?? [];
  });
  clampedCommitIdx = $derived(this.commits.length ? Math.min(this.selectedCommitIdx, this.commits.length - 1) : 0);

  selectCommit(delta: number) {
    const n = this.commits.length;
    if (n === 0) return;
    this.selectedCommitIdx = (((this.clampedCommitIdx + delta) % n) + n) % n;
  }

  async activateCommit(i: number) {
    this.focusedPanel = 4;
    this.selectedCommitIdx = i;
    const repo = this.selectedRepo;
    if (!repo || repo.isAllProjects) return;
    const c = this.commits[i];
    if (!c) return;
    await this.openCommitTree(repo.key, c);
  }

  openSelectedCommitOnGithub() {
    const repo = this.selectedRepo;
    if (!repo || repo.isAllProjects) return;
    const c = this.commits[this.clampedCommitIdx];
    if (c?.html_url) window.open(c.html_url, "_blank");
  }

  moveTreeSelection(delta: number) {
    if (!this.repoTree) return;
    const n = this.currentRows.length;
    if (n === 0) return;
    this.repoTree = { ...this.repoTree, selectedIdx: (((this.repoTree.selectedIdx + delta) % n) + n) % n };
  }

  // ---------------------------------------------------------------------
  // Live commit refresh, rekeyed to the panel [3] selection — anything else
  // recreates the coupling that caused the commits-change-on-file-move bug.
  // Skipped for the virtual all-projects entry: it isn't a real GitHub
  // repo, so a fetch for it would only fail and waste one of the 60
  // unauthenticated requests/hour.
  // ---------------------------------------------------------------------

  liveCommits = $state<Record<string, Commit[]>>({});

  // ---------------------------------------------------------------------
  // Focus styling helpers
  // ---------------------------------------------------------------------

  panelBorder(n: 0 | 1 | 2 | 3 | 4): string {
    return this.focusedPanel === n ? "#e0453c" : "rgba(224,69,60,.35)";
  }
  panelTitleColor(n: 0 | 1 | 2 | 3 | 4): string {
    return this.focusedPanel === n ? "#e0453c" : "rgba(224,69,60,.85)";
  }
}
