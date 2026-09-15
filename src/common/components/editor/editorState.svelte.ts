import {
  clamp,
  clampCursor,
  extractLineRange,
  findMatches,
  normalizeCharRange,
  normalizeLineRange,
  type CursorPos,
  type LineRange,
  type VisualRange,
} from "../../engines/vim/vim";
import {
  setPasteBuffer,
  writeToSystemClipboard,
  type PasteBufferKind,
} from "../../lib/paste-buffer";
import { pushPasteTarget, removePasteTarget } from "../../lib/paste-targets";
import { lineText } from "./editor-render";
import type { EditorLabels } from "../../lib/data";
import type { TokenSpan } from "../../lib/repo-tree";

// Mirrors Editor.svelte's `EditorLine` structurally and is kept in sync by shape rather than import, since a plain .ts module can't import a type from a .svelte file under `tsc` (this file is type-checked by plain tsc via `pnpm typecheck`).
interface EditorLine {
  n: number;
  t: string | TokenSpan[];
  style: string;
}

export type LineDecoration =
  | { kind: "full-select" }
  | { kind: "segments"; segments: { text: string; cls: string; color?: string | undefined }[] };

// ---------------------------------------------------------------------
// Ctrl-b ] paste-target registration (one of the "grep query, employment
// filter, rename prompt, editor search" paste targets) — active only
// while the in-buffer `/` search prompt is
// actually accepting keystrokes, exactly like GrepOverlay's own query and
// EmploymentRecords's own filter registrations.
// ---------------------------------------------------------------------

const SEARCH_PASTE_TARGET_ID = "editor-search";

export class EditorState {
  constructor(
    private readonly linesFn: () => EditorLine[],
    private readonly paletteFn: () => string[],
    private readonly labelsFn: () => EditorLabels,
    private readonly isFocusedFn: () => boolean,
  ) {
    $effect(() => {
      this.syncScroll();
    });

    $effect(() => {
      if (this.pending !== "search" || !this.isFocused) return;
      pushPasteTarget({
        id: SEARCH_PASTE_TARGET_ID,
        insert: (text: string) => {
          this.searchQuery += text;
        },
      });
      return () => removePasteTarget(SEARCH_PASTE_TARGET_ID);
    });
  }

  get lines(): EditorLine[] {
    return this.linesFn();
  }
  get palette(): string[] {
    return this.paletteFn();
  }
  get labels(): EditorLabels {
    return this.labelsFn();
  }
  get isFocused(): boolean {
    return this.isFocusedFn();
  }

  rawLines = $derived(this.lines.map((l) => lineText(l.t)));

  scrollerEl = $state<HTMLDivElement | null>(null);
  scrollTopPx = $state(0);
  clientHeightPx = $state(0);
  scrollHeightPx = $state(0);

  syncScroll() {
    if (!this.scrollerEl) return;
    this.scrollTopPx = this.scrollerEl.scrollTop;
    this.clientHeightPx = this.scrollerEl.clientHeight;
    this.scrollHeightPx = this.scrollerEl.scrollHeight;
  }

  /** Row pitch (line height + the container's `gap:1px`), measured from two
   * adjacent rendered rows rather than assumed. */
  linePitch(): number {
    if (!this.scrollerEl) return 21;
    const rows = this.scrollerEl.querySelectorAll<HTMLElement>("[data-line]");
    if (rows.length >= 2) return rows[1].offsetTop - rows[0].offsetTop;
    if (rows.length === 1) return rows[0].offsetHeight + 1;
    return 21;
  }

  // ---------------------------------------------------------------------
  // Cursor + mode state ("Cursor model" / "Motions + modes")
  // ---------------------------------------------------------------------

  cursor = $state<CursorPos>({ line: 1, col: 0 });
  mode = $state<"normal" | "visual" | "visualLine">("normal");
  visualAnchor = $state<CursorPos | null>(null);

  pending = $state<"none" | "search">("none");
  searchQuery = $state("");
  lastSearchQuery = $state("");
  message = $state<string | null>(null);
  pasteBufferText = $state("");

