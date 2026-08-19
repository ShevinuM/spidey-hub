// Client-side commit-tree browsing. Mirrors src/lib/githubCommits.ts's shape
// (unauthenticated GitHub REST, sessionStorage cache with a 10min TTL,
// null-on-any-failure — never throws) but for two different endpoints:
// listing a commit's files (Git Trees API) and reading one file's content at
// that commit (Contents API).
//
// UNVERIFIED-API-FACT check, done before writing this file: live curl on
// 2026-08-17
// against a real commit —
//   curl "https://api.github.com/repos/ShevinuM/transcript-tts/git/trees/<40-char sha>?recursive=1"
// — returned the tree directly (200, `{sha, tree: [...], truncated: false}`),
// confirming GitHub's Git Trees API resolves a full COMMIT sha to that
// commit's tree by itself; no separate `GET /commits/{sha}` call for
// `commit.tree.sha` is needed. A second curl against the same endpoint with
// the 8-char `sha8` also returned 200 — git's abbreviated-sha resolution
// works here too — which is what makes the "stale snapshot lacks full sha"
// fallback below viable without any extra request. `recursive=1` returns
// BOTH "blob" (file) and "tree" (dir) entries with full paths (verified
// against a repo with subdirectories, daily-tech-digest); this module keeps
// only the blobs — directories are re-synthesized from file-path prefixes by
// ../lib/repoTree.ts's listDir(), exactly like the existing working-tree
// indexes, so one rendering path in Builds.svelte serves both tree sources.
// `truncated: true` (a repo too large for one recursive listing) is not
// handled — none of the three tracked repos are anywhere near GitHub's
// ~100k-entry cap, so pagination machinery for a case that can't occur with
// this content is intentionally not added.

const TTL_MS = 10 * 60 * 1000;
const TREE_CACHE_PREFIX = "builds:tree:";
const CONTENT_CACHE_PREFIX = "builds:content:";
/** "ShevinuM" — see the matching NOTE in githubCommits.ts (fixture repos
 * referenced by fixtures/commits/*.json don't exist on GitHub at all; a tree
 * fetch for them fails closed, same as any other API failure). */
const GITHUB_OWNER = "ShevinuM";
/** Matches scripts/generate.mjs's own SIZE_CAP — files bigger than this are
 * treated as "too large to preview" rather than fetched in full. */
const SIZE_CAP = 200 * 1024;

interface CacheEntry<T> {
  ts: number;
  value: T;
}

export type ContentResult = { kind: "text"; lines: string[] } | { kind: "binary" };

function readCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.ts > TTL_MS) return null;
    return entry.value;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  try {
    const entry: CacheEntry<T> = { ts: Date.now(), value };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // sessionStorage unavailable/full — not fatal, just uncached this session
    // (mirrors githubCommits.ts's writeCache).
  }
}

/** Exported for unit testing (cache TTL) without going through a network
 * call — reads/writes the exact keys the fetch functions below use. */
export function treeCacheKey(repo: string, ref: string): string {
  return `${TREE_CACHE_PREFIX}${repo}@${ref}`;
}
export function contentCacheKey(repo: string, ref: string, path: string): string {
  return `${CONTENT_CACHE_PREFIX}${repo}@${ref}:${path}`;
}
export function getCachedTree(repo: string, ref: string): string[] | null {
  return readCache<string[]>(treeCacheKey(repo, ref));
}
export function setCachedTree(repo: string, ref: string, paths: string[]): void {
  writeCache(treeCacheKey(repo, ref), paths);
}
export function getCachedContent(repo: string, ref: string, path: string): ContentResult | null {
  return readCache<ContentResult>(contentCacheKey(repo, ref, path));
}
export function setCachedContent(repo: string, ref: string, path: string, result: ContentResult): void {
  writeCache(contentCacheKey(repo, ref, path), result);
}

interface RawTreeEntry {
  type?: string;
  path?: string;
}

/** Pure mapper: a GitHub Git Trees API response -> the flat list of blob
 * (file) paths it contains, or null if the shape is unrecognizable. Exported
 * for unit testing without a network call. */
