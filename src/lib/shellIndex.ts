// Impure fetch+cache boundary for the shell's generated indexes (PLAN.md
// Iteration 3 Phase 4 item 4.2: "cat resolves content lazily ... (lazy
// fetch, cache)"). src/lib/shell.ts stays a pure, zero-fetch module (see
// its own header comment); every actual `fetch()` call lives here instead,
// exactly the same split GrepOverlay.svelte/Builds.svelte already use for
// their own lazy index loads (this file just factors that same pattern out
// so Shell.svelte doesn't duplicate it per pane instance, and so every
// mounted shell pane shares ONE warm cache rather than re-fetching on every
// window switch).
//
// Module-level promises (not component state): the first caller triggers
// the fetch, every later caller (a different pane, or the same pane after
// switching away and back) reuses the same settled promise — a genuine
// singleton cache for the lifetime of the page, matching GrepOverlay's own
// "fetched once, kept forever" contract.
import type { FsEntry } from "./shell.ts";

export interface RepoFile {
  path: string;
  lines: string[];
}

let fsIndexPromise: Promise<FsEntry[]> | null = null;

/** `public/generated/fs-index.json` — `{ entries: FsEntry[] }` (structure +
 * byte sizes for site files, path-only for `repos/*`, generate.mjs's own
 * `generateFsIndex()`). */
export function loadFsIndex(): Promise<FsEntry[]> {
  if (!fsIndexPromise) {
    fsIndexPromise = fetch("/generated/fs-index.json").then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { entries: FsEntry[] };
      return data.entries;
    });
  }
  return fsIndexPromise;
}

let grepFilesPromise: Promise<RepoFile[]> | null = null;

/** `public/generated/grep-index.json` — the exact same flat `{path,
 * lines}[]` GrepOverlay.svelte already fetches from this URL; `cat`-ing a
 * site file reads from this same cache rather than a second copy. */
export function loadGrepFiles(): Promise<RepoFile[]> {
  if (!grepFilesPromise) {
    grepFilesPromise = fetch("/generated/grep-index.json").then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json() as Promise<RepoFile[]>;
    });
  }
  return grepFilesPromise;
}

const repoFilesCache = new Map<string, Promise<RepoFile[]>>();

/** `public/generated/repos/<name>.json` — the exact same `{name, files}`
 * shape Builds.svelte already fetches from this URL; `cat repos/<name>/…`
 * reads from this same cache. */
export function loadRepoFiles(name: string): Promise<RepoFile[]> {
  let cached = repoFilesCache.get(name);
  if (!cached) {
    cached = fetch(`/generated/repos/${name}.json`).then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { name: string; files: RepoFile[] };
      return data.files;
    });
    repoFilesCache.set(name, cached);
  }
  return cached;
}
