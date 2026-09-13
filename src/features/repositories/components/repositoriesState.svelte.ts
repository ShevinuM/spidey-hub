import type { CollectionEntry } from "astro:content";
import type { RepositoriesData } from "../../../common/lib/data";
import type { Commit } from "../../../common/lib/commits";
import { untrack } from "svelte";
import { classifyBody, classifyDoc, colorFor, docColors } from "../../../common/lib/docline";
import {
  findFile,
  buildTree,
  flattenVisible,
  repoFileText,
  type RepoFile,
  type RepoIndex,
  type FlatTreeRow,
  type TokenSpan,
} from "../../../common/lib/repo-tree";
import { fetchLiveCommits } from "../lib/github-commits";
import { fetchCommitTree, fetchCommitFileContent } from "../lib/github-trees";
import { agoLabel } from "../../../common/lib/ago-label";

// Mirrors Editor.svelte's `EditorLine` type by shape, not import, because a plain `.ts` file can't import a type from a `.svelte` module under plain `tsc`.
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

// The full nested tree renders at once (not cwd-style descent); `selectedIdx` indexes the flattened visible-rows list (`currentRows` below), not any one directory's children.
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
  /** Set only for a working-tree file `generate.mjs` tokenized; commit/GitHub-fetched content always falls back to flat `lines`. */
  tokens?: TokenSpan[][] | undefined;
  palette?: string[] | undefined;
}

interface EditorFileState {
  repoName: string;
  path: string;
  lines: string[];
  /** Same tokenized-only caveat as `PreviewState.tokens` above. */
  tokens?: TokenSpan[][] | undefined;
  palette?: string[] | undefined;
}

export class RepositoriesState {
  constructor(
    private readonly repositoriesFn: () => RepositoriesData,
    private readonly projectsFn: () => CollectionEntry<"repositories">[],
    private readonly commitsByRepoFn: () => Record<string, Commit[]>,
  ) {
    // Computed in a mount-time effect rather than `$derived` since a build-time value would mismatch the client's own clock at hydration (same reasoning as StatusBar.svelte's clock).
    $effect(() => {
      untrack(() => {
        const dates = Object.values(this.commitsByRepoFn())
          .map((commits) => commits[0]?.date)
          .filter((d): d is string => !!d)
          .map((d) => Date.parse(d))
          .filter((n) => !Number.isNaN(n));
        if (dates.length === 0) return;
        const ago = agoLabel(Math.max(...dates), Date.now());
        this.lastPushLabel = this.repositoriesFn().statusLine.lastPushTemplate.replace("{value}", `${ago} ago`);
      });
    });

    // Fetched at runtime, not built in — an Astro island can't read this during SSR, and `build:fixtures` overlays the fixture version onto dist only after the build finishes.
    $effect(() => {
      let cancelled = false;
      fetch("/generated/contributions.json")
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          return res.json() as Promise<{ days: { date: string; level: number }[] }>;
        })
        .then((data) => {
          if (cancelled) return;
          const sorted = [...data.days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
          // Trim to the trailing 364 days (52 full weeks) — GraphQL can
          // return a handful of extra leading days depending on the exact
          // fetch instant; sequential 7-day chunking (no weekday alignment,
          // matching the mockup's own flatMap) needs an exact multiple of 7.
          this.contributionLevels = sorted.slice(-364).map((d) => d.level);
        })
        .catch(() => {
          if (!cancelled) this.contributionLevels = [];
        });
      return () => {
        cancelled = true;
      };
    });

    // ---------------------------------------------------------------------
    // In-flight fetch tracking -> panel [1] spinner.
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
        this.preview = file
          ? {
              repoName,
              path,
              status: "ready",
              lines: repoFileText(file),
              tokens: file.tok ? (file.lines as TokenSpan[][]) : undefined,
              palette: file.tok ? st.index.palette : undefined,
            }
          : null;
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

    // all-projects is selected by default, so this mount-time effect (`untrack()`ed so it doesn't re-fire on `flatRepos` recomputes) loads its tree without waiting for a click.
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

  /** Set once, client-side, by the mount effect above; stays `null` until then, or forever when no commit snapshot carries a `date`. */
  lastPushLabel = $state<string | null>(null);

  /** Oldest-first contribution levels (0-4); stays empty until the mount fetch resolves, or forever on failure. */
  contributionLevels = $state<number[]>([]);

  /** Idle-row dot color: brighter blue within ~30 days of the last push, dimmer otherwise — distinct from the single gold dot marking the currently open repo. */
  idleDotColor(repoKey: string): string {
    const date = this.commitsByRepo[repoKey]?.[0]?.date;
    if (!date) return "#3c78aa";
    const ageMs = Date.now() - Date.parse(date);
    if (Number.isNaN(ageMs)) return "#3c78aa";
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    return ageMs <= THIRTY_DAYS_MS ? "#4a9fe0" : "#3c78aa";
  }

  sortedProjects = $derived([...this.projects].sort((a, b) => a.data.order - b.data.order));

  /** Falls back to the first project by frontmatter `order` since there's no per-project selection UI — panel [2] (the tree browser) is the only way to change what's browsed. */
  defaultProject = $derived(this.sortedProjects[0]);

