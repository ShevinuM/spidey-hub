// Pins classifyDoc() (src/lib/docline.ts) to a fixed set of hand-verified
// kind arrays for 4 fixture project docs + 3 real Enaimco personnel role
// docs (the 3 sub-role files under enaimco/software-developer/ — PLAN.md
// Iteration 3 Phase 1 item 1.3 restructured personnel to a path-derived
// tree; these fixtures were regenerated against the new file paths/content),
// reading the *actual files on disk* (not re-typed literals) so this test
// fails the moment a content file's body stops matching the pinned kinds.
//
// tests/unit/docline.fixtures.json holds the expected kind arrays and color
// maps (the project-doc entries extracted verbatim from the prototype's
// Component class per PLAN.md Phase 2 item 6; the personnel-doc entries
// regenerated from classifyDoc() itself against the real files). Run via
// `pnpm test:unit` / `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyDoc, docColors, xpColors } from "../../src/lib/docline.ts";

const ROOT = join(import.meta.dirname, "../..");
const fixturesPath = join(import.meta.dirname, "docline.fixtures.json");
const expected = JSON.parse(readFileSync(fixturesPath, "utf8")) as {
  docColors: Record<string, string>;
  xpColors: Record<string, string>;
  docs: { kind: "project" | "personnel"; path: string; kinds: string[] }[];
};

/** Strip YAML frontmatter and return the body exactly as
 * classifyBody()/classifyDoc() expect it (one trailing newline, split on
 * "\n" with that trailing empty entry dropped). */
function bodyLines(raw: string): string[] {
  const withoutFrontmatter = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
  return withoutFrontmatter.replace(/\n$/, "").split("\n");
}

test("docColors / xpColors match the prototype's color maps verbatim", () => {
  assert.deepEqual(docColors.h, expected.docColors.h);
  assert.deepEqual(docColors.p, expected.docColors.p);
  assert.deepEqual(docColors.b, expected.docColors.b);
  assert.deepEqual(docColors.c, expected.docColors.c);
  assert.deepEqual(xpColors.h, expected.xpColors.h);
  assert.deepEqual(xpColors.m, expected.xpColors.m);
  assert.deepEqual(xpColors.p, expected.xpColors.p);
  assert.deepEqual(xpColors.b, expected.xpColors.b);
  assert.deepEqual(xpColors.c, expected.xpColors.c);
});

for (const doc of expected.docs) {
  test(`classifyDoc reproduces prototype kinds for ${doc.path}`, () => {
    const raw = readFileSync(join(ROOT, doc.path), "utf8");
    const lines = bodyLines(raw);
    const mode = doc.kind === "project" ? "project" : "personnel";
    const kinds = classifyDoc(lines, mode);
    assert.equal(lines.length, doc.kinds.length, "line count must match the prototype doc array length");
    assert.deepEqual(kinds, doc.kinds);
  });
}
