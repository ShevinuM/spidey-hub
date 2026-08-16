// Pins search() (src/lib/grep.ts) to Homepage.dc.html's grepHits() (lines
// 812-832) semantics: empty-query row shape, per-file path-hit-then-
// content-hit ordering, 400-row cap, and the 24-char ellipsis/offset math.
// PLAN.md Phase 2 item 7. Run via `pnpm test:unit` / `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { search, totalLines, formatCount, type RepoFile } from "../../src/lib/grep.ts";

const ROOT = join(import.meta.dirname, "../..");
const grepIndex = JSON.parse(readFileSync(join(ROOT, "fixtures/grep-index.json"), "utf8")) as RepoFile[];

test("empty query returns one row per file, sized to the real fixture index (24 files)", () => {
  assert.equal(grepIndex.length, 24);
  const hits = search(grepIndex, "");
  assert.equal(hits.length, 24);
  for (const [i, hit] of hits.entries()) {
    assert.equal(hit.path, grepIndex[i].path);
    assert.equal(hit.line, 0);
    assert.equal(hit.col, 0);
    assert.equal(hit.pre, `${grepIndex[i].lines.length} lines`);
    assert.equal(hit.mat, "");
    assert.equal(hit.post, "");
  }
  // whitespace-only query behaves the same as empty (query.trim()).
  assert.deepEqual(search(grepIndex, "   "), hits);
});

test("path hits and content hits interleave in prototype order (path row first, then line rows, file-by-file)", () => {
  const hits = search(grepIndex, "grep");
  const rows = hits.map((h) => [h.path, h.line] as const);
  assert.deepEqual(rows, [
    ["README.md", 9],
    ["src/layouts/Shell.astro", 3],
    ["src/layouts/Shell.astro", 12],
    ["src/components/GrepOverlay.svelte", 0], // path substring hit ("grep" in "GrepOverlay.svelte")
    ["src/components/GrepOverlay.svelte", 3],
    ["src/lib/grep.ts", 0], // path substring hit only — grep.ts's own lines don't contain "grep"
  ]);
  // the two path-hit rows carry the "{n} lines" summary, not a real match.
  assert.equal(hits[3].pre, "22 lines");
  assert.equal(hits[3].mat, "");
  assert.equal(hits[5].pre, "17 lines");
});

test("24-char left-cut ellipsis/offset math on a long line", () => {
  const line = "A".repeat(30) + "needle" + "B".repeat(10);
  const files: RepoFile[] = [{ path: "long.txt", lines: [line] }];
  const hits = search(files, "needle");
  assert.equal(hits.length, 1);
  const [hit] = hits;
  assert.equal(hit.line, 1);
  assert.equal(hit.col, 31); // 1-based column of "needle" (0-based index 30)
  assert.equal(hit.pre, "…" + "A".repeat(24)); // cut = 30 - 24 = 6, so 24 A's remain before the ellipsis marker
  assert.equal(hit.mat, "needle");
  assert.equal(hit.post, "B".repeat(10));
  // no ellipsis when the match starts within the first 24 characters.
  const shortHits = search([{ path: "short.txt", lines: ["needle at the start"] }], "needle");
  assert.equal(shortHits[0].pre, "");
  assert.equal(shortHits[0].mat, "needle");
});

test("trailing whitespace on the matched line is trimmed", () => {
  const files: RepoFile[] = [{ path: "trail.txt", lines: ["needle here   \t "] }];
  const hits = search(files, "needle");
  assert.equal(hits[0].pre + hits[0].mat + hits[0].post, "needle here");
});

test("results are capped at 400 rows total", () => {
  const lines = Array.from({ length: 500 }, (_, i) => `line ${i} needle`);
  const files: RepoFile[] = [{ path: "big.txt", lines }];
  const hits = search(files, "needle");
  assert.equal(hits.length, 400);
});

test("the cap is checked before each line push, so a file can be cut off mid-file", () => {
  const files: RepoFile[] = [
    { path: "a.txt", lines: Array.from({ length: 399 }, () => "needle") },
    { path: "b.txt", lines: Array.from({ length: 5 }, () => "needle") },
  ];
  const hits = search(files, "needle");
  assert.equal(hits.length, 400);
  assert.equal(hits[398].path, "a.txt");
  assert.equal(hits[399].path, "b.txt");
});

test("formatCount / totalLines", () => {
  assert.equal(formatCount(search(grepIndex, ""), grepIndex, ""), `24/24`);
  const hits = search(grepIndex, "grep");
  assert.equal(formatCount(hits, grepIndex, "grep"), `${hits.length}/${totalLines(grepIndex)}`);
});
