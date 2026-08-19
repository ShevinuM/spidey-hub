<script lang="ts">
  // Full-screen nvim-style file viewer (design/Homepage.dc.html lines
  // 317-336 markup, reproduced verbatim: red file tab, gutter + line, status
  // bar with mode indicator / branch / breadcrumb / position / close pill).
  // The prototype only ever mounts this for a personnel role doc (Phase 6);
  // this component is built standalone here (PLAN.md Phase 5 scope item 3)
  // so Phase 5's repo-file browsing and Phase 6's personnel roles share one
  // implementation. It is deliberately "dumb" about content: every string
  // comes from the `labels` prop (caller's own data file — builds.yaml for
  // Builds, personnel.yaml for Personnel), every line is already
  // classified+styled by the caller (docline.ts for .md, a flat body color
  // for code — see Builds.svelte's `toEditorLines()`), and scrolling never
  // touches anything the caller doesn't explicitly own (no fetch, no
  // routing).
  //
  // PLAN.md Phase 3 ("vim-lite engine", item 10) replaces the original
  // line-only cursor with a real vim-lite NORMAL/VISUAL/VISUAL-LINE modal
  // engine: a column cursor, word/line motions with numeric counts,
  // charwise/linewise visual selection with yank-to-paste-buffer, in-buffer
  // `/` search with `n`/`N`, and a minimal `:` ex-command machine (`:q`/
  // `:q!` close, `:w`/`:wq` show a readonly error, `:<number>` jumps,
  // anything else is an E492-style error) — all of it vim-faithful, none of
  // it able to actually mutate the buffer (every insert/change/delete-
  // family key just flashes a readonly bell). PLAN.md Phase 5C LIFTS the
  // ex-command machine's PARSING out to `../lib/cmdline.ts`'s
  // `parseExCommand` (pure, shared with that module's own unit tests) and
  // moves its PRESENTATION (the `:` keystroke, the typed text, the
  // resulting error message) to the site-wide floating Cmdline box
  // (`Cmdline.svelte`, driven by Terminal.svelte) — this component now only
  // exposes `runExCommand()` to APPLY an already-typed command's effect
  // (see that function's own doc comment). The rest of the engine — the
  // actual motion/word/search/range math — lives in `../lib/vim.ts`, a pure
  // (no-DOM) module so it's unit-testable on its own (tests/unit/
  // vim.test.ts); this component owns only the stateful parts (mode,
  // cursor, pending key sequences, scroll sync, rendering).
  //
  // Scrolling is a PLAN.md "Builds interactivity extension" the prototype
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
  // prototype's markup, and invisible whenever content fits (Phase 6's
  // 06-editor golden, which never scrolls, is unaffected).
  import type { EditorLabels } from "../lib/data";
  import {
    clampCursor,
    extractCharRange,
    extractLineRange,
    findMatches,
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
    type CursorPos,
    type LineRange,
    type VisualRange,
  } from "../lib/vim";
  import { setPasteBuffer, writeToSystemClipboard, type PasteBufferKind } from "../lib/pasteBuffer";
  import { pushPasteTarget, removePasteTarget } from "../lib/pasteTargets";
  import { parseExCommand } from "../lib/cmdline";
  import type { TokenSpan } from "../lib/repoTree";

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
    /** PLAN.md Iteration 3 Phase 6 item 6.1 — see PaneTree.svelte's own
     * header comment (multi-instance data-copy-source gating). Defaults to
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

  function lineText(t: string | TokenSpan[]): string {
    return typeof t === "string" ? t : t.map(([, text]) => text).join("");
  }

  const rawLines = $derived(lines.map((l) => lineText(l.t)));

  let scrollerEl = $state<HTMLDivElement | null>(null);
  let scrollTopPx = $state(0);
  let clientHeightPx = $state(0);
  let scrollHeightPx = $state(0);

  function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
  }

  function syncScroll() {
    if (!scrollerEl) return;
    scrollTopPx = scrollerEl.scrollTop;
    clientHeightPx = scrollerEl.clientHeight;
    scrollHeightPx = scrollerEl.scrollHeight;
  }

  $effect(() => {
    syncScroll();
  });

  /** Row pitch (line height + the container's `gap:1px`), measured from two
   * adjacent rendered rows rather than assumed — see file header comment. */
  function linePitch(): number {
    if (!scrollerEl) return 21;
    const rows = scrollerEl.querySelectorAll<HTMLElement>("[data-line]");
    if (rows.length >= 2) return rows[1].offsetTop - rows[0].offsetTop;
    if (rows.length === 1) return rows[0].offsetHeight + 1;
    return 21;
  }

  // ---------------------------------------------------------------------
  // Cursor + mode state (PLAN.md Phase 3 "Cursor model" / "Motions + modes")
  // ---------------------------------------------------------------------

  let cursor = $state<CursorPos>({ line: 1, col: 0 });
  let mode = $state<"normal" | "visual" | "visualLine">("normal");
  let visualAnchor = $state<CursorPos | null>(null);

  let pending = $state<"none" | "search">("none");
  let searchQuery = $state("");
  let lastSearchQuery = $state("");
  let message = $state<string | null>(null);
  let pasteBufferText = $state("");

  function scrollToCursor() {
    const row = scrollerEl?.querySelector<HTMLElement>(`[data-line="${cursor.line}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }

  /** Every motion routes through here: clamps into the buffer (via
   * vim.ts's own clamp, so a column past a shorter line or a line past the
   * buffer's end always lands somewhere valid) and scrolls the new position
   * into view. `halfPage`/`fullPage` below manage scrolling themselves and
   * deliberately bypass this (see their own comment).
   *
   * Landing exactly on the first or last line snaps `scrollTop` straight to
   * that edge (0 / scrollHeight) instead of going through
   * `scrollIntoView({block: "nearest"})` — the pre-Phase-3 `jumpTop()`/
   * `jumpBottom()` this replaces did the same, because "nearest" only
   * guarantees the row becomes visible, not that the scroller reaches its
   * true edge (it can stop a few px short), which would otherwise leave the
   * footer's Top/Bot indicator showing a stray "0%"/"99%" right after
   * gg/G/`:1`/a wrapped search lands on the first or last line. */
  function setCursor(pos: CursorPos) {
    cursor = clampCursor(rawLines, pos);
    if (scrollerEl && cursor.line === 1) {
      scrollerEl.scrollTop = 0;
      syncScroll();
    } else if (scrollerEl && cursor.line === rawLines.length) {
      scrollerEl.scrollTop = scrollerEl.scrollHeight;
      syncScroll();
    } else {
      scrollToCursor();
    }
  }

  function halfPage(dir: 1 | -1) {
    if (!scrollerEl) return;
    const clientH = scrollerEl.clientHeight;
    const maxScroll = Math.max(0, scrollerEl.scrollHeight - clientH);
    scrollerEl.scrollTop = clamp(scrollerEl.scrollTop + dir * (clientH / 2), 0, maxScroll);
    const pitch = linePitch();
    const linesMoved = Math.max(1, Math.round(clientH / 2 / pitch)) * dir;
    cursor = clampCursor(rawLines, { line: cursor.line + linesMoved, col: cursor.col });
    syncScroll();
  }

  function fullPage(dir: 1 | -1) {
    if (!scrollerEl) return;
    const clientH = scrollerEl.clientHeight;
    const maxScroll = Math.max(0, scrollerEl.scrollHeight - clientH);
    scrollerEl.scrollTop = clamp(scrollerEl.scrollTop + dir * clientH, 0, maxScroll);
    const pitch = linePitch();
    const linesMoved = Math.max(1, Math.round(clientH / pitch)) * dir;
    cursor = clampCursor(rawLines, { line: cursor.line + linesMoved, col: cursor.col });
    syncScroll();
  }

  // ---------------------------------------------------------------------
  // Yank -> shared paste buffer + system clipboard (PLAN.md Phase 3 "y/yy")
  // ---------------------------------------------------------------------

  function yank(text: string, kind: PasteBufferKind) {
    setPasteBuffer(text, kind);
    writeToSystemClipboard(text);
    pasteBufferText = text;
  }

  function yankLineRange(range: LineRange) {
    yank(extractLineRange(rawLines, range), "line");
  }

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
  // Readonly mutating-key bell (PLAN.md Phase 3 "readonly bell message").
  // None of these keys can actually change the buffer — this is a
  // read-only viewer — so every one of them just flashes
  // `labels.readonlyBellMessage` and changes nothing. Deliberately not
  // exhaustive of every real vim mutating command (no `u`/redo — a
  // different message class in real vim, "already at oldest change", not a
  // readonly error), but covers the full set PLAN.md names plus their
  // natural case-pair completions.
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
  // Search (PLAN.md Phase 3 item 3.3). Matches are only recomputed when a
  // query COMMITS (Enter, or `lastSearchQuery` changes) — not on every
  // keystroke of typing — so scanning the whole buffer only happens once
  // per search, not once per character typed.
  // ---------------------------------------------------------------------

  const searchMatches = $derived(findMatches(rawLines, lastSearchQuery));

  // ---------------------------------------------------------------------
  // Ctrl-b ] paste-target registration (PLAN.md Phase 5 item 5.3 / the
  // design decisions' "grep query, personnel filter, rename prompt, editor
  // search" list) — active only while the in-buffer `/` search prompt is
  // actually accepting keystrokes, exactly like GrepOverlay's own query and
  // Personnel's own filter registrations.
  // ---------------------------------------------------------------------

  const SEARCH_PASTE_TARGET_ID = "editor-search";

  $effect(() => {
    if (pending !== "search" || !isFocused) return;
    pushPasteTarget({
      id: SEARCH_PASTE_TARGET_ID,
      insert: (text: string) => {
        searchQuery += text;
      },
    });
    return () => removePasteTarget(SEARCH_PASTE_TARGET_ID);
  });

  // ---------------------------------------------------------------------
  // Keymap
  // ---------------------------------------------------------------------

  function handleEscape(): boolean {
    if (pending === "search") {
      pending = "none";
      searchQuery = "";
      return true;
    }
    if (mode !== "normal") {
      mode = "normal";
      visualAnchor = null;
      return true;
    }
    // Bare Esc in NORMAL mode is a vim-faithful no-op — PLAN.md items 15/16
    // ban q/Esc from ever switching views, and this editor's own close path
    // is `:q`/`:q!` only (see runExCommand below, invoked through the
    // site-wide Cmdline box — PLAN.md Phase 5C), never Esc.
    return true;
  }

  function handleSearchInput(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return true;
    if (e.key === "Enter") {
      lastSearchQuery = searchQuery;
      pending = "none";
      if (lastSearchQuery) {
        const m = nextMatch(searchMatches, cursor, 1);
        if (m) setCursor({ line: m.line, col: m.col });
      }
      return true;
    }
    if (e.key === "Backspace") {
      searchQuery = searchQuery.slice(0, -1);
      return true;
    }
    if (e.key.length === 1) {
      searchQuery += e.key;
      return true;
    }
    return true;
  }

  /** Phase 3's own ex-command state machine — LIFTED for PLAN.md Phase 5C:
   * the `:` keystroke itself, the text entry, and the resulting
   * error/message PRESENTATION all now belong to the site-wide floating
   * Cmdline box (src/components/Cmdline.svelte, driven by Terminal.svelte);
   * this function is what's left once that's stripped out — apply the
   * already-typed command's EFFECT and report back whether it was
   * recognized at all (so Terminal.svelte knows whether to fall through to
   * the site-wide command set — "editor context wins" only for commands
   * this machine actually recognizes) and, if so, any resulting error
   * string (using this editor instance's OWN labels, exactly as before —
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
      const target = clamp(ex.line, 1, Math.max(1, rawLines.length));
      setCursor({ line: target, col: firstNonBlankCol(rawLines, target) });
      return { recognized: true };
    }
    return { recognized: false };
  }

  /** Ctrl-d/u/f/b half/full page scroll. Ctrl-b is included for engine
   * completeness/unit-testability (`fullPage(-1)`) even though in the real
   * app `Ctrl-b` is always consumed first by Terminal.svelte's tmux-prefix
   * arm — see this component's e2e coverage note and the executor report
   * for the underlying PLAN.md design-decision conflict (vim's Ctrl-b vs.
   * the tmux prefix, both bound to the same chord). */
  function handleCtrlChord(e: KeyboardEvent): boolean {
    clearGPending();
    clearYPending();
    countDigits = "";
    const k = e.key.toLowerCase();
    if (k === "d") {
      halfPage(1);
      return true;
    }
    if (k === "u") {
      halfPage(-1);
      return true;
    }
    if (k === "f") {
      fullPage(1);
      return true;
    }
    if (k === "b") {
      fullPage(-1);
      return true;
    }
    return false;
  }

  function handleNormalOrVisual(e: KeyboardEvent): boolean {
    const key = e.key;
    const lower = key.toLowerCase();

    if (key !== "g") clearGPending();
    if (!(mode === "normal" && key === "y")) clearYPending();

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
      if (mode === "visual") {
        mode = "normal";
        visualAnchor = null;
      } else if (mode === "visualLine") {
        mode = "visual";
      } else {
        mode = "visual";
        visualAnchor = cursor;
      }
      return true;
    }
    if (key === "V") {
      if (mode === "visualLine") {
        mode = "normal";
        visualAnchor = null;
      } else if (mode === "visual") {
        mode = "visualLine";
      } else {
        mode = "visualLine";
        visualAnchor = cursor;
      }
      return true;
    }

    if (key === "h" || key === "ArrowLeft") {
      setCursor(moveHorizontal(rawLines, cursor, -count));
      return true;
    }
    if (key === "l" || key === "ArrowRight") {
      setCursor(moveHorizontal(rawLines, cursor, count));
      return true;
    }
    if (key === "j" || key === "ArrowDown") {
      setCursor(moveVertical(rawLines, cursor, count));
      return true;
    }
    if (key === "k" || key === "ArrowUp") {
      setCursor(moveVertical(rawLines, cursor, -count));
      return true;
    }
    if (key === "0") {
      setCursor({ line: cursor.line, col: 0 });
      return true;
    }
    if (key === "^") {
      setCursor({ line: cursor.line, col: firstNonBlankCol(rawLines, cursor.line) });
      return true;
    }
    if (key === "$") {
      setCursor({ line: cursor.line, col: lineEndCol(rawLines, cursor.line) });
      return true;
    }
    if (key === "w") {
      setCursor(wordForward(rawLines, cursor, count));
      return true;
    }
    if (key === "b") {
      setCursor(wordBackward(rawLines, cursor, count));
      return true;
    }
    if (key === "e") {
      setCursor(wordEnd(rawLines, cursor, count));
      return true;
    }
    if (key === "G") {
      const target = hadCount ? count : rawLines.length;
      setCursor({ line: target, col: firstNonBlankCol(rawLines, target) });
      return true;
    }
    if (key === "g") {
      if (gPending) {
        clearTimeout(gTimer);
        gPending = false;
        const target = pendingGCount;
        setCursor({ line: target, col: firstNonBlankCol(rawLines, target) });
      } else {
        pendingGCount = hadCount ? count : 1;
        gPending = true;
        gTimer = setTimeout(() => (gPending = false), 600);
      }
      return true;
    }

    if (mode === "normal" && key === "y") {
      if (yPending) {
        clearTimeout(yTimer);
        yPending = false;
        const range = normalizeLineRange(cursor, moveVertical(rawLines, cursor, pendingYCount - 1));
        yankLineRange(range);
      } else {
        pendingYCount = hadCount ? count : 1;
        yPending = true;
        yTimer = setTimeout(() => (yPending = false), 600);
      }
      return true;
    }

    if ((mode === "visual" || mode === "visualLine") && key === "y" && visualAnchor) {
      if (mode === "visual") {
        const range = normalizeCharRange(visualAnchor, cursor);
        yank(extractCharRange(rawLines, range), "char");
        setCursor({ line: range.startLine, col: range.startCol });
      } else {
        const range = normalizeLineRange(visualAnchor, cursor);
        yankLineRange(range);
        setCursor({ line: range.startLine, col: firstNonBlankCol(rawLines, range.startLine) });
      }
      mode = "normal";
      visualAnchor = null;
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
      mode = "normal";
      visualAnchor = null;
      pending = "search";
      searchQuery = "";
      return true;
    }
    // `:` is NOT fully handled here — it's the site-wide floating Cmdline
    // box now, not this component's own pending state (see runExCommand
    // above) — but a VISUAL/VISUAL-LINE selection must still be dropped
    // back to NORMAL AT THE MOMENT the box opens, same as `/` above
    // (orchestrator ruling after a live-reproduced defect: leaving the
    // selection alive under the box let a subsequent `:<n>` jump EXTEND it
    // — span count grew 1->4 — instead of moving a bare cursor with no
    // selection, which is the Phase-3-faithful behavior). The reset
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
      if (mode !== "normal") {
        mode = "normal";
        visualAnchor = null;
      }
      return false;
    }
    if (mode === "normal" && lower === "n" && lastSearchQuery) {
      const m = nextMatch(searchMatches, cursor, key === "N" ? -1 : 1);
      if (m) setCursor({ line: m.line, col: m.col });
      return true;
    }

    if (MUTATING_KEYS.has(key)) {
      message = labels.readonlyBellMessage;
      if (mode !== "normal") {
        mode = "normal";
        visualAnchor = null;
      }
      return true;
    }

    return false;
  }

  /**
   * Handles one keydown for this view. Returns true when consumed (caller
   * — Builds.svelte / Personnel.svelte — must not also treat the key as
   * its own panel key; Terminal.svelte's delegation chain also keeps
   * offering an unconsumed key to whatever comes next, which is exactly
   * how a bare `:` reaches the site-wide Cmdline box's fallback opener —
   * see the `:` comment above). Esc only ever cancels a modal input
   * (search) or a visual selection — PLAN.md Phase 3 removes the old bare
   * q/Esc close entirely; `:q`/`:q!` (via runExCommand above, invoked
   * through the Cmdline box — PLAN.md Phase 5C) is the only way out now,
   * plus the mouse `[:q]` pill in the footer below.
   */
  export function handleKey(e: KeyboardEvent): boolean {
    message = null;

    if (e.key === "Escape") {
      return handleEscape();
    }
    if (pending === "search") {
      return handleSearchInput(e);
    }
    if (e.ctrlKey && !e.metaKey && !e.altKey) {
      return handleCtrlChord(e);
    }
    if (e.metaKey || e.altKey) return false;

    return handleNormalOrVisual(e);
  }

  const scrollLabel = $derived.by(() => {
    if (scrollHeightPx <= clientHeightPx || scrollTopPx <= 0) return labels.topLabel;
    if (scrollTopPx + clientHeightPx >= scrollHeightPx - 1) return labels.bottomLabel;
    const pct = Math.round((scrollTopPx / (scrollHeightPx - clientHeightPx)) * 100);
    return labels.percentTemplate.replace("{n}", String(pct));
  });

  const positionText = $derived(
    labels.positionTemplate.replace("{line}", String(cursor.line)).replace("{col}", String(cursor.col + 1)),
  );

  const modeOrPromptText = $derived.by(() => {
    if (pending === "search") return `${labels.searchPromptGlyph}${searchQuery}`;
    if (mode === "visual") return labels.modeVisualLabel;
    if (mode === "visualLine") return labels.modeVisualLineLabel;
    return labels.modeLabel;
  });

  // ---------------------------------------------------------------------
  // Rendering: cursor block + visual-selection + search-match highlights.
  //
  // Perf note (PLAN.md Phase 3 "keep performance sane on large files"):
  // this only does character-level segmentation for the small set of
  // "interesting" lines — the cursor's own line, the lines spanned by an
  // active visual selection, and lines containing a search match — every
  // other line short-circuits back to the exact same single-span markup
  // the pre-Phase-3 version rendered. A whole-buffer re-scan only ever
  // happens once per committed search (via `searchMatches` above), never
  // per keystroke of cursor movement.
  // ---------------------------------------------------------------------

  type LineDecoration =
    | { kind: "full-select" }
    | { kind: "segments"; segments: { text: string; cls: string; color?: string }[] };

  /** Token boundary offsets + per-offset palette color for one tokenized
   * line, or `null` for a plain-text line — folded into the same cut-point
   * segmentation cursor/selection/search already use below, so a
   * highlighted line keeps its per-token colors everywhere EXCEPT the
   * literal cursor/selection/match cells (which force their own color,
   * same as a plain line always has). */
  function tokenSpansFor(lineNo: number): { start: number; end: number; color: string }[] | null {
    const t = lines[lineNo - 1]?.t;
    if (typeof t === "string") return null;
    const spans: { start: number; end: number; color: string }[] = [];
    let pos = 0;
    for (const [idx, text] of t) {
      const start = pos;
      pos += text.length;
      spans.push({ start, end: pos, color: palette[idx] ?? "" });
    }
    return spans;
  }

  const selectionRange = $derived.by(():
    | { kind: "char"; range: VisualRange }
    | { kind: "line"; range: LineRange }
    | null => {
    if (mode === "visual" && visualAnchor) return { kind: "char", range: normalizeCharRange(visualAnchor, cursor) };
    if (mode === "visualLine" && visualAnchor) return { kind: "line", range: normalizeLineRange(visualAnchor, cursor) };
    return null;
  });

  const decorations = $derived.by(() => {
    const map = new Map<number, LineDecoration>();

    const matchesByLine = new Map<number, { col: number; length: number }[]>();
    for (const m of searchMatches) {
      const arr = matchesByLine.get(m.line) ?? [];
      arr.push({ col: m.col, length: m.length });
      matchesByLine.set(m.line, arr);
    }

    const sel = selectionRange;
    const interesting = new Set<number>(matchesByLine.keys());
    interesting.add(cursor.line);
    if (sel) {
      for (let l = sel.range.startLine; l <= sel.range.endLine; l++) interesting.add(l);
    }

    for (const lineNo of interesting) {
      const text = rawLines[lineNo - 1] ?? "";
      const isCursorLine = lineNo === cursor.line;

      // A discriminated union (tagged by `partial`), not a `{...} | "full" |
      // null` union — keeps every narrowing below a simple `.partial` check
      // instead of a string-literal comparison against an object type.
      type SelPart = { partial: false } | { partial: true; startCol: number; endCol: number } | null;
      let selPart: SelPart = null;
      if (sel?.kind === "line") {
        selPart = { partial: false };
      } else if (sel?.kind === "char") {
        const r = sel.range;
        if (lineNo > r.startLine && lineNo < r.endLine) selPart = { partial: false };
        else if (lineNo === r.startLine && lineNo === r.endLine)
          selPart = { partial: true, startCol: r.startCol, endCol: r.endCol };
        else if (lineNo === r.startLine)
          selPart = { partial: true, startCol: r.startCol, endCol: Math.max(r.startCol, text.length - 1) };
        else if (lineNo === r.endLine) selPart = { partial: true, startCol: 0, endCol: r.endCol };
      }

      const lineMatches = matchesByLine.get(lineNo) ?? [];
      const tokenSpans = tokenSpansFor(lineNo);

      if (selPart && !selPart.partial && !isCursorLine && lineMatches.length === 0 && !tokenSpans) {
        map.set(lineNo, { kind: "full-select" });
        continue;
      }

      if (text.length === 0) {
        map.set(lineNo, {
          kind: "segments",
          segments: [{ text: " ", cls: isCursorLine ? "cursor" : selPart ? "sel" : "" }],
        });
        continue;
      }

      const cuts = new Set<number>([0, text.length]);
      if (isCursorLine) {
        cuts.add(Math.min(text.length, cursor.col));
        cuts.add(Math.min(text.length, cursor.col + 1));
      }
      if (selPart?.partial) {
        cuts.add(Math.min(text.length, selPart.startCol));
        cuts.add(Math.min(text.length, selPart.endCol + 1));
      }
      for (const m of lineMatches) {
        cuts.add(Math.min(text.length, m.col));
        cuts.add(Math.min(text.length, m.col + m.length));
      }
      if (tokenSpans) {
        for (const s of tokenSpans) {
          cuts.add(Math.min(text.length, s.start));
          cuts.add(Math.min(text.length, s.end));
        }
      }
      const points = [...cuts].sort((a, b) => a - b);
      const segments: { text: string; cls: string; color?: string }[] = [];
      for (let i = 0; i < points.length - 1; i++) {
        const s = points[i];
        const eIdx = points[i + 1];
        if (s >= eIdx) continue;
        const classes: string[] = [];
        const inSel = selPart && (!selPart.partial || (s >= selPart.startCol && eIdx <= selPart.endCol + 1));
        if (inSel) classes.push("sel");
        if (lineMatches.some((m) => s >= m.col && eIdx <= m.col + m.length)) classes.push("match");
        if (isCursorLine && s >= cursor.col && eIdx <= cursor.col + 1) classes.push("cursor");
        const color = tokenSpans?.find((sp) => s >= sp.start && eIdx <= sp.end)?.color;
        segments.push({ text: text.slice(s, eIdx), cls: classes.join(" "), color });
      }
      map.set(lineNo, { kind: "segments", segments });
    }
    return map;
  });

  function segStyle(cls: string, color?: string): string | undefined {
    if (cls.includes("cursor")) return "background:#e0453c;color:#0b0f14";
    if (cls.includes("sel")) return "background:rgba(224,69,60,.22);color:#f4ece9";
    if (cls.includes("match")) return "background:rgba(95,198,180,.35);color:#eafaf6";
    if (color) return `color:${color}`;
    return undefined;
  }

  /** Same precedence as segStyle — one testid per segment, for e2e
   * assertions (PLAN.md Phase 3.4 "v/V selection highlight appears"). */
  function segTestId(cls: string): string | undefined {
    if (cls.includes("cursor")) return "editor-cursor";
    if (cls.includes("sel")) return "editor-selection";
    if (cls.includes("match")) return "editor-search-match";
    return undefined;
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
  <div
    bind:this={scrollerEl}
    onscroll={syncScroll}
    class="editor-scroller"
    data-testid="editor-scroller"
    style="flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:1px;padding:2px 14px"
  >
    {#each lines as l (l.n)}
      {@const d = decorations.get(l.n)}
      <div data-line={l.n} style="display:flex;gap:16px;white-space:pre">
        <span style="flex:none;width:26px;text-align:right;color:rgba(224,69,60,.4)">{l.n}</span
        >{#if !d}{#if typeof l.t === "string"}<span data-testid="editor-line-text" style={l.style}>{l.t}</span
          >{:else}<span data-testid="editor-line-text"
            >{#each l.t as [idx, text]}<span style={`color:${palette[idx] ?? ""}`}>{text}</span>{/each}</span
          >{/if}{:else if d.kind === "full-select"}<span
            data-testid="editor-line-text"
            style={`${l.style};background:rgba(224,69,60,.22)`}
            ><span data-testid="editor-selection">{lineText(l.t)}</span></span
          >{:else}<span data-testid="editor-line-text" style={l.style}
            >{#each d.segments as seg}<span style={segStyle(seg.cls, seg.color)} data-testid={segTestId(seg.cls)}
                >{seg.text}</span
              >{/each}</span
          >{/if}
      </div>
    {/each}
  </div>
  <!-- PLAN.md Phase 5 item 5.3 copy-mode source, text-only. NOT the visible
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
    style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:pre;margin:0">{rawLines.join(
      "\n",
    )}</pre>
  <div
    data-testid="editor-statusline"
    style="flex:none;flex-wrap:nowrap;display:flex;align-items:center;background:#0e1a20;font-size:12px"
  >
    <span
      data-testid="editor-mode"
      style="flex:none;background:#e0453c;color:#0b0f14;font-weight:700;padding:3px 12px">{modeOrPromptText}</span
    >
    <span style="flex:none;background:rgba(224,69,60,.22);color:#f0d9d4;padding:3px 12px">{labels.branch}</span>
    <span
      style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(196,216,232,.6);padding:3px 12px"
      >{breadcrumbLeft} {labels.breadcrumbSeparator} {breadcrumbRight}</span
    >
    {#if message}
      <span data-testid="editor-message" style="flex:none;white-space:nowrap;color:#e0453c;padding:3px 12px"
        >{message}</span
      >
    {/if}
    <span style="flex:1;min-width:0"></span>
    <span data-testid="editor-position" style="flex:none;white-space:nowrap;color:#5fc6b4;padding:3px 12px"
      >{scrollLabel} {positionText}</span
    >
    <button
      type="button"
      onclick={onClose}
      data-testid="editor-close-pill"
      style="flex:none;white-space:nowrap;background:rgba(95,198,180,.2);color:#5fc6b4;padding:3px 12px;border:none;font:inherit;cursor:pointer"
      >{labels.closePillLabel}</button
    >
    <span
      data-testid="paste-buffer"
      style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">{pasteBufferText}</span
    >
  </div>
</div>

<style>
  .editor-scroller {
    scrollbar-width: none;
  }
  .editor-scroller::-webkit-scrollbar {
    display: none;
  }
</style>
