// The e2e "every animation-name resolves to a real CSSKeyframesRule" check
// (src/common/tests/ui/e2e/animations.spec.ts) cannot catch THIS failure mode: an unused
// `@keyframes` declaration is invisible to a resolution check — nothing
// ever references it, so there's nothing to fail to resolve.
//
// This test closes that gap with a source-only scan: no `@keyframes <name>` may be
// declared more than once across the whole `src/` tree (a component's own
// `-global-<name>` declaration and a same-named plain declaration
// elsewhere would collide just as badly as two plain declarations would).
import { expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const SRC_DIR = join(ROOT, "src");

/** Recursively lists every `.svelte`/`.css`/`.astro` file under `dir`. */
function listStyleBearingFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listStyleBearingFiles(full));
    } else if ([".svelte", ".css", ".astro"].includes(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/** Every `@keyframes <name>` (bare or `-global-`-prefixed) declaration
 * site, keyed by its resolved (prefix-stripped) name — the name a
 * inline-style `animation:` reference actually has to match. */
function findKeyframeDeclarations(text: string, file: string): Array<{ name: string; file: string }> {
  const found: Array<{ name: string; file: string }> = [];
  const re = /@keyframes\s+(-global-)?([A-Za-z_][\w-]*)/g;
  for (const m of text.matchAll(re)) {
    found.push({ name: m[2], file });
  }
  return found;
}

/** Every `@keyframes` name declared at more than one site, paired with the
 * repo-relative paths that declare it.
 *
 * Pure over its inputs, so the proof below can fire it at synthetic files
 * rather than by dirtying the tree. */
function findDuplicateKeyframeNames(files: Array<{ path: string; text: string }>): Array<[string, string[]]> {
  const byName = new Map<string, string[]>();
  for (const { path, text } of files) {
    for (const { name } of findKeyframeDeclarations(text, path)) {
      const sites = byName.get(name) ?? [];
      sites.push(path);
      byName.set(name, sites);
    }
  }
  return Array.from(byName.entries()).filter(([, sites]) => sites.length > 1);
}

test("no @keyframes name is declared in more than one place across src/", () => {
  const duplicates = findDuplicateKeyframeNames(
    listStyleBearingFiles(SRC_DIR).map((file) => ({
      path: file.slice(ROOT.length + 1),
      text: readFileSync(file, "utf8"),
    })),
  );

  expect(duplicates, `duplicate @keyframes declaration(s): ${duplicates.map(([name, sites]) => `${name} in [${sites.join(", ")}]`).join("; ")}`).toEqual([]);
});

// The proof clause: a scan that matches nothing reports the same empty result
// as a tree that holds no duplicates.
//
// The planted pair is the cross-form collision described at the top of this
// file, so a scan that stops seeing either form — or a grouping that stops
// treating two sites as a duplicate — fails here instead of going quietly green
// over `src/`. The third file's name is declared once and must not be reported.
test("a name declared in both the plain and -global- forms is reported with its two sites", () => {
  const duplicates = findDuplicateKeyframeNames([
    {
      path: "src/features/boot/components/Synthetic.svelte",
      text: "<style>@keyframes flicker { from { opacity: 0; } }</style>",
    },
    {
      path: "src/common/styles/synthetic.css",
      text: "@keyframes -global-flicker { from { opacity: 0; } }",
    },
    {
      path: "src/features/grep/components/Unique.svelte",
      text: "<style>@keyframes scanline { from { opacity: 0; } }</style>",
    },
  ]);

  expect(duplicates).toEqual([
    ["flicker", ["src/features/boot/components/Synthetic.svelte", "src/common/styles/synthetic.css"]],
  ]);
});
