// GrepOverlayState — the grep overlay's reactive core, extracted from
// GrepOverlay.svelte during the folder+state-class relocation refactor. See
// GrepOverlay.svelte's own header comment for the view's behavior; every
// `$state`/`$derived`/`$effect` here (and its accompanying comment) is
// moved verbatim from the original monolith — no reactivity, timing, or
// behavior change. The keymap itself (handleKey/openSelectedRow/pickRow/
// close/isOpen/openWithQuery) stays on GrepOverlay.svelte, the orchestrator
// — see that file's own comment.
import type { GrepData } from "../../common/lib/data";
import { search, formatCount, type RepoFile } from "../../lib/grep";
import { pushPasteTarget, removePasteTarget } from "../../common/lib/paste-targets";
import { iconSvgForPath } from "../../lib/fileIcons";

const INDEX_PATH = "/generated/grep-index.json";
const PASTE_TARGET_ID = "grep-query";

type IndexState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; files: RepoFile[] }
  | { status: "error" };

export interface Row {
  idx: number;
  icon: string;
  path: string;
  pathColor: string;
  selected: boolean;
  pos: string;
  pre: string;
  mat: string;
  post: string;
  style: string;
}

export interface PreviewLine {
  n: number;
  on: boolean;
  pre: string;
  mat: string;
  post: string;
  style: string;
  nStyle: string;
}

export class GrepOverlayState {
  constructor(private readonly grepFn: () => GrepData) {
    // ---------------------------------------------------------------------
    // ResizeObservers (Homepage.dc.html gListRef/gPreviewRef, lines 850-869):
    // row-fit measured off the container's *rendered* height, min 4/6 rows.
    // ---------------------------------------------------------------------

    $effect(() => {
      if (!this.listEl) return;
      const el = this.listEl;
      const measure = () => {
        const rows = Math.max(4, Math.floor(el.clientHeight / 22));
        if (rows !== this.listVis) this.listVis = rows;
      };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    });

    $effect(() => {
      if (!this.previewEl) return;
      const el = this.previewEl;
      const measure = () => {
        const rows = Math.max(6, Math.floor(el.clientHeight / 21));
        if (rows !== this.previewVis) this.previewVis = rows;
      };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    });

    /** Ctrl-b ] paste-target registration — active
     * only while the overlay itself is open, pushed/popped by id so it never
     * disturbs whatever else is registered above or below it in the stack. */
    $effect(() => {
      if (!this.open) return;
      pushPasteTarget({
        id: PASTE_TARGET_ID,
        insert: (text: string) => {
          this.query += text;
          this.sel = 0;
        },
      });
      return () => removePasteTarget(PASTE_TARGET_ID);
    });
  }

  get grep(): GrepData {
    return this.grepFn();
  }

  open = $state(false);
  query = $state("");
  sel = $state(0);
  listVis = $state(14);
  previewVis = $state(20);
  indexState = $state<IndexState>({ status: "idle" });

  listEl = $state<HTMLDivElement | null>(null);
  previewEl = $state<HTMLDivElement | null>(null);

  files = $derived(this.indexState.status === "ready" ? this.indexState.files : []);
  showLoading = $derived(this.indexState.status === "idle" || this.indexState.status === "loading");
  showError = $derived(this.indexState.status === "error");

  hits = $derived(search(this.files, this.query));
  gsel = $derived(Math.min(this.sel, Math.max(0, this.hits.length - 1)));
  qLen = $derived(this.query.trim().length);
  countText = $derived(formatCount(this.hits, this.files, this.query));
  modeLine = $derived(this.qLen > 0 ? this.grep.modeLine.liveGrep : this.grep.modeLine.repoFiles);
  emptyStateText = $derived(this.grep.emptyStateTemplate.replace("{n}", String(this.files.length)));

  start = $derived(
    Math.max(
      0,
      Math.min(Math.max(0, this.hits.length - this.listVis), Math.max(0, this.gsel - Math.floor(this.listVis / 2))),
    ),
  );
  cur = $derived(this.hits[this.gsel]);
  curFile = $derived(this.cur ? this.files.find((f) => f.path === this.cur.path) : undefined);
  pStart = $derived(
    this.cur && this.cur.line
      ? Math.max(
          0,
          Math.min(
            (this.curFile?.lines.length ?? 0) - this.previewVis,
            this.cur.line - Math.floor(this.previewVis / 2),
          ),
        )
      : 0,
  );

