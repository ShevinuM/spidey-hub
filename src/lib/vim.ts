// Pure vim-lite motion/word/search/visual-range engine for Editor.svelte
// (PLAN.md Phase 3 item 10 / 3.4 "engine purity"). Deliberately has zero DOM
// dependency so it is unit-testable in isolation (tests/unit/vim.test.ts) —
// Editor.svelte owns all state (cursor position, mode, pending timers,
// scroll sync) and calls into these pure functions for the actual motion
// math. Every position is `{ line, col }` with a 1-based `line` (matching
// the rest of the codebase's existing line-cursor convention, e.g.
// Editor.svelte's pre-Phase-3 `cursorLine`) and a 0-based `col` (a plain
// character index into that line's string), converted to a 1-based display
// column only at the UI layer (`positionTemplate`'s `{col}`).
//
// `lines` throughout is a plain `string[]` (0-indexed, `lines[line - 1]` is
// the text of 1-based `line`) — Editor.svelte derives this from its
// `EditorLine[]` prop (`lines.map((l) => l.t)`) once per render via
// `$derived`, not per keystroke.

export interface CursorPos {
  line: number;
  col: number;
}

export interface VisualRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface LineRange {
  startLine: number;
  endLine: number;
}

export interface SearchMatch {
  line: number;
  col: number;
  length: number;
}

// ---------------------------------------------------------------------------
// Word-class helpers (vim's own `w`/`b`/`e` word definition: a "word" is a
// maximal run of keyword characters OR a maximal run of other non-blank
// characters; whitespace runs — including line breaks, treated as a single
// space character here via the `col >= line.length` sentinel below — are
// always skipped between words, except that landing on a truly empty line
// always counts as a stop, exactly like real vim).
// ---------------------------------------------------------------------------

type CharClass = "word" | "punct" | "space";

function charClass(ch: string | undefined): CharClass {
  if (ch === undefined || ch === "" || /\s/.test(ch)) return "space";
  if (/[A-Za-z0-9_]/.test(ch)) return "word";
  return "punct";
}

function classAt(lines: string[], line: number, col: number): CharClass {
  const text = lines[line - 1] ?? "";
  if (col >= text.length) return "space"; // end-of-line / newline sentinel
  return charClass(text[col]);
}

/** One character step across the whole buffer, treating the gap between a
 * line's last column and the next line's column 0 as crossing a newline.
 * Returns `null` at the very start/end of the buffer. */
function step(lines: string[], pos: CursorPos, dir: 1 | -1): CursorPos | null {
  const { line, col } = pos;
  if (dir === 1) {
    const len = (lines[line - 1] ?? "").length;
    if (col < len) return { line, col: col + 1 };
    if (line < lines.length) return { line: line + 1, col: 0 };
    return null;
  }
  if (col > 0) return { line, col: col - 1 };
  if (line > 1) {
    const prevLen = (lines[line - 2] ?? "").length;
    return { line: line - 1, col: prevLen }; // EOL sentinel of the previous line
  }
  return null;
}

function wordForwardOnce(lines: string[], pos: CursorPos): CursorPos {
  let cur = pos;
  const startCls = classAt(lines, cur.line, cur.col);
  if (startCls !== "space") {
    while (true) {
      const next = step(lines, cur, 1);
      if (!next) return cur;
      if (classAt(lines, next.line, next.col) !== startCls) {
        cur = next;
        break;
      }
      cur = next;
    }
  } else {
    const next = step(lines, cur, 1);
    if (!next) return cur;
    cur = next;
  }
  while (true) {
    const text = lines[cur.line - 1] ?? "";
    if (text.length === 0) return { line: cur.line, col: 0 }; // empty line always stops
    if (classAt(lines, cur.line, cur.col) !== "space") return cur;
    const next = step(lines, cur, 1);
    if (!next) return { line: cur.line, col: Math.max(0, text.length - 1) };
    cur = next;
  }
}

