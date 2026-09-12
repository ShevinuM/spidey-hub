// Pins search() (src/features/grep/lib/grep.ts) to Homepage.dc.html's grepHits() (lines
// 812-832) semantics: empty-query row shape, per-file path-hit-then-
// content-hit ordering, 400-row cap, and the 24-char ellipsis/offset math.
// Run via `pnpm test:unit`.
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { search, totalLines, formatCount, type RepoFile } from "../../lib/grep";

const ROOT = join(import.meta.dirname, "../../../../..");
const grepIndex = JSON.parse(readFileSync(join(ROOT, "src/features/grep/tests/ui/support/grep-index.json"), "utf8")) as RepoFile[];

test("empty query returns one row per file, sized to the real fixture index (24 files)", () => {
  expect(grepIndex.length).toBe(24);
  const hits = search(grepIndex, "");
  expect(hits.length).toBe(24);
  for (const [i, hit] of hits.entries()) {
    expect(hit.path).toBe(grepIndex[i].path);
    expect(hit.line).toBe(0);
    expect(hit.col).toBe(0);
    expect(hit.pre).toBe(`${grepIndex[i].lines.length} lines`);
    expect(hit.mat).toBe("");
    expect(hit.post).toBe("");
  }
  // whitespace-only query behaves the same as empty (query.trim()).
  expect(search(grepIndex, "   ")).toEqual(hits);
});

test("path hits and content hits interleave in prototype order (path row first, then line rows, file-by-file)", () => {
  const hits = search(grepIndex, "grep");
  const rows = hits.map((h) => [h.path, h.line] as const);
  expect(rows).toEqual([
    ["README.md", 9],
    ["src/layouts/Shell.astro", 3],
    ["src/layouts/Shell.astro", 12],
    ["src/components/GrepOverlay.svelte", 0], // path substring hit ("grep" in "GrepOverlay.svelte")
    ["src/components/GrepOverlay.svelte", 3],
    ["src/lib/grep.ts", 0], // path substring hit only — grep.ts's own lines don't contain "grep"
  ]);
  // the two path-hit rows carry the "{n} lines" summary, not a real match.
  expect(hits[3].pre).toBe("22 lines");
  expect(hits[3].mat).toBe("");
  expect(hits[5].pre).toBe("17 lines");
});

test("24-char left-cut ellipsis/offset math on a long line", () => {
  const line = "A".repeat(30) + "needle" + "B".repeat(10);
  const files: RepoFile[] = [{ path: "long.txt", lines: [line] }];
  const hits = search(files, "needle");
  expect(hits.length).toBe(1);
  const [hit] = hits;
  expect(hit.line).toBe(1);
  expect(hit.col).toBe(31); // 1-based column of "needle" (0-based index 30)
  expect(hit.pre).toBe("…" + "A".repeat(24)); // cut = 30 - 24 = 6, so 24 A's remain before the ellipsis marker
  expect(hit.mat).toBe("needle");
  expect(hit.post).toBe("B".repeat(10));
  // no ellipsis when the match starts within the first 24 characters.
  const shortHits = search([{ path: "short.txt", lines: ["needle at the start"] }], "needle");
  expect(shortHits[0].pre).toBe("");
  expect(shortHits[0].mat).toBe("needle");
});

test("trailing whitespace on the matched line is trimmed", () => {
  const files: RepoFile[] = [{ path: "trail.txt", lines: ["needle here   \t "] }];
  const hits = search(files, "needle");
  expect(hits[0].pre + hits[0].mat + hits[0].post).toBe("needle here");
});

test("results are capped at 400 rows total", () => {
  const lines = Array.from({ length: 500 }, (_, i) => `line ${i} needle`);
  const files: RepoFile[] = [{ path: "big.txt", lines }];
  const hits = search(files, "needle");
  expect(hits.length).toBe(400);
});

test("the cap is checked before each line push, so a file can be cut off mid-file", () => {
  const files: RepoFile[] = [
    { path: "a.txt", lines: Array.from({ length: 399 }, () => "needle") },
    { path: "b.txt", lines: Array.from({ length: 5 }, () => "needle") },
  ];
  const hits = search(files, "needle");
  expect(hits.length).toBe(400);
  expect(hits[398].path).toBe("a.txt");
  expect(hits[399].path).toBe("b.txt");
});

test("formatCount / totalLines", () => {
  expect(formatCount(search(grepIndex, ""), grepIndex, "")).toBe(`24/24`);
  const hits = search(grepIndex, "grep");
  expect(formatCount(hits, grepIndex, "grep")).toBe(`${hits.length}/${totalLines(grepIndex)}`);
});