  scrollToCursor() {
    const row = this.scrollerEl?.querySelector<HTMLElement>(`[data-line="${this.cursor.line}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }

  /** Every motion routes through here: clamps into the buffer (via
   * vim.ts's own clamp, so a column past a shorter line or a line past the
   * buffer's end always lands somewhere valid) and scrolls the new position
   * into view.
   *
   * `halfPage`/`fullPage` below manage scrolling themselves and
   * deliberately bypass this (see their own comment).
   *
   * Landing exactly on the first or last line snaps `scrollTop` straight to
   * that edge (0 / scrollHeight) instead of going through
   * `scrollIntoView({block: "nearest"})`, because "nearest" only
   * guarantees the row becomes visible, not that the scroller reaches its
   * true edge (it can stop a few px short), which would otherwise leave the
   * footer's Top/Bot indicator showing a stray "0%"/"99%" right after
   * gg/G/`:1`/a wrapped search lands on the first or last line. */
  setCursor(pos: CursorPos) {
    this.cursor = clampCursor(this.rawLines, pos);
    if (this.scrollerEl && this.cursor.line === 1) {
      this.scrollerEl.scrollTop = 0;
      this.syncScroll();
    } else if (this.scrollerEl && this.cursor.line === this.rawLines.length) {
      this.scrollerEl.scrollTop = this.scrollerEl.scrollHeight;
      this.syncScroll();
    } else {
      this.scrollToCursor();
    }
  }

  halfPage(dir: 1 | -1) {
    if (!this.scrollerEl) return;
    const clientH = this.scrollerEl.clientHeight;
    const maxScroll = Math.max(0, this.scrollerEl.scrollHeight - clientH);
    this.scrollerEl.scrollTop = clamp(
      this.scrollerEl.scrollTop + dir * (clientH / 2),
      0,
      maxScroll,
    );
    const pitch = this.linePitch();
    const linesMoved = Math.max(1, Math.round(clientH / 2 / pitch)) * dir;
    this.cursor = clampCursor(this.rawLines, {
      line: this.cursor.line + linesMoved,
      col: this.cursor.col,
    });
    this.syncScroll();
  }

  fullPage(dir: 1 | -1) {
    if (!this.scrollerEl) return;
    const clientH = this.scrollerEl.clientHeight;
    const maxScroll = Math.max(0, this.scrollerEl.scrollHeight - clientH);
    this.scrollerEl.scrollTop = clamp(this.scrollerEl.scrollTop + dir * clientH, 0, maxScroll);
    const pitch = this.linePitch();
    const linesMoved = Math.max(1, Math.round(clientH / pitch)) * dir;
    this.cursor = clampCursor(this.rawLines, {
      line: this.cursor.line + linesMoved,
      col: this.cursor.col,
    });
    this.syncScroll();
  }

  // ---------------------------------------------------------------------
  // Yank -> shared paste buffer + system clipboard ("y/yy")
  // ---------------------------------------------------------------------

  yank(text: string, kind: PasteBufferKind) {
    setPasteBuffer(text, kind);
    writeToSystemClipboard(text);
    this.pasteBufferText = text;
  }

  yankLineRange(range: LineRange) {
    this.yank(extractLineRange(this.rawLines, range), "line");
  }

  // ---------------------------------------------------------------------
  // Search.
  //
  // Matches are only recomputed when a query COMMITS (Enter, or
  // `lastSearchQuery` changes) — not on every keystroke of typing — so
  // scanning the whole buffer only happens once per search, not once per
  // character typed.
  // ---------------------------------------------------------------------

  searchMatches = $derived(findMatches(this.rawLines, this.lastSearchQuery));

  scrollLabel = $derived.by(() => {
    if (this.scrollHeightPx <= this.clientHeightPx || this.scrollTopPx <= 0)
      return this.labels.topLabel;
    if (this.scrollTopPx + this.clientHeightPx >= this.scrollHeightPx - 1)
      return this.labels.bottomLabel;
    const pct = Math.round((this.scrollTopPx / (this.scrollHeightPx - this.clientHeightPx)) * 100);
    return this.labels.percentTemplate.replace("{n}", String(pct));
  });

  positionText = $derived(
    this.labels.positionTemplate
      .replace("{line}", String(this.cursor.line))
      .replace("{col}", String(this.cursor.col + 1)),
  );

  modeOrPromptText = $derived.by(() => {
    if (this.pending === "search") return `${this.labels.searchPromptGlyph}${this.searchQuery}`;
    if (this.mode === "visual") return this.labels.modeVisualLabel;
    if (this.mode === "visualLine") return this.labels.modeVisualLineLabel;
    return this.labels.modeLabel;
  });

  // Character-level segmentation (cursor block, visual-selection, search-match highlights) only runs for "interesting" lines — the cursor's own line, the visual-selection span, and search-match lines — while every other line short-circuits to a single-span markup, keeping this cheap on large files.

  /** Token boundary offsets + per-offset palette color for one tokenized
   * line, or `null` for a plain-text line — folded into the same cut-point
   * segmentation cursor/selection/search already use below, so a
   * highlighted line keeps its per-token colors everywhere EXCEPT the
   * literal cursor/selection/match cells (which force their own color,
   * same as a plain line always has). */
  tokenSpansFor(lineNo: number): { start: number; end: number; color: string }[] | null {
    const t = this.lines[lineNo - 1]?.t;
    if (typeof t === "string") return null;
    const spans: { start: number; end: number; color: string }[] = [];
    let pos = 0;
    for (const [idx, text] of t) {
      const start = pos;
      pos += text.length;
      spans.push({ start, end: pos, color: this.palette[idx] ?? "" });
    }
    return spans;
  }

  selectionRange = $derived.by(
    (): { kind: "char"; range: VisualRange } | { kind: "line"; range: LineRange } | null => {
      if (this.mode === "visual" && this.visualAnchor)
        return { kind: "char", range: normalizeCharRange(this.visualAnchor, this.cursor) };
      if (this.mode === "visualLine" && this.visualAnchor)
        return { kind: "line", range: normalizeLineRange(this.visualAnchor, this.cursor) };
      return null;
    },
  );

  decorations = $derived.by(() => {
    const map = new Map<number, LineDecoration>();

    const matchesByLine = new Map<number, { col: number; length: number }[]>();
    for (const m of this.searchMatches) {
      const arr = matchesByLine.get(m.line) ?? [];
      arr.push({ col: m.col, length: m.length });
      matchesByLine.set(m.line, arr);
    }

    const sel = this.selectionRange;
    const interesting = new Set<number>(matchesByLine.keys());
    interesting.add(this.cursor.line);
    if (sel) {
      for (let l = sel.range.startLine; l <= sel.range.endLine; l++) interesting.add(l);
    }

    for (const lineNo of interesting) {
      const text = this.rawLines[lineNo - 1] ?? "";
      const isCursorLine = lineNo === this.cursor.line;

      // A discriminated union (tagged by `partial`), not a `{...} | "full" |
      // null` union — keeps every narrowing below a simple `.partial` check
      // instead of a string-literal comparison against an object type.
      type SelPart =
        { partial: false } | { partial: true; startCol: number; endCol: number } | null;
      let selPart: SelPart = null;
      if (sel?.kind === "line") {
        selPart = { partial: false };
      } else if (sel?.kind === "char") {
        const r = sel.range;
        if (lineNo > r.startLine && lineNo < r.endLine) selPart = { partial: false };
        else if (lineNo === r.startLine && lineNo === r.endLine)
          selPart = { partial: true, startCol: r.startCol, endCol: r.endCol };
        else if (lineNo === r.startLine)
          selPart = {
            partial: true,
            startCol: r.startCol,
            endCol: Math.max(r.startCol, text.length - 1),
          };
        else if (lineNo === r.endLine) selPart = { partial: true, startCol: 0, endCol: r.endCol };
      }

      const lineMatches = matchesByLine.get(lineNo) ?? [];
      const tokenSpans = this.tokenSpansFor(lineNo);

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
        cuts.add(Math.min(text.length, this.cursor.col));
        cuts.add(Math.min(text.length, this.cursor.col + 1));
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
      const segments: { text: string; cls: string; color?: string | undefined }[] = [];
      for (let i = 0; i < points.length - 1; i++) {
        const s = points[i];
        const eIdx = points[i + 1];
        if (s >= eIdx) continue;
        const classes: string[] = [];
        const inSel =
          selPart && (!selPart.partial || (s >= selPart.startCol && eIdx <= selPart.endCol + 1));
        if (inSel) classes.push("sel");
        if (lineMatches.some((m) => s >= m.col && eIdx <= m.col + m.length)) classes.push("match");
        if (isCursorLine && s >= this.cursor.col && eIdx <= this.cursor.col + 1)
          classes.push("cursor");
        const color = tokenSpans?.find((sp) => s >= sp.start && eIdx <= sp.end)?.color;
        segments.push({ text: text.slice(s, eIdx), cls: classes.join(" "), color });
      }
      map.set(lineNo, { kind: "segments", segments });
    }
    return map;
  });
}