  grepFile = $derived(this.cur ? this.cur.path : this.grep.noResultsFile);
  grepFilePos = $derived(
    this.cur && this.cur.line
      ? this.grep.filePosTemplate.replace("{line}", String(this.cur.line)).replace("{col}", String(this.cur.col))
      : this.curFile
        ? this.grep.fileLinesTemplate.replace("{n}", String(this.curFile.lines.length))
        : "",
  );

  grepRows = $derived.by((): Row[] =>
    this.hits.slice(this.start, this.start + this.listVis).map((h, i): Row => {
      const at = this.start + i;
      const selected = at === this.gsel;
      return {
        idx: at,
        icon: iconSvgForPath(h.path),
        path: h.path,
        pathColor: selected ? "#f4ece9" : "rgba(196,216,232,.66)",
        selected,
        pos: h.line ? this.grep.rowPosTemplate.replace("{line}", String(h.line)).replace("{col}", String(h.col)) : "",
        pre: h.pre,
        mat: h.mat,
        post: h.post,
        style:
          "cursor:pointer;display:flex;align-items:center;gap:6px;padding:0 8px;height:22px;line-height:22px;white-space:pre;overflow:hidden;" +
          (selected ? "background:rgba(224,69,60,.22);color:#f4ece9" : "color:rgba(196,216,232,.66)"),
      };
    }),
  );

  previewLines = $derived.by((): PreviewLine[] => {
    if (!this.curFile) return [];
    const q = this.query.trim().toLowerCase();
    const base = Math.max(0, this.pStart);
    return this.curFile.lines.slice(base, base + this.previewVis).map((t, i): PreviewLine => {
      const n = base + i + 1;
      const on = this.cur?.line === n && this.qLen > 0;
      const at = this.qLen ? t.toLowerCase().indexOf(q) : -1;
      return {
        n,
        on,
        pre: at === -1 ? (t === "" ? " " : t) : t.slice(0, at),
        mat: at === -1 ? "" : t.slice(at, at + this.qLen),
        post: at === -1 ? "" : t.slice(at + this.qLen),
        style:
          "display:grid;grid-template-columns:44px 1fr;gap:10px;white-space:pre;height:21px;line-height:21px;overflow:hidden;" +
          (on ? "background:rgba(95,198,180,.12);color:#e6f2ef" : "color:rgba(196,216,232,.62)"),
        nStyle: on ? "text-align:right;color:#e0453c" : "text-align:right;color:rgba(196,216,232,.28)",
      };
    });
  });

  // ---------------------------------------------------------------------
  // Index loading
  // ---------------------------------------------------------------------

  private async ensureIndexLoaded() {
    if (this.indexState.status === "loading" || this.indexState.status === "ready") return;
    this.indexState = { status: "loading" };
    try {
      const res = await fetch(INDEX_PATH);
      if (!res.ok) throw new Error(String(res.status));
      const loaded = (await res.json()) as RepoFile[];
      this.indexState = { status: "ready", files: loaded };
    } catch {
      this.indexState = { status: "error" };
    }
  }

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  openOverlay(): void {
    this.open = true;
    this.query = "";
    this.sel = 0;
    void this.ensureIndexLoaded();
  }

  closeOverlay(): void {
    this.open = false;
  }

  moveSelection(delta: 1 | -1): void {
    const n = Math.max(1, this.hits.length);
    this.sel = delta === 1 ? (this.sel + 1) % n : (this.sel + n - 1) % n;
  }

  selectRow(idx: number): void {
    this.sel = idx;
  }

  backspaceQuery(): void {
    this.query = this.query.slice(0, -1);
    this.sel = 0;
  }

  clearQuery(): void {
    this.query = "";
    this.sel = 0;
  }

  typeChar(ch: string): void {
    this.query += ch;
    this.sel = 0;
  }
}