function wordBackwardOnce(lines: string[], pos: CursorPos): CursorPos {
  let cur = step(lines, pos, -1);
  if (!cur) return { line: 1, col: 0 };
  while (classAt(lines, cur.line, cur.col) === "space") {
    const text = lines[cur.line - 1] ?? "";
    if (text.length === 0) return { line: cur.line, col: 0 };
    const prev = step(lines, cur, -1);
    if (!prev) return { line: 1, col: 0 };
    cur = prev;
  }
  const cls = classAt(lines, cur.line, cur.col);
  while (true) {
    const prev = step(lines, cur, -1);
    if (!prev) break;
    if (classAt(lines, prev.line, prev.col) !== cls) break;
    cur = prev;
  }
  return cur;
}

function wordEndOnce(lines: string[], pos: CursorPos): CursorPos {
  let cur = step(lines, pos, 1);
  if (!cur) return pos;
  while (classAt(lines, cur.line, cur.col) === "space") {
    const next = step(lines, cur, 1);
    if (!next) {
      const text = lines[cur.line - 1] ?? "";
      return { line: cur.line, col: Math.max(0, text.length - 1) };
    }
    cur = next;
  }
  const cls = classAt(lines, cur.line, cur.col);
  while (true) {
    const next = step(lines, cur, 1);
    if (!next) break;
    if (classAt(lines, next.line, next.col) !== cls) break;
    cur = next;
  }
  return cur;
}

/** `w` — count-aware. */
export function wordForward(lines: string[], pos: CursorPos, count = 1): CursorPos {
  let cur = pos;
  for (let i = 0; i < count; i++) cur = wordForwardOnce(lines, cur);
  return cur;
}

/** `b` — count-aware. */
export function wordBackward(lines: string[], pos: CursorPos, count = 1): CursorPos {
  let cur = pos;
  for (let i = 0; i < count; i++) cur = wordBackwardOnce(lines, cur);
  return cur;
}

/** `e` — count-aware. */
export function wordEnd(lines: string[], pos: CursorPos, count = 1): CursorPos {
  let cur = pos;
  for (let i = 0; i < count; i++) cur = wordEndOnce(lines, cur);
  return cur;
}

// ---------------------------------------------------------------------------
// 0 / ^ / $ and clamping
// ---------------------------------------------------------------------------

/** `^` — first non-blank character of the line, or column 0 if the line is
 * entirely blank. */
export function firstNonBlankCol(lines: string[], line: number): number {
  const text = lines[line - 1] ?? "";
  for (let i = 0; i < text.length; i++) {
    if (charClass(text[i]) !== "space") return i;
  }
  return 0;
}

/** `$` — last character of the line, or column 0 if the line is empty. */
export function lineEndCol(lines: string[], line: number): number {
  const text = lines[line - 1] ?? "";
  return Math.max(0, text.length - 1);
}

/** Clamps a position into the buffer's bounds: line into `[1, lines.length]`
 * (or `1` for an empty buffer), then column into `[0, lineLength - 1]` (or
 * `0` for an empty line) — this is the "block cursor can't sit past the
 * last character" rule normal/visual mode both need. */
export function clampCursor(lines: string[], pos: CursorPos): CursorPos {
  const lastLine = Math.max(1, lines.length);
  const line = Math.min(Math.max(1, pos.line), lastLine);
  const len = (lines[line - 1] ?? "").length;
  const col = Math.min(Math.max(0, pos.col), Math.max(0, len - 1));
  return { line, col };
}

export function moveVertical(lines: string[], pos: CursorPos, deltaLines: number): CursorPos {
  return clampCursor(lines, { line: pos.line + deltaLines, col: pos.col });
}

export function moveHorizontal(lines: string[], pos: CursorPos, deltaCols: number): CursorPos {
  return clampCursor(lines, { line: pos.line, col: pos.col + deltaCols });
}

// ---------------------------------------------------------------------------
// Counts (numeric prefixes — `5j`, `3w`, `3yy`)
// ---------------------------------------------------------------------------

export function isCountStartDigit(key: string): boolean {
  return key >= "1" && key <= "9";
}