export function mapTreeResponse(data: unknown): string[] | null {
  if (!data || typeof data !== "object" || !Array.isArray((data as { tree?: unknown }).tree)) return null;
  const tree = (data as { tree: RawTreeEntry[] }).tree;
  return tree.filter((e) => e && e.type === "blob" && typeof e.path === "string").map((e) => e.path as string);
}

async function fetchTreeForRef(repo: string, ref: string): Promise<string[] | null> {
  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    return mapTreeResponse(await res.json());
  } catch {
    return null;
  }
}

/**
 * List a repo's files (paths only, no content) at a commit. Tries `sha`
 * first when present, then falls back to `sha8` if a stale snapshot lacks
 * the full sha — both work directly against the Trees API per the curl
 * finding above, so the fallback never needs a second kind of request.
 * Caches the successful ref's result in sessionStorage (10min TTL). Returns null on
 * total failure (network error, abort, non-2xx, unrecognizable shape, or
 * every candidate ref rejected) — never throws.
 */
export async function fetchCommitTree(repo: string, sha: string | undefined, sha8: string): Promise<string[] | null> {
  const candidates = [...new Set([sha, sha8].filter((s): s is string => !!s))];
  for (const ref of candidates) {
    const cached = getCachedTree(repo, ref);
    if (cached) return cached;
    const paths = await fetchTreeForRef(repo, ref);
    if (paths) {
      setCachedTree(repo, ref, paths);
      return paths;
    }
  }
  return null;
}

/**
 * Decodes a GitHub Contents API base64 payload to a UTF-8 string. Deliberate
 * two-step decode (base64 -> raw bytes -> TextDecoder), NOT reading
 * `atob()`'s own output directly as text: `atob()` maps each base64 sextet
 * to one UTF-16 code unit in the 0-255 range (it's decoding bytes, not
 * characters), so any multibyte UTF-8 character (accents, CJK, emoji) comes
 * out as several mangled Latin-1 code points if read straight — routing
 * those same bytes through `TextDecoder("utf-8")` instead decodes them
 * correctly. Exported for unit testing.
 */
export function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** True if `text` contains a NUL code point — the same binary guard
 * scripts/generate.mjs's walk() uses for the working-tree indexes, applied
 * here to decoded commit-tree content. Written as a charCode scan (avoiding any embedded NUL literal in this source file itself). */
function hasNulByte(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0) return true;
  }
  return false;
}

interface RawContentResponse {
  size?: number;
  encoding?: string;
  content?: string;
}

async function fetchContentForRef(repo: string, path: string, ref: string): Promise<ContentResult | null> {
  try {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as RawContentResponse | RawContentResponse[];
    if (Array.isArray(data)) return null; // path resolved to a directory, not a file
    if (typeof data.size === "number" && data.size > SIZE_CAP) return { kind: "binary" };
    if (data.encoding !== "base64" || typeof data.content !== "string") return { kind: "binary" };
    const text = decodeBase64Utf8(data.content);
    if (hasNulByte(text)) return { kind: "binary" }; // binary slipped past the size guard
    return { kind: "text", lines: text.split("\n") };
  } catch {
    return null;
  }
}

/**
 * Fetch one file's content at a commit (same sha/sha8 fallback + cache
 * strategy as fetchCommitTree). Resolves to `{kind:"binary"}` for
 * oversize/non-text content (never thrown), or null on total failure.
 */
export async function fetchCommitFileContent(
  repo: string,
  path: string,
  sha: string | undefined,
  sha8: string,
): Promise<ContentResult | null> {
  const candidates = [...new Set([sha, sha8].filter((s): s is string => !!s))];
  for (const ref of candidates) {
    const cached = getCachedContent(repo, ref, path);
    if (cached) return cached;
    const result = await fetchContentForRef(repo, path, ref);
    if (result) {
      setCachedContent(repo, ref, path, result);
      return result;
    }
  }
  return null;
}
