// Client-side commit refresh, mirroring generate.mjs's shape without sharing code (unauthenticated, CORS-open, cached in sessionStorage for TTL_MS instead of written to disk).
import type { Commit } from "../../../common/lib/commits";

const TTL_MS = 10 * 60 * 1000;
const CACHE_PREFIX = "repositories:commits:";

interface CacheEntry {
  ts: number;
  commits: Commit[];
}

/** GitHub owner login; fixture repos don't actually exist there. */
const GITHUB_OWNER = "ShevinuM";

function initialsFrom(name: string): string {
  const s = (name || "Sh").trim();
  if (s.length === 0) return "Sh";
  if (s.length === 1) return s.toUpperCase();
  return s[0].toUpperCase() + s[1].toLowerCase();
}

/** Exported for unit testing — mirrors scripts/generate.mjs's mapper exactly:
 * both carry the full `sha` alongside `sha8`. */
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
    // A cached entry predating the `sha` field only carries `sha8`; treat it as a miss so the page re-fetches instead of handing github-trees.ts an unresolvable commit.
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
    // sessionStorage unavailable/full — not fatal, since a failed fetch already means callers keep their existing snapshot.
  }
}

/** Fetches live commits for `repoName` (GitHub REST, per_page=15); returns `null` on any failure so callers can keep their existing snapshot. */
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