export function isCountDigit(key: string): boolean {
  return key >= "0" && key <= "9";
}

/** Parses an accumulated digit string (e.g. `"5"`, `"12"`) into a motion
 * count. An empty string (no count typed) is 1, vim's implicit default. */
export function parseCount(digits: string): number {
  if (!digits) return 1;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// ---------------------------------------------------------------------------
// Visual-mode range normalization (charwise `v` / linewise `V`)
// ---------------------------------------------------------------------------

export function comparePos(a: CursorPos, b: CursorPos): number {
  return a.line !== b.line ? a.line - b.line : a.col - b.col;
}

/** Orders an anchor/cursor pair into a `{start, end}` range regardless of
 * which one is "before" the other (the user can select in either
 * direction). Inclusive of both endpoints, matching vim's own charwise
 * visual selection semantics. */
export function normalizeCharRange(anchor: CursorPos, cursor: CursorPos): VisualRange {
  const [a, b] = comparePos(anchor, cursor) <= 0 ? [anchor, cursor] : [cursor, anchor];
  return { startLine: a.line, startCol: a.col, endLine: b.line, endCol: b.col };
}

export function normalizeLineRange(anchor: CursorPos, cursor: CursorPos): LineRange {
  return { startLine: Math.min(anchor.line, cursor.line), endLine: Math.max(anchor.line, cursor.line) };
}

/** The literal text a charwise visual selection would yank — used both for
 * the paste-buffer payload and unit tests. Newlines are re-inserted between
 * spanned lines (multi-line selections), matching vim's own yanked-text
 * shape. */
export function extractCharRange(lines: string[], range: VisualRange): string {
  const first = lines[range.startLine - 1] ?? "";
  if (range.startLine === range.endLine) {
    return first.slice(range.startCol, range.endCol + 1);
  }
  const parts: string[] = [first.slice(range.startCol)];
  for (let l = range.startLine + 1; l < range.endLine; l++) parts.push(lines[l - 1] ?? "");
  const last = lines[range.endLine - 1] ?? "";
  parts.push(last.slice(0, range.endCol + 1));
  return parts.join("\n");
}

/** The literal text a linewise yank (`yy`, `V` + `y`) would produce — whole
 * lines joined with a trailing newline, matching vim's linewise register
 * shape. */
export function extractLineRange(lines: string[], range: LineRange): string {
  return lines.slice(range.startLine - 1, range.endLine).join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// In-buffer search (`/`, `n`/`N`)
// ---------------------------------------------------------------------------

/** Case-sensitive substring search across every line — vim's own default
 * (`:set noignorecase`); deliberately not mirroring grep.ts's
 * case-insensitive convention, which is a different feature (`src/lib/
 * grep.ts`'s file/content search) with its own contract. Overlapping
 * matches are not produced (each match consumes its own length before the
 * next search starts), matching vim's `/` behavior. */
export function findMatches(lines: string[], query: string): SearchMatch[] {
  if (!query) return [];
  const matches: SearchMatch[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let from = 0;
    while (from <= line.length) {
      const idx = line.indexOf(query, from);
      if (idx === -1) break;
      matches.push({ line: i + 1, col: idx, length: query.length });
      from = idx + Math.max(1, query.length);
    }
  }
  return matches;
}

/** `n`/`N` — the next match strictly after (or, for `-1`, strictly before)
 * `from`, wrapping around the buffer's ends. Returns `null` only when there
 * are no matches at all. */
export function nextMatch(matches: SearchMatch[], from: CursorPos, direction: 1 | -1): SearchMatch | null {
  if (matches.length === 0) return null;
  if (direction === 1) {
    for (const m of matches) {
      if (m.line > from.line || (m.line === from.line && m.col > from.col)) return m;
    }
    return matches[0]; // wrap to the first match
  }
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    if (m.line < from.line || (m.line === from.line && m.col < from.col)) return m;
  }
  return matches[matches.length - 1]; // wrap to the last match
}
