// Server-only: `process.env.PORTFOLIO_FIXTURES` doesn't exist in the browser, so this module must never be imported from a Svelte island.
// Uses a build-time `import.meta.glob` rather than a runtime `node:fs` read, since Astro's static build bundles this module away from `src/generated/commits/` on disk.
const REAL_GLOB = import.meta.glob("../../generated/commits/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

const FIXTURE_GLOB = import.meta.glob("../../features/repositories/tests/ui/support/commits/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

const USE_FIXTURES = process.env.PORTFOLIO_FIXTURES === "1";

export interface Commit {
  /** Full 40-char commit sha; fixture snapshots only ever carry `sha8`, so callers needing a tree ref fall back to that (see github-trees.ts). */
  sha?: string;
  sha8: string;
  msg: string;
  html_url: string;
  initials: string;
  /** ISO commit author date; fixture snapshots never carry it, so callers must treat its absence as unavailable, not epoch zero, to keep goldens stable. */
  date?: string;
}

function byBasename(glob: Record<string, unknown>): Record<string, Commit[]> {
  const out: Record<string, Commit[]> = {};
  for (const [path, mod] of Object.entries(glob)) {
    const base = path.slice(path.lastIndexOf("/") + 1).replace(/\.json$/, "");
    out[base] = mod as Commit[];
  }
  return out;
}

const REAL = byBasename(REAL_GLOB);
const FIXTURES = byBasename(FIXTURE_GLOB);

/** Descriptive label only, for diagnostics/tests. */
export const commitsDir = USE_FIXTURES ? "src/features/repositories/tests/ui/support/commits" : "src/generated/commits";

/** Reads the committed snapshot for a repo by name. */
export function getCommits(repoName: string): Commit[] {
  const table = USE_FIXTURES ? FIXTURES : REAL;
  return table[repoName] ?? [];
}

/** Build-time snapshot for every repo referenced by `projects`, keyed by repo name, called once in `.astro` frontmatter and threaded down as a plain prop so the Svelte island never imports this module itself. */
export function getCommitsByRepo(
  projects: { data: { repos: { name: string }[] } }[],
): Record<string, Commit[]> {
  const out: Record<string, Commit[]> = {};
  for (const p of projects) {
    for (const repo of p.data.repos) {
      if (!(repo.name in out)) out[repo.name] = getCommits(repo.name);
    }
  }
  return out;
}
