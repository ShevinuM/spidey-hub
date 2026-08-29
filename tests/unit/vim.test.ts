// Unit tests for the pure vim-lite engine (src/lib/vim.ts) — engine purity,
// covering word-boundary motions across
// punctuation/whitespace/line boundaries, numeric counts, 0/^/$ semantics,
// visual-range normalization (charwise + linewise) and their yanked text,
// and search + wraparound. Editor.svelte (DOM-dependent, e2e-covered
// instead) is deliberately untested here.
import { expect, test } from "vitest";
import {
  clampCursor,
  comparePos,
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
} from "../../src/lib/vim";

function pos(line: number, col: number): CursorPos {
  return { line, col };
}

// ---------------------------------------------------------------------------
// Word motions
// ---------------------------------------------------------------------------

test("w: crosses punctuation, whitespace, and stops at each word/punct run", () => {
  const lines = ["foo.bar  baz"];
  //             0123456789...
  // f o o . b a r     b a z
  // 0 1 2 3 4 5 6 7 8 9 ...
  expect(wordForward(lines, pos(1, 0))).toEqual(pos(1, 3)); // foo -> .
  expect(wordForward(lines, pos(1, 3))).toEqual(pos(1, 4)); // . -> bar
  expect(wordForward(lines, pos(1, 4))).toEqual(pos(1, 9)); // bar -> baz (skips the double space)
});

test("w: crosses a line boundary onto the next line's first word", () => {
  const lines = ["one", "two"];
  expect(wordForward(lines, pos(1, 0))).toEqual(pos(2, 0));
});

test("w: an empty line is always a stop, even mid-whitespace-skip", () => {
  const lines = ["one", "", "two"];
  expect(wordForward(lines, pos(1, 0))).toEqual(pos(2, 0));
  expect(wordForward(lines, pos(2, 0))).toEqual(pos(3, 0));
});

test("w: stops at the last character when there is nothing further forward", () => {
  const lines = ["last"];
  expect(wordForward(lines, pos(1, 0))).toEqual(pos(1, 3));
  expect(wordForward(lines, pos(1, 3))).toEqual(pos(1, 3));
});

test("b: symmetric backward motion across punctuation and line boundaries", () => {
  const lines = ["foo.bar", "baz"];
  expect(wordBackward(lines, pos(2, 0))).toEqual(pos(1, 4)); // baz -> bar
  expect(wordBackward(lines, pos(1, 4))).toEqual(pos(1, 3)); // bar -> .
  expect(wordBackward(lines, pos(1, 3))).toEqual(pos(1, 0)); // . -> foo
  expect(wordBackward(lines, pos(1, 0))).toEqual(pos(1, 0)); // start of buffer clamps
});

test("e: lands on the end of the current or next word, skipping whitespace", () => {
  const lines = ["foo  bar.baz"];
  expect(wordEnd(lines, pos(1, 0))).toEqual(pos(1, 2)); // end of "foo"
  expect(wordEnd(lines, pos(1, 2))).toEqual(pos(1, 7)); // end of "bar"
  expect(wordEnd(lines, pos(1, 7))).toEqual(pos(1, 8)); // end of "."
});

test("word motions honor a numeric count (applied as N single steps)", () => {
  const lines = ["a b c d e"];
  expect(wordForward(lines, pos(1, 0), 3)).toEqual(pos(1, 6)); // a -> b -> c -> d (3 steps lands ON d)
  expect(wordBackward(lines, pos(1, 8), 2)).toEqual(pos(1, 4)); // e -> d -> c (2 steps lands on c)
});

// ---------------------------------------------------------------------------
// 0 / ^ / $ and clamping
// ---------------------------------------------------------------------------

test("firstNonBlankCol / lineEndCol", () => {
  const lines = ["   indented", "", "x"];
  expect(firstNonBlankCol(lines, 1)).toBe(3);
  expect(firstNonBlankCol(lines, 2)).toBe(0); // all-blank line -> column 0
  expect(lineEndCol(lines, 1)).toBe(10);
  expect(lineEndCol(lines, 2)).toBe(0); // empty line -> column 0
  expect(lineEndCol(lines, 3)).toBe(0);
});

test("clampCursor keeps the block cursor from ever sitting past a line's last character", () => {
  const lines = ["short", "a much longer line"];
  expect(clampCursor(lines, pos(1, 99))).toEqual(pos(1, 4));
  expect(clampCursor(lines, pos(0, 0))).toEqual(pos(1, 0)); // line clamps to 1
  expect(clampCursor(lines, pos(99, 0))).toEqual(pos(2, 0));
});

test("moveVertical clamps the column into the destination line's own length", () => {
  const lines = ["a much longer line", "short"];
  expect(moveVertical(lines, pos(1, 15), 1)).toEqual(pos(2, 4));
});

