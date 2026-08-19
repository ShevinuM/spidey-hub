<script lang="ts">
  // Grep overlay (design/Homepage.dc.html lines 400-439 markup; Component's
  // grepHits()/grepOpenRow()/grepKey()/gListRef/gPreviewRef/renderVals grep
  // block, lines 812-832 + 850-893 + 1032-1086).
  //
  // Always mounted (Terminal.svelte renders this once, unconditionally,
  // alongside whichever view is active) rather than conditionally by an
  // `open` prop: Terminal needs a live `bind:this` ref to call `handleKey()`
  // on *every* keydown regardless of whether the overlay is currently shown
  // — including the very first "/" press that opens it — so the component
  // owns its own `open` boolean internally and renders nothing until then.
  // This also satisfies "the overlay never mutates underlying view state":
  // the view beneath is never unmounted or told anything happened.
  //
  // `handleKey()`'s contract mirrors the prototype's own dispatch order
  // exactly (Homepage.dc.html line 980-983:
  // `if (this.state.grep) { this.grepKey(e); return; }` runs BEFORE the
  // bare-"/" open check, which itself runs before every other view's own
  // key handling). Terminal.svelte therefore calls this component's
  // handleKey() first, unconditionally, on every keydown:
  //   - closed + bare "/" (no meta/ctrl/alt)  -> preventDefault, open, true
  //   - closed + anything else                -> false (Terminal continues)
  //   - open (any key at all)                 -> always true — every key is
  //     "ours" while the overlay is up, exactly like the prototype's
  //     unconditional early return, but preventDefault is only ever called
  //     for the specific keys grepKey() itself preventDefaults (arrow/ctrl
  //     nav, Enter, Backspace, ctrl-u/w, printable chars) — never for Escape
  //     and never for an unrecognized modifier combo, so e.g. Cmd+L still
  //     reaches the browser even though it never reaches the view beneath.
  //
  // Index loading: a single canonical path, `/generated/grep-index.json`,
  // fetched lazily on first open (not eagerly — "load lazily at runtime,
  // fetch on first `/` press"). The *content* at that path is
  // swapped, not the path itself: `pnpm generate` writes the real 71-file
  // site-source index there for a normal build, while `pnpm build:fixtures`
  // (package.json) overwrites the built copy with the fixture's verbatim
  // 24-file prototype snapshot (`cp fixtures/grep-index.json
  // dist/generated/grep-index.json`) as its very last step. This means the
  // exact same JS bundle runs in both goldens and production — only the
  // JSON payload differs — at the cost of `astro dev` with
  // PORTFOLIO_FIXTURES=1 not serving the fixture index (unsupported; no
  // test or workflow needs it, since test:visual always goes through a full
  // `build:fixtures`).
  import type { ViewId } from "../lib/views";
  import { grepPathToView } from "../lib/views";
  import type { GrepData } from "../lib/data";
  import { search, formatCount, type RepoFile } from "../lib/grep";
  import { pushPasteTarget, removePasteTarget } from "../lib/pasteTargets";
  import { STATUS_BAR_HEIGHT_PX } from "../lib/layout";
  import { iconSvgForPath } from "../lib/fileIcons";

  interface Props {
    grep: GrepData;
    onNavigate: (view: ViewId) => void;
  }

  const { grep, onNavigate }: Props = $props();

  const INDEX_PATH = "/generated/grep-index.json";

  type IndexState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; files: RepoFile[] }
    | { status: "error" };

  let open = $state(false);
  let query = $state("");
  let sel = $state(0);
  let listVis = $state(14);
  let previewVis = $state(20);
  let indexState = $state<IndexState>({ status: "idle" });

  let listEl = $state<HTMLDivElement | null>(null);
  let previewEl = $state<HTMLDivElement | null>(null);

  const files = $derived(indexState.status === "ready" ? indexState.files : []);
  const showLoading = $derived(indexState.status === "idle" || indexState.status === "loading");
  const showError = $derived(indexState.status === "error");

  const hits = $derived(search(files, query));
  const gsel = $derived(Math.min(sel, Math.max(0, hits.length - 1)));
  const qLen = $derived(query.trim().length);
  const countText = $derived(formatCount(hits, files, query));
  const modeLine = $derived(qLen > 0 ? grep.modeLine.liveGrep : grep.modeLine.repoFiles);
  const emptyStateText = $derived(grep.emptyStateTemplate.replace("{n}", String(files.length)));

  const start = $derived(
    Math.max(0, Math.min(Math.max(0, hits.length - listVis), Math.max(0, gsel - Math.floor(listVis / 2)))),
  );
  const cur = $derived(hits[gsel]);
  const curFile = $derived(cur ? files.find((f) => f.path === cur.path) : undefined);
  const pStart = $derived(
    cur && cur.line ? Math.max(0, Math.min((curFile?.lines.length ?? 0) - previewVis, cur.line - Math.floor(previewVis / 2))) : 0,
  );

  const grepFile = $derived(cur ? cur.path : grep.noResultsFile);
  const grepFilePos = $derived(
    cur && cur.line
      ? grep.filePosTemplate.replace("{line}", String(cur.line)).replace("{col}", String(cur.col))
      : curFile
        ? grep.fileLinesTemplate.replace("{n}", String(curFile.lines.length))
        : "",
  );

  interface Row {
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

  const grepRows = $derived.by((): Row[] =>
    hits.slice(start, start + listVis).map((h, i): Row => {
      const at = start + i;
      const selected = at === gsel;
      return {
        idx: at,
        icon: iconSvgForPath(h.path),
        path: h.path,
        pathColor: selected ? "#f4ece9" : "rgba(196,216,232,.66)",
        selected,
        pos: h.line ? grep.rowPosTemplate.replace("{line}", String(h.line)).replace("{col}", String(h.col)) : "",
        pre: h.pre,
        mat: h.mat,
        post: h.post,
        style:
          "cursor:pointer;display:flex;align-items:center;gap:6px;padding:0 8px;height:22px;line-height:22px;white-space:pre;overflow:hidden;" +
          (selected ? "background:rgba(224,69,60,.22);color:#f4ece9" : "color:rgba(196,216,232,.66)"),
      };
    }),
  );

  interface PreviewLine {
    n: number;
    on: boolean;
    pre: string;
    mat: string;
    post: string;
    style: string;
    nStyle: string;
  }

  const previewLines = $derived.by((): PreviewLine[] => {
    if (!curFile) return [];
    const q = query.trim().toLowerCase();
    const base = Math.max(0, pStart);
    return curFile.lines.slice(base, base + previewVis).map((t, i): PreviewLine => {
      const n = base + i + 1;
      const on = cur?.line === n && qLen > 0;
      const at = qLen ? t.toLowerCase().indexOf(q) : -1;
      return {
        n,
        on,
        pre: at === -1 ? (t === "" ? " " : t) : t.slice(0, at),
        mat: at === -1 ? "" : t.slice(at, at + qLen),
        post: at === -1 ? "" : t.slice(at + qLen),
        style:
          "display:grid;grid-template-columns:44px 1fr;gap:10px;white-space:pre;height:21px;line-height:21px;overflow:hidden;" +
          (on ? "background:rgba(95,198,180,.12);color:#e6f2ef" : "color:rgba(196,216,232,.62)"),
        nStyle: on ? "text-align:right;color:#e0453c" : "text-align:right;color:rgba(196,216,232,.28)",
      };
    });
  });

  // ---------------------------------------------------------------------
  // ResizeObservers (Homepage.dc.html gListRef/gPreviewRef, lines 850-869):
  // row-fit measured off the container's *rendered* height, min 4/6 rows.
  // ---------------------------------------------------------------------

  $effect(() => {
    if (!listEl) return;
    const el = listEl;
    const measure = () => {
      const rows = Math.max(4, Math.floor(el.clientHeight / 22));
      if (rows !== listVis) listVis = rows;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });

  $effect(() => {
    if (!previewEl) return;
    const el = previewEl;
    const measure = () => {
      const rows = Math.max(6, Math.floor(el.clientHeight / 21));
      if (rows !== previewVis) previewVis = rows;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });

  // ---------------------------------------------------------------------
  // Index loading
  // ---------------------------------------------------------------------

  async function ensureIndexLoaded() {
    if (indexState.status === "loading" || indexState.status === "ready") return;
    indexState = { status: "loading" };
    try {
      const res = await fetch(INDEX_PATH);
      if (!res.ok) throw new Error(String(res.status));
      const loaded = (await res.json()) as RepoFile[];
      indexState = { status: "ready", files: loaded };
    } catch {
      indexState = { status: "error" };
    }
  }

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  function openOverlay() {
    open = true;
    query = "";
    sel = 0;
    void ensureIndexLoaded();
  }

  function closeOverlay() {
    open = false;
  }

  /** "grep is WINDOW chrome" — Terminal.svelte's
   * `setView()` calls this unconditionally on every switch (status-bar
   * click, any prefix target) so an open overlay never survives a window
   * change. A no-op when already closed. */
  export function close(): void {
    closeOverlay();
  }

  /** The site-wide Cmdline box's `:grep <query>`
   * command (`cmdline.yaml` "grep" action) reads this to decide whether
   * `:` should fall through to it at all: while grep is already open it
   * already owns every key itself (see handleKey() below), so Terminal's
   * own bare-`:`-opens-the-box fallback naturally never fires — this
   * export exists only so Terminal.svelte's tmux-prefix gating (mirroring
   * `statusBarRef.isPromptActive()`) can treat an open overlay the same
   * way, without needing a duplicate open/closed flag of its own. */
  export function isOpen(): boolean {
    return open;
  }

  /** `:grep <query>` — opens the overlay pre-filled AND
   * already searching (the live `hits`/`countText` derivations react to
   * `query` the instant it's set, same as normal typing). An empty
   * `query` behaves exactly like the bare `/` open path. */
  export function openWithQuery(query_: string): void {
    openOverlay();
    query = query_;
  }

  const PASTE_TARGET_ID = "grep-query";

  /** Ctrl-b ] paste-target registration — active
   * only while the overlay itself is open, pushed/popped by id so it never
   * disturbs whatever else is registered above or below it in the stack. */
  $effect(() => {
    if (!open) return;
    pushPasteTarget({
      id: PASTE_TARGET_ID,
      insert: (text: string) => {
        query += text;
        sel = 0;
      },
    });
    return () => removePasteTarget(PASTE_TARGET_ID);
  });

  /** Enter — Component.grepOpenRow() (lines 870-880): always closes;
   * navigates only when the selected row's path maps to a view. */
  function openSelectedRow() {
    const row = hits[Math.min(sel, hits.length - 1)];
    open = false;
    if (!row) return;
    const target = grepPathToView(row.path);
    if (target) onNavigate(target);
  }

  function pickRow(row: Row) {
    if (row.selected) openSelectedRow();
    else sel = row.idx;
  }

  /** Component.grepKey() (lines 881-893), ported key-for-key. See the file
   * header comment for the dispatch contract with Terminal.svelte. */
  export function handleKey(e: KeyboardEvent): boolean {
    if (!open) {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openOverlay();
        return true;
      }
      return false;
    }

    const k = e.key.toLowerCase();
    const n = Math.max(1, hits.length);

    if (e.key === "Escape" || (e.ctrlKey && k === "c")) {
      closeOverlay();
      return true;
    }
    if (e.key === "ArrowDown" || (e.ctrlKey && (k === "n" || k === "j"))) {
      e.preventDefault();
      sel = (sel + 1) % n;
      return true;
    }
    if (e.key === "ArrowUp" || (e.ctrlKey && (k === "p" || k === "k"))) {
      e.preventDefault();
      sel = (sel + n - 1) % n;
      return true;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      openSelectedRow();
      return true;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      query = query.slice(0, -1);
      sel = 0;
      return true;
    }
    if (e.ctrlKey && (k === "u" || k === "w")) {
      e.preventDefault();
      query = "";
      sel = 0;
      return true;
    }
    // Unrecognized modifier combos (e.g. Cmd+L) fall through untouched —
    // consumed (the view beneath never sees them either) but never
    // preventDefault-ed, matching Component.grepKey() line 891.
    if (e.metaKey || e.ctrlKey || e.altKey) return true;

    if (e.key.length === 1) {
      e.preventDefault();
      query += e.key;
      sel = 0;
      return true;
    }
    return true;
  }
</script>

{#if open}
  <!-- "Status bar is SESSION chrome, grep is
       WINDOW chrome": `bottom` stops exactly at the status bar's own
       height instead of the viewport edge, so the dim/blur backdrop never
       paints over it — the bar stays fully crisp and clickable while grep
       is open. StatusBar.svelte renders at a normal z-index *below* this
       fixed-position overlay, so clipping the backdrop's rect is enough on
       its own; no z-index war needed. -->
  <div
    data-testid="grep-overlay"
    style="position:fixed;left:0;top:0;right:0;bottom:{STATUS_BAR_HEIGHT_PX}px;z-index:40;background:rgba(6,9,13,.5);backdrop-filter:blur(2.5px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:4vh 3vw"
  >
    <div style="width:min(1480px,96vw);height:min(760px,80vh);display:flex;gap:12px;font-size:13px;line-height:1.62">
      <!-- Left pane -->
      <div
        style="position:relative;width:48%;min-width:0;box-sizing:border-box;display:flex;flex-direction:column;border:1px solid rgba(224,69,60,.55);border-radius:4px;background:rgba(9,13,18,.9);padding:10px 2px 6px"
      >
        <div
          style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:7px;background:#0a0e13;padding:0 10px;color:#e0453c;letter-spacing:.16em"
        >
          {grep.leftPane.titlePrefix}<span style="color:#5fc6b4">{grep.leftPane.titleTilde}</span>
        </div>
        <div
          style="flex:none;display:flex;align-items:baseline;gap:8px;padding:2px 10px 6px;border-bottom:1px solid rgba(224,69,60,.28)"
        >
          <span style="color:#5fc6b4">{grep.leftPane.promptIcon}</span>
          <span data-testid="grep-query" style="flex:1;min-width:0;color:#f4ece9;white-space:pre;overflow:hidden"
            >{query}<span style="animation:blk 1.05s steps(1) infinite;color:#e0453c">{grep.leftPane.cursorGlyph}</span
            ></span
          >
          <span data-testid="grep-counter" style="flex:none;color:rgba(217,176,74,.9)">{countText}</span>
        </div>
        <div bind:this={listEl} data-testid="grep-list" style="flex:1;min-height:0;overflow:hidden;padding:0 2px">
          {#if grepRows.length > 0}
            {#each grepRows as r (r.idx)}
              <div
                role="button"
                tabindex="0"
                data-testid="grep-row"
                data-path={r.path}
                data-selected={r.selected}
                onclick={() => pickRow(r)}
                onkeydown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") pickRow(r);
                }}
                style={r.style}
              >
                <span style="width:14px;height:14px;flex:none;display:inline-flex" aria-hidden="true">{@html r.icon}</span>
                <span style={`flex:none;color:${r.pathColor}`}>{r.path}</span>
                <span style="flex:none;color:#5fc6b4">{r.pos}</span>
                <span style="min-width:0;overflow:hidden;text-overflow:ellipsis"
                  >{r.pre}<span style="background:rgba(95,198,180,.35);color:#eafaf6">{r.mat}</span>{r.post}</span
                >
              </div>
            {/each}
          {:else if showLoading}
            <div data-testid="grep-loading" style="padding:10px;color:rgba(196,216,232,.45)">{grep.loadingText}</div>
          {:else if showError}
            <div data-testid="grep-error" style="padding:10px;color:rgba(196,216,232,.45)">{grep.errorText}</div>
          {:else}
            <div data-testid="grep-empty" style="padding:10px;color:rgba(196,216,232,.45)">{emptyStateText}</div>
          {/if}
        </div>
        <div
          data-testid="grep-mode"
          style="flex:none;padding:4px 10px 0;border-top:1px solid rgba(224,69,60,.18);color:rgba(196,216,232,.42);font-size:12px"
        >
          {modeLine}
        </div>
      </div>

      <!-- Right pane. `overflow:visible` (not `hidden`) is deliberate here —
           the grep clipping fix: this container is
           the clipping ancestor of the two absolutely-positioned labels
           below (`grep-file` / `grep-file-pos`, both `top:-9px` so they sit
           astride the border like the left pane's own title), and
           `overflow:hidden` clips any negative-offset absolutely-positioned
           child unconditionally, at every viewport size — that's the actual
           root cause of the reported clipping, not a `preview`-length or
           viewport-height issue. The scrollable content area
           (`previewEl` below) already declares its own `overflow:hidden`,
           so nothing here relies on the outer container to clip overflowing
           preview lines. -->
      <div
        style="position:relative;flex:1;min-width:0;box-sizing:border-box;display:flex;flex-direction:column;border:1px solid rgba(224,69,60,.4);border-radius:4px;background:rgba(9,13,18,.9);padding:12px 12px 8px;overflow:visible"
      >
        <div
          data-testid="grep-file"
          style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#0a0e13;padding:0 10px;color:rgba(196,216,232,.85)"
        >
          {grepFile}
        </div>
        <div
          data-testid="grep-file-pos"
          style="position:absolute;top:-9px;right:14px;background:#0a0e13;padding:0 8px;color:#5fc6b4;font-size:12px"
        >
          {grepFilePos}
        </div>
        <div bind:this={previewEl} data-testid="grep-preview" style="flex:1;min-height:0;overflow:hidden">
          {#each previewLines as l (l.n)}
            <div style={l.style}>
              <span style={l.nStyle}>{l.n}</span>
              <span style="min-width:0;overflow:hidden"
                >{l.pre}<span style="background:rgba(95,198,180,.38);color:#eafaf6">{l.mat}</span>{l.post}</span
              >
            </div>
          {/each}
        </div>
      </div>
    </div>

    <div style="width:min(1480px,96vw);display:flex;justify-content:space-between;font-size:12px;color:rgba(196,216,232,.45)">
      <span>{grep.footer.hintsLeft}</span>
      <span
        role="button"
        tabindex="0"
        class="grep-close-hint"
        data-testid="grep-close"
        onclick={closeOverlay}
        onkeydown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") closeOverlay();
        }}
        style="cursor:pointer;color:rgba(224,69,60,.85)"
      >
        {grep.footer.closeHint}
      </span>
    </div>
  </div>
{/if}

<style>
  .grep-close-hint:hover {
    color: #ff6b6f;
  }
</style>
