// Client-side commit-tree browsing (unauthenticated GitHub REST, sessionStorage-cached, null-on-failure) — mirrors github-commits.ts's shape for two different endpoints.
//
// TODO(scaling): `truncated: true` (a repo too large for one recursive listing) isn't handled — none of the 8 tracked repos are near GitHub's ~100k-entry cap; add pagination if that changes.

const TTL_MS = 10 * 60 * 1000;
const TREE_CACHE_PREFIX = "repositories:tree:";
const CONTENT_CACHE_PREFIX = "repositories:content:";
/** GitHub owner login; fixture repos don't actually exist there. */
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
    // (mirrors github-commits.ts's writeCache).
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

/** Maps a GitHub Git Trees API response to its flat list of blob paths, or null if the shape is unrecognizable. */
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

/** Lists a repo's file paths at a commit, trying `sha` then falling back to `sha8` (both resolve directly against the Trees API, so no second lookup is needed) — caches the result and returns null on any failure. */
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

export function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** True if `text` contains a NUL code point — the same binary guard `generate.mjs`'s `walk()` uses for working-tree indexes. */
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

/** Fetches one file's content at a commit, using the same sha/sha8 fallback and cache strategy as `fetchCommitTree`; resolves to `{kind:"binary"}` for oversize/non-text content or null on failure. */
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
