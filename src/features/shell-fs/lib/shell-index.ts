// Impure fetch+cache boundary for the shell's generated indexes, so
// `src/common/lib/shell.ts` stays a pure, zero-fetch module and every mounted
// shell pane shares ONE warm cache instead of re-fetching per instance.
// Module-level promises, not component state: the first caller triggers
// the fetch, every later caller reuses the same settled promise for the
// lifetime of the page.
import type { FsEntry } from "../../../common/lib/shell";
import type { RepoFile, RepoIndex } from "../../../common/lib/repo-tree";

export type { RepoFile };

/** Site source is never tokenized (see repo-tree.ts's own header comment on
 * why generate.mjs leaves grep-index.json flat) — a plain flat shape,
 * distinct from a repo index's `RepoFile` which MAY carry tokens. */
export interface SiteFile {
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

let grepFilesPromise: Promise<SiteFile[]> | null = null;

/** `public/generated/grep-index.json` — the exact same flat `{path,
 * lines}[]` GrepOverlay.svelte already fetches from this URL; `cat`-ing a
 * site file reads from this same cache rather than a second copy. */
export function loadGrepFiles(): Promise<SiteFile[]> {
  if (!grepFilesPromise) {
    grepFilesPromise = fetch("/generated/grep-index.json").then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json() as Promise<SiteFile[]>;
    });
  }
  return grepFilesPromise;
}

const repoIndexCache = new Map<string, Promise<RepoIndex>>();

/** `public/generated/repos/<name>.json` — the same JSON Repositories.svelte
 * already fetches from this URL, palette and all — `vim repos/<name>/…`
 * reads from this same cache, so a code file `cat`/`vim` opens the exact
 * tokens Repositories' own editor would show for it. */
export function loadRepoIndex(name: string): Promise<RepoIndex> {
  let cached = repoIndexCache.get(name);
  if (!cached) {
    cached = fetch(`/generated/repos/${name}.json`).then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as RepoIndex;
    });
    repoIndexCache.set(name, cached);
  }
  return cached;
}

/** `cat`'s own need: just the flat file list (plain-text reconstruction is
 * the caller's job via repo-tree.ts's `repoFileText`). */
export async function loadRepoFiles(name: string): Promise<RepoFile[]> {
  return (await loadRepoIndex(name)).files;
}
