<script lang="ts">
  // Full-screen nvim-style file viewer (design/Homepage.dc.html lines
  // 317-336 markup, reproduced verbatim: red file tab, gutter + line, status
  // bar with mode indicator / branch / breadcrumb / position / close pill).
  // The prototype only ever mounts this for a personnel role doc; this
  // component is built standalone here so Builds' repo-file browsing and
  // Personnel's role docs can share one implementation. It is deliberately
  // "dumb" about content: every string
  // comes from the `labels` prop (caller's own data file — builds.yaml for
  // Builds, personnel.yaml for Personnel), every line is already
  // classified+styled by the caller (docline.ts for .md, a flat body color
  // for code — see Builds.svelte's `toEditorLines()`), and scrolling never
  // touches anything the caller doesn't explicitly own (no fetch, no
  // routing).
  //
  // This is a real vim-lite NORMAL/VISUAL/VISUAL-LINE modal
  // engine: a column cursor, word/line motions with numeric counts,
  // charwise/linewise visual selection with yank-to-paste-buffer, in-buffer
  // `/` search with `n`/`N`, and a minimal `:` ex-command machine (`:q`/
  // `:q!` close, `:w`/`:wq` show a readonly error, `:<number>` jumps,
  // anything else is an E492-style error) — all of it vim-faithful, none of
  // it able to actually mutate the buffer (every insert/change/delete-
  // family key just flashes a readonly bell). The ex-command machine's
  // PARSING lives in `../lib/cmdline.ts`'s
  // `parseExCommand` (pure, shared with that module's own unit tests); its
  // PRESENTATION (the `:` keystroke, the typed text, the
  // resulting error message) belongs to the site-wide floating Cmdline box
  // (`Cmdline.svelte`, driven by Terminal.svelte) — this component only
  // exposes `runExCommand()` to APPLY an already-typed command's effect
  // (see that function's own doc comment). The rest of the engine — the
  // actual motion/word/search/range math — lives in `../lib/vim.ts`, a pure
  // (no-DOM) module so it's unit-testable on its own (tests/unit/
  // vim.test.ts); this component owns only the stateful parts (mode,
  // cursor, pending key sequences, scroll sync, rendering).
  //
  // Scrolling is an interactivity extension the prototype
  // has no precedent for (its role docs are short enough to never scroll):
  // j/k moves the cursor (scrolled into view), Ctrl-d/u/f/b move a half/full
  // page, gg/G jump top/bottom, and the status line's position indicator
  // (Top/nn%/Bot + line:col) tracks real scroll position — computed from the
  // scroller's own scrollTop/scrollHeight/clientHeight rather than a
  // hardcoded line-height, since the rendered line pitch depends on the
  // container's `gap:1px` (measured from two adjacent rows' offsetTop, see
  // linePitch()) and must never assume a fixed px value.
  //
  // The prototype's own version of this pane uses `overflow:hidden` (never
  // scrolls — a personnel doc always fits). Real repo files can be much
  // longer, so this swaps in `overflow-y:auto` with the scrollbar hidden
  // both ways (Firefox/WebKit) — the only rendering difference from the
  // prototype's markup, and invisible whenever content fits (the
  // 06-editor golden, which never scrolls, is unaffected).
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
  } from "../../lib/vim";
  import { parseExCommand } from "../../lib/cmdline";
  import type { TokenSpan } from "../../lib/repoTree";
  import { EditorState } from "./editorState.svelte";
  import EditorBuffer from "./EditorBuffer.svelte";
  import EditorStatusLine from "./EditorStatusLine.svelte";

  export interface EditorLine {
    n: number;
    /** Plain text (docs, flat code fallback), or a tokenized code line —
     * `[paletteIndex, text]` runs resolved against the `palette` prop.
     * Either way `rawLines` below reconstructs the plain text every vim
     * motion/search/yank operates on, so the engine never has to know
     * which form a given line came in as. */
    t: string | TokenSpan[];
    style: string;
  }

  interface Props {
    fileName: string;
    lines: EditorLine[];
    /** Hex colors indexed by a tokenized EditorLine.t's paletteIndex.
     * Unused (and safe to omit) when no line is tokenized. */
    palette?: string[];
    labels: EditorLabels;
    breadcrumbLeft: string;
    breadcrumbRight: string;
    /** See PaneTree.svelte's own header comment (multi-instance
     * data-copy-source gating). Defaults to
     * `true`: Builds/Personnel are this component's only two call sites and
     * both always pass it explicitly, but a default keeps this file safe if
     * a future caller doesn't. */
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

  // ---------------------------------------------------------------------
  // Pending multi-key sequences: gg (jump top), yy (yank N lines) — same
  // ~500-600ms double-tap window Builds.svelte's own gg/G uses. A count
  // typed before the FIRST key of the pair (`3gg`, `3yy`) is captured at
  // that first keypress since the digits are consumed (reset) per
  // keystroke — see `handleNormalOrVisual` below.
  // ---------------------------------------------------------------------

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

  // ---------------------------------------------------------------------
  // Readonly mutating-key bell. None of these keys can actually change the
  // buffer — this is a read-only viewer — so every one of them just flashes
  // `labels.readonlyBellMessage` and changes nothing. Deliberately not
  // exhaustive of every real vim mutating command (no `u`/redo — a
  // different message class in real vim, "already at oldest change", not a
  // readonly error), but covers the documented set of mutating keys plus
  // their natural case-pair completions.
  // ---------------------------------------------------------------------

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
   * (src/components/Cmdline.svelte, driven by Terminal.svelte); this
   * function applies the already-typed command's EFFECT and reports back
   * whether it was recognized at all (so Terminal.svelte knows whether to
   * fall through to the site-wide command set — "editor context wins" only
   * for commands this machine actually recognizes) and, if so, any
   * resulting error string (using this editor instance's OWN labels —
   * `w`/`wq`'s readonly error never moves to a generic site-wide copy).
   * The PARSING itself is `src/lib/cmdline.ts`'s `parseExCommand`, pure and
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

  /** Ctrl-d/u/f/b half/full page scroll. Ctrl-b is included for engine
   * completeness/unit-testability (`fullPage(-1)`) even though in the real
   * app `Ctrl-b` is always consumed first by Terminal.svelte's tmux-prefix
   * arm (vim's Ctrl-b and the tmux prefix are both bound to the same
   * chord). */
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
      state.setCursor({ line: state.cursor.line, col: firstNonBlankCol(state.rawLines, state.cursor.line) });
      return true;
    }
    if (key === "$") {
      state.setCursor({ line: state.cursor.line, col: lineEndCol(state.rawLines, state.cursor.line) });
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
        const range = normalizeLineRange(state.cursor, moveVertical(state.rawLines, state.cursor, pendingYCount - 1));
        state.yankLineRange(range);
      } else {
        pendingYCount = hadCount ? count : 1;
        yPending = true;
        yTimer = setTimeout(() => (yPending = false), 600);
      }
      return true;
    }

    if ((state.mode === "visual" || state.mode === "visualLine") && key === "y" && state.visualAnchor) {
      if (state.mode === "visual") {
        const range = normalizeCharRange(state.visualAnchor, state.cursor);
        state.yank(extractCharRange(state.rawLines, range), "char");
        state.setCursor({ line: range.startLine, col: range.startCol });
      } else {
        const range = normalizeLineRange(state.visualAnchor, state.cursor);
        state.yankLineRange(range);
        state.setCursor({ line: range.startLine, col: firstNonBlankCol(state.rawLines, range.startLine) });
      }
      state.mode = "normal";
      state.visualAnchor = null;
      return true;
    }

    // `/` is handled from EVERY mode (not just NORMAL), including
    // VISUAL/VISUAL-LINE — dropping the selection back to NORMAL first.
    // This must never fall through to `return false` from visual mode: if
    // it did, Terminal.svelte would hand the key to GrepOverlay next (its
    // delegation flip only gives the editor first refusal, not the ONLY
    // refusal), opening grep on top of a still-open editor with no
    // keyboard way to close it again (Esc is owned by handleEscape above,
    // which only ever cancels the editor's own modals).
    if (key === "/") {
      state.mode = "normal";
      state.visualAnchor = null;
      state.pending = "search";
      state.searchQuery = "";
      return true;
    }
    // `:` is NOT fully handled here — it's the site-wide floating Cmdline
    // box now, not this component's own pending state (see runExCommand
    // above) — but a VISUAL/VISUAL-LINE selection must still be dropped
    // back to NORMAL AT THE MOMENT the box opens, same as `/` above
    // (leaving the selection alive under the box let a subsequent `:<n>`
    // jump EXTEND it — span count grew 1->4 — instead of moving a bare
    // cursor with no selection). The reset
    // happens here, at keydown time, NOT inside runExCommand (which only
    // ever sees the command text after Enter, long after any selection
    // state would already need to have been cleared).
    //
    // Still deliberately `return false` (NOT consumed): Terminal.svelte's
    // delegation chain must keep offering this exact keydown to everything
    // else (grep, which ignores a non-"/" key while closed) and finally to
    // its own fallback opener, which is what actually opens the box in
    // "ex" mode — only the MODE RESET is this component's job, the key
    // itself stays unhandled. The `pending === "search"` branch above still
    // runs FIRST on every keydown, so a literal `:` typed mid-`/search`
    // lands in the query, never reaching this branch at all.
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
   * Handles one keydown for this view. Returns true when consumed (caller
   * — Builds.svelte / EmploymentRecords.svelte — must not also treat the key as
   * its own panel key; Terminal.svelte's delegation chain also keeps
   * offering an unconsumed key to whatever comes next, which is exactly
   * how a bare `:` reaches the site-wide Cmdline box's fallback opener —
   * see the `:` comment above). Esc only ever cancels a modal input
   * (search) or a visual selection — there is no bare q/Esc close;
   * `:q`/`:q!` (via runExCommand above, invoked through the Cmdline box)
   * is the only way out, plus the mouse `[:q]` pill in the footer below.
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

