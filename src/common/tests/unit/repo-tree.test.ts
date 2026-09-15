// Exercised against public/generated/repos/daily-tech-digest.json, which has genuine nested subdirectories, so `pnpm generate` must have produced public/generated/repos/*.json before this runs.
import { expect, test } from "vitest";
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
} from "../../lib/repo-tree";

const ROOT = join(import.meta.dirname, "../../../..");
const dailyTechDigest = JSON.parse(
  readFileSync(join(ROOT, "public/generated/repos/daily-tech-digest.json"), "utf8"),
) as RepoIndex;

test("root listing has no duplicate entries and only top-level names", () => {
  const root = listDir(dailyTechDigest.files, "");
  const names = root.map((e) => e.name);
  expect(new Set(names).size).toBe(names.length);
  for (const entry of root) {
    expect(
      !entry.name.includes("/"),
      `root entry "${entry.name}" should not contain a slash`,
    ).toBeTruthy();
    expect(entry.path.includes("/"), `root entry path "${entry.path}" should have no slash`).toBe(
      false,
    );
  }
});

test("directories sort before files, both case-insensitively by name", () => {
  const root = listDir(dailyTechDigest.files, "");
  const dirs = root.filter((e) => e.type === "dir");
  const files = root.filter((e) => e.type === "file");
  expect(root.map((e) => e.type)).toEqual([...dirs.map(() => "dir"), ...files.map(() => "file")]);
  const dirNames = dirs.map((d) => d.name.toLowerCase());
  expect(dirNames).toEqual([...dirNames].sort());
  const fileNames = files.map((f) => f.name.toLowerCase());
  expect(fileNames).toEqual([...fileNames].sort());
});

test("descending into a directory lists only that directory's own children", () => {
  const root = listDir(dailyTechDigest.files, "");
  const dir = root.find((e) => e.type === "dir");
  expect(dir, "daily-tech-digest should have at least one subdirectory").toBeTruthy();
  const children = listDir(dailyTechDigest.files, dir!.path);
  expect(children.length > 0).toBeTruthy();
  for (const child of children) {
    expect(child.path.startsWith(`${dir!.path}/`)).toBe(true);
    // No grandchild paths leak in as direct children.
    expect(child.path.slice(dir!.path.length + 1).includes("/")).toBe(false);
  }
});

test("findFile returns the exact file record; joinPath round-trips a path's segments", () => {
  const anyFile = dailyTechDigest.files[0];
  const found = findFile(dailyTechDigest.files, anyFile.path);
  expect(found).toEqual(anyFile);
  expect(findFile(dailyTechDigest.files, "does/not/exist.xyz")).toBe(undefined);

  const segments = anyFile.path.split("/");
  expect(joinPath(segments)).toBe(anyFile.path);
  expect(joinPath([])).toBe("");
});

// buildTree / flattenVisible: a hand-rolled fixture keeps the collapse-behavior assertions below deterministic; the real daily-tech-digest index exercises the build/flatten round-trip against real data.

const fixtureFiles: RepoFile[] = [
  { path: "README.md", lines: [] },
  { path: "src/index.ts", lines: [] },
  { path: "src/lib/a.ts", lines: [] },
  { path: "src/lib/b.ts", lines: [] },
  { path: "package.json", lines: [] },
];

test("buildTree: root children are dirs-before-files, case-insensitive by name", () => {
  const tree = buildTree(fixtureFiles);
  expect(tree.type).toBe("dir");
  expect(tree.path).toBe("");
  const names = tree.children!.map((c) => `${c.type}:${c.name}`);
  expect(names).toEqual(["dir:src", "file:package.json", "file:README.md"]);
});

test("buildTree: nested dirs are synthesized with correct full paths and no duplicates", () => {
  const tree = buildTree(fixtureFiles);
  const src = tree.children!.find((c) => c.name === "src")!;
  expect(src.type).toBe("dir");
  expect(src.path).toBe("src");
  const srcChildNames = src.children!.map((c) => `${c.type}:${c.name}`);
  expect(srcChildNames).toEqual(["dir:lib", "file:index.ts"]);

  const lib = src.children!.find((c) => c.name === "lib")!;
  expect(lib.path).toBe("src/lib");
  expect(lib.children!.map((c) => c.name)).toEqual(["a.ts", "b.ts"]);
});

test("flattenVisible: with an empty collapsed set, every dir is expanded and every file appears", () => {
  const tree = buildTree(fixtureFiles);
  const rows = flattenVisible(tree, new Set());
  expect(rows.map((r) => ({ type: r.type, path: r.path, depth: r.depth }))).toEqual([
    { type: "dir", path: "src", depth: 0 },
    { type: "dir", path: "src/lib", depth: 1 },
    { type: "file", path: "src/lib/a.ts", depth: 2 },
    { type: "file", path: "src/lib/b.ts", depth: 2 },
    { type: "file", path: "src/index.ts", depth: 1 },
    { type: "file", path: "package.json", depth: 0 },
    { type: "file", path: "README.md", depth: 0 },
  ]);
  // No row is ever synthesized for "go up a level" — there is no `../` concept
  // in a fully-expanded tree.
  expect(rows.every((r) => r.type === "dir" || r.type === "file")).toBeTruthy();
});

test("flattenVisible: collapsing a dir hides its descendants but keeps its own row, marked expanded:false", () => {
  const tree = buildTree(fixtureFiles);
  const rows = flattenVisible(tree, new Set(["src"]));
  expect(rows.map((r) => r.path)).toEqual(["src", "package.json", "README.md"]);
  const srcRow = rows.find((r) => r.path === "src")!;
  expect(srcRow.expanded).toBe(false);
});

test("flattenVisible: collapsing a nested dir only hides ITS descendants, not its siblings or ancestor's other children", () => {
  const tree = buildTree(fixtureFiles);
  const rows = flattenVisible(tree, new Set(["src/lib"]));
  expect(rows.map((r) => r.path)).toEqual([
    "src",
    "src/lib",
    "src/index.ts",
    "package.json",
    "README.md",
  ]);
  const libRow = rows.find((r) => r.path === "src/lib")!;
  expect(libRow.expanded).toBe(false);
  const srcRow = rows.find((r) => r.path === "src")!;
  expect(srcRow.expanded).toBe(true);
});

test("buildTree/flattenVisible round-trip against the real daily-tech-digest index has no lost or duplicated files", () => {
  const tree = buildTree(dailyTechDigest.files);
  const rows = flattenVisible(tree, new Set());
  const filePaths = rows
    .filter((r) => r.type === "file")
    .map((r) => r.path)
    .sort();
  const expected = dailyTechDigest.files.map((f) => f.path).sort();
  expect(filePaths).toEqual(expected);
});