test("moveHorizontal clamps at both ends of the line", () => {
  const lines = ["abc"];
  expect(moveHorizontal(lines, pos(1, 1), -5)).toEqual(pos(1, 0));
  expect(moveHorizontal(lines, pos(1, 1), 5)).toEqual(pos(1, 2));
});

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

test("isCountStartDigit excludes 0 (0 alone is the line-start motion)", () => {
  expect(isCountStartDigit("0")).toBe(false);
  expect(isCountStartDigit("1")).toBe(true);
  expect(isCountStartDigit("9")).toBe(true);
});

test("isCountDigit includes 0 (valid mid-count, e.g. the '0' in '10j')", () => {
  expect(isCountDigit("0")).toBe(true);
  expect(isCountDigit("5")).toBe(true);
  expect(isCountDigit("a")).toBe(false);
});

test("parseCount", () => {
  expect(parseCount("")).toBe(1);
  expect(parseCount("5")).toBe(5);
  expect(parseCount("12")).toBe(12);
  expect(parseCount("0")).toBe(1); // defensive: never a 0-count
});

// ---------------------------------------------------------------------------
// Visual-range normalization + yank extraction
// ---------------------------------------------------------------------------

test("normalizeCharRange orders anchor/cursor regardless of selection direction", () => {
  expect(normalizeCharRange(pos(2, 5), pos(1, 2))).toEqual({
    startLine: 1,
    startCol: 2,
    endLine: 2,
    endCol: 5,
  });
  expect(normalizeCharRange(pos(1, 2), pos(2, 5))).toEqual({
    startLine: 1,
    startCol: 2,
    endLine: 2,
    endCol: 5,
  });
});

test("normalizeLineRange orders anchor/cursor by line only", () => {
  expect(normalizeLineRange(pos(5, 0), pos(2, 9))).toEqual({ startLine: 2, endLine: 5 });
});

test("comparePos", () => {
  expect(comparePos(pos(1, 0), pos(2, 0)) < 0).toBeTruthy();
  expect(comparePos(pos(2, 0), pos(1, 0)) > 0).toBeTruthy();
  expect(comparePos(pos(1, 3), pos(1, 3))).toBe(0);
  expect(comparePos(pos(1, 1), pos(1, 3)) < 0).toBeTruthy();
});

test("extractCharRange: single line is an inclusive slice", () => {
  const lines = ["hello world"];
  expect(extractCharRange(lines, { startLine: 1, startCol: 0, endLine: 1, endCol: 4 })).toBe("hello");
});

test("extractCharRange: multi-line joins with newlines, first/last lines partial", () => {
  const lines = ["one two", "middle", "three four"];
  expect(extractCharRange(lines, { startLine: 1, startCol: 4, endLine: 3, endCol: 4 })).toBe("two\nmiddle\nthree");
});

test("extractLineRange: whole lines joined with a trailing newline (linewise yank)", () => {
  const lines = ["a", "b", "c", "d"];
  expect(extractLineRange(lines, { startLine: 2, endLine: 3 })).toBe("b\nc\n");
});

// ---------------------------------------------------------------------------
// Search + wraparound
// ---------------------------------------------------------------------------

test("findMatches: case-sensitive, every occurrence across every line", () => {
  const lines = ["foo bar foo", "FOO", "bar"];
  expect(findMatches(lines, "foo")).toEqual([
    { line: 1, col: 0, length: 3 },
    { line: 1, col: 8, length: 3 },
  ]);
});

test("findMatches: empty query yields no matches", () => {
  expect(findMatches(["anything"], "")).toEqual([]);
});

test("nextMatch: steps forward, wraps to the first match past the end", () => {
  const matches = [
    { line: 1, col: 0, length: 3 },
    { line: 3, col: 2, length: 3 },
    { line: 5, col: 0, length: 3 },
  ];
  expect(nextMatch(matches, pos(1, 0), 1)).toEqual(matches[1]); // strictly after (1,0)
  expect(nextMatch(matches, pos(4, 0), 1)).toEqual(matches[2]);
  // Sitting exactly ON the last match is not "strictly after" it, so this
  // wraps immediately to the first match — matching vim's own `n` behavior
  // of never re-landing on the match the cursor already sits on.
  expect(nextMatch(matches, pos(5, 0), 1)).toEqual(matches[0]);
  expect(nextMatch(matches, pos(6, 0), 1)).toEqual(matches[0]); // wraps past the last match
});

test("nextMatch: steps backward, wraps to the last match before the start", () => {
  const matches = [
    { line: 1, col: 0, length: 3 },
    { line: 3, col: 2, length: 3 },
    { line: 5, col: 0, length: 3 },
  ];
  expect(nextMatch(matches, pos(5, 0), -1)).toEqual(matches[1]);
  expect(nextMatch(matches, pos(1, 0), -1)).toEqual(matches[2]); // wraps before the first match
});

test("nextMatch: no matches returns null", () => {
  expect(nextMatch([], pos(1, 0), 1)).toBe(null);
});
