// Unit tests for src/lib/repoTree.ts's repo browsing.
// Exercised against the real generated index for one of the 8 submodules
// (public/generated/repos/daily-tech-digest.json — has genuine nested
// subdirectories, unlike transcript-tts which is flat at the root) so the
// directory-synthesis logic is checked against real data, not a hand-rolled
// fixture. Run via `pnpm test:unit` / `node --test` (requires `pnpm generate`
// to have produced public/generated/repos/*.json first, same precondition
// as the rest of the suite).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  listDir,
  findFile,
  joinPath,
  buildTree,
  flattenVisible,
  type RepoFile,
  type RepoIndex,
} from "../../src/lib/repoTree.ts";

const ROOT = join(import.meta.dirname, "../..");
const dailyTechDigest = JSON.parse(
  readFileSync(join(ROOT, "public/generated/repos/daily-tech-digest.json"), "utf8"),
) as RepoIndex;

test("root listing has no duplicate entries and only top-level names", () => {
  const root = listDir(dailyTechDigest.files, "");
  const names = root.map((e) => e.name);
  assert.equal(new Set(names).size, names.length);
  for (const entry of root) {
    assert.ok(!entry.name.includes("/"), `root entry "${entry.name}" should not contain a slash`);
    assert.equal(entry.path.includes("/"), false, `root entry path "${entry.path}" should have no slash`);
  }
});

test("directories sort before files, both case-insensitively by name", () => {
  const root = listDir(dailyTechDigest.files, "");
  const dirs = root.filter((e) => e.type === "dir");
  const files = root.filter((e) => e.type === "file");
  assert.deepEqual(
    root.map((e) => e.type),
    [...dirs.map(() => "dir"), ...files.map(() => "file")],
  );
  const dirNames = dirs.map((d) => d.name.toLowerCase());
  assert.deepEqual(dirNames, [...dirNames].sort());
  const fileNames = files.map((f) => f.name.toLowerCase());
  assert.deepEqual(fileNames, [...fileNames].sort());
});

test("descending into a directory lists only that directory's own children", () => {
  const root = listDir(dailyTechDigest.files, "");
  const dir = root.find((e) => e.type === "dir");
  assert.ok(dir, "daily-tech-digest should have at least one subdirectory");
  const children = listDir(dailyTechDigest.files, dir!.path);
  assert.ok(children.length > 0);
  for (const child of children) {
    assert.equal(child.path.startsWith(`${dir!.path}/`), true);
    // No grandchild paths leak in as direct children.
    assert.equal(child.path.slice(dir!.path.length + 1).includes("/"), false);
  }
});

test("findFile returns the exact file record; joinPath round-trips a path's segments", () => {
  const anyFile = dailyTechDigest.files[0];
  const found = findFile(dailyTechDigest.files, anyFile.path);
  assert.deepEqual(found, anyFile);
  assert.equal(findFile(dailyTechDigest.files, "does/not/exist.xyz"), undefined);

  const segments = anyFile.path.split("/");
  assert.equal(joinPath(segments), anyFile.path);
  assert.equal(joinPath([]), "");
});

// ---------------------------------------------------------------------------
// buildTree / flattenVisible (lazygit-style
// Files panel: nested tree, all dirs expanded by default, no `../` entry).
// A small hand-rolled fixture makes the collapse-behavior assertions
// deterministic; the real daily-tech-digest index (genuine nested dirs, e.g.
// site/src/content/digests/) exercises the build/flatten round-trip against
// real data, same convention as the listDir tests above.
// ---------------------------------------------------------------------------

const fixtureFiles: RepoFile[] = [
  { path: "README.md", lines: [] },
  { path: "src/index.ts", lines: [] },
  { path: "src/lib/a.ts", lines: [] },
  { path: "src/lib/b.ts", lines: [] },
  { path: "package.json", lines: [] },
];

test("buildTree: root children are dirs-before-files, case-insensitive by name", () => {
  const tree = buildTree(fixtureFiles);
  assert.equal(tree.type, "dir");
  assert.equal(tree.path, "");
  const names = tree.children!.map((c) => `${c.type}:${c.name}`);
  assert.deepEqual(names, ["dir:src", "file:package.json", "file:README.md"]);
});

test("buildTree: nested dirs are synthesized with correct full paths and no duplicates", () => {
  const tree = buildTree(fixtureFiles);
  const src = tree.children!.find((c) => c.name === "src")!;
  assert.equal(src.type, "dir");
  assert.equal(src.path, "src");
  const srcChildNames = src.children!.map((c) => `${c.type}:${c.name}`);
  assert.deepEqual(srcChildNames, ["dir:lib", "file:index.ts"]);

  const lib = src.children!.find((c) => c.name === "lib")!;
  assert.equal(lib.path, "src/lib");
  assert.deepEqual(
    lib.children!.map((c) => c.name),
    ["a.ts", "b.ts"],
  );
});

test("flattenVisible: with an empty collapsed set, every dir is expanded and every file appears", () => {
  const tree = buildTree(fixtureFiles);
  const rows = flattenVisible(tree, new Set());
  assert.deepEqual(
    rows.map((r) => ({ type: r.type, path: r.path, depth: r.depth })),
    [
      { type: "dir", path: "src", depth: 0 },
      { type: "dir", path: "src/lib", depth: 1 },
      { type: "file", path: "src/lib/a.ts", depth: 2 },
      { type: "file", path: "src/lib/b.ts", depth: 2 },
      { type: "file", path: "src/index.ts", depth: 1 },
      { type: "file", path: "package.json", depth: 0 },
      { type: "file", path: "README.md", depth: 0 },
    ],
  );
  // No row is ever synthesized for "go up a level" — there is no `../` concept
  // in a fully-expanded tree.
  assert.ok(rows.every((r) => r.type === "dir" || r.type === "file"));
});

test("flattenVisible: collapsing a dir hides its descendants but keeps its own row, marked expanded:false", () => {
  const tree = buildTree(fixtureFiles);
  const rows = flattenVisible(tree, new Set(["src"]));
  assert.deepEqual(
    rows.map((r) => r.path),
    ["src", "package.json", "README.md"],
  );
  const srcRow = rows.find((r) => r.path === "src")!;
  assert.equal(srcRow.expanded, false);
});

test("flattenVisible: collapsing a nested dir only hides ITS descendants, not its siblings or ancestor's other children", () => {
  const tree = buildTree(fixtureFiles);
  const rows = flattenVisible(tree, new Set(["src/lib"]));
  assert.deepEqual(
    rows.map((r) => r.path),
    ["src", "src/lib", "src/index.ts", "package.json", "README.md"],
  );
  const libRow = rows.find((r) => r.path === "src/lib")!;
  assert.equal(libRow.expanded, false);
  const srcRow = rows.find((r) => r.path === "src")!;
  assert.equal(srcRow.expanded, true);
});

test("buildTree/flattenVisible round-trip against the real daily-tech-digest index has no lost or duplicated files", () => {
  const tree = buildTree(dailyTechDigest.files);
  const rows = flattenVisible(tree, new Set());
  const filePaths = rows.filter((r) => r.type === "file").map((r) => r.path).sort();
  const expected = dailyTechDigest.files.map((f) => f.path).sort();
  assert.deepEqual(filePaths, expected);
});