  renderedDoc = $derived(
    this.defaultProject?.body
      ? classifyBody(this.defaultProject.body, "project").map((l) => ({ t: l.t, style: colorFor(l.kind, "project") }))
      : [],
  );

  // ---------------------------------------------------------------------
  // Panel [1]: flat repo list (every project's repos, in frontmatter
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
  /** 0-4 in reading order: Status, Repositories, Files, Content, Commits; defaults to 2 (Files) since the mount effect loads the all-projects tree immediately. */
  focusedPanel = $state<0 | 1 | 2 | 3 | 4>(2);

  selectedRepo = $derived(this.flatRepos[this.selectedRepoIdx]);

  projectCount = $derived(this.sortedProjects.length);
  repoCount = $derived(this.sortedProjects.reduce((n, p) => n + p.data.repos.length, 0));

  // A counter, not a Set, since a repo's live-commit and commit-tree/file fetches can overlap and the spinner must stay up until all of them settle.

  fetchingRepos = $state<Record<string, number>>({});

  // `untrack()` is load-bearing, not decorative — without it, reading and rewriting `fetchingRepos` here would register it as a dependency of whichever effect called this, retriggering that effect forever.
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

  /** Set when a commit-tree fetch fails; shows a transient error line without disturbing whatever panel [2] already had. */
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

  /** Only meaningful for a "working" source; a commit source's `paths` are only ever installed once already fetched successfully, so it has no separate loading/error state. */
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

  /** Single click OR Enter on a panel [1] row loads that repo's working
   * tree into panel [2] — there is no separate select-then-open step. */
  openRepo(r: RepoRow) {
    this.repoTree = { source: { kind: "working", repoName: r.key }, collapsedDirs: new Set(), selectedIdx: 0 };
    this.commitFetchError = null;
    void this.ensureRepoIndex(r.key);
  }

  /** Fetches a commit's tree and swaps panel [2] to it on success; on failure, panel [2] is left untouched and `commitFetchError` carries a message for panel [3]. */
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
  // Panel [3]: file preview (working-tree files resolve synchronously;
  // commit-tree files are fetched lazily per selection).
  // ---------------------------------------------------------------------

  preview = $state<PreviewState | null>(null);

  previewLines = $derived.by((): { n: number | null; t: string | TokenSpan[]; style: string }[] => {
    if (!this.preview || this.preview.status !== "ready") return [];
    const isMd = this.preview.path.toLowerCase().endsWith(".md");
    if (isMd) {
      const kinds = classifyDoc(this.preview.lines, "project");
      return this.preview.lines.map((raw, i) => ({ n: null, t: raw === "" ? " " : raw, style: colorFor(kinds[i], "project") }));
    }
    if (this.preview.tokens) {
      const tokens = this.preview.tokens;
      return this.preview.lines.map((raw, i) => ({ n: i + 1, t: raw === "" ? " " : tokens[i], style: docColors.p }));
    }
    return this.preview.lines.map((raw, i) => ({ n: i + 1, t: raw === "" ? " " : raw, style: docColors.p }));
  });

  /** Hex colors indexed by a tokenized `previewLines[].t`'s paletteIndex — same shape as `editorPalette` further down, so the same per-repo palette resolves both. */
  previewPalette = $derived(this.preview?.palette ?? []);

  changesSubtitleValue = $derived(
    this.preview ? `${this.preview.repoName}/${this.preview.path}` : this.defaultProject ? `${this.defaultProject.id}.md` : "",
  );
  changesSubtitle = $derived(this.repositories.panels.changes.subtitleTemplate.replace("{value}", this.changesSubtitleValue));

  // ---------------------------------------------------------------------
  // Editor (full-screen, opened only by Enter on a file — clicking a file
  // just previews it in panel [3]).
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

  /** Enter/click toggles a dir's collapse state or previews/opens a file; there's no "up" entry since the whole tree renders at once. */
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
  // Panel [1] / [4] selection
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

  /** Panel [4] tracks only the repo highlighted in panel [1], never panel [2]/[0]'s own navigation. */
  commits = $derived.by((): Commit[] => {
    const repo = this.selectedRepo;
    if (!repo || repo.isAllProjects) return [];
    return this.liveCommits[repo.key] ?? this.commitsByRepo[repo.key] ?? [];
  });
  clampedCommitIdx = $derived(this.commits.length ? Math.min(this.selectedCommitIdx, this.commits.length - 1) : 0);

  /** "{branch} · {count} commits" — both real: branch from the panel [1] selection, count from the actually-rendered commit list. */
  commitsSubtitle = $derived(
    this.repositories.panels.commits.subtitleTemplate
      .replace("{branch}", this.selectedRepo?.branch ?? "")
      .replace("{count}", String(this.commits.length)),
  );

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

  // Rekeyed to the panel [1] selection; skipped for the virtual all-projects entry since it isn't a real GitHub repo and would just fail, wasting one of the 60 unauthenticated requests/hour.

  liveCommits = $state<Record<string, Commit[]>>({});

  // ---------------------------------------------------------------------
  // Focus styling helpers
  // ---------------------------------------------------------------------

  panelBorder(n: 0 | 1 | 2 | 3 | 4): string {
    return this.focusedPanel === n ? "#e0453c" : "rgba(224,69,60,.35)";
  }
}
