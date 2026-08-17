// Client-side commit refresh (PLAN.md Phase 5 item 4 / "Client commit
// refresh"). Runs in the browser (unlike scripts/generate.mjs's server-side
// fetch, which this deliberately mirrors the shape of but does not share
// code with: generate.mjs sends a GITHUB_TOKEN header and writes to disk;
// this is unauthenticated, CORS-open, per PLAN.md "GitHub REST", and only
// ever updates in-memory + sessionStorage state).
//
// Builds.svelte calls `getLiveCommits(repoName)` once per repo per Builds
// mount; sessionStorage caches a successful response for TTL_MS so
// switching projects back and forth (or remounting Builds) within the same
// browser tab session doesn't re-fetch needlessly. A failed fetch (offline,
// rate-limited, aborted by a test's route handler) resolves to `null` —
// callers keep whatever snapshot/committed data they already had, silently.
import type { Commit } from "./commits";

const TTL_MS = 10 * 60 * 1000;
const CACHE_PREFIX = "builds:commits:";

interface CacheEntry {
  ts: number;
  commits: Commit[];
}

/** "ShevinuM" (fixture repos don't exist on GitHub — see NOTE in fetchLiveCommits). */
const GITHUB_OWNER = "ShevinuM";

function initialsFrom(name: string): string {
  const s = (name || "Sh").trim();
  if (s.length === 0) return "Sh";
  if (s.length === 1) return s.toUpperCase();
  return s[0].toUpperCase() + s[1].toLowerCase();
}

/** Exported for unit testing — mirrors scripts/generate.mjs's mapper exactly
 * (PLAN.md Phase 4 item 1: both now carry the full `sha`, not just `sha8`). */
export function mapGithubCommits(data: unknown): Commit[] {
  if (!Array.isArray(data)) return [];
  return data.map((c) => {
    const sha = typeof c?.sha === "string" ? c.sha : "";
    const message = typeof c?.commit?.message === "string" ? c.commit.message : "";
    const authorName = c?.author?.login || c?.commit?.author?.name || "Sh";
    return {
      sha: sha || undefined,
      sha8: sha.slice(0, 8),
      msg: message.split("\n")[0],
      html_url: typeof c?.html_url === "string" ? c.html_url : "",
      initials: initialsFrom(authorName),
    };
  });
}

function readCache(repoName: string): Commit[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + repoName);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.ts > TTL_MS) return null;
    // PLAN.md Phase 4 item 1: a cache entry written before this change never
    // carries `sha` (only `sha8`) — stale shape. Treat it as a miss so the
    // page re-fetches instead of silently handing githubTrees.ts commits it
    // can't resolve a tree ref for.
    if (!entry.commits.every((c) => typeof c.sha === "string" && c.sha.length > 0)) return null;
    return entry.commits;
  } catch {
    return null;
  }
}

function writeCache(repoName: string, commits: Commit[]): void {
  try {
    const entry: CacheEntry = { ts: Date.now(), commits };
    sessionStorage.setItem(CACHE_PREFIX + repoName, JSON.stringify(entry));
  } catch {
    // sessionStorage unavailable/full — refresh simply won't be cached this
    // session; not fatal (PLAN.md: "silent keep-snapshot on failure").
  }
}

/**
 * Fetch live commits for `repoName` (per_page=15, GitHub REST — PLAN.md
 * "GitHub REST"). Returns `null` on any failure (network error, abort,
 * non-2xx, unexpected shape) — never throws — so callers can silently keep
 * their existing snapshot/committed data.
 */
export async function fetchLiveCommits(repoName: string): Promise<Commit[] | null> {
  try {
    const cached = readCache(repoName);
    if (cached) return cached;

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${repoName}/commits?per_page=15`;
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;

    const data = await res.json();
    const commits = mapGithubCommits(data);
    if (commits.length === 0) return null;

    writeCache(repoName, commits);
    return commits;
  } catch {
    return null;
  }
}
