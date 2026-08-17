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
  // `/` search with `n`/`N`, and a minimal `:` ex-command line (`:q`/`:q!`
  // close, `:w`/`:wq` show a readonly error, `:<number>` jumps, anything
  // else is an E492-style error) — all of it vim-faithful, none of it able
  // to actually mutate the buffer (every insert/change/delete-family key
  // just flashes a readonly bell). The actual motion/word/search/range math
  // lives in `../lib/vim.ts`, a pure (no-DOM) module so it's unit-testable
  // on its own (tests/unit/vim.test.ts); this component owns only the
  // stateful parts (mode, cursor, pending key sequences, scroll sync,
  // rendering).
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

  export interface EditorLine {
    n: number;
    t: string;
    style: string;
  }

  interface Props {
    fileName: string;
    lines: EditorLine[];
    labels: EditorLabels;
    breadcrumbLeft: string;
    breadcrumbRight: string;
    onClose: () => void;
  }

  const { fileName, lines, labels, breadcrumbLeft, breadcrumbRight, onClose }: Props = $props();

  const rawLines = $derived(lines.map((l) => l.t));

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

  let pending = $state<"none" | "search" | "cmdline">("none");
  let searchQuery = $state("");
  let lastSearchQuery = $state("");
  let cmdlineText = $state("");
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
  // Keymap
  // ---------------------------------------------------------------------

  function handleEscape(): boolean {
    if (pending === "search") {
      pending = "none";
      searchQuery = "";
      return true;
    }
    if (pending === "cmdline") {
      pending = "none";
      cmdlineText = "";
      return true;
    }
    if (mode !== "normal") {
      mode = "normal";
      visualAnchor = null;
      return true;
    }
    // Bare Esc in NORMAL mode is a vim-faithful no-op — PLAN.md items 15/16
    // ban q/Esc from ever switching views, and this editor's own close path
    // is `:q`/`:q!` only (see executeCmdline below), never Esc.
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

  function executeCmdline(cmd: string) {
    if (cmd === "") return;
    if (cmd === "q" || cmd === "q!") {
      onClose();
      return;
    }
    if (cmd === "w" || cmd === "wq") {
      message = labels.writeReadonlyMessage;
      return;
    }
    if (/^\d+$/.test(cmd)) {
      const target = clamp(Number.parseInt(cmd, 10), 1, Math.max(1, rawLines.length));
      setCursor({ line: target, col: firstNonBlankCol(rawLines, target) });
      return;
    }
    message = labels.notAnEditorCommandTemplate.replace("{cmd}", cmd);
  }

  function handleCmdlineInput(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return true;
    if (e.key === "Enter") {
      executeCmdline(cmdlineText.trim());
      cmdlineText = "";
      pending = "none";
      return true;
    }
    if (e.key === "Backspace") {
      cmdlineText = cmdlineText.slice(0, -1);
      return true;
    }
    if (e.key.length === 1) {
      cmdlineText += e.key;
      return true;
    }
    return true;
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

    // `/` and `:` are handled from EVERY mode (not just NORMAL), including
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
    if (key === ":") {
      mode = "normal";
      visualAnchor = null;
      pending = "cmdline";
      cmdlineText = "";
      return true;
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
   * its own panel key). Esc only ever cancels a modal input (search,
   * cmdline) or a visual selection — PLAN.md Phase 3 removes the old bare
   * q/Esc close entirely; `:q`/`:q!` (via executeCmdline above) is the only
   * way out now, plus the mouse `[:q]` pill in the footer below.
   */
  export function handleKey(e: KeyboardEvent): boolean {
    message = null;

    if (e.key === "Escape") {
      return handleEscape();
    }
    if (pending === "search") {
      return handleSearchInput(e);
    }
    if (pending === "cmdline") {
      return handleCmdlineInput(e);
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
    if (pending === "cmdline") return `${labels.cmdlinePromptGlyph}${cmdlineText}`;
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
    | { kind: "segments"; segments: { text: string; cls: string }[] };

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

      if (selPart && !selPart.partial && !isCursorLine && lineMatches.length === 0) {
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
      const points = [...cuts].sort((a, b) => a - b);
      const segments: { text: string; cls: string }[] = [];
      for (let i = 0; i < points.length - 1; i++) {
        const s = points[i];
        const eIdx = points[i + 1];
        if (s >= eIdx) continue;
        const classes: string[] = [];
        const inSel = selPart && (!selPart.partial || (s >= selPart.startCol && eIdx <= selPart.endCol + 1));
        if (inSel) classes.push("sel");
        if (lineMatches.some((m) => s >= m.col && eIdx <= m.col + m.length)) classes.push("match");
        if (isCursorLine && s >= cursor.col && eIdx <= cursor.col + 1) classes.push("cursor");
        segments.push({ text: text.slice(s, eIdx), cls: classes.join(" ") });
      }
      map.set(lineNo, { kind: "segments", segments });
    }
    return map;
  });

  function segStyle(cls: string): string | undefined {
    if (cls.includes("cursor")) return "background:#e0453c;color:#0b0f14";
    if (cls.includes("sel")) return "background:rgba(224,69,60,.22);color:#f4ece9";
    if (cls.includes("match")) return "background:rgba(95,198,180,.35);color:#eafaf6";
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
      <div data-line={l.n} style="display:flex;gap:16px">
        <span style="flex:none;width:26px;text-align:right;color:rgba(224,69,60,.4)">{l.n}</span
        >{#if !d}<span data-testid="editor-line-text" style={l.style}>{l.t}</span
        >{:else if d.kind === "full-select"}<span
            data-testid="editor-line-text"
            style={`${l.style};background:rgba(224,69,60,.22)`}
            ><span data-testid="editor-selection">{l.t}</span></span
          >{:else}<span data-testid="editor-line-text" style={l.style}
            >{#each d.segments as seg}<span style={segStyle(seg.cls)} data-testid={segTestId(seg.cls)}
                >{seg.text}</span
              >{/each}</span
          >{/if}
      </div>
    {/each}
  </div>
  <div style="flex:none;display:flex;align-items:center;background:#0e1a20;font-size:12px">
    <span data-testid="editor-mode" style="background:#e0453c;color:#0b0f14;font-weight:700;padding:3px 12px"
      >{modeOrPromptText}</span
    >
    <span style="background:rgba(224,69,60,.22);color:#f0d9d4;padding:3px 12px">{labels.branch}</span>
    <span style="color:rgba(196,216,232,.6);padding:3px 12px"
      >{breadcrumbLeft} {labels.breadcrumbSeparator} {breadcrumbRight}</span
    >
    {#if message}
      <span data-testid="editor-message" style="color:#e0453c;padding:3px 12px">{message}</span>
    {/if}
    <span style="flex:1"></span>
    <span data-testid="editor-position" style="color:#5fc6b4;padding:3px 12px">{scrollLabel} {positionText}</span>
    <button
      type="button"
      onclick={onClose}
      data-testid="editor-close-pill"
      style="background:rgba(95,198,180,.2);color:#5fc6b4;padding:3px 12px;border:none;font:inherit;cursor:pointer"
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
