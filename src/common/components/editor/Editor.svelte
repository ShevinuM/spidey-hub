<script lang="ts">
  import type { EditorLabels } from "../../lib/data";
  import {
    clamp,
    extractCharRange,
    firstNonBlankCol,
    isCountDigit,
    isCountStartDigit,
    lineEndCol,
    moveHorizontal,
    moveVertical,
    nextMatch,
    normalizeCharRange,
    normalizeLineRange,
    parseCount,
    wordBackward,
    wordEnd,
    wordForward,
  } from "../../engines/vim/vim";
  import { parseExCommand } from "../../lib/cmdline";
  import type { TokenSpan } from "../../lib/repo-tree";
  import { EditorState } from "./editorState.svelte";
  import EditorBuffer from "./EditorBuffer.svelte";
  import EditorStatusLine from "./EditorStatusLine.svelte";

  export interface EditorLine {
    n: number;
    t: string | TokenSpan[];
    style: string;
  }

  interface Props {
    fileName: string;
    lines: EditorLine[];
    /** Hex colors indexed by a tokenized EditorLine.t's paletteIndex; unused and safe to omit when no line is tokenized. */
    palette?: string[];
    labels: EditorLabels;
    breadcrumbLeft: string;
    breadcrumbRight: string;
    /** See PaneTree.svelte's own header comment for the multi-instance data-copy-source gating this mirrors; defaults to `true` since Repositories/Personnel are this component's only two call sites and both always pass it explicitly, but the default keeps this file safe for a future caller that doesn't. */
    isFocused?: boolean;
    onClose: () => void;
  }

  const {
    fileName,
    lines,
    palette = [],
    labels,
    breadcrumbLeft,
    breadcrumbRight,
    isFocused = true,
    onClose,
  }: Props = $props();

  const state = new EditorState(
    () => lines,
    () => palette,
    () => labels,
    () => isFocused,
  );

  // Pending multi-key sequences (gg jump-top, yy yank-N-lines) share Repositories.svelte's ~500-600ms double-tap window, and a count typed before the pair's first key (`3gg`, `3yy`) is captured then, since digits reset every keystroke.

  let gPending = false;
  let gTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingGCount = 1;

  function clearGPending() {
    if (gPending) {
      clearTimeout(gTimer);
      gPending = false;
    }
  }

  let yPending = false;
  let yTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingYCount = 1;

  function clearYPending() {
    if (yPending) {
      clearTimeout(yTimer);
      yPending = false;
    }
  }

  let countDigits = "";

  // None of these keys can mutate the buffer in this read-only viewer, so each just flashes `labels.readonlyBellMessage`; `u`/redo is deliberately excluded since real vim's "already at oldest change" is a different message class than a readonly error.

  const MUTATING_KEYS = new Set([
    "i",
    "I",
    "a",
    "A",
    "o",
    "O",
    "c",
    "C",
    "d",
    "D",
    "x",
    "X",
    "s",
    "S",
    "r",
    "R",
    "p",
    "P",
    "~",
  ]);

  // ---------------------------------------------------------------------
  // Keymap
  // ---------------------------------------------------------------------

  function handleEscape(): boolean {
    if (state.pending === "search") {
      state.pending = "none";
      state.searchQuery = "";
      return true;
    }
    if (state.mode !== "normal") {
      state.mode = "normal";
      state.visualAnchor = null;
      return true;
    }
    // Bare Esc in NORMAL mode is a vim-faithful no-op — q/Esc are banned
    // from ever switching views, and this editor's own close path is
    // `:q`/`:q!` only (see runExCommand below, invoked through the
    // site-wide Cmdline box), never Esc.
    return true;
  }

  function handleSearchInput(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return true;
    if (e.key === "Enter") {
      state.lastSearchQuery = state.searchQuery;
      state.pending = "none";
      if (state.lastSearchQuery) {
        const m = nextMatch(state.searchMatches, state.cursor, 1);
        if (m) state.setCursor({ line: m.line, col: m.col });
      }
      return true;
    }
    if (e.key === "Backspace") {
      state.searchQuery = state.searchQuery.slice(0, -1);
      return true;
    }
    if (e.key.length === 1) {
      state.searchQuery += e.key;
      return true;
    }
    return true;
  }

  /** The ex-command state machine's EFFECT application: the `:` keystroke
   * itself, the text entry, and the resulting error/message PRESENTATION
   * all belong to the site-wide floating Cmdline box
   * (src/common/components/Cmdline.svelte, driven by Terminal.svelte); this
   * function applies the already-typed command's EFFECT and reports back
   * whether it was recognized at all (so Terminal.svelte knows whether to
   * fall through to the site-wide command set — "editor context wins" only
   * for commands this machine actually recognizes) and, if so, any
   * resulting error string (using this editor instance's OWN labels —
   * `w`/`wq`'s readonly error never moves to a generic site-wide copy).
   *
   * The PARSING itself is `src/common/lib/cmdline.ts`'s `parseExCommand`, pure and
   * unit-tested on its own — never rebuilt here. */
  export function runExCommand(cmd: string): { recognized: boolean; error?: string } {
    const ex = parseExCommand(cmd);
    if (ex.kind === "close") {
      onClose();
      return { recognized: true };
    }
    if (ex.kind === "writeError") {
      return { recognized: true, error: labels.writeReadonlyMessage };
    }
    if (ex.kind === "jump") {
      const target = clamp(ex.line, 1, Math.max(1, state.rawLines.length));
      state.setCursor({ line: target, col: firstNonBlankCol(state.rawLines, target) });
      return { recognized: true };
    }
    return { recognized: false };
  }

  /** Ctrl-d/u/f/b half/full page scroll.
   *
   * Ctrl-b is included for engine completeness/unit-testability
   * (`fullPage(-1)`) even though in the real app `Ctrl-b` is always
   * consumed first by Terminal.svelte's tmux-prefix arm (vim's Ctrl-b and
   * the tmux prefix are both bound to the same chord). */
  function handleCtrlChord(e: KeyboardEvent): boolean {
    clearGPending();
    clearYPending();
    countDigits = "";
    const k = e.key.toLowerCase();
    if (k === "d") {
      state.halfPage(1);
      return true;
    }
    if (k === "u") {
      state.halfPage(-1);
      return true;
    }
    if (k === "f") {
      state.fullPage(1);
      return true;
    }
    if (k === "b") {
      state.fullPage(-1);
      return true;
    }
    return false;
  }

  function handleNormalOrVisual(e: KeyboardEvent): boolean {
    const key = e.key;
    const lower = key.toLowerCase();

    if (key !== "g") clearGPending();
    if (!(state.mode === "normal" && key === "y")) clearYPending();

    // Numeric count prefix — a leading digit must be 1-9 ("0" alone is the
    // line-start motion, not a count); once a count has started, "0" is a
    // valid continuation digit ("10j").
    if (isCountDigit(key) && (countDigits.length > 0 || isCountStartDigit(key))) {
      countDigits += key;
      return true;
    }
    const count = parseCount(countDigits);
    const hadCount = countDigits.length > 0;
    countDigits = ""; // consumed below, or silently dropped if nothing matches (vim-faithful)

    if (key === "v") {
      if (state.mode === "visual") {
        state.mode = "normal";
        state.visualAnchor = null;
      } else if (state.mode === "visualLine") {
        state.mode = "visual";
      } else {
        state.mode = "visual";
        state.visualAnchor = state.cursor;
      }
      return true;
    }
    if (key === "V") {
      if (state.mode === "visualLine") {
        state.mode = "normal";
        state.visualAnchor = null;
      } else if (state.mode === "visual") {
        state.mode = "visualLine";
      } else {
        state.mode = "visualLine";
        state.visualAnchor = state.cursor;
      }
      return true;
    }

    if (key === "h" || key === "ArrowLeft") {
      state.setCursor(moveHorizontal(state.rawLines, state.cursor, -count));
      return true;
    }
    if (key === "l" || key === "ArrowRight") {
      state.setCursor(moveHorizontal(state.rawLines, state.cursor, count));
      return true;
    }
    if (key === "j" || key === "ArrowDown") {
      state.setCursor(moveVertical(state.rawLines, state.cursor, count));
      return true;
    }
    if (key === "k" || key === "ArrowUp") {
      state.setCursor(moveVertical(state.rawLines, state.cursor, -count));
      return true;
    }
    if (key === "0") {
      state.setCursor({ line: state.cursor.line, col: 0 });
      return true;
    }
    if (key === "^") {
      state.setCursor({
        line: state.cursor.line,
        col: firstNonBlankCol(state.rawLines, state.cursor.line),
      });
      return true;
    }
    if (key === "$") {
      state.setCursor({
        line: state.cursor.line,
        col: lineEndCol(state.rawLines, state.cursor.line),
      });
      return true;
    }
    if (key === "w") {
      state.setCursor(wordForward(state.rawLines, state.cursor, count));
      return true;
    }
    if (key === "b") {
      state.setCursor(wordBackward(state.rawLines, state.cursor, count));
      return true;
    }
    if (key === "e") {
      state.setCursor(wordEnd(state.rawLines, state.cursor, count));
      return true;
    }
    if (key === "G") {
      const target = hadCount ? count : state.rawLines.length;
      state.setCursor({ line: target, col: firstNonBlankCol(state.rawLines, target) });
      return true;
    }
    if (key === "g") {
      if (gPending) {
        clearTimeout(gTimer);
        gPending = false;
        const target = pendingGCount;
        state.setCursor({ line: target, col: firstNonBlankCol(state.rawLines, target) });
      } else {
        pendingGCount = hadCount ? count : 1;
        gPending = true;
        gTimer = setTimeout(() => (gPending = false), 600);
      }
      return true;
    }

    if (state.mode === "normal" && key === "y") {
      if (yPending) {
        clearTimeout(yTimer);
        yPending = false;
        const range = normalizeLineRange(
          state.cursor,
          moveVertical(state.rawLines, state.cursor, pendingYCount - 1),
        );
        state.yankLineRange(range);
      } else {
        pendingYCount = hadCount ? count : 1;
        yPending = true;
        yTimer = setTimeout(() => (yPending = false), 600);
      }
      return true;
    }

    if (
      (state.mode === "visual" || state.mode === "visualLine") &&
      key === "y" &&
      state.visualAnchor
    ) {
      if (state.mode === "visual") {
        const range = normalizeCharRange(state.visualAnchor, state.cursor);
        state.yank(extractCharRange(state.rawLines, range), "char");
        state.setCursor({ line: range.startLine, col: range.startCol });
      } else {
        const range = normalizeLineRange(state.visualAnchor, state.cursor);
        state.yankLineRange(range);
        state.setCursor({
          line: range.startLine,
          col: firstNonBlankCol(state.rawLines, range.startLine),
        });
      }
      state.mode = "normal";
      state.visualAnchor = null;
      return true;
    }

    // `/` is handled from every mode (dropping a visual selection back to NORMAL first) and must never fall through to `return false`, or Terminal.svelte's delegation chain would hand the key to GrepOverlay next and open grep on top of a still-open editor with no keyboard way to close it (Esc only cancels this editor's own modals).
    if (key === "/") {
      state.mode = "normal";
      state.visualAnchor = null;
      state.pending = "search";
      state.searchQuery = "";
      return true;
    }
    // `:` isn't consumed here (Terminal.svelte's delegation chain must still reach the site-wide Cmdline box that owns it), but a VISUAL/VISUAL-LINE selection is still reset to NORMAL at this keydown — not inside runExCommand, which only sees the command text after Enter — so a subsequent `:<n>` jump moves a bare cursor instead of extending a stale selection.
    if (key === ":") {
      if (state.mode !== "normal") {
        state.mode = "normal";
        state.visualAnchor = null;
      }
      return false;
    }
    if (state.mode === "normal" && lower === "n" && state.lastSearchQuery) {
      const m = nextMatch(state.searchMatches, state.cursor, key === "N" ? -1 : 1);
      if (m) state.setCursor({ line: m.line, col: m.col });
      return true;
    }

    if (MUTATING_KEYS.has(key)) {
      state.message = labels.readonlyBellMessage;
      if (state.mode !== "normal") {
        state.mode = "normal";
        state.visualAnchor = null;
      }
      return true;
    }

    return false;
  }

  /**
   * Handles one keydown for this view, returning true when consumed.
   *
   * The caller (Repositories.svelte / EmploymentRecords.svelte) must not
   * also treat a consumed key as its own panel key, and Terminal.svelte's
   * delegation chain keeps offering an unconsumed key onward — exactly how
   * a bare `:` reaches the site-wide Cmdline box's fallback opener (see the
   * `:` comment above).
   *
   * Esc only ever cancels a modal input (search) or a visual selection;
   * there is no bare q/Esc close — `:q`/`:q!` (via runExCommand above,
   * invoked through the Cmdline box) is the only way out, plus the mouse
   * `[:q]` pill in the footer below.
   */
  export function handleKey(e: KeyboardEvent): boolean {
    state.message = null;

    if (e.key === "Escape") {
      return handleEscape();
    }
    if (state.pending === "search") {
      return handleSearchInput(e);
    }
    if (e.ctrlKey && !e.metaKey && !e.altKey) {
      return handleCtrlChord(e);
    }
    if (e.metaKey || e.altKey) return false;

    return handleNormalOrVisual(e);
  }
</script>

<div
  style="flex:1;min-height:0;display:flex;flex-direction:column;background:rgba(8,11,15,.97);font-size:13px"
>
  <div style="flex:none;display:flex;justify-content:flex-end;padding:8px 12px 4px">
    <div
      style="display:flex;align-items:center;gap:7px;background:#e0453c;color:#0b0f14;padding:3px 12px;border-radius:3px;font-weight:700"
    >
      {labels.tabIcon}
      {fileName}
    </div>
  </div>
  <EditorBuffer {state} />
  <!-- This hidden `<pre>` (needs `white-space: pre`) renders `rawLines` directly as copy-mode's text source, because the visible scroller lays its gutter number and line text out as sibling flex items and `innerText` inserts a line break between flex siblings, which would otherwise double every line number when scraped. -->
  <pre
    data-copy-source={isFocused ? "" : undefined}
    style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:pre;margin:0">{state.rawLines.join(
      "\n",
    )}</pre>
  <EditorStatusLine {state} {labels} {breadcrumbLeft} {breadcrumbRight} {onClose} />
</div>
