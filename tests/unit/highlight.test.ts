// Unit tests for src/lib/highlight.ts's generate-time token pipeline. Uses
// small inline fixture snippets (not repos/ content — the submodules can
// move/change independently of this test) so determinism, the palette
// round-trip, and the size-cap fallback are each pinned to a stable input.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PaletteBuilder, tokenizeFile, tokenLineText } from "../../src/lib/highlight.ts";

const TS_SNIPPET = `import { readFileSync } from "node:fs";

function greet(name: string): string {
  // says hello
  return \`Hello, \${name}!\`;
}
`;

test("tokenizeFile is deterministic: same input tokenizes to the same output twice", async () => {
  const paletteA = new PaletteBuilder();
  const resultA = await tokenizeFile("ts", TS_SNIPPET, paletteA, 200 * 1024);
  const paletteB = new PaletteBuilder();
  const resultB = await tokenizeFile("ts", TS_SNIPPET, paletteB, 200 * 1024);

  assert.ok(resultA, "expected tokenization to succeed");
  assert.deepEqual(resultA, resultB);
  assert.deepEqual(paletteA.palette, paletteB.palette);
});

test("tokenizeFile output is a lossless round-trip of the source text, line for line", async () => {
  const palette = new PaletteBuilder();
  const result = await tokenizeFile("ts", TS_SNIPPET, palette, 200 * 1024);
  assert.ok(result);

  const sourceLines = TS_SNIPPET.split("\n");
  assert.equal(result.length, sourceLines.length);
  for (let i = 0; i < sourceLines.length; i++) {
    assert.equal(tokenLineText(result[i]), sourceLines[i]);
  }
});

test("tokenizeFile dedupes same-color runs into a shared palette (paletteIndex, not a repeated hex)", async () => {
  const palette = new PaletteBuilder();
  const result = await tokenizeFile("ts", TS_SNIPPET, palette, 200 * 1024);
  assert.ok(result);

  const usedIndices = new Set(result.flat().map(([idx]) => idx));
  for (const idx of usedIndices) {
    assert.ok(idx >= 0 && idx < palette.palette.length, `paletteIndex ${idx} must resolve into the palette array`);
  }
  // The snippet reuses the default/plain color across many tokens (spaces,
  // punctuation) — the palette must not have one entry per token.
  assert.ok(palette.palette.length < result.flat().length);
});

test("tokenizeFile returns null (flat fallback) once content exceeds the size cap", async () => {
  const palette = new PaletteBuilder();
  const result = await tokenizeFile("ts", TS_SNIPPET, palette, 10);
  assert.equal(result, null);
  assert.deepEqual(palette.palette, []);
});

test("tokenizeFile returns null for an extension with no grammar (e.g. markdown) — flat fallback, not an error", async () => {
  const palette = new PaletteBuilder();
  const result = await tokenizeFile("md", "# Heading\n\nSome body text.\n", palette, 200 * 1024);
  assert.equal(result, null);
});

test("tokenLineText reconstructs plain text from an arbitrary token line", () => {
  assert.equal(
    tokenLineText([
      [0, "const "],
      [1, "x"],
      [0, " = "],
      [2, "1"],
      [0, ";"],
    ]),
    "const x = 1;",
  );
  assert.equal(tokenLineText([]), "");
});
