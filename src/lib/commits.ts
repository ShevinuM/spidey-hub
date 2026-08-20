// Fixture-commits mechanism — see the comment below for what a naive
// implementation would break.
//
// Builds renders one project per markdown file in the `repositories` collection,
// each with exactly one repo (see src/content/repositories/*.md /
// fixtures/repositories/*.md). Commit snapshots are keyed by *repo name*, not by
// project slug, so they live next to (not inside) the content collection:
//   - real content:    src/generated/commits/<repoName>.json   (scripts/generate.mjs)
//   - fixture content:  fixtures/commits/<repoName>.json        (extracted verbatim
//                        from Homepage.dc.html's sample `commits` arrays)
//
// Both directories are switched by the same PORTFOLIO_FIXTURES env var that
// switches the `repositories` collection's glob() base in src/content.config.ts,
// so a project entry's `repos[n].name` always resolves to a commits file in
// the matching mode.
//
// Server-only, same as src/lib/data.ts: this module must never be imported
// from a Svelte island (Builds.svelte etc.) — `process.env.PORTFOLIO_FIXTURES`
// doesn't exist in the browser. It also can't read the snapshot with a
// runtime `node:fs` path built from `dirname(import.meta.url)`: Astro's
// static build bundles this module into `dist/.prerender/chunks/`, which
// moves it well away from `src/generated/commits/` on disk, so such a read
// would 404 (ENOENT) as soon as real pages call this getter. Instead it uses
// a build-time `import.meta.glob` (eager, JSON parsed natively — no `?raw` +
// JSON.parse needed, unlike the YAML files in data.ts). Callers live in
// `.astro` frontmatter (see src/pages/builds.astro), which thread the result
// down through Terminal.svelte as a plain prop.
const REAL_GLOB = import.meta.glob("../generated/commits/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

const FIXTURE_GLOB = import.meta.glob("../../fixtures/commits/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

const USE_FIXTURES = process.env.PORTFOLIO_FIXTURES === "1";

export interface Commit {
  /** Full 40-char commit sha, needed by src/lib/githubTrees.ts to fetch a
   * commit's tree/file contents. Optional: fixture snapshots
   * (fixtures/commits/*.json, extracted verbatim from Homepage.dc.html and
   * never re-fetched) only ever carry `sha8`. Callers needing a tree ref
   * fall back to `sha8` when this is absent (see githubTrees.ts's
   * ref-candidate list). */
  sha?: string;
  sha8: string;
  msg: string;
  html_url: string;
  initials: string;
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

/** Descriptive label only (diagnostics/tests) — no longer a filesystem path. */
export const commitsDir = USE_FIXTURES ? "fixtures/commits" : "src/generated/commits";

/**
 * Read the committed snapshot for a repo by name. Returns an empty array
 * (not a throw) when no snapshot exists yet — e.g. a brand-new project
 * added before `pnpm generate` has run for it.
 */
export function getCommits(repoName: string): Commit[] {
  const table = USE_FIXTURES ? FIXTURES : REAL;
  return table[repoName] ?? [];
}

/**
 * Build-time snapshot for every repo referenced by `projects`, keyed by repo
 * name — called once in `.astro` frontmatter (see src/pages/*.astro) and
 * threaded through Terminal.svelte -> Builds.svelte as a plain prop, so the
 * Svelte island never imports this module itself (browser code can't read
 * `process.env` or use this module's `import.meta.glob` results). Builds.svelte
 * renders this synchronously on first paint, then overlays the client-side
 * live refresh (src/lib/githubCommits.ts) on top of it per project/repo.
 */
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
