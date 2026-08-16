// Fixture-commits mechanism (PLAN.md Phase 2, item 1).
//
// Builds renders one project per markdown file in the `projects` collection,
// each with exactly one repo (see src/content/projects/*.md /
// fixtures/projects/*.md). Commit snapshots are keyed by *repo name*, not by
// project slug, so they live next to (not inside) the content collection:
//   - real content:    src/generated/commits/<repoName>.json   (scripts/generate.mjs)
//   - fixture content:  fixtures/commits/<repoName>.json        (extracted verbatim
//                        from Homepage.dc.html's sample `commits` arrays)
//
// Both directories are switched by the same PORTFOLIO_FIXTURES env var that
// switches the `projects` collection's glob() base in src/content.config.ts,
// so a project entry's `repos[n].name` always resolves to a commits file in
// the matching mode.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const USE_FIXTURES = process.env.PORTFOLIO_FIXTURES === "1";

export interface Commit {
  sha8: string;
  msg: string;
  html_url: string;
  initials: string;
}

/** Directory commits are currently being read from, for diagnostics/tests. */
export const commitsDir = USE_FIXTURES ? join(ROOT, "fixtures/commits") : join(ROOT, "src/generated/commits");

/**
 * Read the committed snapshot for a repo by name. Returns an empty array
 * (not a throw) when no snapshot exists yet — e.g. a brand-new project
 * added before `pnpm generate` has run for it.
 */
export function getCommits(repoName: string): Commit[] {
  const file = join(commitsDir, `${repoName}.json`);
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, "utf8")) as Commit[];
}