<div style="flex:1;min-height:0;display:flex;flex-direction:column;background:rgba(8,11,15,.97);font-size:13px">
  <div style="flex:none;display:flex;justify-content:flex-end;padding:8px 12px 4px">
    <div
      style="display:flex;align-items:center;gap:7px;background:#e0453c;color:#0b0f14;padding:3px 12px;border-radius:3px;font-weight:700"
    >
      {labels.tabIcon} {fileName}
    </div>
  </div>
  <EditorBuffer {state} />
  <!-- Copy-mode source, text-only. NOT the visible
       scroller above: a verifier caught that the scroller's per-line gutter
       number and text live as SIBLING flex items in the same row, and
       `innerText` inserts a line break between flex/grid siblings the same
       way it does between block boxes — so scraping the scroller interleaved
       every gutter digit as its own "line" ("1\n<line>\n2\n<line>…"), which
       silently doubled every copy-mode line number and yanked "1" instead of
       the real first line. This hidden `<pre>` mirrors Wallpaper.svelte's own
       HUD `data-copy-source` mirror (`white-space: pre` is required —
       without it the browser collapses the literal "\n" characters in this
       text node into spaces when computing rendered/innerText content) and
       renders `rawLines` directly, so copy-mode's captured line N is always
       exactly the buffer's real line N. Same off-screen-clip technique the
       `paste-buffer` span below already uses — visually inert, still
       "rendered" for innerText purposes. -->
  <pre
    data-copy-source={isFocused ? "" : undefined}
    style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:pre;margin:0">{state.rawLines.join(
      "\n",
    )}</pre>
  <EditorStatusLine {state} {labels} {breadcrumbLeft} {breadcrumbRight} {onClose} />
</div>
