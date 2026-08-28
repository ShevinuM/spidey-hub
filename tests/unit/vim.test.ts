// Unit tests for the pure vim-lite engine (src/lib/vim.ts) — engine purity,
// covering word-boundary motions across
// punctuation/whitespace/line boundaries, numeric counts, 0/^/$ semantics,
// visual-range normalization (charwise + linewise) and their yanked text,
// and search + wraparound. Editor.svelte (DOM-dependent, e2e-covered
// instead) is deliberately untested here.
import { test } from "node:test";
import assert from "node:assert/strict";
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
} from "../../src/lib/vim.ts";

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
  assert.deepEqual(wordForward(lines, pos(1, 0)), pos(1, 3)); // foo -> .
  assert.deepEqual(wordForward(lines, pos(1, 3)), pos(1, 4)); // . -> bar
  assert.deepEqual(wordForward(lines, pos(1, 4)), pos(1, 9)); // bar -> baz (skips the double space)
});

test("w: crosses a line boundary onto the next line's first word", () => {
  const lines = ["one", "two"];
  assert.deepEqual(wordForward(lines, pos(1, 0)), pos(2, 0));
});

test("w: an empty line is always a stop, even mid-whitespace-skip", () => {
  const lines = ["one", "", "two"];
  assert.deepEqual(wordForward(lines, pos(1, 0)), pos(2, 0));
  assert.deepEqual(wordForward(lines, pos(2, 0)), pos(3, 0));
});

test("w: stops at the last character when there is nothing further forward", () => {
  const lines = ["last"];
  assert.deepEqual(wordForward(lines, pos(1, 0)), pos(1, 3));
  assert.deepEqual(wordForward(lines, pos(1, 3)), pos(1, 3));
});

test("b: symmetric backward motion across punctuation and line boundaries", () => {
  const lines = ["foo.bar", "baz"];
  assert.deepEqual(wordBackward(lines, pos(2, 0)), pos(1, 4)); // baz -> bar
  assert.deepEqual(wordBackward(lines, pos(1, 4)), pos(1, 3)); // bar -> .
  assert.deepEqual(wordBackward(lines, pos(1, 3)), pos(1, 0)); // . -> foo
  assert.deepEqual(wordBackward(lines, pos(1, 0)), pos(1, 0)); // start of buffer clamps
});

test("e: lands on the end of the current or next word, skipping whitespace", () => {
  const lines = ["foo  bar.baz"];
  assert.deepEqual(wordEnd(lines, pos(1, 0)), pos(1, 2)); // end of "foo"
  assert.deepEqual(wordEnd(lines, pos(1, 2)), pos(1, 7)); // end of "bar"
  assert.deepEqual(wordEnd(lines, pos(1, 7)), pos(1, 8)); // end of "."
});

test("word motions honor a numeric count (applied as N single steps)", () => {
  const lines = ["a b c d e"];
  assert.deepEqual(wordForward(lines, pos(1, 0), 3), pos(1, 6)); // a -> b -> c -> d (3 steps lands ON d)
  assert.deepEqual(wordBackward(lines, pos(1, 8), 2), pos(1, 4)); // e -> d -> c (2 steps lands on c)
});

// ---------------------------------------------------------------------------
// 0 / ^ / $ and clamping
// ---------------------------------------------------------------------------

test("firstNonBlankCol / lineEndCol", () => {
  const lines = ["   indented", "", "x"];
  assert.equal(firstNonBlankCol(lines, 1), 3);
  assert.equal(firstNonBlankCol(lines, 2), 0); // all-blank line -> column 0
  assert.equal(lineEndCol(lines, 1), 10);
  assert.equal(lineEndCol(lines, 2), 0); // empty line -> column 0
  assert.equal(lineEndCol(lines, 3), 0);
});

test("clampCursor keeps the block cursor from ever sitting past a line's last character", () => {
  const lines = ["short", "a much longer line"];
  assert.deepEqual(clampCursor(lines, pos(1, 99)), pos(1, 4));
  assert.deepEqual(clampCursor(lines, pos(0, 0)), pos(1, 0)); // line clamps to 1
  assert.deepEqual(clampCursor(lines, pos(99, 0)), pos(2, 0));
});

test("moveVertical clamps the column into the destination line's own length", () => {
  const lines = ["a much longer line", "short"];
  assert.deepEqual(moveVertical(lines, pos(1, 15), 1), pos(2, 4));
});

test("moveHorizontal clamps at both ends of the line", () => {
  const lines = ["abc"];
  assert.deepEqual(moveHorizontal(lines, pos(1, 1), -5), pos(1, 0));
  assert.deepEqual(moveHorizontal(lines, pos(1, 1), 5), pos(1, 2));
});

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

