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
  import type { ViewId } from "../../lib/views";
  import { grepPathToView } from "../../lib/views";
  import type { GrepData } from "../../lib/data";
  import { STATUS_BAR_HEIGHT_PX } from "../../lib/layout";
  import { GrepOverlayState, type Row } from "./grepOverlayState.svelte";
  import QueryListPanel from "./QueryListPanel.svelte";
  import PreviewPanel from "./PreviewPanel.svelte";

  interface Props {
    grep: GrepData;
    onNavigate: (view: ViewId) => void;
  }

  const { grep, onNavigate }: Props = $props();

  const state = new GrepOverlayState(() => grep);

  /** "grep is WINDOW chrome" — Terminal.svelte's
   * `setView()` calls this unconditionally on every switch (status-bar
   * click, any prefix target) so an open overlay never survives a window
   * change. A no-op when already closed. */
  export function close(): void {
    state.closeOverlay();
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
    return state.open;
  }

  /** `:grep <query>` — opens the overlay pre-filled AND
   * already searching (the live `hits`/`countText` derivations react to
   * `query` the instant it's set, same as normal typing). An empty
   * `query` behaves exactly like the bare `/` open path. */
  export function openWithQuery(query_: string): void {
    state.openOverlay();
    state.query = query_;
  }

  /** Enter — Component.grepOpenRow() (lines 870-880): always closes;
   * navigates only when the selected row's path maps to a view. */
  function openSelectedRow() {
    const row = state.hits[Math.min(state.sel, state.hits.length - 1)];
    state.closeOverlay();
    if (!row) return;
    const target = grepPathToView(row.path);
    if (target) onNavigate(target);
  }

  function pickRow(row: Row) {
    if (row.selected) openSelectedRow();
    else state.selectRow(row.idx);
  }

  /** Component.grepKey() (lines 881-893), ported key-for-key. See the file
   * header comment for the dispatch contract with Terminal.svelte. */
  export function handleKey(e: KeyboardEvent): boolean {
    if (!state.open) {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        state.openOverlay();
        return true;
      }
      return false;
    }

    const k = e.key.toLowerCase();

    if (e.key === "Escape" || (e.ctrlKey && k === "c")) {
      state.closeOverlay();
      return true;
    }
    if (e.key === "ArrowDown" || (e.ctrlKey && (k === "n" || k === "j"))) {
      e.preventDefault();
      state.moveSelection(1);
      return true;
    }
    if (e.key === "ArrowUp" || (e.ctrlKey && (k === "p" || k === "k"))) {
      e.preventDefault();
      state.moveSelection(-1);
      return true;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      openSelectedRow();
      return true;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      state.backspaceQuery();
      return true;
    }
    if (e.ctrlKey && (k === "u" || k === "w")) {
      e.preventDefault();
      state.clearQuery();
      return true;
    }
    // Unrecognized modifier combos (e.g. Cmd+L) fall through untouched —
    // consumed (the view beneath never sees them either) but never
    // preventDefault-ed, matching Component.grepKey() line 891.
    if (e.metaKey || e.ctrlKey || e.altKey) return true;

    if (e.key.length === 1) {
      e.preventDefault();
      state.typeChar(e.key);
      return true;
    }
    return true;
  }
</script>

{#if state.open}
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
      <QueryListPanel {grep} {state} onPickRow={pickRow} />
      <PreviewPanel {state} />
    </div>

    <div style="width:min(1480px,96vw);display:flex;justify-content:space-between;font-size:12px;color:rgba(196,216,232,.45)">
      <span>{grep.footer.hintsLeft}</span>
      <span
        role="button"
        tabindex="0"
        class="grep-close-hint"
        data-testid="grep-close"
        onclick={() => state.closeOverlay()}
        onkeydown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") state.closeOverlay();
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
