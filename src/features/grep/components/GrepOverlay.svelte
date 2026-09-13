<script lang="ts">
  // Always mounted unconditionally (not gated by an `open` prop), so
  // Terminal.svelte can call handleKey() on every keydown — including the
  // "/" that opens it — without ever touching the view beneath.

  // The index path is fixed; `pnpm build:fixtures` overwrites the built
  // copy with the fixture snapshot as its last build step, so the same
  // bundle serves both goldens and production.
  import type { ViewId } from "../../../common/lib/views";
  import { grepPathToView } from "../../../common/lib/views";
  import type { GrepData } from "../../../common/lib/data";
  import { STATUS_BAR_HEIGHT_PX } from "../../../common/lib/layout";
  import { GrepOverlayState, type Row } from "./grepOverlayState.svelte";
  import QueryListPanel from "./QueryListPanel.svelte";
  import PreviewPanel from "./PreviewPanel.svelte";

  interface Props {
    grep: GrepData;
    onNavigate: (view: ViewId) => void;
  }

  const { grep, onNavigate }: Props = $props();

  const state = new GrepOverlayState(() => grep);

  /** Terminal.svelte's `setView()` calls this unconditionally on every
   * window switch so an open overlay never survives it; a no-op when
   * already closed. */
  export function close(): void {
    state.closeOverlay();
  }

  /** Lets Terminal's tmux-prefix gating treat an open overlay like
   * `statusBarRef.isPromptActive()`, without a duplicate open/closed flag
   * of its own. */
  export function isOpen(): boolean {
    return state.open;
  }

  /** Opens the overlay pre-filled and already searching with `query_`; an
   * empty string behaves like the bare "/" open. */
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

  /** Ported key-for-key from Component.grepKey(); runs first and claims
   * every key (returns true) while the overlay is open. */
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
  <!-- `bottom` stops at the status bar's own height (not the viewport
       edge) so the dim/blur backdrop never covers it, keeping it clickable
       while grep is open. -->
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
