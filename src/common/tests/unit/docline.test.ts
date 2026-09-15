// Reads the actual doc files on disk (not re-typed literals) against docline.fixtures.json's pinned kind arrays, so this test fails the moment a content file's body drifts from its pinned kinds.
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyDoc, docColors, xpColors } from "../../lib/docline";

const ROOT = join(import.meta.dirname, "../../../..");
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
  expect(docColors.h).toEqual(expected.docColors.h);
  expect(docColors.p).toEqual(expected.docColors.p);
  expect(docColors.b).toEqual(expected.docColors.b);
  expect(docColors.c).toEqual(expected.docColors.c);
  expect(xpColors.h).toEqual(expected.xpColors.h);
  expect(xpColors.m).toEqual(expected.xpColors.m);
  expect(xpColors.p).toEqual(expected.xpColors.p);
  expect(xpColors.b).toEqual(expected.xpColors.b);
  expect(xpColors.c).toEqual(expected.xpColors.c);
});

for (const doc of expected.docs) {
  test(`classifyDoc reproduces prototype kinds for ${doc.path}`, () => {
    const raw = readFileSync(join(ROOT, doc.path), "utf8");
    const lines = bodyLines(raw);
    const mode = doc.kind === "project" ? "project" : "personnel";
    const kinds = classifyDoc(lines, mode);
    expect(lines.length, "line count must match the prototype doc array length").toBe(
      doc.kinds.length,
    );
    expect(kinds).toEqual(doc.kinds);
  });
}
