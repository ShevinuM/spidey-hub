// Pure helpers for browsing a submodule's file index (PLAN.md Phase 5,
// "Repo browsing"). The index itself (public/generated/repos/<name>.json,
// produced by scripts/generate.mjs) is a FLAT list of {path, lines} — one
// entry per text file, posix-separated relative path, no directory nodes.
// Builds.svelte fetches that JSON lazily (client-side, real `fetch`, not a
// build-time import — the file lives under `public/`) and calls the
// functions below to derive one directory "level" at a time, mirroring how
// the Files/Personnel panels already present one flat list per screen.
export interface RepoFile {
  path: string;
  lines: string[];
}

export interface RepoIndex {
  name: string;
  files: RepoFile[];
}

export type TreeEntryType = "dir" | "file";

export interface TreeEntry {
  type: TreeEntryType;
  /** Segment name only (no slashes), e.g. "lib" or "grep.ts". */
  name: string;
  /** Full posix path from the repo root, e.g. "src/lib" or "src/lib/grep.ts". */
  path: string;
}

/**
 * List the immediate children of `dirPath` (posix, no leading/trailing
 * slash; "" = repo root) given the repo's flat file list. Directories are
 * synthesized from path prefixes shared by two or more (or exactly one)
 * files — there is no explicit directory record to read.
 *
 * Sort: directories before files, then case-insensitive name — a
 * conventional file-browser order (not derived from any prototype markup,
 * since repo browsing has no prototype precedent; see PLAN.md "Builds
 * interactivity extension").
 */
export function listDir(files: RepoFile[], dirPath: string): TreeEntry[] {
  const prefix = dirPath === "" ? "" : `${dirPath}/`;
  const seen = new Map<string, TreeEntry>();

  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue;
    const rest = f.path.slice(prefix.length);
    if (rest === "") continue;
    const slash = rest.indexOf("/");
    if (slash === -1) {
      seen.set(rest, { type: "file", name: rest, path: prefix + rest });
    } else {
      const dirName = rest.slice(0, slash);
      if (!seen.has(dirName)) {
        seen.set(dirName, { type: "dir", name: dirName, path: prefix + dirName });
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Look up a single file's lines by its full repo-relative path. */
export function findFile(files: RepoFile[], path: string): RepoFile | undefined {
  return files.find((f) => f.path === path);
}

/** Join path segments into a posix repo-relative path ("" for the root). */
export function joinPath(segments: string[]): string {
  return segments.join("/");
}