test("isCountStartDigit excludes 0 (0 alone is the line-start motion)", () => {
  assert.equal(isCountStartDigit("0"), false);
  assert.equal(isCountStartDigit("1"), true);
  assert.equal(isCountStartDigit("9"), true);
});

test("isCountDigit includes 0 (valid mid-count, e.g. the '0' in '10j')", () => {
  assert.equal(isCountDigit("0"), true);
  assert.equal(isCountDigit("5"), true);
  assert.equal(isCountDigit("a"), false);
});

test("parseCount", () => {
  assert.equal(parseCount(""), 1);
  assert.equal(parseCount("5"), 5);
  assert.equal(parseCount("12"), 12);
  assert.equal(parseCount("0"), 1); // defensive: never a 0-count
});

// ---------------------------------------------------------------------------
// Visual-range normalization + yank extraction
// ---------------------------------------------------------------------------

test("normalizeCharRange orders anchor/cursor regardless of selection direction", () => {
  assert.deepEqual(normalizeCharRange(pos(2, 5), pos(1, 2)), {
    startLine: 1,
    startCol: 2,
    endLine: 2,
    endCol: 5,
  });
  assert.deepEqual(normalizeCharRange(pos(1, 2), pos(2, 5)), {
    startLine: 1,
    startCol: 2,
    endLine: 2,
    endCol: 5,
  });
});

test("normalizeLineRange orders anchor/cursor by line only", () => {
  assert.deepEqual(normalizeLineRange(pos(5, 0), pos(2, 9)), { startLine: 2, endLine: 5 });
});

test("comparePos", () => {
  assert.ok(comparePos(pos(1, 0), pos(2, 0)) < 0);
  assert.ok(comparePos(pos(2, 0), pos(1, 0)) > 0);
  assert.equal(comparePos(pos(1, 3), pos(1, 3)), 0);
  assert.ok(comparePos(pos(1, 1), pos(1, 3)) < 0);
});

test("extractCharRange: single line is an inclusive slice", () => {
  const lines = ["hello world"];
  assert.equal(extractCharRange(lines, { startLine: 1, startCol: 0, endLine: 1, endCol: 4 }), "hello");
});

test("extractCharRange: multi-line joins with newlines, first/last lines partial", () => {
  const lines = ["one two", "middle", "three four"];
  assert.equal(
    extractCharRange(lines, { startLine: 1, startCol: 4, endLine: 3, endCol: 4 }),
    "two\nmiddle\nthree",
  );
});

test("extractLineRange: whole lines joined with a trailing newline (linewise yank)", () => {
  const lines = ["a", "b", "c", "d"];
  assert.equal(extractLineRange(lines, { startLine: 2, endLine: 3 }), "b\nc\n");
});

// ---------------------------------------------------------------------------
// Search + wraparound
// ---------------------------------------------------------------------------

test("findMatches: case-sensitive, every occurrence across every line", () => {
  const lines = ["foo bar foo", "FOO", "bar"];
  assert.deepEqual(findMatches(lines, "foo"), [
    { line: 1, col: 0, length: 3 },
    { line: 1, col: 8, length: 3 },
  ]);
});

test("findMatches: empty query yields no matches", () => {
  assert.deepEqual(findMatches(["anything"], ""), []);
});

test("nextMatch: steps forward, wraps to the first match past the end", () => {
  const matches = [
    { line: 1, col: 0, length: 3 },
    { line: 3, col: 2, length: 3 },
    { line: 5, col: 0, length: 3 },
  ];
  assert.deepEqual(nextMatch(matches, pos(1, 0), 1), matches[1]); // strictly after (1,0)
  assert.deepEqual(nextMatch(matches, pos(4, 0), 1), matches[2]);
  // Sitting exactly ON the last match is not "strictly after" it, so this
  // wraps immediately to the first match — matching vim's own `n` behavior
  // of never re-landing on the match the cursor already sits on.
  assert.deepEqual(nextMatch(matches, pos(5, 0), 1), matches[0]);
  assert.deepEqual(nextMatch(matches, pos(6, 0), 1), matches[0]); // wraps past the last match
});

test("nextMatch: steps backward, wraps to the last match before the start", () => {
  const matches = [
    { line: 1, col: 0, length: 3 },
    { line: 3, col: 2, length: 3 },
    { line: 5, col: 0, length: 3 },
  ];
  assert.deepEqual(nextMatch(matches, pos(5, 0), -1), matches[1]);
  assert.deepEqual(nextMatch(matches, pos(1, 0), -1), matches[2]); // wraps before the first match
});

test("nextMatch: no matches returns null", () => {
  assert.equal(nextMatch([], pos(1, 0), 1), null);
});
