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

test("no @keyframes name is declared in more than one place across src/", () => {
  const files = listStyleBearingFiles(SRC_DIR);
  const byName = new Map<string, string[]>();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const { name } of findKeyframeDeclarations(text, file)) {
      const rel = file.slice(ROOT.length + 1);
      const sites = byName.get(name) ?? [];
      sites.push(rel);
      byName.set(name, sites);
    }
  }

  const duplicates = Array.from(byName.entries()).filter(([, sites]) => sites.length > 1);
  expect(duplicates, `duplicate @keyframes declaration(s): ${duplicates.map(([name, sites]) => `${name} in [${sites.join(", ")}]`).join("; ")}`).toEqual([]);
});
