// Reads a src/content/*/*.md collection's frontmatter+body directly off
// disk, for e2e specs that assert the real (not fixture) page content
// against its source — the same "read the real file" pattern this suite
// already uses for src/data/*.yaml (see grep.spec.ts's real-index
// comparisons). No markdown/frontmatter package is a project dependency, so
// this is a minimal splitter (frontmatter is plain YAML) rather than a full
// markdown parser — every content file this project has today needs only
// the frontmatter block plus the raw body string, never rendered HTML.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

export interface ContentEntry<T> {
  id: string;
  data: T;
  body: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/** Reads every `*.md` file directly inside `dir` (non-recursive, matching
 * every collection's own `glob({ pattern: "*.md" })` loader) as a
 * frontmatter+body pair, id = the filename minus `.md`. */
export function readContentDir<T>(dir: string): ContentEntry<T>[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => {
      const raw = readFileSync(join(dir, name), "utf8");
      const match = FRONTMATTER_RE.exec(raw);
      if (!match) throw new Error(`${join(dir, name)}: missing frontmatter block`);
      const [, frontmatter, body] = match;
      return { id: name.replace(/\.md$/, ""), data: YAML.parse(frontmatter) as T, body: body.trim() };
    });
}
