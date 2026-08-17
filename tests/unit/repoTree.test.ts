// Unit tests for src/lib/repoTree.ts (PLAN.md Phase 5, "Repo browsing").
// Exercised against the real generated index for one of the three
// submodules (public/generated/repos/SafePass.json — has a genuine `src/`
// subdirectory, unlike transcript-tts which is flat at the root) so the
// directory-synthesis logic is checked against real data, not a hand-rolled
// fixture. Run via `pnpm test:unit` / `node --test` (requires `pnpm generate`
// to have produced public/generated/repos/*.json first, same precondition
// as the rest of the suite per PLAN.md "Verification commands").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listDir, findFile, joinPath, type RepoIndex } from "../../src/lib/repoTree.ts";

const ROOT = join(import.meta.dirname, "../..");
const safePass = JSON.parse(
  readFileSync(join(ROOT, "public/generated/repos/SafePass.json"), "utf8"),
) as RepoIndex;

test("root listing has no duplicate entries and only top-level names", () => {
  const root = listDir(safePass.files, "");
  const names = root.map((e) => e.name);
  assert.equal(new Set(names).size, names.length);
  for (const entry of root) {
    assert.ok(!entry.name.includes("/"), `root entry "${entry.name}" should not contain a slash`);
    assert.equal(entry.path.includes("/"), false, `root entry path "${entry.path}" should have no slash`);
  }
});

test("directories sort before files, both case-insensitively by name", () => {
  const root = listDir(safePass.files, "");
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
  const root = listDir(safePass.files, "");
  const dir = root.find((e) => e.type === "dir");
  assert.ok(dir, "SafePass should have at least one subdirectory");
  const children = listDir(safePass.files, dir!.path);
  assert.ok(children.length > 0);
  for (const child of children) {
    assert.equal(child.path.startsWith(`${dir!.path}/`), true);
    // No grandchild paths leak in as direct children.
    assert.equal(child.path.slice(dir!.path.length + 1).includes("/"), false);
  }
});

test("findFile returns the exact file record; joinPath round-trips a path's segments", () => {
  const anyFile = safePass.files[0];
  const found = findFile(safePass.files, anyFile.path);
  assert.deepEqual(found, anyFile);
  assert.equal(findFile(safePass.files, "does/not/exist.xyz"), undefined);

  const segments = anyFile.path.split("/");
  assert.equal(joinPath(segments), anyFile.path);
  assert.equal(joinPath([]), "");
});
